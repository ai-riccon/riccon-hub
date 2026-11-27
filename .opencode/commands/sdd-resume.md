---
description: 从 .sdd 状态和最近 handoff 恢复项目，不依赖旧聊天。
agent: sdd/lead
---

# /sdd-resume

1. 运行 `SDD state validate` 和 `SDD status`。
2. 读最近一份 `.sdd/handoffs/HANDOFF-*.md`；按 `first_read` 顺序读文件。
3. 检查 git 状态：`git status --short`、`git log -5 --oneline`；如果有未提交改动，先判断是否属于活动任务。
4. 对照 handoff 的 `next`、`invariants`、`risks`，确认当前状态没有漂移。
5. 如果发现状态与 handoff 不一致：先报告差异，不要猜；必要时创建决策向用户确认。
6. 用一段话报告：上次做到哪、现在在哪、不变量、风险、下一步；然后继续执行下一步。
