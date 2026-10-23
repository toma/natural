import { expect, test } from "bun:test";
import {
  HORIZON_RECIPE,
  PANO_SIZE,
  WORLDLABS_HORIZON,
  bridgeSpan,
  cleanStrip,
  cloneSpan,
  ghostRange,
  hazeBase,
  horizonScale,
  horizonYaw,
  parseHorizon,
  ridgeAlpha,
  rowElevation,
  topLuminance,
  wrap01,
} from "../src/world/worldlabs-horizon.ts";
import type { HorizonRecipe, Rgba } from "../src/world/worldlabs-horizon.ts";

/** A solid image of one colour. */
function solid(width: number, height: number, rgba: [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

const px = (img: Rgba, x: number, y: number) =>
  Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

function setPx(img: Rgba, x: number, y: number, rgba: number[]) {
  img.data.set(rgba, (y * img.width + x) * 4);
}

const meta = {
  version: 1,
  url: "/h.png",
  size: [10, 4],
  elevation: [-0.01, 0.2],
  sunU: 0.25,
  skyLuminance: 0.5,
};

test("parseHorizon validates the strip metadata and the shipped strip parses", () => {
  expect(parseHorizon(meta).sunU).toBe(0.25);
  const bad: unknown[] = [
    null,
    { ...meta, version: 2 },
    { ...meta, url: "" },
    { ...meta, size: [0, 4] },
    { ...meta, elevation: [0.2, 0.1] },
    { ...meta, sunU: 1 },
    { ...meta, skyLuminance: 0 },
  ];
  for (const b of bad) expect(() => parseHorizon(b)).toThrow();
  expect(WORLDLABS_HORIZON.size[0]).toBe(PANO_SIZE[0]);
  expect(WORLDLABS_HORIZON.elevation[0]).toBeLessThan(0);
  expect(WORLDLABS_HORIZON.elevation[1]).toBeGreaterThan(0);
});

test("row elevation, yaw and scale follow the panorama geometry", () => {
  expect(rowElevation(0, 100)).toBeCloseTo(Math.PI / 2);
  expect(rowElevation(50, 100)).toBeCloseTo(0);
  expect(wrap01(-0.25)).toBeCloseTo(0.75);
  expect(wrap01(1.5)).toBeCloseTo(0.5);
  // A sun along +x sits at u = 0.5 on the dome, so the yaw moves sunU there.
  expect(horizonYaw({ x: 1, z: 0 }, 0.2)).toBeCloseTo(0.7);
  const m = parseHorizon(meta);
  expect(horizonScale(m)).toBeCloseTo(2);
  expect(horizonScale(m, 1.5)).toBeCloseTo(3);
  expect(horizonScale(m, -1)).toBe(0);
});

test("bridgeSpan and cloneSpan replace columns and reject bad spans", () => {
  const img = solid(6, 2, [0, 0, 0, 255]);
  for (let y = 0; y < 2; y++) {
    setPx(img, 0, y, [0, 0, 0, 255]);
    setPx(img, 5, y, [250, 250, 250, 255]);
    setPx(img, 2, y, [255, 0, 0, 255]);
  }
  bridgeSpan(img, [1, 5]);
  expect(px(img, 1, 0)[0]).toBe(50);
  expect(px(img, 4, 1)[0]).toBe(200);
  expect(() => bridgeSpan(img, [0, 3])).toThrow();
  expect(() => bridgeSpan(img, [3, 3])).toThrow();

  const dst = solid(6, 1, [0, 0, 0, 255]);
  const src = solid(6, 1, [200, 100, 50, 255]);
  cloneSpan(dst, src, [0, 4], 2, 2);
  expect(px(dst, 0, 0)[0]).toBe(100);
  expect(px(dst, 1, 0)[0]).toBe(200);
  cloneSpan(dst, src, [4, 6], 0, 0);
  expect(px(dst, 5, 0)).toEqual([200, 100, 50, 255]);
  expect(() => cloneSpan(dst, src, [0, 4], 4, 0)).toThrow();
});

test("hazeBase fills the base rows opaque from the rows above", () => {
  const img = solid(4, 10, [100, 80, 60, 0]);
  hazeBase(img, 6, 1, 2);
  for (let y = 6; y < 10; y++) expect(px(img, 2, y)).toEqual([100, 80, 60, 255]);
  expect(() => hazeBase(img, 1, 1, 2)).toThrow();
  expect(() => hazeBase(img, 11, 1, 2)).toThrow();
});

const recipe: HorizonRecipe = {
  ...HORIZON_RECIPE,
  skyRows: [0, 2],
  skyRadius: 1,
  ridge: [0.07, 0.22],
  ghost: [],
};

test("ridgeAlpha keeps a dark ridge opaque and cuts the bright sky out", () => {
  const img = solid(4, 10, [230, 225, 210, 255]);
  // A ridge rising from row 5 on column 1 and row 7 elsewhere.
  for (let x = 0; x < 4; x++)
    for (let y = x === 1 ? 5 : 7; y < 10; y++) setPx(img, x, y, [120, 80, 50, 255]);
  ridgeAlpha(img, recipe, 9);
  expect(px(img, 1, 0)[3]).toBe(0);
  expect(px(img, 1, 5)[3]).toBe(255);
  expect(px(img, 0, 5)[3]).toBe(0);
  expect(px(img, 0, 8)[3]).toBe(255);
  // Cut-out sky takes the ridge colour so filtering never bleeds sky in.
  expect(px(img, 0, 0).slice(0, 3)).toEqual([120, 80, 50]);
  expect(() => ridgeAlpha(img, { ...recipe, skyRows: [3, 2] }, 9)).toThrow();
});

test("ghostRange lays a lower hazed copy behind open sky only", () => {
  const img = solid(8, 10, [0, 0, 0, 0]);
  // Source columns 4..8: a ridge from row 4 down, haze base colour on row 9.
  for (let x = 4; x < 8; x++) {
    for (let y = 4; y < 10; y++) setPx(img, x, y, [200, 100, 0, 255]);
    setPx(img, x, 9, [100, 100, 100, 255]);
  }
  // Something already solid in front on column 1.
  for (let y = 0; y < 10; y++) setPx(img, 1, y, [10, 20, 30, 255]);
  ghostRange(img, { span: [0, 4], from: [4, 8], scale: 0.5, haze: 0.5, feather: 0 }, 10);
  // Squashed by half toward row 10: the ridge top moves from row 4 to row 7.
  expect(px(img, 0, 6)[3]).toBe(0);
  expect(px(img, 0, 8)).toEqual([150, 100, 50, 255]);
  // The strip's own solid pixels stay in front.
  expect(px(img, 1, 8)).toEqual([10, 20, 30, 255]);
  // A feathered copy fades in at its ends.
  const soft = solid(8, 10, [0, 0, 0, 0]);
  for (let x = 4; x < 8; x++) for (let y = 0; y < 10; y++) setPx(soft, x, y, [200, 100, 0, 255]);
  ghostRange(soft, { span: [0, 4], from: [4, 8], scale: 1, haze: 0, feather: 4 }, 10);
  expect(px(soft, 0, 5)[3]).toBeLessThan(px(soft, 1, 5)[3]!);
  expect(px(soft, 1, 5)[3]).toBeGreaterThan(0);
  const g = {
    span: [0, 4] as [number, number],
    from: [4, 8] as [number, number],
    scale: 1,
    haze: 0,
    feather: 0,
  };
  expect(() => ghostRange(img, { ...g, span: [4, 4] }, 10)).toThrow();
  expect(() => ghostRange(img, { ...g, from: [6, 9] }, 10)).toThrow();
  expect(() => ghostRange(img, { ...g, scale: 0 }, 10)).toThrow();
  expect(() => ghostRange(img, g, 11)).toThrow();
});

test("cleanStrip runs the whole recipe on a copy and topLuminance reads the sky", () => {
  const strip = solid(40, 20, [230, 225, 210, 255]);
  for (let x = 0; x < 40; x++) for (let y = 12; y < 20; y++) setPx(strip, x, y, [120, 80, 50, 255]);
  const r: HorizonRecipe = {
    rows: [100, 120],
    baseRow: 116,
    bridge: [[4, 6]],
    clone: [{ span: [10, 14], from: 20 }],
    feather: 1,
    baseBlur: 2,
    skyRows: [0, 4],
    skyRadius: 2,
    ridge: [0.07, 0.22],
    ghost: [{ span: [0, 8], from: [20, 28], scale: 0.6, haze: 0.3, feather: 2 }],
  };
  const out = cleanStrip(strip, r);
  expect(out.data).not.toBe(strip.data);
  expect(px(strip, 5, 0)[3]).toBe(255);
  expect(px(out, 30, 0)[3]).toBe(0);
  expect(px(out, 30, 18)[3]).toBe(255);
  expect(topLuminance(strip, 4)).toBeGreaterThan(topLuminance(out, 20) * 0.5);
  expect(topLuminance(solid(2, 2, [255, 255, 255, 255]), 2)).toBeCloseTo(1);
  expect(topLuminance(strip, 0)).toBe(0);
});
