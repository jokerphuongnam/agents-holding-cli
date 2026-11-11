# Agents Holding Jira labels

Labels are a display and routing signal. Jira status, the server checkpoint,
and authenticated evidence remain authoritative.

## Persistent labels

| Label | Meaning | Added when | Removed/replaced |
|---|---|---|---|
| `ah-flow:<name>` | Selects a task workflow template | Task creation or `/flow` change | Replaced when the flow changes |
| `staff:<role>` | Staff owning the current stage | A stage starts and an owner is resolved | Replaced on stage change; normally removed at Done |
| `ah-agent-owned` | Agents Holding is coordinating the task | Automated processing starts | Workflow ends or ownership is handed off |

## Transient labels

The listener cleans these during the next reconcile; they are not history.

| Label | Meaning | Added when |
|---|---|---|
| `agent-working` | A worker is running | Before dispatching a worker |
| `ah-awaiting-user` | A required user action is pending | Login, permission, terminal, or approval is required |
| `ah-assignment-required` | Staffing needs a user/CEO decision | No suitable staff is available |
| `ah-blocked` | The agent cannot remediate automatically | A real user blocker is returned |
| `ah-workflow-failed` | A Jira workflow operation failed | A transition/comment/sync operation fails; reconcile retries |
| `ah-registration-required` | Company/project/repo routing is invalid | The listener cannot route the task |
| `terminal-<slug>` | QC selected a terminal command | A registered terminal is selected for a QC check |

Terminal busy is a queue condition, not a blocker or QC failure. Terminal
pass/fail comes from authenticated exit-code and timestamp evidence, never from
the presence of a label. Reopened tasks are reconciled from current Jira
status, checkpoint, and fresh evidence rather than stale labels.
