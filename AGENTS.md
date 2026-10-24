# Natural agent guide

Rules for coding agents working in this repo. Read this file before touching anything. These are
the rules earlier sessions were held to, including the ones they had to be told twice.

## 0. Record what you learn

Every time something new is learned while developing Natural, write it into this file in the same
change. That covers a gotcha, a tool quirk, a decision the owner made, an approach that failed, and
any new rule the owner gives. If it is not in AGENTS.md, the next agent will hit it again.

## 1. What this is

Natural is a desktop-quality 2D and 3D game engine in the class of Unity and Unreal Engine, and it
runs in the browser. It is a Bun-first TypeScript monorepo. Keep public runtime APIs independent from
Three.js, Rapier, React, Tauri, and network transport types. Prefer machine-readable diagnostics and
canonical JSONC assets. Every behavior change needs tests; rendering changes need a deterministic
visual fixture.

## 2. Commands

- `bun install` installs the exact lockfile.
- `bun run demo` installs the locked dependencies and starts NaturalFPS from the repository root
  at http://127.0.0.1:43400. It uses the existing hot-reload server and needs no separate build.
- `bun run check` is the local merge gate: version sites, copy rules, formatting, types, lint, tests.
- `bun run typecheck` validates every workspace.
- `bun test` runs unit and integration tests.
- `bun run test:e2e` exercises the CLI, editor, and packaged examples.
- `bun run version:bump <patch|minor|major|prerelease|X.Y.Z>` rewrites every version site.
- `bun run verify:versions` checks that every version site agrees with the root `package.json`.
- `bun run check:copy` checks the copy rules in section 4 against every tracked file.
- Netcode tests and browser E2E bind localhost sockets. A restricted sandbox can report
  `EADDRINUSE` even for port `0`; rerun network-bearing gates with localhost permissions.
- `bun run pack:check` creates and installs packages in a clean room. A restricted sandbox can deny
  Bun access to its temporary directory; rerun the package gate with temporary-directory permissions.
- Playwright leaves a passing screenshot unchanged when its pixels remain inside the configured
  tolerance. Use `--update-snapshots=all` when an intentional visual change must replace the baseline.
- FPS screenshot acquisition exceeded Playwright's default five-second expectation timeout in
  different scenes during concurrent GPU work, while direct comparisons passed. Allow 30 seconds
  for acquisition in FPS fixtures and retain their pixel tolerances.
- The local 3D sandbox browser test has exceeded its 30-second timeout during concurrent GPU work.
  Diagnose it in isolation and rerun the full suite before changing rendering or test assertions.
- A full FPS browser run timed out waiting for crouch after reloading; an unchanged isolated
  rerun passed. Report that transient input failure separately from visual fixture results.
- Do not edit watched example sources during browser captures. Bun hot reload can navigate the
  page mid-capture, invalidating both the deterministic frame count and the screenshot.
- Keep verification builds in private directories. A concurrent rifle-grip edit landed after
  a completed 72-trial benchmark; the next shared `dist` rebuild picked it up and invalidated
  comparisons with the previous arm fixtures. The harness now builds into owned temporary
  directories and releases them after each command. Custom build outputs must be empty;
  never recursively clear an arbitrary `--outdir`. Saved source maps can recover the precise
  source version needed for an isolated comparison without reverting shared edits.
  Keep benchmark and reconstructed-build fingerprints separate. Both the isolated optimization
  suite and a later immutable copy of the shared tree with the revised grip passed 18 browser
  tests, with the dedicated GPU benchmark skipped. A same-build 1728x1117 capture also matched
  exactly, separating deterministic numerical shader differences from capture drift.
- When `NATURAL_FPS_TEST_URL` selects a saved production server, skip Playwright's FPS development
  server. A stale watched server can return HTTP 500 and make Playwright attempt a conflicting
  bind even though the tests use a separate healthy production server.
- FPS performance verification must use saved production builds and sequential browser runs.
  This workspace is on an M4 Pro. Results here cannot confirm an M4 Max frame-time target.
- CPU submission time and frame pacing can diverge in FPS measurements. The final paired M4 Pro
  trials reduced median CPU submission time by 73 to 92 percent, while Retina p95 pacing remained
  50 to 66.7 ms with other GPU workloads active. Keep the hardware and workload limitations beside
  the results in `examples/urban-raid/performance-verification.json`.
