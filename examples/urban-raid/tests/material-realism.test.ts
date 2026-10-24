import { expect, test } from "bun:test";
import * as THREE from "three";
// @ts-expect-error JS module without a type declaration file
import * as Shader from "../src/materials/shader.js";

type Params = Record<string, unknown>;
const DEFAULT_PARAMS = Shader.DEFAULT_PARAMS as Params;
const qualityParams = Shader.qualityParams as (p: Params, q: number) => Params;
const extendMaterial = Shader.extendMaterial as (
  m: THREE.Material,
  p: Params,
  shared: Record<string, unknown>,
) => THREE.Material;
const OW_TIME = Shader.OW_TIME as { value: number };

const shared = { detailNormal: null, detailAlbedo: null, macro: null };

type Built = THREE.MeshStandardMaterial & { defines?: Record<string, string> };

function build(opts: Params): Built {
  const m: Built = new THREE.MeshStandardMaterial();
  extendMaterial(m, { ...DEFAULT_PARAMS, ...opts }, shared);
  return m;
}

function compile(m: THREE.Material): { vs: string; fs: string; uniforms: Record<string, unknown> } {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  (m.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
  return { vs: shader.vertexShader, fs: shader.fragmentShader, uniforms: shader.uniforms };
}

test("the realism layers are off by default, so classic materials compile unchanged", () => {
  const m = build({});
  for (const d of ["OW_STREET", "OW_STREET_LITE", "OW_LEAF", "OW_WIND"])
    expect(m.defines?.[d], d).toBeUndefined();
  expect(m.customProgramCacheKey()).not.toContain("OW_STREET");
});

test("street, leaf and wind params switch on their defines and uniforms", () => {
  const m = build({ street: [1, 0.5, 0.25, 0.75], leaf: [1, 0.6, 0, 0], wind: 0.035 });
  expect(m.defines).toMatchObject({ OW_STREET: "", OW_LEAF: "", OW_WIND: "" });
  expect(m.defines?.OW_STREET_LITE).toBeUndefined();
  const { vs, fs, uniforms } = compile(m);
  expect(vs).toContain("owWind");
  expect(vs.indexOf("#ifdef OW_WIND\n{")).toBeGreaterThan(vs.indexOf("#include <begin_vertex>"));
  expect(fs).toContain("owVoronoi");
  expect(fs).toContain("#ifdef OW_STREET");
  expect(fs).toContain("#ifdef OW_LEAF");
  const sp = (uniforms.owStreetP as { value: THREE.Vector4 }).value;
  expect(sp.toArray()).toEqual([1, 0.5, 0.25, 0.75]);
  expect((uniforms.owWind as { value: number }).value).toBe(0.035);
  // Every swaying material shares one clock.
  expect(uniforms.owTime).toBe(OW_TIME);
  expect(m.customProgramCacheKey()).toContain("OW_STREET");
});

test("a dust-only street layer still enables the street define", () => {
  expect(build({ street: [0, 0, 0, 0.6] }).defines?.OW_STREET).toBe("");
  expect(build({ streetLite: true }).defines?.OW_STREET_LITE).toBeUndefined();
  expect(build({ street: [1, 1, 1, 1], streetLite: true }).defines?.OW_STREET_LITE).toBe("");
});

test("qualityParams drops the layers on low and the extras on medium", () => {
  const p = { street: [1, 1, 1, 1], leaf: [1, 0.5, 0, 0], wind: 0.03, scale: 3 };
  expect(qualityParams(p, 1)).toBe(p);
  const low = qualityParams(p, 0.5);
  expect(low).toMatchObject({ street: [0, 0, 0, 0], leaf: [0, 0, 0, 0], wind: 0, scale: 3 });
  const med = qualityParams(p, 0.75);
  expect(med).toMatchObject({
    street: [1, 1, 1, 1],
    leaf: [1, 0.5, 0, 0],
    wind: 0,
    streetLite: true,
  });
  // Untouched params pass through as the same object at any quality.
  const plain = { scale: 2 };
  expect(qualityParams(plain, 0.5)).toBe(plain);
  expect(qualityParams({ wind: 0.02 }, 0.5)).toMatchObject({ wind: 0 });
  expect(qualityParams({ leaf: [1, 0, 0, 0] }, 0.75)).toMatchObject({ streetLite: true });
});
