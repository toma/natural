import * as THREE from "three";
import { wallSpans } from "./atomic-culdesac-layout.ts";
import {
  CHIMNEYS,
  PARTITIONS,
  SHELL,
  STAIR,
  STAIR_OPENING,
  STAIR_RAIL,
  UPPER_SLABS,
  floorY,
  furnitureFor,
} from "./house-interiors.ts";
import * as P from "./house-interior-paint.js";

/**
 * Builds the furnished interiors of the two cul-de-sac houses from the plan in
 * house-interiors.ts: partitions, stair, ceilings, wall and floor finishes,
 * furniture, the mannequin families, curtains, fixtures and the room lights.
 *
 * Everything here is deterministic (no level rng), so the outdoor dressing that
 * follows draws the same random stream it always has. Geometry goes through the
 * collision kit, so it merges per material into the same static batches as the
 * shell; furniture collides through simple proxy boxes.
 */

const Q = Math.PI / 2;
const EPS = 0.004;

/** Per-house finishes: wall linings and floors by room. */
const THEMES = {
  green: {
    kitchen: { wall: "ac-in-floral", floor: "ac-in-check-blue" },
    living: { wall: "ac-in-sage", floor: "ac-in-oak", rail: true },
    hall: { wall: "ac-in-sage", floor: "ac-in-oak" },
    bedroom: { wall: "ac-in-damask", floor: "ac-in-plaid" },
    study: { wall: "ac-in-stripe-sage", floor: "ac-in-oak" },
    curtain: "ac-curtain",
    kitchenCurtain: "ac-in-gingham-blue",
  },
  yellow: {
    kitchen: { wall: "ac-in-boards", floor: "ac-in-check-yellow", wainscot: "ac-in-wainscot" },
    living: { wall: "ac-in-atomic", floor: "ac-in-oak" },
    hall: { wall: "ac-in-atomic", floor: "ac-in-oak" },
    bedroom: { wall: "ac-in-stripe-blue", floor: "ac-in-broadloom" },
    study: { wall: "ac-in-pine", floor: "ac-in-oak" },
    curtain: "ac-in-drape-gold",
    kitchenCurtain: "ac-in-gingham-red",
  },
};

/**
 * Register the interior materials. Library materials (world-projected PBR with
 * baked detail) carry upholstery, wood and enamel; canvas materials carry the
 * period patterns that need real metric UVs. Below high quality the canvases
 * paint at half resolution, and low quality drops the bump maps.
 */
export function interiorMaterials(A, texture) {
  const q = A.render?.qLevel ?? 3;
  const big = q >= 2 ? 1024 : 512;
  const lib = (key, name, hex, surf, extra = {}) =>
    A.registerMaterial(
      key,
      A.materials.get(name, { tint: new THREE.Color(hex).getHex(), ...extra }),
      surf,
    );
  lib("ac-in-walnut", "wood", "#5c3c25", "wood", { scale: 1.1, normalStrength: 1.0 });
  lib("ac-in-maple", "wood", "#b5824f", "wood", { scale: 1.1, normalStrength: 1.0 });
  lib("ac-in-honey", "wood", "#a8743f", "wood", { scale: 1.1, normalStrength: 1.0 });
  lib("ac-in-cab-red", "metal_painted", "#a3302a", "metal", { scale: 1.3 });
  lib("ac-in-olive-steel", "metal_painted", "#6f7656", "metal", { scale: 1.3 });
  lib("ac-in-yellow-enamel", "metal_painted", "#d9b440", "metal", { scale: 1.3 });
  lib("ac-in-brass", "metal_brushed", "#b79446", "metal", { scale: 0.7 });
  const glossy = (key, hex, rough) =>
    lib(key, "plaster", hex, "fabric", { scale: 0.6, roughness: [rough, 0, 0.18] });
  glossy("ac-in-vinyl-yellow", "#d9b23f", 0.36);
  glossy("ac-in-ceramic", "#e8e1d0", 0.28);
  glossy("ac-in-ceramic-teal", "#4c8a84", 0.28);

  const phys = (key, opts, surf = "wood") =>
    A.registerMaterial(
      key,
      new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.3, ...opts }),
      surf,
    );
  // Store-mannequin finish: satin painted fibreglass under a light clearcoat.
  phys("ac-in-mannequin", {
    color: 0xe6d6c2,
    roughness: 0.4,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
  });
  phys("ac-in-mannequin-hair", { color: 0x5a3e2a, roughness: 0.45, clearcoat: 0.3 });
  phys(
    "ac-in-crt",
    { color: 0x1b2220, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 },
    "glass",
  );
  phys("ac-in-mirror", { color: 0x9fa7a6, metalness: 1, roughness: 0.14 }, "glass");
  const glow = (key, color, emissive, intensity) =>
    A.registerMaterial(
      key,
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: intensity,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
      "glass",
    );
  glow("ac-in-shade", 0xefe1c0, 0xffc884, 0.45);
  glow("ac-in-milkglass", 0xf5f0e6, 0xffe0aa, 0.9);

  // Canvas materials: seamless tiles mapped by metric UVs. polygonOffset keeps
  // a lining from fighting the wall it covers.
  const canvas = (key, paint, size, opts = {}) => {
    const params = {
      map: texture(paint, size),
      roughness: opts.rough ?? 0.85,
      metalness: 0,
      side: opts.side ?? THREE.FrontSide,
      // Room surfaces reflect the room, not the sky probe: the renderer's
      // indoor gate trims diffuse skylight but not IBL specular, so a glossy
      // floor at full env intensity comes back as a white sheet.
      envMapIntensity: opts.env ?? 0.18,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    };
    if (opts.bump && q >= 1) {
      const bump = texture(opts.bump, 512);
      bump.colorSpace = THREE.NoColorSpace;
      params.bumpMap = bump;
      params.bumpScale = opts.bumpScale ?? 1.5;
    }
    if (opts.alphaTest) params.alphaTest = opts.alphaTest;
    // Fake bounce: a ceiling fixture lights its own ceiling only at grazing
    // angles, so without GI the ceiling reads as a brown lid.
    if (opts.bounce) {
      params.emissive = new THREE.Color(opts.bounce[0]);
      params.emissiveMap = params.map;
      params.emissiveIntensity = opts.bounce[1];
    }
    const mat = opts.clearcoat
      ? new THREE.MeshPhysicalMaterial({
          ...params,
          clearcoat: opts.clearcoat,
          clearcoatRoughness: 0.22,
        })
      : new THREE.MeshStandardMaterial(params);
    return A.registerMaterial(key, mat, opts.surf ?? "plaster");
  };
  canvas("ac-in-sage", P.flatPaint("#cdd3b4"), 256, {
    rough: 0.92,
    bump: P.flatPaint("#808080"),
    bumpScale: 0.6,
  });
  canvas("ac-in-trim", P.flatPaint("#e2d9c6"), 128, { rough: 0.6 });
  canvas("ac-in-ceiling", P.flatPaint("#f1ede4", 0.25), 256, {
    rough: 0.95,
    bounce: ["#fff1dc", 0.22],
  });
  for (const [k, hex] of [
    ["teal", "#3d7670"],
    ["olive", "#7a7b40"],
    ["mustard", "#c49533"],
    ["green", "#4d6c4b"],
    ["orange", "#ae5a35"],
    ["blue", "#4a6990"],
    ["red", "#9c3a31"],
    ["linen", "#e5ded0"],
    ["shirt", "#8fa9c4"],
    ["navy", "#2e3b52"],
    ["skirt", "#d9b2ab"],
    ["blanket-red", "#8b3a30"],
    ["blanket-blue", "#3d5b80"],
    ["drape-gold", "#b39550"],
  ])
    canvas(`ac-in-${k}`, P.weave(hex), 256, {
      rough: 0.95,
      side: THREE.DoubleSide,
      surf: "fabric",
    });
  const fabric = { rough: 1, surf: "fabric" };
  const sheet = { rough: 1, side: THREE.DoubleSide, surf: "fabric" };
  canvas("ac-in-floral", P.floralPaper, big, { rough: 0.9 });
  canvas("ac-in-boards", P.boardsPaper, big, { rough: 0.8, bump: P.grooveBump(4), surf: "wood" });
  canvas("ac-in-wainscot", P.wainscot, big, {
    rough: 0.55,
    bump: P.grooveBump(6),
    clearcoat: 0.35,
    surf: "wood",
  });
  canvas("ac-in-atomic", P.atomicPaper, big, { rough: 0.9 });
  canvas("ac-in-damask", P.damask, big, { rough: 0.8 });
  canvas("ac-in-stripe-sage", P.stripePaper("#d3d2b4", "#b7bb93", "#8d9470", "#9a7d55"), big);
  canvas("ac-in-stripe-blue", P.stripePaper("#dfe0d6", "#a9bccb", "#6b87a1", "#c26b56"), big);
  canvas("ac-in-pine", P.knottyPine, big, {
    rough: 0.5,
    bump: P.grooveBump(6),
    clearcoat: 0.4,
    surf: "wood",
  });
  const tile = { rough: 0.45, bump: P.checkerBump, bumpScale: 1, surf: "concrete" };
  canvas("ac-in-check-blue", P.checker("#ece7da", "#3d5f8e"), big, tile);
  canvas("ac-in-check-yellow", P.checker("#ece7da", "#d9b23f"), big, tile);
  canvas("ac-in-oak", P.oakFloor, big, {
    rough: 0.62,
    bump: P.oakBump,
    surf: "wood",
  });
  canvas("ac-in-plaid", P.plaidCarpet, 512, fabric);
  canvas("ac-in-broadloom", P.broadloom("#4f6d86"), 512, fabric);
  canvas(
    "ac-in-rug-oval",
    P.braidedRug(["#2f3d57", "#8f4632", "#d8cdb2", "#6a6d3d", "#a6763b"]),
    big,
    fabric,
  );
  canvas(
    "ac-in-rug-braid",
    P.braidedRug(["#7a3a2c", "#c9b48a", "#3f5a74", "#8a8248"]),
    512,
    fabric,
  );
  canvas("ac-in-rug-rect", P.patternRug("#8a3b2e", "#2c3346", "#c9a762"), big, fabric);
  canvas("ac-in-rug-rect-blue", P.patternRug("#3a5778", "#d2c4a2", "#8e3d31"), 512, fabric);
  canvas("ac-in-formica", P.formica, 512, { rough: 0.3, clearcoat: 0.5, surf: "wood" });
  canvas("ac-in-books", P.bookSpines, 512, {
    rough: 0.8,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    surf: "wood",
  });
  canvas("ac-in-gingham-red", P.gingham("#b23a32"), 256, sheet);
  canvas("ac-in-gingham-blue", P.gingham("#3c5f8f"), 256, sheet);
  canvas("ac-in-grille", P.grilleCloth, 256, fabric);
  canvas("ac-in-chenille", P.chenille, 512, sheet);
  canvas("ac-in-pegboard", P.pegboard, 512, { rough: 0.9, surf: "wood" });
  canvas("ac-in-paint-mesa", P.mesaPainting, 512, { rough: 0.7 });
  canvas("ac-in-paint-flowers", P.flowerPainting, 512, { rough: 0.7 });
  canvas("ac-in-calendar", P.calendar, 256, { rough: 0.9 });
}