- Clear the FPS generated `dist` directory before each production build. Bun otherwise leaves
  old hashed bundles behind, retaining stale branding and polluting build fingerprints.
- Root ESLint scans executable files in the FPS example's nested `test-results` directory
  despite its Git ignore. Store copied reproduction drivers as text artifacts or outside
  the workspace, so diagnostic copies do not enter the project-service lint scope.
- Run the FPS example's `bench --baseline=<saved-dist>` for three paired production measurements
  across the default window sizes and routes. Use `test:render --baseline=<saved-dist>` for all
  eleven scenes plus the three arm fixtures. Both commands create their own local servers.
  Use a separate `bench --gpu` invocation for timer queries; ANGLE Metal flushes around them,
  so query-instrumented frame pacing is excluded. Keep timing thresholds out of shared CI.
- FPS `test:transitions` captures the first frame after camera cuts against the same build
  with instance substitution, depth collapse, and transform reuse bypassed. It supplements
  saved-baseline comparisons because bucket batching and shader changes remain in both variants.
  Its lifecycle loop repeats viewport and lighting changes and checks warmed resource counts.
- Long lockstep FPS captures can retain one fixed tick in the accumulator at a frame boundary
  because of floating-point arithmetic. At frame 154 both reference and optimized runs had
  307 ticks. Compare their exact frame/tick sequences and permit a one-tick cumulative remainder;
  do not require `tick === frame * 2` throughout a long capture or change the simulation for it.
- Browser WebGL resource counters measure explicit create/delete calls. Shader objects can be
  released implicitly with their attached programs, and context destruction also releases
  resources. Remaining counter values after disposal do not directly measure leaked GPU memory.
- A 1,200-frame combat run exposed a missed instanced mattress shader at frame 622, after
  short benchmarks ended. The boot hook compiled it with 3 directional and 21 point lights;
  gameplay uses 2 and 20. Warm all world layouts against the HDR target after the first
  frame settles light visibility, before presenting it. Keep that compile
  independent of simulation and preserve the previous target, cube face, and mip level.
  The regression must use the 1512x982 aspect ratio: the wider 1280x720 fixture sees
  the mattress in its initial view and passes even without the warmup fix.
- The sustained combat follow-up removed the two measured shader compile calls, but
  Retina p95 pacing remained 50 ms and the worst frame was 116.6 ms on the uncontrolled
  M4 Pro host. Verify compilation coverage separately from throughput and outlier frame times.
- Three.js r180 defers link diagnostics and uniform/attribute reflection until a program's
  first use, even after `renderer.compile`. The remaining frame-622 pause was the mattress
  program's first draw; `getProgramInfoLog` alone blocked for 19.4 ms in a short reproduction.
  Call `getUniforms()` on newly compiled world programs during startup to complete both caches.
  Keep this dependency on the pinned renderer inside the FPS example, and count program
  diagnostics separately from shader compile submissions in its benchmark.
- The FPS world pads its visible point lights with zero-intensity slots to keep shader
  permutations stable. Guard the complete point, spot, and directional direct-light bodies
  with an exact uniform-color zero test. Keep all nonzero lights, including arbitrarily
  faint ones. Three paired Retina prototype trials reduced median p95 from 50 to 33.4 ms
  outdoors and from 50.1 to 33.4 ms in combat, with one combat trial still at 50 ms.
  This changes shader arithmetic scheduling: investigate numerical image differences even
  though skipped lights contribute zero. Review the full scene fixtures before retaining it.
- Reject all benchmark rows with browser errors, even when frame times improve. A temporary
  point-light experiment returned `undefined` shader text after an inserted `return` met a
  newline and triggered automatic semicolon insertion. Missing material draws made it appear
  faster; the harness caught the shader errors and that run was discarded.
- A second point-light branch after attenuation, using `directLight.visible`, did not improve
  frame pacing over the uniform zero-radiance guard. Three valid paired night and interior
  trials at 1512x982 DPR 2 kept p50 at 33.3 ms and p95 at 33.4 ms in both variants.
  Leave that extra branch out. Review of the retained guard's fourteen images found at most
  0.098 percent changed pixels per image, predominantly 1/255 differences. One detail pixel
  changed by 15/255; full-size and enlarged comparisons showed no perceptible change.
  Preserve the comparison tool's strict investigation flags and record the reviewed limits.
