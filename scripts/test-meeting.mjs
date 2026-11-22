// Usage: npm run test:meeting -- [--in 35] [--reminders 30,5] [--zoom <url>] [--delete] [--env .env]
// Creates (or removes) the one-time meeting meetings/mf-test that mentions only USER_ID.
import { join } from "node:path";
import { ROOT } from "./n8n.mjs";
import { httpRequest, readEnvFile, takeFlag, takeOption } from "./lib/local.mjs";
import { createFirestore } from "../services/common/src/firestore.js";
import { localDate } from "../services/common/src/time.js";

const args = process.argv.slice(2);
const env = readEnvFile(takeOption(args, "--env", join(ROOT, ".env")));
const inMinutes = Number(takeOption(args, "--in", "35"));
const reminders = takeOption(args, "--reminders", "30,5").split(",").map(Number);
const zoomUrl = takeOption(args, "--zoom", "https://zoom.us/");
const remove = takeFlag(args, "--delete");

const PATH = "meetings/mf-test";
const TZ = "Europe/Kyiv";
const fs = createFirestore({ http: httpRequest, env, now: new Date() });

if (remove) {
  await fs.delete(PATH);
  console.log(`${PATH} deleted`);
  process.exit(0);
}
if (!env.USER_ID) throw new Error("USER_ID is not set in .env");
if (!(inMinutes > Math.max(...reminders))) console.warn(`⚠ the meeting starts in ${inMinutes} min, so reminders longer than that are skipped`);

const start = new Date(Date.now() + inMinutes * 60000);
const date = localDate(start, TZ).iso;
const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);

await fs.set(PATH, {
  active: true,
  type: "once",
  title: "MentorFlow test meeting",
  description: "Created by npm run test:meeting",
  zoomUrl,
  reminders,
  slots: [{ date, time, roleIds: [], userIds: [env.USER_ID] }],
});

const at = (min) => new Date(start - min * 60000).toLocaleTimeString("uk-UA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
console.log(`${PATH}: ${date} ${time} (${TZ})`);
for (const m of reminders) console.log(`  reminder ${String(m).padStart(2)} min    → ~${at(m)}`);
console.log(`  meeting start      → ${time}`);
console.log("Remove it afterwards: npm run test:meeting -- --delete");
