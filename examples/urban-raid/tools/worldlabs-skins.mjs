/**
 * Derive the World Labs skin for the procedural Atomic Cul-de-sac.
 *
 *   bun tools/worldlabs-skins.mjs [--iterations=5] [--channel=chromium] [--headed]
 *
 * 1. Targets. Every palette key has one or more labelled rectangles on the
 *    World Labs panorama (assets/worldlabs/culdesac_pano.jpg, 4608x2304
 *    equirect). The panorama is decoded in the browser and each key's target is
 *    the luma-trimmed median of its rectangles (worldlabs-skins.ts robustColor).
 *    The panorama is used rather than rendered splat views because it is one
 *    consistent authored grade, where splat views shift with the camera.
 * 2. Sky. A grid over the sky's turbidity and horizon murk picks the pair
 *    whose rendered sky pixels sit closest to the panorama sky.
 * 3. Goals. Each key keeps the panorama's hue and saturation exactly. Its
 *    brightness goes half way (in log space) from the classic palette as
 *    rendered toward the panorama sample scaled by one exposure factor (the
 *    median luminance ratio between the two), see blendGoal. A full brightness
 *    match copied the panorama's cast shadows and backlight into the albedo:
 *    black lawns and chalky paint in the game's sun.
 * 4. Tints. The tool serves the procedural map, poses a fixed set of cameras,
 *    and per view takes a screenshot plus a material id pass
 *    (window.__MATERIAL_MASK__). The pooled rendered colour of each key is
 *    compared with its target and the key's linear tint uniform is stepped
 *    toward it (stepTint), live, for a few iterations.
 * 5. Output: assets/worldlabs/skins/palette.json (targets, exposure, tints,
 *    sky, the achieved colours) and swatches.png (panorama sample, goal,
 *    rendered result).
 *
 * Roughness and metalness stay with the procedural material library: a splat
 * carries baked colour only, so there is nothing to sample them from. The
 * style pass (STYLE, CLEAN, FINISH below) is authored on top: it brightens the
 * painted keys past the panorama and takes the chrome off the vehicles.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";

import { exampleRoot, launchBrowser } from "./browser.mjs";
import {
  blendGoal,
  colorError,
  exposureBetween,
  parsePalette,
  pixelsById,
  robustColor,
  stepTint,
} from "../src/world/worldlabs-skins.ts";

const { values } = parseArgs({
  options: {
    iterations: { type: "string", default: "5" },
    channel: { type: "string", default: "chromium" },
    headed: { type: "boolean", default: false },
    "skip-sky": { type: "boolean", default: false },
  },
});
const iterations = Number(values.iterations);
if (!Number.isSafeInteger(iterations) || iterations < 0) throw new Error("bad --iterations");

const outDir = resolve(exampleRoot, "assets/worldlabs/skins");
const palettePath = resolve(outDir, "palette.json");
const PANO = "/assets/worldlabs/culdesac_pano.jpg";

/**
 * Panorama rectangles per palette key, [x0, y0, x1, y1] in panorama pixels.
 * The optional third entry is a luma band for robustColor.
 */
