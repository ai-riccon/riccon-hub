import fs from "node:fs";
import path from "node:path";
import { exists, parseFrontMatter, readYaml, stringifyFrontMatter, writeText } from "./util.mjs";

export const ROLES = ["lead", "product", "architect", "builder", "verifier", "ops"];

export function agentsDir(teamRoot) {
  return path.join(teamRoot, ".opencode", "agents", "sdd");
}

export function agentPath(teamRoot, role) {
  return path.join(agentsDir(teamRoot), `${role}.md`);
}

export function loadAgentConfig(runtimeRoot) {
  const permissionsPath = path.join(runtimeRoot, "templates", "agents", "permissions.yml");
  const modelsPath = path.join(runtimeRoot, "templates", "agents", "models.yml");
  if (!exists(permissionsPath) || !exists(modelsPath)) {
    throw new Error("缺少 templates/agents/permissions.yml 或 models.yml");
  }
  return {
    permissions: readYaml(permissionsPath),
    models: readYaml(modelsPath),
  };
}

export function permissionsFor(role, permissions) {
  const base = permissions.base ?? [];
  const subagent = role === "lead" ? [] : (permissions.subagents ?? []);
  const specific = permissions[role] ?? [];
  return [...base, ...subagent, ...specific];
}

export function syncAgent(teamRoot, role, runtimeRoot = teamRoot) {
  const file = agentPath(teamRoot, role);
  if (!exists(file)) return { role, skipped: true, file };
  const { permissions, models } = loadAgentConfig(runtimeRoot);
  const { data, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
  data.mode = role === "lead" ? "primary" : "subagent";
  const model = models.roles?.[role] ?? models.default ?? "inherit";
  if (model && model !== "inherit") data.model = model;
  else delete data.model;
  data.steps = models.steps?.[role] ?? data.steps ?? 300;
  data.permissions = permissionsFor(role, permissions);
  writeText(file, stringifyFrontMatter(data, body));
  return { role, skipped: false, file, model, steps: data.steps };
}

export function syncAllAgents(teamRoot, runtimeRoot = teamRoot) {
  return ROLES.map((role) => syncAgent(teamRoot, role, runtimeRoot));
}

function stable(value) {
  return JSON.stringify(value ?? null);
}

export function checkAgentSync(teamRoot, runtimeRoot = teamRoot) {
  const { permissions, models } = loadAgentConfig(runtimeRoot);
  const problems = [];
  for (const role of ROLES) {
    const file = agentPath(teamRoot, role);
    if (!exists(file)) {
      problems.push(`${role}.md 不存在`);
      continue;
    }
    const { data } = parseFrontMatter(fs.readFileSync(file, "utf8"));
    const expectedMode = role === "lead" ? "primary" : "subagent";
    if (data.mode !== expectedMode) problems.push(`${role}.md mode 应为 ${expectedMode}`);
    const expectedSteps = models.steps?.[role];
    if (expectedSteps && data.steps !== expectedSteps) problems.push(`${role}.md steps 应为 ${expectedSteps}`);
    const expectedPermissions = permissionsFor(role, permissions);
    if (stable(data.permissions) !== stable(expectedPermissions)) {
      problems.push(`${role}.md permissions 与 templates/agents/permissions.yml 不同步`);
    }
    const model = models.roles?.[role] ?? models.default ?? "inherit";
    if (model === "inherit" && data.model) problems.push(`${role}.md 应继承模型，但写了 ${data.model}`);
  }
  return { ok: problems.length === 0, problems };
}
