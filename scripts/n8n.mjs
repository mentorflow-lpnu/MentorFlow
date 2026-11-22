// bundle() inlines a module and its relative imports into one script for a Code node:
// imports are removed, `export` is stripped, node:crypto becomes require("crypto").
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const IMPORT = /^import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?\s*$/gm;
const TOP_DECL = /^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function collect(file, seen, order) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1];
    if (spec.startsWith(".")) collect(resolve(dirname(file), spec), seen, order);
    else if (spec !== "node:crypto") throw new Error(`${relative(ROOT, file)}: only relative imports and node:crypto are allowed, got "${spec}"`);
  }
  order.push(file);
}

export function bundle(...entries) {
  const seen = new Set(), order = [];
  for (const e of entries) collect(resolve(ROOT, e), seen, order);
  const names = new Map();
  const parts = ['const crypto = require("crypto");'];
  for (const file of order) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(TOP_DECL)) {
      if (names.has(m[1])) throw new Error(`duplicate top-level name "${m[1]}" in ${relative(ROOT, file)} and ${names.get(m[1])}`);
      names.set(m[1], relative(ROOT, file));
    }
    parts.push(`// ---- ${relative(ROOT, file).replace(/\\/g, "/")} ----`, src.replace(IMPORT, "").replace(/^export\s+/gm, ""));
  }
  return parts.join("\n");
}

// ctx shared by every Code node: n8n's HTTP helper, environment, clock
export const CTX = "const ctx = { http: (opts) => this.helpers.httpRequest(opts), env: $env, now: new Date() };";

export const code = (name, position, modules, body) => ({
  name, type: "n8n-nodes-base.code", typeVersion: 2, position,
  parameters: { mode: "runOnceForAllItems", jsCode: `${bundle(...modules)}\n\n// ---- ${name} ----\n${CTX}\n${body.trim()}\n` },
});

export const webhook = (name, position, path, { respond = false, rawBody = false } = {}) => ({
  name, type: "n8n-nodes-base.webhook", typeVersion: 2, position, webhookId: `mentorflow-${path.replace(/\//g, "-")}`,
  parameters: {
    httpMethod: "POST", path: `mentorflow/${path}`,
    responseMode: respond ? "responseNode" : "onReceived",
    options: rawBody ? { rawBody: true } : {},
  },
});

export const respond = (name, position) => ({
  name, type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position,
  parameters: {
    respondWith: "json",
    responseBody: "={{ JSON.stringify($json.response) }}",
    options: { responseCode: "={{ $json.status ?? 200 }}" },
  },
});

export const schedule = (name, position, minutes) => ({
  name, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position,
  parameters: { rule: { interval: [{ field: "minutes", minutesInterval: minutes }] } },
});

export function workflow(id, name, nodes, links) {
  const connections = {};
  for (const [from, to] of links) (connections[from] ??= { main: [[]] }).main[0].push({ node: to, type: "main", index: 0 });
  return {
    id, name, active: false, nodes, connections,
    settings: { executionOrder: "v1", timezone: "Europe/Kyiv", saveDataSuccessExecution: "all" },
    pinData: {}, tags: [],
  };
}
