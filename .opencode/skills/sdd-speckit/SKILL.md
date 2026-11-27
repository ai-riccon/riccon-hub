---
name: sdd-speckit
description: 在 OpenCode 中执行已安装 spec-kit 命令的运行时协议；包括命令映射、脚本路径、扩展钩子、implement 的按任务适配。
---

# 执行 spec-kit 命令（无 slash）

OpenCode 的 `/speckit.*` 是用户触发的命令模板；agent 不能像用户那样直接敲 slash。Lead 通过读取项目里已安装的命令文件来执行它们。

## 通用步骤

1. 确认项目根有 `.specify/` 和 `.opencode/commands/speckit.<name>.md`。
2. 读取命令文件（**项目内已安装版本**，不要读 spec-kit 源码仓库的模板）。
3. 解析 `$ARGUMENTS`：把本次输入替换进去；空输入时按命令要求处理。
4. 检查 `.specify/extensions.yml` 的 `hooks.before_<command>`：
   - `optional: false` 的钩子必须实际执行，不能只打印。钩子命令也是 `.opencode/commands/<command>.md`，读取后照做；例如 `speckit.git.feature`、`speckit.git.initialize`。
   - `optional: true` 的钩子提示用户，由用户决定；**auto-commit 类可选钩子默认跳过**，提交由 builder 按任务负责。
   - `condition` 非空的钩子跳过，交给 HookExecutor。
5. 按命令正文执行；脚本路径通常是：
   - Windows：`.specify/scripts/powershell/*.ps1`，用 `powershell -NoProfile -ExecutionPolicy Bypass -File ...` 或 `pwsh`。
   - macOS/Linux：`.specify/scripts/bash/*.sh`。
6. 执行 `hooks.after_<command>`。
7. 检查产物存在且结构正确，再进入下一阶段。

## 核心命令映射

| 命令 | 执行者 | 产物 | Riccon SDD 适配 |
|---|---|---|---|
| `speckit.constitution` | lead | `.specify/memory/constitution.md` | kickoff 批准的原则 |
| `speckit.specify` | lead | `specs/NNN-*/spec.md`、`checklists/requirements.md` | 输入 `.sdd/brief.md`；中文内容、英文标题 |
| `speckit.clarify` | lead | `spec.md` 澄清段 | 最多 5 问；用 `question` 工具 |
| `speckit.plan` | lead + architect | `plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md` | architect 提供研究和 ADR 输入 |
| `speckit.checklist` | verifier 创建、lead 执行 | `checklists/<domain>.md` | verifier 拥有勾选权；未勾选阻塞 implement |
| `speckit.tasks` | lead | `tasks.md` | 随后 `sdd task sync` |
| `speckit.analyze` | verifier | 只读报告 | 写 `.sdd/reviews/ANALYZE-*.md` |
| `speckit.implement` | **不要端到端执行** | 源码/测试/证据 | lead 只用预检 + 任务语义，逐任务派 builder |
| `speckit.converge` | lead 执行、verifier 审计 | `tasks.md` 的 Convergence 段 | loop 到 clean |
| `speckit.bug.*` | lead/verifier | `.specify/bugs/<slug>/` | 仅 MVP 验收后的真实缺陷 |

## `/speckit.implement` 的适配

spec-kit 的 implement 假设一个执行者顺序写完所有任务并打勾。Riccon SDD 不这样做：

1. 执行 implement 的**预检**：检查 `.specify/extensions.yml` 的 `before_implement` 钩子；扫描 `checklists/`，有未勾选项时停下来问用户（或让 verifier 先勾）。
2. 加载 implement 要求的上下文：`tasks.md`、`plan.md`、`data-model.md`、`contracts/`、`research.md`、`constitution.md`、`quickstart.md`。
3. 不要一次写完全部任务；按 `tasks.md` 的 phase/依赖顺序，一次一个任务派给 `sdd/builder`。
4. lead 是 `tasks.md` 勾选和 `.sdd/tasks/*.json` 的唯一写者；builder 只提交代码 + 证据。
5. 每个任务完成后按风险验证；不要因为 `tasks.md` 有 `[X]` 就认为完成。

## 特性解析

- spec-kit 用 `.specify/feature.json` 记录当前 feature，不是 git 分支。
- 并行/多 feature 时用 `SPECIFY_FEATURE_DIRECTORY` 固定路径；`SPECIFY_FEATURE_NO_PERSIST=1` 防止脚本改写 `feature.json`。
- 找不到 feature 时，检查 `specs/*/tasks.md` 或让用户确认。

## 版本与故障

- 团队兼容 spec-kit `>=1.4.5 <2.0`；启动时 `sdd doctor` / `sdd compat check` 会检查。
- 缺少命令文件：运行 `specify integration install opencode` 或 `specify integration upgrade opencode`，先 dry-run。
- `.specify/extensions.yml` 解析失败：不要静默跳过；报告解析错误，并说明哪些 mandatory hook 未执行。
- 不要修改 `.opencode/commands/speckit.*.md`；它们由 spec-kit 管理。

## 语言

命令正文是英文，但产物内容写中文；保留 spec-kit 的英文结构标题（如 `## User Scenarios & Testing`、`## Success Criteria`、`### Functional Requirements`），以便 analyze/converge 和后续升级兼容。
