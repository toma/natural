# Releasing Natural

Releases are immutable builds from version tags. The root `package.json` version is ground truth.
Every workspace package, the Tauri application, the generated-project template, and the lockfiles
carry the same version. `bun run verify:versions` checks that, and `bun run check` runs it first.

## Release flow

1. Run `bun run version:bump <patch|minor|major|prerelease|X.Y.Z>`. It rewrites every version site
   and adds a `CHANGELOG.md` heading for the new version. Fill in the entries under that heading.
   Run `bun run docs:generate` to update the package table. [AGENTS.md](../AGENTS.md) says which bump
   a change earns.
2. Run `bun run release:verify` on a clean checkout. This includes the merge gate, dependency audit,
   package archives, browser tests, networking load, and CPU performance budget.
3. Land the change on `main`.
4. `.github/workflows/tag.yml` runs on every push to `main`. When `v<version>` is a new tag, it
   creates the tag and dispatches the release workflow for it. When the tag already exists, it does
   nothing.
5. The release workflow validates the engine, generates an SPDX SBOM, attests package provenance,
   publishes every public package under `packages/*` in dependency order, and builds macOS, Linux,
   and Windows editor apps.
6. Verify the draft GitHub release and promote it after platform smoke testing.

The publish set, dependency order, and expected archive names come from package manifests through
`scripts/package-metadata.ts`. `bun run pack:check` builds and smoke-tests each archive before the
publish job uses the same list. Each public package manifest identifies its monorepo directory and
the public source repository required for provenance.

## Credentials and npm tags

The repository Actions secret `NPM_TOKEN` must contain a granular npm token authorized to publish
every package in the `@toma.com` scope, with two-factor authentication bypass enabled for CI.
The workflow exposes it only as `NODE_AUTH_TOKEN` in the publish step. GitHub's OpenID Connect token
provides npm provenance, so the workflow keeps `id-token: write`. Repository `GITHUB_TOKEN`
permissions create the version tag, dispatch the release, attach build provenance, and create the
draft GitHub release.

Stable releases use the npm `latest` tag. Versions containing a prerelease suffix use `next`.

## Reruns and recovery

Pushing a `vX.Y.Z` tag by hand starts the release workflow directly. A failed release run leaves its
tag in place. The npm step queries every package version and skips versions already present, so a
transient failure can be rerun against the same tag without republishing completed packages. Rerun
the failed workflow from GitHub Actions or dispatch `release.yml` against the existing tag.

If recovery requires a code or metadata change, bump the version and fix forward. Never move or
delete a release tag. A push to `main` with an unchanged version sees the existing tag and does
nothing. A failure in one desktop build does not cancel builds for the other platforms.

## Desktop signing

Public macOS distribution requires repository secrets `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` for Developer ID
signing and notarization. Without them, Tauri applies a verified ad-hoc signature suitable for local
and prerelease testing, but users must explicitly approve the app in macOS Privacy & Security.

Windows installers build without a certificate, but public stable distribution should import a
platform code-signing certificate or configure an Azure signing command before promoting the draft
release. Signing credentials are external release infrastructure and are never stored in this
repository.
