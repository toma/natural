/**
 * The World Labs horizon ring for the skinned procedural map.
 *
 * `tools/worldlabs-horizon.mjs` crops the mesa band out of the World Labs
 * panorama (culdesac_pano.jpg), paints out the near objects that stand in it
 * (utility poles, wires, antennas, the water tower), replaces the town below
 * the mesa base with a soft haze strip, cuts the sky out into alpha and writes
 * `assets/worldlabs/skins/horizon.png` plus `horizon.json`. The sky dome samples
 * that strip at the panorama's own angular scale, so the mesas sit at the same
 * height above the horizon as they do in the World Labs world.
 *
 * The image operations work on plain RGBA byte arrays so the tool and the
 * tests share one copy.
 */

import horizonJson from "../../assets/worldlabs/skins/horizon.json";

/** Panorama size in pixels (equirect, 2:1). */
export const PANO_SIZE: readonly [number, number] = [4608, 2304];

/** A run of panorama columns, end exclusive. */
export type Span = [number, number];

export interface HorizonRecipe {
  /** Panorama rows cropped into the strip, end exclusive. */
  rows: Span;
  /** First strip row (panorama row) replaced by the haze base. */
  baseRow: number;
  /** Narrow objects (poles, antennas, wire runs): interpolated across. */
  bridge: Span[];
  /** Wide objects: replaced, in order, by a feathered copy of clean columns. */
  clone: Array<{ span: Span; from: number }>;
  /** Feather width of a clone, in columns. */
  feather: number;
  /** Horizontal blur radius of the haze base, in columns. */
  baseBlur: number;
  /** Strip rows whose per-column median is the reference sky for the ridge mask. */
  skyRows: Span;
  /** Columns either side of the horizontal median that smooths the reference sky. */
  skyRadius: number;
  /** Relative luminance drop below the sky that ramps alpha from 0 to 1. */
  ridge: Span;
  /**
   * Far ranges laid behind the cut strip where the panorama's horizon is flat
   * (the sunward haze plain): the `from` columns, resampled to `span`, squashed
   * toward the base by `scale` and hazed toward the base colour by `haze`.
   */
  ghost: Array<{ span: Span; from: Span; scale: number; haze: number; feather: number }>;
}

/** The recipe the shipped strip was cut with (see the tool). */
export const HORIZON_RECIPE: HorizonRecipe = {
  rows: [880, 1062],
  baseRow: 1048,
  bridge: [
    [1238, 1284],
    [1700, 1894],
    [3563, 3587],
  ],
  clone: [
    { span: [1958, 1998], from: 2002 },
    { span: [2094, 2154], from: 2032 },
    { span: [2250, 2376], from: 2122 },
    { span: [3112, 3168], from: 3054 },
  ],
  feather: 14,
  baseBlur: 120,
  skyRows: [10, 30],
  skyRadius: 150,
  ridge: [0.07, 0.22],
  ghost: [{ span: [640, 1960], from: [1935, 3330], scale: 0.62, haze: 0.38, feather: 160 }],
};

