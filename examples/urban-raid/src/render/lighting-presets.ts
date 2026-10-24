/**
 * Generic, content-neutral lighting and colour-grade presets.
 *
 * Two layers live here:
 *   - GRADE_PRESETS: display-referred colourist chains (ASC-CDL slope/offset/
 *     power, split tone, saturation, filmic S-curve). Pure math, so the grade
 *     can be unit-tested and reused by any scene without a GPU.
 *   - LIGHTING_PRESETS: named "looks" that pair a grade with sky and fog hints
 *     (sun hour, aerosol turbidity, horizon murk, cloud cover, fog density) a
 *     renderer can apply. These are plain data: nothing here renders or depends
 *     on a specific level.
 *
 * The grade math is the colourist chain that `render/lut.js` bakes into a 3D
 * LUT; it is factored out here so it is testable and so alternative looks are
 * one data entry rather than a fork of the baker.
 */

export type Triple = [number, number, number];

export interface GradePreset {
  /** ASC-CDL slope, per channel. */
  slope: Triple;
  /** ASC-CDL offset, per channel. */
  offset: Triple;
  /** ASC-CDL power, per channel. */
  power: Triple;
  /** Added to shadows, weighted by (1 - luma). */
  shadowTint: Triple;
  /** Added to highlights, weighted by luma. */
  highlightTint: Triple;
  /** Luminance-preserving saturation. */
  saturation: number;
  /** Contrast as a power about `pivot`. */
  contrast: number;
  /** Display code value the contrast power leaves fixed. */
  pivot: number;
  /** How much chroma the highlights shed, film-shoulder style. */
  highlightDesat: number;
  /** Toe lift in normalised code value, so the darkest corner is not a hole. */
  toe: number;
  /** Shoulder knee in post-contrast units. */
  shoulder: number;
  /** Shoulder softness in the same units as the knee. */
  shoulderSoft: number;
}

const LUM: Triple = [0.2126, 0.7152, 0.0722];

export const GRADE_PRESETS: Record<string, GradePreset> = {
  // Warm, dusty desert grade: hazy golden air, gently warm shadows, a mild red
  // slope bias that warms the whole frame (including the washed sky) without
  // tipping into orange, and highlights warmed hard so a bright sky reads as
  // pale warm dust rather than a hard blue. This is the shipped default.
  default: {
    slope: [1.018, 1.0, 0.953],
    offset: [-0.004, -0.002, 0.002],
    power: [1.0, 1.004, 1.016],
    shadowTint: [0.013, 0.005, -0.008],
    highlightTint: [0.05, 0.023, -0.02],
    saturation: 1.07,
    contrast: 1.36,
    pivot: 0.5,
    highlightDesat: 0.1,
    toe: 0.004,
    shoulder: 0.6,
    shoulderSoft: 1.2,
  },
  // A straighter, cooler-neutral look: no warm bias, slightly cool shadows and
  // warm highlights (the classic split), a touch less contrast. For overcast or
  // interior scenes that should not read as golden hour.
  neutral: {
    slope: [1.0, 1.0, 1.0],
    offset: [-0.003, -0.002, 0.0],
    power: [1.0, 1.0, 1.0],
    shadowTint: [-0.004, 0.0, 0.01],
    highlightTint: [0.016, 0.008, -0.004],
    saturation: 1.04,
    contrast: 1.28,
    pivot: 0.5,
    highlightDesat: 0.12,
    toe: 0.004,
    shoulder: 0.62,
    shoulderSoft: 1.1,
  },
  // The World Labs Atomic Cul-de-sac look: a hazy low-sun desert afternoon.
  // Read off the World Labs panorama and the splat as the game renders it:
  // creamy highlights, lifted warm midtones and shadows that open up instead of
  // crushing, gentle contrast, a warm horizon. Power below one and a raised toe
  // lift the mids and blacks; slope and highlight tint push the top end toward
  // cream; highlight desaturation stops the bright sky going yellow.
  worldlabs: {
    slope: [1.02, 1.0, 0.92],
    offset: [0.01, 0.005, -0.002],
    power: [0.94, 0.95, 0.99],
    shadowTint: [0.018, 0.009, -0.004],
    highlightTint: [0.012, 0.012, -0.012],
    saturation: 1.1,
    contrast: 1.16,
    pivot: 0.45,
    highlightDesat: 0.16,
    toe: 0.022,
    shoulder: 0.58,
    shoulderSoft: 1.3,
  },
  // Flat, cool, low-contrast overcast: a grey-sky day with soft shadows and
  // muted chroma.
  overcast: {
    slope: [0.99, 1.0, 1.015],
    offset: [0.002, 0.002, 0.004],
    power: [1.0, 1.0, 0.996],
    shadowTint: [-0.006, 0.0, 0.012],
    highlightTint: [0.0, 0.004, 0.01],
    saturation: 0.94,
    contrast: 1.18,
    pivot: 0.5,
    highlightDesat: 0.14,
    toe: 0.006,
    shoulder: 0.66,
    shoulderSoft: 1.0,
  },
};

