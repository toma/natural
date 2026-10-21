import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  productionBuild,
  disposeBuild,
  serveBuild,
  launchBrowser,
  ready,
  collectErrors,
  shots,
  buildFingerprint,
} from "./browser.mjs";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    output: { type: "string", default: "test-results/fps-parity" },
    channel: { type: "string", default: "chromium" },
    shots: { type: "string" },
    size: { type: "string", default: "1280x720x1" },
    "max-channel-delta": { type: "string", default: "1" },
    "max-changed-ratio": { type: "string", default: "0.0001" },
  },
});
if (!values.baseline) throw new Error("Pass --baseline=<saved production dist directory>");
const dimensions = values.size.split("x").map(Number);
if (dimensions.length !== 3 || !dimensions.every((n) => Number.isSafeInteger(n) && n > 0))
  throw new Error(`Invalid size: ${values.size}. Expected widthxheightxdpr.`);
const [width, height, dpr] = dimensions;
const limits = {
  maxChannelDelta: Number(values["max-channel-delta"]),
  maxChangedRatio: Number(values["max-changed-ratio"]),
};
if (
  !Number.isSafeInteger(limits.maxChannelDelta) ||
  limits.maxChannelDelta < 0 ||
  limits.maxChannelDelta > 255 ||
  !Number.isFinite(limits.maxChangedRatio) ||
  limits.maxChangedRatio < 0 ||
  limits.maxChangedRatio > 1
)
  throw new Error("Invalid image comparison limits");
const currentDirectory = productionBuild();
const fingerprints = {
  baseline: await buildFingerprint(values.baseline),
  optimized: await buildFingerprint(currentDirectory),
};
const baseline = serveBuild(values.baseline),
  current = serveBuild(currentDirectory);
const browser = await launchBrowser(values.channel);
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const names = values.shots?.split(",") ?? [...shots, "wrist-idle", "wrist-ads", "wrist-reload"];
const report = {
  browser: browser.version(),
  viewport: [width, height],
  dpr,
  quality: "ultra",
  freshPages: true,
  baseline: values.baseline,
  fingerprints,
  limits,
  shots: [],
};
try {
  for (const name of names) {
    const images = [],
      states = [],
      errors = [];
    for (const [variant, server] of [
      ["baseline", baseline],
      ["optimized", current],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: dpr,
      });
      const pageErrors = collectErrors(page);
      try {
        await ready(page, server.url, name.startsWith("wrist-") ? "hero" : name);
        await page.evaluate("window.__PUMP__(90)");
        if (name.startsWith("wrist-")) {
          // Reproduce the existing arm fixture's complete pose history on a fresh page.
          for (const pose of ["idle", "ads", "reload"]) {
            await page.evaluate((pose) => {
              const w = window.__ENGINE__.ctx.get("weapons");
              w.debugPose(pose === "ads" ? "ads" : "idle");
            }, pose);
            if (pose === "reload") {
              await page.evaluate("window.__PUMP__(30)");
              await page.evaluate(
                "window.__ENGINE__.ctx.get('weapons').viewmodel.play('reloadTac')",
              );
            }
            await page.evaluate((n) => window.__PUMP__(n), pose === "reload" ? 3 : 30);
            if (name === `wrist-${pose}`) break;
          }
        }
        await page.evaluate("window.__PRESENT__(2)");
        images.push(
          PNG.sync.read(await page.screenshot({ path: resolve(output, `${variant}-${name}.png`) })),
        );
        states.push(await page.evaluate("window.__RENDER_INFO__"));
        errors.push(...pageErrors);
      } finally {
        await page.close();
      }
    }
    const [a, b] = images;
    let changedPixels = 0,
      maxChannelDelta = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      let delta = 0;
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c] - b.data[i + c]));
      if (delta) changedPixels++;
      maxChannelDelta = Math.max(delta, maxChannelDelta);
    }
    const changedRatio = changedPixels / (a.width * a.height);
    const row = {
      name,
      changedPixels,
      changedRatio,
      maxChannelDelta,
      states,
      errors,
      investigate: maxChannelDelta > 1 || changedRatio > 0.0001,
      pass:
        maxChannelDelta <= limits.maxChannelDelta &&
        changedRatio <= limits.maxChangedRatio &&
        errors.length === 0,
    };
    report.shots.push(row);
    console.info(JSON.stringify(row));
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
} finally {
  await browser.close();
  baseline.close();
  current.close();
  disposeBuild(currentDirectory);
}
if (report.shots.some((shot) => !shot.pass)) process.exitCode = 1;
