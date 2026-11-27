import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  exists,
  gitDiffNames,
  gitHead,
  matchesScope,
  nextId,
  nowIso,
  readJson,
  readText,
  safeTaskId,
  validateCommitish,
  writeJson,
} from "./util.mjs";
import { SCHEMA_VERSION } from "./version.mjs";
import { TASK_STATUSES, loadState, saveState, sddPath } from "./state.mjs";
import { loadEvidence, validateEvidence } from "./evidence.mjs";
import { latestReview, loadReview, reviewPasses } from "./review.mjs";
import { appendEvent } from "./metrics.mjs";

export const RISKS = ["low", "medium", "high"];

export function taskDir(projectRoot) {
  return sddPath(projectRoot, "tasks");
}

export function taskPath(projectRoot, id) {
  safeTaskId(id);
  return path.join(taskDir(projectRoot), `${id}.json`);
}

export function listTasks(projectRoot) {
  const dir = taskDir(projectRoot);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^TASK-\d+\.json$/.test(name))
    .sort()
    .map((name) => readJson(path.join(dir, name), null))
    .filter(Boolean);
}

export function loadTask(projectRoot, id) {
  return readJson(taskPath(projectRoot, id), null);
}

export function saveTask(projectRoot, task) {
  safeTaskId(task.id);
  task.updated_at = nowIso();
  writeJson(taskPath(projectRoot, task.id), task);
  return task;
}

export function newTask(projectRoot, opts = {}) {
  ensureDir(taskDir(projectRoot));
  const id = opts.id ?? nextId(taskDir(projectRoot), "TASK");
  safeTaskId(id);
  if (exists(taskPath(projectRoot, id))) throw new Error(`任务已存在：${id}`);
  if (opts.risk !== undefined && !RISKS.includes(opts.risk)) throw new Error(`未知风险等级：${opts.risk}`);
  const risk = opts.risk ?? "medium";
  const now = nowIso();
  const task = {
    schema_version: SCHEMA_VERSION,
    id,
    speckit_id: opts.speckit_id ?? null,
    feature: opts.feature ?? null,
    title: opts.title ?? "未命名任务",
    phase: opts.phase ?? null,
    story: opts.story ?? null,
    parallel: Boolean(opts.parallel),
    risk,
    max_risk: risk,
    owner: opts.owner ?? null,
    status: "planned",
    write_scope: opts.write_scope ?? [],
    acceptance: opts.acceptance ?? [],
    verify: opts.verify ?? [],
    depends_on: opts.depends_on ?? [],
    baseline_commit: null,
    end_commit: null,
    evidence: [],
    review: null,
    speckit_done: Boolean(opts.speckit_done),
    notes: [],
    created_at: now,
    updated_at: now,
  };
  saveTask(projectRoot, task);
  return task;
}

export function resolveFeatureDir(projectRoot) {
  const featureJson = readJson(path.join(projectRoot, ".specify", "feature.json"), null);
  if (featureJson) {
    const value = featureJson.feature_directory ?? featureJson.feature_dir ?? featureJson.directory;
    if (value) {
      const resolved = path.isAbsolute(value) ? value : path.join(projectRoot, value);
      if (exists(resolved)) return resolved;
    }
  }
  const specs = path.join(projectRoot, "specs");
  if (!exists(specs)) return null;
  const dirs = fs.readdirSync(specs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(specs, e.name))
    .filter((dir) => exists(path.join(dir, "tasks.md")))
    .sort();
  return dirs.length ? dirs[dirs.length - 1] : null;
}

