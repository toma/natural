import { expect, test } from "bun:test";
import { createForearmGeometry, forearmSection } from "../src/weapons/arm-geometry.ts";

test("support forearm has a muscle belly, asymmetric cross-section, and wrist taper", () => {
  const elbow = forearmSection(0);
  const muscle = forearmSection(0.28);
  const wrist = forearmSection(1);
  expect(muscle.x).toBeGreaterThan(elbow.x * 1.2);
  expect(muscle.x / wrist.x).toBeGreaterThan(1.8);
  expect(muscle.y / wrist.y).toBeGreaterThan(1.8);
  expect(muscle.x).toBeGreaterThan(muscle.y);
  expect(forearmSection(-1)).toEqual(elbow);
  expect(forearmSection(2)).toEqual(wrist);
});

test("forearm geometry is deterministic, finite, capped, and fits its bone length", () => {
  const a = createForearmGeometry(0.275, 0.97);
  const b = createForearmGeometry(0.275, 0.97);
  const positions = a.getAttribute("position");
  const normals = a.getAttribute("normal");
  expect(positions.array).toEqual(b.getAttribute("position").array);
  expect(a.boundingBox!.min.z).toBeCloseTo(-0.275, 6);
  expect(a.boundingBox!.max.z).toBe(0);
  const edges = new Map<string, number>();
  const index = a.getIndex()!;
  const key = (i: number) =>
    [positions.getX(i), positions.getY(i), positions.getZ(i)]
      .map((v) => v.toFixed(6).replace("-0.000000", "0.000000"))
      .join(",");
  for (let i = 0; i < index.count; i += 3) {
    const points = [key(index.getX(i)), key(index.getX(i + 1)), key(index.getX(i + 2))];
    for (let j = 0; j < 3; j++) {
      const edge = [points[j]!, points[(j + 1) % 3]!].sort().join("/");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  expect([...edges.values()].every((count) => count === 2)).toBe(true);
  for (let i = 0; i < normals.count; i++) {
    expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
  }
  a.dispose();
  b.dispose();
});

test("forearm dimensions reject invalid geometry", () => {
  for (const value of [0, -1, NaN, Infinity]) {
    expect(() => createForearmGeometry(value)).toThrow("dimensions");
    expect(() => createForearmGeometry(0.275, value)).toThrow("dimensions");
  }
});
