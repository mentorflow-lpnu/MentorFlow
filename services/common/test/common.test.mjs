import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildQuery, createFirestore, fromFirestoreFields, serviceAccountJwt, toFirestoreFields } from "../src/firestore.js";
import { verifyDiscordSignature } from "../src/discord.js";
import { parseGithubUrl, pickLinkedPr } from "../src/github.js";
import { addDays, localDate, weeksBetween, zonedToUtc } from "../src/time.js";
import { defaultSettings, mergeSettings } from "../src/settings.js";
import { createMockApi, ghPr, httpFor, MOCK_ENV } from "../../../test/support/mock-api.mjs";

test("Firestore: values survive a round trip", () => {
  const data = { s: "a", n: 3, f: 1.5, b: true, nil: null, at: new Date("2026-11-22T10:00:00Z"), list: [1, "x"], map: { k: { deep: 2 } } };
  const back = fromFirestoreFields(toFirestoreFields(data));
  assert.deepEqual(back, { ...data, at: "2026-11-22T10:00:00.000Z" });
});

test("Firestore: query with one and several filters", () => {
  assert.equal(buildQuery("pr_cards", [["active", "==", true]]).structuredQuery.where.fieldFilter.op, "EQUAL");
  const q = buildQuery("absences", [["a", "==", 1], ["b", ">=", "x"]], { limit: 5 }).structuredQuery;
  assert.equal(q.where.compositeFilter.filters.length, 2);
  assert.equal(q.limit, 5);
});

test("Firestore client: set, update, get, query, add, delete", async () => {
  const mock = createMockApi();
  const fs = createFirestore({ http: httpFor(mock), env: { ...MOCK_ENV, FIRESTORE_URL: "http://mock/firestore/v1" } });
  await fs.set("pr_cards/a", { active: true, n: 1 });
  await fs.set("pr_cards/b", { active: false, n: 2 });
  await fs.update("pr_cards/a", { n: 5 });
  assert.deepEqual(await fs.get("pr_cards/a"), { id: "a", active: true, n: 5 });
  assert.equal(await fs.get("pr_cards/none"), null);
  assert.deepEqual((await fs.query("pr_cards", [["active", "==", true]])).map((d) => d.id), ["a"]);
  const added = await fs.add("events", { type: "x" });
  assert.ok(added.id);
  await fs.delete("pr_cards/a");
  assert.equal(await fs.get("pr_cards/a"), null);
});

test("Firestore: service account JWT is a valid RS256 token", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa = { client_email: "bot@test.iam", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
  const [h, c, s] = serviceAccountJwt(sa, new Date("2026-11-22T10:00:00Z")).split(".");
  assert.equal(JSON.parse(Buffer.from(h, "base64url")).alg, "RS256");
  assert.equal(JSON.parse(Buffer.from(c, "base64url")).scope, "https://www.googleapis.com/auth/datastore");
  assert.ok(crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url")));
});

test("Discord: Ed25519 signature", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const hex = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  const body = '{"type":1}', ts = "1763800000";
  const sig = crypto.sign(null, Buffer.from(ts + body), privateKey).toString("hex");
  assert.ok(verifyDiscordSignature(body, sig, ts, hex));
  assert.ok(!verifyDiscordSignature(body + " ", sig, ts, hex));
  assert.ok(!verifyDiscordSignature(body, "00", ts, hex));
});

test("GitHub: URL parsing and linked PR choice", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/o/r/issues/17"), { owner: "o", repo: "r", kind: "issue", number: 17 });
  assert.equal(parseGithubUrl("https://github.com/o/r/pull/5").kind, "pr");
  assert.equal(parseGithubUrl("https://docs.google.com/x"), null);
  const issue = {
    closedByPullRequestsReferences: { nodes: [ghPr({ number: 1, url: "u1", state: "CLOSED", createdAt: "2026-11-21T00:00:00Z" })] },
    timelineItems: { nodes: [
      { __typename: "CrossReferencedEvent", source: ghPr({ number: 2, url: "u2", createdAt: "2026-11-19T00:00:00Z" }) },
      { __typename: "CrossReferencedEvent", source: ghPr({ number: 3, url: "u3", isDraft: true }) },
      { __typename: "CrossReferencedEvent", source: { __typename: "Issue" } },
    ] },
  };
  assert.equal(pickLinkedPr(issue).number, 2, "open PR wins over a newer closed one; drafts are skipped");
  assert.equal(pickLinkedPr({ closedByPullRequestsReferences: { nodes: [] } }), null);
});

test("time: Kyiv time zone with daylight saving, week arithmetic", () => {
  assert.equal(zonedToUtc("2026-11-23", "15:00", "Europe/Kyiv").toISOString(), "2026-11-23T13:00:00.000Z");
  assert.equal(zonedToUtc("2026-07-01", "15:00", "Europe/Kyiv").toISOString(), "2026-07-01T12:00:00.000Z");
  assert.deepEqual(localDate(new Date("2026-11-22T22:30:00Z"), "Europe/Kyiv"), { iso: "2026-11-23", weekday: "mon" });
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(weeksBetween("2026-11-23", "2026-12-07"), 2);
  assert.equal(weeksBetween("2026-11-26", "2026-11-23"), 0, "same week");
});

test("settings: stored values override defaults, defaults fill the gaps", () => {
  const s = mergeSettings(defaultSettings({ PR_REVIEW_CHANNEL_ID: "1" }), { id: "main", pr: { resendAfterHours: 6, labelRoles: { dev: "9" } } });
  assert.equal(s.channels.prReview, "1");
  assert.equal(s.pr.resendAfterHours, 6);
  assert.deepEqual(s.pr.labelRoles, { dev: "9" });
  assert.equal(s.pr.emojis.approved, "✅");
  assert.deepEqual(s.meetings.reminders, [30, 5]);
});

test("settings: role variables give the default label → role map", () => {
  const s = defaultSettings({ DEVELOPER_ROLE_ID: "10", STUDENT_QA_ID: "30" });
  assert.deepEqual(s.pr.labelRoles, { dev: "10", qa: "30" });
  const merged = mergeSettings(s, { pr: { labelRoles: { design: "40" } } });
  assert.deepEqual(merged.pr.labelRoles, { dev: "10", qa: "30", design: "40" });
});
