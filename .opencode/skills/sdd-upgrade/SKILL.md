---
name: sdd-upgrade
description: 团队与 spec-kit 的升级/兼容协议：doctor、compat、manifest、dry-run、本地修改冲突和团队改进提案。
---

# 升级与兼容

## 两个升级面

| 面 | 命令 | 谁负责 |
|---|---|---|
| 团队文件（agents/skills/runtime） | `sdd upgrade --dry-run` / `sdd upgrade --write` | Riccon SDD 源仓库 |
| spec-kit 项目文件（命令/模板/扩展） | `specify integration upgrade opencode`、`specify extension update <id>` | spec-kit CLI |
| spec-kit CLI 本体 | `specify self upgrade` | 用户决定，团队不自动执行 |

不要混在一起：`sdd upgrade` 只改团队管理的文件；`--spec-kit` 才执行 spec-kit 侧升级，且需要用户明确同意。

## 检查

- `sdd doctor`：Node、git、specify、兼容范围、必需命令/模板/脚本、团队文件 hash、状态 schema、agent 权限/模型同步、默认 agent、AGENTS.md 合同块。
- `sdd compat check`：`specify version --json` + `.specify/init-options.json` + 必需命令/模板/脚本/扩展。
- 兼容范围在 `compat/speckit-1.x.json`；默认 `>=1.4.5 <2.0`。2.0 必须升级团队。

## 升级流程

1. 在团队源仓库运行 `sdd upgrade --project <目标项目> --dry-run`；如果当前在目标项目，先读 `.sdd/project.json` 的 `team_source`，用 `node <team_source>/scripts/sdd.mjs upgrade --project <当前项目> --dry-run`。
2. 看四类结果：新增、更新、删除、本地修改。
3. 本地修改 = 目标文件 hash 与 manifest 记录不一致；默认跳过，避免覆盖项目定制。
4. 用户确认后 `--write`；升级前自动备份到 `.sdd/backup/upgrade-<时间>/`。
5. 冲突处理：优先手工合并；确认可覆盖才 `--force`。
6. 需要 spec-kit 侧升级时，另行同意后 `--write --spec-kit`。
7. 升级后 `sdd doctor` + 项目测试；失败则从备份恢复。

## Manifest

`.sdd/manifest.json` 记录：

- 团队版本、安装时间、spec-kit 版本、兼容范围。
- 每个团队管理文件的路径和 SHA-256。

规则：

- 只管理团队文件；不管理 `.sdd/state.json`、`config.yml`、`brief.md`、`tasks/`、`decisions/`、`evidence/`、`reviews/`、`handoffs/`、`retro/`。
- 不管理 `AGENTS.md` 的项目合同正文；只管理 `sdd:team` 块。
- `opencode.json` 只合并 `default_agent`，不整体覆盖。
- 目标项目的 spec/plan/tasks 永不被团队升级覆盖。

## 团队改进

- 每个里程碑/项目写 `.sdd/retro/RETRO-*.md`。
- `/sdd-improve` 读取 metrics、retro、reviews、decisions，向团队源仓库 `docs/proposals/` 写提案。
- 提案必须包含：问题与证据、影响范围、建议改动、验证方式、风险与回滚。
- 人工审阅后合入团队仓库；不自动修改已安装团队文件。

## 诚实限制

- manifest/hash 能发现文件变化，不能证明“谁批准/谁评审”。
- 本地运行时不能密码学证明证据真实发生；证据是审计线索，不是 attestation。
- spec-kit 升级后命令/模板可能变化；doctor 会失败并给出修复指令，不会静默适配。
