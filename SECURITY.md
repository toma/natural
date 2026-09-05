# Security policy

Report vulnerabilities with GitHub private vulnerability reporting on the repository hosting the
release. Include affected versions, impact, reproduction steps, and a minimal proof of concept when
possible. Do not open a public issue before a fix is available.

Maintainers acknowledge reports within three business days. Security fixes are made on the latest
supported minor line; pre-release versions may require upgrading to the newest pre-release.

The release gate audits high-severity dependencies, runs CodeQL, validates untrusted scene/project
input, constrains editor and MCP filesystem access to the selected project, and publishes provenance
attestations and an SPDX SBOM.
