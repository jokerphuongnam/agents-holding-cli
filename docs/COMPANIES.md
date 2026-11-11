# Companies

Languages: [Tiếng Việt](localized/COMPANIES.vi.md) · [日本語](localized/COMPANIES.ja.md) · [한국어](localized/COMPANIES.ko.md) · [简体中文](localized/COMPANIES.zh-CN.md) · [Español](localized/COMPANIES.es.md) · [Français](localized/COMPANIES.fr.md) · [Deutsch](localized/COMPANIES.de.md)

One holding, many companies. Each company has its own staff, Jira board, Jira Listener and settings; settings it does not override follow the holding defaults.

Chat: `/ceo companies` (list) · `/ceo company <verb> ...` (same verbs as below). Terminal: `holding company <verb>`.

| Command | What it does |
|---|---|
| `holding company list` / `count` / `overview` | Companies connected to holding (children shown under their parent), status, staff, Jira, Jira Listener. `overview` adds health: open/blocked tasks, items waiting for you, credits (30 days). |
| `holding company show [name]` | Product, status, parent/children, staff, Jira, Jira Listener, board columns, task counts, credits, config. |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | New company with the default staff and the default board (incl. Reopened and Blocked). |
| `holding company rename <c> <new name>` | Display name only; the id stays, so repos and Jira keep working. |
| `holding company pause / resume / archive <c>` | Paused/archived companies start no new work and spend nothing. |
| `holding company delete <c> --confirm <c>` | Only after `archive`, and only with no child companies. Repo, local files and Jira board are not touched. |
| `holding company move <c> --parent <P|none>` | Change the parent. |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | Move or add a staff role between companies (plan limits apply). |
| `holding company link <c> <KEY>` / `unlink <c>` | Link or unlink the Jira board. |
| `holding company config [c] [set|unset <key> <value>]` | Per-company overrides: `communication`, `auto-pr`, `flow`, `share-skills`. `unset` = back to the holding default. `config defaults [set ...]` edits the holding defaults. |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | Bring an older local company (`.agents/*-company`) into holding. See below. |

Only companies connected to holding are listed. Older local-only companies are not shown (and never deleted) until you migrate them.

## Migrating an older local company

`holding company migrate <repo or .agents/x-company folder>`

The migration reads the canonical role catalog from `.grok/agents`, `.claude/agents`,
and `.codex/agents` (all harnesses are supported). Files ending in ` 2.md` or
` 3.md` are treated as iCloud duplicates. Role ids, parent links, and layout paths
are reconciled idempotently into the holding company; the imported roster is not
truncated by the interactive hiring limit, and existing provider bindings, skills,
plans, and parent-child relationships are preserved.
1. Backs up the folder to `~/.config/agents-holding/backups/<name>-<time>.tgz` (originals stay on disk).
2. Sends only names and counts: staff role ids, number of plans, parent, creation time. No file contents.
3. Staff whose role exists in the holding catalog become real staff (up to the plan limit, see below). Custom roles (not in the catalog) are recorded by name only in the company's history; holding does not read their persona files. To keep reusing one, turn it into a private repo skill at `.agents/custom-skills/<id>/SKILL.md`.
4. Writes `.agents/company.json` in the repo and registers the repo. Re-running is safe (updates the same company).
Migrate the parent first, then children with `--parent <parent>`.

After migrating, only `.agents/company.json` is read. The old `.agents/<x>-company` folder can be removed once you have a full backup (the migrate backup skips `cache/`): `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`.
Suggested layout for what you keep: `.agents/cache/` and `.agents/plans/` (personal, keep untracked) and `.agents/custom-skills/<id>/` (private repo skills, never published). Holding does not require a specific location for cache or plans.
Migrate child companies (`children/<child>` pointing to another repo) separately before removing the parent's old folder.

## Jira project/repository registration invariant

The canonical mapping is the company config in each repository (`.agents/company.json`) plus the explicit Jira project mapping created by `holding project add`. The listener reconciles this mapping on startup and after migration; `holding project list` also reports invalid mappings. Parent and child companies are independent registrations and may route issues across teams through their registered project keys. A valid mapping is never skipped because the listener happened to start from another repository.

Duplicate project/company mappings, missing repositories, missing or mismatched `.agents/company.json`, and incomplete entries are registration errors. The listener posts one actionable Jira comment, adds `ah-registration-required`, records the pending marker, and does not run the task until the mapping is fixed. Once the canonical config and registry agree, the marker is cleared and routing resumes. Local cache, an old listener process, or a stale `projects.json` is not evidence of a valid registration.

## Staff limits per plan

Each company's roster can hold at most this many staff (CEO included). Applies to `/staff add`, `holding company staff move|assign`, `holding company migrate` and new companies. Full pricing (credits, devices, action costs): [PRICING.md](PRICING.md).

| Plan | Max staff per company |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | Unlimited |
| Enterprise | Unlimited |
| Older keys without a credit plan: trial / monthly / yearly | 20 / 30 / 50 |

At the limit you get: "Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan." Migrate keeps the first N staff and reports how many were skipped.

## Board columns

New companies get: To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done.
- **Reopened**: move a card here when a test fails; the agent resumes Coding.
- **Blocked**: the card waits for you; agents never move a card into or out of it on their own.

Existing companies keep their board as is. To add Reopened/Blocked to an existing board:
1. In chat: `/flow edit` and ask to add Reopened (before Coding) and Blocked (before Done); confirm the drawn flow.
2. In the repo: `holding jira setup-workflow <site> <email> <KEY>` with `AH_FLOW_JSON` set to the saved flow (the agent does this for you), then drag the columns into the printed order (Jira has no API to reorder columns).

### Custom columns per company
Any company can have its own extra columns (`/flow edit`). Example (test promotion), inserted after In Review:
Ready Testing on Develop → Verified on Develop (opens a PR into `develop`) → Ready Testing on Integration → Verified on Integration (opens a PR from the feature branch into `main`) → Blocked → Done.
PRs open only when auto-PR is on for that company (`holding company config <c> set auto-pr on`).
Note: moving the card to Done when the `main` PR merges is not automatic yet; move it to Done yourself after the merge.

### Automatic artifact cleanup
The workflow reads the repository's local `artifact_policy`. When
`cleanup_unrequested_files` is enabled, Coding records the pre-run tree and
removes newly-created, untracked Markdown files that were not part of the
task. `cleanup_paths` may list known tracked files to remove; those deletions
are committed as a separate `chore(<issue>): remove workflow artifacts`
commit before the task reaches In Review. Protected paths are never removed.
This keeps the feature branch auditable and lets a later squash merge exclude
the cleanup files from `develop`/`main` without rewriting history.
