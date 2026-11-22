export const STATUS = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In Progress",
  READY: "Ready for Review",
  DONE: "Done",
};

const STATUS_KEYS = {
  "not started": STATUS.NOT_STARTED,
  "in progress": STATUS.IN_PROGRESS,
  "ready for review": STATUS.READY,
  done: STATUS.DONE,
};

export const normalizeStatus = (s) => STATUS_KEYS[String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;

// body: { secret, spreadsheet, sheet, row, title, taskUrl, status, previousStatus }
export function parseTaskEvent(body, env) {
  if (!env.MF_TASKS_SECRET || body?.secret !== env.MF_TASKS_SECRET) return { error: "bad secret" };
  const status = normalizeStatus(body.status);
  if (!status) return { ignore: `unknown status "${body.status}"` };
  const previous = normalizeStatus(body.previousStatus);
  const task = {
    title: String(body.title ?? "").trim() || "Untitled task",
    url: String(body.taskUrl ?? "").trim() || null,
    sheet: body.sheet ?? null,
    row: body.row ?? null,
  };
  const action = previous === STATUS.IN_PROGRESS && status === STATUS.READY ? "publish" : "status";
  return { action, task, status, previous };
}
