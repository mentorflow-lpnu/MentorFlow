import crypto from "node:crypto";

export const InteractionType = { PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 };
export const ResponseType = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, DEFERRED_UPDATE: 6, UPDATE_MESSAGE: 7, MODAL: 9 };
export const EPHEMERAL = 64;

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(rawBody, signature, timestamp, publicKeyHex) {
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export const ephemeral = (content) => ({ type: ResponseType.MESSAGE, data: { content, flags: EPHEMERAL } });

export const linkButton = (label, url) => ({ type: 2, style: 5, label, url });
export const actionButton = (label, customId, { style = 2, disabled = false } = {}) => ({
  type: 2, style, label, custom_id: customId, disabled,
});
export const row = (...components) => ({ type: 1, components: components.filter(Boolean) });

export const roleMention = (id) => `<@&${id}>`;
export const userMention = (id) => `<@${id}>`;

export function interactionUser(body) {
  const user = body.member?.user ?? body.user ?? {};
  return { id: user.id, name: body.member?.nick || user.global_name || user.username || user.id };
}

export function createDiscord(ctx) {
  const { http, env } = ctx;
  const base = (env.DISCORD_API_URL || "https://discord.com/api/v10").replace(/\/$/, "");
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN || ""}`, "Content-Type": "application/json" };

  async function call(method, path, body, { auth = true } = {}) {
    const res = await http({
      method, url: `${base}${path}`, body, json: true,
      headers: auth ? headers : { "Content-Type": "application/json" },
      returnFullResponse: true, ignoreHttpStatusErrors: true,
    });
    if (res.statusCode >= 300) {
      const err = new Error(`Discord ${method} ${path}: ${res.statusCode} ${JSON.stringify(res.body)}`);
      err.statusCode = res.statusCode;
      throw err;
    }
    return res.body;
  }

  const emojiPath = (emoji) => encodeURIComponent(emoji);

  return {
    postMessage: (channelId, message) => call("POST", `/channels/${channelId}/messages`, message),
    editMessage: (channelId, messageId, patch) => call("PATCH", `/channels/${channelId}/messages/${messageId}`, patch),
    deleteMessage: (channelId, messageId) => call("DELETE", `/channels/${channelId}/messages/${messageId}`),
    addReaction: (channelId, messageId, emoji) =>
      call("PUT", `/channels/${channelId}/messages/${messageId}/reactions/${emojiPath(emoji)}/@me`),
    removeOwnReaction: (channelId, messageId, emoji) =>
      call("DELETE", `/channels/${channelId}/messages/${messageId}/reactions/${emojiPath(emoji)}/@me`),
    editOriginalResponse: (interactionToken, patch) =>
      call("PATCH", `/webhooks/${env.DISCORD_BOT_ID}/${interactionToken}/messages/@original`, patch, { auth: false }),
  };
}
