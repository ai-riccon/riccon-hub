import fs from "node:fs";
import path from "node:path";
import { ensureDir, exists, nowIso, readJson, readText } from "./util.mjs";
import { sddPath } from "./state.mjs";
import { listTasks } from "./task.mjs";

export function metricsPath(projectRoot) {
  return sddPath(projectRoot, "metrics", "events.jsonl");
}

export function appendEvent(projectRoot, type, data = {}) {
  const p = metricsPath(projectRoot);
  ensureDir(path.dirname(p));
  const line = JSON.stringify({ at: nowIso(), type, data });
  fs.appendFileSync(p, `${line}\n`, "utf8");
}

export function readEvents(projectRoot) {
  const p = metricsPath(projectRoot);
  if (!exists(p)) return [];
  return readText(p, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

export function allEvidence(projectRoot) {
  const root = sddPath(projectRoot, "evidence");
  if (!exists(root)) return [];
  const out = [];
  for (const taskDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!taskDir.isDirectory() || !/^TASK-\d+$/.test(taskDir.name)) continue;
    const dir = path.join(root, taskDir.name);
    for (const name of fs.readdirSync(dir)) {
      if (!/^EV-\d+\.json$/.test(name)) continue;
      const ev = readJson(path.join(dir, name), null);
      if (ev) out.push(ev);
    }
  }
  return out;
}

export function computeMetrics(projectRoot) {
  const tasks = listTasks(projectRoot);
  const evidence = allEvidence(projectRoot);
  const events = readEvents(projectRoot);
  const counts = {};
  for (const task of tasks) counts[task.status] = (counts[task.status] ?? 0) + 1;
  const gateFailures = events.filter((e) => e.type === "gate_failed").length;
  const dispatches = events.filter((e) => e.type === "task_started").length;
  const reworks = events.filter((e) => e.type === "task_rework").length;
  const evidenceFailures = evidence.filter((e) => e.exit_code !== 0).length;
  const cycleTimes = [];
  const starts = new Map();
  for (const event of events) {
    if (event.type === "task_started" && event.data?.task) starts.set(event.data.task, event.at);
    if (event.type === "task_done" && event.data?.task && starts.has(event.data.task)) {
      const start = new Date(starts.get(event.data.task)).getTime();
      const end = new Date(event.at).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        cycleTimes.push(end - start);
      }
    }
  }
  const avgCycleMs = cycleTimes.length
    ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
    : null;
  return {
    tasks_total: tasks.length,
    tasks_by_status: counts,
    tasks_done: counts.done ?? 0,
    evidence_total: evidence.length,
    evidence_failures: evidenceFailures,
    gate_failures: gateFailures,
    dispatches,
    reworks,
    avg_cycle_ms: avgCycleMs,
    events_total: events.length,
  };
}
