import { expect, test } from "bun:test";
import { MeshPhysicalMaterial } from "three";
import { combinePropBuckets } from "../src/world/prop-buckets.ts";

const buckets = () =>
  new Map([
    [97, [0, 2, 4]],
    [-97, [1, 3, 5]],
  ]);

test("combined props preserve the original bucket order and canonical instance indices", () => {
  const material = new MeshPhysicalMaterial();
  const groups = buckets();
  const first = groups.get(97)!;
  const second = groups.get(-97)!;
  try {
    combinePropBuckets(groups, {
      material,
      maxDistance: 0,
      masks: [null, null, null, null, null, null],
      instanceCulling: true,
    });
    expect([...groups.values()]).toEqual([[0, 2, 4, 1, 3, 5]]);
    expect(first).toEqual([0, 2, 4]);
    expect(second).toEqual([1, 3, 5]);
  } finally {
    material.dispose();
  }
});

test("LOD, transparency, transmission, mixed colors, and missing culling retain original buckets", () => {
  const material = new MeshPhysicalMaterial();
  try {
    for (const reason of ["lod", "transparent", "transmission", "colors", "culling"]) {
      const groups = buckets();
      const original = [...groups.entries()];
      material.transparent = reason === "transparent";
      material.transmission = reason === "transmission" ? 0.5 : 0;
      combinePropBuckets(groups, {
        material,
        maxDistance: reason === "lod" ? 50 : 0,
        masks: reason === "colors" ? [null, [1, 1, 1]] : [],
        instanceCulling: reason !== "culling",
      });
      expect([...groups.entries()]).toEqual(original);
      expect(groups.get(97)).toBe(original[0]![1]);
      expect(groups.get(-97)).toBe(original[1]![1]);
    }
    material.transmission = 0;
    const groups = buckets();
    combinePropBuckets(groups, {
      material,
      maxDistance: 0,
      masks: [
        [0.5, 1, 1],
        [1, 0.5, 1],
      ],
      instanceCulling: true,
    });
    expect([...groups.values()]).toEqual([[0, 2, 4, 1, 3, 5]]);
  } finally {
    material.dispose();
  }
});
