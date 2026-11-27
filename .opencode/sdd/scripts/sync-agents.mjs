#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncAllAgents } from "./lib/agents.mjs";

const teamRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = syncAllAgents(teamRoot);
for (const result of results) {
  console.log(result.skipped ? `跳过 ${result.role}（文件不存在）` : `同步 ${result.role}: steps=${result.steps}, model=${result.model}`);
}
