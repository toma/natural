/**
 * Configuration and placement math for the optional photoreal splat backdrop.
 *
 * The backdrop is distant scenery drawn BEHIND and AROUND the playable map. The
 * procedural/glTF map stays the single source of truth for gameplay and
 * collision; the backdrop only fills the horizon beyond the walls. It is OFF by
 * default and ships NO world: set `BACKDROP_WORLD` below to your own capture to
 * turn it on.
 *
 * Rendering uses Spark (@sparkjsdev/spark), an open-source three.js Gaussian
 * splat renderer. Spark is an OPTIONAL dependency, imported at runtime only when
 * the backdrop is set to 'splat'. Install it to enable splats:
 *
 *   bun add @sparkjsdev/spark
 *
 * If Spark is absent, the splat fails to load, or WebGL is insufficient, the
 * backdrop falls back to the panorama image, and then to the procedural sky.
 */

/** Backdrop quality, also the persisted settings value. */
export type BackdropMode = "splat" | "pano" | "off";

export const BACKDROP_MODES: readonly BackdropMode[] = ["splat", "pano", "off"];

/** Metadata from a World Labs `world.json` (or any equivalent capture). */
export interface WorldMeta {
  /** Multiply raw splat coordinates by this to get metres. */
  metricScaleFactor: number;
  /** Metric height of the captured ground plane, subtracted to sit it at y=0. */
  groundPlaneOffset: number;
}

/** Manual alignment, applied AFTER metric scaling and the Y-up flip. */
export interface BackdropTransform {
  /** Extra world offset in metres, [x, y, z]. */
  position?: [number, number, number];
  /** Extra Euler rotation in radians, [x, y, z], applied in XYZ order. */
  rotation?: [number, number, number];
  /** Extra uniform scale multiplier on top of `metricScaleFactor`. */
  scale?: number;
}

/**
 * One world the backdrop can load. Every field is a URL the browser can fetch
 * (served from `assets/`, or anywhere). `splatLow` is used on the low preset,
 * `splatHigh` otherwise; `pano` is the equirectangular fallback.
 */
export interface BackdropWorld {
  splatHigh: string;
  splatLow: string;
  pano: string;
  /** URL of the `world.json` holding metric_scale_factor / ground_plane_offset. */
  meta: string;
  /** Flip a Y-down/OpenCV capture to three.js Y-up. Defaults to true. */
  flipToYUp?: boolean;
  /** Manual nudges filled in after checking orientation and fit on screen. */
  transform?: BackdropTransform;
}

/**
 * THE SINGLE ENTRY TO EDIT to point the backdrop at a world.
 *
 * Leave it `null` to keep the backdrop disabled and ship no world (the state in
 * this repo). To enable it, set every URL to your OWN world, for example:
 *
 *   export const BACKDROP_WORLD: BackdropWorld | null = {
 *     splatHigh: "/assets/worldlabs/my-world_500k.spz",
 *     splatLow: "/assets/worldlabs/my-world_150k.spz",
 *     pano: "/assets/worldlabs/my-world_pano.jpg",
 *     meta: "/assets/worldlabs/world.json",
 *     flipToYUp: true,
 *     transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
 *   };
 *
 * See assets/worldlabs/README.md for the fetch path and alignment steps.
 */
export const BACKDROP_WORLD: BackdropWorld | null = null;

/** Playable map bounds are hidden from the backdrop plus this extra metre band. */
export const DEFAULT_CROP_MARGIN = 6;

/** Coerce an untrusted value (URL param, stored settings) to a valid mode. */
export function normalizeBackdropMode(raw: unknown, fallback: BackdropMode = "off"): BackdropMode {
  return BACKDROP_MODES.find((mode) => mode === raw) ?? fallback;
}

/** The splat file for a quality preset: the light one on 'low', else the full one. */
export function pickSplatUrl(world: BackdropWorld, quality: string): string {
  return quality === "low" ? world.splatLow : world.splatHigh;
}

/** Parse a raw `world.json` object into `WorldMeta` with safe fallbacks. */
export function parseWorldMeta(raw: unknown): WorldMeta {
  const obj: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    metricScaleFactor: num(obj.metric_scale_factor, 1),
    groundPlaneOffset: num(obj.ground_plane_offset, 0),
  };
}

export interface PlacedTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

/**
 * Compose the splat placement from the capture metadata plus manual nudges.
 *
 * Scale is `metric_scale_factor` (times any manual multiplier). A Y-down capture
 * is rolled 180 degrees about X to stand upright in three.js; after that roll the
 * ground sits above the origin, so it is dropped by the metric ground offset.
 * The manual `transform` is then added on top for fine alignment by hand.
 */
export function placeBackdrop(
  meta: WorldMeta,
  opts: { flipToYUp?: boolean; transform?: BackdropTransform } = {},
): PlacedTransform {
  const flip = opts.flipToYUp ?? true;
  const t = opts.transform ?? {};
  const scale = meta.metricScaleFactor * (t.scale ?? 1);
  const baseRotX = flip ? Math.PI : 0;
  const groundY = flip ? meta.groundPlaneOffset : -meta.groundPlaneOffset;
  const [px, py, pz] = t.position ?? [0, 0, 0];
  const [rx, ry, rz] = t.rotation ?? [0, 0, 0];
  return {
    position: [px, groundY + py, pz],
    rotation: [baseRotX + rx, ry, rz],
    scale,
  };
}

export interface CropBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * True when a world-space point lies inside the playable map expanded by
 * `margin`. Splats inside this box are hidden so the backdrop never paints a
 * duplicate of the play area over the real geometry: it only fills the distance.
 */
export function insideCropBounds(
  x: number,
  z: number,
  bounds: CropBounds,
  margin: number,
): boolean {
  return (
    x > bounds.minX - margin &&
    x < bounds.maxX + margin &&
    z > bounds.minZ - margin &&
    z < bounds.maxZ + margin
  );
}
