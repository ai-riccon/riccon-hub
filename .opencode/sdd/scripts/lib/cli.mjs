#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exists } from "./util.mjs";
import { TEAM_VERSION } from "./version.mjs";
import { checkSpeckit } from "./compat.mjs";
import { doctor, formatDoctor } from "./doctor.mjs";
import { initProject } from "./init.mjs";
import { upgradeProject } from "./upgrade.mjs";
import { statusSummary, validateState } from "./state.mjs";
import {
  listTasks, loadTask, newTask, syncTasks, taskScopeViolations, updateTask,
} from "./task.mjs";
import { listEvidence, runEvidence } from "./evidence.mjs";
import { runGate } from "./gate.mjs";
import {
  answerDecision, listDecisions, loadDecision, newDecision,
} from "./decision.mjs";
import { listReviews, loadReview, writeReview } from "./review.mjs";
import { listHandoffs, newHandoff } from "./handoff.mjs";
import { listRetros, newRetro } from "./retro.mjs";
import { computeMetrics } from "./metrics.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(moduleDir, "..", "..");
const sourceMode = exists(path.join(runtimeRoot, ".opencode", "agents", "sdd", "lead.md"))
  && exists(path.join(runtimeRoot, "templates", "agents", "permissions.yml"));

function findProjectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  while (true) {
    if (exists(path.join(dir, ".sdd"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function context(options = {}) {
  if (!sourceMode) {
    const projectRoot = path.resolve(runtimeRoot, "..", "..");
    return { sourceMode, projectRoot, teamRoot: projectRoot, runtimeRoot };
  }
  const projectRoot = options.project ? path.resolve(options.project) : findProjectRoot(process.cwd());
  return { sourceMode, projectRoot, teamRoot: runtimeRoot, runtimeRoot };
}

function requireProject(options) {
  const ctx = context(options);
  if (!exists(path.join(ctx.projectRoot, ".sdd"))) {
    throw new Error(`当前目录不是 Riccon SDD 项目（缺少 .sdd/）：${ctx.projectRoot}\n先运行 sdd init。`);
  }
  return ctx;
}

function parseArgv(argv) {
  const positional = [];
  const options = {};
  let commandArgs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      commandArgs = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        options[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        options[body] = argv[i + 1];
        i += 1;
      } else {
        options[body] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options, commandArgs };
}

function listOption(value) {
  if (Array.isArray(value)) return value;
  if (value === true || value === undefined || value === null || value === "") return [];
  return String(value).split(/[|,]/).map((s) => s.trim()).filter(Boolean);
}

function toBool(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function print(value) {
  if (typeof value === "string") console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function printStatus(projectRoot) {
  const summary = statusSummary(projectRoot);
  if (!summary.project || !summary.state) {
    print(`未初始化：${projectRoot}\n运行 sdd init。`);
    return;
  }
  const counts = summary.tasks.counts;
  console.log(`项目：${summary.project.name}`);
  console.log(`团队：Riccon SDD ${summary.project.team_version}，spec-kit ${summary.project.speckit_version ?? "未知"}`);
  console.log(`阶段：${summary.state.phase}    门禁：${summary.state.gate?.name} / ${summary.state.gate?.status}`);
  console.log(`Feature：${summary.state.current_feature ?? "-"}`);
  console.log(`任务：${summary.tasks.total} 个（${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("，") || "无"}）`);
  if (summary.tasks.active.length) console.log(`活动任务：${summary.tasks.active.map((t) => `${t.id}(${t.status})`).join(", ")}`);
  if (summary.decisions.open.length) console.log(`开放决策：${summary.decisions.open.map((d) => d.id).join(", ")}`);
  if (summary.handoff) console.log(`最近 handoff：${summary.handoff.id}（${summary.handoff.created_at}）`);
  console.log(`下一步：${summary.state.next}`);
}

function printGate(result) {
  const icons = { pass: "✓", warn: "!", fail: "✗" };
  for (const check of result.checks) {
    console.log(`${icons[check.status]} ${check.name}${check.message ? ` — ${check.message}` : ""}`);
  }
  console.log("");
  console.log(result.ok ? `门禁 ${result.gate}：通过` : `门禁 ${result.gate}：失败`);
}

function usage() {
  return `Riccon SDD ${TEAM_VERSION}

用法：
  sdd init [目录] [--dry-run] [--no-git] [--no-default-agent]
  sdd doctor [--json]
  sdd status [--json] [--project 目录]
  sdd upgrade [--dry-run] [--write --yes] [--force] [--spec-kit] [--project 目录]
  sdd state validate [--project 目录]
  sdd task new --title ... [--scope a,b] [--acceptance ...] [--verify ...]
  sdd task sync [--feature 目录]
  sdd task list | show <TASK-0001> | update <TASK-0001> --status ...
  sdd task scope <TASK-0001>
  sdd evidence run --task TASK-0001 --agent sdd/builder [--cwd 子目录] -- <命令>
  sdd evidence list --task TASK-0001
  sdd gate check --gate kickoff|spec|plan|tasks|final
  sdd review new --kind task --task TASK-0001 --verdict pass --reviewed-commit <sha>
  sdd review list | show REV-TASK-0001-001
  sdd decision new --gate spec --question ... --options "A|B"
  sdd decision answer DEC-0001 --answer "..." --kind approve
  sdd decision list | show DEC-0001
  sdd handoff new --summary ... --next ... --first-read .sdd/state.json
  sdd handoff list
  sdd retro new --summary ...
  sdd metrics [--json]
  sdd compat check
  sdd version
`;
}

async function main(argv) {
  const { positional, options, commandArgs } = parseArgv(argv);
  const [command, sub] = positional;
  if (!command || command === "help" || options.help) {
    console.log(usage());
    return;
  }

  if (command === "version") {
    console.log(`Riccon SDD ${TEAM_VERSION}`);
    console.log(`Node ${process.versions.node} · ${process.platform}`);
    console.log(`runtime: ${runtimeRoot}`);
    return;
  }

  if (command === "init") {
    if (!sourceMode) throw new Error("请在 Riccon SDD 源仓库运行 sdd init（当前是已安装 runtime）。");
    const target = positional[1] ?? options.project ?? process.cwd();
    const result = await initProject(target, runtimeRoot, {
      force: toBool(options.force),
      noGit: toBool(options["no-git"]),
      noDefaultAgent: toBool(options["no-default-agent"]),
      dryRun: toBool(options["dry-run"]),
    });
    if (result.dryRun) {
      console.log(`[dry-run] ${result.projectRoot}`);
      for (const action of result.actions) console.log(`- ${action}`);
      return;
    }
    console.log(`Riccon SDD 已安装到 ${result.projectRoot}`);
    for (const action of result.actions) console.log(`- ${action}`);
    const ctx = context({ project: result.projectRoot });
    const report = await doctor(result.projectRoot, ctx.teamRoot, ctx.runtimeRoot);
    console.log("");
    console.log(formatDoctor(report));
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === "doctor") {
    const ctx = context(options);
    const report = await doctor(ctx.projectRoot, ctx.teamRoot, ctx.runtimeRoot);
    if (options.json) print(report);
    else console.log(formatDoctor(report));
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === "status") {
    const ctx = requireProject(options);
    if (options.json) print(statusSummary(ctx.projectRoot));
    else printStatus(ctx.projectRoot);
    return;
  }

  if (command === "upgrade") {
    if (!sourceMode) throw new Error("请在 Riccon SDD 源仓库运行 sdd upgrade --project <目标项目>。");
    const ctx = context(options);
    const write = toBool(options.write) && !toBool(options["dry-run"]);
    if (write && !toBool(options.yes)) {
      throw new Error("写入升级需要显式 --yes（先跑 --dry-run 检查差异）。");
    }
    const result = await upgradeProject(ctx.projectRoot, runtimeRoot, {
      write,
      dryRun: !write,
      force: toBool(options.force),
      specKit: toBool(options["spec-kit"]),
    });
    if (result.dryRun) {
      console.log(`[dry-run] ${ctx.projectRoot}`);
      console.log(`新增：${result.plan.add.length}，更新：${result.plan.update.length}，删除：${result.plan.remove.length}，本地修改：${result.plan.locallyModified.length}，相同：${result.plan.same}`);
      for (const p of result.plan.add) console.log(`+ ${p}`);
      for (const p of result.plan.update) console.log(`~ ${p}`);
      for (const p of result.plan.remove) console.log(`- ${p}`);
      for (const p of result.plan.locallyModified) console.log(`! ${p}（本地修改，需 --force）`);
      for (const e of result.errors) console.log(`✗ ${e}`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    console.log(`已升级 ${ctx.projectRoot}`);
    console.log(`新增 ${result.applied.add.length}，更新 ${result.applied.update.length}，跳过 ${result.applied.skipped.length}，删除 ${result.applied.removed.length}`);
    if (result.backupDir) console.log(`备份：${result.backupDir}`);
    for (const item of result.specKit) console.log(`spec-kit: ${item.command}（exit ${item.code}）`);
    for (const e of result.errors) console.log(`✗ ${e}`);
    if (!result.ok || result.specKit.some((item) => item.code !== 0)) process.exitCode = 1;
    return;
  }

  if (command === "state" && sub === "validate") {
    const ctx = requireProject(options);
    const result = validateState(ctx.projectRoot);
    if (result.errors.length) {
      console.log("✗ 状态无效");
      for (const e of result.errors) console.log(`  - ${e}`);
    } else {
      console.log("✓ 状态有效");
    }
    for (const w of result.warnings) console.log(`  ! ${w}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "task") {
    const ctx = requireProject(options);
    if (sub === "new") {
      const task = newTask(ctx.projectRoot, {
        title: options.title ?? "未命名任务",
        feature: options.feature ?? null,
        phase: options.phase ?? null,
        story: options.story ?? null,
        speckit_id: options["speckit-id"] ?? null,
        owner: options.owner ?? null,
        risk: options.risk ?? "medium",
        write_scope: listOption(options.scope),
        acceptance: listOption(options.acceptance),
        verify: listOption(options.verify),
        depends_on: listOption(options["depends-on"]),
      });
      console.log(`${task.id} 已创建`);
      print(task);
      return;
    }
    if (sub === "sync") {
      const result = syncTasks(ctx.projectRoot, { featureDir: options.feature ? path.resolve(options.feature) : null });
      console.log(`同步 ${result.feature}：新建 ${result.created.length}，更新 ${result.updated.length}，共 ${result.total}`);
      for (const w of result.warnings) console.log(`! ${w}`);
      return;
    }
    if (sub === "list") {
      const tasks = listTasks(ctx.projectRoot);
      if (options.json) { print(tasks); return; }
      for (const task of tasks) {
        console.log(`${task.id}  ${task.status.padEnd(11)}  ${task.owner ?? "-"}  ${task.speckit_id ?? "-"}  ${task.title}`);
      }
      return;
    }
    if (sub === "show") {
      const id = positional[2];
      if (!id) throw new Error("用法：sdd task show TASK-0001");
      const task = loadTask(ctx.projectRoot, id);
      if (!task) throw new Error(`找不到任务：${id}`);
      print(task);
      return;
    }
    if (sub === "update") {
      const id = positional[2];
      if (!id) throw new Error("用法：sdd task update TASK-0001 --status ...");
      const patch = {};
      const aliases = { "baseline-commit": "baseline_commit", "end-commit": "end_commit" };
      for (const key of ["status", "owner", "title", "feature", "phase", "story", "risk", "baseline-commit", "end-commit", "review"]) {
        if (options[key] !== undefined) {
          patch[aliases[key] ?? key] = options[key];
        }
      }
      for (const key of ["scope", "acceptance", "verify", "depends-on"]) {
        if (options[key] !== undefined) {
          const field = key === "depends-on" ? "depends_on" : key;
          patch[field] = listOption(options[key]);
        }
      }
      if (options["add-evidence"] !== undefined) patch.add_evidence = listOption(options["add-evidence"]);
      if (options.parallel !== undefined) patch.parallel = toBool(options.parallel);
      const task = updateTask(ctx.projectRoot, id, patch);
      console.log(`${task.id} 已更新为 ${task.status}`);
      return;
    }
    if (sub === "scope") {
      const id = positional[2];
      if (!id) throw new Error("用法：sdd task scope TASK-0001");
      const result = taskScopeViolations(ctx.projectRoot, id);
      if (!result.checked) {
        console.log(`无法检查：${result.reason}`);
        process.exitCode = 1;
        return;
      }
      if (!result.violations.length) {
        console.log(`✓ ${id} scope 通过（${result.files.length} 个文件）`);
      } else {
        console.log(`✗ ${id} 越界：`);
        for (const file of result.violations) console.log(`  - ${file}`);
        process.exitCode = 1;
      }
      return;
    }
    throw new Error(`未知 task 子命令：${sub ?? "(空)"}`);
  }

  if (command === "evidence") {
    const ctx = requireProject(options);
    if (sub === "run") {
      const evidence = await runEvidence(ctx.projectRoot, {
        taskId: options.task,
        agent: options.agent,
        command: commandArgs.join(" "),
        argv: commandArgs,
        cwd: options.cwd ? path.resolve(options.cwd) : ctx.projectRoot,
        gate: options.gate ?? null,
        allowDirty: toBool(options["allow-dirty"]),
        timeoutMs: options.timeout ? Number(options.timeout) : 0,
      });
      console.log(`证据 ${evidence.id} 已记录：exit ${evidence.exit_code}，${evidence.duration_ms}ms`);
      console.log(`日志：${evidence.log_path}`);
      if (evidence.exit_code !== 0) process.exitCode = 1;
      return;
    }
    if (sub === "list") {
      const items = listEvidence(ctx.projectRoot, options.task ?? null);
      if (options.json) { print(items); return; }
      for (const ev of items) console.log(`${ev.id}  ${ev.task}  exit=${ev.exit_code}  ${ev.agent}  ${ev.command}`);
      return;
    }
    throw new Error(`未知 evidence 子命令：${sub ?? "(空)"}`);
  }

  if (command === "gate" && sub === "check") {
    const ctx = requireProject(options);
    const gate = options.gate;
    if (!gate) throw new Error("缺少 --gate kickoff|spec|plan|tasks|final");
    const result = runGate(ctx.projectRoot, gate);
    printGate(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "review") {
    const ctx = requireProject(options);
    if (sub === "new") {
      let findings = [];
      if (options.findings) {
        try {
          findings = JSON.parse(options.findings);
        } catch (error) {
          throw new Error(`--findings 必须是 JSON 数组：${error.message}`);
        }
      }
      const review = writeReview(ctx.projectRoot, {
        kind: options.kind,
        task: options.task ?? null,
        gate: options.gate ?? null,
        feature: options.feature ?? null,
        reviewer: options.reviewer ?? "sdd/verifier",
        session: options.session ?? null,
        verdict: options.verdict,
        independent: options.independent === undefined ? true : toBool(options.independent),
        reviewed_commit: options["reviewed-commit"] ?? null,
        reviewed_evidence: listOption(options["reviewed-evidence"]),
        findings,
        body: options.body,
      });
      console.log(`${review.id} 已创建（kind=${review.kind}，verdict=${review.verdict}）`);
      return;
    }
    if (sub === "list") {
      for (const review of listReviews(ctx.projectRoot)) {
        console.log(`${review.id}  ${String(review.kind).padEnd(9)}  ${String(review.task ?? "-").padEnd(11)}  ${review.verdict}`);
      }
      return;
    }
    if (sub === "show") {
      const id = positional[2];
      if (!id) throw new Error("用法：sdd review show REV-TASK-0001-001");
      const review = loadReview(ctx.projectRoot, id);
      if (!review) throw new Error(`找不到评审：${id}`);
      print(review);
      return;
    }
    throw new Error(`未知 review 子命令：${sub ?? "(空)"}`);
  }

  if (command === "decision") {
    const ctx = requireProject(options);
    if (sub === "new") {
      const decision = newDecision(ctx.projectRoot, {
        gate: options.gate ?? null,
        question: options.question ?? "未命名决策",
        options: listOption(options.options),
        recommendation: options.recommendation ?? "",
        default: options.default ?? "",
        deadline: options.deadline ?? "",
        owner: options.owner ?? "user",
        blocking: options["no-blocking"] ? false : true,
        context: options.context ?? "",
      });
      console.log(`${decision.id} 已创建（gate=${decision.gate ?? "-"}）`);
      return;
    }
    if (sub === "answer") {
      const id = positional[2];
      if (!id) throw new Error("用法：sdd decision answer DEC-0001 --answer ...");
      const decision = answerDecision(ctx.projectRoot, id, {
        answer: options.answer,
        kind: options.kind ?? "answer",
        owner: options.owner ?? "user",
        reopen: toBool(options.reopen),
      });
      console.log(`${decision.id} 已回答：${decision.answer_kind}`);
      return;
    }
    if (sub === "list") {
      const items = listDecisions(ctx.projectRoot);
      for (const d of items) console.log(`${d.id}  ${d.status.padEnd(9)}  ${d.gate ?? "-"}  ${d.question}`);
      return;
    }
    if (sub === "show") {
      const id = positional[2];
      if (!id) throw new Error("用法：sdd decision show DEC-0001");
      const d = loadDecision(ctx.projectRoot, id);
      if (!d) throw new Error(`找不到决策：${id}`);
      print(d);
      return;
    }
    throw new Error(`未知 decision 子命令：${sub ?? "(空)"}`);
  }

  if (command === "handoff") {
    const ctx = requireProject(options);
    if (sub === "new") {
      const handoff = newHandoff(ctx.projectRoot, {
        session: options.session ?? null,
        summary: options.summary ?? "",
        next: options.next ?? "",
        invariants: listOption(options.invariants),
        risks: listOption(options.risks),
        first_read: listOption(options["first-read"]),
      });
      console.log(`${handoff.id} 已创建`);
      return;
    }
    if (sub === "list") {
      for (const h of listHandoffs(ctx.projectRoot)) console.log(`${h.id}  ${h.phase}  ${h.next}`);
      return;
    }
    throw new Error(`未知 handoff 子命令：${sub ?? "(空)"}`);
  }

  if (command === "retro" && sub === "new") {
    const ctx = requireProject(options);
    const retro = newRetro(ctx.projectRoot, {
      period: options.period ?? "milestone",
      summary: options.summary ?? "",
      friction: listOption(options.friction),
      proposals: listOption(options.proposals),
    });
    console.log(`${retro.id} 已创建`);
    return;
  }

  if (command === "retro" && sub === "list") {
    const ctx = requireProject(options);
    for (const retro of listRetros(ctx.projectRoot)) console.log(`${retro.id}  ${retro.period}  ${retro.created_at ?? ""}`);
    return;
  }

  if (command === "metrics") {
    const ctx = requireProject(options);
    const metrics = computeMetrics(ctx.projectRoot);
    if (options.json) { print(metrics); return; }
    for (const [key, value] of Object.entries(metrics)) {
      console.log(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
    return;
  }

  if (command === "compat" && sub === "check") {
    const ctx = context(options);
    const result = await checkSpeckit(ctx.projectRoot, ctx.runtimeRoot);
    if (options.json) { print(result); return; }
    console.log(`spec-kit：${result.info.version ?? "未知"}（兼容范围 ${result.info.compat_range ?? "-"}）`);
    for (const e of result.errors) console.log(`✗ ${e}`);
    for (const w of result.warnings) console.log(`! ${w}`);
    console.log(result.ok ? "✓ 兼容检查通过" : "✗ 兼容检查失败");
    if (!result.ok) process.exitCode = 1;
    return;
  }

  throw new Error(`未知命令：${command}\n\n${usage()}`);
}

export async function run(argv) {
  try {
    await main(argv);
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
