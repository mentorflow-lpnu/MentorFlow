import { actionButton, linkButton, roleMention, row, userMention } from "../../common/src/discord.js";
import { unixSeconds } from "../../common/src/time.js";

const REMINDER_COLOR = 0x3fb950;
const SEEN_PREFIX = "Seen by ";

export const absentId = (occId) => `mt:absent:${occId}`;
export const absentFormId = (occId) => `mt:absentform:${occId}`;
export const seenId = (occId) => `mt:seen:${occId}`;

const mentionsOf = (occ) => [...occ.roleIds.map(roleMention), ...occ.userIds.map(userMention)].join(" ");

export function reminderButtons(occ, absentEnabled = true) {
  return [row(
    occ.zoomUrl ? linkButton("Join", occ.zoomUrl) : null,
    actionButton("I can't attend today", absentId(occ.id), { disabled: !absentEnabled }),
  )];
}

export function buildReminder(occ, minutes, absentCount = 0) {
  const ts = unixSeconds(occ.startsAt);
  const mentions = mentionsOf(occ);
  const fields = [{ name: "Starts", value: `<t:${ts}:t> (<t:${ts}:R>)`, inline: true }];
  if (absentCount > 0) fields.push({ name: "Marked absent", value: String(absentCount), inline: true });
  return {
    content: `${mentions ? `${mentions}! ` : ""}Meeting starts in about ${minutes} minutes`.slice(0, 2000),
    embeds: [{
      title: (occ.title || "Meeting").slice(0, 256),
      ...(occ.description ? { description: occ.description.slice(0, 4000) } : {}),
      fields,
      color: REMINDER_COLOR,
    }],
    components: reminderButtons(occ),
    allowed_mentions: { parse: [], roles: occ.roleIds, users: occ.userIds },
  };
}

export const seenLine = (userIds) => (userIds.length ? `${SEEN_PREFIX}${userIds.map(userMention).join(", ")}` : "");

export function buildStart(occ, absences, replyTo) {
  const join = occ.zoomUrl ? linkButton("Join", occ.zoomUrl) : null;
  const reference = replyTo ? { message_reference: { message_id: replyTo, fail_if_not_exists: false } } : {};
  if (!absences.length)
    return { content: "**Meeting started**", components: join ? [row(join)] : [], allowed_mentions: { parse: [] }, ...reference };
  const lines = absences.map((a) => `${userMention(a.userId)} — ${String(a.text).replace(/\s+/g, " ").trim()}`);
  let content = `**Meeting started. Absent today (${absences.length}):**\n${lines.join("\n")}`;
  if (content.length > 1800) content = `${content.slice(0, 1797)}...`;
  return { content, components: [row(join, actionButton("OK", seenId(occ.id), { style: 1 }))], allowed_mentions: { parse: [] }, ...reference };
}

export function withSeenBy(content, userIds) {
  const base = String(content ?? "").split("\n\n" + SEEN_PREFIX)[0];
  const line = seenLine(userIds);
  return line ? `${base}\n\n${line}` : base;
}

export function absentModal(occ, existingText) {
  return {
    custom_id: absentFormId(occ.id),
    title: "I can't attend today",
    components: [row({
      type: 4, custom_id: "status", label: "Status", style: 2, required: true, max_length: 1000,
      placeholder: "Done, in progress, blockers, why you can't attend",
      ...(existingText ? { value: existingText } : {}),
    })],
  };
}