const LABELS = {
  "ac-yellow": [
    ["yellow house, south siding", [3283, 1216, 3429, 1295]],
    ["yellow house, west gable", [3625, 1171, 3670, 1329]],
    ["yellow house, west lower", [3456, 1239, 3501, 1362]],
    ["two-tone house, upper storey", [124, 1137, 202, 1182]],
  ],
  "ac-green": [
    ["teal band, west house", [1321, 1137, 1394, 1179]],
    ["teal band, north house", [1984, 1160, 2018, 1250]],
  ],
  "ac-white": [
    ["white siding, north house", [2029, 1076, 2119, 1115]],
    ["white siding, west house", [1163, 1115, 1298, 1137]],
  ],
  "ac-cream": [
    ["beige garage house, beside the door", [295, 1244, 337, 1311]],
    ["beige garage house, right of the door", [467, 1238, 493, 1317]],
  ],
  "ac-blue": [["mint house", [3838, 1149, 3940, 1182]]],
  "ac-sky": [["pale blue house", [4356, 1137, 4446, 1194]]],
  "ac-pink": [["two-tone house, orange storey", [112, 1216, 191, 1295]]],
  "ac-roof": [
    ["shingle roof, west garage", [1416, 1159, 1540, 1184]],
    ["shingle roof, north garage", [1793, 1143, 1962, 1171]],
    ["shingle roof, south", [3080, 1233, 3294, 1284]],
    ["shingle roof, east", [3456, 1126, 3681, 1205]],
  ],
  "ac-red": [
    ["red truck cab", [2523, 1329, 2630, 1396]],
    ["red garage door", [2400, 1160, 2473, 1227]],
  ],
  "ac-bus": [["school bus flank", [1962, 1351, 2052, 1396]]],
  "ac-road": [
    ["road, east", [697, 1227, 855, 1362]],
    ["road, west", [4108, 1205, 4198, 1362]],
  ],
  "ac-concrete": [
    ["driveway", [1827, 1283, 1956, 1384]],
    ["sidewalk, east", [565, 1260, 590, 1390]],
  ],
  "ac-grass": [
    ["front lawn, west house", [1321, 1306, 1658, 1336]],
    ["sunlit lawn, west house", [1560, 1235, 1690, 1290]],
    ["lawn, south", [2619, 1233, 2754, 1272]],
  ],
  "ac-hedge": [["lawn in shade, north", [1602, 1227, 1737, 1306]]],
  "ac-fence": [
    ["picket fence, north", [1174, 1340, 1782, 1390]],
    ["picket fence, east", [22, 1334, 517, 1385]],
  ],
  "ac-sand": [
    ["desert floor, south", [2641, 1104, 3204, 1160]],
    ["desert floor, north", [1580, 1115, 1782, 1216]],
  ],
  "ac-mtn": [
    ["mesa, south", [2371, 991, 2866, 1081]],
    ["mesa, west", [3962, 969, 4581, 1081]],
    ["mesa, east", [169, 946, 506, 1081]],
  ],
  "ac-metal": [
    ["truck box", [2484, 1182, 2630, 1250]],
    ["water tower tank", [2304, 901, 2343, 980]],
  ],
  "ac-wood": [
    ["utility pole, north", [1789, 1014, 1798, 1329]],
    ["utility pole, east", [84, 1081, 92, 1362]],
  ],
  "ac-car": [["parked car", [1827, 1250, 1878, 1284]]],
};
/** Pickets show lawn between the boards: keep the bright band only. */
const BANDS = { "ac-fence": [0.55, 0.95] };
/** Keys that switch from bare timber grain to painted boards under the skin. */
const PAINTED = ["ac-fence"];
const SKY = [
  ["sky, east", [0, 600, 1152, 880]],
  ["sky, north", [1152, 600, 2304, 880]],
  ["sky, south", [2304, 600, 3456, 880]],
  ["sky, west", [3456, 600, 4608, 880]],
];

/** Cameras for the rendered measurement: the review shots plus the ring houses and far hills. */
const VIEWS = [
  { shot: "hero" },
  { shot: "greenfront" },
  { shot: "yellow" },
  { shot: "yardgreen" },
  { shot: "yardyellow" },
  { shot: "corner" },
  { shot: "carcu" },
  { shot: "buscu" },
  { shot: "detail" },
  { pos: [-22, 2.2, -21], look: [-34, 3, -31] },
  { pos: [-22, 2.2, -5], look: [-34, 3, -5] },
  { pos: [-22, 2.2, 18], look: [-34, 3, 26] },
  { pos: [12, 2.4, 0], look: [60, 6, 4] },
  { pos: [0, 2.4, 12], look: [-6, 6, 60] },
];
/** Views that show open sky, for the haze grid. */
const SKY_VIEWS = [VIEWS[0], VIEWS[12], VIEWS[13]];
const TURBIDITY = [5.3, 7, 9, 12, 16];
const MURK = [0.46, 0.6, 0.75, 0.9];

/** How far toward the panorama's brightness each key moves (worldlabs-skins.ts blendGoal). */
const LUMA_WEIGHT = 0.5;

/**
 * Style goals, 0..255 sRGB as rendered, that replace the blended goal for the
 * keys that carry the World Labs look. The panorama bakes its own shadows and
 * dust into these surfaces, so a pure match leaves them dingy; here the paint
 * is fresher than the panorama: crisp white pickets, bright pastel siding, a
 * light warm-grey road with pale concrete, olive lawns, a school-bus yellow
 * and a red truck. Rendered medians include shade, so these sit a little
 * under the sunlit colour.
 */
