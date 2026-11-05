# Ausfallsicherheit: was passiert, wenn etwas kaputtgeht

[English](../RESILIENCE.md)

Der Jira Listener bewältigt drei Arten von Ausfällen, ohne Arbeit zu verlieren. Er erfindet nie Jira-Ereignisse.

## 1. Agent-Komprimierung / Kontextverlust / Abbruch mitten im Lauf → Checkpoint + Fortsetzen
- Jede Stage schreibt einen Checkpoint nach `~/.config/agents-holding/state/<company>/<KEY>.ckpt.json`. Er speichert Stage, fertige Schritte, erledigte Coding-Unterschritte, den letzten Commit und Fehler.
- Größere Tech-Pläne werden in bis zu 3 Unterschritten kodiert. Jeder endet mit einem `WIP(<KEY>) n/3`-Commit auf `feature/<KEY>`, und die Karte erhält eine 📌-Fortschrittsnotiz mit Erledigtem (✅) und Rest (⏳).
- Ein erneuter Lauf (`holding staff run <KEY>` oder erneutes Verschieben der Karte) setzt am Checkpoint fort. Fertige Pläne, Tech-Pläne und Unterschritte werden nicht wiederholt.
- Meldet die Agent-CLI Komprimierung, Truncation, Kontextüberlauf oder Max-Turns, wird der Aufruf einmal in einer frischen Sitzung mit Fortsetzungsnotiz wiederholt.

## 2. Agent abgelaufen / nicht verfügbar → `agent-blocked` + Fallback
- Exit-Code und Ausgabe jeder CLI werden klassifiziert als: Login abgelaufen, Credits/Quota leer, Rate-Limit, CLI fehlt, Kontext verloren oder Timeout.
- **Rate-Limit:** automatischer Retry mit Backoff (30s → 60s → 120s).
- **Fallback:** füge pro Staff-Mitglied eine `fallback`-Liste in `state/<company>/agents.jsonc` hinzu. Bei Login-, Quota-, fehlender-CLI- oder Rate-Limit-Fehler wird der nächste Befehl automatisch genutzt und die Karte notiert den Wechsel.
  ```jsonc
  "developer": { "command": "claude -p … \"{prompt}\"", "fallback": ["codex exec --json … \"{prompt}\"", "grok --single \"{prompt}\" --output-format json"] }
  ```
- **Wenn nichts mehr geht:**
  - Die Karte bekommt das Label `agent-blocked` und einen Kommentar in der Task-Sprache mit Ursache, Befehl und genauer Behebung (`claude login`, `codex login`, `grok login`, CLI installieren, Credits prüfen).
  - Du erhältst eine macOS-Benachrichtigung und `holding status` zeigt den Block.
  - Das Label verschwindet beim nächsten erfolgreichen Lauf.

## 3. MCP-Server-Probleme (down, Quota, Überlast, Timeout) → Warnung + Abgleich
- Der Jira Listener erkennt Verbindungsverlust, 5xx/Überlast, Timeouts und Quota-Fehler. Er protokolliert eine rote Warnung, sendet eine Benachrichtigung und `holding status` zeigt sie. Arbeit pausiert, Checkpoint bleibt.
- Bei wiederhergestellter Verbindung (und bei jedem Listener-Start) liest er Issues, die seit dem letzten gesehenen Ereignis aktualisiert wurden. Er spielt jeden echten Status einmal ab, dedupliziert nach Issue + Status + Update-Zeit lokal und auf dem MCP-Server. Replay liest nur Jira und schreibt nie Ereignisse.
- Nur-Lese-Befehle (`holding status`, `board`, `tasks`, `usage`, …) zeigen die letzte gute Antwort als **STALE** mit Uhrzeit. Schreibbefehle scheitern klar.
- Quota-Fehler drucken: "MCP server quota exceeded (plan limit / too many requests). Work pauses; nothing is lost."

Tests: `node tests/resilience_test.mjs` nutzt Mock-CLIs mit Auth-, Ablauf-, Quota-, Rate-Limit-, Komprimierungs- und Fehlfehlern sowie einen Mock-MCP-Server mit 503/429.

## 4. Jira Listener stoppt → sofortige Warnung, nichts geht verloren

