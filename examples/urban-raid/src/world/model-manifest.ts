/**
 * Typed manifest and URL plumbing for the optional CC0 glTF models.
 *
 * The models are a progressive enhancement: they are fetched, not committed
 * (see assets/ASSETS.md and tools/fetch-assets.mjs), and a missing model falls
 * back to procedural dressing. This module centralises the per-model metadata
 * (provenance, licence, default LOD distance and scale) and the URL layout so
 * the loader, the fetch script, and the credits cannot drift apart. It is pure
 * data plus pure helpers, so it is unit-tested without a GPU.
 */

export type ModelSize = "1k" | "2k";

export interface ModelDef {
  /** Folder and file stem under assets/models/. */
  id: string;
  /** Provenance URL. */
  source: string;
  author: string;
  /** Only CC0 assets belong here; the validator enforces it. */
  license: "CC0-1.0";
  /** LOD cull distance in metres when no per-placement override is given. */
  far: number;
  /** Default uniform scale when placed without an override. */
  scale: number;
}

/** The CC0 model set, all Poly Haven, all CC0 1.0 (https://polyhaven.com/license). */
export const MODELS: readonly ModelDef[] = [
  {
    id: "GreenChair_01",
    source: "https://polyhaven.com/a/GreenChair_01",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 45,
    scale: 1,
  },
  {
    id: "metal_trash_can",
    source: "https://polyhaven.com/a/metal_trash_can",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 45,
    scale: 1,
  },
  {
    id: "potted_plant_01",
    source: "https://polyhaven.com/a/potted_plant_01",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 45,
    scale: 1,
  },
  {
    id: "shrub_01",
    source: "https://polyhaven.com/a/shrub_01",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 55,
    scale: 1,
  },
  {
    id: "street_lamp_01",
    source: "https://polyhaven.com/a/street_lamp_01",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 80,
    scale: 1,
  },
  {
    id: "fire_hydrant",
    source: "https://polyhaven.com/a/fire_hydrant",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 50,
    scale: 1,
  },
  {
    id: "covered_car",
    source: "https://polyhaven.com/a/covered_car",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 70,
    scale: 1,
  },
  {
    id: "modular_electricity_poles",
    source: "https://polyhaven.com/a/modular_electricity_poles",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 90,
    scale: 1,
  },
  {
    id: "power_box_01",
    source: "https://polyhaven.com/a/power_box_01",
    author: "Poly Haven",
    license: "CC0-1.0",
    far: 60,
    scale: 1,
  },
];

export const MODELS_BY_ID: Record<string, ModelDef> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

/** Sentinel model: it ships only with the fetched set, so its presence means `bun run assets` has run. */
export const SENTINEL_MODEL_ID = "covered_car";

export const MODELS_BASE = "/assets/models";

/** URL of a model's glTF for a given map size, e.g. /assets/models/shrub_01/shrub_01_1k.gltf */
export function modelUrl(id: string, opts: { size?: ModelSize; base?: string } = {}): string {
  const size = opts.size ?? "1k";
  const base = opts.base ?? MODELS_BASE;
  return `${base}/${id}/${id}_${size}.gltf`;
}

/** LOD cull distance for a model, falling back when the id is unknown. */
export function modelLodFar(id: string, fallback = 55): number {
  return MODELS_BY_ID[id]?.far ?? fallback;
}

/** Default placement scale for a model, falling back when the id is unknown. */
export function modelScale(id: string, fallback = 1): number {
  return MODELS_BY_ID[id]?.scale ?? fallback;
}

export function isAllCC0(defs: readonly ModelDef[] = MODELS): boolean {
  return defs.every((m) => m.license === "CC0-1.0");
}

/**
 * Return a list of manifest problems (empty when the manifest is sound): every
 * model must be CC0, have a unique id, a provenance URL, and positive LOD and
 * scale. Keeps the committed set honest and the loader's assumptions true.
 */
export function validateManifest(defs: readonly ModelDef[] = MODELS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of defs) {
    if (!m.id) problems.push("a model has no id");
    if (seen.has(m.id)) problems.push(`duplicate model id: ${m.id}`);
    seen.add(m.id);
    if (m.license !== "CC0-1.0") problems.push(`${m.id}: licence is not CC0-1.0`);
    if (!/^https?:\/\//.test(m.source)) problems.push(`${m.id}: source is not a URL`);
    if (!(m.far > 0)) problems.push(`${m.id}: far must be positive`);
    if (!(m.scale > 0)) problems.push(`${m.id}: scale must be positive`);
  }
  return problems;
}
