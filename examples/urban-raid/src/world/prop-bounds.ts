import {
  HOUSES,
  VEHICLES,
  POLES,
  LANDMARKS,
  GARDEN_FENCES,
  GARDEN_MANNEQUINS,
  housePoint,
  type HouseSpec,
  type PropBox,
} from "./atomic-culdesac-layout.ts";

/**
 * Static-prop footprints on the ground plane and a separating-axis overlap test,
 * so a regression check can prove no two discrete props interpenetrate. Only
 * discrete props are listed; the ground, road, pavement, and driveways are not
 * props and resting contact with them is expected.
 */
export interface Obb {
  id: string;
  group: string;
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  cos: number;
  sin: number;
}

function obb(
  id: string,
  group: string,
  x: number,
  z: number,
  yaw: number,
  w: number,
  d: number,
): Obb {
  return { id, group, cx: x, cz: z, hw: w / 2, hd: d / 2, cos: Math.cos(yaw), sin: Math.sin(yaw) };
}

/** World footprint of a house-local box, carrying the house yaw. */
function localBox(house: HouseSpec, id: string, lx: number, lz: number, w: number, d: number): Obb {
  const p = housePoint(house, lx, lz);
  return obb(id, house.id, p.x, p.z, house.yaw, w, d);
}

/** World footprint of a house-local fence run as a thin oriented box. */
function localFence(
  house: HouseSpec,
  id: string,
  seg: readonly [number, number, number, number],
): Obb {
  const [x0, z0, x1, z1] = seg;
  const a = housePoint(house, x0, z0);
  const b = housePoint(house, x1, z1);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const yaw = Math.atan2(b.z - a.z, b.x - a.x);
  return obb(id, house.id, (a.x + b.x) / 2, (a.z + b.z) / 2, yaw, length + 0.3, 0.3);
}

export function staticProps(): Obb[] {
  const props: Obb[] = [];
  for (const v of VEHICLES as readonly PropBox[])
    props.push(obb(v.id, "vehicle", v.x, v.z, v.yaw, v.w, v.d));
  for (const house of HOUSES) {
    // Main two-story body and the attached garage.
    props.push(localBox(house, `${house.id}-house`, 0, 0, 12.4, 10.4));
    props.push(localBox(house, `${house.id}-garage`, -9, 1, 6.2, 8.2));
    GARDEN_FENCES.forEach((seg, i) => props.push(localFence(house, `${house.id}-fence-${i}`, seg)));
    GARDEN_MANNEQUINS.forEach((m, i) => {
      const p = housePoint(house, m.x, m.z);
      props.push(obb(`${house.id}-mannequin-${i}`, house.id, p.x, p.z, house.yaw, 0.5, 0.4));
    });
  }
  for (let i = 0; i < POLES.length; i++)
    props.push(obb(`pole-${i}`, "pole", POLES[i]!.x, POLES[i]!.z, 0, 0.5, 0.5));
  const sign = LANDMARKS.find((l) => l.id === "welcome-sign")!;
  props.push(obb("welcome-sign", "landmark", sign.x, sign.z, 0, sign.w, 0.4));
  return props;
}

/** Corners of an OBB in world space. */
function corners(o: Obb): Array<[number, number]> {
  const ax = o.cos * o.hw;
  const az = o.sin * o.hw;
  const bx = -o.sin * o.hd;
  const bz = o.cos * o.hd;
  return [
    [o.cx + ax + bx, o.cz + az + bz],
    [o.cx - ax + bx, o.cz - az + bz],
    [o.cx - ax - bx, o.cz - az - bz],
    [o.cx + ax - bx, o.cz + az - bz],
  ];
}

/** Separating-axis overlap test for two oriented rectangles, with a shrink margin. */
export function obbOverlap(a: Obb, b: Obb, margin = 0): boolean {
  const axes: Array<[number, number]> = [
    [a.cos, a.sin],
    [-a.sin, a.cos],
    [b.cos, b.sin],
    [-b.sin, b.cos],
  ];
  const ca = corners(a);
  const cb = corners(b);
  for (const [nx, nz] of axes) {
    let aMin = Infinity,
      aMax = -Infinity,
      bMin = Infinity,
      bMax = -Infinity;
    for (const [x, z] of ca) {
      const p = x * nx + z * nz;
      aMin = Math.min(aMin, p);
      aMax = Math.max(aMax, p);
    }
    for (const [x, z] of cb) {
      const p = x * nx + z * nz;
      bMin = Math.min(bMin, p);
      bMax = Math.max(bMax, p);
    }
    if (aMax - margin <= bMin + margin || bMax - margin <= aMin + margin) return false;
  }
  return true;
}

/**
 * Pairs of prop groups whose contact is intentional: a garage is attached to its
 * house body, and a house's own fence runs and yard mannequins sit against it.
 */
function allowed(a: Obb, b: Obb): boolean {
  if (a.group === b.group && a.group !== "vehicle" && a.group !== "pole") return true;
  return false;
}

export interface Overlap {
  a: string;
  b: string;
}

/**
 * Report every pair of discrete props that interpenetrate on the ground plane by
 * more than `margin`, excluding intentional same-structure contact.
 */
export function findOverlaps(props: Obb[] = staticProps(), margin = 0.05): Overlap[] {
  const hits: Overlap[] = [];
  for (let i = 0; i < props.length; i++)
    for (let j = i + 1; j < props.length; j++) {
      const a = props[i]!;
      const b = props[j]!;
      if (allowed(a, b)) continue;
      if (obbOverlap(a, b, margin)) hits.push({ a: a.id, b: b.id });
    }
  return hits;
}
