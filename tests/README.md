# Tests

Run `scripts/test-all.sh` from any directory. It runs every `full/client/scripts/*_test.mjs` and `tests/*_test.sh` in a deterministic offline suite. Tests use temporary HOME/PATH directories and local fixtures: no credentials, real keychain, network, model call, or live Jira event/write is used. Jira Listener rules are exercised in dry-run mode only.

Coverage includes CLI command handling, `.agents/<folder>/` company resolution, privacy and outbound allowlists, staff/provider policies, key/device operations, dependency-pack discovery/adaptation/consent boundaries, codegraph detection and Prism fallback, Jira Listener events/actions, hooks with the 8-second cap and executable guard, version/update behavior, and shell/Node interactive menus.
