import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStatus, parseTaskEvent } from "../src/task-event.js";
import { buildPrCard, buildUnlinkedMessage, cardIdFor, rolesForPr } from "../src/pr-card.js";
import { evaluateCard } from "../src/pr-state.js";
import { checkCards, handleTaskEvent, prInteractionResponse, resendCard } from "../src/pr-service.js";
import { defaultSettings } from "../../common/src/settings.js";
import { normalizePr } from "../../common/src/github.js";
import { createMockApi, ghIssue, ghPr, httpFor, mockEnv } from "../../../test/support/mock-api.mjs";

const TASK_URL = "https://github.com/mentorflow-lpnu/MentorFlow/issues/17";
const CARD_ID = "mentorflow-lpnu__mentorflow__issue-17";
const CHANNEL = "555";
const ROLE_DEV = "900", ROLE_OPS = "901", ROLE_DEFAULT = "902";

function setup() {
  const mock = createMockApi();
  mock.state.issues.set("mentorflow-lpnu/MentorFlow#17", ghIssue());
  mock.state.prs.set("mentorflow-lpnu/MentorFlow#42", ghPr());
  const env = { ...mockEnv("http://mock") };
  const ctx = (now = "2026-11-22T10:00:00Z") => ({ http: httpFor(mock), env, now: new Date(now) });
  mock.state.docs.set("settings/main", {
    channels: { mapValue: { fields: { prReview: { stringValue: CHANNEL } } } },
    pr: { mapValue: { fields: {
      labelRoles: { mapValue: { fields: { dev: { stringValue: ROLE_DEV }, devops: { stringValue: ROLE_OPS } } } },
      defaultRoleIds: { arrayValue: { values: [{ stringValue: ROLE_DEFAULT }] } },
    } } },
  });
  return { mock, ctx };
}

const event = (over = {}) => ({
  secret: "tasks-secret", sheet: "Sprint 3", row: 12, title: "Login page", taskUrl: TASK_URL,
  status: "Ready for Review", previousStatus: "In Progress", ...over,
});

test("task events: only In Progress → Ready for Review publishes", () => {
  const env = { MF_TASKS_SECRET: "tasks-secret" };
  assert.equal(normalizeStatus(" ready  for review "), "Ready for Review");
  assert.equal(parseTaskEvent(event(), env).action, "publish");
  assert.equal(parseTaskEvent(event({ previousStatus: "Not started" }), env).action, "status");
  assert.equal(parseTaskEvent(event({ status: "Done", previousStatus: "Ready for Review" }), env).action, "status");
  assert.equal(parseTaskEvent(event({ secret: "x" }), env).error, "bad secret");
  assert.ok(parseTaskEvent(event({ status: "Blocked" }), env).ignore);
});

test("roles: PR labels, then task labels, then default", () => {
  const s = { pr: { labelRoles: { Dev: "1", devops: "2" }, defaultRoleIds: ["3"] } };
  assert.deepEqual(rolesForPr(["dev", "DevOps", "docs"], [], s), ["1", "2"]);
  assert.deepEqual(rolesForPr(["docs"], ["devops"], s), ["2"]);
  assert.deepEqual(rolesForPr([], [], s), ["3"]);
});

test("PR card: mentions in text, diff block, three buttons in order", () => {
  const pr = normalizePr(ghPr());
  const card = buildPrCard({ pr, task: { title: "Login page", url: TASK_URL }, roleIds: [ROLE_DEV], cardId: CARD_ID });
  assert.equal(card.content, `<@&${ROLE_DEV}> **octocat** opened a PR for review: Login form with validation`);
  assert.equal(card.embeds[0].description, "```diff\n+ 120 additions\n- 8 deletions\n```");
  assert.equal(card.embeds[0].author.icon_url, "https://avatars.example/octocat.png");
  assert.deepEqual(card.components[0].components.map((c) => c.label), ["Open task", "Resend", "Open PR"]);
  assert.equal(card.components[0].components[1].disabled, true);
  assert.deepEqual(card.allowed_mentions, { parse: [], roles: [ROLE_DEV] });
  assert.match(buildUnlinkedMessage({ title: "Login page", url: TASK_URL }).content, /no PR is linked/);
  assert.equal(cardIdFor(TASK_URL), CARD_ID);
});

test("card state table", () => {
  const settings = defaultSettings();
  const card = { publishedAt: "2026-11-22T00:00:00Z", taskStatus: "Ready for Review", reaction: null };
  const pr = (over) => normalizePr(ghPr(over));
  const at = (h) => new Date(Date.parse(card.publishedAt) + h * 36e5);
  assert.deepEqual(
    [evaluateCard(card, pr({}), at(11), settings).resendEnabled, evaluateCard(card, pr({}), at(12), settings).resendEnabled],
    [false, true], "Resend after 12 hours");
  const approved = evaluateCard(card, pr({ reviewDecision: "APPROVED" }), at(20), settings);
  assert.deepEqual([approved.reaction, approved.resendEnabled, approved.active], ["✅", false, true]);
  const changes = evaluateCard(card, pr({ reviewDecision: "CHANGES_REQUESTED" }), at(20), settings);
  assert.deepEqual([changes.reaction, changes.resendEnabled], ["🔁", false]);
  const merged = evaluateCard(card, pr({ merged: true, state: "MERGED" }), at(1), settings);
  assert.deepEqual([merged.reaction, merged.active], ["🟣", false]);
  assert.equal(evaluateCard(card, pr({ state: "CLOSED" }), at(1), settings).active, false);
  assert.equal(evaluateCard({ ...card, taskStatus: "Done" }, pr({}), at(20), settings).resendEnabled, false);
});

