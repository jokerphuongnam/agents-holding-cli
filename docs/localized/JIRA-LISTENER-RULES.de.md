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

`parent-auto-done` ist eine aktivierte integrierte Standardregel für Unternehmen mit dem integrierten default workflow, einschließlich Epics. Der Jira Listener wendet sie deterministisch an, ohne dass eine Datei bearbeitet werden muss. Deaktivieren mit `holding process rule add --template parent-auto-done --project NAIL --company nailly` (disabled company override) oder entfernen mit `holding process rule remove parent-auto-done --company nailly`. Unternehmen mit custom workflow erben die Standardregel nicht, können diese oder beliebige andere Regeln selbst hinzufügen. Epics sind standardmäßig enthalten; `--exclude-epics` schließt sie für eine company override aus.

Jedes Unternehmen kann eigene workflows und Regeln erstellen: `/ceo` oder `holding process rule add --json` für Regeln; `/flow edit` oder `/ceo` für custom workflow stages. Der CEO erstellt einen Entwurf, führt einen dry-run aus (`set_company_flow` mit `dry_run=true` für workflows; `holding process rule test` für Regeln) und speichert erst nach Bestätigung.

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