const STYLE = {
  "ac-white": [222, 216, 200],
  "ac-fence": [226, 220, 204],
  "ac-yellow": [222, 192, 112],
  "ac-cream": [222, 204, 160],
  "ac-green": [150, 196, 162],
  "ac-blue": [170, 204, 178],
  "ac-sky": [176, 196, 200],
  "ac-road": [124, 110, 94],
  "ac-concrete": [192, 184, 168],
  "ac-grass": [100, 104, 48],
  "ac-hedge": [74, 82, 38],
  // The bus flank sits in shade in the calibration shot and red clips at the tint cap, so the goal keeps the hue at a reachable level.
  "ac-bus": [178, 122, 22],
  "ac-red": [160, 34, 28],
};
/** Keys repainted fresh under the skin (SkinPalette.clean). */
const CLEAN = [
  "ac-white",
  "ac-fence",
  "ac-yellow",
  "ac-cream",
  "ac-green",
  "ac-blue",
  "ac-sky",
  "ac-concrete",
  "ac-line",
];
/** Painted vehicles: far less metal and a satin coat (SkinPalette.finish). */
const FINISH = {
  "ac-bus": { metalness: 0.15, roughness: [1, 0.1, 0.34] },
  "ac-red": { metalness: 0.15, roughness: [1, 0.1, 0.34] },
  "ac-car": { metalness: 0.35, roughness: [1, 0.06, 0.26] },
};

const KEYS = Object.keys(LABELS);
const fmt = (c) => `[${c.map((v) => Math.round(v)).join(", ")}]`;

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn("bun", ["server-dev.ts"], {
    cwd: exampleRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(url)).ok) return { url, close: () => child.kill() };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill();
  throw new Error("dev server did not start");
}

/** Panorama pixels per labelled rectangle, decoded in the page. */
async function samplePano(page) {
  const rects = [...KEYS.flatMap((k) => LABELS[k].map((l) => l[1])), ...SKY.map((l) => l[1])];
  const blobs = await page.evaluate(
    async ({ src, rects }) => {
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext("2d");
      g.drawImage(bitmap, 0, 0);
      return rects.map(([x0, y0, x1, y1]) => {
        const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let s = "";
        for (let i = 0; i < d.length; i += 4) s += String.fromCharCode(d[i], d[i + 1], d[i + 2]);
        return globalThis.btoa(s);
      });
    },
    { src: PANO, rects },
  );
  const px = blobs.map((b) => [...Buffer.from(b, "base64")]);
  let at = 0;
  const targets = {};
  for (const key of KEYS) {
    const pool = [];
    for (let i = 0; i < LABELS[key].length; i++) pool.push(...px[at++]);
    const band = BANDS[key] ?? [0.15, 0.85];
    targets[key] = {
      srgb: robustColor(pool, band[0], band[1]).map(Math.round),
      samples: pool.length / 3,
      from: LABELS[key].map((l) => l[0]),
    };
  }
  const skyPool = px.slice(at).flat();
  const sky = robustColor(skyPool).map(Math.round);
  return { targets, sky };
}

async function pose(page, view) {
  await page.evaluate((v) => {
    const e = window.__ENGINE__;
    if (v.shot) window.__APPLY_SHOT__(v.shot);
    else {
      e.input.frozen = true;
      e.input.enabled = false;
      const player = e.ctx.peek("player");
      player?.setControlEnabled?.(false);
      e.camera.position.fromArray(v.pos);
      e.camera.lookAt(v.look[0], v.look[1], v.look[2]);
      e.camera.fov = 70;
      e.camera.updateProjectionMatrix();
      player?.teleport?.(e.camera.position, e.camera.rotation);
    }
    if (e.ctx.viewScene) e.ctx.viewScene.visible = false;
    for (const n of document.body.children)
      if (n.tagName !== "CANVAS") n.style.visibility = "hidden";
  }, view);
  await page.evaluate(() => window.__PUMP__(24));
}

/** One view: shaded screenshot pixels grouped by material id (0 is sky). */
async function measureView(page) {
  const png = PNG.sync.read(await page.screenshot());
  const mask = await page.evaluate((keys) => window.__MATERIAL_MASK__(keys), ["__sky__", ...KEYS]);
  if (mask.error) throw new Error(mask.error);
  if (mask.width !== png.width || mask.height !== png.height)
    throw new Error(`mask ${mask.width}x${mask.height} vs shot ${png.width}x${png.height}`);
  return pixelsById(png.data, Buffer.from(mask.ids, "base64"), png.width, png.height);
}

