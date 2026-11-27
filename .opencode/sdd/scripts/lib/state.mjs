import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ensureDir,
  exists,
  nowIso,
  readJson,
  readText,
  writeJson,
  writeText,
  parseFrontMatter,
} from "./util.mjs";
import { defaultConfig, saveConfig } from "./config.mjs";
import { SCHEMA_VERSION, TEAM_VERSION } from "./version.mjs";

export const PHASES = [
  "init",
  "kickoff",
  "specify",
  "plan",
  "tasks",
  "implement",
  "verify",
  "accept",
  "done",
  "blocked",
];

export const TASK_STATUSES = ["planned", "ready", "in_progress", "review", "done", "blocked"];
export const GATES = ["kickoff", "spec", "plan", "tasks", "final"];

export function sddDir(projectRoot) {
  return path.join(projectRoot, ".sdd");
}

export function sddPath(projectRoot, ...parts) {
  return path.join(sddDir(projectRoot), ...parts);
}

export function statePath(projectRoot) {
  return sddPath(projectRoot, "state.json");
}

export function projectPath(projectRoot) {
  return sddPath(projectRoot, "project.json");
}

export function ensureStateDirs(projectRoot) {
  for (const dir of ["tasks", "decisions", "evidence", "reviews", "handoffs", "retro", "metrics", "backup", "analysis"]) {
    ensureDir(sddPath(projectRoot, dir));
  }
}

export function emptyState(projectRoot) {
  const now = nowIso();
  return {
    schema_version: SCHEMA_VERSION,
    team_version: TEAM_VERSION,
    phase: "init",
    gate: { name: "kickoff", status: "pending", checked_at: null, message: "" },
    current_feature: null,
    current_story: null,
    active_task: null,
    approvals: Object.fromEntries(
      GATES.map((gate) => [gate, { status: "pending", decision_id: null, at: null }]),
    ),
    next: "运行 /sdd-start 开始项目",
    health: "ok",
    created_at: now,
    updated_at: now,
  };
}

export function initProjectState(projectRoot, { name, speckitVersion = null, teamVersion = TEAM_VERSION, teamSource = null } = {}) {
  ensureStateDirs(projectRoot);
  const now = nowIso();
  const project = {
    schema_version: SCHEMA_VERSION,
    project_id: crypto.randomUUID(),
    name: name ?? path.basename(projectRoot),
    created_at: now,
    team_version: teamVersion,
    speckit_version: speckitVersion,
    team_source: teamSource,
    track: "greenfield",
    timezone: "Asia/Shanghai",
    integration: "opencode",
  };
  if (!exists(projectPath(projectRoot))) writeJson(projectPath(projectRoot), project);
  if (!exists(statePath(projectRoot))) writeJson(statePath(projectRoot), emptyState(projectRoot));
  if (!exists(sddPath(projectRoot, "config.yml"))) saveConfig(projectRoot, defaultConfig());
  if (!exists(sddPath(projectRoot, "brief.md"))) {
    writeText(sddPath(projectRoot, "brief.md"), briefTemplate(project.name));
  }
  if (!exists(sddPath(projectRoot, "metrics", "events.jsonl"))) {
    writeText(sddPath(projectRoot, "metrics", "events.jsonl"), "");
  }
  return project;
}

function briefTemplate(name) {
  return `# ${name} — MVP 一页纸

> 由 lead 在 kickoff 阶段与用户共同填写；未批准前不要进入 specify。

## 用户与问题

- 目标用户：
- 核心问题：
- 为什么现在要做：

## MVC（最小可用能力）

- 

## 非目标（non-goals）

- 

## 成功指标

- 

## 约束与风险

- 技术/合规/时间/预算约束：
- 已识别的风险：

## 批准

- 状态：pending
- 批准决策：-
`;
}

export function loadProject(projectRoot) {
  return readJson(projectPath(projectRoot), null);
}

export function loadState(projectRoot) {
  return readJson(statePath(projectRoot), null);
}

export function saveState(projectRoot, state) {
  state.updated_at = nowIso();
  writeJson(statePath(projectRoot), state);
  return state;
}

export function setPhase(projectRoot, phase) {
  if (!PHASES.includes(phase)) throw new Error(`未知阶段：${phase}`);
  const state = loadState(projectRoot) ?? emptyState(projectRoot);
  state.phase = phase;
  return saveState(projectRoot, state);
}

export function setGate(projectRoot, name, status, message = "") {
  if (!GATES.includes(name)) throw new Error(`未知门禁：${name}`);
  if (!["pending", "pass", "fail"].includes(status)) throw new Error(`未知门禁状态：${status}`);
  const state = loadState(projectRoot) ?? emptyState(projectRoot);
  state.gate = { name, status, checked_at: nowIso(), message };
  return saveState(projectRoot, state);
}

export function setApproval(projectRoot, gate, { status, decision_id = null }) {
  if (!GATES.includes(gate)) throw new Error(`未知门禁：${gate}`);
  if (!["pending", "approved", "rejected"].includes(status)) throw new Error(`未知批准状态：${status}`);
  const state = loadState(projectRoot) ?? emptyState(projectRoot);
  state.approvals[gate] = { status, decision_id, at: nowIso() };
  return saveState(projectRoot, state);
}

