# {{PROJECT_NAME}}

> 本项目由 **Riccon SDD** 管理。你只需要与 `sdd/lead` 对话；lead 会调度其他子代理并决定执行哪些 spec-kit 命令。

<!-- sdd:contract:start -->
## 项目合同

- 项目类型：greenfield
- 技术栈：待填写
- 仓库地图：待填写
- 构建命令：待填写
- 测试命令：待填写
- 覆盖率目标：line 80% / branch 70%
- E2E 命令：待填写（没有就写 none）
- 安全/合规约束：待填写
- Definition of Done：
  - [ ] 代码已提交（中文 commit）
  - [ ] 相关自动化测试通过
  - [ ] 证据已记录到 `.sdd/evidence/`
  - [ ] 高风险任务有独立评审
  - [ ] quickstart/README 已更新（如适用）
- 决策所有者：产品范围、UX 方向、预算、风险例外 = 用户；常规技术选择 = 团队
- 风险等级：medium

<!-- sdd:contract:end -->

<!-- sdd:team:start -->
## 团队规则

- 只有 `sdd/lead` 可以与用户对话、派生子代理。
- 所有子代理禁止 `question` 和 `subagent`；问题必须回流给 lead。
- `sdd/lead` 不写生产源码、测试和迁移。
- `sdd/builder` 只改任务 `write_scope` 内的文件；提交后取证，不能自己标 done。
- `sdd/verifier` 用新上下文独立验证，不修源码。
- 状态以 `.sdd/` 为准；聊天历史不是记忆。
- 每次门禁批准记录在 `.sdd/decisions/`。
- 全中文沟通；spec-kit 结构标题、代码标识符、API、命令、日志键保持英文。
- 不要运行 `/speckit.implement` 端到端；lead 只使用它的预检和任务语义，实现按任务派发。
<!-- sdd:team:end -->

## 快速开始

- `/sdd-start`：开始或继续项目
- `/sdd-status`：查看阶段、门禁、任务和下一步
- `/sdd-resume`：从 `.sdd/` + handoff 恢复
- `/sdd-review`：生成评审包并推动门禁
- `/sdd-decision`：处理开放决策
- `/sdd-improve`：复盘并向团队仓库提交改进提案
- `/sdd-upgrade`：检查/升级团队与 spec-kit 集成
