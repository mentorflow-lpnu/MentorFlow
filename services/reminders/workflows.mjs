import { code, respond, schedule, webhook, workflow } from "../../scripts/n8n.mjs";

const SERVICE = ["services/reminders/src/reminder-service.js"];
const INTERNAL = ["services/discord-router/src/router.js", ...SERVICE];

export default () => [
  workflow("mfReminderTick", "MentorFlow · Reminders: tick", [
    schedule("Every minute", [0, 0], 1),
    webhook("Manual tick", [0, 200], "reminders/tick"),
    code("Tick", [240, 0], INTERNAL, `
// the manual tick is for tests: protected by the internal secret; "now" is accepted only with MF_ALLOW_NOW=true
const input = $input.first().json;
if (input.headers) {
  if (!isInternalCall(input.headers, ctx.env)) return [{ json: { error: "forbidden" } }];
  if (input.body?.now && ctx.env.MF_ALLOW_NOW === "true") ctx.now = new Date(input.body.now);
}
return [{ json: await tick(ctx) }];
`),
  ], [["Every minute", "Tick"], ["Manual tick", "Tick"]]),

  workflow("mfReminderInteractions", "MentorFlow · Reminders: buttons", [
    webhook("Router: mt", [0, 0], "internal/mt", { respond: true }),
    code("Handle", [240, 0], INTERNAL, `
const { headers, body } = $input.first().json;
if (!isInternalCall(headers, ctx.env)) return [{ json: { status: 403, response: { error: "forbidden" } } }];
return [{ json: { status: 200, response: await handleMeetingInteraction(ctx, body) } }];
`),
    respond("Reply", [480, 0]),
  ], [["Router: mt", "Handle"], ["Handle", "Reply"]]),
];
