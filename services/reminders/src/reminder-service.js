import { createDiscord, ephemeral, interactionUser, InteractionType, ResponseType } from "../../common/src/discord.js";
import { createFirestore } from "../../common/src/firestore.js";
import { loadSettings } from "../../common/src/settings.js";
import { logEvent } from "../../common/src/events.js";
import { addDays, localDate } from "../../common/src/time.js";
import { dueActions, occurrencesBetween } from "./schedule.js";
import { absentModal, buildReminder, buildStart, reminderButtons, withSeenBy } from "./reminder-card.js";

const MAX_LATE_MIN = 10;

const absenceList = async (fs, occId) =>
  (await fs.query("absences", [["occurrenceId", "==", occId]])).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));

export async function tick(ctx) {
  const fs = createFirestore(ctx), discord = createDiscord(ctx);
  const settings = await loadSettings(fs, ctx.env);
  const now = new Date(ctx.now);
  const meetings = await fs.query("meetings", [["active", "==", true]]);
  const longest = Math.max(30, ...meetings.flatMap((m) => m.reminders ?? []), ...settings.meetings.reminders);
  const since = addDays(localDate(now, settings.meetings.timezone).iso, -1);
  const exceptions = await fs.query("meeting_exceptions", [["date", ">=", since]]);
  const occurrences = occurrencesBetween(
    meetings, exceptions,
    new Date(now - MAX_LATE_MIN * 60000), new Date(+now + (longest + 1) * 60000),
    settings.meetings,
  );

  const done = [];
  for (const occ of occurrences) {
    let doc = await fs.get(`meeting_occurrences/${occ.id}`);
    const actions = dueActions(occ, doc, now, MAX_LATE_MIN);
    if (!actions.length) continue;
    const channelId = occ.channelId || settings.channels.meetings;
    if (!channelId) {
      done.push(`${occ.id}: no meetings channel configured`);
      continue;
    }
    doc ??= {
      meetingId: occ.meetingId, date: occ.date, startsAt: occ.startsAt, title: occ.title,
      zoomUrl: occ.zoomUrl, roleIds: occ.roleIds, userIds: occ.userIds,
      channelId, reminderMessages: {}, started: false, seenBy: [],
    };

    for (const action of actions) {
      if (action.kind === "reminder") {
        const absentCount = (await absenceList(fs, occ.id)).length;
        const msg = await discord.postMessage(channelId, buildReminder(occ, action.minutes, absentCount));
        doc.reminderMessages = { ...doc.reminderMessages, [String(action.minutes)]: msg.id };
        await fs.set(`meeting_occurrences/${occ.id}`, doc);
        await logEvent(fs, "reminders", "reminder_sent", { occurrenceId: occ.id, meetingId: occ.meetingId, minutes: action.minutes }, now);
        done.push(`${occ.id}: reminder ${action.minutes} min`);
      } else {
        const absences = await absenceList(fs, occ.id);
        const posted = Object.entries(doc.reminderMessages ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
        const msg = await discord.postMessage(channelId, buildStart(occ, absences, posted[0]?.[1]));
        for (const [, messageId] of posted)
          await discord.editMessage(channelId, messageId, { components: reminderButtons(occ, false) }).catch(() => {});
        doc = { ...doc, started: true, startMessageId: msg.id };
        await fs.set(`meeting_occurrences/${occ.id}`, doc);
        await logEvent(fs, "reminders", "meeting_started", { occurrenceId: occ.id, meetingId: occ.meetingId, absent: absences.length }, now);
        done.push(`${occ.id}: started, absent ${absences.length}`);
      }
    }
  }
  return { occurrences: occurrences.length, done };
}

function modalValue(body) {
  for (const c of body.data?.components ?? []) {
    const input = c.component ?? (c.components ?? [])[0];
    if (input?.custom_id === "status") return String(input.value ?? "").trim();
  }
  return "";
}

// custom_id: mt:absent:<occ>, mt:absentform:<occ>, mt:seen:<occ>
export async function handleMeetingInteraction(ctx, body) {
  const fs = createFirestore(ctx);
  const [, action, ...rest] = String(body.data?.custom_id ?? "").split(":");
  const occId = rest.join(":");
  const user = interactionUser(body);
  const occ = await fs.get(`meeting_occurrences/${occId}`);
  if (!occ) return ephemeral("This meeting was not found.");

  if (action === "absent" && body.type === InteractionType.COMPONENT) {
    if (occ.started) return ephemeral("This meeting has already started.");
    const existing = await fs.get(`absences/${occId}_${user.id}`);
    return { type: ResponseType.MODAL, data: absentModal({ id: occId }, existing?.text) };
  }

  if (action === "absentform" && body.type === InteractionType.MODAL_SUBMIT) {
    if (occ.started) return ephemeral("This meeting has already started, your status was not saved.");
    const text = modalValue(body);
    if (!text) return ephemeral("The status is empty, nothing was saved.");
    await fs.set(`absences/${occId}_${user.id}`, {
      occurrenceId: occId, meetingId: occ.meetingId, date: occ.date,
      userId: user.id, userName: user.name, text, updatedAt: ctx.now,
    });
    await logEvent(fs, "reminders", "absence_marked", { occurrenceId: occId, meetingId: occ.meetingId, userId: user.id }, ctx.now);
    return ephemeral("Saved. Your status will be shown when the meeting starts.");
  }

  if (action === "seen" && body.type === InteractionType.COMPONENT) {
    const seenBy = [...new Set([...(occ.seenBy ?? []), user.id])];
    await fs.update(`meeting_occurrences/${occId}`, { seenBy });
    return {
      type: ResponseType.UPDATE_MESSAGE,
      data: {
        content: withSeenBy(body.message?.content, seenBy),
        components: body.message?.components ?? [],
        allowed_mentions: { parse: [] },
      },
    };
  }

  return ephemeral("Unknown action.");
}
