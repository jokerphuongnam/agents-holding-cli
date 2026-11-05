# Company-defined Jira Listener rules

Jede Company kann den Jira Listener ohne ein neues Release anpassen. Regeln liegen lokal im Company-Prozess; Bedingungen und Jira-/Notify-Aktionen laufen deterministisch ohne Model-Tokens. `/ceo` erstellt einen Entwurf, führt einen Dry-Run aus und aktiviert erst nach Bestätigung.

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

内置 `parent-auto-done` 要求至少一个 subtask 且全部 Done；parent 已 Done 时跳过。Epic 默认排除，只有显式选择 `--include-epics` 才包含。

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
