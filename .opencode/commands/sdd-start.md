---
description: 开始或继续 Riccon SDD 项目：读取状态与 handoff，报告下一步，进入当前阶段。
agent: sdd/lead
---

# /sdd-start

1. 读 `.sdd/state.json`、最近一份 `.sdd/handoffs/HANDOFF-*.md`、`AGENTS.md` 合同块。
2. 运行 `SDD status` 和 `SDD doctor`（SDD 路径见 lead 提示）。
3. 如果 `.sdd/` 不存在：告诉用户在项目根运行 `sdd init`，不要自行初始化。
4. 如果 phase=`init` 或 `kickoff`：开始 kickoff 访谈，先确认目标用户、问题、MVP 范围、non-goals、成功指标、技术约束。
5. 如果 phase 在 specify/plan/tasks：读取当前门禁和 feature 产物，报告缺什么，准备对应门禁包。
6. 如果 phase 在 implement/verify：先恢复活动任务；没有活动任务就从下一个 ready 任务继续。
7. 如果 phase=`done`：询问用户是做新 feature、修 bug，还是复盘。
8. 用一段话报告：阶段、feature、门禁、活动任务、开放决策、下一步；不要输出长清单。
