import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
// @ts-expect-error JS module without a type declaration file
import * as Bevel from "../src/world/box-bevel.js";

const beveledBoxGeometry = Bevel.beveledBoxGeometry as (
  w: number,
  h: number,
  d: number,
) => {
  attributes: { position: { count: number } };
};
const MIN_BEVEL_DIM = Bevel.MIN_BEVEL_DIM as number;

test("beveledBoxGeometry chamfers boxes above the threshold and leaves thin ones plain", () => {
  // A plain BoxGeometry has 24 position vertices; a chamfered one has more.
  expect(beveledBoxGeometry(1, 1, 1).attributes.position.count).toBeGreaterThan(24);
  expect(beveledBoxGeometry(2, MIN_BEVEL_DIM - 0.01, 2).attributes.position.count).toBe(24);
  expect(beveledBoxGeometry(0.5, 0.5, 0.5).attributes.position.count).toBeGreaterThan(24);
});

// Scene-wide audit: every visible box in the map is built through the bevel
// helper (box-bevel.js), so the only raw BoxGeometry allowed in the map source
// is the invisible collision proxy inside the kit box helper. A new raw box for
// a visible surface would be an un-beveled box and fails this test; add it to
// the allowlist count below only with a deliberate reason.
test("the map builds every visible box through the bevel helper", () => {
  const src = readFileSync(new URL("../src/world/atomic-culdesac.js", import.meta.url), "utf8");
  const rawBoxes = [...src.matchAll(/new THREE\.BoxGeometry\(/g)];
  const ALLOWED_RAW = 1; // the collision-only box in the kit helper
  expect(rawBoxes.length).toBe(ALLOWED_RAW);
  // And the helper it must go through is imported.
  expect(src).toContain("beveledBoxGeometry");
});
