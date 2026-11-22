import { code, respond, schedule, webhook, workflow } from "../../scripts/n8n.mjs";

const SERVICE = ["services/pr-review/src/pr-service.js"];
const INTERNAL = ["services/discord-router/src/router.js", ...SERVICE];

export default () => [
  workflow("mfPrTaskEvents", "MentorFlow · PR: task events", [
    webhook("Tasks sheet", [0, 0], "tasks"),
    code("Handle task event", [240, 0], SERVICE, `
return [{ json: await handleTaskEvent(ctx, $input.first().json.body) }];
`),
  ], [["Tasks sheet", "Handle task event"]]),

  workflow("mfPrStateCheck", "MentorFlow · PR: state check", [
    schedule("Every 10 minutes", [0, 0], 10),
    webhook("Manual check", [0, 200], "pr/check"),
    code("Check cards", [240, 0], INTERNAL, `
// the manual check is for tests: protected by the internal secret; "now" is accepted only with MF_ALLOW_NOW=true
const input = $input.first().json;
if (input.headers) {
  if (!isInternalCall(input.headers, ctx.env)) return [{ json: { error: "forbidden" } }];
  if (input.body?.now && ctx.env.MF_ALLOW_NOW === "true") ctx.now = new Date(input.body.now);
}
return [{ json: await checkCards(ctx) }];
`),
  ], [["Every 10 minutes", "Check cards"], ["Manual check", "Check cards"]]),

  workflow("mfPrInteractions", "MentorFlow · PR: buttons", [
    webhook("Router: pr", [0, 0], "internal/pr", { respond: true }),
    code("Answer", [240, 0], INTERNAL, `
const { headers, body } = $input.first().json;
if (!isInternalCall(headers, ctx.env)) return [{ json: { status: 403, response: { error: "forbidden" }, work: false } }];
return [{ json: { status: 200, ...prInteractionResponse(body), body } }];
`),
    respond("Reply", [480, 0]),
    code("Resend", [720, 0], SERVICE, `
const item = $("Answer").first().json;
if (!item.work) return [];
await resendCard(ctx, item.body);
return [{ json: { done: true } }];
`),
  ], [["Router: pr", "Answer"], ["Answer", "Reply"], ["Reply", "Resend"]]),
];
