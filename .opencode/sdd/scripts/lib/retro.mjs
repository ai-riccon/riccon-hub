import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  exists,
  nextId,
  nowIso,
  parseFrontMatter,
  readText,
  stringifyFrontMatter,
  writeText,
} from "./util.mjs";
import { sddPath } from "./state.mjs";
import { computeMetrics } from "./metrics.mjs";

export function retroDir(projectRoot) {
  return sddPath(projectRoot, "retro");
}

export function listRetros(projectRoot) {
  const dir = retroDir(projectRoot);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^RETRO-\d+\.md$/.test(name))
    .sort()
    .map((name) => ({ ...parseFrontMatter(readText(path.join(dir, name), "")).data, file: name }));
}

export function newRetro(projectRoot, {
  period = "milestone",
  summary = "",
  friction = [],
  proposals = [],
} = {}) {
  ensureDir(retroDir(projectRoot));
  const id = nextId(retroDir(projectRoot), "RETRO");
  const metrics = computeMetrics(projectRoot);
  const data = {
    schema_version: 1,
    id,
    period,
    created_at: nowIso(),
    metrics,
  };
  const body = `# ${id} — 复盘（${period}）

## 指标

\`\`\`json
${JSON.stringify(metrics, null, 2)}
\`\`\`

## 摘要

${summary || "（待补充）"}

## 摩擦与问题

${friction.length ? friction.map((x) => `- ${x}`).join("\n") : "- （无）"}

## 改进提案

${proposals.length ? proposals.map((x) => `- ${x}`).join("\n") : "- （无）"}
`;
  writeText(path.join(retroDir(projectRoot), `${id}.md`), stringifyFrontMatter(data, body));
  return { ...data, body };
}