**Der Jira Listener hält die gesamte Jira-Automatisierung am Laufen** (Kartenbewegungen, Kommentare, Staff-Läufe). Ist er aus, passiert auf Jira nichts, bis du ihn wieder startest — deshalb wirst du sofort informiert:

- **Sauberer Stopp / Beenden / Logout** (SIGTERM, SIGINT, SIGHUP, `launchctl bootout`): der Listener meldet dem MCP-Server vor dem Exit „stopped“ (~1 s).
- **Crash, Sleep oder Freeze**: Heartbeat alle 60 s; nach 150 s ohne markiert der MCP-Server offline.
- **Lokaler Watchdog** (launchd-Job `com.agentsholding.listener-watchdog`, installiert mit `holding listener start` / `autostart on`): prüft alle 5 s und zeigt eine macOS-Benachrichtigung *"Jira Listener is off — all Jira automation is stopped until you start it: `holding listener start && holding listener autostart on`"* (Erinnerung alle 15 Min), *"Jira Listener restarted"* nach Crash und launchd-Neustart, und *"running again"* bei Rückkehr. Log: `~/Library/Logs/agents-holding/watchdog.log`.
- `holding status`, `holding listener status` und `/ceo` beginnen mit derselben roten Warnung, solange er aus ist; das CEO-Postfach erhält einen Eintrag „Jira Listener is off“.
- **Jira-Änderungen während er aus ist**: die erste Änderung jeder Karte erhält EINEN Kommentar (in der Task-Sprache), dass der Jira Listener aus war und wie man ihn startet. Bei Rückkehr wird das Flag gelöscht, der Offline-Eintrag geschlossen und verpasste Änderungen abgespielt (Abgleich); unfertige Läufe setzen am Checkpoint fort.
- Ein Replay, das nur sagt „die Karte ist noch in der Spalte, aus der der Agent sie herausbewegt“, wird ignoriert (kein falsches „du hast sie zurückgezogen“).

## 5. Wer an einer Karte arbeitet (assignee)

Wenn ein Staff eine Aufgabe übernimmt (im selben Moment wie das Label `staff:<id>`), wird der Jira-Assignee der Karte auf den `jira_user` des Staff gesetzt (optional, in `agents.jsonc`: Jira-accountId oder E-Mail) oder sonst auf das Jira-Konto, mit dem der Jira Listener verbunden ist. Das Staff-Label bleibt. Der Assignee bleibt bei needs-hire / needs-decision / blocked und bei Done.

## 6. Wohin Fragen gehen: CEO-Postfach, nie ein blockierter Lauf

Alles, was dich braucht (Staff-Frage, 1/2/3-Entscheidung, Einstellung, blockierter Agent z. B. durch Login, Freigabe-Tor, QC-Stopp, fehlgeschlagener Lauf, „welches Repo?“, Jira Listener aus), wird EIN wartender Eintrag im **CEO-Postfach** und eine macOS-Benachrichtigung mit Titel **Agents Holding**, Task-Key, Bedarf und Antwortweg. Staff-Läufe warten nie auf Eingabe: sie posten den Eintrag und beenden; deine Antwort setzt die Aufgabe am Checkpoint fort.

- `holding inbox [--all] [KEY]`: wartende Einträge, gruppiert nach Firma.
- `holding inbox reply KAN-12 2`: schnelle Antwort ohne Sitzung (gleiche Wirkung wie Antwort auf der Karte; nichts wird nach Jira geschrieben).
- `holding inbox dismiss <id|KEY>`: Eintrag schließen, den du nicht beantworten musst (nichts geht an Staff oder Jira).
- `holding status` zeigt, wie viele CEO-Postfach-Einträge warten.
- **Open CEO**-Button auf der Benachrichtigung oder `holding ceo --item <id>`: öffnet eine CEO-Sitzung (neues Terminal-Fenster) fokussiert auf diesen Eintrag.
- `/ceo` zeigt zuerst wartende Einträge. Im Firmen-Repo: nur diese Firma. Außerhalb jeder Firma: Holding-Modus, wartende Einträge und Fortschritt aller Firmen, gruppiert; von dort erledigen. Freigeben mit `/approve`, verschieben/erledigen mit `holding jira move KAN-12 "Done"`.

