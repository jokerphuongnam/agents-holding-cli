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

## 0. Prerequisites

```bash
brew install node            # Node.js 22 or newer (the listener needs it)
brew install gh              # optional: only for /auto-pr (pull requests)
```

Install the **Grok CLI** and sign in:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok login
```

## 1. Install the client

```bash
curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/install.sh | bash
```

The installer:
- puts the client in `~/.agents-holding` and the `holding` command in `~/.local/bin`;
- asks for your license key at a **hidden prompt** and saves it to `~/.config/agents-holding/license.txt` (readable only by you);
- checks the key with the server;
- adds the agents-holding MCP server to `~/.grok/config.toml`. The config only refers to `${AGENTS_HOLDING_KEY}`, so the key itself never goes into it;
- adds one line to `~/.zshrc` that loads `AGENTS_HOLDING_KEY` from that file.

Open a **new terminal**, then check:

```bash
grok mcp doctor agents-holding     # should connect and list tools
```

<details><summary>Other assistants (Claude Code, Codex, Cursor)</summary>

Server URL: `https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp`, header `Authorization: Bearer ${AGENTS_HOLDING_KEY}`.

```bash
claude mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp \
  --header "Authorization: Bearer ${AGENTS_HOLDING_KEY}"
```

```toml
# ~/.codex/config.toml
[mcp_servers.agents-holding]
url = "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp"
bearer_token_env_var = "AGENTS_HOLDING_KEY"
```

The background Jira listener drives **Grok**, so the Jira flow needs the Grok CLI.
</details>

## 2. Create your company

```bash
cd ~/Code/shop
grok --trust
```

In Grok, type:

```
/holding-ceo set up a company for this repo
```

The holding CEO looks at your stack, creates the company and writes `.agents/company.json`. Commit that one file. Use `/ceo <what you want>` for day-to-day work, and `/help` to list every command.

## 3. Check everything

```
/doctor                 # in Grok: license, company, Jira, webhook, listener
```
```bash
holding doctor --repo ~/Code/shop   # in a terminal: checks on this Mac
```

`[x]` = done, `[ ]` = to do (with **How**), `[?]` = check on your Mac.

## 4. Optional: Jira + background listener

The listener watches your Jira board. When you drag a card to **In Progress**, your local Grok agent plans the work and writes the code.

1. **Atlassian MCP in Grok** (lets the agent read your board during setup):
   ```bash
   grok mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
   grok mcp login atlassian
   ```
2. **Connect the project.** In Grok, in your repo:
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
security delete-generic-password -s agents-holding-atlassian 2>/dev/null
# then remove the [mcp_servers.agents-holding] block from ~/.grok/config.toml and the agents-holding line from ~/.zshrc
```
