---
name: sdd-core
description: Riccon SDD 团队共享协议：角色、边界、状态、任务生命周期、门禁、证据、handoff 和语言。
---

# Riccon SDD Core

## 团队

| 角色 | 职责 | 不写 |
|---|---|---|
| `sdd/lead` | 用户唯一入口；执行 spec-kit 命令、调度、门禁、决策、handoff | 生产源码、测试、迁移 |
| `sdd/product` | 发现、MVP 一页纸、用户故事、AC、UX、预验收 | 源码、state/tasks/decisions |
| `sdd/architect` | 技术选型、架构、数据模型、契约、ADR、plan 评审 | 功能代码、state/tasks/decisions |
| `sdd/builder` | 单任务 `write_scope` 内的源码、测试、迁移、取证 | state/tasks/decisions、AGENTS.md、.opencode |
| `sdd/verifier` | 独立验证、反假绿、analyze/converge/final 评审 | 源码、state/tasks/decisions |
| `sdd/ops` | CI/CD、容器、部署、可观测性、回滚、runbook | 功能代码、state/tasks/decisions |

- 只有 lead 能 spawn 子代理、能直接问用户。
- 子代理不能 spawn、不能 `question`；问题回流给 lead。
- 任何人不能自我验收；builder 不能标 done；lead 不能既实现又批准。

## 状态

`.sdd/` 是执行状态的唯一事实源，聊天历史不是记忆。

```text
phase: init → kickoff → specify → plan → tasks → implement → verify → accept → done
task:  planned → ready → in_progress → review → done      (+ blocked)
gate:  pending → pass | fail
```

- lead 写 `.sdd/state.json`、`.sdd/tasks/**`、`.sdd/decisions/**`、`.sdd/handoffs/**`。
- builder 写自己任务的 `.sdd/evidence/**`。
- verifier 写 `.sdd/reviews/**` 和验证证据。
- 证据必须来自 `sdd evidence run`：命令、cwd、exit code、时间、commit、日志路径。
- 先提交再取证；工作树脏时证据不可信。

## 四道门 + 最终验收

1. **kickoff**：constitution + `AGENTS.md` 合同 + `.sdd/brief.md`；用户批准。
2. **spec**：`spec.md` + requirements checklist；无 `[NEEDS CLARIFICATION]`；用户批准。
3. **plan**：`plan.md` + `research.md` + data-model/contracts/quickstart + Constitution Check；用户批准。
4. **tasks**：`tasks.md` + `.sdd/tasks/*.json`（scope/acceptance/verify）+ analyze 通过；用户批准。
5. **final**：所有任务 done + 证据 + 评审 + converge clean + final review + 用户最终验收。

## 派发

- v0.1.0 串行：一次一个 builder、一个任务。
- 任务包必须自包含：任务 ID、spec/plan 路径、write_scope、AC、verify、风险、交付要求。
- builder 只提交本任务范围；lead 用 `sdd task scope` 检查越界。
- 高风险任务和每个用户故事/里程碑必须独立 verifier；低风险任务可由 lead 审 diff + 证据后关闭。

## 语言

- 与用户、文档、决策、评审、handoff、commit、代码注释：中文。
- spec-kit 结构标题、代码标识符、API 字段、命令、日志键：英文。
- 不写空泛判断；每个结论要有文件、行为、命令或证据支撑。
