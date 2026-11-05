# Companies / Công ty

One holding, many companies. Each company has its own staff, Jira board, Jira Listener and settings; settings it does not override follow the holding defaults.
Một holding có nhiều công ty. Mỗi công ty có nhân sự, bảng Jira, Jira Listener và cấu hình riêng; cái gì không đặt riêng thì theo mặc định của holding.

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
Chỉ công ty đã kết nối holding mới hiện trong danh sách. Công ty cũ chỉ có ở máy sẽ ẩn (không bị xoá) cho tới khi bạn chuyển nó vào.

## Migrating an older local company / Chuyển công ty cũ vào holding

`holding company migrate <repo or .agents/x-company folder>`
1. Backs up the folder to `~/.config/agents-holding/backups/<name>-<time>.tgz` (originals stay on disk).
2. Sends only names and counts: staff role ids, number of plans, parent, creation time. No file contents.
3. Staff whose role exists in the holding catalog become real staff (up to the plan limit, see below). Custom roles are recorded by name in the company's history and keep their persona files locally.
4. Writes `.agents/company.json` in the repo and registers the repo. Re-running is safe (updates the same company).
Migrate the parent first, then children with `--parent <parent>`.

## Staff limits per plan / Giới hạn staff theo gói

Each company's roster can hold at most this many staff (CEO included). Applies to `/staff add`, `holding company staff move|assign`, `holding company migrate` and new companies. Pricing is unchanged.
Mỗi công ty có tối đa số staff dưới đây (tính cả CEO). Áp dụng cho thêm staff, chuyển staff, migrate và tạo công ty mới. Giá không đổi.

| Plan / Gói | Max staff per company |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | Unlimited / Không giới hạn |
| Enterprise | Unlimited / Không giới hạn |
| Older keys without a credit plan: trial / monthly / yearly | 20 / 30 / 50 |

At the limit you get: "Đã đạt giới hạn N staff của gói X. Hãy cho nghỉ (fire) một staff trước hoặc nâng cấp gói." Migrate keeps the first N staff and reports how many were skipped.

## Board columns / Các cột trên bảng

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