- After program reflection warmup and zero-radiance light guards, the sustained 1,200-frame
  Retina combat diagnostic recorded no compile or program-info-log calls. Worst CPU submission
  was 7.3 ms, versus 114.8 ms before reflection warmup; p95 pacing was 33.4 ms. These are
  individual M4 Pro diagnostics, so keep their outlier comparison separate from paired trials.
- Shader changes also need saved-baseline comparisons at Retina resolutions. Transition tests
  retain the same shaders in both variants, so their Retina captures cannot establish shader
  parity by themselves. `test:render --size=1512x982x2` and `--size=1728x1117x2` compare the
  full scene and arm set at those CSS sizes and device pixel ratios.
- The retained zero-radiance guard's isolated Retina comparisons covered all fourteen scenes
  and arm poses at both sizes. Maximum differences were 5/255 and 0.080 percent of pixels at
  1512x982 DPR 2, and 4/255 and 0.286 percent at 1728x1117 DPR 2. The larger changed-pixel
  counts were predominantly 1/255 shifts; full-size and amplified comparisons showed no
  perceptible change. Keep these reviewed results separate from the strict investigation gate.
- The 72-trial lighting follow-up recorded no measured compile or program-info-log calls.
  All four routes at 1512x982 DPR 2 improved median p95 from about 50 to 33.4 ms. Results
  at 1728x1117 ranged from 50.1 to 83.3 ms after the change, and its interior route showed
  essentially unchanged pacing. Another browser renderer and GPU process were active then.
  Preserve every route and this workload observation; do not infer isolated performance.
- Whole-frame Metal timer-query trials can report durations far above normal frame intervals
  under competing GPU work. The lighting follow-up recorded query medians of 131 to 262 ms
  while normal pacing was much shorter. Keep those raw values labeled as query-instrumented
  results; they do not measure the game's unperturbed frame cost or verify its FPS target.
  That first query batch also picked up the concurrent rifle edit, so it was excluded from
  optimization comparisons and repeated against immutable builds with matching arm sources.

## 3. Repository rules

- Use stable IDs in serialized scenes and generation-checked IDs at runtime.
- Keep fixed-tick state free of wall-clock reads and unseeded randomness.
- Dispose GPU, physics, audio, and event resources explicitly.
- Never edit imported cache artifacts under `.natural/`.
- `packages/*/README.md` and `packages/*/LICENSE` are build outputs that `scripts/build.ts` copies
  from the root files. Edit the root files.
- `scripts/package-metadata.ts` discovers the public package set, publish order, and archive names.
  Release and package-smoke changes must use it instead of maintaining another package list.
- npm provenance requires each public package manifest to name the public Git repository and its
  monorepo directory. `scripts/package-metadata.ts` validates both before packaging or publishing.
- The badge, published-package, and contribution sections in `README.md` are generated. Run
  `bun run docs:generate` after workflow or package metadata changes.
- A version bump also changes the generated README package table. Run `bun run docs:generate`
  after bumping before the merge gate.
- ESLint runs `strictTypeChecked` plus `no-regex-spaces`: write `{2}` in a regex instead of two
  literal spaces.
- The Rapier compatibility packages currently print an upstream initialization deprecation warning,
  while their public `init` functions accept no arguments. Treat it as dependency output unless the
  package version changes.
- The FPS example replaces Urban Raid with NaturalFPS at upstream revision
  `d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853`. Keep its MIT notice. The owner chose Natural
  renderer integration and visual parity with the original. Keep the package name and port 43400
  so existing launch commands work. The previous demo was backed up outside the repo before replacement.
- The owner named the game NaturalFPS and requested removal of assistant branding from repository
  source, documentation, test names, and filenames. Use `natural-fps` for runtime IDs and fixtures,
  and `NATURAL_FPS_` for verification environment variables. Retain the upstream MIT notice.
- The imported FPS shaders require the classic WebGL2 backend. WebGPURenderer's WebGL fallback
  does not implement that shader pipeline. Natural owns the graphics device and calls the example's
  render pipeline after gameplay; the pipeline releases its targets, not the shared device.
- Natural's scheduler is asynchronous. Capture drivers must await each Game.step before presenting
  a frame. The port preserves upstream's 120 Hz simulation, eight-step backlog cap, seeded RNG,
  and separate world/viewmodel cameras.
