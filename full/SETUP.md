# agents-holding: full version setup (macOS)

You need a **license key** (`ah_live_...`) from the person who invited you. Everything else is free to install. Setup takes about 10 minutes, or about 25 with Jira.

The examples use sample values. Replace them with your own:

| Sample | Meaning |
|---|---|
| `ah_live_XXXX` | your license key (keep it private, like a password) |
| `~/Code/shop` | the repo you want the agents to work in |
| `https://your-team.atlassian.net` | your Jira site |
| `you@example.com` | your Atlassian login email |
| `SHOP` | your Jira project key |

## 1. Connect your agent (2 minutes, no install)

Add the server URL to your agent. The first time it connects, your browser opens a small sign-in page: paste your license key and click **Connect**. The agent gets its own access token for your license (renewed automatically); the key is not stored in any config file.

Server URL: `https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp`

**Claude Code**
```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
claude            # then type /mcp, pick agents-holding, Authenticate
```

**Codex CLI**
```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
codex mcp login agents-holding      # only if the browser did not open
```

**Cursor**: Settings → MCP → Add server, or in `~/.cursor/mcp.json`:
```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```
Cursor shows **Needs login**; click it.

**Grok CLI**
```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```
If your Grok version does not open the sign-in page, use the key header instead, with the key kept in the macOS Keychain:
```bash
security add-generic-password -U -s agents-holding-license -a "$USER" -w     # paste the key at the hidden prompt
echo 'export AGENTS_HOLDING_KEY="$(security find-generic-password -s agents-holding-license -a "$USER" -w 2>/dev/null)"' >> ~/.zshrc
```
then add `headers = { "Authorization" = "Bearer ${AGENTS_HOLDING_KEY}" }` under `[mcp_servers.agents-holding]` in `~/.grok/config.toml` (the installer below does this for you).

**Slash commands** come from the server as MCP prompts, so there is nothing to copy. Grok: `/ceo`, `/doctor`. Claude Code: `/mcp__agents-holding__ceo`. Codex and Cursor list them under the server's prompts. `help` lists them all.

## 2. Create your company

Open your agent in the repo (`cd ~/Code/shop && claude`, `codex`, or `grok`) and run the `holding-ceo` prompt:

```
/holding-ceo set up a company for this repo
```

The holding CEO looks at your stack, creates the company and writes `.agents/company.json`. Commit that one file. Use `/ceo <what you want>` for day-to-day work, `/staffs` to see your staff as a tree (each role with a one-line description), and `/help` to list every command.

## 3. Check everything

```
/doctor                 # in your agent: license, company, Jira, webhook, listener
```
```bash
holding doctor --repo ~/Code/shop   # in a terminal: checks on this Mac
```

`[x]` = done, `[ ]` = to do (with **How**), `[?]` = check on your Mac.

## 4. Optional: Jira + background listener

The listener watches your Jira board. When you drag a card to **In Progress**, it plans the work and writes the code with your local **Grok, Claude Code or Codex** CLI. Only this part needs an install (macOS, Node.js 22+):

```bash
brew install node
curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/install.sh | bash -s -- --agent claude   # or grok, codex, all, none
```

The installer puts `holding` in `~/.local/bin`, stores your license key in the **macOS Keychain** (hidden prompt; the listener reads it from there) and, for the agents you list, adds the MCP URL as in step 1.

Pick the CLI the listener runs, per company (default `grok`; sign in to that CLI first):

```bash
cd ~/Code/shop
holding agent claude                       # or codex / grok; no argument shows the current choice
holding agent claude --text-model haiku --model sonnet   # optional model overrides
```

Defaults: plan/question stages use a cheap model (Grok `grok-4.7-build-fast`, Claude `haiku`, Codex your default model at low reasoning effort); the coding call uses the CLI's default model. `AH_AGENT`, `AH_TEXT_MODEL` and `AH_MODEL` override for one run. Runs never load your other MCP servers. `/usage` shows tokens per task and stage for every agent.

