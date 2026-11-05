# agents-holding

Languages: **English** · [Tiếng Việt](localized/README.vi.md) · [日本語](localized/README.ja.md) · [한국어](localized/README.ko.md) · [简体中文](localized/README.zh-CN.md) · [Español](localized/README.es.md) · [Français](localized/README.fr.md) · [Deutsch](localized/README.de.md)

Set up a small company and ship with it. A CEO talks to you. An engineer builds the plan. Plans live in `cache/plans/`.

```bash
git clone https://github.com/jokerphuongnam/agents-holding-free.git
cd agents-holding-free
./setup.sh my-product
```

That writes `./.agents/my-product-company/`. Open `system/staffs/leadership/ceo.md` in your agent and describe what you want built.

This is the free company: two people, one plan, one build. The full edition adds a product desk, QC, a skill library, plan history, child companies, and the Mac app.

## Who decides what

See [docs/WHO-DECIDES.md](docs/WHO-DECIDES.md): the default Jira flow, colour-coded by who decides (human / AI / script). You can customize your own flow.

## Full version (key)

No key yet? `full/install.sh` offers **Generate key** (a Free key for this Mac, 1,500 credits a month) or **Import key**. Plans, credits and recovery: [docs/RESILIENCE.md](docs/RESILIENCE.md#keys-and-credits).

Got a license key (`ah_live_...`)? Add the server to your agent and sign in with the key when the browser opens. Works with Claude Code, Codex, Cursor and the default AI agent CLI:

`$AH_MCP_URL` is the server URL; set it once with `export AH_MCP_URL="$(curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-free/main/full/connect.sh | bash -s -- --print-url)"`.

```bash
claude mcp add --transport http --scope user agents-holding $AH_MCP_URL   # Claude Code, then /mcp
codex mcp add agents-holding --url $AH_MCP_URL                           # Codex
grok mcp add --transport http agents-holding $AH_MCP_URL                 # the default AI agent CLI
```

Slash commands come from the server as MCP prompts (default AI agent CLI: as command files in ~/.grok/commands, written by `full/connect.sh` or `holding setup sync`). MCP alone is enough: every `/holding …` command works without the local CLI (AI tokens). The CLI is optional zero-token. First time per key+device the agent asks once to install; No marks no-cli and never asks again on that device.

The installer (`full/install.sh`) is optional: you only need it for the background Jira listener, which runs the default AI agent CLI, Claude Code or Codex on your Mac.

Then follow **[full/SETUP.md](full/SETUP.md)**. The full version runs on a hosted server, which holds all roles, skills and workflow logic. This repo only has the optional local client (Jira listener and setup scripts) and the sign-in page (`docs/authorize.html`).

## Companies
Manage every company in your holding from chat (`/ceo companies`, `/ceo company ...`) or the terminal (`holding company ...`): list, details, create, rename, pause/archive/delete, staff moves, Jira links, per-company settings, migrating older local companies, custom board columns. See [docs/COMPANIES.md](docs/COMPANIES.md). Staff rules: [docs/STAFF-POLICY.md](docs/STAFF-POLICY.md). Providers: [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Resilience
Compaction/resume, blocked agents + fallback, MCP server problems + reconcile: [docs/RESILIENCE.md](docs/RESILIENCE.md).

## Privacy

We don't take your information. We only record usage habits: the hours you usually work, chat vs comments, and how you configure your tools (such as models). Every tool you connect and all data on your machine (Jira, Git, Slack, Notion, email, databases, files and folders) is used only on your machine and is not sent to the server.

## Skills

```
~/.agents-holding/skills/
  public/<skill>/SKILL.md     collected automatically for the shared library (after a local scan)
  private/<skill>/SKILL.md    never collected (only counted)
  library/<skill>/SKILL.md    installed from the library (signed)
  <skill>/references/ scripts/ templates/   optional, may be collected
  <skill>/history/ assets/                  never collected
```

1. `holding skill where` — the paths. 2. `holding skill check` — what loads, what is ignored and why. 3. `holding skill set <name> private|public` — move it. 4. `holding skill sync` — preview what the automatic collection would take. 5. `holding skill browse <staff>` / `holding skill add <staff> <id>` — library suggestions, opt-in only.

Custom skills in `public/` are collected automatically by the client (personal information filtered out); to keep one private run `holding skill set <name> private`. `history/`, `assets/` and personal files are never collected.

## Sub agents (headless)
`holding staff presets` → `holding staff add <role> --preset <id>`. Choosing a preset creates a sub agent the staff runs headless — it does not open a chat. Details and wrong/right examples for local LLMs: [docs/PROVIDERS.md](docs/PROVIDERS.md#sub-agent-presets-headless).

## Commands

Run `holding help` to see the commands your key can use (`holding help <group|command>` for details). See full/SETUP.md "Help".

## Docs

- [COMMANDS.md](docs/COMMANDS.md) · [SKILLS.md](docs/SKILLS.md) · [PRICING.md](docs/PRICING.md) · [SETUP.md](full/SETUP.md)
- [Companies](docs/COMPANIES.md) · [Providers](docs/PROVIDERS.md) · [Staff policy](docs/STAFF-POLICY.md) · [Who decides what](docs/WHO-DECIDES.md) · [Resilience](docs/RESILIENCE.md)
