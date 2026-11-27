import path from "node:path";
import { exists, readJson, readText } from "./util.mjs";
import { checkAgentSync, ROLES } from "./agents.mjs";
import { checkSpeckit } from "./compat.mjs";
import { verifyManifest } from "./manifest.mjs";
import { validateState } from "./state.mjs";
import { getSpeckitVersion } from "./compat.mjs";

function item(name, status, message = "") {
  return { name, status, message };
}

export async function doctor(projectRoot, teamRoot, runtimeRoot = teamRoot) {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(item("Node.js >= 22", nodeMajor >= 22 ? "pass" : "fail", `当前 ${process.versions.node}`));

  const gitVersion = (await import("node:child_process")).spawnSync("git", ["--version"], { encoding: "utf8" });
  checks.push(item("git 可用", gitVersion.status === 0 ? "pass" : "fail", (gitVersion.stdout ?? "").trim()));

  const version = await getSpeckitVersion(projectRoot);
  checks.push(item("specify 可用", version.version ? "pass" : "fail", version.version ?? version.error ?? ""));

  const compat = await checkSpeckit(projectRoot, runtimeRoot);
  checks.push(item("spec-kit 兼容", compat.ok ? "pass" : "fail", compat.errors.join("; ")));
  for (const warning of compat.warnings) checks.push(item("spec-kit 提示", "warn", warning));

  for (const file of ["project.json", "state.json", "config.yml", "brief.md", "manifest.json"]) {
    checks.push(item(`.sdd/${file}`, exists(path.join(projectRoot, ".sdd", file)) ? "pass" : "fail", ""));
  }

  const manifest = verifyManifest(projectRoot);
  checks.push(item("团队文件完整", manifest.missing.length === 0 ? "pass" : "fail", manifest.missing.length ? `缺失：${manifest.missing.join(", ")}` : ""));
  if (manifest.modified.length) {
    checks.push(item("团队文件本地修改", "warn", manifest.modified.join(", ")));
  }

  const state = validateState(projectRoot);
  checks.push(item("状态文件有效", state.ok ? "pass" : "fail", state.errors.join("; ")));
  for (const warning of state.warnings) checks.push(item("状态提示", "warn", warning));

  const sync = checkAgentSync(teamRoot, runtimeRoot);
  checks.push(item("agent 权限/模型同步", sync.ok ? "pass" : "fail", sync.problems.join("; ")));

  for (const role of ROLES) {
    const file = path.join(teamRoot, ".opencode", "agents", "sdd", `${role}.md`);
    checks.push(item(`agent ${role}`, exists(file) ? "pass" : "fail", ""));
  }

  const commands = [".opencode/commands/sdd-start.md", ".opencode/commands/sdd-status.md", ".opencode/commands/sdd-resume.md", ".opencode/commands/sdd-review.md", ".opencode/commands/sdd-decision.md", ".opencode/commands/sdd-improve.md", ".opencode/commands/sdd-upgrade.md"];
  const missingCommands = commands.filter((file) => !exists(path.join(teamRoot, file)));
  checks.push(item("团队命令完整", missingCommands.length === 0 ? "pass" : "fail", missingCommands.join(", ")));

  for (const skill of ["sdd-core", "sdd-speckit", "sdd-verify", "sdd-upgrade"]) {
    const file = path.join(teamRoot, ".opencode", "skills", skill, "SKILL.md");
    checks.push(item(`skill ${skill}`, exists(file) ? "pass" : "fail", ""));
  }

  const opencodePath = path.join(projectRoot, "opencode.json");
  const opencode = readJson(opencodePath, null);
  if (!opencode) {
    checks.push(item("opencode.json", "fail", "文件不存在或不是合法 JSON"));
  } else if (opencode.default_agent !== "sdd/lead") {
    checks.push(item("默认 agent", "warn", `当前是 ${opencode.default_agent ?? "未设置"}，建议设为 sdd/lead`));
  } else {
    checks.push(item("默认 agent", "pass", "sdd/lead"));
  }

  const agentsMd = path.join(projectRoot, "AGENTS.md");
  if (!exists(agentsMd)) {
    checks.push(item("AGENTS.md", "fail", "缺少项目合同"));
  } else {
    const text = readText(agentsMd, "");
    checks.push(item("AGENTS.md 合同块", text.includes("sdd:contract:start") ? "pass" : "fail", text.includes("sdd:contract:start") ? "" : "缺少 sdd:contract 标记"));
  }

  if (compat.info.missing_extensions.length) {
    checks.push(item("spec-kit 扩展", "warn", `缺少：${compat.info.missing_extensions.join(", ")}`));
  } else {
    checks.push(item("spec-kit 扩展", "pass", ""));
  }

  return {
    ok: checks.every((c) => c.status !== "fail"),
    checks,
    compat,
  };
}

export function formatDoctor(result) {
  const icons = { pass: "✓", warn: "!", fail: "✗" };
  const lines = [];
  for (const check of result.checks) {
    lines.push(`${icons[check.status] ?? "?"} ${check.name}${check.message ? ` — ${check.message}` : ""}`);
  }
  lines.push("");
  lines.push(result.ok ? "结论：通过（有警告也请查看）" : "结论：失败，请先修复 ✗ 项");
  return lines.join("\n");
}
