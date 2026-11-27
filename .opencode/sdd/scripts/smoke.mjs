import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initProject } from "./lib/init.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-smoke-"));
try {
  const result = await initProject(temp, repoRoot, { dryRun: true });
  console.log("✓ smoke: dry-run init");
  for (const action of result.actions) console.log(`  - ${action}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
