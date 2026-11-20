# Client CI/CD

The public CLI uses one verification workflow for pull requests, pushes to
`main`, manual runs, and tagged releases.

## Continuous integration

`.github/workflows/ci.yml` runs the macOS Seatbelt check and Linux client,
workflow, access-policy, and bubblewrap checks. Branch protection on `main`
requires both `macos-policy` and `linux-tests` to pass before a pull request can
merge. Pushes to `main` also run the same checks.

## Release

Push a version tag in the supported `vYYYYMMDDNN` format. The release workflow
calls the same CI workflow, then packages the public distribution and creates a
GitHub Release with `.tar.gz` and `.zip` assets. Publishing stops if either CI
job fails. A manual workflow run is available for recovery, but normal releases
should use a tag.

After publication, update an installed client with:

```bash
AH_VERSION=YYYYMMDDNN holding update --yes
```

This repository contains the client distribution. Production Supabase MCP and
Railway identity deployments belong to the server project and are not changed
by a CLI release.
