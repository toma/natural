import { expect, test } from "bun:test";
import { VEHICLES } from "../src/world/atomic-culdesac-layout.ts";
import { MODELS_BY_ID } from "../src/world/model-manifest.ts";
import {
  CLASSIC_PAINT,
  VEHICLE_MODELS,
  hueSat,
  recolorPaint,
  vehicleModelFor,
  vehicleModelRequest,
  vehiclePaint,
} from "../src/world/vehicle-models.ts";
import type { SkinPalette } from "../src/world/worldlabs-skins.ts";

const skin = { achieved: { "ac-bus": [163, 120, 24] } } as unknown as SkinPalette;

test("every vehicle spec names a manifest glb model and a layout vehicle", () => {
  const ids = new Set(VEHICLES.map((v) => v.id));
  for (const s of VEHICLE_MODELS) {
    expect(ids.has(s.vehicle)).toBe(true);
    expect(MODELS_BY_ID[s.model]?.format).toBe("glb");
    expect(s.scale).toBeGreaterThan(0);
    expect(s.minSat).toBeGreaterThan(0);
  }
});

test("vehicleModelFor finds specs and returns null for procedural-only vehicles", () => {
  expect(vehicleModelFor("bus")?.model).toBe("grab3d_school_bus");
  expect(vehicleModelFor("truck")).toBeNull();
});

test("vehiclePaint prefers the skin, then the classic hex, then grey", () => {
  expect(vehiclePaint("ac-bus", skin)).toEqual([163, 120, 24]);
  expect(vehiclePaint("ac-car", skin)).toEqual([...CLASSIC_PAINT["ac-car"]!]);
  expect(vehiclePaint("ac-car", null)).toEqual([...CLASSIC_PAINT["ac-car"]!]);
  expect(vehiclePaint("nope", null)).toEqual([128, 128, 128]);
});

test("vehicleModelRequest lays the model on the footprint with the spec yaw", () => {
  const spec = vehicleModelFor("bus")!;
  const r = vehicleModelRequest(spec, { id: "bus", x: 3, z: -4, yaw: 0.5, w: 2, d: 10 }, skin);
  expect(r).toMatchObject({ id: spec.model, x: 3, z: -4, y: spec.y, scale: spec.scale, far: 160 });
  expect(r.yaw).toBeCloseTo(0.5 + spec.yawOffset);
  expect(r.vehicle).toEqual({
    paint: [163, 120, 24],
    stockPaint: spec.stockPaint,
    minSat: spec.minSat,
  });
});

test("hueSat handles primaries, greys and black", () => {
  expect(hueSat(255, 0, 0)).toEqual([0, 1]);
  expect(hueSat(0, 255, 0)).toEqual([120, 1]);
  expect(hueSat(0, 0, 255)).toEqual([240, 1]);
  expect(hueSat(255, 0, 128)[0]).toBeGreaterThan(300);
  expect(hueSat(90, 90, 90)).toEqual([0, 0]);
  expect(hueSat(0, 0, 0)).toEqual([0, 0]);
});

test("recolorPaint repaints in-window paint and keeps trim, greys and far hues", () => {
  const stock: [number, number, number] = [244, 212, 116];
  const px = new Uint8ClampedArray([
    244,
    212,
    116,
    255, // stock paint: repainted to target
    122,
    106,
    58,
    255, // shaded paint: repainted at half brightness
    200,
    200,
    200,
    255, // grey chrome: kept
    40,
    60,
    220,
    255, // blue: outside hue window, kept
    244,
    236,
    214,
    255, // pale cream below minSat: kept
  ]);
  const frac = recolorPaint(px, stock, [100, 50, 20], { minSat: 0.3 });
  expect(frac).toBeCloseTo(2 / 5);
  expect([px[0], px[1], px[2]]).toEqual([100, 50, 20]);
  expect(px[4]!).toBeLessThan(60);
  expect([px[8], px[9], px[10]]).toEqual([200, 200, 200]);
  expect([px[12], px[13], px[14]]).toEqual([40, 60, 220]);
  expect([px[16], px[17], px[18]]).toEqual([244, 236, 214]);
});

test("recolorPaint blends at the edges of the hue and saturation windows", () => {
  const stock: [number, number, number] = [200, 100, 100]; // hue 0
  // hue ~22 deg: inside the 26 deg window but in the soft band
  const edge = new Uint8ClampedArray([200, 137, 100, 255]);
  recolorPaint(edge, stock, [0, 0, 200]);
  expect(edge[2]!).toBeGreaterThan(100);
  expect(edge[0]!).toBeGreaterThan(0);
  // saturation 0.08 with minSat 0.1: in the soft band, partly repainted
  const soft = new Uint8ClampedArray([200, 184, 184, 255]);
  expect(recolorPaint(soft, stock, [0, 0, 200], { minSat: 0.1 })).toBe(1);
  expect(soft[0]!).toBeLessThan(200);
  expect(soft[0]!).toBeGreaterThan(0);
  expect(recolorPaint(new Uint8ClampedArray(0), stock, [0, 0, 0])).toBe(0);
});
