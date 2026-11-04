# agents-holding

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

## Full version (license key)

Got a license key (`ah_live_...`)? Add the server to your agent and sign in with the key when the browser opens. Works with Claude Code, Codex, Cursor and Grok:

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code, then /mcp
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # Grok
```

Slash commands come from the server as MCP prompts (Grok CLI: as command files in ~/.grok/commands, written by `full/connect.sh` or `holding setup sync`). The installer (`full/install.sh`) is optional: you only need it for the background Jira listener, which runs Grok, Claude Code or Codex on your Mac.

Then follow **[full/SETUP.md](full/SETUP.md)**. The full version runs on a hosted server, which holds all roles, skills and workflow logic. This repo only has the optional local client (Jira listener and setup scripts) and the sign-in page (`docs/authorize.html`).

## Resilience
Compaction/resume, blocked agents + fallback, MCP server problems + reconcile: [docs/RESILIENCE.md](docs/RESILIENCE.md).
