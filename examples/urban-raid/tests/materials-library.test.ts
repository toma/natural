import { expect, test } from "bun:test";
// @ts-expect-error JS module without a type declaration file
import * as Library from "../src/materials/library.js";

interface SurfaceDef {
  glsl: string;
  bake: { size: number; worldSize: number; relief: number };
  surface?: string;
  mat: Record<string, unknown>;
  three?: { sheen?: number; clearcoat?: number };
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

test("the mid-century set adds glossy period finishes reusing proven shaders", () => {
  for (const name of ["enamel", "car_paint", "chrome", "lacquer", "ceramic"]) {
    const def = LIBRARY[name]!;
    expect(def, name).toBeDefined();
    expect(def.three, `${name} is physical`).toBeDefined();
    // Period finishes read as glossy: the base roughness is well under matte.
    const baseRough = (def.mat.roughness as number[] | undefined)?.[0];
    expect(baseRough, `${name} base roughness`).toBeLessThan(0.5);
  }
});

test("car paint is a clean lacquered panel with no weathering in its bake", () => {
  const def = LIBRARY.car_paint!;
  expect(def.surface).toBe("metal");
  expect(def.three?.clearcoat).toBeGreaterThan(0.5);
  for (const layer of ["owRust", "chip", "bleach", "streak"]) expect(def.glsl).not.toContain(layer);
});

test("fresh paint is an even coat with none of the plaster's blotch bands", () => {
  const def = LIBRARY.paint!;
  expect(def.surface).toBe("plaster");
  for (const band of ["dampB", "soil2", "trowel"]) expect(def.glsl).not.toContain(band);
  expect(LIBRARY.plaster!.glsl).toContain("dampB");
});
