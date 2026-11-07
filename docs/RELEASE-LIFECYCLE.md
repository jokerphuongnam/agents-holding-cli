# Official workflow-engine release checklist

The public CLI is evidence only when installed from its published tag in a clean isolated home/config. Do not use an existing cache, Keychain session, old listener, or local task state as proof.

- [ ] Public server artifact and CLI tag published.
- [ ] Official installer run with fresh isolated `HOME`/config.
- [ ] MCP-only bootstrap verified; optional CLI installed from the public artifact.
- [ ] Company discovery plus default and custom flow configuration verified.
- [ ] Jira authentication and status/project mapping verified.
- [ ] Listener start and autostart verified.
- [ ] Valid/invalid transitions, gate guidance, flags, idempotency/no-spam, resume/recovery, timeout/retry/blocked behavior, parent-child and cross-team behavior verified.
- [ ] Full client tests and syntax checks pass.
- [ ] MCP production deployment recorded.
- [ ] Current machine updated from the public tag, listener restarted/autostarted, and a real Jira task verified.

The release report must separate fresh-install/cross-machine evidence from local-only evidence.
