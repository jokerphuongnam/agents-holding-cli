# 命令参考

[English](../COMMANDS.md)

你的密钥可用的全部命令。在聊天中输入 `/holding <命令>`(例如 `/holding key show`);在终端中输入 `holding <命令>`。这些命令即时返回,不消耗 AI。`/ceo` 和 `/approve` 是代理命令。

## 安装与帮助

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding help [group\|command]` | 你的密钥可用的全部命令 | `holding help staff` |
| `holding setup sync [--claude]` | 把斜杠命令装进你的代理 | `holding setup sync` |
| `holding doctor [--server]` | 检查每个安装步骤 | `holding doctor` |
| `holding status` | 安装与通知状态 | `holding status` |

## 许可证密钥

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding key show` | 密钥 ID、套餐、额度、设备 | `holding key show` |
| `holding key generate` | 为本机创建免费密钥 | `holding key generate` |
| `holding key import` | 使用已有密钥(隐藏输入) | `holding key import` |

## 公司

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | 列出、查看或选择公司 | `holding company use acme` |
| `holding company create [name] [--parent P]` | 创建公司(不填名称=当前文件夹) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | 管理公司 | `holding company pause acme` |
| `holding company migrate <folder>` | 导入旧的本地公司 | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | 公司设置 | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | 对所有员工屏蔽文件 | `holding company deny add .env` |

## 员工

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding staff list` | 你的员工 | `holding staff list` |
| `holding staff add <role> \| remove <role>` | 添加或移除角色 | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | 员工规则与权限(所有代理通用) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | 对某员工屏蔽文件 | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | 为员工选择 AI 与模型 | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | 运行或测试员工 | `holding staff test qa` |

## 流程与工作流

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | 由 Jira Listener 执行的公司流程 | `holding company process list` |
| `holding flow show \| list` | 工作流 | `holding flow show` |
| `holding project add\|remove\|list` | 关联到 Jira 项目的仓库 | `holding project list` |
| `holding habit list\|edit\|clear` | 已学习的习惯 | `holding habit list` |

## 任务

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding task list [all] \| history [n]` | 任务与历史 | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | 规划或分配任务 | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | 批准计划(在代理中) | `/approve KAN-12` |

## 按角色的 AI

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding provider list \| set \| unset` | 每个角色使用的 AI | `holding provider list` |

## 技能

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding skill add <staff> <skill>` | 为员工添加技能 | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | 自定义技能或员工可用技能 | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | 技能目录、校验与同步 | `holding skill check` |
| `holding skill private\|public <name>` | 设为私有或公开 | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | 允许技能脚本运行 | `holding skill consent my-tool` |

## Jira 与 Jira Listener

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding jira connect <site> <email>` | 把 Jira 令牌存入钥匙串 | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | 查看 Jira | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | 修改 Jira 卡片 | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | 把文件附加到事项 | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | Jira Listener | `holding listener status` |

## Figma

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | 登录 Figma(钥匙串) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | 把画框导出为 PNG | `holding figma export <url> --attach KAN-12` |

## Atlassian 与 Confluence

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | 仅在需要时登录 Atlassian | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | 创建或更新 Confluence 页面 | `holding confluence page create ENG "Release" --file notes.md` |

## CEO 收件箱

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding inbox list [--all] [KEY]` | 员工待处理的问题与决定 | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | 回答后员工从中断处继续 | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | 不回答直接关闭 | `holding inbox dismiss KAN-12` |

## 与 CEO 对话

| 命令 | 作用 | 示例 |
|---|---|---|
| `/ceo <request>` | 规划、拆分并分配给员工 | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | 针对单项打开 CEO 会话 | `holding ceo KAN-12` |

## 用量与报告

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding usage [--by day\|staff]` | 本期额度条 | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | 你自己的用量报告(仅计数) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | 你的密钥通知 | `holding notify list` |

## 套餐与额度

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding credit show` | 你的额度 | `holding credit show` |
| `holding billing \| billing usage [days]` | 套餐、当前套餐与升级方式 | `holding billing` |

## 反馈

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding feedback "<text>"` | 发送反馈 | `holding feedback "the inbox is great"` |



## codegraph

```bash
holding codegraph list|detect|status|use <name>|clear
```

Auto-detect PATH/MCP/index; 0→prism, 1→silent, several→ask once per company.

## dependency

添加一整仓技能/脚本 git 依赖，供所有 agent 阅读。包克隆到项目外（`~/.agents-holding/packs/<name>`）；公司只保存引用行。

```bash
holding dependency add <git-url>
holding dependency list
holding dependency update <name|url>
holding dependency remove <name|url>
holding dependency consent <name>
holding dependency run <name> <script>
```

包内技能/命令会适配 Grok、Claude、Codex 与本地 AI。脚本需先 consent 才能运行。

## 更新

| 命令 | 作用 | 示例 |
|---|---|---|
| `holding update` | 更新本地客户端、命令和 Jira Listener | `holding update` |

另见:[技能](../SKILLS.md)。运行 `holding help` 查看你的密钥可用的命令。
