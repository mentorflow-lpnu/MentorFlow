// End-to-end: real n8n with all workflows; Firestore, Discord and GitHub are served by the in-memory mock.
// Run: npm run e2e   (N8N_BIN / N8N_NODE override the n8n binary and Node 24; defaults point to the local ITRP lab2 install)
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { ROOT } from "../../scripts/n8n.mjs";
import { toFirestoreFields } from "../../services/common/src/firestore.js";
import { createMockApi, ghIssue, ghPr, mockEnv, serve } from "../support/mock-api.mjs";

const N8N = process.env.N8N_BIN ?? "D:/projects/university/itrp/lab2/node_modules/n8n/bin/n8n";
const NODE = process.env.N8N_NODE ?? "D:/tools/runtimes/nvm/v24.21.0/node.exe";
const PORT = 5698, MOCK_PORT = 5799;
const HOOKS = `http://localhost:${PORT}/webhook/mentorflow`;
const DATA = join(ROOT, ".n8n-e2e");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

const env = {
  ...process.env,
  ...mockEnv(`http://localhost:${MOCK_PORT}`),
  DISCORD_BOT_PUBLIC_KEY: publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex"),
  MF_INTERNAL_URL: `http://localhost:${PORT}/webhook`,
  MF_ALLOW_NOW: "true",
  N8N_USER_FOLDER: DATA,
  N8N_PORT: String(PORT),
  N8N_RUNNERS_BROKER_PORT: "5697",
  N8N_DIAGNOSTICS_ENABLED: "false",
  N8N_EXPRESSION_ENGINE: "legacy",
  N8N_BLOCK_ENV_ACCESS_IN_NODE: "false",
  NODE_FUNCTION_ALLOW_BUILTIN: "crypto",
  GENERIC_TIMEZONE: "Europe/Kyiv",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, what, ms = 20000) {
  for (const t = Date.now(); Date.now() - t < ms; await sleep(300)) {
    const v = await check();
    if (v) return v;
  }
  throw new Error(`timed out waiting for: ${what}`);
}
function cli(...args) {
  const r = spawnSync(NODE, [N8N, ...args], { env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`n8n ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
}
const post = (path, body, headers = {}) =>
  fetch(`${HOOKS}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const internal = { "X-MentorFlow-Secret": env.MF_INTERNAL_SECRET };
function discordCall(body, { badSignature = false } = {}) {
  const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000));
  const sig = badSignature ? "00".repeat(64) : crypto.sign(null, Buffer.from(ts + raw), privateKey).toString("hex");
  return fetch(`${HOOKS}/discord`, { method: "POST", body: raw, headers: { "Content-Type": "application/json", "X-Signature-Ed25519": sig, "X-Signature-Timestamp": ts } });
}

const mock = createMockApi();
mock.state.issues.set("mentorflow-lpnu/MentorFlow#17", ghIssue());
mock.state.prs.set("mentorflow-lpnu/MentorFlow#42", ghPr());
mock.state.docs.set("settings/main", toFirestoreFields({
  channels: { prReview: "555", meetings: "777" },
  pr: { labelRoles: { dev: "900" }, defaultRoleIds: ["902"] },
}));
mock.state.docs.set("meetings/daily", toFirestoreFields({
  active: true, type: "weekly", title: "Daily", zoomUrl: "https://zoom.us/j/1", startDate: "2026-11-01",
  slots: [{ weekday: "mon", time: "15:00", roleIds: ["800", "900"], userIds: [] }],
}));
const CARD = "mentorflow-lpnu__mentorflow__issue-17";
const OCC = "daily_2026-11-23_1500";

rmSync(DATA, { recursive: true, force: true });
spawnSync(process.execPath, [join(ROOT, "scripts/build-workflows.mjs"), join(DATA, "workflows")], { stdio: "inherit" });
const server = await serve(mock, MOCK_PORT);
for (const f of readdirSync(join(DATA, "workflows"))) {
  cli("import:workflow", `--input=${join(DATA, "workflows", f)}`);
  cli("publish:workflow", `--id=${f.replace(/\.json$/, "")}`);
}
const n8n = spawn(NODE, [N8N, "start"], { env, stdio: ["ignore", "pipe", "pipe"] });
let n8nOut = "";
n8n.stdout.on("data", (d) => (n8nOut += d));
n8n.stderr.on("data", (d) => (n8nOut += d));

let failed = false;
try {
  await waitFor(() => discordCall({ type: 1 }).then((r) => r.status === 200, () => false), "n8n webhooks", 120000);

  assert.deepEqual(await (await discordCall({ type: 1 })).json(), { type: 1 });
  assert.equal((await discordCall({ type: 1 }, { badSignature: true })).status, 401);
  const notYet = await (await discordCall({ type: 3, data: { custom_id: "menu:home" } })).json();
  assert.match(notYet.data.content, /not available yet/);
  console.log("✔ R1 router: PING, bad signature → 401, missing owner workflow → ephemeral");

  await post("tasks", { secret: env.MF_TASKS_SECRET, sheet: "Sprint 3", row: 12, title: "Login page", taskUrl: "https://github.com/mentorflow-lpnu/MentorFlow/issues/17", status: "Ready for Review", previousStatus: "In Progress" });
  const card = await waitFor(() => mock.channelMessages("555")[0], "PR card");
  assert.match(card.content, /^<@&900> \*\*octocat\*\* opened a PR for review/);
  assert.deepEqual(card.components[0].components.map((c) => c.label), ["Open task", "Resend", "Open PR"]);
  console.log("✔ R3–R5 tasks sheet event → PR card with the label role mention");

  const later = new Date(Date.now() + 13 * 36e5).toISOString();
  await post("pr/check", { now: later }, internal);
  await waitFor(() => mock.state.messages.get(card.id)?.components[0].components[1].disabled === false, "Resend enabled after 12 h");
  mock.state.prs.set("mentorflow-lpnu/MentorFlow#42", ghPr({ reviewDecision: "CHANGES_REQUESTED" }));
  await post("pr/check", { now: later }, internal);
  await waitFor(() => mock.state.messages.get(card.id)?.reactions.includes("🔁"), "changes requested reaction");
  mock.state.prs.set("mentorflow-lpnu/MentorFlow#42", ghPr());
  await post("pr/check", { now: later }, internal);
  await waitFor(() => mock.state.messages.get(card.id)?.reactions.length === 0, "reaction removed");
  console.log("✔ R6 state check: Resend after 12 h, reactions follow the PR");

  // a 13-hour-old card enables Resend; the click goes through the router
  mock.state.docs.get(`pr_cards/${CARD}`).publishedAt = { timestampValue: new Date(Date.now() - 13 * 36e5).toISOString() };
  const deferred = await (await discordCall({ type: 3, token: "tok-1", data: { custom_id: `pr:resend:${CARD}` }, member: { user: { id: "7", username: "x" } } })).json();
  assert.equal(deferred.type, 5);
  await waitFor(() => mock.state.originalResponses.find((r) => r.token === "tok-1"), "deferred reply edited");
  assert.equal(mock.state.originalResponses.find((r) => r.token === "tok-1").content, "Resent ✅");
  assert.equal(mock.state.messages.has(card.id), false, "old card deleted");
  assert.equal(mock.channelMessages("555").length, 1);
  console.log("✔ R7 Resend through the router: deferred reply, new card, old card deleted");

  const member = (id, nick) => ({ member: { nick, user: { id, username: `u${id}` } } });
  await post("reminders/tick", { now: "2026-11-23T12:30:00Z" }, internal);
  const r30 = await waitFor(() => mock.channelMessages("777")[0], "30-minute reminder");
  assert.equal(r30.content, "<@&800> <@&900>! Meeting starts in about 30 minutes");
  const modal = await (await discordCall({ type: 3, data: { custom_id: `mt:absent:${OCC}` }, ...member("111", "Olena") })).json();
  assert.equal(modal.type, 9);
  const saved = await (await discordCall({ type: 5, data: { custom_id: `mt:absentform:${OCC}`, components: [{ type: 1, components: [{ type: 4, custom_id: "status", value: "sick, PR #42 waits for review" }] }] }, ...member("111", "Olena") })).json();
  assert.match(saved.data.content, /Saved/);
  await post("reminders/tick", { now: "2026-11-23T12:55:00Z" }, internal);
  await waitFor(() => mock.channelMessages("777")[1], "5-minute reminder");
  const prefilled = await (await discordCall({ type: 3, data: { custom_id: `mt:absent:${OCC}` }, ...member("111", "Olena") })).json();
  assert.equal(prefilled.data.components[0].components[0].value, "sick, PR #42 waits for review");
  await post("reminders/tick", { now: "2026-11-23T13:00:00Z" }, internal);
  const start = await waitFor(() => mock.channelMessages("777")[2], "meeting start");
  assert.equal(start.content, "**Meeting started. Absent today (1):**\n<@111> — sick, PR #42 waits for review");
  const seen = await (await discordCall({ type: 3, data: { custom_id: `mt:seen:${OCC}` }, message: start, ...member("800", "Mentor") })).json();
  assert.match(seen.data.content, /Seen by <@800>$/);
  console.log("✔ R8–R10 reminders 30/5 min, absence status via modal, start summary, OK");

  console.log("\nE2E PASSED");
} catch (e) {
  failed = true;
  console.error("✘", e.message);
  console.error("--- mock requests ---\n" + mock.state.log.slice(-25).map((l) => `${l.method} ${l.path}`).join("\n"));
  console.error("--- n8n (tail) ---\n" + n8nOut.split("\n").filter((l) => !/deprecat|^ - /i.test(l)).slice(-40).join("\n"));
} finally {
  n8n.kill();
  server.close();
}
process.exit(failed ? 1 : 0);
