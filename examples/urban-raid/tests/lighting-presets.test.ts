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

test("the worldlabs look is a hazy low-sun desert afternoon with a pale veiled sky", () => {
  const wl = resolveLightingPreset("worldlabs");
  expect(wl.grade).toBe("worldlabs");
  expect(wl.sky.hour).toBeGreaterThan(14);
  expect(wl.sky.hour).toBeLessThan(18);
  expect(wl.sky.cloudCoverage).toBe(0);
  expect(wl.sky.turbidity).toBeGreaterThan(LIGHTING_PRESETS["neutral-noon"]!.sky.turbidity);
  const veil = wl.sky.skyVeil!;
  expect(veil).toHaveLength(4);
  for (const c of veil.slice(0, 3)) expect(c).toBeGreaterThan(0);
  expect(veil[3]).toBeGreaterThan(0);
  expect(veil[3]).toBeLessThanOrEqual(1);
  // Only the worldlabs look veils the sky.
  for (const [name, p] of Object.entries(LIGHTING_PRESETS))
    if (name !== "worldlabs") expect(p.sky.skyVeil).toBeUndefined();
});

test("the worldlabs look adds aerial perspective that every other look leaves off", () => {
  const wl = resolveLightingPreset("worldlabs");
  const [near, far, amount, top] = wl.sky.dust!;
  expect(near).toBeGreaterThan(0);
  expect(far).toBeGreaterThan(near);
  expect(amount).toBeGreaterThan(0);
  expect(amount).toBeLessThanOrEqual(1);
  expect(top).toBeGreaterThan(0);
  expect(wl.sky.dustColor).toHaveLength(3);
  // The mesas stand taller than the panorama's own angular height, and their
  // base hazes more than their crest.
  expect(wl.sky.horizonLift).toBeGreaterThan(1);
  const [haze, baseHaze] = wl.sky.horizonHaze!;
  expect(baseHaze).toBeGreaterThan(haze);
  // Shade takes the veiled sky's cream, so the skylight hue is greyed.
  expect(wl.render?.skyFillChroma).toBeLessThan(1);
  for (const [name, p] of Object.entries(LIGHTING_PRESETS)) {
    if (name === "worldlabs") continue;
    expect(p.sky.dust, `${name} has no dust band`).toBeUndefined();
    expect(p.sky.horizonHaze, `${name} has no ring haze`).toBeUndefined();
    expect(p.render?.skyFillChroma, `${name} keeps the default chroma`).toBeUndefined();
  }
});

test("the worldlabs grade keeps a sunlit pale yellow wall under display clip", () => {
  const g = GRADE_PRESETS.worldlabs!;
  const sh = shoulderParams(g);
  // A near-white warm input, as AgX hands over a sun-facing cream wall.
  const out = applyGrade([0.9, 0.83, 0.57], g, sh);
  // At least a few code values of headroom left in red, the channel that clips.
  expect(out[0]).toBeLessThan(0.97);
  expect(out[0]).toBeGreaterThan(out[2]);
});

test("the worldlabs look grounds objects with stronger AO and contact shadows", () => {
  const r = resolveLightingPreset("worldlabs").render!;
  // Renderer defaults: aoIntensity 1.1, contactLength 0.4, contactStrength 1.0.
  expect(r.aoIntensity).toBeGreaterThan(1.1);
  expect(r.aoRadius).toBeGreaterThan(1.35);
  expect(r.contactLength).toBeGreaterThan(0.4);
  expect(r.contactLength).toBeLessThanOrEqual(1);
  expect(r.contactStrength).toBeGreaterThan(1);
  expect(r.sunSoftness).toBeGreaterThan(0.03);
  expect(r.sunSoftness).toBeLessThan(0.06);
  for (const [name, p] of Object.entries(LIGHTING_PRESETS)) {
    if (name === "worldlabs") continue;
    expect(p.render?.aoIntensity, `${name} keeps the default AO`).toBeUndefined();
    expect(p.render?.contactLength, `${name} keeps the default contact`).toBeUndefined();
  }
});
