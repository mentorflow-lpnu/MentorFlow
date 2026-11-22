// Tasks sheet trigger: sends every Status change to n8n (webhook mentorflow/tasks).
// n8n publishes a PR card on In Progress -> Ready for Review and tracks other changes for published cards.
// Install: Extensions -> Apps Script -> paste this file -> fill CONFIG -> run install() -> grant permissions.
// A simple onEdit trigger cannot call external URLs, so install() creates an installable trigger.

const CONFIG = {
  webhookUrl: "https://<n8n host>/webhook/mentorflow/tasks",
  secret: "<MF_TASKS_SECRET>",
  headerRow: 1,
  // header names in the sheet (the first match wins)
  columns: {
    title: ["Назва", "Name", "Title", "Task"],
    status: ["Status", "Статус"],
  },
};

function install() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "onStatusEdit")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onStatusEdit").forSpreadsheet(ss).onEdit().create();
  Logger.log("Trigger installed for " + ss.getName());
}

function onStatusEdit(e) {
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const col = (names) => names.map((n) => headers.indexOf(n) + 1).find((i) => i > 0) || 0;
  const statusCol = col(CONFIG.columns.status);
  const titleCol = col(CONFIG.columns.title);
  if (!statusCol || statusCol < e.range.getColumn() || statusCol > e.range.getLastColumn()) return;

  // the old value is known only for a single-cell edit (e.g. a dropdown change)
  const single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  for (let row = Math.max(e.range.getRow(), CONFIG.headerRow + 1); row <= e.range.getLastRow(); row++) {
    send({
      secret: CONFIG.secret,
      spreadsheet: sheet.getParent().getName(),
      sheet: sheet.getName(),
      row: row,
      title: titleCol ? String(sheet.getRange(row, titleCol).getDisplayValue()) : "",
      taskUrl: titleCol ? cellLink(sheet.getRange(row, titleCol)) : "",
      status: String(sheet.getRange(row, statusCol).getDisplayValue()),
      previousStatus: single ? String(e.oldValue || "") : "",
    });
  }
}

// link from rich text (Insert -> Link) or from =HYPERLINK("url"; "text")
function cellLink(range) {
  const rich = range.getRichTextValue();
  if (rich) {
    const runLink = rich.getRuns().map((r) => r.getLinkUrl()).find((u) => u);
    if (runLink) return runLink;
  }
  const formula = /HYPERLINK\(\s*"([^"]+)"/i.exec(range.getFormula());
  return formula ? formula[1] : "";
}

function send(payload) {
  const res = UrlFetchApp.fetch(CONFIG.webhookUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) console.error("n8n " + res.getResponseCode() + ": " + res.getContentText());
}

// manual check: select the Status cell of a task row, run testSelectedRow
function testSelectedRow() {
  onStatusEdit({ range: SpreadsheetApp.getActiveRange(), oldValue: "In Progress" });
}