- Preserve the FPS menu's unscaled clock while its simulation scale is zero. The bridge samples
  the current scale before a live frame and uses SystemContext.unscaledDelta for UI timing.
- On this macOS setup Chromium's headless shell rejects pointer lock with WrongDocumentError.
  Full Chromium in headless mode accepts it. Use Playwright's `channel: "chromium"` for real mouse
  capture tests; do not mock document.pointerLockElement. Use Metal for the local GPU captures.
- Imported FPS JavaScript has a scoped non-type-checked ESLint configuration; new TypeScript keeps
  strict checks. An upstream duplicate Spring3.z getter was already overridden by the later getter
  at runtime, so removing the earlier getter preserves behavior.
- Imported world JavaScript has no TypeScript declarations. Keep new bucket selection logic in
  a typed helper with unit coverage; browser draw-count fixtures verify its assembler integration.
- Clear the FPS HUD's previous pointer-lock flag even when the pause menu is already open.
  Retaining it makes Resume reopen the menu before the asynchronous lock request settles.
- Only canvas mouse-down events may capture the FPS pointer or fire. Capturing on a menu button's
  mouse-down retargets mouse-up and click to the canvas, swallowing Resume. Cover a delayed click.
- The owner requested a visual correction to the imported left arm after the parity port.
  Its glove cuff must follow the forearm, independently of the palm's grip rotation, and fit the
  sleeve diameter. Cancel the cuff's elliptical squash so the round sleeve does not clip through it.
  Keep the hand target unchanged. This intentionally differs from upstream;
  the original zero-difference report is historical, and wrist poses have their own visual fixtures.
- The owner rejected a cuff-only correction because the left forearm still looked like a stick.
  The support arm now needs a full muscle profile, wrist taper, rolled sleeve, and bent elbow.
  Judge its silhouette in actual first-person screenshots. Connection tests alone do not establish
  visual quality. Retain the weapon grip while changing the shoulder, pole, and arm proportions.
- Sweep entire FPS animation clips when changing arm proportions. Reloads reach below the frame
  beyond the fixed shoulder's reach. Let the support shoulder follow that excess distance instead
  of leaving a gap at the wrist or stretching the forearm; reset the body anchor every frame.
- The rifle's old 250-degree support grip bent the hand downward by 48 degrees in idle even
  with its cuff aligned. Place the palm under the handguard at 300 degrees and raise the fingers
  inboard along the forearm. Derive the wrist from the scaled metacarpal span and refit finger
  contact. Check wrist flexion and palm direction as well as cuff alignment and arm connection.
  Lockstep `__PRESENT__` only waits for presentation; pump a frame after live rig edits to see them.
- The corrected rifle wrist sits near the lower viewport edge while aiming. Allow its center
  within the full viewport for that fixture. Settle hipfire for 30 frames before starting the
  reload fixture and capture its third frame; the wrist reaches the bottom edge by frame six.
  Keep the full clip sweep to cover the later magazine reach and return.
- Three.js r180 increments its internal render frame per render call, so world matrices and
  skeleton palettes otherwise update again for each shadow, depth, and forward pass. Scope reuse
  to those submissions and restore automatic updates before custom passes and previews.
- Static prop visibility uses separate InstancedMesh buffers for the camera and each shadow
  cascade. Three.js releases instance attributes through the mesh dispose event. Dispose every
  pass mesh without disposing its shared prototype geometry. Keep canonical instance data intact.
- A hidden instance batch can skip uploads across multiple visibility changes. Upload the whole
  reusable instance attribute when its contents change, so an earlier dirty tail is preserved
  when a later list shrinks before the next draw.
- Keep transparent and transmissive prop batches on their original instance path. On Metal,
  compacting one transparent bottle batch changed 130 sunset pixels by 1/255. Disabling its
  compaction restored an exact match; camera margins and shader changes did not resolve it.
- The FPS prepass reserves zero linear depth for uncovered pixels and positive depth for surfaces.
  Coverage-only shader taps can use depth, while shading and temporal rejection retain normals.
- Three.js r180 checks MRT readback format before selecting the requested attachment. The depth
  contract browser test validates depth and coverage in a shader and reads an RGBA8 result,
  avoiding attachment-specific readback formats. PNG comparisons use the example's pngjs dependency.
  Pass a Node Buffer to `PNG.sync.read`; a raw `Bun.file().arrayBuffer()` does not satisfy its reader.
