import { FLOOR_HEIGHT } from "./atomic-culdesac-layout.ts";

/**
 * Interior plan for the two cul-de-sac houses, in house-local metres (the same
 * frame as the collision kit: +z is the street front, -z the backyard, -x the
 * garage side). Both houses share one shell and one circulation plan, the
 * layout the original map is played on: front door into a living room with the
 * stair against the garage wall, kitchen and dinette across the back with the
 * backyard door, a side door through to the garage, and upstairs a front
 * bedroom over the living room and a back room that opens onto the deck.
 *
 * Geometry (atomic-culdesac.js) and the tests read this one source, so a
 * cabinet can never drift in front of a doorway or onto the stair unnoticed.
 */

/** Axis-aligned rectangle on the floor plane. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type HouseId = "green" | "yellow";

/** Inner faces of the 24 cm exterior walls, and the floor and ceiling heights. */
export const SHELL = {
  x0: -5.88,
  x1: 5.88,
  z0: -4.88,
  z1: 4.88,
  floor0: 0.16,
  ceiling0: FLOOR_HEIGHT - 0.06,
  floor1: FLOOR_HEIGHT + 0.14,
  ceiling1: 6.3,
} as const;

/** Floor level of a storey. */
export function floorY(floor: 0 | 1) {
  return floor === 0 ? SHELL.floor0 : SHELL.floor1;
}

/**
 * The main stair: a straight 16-riser run against the garage-side wall,
 * starting by the front door and climbing toward the back of the house, so the
 * top lands in the back room beside the deck door.
 */
export const STAIR = {
  x: -5.0,
  z: 3.6,
  width: 1.65,
  count: 16,
  run: 0.29,
  rise: (FLOOR_HEIGHT + 0.14 - 0.16) / 16,
  yaw: Math.PI,
} as const;

/** Floor footprint the stair occupies. */
export function stairRect(): Rect {
  const half = STAIR.width / 2;
  return {
    x0: STAIR.x - half,
    x1: STAIR.x + half,
    z0: STAIR.z - STAIR.count * STAIR.run,
    z1: STAIR.z,
  };
}

/** Hole in the upper floor over the stair, with the wall and rail around it. */
export const STAIR_OPENING: Rect = { x0: SHELL.x0, x1: -4.12, z0: stairRect().z0, z1: SHELL.z1 };

/**
 * Upper floor slabs, as rectangles covering everything except the stair
 * opening. Each slab is 20 cm thick with its top at SHELL.floor1.
 */
export const UPPER_SLABS: readonly Rect[] = [
  { x0: STAIR_OPENING.x1, x1: SHELL.x1 + 0.12, z0: SHELL.z0 - 0.12, z1: SHELL.z1 + 0.12 },
  { x0: SHELL.x0 - 0.12, x1: STAIR_OPENING.x1, z0: SHELL.z0 - 0.12, z1: STAIR_OPENING.z0 },
];

/** A door or opening in a partition: centre along the run, width, height. */
export interface Opening {
  at: number;
  w: number;
  h: number;
}

/** An interior partition, axis-aligned, 24 cm thick like the shell. */
export interface Partition {
  id: string;
  floor: 0 | 1;
  /** Runs along x at a fixed z ("x"), or along z at a fixed x ("z"). */
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  doors: readonly Opening[];
}

export const PARTITIONS: readonly Partition[] = [
  // Ground floor: the kitchen wall, with the hall doorway beside the stair and
  // a wide cased opening into the living room.
  {
    id: "kitchen-wall",
    floor: 0,
    axis: "x",
    at: -1.0,
    from: stairRect().x1,
    to: SHELL.x1,
    doors: [
      { at: -3.15, w: 1.5, h: 2.3 },
      { at: 1.2, w: 2.0, h: 2.3 },
    ],
  },
  // Upstairs: the bedroom wall across the house, and the stairwell wall that
  // closes the bedroom off from the drop.
  {
    id: "bedroom-wall",
    floor: 1,
    axis: "x",
    at: -0.2,
    from: -4.12,
    to: SHELL.x1,
    doors: [{ at: -2.9, w: 1.2, h: 2.25 }],
  },
  {
    id: "stairwell-wall",
    floor: 1,
    axis: "z",
    at: -4.0,
    from: -0.32,
    to: SHELL.z1,
    doors: [],
  },
];

