import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  BACKDROP_WORLD,
  DEFAULT_CROP_MARGIN,
  insideCropBounds,
  normalizeBackdropMode,
  parseWorldMeta,
  pickSplatUrl,
  placeBackdrop,
} from "../src/world/backdrop-config.ts";
import type { BackdropWorld } from "../src/world/backdrop-config.ts";
import { MAP_BOUNDS } from "../src/world/atomic-culdesac-layout.ts";

test("a configured backdrop world points at files that exist", () => {
  if (BACKDROP_WORLD === null) return;
  const root = new URL("..", import.meta.url).pathname;
  for (const url of [
    BACKDROP_WORLD.splatHigh,
    BACKDROP_WORLD.splatLow,
    BACKDROP_WORLD.pano,
    BACKDROP_WORLD.meta,
  ]) {
    expect(existsSync(root + url.replace(/^\//, ""))).toBe(true);
  }
});

test("backdrop mode coerces untrusted input to a valid mode", () => {
  expect(normalizeBackdropMode("splat")).toBe("splat");
  expect(normalizeBackdropMode("pano")).toBe("pano");
  expect(normalizeBackdropMode("off")).toBe("off");
  expect(normalizeBackdropMode(undefined)).toBe("off");
  expect(normalizeBackdropMode("nonsense")).toBe("off");
  expect(normalizeBackdropMode(42)).toBe("off");
  expect(normalizeBackdropMode("nonsense", "pano")).toBe("pano");
});

test("splat url picks the light file only on the low preset", () => {
  const world: BackdropWorld = {
    splatHigh: "/w_500k.spz",
    splatLow: "/w_150k.spz",
    pano: "/w.jpg",
    meta: "/world.json",
  };
  expect(pickSplatUrl(world, "low")).toBe("/w_150k.spz");
  expect(pickSplatUrl(world, "medium")).toBe("/w_500k.spz");
  expect(pickSplatUrl(world, "high")).toBe("/w_500k.spz");
  expect(pickSplatUrl(world, "ultra")).toBe("/w_500k.spz");
});

test("world.json parses metric scale and ground offset, with safe fallbacks", () => {
  const meta = parseWorldMeta({ metric_scale_factor: 9.989578, ground_plane_offset: 5.875422 });
  expect(meta.metricScaleFactor).toBeCloseTo(9.989578, 5);
  expect(meta.groundPlaneOffset).toBeCloseTo(5.875422, 5);

  const bad = parseWorldMeta({ metric_scale_factor: "x", ground_plane_offset: null });
  expect(bad.metricScaleFactor).toBe(1);
  expect(bad.groundPlaneOffset).toBe(0);
  expect(parseWorldMeta(null).metricScaleFactor).toBe(1);
});

test("placement scales by the metric factor and flips Y-down captures upright", () => {
  const meta = { metricScaleFactor: 10, groundPlaneOffset: 5 };
  const placed = placeBackdrop(meta);
  expect(placed.scale).toBe(10);
  expect(placed.rotation[0]).toBeCloseTo(Math.PI, 6);
  expect(placed.position[1]).toBe(5);

  const noFlip = placeBackdrop(meta, { flipToYUp: false });
  expect(noFlip.rotation[0]).toBe(0);
  expect(noFlip.position[1]).toBe(-5);
});

test("manual transform offsets add on top of the metric placement", () => {
  const meta = { metricScaleFactor: 4, groundPlaneOffset: 2 };
  const placed = placeBackdrop(meta, {
    transform: { position: [1, 3, -2], rotation: [0.1, 0.2, 0.3], scale: 2 },
  });
  expect(placed.scale).toBe(8);
  expect(placed.position).toEqual([1, 5, -2]);
  expect(placed.rotation[0]).toBeCloseTo(Math.PI + 0.1, 6);
  expect(placed.rotation[1]).toBeCloseTo(0.2, 6);
  expect(placed.rotation[2]).toBeCloseTo(0.3, 6);
});

test("crop hides the play area and its margin, but not the distance", () => {
  const margin = DEFAULT_CROP_MARGIN;
  // Centre of the map is cropped (hidden from the backdrop).
  expect(insideCropBounds(0, 0, MAP_BOUNDS, margin)).toBe(true);
  // Just inside the margin band around the bounds is still cropped.
  expect(insideCropBounds(MAP_BOUNDS.maxX + margin - 1, 0, MAP_BOUNDS, margin)).toBe(true);
  // Well beyond the bounds plus margin is kept: this is the distant scenery.
  expect(insideCropBounds(MAP_BOUNDS.maxX + margin + 50, 0, MAP_BOUNDS, margin)).toBe(false);
  expect(insideCropBounds(0, MAP_BOUNDS.minZ - margin - 50, MAP_BOUNDS, margin)).toBe(false);
});
