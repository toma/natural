import { expect, test } from "bun:test";
// @ts-expect-error JS module without a type declaration file
import * as Library from "../src/materials/library.js";

interface SurfaceDef {
  glsl: string;
  bake: { size: number; worldSize: number; relief: number };
  mat: Record<string, unknown>;
  three?: { sheen?: number };
}
const LIBRARY = Library.LIBRARY as Record<string, SurfaceDef>;
const ALIASES = Library.ALIASES as Record<string, string>;
const resolveName = Library.resolveName as (name: string) => string;

test("every surface entry has a valid glsl, bake, and mat contract", () => {
  for (const [name, def] of Object.entries(LIBRARY)) {
    expect(typeof def.glsl, `${name}.glsl`).toBe("string");
    expect(def.glsl, `${name} implements owSurface`).toContain("owSurface");
    expect(def.bake?.size, `${name}.bake.size`).toBeGreaterThan(0);
    expect(def.bake?.worldSize, `${name}.bake.worldSize`).toBeGreaterThan(0);
    expect(def.bake?.relief, `${name}.bake.relief`).toBeGreaterThanOrEqual(0);
    expect(typeof def.mat, `${name}.mat`).toBe("object");
  }
});

test("aliases resolve to real library entries", () => {
  for (const [alias, target] of Object.entries(ALIASES)) {
    expect(LIBRARY[target], `alias ${alias} -> ${target}`).toBeDefined();
    expect(resolveName(alias)).toBe(target);
  }
});

test("resolveName passes through real names and unknown names unchanged", () => {
  expect(resolveName("concrete")).toBe("concrete");
  expect(resolveName("turf")).toBe("turf");
  expect(resolveName("not-a-surface")).toBe("not-a-surface");
});

test("the turf lawn material is present and wired for grass/lawn", () => {
  const turf = LIBRARY.turf!;
  expect(turf).toBeDefined();
  expect(turf.glsl).toContain("owSurface");
  expect(turf.mat.uvMode).toBe("triplanar");
  // A lawn needs a sheen lobe to read as grass rather than painted felt.
  expect(turf.three?.sheen).toBeGreaterThan(0);
  expect(resolveName("grass")).toBe("turf");
  expect(resolveName("lawn")).toBe("turf");
});