/** A rail along the open edge of the stairwell, between the landing and the bedroom wall. */
export const STAIR_RAIL = { x: -4.06, z0: stairRect().z0, z1: -0.32 } as const;

/** Openings in the exterior shell that the interior must keep clear. */
export const SHELL_DOORS = {
  front: { x0: -3.9, x1: -2.3 },
  back: { x0: 0.0, x1: 1.6 },
  deck: { x0: 2.45, x1: 3.95 },
  /** Garage-side door, cut in the x = -6 wall (z range). */
  side: { z0: -2.8, z1: -1.6, centre: -2.2, w: 1.2, h: 2.25 },
} as const;

export interface Room {
  id: string;
  floor: 0 | 1;
  rect: Rect;
}

export const ROOMS: readonly Room[] = [
  { id: "kitchen", floor: 0, rect: { x0: SHELL.x0, x1: SHELL.x1, z0: SHELL.z0, z1: -1.12 } },
  { id: "living", floor: 0, rect: { x0: stairRect().x1, x1: SHELL.x1, z0: -0.88, z1: SHELL.z1 } },
  { id: "study", floor: 1, rect: { x0: SHELL.x0, x1: SHELL.x1, z0: SHELL.z0, z1: -0.32 } },
  { id: "bedroom", floor: 1, rect: { x0: -3.88, x1: SHELL.x1, z0: -0.08, z1: SHELL.z1 } },
];

/**
 * Clearance zones in front of every doorway and at both ends of the stair. No
 * furniture footprint may enter one, so a player or bot can always get through.
 */
export interface Clearance {
  id: string;
  floor: 0 | 1;
  rect: Rect;
}

export const CLEARANCES: readonly Clearance[] = [
  { id: "front-door", floor: 0, rect: { x0: -3.9, x1: -2.3, z0: 3.9, z1: SHELL.z1 } },
  { id: "back-door", floor: 0, rect: { x0: 0, x1: 1.6, z0: SHELL.z0, z1: -3.9 } },
  { id: "side-door", floor: 0, rect: { x0: SHELL.x0, x1: -4.9, z0: -2.8, z1: -1.6 } },
  { id: "hall-doorway", floor: 0, rect: { x0: -3.9, x1: -2.4, z0: -2.0, z1: 0.0 } },
  { id: "cased-opening", floor: 0, rect: { x0: 0.2, x1: 2.2, z0: -2.0, z1: 0.0 } },
  {
    id: "foyer-lane",
    floor: 0,
    rect: { x0: stairRect().x1, x1: -2.3, z0: -0.88, z1: SHELL.z1 },
  },
  {
    id: "stair-foot",
    floor: 0,
    rect: { x0: stairRect().x0, x1: stairRect().x1, z0: STAIR.z, z1: SHELL.z1 },
  },
  {
    id: "stair-head",
    floor: 1,
    rect: { x0: SHELL.x0, x1: -4.12, z0: stairRect().z0 - 1.0, z1: stairRect().z0 },
  },
  { id: "bedroom-door", floor: 1, rect: { x0: -3.5, x1: -2.3, z0: -1.3, z1: 0.9 } },
  { id: "deck-door", floor: 1, rect: { x0: 2.45, x1: 3.95, z0: SHELL.z0, z1: -3.9 } },
];

/** The chimney breasts that intrude into each house's rooms (both storeys). */
export const CHIMNEYS: Readonly<Record<HouseId, Rect>> = {
  green: { x0: -6.15, x1: -4.45, z0: -4.725, z1: -3.875 },
  yellow: { x0: 3.675, x1: 5.125, z0: 4.35, z1: 5.65 },
};

/**
 * One piece of furniture. `yaw` turns the piece about its centre; 0 means its
 * front faces +z (toward the street), PI faces the backyard, PI/2 faces +x.
 * `w` runs along the piece's own x, `d` along its own z. `h` is the height
 * above the floor. `solid` pieces collide and give cover; `flat` pieces (rugs,
 * mats) and `onTop` pieces (a lamp on a table) are exempt from overlap checks.
 */
export interface Furniture {
  id: string;
  kind: string;
  house: HouseId | "both";
  floor: 0 | 1;
  room: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw?: number;
  solid?: boolean;
  flat?: boolean;
  onTop?: boolean;
  /** Free-form variant tag the renderer understands (colour, pose, outfit). */
  style?: string;
}

