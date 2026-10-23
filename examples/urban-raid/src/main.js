import { Engine } from "./core/engine.js";
import { createConfig } from "./core/config.js";

import { RenderSystem } from "./render/index.js";
import { MaterialSystem } from "./materials/index.js";
import { SkySystem } from "./sky/index.js";
import { WorldSystem } from "./world/index.js";
import { BackdropSystem } from "./world/backdrop.js";
import { PhysicsSystem } from "./physics/index.js";
import { PlayerSystem } from "./player/index.js";
import { WeaponSystem } from "./weapons/index.js";
import { FxSystem } from "./fx/index.js";
import { AiSystem } from "./ai/index.js";
import { UiSystem } from "./ui/index.js";
import { AudioSystem } from "./audio/index.js";

import { installShotApi } from "./dev/shots.js";
import { prewarm } from "./core/prewarm.js";
import { runAudioSelfTest } from "./audio/selftest.js";
import { readSettings, SETTINGS_KEY } from "./ui/settings.ts";
import { resolveMapMode } from "./world/worldlabs-map-config.ts";

const params = new URLSearchParams(location.search);
const capture = params.get("capture") === "1";
// Deterministic shutter for the pixel gate: the engine does not schedule its own
// frames, the driver advances exactly N of them through window.__PUMP__. Opt-in,
// because tools that measure real frame pacing (tools/perf.mjs) need the loop to
// free-run. See the long comment in src/dev/shots.js.
const lockstep = capture && params.get("lockstep") === "1";

// The distance backdrop is a persisted preference, but capture/deterministic
// runs stay on the procedural sky so parity baselines never depend on an
// optional splat world. `?backdrop=splat|pano|off` overrides for a given load.
let storedBackdrop = "off";
if (!capture) {
  try {
    storedBackdrop = readSettings(localStorage.getItem(SETTINGS_KEY))?.backdrop ?? "off";
  } catch {
    storedBackdrop = "off";
  }
}

// The World Labs capture is the default level. `?map=procedural` brings back the
// generated map; capture runs keep it unless `?map=worldlabs` asks otherwise, so
// the pixel baselines stay on deterministic geometry.
const map = resolveMapMode({ param: params.get("map"), capture });

const config = createConfig({
  map,
  quality: params.get("q") ?? "ultra",
  backdrop: capture ? "off" : (params.get("backdrop") ?? storedBackdrop),
  deterministic: capture,
});

const canvas = document.getElementById("game");

const engine = new Engine({ canvas, config });

// Registration order is irrelevant - Registry topo-sorts on static deps.
engine
  .add(RenderSystem)
  .add(MaterialSystem)
  .add(SkySystem)
  .add(WorldSystem)
  .add(BackdropSystem)
  .add(PhysicsSystem)
  .add(PlayerSystem)
  .add(WeaponSystem)
  .add(FxSystem)
  .add(AiSystem)
  .add(UiSystem)
  .add(AudioSystem);

try {
  await engine.init();
} catch (err) {
  console.error("[boot] init failed", err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="position:fixed;inset:0;padding:2rem;color:#f66;background:#000;
       font:12px/1.5 ui-monospace,monospace;overflow:auto;z-index:9999;white-space:pre-wrap">
BOOT FAILURE\n\n${err.stack ?? err.message}</pre>`,
  );
  throw err;
}

const shotApi = installShotApi(engine, { capture, lockstep });

// Compile every shader permutation before the frame loop starts. Measured: without
// this, 86 programs compile lazily during play, up to 30 on one frame, producing
// 3.1-3.9 SECOND stalls. See src/core/prewarm.js.
//
// ON BY DEFAULT since the capture path was made frame-deterministic; opt out with
// `?prewarm=0`. It is now PROVEN pixel-neutral: `tools/baseline.mjs` with
// `--query=prewarm=0` vs `--query=prewarm=1` reports identical:true on all 11
// shots (0 changed pixels, maxDelta 0). The two things that previously made the
// ~1.4 s pre-warm spend look like a visual change were both boot-duration
// couplings OUTSIDE the subsystems: (1) the shutter frame index was latency-bound
// because the engine kept stepping through the driver's round trips - fixed by
// lockstep in src/dev/shots.js; (2) `will-change: transform` on the compass strip
// cached a composited-layer raster taken at a wall-clock-dependent moment - fixed
// in src/ui/style.js.
const warmup =
  params.get("prewarm") === "0"
    ? { ok: false, reason: "disabled by ?prewarm=0" }
    : await prewarm(engine);
console.info("[boot] prewarm", warmup);
window.__PREWARM__ = warmup;

await engine.start();

// Capture harness handshake: only flag ready once a frame has actually landed.
//
// BOOT_FRAMES is deliberately a frame COUNT, not a rAF race. In lockstep mode the
// engine has no loop of its own, so we hand-pump exactly this many frames and only
// then raise __READY__; the shot is therefore always applied at engine frame 3, no
// matter how long boot (or pre-warm) took in wall-clock terms.
const BOOT_FRAMES = 3;
if (lockstep) {
  await shotApi.pump(BOOT_FRAMES);
  window.__READY__ = true;
  document.body.dataset.engineReady = "true";
} else {
  let warm = 0;
  const readyProbe = () => {
    if (++warm >= BOOT_FRAMES) {
      window.__READY__ = true;
      document.body.dataset.engineReady = "true";
      return;
    }
    requestAnimationFrame(readyProbe);
  };
  requestAnimationFrame(readyProbe);
}

window.__ENGINE__ = engine;
if (params.get("audioTest") === "1") window.__AUDIO_TEST__ = await runAudioSelfTest();

if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose());
}