/* --------------------------------------------------------------- quads -- */

/** Batched quads with explicit metric UVs, one geometry per material. */
export class Quads {
  constructor() {
    /** @type {Map<string, {p: Array<number>, n: Array<number>, uv: Array<number>, i: Array<number>}>} */
    this.sets = new Map();
  }

  quad(key, pts, nrm, uvs) {
    let s = this.sets.get(key);
    if (!s) {
      s = { p: [], n: [], uv: [], i: [] };
      this.sets.set(key, s);
    }
    const b = s.p.length / 3;
    for (let k = 0; k < 4; k++) {
      const pt = pts[k] ?? [0, 0, 0],
        uv = uvs[k] ?? [0, 0];
      s.p.push(pt[0], pt[1], pt[2]);
      s.n.push(nrm[0], nrm[1], nrm[2]);
      s.uv.push(uv[0], uv[1]);
    }
    s.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  /**
   * A vertical rectangle on a wall face. axis "x": the face runs along x at
   * z = at and faces +z (side 1) or -z (side -1); axis "z": along z at x = at,
   * facing +x or -x. `a`..`b` is the run, `lo`..`hi` the height.
   */
  wall(key, axis, at, side, a, b, lo, hi, tile) {
    if (b - a < 1e-3 || hi - lo < 1e-3) return;
    const v0 = lo / tile,
      v1 = hi / tile,
      ua = a / tile,
      ub = b / tile;
    const forward = (axis === "x") === side > 0;
    const at3 = axis === "x" ? (u, y) => [u, y, at] : (u, y) => [at, y, u];
    const nrm = axis === "x" ? [0, 0, side] : [side, 0, 0];
    if (forward)
      this.quad(key, [at3(a, lo), at3(b, lo), at3(b, hi), at3(a, hi)], nrm, [
        [ua, v0],
        [ub, v0],
        [ub, v1],
        [ua, v1],
      ]);
    else
      this.quad(key, [at3(b, lo), at3(a, lo), at3(a, hi), at3(b, hi)], nrm, [
        [-ub, v0],
        [-ua, v0],
        [-ua, v1],
        [-ub, v1],
      ]);
  }

  /** Horizontal rectangle facing up (or down) with metric UVs, or 0..1 when `unit`. */
  flat(key, r, y, tile, down = false, unit = false) {
    const { x0, x1, z0, z1 } = r;
    const uv = unit
      ? [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ]
      : [
          [x0 / tile, -z1 / tile],
          [x1 / tile, -z1 / tile],
          [x1 / tile, -z0 / tile],
          [x0 / tile, -z0 / tile],
        ];
    const pts = [
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
    ];
    if (down) {
      pts.reverse();
      uv.reverse();
    }
    this.quad(key, pts, [0, down ? -1 : 1, 0], uv);
  }

  flush(K) {
    for (const [key, s] of this.sets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(s.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(s.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
      g.setIndex(s.i);
      K.geo(key, g, 0, 0, 0);
    }
    this.sets.clear();
  }
}

/**
 * Line one wall face from `from` to `to` along its run, cutting holes. Each
 * hole is `{c, w, y, h}`: centre along the run, width, absolute sill, height.
 * Returns the spans that reach the floor uncut, for baseboards.
 */
export function lineWall(Qd, key, face, from, to, y0, y1, holes, tile) {
  const cuts = [from, to, ...holes.flatMap((h) => [h.c - h.w / 2, h.c + h.w / 2])]
    .filter((v) => v >= from - 1e-6 && v <= to + 1e-6)
    .sort((a, b) => a - b);
  const solid = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i] ?? from,
      b = cuts[i + 1] ?? to;
    if (b - a < 1e-3) continue;
    const m = (a + b) / 2;
    const open = holes
      .filter((h) => m > h.c - h.w / 2 && m < h.c + h.w / 2)
      .map((h) => ({ y: h.y, h: h.h }));
    for (const [lo, hi] of wallSpans(y0, y1, open))
      Qd.wall(key, face.axis, face.at, face.side, a, b, lo, hi, tile);
    if (!open.some((h) => h.y <= y0 + 0.05)) solid.push([a, b]);
  }
  return solid;
}

/* ------------------------------------------------------------- helpers -- */

/** Yaw-local placement for one piece: (lx, ly, lz) in the piece frame to house coords. */
function frame(K, A, x, z, yaw, y0) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const R = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const at = (lx, ly, lz) => {
    const [X, Z] = R(lx, lz);
    return [X, y0 + ly, Z];
  };
  const sphereGeo = A.cache("ac-sphere", () => new THREE.SphereGeometry(1, 24, 16));
  return {
    at,
    cone: A.cache("ac-in-cone", () => new THREE.CylinderGeometry(0.1, 0.17, 0.2, 24, 1, true)),
    B: (key, lx, ly, lz, w, h, d, collide = false, rx = 0, rz = 0) => {
      const [X, Z] = R(lx, lz);
      K.box(key, X, y0 + ly, Z, w, h, d, collide, rx, yaw, rz);
    },
    Rd: (key, lx, ly, lz, w, h, d, r = 0.04) => {
      const [X, Z] = R(lx, lz);
      const rr = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
      K.round(key, X, y0 + ly, Z, w, h, d, rr, false, 0, yaw);
    },
    L: (key, a, b, r = 0.02, sides = 8) => K.line(key, at(...a), at(...b), r, sides),
    S: (key, lx, ly, lz, sx, sy, sz) => {
      const [X, Z] = R(lx, lz);
      K.geo(key, sphereGeo, X, y0 + ly, Z, sx, sy, sz, 0, yaw);
    },
    G: (key, g, lx, ly, lz, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
      const [X, Z] = R(lx, lz);
      K.geo(key, g, X, y0 + ly, Z, sx, sy, sz, rx, yaw, rz);
    },
    C: (key, lx, ly, lz, r, h) => {
      const [X, Z] = R(lx, lz);
      K.cylinder(key, X, y0 + ly, Z, r, h);
    },
  };
}

/** Four tapered, splayed legs: the mid-century signature. */
function legs(F, key, w, d, top, inset = 0.08, splay = 0.035, r = 0.018) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      F.L(
        key,
        [sx * (w / 2 - inset), top, sz * (d / 2 - inset)],
        [sx * (w / 2 - inset + splay), 0, sz * (d / 2 - inset + splay)],
        r,
        6,
      );
}

/** A pleated curtain panel: a sine-folded plane with 16 cm metric UVs. */
function drapeGeometry(A, w, h, folds) {
  return A.cache(`ac-in-drape:${w}:${h}:${folds}`, () => {
    const seg = Math.max(8, Math.round(w / 0.025));
    const g = new THREE.PlaneGeometry(w, h, seg, 1);
    const p = g.getAttribute("position"),
      uv = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i);
      p.setZ(i, 0.03 * Math.sin(((x + w / 2) / w) * folds * Math.PI * 2));
      uv.setXY(i, (x + w / 2) / 0.16, (y + h / 2) / 0.16);
    }
    g.computeVertexNormals();
    return g;
  });
}

const lathe = (A, key, pts) =>
  A.cache(
    key,
    () =>
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        20,
      ),
  );

/* ---------------------------------------------------------- mannequins -- */

const OUTFIT_TOP = {
  red: "ac-in-red",
  blue: "ac-in-blue",
  green: "ac-in-green",
  stripe: "ac-in-navy",
  apron: "ac-in-shirt",
  shirt: "ac-in-shirt",
};

/**
 * One store mannequin of the 1950s family that sits in every room. style is
 * "pose:who:outfit" with pose stand | sit | floor and who man | woman | boy | girl.
 */
