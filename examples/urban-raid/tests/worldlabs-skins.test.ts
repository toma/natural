import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SKIN_MODE,
  MAX_TINT,
  WORLDLABS_SKIN,
  blendGoal,
  colorError,
  exposeTarget,
  exposureBetween,
  linearToHex,
  linearToSrgb,
  luminance,
  normalizeSkinMode,
  lightingPresetFor,
  paletteFor,
  parsePalette,
  pixelsById,
  rectPixels,
  rgb8ToLinear,
  robustColor,
  skinClean,
  skinFinish,
  skinTint,
  srgbToLinear,
  stepTint,
} from "../src/world/worldlabs-skins.ts";
import type { Rgb } from "../src/world/worldlabs-skins.ts";

const root = new URL("..", import.meta.url).pathname;
const culdesac = readFileSync(`${root}src/world/atomic-culdesac.js`, "utf8");
/** key -> kind for every `surface("ac-x", "#hex", "kind")` call in the map. */
const surfaces = new Map(
  [...culdesac.matchAll(/surface\("(ac-[a-z]+)", "#[0-9a-f]{6}", "([a-z]+)"/g)].map((m) => [
    m[1] ?? "",
    m[2] ?? "",
  ]),
);

const minimal = {
  version: 1,
  targets: { "ac-bus": { srgb: [200, 150, 40], samples: 10, from: ["bus"] } },
  tints: { "ac-bus": [1, 0.5, 0.1] },
  painted: [],
  sky: null,
};

test("the skin defaults to the World Labs palette and the classic mode turns it off", () => {
  expect(DEFAULT_SKIN_MODE).toBe("worldlabs");
  expect(normalizeSkinMode("classic")).toBe("classic");
  expect(normalizeSkinMode("worldlabs")).toBe("worldlabs");
  expect(normalizeSkinMode("nonsense")).toBe("worldlabs");
  expect(normalizeSkinMode(null, "classic")).toBe("classic");
  expect(paletteFor("classic")).toBeNull();
  expect(paletteFor("worldlabs")).toBe(WORLDLABS_SKIN);
  expect(skinTint(null, "ac-bus")).toBeNull();
});

test("parsePalette fills defaults and rejects malformed palettes", () => {
  const p = parsePalette(minimal);
  expect(p.exposure).toBe(1);
  expect(p.source).toBe("");
  expect(p.achieved).toEqual({});
  expect(skinTint(p, "ac-bus")).toEqual([1, 0.5, 0.1]);
  expect(skinTint(p, "ac-road")).toBeNull();
  const bad: unknown[] = [
    null,
    { ...minimal, version: 2 },
    { ...minimal, exposure: 0 },
    { ...minimal, tints: 3 },
    { ...minimal, tints: { "ac-bus": [1, 1, MAX_TINT + 1] } },
    { ...minimal, tints: { "ac-bus": [1, -1, 1] } },
    { ...minimal, targets: null },
    { ...minimal, targets: { "ac-bus": { srgb: [1, 2], samples: 1, from: [] } } },
    { ...minimal, painted: [1] },
    { ...minimal, sky: { turbidity: 2 } },
    { ...minimal, achieved: { "ac-bus": "red" } },
  ];
  for (const b of bad) expect(() => parsePalette(b)).toThrow();
  expect(
    parsePalette({
      ...minimal,
      exposure: 0.5,
      source: "x",
      sky: { turbidity: 2, horizonMurk: 0.4 },
    }),
  ).toMatchObject({ exposure: 0.5, source: "x", sky: { turbidity: 2, horizonMurk: 0.4 } });
});

test("clean and finish lists parse, default empty, and reject bad entries", () => {
  const p = parsePalette(minimal);
  expect(p.clean).toEqual([]);
  expect(p.finish).toEqual({});
  expect(skinClean(p, "ac-bus")).toBe(false);
  expect(skinFinish(p, "ac-bus")).toBeNull();
  expect(skinClean(null, "ac-bus")).toBe(false);
  expect(skinFinish(null, "ac-bus")).toBeNull();
  const q = parsePalette({
    ...minimal,
    clean: ["ac-white"],
    finish: { "ac-bus": { metalness: 0.2, roughness: [1, 0.1, 0.3] }, "ac-car": {} },
  });
  expect(skinClean(q, "ac-white")).toBe(true);
  expect(skinFinish(q, "ac-bus")).toEqual({ metalness: 0.2, roughness: [1, 0.1, 0.3] });
  const bad: unknown[] = [
    { ...minimal, clean: "ac-white" },
    { ...minimal, clean: [3] },
    { ...minimal, finish: [] },
    { ...minimal, finish: { "ac-bus": 1 } },
    { ...minimal, finish: { "ac-bus": { metalness: 2 } } },
    { ...minimal, finish: { "ac-bus": { roughness: [1, 2] } } },
  ];
  for (const b of bad) expect(() => parsePalette(b)).toThrow();
});

test("the committed palette repaints the siding and pickets and calms the vehicles", () => {
  for (const k of ["ac-white", "ac-fence", "ac-yellow", "ac-concrete"])
    expect(skinClean(WORLDLABS_SKIN, k)).toBe(true);
  expect(skinClean(WORLDLABS_SKIN, "ac-road")).toBe(false);
  for (const k of ["ac-bus", "ac-red"])
    expect(skinFinish(WORLDLABS_SKIN, k)?.metalness ?? 1).toBeLessThan(0.5);
  // Repainting only touches keys the map really has.
  for (const k of [...WORLDLABS_SKIN.clean, ...Object.keys(WORLDLABS_SKIN.finish)])
    expect(surfaces.has(k)).toBe(true);
});

test("the skinned procedural map wears the worldlabs lighting preset", () => {
  expect(lightingPresetFor("procedural", "worldlabs")).toBe("worldlabs");
  expect(lightingPresetFor("procedural", undefined)).toBe("worldlabs");
  expect(lightingPresetFor("procedural", "classic")).toBe("desert-golden-hour");
  expect(lightingPresetFor("worldlabs", "worldlabs")).toBe("desert-golden-hour");
});

test("the committed palette only recolours existing map surfaces and keeps their surface tags", () => {
  expect(surfaces.size).toBeGreaterThan(30);
  const keys = Object.keys(WORLDLABS_SKIN.tints);
  expect(keys.length).toBeGreaterThan(10);
  for (const k of keys) {
    expect(surfaces.has(k)).toBe(true);
    expect(WORLDLABS_SKIN.targets[k]).toBeDefined();
  }
  // Painting a key swaps its base texture to plaster but only within the
  // "wood" kind, whose surface tag stays wood for footsteps and impacts.
  for (const k of WORLDLABS_SKIN.painted) expect(surfaces.get(k)).toBe("wood");
  // The classic surface table is untouched by the skin (physics and audio read it).
  expect(surfaces.get("ac-grass")).toBe("grass");
  expect(surfaces.get("ac-road")).toBe("road");
  expect(surfaces.get("ac-bus")).toBe("metal");
  expect(WORLDLABS_SKIN.exposure).toBeGreaterThan(0);
});

test("sRGB conversions round-trip and format hex", () => {
  for (const v of [0, 0.002, 0.04, 0.2, 0.5, 1])
    expect(srgbToLinear(linearToSrgb(v))).toBeCloseTo(v, 6);
  expect(linearToSrgb(-1)).toBe(0);
  expect(rgb8ToLinear([255, 0, 128])[0]).toBeCloseTo(1, 6);
  expect(linearToHex([1, 0, 2])).toBe("#ff00ff");
  expect(luminance([1, 1, 1])).toBeCloseTo(1, 6);
});

test("robustColor trims by luma and takes channel medians", () => {
  expect(robustColor([])).toBeNull();
  const px = [0, 0, 0, 100, 50, 10, 110, 60, 20, 120, 70, 30, 255, 255, 255];
  expect(robustColor(px, 0.2, 0.8)).toEqual([110, 60, 20]);
  expect(robustColor([1, 2, 3, 5, 6, 7], 0, 1)).toEqual([3, 4, 5]);
  // A bright band keeps the pickets and drops the dark lawn between them.
  const pickets = [20, 40, 10, 20, 40, 10, 20, 40, 10, 230, 230, 225, 232, 232, 228];
  expect(robustColor(pickets, 0.6, 1)).toEqual([231, 231, 226.5]);
});

test("rectPixels and pixelsById gather pixels, dropping edges between ids", () => {
  const w = 4;
  const h = 4;
  const rgba = new Uint8Array(w * h * 4).map((_, i) => i % 256);
  const r = rectPixels(rgba, w, [1, 1, 3, 2]);
  expect(r).toEqual([20, 21, 22, 24, 25, 26]);
  const ids = new Uint8Array(w * h).fill(2);
  let groups = pixelsById(rgba, ids, w, h);
  expect([...groups.keys()]).toEqual([2]);
  expect(groups.get(2)?.length).toBe(4 * 3);
  ids[0] = 1;
  groups = pixelsById(rgba, ids, w, h);
  expect(groups.get(2)?.length).toBe(3 * 3);
  expect(groups.has(1)).toBe(false);
});

test("stepTint moves toward the target, clamped per step and overall", () => {
  const up = stepTint([1, 1, 1], [200, 100, 100], [100, 100, 200], 1, 10);
  expect(up[0]).toBeGreaterThan(1);
  expect(up[1]).toBeCloseTo(1, 6);
  expect(up[2]).toBeLessThan(1);
  expect(stepTint([1, 1, 1], [255, 255, 255], [1, 1, 1])).toEqual([3, 3, 3]);
  expect(stepTint([MAX_TINT, 1, 0.006], [255, 0, 0], [10, 255, 255], 1, 100)).toEqual([
    MAX_TINT,
    0.01,
    0.005,
  ]);
  expect(colorError([0, 0, 0], [3, 6, 9])).toBe(6);
});

test("exposure is the median luminance ratio and scales targets", () => {
  expect(exposureBetween({}, { a: [10, 10, 10] })).toBe(1);
  const t: Rgb = [100, 100, 100];
  const bright = exposeTarget(t, 2);
  expect(exposureBetween({ a: bright, b: null, c: [0, 0, 0] }, { a: t, c: t })).toBeCloseTo(2, 1);
  expect(exposureBetween({ a: bright, b: t }, { a: t, b: t })).toBeCloseTo(Math.SQRT2, 1);
  expect(exposeTarget([200, 200, 200], 10)).toEqual([255, 255, 255]);
  expect(exposeTarget(t, 1)).toEqual(t);
});

test("blendGoal keeps the panorama hue at a brightness between classic and panorama", () => {
  const pano: Rgb = [40, 80, 20];
  expect(blendGoal(pano, null, 1.5)).toEqual(exposeTarget(pano, 1.5));
  expect(blendGoal([0, 0, 0], [100, 100, 100], 1)).toEqual([0, 0, 0]);
  expect(blendGoal(pano, [200, 200, 200], 1, 1)).toEqual(pano);
  const classic: Rgb = [150, 150, 150];
  const keep = blendGoal(pano, classic, 1, 0);
  const lin = rgb8ToLinear(keep);
  expect(luminance(lin)).toBeCloseTo(luminance(rgb8ToLinear(classic)), 2);
  // The chromaticity is the panorama's: channel ratios match in linear light.
  const p = rgb8ToLinear(pano);
  expect(lin[0] / lin[1]).toBeCloseTo(p[0] / p[1], 1);
  const half = luminance(rgb8ToLinear(blendGoal(pano, classic, 1, 0.5)));
  expect(half).toBeGreaterThan(luminance(p));
  expect(half).toBeLessThan(luminance(rgb8ToLinear(classic)));
});
