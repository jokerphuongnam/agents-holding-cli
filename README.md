# agents-holding

Languages: **English** · [Tiếng Việt](localized/README.vi.md) · [日本語](localized/README.ja.md) · [한국어](localized/README.ko.md) · [简体中文](localized/README.zh-CN.md) · [Español](localized/README.es.md) · [Français](localized/README.fr.md) · [Deutsch](localized/README.de.md)

Run a small AI company inside your coding agent: a CEO, staff, processes and Jira, all from chat.

## Introduction

agents-holding turns your AI coding agent (Claude Code, Codex, Cursor or the `grok` CLI) into a holding of small companies. Each company has a CEO you talk to, staff with clear roles (engineer, QC, product…), and a workflow that moves real Jira tasks from idea to merged pull request. You add one MCP server, sign in, and it is ready.

## What it does

- **Companies and staff**: create companies, hire or fire staff roles, set per-staff rules, models and skills.
- **CEO in chat**: `/ceo` plans work, splits tasks and assigns them to the right staff.
- **Processes**: company processes and workflows decide who does what at each step (human, AI or script).
- **Jira Listener**: a local process that watches your Jira board and starts the right staff when a card moves, then reports back on the card.
- **Usage and credits**: see your plan, credit bar and per-staff usage at any time.

## Advantages

1. **Workflow first.** Not just another chat assistant: a full company → staff → process → Jira Listener flow, so work moves on its own from card to plan to build to review.
2. **Zero-token commands.** Pure data commands (`/holding key show`, `/holding staff list`, `/holding usage` …) are answered instantly on your machine by a hook; the prompt never reaches the model.
3. **One setup for every agent.** The same commands work in Claude Code, Codex and the `grok` CLI.
4. **Your data stays local.** Tools you connect (Jira, Git, files) run on your machine; keys live in the Keychain, never in config files.
5. **Fair pricing.** Credits only for actions that create work; model tokens are never charged.

```
company  →  staff  →  process  →  Jira Listener  →  plan → build → review → done
```

## Installation

Add the MCP server, sign in, done. Pick your agent:

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

Then open your agent, authenticate `agents-holding` in the browser (create a Free key or import yours) and send any agents-holding message. On the first message the agent sets up the local commands for you; just approve once if it asks. Full guide: [SETUP.md](full/SETUP.md).

## Common commands

| Command | What it does |
|---|---|
| `/holding help` | All commands for your key |
| `/holding key show` | Key id, plan, credits, devices |
| `/holding company create` | Create a company |
| `/holding staff list` | List your staff |
| `/ceo …` | Talk to the CEO: plan, split and assign work |
| `/holding usage` | Credit bar for this period |
| `/holding billing` | Current plan and how to upgrade |
| `/holding feedback "<text>"` | Send feedback to the owner |
| `/holding update` | Update the local client |

Works the same in Claude Code, Codex and the `grok` CLI (Codex asks once to trust the hook). Full list: run `holding help`.

## Docs

- [Setup guide (SETUP.md)](full/SETUP.md)
- [Pricing (PRICING.md)](docs/PRICING.md)
- Command reference: run `holding help` (or `holding help <group|command>`), see also [SETUP.md, section 4](full/SETUP.md#4-use-it-in-chat-instant-zero-ai-tokens)
- [Companies](docs/COMPANIES.md) · [Who decides what](docs/WHO-DECIDES.md) · [Resilience](docs/RESILIENCE.md)

**Privacy.** We don't take your information. We only record usage habits (the hours you usually work, chat vs comments, how you configure tools). Every tool you connect and all data on your machine stay on your machine.
