# 安装 agents-holding（只需 MCP）

[English](../SETUP.md)

不用 `curl | bash`，也不用下载脚本。把 MCP 服务器添加到你的 agent，在浏览器中用 OAuth 登录，然后在 agent 提议安装本地客户端时**同意一次**即可。

MCP 地址:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. 添加 MCP 服务器（一条命令）

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**默认 CLI agent（`grok` 命令）**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

或写入 `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. OAuth 登录（浏览器）

打开 agent → 连接 / Authenticate `agents-holding`。网页打开后选择 **Create key**（本机的 Free key）或 **Import key** 导入已有 key。key 绝不会存进 agent 的配置文件；OAuth 会话会自动刷新。

## 3. 安装本地客户端（第一条消息时批准一次）

你发给 agents-holding 的**第一条**消息（例如 `/holding key show`），回复的开头就是安装请求。agent 会停下来只问一次：

> 要在这台机器上安装 agents-holding 本地客户端吗？它会添加 `holding` 命令、原生 /holding 斜杠命令和一个即时（不用 AI）hook。可安全重复运行；现在不会安装 Jira Listener。

回答**同意**。agent 调用 `install` 工具并运行**一条** shell 命令，显示进度 `[bootstrap 1/5]` … `[bootstrap 5/5]`：

1. 客户端脚本放入 `~/.agents-holding`
2. `holding` 加入 PATH（`~/.local/bin`）
3. 设备 ID 存入 Keychain（不打印任何密钥）
4. 用一次性代码（10 分钟内有效，仅可用一次；key 不会显示）把本机与 agent 会话配对，然后安装斜杠命令和即时 hook
5. 完成；服务器已知本机装有客户端，安装请求不再出现

如果 agent 没有询问，输入：`install agents-holding`（或 `/holding install`）。可安全重复运行。

这一步**不会**安装 Jira Listener。

安装后请**开启新的 agent 会话**，让 agent 加载新命令。

## 4. 在聊天中使用：即时响应，零 AI token

安装后，纯数据命令由 hook 或 shell 在本地直接回答，提示词不会发送给模型：

| Agent | `/holding key show` 的运行方式 |
|---|---|
| CLI `grok` | `/holding key show`: UserPromptSubmit hook（`~/.grok/hooks/agents-holding.json`）即时回答 |
| Claude Code | `/holding key show`: `~/.claude/settings.json` 中的 UserPromptSubmit hook 即时回答 |
| Codex CLI | `/holding key show`：`~/.codex/hooks.json` 中的 UserPromptSubmit hook 即时回答（Codex 会询问一次是否信任新 hook）；`!holding key show` 同样可用 |
| 任意终端 | `holding key show` |

每个即时回答都以 `(agents-holding: instant, no model)` 结尾。

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

需要 agent 的命令（`/ceo`、`/task add`、`/flow edit`、`/jira setup`、`/skill add`）会有意交给模型处理。

### 发送反馈

```
/holding feedback "<text>"
```

直接在聊天里发送反馈（零 AI token）。只有所有者能看到。

## 5. Jira（仅在需要时）

当某个命令或 agent 确实需要 Jira（读取任务、附加文件、移动列、启动 Listener）时：

1. agent 先征求你的同意，再运行 `holding jira connect`（浏览器 OAuth；token 存在 Keychain；聊天中只显示账户名）
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener（本地进程），仅在需要时: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

安装 MCP、创建公司以及与 Jira 无关的命令**永远不会**要求登录 Jira。

## 6. 更新

在聊天中：`/holding update`（或让 agent 运行 `holding update`）。可安全重复运行。

---

## 7. 套餐与价格（积分）

价格表：**[PRICING.md](../../docs/PRICING.md)**：每月积分、价格、员工与设备上限、操作费用、升级方式。

升级：把你的 **key id**（通过 `holding key show` 获取；切勿发送 key 本身）发给所有者 **phuongnamp99@gmail.com**。`holding billing` 和 `holding key show` 始终显示当前联系方式。

在本机: `holding billing` · `holding usage`.

---

## 附录：用脚本安装（不推荐）

仅在 agent 无法执行安装（特殊环境）时使用。这不是默认的安装流程。

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

旧的 `connect.sh` / `install.sh` 脚本为兼容起见仍保留在仓库中；新文档**不再**使用它们。