- Three.js r180 caches vertex bindings by geometry and program, although instance attributes belong
  to the mesh. Give camera prop batches owned geometry copies to avoid repeated attribute setup
  across clouds and passes. Before combining prop buckets, this added about 4.8 MB of vertex/index
  data on CPU and GPU for the tested map.
  Keep prototype geometry ownership separate and fall back if its attributes change.
- Capture mode enables synchronous exposure diagnostics every 90 frames. The FPS benchmark disables
  those readbacks in both builds during measurement, then restores the flag. They do not run during
  normal gameplay. Earlier measurements with those diagnostics enabled are not comparable.
- A shared hardware depth attachment between the FPS prepass and forward pass produced visible
  holes in props and distant facades. Polygon offset experiments through 1024 units did not fix
  them. Keep separate depth attachments until their surface coverage is proven equivalent.
- Per-pass Metal timer queries and readbacks heavily perturb scheduling. A canvas readback can
  return its cached pixels before the final composite writes the canvas, so it does not isolate
  intermediate GPU passes. Use whole-frame GPU queries separately from normal frame pacing.
- Partitioning large merged FPS building batches into 48 metre cells added roughly 500 draw calls
  per frame while removing only 1.5 to 2.6 percent of triangles in tested scenes, and changed
  coplanar draw ordering. Keep those batches merged. Prop geometry accounts for most submissions.
- Cached prop boxes combined with per-instance shadow frustums preserved the tested images but
  removed only another 0.13 to 0.37 percent of triangles. Keep the sphere/cylinder path to avoid
  the additional bounds tests and storage for that small reduction.
- Prop chunk bounds also control distance LOD through `maxDist`. Preserve the original buckets
  for those prototypes when changing draw batching, and preserve instance order within eligible
  opaque prototypes that have no distance LOD.
- Three.js also sorts draws using the projected batch bounding-sphere center. Combining prop
  buckets changes that ordering, so compare images even when submitted triangle counts match.
- Combining opaque prop buckets without distance LOD cut the tested combat frame from 1,479 to
  986 draws without changing triangle counts. Three paired Retina combat trials improved median
  p95 pacing from 83.3 to 66.7 ms; outdoor pacing stayed near 66.7 ms. All fourteen captures stayed
  within 3/255 per channel and 0.04 percent changed pixels, with no perceptible change on inspection.
  Preserve matching instance-color layouts when combining buckets. The comparison tool keeps its
  original investigation flags and accepts explicit reviewed limits for this numerical difference.
- Precomputed Vogel disk positions removed repeated shadow trigonometry, but paired Retina
  trials did not improve median frame pacing and changed a few pixels by up to 2/255. Keep the
  original shadow sampling arithmetic. Cache prop child slots, revalidating after scene edits,
  to avoid repeated linear searches while temporarily substituting pass instances.
- Rejecting forward fragments against the prepass linear-depth texture reproduced the same visible
  holes as hardware depth sharing. Keep the independent forward depth test and avoid early rejection
  until the prepass and forward surface coverage mismatch has a separate rendering fixture and fix.
- The npm scope is `@toma.com`. It is written in every workspace manifest, `tsconfig.base.json`
  paths, source imports, `bun.lock`, `packages/cli/src/template.ts`, the template version-site
  regex in `scripts/versions.ts`, `ci.yml`, and `docs/releasing.md`. Rename it with a literal
  replacement over `git ls-files -c -o --exclude-standard`, hand-edit the escaped regex in
  `scripts/versions.ts`, then run `bun run docs:generate`; the README badges and package table
  derive from the manifests. The scope owner must exist on npm before the first publish.
- The NaturalFPS demo map is Atomic Cul-de-sac: an original recreation of a small,
  symmetrical 1950s desert test-site suburb (two facing two-story pastel houses with
  garages and backyards, a central school bus and moving truck, picket fences, mannequins,
  vintage cars, a welcome sign and clock tower, and a desert horizon). It is inspired by the
  cul-de-sac archetype of that genre but is an original work: all geometry and textures are
  engine-generated and all signage copy is original. Because the repo is public, keep it that
  way. Do not add third-party names, logos, textures, ripped assets, or copied in-game copy,
  and name the map Atomic Cul-de-sac (not any trademarked map name) in code, UI, and docs.
  The design and acceptance criteria are in `docs/atomic-culdesac-plan.md`.
