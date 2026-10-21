import { MeshPhysicalMaterial, type Material } from "three";

/** Preserve distance LOD, transparent ordering, and per-batch shader variants. */
export function combinePropBuckets(
  buckets: Map<number, number[]>,
  options: {
    material: Material;
    maxDistance: number;
    masks: readonly unknown[];
    instanceCulling: boolean;
  },
): void {
  const { material, maxDistance, masks, instanceCulling } = options;
  if (
    !instanceCulling ||
    maxDistance !== 0 ||
    material.transparent ||
    (material instanceof MeshPhysicalMaterial && material.transmission !== 0) ||
    buckets.size <= 1 ||
    new Set(Array.from(buckets.values(), (list) => list.some((i) => Boolean(masks[i])))).size !== 1
  )
    return;

  const ordered = Array.from(buckets.values()).flat();
  buckets.clear();
  buckets.set(0, ordered);
}
