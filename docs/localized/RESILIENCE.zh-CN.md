# 韧性：出问题时会发生什么

[English](../RESILIENCE.md)

Jira Listener 在不丢失工作的情况下处理三类故障。它从不捏造 Jira 事件。

## 1. 代理压缩 / 上下文丢失 / 中途退出 → 检查点 + 恢复
- 每个阶段将检查点写入 `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`。记录阶段、已完成步骤、已完成的编码子步骤、最后一次提交以及错误。
- 较大的 tech plan 最多分 3 个子步骤编码。每个以 `feature/<KEY>` 上的 `WIP(<KEY>) n/3` 提交结束，卡片收到列出现已完成（✅）与剩余（⏳）的 📌 进度说明。
- 重新运行（`holding staff run <KEY>` 或再次移动卡片）从检查点继续。已完成的 plan、tech plan 与子步骤不会重做。
- 当代理 CLI 报告压缩、截断、上下文溢出或达到最大轮次时，会在带恢复说明的新会话中重试一次。

## 2. 代理过期 / 不可用 → `agent-blocked` + 回退
- 每个 CLI 的退出码与输出归类为：登录过期、积分/配额用尽、限速、缺少 CLI、上下文丢失或超时。
- **限速：** 自动退避重试（30s → 60s → 120s）。
- **回退：** 在 `state/<company>/agents.jsonc` 中为每位员工添加 `fallback` 列表。遇到登录、配额、缺少 CLI 或限速错误时自动使用下一条命令，并在卡片上注明切换。
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **全部失败时：**
  - 卡片加上 `agent-blocked` 标签，并以任务语言评论原因、命令与确切修复（`claude login`、`codex login`、`grok login`、安装 CLI、检查积分）。
  - 你会收到 macOS 通知，`holding status` 显示阻塞。
  - 下一次成功运行时移除标签。

## 3. MCP 服务器问题（宕机、配额、过载、超时）→ 警告 + 对账
- Jira Listener 检测连接丢失、5xx/过载、超时与配额错误。记录红色警告，发送一次通知，并在 `holding status` 中显示。工作暂停并保留检查点。
- 连接恢复时（以及每次 Listener 启动时），读取自上次所见事件以来更新的 Jira issue。每个真实状态重放一次，按 issue + status + 更新时间在本地与 MCP 服务器两侧去重。重放只读 Jira，不写事件。
- 只读命令（`holding status`、`board`、`tasks`、`usage`、…）显示最后一次良好答案，并标为 **STALE** 及时间。写命令明确失败。
- 配额错误打印："MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

测试：`node tests/resilience_test.mjs` 使用会失败的模拟 CLI（认证、过期、配额、限速、压缩、缺失）以及返回 503/429 的模拟 MCP 服务器。

## 4. Jira Listener 停止 → 立即警告，不会丢失

**Jira Listener 维持全部 Jira 自动化运行**（移卡、评论、员工运行）。关闭期间在你再次启动前 Jira 上不会发生任何事，因此会立即通知你：

- **干净停止 / 退出 / 注销**（SIGTERM、SIGINT、SIGHUP、`launchctl bootout`）：退出前告诉 MCP 服务器 "stopped"（约 1 秒）。
- **崩溃、休眠或冻结**：每 60 秒心跳；150 秒没有则 MCP 服务器标为离线。
- **本地 watchdog**（launchd 作业 `com.agentsholding.listener-watchdog`，由 `holding listener start` / `autostart on` 安装）：每 5 秒检查并显示 macOS 通知 *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"*（每 15 分钟提醒）、崩溃后 launchd 重启时 *"Jira Listener restarted"*、恢复时 *"running again"*。日志：`~/Library/Logs/agents-holding/watchdog.log`。
- `holding status`、`holding listener status` 与 `/ceo` 在关闭期间以相同红色警告开头；CEO 收件箱出现 "Jira Listener is off" 项。
- **关闭期间的 Jira 变更**：每张卡片的第一次变更收到一条（任务语言）说明 Listener 已关及如何启动的评论。恢复后清除标志、关闭离线项，并重放错过的变更（对账）；未完成的运行从检查点继续。
- 仅表示“卡片仍在代理正要移出的列”的重放会被忽略（无错误的“你把它拖回去了”）。

## 5. 谁在做卡片（assignee）

员工接手任务时（与 `staff:<id>` 标签同一时刻）将卡片的 Jira assignee 设为该员工的 `jira_user`（可选，在 `agents.jsonc`：Jira accountId 或邮箱）或 Jira Listener 所连接的账户。员工标签保留。在 needs-hire / needs-decision / blocked 以及 Done 时仍保留 assignee。