function mannequin(K, A, f, y0, q) {
  const [pose = "stand", who = "man", outfit = "shirt"] = (f.style ?? "").split(":");
  const s = who === "boy" || who === "girl" ? 0.72 : who === "woman" ? 0.95 : 1;
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const at = (x, y, z) => [x * s, y * s, z * s];
  const skin = "ac-in-mannequin";
  const dress = outfit === "red" || outfit === "blue" || outfit === "green";
  const top = OUTFIT_TOP[outfit] ?? "ac-in-shirt";
  const pants = outfit === "stripe" ? "ac-in-olive" : "ac-in-navy";
  const hip = pose === "stand" ? 0.92 : pose === "sit" ? 0.5 / s : 0.12 / s;
  const limb = (key, a, b, r) => F.L(key, at(...a), at(...b), r * s, 10);
  const joint = (key, p, r) => F.S(key, p[0] * s, p[1] * s, p[2] * s, r * s, r * s, r * s);

  let knee, ankle;
  if (pose === "stand") {
    knee = [0.09, 0.5, 0.01];
    ankle = [0.085, 0.08, 0];
  } else if (pose === "sit") {
    knee = [0.1, hip + 0.02, 0.44];
    ankle = [0.1, 0.08 / s, 0.5];
  } else {
    knee = [0.2, hip + 0.16, 0.3];
    ankle = [-0.08, hip + 0.02, 0.42];
  }
  const legKey = dress ? skin : pants;
  for (const m of [-1, 1]) {
    const k = [knee[0] * m, knee[1], knee[2]],
      an = [ankle[0] * m, ankle[1], ankle[2] + (pose === "floor" && m < 0 ? -0.04 : 0)];
    limb(legKey, [0.09 * m, hip, 0], k, 0.065);
    limb(legKey, k, an, 0.05);
    joint(legKey, k, 0.056);
    F.B("ac-dark", an[0] * s, (an[1] - 0.03) * s, (an[2] + 0.06) * s, 0.09 * s, 0.07 * s, 0.25 * s);
  }
  if (!dress) F.S(pants, 0, hip * s, 0, 0.165 * s, 0.11 * s, 0.11 * s);
  const torso = lathe(A, "ac-in-torso", [
    [0.0, -0.02],
    [0.14, 0.0],
    [0.15, 0.12],
    [0.135, 0.2],
    [0.15, 0.33],
    [0.165, 0.44],
    [0.15, 0.52],
    [0.06, 0.58],
    [0.0, 0.6],
  ]);
  const bodice = lathe(A, "ac-in-bodice", [
    [0.0, -0.02],
    [0.15, 0.0],
    [0.12, 0.13],
    [0.155, 0.3],
    [0.145, 0.42],
    [0.14, 0.5],
    [0.055, 0.56],
    [0.0, 0.58],
  ]);
  F.G(top, dress ? bodice : torso, 0, hip * s, 0, s, s, s * 0.66);
  if (dress && pose === "stand") {
    const skirt = lathe(A, "ac-in-skirt", [
      [0.0, 0.0],
      [0.3, 0.0],
      [0.27, 0.1],
      [0.18, 0.38],
      [0.13, 0.5],
      [0.0, 0.5],
    ]);
    F.G(top, skirt, 0, (hip - 0.42) * s, 0, s, s, s * 0.82);
  } else if (dress) {
    F.Rd(top, 0, (hip + 0.03) * s, 0.2 * s, 0.38 * s, 0.12 * s, 0.5 * s, 0.05 * s);
    F.Rd(
      top,
      0,
      (knee[1] - 0.12) * s,
      (knee[2] + 0.02) * s,
      0.4 * s,
      0.26 * s,
      0.06 * s,
      0.025 * s,
    );
  }
  if (outfit === "apron") {
    F.B("ac-in-linen", 0, (hip + 0.08) * s, 0.12 * s, 0.32 * s, 0.6 * s, 0.02 * s);
    for (const m of [-1, 1])
      F.L("ac-in-linen", at(0.08 * m, hip + 0.38, 0.11), at(0, hip + 0.56, 0.06), 0.008, 4);
  }
  if (who === "man" && outfit !== "apron")
    F.B("ac-in-red", 0, (hip + 0.4) * s, 0.105 * s, 0.05 * s, 0.24 * s, 0.012 * s, false, -0.12);
  if (outfit === "stripe" && q >= 1)
    for (let k = 0; k < 4; k++)
      F.S("ac-in-linen", 0, (hip + 0.14 + k * 0.1) * s, 0, 0.158 * s, 0.018 * s, 0.112 * s);
  const neck = hip + 0.58,
    head = neck + 0.16,
    hair = "ac-in-mannequin-hair";
  F.S(skin, 0, (neck + 0.03) * s, 0, 0.05 * s, 0.07 * s, 0.05 * s);
  F.S(skin, 0, head * s, 0.005 * s, 0.092 * s, 0.118 * s, 0.104 * s);
  if (who === "woman") {
    F.S(hair, 0, (head + 0.045) * s, -0.012 * s, 0.112 * s, 0.1 * s, 0.118 * s);
    F.S(hair, 0, (head - 0.02) * s, -0.05 * s, 0.1 * s, 0.09 * s, 0.08 * s);
  } else if (who === "girl") {
    F.S(hair, 0, (head + 0.04) * s, -0.01 * s, 0.1 * s, 0.09 * s, 0.11 * s);
    F.S(hair, 0, (head - 0.04) * s, -0.11 * s, 0.045 * s, 0.09 * s, 0.045 * s);
  } else F.S(hair, 0, (head + 0.045) * s, -0.01 * s, 0.098 * s, 0.075 * s, 0.11 * s);
  const sh = hip + 0.5;
  for (const m of [-1, 1]) {
    let el, wr;
    if (pose === "stand" && outfit === "apron") {
      el = [0.21 * m, hip + 0.24, 0.06];
      wr = [0.15 * m, hip + 0.16, 0.36];
    } else if (pose === "stand") {
      el = [0.21 * m, hip + 0.22, 0.02];
      wr = [0.2 * m, hip - 0.02, 0.07];
    } else if (pose === "sit") {
      el = [0.2 * m, hip + 0.24, 0.02];
      wr = [0.14 * m, hip + 0.2, 0.3];
    } else {
      el = [0.21 * m, hip + 0.22, 0.08];
      wr = [0.12 * m, hip + 0.12, 0.3];
    }
    limb(top, [0.19 * m, sh, 0], el, 0.047);
    limb(dress ? skin : top, el, wr, 0.039);
    joint(top, [0.19 * m, sh, 0], 0.06);
    F.S(skin, wr[0] * s, wr[1] * s, (wr[2] + 0.04) * s, 0.04 * s, 0.055 * s, 0.03 * s);
  }
  if (f.solid) K.box(null, f.x, y0 + 0.85, f.z, 0.5, 1.7, 0.4, true, 0, f.yaw ?? 0);
}

/* ------------------------------------------------------------- kitchen -- */

function kitchenRun(K, A, Qd, f, y0, id, q) {
  // Lower cabinets along the back wall (counters face +z at yaw 0).
  const cab = f.style === "red" ? "ac-in-cab-red" : "ac-in-honey";
  const x0 = f.x - f.w / 2,
    z = f.z,
    d = f.d;
  K.box("ac-dark", f.x, y0 + 0.05, z - 0.03, f.w - 0.02, 0.1, d - 0.12, false);
  K.box(cab, f.x, y0 + 0.49, z - 0.01, f.w, 0.78, d - 0.04, false);
  const n = Math.max(1, Math.round(f.w / 0.55)),
    dw = f.w / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + dw * (i + 0.5),
      zf = z + d / 2 - 0.01;
    K.box(cab, cx, y0 + 0.44, zf, dw - 0.03, 0.58, 0.025, false);
    K.box(cab, cx, y0 + 0.8, zf, dw - 0.03, 0.12, 0.025, false);
    K.box(
      "ac-chrome",
      cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.08),
      y0 + 0.6,
      zf + 0.022,
      0.016,
      0.12,
      0.016,
      false,
    );
    K.box("ac-chrome", cx, y0 + 0.8, zf + 0.022, 0.12, 0.014, 0.014, false);
  }
  // Laminate top with a chrome edge band, and a laminate backsplash.
  K.box("ac-chrome", f.x, y0 + 0.9, z + 0.015, f.w + 0.02, 0.04, d + 0.03, false);
  Qd.flat(
    "ac-in-formica",
    { x0: x0 - 0.01, x1: x0 + f.w + 0.01, z0: z - d / 2, z1: z + d / 2 + 0.03 },
    y0 + 0.9205,
    0.6,
  );
  Qd.wall("ac-in-formica", "x", SHELL.z0 + EPS * 2, 1, x0, x0 + f.w, y0 + 0.92, y0 + 1.12, 0.6);
  // Sink under the window, with a gooseneck tap.
  const sx = -3.0;
  if (sx > x0 + 0.4 && sx < x0 + f.w - 0.4) {
    K.box("ac-chrome", sx, y0 + 0.926, z + 0.02, 0.78, 0.012, 0.5, false);
    K.box("ac-dark", sx, y0 + 0.93, z + 0.02, 0.62, 0.006, 0.38, false);
    const tz = SHELL.z0 + 0.1;
    K.line("ac-chrome", [sx, y0 + 0.93, tz], [sx, y0 + 1.22, tz], 0.014, 8);
    K.line("ac-chrome", [sx, y0 + 1.22, tz], [sx, y0 + 1.22, tz + 0.18], 0.012, 8);
    K.line("ac-chrome", [sx, y0 + 1.22, tz + 0.18], [sx, y0 + 1.12, tz + 0.2], 0.01, 8);
    for (const m of [-1, 1])
      K.sphere("ac-chrome", sx + m * 0.12, y0 + 0.97, tz, 0.025, 0.02, 0.025);
  }
  // Wall cabinets clear of the window and the range hood.
  const uppers =
    id === "yellow"
      ? [
          [-5.85, -4.25],
          [-1.85, -0.98],
        ]
      : [[-1.85, -0.98]];
  for (const [a, b] of uppers) {
    const ux = (a + b) / 2,
      uz = SHELL.z0 + 0.17;
    K.box(cab, ux, y0 + 1.88, uz, b - a, 0.72, 0.34, false);
    const un = Math.max(1, Math.round((b - a) / 0.45)),
      uw = (b - a) / un;
    for (let i = 0; i < un; i++) {
      const cx = a + uw * (i + 0.5);
      K.box(cab, cx, y0 + 1.88, uz + 0.175, uw - 0.03, 0.66, 0.02, false);
      K.box(
        "ac-chrome",
        cx + (i % 2 ? 1 : -1) * (uw / 2 - 0.06),
        y0 + 1.62,
        uz + 0.19,
        0.014,
        0.1,
        0.014,
        false,
      );
    }
  }
  if (q >= 1) {
    // Canisters and a chrome bread box.
    const cz = SHELL.z0 + 0.18;
    for (let i = 0; i < 4; i++) {
      const r = 0.075 - i * 0.01,
        h = 0.24 - i * 0.03,
        cx = x0 + 0.35 + i * 0.19;
      K.cylinder(
        id === "yellow" ? "ac-red" : "ac-in-ceramic-teal",
        cx,
        y0 + 0.92 + h / 2,
        cz,
        r,
        h,
      );
      K.cylinder("ac-chrome", cx, y0 + 0.93 + h, cz, r + 0.003, 0.016);
    }
    K.round("ac-chrome", -1.45, y0 + 1.03, cz + 0.03, 0.42, 0.22, 0.28, 0.06, false);
  }
}

function range(K, A, f, y0, q) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  F.Rd("ac-enamel", 0, 0.46, 0, f.w, 0.88, f.d, 0.03);
  F.B("ac-enamel", 0, 1.03, -f.d / 2 + 0.05, f.w, 0.25, 0.08);
  F.B("ac-chrome", 0, 1.03, -f.d / 2 + 0.095, f.w - 0.1, 0.07, 0.01);
  F.B("ac-dark", 0, 0.905, 0.03, f.w - 0.06, 0.012, f.d - 0.14);
  const ring = A.cache("ac-in-burner", () => new THREE.TorusGeometry(0.075, 0.008, 6, 20));
  for (const [bx, bz] of [
    [-0.18, -0.08],
    [0.18, -0.08],
    [-0.18, 0.15],
    [0.18, 0.15],
  ]) {
    F.G("ac-chrome", ring, bx, 0.915, bz, 1, 1, 1, Q);
    if (q >= 1) F.G("ac-chrome", ring, bx, 0.915, bz, 0.55, 0.55, 1, Q);
  }
  F.B("ac-enamel", 0, 0.47, f.d / 2 + 0.005, f.w - 0.08, 0.5, 0.02);
  F.B("ac-in-crt", 0, 0.52, f.d / 2 + 0.017, 0.4, 0.2, 0.006);
  F.L("ac-chrome", [-0.25, 0.76, f.d / 2 + 0.05], [0.25, 0.76, f.d / 2 + 0.05], 0.012, 8);
  for (let i = 0; i < 4; i++)
    F.S("ac-dark", -0.24 + i * 0.16, 0.84, f.d / 2 + 0.02, 0.022, 0.022, 0.016);
  F.B("ac-enamel", 0, 1.86, -f.d / 2 + 0.25, f.w + 0.06, 0.16, 0.48);
  F.B("ac-enamel", 0, 2.25, -f.d / 2 + 0.13, 0.36, 0.62, 0.24);
}