1. **Atlassian MCP in your agent** (lets it read your board during setup): add `https://mcp.atlassian.com/v1/mcp` the same way as in step 1 (e.g. `claude mcp add --transport http --scope user atlassian https://mcp.atlassian.com/v1/mcp`) and sign in.
2. **Connect the project.** In your agent, in your repo:
   ```
   /connect-jira SHOP
   ```
   You get a setup page with the checklist. Open it with `holding open-setup '<setup_url>'` (the agent does this for you).
3. **Jira API token in the Keychain.** Create one at https://id.atlassian.com/manage-profile/security/api-tokens, then:
   ```bash
   holding jira-keychain https://your-team.atlassian.net you@example.com
   ```
   Paste the token at the hidden prompt. It is stored only in the macOS Keychain. `~/.config/agents-holding/jira.json` holds just the site and email.
4. **Columns.**
   ```bash
   holding jira-workflow https://your-team.atlassian.net you@example.com SHOP
   ```
   This creates any missing statuses. Jira can't reorder columns by API, so drag them into this order (Board settings → Columns):
   `To Do, In Progress, Product Work, BA Question, Planned, Pre Coding, Coding, QC, In Review, Done`. Done goes last.
5. **Webhook** (needs a Jira site admin). Either run `ATLASSIAN_EMAIL=you@example.com holding jira-webhook '<setup_url>'`, or create it by hand from the setup page with these values:
   - URL: copy it from the setup page. It looks like `https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/jira-webhook?s=<id>&token=<secret>`. Keep it private.
   - JQL: `project = SHOP`
   - Events: **Issue created**, **Issue updated**, **Comment created**
   - Exclude body: **No**
6. **Start the listener:**
   ```bash
   holding add-project --jira-project SHOP   # inside the repo: which board feeds it
   holding listener on --repo ~/Code/shop     # start now
   holding listener autostart on              # also start at login
   holding listener status                    # running? autostart? last "join ok"
   holding listener off                       # stop now and turn autostart off
   holding listener logs -f                   # follow the log
   ```
   If your repo is in Documents, Desktop or Downloads, click **Allow** when macOS asks whether `node` may read that folder.
7. Run `/doctor` again. Every step should show `[x]`.

### Working with the board

- New cards stay in **To Do**. **Drag a card to In Progress to start it.**
- The agent stops at two gates, **Planned** and **In Review**. Approve by moving the card or commenting `/approve`. Only you move cards to **Done**.
- `/new-task <description>` writes a proper issue in To Do. `/split SHOP-12` splits it into sub-tasks.
- Flow types per task: `full`, `no_plan`, `no_dev`, `quick` (`/flow SHOP-12 quick` or the label `ah-flow:quick`). `/flow edit` designs your own columns and gates.
- `/auto-pr on` (off by default): In Review pushes the branch and opens a PR with `gh`. Run `gh auth login` first, and make sure the repo has an `origin` remote.
- `/usage` shows tokens per task and stage.

## Renewing

The assistant warns you 7 days before the key expires. `/whoami` shows the plan and expiry date, and `/renew` explains how to renew. Your data is kept if the key expires.

## Uninstall

```bash
holding listener off
rm -rf ~/.agents-holding ~/.local/bin/holding ~/.config/agents-holding
security delete-generic-password -s agents-holding-license 2>/dev/null
security delete-generic-password -s agents-holding-atlassian 2>/dev/null
claude mcp remove agents-holding --scope user; codex mcp remove agents-holding   # whichever you use
# Grok: remove [mcp_servers.agents-holding] from ~/.grok/config.toml and the agents-holding line from ~/.zshrc
```

## Feedback, habits and status (listener)

- Comment on a card in **Planned**: the plan is revised and stays in Planned. Comment in **In Review** (or drag it back to Coding with a comment): it goes back to Coding, the same developer fixes it on `feature/<KEY>`, QC runs, and it returns to In Review. Only you move cards to Done.
- `holding habits [show|edit|clear]`: preferences learned from your comments when a task reaches Done (local file, used in later plans and code).
- `holding status`: listener running?, realtime connection, last webhook event, last heartbeat, current task/stage. `holding notify on|off`: macOS notifications. Cards being worked on carry the `agent-working` label.
