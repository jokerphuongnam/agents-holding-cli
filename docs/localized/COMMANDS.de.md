# Befehlsreferenz

[English](../COMMANDS.md)

Alle Befehle, die Sie mit Ihrem Schlüssel nutzen können. Im Chat `/holding <Befehl>` eingeben (zum Beispiel `/holding key show`), im Terminal `holding <Befehl>`. Sie antworten sofort, ohne KI. `/ceo` und `/approve` sind Agentenbefehle.

## Einrichtung und Hilfe

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding help [group\|command]` | Alle Befehle Ihres Schlüssels | `holding help staff` |
| `holding setup sync [--claude]` | Installiert die /-Befehle in Ihren Agenten | `holding setup sync` |
| `holding doctor [--server]` | Prüft jeden Einrichtungsschritt | `holding doctor` |
| `holding status` | Status von Einrichtung und Hinweisen | `holding status` |

## Lizenzschlüssel

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding key show` | Schlüssel-ID, Tarif, Guthaben, Geräte | `holding key show` |
| `holding key generate` | Erstellt einen kostenlosen Schlüssel | `holding key generate` |
| `holding key import` | Vorhandenen Schlüssel nutzen (verdeckt) | `holding key import` |

## Firmen

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding company list \| show [c] \| use <c>` | Firmen auflisten, zeigen, wählen | `holding company use acme` |
| `holding company create [name] [--parent P]` | Firma anlegen (ohne Namen = dieser Ordner) | `holding company create acme` |
| `holding company rename\|pause\|resume\|archive <c>` | Firma verwalten | `holding company pause acme` |
| `holding company migrate <folder>` | Ältere lokale Firma importieren | `holding company migrate ./old` |
| `holding company set lang\|communication\|auto-pr\|convention ...` | Firmeneinstellungen | `holding company set auto-pr on` |
| `holding company deny add\|remove\|list <path> [--replace <file>]` | Datei für alle Mitarbeiter sperren | `holding company deny add .env` |

## Mitarbeiter

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding staff list` | Ihre Mitarbeiter | `holding staff list` |
| `holding staff add <role> \| remove <role>` | Rolle hinzufügen oder entfernen | `holding staff add qa` |
| `holding staff policy show\|set\|rule\|git\|shell\|check <staff\|*> ...` | Regeln und Rechte (eine Konfiguration für alle Agenten) | `holding staff policy show dev` |
| `holding staff deny add\|remove\|list <staff> <path> [--replace <file>]` | Datei für eine Rolle sperren | `holding staff deny add dev secrets/` |
| `holding staff set\|unset <staff> ...` | KI und Modell einer Rolle wählen | `holding staff set dev --model fast` |
| `holding staff run <staff> "<task>" \| test <staff>` | Rolle ausführen oder testen | `holding staff test qa` |

## Prozesse und Abläufe

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding company process templates\|list\|setup\|add\|remove` | Prozesse, die der Jira Listener ausführt | `holding company process list` |
| `holding flow show \| list` | Ihre Abläufe | `holding flow show` |
| `holding project add\|remove\|list` | Mit Jira-Projekten verknüpfte Repos | `holding project list` |
| `holding habit list\|edit\|clear` | Gelernte Gewohnheiten | `holding habit list` |

## Aufgaben

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding task list [all] \| history [n]` | Aufgaben und Verlauf | `holding task list` |
| `holding task plan <KEY> \| set <KEY> --staff <role>` | Aufgabe planen oder zuweisen | `holding task set KAN-12 --staff dev` |
| `/approve <task>` | Plan freigeben (im Agenten) | `/approve KAN-12` |

## KI pro Rolle

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding provider list \| set \| unset` | Welche KI jede Rolle nutzt | `holding provider list` |

## Fähigkeiten

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding skill add <staff> <skill>` | Fähigkeit einer Rolle zuweisen | `holding skill add dev code-review` |
| `holding skill list --custom \| browse <staff>` | Eigene Fähigkeiten oder die einer Rolle | `holding skill list --custom` |
| `holding skill where \| check \| sync [--dry-run]` | Ordner, Prüfung und Abgleich | `holding skill check` |
| `holding skill private\|public <name>` | Fähigkeit privat oder öffentlich machen | `holding skill private my-notes` |
| `holding skill consent <name> [--revoke]` | Skripte der Fähigkeit erlauben | `holding skill consent my-tool` |

