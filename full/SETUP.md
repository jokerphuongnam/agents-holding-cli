# agents-holding: full version setup (macOS)

Setup offers exactly two options: **Generate key** (a new Free key for this Mac, 1,500 credits/month; one Free key per machine, ever) or **Import key** (a key you already have, e.g. from the owner, or your own key on another Mac within its device limit). No email is needed. Everything else is free to install. Setup takes about 10 minutes, or about 25 with Jira.

The examples use sample values. Replace them with your own:

| Sample | Meaning |
|---|---|
| `ah_live_XXXX` | your license key (keep it private, like a password) |
| `~/Code/shop` | the repo you want the agents to work in |
| `https://your-team.atlassian.net` | your Jira site |
| `you@example.com` | your Atlassian login email |
| `SHOP` | your Jira project key |

## 1. Connect your agent (2 minutes)

**One command (recommended, macOS, no Node needed):**
```bash
curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/connect.sh | bash
```
It asks your key at a hidden prompt and keeps it only in the macOS Keychain, creates this Mac's device id, adds agents-holding to the default AI agent CLI (and Claude Code / Codex if installed), adds two Keychain loader lines to `~/.zshrc`, and runs `grok mcp doctor agents-holding`. Open a new terminal afterwards.

**Keys are per machine.** A key counts each Mac (or browser) that uses it against its device limit (usually 1). `holding key show` shows your key id, plan, credits and devices used/max. To upgrade, send your **key id** (never the key) to the owner.

Manual alternative (OAuth sign-in page):

Add the server URL to your agent. The first time it connects, your browser opens a small sign-in page: paste your license key and click **Connect**. The agent gets its own access token for your license (renewed automatically); the key is not stored in any config file.

Server URL: `$AH_MCP_URL`; set it once with `export AH_MCP_URL="$(curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/connect.sh | bash -s -- --print-url)"`.

**Claude Code**
```bash
claude mcp add --transport http --scope user agents-holding $AH_MCP_URL
claude            # then type /mcp, pick agents-holding, Authenticate
```

**Codex CLI**
```bash
codex mcp add agents-holding --url $AH_MCP_URL
codex mcp login agents-holding      # only if the browser did not open
```

**Cursor**: Settings → MCP → Add server, or in `~/.cursor/mcp.json`:
```json
{ "mcpServers": { "agents-holding": { "url": "<value of $AH_MCP_URL>" } } }
```
Cursor shows **Needs login**; click it.

**Default AI agent CLI (`grok` command)**
```bash
grok mcp add --transport http agents-holding $AH_MCP_URL
```
If your AI agent CLI version does not open the sign-in page, use the key header instead, with the key kept in the macOS Keychain:
```bash
security add-generic-password -U -s agents-holding-license -a "$USER" -w     # paste the key at the hidden prompt
echo 'export AGENTS_HOLDING_KEY="$(security find-generic-password -s agents-holding-license -a "$USER" -w 2>/dev/null)"' >> ~/.zshrc
security add-generic-password -U -s agents-holding-device -a "$USER" -w "mac-$(printf 'agents-holding:%s' "$(ioreg -rd1 -c IOPlatformExpertDevice | awk -F'"' '/IOPlatformUUID/{print $4}')" | shasum -a 256 | cut -c1-32)"   # stable id: sha256 of the hardware UUID (same as connect.sh)
echo 'export AGENTS_HOLDING_DEVICE="$(security find-generic-password -s agents-holding-device -a "$USER" -w 2>/dev/null)"' >> ~/.zshrc
```
then add `headers = { "Authorization" = "Bearer ${AGENTS_HOLDING_KEY}", "X-AH-Device" = "${AGENTS_HOLDING_DEVICE}" }` under `[mcp_servers.agents-holding]` in `~/.grok/config.toml` (`connect.sh` above does all of this for you).

**Slash commands.** The server defines them (MCP prompts). Claude Code lists them as `/mcp__agents-holding__ceo`; Codex and Cursor list them under the server's prompts. **The default AI agent CLI does not show MCP prompts**: it loads command files from `~/.grok/commands/*.md`, which `connect.sh` (and `install.sh`) write for you and refresh on every run; run `holding setup sync` (or rerun `connect.sh`) to pick up new server commands. Names that clash with the default AI agent CLI built-ins get an `ah-` prefix: `/doctor`, `/help`, `/task plan`, `/status`, `/billing usage`, `/task history`, `/task list`. `/help` (or `help` elsewhere) lists them all.

