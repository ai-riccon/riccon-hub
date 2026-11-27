---
description: 生成当前门禁的评审包，按风险派发 verifier，记录用户批准并运行 gate check。
agent: sdd/lead
---

# /sdd-review

1. 确认当前阶段和门禁：kickoff / spec / plan / tasks / final。
2. 收集门禁材料：
   - kickoff：`.sdd/brief.md`、`AGENTS.md` 合同、`.specify/memory/constitution.md`
   - spec：`spec.md`、requirements checklist、clarify 记录
   - plan：`plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`
   - tasks：`tasks.md`、`.sdd/tasks/*.json`、`ANALYZE-*.md`
   - final：任务状态/证据、`CONVERGE-*.md`、`FINAL-*.md`、全量测试证据
3. 按风险派发 `sdd/verifier`：任务评审、analyze、converge 或 final；要求返回 review ID、verdict、findings。
4. 有 P0/P1 时不要进入用户批准；先修复并重新验证。
5. 创建/复用该门禁的决策包，向用户提交一页评审包：结论、AC 对照、证据、风险、开放决策、推荐。
6. 用户批准后运行 `SDD decision answer ... --kind approve`，再运行 `SDD gate check --gate <门禁>`。
7. 门禁通过后写 handoff；失败则列出具体修复项和负责角色。
