import { expect, test } from "bun:test";
import { viewAoFeature, viewIndirectOverride } from "../src/render/view-shading.ts";
// @ts-expect-error JS module without a type declaration file
import * as Csm from "../src/render/csm.js";

const csmShaderChunk = Csm.csmShaderChunk as (cascades: number, quality: number) => string;

test("the viewmodel keeps the world AO flag unless the look turns it off", () => {
  expect(viewAoFeature({}, 1)).toBe(1);
  expect(viewAoFeature({ viewWorldAo: true }, 1)).toBe(1);
  expect(viewAoFeature({ viewWorldAo: true }, 0)).toBe(0);
  expect(viewAoFeature({ viewWorldAo: false }, 1)).toBe(0);
});

test("the viewmodel IBL diffuse overrides the world's only when set", () => {
  expect(viewIndirectOverride({}, 0.03)).toEqual({ x: 0.03 });
  expect(viewIndirectOverride({ viewIblDiffuse: null }, 0.03)).toEqual({ x: 0.03 });
  expect(viewIndirectOverride({ viewIblDiffuse: 0.2 }, 0.03)).toEqual({ x: 0.2 });
  expect(viewIndirectOverride({ viewIblDiffuse: 0 }, 0.03)).toEqual({ x: 0 });
});

test("the non-PCSS shadow filter widens with softness and PCSS stays on high", () => {
  const low = csmShaderChunk(3, 0);
  const high = csmShaderChunk(4, 2);
  expect(low).not.toContain("#define OW_PCSS");
  expect(high).toContain("#define OW_PCSS 1");
  for (const src of [low, high]) {
    expect(src).toContain("clamp( owCsmParams.y / 0.03, 1.0, 2.6 )");
    expect(src).toMatch(/float filterR = min\(.*maxR \);/);
  }
});
