# Company-defined Jira Listener rules

Cada company puede personalizar Jira Listener sin esperar una nueva versión. Las reglas se guardan localmente en el company process; condiciones y acciones Jira/notify se ejecutan de forma determinista sin tokens de modelo. `/ceo` prepara el borrador, hace dry-run y solo lo activa tras tu confirmación.

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

`parent-auto-done` es una regla predeterminada integrada y activada para las empresas que usan el default workflow, incluidos los Epics. El Jira Listener la aplica de forma determinista sin editar archivos. Se puede desactivar con `holding process rule add --template parent-auto-done --project NAIL --company nailly` (override desactivado) o eliminar con `holding process rule remove parent-auto-done --company nailly`. Las empresas con custom workflow no heredan esta regla, pero pueden añadir esta o cualquier otra. Los Epics están incluidos de forma predeterminada; usa `--exclude-epics` para excluirlos en un override.

Cada empresa puede crear sus propios workflows y reglas: `/ceo` o `holding process rule add --json` para reglas; `/flow edit` o `/ceo` para custom workflow stages. El CEO prepara un borrador, ejecuta dry-run (`set_company_flow` con `dry_run=true` para workflows; `holding process rule test` para reglas) y solo guarda después de la confirmación.

Custom JSON 使用 `holding process rule add --json '<rule JSON>' --company nailly`。更新已有 rule 加 `--replace`；删除用 `holding process rule remove <id> --company nailly`。在 company repo 外运行可加 `--repo DIR`。enable/remove 后重启 Jira Listener。Jira credential 保存在 Keychain。

完整英文说明见 [JIRA-LISTENER-RULES.md](../JIRA-LISTENER-RULES.md)。