const Q = Math.PI / 2;

/** Kitchen run along the back wall: lower cabinets, sink and range. */
const KITCHEN_DEPTH = 0.62;
const kz = SHELL.z0 + KITCHEN_DEPTH / 2;

export const FURNITURE: readonly Furniture[] = [
  // ---- yellow house: the red-cabinet kitchen with the yellow vinyl booth ----
  {
    id: "y-counter",
    kind: "counter",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: (-5.7 + -0.95) / 2,
    z: kz,
    w: 4.75,
    d: KITCHEN_DEPTH,
    h: 0.92,
    yaw: 0,
    solid: true,
    style: "red",
  },
  {
    id: "y-range",
    kind: "range",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: -0.575,
    z: kz,
    w: 0.75,
    d: KITCHEN_DEPTH,
    h: 0.92,
    solid: true,
  },
  {
    id: "y-fridge",
    kind: "fridge",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: 2.4,
    z: SHELL.z0 + 0.38,
    w: 0.8,
    d: 0.74,
    h: 1.72,
    solid: true,
  },
  {
    id: "y-booth",
    kind: "booth",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: 4.95,
    z: -3.5,
    w: 1.7,
    d: 2.6,
    h: 1.05,
    solid: true,
  },
  {
    id: "y-pantry",
    kind: "pantry",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: -5.6,
    z: -3.55,
    w: 0.9,
    d: 0.55,
    h: 2.1,
    yaw: Q,
    solid: true,
    style: "red",
  },
  {
    id: "y-mq-mother",
    kind: "mannequin",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: 4.95,
    z: -4.28,
    w: 0.5,
    d: 0.5,
    h: 1.3,
    yaw: 0,
    onTop: true,
    style: "sit:woman:red",
  },
  {
    id: "y-mq-daughter",
    kind: "mannequin",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: 4.95,
    z: -2.72,
    w: 0.45,
    d: 0.45,
    h: 1.0,
    yaw: Math.PI,
    onTop: true,
    style: "sit:girl:blue",
  },
  {
    id: "y-mq-father",
    kind: "mannequin",
    house: "yellow",
    floor: 0,
    room: "kitchen",
    x: -0.6,
    z: -3.85,
    w: 0.5,
    d: 0.35,
    h: 1.78,
    yaw: Math.PI,
    solid: true,
    style: "stand:man:apron",
  },
  // yellow living room: stone fireplace in the street corner, sofa facing it
  {
    id: "y-hearth",
    kind: "fireplace",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 4.4,
    z: 4.12,
    w: 1.9,
    d: 0.46,
    h: 0.2,
    yaw: Math.PI,
    flat: true,
  },
  {
    id: "y-sofa",
    kind: "sofa",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 4.2,
    z: 1.15,
    w: 2.4,
    d: 0.88,
    h: 0.84,
    yaw: 0,
    solid: true,
    style: "teal",
  },
  {
    id: "y-coffee",
    kind: "coffee-table",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 4.2,
    z: 2.45,
    w: 1.15,
    d: 0.55,
    h: 0.42,
    solid: true,
  },
  {
    id: "y-rug",
    kind: "rug",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 4.0,
    z: 2.0,
    w: 3.3,
    d: 2.5,
    h: 0.01,
    flat: true,
    style: "oval",
  },
  {
    id: "y-armchair",
    kind: "armchair",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 1.75,
    z: 2.75,
    w: 0.82,
    d: 0.82,
    h: 0.86,
    yaw: Q,
    solid: true,
    style: "orange",
  },
  {
    id: "y-tv",
    kind: "tv",
    house: "yellow",
    floor: 0,
    room: "living",
    x: -1.2,
    z: 4.58,
    w: 1.05,
    d: 0.5,
    h: 0.98,
    yaw: Math.PI,
    solid: true,
  },
  {
    id: "y-lounge",
    kind: "lounge-chair",
    house: "yellow",
    floor: 0,
    room: "living",
    x: -1.1,
    z: 2.55,
    w: 0.72,
    d: 0.8,
    h: 0.8,
    yaw: 0,
    solid: true,
    style: "mustard",
  },
  {
    id: "y-mq-son",
    kind: "mannequin",
    house: "yellow",
    floor: 0,
    room: "living",
    x: -1.1,
    z: 3.6,
    w: 0.4,
    d: 0.5,
    h: 0.7,
    yaw: 0,
    style: "floor:boy:stripe",
  },
  {
    id: "y-sideboard",
    kind: "sideboard",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 3.6,
    z: -0.6,
    w: 1.8,
    d: 0.45,
    h: 0.78,
    solid: true,
  },
  {
    id: "y-lamp",
    kind: "floor-lamp",
    house: "yellow",
    floor: 0,
    room: "living",
    x: 5.5,
    z: 0.0,
    w: 0.4,
    d: 0.4,
    h: 1.6,
  },
  // yellow upstairs: the kids' room with bunks, a study over the kitchen
  {
    id: "y-bunk",
    kind: "bunk",
    house: "yellow",
    floor: 1,
    room: "bedroom",
    x: 5.38,
    z: 1.6,
    w: 2.05,
    d: 0.98,
    h: 1.75,
    yaw: -Q,
    solid: true,
  },
  {
    id: "y-dresser",
    kind: "dresser",
    house: "yellow",
    floor: 1,
    room: "bedroom",
    x: -3.62,
    z: 3.0,
    w: 1.2,
    d: 0.5,
    h: 1.0,
    yaw: Q,
    solid: true,
  },
  {
    id: "y-toychest",
    kind: "chest",
    house: "yellow",
    floor: 1,
    room: "bedroom",
    x: 2.6,
    z: 4.55,
    w: 0.95,
    d: 0.5,
    h: 0.5,
    yaw: Math.PI,
    solid: true,
    style: "blue",
  },
  {
    id: "y-nightstand",
    kind: "nightstand",
    house: "yellow",
    floor: 1,
    room: "bedroom",
    x: 5.6,
    z: 3.15,
    w: 0.45,
    d: 0.45,
    h: 0.6,
    yaw: -Q,
    solid: true,
  },
  {
    id: "y-bedrug",
    kind: "rug",
    house: "yellow",
    floor: 1,
    room: "bedroom",
    x: 2.6,
    z: 2.1,
    w: 2.6,
    d: 1.9,
    h: 0.01,
    flat: true,
    style: "braided",
  },
  {
    id: "y-desk",
    kind: "desk",
    house: "yellow",
    floor: 1,
    room: "study",
    x: 0.4,
    z: SHELL.z0 + 0.34,
    w: 1.4,
    d: 0.66,
    h: 0.76,
    yaw: 0,
    solid: true,
  },
  {
    id: "y-bookcase",
    kind: "bookcase",
    house: "yellow",
    floor: 1,
    room: "study",
    x: -2.3,
    z: SHELL.z0 + 0.2,
    w: 1.8,
    d: 0.38,
    h: 2.0,
    yaw: 0,
    solid: true,
  },
  {
    id: "y-files",
    kind: "file-cabinet",
    house: "yellow",
    floor: 1,
    room: "study",
    x: 5.55,
    z: -4.4,
    w: 0.5,
    d: 0.62,
    h: 1.32,
    yaw: -Q,
    solid: true,
  },
  {
    id: "y-reading",
    kind: "armchair",
    house: "yellow",
    floor: 1,
    room: "study",
    x: 5.2,
    z: -1.05,
    w: 0.82,
    d: 0.82,
    h: 0.86,
    yaw: -Math.PI * 0.75,
    solid: true,
    style: "green",
  },

  // ---- green house: wood-cabinet kitchen with the table and four chairs ----
  {
    id: "g-counter",
    kind: "counter",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: (-4.4 + -0.95) / 2,
    z: kz,
    w: 3.45,
    d: KITCHEN_DEPTH,
    h: 0.92,
    solid: true,
    style: "wood",
  },
  {
    id: "g-range",
    kind: "range",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: -0.575,
    z: kz,
    w: 0.75,
    d: KITCHEN_DEPTH,
    h: 0.92,
    solid: true,
  },
  {
    id: "g-fridge",
    kind: "fridge",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: 2.4,
    z: SHELL.z0 + 0.38,
    w: 0.8,
    d: 0.74,
    h: 1.72,
    solid: true,
  },
  {
    id: "g-table",
    kind: "dining-table",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: 4.45,
    z: -3.0,
    w: 1.4,
    d: 0.9,
    h: 0.76,
    solid: true,
  },
  ...[
    [3.95, -3.78, 0],
    [4.95, -3.78, 0],
    [3.95, -2.22, Math.PI],
    [4.95, -2.22, Math.PI],
  ].map(([x, z, yaw], i): Furniture => ({
    id: `g-chair-${i}`,
    kind: "chair",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: x!,
    z: z!,
    w: 0.44,
    d: 0.46,
    h: 0.92,
    yaw: yaw!,
  })),
  {
    id: "g-hutch",
    kind: "hutch",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: -5.6,
    z: -3.32,
    w: 0.95,
    d: 0.5,
    h: 2.0,
    yaw: Q,
    solid: true,
  },
  {
    id: "g-mq-mother",
    kind: "mannequin",
    house: "green",
    floor: 0,
    room: "kitchen",
    x: -3.0,
    z: -3.9,
    w: 0.5,
    d: 0.35,
    h: 1.7,
    yaw: Math.PI,
    solid: true,
    style: "stand:woman:green",
  },
  // green living room: the couple on the sofa facing the console TV
  {
    id: "g-sofa",
    kind: "sofa",
    house: "green",
    floor: 0,
    room: "living",
    x: 3.85,
    z: -0.4,
    w: 2.5,
    d: 0.88,
    h: 0.84,
    solid: true,
    style: "olive",
  },
  {
    id: "g-coffee",
    kind: "coffee-table",
    house: "green",
    floor: 0,
    room: "living",
    x: 3.85,
    z: 0.95,
    w: 1.15,
    d: 0.55,
    h: 0.42,
    solid: true,
  },
  {
    id: "g-rug",
    kind: "rug",
    house: "green",
    floor: 0,
    room: "living",
    x: 3.7,
    z: 1.6,
    w: 3.6,
    d: 2.6,
    h: 0.01,
    flat: true,
    style: "rect",
  },
  {
    id: "g-tv",
    kind: "tv",
    house: "green",
    floor: 0,
    room: "living",
    x: 4.4,
    z: 4.58,
    w: 1.05,
    d: 0.5,
    h: 0.98,
    yaw: Math.PI,
    solid: true,
  },
  {
    id: "g-armchair",
    kind: "armchair",
    house: "green",
    floor: 0,
    room: "living",
    x: 1.35,
    z: 2.2,
    w: 0.82,
    d: 0.82,
    h: 0.86,
    yaw: Math.PI * 0.62,
    solid: true,
    style: "orange",
  },
  {
    id: "g-sideboard",
    kind: "sideboard",
    house: "green",
    floor: 0,
    room: "living",
    x: -1.1,
    z: 4.6,
    w: 1.6,
    d: 0.45,
    h: 0.78,
    yaw: Math.PI,
    solid: true,
  },
  {
    id: "g-lamp",
    kind: "floor-lamp",
    house: "green",
    floor: 0,
    room: "living",
    x: 5.5,
    z: -0.55,
    w: 0.4,
    d: 0.4,
    h: 1.6,
  },
  {
    id: "g-mq-father",
    kind: "mannequin",
    house: "green",
    floor: 0,
    room: "living",
    x: 3.3,
    z: -0.3,
    w: 0.5,
    d: 0.6,
    h: 1.3,
    yaw: 0,
    onTop: true,
    style: "sit:man:shirt",
  },
  {
    id: "g-mq-wife",
    kind: "mannequin",
    house: "green",
    floor: 0,
    room: "living",
    x: 4.4,
    z: -0.3,
    w: 0.5,
    d: 0.6,
    h: 1.3,
    yaw: 0,
    onTop: true,
    style: "sit:woman:red",
  },
  {
    id: "g-mq-son",
    kind: "mannequin",
    house: "green",
    floor: 0,
    room: "living",
    x: 3.0,
    z: 2.55,
    w: 0.4,
    d: 0.5,
    h: 0.7,
    yaw: 0.4,
    style: "floor:boy:stripe",
  },
  // green upstairs: the parents' bedroom and a sewing room over the kitchen
  {
    id: "g-bed",
    kind: "bed",
    house: "green",
    floor: 1,
    room: "bedroom",
    x: 4.82,
    z: 2.1,
    w: 1.55,
    d: 2.05,
    h: 1.05,
    yaw: -Q,
    solid: true,
  },
  ...[1.05, 3.15].map((z, i): Furniture => ({
    id: `g-nightstand-${i}`,
    kind: "nightstand",
    house: "green",
    floor: 1,
    room: "bedroom",
    x: 5.6,
    z,
    w: 0.45,
    d: 0.45,
    h: 0.6,
    yaw: -Q,
    solid: true,
  })),
  {
    id: "g-dresser",
    kind: "dresser",
    house: "green",
    floor: 1,
    room: "bedroom",
    x: -3.62,
    z: 2.9,
    w: 1.3,
    d: 0.5,
    h: 1.0,
    yaw: Q,
    solid: true,
  },
  {
    id: "g-vanity",
    kind: "vanity",
    house: "green",
    floor: 1,
    room: "bedroom",
    x: 3.3,
    z: 4.6,
    w: 1.0,
    d: 0.45,
    h: 0.76,
    yaw: Math.PI,
    solid: true,
  },
  {
    id: "g-bedrug",
    kind: "rug",
    house: "green",
    floor: 1,
    room: "bedroom",
    x: 2.4,
    z: 2.1,
    w: 2.4,
    d: 2.2,
    h: 0.01,
    flat: true,
    style: "rect",
  },
  {
    id: "g-sewing",
    kind: "desk",
    house: "green",
    floor: 1,
    room: "study",
    x: 0.4,
    z: SHELL.z0 + 0.34,
    w: 1.3,
    d: 0.62,
    h: 0.76,
    yaw: 0,
    solid: true,
    style: "sewing",
  },
  {
    id: "g-bookcase",
    kind: "bookcase",
    house: "green",
    floor: 1,
    room: "study",
    x: -2.3,
    z: SHELL.z0 + 0.2,
    w: 1.6,
    d: 0.38,
    h: 2.0,
    yaw: 0,
    solid: true,
  },
  {
    id: "g-trunk",
    kind: "chest",
    house: "green",
    floor: 1,
    room: "study",
    x: 5.5,
    z: -4.2,
    w: 0.95,
    d: 0.55,
    h: 0.55,
    yaw: -Q,
    solid: true,
    style: "wood",
  },
  {
    id: "g-reading",
    kind: "armchair",
    house: "green",
    floor: 1,
    room: "study",
    x: 5.2,
    z: -1.05,
    w: 0.82,
    d: 0.82,
    h: 0.86,
    yaw: -Math.PI * 0.75,
    solid: true,
    style: "green",
  },
];

