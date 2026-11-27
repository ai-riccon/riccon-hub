import path from "node:path";
import { readYaml, writeYaml, exists, ensureDir } from "./util.mjs";

export const CONFIG_PATH = ".sdd/config.yml";

export function defaultConfig() {
  return {
    language: "zh-CN",
    timezone: "Asia/Shanghai",
    models: {
      default: "inherit",
      lead: "inherit",
      product: "inherit",
      architect: "inherit",
      builder: "inherit",
      verifier: "inherit",
      ops: "inherit",
    },
    coverage: {
      line: 80,
      branch: 70,
    },
    evidence: {
      hash: false,
      max_log_bytes: 2097152,
    },
    handoff: {
      context_tokens: 120000,
      steps: 300,
      tool_calls: 60,
    },
    parallel: {
      enabled: false,
      max_builders: 2,
    },
    git: {
      auto_commit: false,
      branch_prefix: "feature/",
    },
    speckit: {
      compat_range: ">=1.4.5 <2.0",
    },
  };
}

export function loadConfig(projectRoot) {
  const p = path.join(projectRoot, CONFIG_PATH);
  const raw = exists(p) ? readYaml(p) : {};
  if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new Error("config.yml 必须是 YAML 映射（key: value）");
  }
  return mergeDeep(defaultConfig(), raw ?? {});
}

export function saveConfig(projectRoot, config) {
  const p = path.join(projectRoot, CONFIG_PATH);
  ensureDir(path.dirname(p));
  writeYaml(p, config);
}

export function mergeDeep(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== "object" || base === null) return override ?? base;
  if (typeof override !== "object" || override === null) return override ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = mergeDeep(base[key], value);
  }
  return out;
}
