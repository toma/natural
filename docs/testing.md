# Testing and release gates

`bun run check` is the merge gate. It validates version sites and copy rules, checks generated
documentation and formatting, type-checks and lints the monorepo, then runs unit and integration
tests with aggregate line and function coverage of at least 85 percent.

## Build status matrix

| Workflow              | Trigger                                              | Coverage                                                                                                                         | Local equivalent                                                                                |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| CI                    | Pull requests and pushes to `main`                   | Merge gate and build on Linux, macOS, and Windows, package smoke tests, dependency audit, browser tests, and desktop smoke build | `bun run check`, `bun run build`, `bun run pack:check`, `bun run audit`, and `bun run test:e2e` |
| CodeQL                | Pull requests, pushes to `main`, and weekly schedule | JavaScript and TypeScript security analysis                                                                                      | No exact local equivalent, use `bun run lint` and `bun run audit` for local checks              |
| Dedicated performance | Weekly schedule and manual dispatch                  | Network load, browser and GPU fixtures, and the CPU entity budget on the `natural-gpu` runner                                    | `bun run test:network`, `bun run test:e2e`, and `bun run bench`                                 |
| tag                   | Pushes to `main`                                     | Version-site verification, duplicate-tag detection, tag creation, and release dispatch                                           | `bun run verify:versions`                                                                       |
| Release               | Version tags and manual dispatch on a tag            | Full release gate, package archives and provenance, npm publication, SBOM, and desktop installers                                | `bun run release:verify`                                                                        |

The badges in the root README link to CI, CodeQL, Dedicated performance, and Release. Their labels are
generated from the workflow names, so `bun run docs:check` detects a stale badge block.

## Local gates

`bun run build` bundles every library, the CLI, MCP server, editor, and reference game, then emits
declarations and package documentation. `bun run pack:check` creates every public npm archive,
verifies package names, versions, and rewritten workspace dependencies, installs all archives in a
clean project, and exercises Bun, Node ESM, the packaged CLI, and a newly generated game.

`bun run test:e2e` launches real browser servers and exercises the editor, 2D arena, 3D instancing
sandbox, and FPS deterministic rendering and first-person controls. The FPS browser checks cover
subsystem startup, a visual fixture, movement, aiming, firing, reloading, crouching, pause and resume,
resize, and disposal. Its runtime tests cover deterministic frame phases, the fixed-step backlog cap,
initialization cleanup, and option validation.

`bun run release:verify` combines the release checks: version verification, the merge gate,
dependency audit, package smoke tests, browser tests, networking load, and the CPU benchmark. Some
network and browser gates bind localhost sockets and may need localhost permission in a restricted
sandbox.

## Performance gates

`bun run test:network` connects 256 WebSocket clients to an authoritative server and fails when p95
server work exceeds the 30 Hz budget. `bun run bench` mutates 10,000 active entities for 60 frames
and enforces a 16.7 ms p95 CPU budget.

The one-million-visible-instance WebGPU test runs only on the dedicated `natural-gpu` runner with
`NATURAL_GPU_BENCH=1`. Software-rendered hosted runners are not performance references.
