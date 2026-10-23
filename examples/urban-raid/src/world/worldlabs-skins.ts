/**
 * World Labs skins for the procedural Atomic Cul-de-sac.
 *
 * The procedural map keeps its own geometry, colliders, nav and surface tags.
 * Only the colour of each palette key changes: `tools/worldlabs-skins.mjs`
 * samples the World Labs panorama (culdesac_pano.jpg) inside labelled
 * rectangles, one or more per object, then drives each key's linear tint in a
 * live procedural session until the rendered colour matches the sample. The
 * result is `assets/worldlabs/skins/palette.json`, which this module validates
 * and serves to the level builder and the sky.
 *
 * Everything here is pure so the tool and the runtime share one tested copy of
 * the colour maths.
 */

import paletteJson from "../../assets/worldlabs/skins/palette.json";

/** Which skin the procedural map wears. */
export type SkinMode = "worldlabs" | "classic";

export const SKIN_MODES: readonly SkinMode[] = ["worldlabs", "classic"];

/** The procedural map wears the World Labs skin unless `?skin=classic` asks otherwise. */
export const DEFAULT_SKIN_MODE: SkinMode = "worldlabs";

/** Coerce an unknown value (URL param, stored setting) to a skin mode. */
export function normalizeSkinMode(
  value: unknown,
  fallback: SkinMode = DEFAULT_SKIN_MODE,
): SkinMode {
  return SKIN_MODES.find((mode) => mode === value) ?? fallback;
}

export type Rgb = [number, number, number];

/** A pixel rectangle on the panorama: [x0, y0, x1, y1], end exclusive. */
export type Rect = [number, number, number, number];

export interface SkinTarget {
  /** Robust median of the labelled panorama pixels, 0..255 sRGB. */
  srgb: Rgb;
  /** Number of panorama pixels behind the median. */
  samples: number;
  /** Labels the sample came from, for provenance. */
  from: string[];
}

export interface SkinSky {
  /** Aerosol multiplier handed to the sky (see sky/index.js `weather.turbidity`). */
  turbidity: number;
  /** Horizon dust (see sky/index.js `weather.horizonMurk`). */
  horizonMurk: number;
}

export interface SkinPalette {
  version: 1;
  source: string;
  /** What the panorama says each key should look like. */
  targets: Record<string, SkinTarget>;
  /** Calibrated linear tint per key, multiplied into the baked albedo. */
  tints: Record<string, Rgb>;
  /** Keys whose base switches from bare timber to painted boards. */
  painted: string[];
  sky: SkinSky | null;
  /**
   * Linear exposure factor between the panorama and the game: the panorama is
   * graded darker than the game's tone curve, so targets are scaled by this
   * before calibration (see exposeTarget). 1 means none.
   */
  exposure: number;
  /** Rendered colour per key after calibration, 0..255 sRGB, for the report. */
  achieved: Record<string, Rgb>;
  /**
   * Keys repainted fresh: the painted siding, pickets and kerbs in the World
   * Labs world read crisp, so their weathering, grime and repair patches drop.
   */
  clean: string[];
  /** Per-key finish overrides; the World Labs vehicles read as painted, not chrome. */
  finish: Record<string, SkinFinish>;
}

export interface SkinFinish {
  /** Multiplier on the material's metalness (its ORM map), 0..1. */
  metalness?: number;
  /** Roughness remap [scale, offset, minimum], as the material library takes it. */
  roughness?: Rgb;
}

