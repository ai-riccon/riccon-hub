import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const TZ = "Asia/Shanghai";

export function nowIso() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  return `${parts.replace(" ", "T")}+08:00`;
}

export function timestampForFile() {
  return nowIso().replace(/[:+]/g, "").replace("T", "-");
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(p) {
  return fs.existsSync(p);
}

export function readText(p, fallback = undefined) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeText(p, text) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, text, "utf8");
}

export function readJson(p, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeJson(p, value) {
  writeText(p, `${JSON.stringify(value, null, 2)}\n`);
}

export function readYaml(p, fallback = undefined) {
  try {
    return parseYaml(fs.readFileSync(p, "utf8")) ?? fallback;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeYaml(p, value) {
  writeText(p, stringifyYaml(value, { lineWidth: 0 }));
}

export function parseFrontMatter(text) {
  const normalized = String(text).replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: normalized };
  const yamlText = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n/, "");
  let data = {};
  try {
    data = parseYaml(yamlText) ?? {};
  } catch {
    data = {};
  }
  return { data, body };
}

export function stringifyFrontMatter(data, body) {
  const yamlText = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlText}\n---\n\n${String(body).replace(/^\n+/, "")}`;
}

export function hashFile(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

export function hashText(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

export function listFilesRecursive(root, { ignore = [] } = {}) {
  const out = [];
  if (!exists(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = toPosix(path.relative(root, full));
      if (ignore.some((pattern) => rel === pattern || rel.startsWith(`${pattern}/`))) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort();
}

export function copyDir(src, dest, { ignore = [] } = {}) {
  if (!exists(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    const rel = toPosix(path.relative(src, from));
    if (ignore.some((pattern) => rel === pattern || rel.startsWith(`${pattern}/`))) continue;
    if (entry.isDirectory()) copyDir(from, to, { ignore });
    else if (entry.isFile()) {
      ensureDir(path.dirname(to));
      fs.copyFileSync(from, to);
    }
  }
}

export function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

export function toPosix(p) {
  return String(p).replace(/\\/g, "/");
}

export const ID_PATTERNS = {
  task: /^TASK-\d{4,}$/,
  evidence: /^EV-\d{4,}$/,
  decision: /^DEC-\d{4,}$/,
  review: /^(REV-[A-Z0-9-]+|ANALYZE-\d+|CONVERGE-\d+|FINAL-\d+)$/,
  handoff: /^HANDOFF-\d{4,}$/,
};

export function assertSafeId(value, pattern, label = "ID") {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} 非法：${String(value)}`);
  }
  return value;
}

export function safeTaskId(value) {
  return assertSafeId(value, ID_PATTERNS.task, "任务 ID");
}

export function safeEvidenceId(value) {
  return assertSafeId(value, ID_PATTERNS.evidence, "证据 ID");
}

export function safeDecisionId(value) {
  return assertSafeId(value, ID_PATTERNS.decision, "决策 ID");
}

export function safeReviewId(value) {
  return assertSafeId(value, ID_PATTERNS.review, "评审 ID");
}

export function safeHandoffId(value) {
  return assertSafeId(value, ID_PATTERNS.handoff, "handoff ID");
}

export function assertInside(base, target, label = "路径") {
  const baseResolved = path.resolve(base);
  const targetResolved = path.resolve(target);
  const rel = path.relative(baseResolved, targetResolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`${label} 越界：${targetResolved}`);
  }
  return targetResolved;
}

export function assertInsideOrEqual(base, target, label = "路径") {
  const baseResolved = path.resolve(base);
  const targetResolved = path.resolve(target);
  const rel = path.relative(baseResolved, targetResolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`${label} 越界：${targetResolved}`);
  }
  return targetResolved;
}

export function isInside(base, target) {
  try {
    assertInside(base, target);
    return true;
  } catch {
    return false;
  }
}

