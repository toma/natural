import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  productionBuild,
  disposeBuild,
  buildFingerprint,
  serveBuild,
  launchBrowser,
  ready,
  collectErrors,
  instrumentGl,
} from "./browser.mjs";

const { values } = parseArgs({
  options: {
    output: { type: "string", default: "test-results/fps-transitions" },
    sizes: { type: "string", default: "1280x720x1,1512x982x2" },
    shots: { type: "string", default: "hero,interior,sunset,combat" },
    channel: { type: "string", default: "chromium" },
    "lifecycle-only": { type: "boolean", default: false },
  },
});
const sizes = values.sizes.split(",").map((size) => {
  const [width, height, dpr] = size.split("x").map(Number);
  if (![width, height, dpr].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error(`Invalid size: ${size}`);
  return { width, height, dpr };
});
const directory = productionBuild();
const server = serveBuild(directory);
const browser = await launchBrowser(values.channel);
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  fingerprint: await buildFingerprint(directory),
  browser: browser.version(),
  quality: "ultra",
  seed: "0x5eed1234",
  reference:
    "Same production build with instance substitution, depth collapse and transform reuse bypassed after boot. Prop batching and shader optimizations remain enabled in both variants.",
  comparisons: [],
  lifecycle: [],
  resourceCaveat:
    "Counts track explicit WebGL create/delete calls, not GPU bytes or resources released implicitly when a program or context is destroyed.",
  pass: false,
};
try {
  for (const size of values["lifecycle-only"] ? [] : sizes) {
    for (const shot of values.shots.split(",")) {
      const captures = [];
      for (const variant of ["reference", "optimized"]) {
        const page = await browser.newPage({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: size.dpr,
        });
        const errors = collectErrors(page);
        const images = [],
          states = [];
        try {
          await page.addInitScript(instrumentGl);
          await ready(page, server.url, shot);
          await page.evaluate((variant) => {
            const e = window.__ENGINE__,
              r = e.ctx.get("render");
            r._probeExposure = false;
            if (variant === "reference") {
              r.instances.run = (_name, draw) => draw();
              r.depthDraws.run = (draw) => draw();
              r.transforms.run = (_roots, draw) => draw();
            }
            window.__TRANSITION_BASE__ = {
              position: e.camera.position.clone(),
              rotation: e.camera.rotation.clone(),
              sources: [...r.instances.entries.values()].map(({ source }) => ({
                source,
                parent: source.parent,
                material: source.material,
                matrices: source.instanceMatrix.array.slice(),
                colors: source.instanceColor?.array.slice(),
              })),
            };
          }, variant);
          await page.evaluate("window.__PUMP__(90)");
          for (let turn = 0; turn < 8; turn++) {
            await page.evaluate((turn) => {
              const e = window.__ENGINE__,
                base = window.__TRANSITION_BASE__;
              const angle = (turn * Math.PI) / 4;
              e.camera.position.copy(base.position);
              e.camera.position.x += Math.sin(angle) * 3;
              e.camera.position.z += Math.cos(angle) * 3;
              e.camera.rotation.copy(base.rotation);
              e.camera.rotation.y += angle;
            }, turn);
            // Capture the first frame after each cut, before history can hide a missing draw.
            await page.evaluate("window.__PUMP__(1)");
            await page.evaluate("window.__PRESENT__(2)");
            const name = `${shot}-${size.width}x${size.height}x${size.dpr}-${turn}`;
            images.push(
              PNG.sync.read(
                await page.screenshot({ path: resolve(output, `${variant}-${name}.png`) }),
              ),
            );
            const state = await page.evaluate(() => {
              const e = window.__ENGINE__,
                r = e.ctx.get("render");
              return {
                canonical: window.__TRANSITION_BASE__.sources.every(
                  ({ source, parent, material, matrices, colors }) =>
                    source.parent === parent &&
                    parent.children.includes(source) &&
                    source.material === material &&
                    source.instanceMatrix.array.every((n, i) => n === matrices[i]) &&
                    (!colors || source.instanceColor.array.every((n, i) => n === colors[i])),
                ),
                autoUpdate: [e.scene, e.viewScene, e.camera, e.viewCamera].every(
                  (o) => o.matrixWorldAutoUpdate,
                ),
                tick: e.game.tick,
                frame: e.time.frame,
                visibility: Object.fromEntries(r.instances.counts),
              };
            });
            if (!state.canonical || !state.autoUpdate || Math.abs(state.tick - state.frame * 2) > 1)
              throw new Error(`State restoration failed: ${JSON.stringify(state)}`);
            states.push(state);
            await page.evaluate("window.__PUMP__(11)");
          }
          if (errors.length) throw new Error(errors.join("\n"));
          captures.push({ images, states });
        } finally {
          await page.close();
        }
      }
      for (let turn = 0; turn < 8; turn++) {
        const a = captures[0].images[turn],
          b = captures[1].images[turn];
        let changedPixels = 0,
          maxChannelDelta = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          let delta = 0;
          for (let c = 0; c < 4; c++)
            delta = Math.max(delta, Math.abs(a.data[i + c] - b.data[i + c]));
          if (delta) changedPixels++;
          maxChannelDelta = Math.max(delta, maxChannelDelta);
        }
        const changedRatio = changedPixels / (a.width * a.height);
        const states = captures.map((capture) => capture.states[turn]);
        const row = {
          shot,
          ...size,
          turn,
          changedPixels,
          changedRatio,
          maxChannelDelta,
          states,
          pass:
            maxChannelDelta <= 1 &&
            changedRatio <= 0.0001 &&
            states[0].tick === states[1].tick &&
            states[0].frame === states[1].frame,
        };
        report.comparisons.push(row);
        console.info(JSON.stringify(row));
      }
      await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    }
  }
  const size = sizes.at(-1);
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
  });
  const errors = collectErrors(page);
  try {
    await page.addInitScript(instrumentGl);
    await ready(page, server.url, "hero");
    await page.evaluate(() => {
      window.__ENGINE__.ctx.get("render")._probeExposure = false;
    });
    const route = ["hero", "interior", "sunset", "night", "ads", "hero"];
    for (let cycle = 0; cycle < 4; cycle++) {
      const steps = [];
      for (let stop = 0; stop < route.length; stop++) {
        await page.setViewportSize({
          width: size.width - (stop % 3) * 80,
          height: size.height - (stop % 3) * 60,
        });
        await page.evaluate((shot) => window.__APPLY_SHOT__(shot), route[stop]);
        await page.evaluate("window.__PUMP__(12)");
        steps.push(
          await page.evaluate(() => {
            const e = window.__ENGINE__,
              r = e.ctx.get("render");
            return {
              resources: globalThis.structuredClone(window.__BENCH_GL__.resources),
              compileCalls: window.__BENCH_GL__.compileCalls,
              passes: [...r.instances.entries.values()].reduce(
                (n, entry) => n + entry.passes.size,
                0,
              ),
              canonical: [...r.instances.entries.values()].every(({ source }) =>
                source.parent?.children.includes(source),
              ),
              autoUpdate: [e.scene, e.viewScene, e.camera, e.viewCamera].every(
                (o) => o.matrixWorldAutoUpdate,
              ),
              screenSize: { ...r.screenSize },
              pixelRatio: r.renderer.getPixelRatio(),
            };
          }),
        );
      }
      report.lifecycle.push({ cycle, steps });
      console.info(JSON.stringify({ cycle, resources: steps.at(-1).resources }));
    }
    const previous = report.lifecycle[2].steps,
      last = report.lifecycle[3].steps;
    report.lifecycleStable = last.every(
      (step, i) =>
        step.canonical &&
        step.autoUpdate &&
        step.passes === previous[i].passes &&
        step.compileCalls === previous[i].compileCalls &&
        Object.entries(step.resources).every(
          ([name, counts]) => counts.live === previous[i].resources[name].live,
        ),
    );
    report.disposal = await page.evaluate(async () => {
      const e = window.__ENGINE__,
        r = e.ctx.get("render");
      const passes = [...r.instances.entries.values()].flatMap((entry) =>
        [...entry.passes.values()].map((pass) => pass.mesh),
      );
      let disposed = 0;
      for (const mesh of passes) mesh.addEventListener("dispose", () => disposed++);
      await e.dispose();
      return {
        passes: passes.length,
        disposed,
        entriesRemaining: r.instances.entries.size,
        resources: globalThis.structuredClone(window.__BENCH_GL__.resources),
      };
    });
    report.errors = errors;
    report.pass =
      report.comparisons.every((row) => row.pass) &&
      report.lifecycleStable &&
      report.disposal.passes > 0 &&
      report.disposal.passes === report.disposal.disposed &&
      report.disposal.entriesRemaining === 0 &&
      errors.length === 0;
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  } finally {
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
  disposeBuild(directory);
}
if (!report.pass) process.exitCode = 1;
