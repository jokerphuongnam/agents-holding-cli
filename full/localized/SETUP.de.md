# agents-holding installieren (nur MCP)

[English](../SETUP.md)

Kein `curl | bash` zum Start, kein Skript zum Herunterladen. Füge den MCP-Server zu deinem Agenten hinzu, melde dich im Browser per OAuth an und sag **einmal Ja**, wenn dein Agent anbietet, den lokalen Client zu installieren.

MCP-URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

---

## 1. MCP-Server hinzufügen (ein Befehl)

**Claude Code**

```bash
claude mcp add --transport http --scope user agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Codex CLI**

```bash
codex mcp add agents-holding --url https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Standard-CLI-Agent (Befehl `grok`)**

```bash
grok mcp add --transport http agents-holding https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

**Cursor**: Settings → MCP → Add server, URL:

```
https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp
```

oder in `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "agents-holding": { "url": "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp" } } }
```

## 2. Per OAuth anmelden (Browser)

Öffne deinen Agenten → `agents-holding` verbinden / Authenticate. Eine Webseite öffnet sich: **Create key** (Free, für diesen Rechner) oder **Import key**, wenn du schon einen hast. Der Key landet nie in der Konfigurationsdatei des Agenten; die OAuth-Sitzung erneuert sich automatisch.

## 3. Lokalen Client installieren (eine Bestätigung, erste Nachricht)

Bei deiner **ersten** agents-holding-Nachricht (zum Beispiel `/holding key show`) sind die ersten Zeilen der Antwort eine Installationsanfrage. Dein Agent hält an und fragt einmal:

> Den lokalen agents-holding-Client auf diesem Rechner installieren? Er fügt den Befehl `holding`, native /holding-Slash-Befehle und einen sofortigen Hook (ohne KI) hinzu. Kann gefahrlos erneut ausgeführt werden; der Jira Listener wird jetzt nicht installiert.

Sag **Ja**. Der Agent ruft das Tool `install` auf und führt **einen** Shell-Befehl aus. Er zeigt den Fortschritt `[bootstrap 1/5]` … `[bootstrap 5/5]`:

1. Client-Skripte nach `~/.agents-holding`
2. `holding` im PATH (`~/.local/bin`)
3. Geräte-ID im Keychain (keine Secrets werden ausgegeben)
4. Koppelt diesen Rechner per Einmalcode (10 Minuten, nur einmal gültig; dein Key wird nie angezeigt) mit deiner Agent-Sitzung und installiert dann Slash-Befehle und den sofortigen Hook
5. Fertig; der Server weiß jetzt, dass dieser Rechner den Client hat, und die Installationsanfrage verschwindet

Wenn der Agent nicht gefragt hat, tippe: `install agents-holding` (oder `/holding install`). Kann gefahrlos wiederholt werden.

Dieser Schritt installiert den Jira Listener **nicht**.

**Starte nach der Installation eine neue Agent-Sitzung**, damit der Agent die neuen Befehle lädt.

## 4. Im Chat nutzen: sofort, null KI-Tokens

Nach der Installation beantworten der Hook oder deine Shell reine Datenbefehle lokal. Der Prompt erreicht das Modell nie:

| Agent | So läuft `/holding key show` |
|---|---|
| CLI `grok` | `/holding key show`: der UserPromptSubmit-Hook (`~/.grok/hooks/agents-holding.json`) antwortet sofort |
| Claude Code | `/holding key show`: der UserPromptSubmit-Hook in `~/.claude/settings.json` antwortet sofort |
| Codex CLI | `!holding key show` (lokaler Shell-Escape von Codex); Slash-Befehle: `/prompts:holding`, `/prompts:ceo` |
| Jedes Terminal | `holding key show` |

Jede sofortige Antwort endet mit `(agents-holding: instant, no model)`.

```
/holding help
/holding company create
/holding staff list
/holding billing
/ceo …
```

Befehle, die den Agenten brauchen (`/ceo`, `/task add`, `/flow edit`, `/jira setup`, `/skill add`), gehen bewusst weiterhin an das Modell.

### Feedback senden

```
/holding feedback "<text>"
```

Sendet dein Feedback direkt aus dem Chat (null KI-Tokens). Nur der Owner liest es.

## 5. Jira (nur bei Bedarf)

Wenn ein Befehl oder Agent wirklich Jira braucht (Aufgaben lesen, Dateien anhängen, Spalten verschieben, den Listener starten):

1. Der Agent fragt dich und führt dann `holding jira connect` aus (Browser-OAuth; Token im Keychain; der Chat zeigt nur den Kontonamen)
2. `holding jira status` / `holding jira logout` / `holding jira connect --switch`
3. Jira Listener (lokaler Prozess), nur bei Bedarf: `bash ~/.agents-holding/scripts/listener-ensure.sh --repo <product-repo-path>`

MCP-Installation, das Anlegen einer Firma und Befehle ohne Jira-Bezug verlangen **nie** eine Jira-Anmeldung.

## 6. Aktualisieren

Im Chat: `/holding update` (oder bitte den Agenten, `holding update` auszuführen). Kann gefahrlos wiederholt werden.

---

## 7. Pläne und Preise (Credits)

Preisliste: **[PRICING.md](../../docs/PRICING.md)**: Credits pro Monat, Preise, Staff- und Geräte-Limits, Kosten pro Aktion, wie du upgradest.

Für ein Upgrade schick deine **Key-ID** (aus `holding key show`; nie den Key selbst) an den Owner: **phuongnamp99@gmail.com**. `holding billing` und `holding key show` zeigen immer den aktuellen Kontakt.

Auf deinem Rechner: `holding billing` · `holding usage`.

---

## Anhang: Installation per Skript (nicht empfohlen)

Nur wenn der Agent die Installation nicht ausführen kann (besondere Umgebungen). Nicht der normale Weg.

```bash
git clone --depth 1 https://github.com/jokerphuongnam/agents-holding-free.git ~/.agents-holding-src
bash ~/.agents-holding-src/full/client/scripts/bootstrap-local.sh
holding key import
```

Die alten Skripte `connect.sh` / `install.sh` bleiben aus Kompatibilitätsgründen im Repository; neue Dokumentation nutzt sie **nicht**.