function fridge(K, A, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  F.Rd("ac-enamel", 0, f.h / 2 + 0.06, 0, f.w, f.h - 0.12, f.d, 0.11);
  F.B("ac-dark", 0, 0.05, 0, f.w - 0.06, 0.1, f.d - 0.08);
  F.B("ac-dark", 0, f.h * 0.7, f.d / 2 + 0.002, f.w - 0.06, 0.008, 0.01);
  F.B("ac-chrome", f.w / 2 - 0.1, 1.12, f.d / 2 + 0.035, 0.035, 0.24, 0.05);
  F.B("ac-chrome", 0, f.h - 0.2, f.d / 2 + 0.01, 0.18, 0.03, 0.012);
  F.B("ac-dark", 0, 0.16, f.d / 2 - 0.01, f.w - 0.12, 0.08, 0.012);
}

function booth(K, A, Qd, f, y0, q) {
  // Benches at both ends of the footprint and the table between, against the side wall.
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const w = f.w,
    d = f.d;
  for (const m of [-1, 1]) {
    const bz = m * (d / 2 - 0.28);
    F.B("ac-in-cab-red", 0, 0.2, bz, w - 0.06, 0.38, 0.5);
    F.Rd("ac-in-vinyl-yellow", 0, 0.45, bz - m * 0.02, w, 0.13, 0.52, 0.05);
    F.Rd("ac-in-vinyl-yellow", 0, 0.82, m * (d / 2 - 0.07), w, 0.66, 0.14, 0.06);
    F.B("ac-chrome", 0, 0.385, bz - m * 0.255, w, 0.025, 0.012);
    F.B("ac-chrome", 0, 1.16, m * (d / 2 - 0.07), w, 0.02, 0.15);
  }
  const tx = 0.1;
  F.B("ac-chrome", tx, 0.735, 0, w - 0.15, 0.035, 0.92);
  Qd.flat(
    "ac-in-formica",
    {
      x0: f.x + tx - (w - 0.17) / 2,
      x1: f.x + tx + (w - 0.17) / 2,
      z0: f.z - 0.45,
      z1: f.z + 0.45,
    },
    y0 + 0.7535,
    0.6,
  );
  F.C("ac-chrome", tx - 0.25, 0.37, 0, 0.04, 0.7);
  F.C("ac-chrome", tx - 0.25, 0.012, 0, 0.22, 0.024);
  if (q >= 1) {
    for (const m of [-1, 1]) {
      F.C("ac-in-ceramic", tx - 0.15, 0.762, m * 0.25, 0.12, 0.012);
      F.C("ac-glass", tx + 0.2, 0.82, m * 0.3, 0.035, 0.12);
    }
    F.B("ac-chrome", tx + 0.55, 0.8, 0, 0.12, 0.1, 0.05);
    F.C("ac-in-ceramic", tx + 0.55, 0.79, 0.12, 0.018, 0.07);
    F.C("ac-dark", tx + 0.55, 0.79, -0.12, 0.018, 0.07);
  }
  K.box(null, f.x, y0 + 0.52, f.z, w, 1.04, d, true, 0, f.yaw ?? 0);
}

function tallCabinet(K, A, f, y0, glass) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const cab = f.style === "red" ? "ac-in-cab-red" : "ac-in-honey";
  if (!glass) {
    F.B(cab, 0, f.h / 2, 0, f.w, f.h, f.d);
    for (const m of [-1, 1]) {
      F.B(cab, m * f.w * 0.25, f.h * 0.5, f.d / 2 + 0.01, f.w / 2 - 0.03, f.h - 0.12, 0.02);
      F.B("ac-chrome", m * 0.06, f.h * 0.52, f.d / 2 + 0.03, 0.014, 0.14, 0.016);
    }
    return;
  }
  // Hutch: base cabinet and a glazed upper with plates on the shelves.
  F.B(cab, 0, 0.44, 0, f.w, 0.88, f.d);
  F.B(cab, 0, 0.9, 0.02, f.w + 0.04, 0.04, f.d + 0.04);
  for (const m of [-1, 1]) {
    F.B(cab, m * f.w * 0.25, 0.45, f.d / 2 + 0.01, f.w / 2 - 0.03, 0.72, 0.02);
    F.B("ac-in-brass", m * 0.06, 0.6, f.d / 2 + 0.03, 0.014, 0.08, 0.016);
  }
  const ud = 0.3,
    plate = A.cache("ac-in-plate", () => new THREE.CylinderGeometry(0.1, 0.1, 0.014, 20));
  F.B(cab, 0, 1.46, -f.d / 2 + ud / 2, f.w, 1.08, ud);
  F.B("ac-dark", 0, 1.43, -f.d / 2 + ud - 0.01, f.w - 0.08, 0.95, 0.01);
  for (const y of [1.18, 1.5]) {
    F.B(cab, 0, y, -f.d / 2 + ud / 2, f.w - 0.06, 0.025, ud - 0.04);
    for (let i = 0; i < 4; i++)
      F.G("ac-in-ceramic", plate, -0.3 + i * 0.2, y + 0.11, -f.d / 2 + 0.07, 1, 1, 1, Q * 0.85);
  }
  F.B("ac-glass", 0, 1.42, -f.d / 2 + ud + 0.005, f.w - 0.1, 0.9, 0.01);
}

/* -------------------------------------------------------- living rooms -- */

const FABRIC = {
  teal: "ac-in-teal",
  olive: "ac-in-olive",
  mustard: "ac-in-mustard",
  green: "ac-in-green",
  orange: "ac-in-orange",
  blue: "ac-in-blue",
  red: "ac-in-red",
};

function collider(K, f, y0, h = f.h) {
  K.box(null, f.x, y0 + h / 2, f.z, f.w, h, f.d, true, 0, f.yaw ?? 0);
}

function diningTable(K, A, f, y0, q) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  F.Rd("ac-in-maple", 0, f.h - 0.02, 0, f.w, 0.04, f.d, 0.018);
  F.B("ac-in-maple", 0, f.h - 0.08, 0, f.w - 0.16, 0.08, f.d - 0.16);
  legs(F, "ac-in-maple", f.w, f.d, f.h - 0.1, 0.1, 0.03, 0.022);
  if (q >= 1) {
    const bowl = lathe(A, "ac-in-bowl", [
      [0, 0],
      [0.06, 0],
      [0.13, 0.06],
      [0.15, 0.09],
    ]);
    F.G("ac-in-ceramic-teal", bowl, 0, f.h, 0);
    F.S("ac-red", -0.04, f.h + 0.07, 0.02, 0.04, 0.04, 0.04);
    F.S("ac-orange", 0.05, f.h + 0.07, -0.02, 0.04, 0.04, 0.04);
    F.S("ac-yellow", 0.0, f.h + 0.1, 0.0, 0.045, 0.035, 0.035);
  }
  collider(K, f, y0);
}

function chair(K, A, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const seat = f.style === "red" ? "ac-in-vinyl-yellow" : "ac-in-red";
  F.Rd(seat, 0, 0.46, 0.02, 0.42, 0.06, 0.4, 0.025);
  F.Rd(seat, 0, 0.82, -0.19, 0.4, 0.22, 0.05, 0.02);
  legs(F, "ac-chrome", 0.4, 0.38, 0.43, 0.04, 0.02, 0.011);
  for (const m of [-1, 1])
    F.L("ac-chrome", [m * 0.18, 0.46, -0.18], [m * 0.18, 0.92, -0.2], 0.01, 6);
  K.box(null, f.x, y0 + 0.45, f.z, 0.42, 0.9, 0.48, true, 0, f.yaw ?? 0);
}

function sofa(K, A, f, y0, q, arm) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const cloth = FABRIC[f.style ?? "teal"] ?? "ac-in-teal";
  const w = f.w,
    d = f.d,
    armW = 0.16;
  const inner = w - armW * 2;
  F.Rd(cloth, 0, 0.27, 0.02, w - 0.04, 0.22, d - 0.08, 0.05);
  F.Rd(cloth, 0, 0.62, -d / 2 + 0.11, w - 0.02, 0.62, 0.2, 0.07);
  const n = arm ? 1 : Math.max(2, Math.round(inner / 0.62));
  for (let i = 0; i < n; i++) {
    const cx = -inner / 2 + (inner / n) * (i + 0.5);
    F.Rd(cloth, cx, 0.45, 0.06, inner / n - 0.015, 0.15, d - 0.3, 0.06);
    F.Rd(cloth, cx, 0.68, -d / 2 + 0.26, inner / n - 0.02, 0.4, 0.13, 0.06);
  }
  for (const m of [-1, 1])
    F.Rd(cloth, m * (w / 2 - armW / 2), 0.47, 0.0, armW, 0.36, d - 0.04, 0.06);
  legs(F, "ac-in-walnut", w - 0.08, d - 0.16, 0.17, 0.04, 0.03, 0.015);
  if (!arm && q >= 1) {
    F.Rd("ac-in-mustard", -inner / 2 + 0.24, 0.66, -d / 2 + 0.38, 0.36, 0.34, 0.11, 0.05);
    F.Rd("ac-in-linen", inner / 2 - 0.24, 0.66, -d / 2 + 0.38, 0.36, 0.34, 0.11, 0.05);
  }
  collider(K, f, y0, 0.9);
}

function loungeChair(K, A, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const cloth = FABRIC[f.style ?? "orange"] ?? "ac-in-orange";
  F.Rd(cloth, 0, 0.4, 0.04, f.w - 0.06, 0.1, f.d - 0.16, 0.05);
  F.Rd(cloth, 0, 0.72, -f.d / 2 + 0.12, f.w - 0.06, 0.56, 0.1, 0.05);
  F.B("ac-in-walnut", 0, 0.34, 0.02, f.w - 0.1, 0.04, f.d - 0.2);
  legs(F, "ac-chrome", f.w - 0.14, f.d - 0.2, 0.33, 0.02, 0.05, 0.012);
  collider(K, f, y0, 0.95);
}

