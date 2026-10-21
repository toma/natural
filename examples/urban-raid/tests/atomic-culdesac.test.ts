import { expect, test } from "bun:test";
import type { Vector3 } from "three";
import {
  HOUSES,
  LANDMARKS,
  MAP_SPAWNS,
  housePoint,
  insideMap,
  outdoorOpen,
} from "../src/world/atomic-culdesac-layout.ts";
import { findOverlaps, staticProps } from "../src/world/prop-bounds.ts";
import { LayeredNavGrid } from "../src/ai/layered-nav.ts";

test("static props do not interpenetrate on the ground plane", () => {
  const props = staticProps();
  expect(props.length).toBeGreaterThan(20);
  expect(findOverlaps(props)).toEqual([]);
});

test("Atomic Cul-de-sac spawns occupy open space inside the same bounds as the world", () => {
  expect(new Set(MAP_SPAWNS.map((s) => s.id)).size).toBe(MAP_SPAWNS.length);
  for (const p of MAP_SPAWNS) expect(outdoorOpen(p.x, p.z, 0.4)).toBe(true);
  for (const h of HOUSES) expect(outdoorOpen(h.x, h.z)).toBe(false);
  for (const p of LANDMARKS.slice(0, 2)) expect(outdoorOpen(p.x, p.z)).toBe(false);
  expect(insideMap(24, 0)).toBe(false);
  expect(insideMap(0, 40)).toBe(false);
});

test("opposing house transforms preserve front and backyard route placement", () => {
  const green = HOUSES[0]!,
    yellow = HOUSES[1]!;
  expect(housePoint(green, 0, 5).z).toBe(-10);
  expect(housePoint(yellow, 0, 5).z).toBe(10);
  expect(housePoint(yellow, 3, -10).x).toBeCloseTo(-1.6);
});

function physics(floors: (x: number, z: number) => number[]) {
  return {
    MASK: { WORLD: 1 },
    raycast(
      x: number,
      y: number,
      z: number,
      _dx: number,
      _dy: number,
      _dz: number,
      distance: number,
    ) {
      const floor = floors(x, z)
        .filter((f) => f < y && y - f <= distance)
        .sort((a, b) => b - a)[0];
      return {
        hit: floor !== undefined,
        distance: floor === undefined ? Infinity : y - floor,
        point: { x, y: floor ?? 0, z },
        normal: { x: 0, y: 1, z: 0 },
      };
    },
    raycastAny: () => false,
  };
}
const bounds = { min: { x: 0, y: -1, z: 0 }, max: { x: 4, y: 7, z: 4 } };

test("layered navigation retains both floors and never walks directly between storeys", () => {
  const grid = new LayeredNavGrid(
    physics(() => [0, 3]),
    { bounds, cell: 0.4 },
  ).build();
  const ground = grid.nearest(2, 2, 0),
    upstairs = grid.nearest(2, 2, 3);
  expect(ground).toBeGreaterThanOrEqual(0);
  expect(upstairs).toBeGreaterThanOrEqual(0);
  expect(ground).not.toBe(upstairs);
  expect(grid.floor[ground]).toBe(0);
  expect(grid.floor[upstairs]).toBe(3);
  expect(grid.worldZ(Math.floor(ground / grid.nx))).toBe(
    grid.worldZ(Math.floor(upstairs / grid.nx)),
  );
  expect(grid.findPath({ x: 1, y: 0, z: 1 }, { x: 3, y: 3, z: 3 }, [])).toBe(0);
  const path: Vector3[] = [];
  expect(grid.findPath({ x: 0.4, y: 3, z: 0.4 }, { x: 3.6, y: 3, z: 3.6 }, path)).toBeGreaterThan(
    0,
  );
  expect(path.every((p) => p.y === 3)).toBe(true);
});

test("layered paths traverse connected stair treads while rejecting an abrupt ledge", () => {
  const grid = new LayeredNavGrid(
    physics((x) => [Math.min(3.2, Math.round(x / 0.4) * 0.4)]),
    { bounds, cell: 0.4 },
  ).build();
  const path: Vector3[] = [];
  expect(grid.findPath({ x: 0, y: 0, z: 2 }, { x: 4, y: 3.2, z: 2 }, path)).toBeGreaterThan(0);
  expect(path.at(-1)?.y).toBeCloseTo(3.2);
  const cliff = new LayeredNavGrid(
    physics((x) => [x < 2 ? 0 : 3]),
    { bounds, cell: 0.4 },
  ).build();
  expect(cliff.findPath({ x: 0, y: 0, z: 2 }, { x: 4, y: 3, z: 2 }, [])).toBe(0);
});