/** Upper bound on a tint channel: dark bases (painted metal) need a large gain. */
export const MAX_TINT = 32;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRgb = (v: unknown): v is Rgb => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate parsed palette JSON. Throws on anything the runtime cannot use. */
export function parsePalette(json: unknown): SkinPalette {
  if (!isObj(json) || json.version !== 1) throw new Error("skin palette: expected version 1");
  const { targets, tints, painted, sky, achieved, source, exposure, clean, finish } = json;
  if (exposure !== undefined && !(isNum(exposure) && exposure > 0))
    throw new Error("skin palette: bad exposure");
  if (!isObj(tints)) throw new Error("skin palette: tints must be an object");
  for (const [key, tint] of Object.entries(tints)) {
    if (!isRgb(tint) || tint.some((c) => c < 0 || c > MAX_TINT))
      throw new Error(`skin palette: bad tint for ${key}`);
  }
  if (!isObj(targets)) throw new Error("skin palette: targets must be an object");
  for (const [key, t] of Object.entries(targets)) {
    if (!isObj(t) || !isRgb(t.srgb) || !isNum(t.samples) || !Array.isArray(t.from))
      throw new Error(`skin palette: bad target for ${key}`);
  }
  if (!Array.isArray(painted) || !painted.every((k) => typeof k === "string"))
    throw new Error("skin palette: painted must be a list of keys");
  if (sky !== null && !(isObj(sky) && isNum(sky.turbidity) && isNum(sky.horizonMurk)))
    throw new Error("skin palette: bad sky");
  if (clean !== undefined && !(Array.isArray(clean) && clean.every((k) => typeof k === "string")))
    throw new Error("skin palette: clean must be a list of keys");
  const fin = finish === undefined ? {} : finish;
  if (!isObj(fin)) throw new Error("skin palette: finish must be an object");
  for (const [key, f] of Object.entries(fin)) {
    const ok =
      isObj(f) &&
      (f.metalness === undefined || (isNum(f.metalness) && f.metalness >= 0 && f.metalness <= 1)) &&
      (f.roughness === undefined || isRgb(f.roughness));
    if (!ok) throw new Error(`skin palette: bad finish for ${key}`);
  }
  const ach = isObj(achieved) ? achieved : {};
  for (const [key, c] of Object.entries(ach))
    if (!isRgb(c)) throw new Error(`skin palette: bad achieved colour for ${key}`);
  return {
    version: 1,
    source: typeof source === "string" ? source : "",
    targets: targets as Record<string, SkinTarget>,
    tints: tints as Record<string, Rgb>,
    painted: painted as string[],
    sky: (sky as SkinSky | null) ?? null,
    exposure: (exposure as number | undefined) ?? 1,
    achieved: ach as Record<string, Rgb>,
    clean: (clean as string[] | undefined) ?? [],
    finish: fin as Record<string, SkinFinish>,
  };
}

/** The finish override for `key`, or null. */
export function skinFinish(palette: SkinPalette | null, key: string): SkinFinish | null {
  return palette?.finish[key] ?? null;
}

/** Whether the skin repaints `key` fresh (see SkinPalette.clean). */
export function skinClean(palette: SkinPalette | null, key: string): boolean {
  return palette?.clean.includes(key) ?? false;
}

/** The calibrated linear tint for `key`, or null when the palette leaves it alone. */
export function skinTint(palette: SkinPalette | null, key: string): Rgb | null {
  const t = palette?.tints[key];
  return t ? [t[0], t[1], t[2]] : null;
}

/** sRGB transfer, one channel, 0..1. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const v = Math.max(0, c);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** 0..255 sRGB triple to linear 0..1. */
export function rgb8ToLinear(c: Rgb): Rgb {
  return [srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255)];
}