function coffeeTable(K, A, f, y0, q) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const top = A.cache(`ac-in-kidney:${f.w}:${f.d}`, () => {
    const s = new THREE.Shape(),
      w = f.w / 2,
      d = f.d / 2;
    s.moveTo(-w, 0);
    s.bezierCurveTo(-w, d * 1.2, -w * 0.2, d * 1.1, 0, d * 0.55);
    s.bezierCurveTo(w * 0.2, d * 1.1, w, d * 1.2, w, 0);
    s.bezierCurveTo(w, -d * 1.3, -w, -d * 1.3, -w, 0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.01,
      bevelSegments: 2,
      curveSegments: 24,
    });
    g.rotateX(-Q);
    return g;
  });
  F.G("ac-in-walnut", top, 0, f.h - 0.045, 0);
  legs(F, "ac-in-walnut", f.w * 0.8, f.d * 0.6, f.h - 0.04, 0.02, 0.04, 0.014);
  if (q >= 1) {
    F.B("ac-in-blue", -0.15, f.h + 0.009, 0.0, 0.22, 0.008, 0.28, false, 0, 0.2);
    F.B("ac-in-red", -0.12, f.h + 0.017, 0.02, 0.21, 0.008, 0.28, false, 0, -0.1);
    F.C("ac-glass", 0.25, f.h + 0.05, -0.02, 0.06, 0.08);
  }
  collider(K, f, y0);
}

function consoleTv(K, A, Qd, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  F.Rd("ac-in-walnut", 0, f.h / 2 + 0.08, 0, f.w, f.h - 0.16, f.d, 0.03);
  legs(F, "ac-in-walnut", f.w - 0.06, f.d - 0.08, 0.1, 0.04, 0.02, 0.016);
  F.Rd("ac-in-crt", -f.w * 0.16, f.h * 0.62, f.d / 2 - 0.02, f.w * 0.5, f.h * 0.42, 0.08, 0.06);
  F.B("ac-chrome", -f.w * 0.16, f.h * 0.62, f.d / 2 - 0.035, f.w * 0.54, f.h * 0.46, 0.04);
  const [gx, gy, gz] = F.at(f.w * 0.3, f.h * 0.42, f.d / 2 + 0.002);
  K.art("ac-in-grille", gx, gy, gz, f.w * 0.3, f.h * 0.56, f.yaw ?? 0);
  for (let i = 0; i < 2; i++)
    F.S("ac-in-brass", f.w * 0.3, f.h * 0.82 - i * 0.07, f.d / 2 + 0.01, 0.02, 0.02, 0.015);
  F.S("ac-dark", 0, f.h + 0.02, -0.05, 0.06, 0.03, 0.05);
  F.L("ac-chrome", [0, f.h + 0.04, -0.05], [-0.25, f.h + 0.6, -0.1], 0.005, 4);
  F.L("ac-chrome", [0, f.h + 0.04, -0.05], [0.25, f.h + 0.6, -0.1], 0.005, 4);
  collider(K, f, y0);
}

/** Low case goods: sideboard, dresser, nightstand, as rows by columns of drawers. */
function caseGood(K, A, f, y0, q, rows, cols, id) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const wood = f.style === "maple" ? "ac-in-maple" : "ac-in-walnut";
  const body = f.h - 0.14;
  F.Rd(wood, 0, 0.14 + body / 2, 0, f.w, body, f.d, 0.015);
  legs(F, wood, f.w - 0.04, f.d - 0.06, 0.15, 0.04, 0.025, 0.016);
  const dw = (f.w - 0.06) / cols,
    dh = (body - 0.06) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cx = -f.w / 2 + 0.03 + dw * (c + 0.5),
        cy = 0.17 + dh * (r + 0.5);
      F.B(wood, cx, cy, f.d / 2 + 0.006, dw - 0.02, dh - 0.02, 0.014);
      F.B("ac-in-brass", cx, cy, f.d / 2 + 0.02, Math.min(0.14, dw * 0.4), 0.014, 0.014);
    }
  if (f.kind === "nightstand" || f.kind === "sideboard") {
    const ox = f.kind === "sideboard" ? -f.w / 2 + 0.25 : 0;
    tableLamp(F, A, ox, f.h, 0);
    if (f.kind === "sideboard" && q >= 1) {
      const vase = lathe(A, "ac-in-vase", [
        [0, 0],
        [0.06, 0],
        [0.08, 0.1],
        [0.04, 0.24],
        [0.05, 0.3],
      ]);
      F.G("ac-in-ceramic-teal", vase, f.w / 2 - 0.25, f.h, 0);
    }
  }
  if (f.kind === "dresser" && id === "green") {
    F.B("ac-in-walnut", 0, f.h + 0.45, -f.d / 2 + 0.03, 0.7, 0.8, 0.03);
    F.B("ac-in-mirror", 0, f.h + 0.45, -f.d / 2 + 0.05, 0.62, 0.72, 0.01);
  }
  collider(K, f, y0);
}

function tableLamp(F, A, x, y, z) {
  const base = lathe(A, "ac-in-lampbase", [
    [0, 0],
    [0.07, 0],
    [0.09, 0.08],
    [0.05, 0.22],
    [0.015, 0.3],
  ]);
  F.G("ac-in-ceramic-teal", base, x, y, z);
  F.G("ac-in-shade", F.cone, x, y + 0.38, z, 0.9, 1, 0.9);
}

function floorLamp(F, x, z) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    F.L("ac-in-brass", [x, 0.32, z], [x + Math.cos(a) * 0.2, 0, z + Math.sin(a) * 0.2], 0.008, 6);
  }
  F.L("ac-in-brass", [x, 0.3, z], [x, 1.32, z], 0.01, 8);
  F.G("ac-in-shade", F.cone, x, 1.42, z, 1.4, 1.5, 1.4);
  F.S("ac-bulb", x, 1.38, z, 0.035, 0.05, 0.035);
}

function bookcase(K, A, Qd, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const wood = f.style === "maple" ? "ac-in-maple" : "ac-in-walnut";
  F.B(wood, 0, f.h / 2, -f.d / 2 + 0.01, f.w, f.h, 0.02);
  for (const m of [-1, 1]) F.B(wood, m * (f.w / 2 - 0.015), f.h / 2, 0, 0.03, f.h, f.d);
  const n = Math.max(3, Math.round(f.h / 0.36));
  const gap = (f.h - 0.06) / n;
  for (let i = 0; i <= n; i++) F.B(wood, 0, 0.03 + i * gap, 0, f.w - 0.04, 0.025, f.d);
  for (let i = 0; i < n; i++) {
    const y = 0.05 + i * gap + gap * 0.4;
    const [bx, by, bz] = F.at(0, y, f.d / 2 - 0.04);
    const g = new THREE.PlaneGeometry(f.w - 0.08, gap * 0.8);
    const uv = g.getAttribute("uv");
    for (let k = 0; k < uv.count; k++)
      uv.setXY(k, uv.getX(k) * 0.5 + (i % 2) * 0.5, uv.getY(k) * 0.25 + (i % 4) * 0.25);
    K.geo("ac-in-books", g, bx, by, bz, 1, 1, 1, 0, f.yaw ?? 0);
    F.B("ac-dark", 0, y, -f.d / 2 + 0.06, f.w - 0.08, gap * 0.8, 0.05);
  }
  collider(K, f, y0);
}

function bed(K, A, f, y0, q, bunk) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const wood = bunk ? "ac-in-maple" : "ac-in-walnut";
  const levels = bunk ? [0.36, 1.32] : [0.4];
  const blanket = bunk ? ["ac-in-blanket-red", "ac-in-blanket-blue"] : ["ac-in-chenille"];
  // Head of the bed at -z in the piece frame.
  F.B(wood, 0, bunk ? f.h / 2 : 0.55, -f.d / 2 + 0.03, f.w, bunk ? f.h : 1.1, 0.05);
  F.B(wood, 0, bunk ? f.h / 2 : 0.35, f.d / 2 - 0.03, f.w, bunk ? f.h : 0.7, 0.05);
  levels.forEach((ly, i) => {
    for (const m of [-1, 1]) F.B(wood, m * (f.w / 2 - 0.02), ly - 0.1, 0, 0.04, 0.16, f.d - 0.06);
    F.Rd("ac-in-linen", 0, ly + 0.06, 0, f.w - 0.08, 0.18, f.d - 0.1, 0.05);
    const key = blanket[i] ?? "ac-in-chenille";
    if (bunk) F.Rd(key, 0, ly + 0.16, 0.18, f.w - 0.04, 0.06, f.d - 0.46, 0.03);
    const pw = bunk ? f.w - 0.2 : (f.w - 0.3) / 2;
    for (const px of bunk ? [0] : [-(pw / 2 + 0.05), pw / 2 + 0.05])
      F.Rd("ac-in-linen", px, ly + 0.21, -f.d / 2 + 0.28, pw, 0.13, 0.34, 0.06);
  });
  if (!bunk) {
    // Chenille spread over the mattress, draped past the sides.
    F.Rd("ac-in-chenille", 0, 0.5, 0.15, f.w + 0.02, 0.06, f.d - 0.36, 0.03);
    for (const m of [-1, 1])
      F.B("ac-in-chenille", m * (f.w / 2 + 0.01), 0.36, 0.15, 0.015, 0.26, f.d - 0.36);
  }
  if (bunk) {
    for (const m of [-1, 1])
      for (const n of [-1, 1])
        F.B(wood, m * (f.w / 2 - 0.03), f.h / 2, n * (f.d / 2 - 0.03), 0.06, f.h, 0.06);
    for (let i = 0; i < 5; i++)
      F.B(wood, f.w / 2 + 0.01, 0.3 + i * 0.25, f.d / 2 - 0.4, 0.03, 0.03, 0.4);
  }
  if (!bunk && q >= 1)
    F.Rd("ac-in-blanket-red", 0, 0.55, f.d / 2 - 0.35, f.w - 0.1, 0.05, 0.3, 0.02);
  collider(K, f, y0, bunk ? f.h : 0.7);
}

/* ------------------------------------------------------ bedrooms, study -- */

