/**
 * Model-backed vehicles for the Atomic Cul-de-sac.
 *
 * When the optional CC0 vehicle set is fetched (`bun run assets`, see
 * assets/ASSETS.md) the school bus and the two parked cars render as real
 * glTF models instead of the procedural kit. Gameplay never changes: the
 * procedural builders still run in collider-only mode, so every collision box,
 * prop OBB and nav blocker is the one the procedural vehicle registers.
 *
 * This module is pure data plus pure maths so it is unit-tested without a GPU:
 * where each model sits on its layout footprint, which paint it wears for the
 * active skin, and the texture repaint that swaps a model's stock paint for
 * the calibrated skin colour while keeping its baked shading.
 */

import type { PropBox } from "./atomic-culdesac-layout.ts";
import type { Rgb, SkinPalette } from "./worldlabs-skins.ts";

export interface VehicleModelSpec {
  /** Layout vehicle id (VEHICLES in atomic-culdesac-layout.ts). */
  vehicle: string;
  /** Model id in model-manifest.ts. */
  model: string;
  /**
   * Turn from the model's forward axis (+Z, glTF convention) onto the
   * procedural vehicle's forward axis in its kit frame.
   */
  yawOffset: number;
  /** Uniform scale that fits the model to the layout footprint length. */
  scale: number;
  /** Model length along its forward axis at scale 1, metres. */
  length: number;
  /** Height of the model origin (the tyre contact plane) above level zero. */
  y: number;
  /** Palette key whose colour the body paint takes. */
  paintKey: string;
  /** The model's stock paint as baked in its body texture, sRGB 0..255. */
  stockPaint: Rgb;
  /**
   * Saturation below which a texel is trim, not paint (see recolorPaint). The
   * bus raises it so its cream roof stays cream.
   */
  minSat: number;
}

/**
 * Grab3D CC0 vehicles fitted to the layout footprints. The procedural bus and
 * truck face local -X, the procedural cars +X; the models face +Z. Tyres sit
 * on the asphalt top (0.135) with a few millimetres of squash.
 */
export const VEHICLE_MODELS: readonly VehicleModelSpec[] = [
  {
    vehicle: "bus",
    model: "grab3d_school_bus",
    yawOffset: -Math.PI / 2,
    scale: 1,
    length: 11.27,
    y: 0.12,
    paintKey: "ac-bus",
    stockPaint: [244, 212, 116],
    minSat: 0.3,
  },
  {
    vehicle: "car-green",
    model: "grab3d_1950s_sedan",
    yawOffset: Math.PI / 2,
    scale: 0.92,
    length: 5.53,
    y: 0.12,
    paintKey: "ac-car",
    stockPaint: [136, 204, 184],
    minSat: 0.1,
  },
  {
    vehicle: "car-yellow",
    model: "grab3d_1950s_pickup",
    yawOffset: Math.PI / 2,
    scale: 0.94,
    length: 5.29,
    y: 0.12,
    paintKey: "ac-rust",
    stockPaint: [164, 188, 152],
    minSat: 0.08,
  },
];

/** The classic skin's vehicle paint, the same hexes the surface table uses. */
export const CLASSIC_PAINT: Readonly<Record<string, Rgb>> = {
  "ac-bus": [0xe2, 0xb0, 0x2e],
  "ac-car": [0x79, 0x89, 0x4a],
  "ac-rust": [0x91, 0x4e, 0x3e],
  "ac-red": [0xa7, 0x3e, 0x35],
};

export function vehicleModelFor(vehicle: string): VehicleModelSpec | null {
  return VEHICLE_MODELS.find((s) => s.vehicle === vehicle) ?? null;
}

/**
 * Body paint for a key under a skin: the colour the calibrated skin renders
 * the procedural vehicle at, else the classic hex, else a neutral grey.
 */
export function vehiclePaint(key: string, skin: SkinPalette | null): Rgb {
  const c = skin?.achieved[key] ?? CLASSIC_PAINT[key] ?? [128, 128, 128];
  return [c[0], c[1], c[2]];
}

export interface VehicleModelRequest {
  id: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  far: number;
  vehicle: { paint: Rgb; stockPaint: Rgb; minSat: number };
}

/** The placeModels request that lays a spec's model over its layout footprint. */
export function vehicleModelRequest(
  spec: VehicleModelSpec,
  box: PropBox,
  skin: SkinPalette | null,
): VehicleModelRequest {
  return {
    id: spec.model,
    x: box.x,
    z: box.z,
    y: spec.y,
    yaw: box.yaw + spec.yawOffset,
    scale: spec.scale,
    far: 160,
    vehicle: {
      paint: vehiclePaint(spec.paintKey, skin),
      stockPaint: spec.stockPaint,
      minSat: spec.minSat,
    },
  };
}

/** Hue in degrees (0..360) and HSV saturation (0..1) of an sRGB triple. */
export function hueSat(r: number, g: number, b: number): [number, number] {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  if (mx <= 0 || d <= 0) return [0, 0];
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, d / mx];
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Repaint an RGBA texture in place: every pixel whose hue sits near the stock
 * paint (and is saturated enough to be paint, not chrome, glass or trim)
 * becomes the target colour scaled by the pixel's brightness relative to the
 * stock paint, so baked occlusion and panel shading carry over. Pixels at the
 * edge of the hue window blend, so anti-aliased seams do not fringe. Returns
 * the share of pixels repainted.
 */
export function recolorPaint(
  data: Uint8ClampedArray,
  stock: Rgb,
  target: Rgb,
  opts: { hueWindow?: number; minSat?: number } = {},
): number {
  const win = opts.hueWindow ?? 26;
  const minSat = opts.minSat ?? 0.1;
  const [sh] = hueSat(stock[0], stock[1], stock[2]);
  const sl = Math.max(1, luma(stock[0], stock[1], stock[2]));
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!,
      g = data[i + 1]!,
      b = data[i + 2]!;
    const [h, s] = hueSat(r, g, b);
    if (s < minSat * 0.6) continue;
    let dh = Math.abs(h - sh);
    if (dh > 180) dh = 360 - dh;
    if (dh > win) continue;
    const wHue = dh < win * 0.6 ? 1 : 1 - (dh - win * 0.6) / (win * 0.4);
    const wSat = s >= minSat ? 1 : (s - minSat * 0.6) / (minSat * 0.4);
    const w = wHue * wSat;
    const k = Math.min(1.35, luma(r, g, b) / sl);
    data[i] = r + (target[0] * k - r) * w;
    data[i + 1] = g + (target[1] * k - g) * w;
    data[i + 2] = b + (target[2] * k - b) * w;
    hits++;
  }
  return hits / Math.max(1, data.length / 4);
}
