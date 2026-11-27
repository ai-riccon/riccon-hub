import fs from "node:fs";
import path from "node:path";
import {
  assertInside,
  assertInsideOrEqual,
  ensureDir,
  exists,
  formatArgv,
  gitHead,
  gitIsClean,
  nextId,
  nowIso,
  readJson,
  runProcess,
  runProcessArgv,
  safeEvidenceId,
  safeTaskId,
  writeJson,
  writeText,
} from "./util.mjs";
import { SCHEMA_VERSION } from "./version.mjs";
import { sddPath } from "./state.mjs";
import { appendEvent } from "./metrics.mjs";
import { loadConfig } from "./config.mjs";

export function evidenceDir(projectRoot, taskId) {
  safeTaskId(taskId);
  return sddPath(projectRoot, "evidence", taskId);
}

export function evidencePath(projectRoot, taskId, evidenceId) {
  safeEvidenceId(evidenceId);
  return path.join(evidenceDir(projectRoot, taskId), `${evidenceId}.json`);
}

export function logPath(projectRoot, taskId, evidenceId) {
  safeEvidenceId(evidenceId);
  return path.join(evidenceDir(projectRoot, taskId), `${evidenceId}.log`);
}

export function nextEvidenceId(projectRoot, taskId) {
  return nextId(evidenceDir(projectRoot, taskId), "EV");
}

export function listEvidence(projectRoot, taskId = null) {
  const root = sddPath(projectRoot, "evidence");
  if (!exists(root)) return [];
  if (taskId) safeTaskId(taskId);
  const taskDirs = taskId
    ? [path.join(root, taskId)]
    : fs.readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^TASK-\d+$/.test(e.name))
        .map((e) => path.join(root, e.name));
  const out = [];
  for (const dir of taskDirs) {
    if (!exists(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/^EV-\d+\.json$/.test(name)) continue;
      out.push(readJson(path.join(dir, name), null));
    }
  }
  return out.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}

export function loadEvidence(projectRoot, taskId, evidenceId) {
  return readJson(evidencePath(projectRoot, taskId, evidenceId), null);
}

