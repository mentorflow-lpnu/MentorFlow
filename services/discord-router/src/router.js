// One Discord Interactions Endpoint for the whole bot.
// Verifies the signature, answers PING and forwards every other interaction to its owner's
// internal webhook: POST {MF_INTERNAL_URL}/mentorflow/internal/<target>. The owner answers with
// a Discord interaction response, which the router returns to Discord unchanged.
import { InteractionType, ResponseType, ephemeral, verifyDiscordSignature } from "../../common/src/discord.js";

export const PREFIX_TARGETS = { pr: "pr", mt: "mt", menu: "menu", cal: "cal", fb: "fb" };
export const COMMAND_TARGETS = { mentor: "menu" };

export function routeFor(body) {
  if (body.type === InteractionType.COMMAND || body.type === InteractionType.AUTOCOMPLETE)
    return COMMAND_TARGETS[body.data?.name] ?? null;
  if (body.type === InteractionType.COMPONENT || body.type === InteractionType.MODAL_SUBMIT) {
    const prefix = String(body.data?.custom_id ?? "").split(":")[0];
    return PREFIX_TARGETS[prefix] ?? null;
  }
  return null;
}

export const internalUrl = (env, target) =>
  `${(env.MF_INTERNAL_URL || "http://localhost:5678/webhook").replace(/\/$/, "")}/mentorflow/internal/${target}`;

export const isInternalCall = (headers, env) =>
  !!env.MF_INTERNAL_SECRET && headers?.["x-mentorflow-secret"] === env.MF_INTERNAL_SECRET;

export async function handleInteraction(ctx, rawBody, headers) {
  const { env, http } = ctx;
  if (!verifyDiscordSignature(rawBody, headers["x-signature-ed25519"], headers["x-signature-timestamp"], env.DISCORD_BOT_PUBLIC_KEY))
    return { status: 401, response: { error: "invalid request signature" } };

  const body = JSON.parse(rawBody);
  if (body.type === InteractionType.PING) return { status: 200, response: { type: ResponseType.PONG } };

  const target = routeFor(body);
  if (!target) return { status: 200, response: ephemeral("Unknown action.") };

  try {
    const res = await http({
      method: "POST", url: internalUrl(env, target), body, json: true,
      headers: { "Content-Type": "application/json", "X-MentorFlow-Secret": env.MF_INTERNAL_SECRET || "" },
      timeout: 2500,
      returnFullResponse: true, ignoreHttpStatusErrors: true,
    });
    if (res.statusCode === 404) return { status: 200, response: ephemeral("This feature is not available yet.") };
    if (res.statusCode >= 300 || !res.body?.type) return { status: 200, response: ephemeral("Something went wrong. Please try again.") };
    return { status: 200, response: res.body };
  } catch {
    return { status: 200, response: ephemeral("The bot is busy. Please try again.") };
  }
}
