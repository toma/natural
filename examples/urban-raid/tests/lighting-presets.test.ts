import { expect, test } from "bun:test";
import {
  GRADE_PRESETS,
  LIGHTING_PRESETS,
  applyGrade,
  resolveGrade,
  resolveLightingPreset,
  shoulderParams,
} from "../src/render/lighting-presets.ts";

test("resolveGrade returns known presets and falls back to default", () => {
  expect(resolveGrade("default")).toBe(GRADE_PRESETS.default!);
  expect(resolveGrade("neutral")).toBe(GRADE_PRESETS.neutral!);
  expect(resolveGrade("overcast")).toBe(GRADE_PRESETS.overcast!);
  expect(resolveGrade("nope")).toBe(GRADE_PRESETS.default!);
});

test("every grade produces in-range, monotonic output across a grey ramp", () => {
  for (const [name, g] of Object.entries(GRADE_PRESETS)) {
    const sh = shoulderParams(g);
    let prev = -1;
    for (let i = 0; i <= 32; i += 1) {
      const v = i / 32;
      const out = applyGrade([v, v, v], g, sh);
      for (const ch of out) {
        expect(ch, `${name} in range`).toBeGreaterThanOrEqual(0);
        expect(ch, `${name} in range`).toBeLessThanOrEqual(1);
      }
      const luma = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
      expect(luma, `${name} monotonic at ${v}`).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = luma;
    }
  }
});

test("display white is reachable and the default look is warm", () => {
  const g = GRADE_PRESETS.default!;
  const sh = shoulderParams(g);
  const white = applyGrade([1, 1, 1], g, sh);
  // The normalised shoulder must let the brightest input reach ~display white,
  // not asymptote short of it.
  expect(Math.max(white[0], white[1], white[2])).toBeGreaterThan(0.97);
  // Warm default: red rolls off above blue at the top end.
  expect(white[0]).toBeGreaterThanOrEqual(white[2]);
});

test("black maps to the toe lift, not a hole", () => {
  const g = GRADE_PRESETS.default!;
  const sh = shoulderParams(g);
  const black = applyGrade([0, 0, 0], g, sh);
  for (const ch of black) {
    expect(ch).toBeGreaterThanOrEqual(0);
    expect(ch).toBeLessThan(0.05);
  }
});

test("lighting presets reference real grades and sane sky hints", () => {
  for (const [name, preset] of Object.entries(LIGHTING_PRESETS)) {
    expect(GRADE_PRESETS[preset.grade], `${name} grade exists`).toBeDefined();
    expect(preset.sky.hour).toBeGreaterThanOrEqual(0);
    expect(preset.sky.hour).toBeLessThanOrEqual(24);
    expect(preset.sky.turbidity).toBeGreaterThan(0);
    expect(preset.sky.cloudCoverage).toBeGreaterThanOrEqual(0);
    expect(preset.sky.cloudCoverage).toBeLessThanOrEqual(1);
    expect(preset.sky.horizonMurk).toBeGreaterThanOrEqual(0);
    expect(preset.sky.horizonMurk).toBeLessThanOrEqual(1);
  }
  expect(resolveLightingPreset("nope")).toBe(LIGHTING_PRESETS["desert-golden-hour"]!);
});
