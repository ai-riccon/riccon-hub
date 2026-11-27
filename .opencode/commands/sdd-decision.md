---
description: 列出开放决策，批量向用户提问，并把答案记录到 .sdd/decisions。
agent: sdd/lead
---

# /sdd-decision

1. 运行 `SDD decision list`，筛出 `status=open` 的决策。
2. 按阻塞程度排序：blocking 优先；同一门禁的决策合并成一轮问题。
3. 每个决策给：问题、为什么现在要定、选项及后果、推荐、用户沉默时的默认值、截止时间。
4. 用 `question` 工具批量提问；不要一次问超过 5 个。
5. 用户回答后逐个记录：

```bash
SDD decision answer DEC-0001 --answer "用户的选择" --kind answer|approve|reject
```

6. 如果回答改变了范围/架构/风险，同步更新 `.sdd/brief.md`、`AGENTS.md` 或对应 spec-kit 产物，并说明影响。
7. 所有 blocking 决策关闭后，报告下一个门禁或下一步。
