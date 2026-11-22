import { code, respond, webhook, workflow } from "../../scripts/n8n.mjs";

const M = ["services/discord-router/src/router.js"];

export default () => [
  workflow("mfDiscordRouter", "MentorFlow · Discord router", [
    webhook("Discord interactions", [0, 0], "discord", { respond: true, rawBody: true }),
    code("Verify and route", [240, 0], M, `
const raw = (await this.helpers.getBinaryDataBuffer(0, "data")).toString("utf8");
const result = await handleInteraction(ctx, raw, $input.first().json.headers);
return [{ json: result }];
`),
    respond("Reply to Discord", [480, 0]),
  ], [
    ["Discord interactions", "Verify and route"],
    ["Verify and route", "Reply to Discord"],
  ]),
];
