MCP alone is enough without the local CLI (AI tokens). CLI = optional zero-token. First ask per key+device; No = no-cli, never ask again on that device.

# agents-holding

[English](../README.md)

在你的编码 agent 里运营一家小型 AI 公司：CEO、员工、流程和 Jira，全部在聊天中完成。

## 简介

agents-holding 把你的 AI 编码 agent（Claude Code、Codex、Cursor 或 `grok` CLI）变成一个由多家小公司组成的控股集团。每家公司都有一位可以对话的 CEO、分工明确的员工（工程师、QC、产品……），以及一套把真实 Jira 任务从想法推进到已合并 pull request 的工作流。只需添加一个 MCP 服务器并登录，即可开始使用。

## 能做什么

- **公司与员工**：创建公司，招聘或辞退员工，为每位员工设置规则、模型和技能。
- **聊天里的 CEO**：`/ceo` 负责规划工作、拆分任务并分配给合适的员工。
- **流程**：公司流程和工作流决定每一步由谁来做（人、AI 还是脚本）。
- **Jira Listener**：在本机运行的进程，监视你的 Jira 看板，卡片移动时启动对应员工，并把结果回报到卡片上。
- **用量与积分**：随时查看套餐、积分条和各员工的用量。

## 优势

1. **以工作流为核心。** 不只是又一个聊天助手：公司 → 员工 → 流程 → Jira Listener 的完整流程，让工作从卡片自动走到规划、开发和评审。
2. **零 token 命令。** 纯数据命令（`/holding key show`、`/holding staff list`、`/holding usage` ……）由 hook 在本机即时回答，提示词不会发送给模型。
3. **一次设置，所有 agent 通用。** 同一套命令可在 Claude Code、Codex 和 `grok` CLI 中使用。
4. **数据留在本地。** 你连接的工具（Jira、Git、文件）在本机运行；key 存在 Keychain 中，绝不写入配置文件。
5. **公平定价。** 只有产生工作的操作才消耗积分；模型 token 永不计费。

```
公司  →  员工  →  流程  →  Jira Listener  →  规划 → 开发 → 评审 → 完成
```

## 安装

添加 MCP 服务器，登录，完成。选择你的 agent：

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

然后打开 agent，在浏览器中认证 `agents-holding`（创建 Free key 或导入你的 key），再随便发一条 agents-holding 消息。第一条消息时 agent 会自动为你设置本地命令；如果它询问，只需批准一次。完整指南：[SETUP](../full/localized/SETUP.zh-CN.md)。

## 常用命令

| 命令 | 作用 |
|---|---|
| `/holding help` | 你的 key 可用的全部命令 |
| `/holding key show` | key id、套餐、积分、设备 |
| `/holding company create` | 创建公司 |
| `/holding staff list` | 员工列表 |
| `/ceo …` | 与 CEO 对话：规划、拆分和分配工作 |
| `/holding usage` | 本期积分条 |
| `/holding billing` | 当前套餐与升级方式 |
| `/holding feedback "<text>"` | 向所有者发送反馈 |
| `/holding update` | 更新本地客户端 |

在 Claude Code、Codex 和 `grok` CLI 中用法相同（Codex 会询问一次是否信任 hook）。完整列表：运行 `holding help`。

→ [COMMANDS.md](../docs/COMMANDS.md) · [SKILLS.md](../docs/SKILLS.md)

## 文档

- [COMMANDS.md](../docs/COMMANDS.md)
- [SKILLS.md](../docs/SKILLS.md)
- [安装指南](../full/localized/SETUP.zh-CN.md)
- [价格表](../docs/localized/PRICING.zh-CN.md)
- 命令参考：运行 `holding help`（或 `holding help <分组|命令>`）
- [公司](../docs/COMPANIES.md) · [谁来决定](../docs/WHO-DECIDES.md) · [稳定性](../docs/RESILIENCE.md)

**隐私。** 我们不会获取你的信息，只记录使用习惯（常用的工作时间、用聊天还是评论、工具的配置方式）。你连接的所有工具和本机数据都只留在你的机器上。
