# Changelog

Natural follows Semantic Versioning. This file records user-visible engine, editor, tooling, and
compatibility changes.

## 0.1.0-alpha.4 - 2026-10-21

- Rebrand the NaturalFPS demo map to the original Atomic Cul-de-sac: a 1950s desert test-site
  suburb with original, engine-generated signage in place of the previous copied in-game text.
  Rename the world sources, builder, material keys, map test, and the design document.
- Fix the repository merge gate so it passes: correct `check-copy` matching its own
  forbidden-character definitions, format and lint the FPS example, and clear high-severity
  dependency advisories by bumping `brace-expansion`.
- Add `homepage` and `bugs` metadata to every published package manifest, and add GitHub issue
  and pull request templates for the public repository.
- Regenerate the FPS screenshot baselines and allow a longer fixture timeout so the lockstep
  captures complete on software-GL hosts.

- Correct the FPS rifle's inverted left wrist with a palm-up support grip aligned to the
  forearm, preserving fingertip contact and the reload hand targets derived from that grip.

## 0.1.0-alpha.2 - 2026-09-05

- Reduce FPS depth submissions, cull immutable prop instances separately for camera and shadow
  passes, and reuse world transforms and skeleton palettes across geometry passes.
- Give visible prop batches dedicated vertex bindings to reduce repeated WebGL attribute setup.
- Combine opaque prop buckets that have no distance LOD, preserving instance order and color layouts.
- Remove coverage-only normal texture reads and the weapon target's unused depth resolve while
  retaining Ultra effects, render resolution, color MSAA, and gameplay timing.
- Add production FPS benchmarks with paired routes, separate GPU timing, resource statistics,
  and deterministic scene and arm comparisons.
- Isolate verification builds from concurrent rebuilds and support Retina-sized image comparisons.
- Verify camera cuts and repeated viewport changes, and prewarm hidden world materials after
  the first frame establishes the active light count. Complete program diagnostics and reflection
  during that warmup to avoid deferring them until a prop first enters view.
- Skip direct-light calculations for zero-radiance light slots, preserving every nonzero light.
- Name the game NaturalFPS throughout its UI, runtime, documentation, and verification tools.
- Publish every package under the `@toma.com` npm scope. Source imports, the CLI project template,
  example filters, and the release documentation use the new names.

## 0.1.0-alpha.1 - 2026-09-05

### Added

- Pointer-lock mouse input, entity-aware 3D ray hits, a Rapier character controller, cached PBR
  texture maps, and reusable FPS health, weapon, hitscan, and recoil utilities.
- NaturalFPS example, ported from a pinned upstream revision with procedural content,
  Natural scheduling, a WebGL2 renderer backend, and an owned HDR rendering pipeline.
- Centralized version bumping and verification, copy-rule checks, and automatic release tag
  dispatch from `main`.

### Fixed

- FPS support-hand cuff alignment and fit during idle, aiming, and reloading.
- FPS left arm now has a shaped forearm, tapered wrist, skin detail, rolled sleeve, and bent elbow.
- FPS menu clicks no longer capture the pointer before Resume receives its click.

## 0.1.0-alpha.0 - 2026-09-04

### Added

- Deterministic ECS runtime, scene compiler, resources, input, saves, migrations, signals, plugins,
  and fixed-stage scheduling.
- WebGPU-first Three.js renderer with WebGL fallback, 2D sprites and tilemaps, PBR primitives,
  lighting, particles, terrain, cameras, and million-instance rendering support.
- Rapier 2D/3D physics, animation, audio, localization, navigation, retained UI, and world streaming.
- Bun authoritative multiplayer for 256 clients with binary schemas, interest management,
  prediction, reconciliation, session resumption, lag history, and replays.
- Browser and Tauri editor shells, JSON-first CLI and MCP automation, desktop/web/server exports,
  and playable 2D and 3D reference games.
- Unit, integration, browser E2E, clean-room package, desktop bundle, network load, and dedicated GPU
  performance gates.
- Strict packet and replay validation, reconnect and resource cleanup, safe project-scoped editor
  writes, persistent browser saves, nonblocking audio startup, and hardened generated-project defaults.
