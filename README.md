# agents-holding

## Privacy boundary

The runner and listener do not read user files by default, crawl the home directory, crawl a repository, or upload file contents. A workflow must explicitly declare the repository/path scope and have company/staff permission before file access. Denied/private paths are never read, added to agent context, written to logs/transcripts, or sent to Jira/MCP/server. Evidence is metadata/digests unless the user explicitly authorizes content; secrets and PII are redacted.

Jira and permission runtimes are lazy: the CLI/MCP bootstrap does not install them. Starting Jira installs the Rust Jira Listener from a public GitHub Release only when needed. Creating a deny rule enables the local permission interceptor and sandbox policy only for that company/staff. Published binaries are downloaded with SHA-256 verification; source code remains in private repositories.

Terminal commands require a registered real terminal and consent. The user sees every command in that terminal; agents-holding performs no hidden execution elsewhere.

On macOS, `terminal register` starts the bundled companion in the invoking terminal. It owns a real interactive PTY and a 0600 authenticated Unix-socket IPC endpoint; the session record contains the token, socket, company and canonical repo scope. `terminal dispatch <session-id> '<command>'` writes the exact command into that PTY, streams the visible transcript back, and returns a durable completion event with job/session IDs, exit code, cwd/repo and a transcript digest. Only one command may be active at a time; `status`, `heartbeat`, `cancel`, and `unregister` control the session. An optional local allowlist can reject commands before they reach the PTY. The companion does not persist raw transcript or upload file contents. A disconnect or missing completion is a blocked terminal gate, never a pass. Linux/Windows adapters are not enabled by this release; they must provide the same authenticated PTY contract before being advertised.

Company deny paths remain denied to all staff and terminal sessions unless the company creates a `special allow` for an exact named authenticated identity. The identity may be a local agent or an approved hosted agent/service, but hosted access is permitted only through the policy-controlled runtime. The exception must match company, canonical repo/path, agent identity/type, operation, consent, reason, expiry and revocation state. Normal staff permissions never override company deny. Audit records are redacted metadata only; QC verifies no leakage.

Setup is explicit through CEO/chat (`company deny` → `special allow` → dry-run → owner confirmation) or policy JSON, for example: `holding company process add-json '{"files":{"exceptions":[{"kind":"special_allow","agent_id":"deploy-service","agent_type":"hosted_service","path":"deploy/prod.env","operations":["read"],"consent":true,"reason":"release deploy","expires_at":"2099-01-01T00:00:00Z"}]}}'`. Revoke by setting `revoked: true` or removing the exception; least privilege and path traversal checks remain mandatory.

Languages: **English** · [Tiếng Việt](localized/README.vi.md) · [日本語](localized/README.ja.md) · [한국어](localized/README.ko.md) · [简体中文](localized/README.zh-CN.md) · [Español](localized/README.es.md) · [Français](localized/README.fr.md) · [Deutsch](localized/README.de.md)

Set up a small company and ship with it. A CEO talks to you. An engineer builds the plan. Plans live in `cache/plans/`.

```bash
git clone https://github.com/jokerphuongnam/agents-holding-cli.git
cd agents-holding-cli
./setup.sh my-product
```

That writes `./.agents/my-product-company/`. Open `system/staffs/leadership/ceo.md` in your agent and describe what you want built.

This is the free company: two people, one plan, one build. The full edition adds a product desk, QC, a skill library, plan history, child companies, and the Mac app.

## Who decides what

See [docs/WHO-DECIDES.md](docs/WHO-DECIDES.md): the default Jira flow, colour-coded by who decides (human / AI / script). You can customize your own flow. For the complete label lifecycle, see [docs/LABELS.vi.md](docs/LABELS.vi.md).

## Full version (key)

