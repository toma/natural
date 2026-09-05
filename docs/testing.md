# Testing and release gates

`bun run check` is the fast merge gate. `bun run build` bundles every library, CLI, MCP server, editor,
and reference game. `bun run test:e2e` launches real browser servers and exercises the editor and both
game loops. `bun run test:network` connects 256 WebSocket clients to an authoritative server and fails
when p95 server work exceeds the 30 Hz budget. `bun run bench` mutates 10,000 active entities for 60
frames and enforces a 16.7 ms p95 CPU budget.

Unit and integration runs enforce at least 85% aggregate line and function coverage. Browser rendering
uses a checked-in visual baseline in addition to behavioral assertions. `bun run pack:check` creates
every npm tarball, verifies rewritten workspace dependencies, installs the tarballs in a clean project,
and exercises Bun, Node ESM, the packaged CLI, and a newly generated game.

The one-million-visible-instance WebGPU test runs only on the dedicated `natural-gpu` CI runner by setting
`NATURAL_GPU_BENCH=1`; software-rendered hosted runners are not valid performance references.