## 6. 问题去向：CEO 收件箱，从不阻塞运行

凡是需要你的事项（员工问题、1/2/3 决策、招聘、因登录等被阻塞的代理、审批关卡、QC 停止、失败运行、“哪个仓库？”、Jira Listener 关闭）都会成为 **CEO 收件箱** 中的一条待办，以及标题为 **Agents Holding**、含任务键、所需内容与回答方式的 macOS 通知。员工运行从不等待输入：它们发布条目后退出；你的回答从检查点恢复任务。

- `holding inbox [--all] [KEY]`：按公司分组的待办。
- `holding inbox reply KAN-12 2`：不打开会话的快速回答（与在卡片上回复效果相同；不写入 Jira）。
- `holding inbox dismiss <id|KEY>`：关闭你无需回答的条目（不向员工或 Jira 发送任何内容）。
- `holding status` 显示 CEO 收件箱待办数量。
- 通知上的 **Open CEO**，或 `holding ceo --item <id>`：打开聚焦该条目的 CEO 会话（新 Terminal 窗口）。
- `/ceo` 先显示待办。在公司仓库内：仅该公司。在任何公司外：holding 模式，分组显示所有公司的待办与进度。用 `/approve` 批准，用 `holding jira move KAN-12 "Done"` 移动/完成。

**沟通设置**（按公司，`holding company set communication jira+chat|chat`，默认 `jira+chat`）：
- `jira+chat`：问题/决策/进度既评论在卡片上 **又** 进入 CEO 收件箱；两处皆可回答。
- `chat`：卡片上无问题/决策/进度评论；用 `/ceo` 或 `holding inbox reply` 回答。标签、状态与 assignee 仍在 Jira 上更新。

## 密钥与积分

1. **获取密钥。** Setup 提供两项：**Generate key**（本 Mac 的新 Free 密钥，每月 1,500 积分，每台机器终身仅一个 Free 密钥）或 **Import key**（已有密钥）。密钥在隐藏提示中输入，仅保存在 macOS Keychain。
2. **本 Mac 丢失密钥？** 再次运行 Generate key：恢复本机 Free 密钥（相同积分与历史，新密钥；旧的失效）。付费密钥：Import key。
3. **检查。** `holding key show`（密钥 id、套餐、积分、设备）、`holding credit show`、`holding billing`。升级或增加积分时向所有者发送密钥 id（切勿发送密钥本身）。完整价目：[PRICING.md](../PRICING.md)（也可从 `holding billing` 链接）。
4. **套餐（每月积分）。** Free 1,500 · Starter 4,000 · Lite 6,000 · Pro 20,000 · Power 80,000 · Max 180,000 · Ultra 300,000 · Marketplace 20,000 for $10 · Enterprise 定制 — 详见 [PRICING.md](../PRICING.md)。
5. **计费项。** next action 2；advance、Jira 更新、staff brief、record artifact、assign、CEO、inbox post / reply 各 1。其余免费；从不计模型 token。
6. **额外积分**（来自所有者）：当期有效、直到密钥续期（最多保留 90 天），或用尽为止（过期后仍可保留但仅在密钥有效时可用）。
7. **积分用尽或过期。** Jira Listener 以 "Key is no longer valid or out of credits; contact the owner to renew or add credits" 停止。其间的 Jira 变更不会重放；续期后对每张未完成卡片的当前状态进行对账。

## Enterprise 套餐（已规划；下一阶段）

**密钥与积分已上线**（见上节）；此处团队功能属下一阶段。团队版如何运作：

- **仅凭你输入的密钥决定套餐与角色**；无单独登录或角色选择器。角色：
  - **admin**：平台所有者。
  - **personal user**：个人套餐。
  - **enterprise owner**：由 admin 签发的密钥；仅在自有 enterprise 内生成、吊销、续期与管理密钥，不触碰共享/个人密钥池或其他 enterprise。
  - **enterprise employee**：由其 enterprise owner 生成的密钥。
- **每家公司一块共享看板**；共享 CLI 服务器可为整家公司运行 Jira 自动化。
- **员工映射到真实 Jira 用户**（`jira_user`）及角色/权限，并审计谁接手/更改了什么。
- **按 assignee 驱动**：每人运行自己的 Jira Listener；当卡片 assignee 变为该人的 Jira 用户时，其 Listener 用其员工接手。
- **聊天优先**：通过 `/ceo` 或员工聊天交流；Jira 评论可选（沟通设置）。主要入口是 `/ceo KAN-12`：CEO 加载任务并协调员工。

