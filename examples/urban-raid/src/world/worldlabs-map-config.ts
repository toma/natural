/**
 * Configuration and pure math for the World Labs map: the captured culdesac
 * splat drawn as the visible level, with its exported collider mesh as the
 * physics and navigation geometry.
 *
 * The splat and the collider share one raw frame (Y-down, OpenCV style, in
 * capture units). Both get the same placement from `placeBackdrop`: scale by
 * `metric_scale_factor`, rotate 180 degrees about X to make Y point up, then lift
 * by `ground_plane_offset` so the captured ground sits at y=0.
 */
import { pickSplatUrl, placeBackdrop } from "./backdrop-config.ts";
import type { PlacedTransform, BackdropWorld, WorldMeta } from "./backdrop-config.ts";

/** Which level the game builds. */
export type MapMode = "worldlabs" | "procedural";

export const MAP_MODES: readonly MapMode[] = ["worldlabs", "procedural"];

/** Normal play uses the procedural map; the World Labs map is opt-in with `?map=worldlabs`. */
export const DEFAULT_MAP_MODE: MapMode = "procedural";

/** Coerce an unknown value (URL param, stored setting) to a map mode. */
export function normalizeMapMode(value: unknown, fallback: MapMode = DEFAULT_MAP_MODE): MapMode {
  return MAP_MODES.find((mode) => mode === value) ?? fallback;
}

/**
 * The map for this load. An explicit `?map=` always wins; otherwise every run,
 * capture included, gets the procedural map.
 */
export function resolveMapMode(opts: { param?: string | null; capture?: boolean }): MapMode {
  return normalizeMapMode(opts.param ?? undefined, DEFAULT_MAP_MODE);
}

export interface WorldLabsMap extends BackdropWorld {
  /** URL of the collision mesh exported with the world (same raw frame as the splat). */
  collider: string;
}

export const WORLDLABS_MAP: WorldLabsMap = {
  splatHigh: "/assets/worldlabs/culdesac_500k.spz",
  splatLow: "/assets/worldlabs/culdesac_150k.spz",
  pano: "/assets/worldlabs/culdesac_pano.jpg",
  meta: "/assets/worldlabs/world.json",
  collider: "/assets/worldlabs/culdesac_collider.glb",
  flipToYUp: true,
};

/** Splat URL for a quality preset: the 150k splat on low, the 500k splat otherwise. */
export function worldLabsSplatUrl(quality: string, map: WorldLabsMap = WORLDLABS_MAP): string {
  return pickSplatUrl(map, quality);
}

/** Placement shared by the splat and the collider. */
export function worldLabsPlacement(meta: WorldMeta, map: WorldLabsMap = WORLDLABS_MAP) {
  return placeBackdrop(meta, map);
}

/**
 * Map a raw capture-space point to world metres with a placement, using the
 * same T * R(XYZ) * S order three.js uses for an Object3D.
 */
export function placePoint(
  placement: PlacedTransform,
  point: readonly [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = placement.rotation;
  let x = point[0] * placement.scale;
  let y = point[1] * placement.scale;
  let z = point[2] * placement.scale;
  // Euler XYZ as a matrix is Rx * Ry * Rz, so Z applies first.
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  return [x + placement.position[0], y + placement.position[1], z + placement.position[2]];
}

/**
 * Radius in metres around the capture origin that counts as the play area. The
 * capture is sharp near its origin and breaks up with distance, and the collider
 * reaches hundreds of metres out, so navigation and spawns stay inside this.
 */
export const WORLDLABS_PLAY_RADIUS = 32;

/** Vertical extent of the play area in metres, used for the navigation bounds. */
export const WORLDLABS_PLAY_HEIGHT: readonly [number, number] = [-6, 24];

/** A spawn location to test against the collider, in world metres. */
export interface SpawnCandidate {
  x: number;
  z: number;
  /** Facing in radians, three.js yaw (0 looks down -Z). */
  yaw: number;
}

/**
 * Deterministic spawn candidates: the capture origin first, looking the way the
 * capture camera looked, then rings around it facing back toward the centre.
 */
export function spawnCandidates(
  radii: readonly number[] = [6, 11, 16, 21, 26],
  perRing = 12,
): SpawnCandidate[] {
  const out: SpawnCandidate[] = [{ x: 0, z: 0, yaw: 0 }];
  radii.forEach((r, ring) => {
    for (let i = 0; i < perRing; i++) {
      // offset alternate rings so the candidates do not line up radially
      const a = ((i + (ring % 2) * 0.5) / perRing) * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      // three.js yaw: forward is (-sin yaw, -cos yaw); face the origin
      out.push({ x, z, yaw: Math.atan2(x, z) });
    }
  });
  return out;
}

/** What a downward probe found under a candidate. */
export interface GroundProbe {
  /** Ground height in metres, or null when nothing was hit. */
  y: number | null;
  /** Up component of the surface normal. */
  normalY: number;
  /** Free space above the ground in metres (Infinity when the probe found none). */
  headroom: number;
}

/** Limits a probe must meet for the candidate to be a spawn. */
export const SPAWN_RULES = {
  /** Ground must be within this many metres of the captured ground plane. */
  maxGroundDelta: 1.6,
  /** Minimum up component of the ground normal (about 37 degrees of slope). */
  minNormalY: 0.8,
  /** Clear height needed above the ground, so the player does not spawn under a roof. */
  minHeadroom: 6.5,
  /** Minimum spacing between accepted spawns in metres. */
  minSpacing: 4.5,
} as const;

export function isWalkableProbe(probe: GroundProbe, rules = SPAWN_RULES): boolean {
  if (probe.y === null || !Number.isFinite(probe.y)) return false;
  if (Math.abs(probe.y) > rules.maxGroundDelta) return false;
  if (probe.normalY < rules.minNormalY) return false;
  return probe.headroom >= rules.minHeadroom;
}

export interface ChosenSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * Keep the walkable candidates, in order, dropping any closer than
 * `minSpacing` to one already kept, up to `max` spawns.
 */
export function chooseSpawns(
  candidates: readonly SpawnCandidate[],
  probe: (c: SpawnCandidate) => GroundProbe,
  max = 64,
  rules = SPAWN_RULES,
): ChosenSpawn[] {
  const out: ChosenSpawn[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    const p = probe(c);
    if (!isWalkableProbe(p, rules) || p.y === null) continue;
    const crowded = out.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < rules.minSpacing);
    if (crowded) continue;
    out.push({ x: c.x, y: p.y, z: c.z, yaw: c.yaw });
  }
  return out;
}
