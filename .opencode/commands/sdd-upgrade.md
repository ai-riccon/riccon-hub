---
description: 检查团队与 spec-kit 版本兼容性，dry-run 升级；只有用户批准后才写。
agent: sdd/lead
---

# /sdd-upgrade

1. 运行 `SDD doctor`、`SDD compat check`。
2. 读 `.sdd/project.json` 的 `team_source`。如果当前是目标项目的已安装 runtime（`sdd upgrade` 会拒绝），改用团队源仓库的 CLI：
   ```bash
   node <team_source>/scripts/sdd.mjs upgrade --project <当前项目> --dry-run
   ```
   如果 `team_source` 不存在，向用户要团队仓库路径。
3. 向用户报告：
   - 团队版本 vs 项目安装版本
   - spec-kit 版本 vs 兼容范围
   - 将要新增/更新/删除的文件
   - 本地修改冲突
   - 是否需要同时升级 spec-kit 集成/扩展
4. 只有用户明确同意后才运行写入；由于目标项目内的 runtime 不能自升级，用团队源仓库 CLI 并加 `--yes`：
   ```bash
   node <team_source>/scripts/sdd.mjs upgrade --project <当前项目> --write --yes
   ```
   有本地修改冲突时先解释，再决定 `--force` 还是手工合并。
5. 需要升级 spec-kit 侧时，单独征得同意后运行 `--write --yes --spec-kit`，并说明它会执行 `specify integration upgrade opencode` / `specify extension update`。
6. 升级后运行 `SDD doctor` 和 `npm test`（如果项目有测试），报告结果。
7. 不要在未备份/未 dry-run 的情况下直接写。