export function resolveGrade(name: string): GradePreset {
  return GRADE_PRESETS[name] ?? GRADE_PRESETS.default!;
}

export interface ShoulderParams {
  k: number;
  s: number;
  norm: number;
}

/**
 * Shoulder constants for a preset: knee, softness, and the normaliser that
 * makes the curve land on 1.0 at input 1.0 (so display white is reachable).
 */
export function shoulderParams(g: GradePreset): ShoulderParams {
  const k = Math.min(0.98, Math.max(0.05, g.shoulder));
  const s = Math.max(1e-3, g.shoulderSoft);
  const cMax = g.pivot * Math.pow(1 / g.pivot, g.contrast);
  const norm = 1 - Math.exp(-Math.max(cMax - k, 1e-3) / s);
  return { k, s, norm };
}

/**
 * Apply the full colourist chain to a single linear-ish display triple.
 * Pure: identical inputs give identical outputs, which is what makes the baked
 * LUT in `lut.js` and these tests agree.
 */
export function applyGrade(rgb: readonly number[], g: GradePreset, sh: ShoulderParams): Triple {
  let r = rgb[0] ?? 0;
  let gg = rgb[1] ?? 0;
  let b = rgb[2] ?? 0;

  r = Math.pow(Math.max(0, r * g.slope[0] + g.offset[0]), g.power[0]);
  gg = Math.pow(Math.max(0, gg * g.slope[1] + g.offset[1]), g.power[1]);
  b = Math.pow(Math.max(0, b * g.slope[2] + g.offset[2]), g.power[2]);

  const l = r * LUM[0] + gg * LUM[1] + b * LUM[2];
  const shadowW = Math.pow(1 - Math.min(1, l), 2.2);
  const highW = Math.pow(Math.min(1, l), 2.0);
  r += g.shadowTint[0] * shadowW + g.highlightTint[0] * highW;
  gg += g.shadowTint[1] * shadowW + g.highlightTint[1] * highW;
  b += g.shadowTint[2] * shadowW + g.highlightTint[2] * highW;

  const l2 = r * LUM[0] + gg * LUM[1] + b * LUM[2];
  r = l2 + (r - l2) * g.saturation;
  gg = l2 + (gg - l2) * g.saturation;
  b = l2 + (b - l2) * g.saturation;

  const hd = g.highlightDesat * Math.pow(Math.min(1, Math.max(0, l2)), 3.0);
  r += (l2 - r) * hd;
  gg += (l2 - gg) * hd;
  b += (l2 - b) * hd;

  const scurve = (x: number): number => {
    const t = Math.max(0, x);
    let c = t <= 0 ? 0 : g.pivot * Math.pow(t / g.pivot, g.contrast);
    if (c > sh.k) {
      c = sh.k + (1 - sh.k) * ((1 - Math.exp(-(c - sh.k) / sh.s)) / sh.norm);
    }
    return g.toe + (1 - g.toe) * Math.min(1, Math.max(0, c));
  };
  return [scurve(r), scurve(gg), scurve(b)];
}

/** Sky and fog hints a renderer can apply alongside a grade. All optional-safe. */
export interface SkyHints {
  /** Local solar hour, 0..24. */
  hour: number;
  /** Aerosol turbidity: 1 clear, 2-3 hazy, 5 dust. */
  turbidity: number;
  /** Horizon murk, 0..1: how far the distance washes to pale dust. */
  horizonMurk: number;
  /** Cloud coverage, 0..1. */
  cloudCoverage: number;
  /** Ground fog density multiplier. */
  fogDensity: number;
  /** High cirrus coverage, 0..1. Omitted keeps the sky's own. */
  cirrusCoverage?: number;
  /**
   * Dust veil over the open sky: [r, g, b, amount]. After the sky roll-off the
   * dome mixes toward the rgb colour, given in units of the roll-off knee, by
   * `amount` (0 to 1), warmer near the horizon and cooler overhead. The rgb
   * leans blue because the worldlabs grade pulls blue down afterwards.
   */
  skyVeil?: [number, number, number, number];
  /** Horizon ring brightness over the sky behind it (1 = the panorama's contrast). */
  horizonGain?: number;
  /** Horizon ring vertical scale over the panorama's angular height. */
  horizonLift?: number;
  /** Ring aerial perspective: [haze over the whole ring, extra haze at its base], 0 to 1. */
  horizonHaze?: [number, number];
  /**
   * Horizon dust band laid over far geometry and the base of the sky:
   * [near metres, far metres, amount 0 to 1, top elevation as a sine].
   */
  dust?: [number, number, number, number];
  /** Dust band colour, in units of the sky roll-off knee like skyVeil. */
  dustColor?: [number, number, number];
}

