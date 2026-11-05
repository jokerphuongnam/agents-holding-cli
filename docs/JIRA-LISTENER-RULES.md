# Company-defined Jira Listener rules

Each company can customize its Jira Listener without waiting for a product release. Rules live locally in `.agents/<company>-company/jira-listener-rules.json` (legacy `.agents/jira-listener-rules.json` is supported). No model is used to evaluate conditions or perform Jira/notification actions. `run_staff` invokes a local staff run only when explicitly configured.

## Interview, dry-run, confirm, attach

Ask `/ceo` for the behavior you want. The CEO drafts the rule, asks for any missing project/condition/action details, and runs a dry-run. It must not enable a rule until you confirm.

Triggers: `issue_transitioned`, `all_subtasks_done`, `assignee_changed`, `label_added`, `comment_created`. Conditions: `project`, `statuses`, `issue_types`, `labels`, `include_epics`, `require_subtasks`. Actions: `transition`, `assign`, `label`, `comment`, `run_staff`, `notify`, targeted at `issue` or `parent` where applicable.

```bash
holding process rule add --template parent-auto-done --project NAIL --company nailly
holding process rule test parent-auto-done --company nailly
holding process rule list --company nailly
# After reviewing the dry-run:
holding process rule add --template parent-auto-done --project NAIL --company nailly --enable --replace
holding listener start
```

`test` reads real Jira issues and prints proposed actions. It never writes to Jira, enables a draft, or posts a synthetic event. Add `--issue NAIL-123` to test a particular real subtask. A no-op dry-run means the current parent/subtask conditions are not met.

The built-in `parent-auto-done` template requires at least one subtask, requires every subtask to be Done, and skips an already-Done parent. **Epics are excluded unless `--include-epics` is explicitly chosen.**

Custom JSON:

```bash
holding process rule add --json '{
  "id": "label-triage",
  "name": "Label after a comment",
  "trigger": {"event": "comment_created", "project": "NAIL"},
  "conditions": {"labels": ["automation"]},
  "actions": [{"type": "label", "target": "issue", "label": "triaged"}]
}' --company nailly
holding process rule test label-triage --issue NAIL-123 --company nailly
holding process rule add --json '<same JSON>' --enable --replace --company nailly
holding process rule remove label-triage --company nailly
```

Use `--repo DIR` when running outside the company repository. Update an existing rule with `--replace`; adding it without `--replace` is rejected. `remove` changes only the local process file. Restart the Jira Listener after enabling/removing a rule. Jira credentials stay in Keychain.