/** Furniture for one house. */
export function furnitureFor(id: HouseId): Furniture[] {
  return FURNITURE.filter((f) => f.house === id || f.house === "both");
}

/** Floor footprint of a piece, as the axis-aligned box around its turned rectangle. */
export function footprint(f: Furniture): Rect {
  const c = Math.abs(Math.cos(f.yaw ?? 0)),
    s = Math.abs(Math.sin(f.yaw ?? 0));
  const hw = (f.w * c + f.d * s) / 2,
    hd = (f.w * s + f.d * c) / 2;
  return { x0: f.x - hw, x1: f.x + hw, z0: f.z - hd, z1: f.z + hd };
}

/** Positive-area overlap of two rectangles, with an optional shrink margin. */
export function rectsOverlap(a: Rect, b: Rect, margin = 0) {
  return (
    a.x0 < b.x1 - margin && b.x0 < a.x1 - margin && a.z0 < b.z1 - margin && b.z0 < a.z1 - margin
  );
}

/** Whether `inner` lies inside `outer` (within `slack` metres). */
export function rectInside(inner: Rect, outer: Rect, slack = 0) {
  return (
    inner.x0 >= outer.x0 - slack &&
    inner.x1 <= outer.x1 + slack &&
    inner.z0 >= outer.z0 - slack &&
    inner.z1 <= outer.z1 + slack
  );
}

