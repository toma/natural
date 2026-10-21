# Contributing

Install Bun 1.3.13, clone the repository, and run `bun install --frozen-lockfile`. Natural accepts
changes to engine code, tests, documentation, examples, performance fixtures, and security fixes.

Choose the validation that covers the change:

| Change                               | Required validation      |
| ------------------------------------ | ------------------------ |
| All code and generated documentation | `bun run check`          |
| Package contents or dependencies     | `bun run pack:check`     |
| Browser, editor, or example behavior | `bun run test:e2e`       |
| Networking behavior                  | `bun run test:network`   |
| Performance budgets                  | `bun run bench`          |
| Release infrastructure               | `bun run release:verify` |

Behavior changes need automated tests. Rendering changes need a deterministic visual fixture.
User-facing API changes need documentation and a changelog entry. Keep each pull request scoped to
one change and explain any validation that could not be run locally.

Documentation changes should run `bun run docs:generate` when package metadata or workflow names
change. `bun run docs:check` verifies the generated README sections. Package README and license files
are build outputs copied from the repository root by `bun run build`.

Bump the version in the same change as the work it describes with `bun run version:bump`.
[AGENTS.md](AGENTS.md) defines when a change earns a prerelease, patch, minor, or major bump. Docs-only,
CI-only, and tooling-only changes do not receive a bump.

Pull request titles must begin with `Hotfix` or a Linear ticket such as `[ENG-123]`. Run the full
required validation before requesting review.

Natural follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Report vulnerabilities through the
private process in [SECURITY.md](SECURITY.md). Do not open a public issue for an unpatched
vulnerability.
