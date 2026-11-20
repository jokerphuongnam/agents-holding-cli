# Client CI/CD

The public CLI uses one verification workflow for pull requests, pushes to
`main`, and tagged releases.

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

This repository contains the public client distribution. Supabase and Railway
deployments are triggered by service-specific tags in the server repository.