export interface HorizonMeta {
  version: 1;
  /** Served path of the strip image. */
  url: string;
  /** Strip size in pixels. */
  size: [number, number];
  /** Elevation of the strip's bottom and top edge, radians. */
  elevation: [number, number];
  /** Panorama u (0..1) of the sun, used to line the strip up with the game sun. */
  sunU: number;
  /** Mean linear luminance of the strip's top rows (the panorama's own sky there). */
  skyLuminance: number;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(isNum);

/** Validate horizon.json. */
export function parseHorizon(json: unknown): HorizonMeta {
  if (!isObj(json) || json.version !== 1) throw new Error("horizon: expected version 1");
  const { url, size, elevation, sunU, skyLuminance } = json;
  if (typeof url !== "string" || !url) throw new Error("horizon: bad url");
  if (!isPair(size) || size[0] < 1 || size[1] < 1) throw new Error("horizon: bad size");
  if (!isPair(elevation) || elevation[1] <= elevation[0]) throw new Error("horizon: bad elevation");
  if (!isNum(sunU) || sunU < 0 || sunU >= 1) throw new Error("horizon: bad sunU");
  if (!isNum(skyLuminance) || skyLuminance <= 0) throw new Error("horizon: bad skyLuminance");
  return { version: 1, url, size, elevation, sunU, skyLuminance };
}

/** The shipped horizon strip. */
export const WORLDLABS_HORIZON: HorizonMeta = parseHorizon(horizonJson);

/** Elevation (radians) of a panorama row. Row 0 is the zenith. */
export function rowElevation(row: number, height = PANO_SIZE[1]): number {
  return (0.5 - row / height) * Math.PI;
}

/**
 * Texture u offset that turns the dome's azimuth into the strip's u so the
 * panorama's sun column lands on the game sun. The dome maps a direction to
 * `u = atan(z, x) / 2pi + 0.5 + yaw`.
 */
export function horizonYaw(sunDir: { x: number; z: number }, sunU: number): number {
  const u = Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5;
  return wrap01(sunU - u);
}

export function wrap01(v: number): number {
  return v - Math.floor(v);
}

/**
 * Brightness scale for the strip: the dome multiplies panorama linear values
 * by this times the live sky luminance behind each texel, so the strip's own
 * sky lands on the live sky (times `gain`) and the ridges keep their contrast.
 */
export function horizonScale(meta: HorizonMeta, gain = 1): number {
  return Math.max(0, gain) / meta.skyLuminance;
}

/** An RGBA image: `data.length === width * height * 4`. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

function idx(img: Rgba, x: number, y: number): number {
  return (y * img.width + x) * 4;
}

/**
 * Replace columns [x0, x1) on rows [0, rowEnd) by a linear blend between the
 * columns just outside the span. Suits thin vertical objects in smooth sky.
 */
export function bridgeSpan(img: Rgba, span: Span, rowEnd = img.height): void {
  const [x0, x1] = span;
  if (x0 < 1 || x1 >= img.width || x1 <= x0) throw new Error("bridgeSpan: span out of range");
  const d = img.data;
  for (let y = 0; y < Math.min(rowEnd, img.height); y++) {
    const a = idx(img, x0 - 1, y);
    const b = idx(img, x1, y);
    for (let x = x0; x < x1; x++) {
      const t = (x - x0 + 1) / (x1 - x0 + 1);
      const o = idx(img, x, y);
      for (let c = 0; c < 4; c++) d[o + c] = Math.round(d[a + c]! * (1 - t) + d[b + c]! * t);
    }
  }
}

/**
 * Replace columns `span` with the columns starting at `from`, read from
 * `source` (a copy that the clone does not write to), blended in over `feather` columns at each end.
 */
export function cloneSpan(
  img: Rgba,
  source: Rgba,
  span: Span,
  from: number,
  feather: number,
  rowEnd = img.height,
): void {
  const [x0, x1] = span;
  const w = x1 - x0;
  if (x0 < 0 || x1 > img.width || w <= 0 || from < 0 || from + w > img.width)
    throw new Error("cloneSpan: span out of range");
  const d = img.data;
  for (let y = 0; y < Math.min(rowEnd, img.height); y++) {
    for (let i = 0; i < w; i++) {
      const edge = Math.min(i + 1, w - i);
      const t = feather > 0 ? Math.min(1, edge / feather) : 1;
      const o = idx(img, x0 + i, y);
      const s = idx(source, from + i, y);
      for (let c = 0; c < 4; c++)
        d[o + c] = Math.round(d[o + c]! * (1 - t) + source.data[s + c]! * t);
    }
  }
}

/**
 * Rows from `row` down become a haze strip: the mean of the `sample` rows above
 * `row`, blurred horizontally by `radius` (wrapping, the strip is a ring), and
 * eased toward that strip's own mean luminance with depth so the base reads as
 * distant flats in haze.
 */
export function hazeBase(img: Rgba, row: number, radius: number, sample = 6): void {
  if (row < sample || row > img.height) throw new Error("hazeBase: row out of range");
  const w = img.width;
  const mean = new Float32Array(w * 3);
  for (let x = 0; x < w; x++) {
    for (let y = row - sample; y < row; y++) {
      const o = idx(img, x, y);
      for (let c = 0; c < 3; c++) mean[x * 3 + c] = mean[x * 3 + c]! + img.data[o + c]! / sample;
    }
  }
  const blur = new Float32Array(w * 3);
  const n = 2 * radius + 1;
  for (let x = 0; x < w; x++) {
    for (let k = -radius; k <= radius; k++) {
      const xx = (((x + k) % w) + w) % w;
      for (let c = 0; c < 3; c++) blur[x * 3 + c] = blur[x * 3 + c]! + mean[xx * 3 + c]! / n;
    }
  }
  const flat = [0, 0, 0];
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) flat[c] = flat[c]! + blur[x * 3 + c]! / w;
  const depth = Math.max(1, img.height - row);
  for (let y = row; y < img.height; y++) {
    const t = 0.5 * ((y - row + 1) / depth);
    for (let x = 0; x < w; x++) {
      const o = idx(img, x, y);
      for (let c = 0; c < 3; c++)
        img.data[o + c] = Math.round(blur[x * 3 + c]! * (1 - t) + flat[c]! * t);
      img.data[o + 3] = 255;
    }
  }
  // Soften the seam between the mesas and the base over a few rows.
  for (let y = Math.max(0, row - 3); y < row; y++) {
    const t = (y - (row - 4)) / 4;
    for (let x = 0; x < w; x++) {
      const o = idx(img, x, y);
      for (let c = 0; c < 3; c++)
        img.data[o + c] = Math.round(img.data[o + c]! * (1 - t) + blur[x * 3 + c]! * t);
    }
  }
}

