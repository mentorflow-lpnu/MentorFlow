import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handleInteraction, isInternalCall, routeFor } from "../src/router.js";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const env = {
  DISCORD_BOT_PUBLIC_KEY: publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex"),
  MF_INTERNAL_URL: "http://n8n/webhook",
  MF_INTERNAL_SECRET: "s",
};
const signed = (body) => {
  const raw = JSON.stringify(body), ts = "1763800000";
  return [raw, { "x-signature-ed25519": crypto.sign(null, Buffer.from(ts + raw), privateKey).toString("hex"), "x-signature-timestamp": ts }];
};

test("routes by custom_id prefix and command name", () => {
  assert.equal(routeFor({ type: 3, data: { custom_id: "pr:resend:x" } }), "pr");
  assert.equal(routeFor({ type: 5, data: { custom_id: "mt:absentform:x" } }), "mt");
  assert.equal(routeFor({ type: 3, data: { custom_id: "menu:home" } }), "menu");
  assert.equal(routeFor({ type: 3, data: { custom_id: "cal:role" } }), "cal");
  assert.equal(routeFor({ type: 3, data: { custom_id: "fb:open" } }), "fb");
  assert.equal(routeFor({ type: 2, data: { name: "mentor" } }), "menu");
  assert.equal(routeFor({ type: 3, data: { custom_id: "zzz:1" } }), null);
});

test("rejects bad signatures and answers PING", async () => {
  const [raw, headers] = signed({ type: 1 });
  assert.equal((await handleInteraction({ env, http: null }, raw, { ...headers, "x-signature-ed25519": "00" })).status, 401);
  assert.deepEqual((await handleInteraction({ env, http: null }, raw, headers)).response, { type: 1 });
});

test("forwards to the owner's internal webhook and returns its answer", async () => {
  const calls = [];
  const http = async (o) => { calls.push(o); return { statusCode: 200, body: { type: 6 } }; };
  const [raw, headers] = signed({ type: 3, data: { custom_id: "pr:resend:abc" } });
  const out = await handleInteraction({ env, http }, raw, headers);
  assert.deepEqual(out, { status: 200, response: { type: 6 } });
  assert.equal(calls[0].url, "http://n8n/webhook/mentorflow/internal/pr");
  assert.equal(calls[0].headers["X-MentorFlow-Secret"], "s");
});

test("missing owner workflow, errors and timeouts become ephemeral messages", async () => {
  const [raw, headers] = signed({ type: 3, data: { custom_id: "menu:home" } });
  const r404 = await handleInteraction({ env, http: async () => ({ statusCode: 404, body: {} }) }, raw, headers);
  assert.match(r404.response.data.content, /not available/);
  assert.equal(r404.response.data.flags, 64);
  const rErr = await handleInteraction({ env, http: async () => { throw new Error("timeout"); } }, raw, headers);
  assert.match(rErr.response.data.content, /busy/);
});

test("internal calls must carry the secret", () => {
  assert.ok(isInternalCall({ "x-mentorflow-secret": "s" }, env));
  assert.ok(!isInternalCall({ "x-mentorflow-secret": "x" }, env));
  assert.ok(!isInternalCall({}, { MF_INTERNAL_SECRET: "" }));
});
