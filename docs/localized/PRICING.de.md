# agents-holding Preise (Credits)

[English](../PRICING.md)

Credit-Pläne, Limits, Kosten pro Aktion und wie du upgradest. Es gibt keine Zahlung in der App: Für ein Upgrade kontaktierst du den Owner mit deiner **Key-ID**.

Aktuellen Plan auf deinem Rechner prüfen: `holding billing` · `holding usage` · `holding key show` (zeigt nur die Key-ID, nie das Secret)

---

## Credit-Pläne (monatlich)

| Plan | Credits / Monat | Preis | Kanal |
|---|---:|---:|---|
| free | 1,500 | $0 | direkt |
| starter | 4,000 | $2 | direkt |
| lite | 6,000 | $2.5 | direkt |
| pro | 20,000 | $7.5 | direkt |
| power | 80,000 | $25 | direkt |
| max | 180,000 | $50 | direkt |
| ultra | 300,000 | $75 | direkt |
| marketplace | 20,000 | $10 | marketplace |
| enterprise | individuell | auf Anfrage | Owner kontaktieren |

- Nur **gemessene** Keys (mit Credit-Plan) verbrauchen Credits. Ältere Keys ohne Messung funktionieren wie bisher.
- **enterprise**: Credits, Plätze und Geräte nach Vereinbarung. **Kontaktiere** den Owner.
- marketplace-Plan: wird über den Marketplace gekauft. Für Bestelldetails **kontaktiere** den Owner.

---

## Staff-Limit (pro Firma)

Maximale Anzahl an Staff im Team einer Firma, inklusive CEO. Gilt beim Hinzufügen, Verschieben oder Zuweisen von Staff, bei der Migration und beim Anlegen einer neuen Firma. Der Owner-Key hat kein Limit.

| Plan | Max. Staff / Firma |
|---|---:|
| free | 5 |
| starter | 10 |
| lite | 15 |
| pro | 25 |
| marketplace | 25 |
| power | 40 |
| max | 60 |
| ultra | unbegrenzt |
| enterprise | unbegrenzt |

Ältere Keys **ohne** Credit-Plan: trial 20 · monthly 30 · yearly 50 · sonst 30.

Am Limit siehst du: *„Du hast das Limit von N Staff im Plan X erreicht. Entlasse zuerst jemanden aus dem Staff oder upgrade deinen Plan.“*

---

## Geräte-Limit (Rechner)

| Punkt | Wert |
|---|---|
| Standard pro Key | **1** Gerät |
| Maximum, das der Owner vergeben kann | **1 bis 50** Geräte pro Key |
| Free-Key auf einem Rechner erstellt | **ein** Free-Key pro Rechner |
| enterprise | Geräte pro Key nach Vereinbarung: **kontaktiere** uns |

Keine Geräteplätze mehr frei? Bitte den Owner, dein Limit zu erhöhen, und versuche es dann auf dem neuen Rechner erneut. `holding key show` zeigt genutzte/maximale Geräte.

---

## Credit-Kosten pro Aktion

Nur die folgenden Aktionen, die Arbeit erzeugen, kosten Credits. Alles andere (Heartbeat, Echtzeit-Sync, Status, Billing, Inbox-Liste, Key, Admin, die meisten CLI-Befehle) ist **kostenlos**.

| Aktion | Credits |
|---|---:|
| Agent-Lauf (`next_action`) | **2** |
| `advance` | 1 |
| `jira_ops` | 1 |
| `staff_brief` | 1 |
| `record_artifact` | 1 |
| `assign` (inkl. `holding task set …`) | 1 |
| `ceo` | 1 |
| `inbox_post` / `inbox_reply` | 1 |

**Modell-Tokens werden nie in Credits berechnet.**

### Uploads (Jira-Anhang / Figma-Export / Confluence)

**1 Credit pro Datei, plus 1 Credit je 10 MB über die ersten 5 MB hinaus**, **höchstens 5 Credits pro Datei**.

Beispiele: 0.4 MB → 1 · 25 MB → 3 · 300 MB → 5.

Dateien gehen direkt von deinem Rechner zu Jira, Confluence oder Figma; der Server misst nur die Größe, um Credits zu zählen.

---

## Upgrade oder Credits hinzufügen

1. Hol dir deine **Key-ID** (schick nie den geheimen Key): `holding key show` oder die Zeile „To upgrade“ in `holding billing` / `holding usage`.
2. Schick die Key-ID an den **Owner** (**phuongnamp99@gmail.com**) mit dem gewünschten Plan oder den zusätzlichen Credits, die du in diesem Zeitraum brauchst.
3. **Es gibt noch keine Zahlung in der App.** Wenn sie kommt, läuft das Upgrade über denselben Weg; diese Preisliste bleibt die Referenz.

Keine Credits mehr oder Key abgelaufen: Der Jira Listener stoppt und bittet dich, den Owner für Verlängerung oder zusätzliche Credits zu kontaktieren.

---

## Schnell nachsehen auf deinem Rechner

```bash
holding billing          # aktueller Plan + Preisliste + Upgrade-Hinweis
holding usage            # Credit-Balken für diesen Zeitraum (gemessene Keys)
holding credit show      # Credit-Guthaben
holding key show         # Key-ID, Plan, Geräte
```

Installation / MCP: [full/SETUP.md](../../full/SETUP.md).
