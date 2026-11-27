import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAgentSync } from "./lib/agents.mjs";
import { checkVersions } from "./lib/version-check.mjs";
import { TEAM_VERSION } from "./lib/version.mjs";
import { listFilesRecursive, readText } from "./lib/util.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function mustExist(rel) {
  if (!fs.existsSync(path.join(repoRoot, rel))) errors.push(`缺少 ${rel}`);
}

for (const role of ["lead", "product", "architect", "builder", "verifier", "ops"]) {
  mustExist(`.opencode/agents/sdd/${role}.md`);
}
for (const command of ["start", "status", "resume", "review", "decision", "improve", "upgrade"]) {
  mustExist(`.opencode/commands/sdd-${command}.md`);
}
for (const skill of ["sdd-core", "sdd-speckit", "sdd-verify", "sdd-upgrade"]) {
  mustExist(`.opencode/skills/${skill}/SKILL.md`);
}
for (const file of [
  "templates/agents/permissions.yml",
  "templates/agents/models.yml",
  "templates/project/AGENTS.md",
  "templates/prompts/task-packet.md",
  "compat/speckit-1.x.json",
  "schemas/state.schema.json",
  "schemas/task.schema.json",
  "schemas/evidence.schema.json",
  "schemas/review.schema.json",
  "schemas/decision.schema.json",
  "schemas/handoff.schema.json",
  "schemas/manifest.schema.json",
]) {
  mustExist(file);
}

errors.push(...checkVersions(repoRoot, TEAM_VERSION));

function checkEncoding(root) {
  const textFiles = [
    ...listFilesRecursive(path.join(root, ".opencode")),
    ...listFilesRecursive(path.join(root, "templates")),
    ...listFilesRecursive(path.join(root, "docs")),
    path.join(root, "README.md"),
    path.join(root, "CHANGELOG.md"),
  ];
  for (const file of textFiles) {
    const buffer = fs.readFileSync(file);
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      errors.push(`${rel} 带 UTF-8 BOM`);
    }
    if (buffer.toString("utf8").includes("\uFFFD")) {
      errors.push(`${rel} 含替换字符，疑似编码损坏`);
    }
  }
  const permissions = readText(path.join(root, "templates", "agents", "permissions.yml"), "");
  if (!permissions.startsWith("# Riccon SDD 权限单一事实源。")) {
    errors.push("templates/agents/permissions.yml 头部中文注释损坏");
  }
}

checkEncoding(repoRoot);

const sync = checkAgentSync(repoRoot, repoRoot);
if (!sync.ok) errors.push(...sync.problems);

const compat = JSON.parse(fs.readFileSync(path.join(repoRoot, "compat", "speckit-1.x.json"), "utf8"));
if (!compat.range) errors.push("compat/speckit-1.x.json 缺少 range");

if (errors.length) {
  console.log("✗ check 失败");
  for (const e of errors) console.log(`  - ${e}`);
  process.exitCode = 1;
} else {
  console.log(`✓ Riccon SDD ${TEAM_VERSION} 源仓库检查通过`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