export function validateCommitish(cwd, value) {
  if (typeof value !== "string" || !value || value.startsWith("-")) return null;
  const r = git(["rev-parse", "--verify", "--quiet", `${value}^{commit}`], cwd);
  return r.code === 0 && r.stdout ? r.stdout : null;
}

export function relativePosix(from, to) {
  return toPosix(path.relative(from, to));
}

export function globToRegExp(glob) {
  let pattern = toPosix(glob).trim();
  if (pattern.endsWith("/")) pattern += "**";
  let out = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else if ("\\^$+.()|{}[]".includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out);
}

export function matchesScope(file, scopes) {
  const target = toPosix(file).replace(/^\.\//, "");
  for (const raw of scopes ?? []) {
    const scope = toPosix(raw).replace(/^\.\//, "").replace(/\/$/, "");
    if (!scope) continue;
    if (target === scope) return true;
    if (target.startsWith(`${scope}/`)) return true;
    if (globToRegExp(scope).test(target)) return true;
  }
  return false;
}

export function formatArgv(argv) {
  return (argv ?? []).map((value) => {
    const s = String(value);
    if (s === "") return '""';
    if (/[\s"'\\]/.test(s)) return JSON.stringify(s);
    return s;
  }).join(" ");
}

function resolveWindowsProgram(program) {
  const raw = String(program);
  if (/\.exe$/i.test(raw)) return { program: raw, wrapper: false };
  if (/\.(cmd|bat)$/i.test(raw)) return { program: raw, wrapper: true };
  if (path.isAbsolute(raw) || raw.includes("/") || raw.includes("\\")) {
    return { program: raw, wrapper: true };
  }
  const result = spawnSync("where.exe", [raw], { encoding: "utf8", windowsHide: true });
  const candidates = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const exe = candidates.find((candidate) => /\.exe$/i.test(candidate));
  if (exe) return { program: exe, wrapper: false };
  const cmd = candidates.find((candidate) => /\.(cmd|bat)$/i.test(candidate));
  if (cmd) return { program: cmd, wrapper: true };
  return { program: raw, wrapper: true };
}

function spawnPowerShellWrapper(program, args, { cwd }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-argv-"));
  const jsonPath = path.join(dir, "args.json");
  const scriptPath = path.join(dir, "run.ps1");
  fs.writeFileSync(jsonPath, JSON.stringify({ program, args }), "utf8");
  fs.writeFileSync(scriptPath, `$ErrorActionPreference = 'Stop'
$payload = Get-Content -Raw -LiteralPath $args[0] | ConvertFrom-Json
$program = [string]$payload.program
$argv = @($payload.args)
& $program @argv
if ($null -eq $LASTEXITCODE) { exit 1 } else { exit $LASTEXITCODE }
`, "utf8");
  let child;
  try {
    child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      jsonPath,
    ], {
      cwd,
      windowsHide: true,
      env: process.env,
    });
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    child,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try { child.kill("SIGKILL"); } catch { /* ignore */ }
  }
}

function runProcessInternal({ command, program, args, cwd, timeoutMs, maxBytes }) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let child;
    let cleanup = null;
    let timer;
    let fallbackTimer;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try { cleanup?.(); } catch { /* ignore */ }
      resolve(payload);
    };

    const result = (code, signal) => ({
      exitCode: code ?? (signal ? 1 : 0),
      signal: signal ?? null,
      stdout,
      stderr,
      durationMs: Date.now() - start,
      startedAt,
      finishedAt: nowIso(),
      bytes,
      truncated,
      timedOut,
    });

    try {
      if (program) {
        if (process.platform === "win32") {
          const resolved = resolveWindowsProgram(program);
          if (resolved.wrapper) {
            const wrapped = spawnPowerShellWrapper(resolved.program, args, { cwd });
            child = wrapped.child;
            cleanup = wrapped.cleanup;
          } else {
            child = spawn(resolved.program, args, {
              cwd,
              windowsHide: true,
              env: process.env,
            });
          }
        } else {
          child = spawn(program, args, {
            cwd,
            windowsHide: true,
            env: process.env,
            detached: true,
          });
        }
      } else {
        child = spawn(command, {
          cwd,
          shell: true,
          windowsHide: true,
          env: process.env,
          detached: process.platform !== "win32",
        });
      }
    } catch (err) {
      stderr += String(err);
      finish(result(1, null));
      return;
    }

    const append = (chunk, target) => {
      const text = chunk.toString("utf8");
      bytes += Buffer.byteLength(text);
      if (bytes > maxBytes) {
        truncated = true;
        return;
      }
      if (target === "out") stdout += text;
      else stderr += text;
    };
    child.stdout?.on("data", (chunk) => append(chunk, "out"));
    child.stderr?.on("data", (chunk) => append(chunk, "err"));

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
        // 某些平台孙进程持有管道时 close 不会触发；兜底返回。
        fallbackTimer = setTimeout(() => finish(result(1, "TIMEOUT")), 3000);
      }, timeoutMs);
    }

    child.on("close", (code, signal) => finish(result(code, signal)));
    child.on("error", (err) => {
      stderr += String(err);
      finish(result(1, null));
    });
  });
}

