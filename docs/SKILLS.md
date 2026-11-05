# Skills

Languages: [Tiếng Việt](localized/SKILLS.vi.md) · [日本語](localized/SKILLS.ja.md) · [한국어](localized/SKILLS.ko.md) · [简体中文](localized/SKILLS.zh-CN.md) · [Español](localized/SKILLS.es.md) · [Français](localized/SKILLS.fr.md) · [Deutsch](localized/SKILLS.de.md)

A skill is a reusable set of instructions (and optional references, templates or scripts) that a staff role follows, for example *code-review* or *release-notes*. Attach skills to roles so every task that role runs uses them.

## Add a custom skill

Create a folder named in lowercase letters, digits and dashes, with a `SKILL.md` whose header has `name`, `description` and `version`. Run `holding skill where` to print the folders.

```
~/.agents-holding/skills/
  public/<skill>/SKILL.md      # shared (default)
  private/<skill>/SKILL.md     # stays on this machine
  library/<skill>/SKILL.md     # shared library skills (signed)
    references/  scripts/  templates/   # optional
    history/  assets/                   # optional, never uploaded
```

```markdown
---
name: code-review
description: Review a diff for bugs and style
version: 1
---
Steps the staff should follow...
```

## Attach a skill to a staff

`holding skill add <staff> <skill>` (example: `holding skill add dev code-review`). Tasks that were waiting for a missing skill re-check and continue. `holding skill browse <staff>` shows skills you can attach.

## List, check and sync

- `holding skill list --custom`: your custom skills
- `holding skill check`: which skills load, and why any are ignored, with the correct path
- `holding skill sync [--dry-run]`: send public skills now (it also runs automatically)

## Public and private

New custom skills are **public** by default. Change it with `holding skill private <name>` or `holding skill public <name>`, or by moving the folder. For a public skill, `SKILL.md` and `references/`, `scripts/`, `templates/` are shared; `history/` and `assets/` never are. A file that looks like it holds a secret keeps the whole skill back. Private skills never leave your machine; only a count is recorded.

## Library skills

Library skills are shared, ready-made skills. They must carry a valid signature; unsigned copies are ignored. Attach them the same way with `holding skill add`.

## Consent for scripts

Skill scripts never run on their own. Allow them once with `holding skill consent <name>`; take it back with `holding skill consent <name> --revoke`. Allowed scripts run in a sandbox.

## Troubleshooting

- Skill not found: run `holding skill check` and move it to the path it prints.
- "frontmatter missing": add `name`, `description` and `version` to the header of `SKILL.md`.
- Extra folders are ignored; use only the standard subfolders.
- "no consent": run `holding skill consent <name>`.
- A public skill was not shared: check for secrets in its files, then `holding skill sync --dry-run`.

See also: [Command reference](COMMANDS.md)

## Code graph backends

The `code-graph` staff resolves a backend via `holding codegraph status` (auto-detect; prism fallback; `holding codegraph use <name>` when several are installed). See COMMANDS.md → codegraph.

## Skill-pack dependencies

You can attach a whole git repo of skills/scripts as a **dependency** so the AI can read it:

```bash
holding dependency add <git-url>
holding dependency list
holding dependency update <name>
holding dependency remove <name>
```

Packs live under `~/.agents-holding/packs/` (outside the project). Pack scripts need `holding dependency consent <name>` before `holding dependency run`. See COMMANDS.md → dependency.

