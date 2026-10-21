/** Authoring dimensions are in metres, chosen for the Atomic Cul-de-sac layout. */
export interface HouseSpec {
  id: "green" | "yellow";
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  floors: number;
}

export const MAP_BOUNDS = { minX: -23, maxX: 23, minZ: -33, maxZ: 33 } as const;
export const FLOOR_HEIGHT = 3.12;

/** Solid vertical spans after subtracting every opening crossing this wall column. */
export function wallSpans(
  bottom: number,
  top: number,
  holes: ReadonlyArray<{ y: number; h: number }>,
) {
  const spans: Array<[number, number]> = [];
  let cursor = bottom;
  for (const hole of [...holes].sort((a, b) => a.y - b.y)) {
    if (hole.y > cursor) spans.push([cursor, Math.min(hole.y, top)]);
    cursor = Math.max(cursor, hole.y + hole.h);
    if (cursor >= top) break;
  }
  if (cursor < top) spans.push([cursor, top]);
  return spans.filter(([a, b]) => b > a);
}
export const HOUSES: readonly HouseSpec[] = [
  { id: "green", x: 0, z: -15, yaw: 0, w: 12, d: 10, floors: 2 },
  { id: "yellow", x: 1.4, z: 15, yaw: Math.PI, w: 12, d: 10, floors: 2 },
];

export const MAP_SPAWNS = [
  { id: "green-garden", x: 0, z: -28, yaw: Math.PI },
  { id: "yellow-garden", x: 1, z: 28, yaw: 0 },
  { id: "green-flank", x: 16, z: -19, yaw: Math.PI },
  { id: "yellow-flank", x: -15, z: 19, yaw: 0 },
  { id: "green-patio", x: -9, z: -26, yaw: Math.PI },
  { id: "yellow-patio", x: 11, z: 26, yaw: 0 },
  { id: "west-lane", x: -18, z: -5, yaw: -Math.PI / 2 },
  { id: "east-lane", x: 18, z: 5, yaw: Math.PI / 2 },
] as const;

export const LANDMARKS = [
  { id: "school-bus", x: -2, z: 0, w: 13, d: 8 },
  { id: "moving-truck", x: 2.2, z: 3.2, w: 13.5, d: 2.85 },
  { id: "welcome-sign", x: 14.5, z: -9, w: 3.4, d: 0.35 },
] as const;

/** An oriented footprint on the ground plane, world space. */
export interface PropBox {
  id: string;
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
}

/**
 * Discrete movable props, world space. Geometry and the interpenetration test
 * read the same source so placement cannot drift into an overlap unnoticed.
 */
export const VEHICLES: readonly PropBox[] = [
  { id: "bus", x: -2, z: 0, yaw: 0.42, w: 11.3, d: 2.62 },
  { id: "truck", x: 2.4, z: 5.7, yaw: 0, w: 13.5, d: 2.95 },
  { id: "car-green", x: -15, z: -6.4, yaw: 0, w: 4.8, d: 1.85 },
  { id: "car-yellow", x: 16.4, z: 6.4, yaw: Math.PI, w: 4.8, d: 1.85 },
];

/** Utility poles, world space; footprint is the pole plus its crossarm. */
export const POLES: readonly { x: number; z: number }[] = [
  { x: -21, z: -16 },
  { x: 21, z: -16 },
  { x: -21, z: 14 },
  { x: 21, z: 14 },
];

/** Garden fence runs in house-local space: [x0, z0, x1, z1]. */
export const GARDEN_FENCES: readonly [number, number, number, number][] = [
  [-20, -16, 20, -16],
  [-20, -16, -20, 7],
  [20, -16, 20, 7],
  [-18, 7, -5.2, 7],
  [0, 7, 12, 7],
];

/** Garden mannequin positions in house-local space. */
export const GARDEN_MANNEQUINS: readonly { x: number; z: number; female: boolean }[] = [
  { x: 3, z: -13, female: true },
  { x: -3, z: 5, female: false },
];

export function housePoint(house: HouseSpec, x: number, z: number) {
  const c = Math.cos(house.yaw);
  const s = Math.sin(house.yaw);
  return { x: house.x + c * x + s * z, z: house.z - s * x + c * z };
}

export function insideMap(x: number, z: number, margin = 0) {
  return (
    x > MAP_BOUNDS.minX + margin &&
    x < MAP_BOUNDS.maxX - margin &&
    z > MAP_BOUNDS.minZ + margin &&
    z < MAP_BOUNDS.maxZ - margin
  );
}

export function outdoorOpen(x: number, z: number, margin = 0.4) {
  if (!insideMap(x, z, margin)) return false;
  for (const h of HOUSES) {
    const c = Math.cos(h.yaw),
      s = Math.sin(h.yaw);
    const lx = c * (x - h.x) - s * (z - h.z);
    const lz = s * (x - h.x) + c * (z - h.z);
    if (Math.abs(lx) < h.w / 2 + margin && Math.abs(lz) < h.d / 2 + margin) return false;
    if (Math.abs(lx + 9) < 3 + margin && Math.abs(lz - 1) < 4 + margin) return false;
  }
  return !LANDMARKS.slice(0, 2).some(
    (p) => Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin,
  );
}