export function loadTasks(projectRoot) {
  const dir = sddPath(projectRoot, "tasks");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^TASK-\d+\.json$/.test(name))
    .sort()
    .map((name) => readJson(path.join(dir, name), null))
    .filter(Boolean);
}

export function loadDecisions(projectRoot) {
  const dir = sddPath(projectRoot, "decisions");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^DEC-\d+\.md$/.test(name))
    .sort()
    .map((name) => {
      const text = readText(path.join(dir, name), "");
      const { data, body } = parseFrontMatter(text);
      return { ...data, body, file: name };
    });
}

export function loadReviews(projectRoot) {
  const dir = sddPath(projectRoot, "reviews");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const text = readText(path.join(dir, name), "");
      const { data, body } = parseFrontMatter(text);
      return { ...data, body, file: name };
    });
}

export function latestHandoff(projectRoot) {
  const dir = sddPath(projectRoot, "handoffs");
  if (!exists(dir)) return null;
  const files = fs.readdirSync(dir).filter((name) => /^HANDOFF-\d+\.md$/.test(name)).sort();
  if (!files.length) return null;
  const text = readText(path.join(dir, files[files.length - 1]), "");
  return { ...parseFrontMatter(text).data, file: files[files.length - 1] };
}

export function statusSummary(projectRoot) {
  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const tasks = loadTasks(projectRoot);
  const decisions = loadDecisions(projectRoot);
  const reviews = loadReviews(projectRoot);
  const handoff = latestHandoff(projectRoot);
  const counts = {};
  for (const task of tasks) counts[task.status] = (counts[task.status] ?? 0) + 1;
  return {
    project,
    state,
    tasks: {
      total: tasks.length,
      counts,
      active: tasks.filter((t) => t.status === "in_progress" || t.status === "review"),
      blocked: tasks.filter((t) => t.status === "blocked"),
    },
    decisions: {
      open: decisions.filter((d) => d.status === "open"),
      blocking: decisions.filter((d) => d.status === "open" && d.blocking),
    },
    reviews: {
      total: reviews.length,
      failed: reviews.filter((r) => r.verdict !== "pass" && r.verdict !== "converged" && r.verdict !== "clean"),
    },
    handoff,
  };
}

export function validateState(projectRoot) {
  const errors = [];
  const warnings = [];
  const required = ["project.json", "state.json", "config.yml", "brief.md", "manifest.json"];
  for (const file of required) {
    if (!exists(sddPath(projectRoot, file))) errors.push(`缺少 .sdd/${file}`);
  }
  const project = loadProject(projectRoot);
  if (project && project.schema_version !== SCHEMA_VERSION) {
    errors.push(`project.json schema_version 应为 ${SCHEMA_VERSION}`);
  }
  const state = loadState(projectRoot);
  if (state) {
    if (state.schema_version !== SCHEMA_VERSION) errors.push(`state.json schema_version 应为 ${SCHEMA_VERSION}`);
    if (!PHASES.includes(state.phase)) errors.push(`state.phase 非法：${state.phase}`);
    if (!state.gate || !GATES.includes(state.gate.name)) errors.push("state.gate.name 非法");
  }
  const tasks = loadTasks(projectRoot);
  for (const task of tasks) {
    if (!/^TASK-\d+$/.test(task.id ?? "")) errors.push(`任务 ID 非法：${task.id}`);
    if (!TASK_STATUSES.includes(task.status)) errors.push(`${task.id} 状态非法：${task.status}`);
    if (!task.write_scope?.length) warnings.push(`${task.id} 缺少 write_scope`);
    if (!task.acceptance?.length) warnings.push(`${task.id} 缺少 acceptance`);
    if (!task.verify?.length) warnings.push(`${task.id} 缺少 verify`);
    for (const evId of task.evidence ?? []) {
      const evPath = sddPath(projectRoot, "evidence", task.id, `${evId}.json`);
      if (!exists(evPath)) errors.push(`${task.id} 引用了不存在的证据 ${evId}`);
    }
    if (task.review) {
      const reviewPath = sddPath(projectRoot, "reviews", `${task.review}.md`);
      if (!exists(reviewPath)) errors.push(`${task.id} 引用了不存在的评审 ${task.review}`);
    }
  }
  const decisions = loadDecisions(projectRoot);
  for (const d of decisions) {
    if (!d.id) errors.push("存在缺少 id 的决策文件");
    if (d.status === "open" && d.blocking && d.gate && state && state.phase !== "blocked") {
      warnings.push(`阻塞决策 ${d.id} 仍处于 open，当前阶段可能应设为 blocked`);
    }
  }
  const reviews = loadReviews(projectRoot);
  for (const r of reviews) {
    if (!r.id) errors.push("存在缺少 id 的评审文件");
    if (r.independent === false) warnings.push(`${r.id} 标记为非独立评审`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
