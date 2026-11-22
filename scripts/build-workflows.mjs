// Usage: node scripts/build-workflows.mjs [outDir]
import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./n8n.mjs";

const outDir = resolve(process.argv[2] ?? join(ROOT, "workflows"));
mkdirSync(outDir, { recursive: true });

for (const service of readdirSync(join(ROOT, "services"))) {
  const def = join(ROOT, "services", service, "workflows.mjs");
  if (!existsSync(def)) continue;
  const { default: build } = await import(pathToFileURL(def).href);
  for (const wf of build()) {
    const file = join(outDir, `${wf.id}.json`);
    writeFileSync(file, JSON.stringify(wf, null, 2) + "\n");
    console.log(`${service}: ${wf.id}.json (${wf.nodes.length} nodes)`);
  }
}
