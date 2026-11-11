# Agents Holding 的 Jira 标签

标签用于显示和路由；Jira 状态、checkpoint 以及经过认证的 evidence 才是事实来源。

| 标签 | 含义 | 添加时机 |
|---|---|---|
| `ah-flow:<name>` | 任务 workflow 模板 | 创建任务或修改 flow |
| `staff:<role>` | 当前 stage 的 staff | stage 开始时 |
| `ah-agent-owned` | Holding 正在协调任务 | 自动处理开始时 |
| `agent-working` | worker 正在运行 | dispatch worker 前 |
| `ah-awaiting-user` | 等待用户操作 | 需要登录、权限、terminal 或批准 |
| `ah-blocked` | 无法自动 remediation | 返回真实用户阻塞 |
| `ah-registration-required` | 路由配置无效 | 无法路由 repo/project |
| `terminal-<slug>` | QC terminal 命令 | 选择已注册 terminal 时 |

临时标签会在下一次 reconcile 时清理。terminal 忙不是 blocker，也不是 QC
失败，而是排队等待。
