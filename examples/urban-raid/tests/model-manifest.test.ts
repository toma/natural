import { expect, test } from "bun:test";
import {
  MODELS,
  MODELS_BY_ID,
  SENTINEL_MODEL_ID,
  VEHICLE_SENTINEL_MODEL_ID,
  isAllCC0,
  modelLodFar,
  modelScale,
  modelUrl,
  validateManifest,
  type ModelDef,
} from "../src/world/model-manifest.ts";

test("the committed model manifest is sound and entirely CC0", () => {
  expect(validateManifest()).toEqual([]);
  expect(isAllCC0()).toBe(true);
  expect(MODELS.length).toBeGreaterThan(0);
  expect(MODELS_BY_ID[SENTINEL_MODEL_ID]).toBeDefined();
  expect(MODELS_BY_ID[VEHICLE_SENTINEL_MODEL_ID]?.format).toBe("glb");
});

test("modelUrl builds the glTF path for each size and base", () => {
  expect(modelUrl("shrub_01")).toBe("/assets/models/shrub_01/shrub_01_1k.gltf");
  expect(modelUrl("shrub_01", { size: "2k" })).toBe("/assets/models/shrub_01/shrub_01_2k.gltf");
  expect(modelUrl("shrub_01", { base: "/cdn" })).toBe("/cdn/shrub_01/shrub_01_1k.gltf");
});

test("LOD and scale resolve from the manifest and fall back for unknown ids", () => {
  expect(modelLodFar("street_lamp_01")).toBe(80);
  expect(modelLodFar("unknown")).toBe(55);
  expect(modelLodFar("unknown", 30)).toBe(30);
  expect(modelScale("covered_car")).toBe(1);
  expect(modelScale("unknown", 2)).toBe(2);
});

test("validateManifest reports duplicate ids, bad licence, and bad numbers", () => {
  const bad: ModelDef[] = [
    { id: "a", source: "https://x/a", author: "Poly Haven", license: "CC0-1.0", far: 10, scale: 1 },
    { id: "a", source: "not-a-url", author: "x", license: "MIT" as "CC0-1.0", far: 0, scale: -1 },
  ];
  const problems = validateManifest(bad);
  expect(problems).toContain("duplicate model id: a");
  expect(problems.some((p) => p.includes("licence is not CC0-1.0"))).toBe(true);
  expect(problems.some((p) => p.includes("source is not a URL"))).toBe(true);
  expect(problems.some((p) => p.includes("far must be positive"))).toBe(true);
  expect(problems.some((p) => p.includes("scale must be positive"))).toBe(true);
});

test("glb vehicle models resolve to a single .glb and need an https download", () => {
  expect(modelUrl("grab3d_school_bus")).toBe(
    "/assets/models/grab3d_school_bus/grab3d_school_bus.glb",
  );
  const base = {
    source: "https://x/a",
    author: "Grab3D",
    license: "CC0-1.0" as const,
    far: 10,
    scale: 1,
  };
  const problems = validateManifest([
    { ...base, id: "nodl", format: "glb" },
    { ...base, id: "http", format: "glb", download: "http://x/a.glb" },
    { ...base, id: "ok", format: "glb", download: "https://x/a.glb" },
  ]);
  expect(problems.filter((p) => p.includes("needs an https .glb download URL")).length).toBe(2);
  expect(problems.some((p) => p.includes("ok"))).toBe(false);
});
