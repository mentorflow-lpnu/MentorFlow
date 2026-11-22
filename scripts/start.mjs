// Usage: npm start [-- --tunnel] [--tunnel-type ngrok|cloudflare] [--port 5678] [--env .env]
// --tunnel uses ngrok when NGROK_DOMAIN is set in .env, otherwise a Cloudflare quick tunnel.
// Starts a local n8n with the variables from .env and all MentorFlow workflows imported and published.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./n8n.mjs";
import { readEnvFile, takeFlag, takeOption } from "./lib/local.mjs";

const args = process.argv.slice(2);
const envFile = takeOption(args, "--env", join(ROOT, ".env"));
const port = Number(takeOption(args, "--port", "5678"));
const tunnelKind = takeOption(args, "--tunnel-type", null);
const useTunnel = takeFlag(args, "--tunnel") || Boolean(tunnelKind);

const N8N = process.env.N8N_BIN ?? [join(ROOT, "node_modules/n8n/bin/n8n"), "D:/projects/university/itrp/lab2/node_modules/n8n/bin/n8n"].find(existsSync);
const NODE = process.env.N8N_NODE ?? ["D:/tools/runtimes/nvm/v24.21.0/node.exe"].find(existsSync) ?? process.execPath;
const DATA = join(ROOT, ".n8n");
const LOGS = join(ROOT, "logs");

const REQUIRED = [
  "DISCORD_BOT_TOKEN", "DISCORD_BOT_PUBLIC_KEY", "DISCORD_BOT_ID",
  "PR_REVIEW_CHANNEL_ID", "MEETINGS_CHANNEL_ID",
  "GITHUB_TOKEN", "MF_TASKS_SECRET", "MF_INTERNAL_SECRET",
];