- The map builder and layout live in `examples/urban-raid/src/world/atomic-culdesac.js` and
  `atomic-culdesac-layout.ts`; the map unit test is `tests/atomic-culdesac.test.ts`. Material
  and geometry-cache keys use the `ac-` prefix. The world builder entry is `buildAtomicCuldesac`.
- The current FPS navigation grid samples only the highest surface at each X/Z coordinate.
  It cannot represent a house interior beneath a roof or overlapping floors. A replacement
  level must update navigation, minimap data, world queries, spawns, capture cameras, and
  benchmark routes together.
- The current FPS movement is tuned for tactical sprint and sliding. The intended classic
  layout binds C to crouch, Ctrl to prone or a sprinting dive, and Tab to scores. Weapon
  input currently hardcodes the three imported guns and uses Tab to cycle them. Melee and
  player grenades have action names but no gameplay consumers in the current port.
- FPS `setWeapon()` starts a holster animation; paused simulation cannot finish that transition.
  Menu weapon previews and staged loadout choices must work without advancing gameplay time.
  The current input key handler also prevents default on ordinary keys even while a menu is
  open, so keyboard menu navigation needs explicit focus handling.
- The urban-raid example was first committed failing `format:check`, `lint`, and `check:copy`,
  so `bun run check` was red on `main`. The fixes: run Prettier over the example, add the
  `localStorage` browser global and apply the auto-fixable style rules in `eslint.config.mjs`
  scope, and bump `brace-expansion` (via `bun audit fix`) to clear four high advisories. Run
  the full gate before pushing.
- `scripts/check-copy.ts` used to flag itself: it held the forbidden em/en/ellipsis characters
  as literal regexes while being exempt only from the word rule, so it reported three
  violations against its own source. The patterns now use Unicode escapes (`\u2014`, `\u2013`,
  `\u2026`) so the definition file contains none of the characters it forbids.
- The browser e2e screenshots render through Playwright's bundled Chromium, which uses
  SwiftShader (deterministic CPU rendering) on both ubuntu CI and a headless Linux VM, so
  captures match between them without a GPU. But each lockstep capture frame costs about two
  seconds under SwiftShader, so a `__PUMP__(90)` fixture exceeds the spec's 180 s per-test
  timeout on a CPU-only host. Regenerate baselines with a standalone capture driver and generous
  timeouts, or on a GPU host, not through the timed test runner.
- Urban-raid defaults to the procedural Atomic Cul-de-sac for play and capture. The World
  Labs map is opt-in with `?map=worldlabs`: the `culdesac_*.spz` splat is the visible level and
  `culdesac_collider.glb` is the invisible physics and navigation mesh. Its coarse single-surface
  collider made gameplay feel wrong as the default, so it stays an experiment. Config and pure math live in `src/world/worldlabs-map-config.ts` (tested by
  `tests/worldlabs-map.test.ts`); the builder is `src/world/worldlabs-map.js`.
- The procedural map wears a World Labs skin by default (`?skin=classic` restores the original
  hex colours). `assets/worldlabs/skins/palette.json` holds a linear tint per `ac-*` material key,
  calibrated by `bun tools/worldlabs-skins.mjs` against labelled rectangles of
  `culdesac_pano.jpg`; `src/world/worldlabs-skins.ts` loads and tests it. Only the tint (and the
  plaster base for keys listed in `painted`) changes; the surface tags that footsteps, impacts and
  physics read are untouched. Skinned keys skip the scan albedo in `enhancePbr` so the tint is
  what reaches the screen.
- Calibration learnings: the panorama is graded dark (white siding near 110/255) and its sample
  rectangles often sit in shade or backlight. Matching its brightness outright gave black lawns
  and chalky paint, so goals take the panorama hue and saturation at a brightness half way (log
  space) between the classic render and the exposure-normalised panorama (`blendGoal`). The
  mountains are haze-limited and the metal keys (truck red, car) carry grey reflections, so
  they stop short of their goals; the per-key error is in `swatches.png` and the tool log. The
  tool measures rendered colour per material with the `__MATERIAL_MASK__` id pass
  (`src/dev/material-mask.js`). Writing `palette.json` reloads the dev page, so write it last.
