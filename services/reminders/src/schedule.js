import { addDays, localDate, weekdayOf, weeksBetween, zonedToUtc } from "../../common/src/time.js";

export const occurrenceId = (meetingId, date, time) => `${meetingId}_${date}_${time.replace(":", "")}`;

function slotsOn(meeting, iso) {
  if (meeting.startDate && iso < meeting.startDate) return [];
  if (meeting.endDate && iso > meeting.endDate) return [];
  const slots = meeting.slots ?? [];
  if (meeting.type === "once") return slots.filter((s) => s.date === iso);
  const weekday = weekdayOf(iso);
  const onDay = slots.filter((s) => s.weekday === weekday);
  if (meeting.type === "weekly") return onDay;
  if (meeting.type === "interval") {
    const every = Math.max(1, Number(meeting.everyWeeks) || 1);
    const weeks = weeksBetween(meeting.startDate ?? iso, iso);
    return weeks >= 0 && weeks % every === 0 ? onDay : [];
  }
  return [];
}

// occurrences whose start lies in [from, to]
export function occurrencesBetween(meetings, exceptions, from, to, defaults) {
  const byKey = new Map(exceptions.map((x) => [`${x.meetingId}|${x.date}`, x]));
  const out = [];
  for (const m of meetings) {
    if (m.active === false) continue;
    const tz = m.timezone || defaults.timezone;
    const first = addDays(localDate(new Date(from), tz).iso, -1);
    const last = addDays(localDate(new Date(to), tz).iso, 1);
    for (let iso = first; iso <= last; iso = addDays(iso, 1)) {
      for (const slot of slotsOn(m, iso)) {
        const ex = byKey.get(`${m.id}|${iso}`);
        if (ex?.action === "cancel") continue;
        const moved = ex?.action === "move";
        const date = moved && ex.newDate ? ex.newDate : iso;
        const time = moved && ex.newTime ? ex.newTime : slot.time;
        const startsAt = zonedToUtc(date, time, tz);
        if (startsAt < new Date(from) || startsAt > new Date(to)) continue;
        out.push({
          id: occurrenceId(m.id, iso, slot.time),
          meetingId: m.id,
          date: iso,
          startsAt: startsAt.toISOString(),
          title: m.title || null,
          description: m.description || null,
          zoomUrl: (moved && ex.zoomUrl) || m.zoomUrl || null,
          roleIds: slot.roleIds ?? [],
          userIds: slot.userIds ?? [],
          reminders: (m.reminders?.length ? m.reminders : defaults.reminders).map(Number).sort((a, b) => b - a),
          channelId: m.channelId || null,
        });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// what is due now for one occurrence, given its meeting_occurrences document
export function dueActions(occ, doc, now, maxLateMin = 10) {
  const t = new Date(now).getTime(), start = Date.parse(occ.startsAt), late = maxLateMin * 60000;
  const actions = [];
  for (const minutes of occ.reminders) {
    const fireAt = start - minutes * 60000;
    if (fireAt <= t && t - fireAt <= late && t < start && !doc?.reminderMessages?.[String(minutes)])
      actions.push({ kind: "reminder", minutes });
  }
  if (start <= t && t - start <= late && !doc?.started) actions.push({ kind: "start" });
  return actions;
}