const children = [];
function stopAll(code = 0) {
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(code);
}
function fail(message) {
  console.error(`\n✖ ${message}`);
  stopAll(1);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

let fileEnv;
try {
  fileEnv = readEnvFile(envFile);
} catch (e) {
  fail(e.message);
}
const missing = REQUIRED.filter((k) => !fileEnv[k]);
if (!fileEnv.FIREBASE_SERVICE_ACCOUNT && !fileEnv.FIRESTORE_TOKEN) missing.push("FIREBASE_SERVICE_ACCOUNT (npm run env:firebase -- <key.json>)");
if (missing.length) fail(`Fill in ${envFile}:\n  ${missing.join("\n  ")}`);
if (!N8N) fail("n8n not found: set N8N_BIN to the n8n binary (bin/n8n of an n8n 2.x install)");

const env = {
  ...process.env,
  ...fileEnv,
  MF_INTERNAL_URL: fileEnv.MF_INTERNAL_URL || `http://localhost:${port}/webhook`,
  N8N_USER_FOLDER: DATA,
  N8N_PORT: String(port),
  N8N_RUNNERS_BROKER_PORT: String(port + 1),
  N8N_DIAGNOSTICS_ENABLED: "false",
  N8N_EXPRESSION_ENGINE: "legacy",
  N8N_BLOCK_ENV_ACCESS_IN_NODE: "false",
  NODE_FUNCTION_ALLOW_BUILTIN: "crypto",
  GENERIC_TIMEZONE: "Europe/Kyiv",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wingetPackageBins(name) {
  const dir = join(process.env.LOCALAPPDATA ?? "", "Microsoft/WinGet/Packages");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => d.toLowerCase().includes(name)).map((d) => join(dir, d, `${name}.exe`)).filter(existsSync);
}

function findBin(name, extra = []) {
  const candidates = [name, join(process.env.LOCALAPPDATA ?? "", `Microsoft/WinGet/Links/${name}.exe`), ...wingetPackageBins(name), ...extra];
  return candidates.find((c) => spawnSync(c, ["--version"], { encoding: "utf8" }).status === 0);
}

const TUNNELS = {
  ngrok: {
    install: "winget install --id Ngrok.Ngrok, then ngrok config add-authtoken <token> (see docs/guides/local-run.md)",
    bin: () => findBin("ngrok"),
    args: () => ["http", `--domain=${fileEnv.NGROK_DOMAIN.replace(/^https?:\/\//, "")}`, String(port), "--log=stdout"],
    url: (line) => (/msg="started tunnel"/.test(line) ? `https://${fileEnv.NGROK_DOMAIN.replace(/^https?:\/\//, "")}` : null),
  },
  cloudflare: {
    install: "winget install --id Cloudflare.cloudflared",
    bin: () => findBin("cloudflared", ["C:/Program Files (x86)/cloudflared/cloudflared.exe", "C:/Program Files/cloudflared/cloudflared.exe"]),
    args: () => ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`],
    url: (line) => /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/.exec(line)?.[0] ?? null,
  },
};

async function startTunnel(kind) {
  const spec = TUNNELS[kind];
  if (!spec) fail(`unknown tunnel "${kind}": use ngrok or cloudflare`);
  if (kind === "ngrok" && !fileEnv.NGROK_DOMAIN) fail("NGROK_DOMAIN is not set in .env (your free static domain from the ngrok dashboard)");
  const bin = spec.bin();
  if (!bin) fail(`${kind} not found. Install it once: ${spec.install}; then open a new terminal`);
  const tunnel = spawn(bin, spec.args(), { stdio: ["ignore", "pipe", "pipe"] });
  children.push(tunnel);
  const log = createWriteStream(join(LOGS, "tunnel.log"));
  return new Promise((resolve) => {
    const timer = setTimeout(() => fail("the tunnel did not start in 60 s, see logs/tunnel.log"), 60000);
    let lastError = "";
    const onData = (d) => {
      log.write(d);
      const lines = String(d).split("\n");
      const found = (re, group = 1) => lines.map((l) => re.exec(l)?.[group]?.trim()).filter(Boolean).at(-1);
      lastError = found(/err="((?:[^"\\]|\\.)*)"/)?.replace(/\\[rn].*/s, "").replace(/\\(.)/g, "$1") ?? found(/failed to .+/, 0) ?? lastError;
      const url = lines.map(spec.url).find(Boolean);
      if (url) {
        clearTimeout(timer);
        resolve(url);
      }
    };
    tunnel.stdout.on("data", onData);
    tunnel.stderr.on("data", onData);
    tunnel.on("exit", (code) => fail(`the ${kind} tunnel stopped (exit ${code})${lastError ? `: ${lastError}` : ""}\n  full log: logs/tunnel.log`));
  });
}

function cli(...cmd) {
  const r = spawnSync(NODE, [N8N, ...cmd], { env, encoding: "utf8" });
  if (r.status !== 0) fail(`n8n ${cmd.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
}

async function webhooksReady(base) {
  for (let t = Date.now(); Date.now() - t < 180000; await sleep(1000)) {
    const status = await fetch(`${base}/webhook/mentorflow/discord`, { method: "POST", body: "{}" }).then((r) => r.status, () => 0);
    if (status === 401) return true;
  }
  return false;
}

mkdirSync(LOGS, { recursive: true });

const publicUrl = useTunnel ? await startTunnel(tunnelKind ?? (fileEnv.NGROK_DOMAIN ? "ngrok" : "cloudflare")) : null;
if (publicUrl) env.WEBHOOK_URL = `${publicUrl}/`;

console.log("Building and importing workflows…");
const built = join(DATA, "workflows");
const build = spawnSync(process.execPath, [join(ROOT, "scripts/build-workflows.mjs"), built], { encoding: "utf8" });
if (build.status !== 0) fail(`build failed:\n${build.stderr}`);
for (const f of readdirSync(built).filter((f) => f.endsWith(".json"))) {
  cli("import:workflow", `--input=${join(built, f)}`);
  cli("publish:workflow", `--id=${f.replace(/\.json$/, "")}`);
}

console.log("Starting n8n…");
const n8nLog = createWriteStream(join(LOGS, "n8n.log"));
const n8n = spawn(NODE, [N8N, "start"], { env, stdio: ["ignore", "pipe", "pipe"] });
children.push(n8n);
n8n.stdout.pipe(n8nLog);
n8n.stderr.pipe(n8nLog);
n8n.on("exit", (code) => {
  console.error(`\nn8n stopped (exit ${code}), see logs/n8n.log`);
  stopAll(code ?? 1);
});

const local = `http://localhost:${port}`;
if (!(await webhooksReady(local))) fail("n8n did not register the webhooks in 3 minutes, see logs/n8n.log");
const publicOk = publicUrl ? await webhooksReady(publicUrl) : false;

console.log(`
MentorFlow is running
  n8n editor            ${local}
  Discord endpoint URL  ${publicUrl ? `${publicUrl}/webhook/mentorflow/discord` : "— start with --tunnel to get a public URL"}
  Tasks sheet webhook   ${publicUrl ? `${publicUrl}/webhook/mentorflow/tasks` : "—"}
${publicUrl && !publicOk ? "  ⚠ the public URL does not answer yet; wait a minute before saving it in Discord\n" : ""}${publicUrl ? "  The tunnel URL changes on every start: update it in the Developer Portal and in the sheet CONFIG.\n" : ""}  Logs: logs/n8n.log${publicUrl ? ", logs/tunnel.log" : ""}
  Stop: Ctrl+C
`);
