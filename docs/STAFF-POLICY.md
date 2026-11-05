# Staff rules, permissions and processes

Languages: [Tiếng Việt](localized/STAFF-POLICY.vi.md) · [日本語](localized/STAFF-POLICY.ja.md) · [한국어](localized/STAFF-POLICY.ko.md) · [简体中文](localized/STAFF-POLICY.zh-CN.md) · [Español](localized/STAFF-POLICY.es.md) · [Français](localized/STAFF-POLICY.fr.md) · [Deutsch](localized/STAFF-POLICY.de.md)

Each company has **one shared configuration**. It includes company-wide defaults, and each staff member can have an extra section of their own. holding turns this into each agent's own config every time that agent runs. Only the owner or a company admin can change it, and staff cannot loosen their own permissions.

## Rules and permissions
```
holding staff policy show <staff|*>                      show config (* = whole company)
holding staff policy set <staff|*> <permission> on|off   e.g. mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         plain-text rules the AI reads while working
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Git rules (branch name, commit format, PR title, required PR checklist items) are checked by the server. Violations are refused with a clear reason.

When you add staff (`holding staff add <role>`), an arrow-key menu shows the role defaults: accept them or edit. Set `AH_NONINTERACTIVE=1` to take the defaults without asking.

## File denylist
```
holding company deny add <path> [--replace <file>]     block a file for every staff
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
When the AI reads a blocked file, it only gets a note that the file is blocked — never the real contents. With `--replace` (for example `.env` → `.env.example`), the AI gets the replacement file's contents instead. The replacement is scanned first so it cannot leak a real secret. Company and staff denylists are combined, and staff cannot remove an entry the company already blocked.

## Company processes (Jira Listener)
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
Example: when a task in project X moves to status S, the Jira Listener does the configured work (change status, comment, assign, notify the CEO) on linked tasks in projects Y and Z. The Listener only uses real Jira links, does each action once, and never loops.

## Update
`holding update`, or type `/holding update` in chat. This updates the client, regenerates agent config, re-syncs chat commands and restarts the Jira Listener. Running it again is safe. When the client is outdated, the AI is prompted and can run this for you.

## Attachments, Figma, Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         attach local files to an issue
holding figma connect                                        save a Figma token in the Keychain (hidden prompt, checked with /v1/me)
holding figma export "<Figma link with node-id>" --attach NAIL-12   export a frame as PNG and attach it
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
These commands use the Atlassian token already in the Keychain and never print the token. Staff need `jira_attach` (on by default), `figma_export` (on by default) and `confluence_write` (CEO, lead and manager only by default). Add `--dry` to preview without sending anything.
