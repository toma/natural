import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { parseWorldMeta } from "../src/world/backdrop-config.ts";
import {
  DEFAULT_MAP_MODE,
  SPAWN_RULES,
  WORLDLABS_MAP,
  WORLDLABS_PLAY_RADIUS,
  chooseSpawns,
  isWalkableProbe,
  normalizeMapMode,
  placePoint,
  resolveMapMode,
  spawnCandidates,
  worldLabsPlacement,
  worldLabsSplatUrl,
} from "../src/world/worldlabs-map-config.ts";
import type { GroundProbe, SpawnCandidate } from "../src/world/worldlabs-map-config.ts";

const root = new URL("..", import.meta.url).pathname;
const file = (url: string): string => root + url.replace(/^\//, "");
const meta = parseWorldMeta(JSON.parse(readFileSync(file(WORLDLABS_MAP.meta), "utf8")));

test("every World Labs map asset exists, the collider included", () => {
  for (const url of [
    WORLDLABS_MAP.splatHigh,
    WORLDLABS_MAP.splatLow,
    WORLDLABS_MAP.pano,
    WORLDLABS_MAP.meta,
    WORLDLABS_MAP.collider,
  ]) {
    expect(existsSync(file(url))).toBe(true);
  }
});

test("the collider is a binary glTF 2 file with at least one mesh", () => {
  const buf = readFileSync(file(WORLDLABS_MAP.collider));
  expect(buf.toString("ascii", 0, 4)).toBe("glTF");
  expect(buf.readUInt32LE(4)).toBe(2);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLength)) as {
    meshes?: unknown[];
  };
  expect(json.meshes?.length ?? 0).toBeGreaterThan(0);
});

test("map mode coerces untrusted input and defaults to the procedural map", () => {
  expect(DEFAULT_MAP_MODE).toBe("procedural");
  expect(normalizeMapMode("procedural")).toBe("procedural");
  expect(normalizeMapMode("worldlabs")).toBe("worldlabs");
  expect(normalizeMapMode("nope")).toBe("procedural");
  expect(normalizeMapMode("nope", "worldlabs")).toBe("worldlabs");
  expect(normalizeMapMode(undefined, "procedural")).toBe("procedural");
});

test("every run gets the procedural map unless ?map=worldlabs opts in", () => {
  expect(resolveMapMode({})).toBe("procedural");
  expect(resolveMapMode({ param: null, capture: false })).toBe("procedural");
  expect(resolveMapMode({ param: "worldlabs" })).toBe("worldlabs");
  expect(resolveMapMode({ param: "procedural" })).toBe("procedural");
  expect(resolveMapMode({ capture: true })).toBe("procedural");
  expect(resolveMapMode({ param: "worldlabs", capture: true })).toBe("worldlabs");
  expect(resolveMapMode({ param: "garbage", capture: true })).toBe("procedural");
});

test("low quality loads the 150k splat and everything else the 500k splat", () => {
  expect(worldLabsSplatUrl("low")).toBe(WORLDLABS_MAP.splatLow);
  expect(worldLabsSplatUrl("high")).toBe(WORLDLABS_MAP.splatHigh);
  expect(worldLabsSplatUrl("medium")).toBe(WORLDLABS_MAP.splatHigh);
});

test("placement scales to metres, flips Y up and puts the captured ground at y=0", () => {
  const placed = worldLabsPlacement(meta);
  expect(placed.scale).toBeCloseTo(meta.metricScaleFactor, 6);
  expect(placed.rotation[0]).toBeCloseTo(Math.PI, 6);
  // raw ground height in the Y-down capture frame
  const rawGround = meta.groundPlaneOffset / meta.metricScaleFactor;
  const ground = placePoint(placed, [0, rawGround, 0]);
  expect(ground[1]).toBeCloseTo(0, 5);
  // a raw point with smaller Y is higher up once flipped
  const above = placePoint(placed, [0, rawGround - 0.2, 0]);
  expect(above[1]).toBeCloseTo(0.2 * meta.metricScaleFactor, 4);
  // horizontal distances scale by the metric factor, and raw +Z ends up at -Z
  const ahead = placePoint(placed, [1, rawGround, 1]);
  expect(ahead[0]).toBeCloseTo(meta.metricScaleFactor, 4);
  expect(ahead[2]).toBeCloseTo(-meta.metricScaleFactor, 4);
});

test("placePoint follows the three.js Z then Y then X rotation order", () => {
  const placed = {
    position: [1, 2, 3] as [number, number, number],
    rotation: [0, Math.PI / 2, Math.PI / 2] as [number, number, number],
    scale: 2,
  };
  // Rz turns +X to +Y, then Ry leaves Y alone
  const p = placePoint(placed, [1, 0, 0]);
  expect(p[0]).toBeCloseTo(1, 6);
  expect(p[1]).toBeCloseTo(4, 6);
  expect(p[2]).toBeCloseTo(3, 6);
});

test("spawn candidates start at the origin and the rings face the centre", () => {
  const list = spawnCandidates();
  expect(list.length).toBe(1 + 5 * 12);
  expect(list[0]).toEqual({ x: 0, z: 0, yaw: 0 });
  for (const c of list.slice(1)) {
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(WORLDLABS_PLAY_RADIUS);
    // three.js forward for a yaw is (-sin yaw, -cos yaw)
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    const r = Math.hypot(c.x, c.z);
    expect(fx * (-c.x / r) + fz * (-c.z / r)).toBeCloseTo(1, 6);
  }
  const custom = spawnCandidates([5], 4);
  expect(custom.length).toBe(5);
});

test("walkable probes need level ground near y=0 and enough headroom", () => {
  const ok: GroundProbe = { y: 0.2, normalY: 1, headroom: Infinity };
  expect(isWalkableProbe(ok)).toBe(true);
  expect(isWalkableProbe({ ...ok, y: null })).toBe(false);
  expect(isWalkableProbe({ ...ok, y: Number.NaN })).toBe(false);
  expect(isWalkableProbe({ ...ok, y: SPAWN_RULES.maxGroundDelta + 0.1 })).toBe(false);
  expect(isWalkableProbe({ ...ok, y: -SPAWN_RULES.maxGroundDelta - 0.1 })).toBe(false);
  expect(isWalkableProbe({ ...ok, normalY: 0.5 })).toBe(false);
  expect(isWalkableProbe({ ...ok, headroom: 2 })).toBe(false);
});

test("chooseSpawns keeps walkable, spaced candidates in order up to the limit", () => {
  const cands: SpawnCandidate[] = [
    { x: 0, z: 0, yaw: 0 },
    { x: 1, z: 0, yaw: 0 }, // too close to the first
    { x: 10, z: 0, yaw: 1 }, // roof overhead
    { x: 0, z: 10, yaw: 2 },
    { x: 0, z: 20, yaw: 3 },
  ];
  const probe = (c: SpawnCandidate): GroundProbe => ({
    y: c.z / 100,
    normalY: 1,
    headroom: c.x === 10 ? 3 : Infinity,
  });
  const all = chooseSpawns(cands, probe);
  expect(all.map((s) => [s.x, s.z])).toEqual([
    [0, 0],
    [0, 10],
    [0, 20],
  ]);
  expect(all[1]?.y).toBeCloseTo(0.1, 6);
  expect(all[1]?.yaw).toBe(2);
  expect(chooseSpawns(cands, probe, 2).length).toBe(2);
  expect(chooseSpawns(cands, () => ({ y: null, normalY: 0, headroom: 0 })).length).toBe(0);
});