export function runProcess(command, { cwd = process.cwd(), timeoutMs = 0, maxBytes = 2 * 1024 * 1024 } = {}) {
  return runProcessInternal({ command, cwd, timeoutMs, maxBytes });
}

export function runProcessArgv(program, args, { cwd = process.cwd(), timeoutMs = 0, maxBytes = 2 * 1024 * 1024 } = {}) {
  return runProcessInternal({ program, args, cwd, timeoutMs, maxBytes });
}

export function git(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

export function gitHead(cwd = process.cwd()) {
  const r = git(["rev-parse", "HEAD"], cwd);
  return r.code === 0 ? r.stdout : null;
}

export function gitIsClean(cwd = process.cwd()) {
  const r = git(["status", "--porcelain"], cwd);
  if (r.code !== 0) return false;
  // .sdd/ 是团队账本（证据/指标/状态）；它变化不代表源码未提交。
  const lines = r.stdout.split(/\r?\n/).filter(Boolean).filter((line) => {
    let file = line.slice(2).trim().replace(/^"|"$/g, "");
    if (file.includes(" -> ")) file = file.split(" -> ").pop().trim();
    return !file.startsWith(".sdd/");
  });
  return lines.length === 0;
}

export function gitDiffNames(base, head, cwd = process.cwd()) {
  const baseCommit = validateCommitish(cwd, base);
  const headCommit = validateCommitish(cwd, head);
  if (!baseCommit || !headCommit) {
    throw new Error(`非法 commit：${base}..${head}`);
  }
  const r = git(["diff", "--name-only", baseCommit, headCommit, "--"], cwd);
  if (r.code !== 0) throw new Error(`git diff 失败：${r.stderr || r.stdout}`);
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(toPosix);
}

export function readIds(dir, prefix) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .map((name) => name.match(new RegExp(`^${prefix}-(\\d+)\\.`))?.[1])
    .filter(Boolean)
    .map((n) => Number(n))
    .sort((a, b) => a - b);
}

export function nextId(dir, prefix, pad = 4) {
  const ids = readIds(dir, prefix);
  const next = ids.length ? ids[ids.length - 1] + 1 : 1;
  return `${prefix}-${String(next).padStart(pad, "0")}`;
}

export function uniqueId(prefix, pad = 4) {
  return `${prefix}-${String(Date.now()).slice(-pad)}`;
}

export function relativeFirstRead(projectRoot, relPaths) {
  return relPaths.map((p) => toPosix(p));
}

export function truncate(text, max = 2000) {
  const s = String(text ?? "");
  return s.length <= max ? s : `${s.slice(0, max)}\n...[truncated]`;
}

export function printTable(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)));
  const line = (cells) => cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ");
  const out = [line(headers), widths.map((w) => "-".repeat(w)).join("  ")];
  for (const row of rows) out.push(line(row));
  return out.join("\n");
}