- World Labs style learnings: the skinned map uses the `worldlabs` lighting preset
  (`lightingPresetFor`). Materials are built from the committed `palette.json` at load, so a
  calibration run changes the game the moment it writes the file. Tints multiply the baked
  albedo and are capped (`MAX_TINT`), so whites top out near 185/255 and the `clean` list (fresh-paint
  weathering) does the rest. The sky `skyVeil` mix must run after the dome's roll-off: before it
  the roll-off darkens the veil to olive. Its rgb is in units of the roll-off knee and leans blue
  because the worldlabs grade pulls blue down. Height fog inscatter covers a far sky ring, so the
  mesa ring is drawn in the dome and fog density comes from the preset. The dev server does not
  always pick up preset edits; restart it and read `uSkyVeil` back before trusting a capture.
- Realism pass learnings (skinned map only; every new uniform defaults off): the dome draws the
  mesa ring after the veil, or the veil washes the ring out. `horizonLift` stretches the ring
  taller and `horizonHaze` fades its base into the veil so there is no hard horizon line. The
  volumetrics composite adds a dust band (`dust`: near, far, amount, top height) that thickens
  toward the horizon for aerial perspective. CPU ambient is fed by the unveiled sky, so shade read
  blue until `skyFillChroma` (render hint, default 1.18) greyed the hue push. Clean painted keys use
  the `paint` surface and the bus panels use `car_paint` (clearcoat lacquer): both keep the mean
  albedo of the base they replace (`plaster`, `metal_painted`) because palette tints are calibrated
  against that mean. Pale walls clipped in red under the old grade shoulder; check clip percent
  (any channel at 253 or more) on the yellow pose after any grade change. Measure frame time with
  paired runs against a worktree of the previous commit on the same machine; one-off numbers from
  different sessions disagree by several ms.
- Shader pass 2 learnings (skinned map only): the street layer (`street`: cracks, polish, oil,
  dust) needs a double domain warp on the Voronoi input, or the crack network reads as a regular
  flagstone grid; seal only a third of the cracks and keep oil thresholds high. Leaf clumps
  (`leaf`) and wind sway (`wind`) only shift the colour pass: the GBuffer prepass uses its own
  material, so keep sway at a few centimetres or AO and SSR halo around canopies, and do not
  discard leaf silhouettes for the same reason. `qualityParams` drops these layers to a lite street
  on medium and removes them on low. Skin paint overrides (`SKIN_VEHICLE_PAINT`) are applied as a
  per-channel linear ratio over the achieved colour because palette tints clamp at `MAX_TINT`.
  Classic captures differ between runs of the same commit by about as much as across commits (sun
  drift, transient decals), so compare against a second baseline run before calling a diff real.
- Vehicle model learnings (urban-raid): a model-backed vehicle runs its procedural builder on
  `colliderOnly(A)` (an `Object.create(A)` with `add` and `addBox` stubbed), so colliders, prop
  OBBs and nav blockers stay byte-identical while only the visuals are swapped. The model path is
  gated by a separate sentinel probe (`VEHICLE_SENTINEL_MODEL_ID`); the Poly Haven `useModels`
  flag is independent. Grab3D glbs face +Z with tyres at y=0 and their material names drive the
  finish (`_body_pbr`, `_paint_`, `_rim_`, `_chrome_`, `_hubcap_`, `glass`, `_tire_`); on the bus
  `_roof_white_` is the wheel discs. Raise the per-spec `minSat` when a cream or white panel shares
  the paint hue, or it gets repainted. High clearcoat env intensity washes pale paint toward the sky
  colour; 1.0 is the ceiling on the bus. Some Grab3D URLs answer with an HTML page instead of a glb,
  so the fetcher checks the `glTF` magic bytes. Wood collider counts near z = -18 differ between
  runs in every mode (4.4k vs 4.5k collision tris in the build log); that predates the vehicle work.
- Deterministic captures and e2e pin `&skin=classic` (e2e/natural-fps.spec.ts, tools/browser.mjs,
  tools/parity.mjs) so goldens and parity numbers do not move with palette recalibration.
- The splat and the collider share one raw Y-down frame. The same placement (scale by
  `metric_scale_factor`, rotate PI about X, lift by `ground_plane_offset`) puts the captured
  ground at y=0. The capture camera sat about 6 m up, so splat detail softens at eye height.
