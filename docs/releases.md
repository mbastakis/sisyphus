# Releases and local hooks

## Install local validation

From a fresh checkout:

```sh
mise install
mise exec -- uv sync --project backend
mise exec -- npm --prefix frontend ci
mise exec task -- task e2e:sync
mise exec task -- task hooks:install
```

Hook installation sets this repository's `core.hooksPath` to `.githooks` and
makes both hooks executable. Run it again after cloning or if hooks were disabled.
It is repeatable and refuses to replace a different configured hooks path.
Git's default `.git/hooks` directory is inactive with this setting; migrate any
custom hooks there before installation. The hooks require `mise` on Git's PATH,
including when committing from an editor.

Pre-commit runs `task hooks:check`. It checks staged whitespace and runs Ruff
0.15.0 lint and format checks on the staged contents of changed Python files.
It handles partially staged files without rewriting either the index or the
working tree. Existing untouched Python formatting is not a release gate.
There is no existing frontend formatter or linter in this project. Frontend
TypeScript checks run with the production build in pre-push.

Pre-push runs the existing `task validate` suite for every push: icon consistency,
backend lint, frontend TypeScript and production build, board configuration,
backend unit/API tests, and desktop/mobile Chromium browser tests against fake
data. The existing suite builds the frontend again before browser tests.
Container-dependent `test:taskwarrior` and `test:cli` remain explicit commands
requiring a built image; they are not part of `validate`.

Release-tag pushes additionally require the checked-out HEAD to equal the tag's
peeled commit, with no tracked modifications or untracked files. Fix validation
failures before releasing; do not bypass the hook with `--no-verify`.
Hooks are local and are not installed by a Git clone automatically.

To run both hooks without committing or pushing:

```sh
.githooks/pre-commit
.githooks/pre-push </dev/null
```

## Publication

`.github/workflows/release.yml` runs only on `v*` tag pushes. Before checkout or
building, it accepts only stable semantic versions `vMAJOR.MINOR.PATCH`, without
leading zeroes, prerelease suffixes, or build metadata. Other `v*` tags fail this
guard and publish nothing. Branch pushes and pull requests do not run it. The
workflow has no manual trigger, test job, or lint job.

The workflow builds the existing Dockerfile for `linux/amd64` on an amd64 runner
and uses `GITHUB_TOKEN` with `packages: write` to publish:

| Value | Contract |
| --- | --- |
| Image repository | `ghcr.io/mbastakis/sisyphus` |
| Release discovery tag | `v0.1.0`, then the selected stable semantic version |
| Commit discovery tag | `sha-<full 40-character source commit>` |
| Authoritative reference | `ghcr.io/mbastakis/sisyphus@sha256:<digest>` |
| `org.opencontainers.image.revision` | Exact full commit from `git rev-parse HEAD^{commit}` after tag checkout |
| `org.opencontainers.image.source` | `https://github.com/mbastakis/sisyphus` |
| `org.opencontainers.image.version` | Exact release tag, including `v` |

The labels are on the runnable image configuration. Buildx's minimal provenance
can add an attestation descriptor with `unknown/unknown` platform to an OCI index.
Consumers must locate the `linux/amd64` image manifest in that index, then read
its configuration labels. The digest reported by the build action and job
summary is the top-level published digest. Keep that digest as the immutable
pull reference. Neither discovery tag is an authoritative deployment pin.

Action references are full commit SHAs verified with upstream `git ls-remote`
on 2026-09-09: checkout v4.2.2, login-action v3.4.0, setup-buildx-action v3.10.0,
and build-push-action v6.16.0. These pins do not make the Dockerfile's upstream
OS packages, base-image tags, or installer downloads reproducible.

## Initial public package setup

1. Enable GitHub Actions for the public `mbastakis/sisyphus` repository. Allow
   its workflow token to publish packages. If a package already exists, grant
   this repository Actions access to it.
2. Configure a GitHub tag ruleset for `v*` that restricts updates and deletion.
   Published release tags are immutable. Use a new version for corrections.
3. After the first successful publication, open the account's **Packages** page,
   select `sisyphus`, then **Package settings**. Under **Danger Zone**, change
   package visibility to **Public**. Public source does not imply a public GHCR
   package. The workflow does not change package visibility.
4. Confirm the package is linked to `mbastakis/sisyphus` and verify anonymous
   access to the published digest from a machine without GHCR credentials:

   ```sh
   docker pull --platform linux/amd64 ghcr.io/mbastakis/sisyphus@sha256:<digest>
   ```

Publication is not ready for Atlas until that anonymous pull works. A logged-in
developer's successful pull does not prove public visibility.

## First release and subsequent releases

The initial delivery commit adds only release/hook tooling and documentation on
top of `22107e45ef7c07b573cefbd7c9f5767be17619e8`. Preserve that commit's
application sources, configuration, dependency locks, Dockerfile, and entrypoint.
The first release is `v0.1.0` on the new delivery commit, so the image revision
correctly identifies the commit containing the workflow.

After reviewing and committing the delivery changes, check for unintended
application changes and run the full pre-push suite before authorizing release:

```sh
git diff 22107e45ef7c07b573cefbd7c9f5767be17619e8 HEAD -- backend frontend config tests Dockerfile entrypoint.sh
.githooks/pre-push </dev/null
git tag -a v0.1.0 -m 'Sisyphus v0.1.0'
git push origin HEAD
git push origin refs/tags/v0.1.0
```

The tag push also runs pre-push. Wait for publication, complete visibility setup,
and record the full source commit and top-level image digest from the job summary.
Kavouki's explicit release selection resolves the tag, checks the image platform
and revision label, then records both pins for review. Selection does not deploy.
Atlas later pulls the recorded digest anonymously.

Never move a published tag or rerun a successful publication to replace an image.
GHCR tags are mutable, and a rebuild can change a digest even with the same
source. GitHub rulesets protect Git refs; they do not make GHCR tags immutable.
If publication failed before an image existed, retry that failed run. If an image
was already published, use a new release version for a replacement.
