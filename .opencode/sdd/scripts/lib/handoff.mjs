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
import { loadState, sddPath } from "./state.mjs";
import { listTasks } from "./task.mjs";
import { openBlockingDecisions } from "./decision.mjs";

export function handoffDir(projectRoot) {
  return sddPath(projectRoot, "handoffs");
}

export function listHandoffs(projectRoot) {
  const dir = handoffDir(projectRoot);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^HANDOFF-\d+\.md$/.test(name))
    .sort()
    .map((name) => {
      const text = readText(path.join(dir, name), "");
      return { ...parseFrontMatter(text).data, file: name };
    });
}

export function latestHandoff(projectRoot) {
  const items = listHandoffs(projectRoot);
  return items.length ? items[items.length - 1] : null;
}

export function newHandoff(projectRoot, {
  session = null,
  summary = "",
  next = "",
  invariants = [],
  risks = [],
  first_read = [],
} = {}) {
  const state = loadState(projectRoot);
  if (!state) throw new Error("缺少 .sdd/state.json");
  const tasks = listTasks(projectRoot);
  const active = tasks.filter((t) => t.status === "in_progress" || t.status === "review");
  if (active.length) {
    throw new Error(`还有活动任务（${active.map((t) => t.id).join(", ")}）；先完成或标记 blocked 再 handoff。`);
  }
  const blocking = openBlockingDecisions(projectRoot);
  if (blocking.length) {
    throw new Error(`还有阻塞决策（${blocking.map((d) => d.id).join(", ")}）；先回答再 handoff。`);
  }
  if (state.gate?.status === "fail") {
    throw new Error("当前门禁失败；先修复再 handoff。");
  }
  if (!next || /^(待定|todo|tbd|下一步)$/i.test(String(next).trim())) {
    throw new Error("handoff 的 next 不能为空或占位词。");
  }
  for (const p of first_read) {
    if (!exists(path.join(projectRoot, p))) throw new Error(`first_read 路径不存在：${p}`);
  }
  ensureDir(handoffDir(projectRoot));
  const id = nextId(handoffDir(projectRoot), "HANDOFF");
  const data = {
    schema_version: 1,
    id,
    session,
    summary,
    next,
    invariants,
    risks,
    first_read,
    phase: state.phase,
    gate: state.gate?.name ?? null,
    gate_status: state.gate?.status ?? "pending",
    created_at: nowIso(),
  };
  const body = `# ${id}

## 摘要

${summary || "（待补充）"}

## 下一步

${next}

## 不变量

${invariants.length ? invariants.map((x) => `- ${x}`).join("\n") : "- （无）"}

## 风险

${risks.length ? risks.map((x) => `- ${x}`).join("\n") : "- （无）"}

## First read

${first_read.length ? first_read.map((x) => `- ${x}`).join("\n") : "- .sdd/state.json"}
`;
  writeText(path.join(handoffDir(projectRoot), `${id}.md`), stringifyFrontMatter(data, body));
  return { ...data, body };
}