/** Linear 0..1 triple to a `#rrggbb` string (clamped). */
export function linearToHex(c: Rgb): string {
  return (
    "#" +
    c
      .map((v) =>
        Math.round(Math.min(1, linearToSrgb(v)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Robust colour of a pixel set: sort the pixels by luma, keep the band between
 * the `lo` and `hi` quantiles (dropping shadow seams, specular glints, stray
 * sky), then take the per-channel median of the rest. The default keeps the
 * middle 70%; a bright band such as [0.55, 0.95] isolates white pickets from
 * the lawn showing between them. `px` is a flat [r,g,b, r,g,b, ...] list.
 */
export function robustColor(px: ArrayLike<number>, lo = 0.15, hi = 1 - lo): Rgb | null {
  const n = Math.floor(px.length / 3);
  if (n === 0) return null;
  const idx = Array.from({ length: n }, (_, i) => i);
  const luma = (i: number) =>
    0.2126 * (px[i * 3] ?? 0) + 0.7152 * (px[i * 3 + 1] ?? 0) + 0.0722 * (px[i * 3 + 2] ?? 0);
  idx.sort((a, b) => luma(a) - luma(b));
  const start = Math.min(n - 1, Math.floor(n * lo));
  const end = Math.max(start + 1, Math.ceil(n * hi));
  const kept = idx.slice(start, end);
  const median = (ch: number) => {
    const v = kept.map((i) => px[i * 3 + ch] ?? 0).sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? (v[m] ?? 0) : ((v[m - 1] ?? 0) + (v[m] ?? 0)) / 2;
  };
  return [median(0), median(1), median(2)];
}

/** RGB of every pixel inside `rect` of an RGBA image, flat. */
export function rectPixels(rgba: ArrayLike<number>, width: number, rect: Rect): number[] {
  const [x0, y0, x1, y1] = rect;
  const out: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * 4;
      out.push(rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0);
    }
  return out;
}

/**
 * Group screen pixels by material id. `ids` holds one id per pixel (0 is sky,
 * other ids index the caller's key list). A pixel only counts when its whole
 * 3x3 neighbourhood shares the id, which drops antialiased edges and the
 * half-pixel jitter between the shaded frame and the id pass.
 */
export function pixelsById(
  rgba: ArrayLike<number>,
  ids: ArrayLike<number>,
  width: number,
  height: number,
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const id = ids[i] ?? 0;
      let same = true;
      for (let dy = -1; dy <= 1 && same; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((ids[i + dy * width + dx] ?? -1) !== id) {
            same = false;
            break;
          }
      if (!same) continue;
      let list = out.get(id);
      if (!list) out.set(id, (list = []));
      list.push(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0);
    }
  return out;
}

/**
 * One calibration step: scale the linear tint by how far the rendered colour
 * is from the target, per channel. `damp` < 1 under-corrects so the loop
 * settles through the tone curve instead of oscillating; each step is clamped
 * to [1/maxStep, maxStep] and the tint to [0.005, MAX_TINT].
 */
export function stepTint(tint: Rgb, target8: Rgb, measured8: Rgb, damp = 0.8, maxStep = 3): Rgb {
  const t = rgb8ToLinear(target8);
  const m = rgb8ToLinear(measured8);
  return tint.map((v, i) => {
    const ratio = Math.max(1e-4, t[i] ?? 0) / Math.max(1e-4, m[i] ?? 0);
    const step = Math.min(maxStep, Math.max(1 / maxStep, ratio ** damp));
    return Math.min(MAX_TINT, Math.max(0.005, v * step));
  }) as Rgb;
}

/** Mean absolute 0..255 sRGB error between two colours. */
export function colorError(a: Rgb, b: Rgb): number {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

/** Relative luminance of a linear colour. */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * One exposure factor between two sets of 0..255 sRGB colours: the median, in
 * log space, of the per-key luminance ratio `rendered / target`. Keys missing
 * from either side, or black, are skipped. Returns 1 when nothing pairs up.
 */
export function exposureBetween(
  rendered: Record<string, Rgb | null>,
  targets: Record<string, Rgb>,
): number {
  const logs: number[] = [];
  for (const [key, t] of Object.entries(targets)) {
    const r = rendered[key];
    if (!r) continue;
    const lt = luminance(rgb8ToLinear(t));
    const lr = luminance(rgb8ToLinear(r));
    if (lt > 1e-4 && lr > 1e-4) logs.push(Math.log(lr / lt));
  }
  if (logs.length === 0) return 1;
  logs.sort((a, b) => a - b);
  const m = logs.length >> 1;
  const mid = logs.length % 2 ? (logs[m] ?? 0) : ((logs[m - 1] ?? 0) + (logs[m] ?? 0)) / 2;
  return Math.exp(mid);
}

/** A 0..255 sRGB target scaled by a linear exposure factor, clamped to 255. */
export function exposeTarget(target8: Rgb, exposure: number): Rgb {
  return rgb8ToLinear(target8).map((v) =>
    Math.round(Math.min(1, linearToSrgb(v * exposure)) * 255),
  ) as Rgb;
}

/**
 * The colour calibration aims for: the panorama sample's chromaticity (hue
 * and saturation, as linear channel ratios) at a luminance part way between
 * the classic render and the exposed panorama, in log space. `weight` 1 is the
 * exposed panorama exactly; 0 keeps the classic brightness. The panorama
 * rectangles often sit in cast shadow or backlight, so a full luminance match
 * turns sunlit lawns black and pale paint chalky; the blend keeps each
 * surface's colour from the panorama and its brightness readable in the
 * game's light. Without a classic measurement it falls back to exposeTarget.
 */
export function blendGoal(pano8: Rgb, classic8: Rgb | null, exposure: number, weight = 0.5): Rgb {
  if (!classic8) return exposeTarget(pano8, exposure);
  const p = rgb8ToLinear(pano8);
  const lp = luminance(p);
  if (lp <= 1e-6) return exposeTarget(pano8, exposure);
  const lc = Math.max(1e-6, luminance(rgb8ToLinear(classic8)));
  const lg = Math.exp((1 - weight) * Math.log(lc) + weight * Math.log(lp * exposure));
  return p.map((v) => Math.round(Math.min(1, linearToSrgb((v * lg) / lp)) * 255)) as Rgb;
}

/** The committed palette, validated once at load. */
export const WORLDLABS_SKIN: SkinPalette = parsePalette(paletteJson);

/** The palette for a load: the World Labs skin, or null for the classic colours. */
export function paletteFor(mode: SkinMode): SkinPalette | null {
  return mode === "worldlabs" ? WORLDLABS_SKIN : null;
}

/**
 * Lighting preset (render/lighting-presets.ts) for a load. The skinned
 * procedural map wears the World Labs look; the classic skin and the splat map
 * keep the shipped golden hour.
 */
export function lightingPresetFor(map: unknown, skin: unknown): string {
  return map !== "worldlabs" && normalizeSkinMode(skin) === "worldlabs"
    ? "worldlabs"
    : "desert-golden-hour";
}
