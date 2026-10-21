import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { cpus, platform, release } from "node:os";
import { parseArgs } from "node:util";
import {
  productionBuild,
  disposeBuild,
  serveBuild,
  launchBrowser,
  ready,
  collectErrors,
  instrumentGl,
  measureRoute,
  percentiles,
  buildFingerprint,
} from "./browser.mjs";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    output: { type: "string", default: "test-results/fps-bench.json" },
    runs: { type: "string", default: "3" },
    frames: { type: "string", default: "240" },
    warmup: { type: "string", default: "120" },
    sizes: { type: "string", default: "1280x720x1,1512x982x2,1728x1117x2" },
    routes: { type: "string", default: "outdoor,interior,combat,aiming" },
    channel: { type: "string", default: "chrome" },
    headed: { type: "boolean", default: false },
    gpu: { type: "boolean", default: false },
  },
});
const positive = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Expected a positive integer: ${value}`);
  return n;
};
const runs = positive(values.runs),
  frames = positive(values.frames),
  warmup = positive(values.warmup);
const sizes = values.sizes.split(",").map((size) => {
  const [width, height, dpr] = size.split("x").map(positive);
  if (!width || !height || !dpr) throw new Error(`Invalid size: ${size}`);
  return { width, height, dpr };
});
const routes = { outdoor: "hero", interior: "interior", combat: "combat", aiming: "ads" };
const selected = values.routes.split(",");
for (const route of selected) if (!routes[route]) throw new Error(`Unknown route: ${route}`);
const currentDirectory = productionBuild();
const fingerprints = {
  optimized: await buildFingerprint(currentDirectory),
  baseline: values.baseline ? await buildFingerprint(values.baseline) : null,
};
const current = serveBuild(currentDirectory);
const baseline = values.baseline ? serveBuild(values.baseline) : null;
const browser = await launchBrowser(values.channel, values.headed);
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
const report = {
  schema: 1,
  date: new Date().toISOString(),
  cpu: cpus()[0]?.model,
  platform: `${platform()} ${release()}`,
  browser: browser.version(),
  channel: values.channel,
  headed: values.headed,
  measurement: values.gpu
    ? "gpu queries, frame pacing excluded"
    : "normal frame pacing, no GPU queries",
  seed: "0x5eed1234",
  fixedHz: 120,
  maxFixedSteps: 8,
  warmup,
  frames,
  runs,
  baseline: values.baseline ?? null,
  fingerprints,
  routeVersion: 1,
  isolation: "Sequential browser runs; other host applications are not controlled by this harness.",
  results: [],
};
try {
  for (const size of sizes)
    for (const route of selected)
      for (let run = 0; run < runs; run++) {
        const variants = baseline
          ? [
              ["baseline", baseline],
              ["optimized", current],
            ]
          : [["optimized", current]];
        if (run % 2) variants.reverse();
        for (const [variant, server] of variants) {
          const page = await browser.newPage({
            viewport: { width: size.width, height: size.height },
            deviceScaleFactor: size.dpr,
          });
          const errors = collectErrors(page);
          try {
            await page.addInitScript(instrumentGl);
            await ready(page, server.url, routes[route]);
            const result = await page.evaluate(measureRoute, {
              frames,
              warmup,
              gpu: values.gpu,
              route,
            });
            const { samples, ...details } = result;
            const row = {
              variant,
              route,
              run: run + 1,
              ...size,
              ...details,
              metrics: Object.fromEntries(
                Object.entries(samples).map(([key, data]) => [key, percentiles(data)]),
              ),
              errors,
            };
            report.results.push(row);
            console.error(
              JSON.stringify({
                variant,
                route,
                run: run + 1,
                ...size,
                metrics: row.metrics,
                errors,
              }),
            );
            await writeFile(output, JSON.stringify(report, null, 2) + "\n");
            if (errors.length) throw new Error("Browser errors during benchmark");
          } finally {
            await page.close();
          }
        }
      }
} finally {
  await browser.close();
  current.close();
  baseline?.close();
  disposeBuild(currentDirectory);
}
console.log(JSON.stringify(report, null, 2));
