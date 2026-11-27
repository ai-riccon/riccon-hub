import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  exists,
  nextId,
  nowIso,
  parseFrontMatter,
  readText,
  safeDecisionId,
  stringifyFrontMatter,
  writeText,
} from "./util.mjs";
import { GATES, setApproval, sddPath } from "./state.mjs";

export function decisionDir(projectRoot) {
  return sddPath(projectRoot, "decisions");
}

export function decisionPath(projectRoot, id) {
  safeDecisionId(id);
  return path.join(decisionDir(projectRoot), `${id}.md`);
}

export function listDecisions(projectRoot) {
  const dir = decisionDir(projectRoot);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^DEC-\d+\.md$/.test(name))
    .sort()
    .map((name) => {
      const full = path.join(dir, name);
      const text = readText(full, "");
      const { data, body } = parseFrontMatter(text);
      return { ...data, body, file: name, mtime_ms: fs.statSync(full).mtimeMs };
    });
}

export function loadDecision(projectRoot, id) {
  const p = decisionPath(projectRoot, id);
  if (!exists(p)) return null;
  const { data, body } = parseFrontMatter(readText(p, ""));
  return { ...data, body, file: path.basename(p) };
}

function assertGate(gate) {
  if (gate !== null && gate !== undefined && !GATES.includes(gate)) {
    throw new Error(`未知门禁：${gate}；可用：${GATES.join(", ")}`);
  }
}

export function newDecision(projectRoot, opts = {}) {
  ensureDir(decisionDir(projectRoot));
  assertGate(opts.gate ?? null);
  const id = opts.id ?? nextId(decisionDir(projectRoot), "DEC");
  safeDecisionId(id);
  const data = {
    schema_version: 1,
    id,
    status: "open",
    owner: opts.owner ?? "user",
    blocking: opts.blocking ?? true,
    gate: opts.gate ?? null,
    question: opts.question ?? "未命名决策",
    options: opts.options ?? [],
    recommendation: opts.recommendation ?? "",
    default: opts.default ?? "",
    deadline: opts.deadline ?? "",
    answer: null,
    answer_kind: null,
    answered_at: null,
    created_at: nowIso(),
  };
  const body = `# ${id} — ${data.question}

## 为什么现在要定

${opts.context ?? "（待补充）"}

## 选项与后果

${(data.options.length ? data.options : ["（待补充）"]).map((o, i) => `${i + 1}. ${o}`).join("\n")}

## 推荐

${data.recommendation || "（待补充）"}

## 用户沉默时的默认值

${data.default || "（无默认值，必须明确回答）"}

## 截止

${data.deadline || "（未设置）"}
`;
  writeText(decisionPath(projectRoot, id), stringifyFrontMatter(data, body));
  return { ...data, body };
}

export function answerDecision(projectRoot, id, {
  answer,
  kind = "answer",
  owner = "user",
  reopen = false,
} = {}) {
  safeDecisionId(id);
  const decision = loadDecision(projectRoot, id);
  if (!decision) throw new Error(`找不到决策：${id}`);
  if (!answer) throw new Error("缺少 --answer");
  if (!["answer", "approve", "reject", "accept", "conditional"].includes(kind)) {
    throw new Error(`未知 answer kind：${kind}`);
  }
  assertGate(decision.gate ?? null);
  if (decision.status !== "open" && !reopen) {
    throw new Error(`决策 ${id} 已经是 ${decision.status}；需要重开请显式使用 --reopen`);
  }
  const data = {
    ...decision,
    status: "answered",
    answer,
    answer_kind: kind,
    answered_at: nowIso(),
    owner,
  };
  delete data.body;
  delete data.file;
  writeText(decisionPath(projectRoot, id), stringifyFrontMatter(data, decision.body ?? ""));
  if (decision.gate) {
    const status = kind === "approve" || kind === "accept" ? "approved" : kind === "reject" ? "rejected" : "pending";
    setApproval(projectRoot, decision.gate, { status, decision_id: id });
  }
  return loadDecision(projectRoot, id);
}

export function latestGateDecision(projectRoot, gate) {
  assertGate(gate);
  const answers = listDecisions(projectRoot)
    .filter((d) => d.gate === gate && d.status === "answered")
    .sort((a, b) => {
      const byTime = String(a.answered_at ?? a.created_at ?? "").localeCompare(String(b.answered_at ?? b.created_at ?? ""));
      if (byTime !== 0) return byTime;
      const byMtime = (a.mtime_ms ?? 0) - (b.mtime_ms ?? 0);
      return byMtime !== 0 ? byMtime : String(a.id).localeCompare(String(b.id));
    });
  return answers.length ? answers[answers.length - 1] : null;
}

export function gateApproved(projectRoot, gate) {
  const decision = latestGateDecision(projectRoot, gate);
  return Boolean(decision && (decision.answer_kind === "approve" || decision.answer_kind === "accept"));
}

export function openBlockingDecisions(projectRoot) {
  return listDecisions(projectRoot).filter((d) => d.status === "open" && d.blocking);
}