/** Pooled rendered colour per key (and the sky) across `views`. */
async function measure(page, views) {
  const pools = new Map();
  for (const v of views) {
    await pose(page, v);
    for (const [id, px] of await measureView(page)) {
      let pool = pools.get(id);
      if (!pool) pools.set(id, (pool = []));
      // Cap each view's contribution so one close-up does not swamp the pool.
      const stride = Math.max(1, Math.floor(px.length / 3 / 20000));
      for (let i = 0; i < px.length; i += 3 * stride) pool.push(px[i], px[i + 1], px[i + 2]);
    }
  }
  const out = { sky: robustColor(pools.get(0) ?? []), keys: {}, counts: {} };
  KEYS.forEach((key, i) => {
    // id 1 is the unused "__sky__" placeholder, keys start at 2.
    const pool = pools.get(i + 2) ?? [];
    out.keys[key] = robustColor(pool);
    out.counts[key] = pool.length / 3;
  });
  return out;
}

async function setTints(page, tints) {
  await page.evaluate((tints) => {
    const A = window.__ENGINE__.ctx.peek("world").A;
    for (const [key, [r, g, b]] of Object.entries(tints))
      A.mat(key)?.userData?.owUniforms?.owTintCol?.value.setRGB(r, g, b);
  }, tints);
}

async function readTints(page, keys) {
  return page.evaluate((keys) => {
    const A = window.__ENGINE__.ctx.peek("world").A;
    const out = {};
    for (const key of keys) {
      const c = A.mat(key)?.userData?.owUniforms?.owTintCol?.value;
      if (c) out[key] = [c.r, c.g, c.b];
    }
    return out;
  }, keys);
}

async function swatches(page, rows) {
  const b64 = await page.evaluate((rows) => {
    const cw = 120,
      rh = 34,
      lw = 150;
    const c = document.createElement("canvas");
    c.width = lw + cw * 3;
    c.height = rh * (rows.length + 1);
    const g = c.getContext("2d");
    g.fillStyle = "#202020";
    g.fillRect(0, 0, c.width, c.height);
    g.font = "13px sans-serif";
    g.fillStyle = "#ddd";
    g.fillText("key", 8, 22);
    g.fillText("panorama", lw + 8, 22);
    g.fillText("goal", lw + cw + 8, 22);
    g.fillText("rendered", lw + cw * 2 + 8, 22);
    rows.forEach(([name, a, goal, b], i) => {
      const y = rh * (i + 1);
      g.fillStyle = "#ddd";
      g.fillText(name, 8, y + 22);
      g.fillStyle = `rgb(${a.join(",")})`;
      g.fillRect(lw, y + 2, cw - 4, rh - 4);
      g.fillStyle = `rgb(${goal.join(",")})`;
      g.fillRect(lw + cw, y + 2, cw - 4, rh - 4);
      g.fillStyle = b ? `rgb(${b.join(",")})` : "#000";
      g.fillRect(lw + cw * 2, y + 2, cw - 4, rh - 4);
    });
    return c.toDataURL("image/png").split(",")[1];
  }, rows);
  await writeFile(resolve(outDir, "swatches.png"), Buffer.from(b64, "base64"));
}

async function open(skin) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto(`${server.url}/?capture=1&lockstep=1&skin=${skin}`);
  await page.waitForFunction("window.__READY__ === true && !!window.__ENGINE__", null, {
    timeout: 180000,
  });
  return page;
}

