// Best-effort: analytics must never break the main flow.

export async function logEvent(fs, source, type, data = {}, now = new Date()) {
  try {
    await fs.add("events", { type, source, at: now, ...data });
  } catch {}
}
