# Releasing Natural

Releases are immutable builds from signed version tags. The tag version must match every publishable
workspace package and the Tauri application version.

1. Update `CHANGELOG.md` and all package versions together.
2. Run `bun run release:verify` on a clean checkout.
3. Create a `vX.Y.Z` tag and push it.
4. The release workflow validates the engine, generates an SPDX SBOM, attests package provenance,
   publishes scoped packages in dependency order, and builds macOS, Linux, and Windows editor apps.
5. Verify the draft GitHub release and promote it after platform smoke testing.

Stable releases use the npm `latest` tag. Versions containing a prerelease suffix use `next`.

Public macOS distribution requires repository secrets `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` for Developer ID
signing and notarization. Without them, Tauri applies a verified ad-hoc signature suitable for local
and prerelease testing, but users must explicitly approve the app in macOS Privacy & Security.

Windows installers build without a certificate, but public stable distribution should import a
platform code-signing certificate or configure an Azure signing command before promoting the draft
release. Signing credentials are external release infrastructure and are never stored in this
repository.