/** Renderer setting overrides that belong to a look (see render/index.js settings). */
export interface RenderHints {
  /** Auto-exposure key: above 1 meters the frame brighter. */
  exposureKey?: number;
  /** Hemispheric sky fill, fraction of the key. */
  skyFill?: number;
  /** Warm street bounce, fraction of the key. */
  groundFill?: number;
  /** Warm anti-sun wrap, fraction of the key. */
  bounceFill?: number;
  /** Chroma push on the skylight fill hue: 1 keeps the sky average, under 1 greys it. */
  skyFillChroma?: number;
  /** Display-space vignette amplitude. */
  vignette?: number;
  /** Sun shadow penumbra softness. */
  sunSoftness?: number;
  /** Ground-truth AO world radius in metres. */
  aoRadius?: number;
  /** Ground-truth AO strength. */
  aoIntensity?: number;
  /** Screen-space contact shadow ray length in metres. */
  contactLength?: number;
  /** Screen-space contact shadow strength. */
  contactStrength?: number;
}

export interface LightingPreset {
  /** Key into GRADE_PRESETS. */
  grade: string;
  sky: SkyHints;
  /** Optional renderer overrides; omitted keeps the renderer's defaults. */
  render?: RenderHints;
}

export const LIGHTING_PRESETS: Record<string, LightingPreset> = {
  // Warm hazy desert golden hour: the shipped look. Late-afternoon sun, dusty
  // air, a washed pale horizon, few clouds.
  "desert-golden-hour": {
    grade: "default",
    sky: { hour: 16.5, turbidity: 5.3, horizonMurk: 0.46, cloudCoverage: 0.08, fogDensity: 1.15 },
  },
  // Clear neutral midday: high sun, clean air, a crisp horizon.
  "neutral-noon": {
    grade: "neutral",
    sky: { hour: 12.0, turbidity: 2.2, horizonMurk: 0.2, cloudCoverage: 0.12, fogDensity: 0.6 },
  },
  // The World Labs world's look, worn by the skinned procedural map: a lower
  // mid-afternoon sun than the golden hour (the panorama's sun stands about 38
  // degrees up), dust-heavy air with a creamy horizon, no cumulus, a trace of
  // cirrus, and more fill so shadows read soft and warm.
  worldlabs: {
    grade: "worldlabs",
    sky: {
      hour: 16.0,
      turbidity: 7.5,
      horizonMurk: 0.62,
      cloudCoverage: 0,
      // Enough aerial perspective that the far houses and the range step back.
      fogDensity: 0.6,
      cirrusCoverage: 0.06,
      skyVeil: [5.9, 6.0, 7.0, 0.9],
      horizonGain: 1.0,
      horizonLift: 2.2,
      horizonHaze: [0.05, 0.3],
      dust: [80, 450, 0.9, 0.06],
      dustColor: [5.0, 5.1, 5.5],
    },
    render: {
      exposureKey: 1.22,
      skyFill: 0.62,
      skyFillChroma: 0.55,
      groundFill: 0.07,
      bounceFill: 0.04,
      vignette: 0.16,
      // A crisper penumbra than 0.06 (which read soft-focus at 10 m), with
      // AO and contact shadows strong enough that props, kerbs and wheels sit
      // on the ground: the high fill here lifts every shadow, so occlusion is
      // what separates an object from what it rests on.
      sunSoftness: 0.045,
      aoRadius: 1.6,
      aoIntensity: 1.35,
      contactLength: 0.6,
      contactStrength: 1.25,
    },
  },
  // Flat overcast: soft, cool, low contrast under a grey sky.
  overcast: {
    grade: "overcast",
    sky: { hour: 11.0, turbidity: 3.4, horizonMurk: 0.3, cloudCoverage: 0.85, fogDensity: 0.9 },
  },
};

export function resolveLightingPreset(name: string): LightingPreset {
  return LIGHTING_PRESETS[name] ?? LIGHTING_PRESETS["desert-golden-hour"]!;
}
