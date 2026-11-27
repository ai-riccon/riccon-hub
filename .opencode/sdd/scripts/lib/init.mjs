import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  ensureDir,
  exists,
  gitHead,
  readText,
  timestampForFile,
  writeJson,
  writeText,
} from "./util.mjs";
import {
  buildManifest, collectManagedEntries, installTeamFiles, writeManifest,
} from "./manifest.mjs";
import { initProjectState } from "./state.mjs";
import { getSpeckitVersion, loadCompat } from "./compat.mjs";
import {
  configureGitExtension,
  ensureExtensions,
  initSpecify,
  isSpeckitProject,
  scriptVariant,
} from "./speckit.mjs";
import { TEAM_VERSION } from "./version.mjs";

function replacePlaceholders(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

export function mergeOpencode(projectRoot, { noDefaultAgent = false } = {}) {
  const file = path.join(projectRoot, "opencode.json");
  let existing = null;
  if (exists(file)) {
    try {
      existing = JSON.parse(readText(file, ""));
    } catch (error) {
      throw new Error(`opencode.json 不是合法 JSON，拒绝覆盖：${error.message}`);
    }
  }
  const config = existing ?? { "$schema": "https://opencode.ai/config.json" };
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json";
  if (!noDefaultAgent) config.default_agent = "sdd/lead";
  if (existing) {
    ensureDir(path.join(projectRoot, ".sdd", "backup"));
    copyFile(file, path.join(projectRoot, ".sdd", "backup", `opencode.json.${timestampForFile()}`));
  }
  writeJson(file, config);
  return { file, created: !existing, default_agent: config.default_agent ?? null };
}

export function backupTeamFiles(teamRoot, projectRoot, backupDir) {
  const entries = collectManagedEntries(teamRoot);
  for (const entry of entries) {
    const src = path.join(projectRoot, entry.target);
    if (!exists(src)) continue;
    const dest = path.join(backupDir, entry.target);
    ensureDir(path.dirname(dest));
    copyFile(src, dest);
  }
  return entries.length;
}

function writeAgentsMd(projectRoot, teamRoot, projectName) {
  const template = readText(path.join(teamRoot, "templates", "project", "AGENTS.md"), "");
  const rendered = replacePlaceholders(template, {
    PROJECT_NAME: projectName,
    DATE: new Date().toISOString().slice(0, 10),
    TEAM_VERSION,
  });
  const target = path.join(projectRoot, "AGENTS.md");
  if (!exists(target)) {
    writeText(target, rendered);
    return { file: target, action: "created" };
  }
  const current = readText(target, "");
  if (current.includes("sdd:team:start")) return { file: target, action: "kept" };
  const managed = rendered.slice(rendered.indexOf("<!-- sdd:contract:start -->"));
  writeText(target, `${current.trimEnd()}\n\n${managed.trim()}\n`);
  return { file: target, action: "appended-managed-blocks" };
}

function ensureGitattributes(projectRoot) {
  const file = path.join(projectRoot, ".gitattributes");
  if (exists(file)) return false;
  writeText(file, "* text=auto eol=lf\n");
  return true;
}

function ensureGitignore(projectRoot) {
  const file = path.join(projectRoot, ".gitignore");
  const current = exists(file) ? readText(file, "") : "";
  const lines = new Set(current.split(/\r?\n/).filter(Boolean));
  const additions = [".sdd/backup/", ".serena/"];
  const missing = additions.filter((line) => !lines.has(line));
  if (missing.length) {
    writeText(file, `${current.trimEnd()}${current.trim() ? "\n" : ""}${missing.join("\n")}\n`);
  }
  return missing;
}

export async function initProject(projectRoot, teamRoot, {
  force = false,
  noGit = false,
  noDefaultAgent = false,
  dryRun = false,
} = {}) {
  const root = path.resolve(projectRoot);
  const projectName = path.basename(root);
  const actions = [];
  if (dryRun) {
    actions.push(`目标目录：${root}`);
    if (!noGit) actions.push("git init（若尚无仓库）");
    actions.push(isSpeckitProject(root) ? "spec-kit 已初始化，跳过" : `specify init --here --integration opencode --script ${scriptVariant()} --non-interactive --force --integration-options "--events false"`);
    actions.push("安装扩展：git, assess, bug（缺失时）");
    actions.push("安装团队 agents/commands/skills/runtime");
    actions.push("合并 opencode.json（default_agent: sdd/lead）");
    actions.push("写入 AGENTS.md 合同块与 .sdd/ 骨架");
    return { ok: true, dryRun: true, projectRoot: root, actions };
  }

  if (!exists(path.join(teamRoot, "node_modules", "yaml"))) {
    throw new Error(`团队源仓库缺少运行时依赖 yaml：请先在 ${teamRoot} 运行 npm install。`);
  }

  ensureDir(root);
  const alreadyInitialized = exists(path.join(root, ".sdd", "state.json"));
  if (alreadyInitialized && !force) {
    throw new Error("项目已初始化（存在 .sdd/state.json）；请使用 sdd upgrade；如确需重装，显式加 --force。");
  }
  if (alreadyInitialized && force) {
    const backupDir = path.join(root, ".sdd", "backup", `reinit-${timestampForFile()}`);
    ensureDir(backupDir);
    const count = backupTeamFiles(teamRoot, root, backupDir);
    actions.push(`已备份团队文件 ${count} 个到 ${path.relative(root, backupDir)}`);
  }

  let didGitInit = false;
  if (!noGit && !exists(path.join(root, ".git"))) {
    const init = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    if (init.status !== 0) throw new Error(`git init 失败：${init.stderr}`);
    didGitInit = true;
    actions.push("git init");
  }

  const speckit = initSpecify(root, { force: true });
  actions.push(speckit.skipped ? "spec-kit 已初始化，跳过" : `specify init（exit ${speckit.code}）`);
  if (!speckit.skipped && speckit.code !== 0) {
    throw new Error(`specify init 失败：${speckit.stderr || speckit.stdout}`);
  }

  const extensions = ensureExtensions(root, ["git", "assess", "bug"]);
  for (const ext of extensions) {
    actions.push(ext.skipped ? `扩展 ${ext.id} 已存在` : `安装扩展 ${ext.id}（exit ${ext.code}）`);
    if (!ext.skipped && ext.code !== 0) {
      actions.push(`警告：扩展 ${ext.id} 安装失败：${ext.stderr || ext.stdout}`);
    }
  }
  if (exists(path.join(root, ".specify", "extensions", "git"))) {
    configureGitExtension(root);
    actions.push("配置 git 扩展：auto-commit 关闭");
  }

  const entries = installTeamFiles(teamRoot, root);
  actions.push(`安装团队文件 ${entries.length} 个`);

  const agents = writeAgentsMd(root, teamRoot, projectName);
  actions.push(`AGENTS.md：${agents.action}`);
  const opencode = mergeOpencode(root, { noDefaultAgent });
  actions.push(`opencode.json：${opencode.created ? "创建" : "合并"}（default_agent=${opencode.default_agent ?? "未设置"}）`);

  const version = await getSpeckitVersion(root);
  initProjectState(root, { name: projectName, speckitVersion: version.version, teamSource: teamRoot });
  const compat = loadCompat(teamRoot);
  const manifest = buildManifest(teamRoot, root, {
    team_version: TEAM_VERSION,
    speckit_version: version.version,
    compat_range: compat?.range ?? null,
  });
  writeManifest(root, manifest);
  actions.push(`写入 .sdd/ 状态与 manifest（${manifest.files.length} 个团队文件）`);

  if (ensureGitattributes(root)) actions.push("写入 .gitattributes（LF 归一化）");
  const ignored = ensureGitignore(root);
  if (ignored.length) actions.push(`更新 .gitignore：${ignored.join(", ")}`);

  if (!noGit && didGitInit && !gitHead(root)) {
    const add = spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8" });
    const commit = add.status === 0
      ? spawnSync("git", ["commit", "-q", "-m", "chore: 初始化 Riccon SDD 项目"], { cwd: root, encoding: "utf8" })
      : null;
    if (commit && commit.status === 0) actions.push("创建初始 commit");
    else actions.push("警告：未能创建初始 commit，请手动提交后再开始任务");
  }

  return {
    ok: true,
    dryRun: false,
    projectRoot: root,
    actions,
    speckitVersion: version.version,
    teamVersion: TEAM_VERSION,
  };
}
