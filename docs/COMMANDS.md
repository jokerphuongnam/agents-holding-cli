# Command reference

Languages: [Tiếng Việt](localized/COMMANDS.vi.md) · [日本語](localized/COMMANDS.ja.md) · [한국어](localized/COMMANDS.ko.md) · [简体中文](localized/COMMANDS.zh-CN.md) · [Español](localized/COMMANDS.es.md) · [Français](localized/COMMANDS.fr.md) · [Deutsch](localized/COMMANDS.de.md)

Every command you can use with your key. In chat, type `/holding <command>` (for example `/holding key show`); in a terminal, type `holding <command>`. These answer instantly without using AI. `/ceo` and `/approve` are agent commands.

## Setup and help

| Command | What it does | Example |
|---|---|---|
| `holding help [group\|command]` | All commands your key can use | `holding help staff` |
| `holding setup sync [--claude]` | Install the slash commands into your agent | `holding setup sync` |
| `holding doctor [--server]` | Check every setup step | `holding doctor` |
| `holding status` | Status of your setup and notifications | `holding status` |

## License key

| Command | What it does | Example |
|---|---|---|
| `holding key show` | Key id, plan, credits, devices | `holding key show` |
| `holding key generate` | Create a Free key for this machine | `holding key generate` |
| `holding key import` | Use an existing key (hidden prompt) | `holding key import` |

## Companies

| Command | What it does | Example |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | List, show or select a company | `holding company use acme` |
| `holding company create [name] [--parent P]` | Create a company (no name = this folder) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | Manage a company | `holding company pause acme` |
| `holding company migrate <folder>` | Import an older local company | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | Company settings | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | Block a file for all staff | `holding company deny add .env` |

## Staff

| Command | What it does | Example |
|---|---|---|
| `holding staff list` | Your staff | `holding staff list` |
| `holding staff add <role> \| remove <role>` | Hire or remove a staff role | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | Staff rules and permissions (one config for every agent) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | Block a file for one staff | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | Choose the AI and model of a staff | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | Run or test a staff | `holding staff test qa` |

## Processes and workflows

| Command | What it does | Example |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Company processes run by the Jira Listener | `holding company process list` |
| `holding flow show \| list` | Your workflows | `holding flow show` |
| `holding project add\|remove\|list` | Repos linked to Jira projects | `holding project list` |
| `holding habit list\|edit\|clear` | Learned habits | `holding habit list` |

## Tasks

| Command | What it does | Example |
|---|---|---|
| `holding task list [all] \| history [n]` | Tasks and history | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | Plan or assign a task | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | Approve a plan (in your agent) | `/approve KAN-12` |

## AI providers per role

| Command | What it does | Example |
|---|---|---|
| `holding provider list \| set \| unset` | Which AI each role uses | `holding provider list` |

## Skills

| Command | What it does | Example |
|---|---|---|
| `holding skill add <staff> <skill>` | Attach a skill to a staff | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | Your custom skills, or skills for a staff | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | Local skill folders, validation and sync | `holding skill check` |
| `holding skill private\|public <name>` | Make a skill private or public | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | Allow a skill's scripts to run | `holding skill consent my-tool` |

## Jira and the Jira Listener

| Command | What it does | Example |
|---|---|---|
| `holding jira connect <site> <email>` | Save your Jira token in the Keychain | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Read Jira | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Change Jira cards | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | Attach local files to an issue | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | The Jira Listener | `holding listener status` |

## Figma

| Command | What it does | Example |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Sign in to Figma (Keychain) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | Export a frame as PNG | `holding figma export <url> --attach KAN-12` |

## Atlassian and Confluence

| Command | What it does | Example |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | Sign in to Atlassian only when needed | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Create or update a Confluence page | `holding confluence page create ENG "Release" --file notes.md` |

## CEO inbox

| Command | What it does | Example |
|---|---|---|
| `holding inbox list [--all] [KEY]` | Pending questions and decisions from staff | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | Answer; the staff resumes where it stopped | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | Close an item without answering | `holding inbox dismiss KAN-12` |

## Talk to the CEO

| Command | What it does | Example |
|---|---|---|
| `/ceo <request>` | Plan, split and assign work to your staff | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | Open a CEO session on one item | `holding ceo KAN-12` |

## Usage and reports

| Command | What it does | Example |
|---|---|---|
| `holding usage [--by day\|staff]` | Credit bar for this period | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | Reports on your own usage (counts only) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | Notices for your key | `holding notify list` |

## Plan and credits

| Command | What it does | Example |
|---|---|---|
| `holding credit show` | Your credits | `holding credit show` |
| `holding billing \| billing usage [days]` | Plans, your plan, and how to upgrade | `holding billing` |

## Feedback

| Command | What it does | Example |
|---|---|---|
| `holding feedback "<text>"` | Send feedback | `holding feedback "the inbox is great"` |


## codegraph

Pick and inspect the code-graph backend used by the `code-graph` staff (per company).

```bash
holding codegraph list                 # detected on this machine + saved choice
holding codegraph detect               # scan PATH, agent MCP configs, index folders
holding codegraph status               # what the staff should use right now
holding codegraph use <name>           # save choice (when several backends exist)
holding codegraph clear                # drop saved choice
```

Detection covers common local CLIs / MCP servers / index dirs (for example `codegraph` + `.codegraph`, `cgc`/`codegraphcontext`, `code-graph`, MCP-only graph servers) and falls back to **prism** when nothing else is present. One backend → used silently. Several → ask once, then `use`. Works the same for Grok, Claude, Codex, and local AI staff (adapter is local CLI, not a chat vendor).


## dependency

Add a skill-pack git repo so every agent can read its skills and commands. The pack is cloned outside the project (`~/.agents-holding/packs/<name>`); the company only stores a reference line, so project git stays clean. Several companies may share one pack.

```bash
holding dependency add <git-url>       # clone pack + store company reference + expose skills
holding dependency list                # company refs + packs on this machine
holding dependency update <name|url>   # pull upstream (local learning commits stay)
holding dependency remove <name|url>   # drop this company's reference (--purge deletes unused checkout)
holding dependency consent <name>      # allow pack scripts once (never auto-run)
holding dependency run <name> <script> # run one pack script (sandboxed; needs consent)
```

Pack skills/commands are adapted for Grok, Claude, Codex and local AI. Claude-only skill formats are rewritten into portable command files. Do not commit pack contents into the product repo.

## Update

| Command | What it does | Example |
|---|---|---|
| `holding update` | Update the local client, commands and Jira Listener | `holding update` |

See also: [Skills](SKILLS.md). Run `holding help` to see exactly what your key can use.