**Kommunikationseinstellung** (pro Firma, `holding company set communication jira+chat|chat`, Standard `jira+chat`):
- `jira+chat`: Fragen/Entscheidungen/Fortschritt werden auf der Karte kommentiert UND gehen ins CEO-Postfach; an beiden Orten antworten.
- `chat`: keine Frage-/Entscheidungs-/Fortschrittskommentare auf Karten; antworte mit `/ceo` oder `holding inbox reply`. Labels, Status und Assignee aktualisieren sich weiter auf Jira.

## Keys und Credits

1. **Key holen.** Setup bietet zwei Optionen: **Generate key** (neuer Free-Key für diesen Mac, 1.500 Credits im Monat, ein Free-Key pro Maschine, für immer) oder **Import key** (ein Key, den du schon hast). Der Key wird versteckt abgefragt und liegt nur im macOS-Keychain.
2. **Key auf diesem Mac verloren?** Generate key erneut: der Free-Key dieser Maschine wird wiederhergestellt (gleiche Credits und Historie, neues Geheimnis; der alte funktioniert nicht mehr). Bezahlte Keys: Import key.
3. **Prüfen.** `holding key show` (Key-id, Plan, Credits, Maschinen), `holding credit show`, `holding billing`. Zum Upgrade oder Nachkaufen von Credits die Key-id (nie den Key) an den Eigentümer senden. Preisliste: [PRICING.md](../PRICING.md) (auch von `holding billing` verlinkt).
4. **Pläne (Credits im Monat).** Free 1.500 · Starter 4.000 · Lite 6.000 · Pro 20.000 · Power 80.000 · Max 180.000 · Ultra 300.000 · Marketplace 20.000 für $10 · Enterprise individuell — Details in [PRICING.md](../PRICING.md).
5. **Was kostet.** next action 2; advance, Jira-Updates, staff brief, record artifact, assign, CEO, inbox post / reply je 1. Alles andere ist frei; Modell-Tokens werden nie gezählt.
6. **Extra-Credits** vom Eigentümer: für die Periode, bis der Key erneuert wird (höchstens 90 Tage gehalten), oder bis aufgebraucht (überleben Ablauf, wirken aber nur bei aktivem Key).
7. **Keine Credits oder abgelaufen.** Der Jira Listener stoppt mit "Key is no longer valid or out of credits; contact the owner to renew or add credits". Jira-Änderungen dazwischen werden nicht abgespielt; nach Erneuerung gleicht der Jira Listener den aktuellen Stand jeder offenen Karte ab.

## Enterprise-Plan (geplant; nächste Phase)

**Keys und Credits sind live** (siehe Abschnitt oben); die Team-Funktionen hier sind die nächste Phase. So arbeitet die Team-Version:

- **Nur der eingegebene Key entscheidet über Plan und Rolle**; kein separates Login oder Rollenauswahl. Rollen:
  - **admin**: Eigentümer der Plattform.
  - **personal user**: persönlicher Plan.
  - **enterprise owner**: vom Admin ausgestellter Key; erzeugt, widerruft, erneuert und verwaltet Keys nur in der eigenen Enterprise, nie den gemeinsamen/persönlichen Key-Pool oder andere Enterprises.
  - **enterprise employee**: von seinem Enterprise-Owner erzeugter Key.
- **Ein gemeinsames Board pro Firma**; ein gemeinsamer CLI-Server kann die Jira-Automatisierung der ganzen Firma fahren.
- **Staff auf echte Jira-Nutzer gemappt** (`jira_user`) mit Rollen/Rechten und Audit, wer was übernommen / geändert hat.
- **Assignee-gesteuert**: jeder betreibt seinen eigenen Jira Listener; wechselt der Assignee einer Karte auf seinen Jira-Nutzer, nimmt sein Listener sie mit seinem Staff auf.
- **Chat zuerst**: Gespräche über `/ceo` oder Staff-Chat; Jira-Kommentare optional (Kommunikationseinstellung). Haupteinstieg ist `/ceo KAN-12`: der CEO lädt die Aufgabe und koordiniert den Staff.

