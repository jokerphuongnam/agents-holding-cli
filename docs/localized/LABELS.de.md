# Jira-Labels von Agents Holding

Labels sind Anzeige- und Routing-Signale. Maßgeblich bleiben Jira-Status,
Checkpoint und authentische Evidence.

| Label | Bedeutung | Hinzugefügt wenn |
|---|---|---|
| `ah-flow:<name>` | Workflow-Vorlage der Aufgabe | Beim Erstellen oder Ändern des Flows |
| `staff:<role>` | Staff des aktuellen Stages | Beim Start eines Stages |
| `ah-agent-owned` | Holding koordiniert die Aufgabe | Automatische Verarbeitung beginnt |
| `agent-working` | Worker läuft | Vor dem Worker-Dispatch |
| `ah-awaiting-user` | Benutzeraktion erforderlich | Login, Berechtigung, Terminal oder Freigabe fehlt |
| `ah-blocked` | Automatische Behebung nicht möglich | Ein echter Benutzer-Blocker vorliegt |
| `ah-registration-required` | Routing-Konfiguration fehlt | Repo/Projekt nicht registriert ist |
| `terminal-<slug>` | QC-Terminalbefehl | Ein registriertes Terminal gewählt wurde |

Temporäre Labels werden beim nächsten Reconcile bereinigt. Ein belegtes
Terminal ist eine Warteschlange, kein Blocker und kein QC-Fehler.
