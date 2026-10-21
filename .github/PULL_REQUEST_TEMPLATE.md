<!--
Title must begin with `Hotfix` or a Linear ticket such as `[ENG-123]`.
Keep each pull request scoped to one change.
-->

## Summary

Describe what this change does and why.

## Validation

Check the validation that covers this change (see CONTRIBUTING.md):

- [ ] `bun run check` (all code and generated documentation)
- [ ] `bun run pack:check` (package contents or dependencies)
- [ ] `bun run test:e2e` (browser, editor, or example behavior)
- [ ] `bun run test:network` (networking behavior)
- [ ] `bun run bench` (performance budgets)
- [ ] `bun run release:verify` (release infrastructure)

## Checklist

- [ ] Behavior changes include automated tests; rendering changes include a deterministic visual fixture.
- [ ] User-facing API changes include documentation and a changelog entry.
- [ ] Version bumped with `bun run version:bump` when the change earns a bump (see AGENTS.md).
- [ ] No secrets, credentials, or third-party assets added.

Note any validation that could not be run locally.
