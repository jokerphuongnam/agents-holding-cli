# Fähigkeiten

[English](../SKILLS.md)

Eine Fähigkeit ist eine wiederverwendbare Anleitung (optional mit Referenzen, Vorlagen oder Skripten), der eine Rolle folgt, etwa *code-review* oder *release-notes*. Weisen Sie sie einer Rolle zu, dann nutzt jede Aufgabe dieser Rolle sie.

## Eigene Fähigkeit hinzufügen

Legen Sie einen Ordner mit Kleinbuchstaben, Ziffern und Bindestrichen an, darin eine `SKILL.md` mit `name`, `description` und `version` im Kopf. `holding skill where` zeigt die Ordner.

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

## Einer Rolle zuweisen

`holding skill add <staff> <skill>` (Beispiel: `holding skill add dev code-review`). Aufgaben, die darauf gewartet haben, prüfen erneut und laufen weiter. `holding skill browse <staff>` zeigt zuweisbare Fähigkeiten.

Für ein **Dependency-Pack**-Skill: `<pack>/<skill>` oder eindeutiger Name. `holding skill remove <staff> <skill>` löst Pack-Skills. Anhänge bleiben bei Update; Remove warnt und löst sie.

## Auflisten, prüfen, abgleichen

- `holding skill list`: Pack-Skills (mit Pack) plus Server/Custom-Liste
- `holding skill list --custom`: Ihre eigenen Fähigkeiten
- `holding skill check`: was geladen wird, was ignoriert wird und der richtige Pfad
- `holding skill sync [--dry-run]`: öffentliche sofort senden (läuft auch automatisch)

## Öffentlich und privat

Neue eigene Fähigkeiten sind standardmäßig **öffentlich**. Ändern mit `holding skill private <name>` oder `holding skill public <name>` oder durch Verschieben des Ordners. Bei öffentlichen werden `SKILL.md` sowie `references/`, `scripts/`, `templates/` geteilt, nie `history/` und `assets/`. Wirkt eine Datei wie ein Geheimnis, wird die ganze Fähigkeit zurückgehalten. Private verlassen Ihren Rechner nicht; nur ihre Anzahl wird erfasst.

## Bibliotheksfähigkeiten

Geteilte, fertige Fähigkeiten mit gültiger Signatur; unsignierte Kopien werden ignoriert. Zuweisen wie gewohnt mit `holding skill add`.

## Erlaubnis für Skripte

Skripte laufen nie von selbst. Einmal erlauben mit `holding skill consent <name>`, widerrufen mit `holding skill consent <name> --revoke`. Sie laufen in einer Sandbox.

## Fehlerbehebung

- Nicht gefunden: `holding skill check` ausführen und an den angezeigten Pfad verschieben.
- "frontmatter missing": `name`, `description` und `version` im Kopf von `SKILL.md` ergänzen.
- Nicht-Standard-Ordner werden ignoriert.
- "no consent": `holding skill consent <name>` ausführen.
- Öffentliche nicht geteilt: Dateien auf Geheimnisse prüfen, dann `holding skill sync --dry-run`.

Siehe auch: [Befehlsreferenz](../COMMANDS.md)

## Dependency (skill-pack)

Ganzes Skill/Skript-git-Repo als Dependency hinzufügen, dann Pack-Skills an Staff binden:

```bash
holding dependency add <git-url>
holding skill add <staff> <pack>/<skill>
holding skill list
holding skill remove <staff> <pack>/<skill>
```

Pack liegt außerhalb des Projekts; vor Skripten `holding dependency consent`. Siehe COMMANDS.md → dependency.
