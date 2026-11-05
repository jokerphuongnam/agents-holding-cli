# 员工规则、权限与流程

[English](../STAFF-POLICY.md)

每家公司有 **一份共享配置**。其中包含公司范围的默认值，以及每位员工可选的额外部分。holding 在每次运行时把该配置转成各代理自己的配置。只有所有者或公司管理员可以修改，员工不能自行放宽权限。

## 规则与权限
```
holding staff policy show <staff|*>                      查看配置（* = 整家公司）
holding staff policy set <staff|*> <permission> on|off   例如：mark_done、pr_merge、push_protected、call_staff
holding staff policy rule add <staff|*> "<rule>"         纯文本规则，AI 工作时会阅读
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Git 规则（分支名、提交格式、PR 标题、必填 PR 检查项）由服务器校验。违规会以明确原因拒绝。

添加员工时（`holding staff add <role>`），方向键菜单会显示角色默认值：直接接受或编辑。设置 `AH_NONINTERACTIVE=1` 可无需询问即采用默认值。

## 文件黑名单
```
holding company deny add <path> [--replace <file>]     对所有员工屏蔽文件
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
当 AI 读取被屏蔽的文件时，只会收到该文件已被屏蔽的提示，永远看不到真实内容。若有 `--replace`（例如 `.env` → `.env.example`），AI 会收到替换文件的内容。替换文件会先被扫描，确保不会泄露真实密钥。公司与员工的黑名单会合并，员工不能删除公司已屏蔽的条目。

## 公司流程（Jira Listener）
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
示例：当项目 X 中的任务进入状态 S 时，Jira Listener 会对项目 Y、Z 中的关联任务执行已配置的操作（改状态、评论、指派、通知 CEO）。Listener 只使用真实的 Jira 链接，每项操作只做一次，且不会循环。

## 更新
`holding update`，或在聊天中输入 `/holding update`。这会更新客户端、重新生成代理配置、重新同步聊天命令并重启 Jira Listener。重复运行是安全的。客户端过旧时，AI 会提示并可代你运行此命令。

## 附件、Figma、Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         将本地文件附加到 issue
holding figma connect                                        将 Figma 令牌存入 Keychain（隐藏输入，用 /v1/me 校验）
holding figma export "<Figma link with node-id>" --attach NAIL-12   导出帧为 PNG 并附加
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
这些命令使用 Keychain 中已保存的 Atlassian 令牌，且从不打印令牌。员工需要 `jira_attach`（默认开启）、`figma_export`（默认开启）和 `confluence_write`（默认仅 CEO、lead、manager）。加 `--dry` 可预览而不发送任何内容。
