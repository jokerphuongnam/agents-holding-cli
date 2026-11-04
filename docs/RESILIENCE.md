# Resilience: what happens when something breaks

The Jira Listener handles three kinds of failure without losing work. It never invents Jira events.

## 1. Agent compaction / context loss / mid-run death → checkpoint + resume
- Each stage writes a checkpoint to `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`. The checkpoint records the stage, the finished steps, the coding sub-steps already done, the last commit and any error.
- Larger tech plans are coded in up to 3 sub-steps. Each one ends in a `WIP(<KEY>) n/3` commit on `feature/<KEY>`, and the card gets a 📌 progress note listing what is done (✅) and what remains (⏳).
- A rerun (`holding run <KEY>` or moving the card again) resumes from the checkpoint. Finished plans, tech plans and sub-steps are not redone.
- When the agent CLI reports compaction, truncation, a context overflow or a max-turns limit, the call is retried once in a fresh session with a resume note.

## 2. Agent expired / unavailable → `agent-blocked` + fallback
- Each CLI's exit code and output are classified as one of: login expired, out of credits/quota, rate limited, CLI missing, context lost or timed out.
- **Rate limit:** retried automatically with backoff (30s → 60s → 120s).
- **Fallback:** add a `fallback` list per staff member in `state/<company>/agents.jsonc`. On a login, quota, missing-CLI or rate-limit error, the next command is used automatically, and the card notes the switch.
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **When nothing works:**
  - The card gets the label `agent-blocked` and a comment in the task's language with the cause, the command and the exact fix (`claude login`, `codex login`, `grok login`, install the CLI, check credits).
  - You get a macOS notification, and `holding status` shows the block.
  - The label is removed on the next successful run.

## 3. MCP server problems (down, quota, overload, timeout) → warning + reconcile
- The Jira Listener detects a lost connection, 5xx/overload responses, timeouts and quota errors. It logs a red warning, sends one notification, and `holding status` shows it. Work pauses and the checkpoint is kept.
- When the connection comes back (and each time the listener starts), the listener reads Jira for issues updated since the last event it saw. It replays each real status once, deduplicated by issue + status + update time both locally and on the MCP server. Replay only reads Jira and never writes events.
- Read-only commands (`holding status`, `board`, `tasks`, `usage`, …) show the last good answer, marked **STALE** with its time. Write commands fail clearly instead.
- Quota errors print a clear message: "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

Tests: `node tests/resilience_test.mjs` uses mock CLIs that fail with auth, expired, quota, rate-limit, compaction and missing errors, plus a mock MCP server that returns 503/429.

## 4. Jira Listener stops → warned at once, nothing is lost

**The Jira Listener keeps all Jira automation running** (card moves, comments, staff runs). When it is off, nothing happens on Jira until you start it again, so you are told immediately:

- **Clean stop / quit / logout** (SIGTERM, SIGINT, SIGHUP, `launchctl bootout`): the listener tells the MCP server "stopped" before exiting (~1 s).
- **Crash, sleep or freeze**: the listener sends a heartbeat every 60 s; after 150 s without one the MCP server marks it offline.
- **Local watchdog** (launchd job `com.agentsholding.listener-watchdog`, installed with `holding jira-listener start` / `autostart on`): checks every 5 s and shows a macOS notification *"Jira Listener is off — all Jira automation is stopped until you start it: `holding jira-listener start && holding jira-listener autostart on`"* (reminder every 15 min), *"Jira Listener restarted"* when it crashed and launchd restarted it, and *"running again"* when it is back. Log: `~/Library/Logs/agents-holding/watchdog.log`.
- `holding status`, `holding jira-listener status` and `/ceo` start with the same red warning while it is off; the CEO inbox gets a "Jira Listener is off" item.
- **Jira changes while it is off**: the first change on each card gets ONE comment (in the task's language) saying the Jira Listener was off and how to start it. When it is back, the flag clears, the offline item closes, and every missed change is replayed (reconcile); unfinished runs resume from their checkpoint.
- A replayed change that is only "the card is still in the column the agent is moving it out of" is ignored (no false "you moved it back").

## 5. Who is working on a card (assignee)

When a staff picks up a task (same moment as the `staff:<id>` label) the card's Jira assignee is set to the staff's `jira_user` (optional, in `agents.jsonc`: Jira accountId or email) or else the Jira account the Jira Listener is connected with. The staff label stays. The assignee is kept on needs-hire / needs-decision / blocked and on Done.

## 6. Where questions go: CEO inbox, never a blocked run

Everything that needs you (a staff question, a 1/2/3 decision, a hire, an agent blocked e.g. by a login, an approval gate, a QC stop, a failed run, "which repo?", Jira Listener off) becomes ONE pending item in the **CEO inbox** and a macOS notification titled **Agents Holding** with the task key, what is needed and how to answer. Staff runs never wait for input: they post the item and exit; your answer resumes the task from its checkpoint.

- `holding inbox [--all] [KEY]`: pending items, grouped by company.
- `holding reply KAN-12 2`: quick answer without opening a session (same effect as replying on the card; nothing is written to Jira).
- **Open CEO** button on the notification, or `holding ceo --item <id>`: opens a CEO session (new Terminal window) focused on that item.
- `/ceo` shows pending items first. Inside a company repo: only that company. Outside any company: holding mode, every company's pending items and progress, grouped; resolve any item from there. Approve with `/approve`, move/mark done with `holding jira-move KAN-12 "Done"`.

**Communication setting** (per company, `holding communication jira+chat|chat`, default `jira+chat`):
- `jira+chat`: questions/decisions/progress are commented on the card AND go to the CEO inbox; answer either place.
- `chat`: no question/decision/progress comments on cards; answer with `/ceo` or `holding reply`. Labels, status and assignee still update on Jira.

## Enterprise plan (planned; in progress, next phase)

**In progress (next phase)**, together with a credit system; not in the client yet. How the team version works:

- **The key you enter alone decides your plan and role**; there is no separate login or role picker. Roles:
  - **admin**: owner of the platform.
  - **personal user**: personal plan.
  - **enterprise owner**: key issued by the admin; generates, revokes, renews and manages keys only inside its own enterprise, never the shared/personal key pool or other enterprises.
  - **enterprise employee**: key generated by its enterprise owner.
- **One shared board per company**; a shared CLI server can run Jira automation for the whole company.
- **Staff mapped to real Jira users** (`jira_user`) with roles/permissions, and an audit of who picked up / changed what.
- **Assignee-driven**: each person runs their own Jira Listener; when a card's assignee changes to that person's Jira user, their listener picks it up with their staff.
- **Chat first**: people talk through `/ceo` or staff chat; Jira comments are optional (communication setting). The main way in is `/ceo KAN-12`: the CEO loads the task and coordinates the staff.
