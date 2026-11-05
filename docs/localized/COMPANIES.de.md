# Firmen

[English](../COMPANIES.md)

Ein Holding, viele Firmen. Jede Firma hat eigenen Staff, Jira-Board, Jira Listener und Einstellungen; was sie nicht überschreibt, folgt den Holding-Standards.

Chat: `/ceo companies` (Liste) · `/ceo company <verb> ...` (gleiche Verben wie unten). Terminal: `holding company <verb>`.

| Befehl | Was er tut |
|---|---|
| `holding company list` / `count` / `overview` | Mit dem Holding verbundene Firmen (Kinder unter dem Elternteil), Status, Staff, Jira, Jira Listener. `overview` ergänzt Gesundheit: offene/blockierte Aufgaben, wartende Punkte, Credits (30 Tage). |
| `holding company show [name]` | Produkt, Status, Eltern/Kinder, Staff, Jira, Jira Listener, Board-Spalten, Aufgabenanzahl, Credits, Konfiguration. |
| `holding company create <name> [--parent P] [--tech a,b] [--jira KEY]` | Neue Firma mit Standard-Staff und Standard-Board (inkl. Reopened und Blocked). |
| `holding company rename <c> <new name>` | Nur Anzeigename; die id bleibt, Repos und Jira laufen weiter. |
| `holding company pause / resume / archive <c>` | Pausierte/archivierte Firmen starten keine neue Arbeit und verbrauchen nichts. |
| `holding company delete <c> --confirm <c>` | Nur nach `archive` und nur ohne Tochterfirmen. Repo, lokale Dateien und Jira-Board bleiben unberührt. |
| `holding company move <c> --parent <P|none>` | Elternteil ändern. |
| `holding company staff move <role> <from> <to>` / `staff assign <role> <c>` | Staff-Rolle zwischen Firmen verschieben oder hinzufügen (Planlimits gelten). |
| `holding company link <c> <KEY>` / `unlink <c>` | Jira-Board verknüpfen oder trennen. |
| `holding company config [c] [set|unset <key> <value>]` | Überschreibungen pro Firma: `communication`, `auto-pr`, `flow`, `share-skills`. `unset` = Holding-Standard. `config defaults [set ...]` bearbeitet Holding-Standards. |
| `holding company migrate <folder> [--parent P] [--name N] [--slug S] [--dry-run]` | Ältere lokale Firma (`.agents/*-company`) ins Holding holen. Siehe unten. |

Nur verbundene Firmen werden gelistet. Ältere nur-lokale Firmen bleiben ausgeblendet (und werden nie gelöscht), bis du sie migrierst.

## Ältere lokale Firma migrieren

`holding company migrate <repo or .agents/x-company folder>`
1. Sichert den Ordner nach `~/.config/agents-holding/backups/<name>-<time>.tgz` (Originale bleiben auf der Platte).
2. Sendet nur Namen und Anzahlen: Staff-Rollen-ids, Anzahl Pläne, Elternteil, Erstellungszeit. Keine Dateiinhalte.
3. Staff, deren Rolle im Holding-Katalog steht, wird echter Staff (bis zum Planlimit, siehe unten). Benutzerdefinierte Rollen (nicht im Katalog) werden nur namentlich in der Firmengeschichte erfasst; Holding liest ihre Persona-Dateien nicht. Zum Weiterverwenden: privates Repo-Skill unter `.agents/custom-skills/<id>/SKILL.md`.
4. Schreibt `.agents/company.json` ins Repo und registriert das Repo. Erneutes Ausführen ist sicher (aktualisiert dieselbe Firma).
Zuerst Eltern migrieren, dann Kinder mit `--parent <parent>`.

Nach der Migration wird nur `.agents/company.json` gelesen. Den alten Ordner `.agents/<x>-company` kannst du nach vollem Backup entfernen (Migrate-Backup überspringt `cache/`): `tar czf ~/.config/agents-holding/backups/<name>-legacy-full-<date>.tgz -C .agents <x>-company`.
Empfohlenes Layout des Behaltenen: `.agents/cache/` und `.agents/plans/` (persönlich, untracked) sowie `.agents/custom-skills/<id>/` (private Repo-Skills, nie veröffentlicht). Holding verlangt keinen festen Ort für Cache oder Pläne.
Tochterfirmen (`children/<child>` auf ein anderes Repo) separat migrieren, bevor du den alten Elternordner entfernst.

## Staff-Limits pro Plan

Die Besetzung jeder Firma darf höchstens so viele Personen haben (CEO inklusive). Gilt für `/staff add`, `holding company staff move|assign`, `holding company migrate` und neue Firmen. Vollständige Preise (Credits, Geräte, Aktionskosten): [PRICING.md](../PRICING.md).

| Plan | Max. Staff pro Firma |
|---|---|
| Free | 5 |
| Starter | 10 |
| Lite | 15 |
| Pro | 25 |
| Marketplace | 25 |
| Power | 40 |
| Max | 60 |
| Ultra | Unbegrenzt |
| Enterprise | Unbegrenzt |
| Ältere Keys ohne Credit-Plan: trial / monthly / yearly | 20 / 30 / 50 |

Am Limit: „Staff limit of N for plan X reached. Fire a staff member first, or upgrade the plan.“ Migrate behält die ersten N und meldet, wie viele übersprungen wurden.

## Board-Spalten

Neue Firmen erhalten: To Do → In Progress → Product Work → BA Question → Planned → Pre Coding → **Reopened** → Coding → QC → In Review → **Blocked** → Done.
- **Reopened**: Karte hierher, wenn ein Test scheitert; der Agent setzt Coding fort.
- **Blocked**: Die Karte wartet auf dich; Agenten verschieben Karten nie selbst in diese Spalte hinein oder hinaus.

Bestehende Firmen behalten ihr Board. Reopened/Blocked zu einem bestehenden Board hinzufügen:
1. Im Chat: `/flow edit` und Reopened (vor Coding) sowie Blocked (vor Done) anfordern; gezeichneten Flow bestätigen.
2. Im Repo: `holding jira setup-workflow <site> <email> <KEY>` mit `AH_FLOW_JSON` auf den gespeicherten Flow (der Agent macht das), dann Spalten in die gedruckte Reihenfolge ziehen (Jira hat keine API zum Umsortieren).

### Eigene Spalten pro Firma
Jede Firma kann Extra-Spalten haben (`/flow edit`). Beispiel (Test-Promotion), nach In Review:
Ready Testing on Develop → Verified on Develop (öffnet PR nach `develop`) → Ready Testing on Integration → Verified on Integration (öffnet PR vom Feature-Branch nach `main`) → Blocked → Done.
PRs öffnen sich nur, wenn auto-PR für die Firma an ist (`holding company config <c> set auto-pr on`).
Hinweis: Die Karte nach dem Merge des `main`-PR automatisch nach Done zu schieben geht noch nicht; nach dem Merge selbst nach Done ziehen.
