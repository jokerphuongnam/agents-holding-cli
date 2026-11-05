# Company-defined Jira Listener rules

每个 company 都可以自定义 Jira Listener，无需等待新版本。Rule 本地保存在 company process 中；条件和 Jira/notify action 以 deterministic 方式运行，不消耗 model token。`/ceo` 先 draft、dry-run，只有确认后才 enable。

Triggers: `issue_transitioned`, `all_subtasks_done`, `assignee_changed`, `label_added`, `comment_created`.
Conditions: `project`, `statuses`, `issue_types`, `labels`, `include_epics`, `require_subtasks`.
Actions: `transition`, `assign`, `label`, `comment`, `run_staff`, `notify`（target: `issue` 或 `parent`）。

```bash
holding process rule add --template parent-auto-done --project NAIL --company nailly
holding process rule test parent-auto-done --company nailly
holding process rule list --company nailly
# Dry-run 检查并确认后：
holding process rule add --template parent-auto-done --project NAIL --company nailly --enable --replace
holding listener start
```

`test` 只读取真实 Jira issue 并显示 action：`jira_writes: 0`；不写入 Jira、不 enable draft、不发送模拟 event。可用 `--issue NAIL-123` 指定 subtask。无 action 表示当前条件未满足。

`parent-auto-done` 是使用内置 default workflow 的 company 默认启用的内置 rule，包含 Epic。Jira Listener 会 deterministic 地应用它，无需编辑文件。运行 `holding process rule add --template parent-auto-done --project NAIL --company nailly` 保存禁用的 company override 可禁用它，或运行 `holding process rule remove parent-auto-done --company nailly` 删除它。使用 custom workflow 的 company 不继承此默认 rule，但可以自行添加此 rule 或任何其他 rule。Epic 默认包含；创建 override 时使用 `--exclude-epics` 可排除 Epic。

每个 company 都可以创建自己的 workflow 和 rule：rule 使用 `/ceo` 或 `holding process rule add --json`；custom workflow stages 使用 `/flow edit` 或 `/ceo`。CEO 创建 draft，workflow 用 `set_company_flow` 的 `dry_run=true`、rule 用 `holding process rule test` 做 dry-run，确认后才保存。

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
