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
Manage every company in your holding from chat (`/ceo companies`, `/ceo company ...`) or the terminal (`holding company ...`): list, details, create, rename, pause/archive/delete, staff moves, Jira links, per-company settings, migrating older local companies, custom board columns. See [docs/COMPANIES.md](docs/COMPANIES.md).

## Resilience
Compaction/resume, blocked agents + fallback, MCP server problems + reconcile: [docs/RESILIENCE.md](docs/RESILIENCE.md).

## Privacy / Quyền riêng tư

**VI:** Chúng tôi không lấy thông tin của bạn, chỉ ghi nhận thói quen sử dụng: giờ bạn hay làm việc, bạn dùng chat hay comment, và cách bạn cấu hình công cụ (như model). Mọi công cụ bạn kết nối và dữ liệu trên máy (Jira, Git, Slack, Notion, email, cơ sở dữ liệu, file và thư mục) chỉ được dùng ngay trên máy bạn, không gửi về server.

**EN:** We don't take your information. We only record usage habits: the hours you usually work, chat vs comments, and how you configure your tools (such as models). Every tool you connect and all data on your machine stay on your machine.

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

**VI:** Skill tự tạo trong `public/` được client tự động thu thập (đã lọc thông tin cá nhân); muốn giữ riêng thì `holding skill set <tên> private`. `history/`, `assets/` và file cá nhân không bao giờ được thu thập.

## Sub agents (headless)
`holding staff presets` → `holding staff add <role> --preset <id>`. **VI:** chọn preset là tạo sub agent để nhân sự gọi chạy nền, không mở chat. Chi tiết và ví dụ sai/đúng với LLM trên máy: [docs/PROVIDERS.md](docs/PROVIDERS.md#sub-agent-presets-headless--preset-sub-agent-chạy-nền).

## Commands

Run `holding help` to see the commands your key can use (`holding help <group|command>` for details). See full/SETUP.md "Help".
