# Company-defined Jira Listener rules

각 company는 새 릴리스를 기다리지 않고 Jira Listener를 사용자 정의할 수 있습니다. Rule은 company process에 local로 저장되며 조건과 Jira/notify action은 model token 없이 deterministic하게 실행됩니다. `/ceo`는 draft와 dry-run을 거쳐 확인 후에만 enable합니다.

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

`parent-auto-done`은 기본 제공 default workflow를 사용하는 회사에서 Epic을 포함해 기본으로 활성화되는 built-in rule입니다. Jira Listener가 파일 수정 없이 deterministic하게 적용합니다. `holding process rule add --template parent-auto-done --project NAIL --company nailly`(비활성 company override)로 비활성화하거나 `holding process rule remove parent-auto-done --company nailly`로 제거할 수 있습니다. custom workflow 회사는 기본 rule을 상속하지 않지만 이 rule이나 원하는 rule을 직접 추가할 수 있습니다. Epic은 기본 포함이며 override에서 `--exclude-epics`로 제외할 수 있습니다.

각 회사는 자체 workflow와 rule을 만들 수 있습니다. rule에는 `/ceo` 또는 `holding process rule add --json`, custom workflow stages에는 `/flow edit` 또는 `/ceo`를 사용합니다. CEO는 draft를 만들고 workflow는 `set_company_flow`의 `dry_run=true`, rule은 `holding process rule test`로 dry-run한 뒤 사용자 확인 후에만 저장합니다.

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
