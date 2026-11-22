import { actionButton, linkButton, roleMention, row } from "../../common/src/discord.js";
import { parseGithubUrl } from "../../common/src/github.js";

const CARD_COLOR = 0x2f81f7;
const WARN_COLOR = 0xd29922;

// one card per task; the id is stable across re-publishing and Resend
export function cardIdFor(taskUrl) {
  const ref = parseGithubUrl(taskUrl);
  return ref ? `${ref.owner}__${ref.repo}__${ref.kind}-${ref.number}`.toLowerCase() : null;
}

// roles from PR labels, then task labels, then the default roles from settings
export function rolesForPr(prLabels, taskLabels, settings) {
  const map = Object.fromEntries(Object.entries(settings.pr.labelRoles ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const pick = (labels) => [...new Set((labels ?? []).map((l) => map[String(l).toLowerCase()]).filter(Boolean))];
  const fromPr = pick(prLabels);
  if (fromPr.length) return fromPr;
  const fromTask = pick(taskLabels);
  if (fromTask.length) return fromTask;
  return [...(settings.pr.defaultRoleIds ?? [])];
}

export const resendId = (cardId) => `pr:resend:${cardId}`;

export function cardButtons(task, pr, cardId, resendEnabled) {
  return [row(
    task.url ? linkButton("Open task", task.url) : null,
    actionButton("Resend", resendId(cardId), { disabled: !resendEnabled }),
    linkButton("Open PR", pr.url),
  )];
}

export function buildPrCard({ pr, task, roleIds, cardId, resendEnabled = false }) {
  const mentions = roleIds.map(roleMention).join(" ");
  const fields = [{ name: "Task", value: task.url ? `[${task.title}](${task.url})`.slice(0, 1024) : task.title.slice(0, 1024) }];
  return {
    content: `${mentions ? mentions + " " : ""}**${pr.author.login}** opened a PR for review: ${pr.title}`.slice(0, 2000),
    embeds: [{
      author: { name: pr.author.login, ...(pr.author.avatarUrl ? { icon_url: pr.author.avatarUrl } : {}), ...(pr.author.url ? { url: pr.author.url } : {}) },
      title: `#${pr.number} ${pr.title}`.slice(0, 256),
      url: pr.url,
      description: "```diff\n+ " + pr.additions + " additions\n- " + pr.deletions + " deletions\n```",
      fields,
      footer: { text: `${pr.owner}/${pr.repo}` },
      color: CARD_COLOR,
    }],
    components: cardButtons(task, pr, cardId, resendEnabled),
    allowed_mentions: { parse: [], roles: roleIds },
  };
}

export function buildUnlinkedMessage(task) {
  const text = task.url
    ? `⚠️ Task "${task.title}" is in Ready for Review, but no PR is linked to it.`
    : `⚠️ Task "${task.title}" is in Ready for Review, but it has no link to a GitHub issue.`;
  return {
    content: text.slice(0, 2000),
    embeds: [{ description: "Add `Closes #<issue>` to the PR description, then move the task to In Progress and back to Ready for Review.", color: WARN_COLOR }],
    components: task.url ? [row(linkButton("Open task", task.url))] : [],
    allowed_mentions: { parse: [] },
  };
}