export function parseTasksMarkdown(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const tasks = [];
  let phase = null;
  let story = null;
  for (const line of lines) {
    const phaseMatch = line.match(/^#{2,3}\s+(Phase\s+.+?)\s*$/i);
    if (phaseMatch) {
      phase = phaseMatch[1].trim();
      const usMatch = phase.match(/User Story\s+(\d+)/i);
      story = usMatch ? `US${usMatch[1]}` : null;
      continue;
    }
    const taskMatch = line.match(/^- \[([ xX])\]\s+(T\d+)\s*(?:\[P\])?\s*(?:\[(US\d+)\])?\s+(.+)$/);
    if (!taskMatch) continue;
    const [, mark, id, us, title] = taskMatch;
    tasks.push({
      speckit_id: id,
      title: title.trim(),
      phase,
      story: us ?? story,
      parallel: /\[P\]/.test(line),
      done: mark.toLowerCase() === "x",
    });
  }
  return tasks;
}

export function syncTasks(projectRoot, { featureDir = null } = {}) {
  const dir = featureDir ?? resolveFeatureDir(projectRoot);
  if (!dir) throw new Error("找不到 feature 目录；请先运行 /speckit.specify");
  const tasksFile = path.join(dir, "tasks.md");
  if (!exists(tasksFile)) throw new Error(`找不到 tasks.md：${tasksFile}`);
  const parsed = parseTasksMarkdown(readText(tasksFile, ""));
  if (!parsed.length) throw new Error("tasks.md 中没有识别到任务（格式应为 - [ ] T001 ...）");
  const existing = listTasks(projectRoot);
  const bySpeckitId = new Map(existing.filter((t) => t.speckit_id).map((t) => [t.speckit_id, t]));
  const feature = path.basename(dir);
  const created = [];
  const updated = [];
  const warnings = [];
  for (const item of parsed) {
    const found = bySpeckitId.get(item.speckit_id);
    if (found) {
      found.title = item.title;
      found.phase = item.phase;
      found.story = item.story;
      found.parallel = item.parallel;
      found.feature = feature;
      found.speckit_done = item.done;
      if (item.done && found.status !== "done") {
        warnings.push(`${item.speckit_id} 在 tasks.md 已勾选，但 .sdd 状态是 ${found.status}；请用证据/评审关闭，不要只信勾选。`);
      }
      saveTask(projectRoot, found);
      updated.push(found.id);
      bySpeckitId.delete(item.speckit_id);
    } else {
      const task = newTask(projectRoot, {
        speckit_id: item.speckit_id,
        feature,
        title: item.title,
        phase: item.phase,
        story: item.story,
        parallel: item.parallel,
        speckit_done: item.done,
      });
      if (item.done) warnings.push(`${item.speckit_id} 初次同步时已勾选；任务仍需证据才能标记 done。`);
      created.push(task.id);
    }
  }
  for (const leftover of bySpeckitId.values()) {
    warnings.push(`${leftover.speckit_id} 存在于 .sdd 但不在 tasks.md；保留原任务，请人工确认是否删除。`);
  }
  const state = loadState(projectRoot);
  if (state && state.current_feature !== feature) {
    state.current_feature = feature;
    saveState(projectRoot, state);
  }
  return { feature_dir: dir, feature, created, updated, total: parsed.length, warnings };
}

const TRANSITIONS = {
  planned: ["ready", "blocked"],
  ready: ["in_progress", "blocked", "planned"],
  in_progress: ["review", "blocked", "ready"],
  review: ["done", "in_progress", "blocked"],
  done: ["in_progress"],
  blocked: ["planned", "ready", "in_progress"],
};

function resolveCommit(projectRoot, value, label) {
  if (value === null || value === undefined || value === "") return null;
  const resolved = validateCommitish(projectRoot, value);
  if (!resolved) throw new Error(`${label} 不是合法 commit：${value}`);
  return resolved;
}

function passingEvidenceFor(projectRoot, task, evidenceIds) {
  const loaded = evidenceIds.map((id) => loadEvidence(projectRoot, task.id, id)).filter(Boolean);
  return loaded.filter((ev) => validateEvidence(projectRoot, ev, { task }).ok);
}

export function updateTask(projectRoot, id, patch = {}) {
  safeTaskId(id);
  const task = loadTask(projectRoot, id);
  if (!task) throw new Error(`找不到任务：${id}`);
  const nextStatus = patch.status;
  const previousStatus = task.status;
  if (patch.risk !== undefined && !RISKS.includes(patch.risk)) {
    throw new Error(`未知风险等级：${patch.risk}`);
  }
  const incomingEvidence = Array.from(new Set([
    ...(patch.evidence ?? []),
    ...(patch.add_evidence ?? []),
  ]));
  if (patch.baseline_commit !== undefined) {
    task.baseline_commit = resolveCommit(projectRoot, patch.baseline_commit, "baseline_commit");
  }
  if (patch.end_commit !== undefined) {
    task.end_commit = resolveCommit(projectRoot, patch.end_commit, "end_commit");
  }

  if (nextStatus && nextStatus !== task.status) {
    if (!TASK_STATUSES.includes(nextStatus)) throw new Error(`未知任务状态：${nextStatus}`);
    const allowed = TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`任务 ${id} 不能从 ${task.status} 直接变为 ${nextStatus}；允许：${allowed.join(", ") || "无"}`);
    }
    if (nextStatus === "in_progress") {
      if (!patch.owner && !task.owner) throw new Error(`${id} 进入 in_progress 前必须有 owner`);
      if (!task.baseline_commit) task.baseline_commit = gitHead(projectRoot);
      if (!task.baseline_commit) throw new Error(`${id} 进入 in_progress 前必须有 baseline_commit（项目需要至少一次 git commit）`);
      if (!task.write_scope?.length) throw new Error(`${id} 进入 in_progress 前必须有 write_scope`);
    }
    if (nextStatus === "review") {
      if (!(incomingEvidence.length || task.evidence?.length)) throw new Error(`${id} 进入 review 前必须有至少一条证据`);
      if (!task.end_commit) task.end_commit = gitHead(projectRoot);
      if (!task.end_commit) throw new Error(`${id} 进入 review 前必须有 end_commit`);
    }
    if (nextStatus === "done") {
      if (!task.end_commit) task.end_commit = gitHead(projectRoot);
      if (!task.end_commit) throw new Error(`${id} 标记 done 前必须有 end_commit`);
      const evidenceIds = Array.from(new Set([...(task.evidence ?? []), ...incomingEvidence]));
      if (!evidenceIds.length) throw new Error(`${id} 标记 done 前必须有至少一条证据`);
      const passing = passingEvidenceFor(projectRoot, task, evidenceIds);
      if (!passing.length) throw new Error(`${id} 没有通过校验的证据（commit/日志/exit/dirty 任一不满足）`);
      const maxRisk = task.max_risk ?? task.risk;
      if (maxRisk === "high") {
        const reviewId = patch.review ?? task.review;
        const review = reviewId ? loadReview(projectRoot, reviewId) : latestReview(projectRoot, { kind: "task", task: id });
        if (!reviewPasses(review, { task })) {
          throw new Error(`${id} 是高风险任务，done 前必须有独立且绑定 commit/证据的 task review`);
        }
      }
    }
  }

  for (const key of [
    "owner", "title", "feature", "phase", "story", "parallel", "risk",
    "write_scope", "acceptance", "verify", "depends_on", "status", "notes",
  ]) {
    if (patch[key] !== undefined) task[key] = patch[key];
  }
  if (patch.risk !== undefined) {
    task.max_risk = RISKS[Math.max(RISKS.indexOf(task.max_risk ?? "low"), RISKS.indexOf(patch.risk))];
  }
  if (incomingEvidence.length) {
    task.evidence = Array.from(new Set([...(task.evidence ?? []), ...incomingEvidence]));
  }
  if (patch.review !== undefined) task.review = patch.review;

  const saved = saveTask(projectRoot, task);
  if (nextStatus && nextStatus !== previousStatus) {
    if (nextStatus === "in_progress") {
      appendEvent(projectRoot, "task_started", { task: id });
    } else if (nextStatus === "done") {
      appendEvent(projectRoot, "task_done", { task: id });
    } else if (previousStatus === "review" && nextStatus === "in_progress") {
      appendEvent(projectRoot, "task_rework", { task: id });
    }
  }
  return saved;
}

export function taskScopeViolations(projectRoot, id, { base = null, head = null } = {}) {
  const task = loadTask(projectRoot, id);
  if (!task) throw new Error(`找不到任务：${id}`);
  const from = base ?? task.baseline_commit;
  const to = head ?? task.end_commit ?? gitHead(projectRoot);
  if (!from || !to) return { checked: false, violations: [], files: [], reason: "缺少 baseline/end commit" };
  try {
    // .sdd/ 是团队账本，不属于任务源码 scope。
    const files = gitDiffNames(from, to, projectRoot).filter((file) => !file.startsWith(".sdd/"));
    const violations = files.filter((file) => !matchesScope(file, task.write_scope));
    return { checked: true, base: from, head: to, files, violations };
  } catch (error) {
    return { checked: false, violations: [], files: [], reason: error.message };
  }
}