## Jira und Jira Listener

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding jira connect <site> <email>` | Jira-Token im Schlüsselbund speichern | `holding jira connect me.atlassian.net me@x.com` |
| `holding jira list \| show KEY \| board` | Jira lesen | `holding jira show KAN-12` |
| `holding jira add \| move \| comment ...` | Jira-Karten ändern | `holding jira move KAN-12 Done` |
| `holding jira attach <KEY> <file...>` | Dateien an ein Ticket hängen | `holding jira attach KAN-12 shot.png` |
| `holding listener start\|stop\|status\|logs` | Der Jira Listener | `holding listener status` |

## Figma

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding figma connect [--switch] \| status \| logout` | Bei Figma anmelden (Schlüsselbund) | `holding figma connect` |
| `holding figma export <url> [--out f.png] [--attach KEY]` | Rahmen als PNG exportieren | `holding figma export <url> --attach KAN-12` |

## Atlassian und Confluence

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding atlassian connect [--switch] \| status \| logout` | Atlassian-Anmeldung nur bei Bedarf | `holding atlassian status` |
| `holding confluence page create\|update <SPACE> <title> --file md` | Confluence-Seite anlegen oder ändern | `holding confluence page create ENG "Release" --file notes.md` |

## CEO-Posteingang

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding inbox list [--all] [KEY]` | Offene Fragen und Entscheidungen | `holding inbox list` |
| `holding inbox reply <KEY\|item> <answer>` | Antworten; die Rolle macht weiter | `holding inbox reply KAN-12 2` |
| `holding inbox dismiss <item\|KEY>` | Ohne Antwort schließen | `holding inbox dismiss KAN-12` |

## Mit dem CEO sprechen

| Befehl | Funktion | Beispiel |
|---|---|---|
| `/ceo <request>` | Plant, teilt und verteilt Arbeit | `/ceo add a login page and test it` |
| `holding ceo [--item <id>\|KEY]` | CEO-Sitzung zu einem Eintrag | `holding ceo KAN-12` |

## Nutzung und Berichte

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding usage [--by day\|staff]` | Guthabenbalken dieser Periode | `holding usage --by staff` |
| `holding report types \| show <type> \| key me \| list` | Berichte zur eigenen Nutzung (nur Zahlen) | `holding report show credits --days 7` |
| `holding notify list \| on\|off` | Hinweise für Ihren Schlüssel | `holding notify list` |

## Tarif und Guthaben

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding credit show` | Ihr Guthaben | `holding credit show` |
| `holding billing \| billing usage [days]` | Tarife, Ihr Tarif, Upgrade | `holding billing` |

## Feedback

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding feedback "<text>"` | Feedback senden | `holding feedback "the inbox is great"` |



## codegraph

```bash
holding codegraph list|detect|status|use <name>|clear
```

Auto-detect PATH/MCP/index; 0→prism, 1→silent, several→ask once per company.

## dependency

Füge ein Skill-Pack-git-Repo hinzu, das alle Agenten lesen können. Das Pack wird außerhalb des Projekts geklont (`~/.agents-holding/packs/<name>`); die Company speichert nur eine Referenz.

```bash
holding dependency add <git-url>
holding dependency list
holding dependency update <name|url>
holding dependency remove <name|url>
holding dependency consent <name>
holding dependency run <name> <script>
```

Pack-Skills/Befehle werden für Grok, Claude, Codex und lokale KI angepasst. Skripte brauchen Consent.

## Aktualisieren

| Befehl | Funktion | Beispiel |
|---|---|---|
| `holding update` | Client, Befehle und Jira Listener aktualisieren | `holding update` |

Siehe auch: [Fähigkeiten](../SKILLS.md). Mit `holding help` sehen Sie, was Ihr Schlüssel nutzen kann.
