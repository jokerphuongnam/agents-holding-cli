# Company-defined Jira Listener rules

各 company は新しいリリースを待たずに Jira Listener をカスタマイズできます。Rule は company process に local 保存され、条件と Jira/notify action は model token を使わず deterministic に実行されます。`/ceo` は draft と dry-run を行い、確認後にのみ enable します。

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

`parent-auto-done` は、組み込み default workflow を使用する company で有効な組み込みデフォルト rule で、Epic も対象です。Jira Listener がファイル編集なしで deterministic に適用します。`holding process rule add --template parent-auto-done --project NAIL --company nailly`（無効な company override）で無効化、`holding process rule remove parent-auto-done --company nailly` で削除できます。custom workflow の company はデフォルトを継承しませんが、この rule や任意の rule を追加できます。Epic はデフォルトで含まれます。除外する company override には `--exclude-epics` を使います。

各 company は独自の workflow と rule を作成できます。rule には `/ceo` または `holding process rule add --json`、custom workflow stages には `/flow edit` または `/ceo` を使います。CEO は draft を作成し、workflow は `set_company_flow` の `dry_run=true`、rule は `holding process rule test` で dry-run し、確認後にのみ保存します。

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