export async function runEvidence(projectRoot, {
  taskId,
  agent,
  command,
  argv = null,
  cwd = projectRoot,
  gate = null,
  allowDirty = false,
  timeoutMs = 0,
} = {}) {
  if (!taskId) throw new Error("缺少 --task");
  safeTaskId(taskId);
  if (!agent) throw new Error("缺少 --agent");
  if (!command && !(argv?.length)) throw new Error("缺少要执行的命令（放在 -- 之后）");
  const project = path.resolve(projectRoot);
  const resolvedCwd = path.resolve(cwd);
  assertInsideOrEqual(project, resolvedCwd, "证据 cwd");
  const { loadTask } = await import("./task.mjs");
  const task = loadTask(projectRoot, taskId);
  if (!task) throw new Error(`找不到任务：${taskId}`);
  const allowed = gate === "final"
    ? ["in_progress", "review", "done"]
    : ["in_progress", "review"];
  if (!allowed.includes(task.status)) {
    throw new Error(`任务 ${taskId} 当前是 ${task.status}；该状态不能取证`);
  }
  const config = loadConfig(projectRoot);
  const commit = gitHead(projectRoot);
  if (!commit) throw new Error("仓库没有 HEAD；先提交再取证。");
  const dirty = !gitIsClean(projectRoot);
  if (!allowDirty && dirty) {
    const { git } = await import("./util.mjs");
    const status = git(["status", "--porcelain"], projectRoot);
    throw new Error(`工作树不干净；先提交（或在明确接受风险时使用 --allow-dirty）。\n${status.stdout}`);
  }
  const displayCommand = argv?.length ? formatArgv(argv) : command;
  const result = argv?.length
    ? await runProcessArgv(argv[0], argv.slice(1), {
        cwd: resolvedCwd,
        timeoutMs,
        maxBytes: config.evidence.max_log_bytes ?? 2097152,
      })
    : await runProcess(command, {
        cwd: resolvedCwd,
        timeoutMs,
        maxBytes: config.evidence.max_log_bytes ?? 2097152,
      });
  ensureDir(evidenceDir(projectRoot, taskId));
  const evidenceId = nextEvidenceId(projectRoot, taskId);
  const relativeLog = path.relative(projectRoot, logPath(projectRoot, taskId, evidenceId));
  const logText = [
    `# task: ${taskId}`,
    `# agent: ${agent}`,
    `# command: ${displayCommand}`,
    `# cwd: ${resolvedCwd}`,
    `# exit_code: ${result.exitCode}`,
    `# timed_out: ${result.timedOut}`,
    `# started_at: ${result.startedAt}`,
    `# finished_at: ${result.finishedAt}`,
    `# duration_ms: ${result.durationMs}`,
    `# commit: ${commit ?? "-"}`,
    `# dirty: ${dirty}`,
    `# truncated: ${result.truncated}`,
    "",
    "## STDOUT",
    result.stdout,
    "",
    "## STDERR",
    result.stderr,
    "",
  ].join("\n");
  writeText(logPath(projectRoot, taskId, evidenceId), logText);
  const evidence = {
    schema_version: SCHEMA_VERSION,
    id: evidenceId,
    task: taskId,
    agent,
    command: displayCommand,
    cwd: resolvedCwd,
    exit_code: result.exitCode,
    signal: result.signal,
    timed_out: result.timedOut,
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    duration_ms: result.durationMs,
    commit,
    dirty,
    gate,
    log_path: relativeLog.replace(/\\/g, "/"),
    log_bytes: Buffer.byteLength(logText),
    truncated: result.truncated,
    manual: false,
    created_at: nowIso(),
  };
  writeJson(evidencePath(projectRoot, taskId, evidenceId), evidence);
  appendEvent(projectRoot, "evidence_run", {
    task: taskId,
    evidence: evidenceId,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
  });
  return evidence;
}

export function validateEvidence(projectRoot, evidence, { task = null, requireCommit = true } = {}) {
  const errors = [];
  if (!evidence) return { ok: false, errors: ["证据不存在"] };
  try {
    safeEvidenceId(evidence.id);
    safeTaskId(evidence.task);
  } catch (error) {
    errors.push(error.message);
  }
  if (task && evidence.task !== task.id) errors.push(`证据属于 ${evidence.task}，不是 ${task.id}`);
  if (evidence.manual) errors.push("manual 证据不能用于 done/final");
  if (evidence.exit_code !== 0) errors.push(`exit code 是 ${evidence.exit_code}`);
  if (evidence.dirty) errors.push("dirty 证据不能用于 done/final");
  if (!evidence.agent) errors.push("证据缺少 agent");
  if (!evidence.command) errors.push("证据缺少 command");
  if (requireCommit) {
    const expected = task
      ? (evidence.gate === "final" ? gitHead(projectRoot) : task.end_commit)
      : gitHead(projectRoot);
    if (!evidence.commit) {
      errors.push("证据缺少 commit");
    } else if (!expected) {
      errors.push(task ? "任务缺少 end_commit，无法绑定证据" : "当前仓库没有 HEAD");
    } else if (evidence.commit !== expected) {
      errors.push(task && evidence.gate !== "final"
        ? `证据 commit ${evidence.commit} 与任务 end_commit ${expected} 不一致`
        : "证据 commit 不是当前 HEAD");
    }
  }
  const taskId = task?.id ?? evidence.task;
  if (!evidence.log_path) {
    errors.push("证据日志路径缺失");
  } else {
    try {
      const log = assertInside(evidenceDir(projectRoot, taskId), path.join(projectRoot, evidence.log_path), "证据日志");
      if (!exists(log)) errors.push("证据日志缺失");
      else if (fs.statSync(log).size === 0) errors.push("证据日志为空");
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { ok: errors.length === 0, errors };
}
