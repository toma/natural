# Natural agent guide

Natural is a Bun-first TypeScript game engine. Keep public runtime APIs independent from Three.js,
Rapier, React, Tauri, and network transport types. Prefer machine-readable diagnostics and canonical
JSONC assets. Every behavior change needs tests; rendering changes need a deterministic visual fixture.

## Commands

- `bun install` installs the exact lockfile.
- `bun run typecheck` validates every workspace.
- `bun test` runs unit and integration tests.
- `bun run test:e2e` exercises the CLI, editor, and packaged examples.
- `bun run check` is the local merge gate.

## Repository rules

- Use stable IDs in serialized scenes and generation-checked IDs at runtime.
- Keep fixed-tick state free of wall-clock reads and unseeded randomness.
- Dispose GPU, physics, audio, and event resources explicitly.
- Never edit imported cache artifacts under `.natural/`.
- Prefix PR titles with `Hotfix` or `[ENG-XXX]`, where `XXX` is the Linear ticket number.
