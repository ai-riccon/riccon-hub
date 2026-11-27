---
description: 复盘当前项目，把摩擦、指标和改进提案写回团队仓库；不自动修改已安装团队文件。
agent: sdd/lead
---

# /sdd-improve

1. 运行 `SDD metrics`，读取 `.sdd/retro/RETRO-*.md`、`.sdd/reviews/**`、`.sdd/decisions/**`。
2. 总结：
   - 哪些门禁反复失败
   - 哪些任务返工/越界/证据不足
   - 哪些提示词、skill、CLI 或模板不好用
   - token/时间/派发次数是否异常
3. 运行 `SDD retro new --summary "..." --friction "..." --proposals "..."` 记录本次复盘。
4. 读 `.sdd/project.json` 的 `team_source`；如果存在，在 **团队源仓库** 的 `docs/proposals/` 写一份提案（不是目标项目）；如果不存在，写到 `.sdd/retro/PROPOSAL-<日期>.md` 并提示用户把提案带回团队仓库。
   - 问题与证据
   - 影响范围
   - 建议改动（文件/提示词/权限/CLI）
   - 验证方式
   - 风险与回滚
5. 不要自动修改已安装的 `.opencode/agents/sdd/**`、`.opencode/skills/sdd-*/**`、`.opencode/sdd/**`；提案由人审后合入团队仓库。
6. 向用户报告：本次复盘结论、提案路径、是否需要现在应用。
