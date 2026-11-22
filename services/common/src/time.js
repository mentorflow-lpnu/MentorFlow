function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

function tzOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date / 1000) * 1000;
}

// "2026-11-23" + "15:00" in tz → Date (UTC instant); correct across DST changes
export function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - tzOffsetMs(new Date(wall), tz);
  t = wall - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function localDate(date, tz) {
  const p = zonedParts(date, tz);
  const iso = `${p.year}-${p.month}-${p.day}`;
  return { iso, weekday: WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()] };
}

export const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export const weekdayOf = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

// whole weeks between the Mondays of two dates
export function weeksBetween(fromIso, toIso) {
  const monday = (iso) => {
    const t = Date.parse(`${iso}T12:00:00Z`);
    return t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5;
  };
  return Math.round((monday(toIso) - monday(fromIso)) / (7 * 864e5));
}

export const unixSeconds = (date) => Math.floor(new Date(date).getTime() / 1000);
