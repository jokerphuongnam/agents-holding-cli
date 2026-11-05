# agents-holding

[English](../README.md)

Führe eine kleine KI-Firma direkt in deinem Coding-Agenten: CEO, Staff, Prozesse und Jira, alles aus dem Chat.

## Einführung

agents-holding macht aus deinem KI-Coding-Agenten (Claude Code, Codex, Cursor oder dem `grok` CLI) eine Holding aus kleinen Firmen. Jede Firma hat einen CEO, mit dem du sprichst, Staff mit klaren Rollen (Engineer, QC, Product…) und einen Workflow, der echte Jira-Aufgaben von der Idee bis zum gemergten Pull Request bringt. Einen MCP-Server hinzufügen, anmelden, fertig.

## Was es kann

- **Firmen und Staff**: Firmen anlegen, Rollen einstellen oder entlassen, Regeln, Modelle und Skills pro Person festlegen.
- **CEO im Chat**: `/ceo` plant die Arbeit, teilt Aufgaben auf und weist sie den richtigen Leuten zu.
- **Prozesse**: Firmenprozesse und Workflows legen fest, wer bei jedem Schritt was macht (Mensch, KI oder Skript).
- **Jira Listener**: ein lokaler Prozess, der dein Jira-Board beobachtet, beim Verschieben einer Karte den passenden Staff startet und auf der Karte berichtet.
- **Nutzung und Credits**: Plan, Credit-Balken und Nutzung pro Staff jederzeit einsehen.

## Vorteile

1. **Workflow zuerst.** Nicht einfach noch ein Chat-Assistent: ein kompletter Ablauf Firma → Staff → Prozess → Jira Listener, damit die Arbeit von selbst von der Karte zum Plan, zur Umsetzung und zum Review läuft.
2. **Befehle ohne Tokens.** Reine Datenbefehle (`/holding key show`, `/holding staff list`, `/holding usage` …) beantwortet ein Hook sofort auf deinem Rechner; der Prompt erreicht das Modell nie.
3. **Ein Setup für alle Agenten.** Dieselben Befehle funktionieren in Claude Code, Codex und dem `grok` CLI.
4. **Deine Daten bleiben lokal.** Verbundene Tools (Jira, Git, Dateien) laufen auf deinem Rechner; Keys liegen im Keychain, nie in Konfigurationsdateien.
5. **Faire Preise.** Credits nur für Aktionen, die Arbeit erzeugen; Modell-Tokens werden nie berechnet.

```
Firma  →  Staff  →  Prozess  →  Jira Listener  →  Plan → Umsetzung → Review → fertig
```

## Installation

MCP-Server hinzufügen, anmelden, fertig. Wähle deinen Agenten:

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp   # Claude Code
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                           # Codex CLI
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp                 # grok CLI
```

Öffne dann deinen Agenten, authentifiziere `agents-holding` im Browser (Free-Key erstellen oder deinen importieren) und schick eine beliebige agents-holding-Nachricht. Bei der ersten Nachricht richtet der Agent die lokalen Befehle für dich ein; wenn er fragt, bestätigst du einmal. Vollständige Anleitung: [SETUP](../full/localized/SETUP.de.md).

## Häufige Befehle

| Befehl | Funktion |
|---|---|
| `/holding help` | Alle Befehle für deinen Key |
| `/holding key show` | Key-ID, Plan, Credits, Geräte |
| `/holding company create` | Firma anlegen |
| `/holding staff list` | Deinen Staff auflisten |
| `/ceo …` | Mit dem CEO sprechen: Arbeit planen, aufteilen, zuweisen |
| `/holding usage` | Credit-Balken für diesen Zeitraum |
| `/holding billing` | Aktueller Plan und Upgrade-Weg |
| `/holding feedback "<text>"` | Feedback an den Owner senden |
| `/holding update` | Lokalen Client aktualisieren |

In Codex nutzt du `!holding …` für sofortige Antworten oder `/prompts:holding` und `/prompts:ceo`. Vollständige Liste: `holding help` ausführen.

## Pläne und Preise

| Plan | Credits / Monat | Preis |
|---|---:|---:|
| free | 1,500 | $0 |
| starter | 4,000 | $2 |
| lite | 6,000 | $2.5 |
| pro | 20,000 | $7.5 |
| power | 80,000 | $25 |
| max | 180,000 | $50 |
| ultra | 300,000 | $75 |
| enterprise | individuell | auf Anfrage |

Nur Aktionen, die Arbeit erzeugen, kosten Credits (ein Agent-Lauf kostet z. B. 2 Credits); Status, Billing und andere Abfragen sind kostenlos. Für ein Upgrade schick deine Key-ID (nie den Key) an **phuongnamp99@gmail.com**. Details: [Preise](../docs/localized/PRICING.de.md).

## Dokumentation

- [Installationsanleitung](../full/localized/SETUP.de.md)
- [Preise](../docs/localized/PRICING.de.md)
- Befehlsreferenz: `holding help` (oder `holding help <Gruppe|Befehl>`) ausführen
- [Firmen](../docs/COMPANIES.md) · [Wer entscheidet was](../docs/WHO-DECIDES.md) · [Ausfallsicherheit](../docs/RESILIENCE.md)

**Datenschutz.** Wir sammeln keine Informationen über dich. Wir erfassen nur Nutzungsgewohnheiten (wann du meist arbeitest, Chat oder Kommentare, wie du deine Tools konfigurierst). Alle verbundenen Tools und alle Daten auf deinem Rechner bleiben auf deinem Rechner.
