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
  /**
   * File layout: "gltf" (default) is Poly Haven's .gltf plus .bin and 1K
   * textures, fetched through its API; "glb" is a single binary from `download`.
   */
  format?: "gltf" | "glb";
  /** Direct download URL of the .glb, required when format is "glb". */
  download?: string;
  /** Fetch group, so `bun run assets --only=vehicles` can pull just that set. */
  group?: "vehicles";
}

/**
 * The CC0 model set: Poly Haven props (https://polyhaven.com/license) and
 * Grab3D vehicles (https://grab3d.com/license), all CC0 1.0.
 */
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
  // Period vehicles for the cul-de-sac (see vehicle-models.ts). Grab3D's
  // "lightweight" tier, full 2K PBR binaries; the stock pastel paint is
  // repainted to the skin colour at load time.
  {
    id: "grab3d_school_bus",
    source: "https://grab3d.com/models/vehicles/school-bus/",
    author: "Grab3D",
    license: "CC0-1.0",
    far: 160,
    scale: 1,
    format: "glb",
    download: "https://grab3d.com/dl/school-bus/school-bus.glb",
    group: "vehicles",
  },
  {
    id: "grab3d_1950s_sedan",
    source: "https://grab3d.com/models/vehicles/1950s-sedan/",
    author: "Grab3D",
    license: "CC0-1.0",
    far: 160,
    scale: 1,
    format: "glb",
    download: "https://grab3d.com/dl/1950s-sedan/1950s-sedan.glb",
    group: "vehicles",
  },
  {
    id: "grab3d_1950s_pickup",
    source: "https://grab3d.com/models/vehicles/1950s-pickup-truck/",
    author: "Grab3D",
    license: "CC0-1.0",
    far: 160,
    scale: 1,
    format: "glb",
    download: "https://grab3d.com/dl/1950s-pickup-truck/1950s-pickup-truck.glb",
    group: "vehicles",
  },
];

export const MODELS_BY_ID: Record<string, ModelDef> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

/** Sentinel model: it ships only with the fetched set, so its presence means `bun run assets` has run. */
export const SENTINEL_MODEL_ID = "covered_car";

/** Sentinel for the vehicle set, which `--only=vehicles` can fetch on its own. */
export const VEHICLE_SENTINEL_MODEL_ID = "grab3d_school_bus";

export const MODELS_BASE = "/assets/models";

/**
 * URL of a model for a given map size, e.g. /assets/models/shrub_01/shrub_01_1k.gltf.
 * Single-file glb models ignore the size: /assets/models/<id>/<id>.glb.
 */
export function modelUrl(id: string, opts: { size?: ModelSize; base?: string } = {}): string {
  const size = opts.size ?? "1k";
  const base = opts.base ?? MODELS_BASE;
  if (MODELS_BY_ID[id]?.format === "glb") return `${base}/${id}/${id}.glb`;
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
    if (m.format === "glb" && !/^https:\/\/.+\.glb$/.test(m.download ?? ""))
      problems.push(`${m.id}: glb model needs an https .glb download URL`);
  }
  return problems;
}
