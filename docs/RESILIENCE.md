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