function deskPiece(K, A, f, y0, q) {
  // The user sits on the +z side; the back of the desk is against the wall.
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const sewing = f.style === "sewing";
  const wood = sewing ? "ac-in-maple" : "ac-in-walnut";
  F.Rd(wood, 0, f.h - 0.02, 0, f.w, 0.04, f.d, 0.012);
  F.B(wood, f.w / 2 - 0.22, (f.h - 0.04) / 2, 0, 0.4, f.h - 0.04, f.d - 0.04);
  for (let i = 0; i < 3; i++) {
    F.B(wood, f.w / 2 - 0.22, 0.12 + i * 0.22 + 0.1, f.d / 2 - 0.01, 0.36, 0.19, 0.02);
    F.B("ac-in-brass", f.w / 2 - 0.22, 0.12 + i * 0.22 + 0.13, f.d / 2 + 0.005, 0.1, 0.012, 0.012);
  }
  legs(F, wood, f.w - 0.04, f.d - 0.06, f.h - 0.04, 0.04, 0.02, 0.016);
  if (sewing) {
    F.Rd("ac-in-vinyl-yellow", -0.15, f.h + 0.1, -0.05, 0.42, 0.16, 0.18, 0.05);
    F.Rd("ac-in-vinyl-yellow", -0.32, f.h + 0.25, -0.05, 0.1, 0.32, 0.16, 0.04);
    F.Rd("ac-in-vinyl-yellow", -0.12, f.h + 0.38, -0.05, 0.42, 0.1, 0.14, 0.04);
    F.C("ac-chrome", 0.05, f.h + 0.29, -0.05, 0.008, 0.08);
    if (q >= 1)
      for (let i = 0; i < 3; i++)
        F.C(
          ["ac-red", "ac-blue", "ac-yellow"][i] ?? "ac-red",
          -0.45 + i * 0.07,
          f.h + 0.03,
          -0.2,
          0.02,
          0.05,
        );
  } else {
    F.Rd("ac-dark", -0.1, f.h + 0.07, -0.02, 0.46, 0.12, 0.36, 0.03);
    F.B("ac-dark", -0.1, f.h + 0.16, -0.15, 0.46, 0.08, 0.06, false, -0.4);
    F.C("ac-chrome", -0.1, f.h + 0.17, -0.2, 0.03, 0.42);
    F.B("ac-in-linen", -0.1, f.h + 0.26, -0.21, 0.22, 0.2, 0.004, false, -0.25);
  }
  // Gooseneck lamp.
  F.C("ac-dark", -f.w / 2 + 0.18, f.h + 0.015, -0.15, 0.08, 0.03);
  F.L(
    "ac-chrome",
    [-f.w / 2 + 0.18, f.h + 0.03, -0.15],
    [-f.w / 2 + 0.2, f.h + 0.4, -0.18],
    0.007,
    6,
  );
  F.L(
    "ac-chrome",
    [-f.w / 2 + 0.2, f.h + 0.4, -0.18],
    [-f.w / 2 + 0.3, f.h + 0.45, -0.02],
    0.007,
    6,
  );
  F.G("ac-in-yellow-enamel", F.cone, -f.w / 2 + 0.32, f.h + 0.4, 0.0, 0.5, 0.5, 0.5);
  // Chair pulled up to the desk.
  F.Rd("ac-in-red", -0.1, 0.46, f.d / 2 + 0.3, 0.42, 0.06, 0.4, 0.025);
  F.Rd("ac-in-red", -0.1, 0.8, f.d / 2 + 0.5, 0.4, 0.2, 0.05, 0.02);
  F.C("ac-chrome", -0.1, 0.23, f.d / 2 + 0.3, 0.02, 0.44);
  F.C("ac-chrome", -0.1, 0.01, f.d / 2 + 0.3, 0.2, 0.02);
  collider(K, f, y0);
}

function chest(K, A, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  const body = f.style === "blue" ? "ac-in-blue" : "ac-in-honey";
  F.Rd(body, 0, f.h * 0.42, 0, f.w, f.h * 0.84, f.d, 0.015);
  F.Rd(body, 0, f.h * 0.9, 0, f.w + 0.02, f.h * 0.18, f.d + 0.02, 0.04);
  for (const m of [-1, 1])
    F.B("ac-in-brass", m * (f.w / 2 - 0.12), f.h / 2, f.d / 2 + 0.008, 0.05, f.h * 0.96, 0.012);
  F.B("ac-in-brass", 0, f.h * 0.78, f.d / 2 + 0.012, 0.08, 0.1, 0.012);
  collider(K, f, y0);
}

function fileCabinet(K, A, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  F.Rd("ac-in-olive-steel", 0, f.h / 2, 0, f.w, f.h, f.d, 0.012);
  const n = 4,
    dh = (f.h - 0.06) / n;
  for (let i = 0; i < n; i++) {
    const y = 0.03 + dh * (i + 0.5);
    F.B("ac-in-olive-steel", 0, y, f.d / 2 + 0.006, f.w - 0.04, dh - 0.02, 0.012);
    F.B("ac-chrome", 0, y + dh * 0.15, f.d / 2 + 0.018, 0.14, 0.022, 0.016);
    F.B("ac-white", 0, y + dh * 0.32, f.d / 2 + 0.014, 0.08, 0.035, 0.004);
  }
  collider(K, f, y0);
}

function vanity(K, A, f, y0) {
  const F = frame(K, A, f.x, f.z, f.yaw ?? 0, y0);
  F.Rd("ac-in-maple", 0, f.h - 0.02, 0, f.w, 0.04, f.d, 0.015);
  for (const m of [-1, 1])
    F.B("ac-in-maple", m * (f.w / 2 - 0.15), (f.h - 0.04) / 2, 0, 0.28, f.h - 0.04, f.d - 0.04);
  // Gathered skirt across the knee hole.
  F.G(
    "ac-in-skirt",
    drapeGeometry(A, f.w - 0.62, f.h - 0.1, 7),
    0,
    (f.h - 0.06) / 2,
    f.d / 2 - 0.04,
  );
  const mirror = A.cache("ac-in-disc", () => new THREE.CircleGeometry(0.5, 48));
  F.G("ac-in-maple", mirror, 0, f.h + 0.48, -f.d / 2 + 0.03, 0.72, 0.82, 1);
  F.G("ac-in-mirror", mirror, 0, f.h + 0.48, -f.d / 2 + 0.035, 0.64, 0.74, 1);
  F.C("ac-in-skirt", 0, 0.23, f.d / 2 + 0.3, 0.18, 0.4);
  F.S("ac-in-skirt", 0, 0.44, f.d / 2 + 0.3, 0.2, 0.05, 0.2);
  for (let i = 0; i < 3; i++)
    F.C(
      ["ac-glass", "ac-in-brass", "ac-pink"][i] ?? "ac-glass",
      -0.3 + i * 0.1,
      f.h + 0.05,
      -0.05,
      0.025,
      0.1,
    );
  collider(K, f, y0);
}

function rug(Qd, K, A, f, y0) {
  const key =
    {
      oval: "ac-in-rug-oval",
      braided: "ac-in-rug-braid",
      rect: f.floor === 1 ? "ac-in-rug-rect-blue" : "ac-in-rug-rect",
    }[f.style ?? "rect"] ?? "ac-in-rug-rect";
  if (f.style === "oval" || f.style === "braided") {
    const disc = A.cache("ac-in-rugdisc", () => new THREE.CircleGeometry(0.5, 64));
    K.geo(key, disc, f.x, y0 + 0.008, f.z, f.w, f.d, 1, -Q, f.yaw ?? 0);
    return;
  }
  K.box("ac-in-linen", f.x, y0 + 0.004, f.z, f.w, 0.008, f.d, false, 0, f.yaw ?? 0);
  Qd.flat(
    key,
    { x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 },
    y0 + 0.0085,
    1,
    false,
    true,
  );
}

/** The stone fireplace in the yellow living room: hearth, firebox and walnut mantel. */
function fireplace(K, A, f, y0, id) {
  const ch = CHIMNEYS[id];
  const face = f.yaw === Math.PI ? ch.z0 : ch.z1;
  const dir = f.yaw === Math.PI ? -1 : 1;
  const cx = f.x;
  K.box("ac-stone", cx, y0 + 0.05, f.z, f.w, 0.1, f.d, false);
  K.box("ac-stone", cx, y0 + 0.75, face + dir * 0.06, f.w, 1.3, 0.12, false);
  K.box("ac-dark", cx, y0 + 0.5, face + dir * 0.125, 0.8, 0.7, 0.02, false);
  K.box("ac-in-walnut", cx, y0 + 1.42, face + dir * 0.13, f.w + 0.2, 0.08, 0.26, false);
  for (const m of [-1, 1])
    K.line(
      "ac-in-walnut",
      [cx + m * 0.18, y0 + 0.2, face + dir * 0.28],
      [cx - m * 0.2, y0 + 0.24, face + dir * 0.3],
      0.05,
      8,
    );
  K.round("ac-in-brass", cx, y0 + 1.6, face + dir * 0.12, 0.3, 0.26, 0.1, 0.04, false);
  for (const m of [-1, 1])
    K.cylinder("ac-in-brass", cx + m * 0.7, y0 + 1.58, face + dir * 0.12, 0.02, 0.24);
  K.box(null, cx, y0 + 0.75, face + dir * 0.06, f.w, 1.3, 0.12, true);
}

/** Render one piece. Returns a light for lamps, else null. */
function piece(K, A, Qd, f, y0, id, q) {
  switch (f.kind) {
    case "mannequin":
      mannequin(K, A, f, y0, q);
      break;
    case "counter":
      kitchenRun(K, A, Qd, f, y0, id, q);
      K.box(null, f.x, y0 + 0.46, f.z, f.w, 0.92, f.d, true);
      break;
    case "range":
      range(K, A, f, y0, q);
      collider(K, f, y0, 0.92);
      break;
    case "fridge":
      fridge(K, A, f, y0);
      collider(K, f, y0);
      break;
    case "booth":
      booth(K, A, Qd, f, y0, q);
      break;
    case "pantry":
      tallCabinet(K, A, f, y0, false);
      collider(K, f, y0);
      break;
    case "hutch":
      tallCabinet(K, A, f, y0, true);
      collider(K, f, y0);
      break;
    case "dining-table":
      diningTable(K, A, f, y0, q);
      break;
    case "chair":
      chair(K, A, f, y0);
      break;
    case "sofa":
      sofa(K, A, f, y0, q, false);
      break;
    case "armchair":
      sofa(K, A, f, y0, q, true);
      break;
    case "lounge-chair":
      loungeChair(K, A, f, y0);
      break;
    case "coffee-table":
      coffeeTable(K, A, f, y0, q);
      break;
    case "tv":
      consoleTv(K, A, Qd, f, y0);
      break;
    case "sideboard":
      caseGood(K, A, f, y0, q, 1, 3, id);
      break;
    case "dresser":
      caseGood(K, A, f, y0, q, 3, 2, id);
      break;
    case "nightstand":
      caseGood(K, A, f, y0, q, 1, 1, id);
      break;
    case "bookcase":
      bookcase(K, A, Qd, f, y0);
      break;
    case "bed":
      bed(K, A, f, y0, q, false);
      break;
    case "bunk":
      bed(K, A, f, y0, q, true);
      break;
    case "desk":
      deskPiece(K, A, f, y0, q);
      break;
    case "chest":
      chest(K, A, f, y0);
      break;
    case "file-cabinet":
      fileCabinet(K, A, f, y0);
      break;
    case "vanity":
      vanity(K, A, f, y0);
      break;
    case "rug":
      rug(Qd, K, A, f, y0);
      break;
    case "fireplace":
      fireplace(K, A, f, y0, id);
      break;
    case "floor-lamp": {
      floorLamp(frame(K, A, f.x, f.z, 0, y0), 0, 0);
      K.box(null, f.x, y0 + 0.8, f.z, 0.3, 1.6, 0.3, true);
      return { x: f.x, y: y0 + 1.5, z: f.z };
    }
    default:
      break;
  }
  return null;
}

