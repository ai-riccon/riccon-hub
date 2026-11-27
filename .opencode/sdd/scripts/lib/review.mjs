import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  exists,
  nextId,
  nowIso,
  parseFrontMatter,
  readText,
  safeReviewId,
  safeTaskId,
  stringifyFrontMatter,
  writeText,
} from "./util.mjs";
import { sddPath } from "./state.mjs";

export const REVIEW_KINDS = ["task", "analyze", "converge", "final", "milestone"];
export const REVIEW_VERDICTS = ["pass", "fail", "clean", "converged"];
export const FINDING_STATUSES = ["open", "fixed", "accepted", "closed"];

export function normalizeSeverity(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (["p0", "critical", "blocker"].includes(key)) return "P0";
  if (["p1", "high"].includes(key)) return "P1";
  if (["p2", "medium"].includes(key)) return "P2";
  if (["p3", "low"].includes(key)) return "P3";
  return null;
}

export function reviewDir(projectRoot) {
  return sddPath(projectRoot, "reviews");
}

export function reviewPath(projectRoot, id) {
  safeReviewId(id);
  return path.join(reviewDir(projectRoot), `${id}.md`);
}

export function listReviews(projectRoot, { kind = null } = {}) {
  const dir = reviewDir(projectRoot);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const full = path.join(dir, name);
      const text = readText(full, "");
      const { data, body } = parseFrontMatter(text);
      return { ...data, body, file: name, mtime_ms: fs.statSync(full).mtimeMs };
    })
    .filter((r) => !kind || r.kind === kind);
}

export function loadReview(projectRoot, id) {
  const p = reviewPath(projectRoot, id);
  if (!exists(p)) return null;
  const { data, body } = parseFrontMatter(readText(p, ""));
  return { ...data, body, file: path.basename(p) };
}

function validateFindings(findings) {
  if (!Array.isArray(findings)) throw new Error("findings 必须是数组");
  return findings.map((finding, index) => {
    if (!finding || typeof finding !== "object") throw new Error(`findings[${index}] 不是对象`);
    if (!finding.title) throw new Error(`findings[${index}] 缺少 title`);
    const severity = normalizeSeverity(finding.severity);
    if (!severity) throw new Error(`findings[${index}] severity 非法：${finding.severity}`);
    if (!FINDING_STATUSES.includes(finding.status)) {
      throw new Error(`findings[${index}] status 非法：${finding.status}`);
    }
    return { ...finding, severity };
  });
}

export function writeReview(projectRoot, opts = {}) {
  ensureDir(reviewDir(projectRoot));
  const kind = opts.kind ?? (opts.task ? "task" : "milestone");
  if (!REVIEW_KINDS.includes(kind)) throw new Error(`未知评审 kind：${kind}`);
  if (opts.task) {
    safeTaskId(opts.task);
    if (!exists(path.join(sddPath(projectRoot, "tasks"), `${opts.task}.json`))) {
      throw new Error(`找不到任务：${opts.task}`);
    }
  }
  const verdict = opts.verdict ?? "fail";
  if (!REVIEW_VERDICTS.includes(verdict)) throw new Error(`未知 verdict：${verdict}`);
  const prefix = opts.id
    ? opts.id
    : kind === "task"
      ? `REV-${opts.task}-001`
      : kind === "analyze"
        ? "ANALYZE-001"
        : kind === "converge"
          ? "CONVERGE-001"
          : kind === "final"
            ? "FINAL-001"
            : "REV-MILESTONE-001";
  let id = prefix;
  if (!opts.id) {
    const base = prefix.replace(/-\d+$/, "");
    id = nextId(reviewDir(projectRoot), base, 3);
  }
  safeReviewId(id);
  const findings = validateFindings(opts.findings ?? []);
  const data = {
    schema_version: 1,
    id,
    kind,
    task: opts.task ?? null,
    gate: opts.gate ?? null,
    feature: opts.feature ?? null,
    reviewer: opts.reviewer ?? "sdd/verifier",
    session: opts.session ?? null,
    verdict,
    independent: opts.independent ?? true,
    reviewed_commit: opts.reviewed_commit ?? null,
    reviewed_evidence: opts.reviewed_evidence ?? [],
    findings,
    created_at: nowIso(),
  };
  const body = opts.body ?? `# ${id}\n\n## 结论\n\n${data.verdict}\n\n## 检查项\n\n- [ ] 待补充\n`;
  writeText(reviewPath(projectRoot, id), stringifyFrontMatter(data, body));
  return { ...data, body };
}

export function latestReview(projectRoot, { kind = null, gate = null, task = null } = {}) {
  const reviews = listReviews(projectRoot, { kind }).filter((r) => {
    if (gate && r.gate !== gate) return false;
    if (task && r.task !== task) return false;
    return true;
  });
  if (!reviews.length) return null;
  return reviews.sort((a, b) => {
    const byMtime = (a.mtime_ms ?? 0) - (b.mtime_ms ?? 0);
    if (byMtime !== 0) return byMtime;
    const byTime = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    return byTime !== 0 ? byTime : String(a.id).localeCompare(String(b.id));
  })[reviews.length - 1];
}

export function findingsBySeverity(review) {
  const out = { P0: [], P1: [], P2: [], P3: [], INVALID: [] };
  for (const finding of review?.findings ?? []) {
    const severity = normalizeSeverity(finding.severity);
    if (!severity) out.INVALID.push(finding);
    else out[severity].push(finding);
  }
  return out;
}

export function reviewPasses(review, { task = null } = {}) {
  if (!review) return false;
  if (!REVIEW_KINDS.includes(review.kind)) return false;
  if (!["pass", "converged", "clean"].includes(review.verdict)) return false;
  if (review.independent !== true) return false;
  if (!Array.isArray(review.findings)) return false;
  if (review.kind !== "analyze") {
    if (!review.reviewed_commit) return false;
    if (!Array.isArray(review.reviewed_evidence) || review.reviewed_evidence.length === 0) return false;
    if (task?.end_commit && review.reviewed_commit !== task.end_commit) return false;
  }
  const findings = findingsBySeverity(review);
  if (findings.INVALID.length) return false;
  const validStatus = (finding) => FINDING_STATUSES.includes(finding.status);
  if (![...findings.P0, ...findings.P1, ...findings.P2, ...findings.P3].every(validStatus)) return false;
  const criticalOk = [...findings.P0, ...findings.P1].every(
    (finding) => finding.status === "fixed" || finding.status === "closed",
  );
  const minorOk = [...findings.P2, ...findings.P3].every(
    (finding) => finding.status === "fixed"
      || finding.status === "closed"
      || (finding.status === "accepted" && finding.owner && finding.due && finding.accepted_reason),
  );
  return criticalOk && minorOk;
}