No key yet? `full/install.sh` offers **Generate key** (a Free key for this Mac, 1,500 credits a month) or **Import key**. Plans, credits and recovery: [docs/RESILIENCE.md](docs/RESILIENCE.md#keys-and-credits).

### Link an already-open terminal

Register the real terminal you want the listener to use, from the exact repository:

```bash
cd /path/to/repository
holding terminal register --company marlin-language --repo /path/to/repository
holding terminal status
holding terminal heartbeat <session-id>
```

Use `holding terminal unregister <session-id>` to remove it. `holding terminal link <one-time-token> --repo ...` remains a compatibility path for workflow-issued one-time requests. Registration binds user, device, company, repository, cwd, shell and toolchain; the listener selects only a connected, heartbeating terminal matching company/repo/policy. It never guesses a window title/process, opens a native dialog, or treats comments/model output as terminal evidence. If no terminal is available, Jira is flagged and CEO/chat instructs the user to run `holding terminal register` in the intended terminal. Only the bound terminal's live output, exit code, timestamps, toolchain/env and artifact evidence can reach QC.

Integrity rule: agent claims/logs are never evidence. The PTY transcript must be authenticated, fresh, and match the exact command, cwd, repo, exit status, commit/tree and artifact digest from the user machine. Fake success, forged exit code, stale output, wrong checkout, or transport disconnect keeps the workflow waiting/Blocked and sends a Jira + CEO/chat recovery instruction; it never advances QC.

Terminal registration is opt-in. The default workflow never asks for a terminal and never dispatches commands there. Only a confirmed company/project QC rule with `runner: "registered_terminal"`, command, repo/cwd, consent/allowlist, evidence, timeout and recovery activates terminal selection. Without that rule, normal workflow behavior is unchanged. With it but no available registered terminal, the listener stays waiting/Blocked and tells the user through Jira + CEO/chat to run `holding terminal register`.

Registration scope is immutable and exact:

```bash
cd /path/to/repo
holding terminal register --repo /path/to/repo        # explicit repo
holding terminal register --repo Nailly                # registered repo name
holding terminal register                              # infer company + current repo from canonical config
holding terminal status
holding terminal unregister <session-id>
```

The session records company, canonical repo path, cwd, user and device. Every workflow command and evidence handoff must match that company+repo (parent/child access is allowed only by the effective company policy). A mismatch is rejected and routed to Jira + CEO/chat; it never silently rebinds. To change scope, explicitly unregister and register again. Restart persistence does not widen scope.

Got a license key (`ah_live_...`)? Add the server to your agent and sign in with the key when the browser opens. Works with Claude Code, Codex, Cursor and the default AI agent CLI:

`$AH_MCP_URL` is the server URL; set it once with `export AH_MCP_URL="$(curl -fsSL https://raw.githubusercontent.com/jokerphuongnam/agents-holding-cli/main/full/connect.sh | bash -s -- --print-url)"`.

```bash
claude mcp add --transport http --scope user agents-holding $AH_MCP_URL   # Claude Code, then /mcp
codex mcp add agents-holding --url $AH_MCP_URL                           # Codex
grok mcp add --transport http agents-holding $AH_MCP_URL                 # the default AI agent CLI
```

Slash commands come from the server as MCP prompts (Grok/Claude can expose them as native commands). Codex reserves `/` for built-in commands, so use `!holding <noun> <verb>` after installing the local client to run directly without model tokens. Before installation, ask Codex normally to run the agents-holding MCP command (for example, “holding key show”); the agent asks once whether to install. Yes installs the CLI and reruns the command; No continues through MCP and costs model tokens.

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


You can also add a **dependency**: a whole git repo of skills/scripts the AI can read. It is cloned outside the project (`~/.agents-holding/packs/<name>`); the company only stores a reference. Commands: `holding dependency add|list|update|remove <link>`, then `holding skill add|list|remove` for pack skills (`<pack>/<skill>`). Pack scripts need consent before they run. See [COMMANDS.md](docs/COMMANDS.md#dependency).

## Sub agents (headless)
`holding staff presets` → `holding staff add <role> --preset <id>`. Choosing a preset creates a sub agent the staff runs headless — it does not open a chat. Details and wrong/right examples for local LLMs: [docs/PROVIDERS.md](docs/PROVIDERS.md#sub-agent-presets-headless).

## Commands

Run `holding help` to see the commands your key can use (`holding help <group|command>` for details). See full/SETUP.md "Help".

## Docs

- [COMMANDS.md](docs/COMMANDS.md) · [SKILLS.md](docs/SKILLS.md) · [PRICING.md](docs/PRICING.md) · [SETUP.md](full/SETUP.md)
- [Companies](docs/COMPANIES.md) · [Providers](docs/PROVIDERS.md) · [Staff policy](docs/STAFF-POLICY.md) · [Who decides what](docs/WHO-DECIDES.md) · [Resilience](docs/RESILIENCE.md)


## Company-defined Jira Listener rules

Customize event triggers, conditions, and actions locally per company. `/ceo` supports interview → draft → dry-run → confirm → attach. See [Jira Listener rules](docs/JIRA-LISTENER-RULES.md) for the `holding process rule add|list|remove|test` commands and the built-in parent-auto-Done template.