/* ------------------------------------------------------------- the house -- */

const FH = SHELL.floor1 - 0.14;
const TILE = 1.2;

/** Openings in the four shell faces per storey, as {c, w, y, h} along each face's run. */
export function shellHoles(floor) {
  if (floor === 0)
    return {
      back: [
        { c: 0.8, w: 1.6, y: 0.16, h: 2.35 },
        { c: -3, w: 2.2, y: 1.3, h: 1.25 },
      ],
      front: [
        { c: -3.1, w: 1.6, y: 0.16, h: 2.35 },
        { c: 1.6, w: 3.2, y: 1.05, h: 1.65 },
      ],
      left: [{ c: -2.2, w: 1.2, y: 0.16, h: 2.25 }],
      right: [{ c: 2, w: 2, y: 1.1, h: 1.5 }],
    };
  return {
    back: [{ c: 3.2, w: 1.5, y: FH + 0.16, h: 2.25 }],
    front: [{ c: 0, w: 3.4, y: FH + 0.85, h: 1.85 }],
    left: [{ c: -2.6, w: 1.6, y: FH + 1.1, h: 1.5 }],
    right: [{ c: -2, w: 1.6, y: FH + 1.1, h: 1.5 }],
  };
}

const FACES = {
  back: { axis: "x", at: SHELL.z0 + EPS, side: 1 },
  front: { axis: "x", at: SHELL.z1 - EPS, side: -1 },
  left: { axis: "z", at: SHELL.x0 + EPS, side: 1 },
  right: { axis: "z", at: SHELL.x1 - EPS, side: -1 },
};

/** Split a run [a, b] around a skipped interval (a chimney breast). */
function around(a, b, skip) {
  if (!skip || skip[1] <= a || skip[0] >= b) return [[a, b]];
  return [
    [a, skip[0]],
    [skip[1], b],
  ].filter(([p, q]) => q - p > 0.02);
}

/**
 * Build one house interior in house-local coordinates through the kit K.
 * `shell` carries the house module's own wall, stairs and balustrade helpers so
 * the partitions and stair match the exterior construction exactly.
 * Returns the room lights in house-local coordinates.
 */
export function buildInterior(A, K, spec, shell) {
  const id = spec.id === "yellow" ? "yellow" : "green";
  const q = A.render?.qLevel ?? 3;
  const T = THEMES[id];
  const Qd = new Quads();
  const lights = [];
  const y0 = SHELL.floor0,
    c0 = SHELL.ceiling0,
    y1 = SHELL.floor1,
    c1 = SHELL.ceiling1;

  // Structure: upper slabs, partitions, the stair and its rail.
  for (const r of UPPER_SLABS)
    K.box(
      "ac-wood",
      (r.x0 + r.x1) / 2,
      y1 - 0.1,
      (r.z0 + r.z1) / 2,
      r.x1 - r.x0,
      0.2,
      r.z1 - r.z0,
      true,
    );
  for (const p of PARTITIONS) {
    const base = floorY(p.floor),
      top = p.floor === 0 ? c0 : c1,
      centre = (p.from + p.to) / 2;
    if (p.axis === "x")
      shell.wall(
        K,
        "ac-plaster",
        centre,
        p.at,
        p.to - p.from,
        top - base,
        p.doors.map((d) => ({ x: d.at - centre, y: base, w: d.w, h: d.h })),
        0,
        base,
      );
    else
      shell.wall(
        K,
        "ac-plaster",
        p.at,
        centre,
        p.to - p.from,
        top - base,
        p.doors.map((d) => ({ x: -(d.at - centre), y: base, w: d.w, h: d.h })),
        Q,
        base,
      );
  }
  shell.stairs(K, STAIR.x, STAIR.z, STAIR.width, STAIR.count, STAIR.run, STAIR.rise, STAIR.yaw, y0);
  shell.balustrade(K, STAIR_RAIL.x, STAIR_RAIL.z0, STAIR_RAIL.x, STAIR_RAIL.z1, y1, 0.86);
  K.box(
    null,
    STAIR_RAIL.x,
    y1 + 0.5,
    (STAIR_RAIL.z0 + STAIR_RAIL.z1) / 2,
    0.1,
    1.0,
    STAIR_RAIL.z1 - STAIR_RAIL.z0,
    true,
  );

  // Ceilings: plaster under the slabs and under the roof.
  for (const r of UPPER_SLABS)
    Qd.flat(
      "ac-in-ceiling",
      {
        x0: Math.max(r.x0, SHELL.x0),
        x1: Math.min(r.x1, SHELL.x1),
        z0: Math.max(r.z0, SHELL.z0),
        z1: Math.min(r.z1, SHELL.z1),
      },
      c0 - EPS,
      TILE,
      true,
    );
  K.box(
    "ac-in-ceiling",
    0,
    c1 + 0.03,
    0,
    SHELL.x1 - SHELL.x0 + 0.1,
    0.06,
    SHELL.z1 - SHELL.z0 + 0.1,
    false,
  );

  // Floors.
  const fl = (key, x0, x1, z0, z1, y, tile = 1.2) =>
    Qd.flat(key, { x0, x1, z0, z1 }, y + 0.003, tile);
  fl(T.kitchen.floor, SHELL.x0, SHELL.x1, SHELL.z0, -1.0, y0, 1.2);
  fl(T.living.floor, SHELL.x0, SHELL.x1, -1.0, SHELL.z1, y0, 2.4);
  fl(T.study.floor, -4.12, SHELL.x1, SHELL.z0, -0.2, y1, 2.4);
  fl(T.hall.floor, SHELL.x0, -4.12, SHELL.z0, STAIR_OPENING.z0, y1, 2.4);
  fl(
    T.bedroom.floor,
    -3.88,
    SHELL.x1,
    -0.2,
    SHELL.z1,
    y1,
    T.bedroom.floor === "ac-in-oak" ? 2.4 : 1.2,
  );

  // Wall linings, room by room, with baseboards along the uncut runs.
  const ch = CHIMNEYS[id];
  const skipX = (face) =>
    (id === "green" && face === "back") || (id === "yellow" && face === "front")
      ? [ch.x0, ch.x1]
      : null;
  const skipZ = (face) => (id === "green" && face === "left" ? [ch.z0, ch.z1] : null);
  const strip = (face, spans, y, h, depth) => {
    for (const [a, b] of spans) {
      const m = (a + b) / 2,
        off = face.at + face.side * depth;
      if (face.axis === "x") K.box("ac-in-trim", m, y, off, b - a, h, depth * 2, false);
      else K.box("ac-in-trim", off, y, m, depth * 2, h, b - a, false);
    }
  };
  const line = (face, a, b, lo, hi, holes, key, wainscot) => {
    if (!wainscot) {
      strip(face, lineWall(Qd, key, face, a, b, lo, hi, holes, TILE), lo + 0.06, 0.12, 0.012);
      return;
    }
    const spans = lineWall(Qd, wainscot, face, a, b, lo, 1.05, holes, TILE);
    lineWall(Qd, key, face, a, b, 1.05, hi, holes, TILE);
    strip(face, spans, lo + 0.06, 0.12, 0.012);
    strip(face, spans, 1.06, 0.05, 0.015);
  };
  const shellRun = (name, floor, a, b, lo, hi, room) => {
    const face = FACES[name],
      holes = shellHoles(floor)[name];
    const skip = face.axis === "x" ? skipX(name) : skipZ(name);
    for (const [p, r] of around(a, b, skip))
      line(face, p, r, lo, hi, holes, room.wall, room.wainscot);
  };
  const partFace = (axis, at, side, a, b, lo, hi, doors, room) => {
    const face = { axis, at, side };
    const holes = doors.map((d) => ({ c: d.at, w: d.w, y: lo, h: d.h }));
    line(face, a, b, lo, hi, holes, room.wall, room.wainscot);
  };
  const [kitchenWall, bedroomWall, stairWall] = PARTITIONS;
  // Ground floor.
  shellRun("back", 0, SHELL.x0, SHELL.x1, y0, c0, T.kitchen);
  shellRun("left", 0, SHELL.z0, -1.12, y0, c0, T.kitchen);
  shellRun("right", 0, SHELL.z0, -1.12, y0, c0, T.kitchen);
  shellRun("front", 0, -4.12, SHELL.x1, y0, c0, T.living);
  shellRun("right", 0, -0.88, SHELL.z1, y0, c0, T.living);
  if (kitchenWall) {
    partFace(
      "x",
      kitchenWall.at - 0.12 - EPS,
      -1,
      kitchenWall.from,
      kitchenWall.to,
      y0,
      c0,
      kitchenWall.doors,
      T.kitchen,
    );
    partFace(
      "x",
      kitchenWall.at + 0.12 + EPS,
      1,
      kitchenWall.from,
      kitchenWall.to,
      y0,
      c0,
      kitchenWall.doors,
      T.living,
    );
  }
  // The stairwell runs full height: left wall beside the stair and the front corner.
  shellRun("left", 0, STAIR_OPENING.z0, SHELL.z1, y0, c1, T.hall);
  shellRun("front", 0, SHELL.x0, -4.12, y0, c1, T.hall);
  shellRun("left", 0, -1.12, STAIR_OPENING.z0, y0, c0, T.hall);
  // Upper floor.
  shellRun("back", 1, SHELL.x0, SHELL.x1, y1, c1, T.study);
  shellRun("left", 1, SHELL.z0, STAIR_OPENING.z0, y1, c1, T.study);
  shellRun("right", 1, SHELL.z0, -0.32, y1, c1, T.study);
  shellRun("front", 1, -3.88, SHELL.x1, y1, c1, T.bedroom);
  shellRun("right", 1, -0.08, SHELL.z1, y1, c1, T.bedroom);
  if (bedroomWall) {
    partFace(
      "x",
      bedroomWall.at - 0.12 - EPS,
      -1,
      bedroomWall.from,
      bedroomWall.to,
      y1,
      c1,
      bedroomWall.doors,
      T.study,
    );
    partFace(
      "x",
      bedroomWall.at + 0.12 + EPS,
      1,
      -3.88,
      bedroomWall.to,
      y1,
      c1,
      bedroomWall.doors,
      T.bedroom,
    );
  }
  if (stairWall) {
    partFace("z", stairWall.at - 0.12 - EPS, -1, stairWall.from, stairWall.to, y1, c1, [], T.hall);
    partFace("z", stairWall.at + 0.12 + EPS, 1, -0.08, stairWall.to, y1, c1, [], T.bedroom);
  }
  // Picture rail in the green living room.
  if (T.living.rail) {
    K.box("ac-in-walnut", 0.86, c0 - 0.32, SHELL.z1 - 0.015, 10.0, 0.04, 0.03, false);
    K.box("ac-in-walnut", 0.86, c0 - 0.32, -0.88 + 0.015, 10.0, 0.04, 0.03, false);
    K.box("ac-in-walnut", SHELL.x1 - 0.015, c0 - 0.32, 2.0, 0.03, 0.04, 5.76, false);
  }

  // Furniture and the mannequin family.
  for (const f of furnitureFor(id)) {
    const light = piece(K, A, Qd, f, floorY(f.floor), id, q);
    if (light) lights.push(light);
  }

  // Curtains. A panel faces +z by default; ry turns it onto its wall.
  const drape = (key, w, h, folds, x, y, z, ry) =>
    K.geo(key, drapeGeometry(A, w, h, folds), x, y, z, 1, 1, 1, 0, ry);
  const rod = (a, b) => K.line("ac-in-brass", a, b, 0.012, 8);
  // Kitchen window over the sink: valance and cafe curtains.
  {
    const z = SHELL.z0 + 0.09,
      top = 1.3 + 1.25;
    drape(T.kitchenCurtain, 2.5, 0.32, 12, -3, top - 0.08, z + 0.02, 0);
    for (const m of [-1, 1])
      drape(T.kitchenCurtain, 0.95, 0.62, 5, -3 + m * 0.62, 1.3 + 0.33, z, 0);
    rod([-4.3, top + 0.06, z], [-1.7, top + 0.06, z]);
  }
  // Living room: floor-length drapes and a cornice at the side window, and the picture window.
  {
    const x = SHELL.x1 - 0.1;
    for (const m of [-1, 1]) drape(T.curtain, 0.62, 2.45, 4, x, y0 + 1.27, 2 + m * 1.3, -Q);
    K.box("ac-white", x - 0.04, 2.72, 2, 0.14, 0.22, 3.4, false);
    const z = SHELL.z1 - 0.1;
    for (const m of [-1, 1]) drape(T.curtain, 0.55, 2.3, 4, 1.6 + m * 1.95, y0 + 1.2, z, Math.PI);
    rod([-0.6, 2.86, z + 0.02], [3.8, 2.86, z + 0.02]);
  }
  // Upstairs: bedroom picture window, study side window, and sheers on the landing.
  {
    const z = SHELL.z1 - 0.1;
    for (const m of [-1, 1]) drape(T.curtain, 0.6, 2.2, 4, m * 2.05, y1 + 1.15, z, Math.PI);
    rod([-2.5, FH + 2.82, z + 0.02], [2.5, FH + 2.82, z + 0.02]);
    const x = SHELL.x1 - 0.1;
    for (const m of [-1, 1]) drape(T.curtain, 0.5, 1.95, 3, x, FH + 1.95, -2 + m * 1.08, -Q);
    rod([x + 0.02, FH + 2.75, -3.4], [x + 0.02, FH + 2.75, -0.6]);
    const lx = SHELL.x0 + 0.1;
    drape("ac-in-linen", 1.7, 1.6, 9, lx, FH + 1.85, -2.6, Q);
    rod([lx - 0.02, FH + 2.68, -3.5], [lx - 0.02, FH + 2.68, -1.7]);
  }

  // Framed art: canvases in walnut frames.
  const framed = (key, x, y, z, w, h, ry) => {
    const nx = Math.sin(ry),
      nz = Math.cos(ry);
    K.box("ac-in-walnut", x - nx * 0.012, y, z - nz * 0.012, w + 0.1, h + 0.1, 0.03, false, 0, ry);
    K.art(key, x + nx * 0.005, y, z + nz * 0.005, w, h, ry);
  };
  if (id === "yellow") {
    framed("ac-in-paint-mesa", 3.6, 1.72, -0.88 + 0.03, 1.2, 0.8, 0);
    framed("ac-in-paint-flowers", -2.8, y1 + 1.6, SHELL.z1 - 0.03, 0.7, 0.9, Math.PI);
    framed("ac-art", 0.4, y1 + 1.65, SHELL.z0 + 0.03, 0.9, 0.65, 0);
  } else {
    framed("ac-in-paint-mesa", -1.1, 1.72, SHELL.z1 - 0.03, 1.1, 0.75, Math.PI);
    framed("ac-art", 3.85, 1.75, -0.88 + 0.03, 1.3, 0.8, 0);
    framed("ac-in-paint-flowers", SHELL.x1 - 0.03, y1 + 1.7, 2.1, 0.8, 0.6, -Q);
    framed("ac-in-paint-flowers", 0.4, y1 + 1.65, SHELL.z0 + 0.03, 0.6, 0.8, 0);
  }

  // Kitchen wall: starburst clock, calendar and a wall phone.
  {
    const z = -1.12 - 0.02,
      cy = 2.05;
    K.cylinder("ac-in-brass", -1.0, cy, z, 0.07, 0.03, Q);
    K.cylinder("ac-white", -1.0, cy, z - 0.02, 0.055, 0.012, Q);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2,
        r = i % 2 ? 0.2 : 0.28;
      K.line(
        "ac-in-brass",
        [-1.0 + Math.cos(a) * 0.08, cy + Math.sin(a) * 0.08, z],
        [-1.0 + Math.cos(a) * r, cy + Math.sin(a) * r, z],
        0.006,
        4,
      );
    }
    K.art("ac-in-calendar", -1.75, 1.55, z, 0.32, 0.46, Math.PI);
    if (id === "yellow") {
      K.round("ac-in-yellow-enamel", 3.1, 1.5, z - 0.04, 0.2, 0.26, 0.08, 0.03, false);
      K.round("ac-in-yellow-enamel", 3.1, 1.62, z - 0.1, 0.24, 0.06, 0.06, 0.03, false);
    }
  }

  // Ceiling fixtures, pendants and the room lights.
  const dome = (x, ceil, z) => {
    K.cylinder("ac-in-brass", x, ceil - 0.015, z, 0.1, 0.03);
    K.sphere("ac-in-milkglass", x, ceil - 0.03, z, 0.21, 0.1, 0.21);
    lights.push({ x, y: ceil - 0.35, z });
  };
  dome(0.9, c0, -3);
  dome(2.6, c0, 2);
  dome(1.4, c1, 2.4);
  dome(0.8, c1, -2.6);
  const cone = A.cache("ac-in-cone", () => new THREE.CylinderGeometry(0.1, 0.17, 0.2, 24, 1, true));
  if (id === "yellow") {
    for (const z of [-3.85, -3.15]) {
      K.line("ac-dark", [5.05, c0, z], [5.05, 2.0, z], 0.005, 4);
      K.geo("ac-in-yellow-enamel", cone, 5.05, 1.93, z, 1.1, 1.1, 1.1);
      K.sphere("ac-bulb", 5.05, 1.86, z, 0.04, 0.05, 0.04);
    }
    lights.push({ x: 5.05, y: 1.95, z: -3.5 });
  } else {
    K.line("ac-dark", [4.45, c0, -3.0], [4.45, 2.15, -3.0], 0.005, 4);
    K.sphere("ac-in-milkglass", 4.45, 2.05, -3.0, 0.2, 0.15, 0.2);
    lights.push({ x: 4.45, y: 2.0, z: -3.0 });
  }

  Qd.flush(K);
  return lights;
}

