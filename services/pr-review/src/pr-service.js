import { createDiscord, ephemeral, EPHEMERAL, ResponseType } from "../../common/src/discord.js";
import { createFirestore } from "../../common/src/firestore.js";
import { createGithub } from "../../common/src/github.js";
import { loadSettings } from "../../common/src/settings.js";
import { logEvent } from "../../common/src/events.js";
import { parseTaskEvent, STATUS } from "./task-event.js";
import { buildPrCard, buildUnlinkedMessage, cardButtons, cardIdFor, rolesForPr } from "./pr-card.js";
import { evaluateCard } from "./pr-state.js";

const services = (ctx) => ({ fs: createFirestore(ctx), discord: createDiscord(ctx), gh: createGithub(ctx) });

async function safeDelete(discord, channelId, messageId) {
  try {
    await discord.deleteMessage(channelId, messageId);
    return true;
  } catch (e) {
    return e.statusCode === 404;
  }
}

export async function handleTaskEvent(ctx, body) {
  const ev = parseTaskEvent(body, ctx.env);
  if (ev.error || ev.ignore) return { result: ev.error ?? ev.ignore };
  const { fs, discord, gh } = services(ctx);
  const cardId = cardIdFor(ev.task.url);

  if (ev.action === "status") {
    if (!cardId) return { result: "status change of a task without a GitHub link" };
    const card = await fs.get(`pr_cards/${cardId}`);
    if (!card?.active) return { result: "no active card" };
    const patch = { taskStatus: ev.status, updatedAt: ctx.now };
    if (ev.status !== STATUS.READY) {
      patch.active = false;
      patch.resendEnabled = false;
      if (card.resendEnabled)
        await discord.editMessage(card.channelId, card.messageId, { components: cardButtons(card.task, card.pr, cardId, false) }).catch(() => {});
    }
    await fs.update(`pr_cards/${cardId}`, patch);
    return { result: `card ${cardId}: task status ${ev.status}` };
  }

  const settings = await loadSettings(fs, ctx.env);
  const channelId = settings.channels.prReview;
  if (!channelId) throw new Error("PR review channel is not configured (settings.channels.prReview)");

  const found = cardId ? await gh.findPrForTask(ev.task.url) : { pr: null, issue: null };
  if (!found.pr) {
    await discord.postMessage(channelId, buildUnlinkedMessage(ev.task));
    await logEvent(fs, "pr-review", "pr_unlinked", { taskUrl: ev.task.url, taskTitle: ev.task.title }, ctx.now);
    return { result: "task has no linked PR" };
  }

  const pr = found.pr;
  const task = { ...ev.task, title: ev.task.title || found.issue?.title };
  const roleIds = rolesForPr(pr.labels, found.issue?.labels, settings);

  const previous = await fs.get(`pr_cards/${cardId}`);
  if (previous?.active && previous.messageId) await safeDelete(discord, previous.channelId, previous.messageId);

  const message = await discord.postMessage(channelId, buildPrCard({ pr, task, roleIds, cardId }));
  await fs.set(`pr_cards/${cardId}`, {
    task,
    taskStatus: ev.status,
    pr: { owner: pr.owner, repo: pr.repo, number: pr.number, url: pr.url, title: pr.title, author: pr.author.login },
    roleIds,
    channelId,
    messageId: message.id,
    publishedAt: ctx.now,
    state: "WAITING",
    reaction: null,
    resendEnabled: false,
    resendCount: previous?.resendCount ?? 0,
    active: true,
    updatedAt: ctx.now,
  });
  await logEvent(fs, "pr-review", "pr_published", { cardId, pr: pr.url, author: pr.author.login, roleIds }, ctx.now);
  return { result: `published ${cardId}` };
}

export async function checkCards(ctx) {
  const { fs, discord, gh } = services(ctx);
  const settings = await loadSettings(fs, ctx.env);
  const cards = await fs.query("pr_cards", [["active", "==", true]]);
  const report = [];
  for (const card of cards) {
    try {
      const pr = await gh.getPr(card.pr.owner, card.pr.repo, card.pr.number);
      const next = evaluateCard(card, pr, ctx.now, settings);
      if (next.reaction !== card.reaction) {
        if (card.reaction) await discord.removeOwnReaction(card.channelId, card.messageId, card.reaction).catch(() => {});
        if (next.reaction) await discord.addReaction(card.channelId, card.messageId, next.reaction);
      }
      if (next.resendEnabled !== !!card.resendEnabled)
        await discord.editMessage(card.channelId, card.messageId, { components: cardButtons(card.task, card.pr, card.id, next.resendEnabled) });
      await fs.update(`pr_cards/${card.id}`, {
        state: next.state, reaction: next.reaction, resendEnabled: next.resendEnabled, active: next.active, checkedAt: ctx.now,
      });
      if (next.state !== card.state) await logEvent(fs, "pr-review", "pr_state_changed", { cardId: card.id, from: card.state, to: next.state }, ctx.now);
      report.push(`${card.id}: ${next.state}${next.resendEnabled ? ", resend" : ""}${next.active ? "" : ", done"}`);
    } catch (e) {
      report.push(`${card.id}: error ${e.message}`);
    }
  }
  return { checked: cards.length, report };
}

// Phase 1: answer Discord within 3 s with a deferred ephemeral reply.
export function prInteractionResponse(body) {
  const [, action] = String(body.data?.custom_id ?? "").split(":");
  if (action !== "resend") return { response: ephemeral("Unknown action."), work: false };
  return { response: { type: ResponseType.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } }, work: true };
}

// Phase 2: re-check and re-publish, then edit the deferred reply.
export async function resendCard(ctx, body) {
  const { fs, discord, gh } = services(ctx);
  const cardId = String(body.data.custom_id).split(":").slice(2).join(":");
  const reply = (content) => discord.editOriginalResponse(body.token, { content });

  const card = await fs.get(`pr_cards/${cardId}`);
  if (!card?.active) return reply("This card is no longer active.");
  const settings = await loadSettings(fs, ctx.env);
  const pr = await gh.getPr(card.pr.owner, card.pr.repo, card.pr.number);
  const state = evaluateCard(card, pr, ctx.now, settings);
  if (!state.resendEnabled) return reply(`Resend is not available: ${state.reason}.`);

  const roleIds = rolesForPr(pr.labels, [], settings);
  const message = await discord.postMessage(card.channelId, buildPrCard({ pr, task: card.task, roleIds: roleIds.length ? roleIds : card.roleIds, cardId }));
  const deleted = await safeDelete(discord, card.channelId, card.messageId);
  if (!deleted)
    await discord.editMessage(card.channelId, card.messageId, { components: cardButtons(card.task, card.pr, cardId, false) }).catch(() => {});
  await fs.update(`pr_cards/${cardId}`, {
    messageId: message.id, publishedAt: ctx.now, resendEnabled: false, reaction: null, state: "WAITING",
    resendCount: (card.resendCount ?? 0) + 1, updatedAt: ctx.now,
  });
  await logEvent(fs, "pr-review", "pr_resent", { cardId, by: body.member?.user?.id ?? body.user?.id ?? null }, ctx.now);
  return reply("Resent ✅");
}
