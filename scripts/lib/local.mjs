import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function readEnvFile(file) {
  if (!existsSync(file)) throw new Error(`${file} not found: copy .env.example to .env and fill it in`);
  return parseEnv(readFileSync(file, "utf8"));
}

export function takeOption(args, name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return value;
}

export function takeFlag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

// The same contract as n8n's this.helpers.httpRequest, on top of fetch, for scripts run outside n8n.
export async function httpRequest(opts) {
  const body = opts.body === undefined || typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const res = await fetch(opts.url, { method: opts.method ?? "GET", headers: opts.headers, body });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {}
  if (!opts.ignoreHttpStatusErrors && res.status >= 400) throw new Error(`HTTP ${res.status}: ${text}`);
  return opts.returnFullResponse ? { statusCode: res.status, body: parsed, headers: Object.fromEntries(res.headers) } : parsed;
}
