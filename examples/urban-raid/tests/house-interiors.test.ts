import { describe, expect, test } from "bun:test";
import {
  CHIMNEYS,
  CLEARANCES,
  FURNITURE,
  PARTITIONS,
  ROOMS,
  SHELL,
  STAIR,
  STAIR_OPENING,
  SHELL_DOORS,
  UPPER_SLABS,
  floorY,
  footprint,
  furnitureFor,
  occupancy,
  partitionSolids,
  reachable,
  rectInside,
  rectsOverlap,
  stairRect,
  type HouseId,
} from "../src/world/house-interiors.ts";
import { FLOOR_HEIGHT } from "../src/world/atomic-culdesac-layout.ts";

const IDS: HouseId[] = ["green", "yellow"];

describe("house interiors", () => {
  test("every piece sits inside its room and the shell", () => {
    for (const f of FURNITURE) {
      const room = ROOMS.find((r) => r.id === f.room && r.floor === f.floor);
      expect(room, f.id).toBeDefined();
      expect(rectInside(footprint(f), room!.rect, 0.02), f.id).toBe(true);
    }
  });

  test("solid pieces do not overlap each other, walls, the stair or the chimney", () => {
    for (const id of IDS) {
      const items = furnitureFor(id).filter((f) => !f.flat && !f.onTop);
      for (let i = 0; i < items.length; i++) {
        const a = items[i]!;
        const fa = footprint(a);
        expect(rectsOverlap(fa, CHIMNEYS[id]), `${a.id} chimney`).toBe(false);
        if (a.floor === 0) expect(rectsOverlap(fa, stairRect()), `${a.id} stair`).toBe(false);
        else expect(rectsOverlap(fa, STAIR_OPENING), `${a.id} stairwell`).toBe(false);
        for (const w of partitionSolids(a.floor))
          expect(rectsOverlap(fa, w), `${a.id} wall`).toBe(false);
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j]!;
          if (a.floor !== b.floor) continue;
          expect(rectsOverlap(fa, footprint(b)), `${a.id} vs ${b.id}`).toBe(false);
        }
      }
    }
  });

  test("doorways and both ends of the stair stay clear of furniture", () => {
    for (const id of IDS)
      for (const f of furnitureFor(id)) {
        if (f.flat) continue;
        for (const c of CLEARANCES) {
          if (c.floor !== f.floor) continue;
          expect(rectsOverlap(footprint(f), c.rect), `${f.id} in ${c.id}`).toBe(false);
        }
      }
  });

  test("doors are wide and tall enough for the navigation agent", () => {
    for (const p of PARTITIONS)
      for (const d of p.doors) {
        expect(d.w).toBeGreaterThanOrEqual(1.1);
        expect(d.h).toBeGreaterThanOrEqual(2.2);
      }
    expect(SHELL_DOORS.side.w).toBeGreaterThanOrEqual(1.1);
  });

  test("the stair climbs exactly one storey and has headroom under the upper floor", () => {
    expect(STAIR.count * STAIR.rise).toBeCloseTo(floorY(1) - floorY(0), 6);
    expect(STAIR.rise).toBeLessThan(0.45);
    expect(floorY(1)).toBeCloseTo(FLOOR_HEIGHT + 0.14, 6);
    const r = stairRect();
    // The opening spans the whole flight, so no tread has slab overhead.
    expect(STAIR_OPENING.z0).toBeLessThanOrEqual(r.z0 + 1e-9);
    expect(STAIR_OPENING.z1).toBeGreaterThanOrEqual(r.z1);
    expect(STAIR_OPENING.x0).toBeLessThanOrEqual(r.x0);
    expect(STAIR_OPENING.x1).toBeGreaterThanOrEqual(r.x1);
    for (const s of UPPER_SLABS)
      expect(rectsOverlap(s, { ...r, z0: r.z0 + 0.01 }), "slab over stair").toBe(false);
    expect(SHELL.ceiling1).toBeGreaterThan(floorY(1) + 2.4);
  });

  test("every room is reachable from the front door, and upstairs from the stair head", () => {
    for (const id of IDS) {
      const g0 = occupancy(id, 0);
      const seen0 = reachable(g0, -3.1, SHELL.z1 + 0.6);
      for (const target of [
        [-3.1, -2.6], // kitchen through the hall doorway
        [1.2, -2.6], // kitchen through the cased opening
        [0.8, SHELL.z0 - 0.6], // out the back door
        [-6.6, -2.2], // into the garage through the side door
        [-3.1, 3.5], // stair foot
        [-5.0, 4.4],
      ] as const) {
        const c = g0.index(target[0], target[1]);
        expect(c, `${id} ${target.join(",")}`).toBeGreaterThanOrEqual(0);
        expect(seen0[c] === 1, `${id} ground ${target.join(",")}`).toBe(true);
      }
      const g1 = occupancy(id, 1);
      const seen1 = reachable(g1, -5.0, stairRect().z0 - 0.5);
      for (const target of [
        [-2.9, 2.0], // bedroom
        [3.0, 0.8],
        [0.4, -2.5], // study
        [3.2, SHELL.z0 - 0.6], // out the deck door
      ] as const) {
        const c = g1.index(target[0], target[1]);
        expect(seen1[c] === 1, `${id} upper ${target.join(",")}`).toBe(true);
      }
    }
  });

  test("helpers handle turned pieces and blocked starts", () => {
    const f = FURNITURE.find((p) => p.id === "g-bed")!;
    const r = footprint(f);
    expect(r.x1 - r.x0).toBeCloseTo(f.d, 6);
    expect(r.z1 - r.z0).toBeCloseTo(f.w, 6);
    const g = occupancy("green", 0);
    expect(g.index(-100, 0)).toBe(-1);
    expect(reachable(g, 5.5, 0).some((v) => v === 1)).toBe(true);
    expect(reachable(g, -100, 0).every((v) => v === 0)).toBe(true);
    expect(reachable(g, -5.0, 0).every((v) => v === 0)).toBe(true);
  });
});
