# Natural

Natural is an MIT-licensed, code-first 2D and 3D game engine for TypeScript. It combines Bun's
toolchain and authoritative server runtime with Three.js WebGPU/WebGL rendering, Rapier physics, a
deterministic ECS, and browser and Tauri editors.

The umbrella package is `@natural-engine/natural`; the installed executable is `natural`. Version
`0.1.0-alpha.0` is a production-tested vertical slice, not a claim of full Godot parity. The exact
implemented and planned surface is tracked in [the capability matrix](docs/godot-parity.md).

## Create a game

From a published release:

```bash
bunx @natural-engine/cli create my-game
cd my-game
bun install
bun run dev
```

From this repository:

```bash
bun install --frozen-lockfile
bun natural create my-game
cd my-game
bun run dev
```

The generated project contains a playable 3D scene, an authoritative Bun server, a unit test,
web/desktop exports, project metadata, and instructions for both human contributors and AI agents.

## Included systems

- Generation-safe ECS entities, deterministic fixed ticks, ordered systems, resources, signals,
  scene trees, stable UUIDs, migrations, saves, input maps, seeded randomness, and profiling.
- WebGPU-first Three.js renderer with WebGL 2 fallback, 2D sprites and tilemaps, 3D PBR meshes,
  lights, cameras, particles, terrain, and cached instancing up to one million visible objects.
- Rapier 2D and 3D rigid bodies, colliders, sensors, collision signals, ray casts, impulses, and
  kinematic synchronization.
- Animation clips, browser input, spatial Web Audio, DOM UI, localization, A* grid navigation, and
  hysteretic world streaming.
- Bun authoritative multiplayer with binary schemas, interest management, prediction and
  reconciliation, replay recording, authentication hooks, reconnectable sessions, packet limits,
  and a measured 256-client test.
- Browser editor plus a native Tauri desktop shell with project selection, scene hierarchy editing,
  components, undo/redo, atomic saves, and live browser preview.
- Content-addressed assets, runtime/editor plugin manifests, a noninteractive CLI, an MCP server,
  deterministic test helpers, clean-room package tests, and web/server/desktop exporters.

## Scale contract

Natural treats visible and actively simulated objects as different budgets:

- 1,000,000 visible static instances in one GPU-instanced scene on the dedicated WebGPU runner.
- 10,000 active ECS entities updated inside a 16.7 ms p95 CPU budget.
- 256 connected authoritative clients inside a 33.3 ms p95 server budget.

Hardware-specific GPU performance is tested only on the `natural-gpu` runner. Hosted CI still runs
the editor, both reference games, visual regression, package installation, and CPU/network gates.

## Repository commands

```bash
bun run check          # formatting, types, lint, unit/integration tests, coverage
bun run build          # libraries, declarations, editor, and reference games
bun run pack:check     # npm tarballs and clean-room consumer/generated-project smoke tests
bun run test:e2e       # editor and real browser game loops
bun run test:network   # 256-client authoritative-server benchmark
bun run bench          # 10,000-active-entity CPU benchmark
bun run release:verify # every release gate, including dependency audit
```

Run the reference games directly with:

```bash
bun run --filter @natural-engine/example-arena-2d dev
bun run --filter @natural-engine/example-sandbox-3d dev
```

See [architecture](docs/architecture.md), [testing](docs/testing.md),
[contributing](CONTRIBUTING.md), [release process](docs/releasing.md), and the
[Godot capability matrix](docs/godot-parity.md).
