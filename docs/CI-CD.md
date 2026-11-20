# Client CI/CD

The public CLI uses one verification workflow for pull requests, pushes to
`main`, manual runs, and tagged releases.

## Continuous integration

`.github/workflows/ci.yml` runs the macOS Seatbelt check and Linux client,
workflow, access-policy, and bubblewrap checks. Branch protection on `main`
requires both `macos-policy` and `linux-tests` to pass before a pull request can
merge. Pushes to `main` also run the same checks.

## Release

Push a tag in the shared `vYYYYMMDDNN` format, matching
`full/client/scripts/VERSION`. The release workflow calls the same CI workflow,
then packages the public distribution and creates a GitHub Release with
`.tar.gz` and `.zip` assets. Publishing stops if either CI job fails or the
tag/version do not match.

After publication, update an installed client with:

```bash
AH_VERSION=YYYYMMDDNN holding update --yes
```

This repository contains the client distribution. Production Supabase MCP and
Railway identity deployments belong to the server project and are not changed
by a CLI release.

## Native listener release assets

Each `vYYYYMMDDNN` release also builds the Rust Jira Listener for macOS, Linux, and Windows and attaches assets named `agents-holding-listener-<target>` to the same public CLI release. This is the location used by `holding update` for native listener upgrades.

The listener source remains in the private `agents-holding-server` repository. Configure the `AGENTS_HOLDING_SERVER_READ_TOKEN` repository secret in `agents-holding-cli` with read-only Contents access to that repository. The workflow's built-in `GITHUB_TOKEN` publishes the artifacts to this CLI repository's release.
