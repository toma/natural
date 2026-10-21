import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const upstream = process.env.NATURAL_FPS_UPSTREAM_URL;
if (!upstream)
  throw new Error(
    "Set NATURAL_FPS_UPSTREAM_URL to a local server for revision d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853",
  );
const natural = process.env.NATURAL_FPS_TEST_URL ?? "http://127.0.0.1:43400";
const output = resolve(process.env.NATURAL_FPS_PARITY_OUTPUT ?? "test-results/natural-fps-parity");
const names = [
  "hero",
  "interior",
  "detail",
  "sunset",
  "night",
  "weapon",
  "ads",
  "muzzle",
  "combat",
  "impacts",
  "hud",
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    "--ignore-gpu-blocklist",
    "--force-color-profile=srgb",
    "--mute-audio",
  ],
});
const report = {
  upstreamRevision: "d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853",
  browser: browser.version(),
  platform: process.platform,
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  quality: "ultra",
  settleFrames: 90,
  shots: [],
};
try {
  for (const name of names) {
    const images = [];
    const errors = [];
    const states = [];
    for (const [label, url] of [
      ["upstream", upstream],
      ["natural", natural],
    ]) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${label}: ${m.text()}`);
      });
      try {
        await page.goto(`${url}/?capture=1&lockstep=1&q=ultra`);
        await page.waitForFunction("window.__READY__ === true", null, { timeout: 180000 });
        const applied = await page.evaluate(
          (name) => window.__APPLY_SHOT__(name, { grabFrame: 90 }),
          name,
        );
        if (applied.error) throw new Error(applied.error);
        await page.evaluate("window.__PUMP__(90)");
        await page.evaluate("window.__PRESENT__(2)");
        images.push(
          PNG.sync.read(await page.screenshot({ path: resolve(output, `${label}-${name}.png`) })),
        );
        states.push(await page.evaluate("window.__RENDER_INFO__"));
      } finally {
        await page.close();
      }
    }
    const [a, b] = images;
    if (a.width !== b.width || a.height !== b.height) throw new Error(`Size mismatch for ${name}`);
    let changedPixels = 0,
      maxChannelDelta = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      let delta = 0;
      for (let channel = 0; channel < 4; channel++)
        delta = Math.max(delta, Math.abs(a.data[i + channel] - b.data[i + channel]));
      if (delta > 0) changedPixels++;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    const row = { name, changedPixels, maxChannelDelta, states, errors };
    report.shots.push(row);
    console.info(JSON.stringify(row));
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
} finally {
  await browser.close();
}
if (
  report.shots.length !== names.length ||
  report.shots.some((s) => s.changedPixels > 0 || s.errors.length > 0)
)
  process.exitCode = 1;