test("publish: card in the review channel and a pr_cards document", async () => {
  const { mock, ctx } = setup();
  assert.match((await handleTaskEvent(ctx(), event())).result, /published/);
  const [msg] = mock.channelMessages(CHANNEL);
  assert.match(msg.content, new RegExp(`<@&${ROLE_DEV}>`));
  const card = mock.doc(`pr_cards/${CARD_ID}`);
  assert.equal(card.messageId, msg.id);
  assert.equal(card.active, true);
  assert.equal(card.pr.number, 42);
  assert.equal(mock.docs("events")[0].type, "pr_published");
});

test("publish: task without a linked PR → warning", async () => {
  const { mock, ctx } = setup();
  mock.state.issues.set("mentorflow-lpnu/MentorFlow#17", ghIssue([]));
  await handleTaskEvent(ctx(), event());
  assert.match(mock.channelMessages(CHANNEL)[0].content, /no PR is linked/);
  assert.equal(mock.doc(`pr_cards/${CARD_ID}`), null);
});

test("publish again: the old card is deleted", async () => {
  const { mock, ctx } = setup();
  await handleTaskEvent(ctx(), event());
  const first = mock.doc(`pr_cards/${CARD_ID}`).messageId;
  await handleTaskEvent(ctx("2026-11-23T10:00:00Z"), event());
  assert.equal(mock.channelMessages(CHANNEL).length, 1);
  assert.notEqual(mock.doc(`pr_cards/${CARD_ID}`).messageId, first);
});

test("task leaves Ready for Review → card is deactivated", async () => {
  const { mock, ctx } = setup();
  await handleTaskEvent(ctx(), event());
  await handleTaskEvent(ctx(), event({ status: "In Progress", previousStatus: "Ready for Review" }));
  const card = mock.doc(`pr_cards/${CARD_ID}`);
  assert.deepEqual([card.active, card.taskStatus], [false, "In Progress"]);
});

test("state check: reactions follow the PR, Resend opens after 12 hours", async () => {
  const { mock, ctx } = setup();
  await handleTaskEvent(ctx("2026-11-22T00:00:00Z"), event());
  const msgId = mock.doc(`pr_cards/${CARD_ID}`).messageId;

  await checkCards(ctx("2026-11-22T13:00:00Z"));
  assert.equal(mock.state.messages.get(msgId).components[0].components[1].disabled, false, "Resend enabled");

  mock.state.prs.set("mentorflow-lpnu/MentorFlow#42", ghPr({ reviewDecision: "CHANGES_REQUESTED" }));
  await checkCards(ctx("2026-11-22T14:00:00Z"));
  assert.deepEqual(mock.state.messages.get(msgId).reactions, ["🔁"]);
  assert.equal(mock.state.messages.get(msgId).components[0].components[1].disabled, true);

  mock.state.prs.set("mentorflow-lpnu/MentorFlow#42", ghPr({ reviewDecision: "APPROVED", merged: true, state: "MERGED" }));
  await checkCards(ctx("2026-11-22T15:00:00Z"));
  assert.deepEqual(mock.state.messages.get(msgId).reactions, ["🟣"]);
  assert.equal(mock.doc(`pr_cards/${CARD_ID}`).active, false);
  assert.equal((await checkCards(ctx("2026-11-22T16:00:00Z"))).checked, 0, "finished cards are not checked");
});

test("Resend: deferred answer, new card, old card deleted", async () => {
  const { mock, ctx } = setup();
  await handleTaskEvent(ctx("2026-11-22T00:00:00Z"), event());
  const oldId = mock.doc(`pr_cards/${CARD_ID}`).messageId;
  const click = { type: 3, token: "tok", data: { custom_id: `pr:resend:${CARD_ID}` }, member: { user: { id: "7" } } };

  assert.equal(prInteractionResponse(click).response.type, 5);
  await resendCard(ctx("2026-11-22T05:00:00Z"), click);
  assert.match(mock.state.originalResponses.at(-1).content, /not available/);

  await resendCard(ctx("2026-11-22T13:00:00Z"), click);
  assert.equal(mock.state.originalResponses.at(-1).content, "Resent ✅");
  const card = mock.doc(`pr_cards/${CARD_ID}`);
  assert.notEqual(card.messageId, oldId);
  assert.equal(mock.state.messages.has(oldId), false);
  assert.equal(mock.channelMessages(CHANNEL).length, 1);
  assert.equal(card.resendCount, 1);
  assert.equal(card.publishedAt, "2026-11-22T13:00:00.000Z", "the 12-hour countdown restarts");
});
