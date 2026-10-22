# NaturalFPS

NaturalFPS ports an MIT-licensed upstream game by [mshumer](https://github.com/mshumer) at
revision `d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853`. It replaces Urban Raid while keeping
the existing package name and local port.

With Bun installed, run this from the repository root:

```sh
bun run demo
```

The command installs the locked dependencies and starts the development server.
Open http://127.0.0.1:43400. Press Ctrl+C in the terminal to stop the server.
Allow the procedural world and shaders to finish loading.
Click the canvas to capture the mouse. WASD moves, mouse aims, left click fires, right
click aims down sights, R reloads, Shift sprints, Ctrl crouches, Space jumps, Q/E leans,
and Escape releases the cursor. The upstream settings and HUD are retained.

Natural's Game and scheduler own the frame loop, plugin lifecycle, and 120 Hz physics
ticks. NaturalRenderer owns the WebGL2 device, world scene, rendering stage, and pipeline
disposal. The example registers the imported HDR pass chain with NaturalRenderer and
retains its procedural geometry, shaders, weapon view, physics, AI, UI, and audio.
The WebGL2 backend is required for these GLSL passes; the default Natural backend remains WebGPU.

The imported JavaScript remains JavaScript so shader and gameplay changes can be compared
with the pinned source. The Natural scheduler bridge is typed and covered by unit tests.
The scene is procedural by default: every texture, material, and prop is generated at
runtime, so a fresh checkout builds and runs with no downloaded image, model, or audio
assets. The demo can optionally load CC0 (public-domain) photoscanned PBR textures to
raise surface realism. That art is fetched, not committed, with `bun run assets`; a
missing set falls back to the procedural surface. Provenance and licensing are in
`assets/ASSETS.md`.

Use `?capture=1&lockstep=1` for seeded captures. `window.__APPLY_SHOT__(name)` selects an
upstream shot and `await window.__PUMP__(90)` advances exactly 90 frames.
Each reference shot must use a fresh page with the same browser, viewport, GPU, and quality.
Pixel equivalence is measured against upstream captures, independently of Natural's own
regression screenshots. It must not be inferred from a passing build.

To compare all eleven shots, serve the pinned upstream checkout and this example, then run:

```sh
NATURAL_FPS_UPSTREAM_URL=http://127.0.0.1:5173 bun run --filter @toma.com/example-urban-raid test:parity
```

The comparison fails on any changed pixel or browser error and saves both captures and a JSON
report under `test-results/natural-fps-parity` in the example directory. `NATURAL_FPS_TEST_URL` overrides
the Natural URL. `NATURAL_FPS_PARITY_OUTPUT` overrides the output directory.

The initial verification matched all eleven upstream shots with zero changed pixels at
1280x720, DPR 1, ultra quality, 90 settled frames, on macOS with Chromium and Metal.
That report describes the initial import. The requested support-wrist correction now intentionally
differs from upstream: the left glove cuff follows the forearm and fits the sleeve while the palm
retains its grip. Idle, aiming, and reload poses have separate regression screenshots. The strict
upstream comparison still reports these differences; it does not exempt the corrected arm.
The support arm also replaces the narrow sleeve tube with an asymmetric forearm, tapered wrist,
procedural skin, and rolled sleeve. Its forward shoulder and outboard elbow shorten the visible
reach while preserving the weapon's grip targets.

The original MIT copyright and license are in [LICENSE.upstream](LICENSE.upstream).
Upstream's package metadata says ISC, but its repository license is MIT. This port retains
the repository license text. Imported punctuation is normalized to the repository copy rules.
The pause transition clears stale pointer-lock state so Resume can acquire the cursor asynchronously.
Only canvas mouse-down events capture the pointer, so menu clicks reach their buttons.

## Performance verification

The optimized pipeline preserves Ultra settings, the 1.5 maximum render pixel ratio,
the 2048 shadow-map cap, and the 120 Hz simulation with an eight-step backlog cap.
Depth passes combine complete visible material groups. Immutable opaque world props use
separate instance lists for the camera and each shadow cascade. Camera visibility
is reused by the prepass and forward pass. World transforms and skeleton palettes
are prepared once for those submissions, with normal update behavior restored afterward.
Camera prop batches own geometry copies so Three can reuse their vertex bindings.
Opaque prop buckets without distance LOD share a draw when their instance-color layouts match.
Distance LOD and transparent props retain their existing buckets.

Run the example-local benchmark from `examples/urban-raid`:

```sh
bun run bench --output=test-results/fps-bench.json
```

It builds production assets and starts an ephemeral local server. The default uses
installed Chrome, Ultra quality, seed `0x5eed1234`, 120 warmup frames and 240 measured
frames per route. It runs outdoor travel, interior travel, combat, and aiming at
1280x720 DPR 1, 1512x982 DPR 2, and 1728x1117 DPR 2, three times each. Each route uses
a fresh page and frame-indexed camera travel. Gameplay controls have separate browser tests.
Runs are sequential. Close other GPU workloads when measuring the target hardware.
The harness disables capture-only exposure readbacks during measurements in both builds.

Before editing, save a production baseline outside the repository:

```sh
bun run build
cp -R dist /tmp/natural-fps-baseline
bun run bench --baseline=/tmp/natural-fps-baseline --output=test-results/fps-paired.json
bun run test:render --baseline=/tmp/natural-fps-baseline
```

Verification commands build into private temporary directories and remove them afterward,
so a concurrent rebuild of `dist` cannot replace assets during a measurement or capture.
The paired benchmark alternates baseline and optimized order between repetitions.
JSON includes p50/p95/p99 frame intervals, CPU render submission and complete step time,
draw calls, triangles, shader compile submissions, program diagnostic queries, prewarm
statistics, and WebGL resource counts. Shader submission time does not measure asynchronous
driver compilation. Diagnostic counters observe the renderer's existing `getProgramInfoLog`
calls, which can expose deferred first-use stalls; the harness adds no readiness queries.
Use `--sizes=1512x982x2 --headed` for a visible browser at the machine's normal window size.
Use `--channel=chromium` for the Playwright browser used by visual fixtures.

GPU timing is a separate invocation:

```sh
bun run bench --gpu --runs=1 --frames=60 --sizes=1512x982x2 --output=test-results/fps-gpu.json
```

This uses `EXT_disjoint_timer_query_webgl2`, discards disjoint results, and excludes
frame pacing. ANGLE's Metal implementation flushes command buffers around timer queries,
so query-instrumented pacing cannot establish the 60 FPS target. See the
[ANGLE timer implementation](https://github.com/google/angle/blob/main/src/libANGLE/renderer/metal/QueryMtl.mm).

`test:render` compares all eleven scene shots and idle, aiming, and reload arm fixtures
on fresh pages, saving PNGs and a JSON report. Its investigation thresholds are 1/255
per channel and 0.01% of pixels. The saved baseline should include the current arm correction.
The historical upstream comparison above has a different baseline.
Use `--size=1512x982x2` or `--size=1728x1117x2` to compare the Retina viewports;
the format is CSS width, CSS height, and device pixel ratio, separated by `x`.

Combining prop buckets changes their depth-sorting centers. Reviewed captures showed only
small color shifts, up to 3/255 per channel and fewer than 0.04% changed pixels. Reproduce that
review with explicit acceptance limits; the report still flags the original investigation limits:

```sh
bun run test:render --baseline=/tmp/natural-fps-baseline --max-channel-delta=3 --max-changed-ratio=0.0005
```

Unit tests cover material groups, visibility boundaries, instance colors, offscreen
shadow casters, palette reuse, disposal, and exception recovery. Browser tests cover
depth validity, optimized draw counts, resource release, resizing, controls, and visual
fixtures. Frame-time thresholds are diagnostic and are excluded from shared CI.

Run `bun run test:transitions` to compare the first frame after eight camera cuts in
outdoor, interior, sunset, and combat scenes at 1280x720 DPR 1 and 1512x982 DPR 2.
Fresh pages compare the production build with the same build bypassing instance
substitution, depth-group collapse, and transform reuse. Bucket batching and shader
optimizations stay enabled in both variants, so this check supplements the saved-baseline
comparison. It requires differences within 1/255 per channel and 0.01% of pixels.
The command also repeats scene and viewport changes, checks that warmed resource and
shader counts settle, and verifies disposal of every added instance-pass mesh.
Use `--lifecycle-only` to run just that loop. PNGs and JSON go to
`test-results/fps-transitions`, or the directory selected by `--output`.

[Recorded verification](performance-verification.json) contains paired measurements and
visual results from the available M4 Pro. Other host workloads were active, and the
M4 Max target still requires a measurement on that hardware at its normal browser size.
The final combat capture reduced draw calls from 1,740 to 986 and submitted triangles
from 11.4 million to 9.7 million. Across three paired runs per route and size, median
CPU submission time fell by 73 to 92 percent. Retina p95 frame times remained between
50 and 66.7 ms in these headless measurements, so they do not establish the 60 FPS target.

A 1,200-frame follow-up exposed a world shader variant that first entered view after
ten simulated seconds. World materials now compile after the first frame settles light
visibility. Newly compiled programs also complete their deferred link diagnostics and
uniform/attribute reflection before that frame is presented.

Light loops now skip direct-light work for slots whose radiance is exactly zero. All
nonzero lights retain their calculations. At 1280x720, the fourteen scene and arm comparisons changed
at most 0.098 percent of pixels per image, mostly by 1/255. One detail pixel changed by
15/255; full-size and enlarged comparisons showed no perceptible change. The report keeps
the strict investigation flags and the reviewed limits separately.
The same set at both Retina sizes stayed within 5/255 and 0.286 percent changed pixels,
predominantly shifts of 1/255. Enlarged and amplified comparisons showed no perceptible change.

The latest sustained combat diagnostic recorded zero shader compile calls and zero
deferred program checks. Its worst CPU submission was 7.3 ms, compared with 114.8 ms in
the preceding diagnostic, and Retina p95 pacing was 33.4 ms. These are individual runs
on the uncontrolled M4 Pro host; the full metrics and paired trials are in the report.

The latest 72-trial matrix compares the retained lighting and startup changes against
the preceding optimized build. Each cell below is the range of median p95 values across
outdoor, interior, combat, and aiming routes, with three paired runs per route.

| CSS viewport and DPR | Previous p95    | Current p95     |
| -------------------- | --------------- | --------------- |
| 1280x720, DPR 1      | 16.7 to 33.3 ms | 16.7 to 16.8 ms |
| 1512x982, DPR 2      | 50.0 to 50.1 ms | 33.4 ms         |
| 1728x1117, DPR 2     | 66.7 to 83.4 ms | 50.1 to 83.3 ms |

Another browser was actively rendering during the largest-window trials. The interior
route at that size showed essentially unchanged pacing. These measurements preserve the
host-load caveat and do not establish the M4 Max target.
The measurements and isolated comparisons use matching arm sources from before the later
rifle-grip correction. The latest shared tree, including that correction, passed its browser
suite separately; the report records both build versions.