- Spark draws the splat only in the forward pass with no depth write, so the G-buffer sees
  splat pixels as empty sky. The sky volumetrics pass then fogged the whole lower frame into a
  milky haze; it is disabled on the World Labs map. Other depth effects (SSAO, TAA
  reprojection, motion blur) also see no depth there. Spark sorts itself in
  `onBeforeRender`, so do not call `sparkRenderer.update()` every frame.
- The render system's stone blockout probe only retires itself once six foreign meshes exist.
  A level with fewer meshes (the World Labs map has one splat and a few collider meshes) must
  call `render.dismissProbe()` or the probe boxes stay on screen.
- AI `populate()` garrisons only spawn points more than 18 m from the player, so a map needs
  spawns spread well past that radius or it starts with no enemies.

## 4. Copy rules

These apply to docs, code comments, UI strings, package descriptions, commit and PR text, and your
replies.

- Describe Natural as a desktop-quality game engine in the class of Unity and Unreal Engine that
  runs in the browser. Those are the only engines to name.
- Never mention Godot, and never compare Natural to it.
- No em dashes, en dashes, or ellipsis characters. Use a comma, a period, or a colon.
- No marketing speak. No "It's not X, it's Y" or "X, not Y" constructions, no superlatives, and no
  claims the tests do not back. State what the thing does.
- `bun run check:copy` enforces the character rule and the engine-name rule on every tracked file.
  This file and the script are exempt from the word rule because they state it.

## 5. When to bump the version

The root `package.json` version is the only ground truth. `bun run version:bump` rewrites every
other site: each workspace `package.json`, `tauri.conf.json`, `Cargo.toml`, the `natural-editor`
block in `Cargo.lock`, the workspace entries in `bun.lock`, the dependency ranges in
`packages/cli/src/template.ts`, and a new `CHANGELOG.md` heading. `verify:versions` fails the merge
gate when any of them disagrees. The MCP server reads its version from its own `package.json`. Do not
hardcode a version anywhere else.

Bump in the same change as the work it describes, and fill in the CHANGELOG heading the bump created.

| bump         | for                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `prerelease` | `0.1.0-alpha.0 -> 0.1.0-alpha.1`: any user-visible change while the line is a prerelease                        |
| `patch`      | a bug fix or a refactor with no new user-visible behavior, once the line is stable                              |
| `minor`      | new user-visible behavior: an API, a component, a CLI command, an editor feature                                |
| `major`      | a break for existing projects: a removed or renamed public API, a scene or save format change with no migration |

`patch`, `minor`, and `major` on a prerelease first land the release it was leading up to, the way
`npm version` does. `0.1.0-alpha.1` plus `patch` is `0.1.0`.

Do not bump for a docs-only, CI-only, or tooling-only change. One bump per change. If two land close
together, the second rebases and re-bumps. Never edit a version to make anything pass.

## 6. How a release happens

- `.github/workflows/tag.yml` runs on every push to `main`. It verifies the version sites, and when
  `v<version>` is a new tag it creates the tag and dispatches `release.yml` for it. An unchanged
  version means it does nothing, which is the normal case. It never writes to `main`.
- The dispatch is explicit because a tag pushed with `GITHUB_TOKEN` does not fire another workflow's
  `push: tags` trigger. GitHub only lets `GITHUB_TOKEN` start runs through `workflow_dispatch` and
  `repository_dispatch`.
- `release.yml` runs `release:verify`, publishes the npm packages, and builds the desktop apps. A
  failed run leaves its tag behind. Fix forward with a new bump. Never move or delete a tag.
- `main` is unprotected, so the tag lands before `release:verify` runs. Run `bun run check` before
  pushing.
- `verify-versions.ts` compares the tag to the version only when `GITHUB_REF_TYPE` is `tag`. On a
  push to `main` the ref is a branch and that check must stay off.

## 7. How work lands

- Plan first for anything multi-file or behavioral, and get sign-off before writing code. Deliver
  the whole scope, then say what you did not do and why.
- Prefix PR titles with `Hotfix` or `[ENG-XXX]`, where `XXX` is the Linear ticket number.
- No unrequested scope. Do not add a feature because it seemed useful while you were in the file.
- The owner prefers continuing authorized work without repeated permission or confirmation prompts.
  Use the authority already granted for local implementation and verification.
- Run `git status` before you start. The tree can hold uncommitted work from another session, so
  never reset it with `git checkout -- .` or `git clean`. Rehearse any script that rewrites many
  files in a scratch copy of the repo first.