const server = await startServer();
const browser = await launchBrowser(values.channel, values.headed);
try {
  // The classic palette as rendered: the exposure reference and the starting tints.
  const classic = await open("classic");
  const { targets, sky: skyTarget } = await samplePano(classic);
  const classicTints = await readTints(classic, KEYS);
  const classicSeen = (await measure(classic, VIEWS)).keys;
  await classic.close();
  const exposure = exposureBetween(
    classicSeen,
    Object.fromEntries(KEYS.map((k) => [k, targets[k].srgb])),
  );
  const goal = Object.fromEntries(
    KEYS.map((k) => [
      k,
      STYLE[k] ?? blendGoal(targets[k].srgb, classicSeen[k], exposure, LUMA_WEIGHT),
    ]),
  );
  console.info("sky target", fmt(skyTarget), "exposure", exposure.toFixed(3));
  for (const key of KEYS)
    console.info(
      key.padEnd(12),
      "panorama",
      fmt(targets[key].srgb),
      "goal",
      fmt(goal[key]),
      "classic",
      classicSeen[key] ? fmt(classicSeen[key]) : "unseen",
    );

  const page = await open("worldlabs");
  const previous = parsePalette(JSON.parse(await readFile(palettePath, "utf8")));
  // The page builds its materials from the committed palette, so a change to
  // the painted, clean or finish lists only shows on the next pass.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (
    !same(PAINTED, previous.painted) ||
    !same(CLEAN, previous.clean) ||
    !same(FINISH, previous.finish)
  )
    console.warn("palette.json lists differ from this tool; rerun once more after this pass");

  // Sky first: the haze also tints the ambient light that the albedo sees.
  let sky = previous.sky;
  if (!values["skip-sky"]) {
    let best = null;
    for (const turbidity of TURBIDITY)
      for (const horizonMurk of MURK) {
        await page.evaluate((w) => window.__ENGINE__.ctx.peek("sky").setWeather(w), {
          turbidity,
          horizonMurk,
        });
        await page.evaluate(() => window.__PUMP__(4));
        const m = await measure(page, SKY_VIEWS);
        const err = m.sky ? colorError(m.sky, skyTarget) : Infinity;
        console.info(
          `sky t=${turbidity} murk=${horizonMurk} -> ${fmt(m.sky ?? [0, 0, 0])} err ${err.toFixed(1)}`,
        );
        if (!best || err < best.err) best = { err, turbidity, horizonMurk };
      }
    sky = { turbidity: best.turbidity, horizonMurk: best.horizonMurk };
    console.info("sky pick", sky, "err", best.err.toFixed(1));
  }
  if (sky) await page.evaluate((w) => window.__ENGINE__.ctx.peek("sky").setWeather(w), sky);

  // Start from the classic colours so a rerun does not depend on the last one.
  let tints = { ...classicTints };
  await setTints(page, tints);
  let m = await measure(page, VIEWS);
  for (let it = 0; it < iterations; it++) {
    const next = {};
    let total = 0,
      n = 0;
    for (const key of KEYS) {
      const got = m.keys[key];
      if (!got || m.counts[key] < 40 || !tints[key]) continue;
      total += colorError(got, goal[key]);
      n++;
      next[key] = stepTint(tints[key], goal[key], got);
    }
    console.info(
      `iteration ${it}: mean error ${(total / Math.max(1, n)).toFixed(1)} over ${n} keys`,
    );
    tints = { ...tints, ...next };
    await setTints(page, tints);
    m = await measure(page, VIEWS);
  }

  const achieved = {};
  const rows = [];
  let total = 0,
    n = 0;
  for (const key of KEYS) {
    const got = m.keys[key];
    const err = got ? colorError(got, goal[key]) : NaN;
    if (got) {
      achieved[key] = got.map(Math.round);
      total += err;
      n++;
    }
    rows.push([key, targets[key].srgb, goal[key], achieved[key] ?? null]);
    console.info(
      key.padEnd(12),
      "goal",
      fmt(goal[key]),
      "got",
      got ? fmt(got) : "unseen",
      `px ${m.counts[key]}`,
      got ? `err ${err.toFixed(1)}` : "",
    );
  }
  console.info(`final mean error ${(total / Math.max(1, n)).toFixed(1)} over ${n} keys`);
  if (m.sky) rows.push(["sky", skyTarget, skyTarget, m.sky.map(Math.round)]);

  const round = (c) => c.map((v) => Math.round(v * 1e4) / 1e4);
  const palette = {
    version: 1,
    source:
      "tools/worldlabs-skins.mjs: labelled rectangles on assets/worldlabs/culdesac_pano.jpg, tints calibrated against the rendered procedural map",
    targets,
    tints: Object.fromEntries(
      KEYS.filter((k) => tints[k] && achieved[k]).map((k) => [k, round(tints[k])]),
    ),
    painted: PAINTED,
    clean: CLEAN,
    finish: FINISH,
    goals: Object.fromEntries(KEYS.map((k) => [k, goal[k].map(Math.round)])),
    sky,
    exposure: Math.round(exposure * 1e4) / 1e4,
    lumaWeight: LUMA_WEIGHT,
    achieved,
  };
  parsePalette(palette);
  // Swatches first: writing palette.json makes the dev server reload the page.
  await swatches(page, rows);
  await writeFile(palettePath, `${JSON.stringify(palette, null, 2)}\n`);
  console.info("wrote", palettePath);
} finally {
  await browser.close();
  server.close();
}
