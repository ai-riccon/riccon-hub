---
name: sdd-verify
description: 独立验证协议：风险分级、证据检查、反假绿、scope 校验、review/analyze/converge/final 的写法。
---

# 独立验证

## 风险分级

| 风险 | 例子 | 验证要求 |
|---|---|---|
| **high** | 认证、权限、支付、PII、迁移、并发、安全边界、外部集成、数据删除 | 每个任务独立 verifier + 独立复跑 + task review |
| **medium** | 核心业务逻辑、API、数据读写、关键 UI 流程 | 自动化证据 + lead 审 diff；里程碑 verifier |
| **low** | 文案、样式、配置、文档、简单 UI | 自动化证据（如可用）+ lead 审 diff |

lead 可以把任意任务升级为 high；不能把 high 降为 low 来省评审。

## 任务评审步骤

1. 读任务包、`specs/NNN-*/spec.md`、`plan.md`、本任务 `tasks.md` 段落、`AGENTS.md`。
2. 读 `.sdd/tasks/<TASK>.json` 和证据 JSON/日志。
3. 检查 `git diff <baseline>..<end> --name-only` 是否越出 `write_scope`；用 `sdd task scope TASK-0001`。
4. 自己运行关键验证命令；记录 verifier 证据：

```bash
node .opencode/sdd/scripts/sdd.mjs evidence run \
  --task TASK-0001 \
  --agent sdd/verifier \
  -- <验证命令>
```

5. 检查测试是否真的断言、是否覆盖 AC、是否有跳过/重试/吞错。
6. 写 `.sdd/reviews/REV-TASK-0001-001.md`。优先用 `sdd review new` 创建骨架，再补 findings/正文：
   ```bash
   node .opencode/sdd/scripts/sdd.mjs review new \
     --kind task --task TASK-0001 --verdict pass \
     --reviewed-commit <sha> --reviewed-evidence EV-0001 --session ses_xxx
   ```
   front matter 必须包含 `kind: task`、`task`、`verdict`、`independent: true`、`reviewed_commit`、`reviewed_evidence`、`findings`。
   findings 示例：`{"severity":"P1","title":"空输入返回 0","status":"open","file":"src/add.js"}`；severity 只接受 P0–P3（或 p0/critical 等可归一化别名），status 只接受 open/fixed/accepted/closed。只写正文、不写 frontmatter findings 会被门禁当成假绿。
7. 返回：review ID、verdict、findings、独立证据 ID、未覆盖 AC。

## 反假绿清单

- 命令执行了零个测试。
- 测试被跳过且没有 owner/到期时间。
- retry 掩盖 flake；为通过追加参数必须记录原因。
- 测试没有断言，或只对坏状态做快照。
- 命令吞错、`|| true`、`; true`、末尾 `exit 0`。
- 证据缺失、被截断、来自另一个工作区。
- `tasks.md` 勾了 `[X]` 但 `.sdd/tasks` 没有证据。
- 评审由变更作者自己写，或 reviewer 不是新上下文。
- scope 检查只看 union，不证明 authorship；必须看实际 diff。

## Findings

| 级别 | 含义 | 闭合要求 |
|---|---|---|
| P0 | 安全/数据丢失/核心不可用 | 必须 fixed |
| P1 | 阻塞 AC 或高风险缺陷 | 必须 fixed |
| P2 | 非阻塞缺陷/风险 | fixed 或有 owner/due/accepted_reason |
| P3 | 改进项 | fixed 或 accepted |

findings 要写：文件/行为、复现方式、影响、建议。不要写“建议优化”。

## analyze

先读取项目内 `.opencode/commands/speckit.analyze.md`，按其中步骤执行；下面是检查重点。

只读检查 `spec.md` / `plan.md` / `tasks.md`：

- FR/SC/US/AC 是否被 tasks 覆盖。
- plan 决策是否在 tasks 中落地。
- Constitution MUST 是否被违反。
- 重复、歧义、underspecified、范围蔓延。
- 输出 `.sdd/reviews/ANALYZE-*.md`，verdict=`pass|fail`，CRITICAL/HIGH 必须列出。

## converge

先读取项目内 `.opencode/commands/speckit.converge.md`，按其中步骤执行；下面是检查重点。

只读评估代码 vs spec/plan/tasks/constitution：

- 分类：`missing`、`partial`、`contradicts`、`unrequested`。
- 每条带来源引用：`FR-008`、`US1/AC2`、`plan: ...`、`Constitution II`。
- 不修改 `tasks.md`；lead 执行 `/speckit.converge` 并追加任务。
- 输出 `.sdd/reviews/CONVERGE-*.md`，verdict=`clean|fail`。

## final

- 所有任务 `done`。
- 每条 done 有 exit 0、日志存在、非 manual 的证据。
- 高风险任务有独立 task review。
- `CONVERGE-*.md` clean。
- 全量测试证据存在且通过。
- 输出 `.sdd/reviews/FINAL-*.md`，verdict=`pass|fail`。

## 边界

- 不修源码；发现 bug 写 finding，交回 lead/builder。
- 不修改任务状态、不勾选 `tasks.md`、不创建决策。
- 不 spawn 子代理，不使用 `question`。
- 每个任务用新上下文；不复用上一个任务的 verifier 会话。
