import * as THREE from "three";
import { GRADE_PRESETS, shoulderParams, applyGrade } from "./lighting-presets.ts";

/**
 * Procedurally generated 33^3 colour grading LUT (Data3DTexture, RGBA8).
 *
 * No external .cube file - the grade is *computed*, which means it can be
 * re-authored per time-of-day and stays inside the "no external assets" rule.
 *
 * The colourist chain (ASC-CDL slope/offset/power -> split tone -> saturation ->
 * highlight desaturation -> filmic S-curve) and the named presets live in
 * lighting-presets.ts, where they are pure and unit-tested. This file only bakes
 * the chosen preset into the 3D texture the composite samples.
 */

const SIZE = 33;

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  c = Math.max(0, c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function createGradeLut(preset = "default") {
  const g = GRADE_PRESETS[preset] ?? GRADE_PRESETS.default;
  const sh = shoulderParams(g);
  const n = SIZE;
  const data = new Uint8Array(n * n * n * 4);
  let p = 0;
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inp = [x / (n - 1), y / (n - 1), z / (n - 1)];
        const out = applyGrade(inp, g, sh);
        data[p++] = Math.round(Math.min(1, Math.max(0, out[0])) * 255);
        data[p++] = Math.round(Math.min(1, Math.max(0, out[1])) * 255);
        data[p++] = Math.round(Math.min(1, Math.max(0, out[2])) * 255);
        data[p++] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, n, n, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = "ow-grade-lut";
  return { texture: tex, size: n };
}

export { srgbToLinear, linearToSrgb };
