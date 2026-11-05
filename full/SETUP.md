# Install agents-holding (MCP only)

Languages: **English** · [Tiếng Việt](localized/SETUP.vi.md) · [日本語](localized/SETUP.ja.md) · [한국어](localized/SETUP.ko.md) · [简体中文](localized/SETUP.zh-CN.md) · [Español](localized/SETUP.es.md) · [Français](localized/SETUP.fr.md) · [Deutsch](localized/SETUP.de.md)

No `curl | bash` to start, no script to download. Add the MCP server to your agent, sign in with OAuth in the browser, then say **yes once** when your agent offers to install the local client.

MCP URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

This document: https://github.com/jokerphuongnam/agents-holding-free/blob/main/full/SETUP.md

---

## 1. Add the MCP server (one command)

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Default CLI agent (`grok` command)**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

or in `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. Sign in with OAuth (browser)

Open your agent → connect / Authenticate `agents-holding`. A web page opens: **Create key** (Free, on this machine) or **Import key** you already have. The key is never stored in the agent's config file; the OAuth session refreshes automatically.

## 3. Install the local client (one approval, first message)

On your **first** agents-holding message (for example `/holding key show`), the very first lines of the answer are an install request. Your agent stops and asks once:

> Install the agents-holding local client on this machine? It adds the `holding` command, native /holding slash commands and an instant (no-AI) hook. Safe to rerun; the Jira Listener is not installed now.

Say **yes**. The agent calls the `install` tool and runs **one** shell command. It shows progress lines `[bootstrap 1/5]` … `[bootstrap 5/5]`:

1. Client scripts into `~/.agents-holding`
2. `holding` on your PATH (`~/.local/bin`)
3. Device id in the Keychain (no secrets printed)
4. Pairs this machine with your agent session using a one-time code (10 minutes, single use; your key is never shown), then installs slash commands and the instant hook
5. Done; the server now knows this machine has the client, so the install request stops

If the agent did not ask, type: `install agents-holding` (or `/holding install`). Safe to rerun.

The Jira Listener is **not** installed in this step.

**Start a new agent session** after installing so the agent loads the new commands.

## 4. Use it in chat: instant, zero AI tokens

After install, pure commands are answered locally by the hook or your shell. The prompt never reaches the model:

| Agent | How `/holding key show` runs |
|---|---|
| `grok` CLI | `/holding key show`: the UserPromptSubmit hook (`~/.grok/hooks/agents-holding.json`) answers it instantly |
| Claude Code | `/holding key show`: the UserPromptSubmit hook in `~/.claude/settings.json` answers it instantly |
| Codex CLI | `/holding key show`: the UserPromptSubmit hook in `~/.codex/hooks.json` answers it instantly (Codex asks once to trust the new hook); `!holding key show` also works |
| Any terminal | `holding key show` |

Each instant answer ends with `(agents-holding: instant, no model)`.

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

Commands that need the agent (`/ceo`, `/task add`, `/flow edit`, `/jira setup`, `/skill add`) still go to the model on purpose.

### Send feedback

```
/holding feedback "<text>"
```

Sends your feedback straight from chat (zero AI tokens). Only the owner reads it.

## 5. Jira (lazy: only when needed)

When a command or agent really needs Jira (read tasks, attach files, move columns, start the Listener):

1. The agent asks you, then runs `holding jira connect` (browser OAuth; token in the Keychain; chat shows only the account name)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (local process), only when needed: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

Installing MCP, creating a company and non-Jira commands **never** require a Jira sign-in.

## 6. Update

In chat: `/holding update` (or ask the agent to run `holding update`). Safe to rerun.

---

## 7. Plans and pricing (credits)

Customer price sheet: **[docs/PRICING.md](../docs/PRICING.md)**: credits per month, prices, staff and device limits, action costs, how to upgrade.

To upgrade: send your **key id** (from `holding key show`; never the key itself) to the owner: **phuongnamp99@gmail.com**. `holding billing` and `holding key show` always print the current contact.

On your machine: `holding billing` · `holding usage`.

---

## Appendix: install by script (not recommended)

Only when the agent cannot run the install (special environments). Not the default customer flow.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

The old `connect.sh` / `install.sh` scripts stay in the repo for compatibility; they are **not** used in new customer docs.