/** The green house's attached garage: workbench, pegboard, shelving and a work light. */
export function buildGarage(A, K, q) {
  const y0 = 0.16;
  const x = -11.55;
  // Workbench against the far wall.
  K.box("ac-in-honey", x, y0 + 0.88, 0.3, 0.7, 0.06, 2.4, false);
  K.box("ac-in-olive-steel", x, y0 + 0.45, 0.3, 0.62, 0.8, 2.3, false);
  for (let i = 0; i < 3; i++)
    K.box(
      "ac-in-olive-steel",
      x + 0.32,
      y0 + 0.65 - i * 0.22,
      0.3 - 0.75 + i * 0.75,
      0.02,
      0.18,
      0.66,
      false,
    );
  K.box(null, x, y0 + 0.46, 0.3, 0.7, 0.92, 2.4, true);
  K.art("ac-in-pegboard", -11.86, y0 + 1.55, 0.3, 2.2, 1.0, Q);
  if (q >= 1) {
    for (let i = 0; i < 7; i++)
      K.box(
        i % 2 ? "ac-in-cab-red" : "ac-metal",
        -11.84,
        y0 + 1.35 + (i % 3) * 0.28,
        -0.5 + i * 0.27,
        0.03,
        0.22,
        0.05,
        false,
      );
    K.box("ac-in-cab-red", x + 0.05, y0 + 1.0, -0.4, 0.3, 0.16, 0.5, false);
    K.cylinder("ac-metal", x + 0.1, y0 + 0.98, 1.1, 0.07, 0.14);
  }
  // Steel shelving with paint cans and boxes.
  K.box(null, -11.62, y0 + 0.95, 3.0, 0.5, 1.9, 1.8, true);
  for (const sz of [2.1, 3.9])
    for (const sx of [-11.85, -11.39])
      K.box("ac-metal", sx, y0 + 0.95, sz, 0.035, 1.9, 0.035, false);
  for (let i = 0; i < 4; i++) {
    const sy = y0 + 0.15 + i * 0.55;
    K.box("ac-metal", -11.62, sy, 3.0, 0.48, 0.025, 1.8, false);
    if (q >= 1 && i < 3)
      for (let k = 0; k < 4; k++) {
        const cz = 2.3 + k * 0.45;
        if ((i + k) % 2)
          K.cylinder(k % 3 ? "ac-in-yellow-enamel" : "ac-red", -11.6, sy + 0.1, cz, 0.08, 0.18);
        else K.box("ac-in-linen", -11.6, sy + 0.14, cz, 0.36, 0.26, 0.34, false);
      }
  }
  K.box("ac-in-olive-steel", -11.86, y0 + 1.7, -2.2, 0.08, 0.5, 0.36, false);
  K.cylinder("ac-dark", -9, 2.98, 1.0, 0.08, 0.06);
  K.sphere("ac-bulb", -9, 2.9, 1.0, 0.06, 0.07, 0.06);
  return [{ x: -9, y: 2.7, z: 1.0 }];
}