/** Wall footprints of one storey, with its doors left open. */
export function partitionSolids(floor: 0 | 1): Rect[] {
  const out: Rect[] = [];
  for (const p of PARTITIONS) {
    if (p.floor !== floor) continue;
    const cuts = [p.from, p.to, ...p.doors.flatMap((d) => [d.at - d.w / 2, d.at + d.w / 2])].sort(
      (a, b) => a - b,
    );
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i]!,
        b = cuts[i + 1]!,
        m = (a + b) / 2;
      if (p.doors.some((d) => Math.abs(m - d.at) < d.w / 2)) continue;
      out.push(
        p.axis === "x"
          ? { x0: a, x1: b, z0: p.at - 0.12, z1: p.at + 0.12 }
          : { x0: p.at - 0.12, x1: p.at + 0.12, z0: a, z1: b },
      );
    }
  }
  return out;
}

/**
 * Coarse occupancy grid of one storey for reachability checks: the shell walls
 * (with their doors), partitions, the stair or stairwell, the chimney breast and
 * every solid piece of furniture. Cells are `cell` metres; an agent of radius
 * `radius` is blocked within that distance of any solid.
 */
export function occupancy(id: HouseId, floor: 0 | 1, cell = 0.1, radius = 0.33) {
  const x0 = SHELL.x0 - 1.0,
    z0 = SHELL.z0 - 1.0;
  const nx = Math.round((SHELL.x1 - SHELL.x0 + 2.0) / cell),
    nz = Math.round((SHELL.z1 - SHELL.z0 + 2.0) / cell);
  const solids: Rect[] = [...partitionSolids(floor), CHIMNEYS[id]];
  // Exterior walls, leaving the doors on this storey open.
  const t = 0.24;
  const along = (lo: number, hi: number, gaps: Array<[number, number]>) => {
    const out: Array<[number, number]> = [];
    let c = lo;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > c) out.push([c, a]);
      c = Math.max(c, b);
    }
    if (c < hi) out.push([c, hi]);
    return out;
  };
  const fx: Array<[number, number]> =
    floor === 0 ? [[SHELL_DOORS.front.x0, SHELL_DOORS.front.x1]] : [];
  const bx: Array<[number, number]> =
    floor === 0
      ? [[SHELL_DOORS.back.x0, SHELL_DOORS.back.x1]]
      : [[SHELL_DOORS.deck.x0, SHELL_DOORS.deck.x1]];
  const lz: Array<[number, number]> =
    floor === 0 ? [[SHELL_DOORS.side.z0, SHELL_DOORS.side.z1]] : [];
  for (const [a, b] of along(-6.12, 6.12, fx))
    solids.push({ x0: a, x1: b, z0: 4.88, z1: 4.88 + t });
  for (const [a, b] of along(-6.12, 6.12, bx))
    solids.push({ x0: a, x1: b, z0: -4.88 - t, z1: -4.88 });
  for (const [a, b] of along(-5.12, 5.12, lz))
    solids.push({ x0: -5.88 - t, x1: -5.88, z0: a, z1: b });
  solids.push({ x0: 5.88, x1: 5.88 + t, z0: -5.12, z1: 5.12 });
  if (floor === 0) solids.push(stairRect());
  else {
    solids.push(STAIR_OPENING);
  }
  for (const f of furnitureFor(id)) if (f.floor === floor && f.solid) solids.push(footprint(f));
  const blocked = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const px = x0 + (i + 0.5) * cell,
        pz = z0 + (j + 0.5) * cell;
      for (const r of solids) {
        const dx = Math.max(r.x0 - px, 0, px - r.x1),
          dz = Math.max(r.z0 - pz, 0, pz - r.z1);
        if (dx * dx + dz * dz < radius * radius) {
          blocked[j * nx + i] = 1;
          break;
        }
      }
    }
  const index = (x: number, z: number) => {
    const i = Math.floor((x - x0) / cell),
      j = Math.floor((z - z0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  return { nx, nz, cell, x0, z0, blocked, index };
}

/** Cells reachable from (x, z) on one storey's occupancy grid. */
export function reachable(grid: ReturnType<typeof occupancy>, x: number, z: number) {
  const seen = new Uint8Array(grid.blocked.length);
  const start = grid.index(x, z);
  if (start < 0 || grid.blocked[start]) return seen;
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const c = queue.pop()!;
    const i = c % grid.nx,
      j = (c - i) / grid.nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di,
        nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.nx || nj >= grid.nz) continue;
      const n = nj * grid.nx + ni;
      if (seen[n] || grid.blocked[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}