function srgbLin(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lumAt(img: Rgba, x: number, y: number): number {
  const o = idx(img, x, y);
  return (
    0.2126 * srgbLin(img.data[o]!) +
    0.7152 * srgbLin(img.data[o + 1]!) +
    0.0722 * srgbLin(img.data[o + 2]!)
  );
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Cut the sky out of the strip: alpha follows how far each pixel's luminance
 * drops below the column's reference sky (a horizontally smoothed median of
 * `skyRows`), which separates the sunlit mesas from the creamy haze. Every
 * column is solid from its first clearly solid pixel down, and only the few
 * rows just above it may be partly transparent, so cloud wisps and haze
 * speckle higher up never survive. Rows from `solidFrom` down are opaque.
 * Fully transparent pixels take the colour of the ridge below them so
 * filtering never bleeds sky into the outline. Writes alpha in place.
 */
export function ridgeAlpha(img: Rgba, recipe: HorizonRecipe, solidFrom: number): void {
  const { width: w, height: h } = img;
  const [r0, r1] = recipe.skyRows;
  if (r0 < 0 || r1 > h || r1 <= r0) throw new Error("ridgeAlpha: bad sky rows");
  const col = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const v: number[] = [];
    for (let y = r0; y < r1; y++) v.push(lumAt(img, x, y));
    col[x] = median(v);
  }
  const sky = new Float32Array(w);
  const r = recipe.skyRadius;
  for (let x = 0; x < w; x++) {
    const v: number[] = [];
    for (let k = -r; k <= r; k++) v.push(col[(((x + k) % w) + w) % w]!);
    sky[x] = Math.max(1e-4, median(v));
  }
  const [a, b] = recipe.ridge;
  for (let x = 0; x < w; x++) {
    const alpha = new Float32Array(h);
    let first = Math.min(h, solidFrom);
    for (let y = 0; y < h; y++) {
      alpha[y] = smooth(a, b, (sky[x]! - lumAt(img, x, y)) / sky[x]!);
      if (alpha[y]! > 0.6 && y < first) first = y;
    }
    for (let y = 0; y < h; y++) {
      const v = y >= first ? 1 : y >= first - 4 ? alpha[y]! : 0;
      img.data[idx(img, x, y) + 3] = Math.round(v * 255);
    }
    const fill = idx(img, x, Math.min(h - 1, first));
    for (let y = 0; y < first - 4; y++) {
      const o = idx(img, x, y);
      for (let c = 0; c < 3; c++) img.data[o + c] = img.data[fill + c]!;
    }
  }
}

