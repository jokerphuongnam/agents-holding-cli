# Company-defined Jira Listener rules

Chaque company peut personnaliser Jira Listener sans attendre une nouvelle version. Les règles sont locales au company process ; conditions et actions Jira/notify sont déterministes, sans tokens de modèle. `/ceo` prépare un brouillon, effectue un dry-run et active seulement après confirmation.

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

`parent-auto-done` est une règle intégrée activée par défaut pour les entreprises utilisant le default workflow, Epics inclus. Le Jira Listener l’applique de manière déterministe sans modifier de fichier. Désactivez-la avec `holding process rule add --template parent-auto-done --project NAIL --company nailly` (company override désactivé) ou supprimez-la avec `holding process rule remove parent-auto-done --company nailly`. Les entreprises avec un custom workflow n’héritent pas de cette règle mais peuvent ajouter celle-ci ou toute autre règle. Les Epics sont inclus par défaut ; utilisez `--exclude-epics` pour les exclure dans un override.

Chaque entreprise peut créer ses propres workflows et règles : `/ceo` ou `holding process rule add --json` pour les règles ; `/flow edit` ou `/ceo` pour les custom workflow stages. Le CEO prépare un brouillon, effectue un dry-run (`set_company_flow` avec `dry_run=true` pour les workflows ; `holding process rule test` pour les règles), puis enregistre uniquement après confirmation.

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
