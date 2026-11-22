// Usage: npm run env:firebase -- <service-account.json> [--env <file>]
// Writes FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT (base64) into .env without printing the key.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const envFile = envIndex >= 0 ? args.splice(envIndex, 2)[1] : ".env";
const [keyFile] = args;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!keyFile) fail("Usage: npm run env:firebase -- <service-account.json> [--env <file>]");
if (!existsSync(keyFile)) fail(`File not found: ${keyFile}`);
if (!existsSync(envFile)) fail(`${envFile} not found: copy .env.example to .env first`);

const raw = readFileSync(keyFile, "utf8").replace(/^﻿/, "");
let account;
try {
  account = JSON.parse(raw);
} catch {
  fail(`${keyFile} is not valid JSON`);
}
if (account.type !== "service_account" || !account.project_id || !account.private_key || !account.client_email) {
  fail(`${keyFile} is not a service account key: download it in Firebase → Project settings → Service accounts`);
}

const values = {
  FIREBASE_PROJECT_ID: account.project_id,
  FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString("base64"),
};

const text = readFileSync(envFile, "utf8");
const eol = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.split(/\r?\n/);
for (const [key, value] of Object.entries(values)) {
  const i = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.splice(lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${key}=${value}`);
}
writeFileSync(envFile, lines.join(eol));

console.log(`${envFile}: FIREBASE_PROJECT_ID=${account.project_id}, FIREBASE_SERVICE_ACCOUNT set (${values.FIREBASE_SERVICE_ACCOUNT.length} chars)`);
console.log(`The key file can now be deleted: ${keyFile}`);