/**
 * Lay a squashed, hazed copy of the columns `from` behind the strip on
 * columns `span`: existing pixels stay in front (alpha "over"), so the copy
 * only shows where the strip is open sky. `base` is the first haze-base row;
 * the copy is scaled toward it so it reads as a lower, farther range.
 */
export function ghostRange(img: Rgba, g: HorizonRecipe["ghost"][number], base: number): void {
  const [x0, x1] = g.span;
  const [f0, f1] = g.from;
  if (x0 < 0 || x1 > img.width || x1 <= x0 || f0 < 0 || f1 > img.width || f1 <= f0)
    throw new Error("ghostRange: span out of range");
  if (!(g.scale > 0) || base < 1 || base > img.height)
    throw new Error("ghostRange: bad scale or base");
  const src: Rgba = { width: img.width, height: img.height, data: img.data.slice() };
  const d = img.data;
  const w = x1 - x0;
  for (let i = 0; i < w; i++) {
    const sx = Math.min(f1 - 1, f0 + Math.floor((i / w) * (f1 - f0)));
    const edge = Math.min(i + 1, w - i);
    const fade = g.feather > 0 ? smooth(0, 1, edge / g.feather) : 1;
    const hb = idx(src, sx, base - 1);
    for (let y = 0; y < base; y++) {
      const sy = Math.round(base - (base - y) / g.scale);
      if (sy < 0) continue;
      const s = idx(src, sx, sy);
      const ga = (src.data[s + 3]! / 255) * fade;
      if (ga <= 0) continue;
      const o = idx(img, x0 + i, y);
      const a = d[o + 3]! / 255;
      const na = a + ga * (1 - a);
      for (let c = 0; c < 3; c++) {
        const gc = src.data[s + c]! * (1 - g.haze) + src.data[hb + c]! * g.haze;
        d[o + c] = Math.round((d[o + c]! * a + gc * ga * (1 - a)) / na);
      }
      d[o + 3] = Math.round(na * 255);
    }
  }
}

/** Apply a recipe to a strip cropped at `recipe.rows`. Returns a new image. */
export function cleanStrip(strip: Rgba, recipe: HorizonRecipe = HORIZON_RECIPE): Rgba {
  const out: Rgba = { width: strip.width, height: strip.height, data: strip.data.slice() };
  const rowEnd = recipe.baseRow - recipe.rows[0];
  for (const s of recipe.bridge) bridgeSpan(out, s, rowEnd);
  for (const c of recipe.clone) {
    // Each clone reads the strip as the earlier steps left it.
    const src: Rgba = { width: out.width, height: out.height, data: out.data.slice() };
    cloneSpan(out, src, c.span, c.from, recipe.feather, rowEnd);
  }
  hazeBase(out, rowEnd, recipe.baseBlur);
  ridgeAlpha(out, recipe, rowEnd);
  for (const g of recipe.ghost) ghostRange(out, g, rowEnd);
  return out;
}

/** Mean linear luminance of rows [0, rows) of an sRGB image. */
export function topLuminance(img: Rgba, rows: number): number {
  let sum = 0;
  const n = Math.min(rows, img.height);
  for (let y = 0; y < n; y++) for (let x = 0; x < img.width; x++) sum += lumAt(img, x, y);
  return n > 0 ? sum / (n * img.width) : 0;
}
