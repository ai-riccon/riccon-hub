import path from "node:path";
import { exists, readJson, readYaml, runProcess } from "./util.mjs";

export function parseVersion(text) {
  const m = String(text ?? "").match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

export function compareVersion(a, b) {
  const av = Array.isArray(a) ? a : parseVersion(a);
  const bv = Array.isArray(b) ? b : parseVersion(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

export function satisfiesRange(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  const parts = String(range ?? "").split(/[\s,]+/).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith(">=")) {
      if (compareVersion(v, parseVersion(part.slice(2))) < 0) return false;
    } else if (part.startsWith("<=")) {
      if (compareVersion(v, parseVersion(part.slice(2))) > 0) return false;
    } else if (part.startsWith(">")) {
      if (compareVersion(v, parseVersion(part.slice(1))) <= 0) return false;
    } else if (part.startsWith("<")) {
      if (compareVersion(v, parseVersion(part.slice(1))) >= 0) return false;
    } else if (part.startsWith("^")) {
      const base = parseVersion(part.slice(1));
      if (!base) return false;
      if (v[0] !== base[0]) return false;
      if (compareVersion(v, base) < 0) return false;
    } else if (part.includes(".")) {
      if (compareVersion(v, parseVersion(part)) !== 0) return false;
    }
  }
  return true;
}

export function loadCompat(teamRoot) {
  return readJson(path.join(teamRoot, "compat", "speckit-1.x.json"), null);
}

export async function getSpeckitVersion(projectRoot) {
  const result = await runProcess("specify version --json", { cwd: projectRoot, timeoutMs: 30000 });
  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout);
      return { version: data.cli_version ?? null, raw: data, error: null };
    } catch {
      const match = result.stdout.match(/"cli_version"\s*:\s*"([^"]+)"/);
      if (match) return { version: match[1], raw: null, error: null };
    }
  }
  const fallback = await runProcess("specify version", { cwd: projectRoot, timeoutMs: 30000 });
  const match = `${fallback.stdout}\n${fallback.stderr}`.match(/CLI Version\s+([0-9.]+)/i);
  if (match) return { version: match[1], raw: null, error: null };
  return { version: null, raw: null, error: (result.stderr || result.stdout || "无法执行 specify version").trim() };
}

export async function checkSpeckit(projectRoot, teamRoot) {
  const compat = loadCompat(teamRoot);
  const errors = [];
  const warnings = [];
  const info = {
    compat_range: compat?.range ?? null,
    version: null,
    tested_versions: compat?.tested_versions ?? [],
    missing_commands: [],
    missing_templates: [],
    missing_scripts: [],
    missing_extensions: [],
  };
  const versionResult = await getSpeckitVersion(projectRoot);
  info.version = versionResult.version;
  if (!versionResult.version) {
    errors.push(`无法读取 spec-kit 版本：${versionResult.error}`);
  } else if (compat?.range && !satisfiesRange(versionResult.version, compat.range)) {
    errors.push(`spec-kit ${versionResult.version} 不在兼容范围 ${compat.range} 内；请升级 Riccon SDD 或降级 spec-kit。`);
  } else if (compat?.tested_versions?.length && !compat.tested_versions.includes(versionResult.version)) {
    warnings.push(`spec-kit ${versionResult.version} 尚未列入已测试版本 ${compat.tested_versions.join(", ")}，继续使用但请运行完整测试。`);
  }

  const initOptionsPath = path.join(projectRoot, ".specify", "init-options.json");
  const initOptions = exists(initOptionsPath) ? readJson(initOptionsPath, {}) : null;
  if (!initOptions) {
    errors.push("缺少 .specify/init-options.json；请先运行 specify init。");
  } else {
    if (initOptions.integration !== "opencode") {
      errors.push(`当前 spec-kit 集成是 ${initOptions.integration}，不是 opencode。`);
    }
  }

  const variant = initOptions?.script ?? (process.platform === "win32" ? "ps" : "sh");
  for (const command of compat?.required_commands ?? []) {
    const p = path.join(projectRoot, ".opencode", "commands", `${command}.md`);
    if (!exists(p)) info.missing_commands.push(command);
  }
  for (const template of compat?.required_templates ?? []) {
    const p = path.join(projectRoot, ".specify", "templates", template);
    if (!exists(p)) info.missing_templates.push(template);
  }
  for (const script of compat?.required_scripts ?? []) {
    const dir = variant === "ps" ? "powershell" : variant === "sh" ? "bash" : "python";
    const file = variant === "ps"
      ? `${script}.ps1`
      : variant === "sh"
        ? `${script}.sh`
        : `${script.replace(/-/g, "_")}.py`;
    const p = path.join(projectRoot, ".specify", "scripts", dir, file);
    if (!exists(p)) info.missing_scripts.push(`${dir}/${file}`);
  }
  for (const ext of compat?.required_extensions ?? []) {
    const p = path.join(projectRoot, ".specify", "extensions", ext);
    if (!exists(p)) info.missing_extensions.push(ext);
  }

  if (info.missing_commands.length) errors.push(`缺少 spec-kit 命令：${info.missing_commands.join(", ")}`);
  if (info.missing_templates.length) errors.push(`缺少 spec-kit 模板：${info.missing_templates.join(", ")}`);
  if (info.missing_scripts.length) errors.push(`缺少 spec-kit 脚本：${info.missing_scripts.join(", ")}`);
  if (info.missing_extensions.length) warnings.push(`缺少推荐扩展：${info.missing_extensions.join(", ")}`);

  return { ok: errors.length === 0, errors, warnings, info };
}

export function readExtensions(projectRoot) {
  const p = path.join(projectRoot, ".specify", "extensions.yml");
  if (!exists(p)) return null;
  return readYaml(p, null);
}