**Instant commands (no model, no tokens).** Commands that only show data are answered without the AI:
- In the default AI agent CLI, `holding setup sync` (run by `connect.sh`/`install.sh`) installs a prompt hook (`~/.grok/hooks/agents-holding.json`). When you type `/staff list`, `/key show`, `/billing`, `/billing usage`, `/task list`, `/task history`, `/jira sources`, `/key renew`, `/task plan KEY`, `/doctor`, `/listener`, `/staff add`, `/staff remove`, `/task set`, `/company set convention`, `/company set auto-pr`, `/flow` (show/list), `/skill list --custom`, `/help`, the owner `/key list` and `/token-*` commands, or `/jira-*`, the hook prints the answer and the default AI agent CLI shows "Turn blocked by a hook". That message is expected: it means the prompt never went to the model. Turn this off with `export AH_HOOK=0`, or skip installing it with `holding setup sync --no-hook`.
- In a terminal, `holding staff list`, `holding key show`, `holding billing usage 7`, `holding task plan KAN-1`, and so on give the same output. `holding help` lists them. `holding doctor --server` and `holding listener status --server` show the server's side of those checks.
- These commands still go through the agent because they need it: `/ceo`, `/ceo`, `/task add`, `/task split`, `/approve`, `/jira setup`, `/flow edit`, `/admin`.


## 2. Create your company

Open your agent in the repo (`cd ~/Code/shop && claude`, `codex`, or `grok`) and run the CEO prompt:

```
/ceo set up a company for this repo
```

The holding CEO looks at your stack, creates the company and writes `.agents/company.json`. Commit that one file. Use `/ceo <what you want>` for day-to-day work, `/staff list` to see your staff as a tree (each role with a one-line description), and `/help` to list every command.

## 3. Check everything

```
/doctor                 # in your agent: license, company, Jira, Jira Listener
```
```bash
holding doctor --repo ~/Code/shop   # in a terminal: checks on this Mac
```

`[x]` = done, `[ ]` = to do (with **How**), `[?]` = check on your Mac.

## 4. Optional: Jira + background listener

The listener watches your Jira board. When you drag a card to **In Progress**, it plans the work and writes the code with your local **default AI agent CLI, Claude Code or Codex**. Only this part needs an install (macOS, Node.js 22+):

```bash
brew install node
curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/install.sh | bash -s -- --agent claude   # or grok, codex, all, none
```

The installer puts `holding` in `~/.local/bin`, stores your license key in the **macOS Keychain** (hidden prompt; the listener reads it from there) and, for the agents you list, adds the MCP URL as in step 1.

Pick the CLI the listener runs, per company (default `grok`; sign in to that CLI first):

```bash
cd ~/Code/shop
holding company set agent claude                       # or codex / grok; no argument shows the current choice
holding company set agent claude --text-model haiku --model sonnet   # optional model overrides
```

Defaults: plan/question stages use a cheap model (the default AI agent CLI `grok-4.7-build-fast`, Claude `haiku`, Codex your default model at low reasoning effort); the coding call uses the CLI's default model. `AH_AGENT`, `AH_TEXT_MODEL` and `AH_MODEL` override for one run. Runs never load your other MCP servers. `/billing usage` shows tokens per task and stage for every agent.

1. **Atlassian MCP in your agent** (lets it read your board during setup): add `https://mcp.atlassian.com/v1/mcp` the same way as in step 1 (e.g. `claude mcp add --transport http --scope user atlassian https://mcp.atlassian.com/v1/mcp`) and sign in.
2. **Connect the project.** In your agent, in your repo:
   ```
   /jira setup SHOP
   ```
   You get a setup page with the checklist. Open it with `holding setup open '<setup_url>'` (the agent does this for you).
3. **Jira API token in the Keychain.** Create one at https://id.atlassian.com/manage-profile/security/api-tokens, then:
   ```bash
   holding jira connect https://your-team.atlassian.net you@example.com
   ```
   Paste the token at the hidden prompt. It is stored only in the macOS Keychain. `~/.config/agents-holding/jira.json` holds just the site and email.
4. **Columns.**
   ```bash
   holding jira setup-workflow https://your-team.atlassian.net you@example.com SHOP
   ```
   This creates any missing statuses. Jira can't reorder columns by API, so drag them into this order (Board settings → Columns):
   `To Do, In Progress, Product Work, BA Question, Planned, Pre Coding, Coding, QC, In Review, Done`. Done goes last.
5. **Send Jira events to your Jira Listener** (needs a Jira site admin). Either run `ATLASSIAN_EMAIL=you@example.com holding jira connect-events '<setup_url>'`, or create it by hand from the setup page with these values:
   - URL: copy it from the setup page. It looks like `<Jira Listener URL>?s=<id>&token=<secret>`. Keep it private.
   - JQL: `project = SHOP`
   - Events: **Issue created**, **Issue updated**, **Comment created**
   - Exclude body: **No**
