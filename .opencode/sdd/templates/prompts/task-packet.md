# Builder 任务包 — {{TASK_ID}}

## 任务

- 标题：{{TITLE}}
- spec-kit ID：{{SPECKIT_ID}}
- feature：{{FEATURE}}
- phase：{{PHASE}}
- story：{{STORY}}
- 风险：{{RISK}}
- owner：{{OWNER}}

## 写入范围（只能改这些）

{{WRITE_SCOPE}}

## 验收标准

{{ACCEPTANCE}}

## 验证命令

{{VERIFY}}

## 必读

- `specs/{{FEATURE}}/spec.md`
- `specs/{{FEATURE}}/plan.md`
- `specs/{{FEATURE}}/tasks.md` 中本任务段落
- `specs/{{FEATURE}}/data-model.md`、`contracts/`（如存在）
- `AGENTS.md` 项目合同
- `.specify/memory/constitution.md`
- `.sdd/state.json`（只读）

## 返工（如有）

- 上一轮 review ID：
- 必须修复的 findings：
- 不要重复的解释：

## 交付

1. 只改 `write_scope` 内文件；不碰 `.sdd/state.json`、`.sdd/tasks/**`、`.sdd/decisions/**`、`.sdd/reviews/**`、`.sdd/handoffs/**`、`AGENTS.md`、`.opencode/**`、`.specify/**`。
2. 用中文 commit，只提交本任务范围内的文件。
3. 提交后运行验证命令，并用 `sdd evidence run` 记录证据。
4. 返回 receipt：任务、结果、改动文件、验证命令、证据 ID、遗留问题、下一步。
5. 不要自己标 done；lead 会在 verifier 通过后关闭。
