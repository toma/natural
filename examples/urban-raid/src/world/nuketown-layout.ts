/** Authoring dimensions are metres estimated from original map reference views. */
export interface HouseSpec {
  id: "green" | "yellow";
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  floors: number;
}

export const MAP_BOUNDS = { minX: -23, maxX: 23, minZ: -39, maxZ: 39 } as const;
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
  { id: "green", x: 0, z: -20, yaw: 0, w: 12, d: 10, floors: 2 },
  { id: "yellow", x: 1.4, z: 20, yaw: Math.PI, w: 12, d: 10, floors: 2 },
];

export const MAP_SPAWNS = [
  { id: "green-garden", x: 0, z: -34, yaw: Math.PI },
  { id: "yellow-garden", x: 1, z: 34, yaw: 0 },
  { id: "green-flank", x: 16, z: -26, yaw: Math.PI },
  { id: "yellow-flank", x: -15, z: 26, yaw: 0 },
  { id: "green-patio", x: -8, z: -33, yaw: Math.PI },
  { id: "yellow-patio", x: 10, z: 33, yaw: 0 },
  { id: "west-lane", x: -18, z: -7, yaw: -Math.PI / 2 },
  { id: "east-lane", x: 18, z: 7, yaw: Math.PI / 2 },
] as const;

export const LANDMARKS = [
  { id: "school-bus", x: -2.5, z: -3.1, w: 11.4, d: 2.65 },
  { id: "moving-truck", x: 2.2, z: 3.2, w: 13.5, d: 2.85 },
  { id: "welcome-sign", x: 14.5, z: -11.5, w: 3.4, d: 0.35 },
] as const;

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