6. **Start the listener:**
   ```bash
   holding project add --jira-project SHOP   # inside the repo: which board feeds it
   holding listener start --repo ~/Code/shop     # start now
   holding listener autostart on              # also start at login
   holding listener status                    # running? autostart? last "join ok"
   holding listener stop                       # stop now and turn autostart off
   holding listener logs -f                   # follow the log
   ```
   If your repo is in Documents, Desktop or Downloads, click **Allow** when macOS asks whether `node` may read that folder.
7. Run `/doctor` again. Every step should show `[x]`.

> Who decides at each stage (default flow, customizable): see [docs/WHO-DECIDES.md](../docs/WHO-DECIDES.md).

### Working with the board

- New cards stay in **To Do**. **Drag a card to In Progress to start it.**
- The agent stops at two gates, **Planned** and **In Review**. Approve by moving the card or commenting `/approve`. Only you move cards to **Done**.
- `/task add <description>` writes a proper issue in To Do. `/task split SHOP-12` splits it into sub-tasks.
- Flow types per task: `full`, `no_plan`, `no_dev`, `quick` (`/flow SHOP-12 quick` or the label `ah-flow:quick`). `/flow edit` designs your own columns and gates.
- `/company set auto-pr on` (off by default): In Review pushes the branch and opens a PR with `gh`. Run `gh auth login` first, and make sure the repo has an `origin` remote.
- `/billing usage` shows tokens per task and stage.
- **Jira from the terminal or chat, no model** (uses your own Jira login from `holding jira connect`, so each action counts as you):
  - `holding jira list [column]`: tasks grouped by column, with assignee, the agent-working flag and when each was last updated.
  - `holding jira show KEY`: column, branch, tokens used, description and recent comments.
  - `holding jira board`: how many cards each column has, plus stuck cards (agent-working for longer than the run timeout, or Failed).
  - `holding jira add "title" [desc]`: a new card in To Do.
  - `holding jira move KEY "In Progress"`: a real move, which starts the flow just like dragging the card.
  - `holding jira comment KEY "text"`: a comment from you, which the agent treats as your feedback.
  - Add `--project KEY` when the repo has more than one board. Each command also works as a slash command (`/jira list`, ...).

## Renewing

The assistant warns you 7 days before the key expires. `/key show` shows the plan and expiry date, and to renew or get more credits, contact the owner. `holding billing` (or `/billing`) shows your plan, credits used and credits left ("no data yet" until the credit system is on); to get more credits, contact the owner. It answers in the language you type in. Your data is kept if the key expires.

## Uninstall

```bash
holding listener stop
rm -rf ~/.agents-holding ~/.local/bin/holding ~/.config/agents-holding
security delete-generic-password -s agents-holding-license 2>/dev/null
security delete-generic-password -s agents-holding-device 2>/dev/null
security delete-generic-password -s agents-holding-atlassian 2>/dev/null
claude mcp remove agents-holding --scope user; codex mcp remove agents-holding   # whichever you use
# the default AI agent CLI: remove [mcp_servers.agents-holding] from ~/.grok/config.toml and the agents-holding line from ~/.zshrc
```

## Feedback, habits and status (listener)

- Comment on a card in **Planned**: the plan is revised and stays in Planned. Comment in **In Review** (or drag it back to Coding with a comment): it goes back to Coding, the same developer fixes it on `feature/<KEY>`, QC runs, and it returns to In Review. Only you move cards to Done.
- `holding habit list [show|edit|clear]`: preferences learned from your comments when a task reaches Done (local file, used in later plans and code).
- `holding status`: listener running?, realtime connection, last Jira event, last heartbeat, current task/stage. `holding notify on|off`: macOS notifications. Cards being worked on carry the `agent-working` label.

## Key: Generate key or Import key

- `holding key generate`: creates a new Free key for this Mac and stores it in the Keychain (never shown). A Mac that already had a Free key cannot get another; Free credits do not reset by generating again.
- `holding key import`: hidden prompt for a key you already have; stored in the Keychain, then `holding key show`.
- `holding key show` / `holding billing` / `holding credit show`: your key id, plan, credits, devices. To upgrade or get more credits, send your key id to the owner.

Lost your Free key on this Mac? Run Generate key again: it recovers this machine's key (same credits, new secret). Paid keys: use Import key.

## Help: `holding help`

`holding help` (aliases `holding document`, `holding docs`; `holding --help` points here) lists, grouped and numbered, exactly the commands
YOUR key can run: the server checks the key, plan, role and owner binding and returns the list (Vietnamese or English from your language).
`holding help <group|command>` shows details, e.g. `holding help staff` or `holding help 2.1`. Without a valid key you only see the setup and
key commands (key generate/import/show, setup, doctor, help). Offline it uses the last list cached for your key (stored under a hash of the key,
never the key itself) or else the setup-only list.
