import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * A ~3 cm chamfer, the fix for the "blocky" read: real objects have a small
 * roundover or chamfer on every edge that catches a highlight, and a perfectly
 * sharp 90-degree box never does. Boxes whose smallest side is below
 * MIN_BEVEL_DIM (thin slats, decals, siding grooves) stay plain, because a
 * chamfer there is invisible and only costs vertices.
 *
 * Kept in its own module with no map dependencies so the scene audit can import
 * it without pulling in (and having to cover) the whole world graph.
 */
export const BOX_BEVEL = 0.03;
export const MIN_BEVEL_DIM = 0.08;

export function beveledBoxGeometry(w, h, d) {
  const minDim = Math.min(w, h, d);
  if (minDim <= MIN_BEVEL_DIM) return new THREE.BoxGeometry(w, h, d);
  const r = Math.min(BOX_BEVEL, minDim * 0.45);
  return new RoundedBoxGeometry(w, h, d, 2, r);
}
