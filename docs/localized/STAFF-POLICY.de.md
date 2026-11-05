# Staff-Regeln, Berechtigungen und Prozesse

[English](../STAFF-POLICY.md)

Jede Firma hat **eine gemeinsame Konfiguration**. Sie enthält firmenweite Standards, und jedes Staff-Mitglied kann einen eigenen Zusatzabschnitt haben. holding wandelt das bei jedem Lauf in die eigene Config jedes Agenten um. Nur der Eigentümer oder ein Firmen-Admin darf ändern, und Staff kann die eigenen Rechte nicht lockern.

## Regeln und Berechtigungen
```
holding staff policy show <staff|*>                      Config anzeigen (* = ganze Firma)
holding staff policy set <staff|*> <permission> on|off   z. B. mark_done, pr_merge, push_protected, call_staff
holding staff policy rule add <staff|*> "<rule>"         Klartextregeln, die die KI bei der Arbeit liest
holding staff policy git set <staff|*> branch_pattern "^NAIL-[0-9]+$"
holding staff policy check <staff> branch|commit|pr|push <value>
```
Git-Regeln (Branch-Name, Commit-Format, PR-Titel, Pflicht-Checklisten im PR) prüft der Server. Verstöße werden mit klarem Grund abgelehnt.

Beim Hinzufügen von Staff (`holding staff add <role>`) zeigt ein Pfeiltasten-Menü die Rollenstandards: annehmen oder bearbeiten. Mit `AH_NONINTERACTIVE=1` werden die Standards ohne Nachfrage genutzt.

## Datei-Denylist
```
holding company deny add <path> [--replace <file>]     Datei für allen Staff sperren
holding staff deny add <staff> <path> [--replace <file>]
holding company deny list | holding staff deny list <staff>
```
Liest die KI eine gesperrte Datei, bekommt sie nur einen Hinweis auf die Sperre — nie den echten Inhalt. Mit `--replace` (z. B. `.env` → `.env.example`) erhält sie den Inhalt der Ersatzdatei. Die Ersatzdatei wird zuerst gescannt, damit kein echtes Geheimnis leckt. Firmen- und Staff-Listen werden kombiniert, und Staff kann keinen Eintrag entfernen, den die Firma schon gesperrt hat.

## Firmenprozesse (Jira Listener)
```
holding company process templates | list | setup
holding company process add --template linked-done --from MARLIN --to NAIL
holding company process remove <id>

```
Beispiel: Wenn eine Aufgabe in Projekt X in Status S wechselt, erledigt der Jira Listener die konfigurierte Arbeit (Status ändern, kommentieren, zuweisen, CEO benachrichtigen) an verknüpften Aufgaben in den Projekten Y und Z. Der Listener nutzt nur echte Jira-Links, macht jede Aktion einmal und läuft nie in eine Schleife.

## Update
`holding update`, oder `/holding update` im Chat tippen. Aktualisiert den Client, erzeugt die Agent-Config neu, synchronisiert Chat-Befehle erneut und startet den Jira Listener neu. Erneutes Ausführen ist sicher. Ist der Client veraltet, weist die KI darauf hin und kann diesen Befehl für dich ausführen.

## Anhänge, Figma, Confluence
```
holding jira attach NAIL-12 screenshot.png log.txt         lokale Dateien an ein Issue anhängen
holding figma connect                                        Figma-Token im Keychain speichern (versteckte Eingabe, geprüft mit /v1/me)
holding figma export "<Figma link with node-id>" --attach NAIL-12   Frame als PNG exportieren und anhängen
holding confluence page create NAIL "Screen spec" --file spec.md --attach screen.png
holding confluence page update NAIL "Screen spec" --file spec.md
```
Diese Befehle nutzen den Atlassian-Token im Keychain und drucken den Token nie. Staff braucht `jira_attach` (standardmäßig an), `figma_export` (standardmäßig an) und `confluence_write` (standardmäßig nur CEO, Lead, Manager). Mit `--dry` nur Vorschau, ohne etwas zu senden.
