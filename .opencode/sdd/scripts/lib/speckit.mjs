import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, exists, readYaml, writeYaml, readJson, toPosix } from "./util.mjs";

export function scriptVariant() {
  if (process.platform === "win32") return "ps";
  return "sh";
}

export function runSpecify(args, cwd = process.cwd()) {
  const result = spawnSync("specify", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error ? String(result.error.message ?? result.error) : null,
  };
}

export function isSpeckitProject(projectRoot) {
  return exists(path.join(projectRoot, ".specify"));
}

export function initSpecify(projectRoot, { force = true, dryRun = false } = {}) {
  if (isSpeckitProject(projectRoot)) {
    return { skipped: true, code: 0, command: null, stdout: "", stderr: "" };
  }
  const args = [
    "init",
    "--here",
    "--integration",
    "opencode",
    "--script",
    scriptVariant(),
    "--non-interactive",
    "--integration-options",
    "--events false",
  ];
  if (force) args.push("--force");
  const command = `specify ${args.join(" ")}`;
  if (dryRun) return { skipped: false, dryRun: true, code: 0, command, stdout: "", stderr: "" };
  const result = runSpecify(args, projectRoot);
  return { ...result, skipped: false, command };
}

export function installedExtensions(projectRoot) {
  const dir = path.join(projectRoot, ".specify", "extensions");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !name.startsWith("."));
}

export function ensureExtensions(projectRoot, ids, { dryRun = false } = {}) {
  const installed = new Set(installedExtensions(projectRoot));
  const results = [];
  for (const id of ids) {
    if (installed.has(id)) {
      results.push({ id, skipped: true });
      continue;
    }
    if (dryRun) {
      results.push({ id, dryRun: true, command: `specify extension add ${id}` });
      continue;
    }
    const result = runSpecify(["extension", "add", id], projectRoot);
    results.push({ id, ...result, skipped: false, command: `specify extension add ${id}` });
  }
  return results;
}

export function configureGitExtension(projectRoot) {
  const configPath = path.join(projectRoot, ".specify", "extensions", "git", "git-config.yml");
  const existing = exists(configPath) ? readYaml(configPath, {}) : {};
  const config = {
    branch_numbering: existing.branch_numbering ?? "sequential",
    branch_template: existing.branch_template ?? "",
    branch_prefix: existing.branch_prefix ?? "",
    init_commit_message: existing.init_commit_message ?? "[Spec Kit] Initial commit",
    commit_style: existing.commit_style ?? "fixed",
    ...existing,
    auto_commit: {
      ...(existing.auto_commit ?? {}),
      default: false,
    },
  };
  ensureDir(path.dirname(configPath));
  writeYaml(configPath, config);
  return configPath;
}

export function listInstalledCommands(projectRoot) {
  const dir = path.join(projectRoot, ".opencode", "commands");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^speckit\..+\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
}

export function commandPath(projectRoot, name) {
  return path.join(projectRoot, ".opencode", "commands", `${name}.md`);
}

export function readInitOptions(projectRoot) {
  return readJson(path.join(projectRoot, ".specify", "init-options.json"), null);
}

export function readIntegrationStatus(projectRoot) {
  return runSpecify(["integration", "status"], projectRoot);
}

export function readArtifacts(projectRoot) {
  return runSpecify(["artifact", "list", "--json"], projectRoot);
}

export function relativeCommand(projectRoot, name) {
  return toPosix(path.relative(projectRoot, commandPath(projectRoot, name)));
}
