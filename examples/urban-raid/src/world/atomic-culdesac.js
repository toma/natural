import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { newTrs, rockGeometry } from "./util.js";
import { registerProps } from "./props.js";
import { furnishRoom } from "./interiors.js";
import { windowUnit, doorUnit } from "./kit.js";
import { loadPbrSet } from "../materials/textures.js";
import { beveledBoxGeometry } from "./box-bevel.js";
import { skinClean, skinFinish, skinTint } from "./worldlabs-skins.ts";
import { emptyMesh, vcount, computeNormals, weldNormals } from "../ai/geo.js";
import {
  HOUSES,
  FLOOR_HEIGHT,
  MAP_BOUNDS,
  VEHICLES,
  POLES,
  GARDEN_FENCES,
  housePoint,
  wallSpans,
} from "./atomic-culdesac-layout.ts";

/** Geometry and artwork authored for NaturalFPS. Coordinates share the collision kit. */
function texture(paint, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  paint(g, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 16;
  map.userData.sourceCanvas = canvas;
  return map;
}

function materials(A, rng) {
  // Route the legacy (color, kind) palette onto the procedural material library
  // (materials/ -> generator/shader/glsl) so every surface is textured at the
  // engine's full PBR quality: baked albedo/height/ORM/normal with parallax,
  // detail, macro variation, and weathering. The colour becomes a linear tint
  // on the baked albedo; the kind and key pick the base surface.
  //
  // `A.skin` (world/worldlabs-skins.ts) swaps the hex for a linear tint
  // calibrated against the World Labs panorama. Only the colour moves: the
  // base surface and the surface tag stay, so impacts, footsteps and physics
  // read exactly as they do with the classic palette.
  const skin = A.skin ?? null;
  const surface = (key, color, kind, roughness = 0.8, metalness = 0) => {
    const skinned = skinTint(skin, key);
    const tint = skinned ? new THREE.Color(...skinned) : new THREE.Color(color).getHex();
    let name, surf, opts;
    switch (kind) {
      case "wood": {
        // Painted clapboard reads as vivid pastel only over a light base, so
        // the house colours tint plaster (the lap grooves are modelled
        // geometry); bare timber keeps the wood grain. Weathering stays light.
        // The skin can paint more keys (the World Labs pickets are white).
        const painted =
          ["ac-green", "ac-yellow", "ac-white", "ac-blue", "ac-cream"].includes(key) ||
          (skin?.painted.includes(key) ?? false);
        if (painted) {
          // Weathered painted clapboard: a muted base with real value
          // variation, grime and fading so the siding reads as decades-old
          // paint rather than a flat, uniform poster colour.
          surf = "wood";
          name = skinClean(skin, key) ? "paint" : "plaster";
          opts = skinClean(skin, key)
            ? {
                // Fresh paint (the World Labs siding and pickets): the even
                // paint base with a trace of dust, cavity grime and a low
                // splash band grounding each wall where it meets the soil.
                tint,
                scale: 1.7,
                normalStrength: 0.35,
              }
            : {
                tint,
                scale: 1.7,
                normalStrength: 0.7,
                weather: [0.22, 0.16, 0.2, 0.42],
                macro: [0.14, 0.22, 0.13, 0.42],
                macroBig: [1.6, 0.14, 0.06, 0],
                patch: [0.16, 2.0, 0.13, -0.09],
              };
        } else {
          name = "wood";
          surf = "wood";
          opts = { tint, scale: 1.1, normalStrength: 1.2, weather: [0.25, 0.25, 0.4, 0.4] };
        }
        break;
      }
      case "grass":
        name = "dirt";
        surf = "foliage";
        opts = { tint, scale: 2.3, detile: 0.8, weather: [0.18, 0, 0, 0.2] };
        break;
      case "roof":
        name = "asphalt";
        surf = "concrete";
        opts = { tint, scale: 1.0, detile: 0.5, normalStrength: 1.2 };
        break;
      case "stone":
        name = "brick";
        surf = "concrete";
        opts = { tint, scale: 1.0 };
        break;
      case "road":
        name = "asphalt";
        surf = "concrete";
        opts = { tint, scale: 3.0, detile: 0.8, wear: [0, 0.5, 0.45, 0] };
        break;
      case "sand":
        name = "sand";
        surf = "sand";
        opts = { tint, scale: 2.6, detile: 0.7 };
        break;
      case "metal":
        name =
          key === "ac-chrome" || metalness >= 0.8
            ? "metal_brushed"
            : key === "ac-rust"
              ? "metal_rust"
              : "metal_painted";
        surf = "metal";
        opts = { tint, scale: name === "metal_brushed" ? 0.7 : name === "metal_rust" ? 1.0 : 1.3 };
        break;
      case "fabric":
        name = "fabric";
        surf = "fabric";
        opts = { tint, scale: 0.28, three: { side: THREE.DoubleSide } };
        break;
      case "skin":
        name = "plaster";
        surf = "plaster";
        opts = { tint, scale: 0.6, roughness: [Math.min(1, roughness), 0, 0.18] };
        break;
      case "plaster":
        name = "plaster";
        surf = "plaster";
        opts = { tint, scale: 2.0 };
        break;
      default:
        name = "concrete";
        surf = "concrete";
        opts = { tint, scale: 2.4 };
    }
    // Fresh concrete and kerbs under the skin: lighter dust and grime.
    if (name === "concrete" && skinClean(skin, key)) opts.weather = [0.12, 0.08, 0.2, 0.25];
    const finish = skinFinish(skin, key);
    // Skinned vehicle paint is factory enamel under a lacquer: the painted
    // metal bake's chips, rust bloom and sun bleaching read as camouflage
    // under a saturated tint, so the skin swaps to the clean car paint (same
    // base albedo, so the calibrated tint holds) with its clearcoat lobe.
    if (finish && name === "metal_painted") name = "car_paint";
    if (finish?.roughness) opts.roughness = finish.roughness;
    if (finish?.metalness !== undefined)
      opts.three = { ...(opts.three ?? {}), metalness: finish.metalness };
    // A THREE.Color tint serialises to a clamped hex in the material cache
    // key, so name the skinned key to keep every calibrated tint distinct.
    if (skinned) opts.skin = key;
    return A.registerMaterial(key, A.materials.get(name, opts), surf);
  };
  surface("ac-green", "#5fb48d", "wood");
  surface("ac-yellow", "#cfc156", "wood");
  surface("ac-white", "#ece6d6", "wood");
  surface("ac-blue", "#4a7d86", "wood");
  surface("ac-wood", "#8e6b47", "wood");
  surface("ac-fence", "#b6a17a", "wood");
  surface("ac-roof", "#606560", "roof");
  // Pale grey stacked-stone look. The brick base bakes a dark red no tint can
  // lift, so route the stone onto the concrete base: it carries the chimneys,
  // wainscots, gateposts and steps as the reference's light grey masonry.
  surface("ac-stone", "#b9b5ab", "concrete");
  surface("ac-road", "#514b42", "road");
  surface("ac-line", "#cfc8b0", "concrete");
  surface("ac-tar", "#1c1f1d", "road");
  surface("ac-concrete", "#a7a294", "concrete");
  surface("ac-grass", "#5d8a37", "grass");
  surface("ac-hedge", "#4a6529", "grass");
  surface("ac-sand", "#bfa780", "sand");
  // Warm rocky brown for the big desert range that sits close behind the suburb.
  surface("ac-mtn", "#8a6f52", "sand");
  surface("ac-cream", "#ded3b7", "wood");
  surface("ac-pink", "#d4a39d", "plaster");
  surface("ac-sky", "#a9c4cc", "plaster");
  surface("ac-rust", "#914e3e", "metal", 0.53, 0.35);
  surface("ac-bus", "#e2b02e", "metal", 0.4, 0.35);
  surface("ac-red", "#a73e35", "metal", 0.4, 0.35);
  surface("ac-car", "#79894a", "metal", 0.16, 0.45);
  surface("ac-metal", "#777e79", "metal", 0.42, 0.65);
  surface("ac-chrome", "#b5bab5", "metal", 0.22, 0.85);
  surface("ac-dark", "#242826", "concrete");
  surface("ac-rubber", "#202420", "concrete");
  surface("ac-skin", "#cbb89f", "skin", 0.46);
  surface("ac-dress", "#576e65", "fabric");
  surface("ac-hair", "#483628", "wood", 0.78);
  surface("ac-shirt", "#d4bc82", "fabric");
  surface("ac-lips", "#8f5142", "skin", 0.55);
  surface("ac-trousers", "#665e4f", "fabric");
  surface("ac-soil", "#635944", "sand");
  surface("ac-grime", "#4b4336", "concrete", 0.92);
  surface("ac-curtain", "#397887", "fabric");
  // Flower petals: matte and soft, never the vehicle paint the red key wears.
  // Decoration only (the blooms never collide), so the tag is moot.
  surface("ac-bloom", "#b3271f", "fabric");
  surface("ac-plaster", "#d7d1bc", "plaster");
  surface("ac-enamel", "#ebe7d4", "metal", 0.28, 0.05);
  surface("ac-orange", "#b5733f", "fabric");
  surface("ac-sofa", "#809263", "fabric");
  enhancePbr(A);
  // Glossy, reflective car paint: a near-clearcoat sheen from strong env
  // reflection over a low-roughness olive base.
  const carPaint = A.mat("ac-car");
  if (carPaint) carPaint.envMapIntensity = 2.6;
  A.registerMaterial(
    "ac-glass",
    A.materials.get("glass", {
      scale: 2.0,
      roughness: [0.06, 0.04, 0.03],
      three: { opacity: 0.4, envMapIntensity: 2.6 },
    }),
    "glass",
  );
  A.registerMaterial(
    "ac-bulb",
    new THREE.MeshStandardMaterial({
      color: 0xffefd2,
      emissive: 0xffce80,
      emissiveIntensity: 1.5,
      roughness: 0.3,
    }),
    "glass",
  );
  const art = (id, paint) =>
    A.registerMaterial(
      id,
      new THREE.MeshStandardMaterial({
        map: texture(paint, 1024),
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
      "wood",
    );
  art("ac-welcome", (g, n) => {
    g.fillStyle = "#d4cbb3";
    g.fillRect(0, 0, n, n);
    g.fillStyle = "#a34c3e";
    g.fillRect(30, 30, n - 60, n - 60);
    g.strokeStyle = "#efe2bc";
    g.lineWidth = 5;
    g.strokeRect(47, 47, n - 94, n - 94);
    g.fillStyle = "#eee5cb";
    g.textAlign = "center";
    g.font = "italic 92px Georgia";
    g.fillText("Welcome to", n / 2, 232);
    g.font = "italic bold 128px Georgia";
    g.fillText("ATOMIC FLATS", n / 2, 452);
    g.font = "italic 72px Georgia";
    g.fillText("Established", n / 2 - 70, 638);
    g.fillStyle = "#273a31";
    g.fillRect(700, 556, 184, 128);
    g.fillStyle = "#d3d0ad";
    g.font = "72px monospace";
    g.fillText("1952", 792, 650);
    g.fillStyle = "#cdc5a5";
    g.fillRect(50, 765, 924, 205);
    g.fillStyle = "#443f31";
    g.font = "33px sans-serif";
    g.fillText("DESERT MODEL COMMUNITY  •  SECTOR SEVEN", 512, 886);
  });
  art("ac-moving", (g, n) => {
    g.fillStyle = "#ece8d8";
    g.fillRect(0, 0, n, n);
    g.fillStyle = "#9c3d34";
    g.fillRect(0, 680, n, 344);
    g.fillStyle = "#913c31";
    g.textAlign = "center";
    g.font = "bold 125px Georgia";
    g.fillText("MERIDIAN", 512, 285);
    g.fillStyle = "#303a34";
    g.font = "62px Georgia";
    g.fillText("MOVING & STORAGE", 512, 405);
    g.font = "38px sans-serif";
    g.fillText("COAST TO COAST HAULING", 512, 500);
    g.fillStyle = "#ddd6b7";
    g.font = "italic 52px Georgia";
    g.fillText("Every box, every mile.", 512, 838);
  });
  art("ac-bus-sign", (g, n) => {
    g.fillStyle = "#22241c";
    g.fillRect(0, 0, n, n);
    g.fillStyle = "#f2db8c";
    g.textAlign = "center";
    g.font = "bold 130px sans-serif";
    g.fillText("SCHOOL BUS", 512, 565);
  });
  art("ac-art", (g, n) => {
    g.fillStyle = "#e3bc64";
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = i % 2 ? "#ab493c" : "#dd7844";
      g.lineWidth = 35;
      g.beginPath();
      g.ellipse(n / 2 + i * 25, n / 2, 90 + i * 40, 50 + i * 50, 0, 0, 7);
      g.stroke();
    }
  });
  art("ac-wallpaper", (g, n) => {
    g.fillStyle = "#ddd2ad";
    g.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 64) {
      g.fillStyle = "#b6a57d";
      g.fillRect(x, 0, 3, n);
      for (let y = 20; y < n; y += 120) {
        g.strokeStyle = "#8d9672";
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(x + 30, y, 12, 27, -0.4, 0, 7);
        g.stroke();
      }
    }
  });
  art("ac-tiles", (g, n) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? "#474b43" : "#e8e1c7";
        g.fillRect(x * 128, y * 128, 128, 128);
        g.strokeStyle = "#a69f87";
        g.lineWidth = 3;
        g.strokeRect(x * 128, y * 128, 128, 128);
      }
  });
  A.mat("ac-tiles").map.repeat.setScalar(0.25);
  art("ac-clock", (g, n) => {
    g.fillStyle = "#d5cbb2";
    g.fillRect(0, 0, n, n);
    g.strokeStyle = "#383d38";
    g.lineWidth = 16;
    g.beginPath();
    g.arc(512, 512, 450, 0, 7);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      g.beginPath();
      g.moveTo(512 + Math.sin(a) * 380, 512 - Math.cos(a) * 380);
      g.lineTo(512 + Math.sin(a) * 425, 512 - Math.cos(a) * 425);
      g.stroke();
    }
    g.lineWidth = 25;
    g.beginPath();
    g.moveTo(512, 512);
    g.lineTo(470, 210);
    g.moveTo(512, 512);
    g.lineTo(512, 100);
    g.stroke();
    g.fillStyle = "#434c41";
    g.textAlign = "center";
    g.font = "38px sans-serif";
    g.fillText("ATOMIC FLATS", 512, 690);
  });
}

function kit(A, ox = 0, oz = 0, yaw = 0) {
  const base = newTrs(ox, 0, oz, yaw);
  const matrix = (x, y, z, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().multiplyMatrices(base, newTrs(x, y, z, ry, 1, 1, 1, rx, rz));
  const box = (key, x, y, z, w, h, d, collide = true, rx = 0, ry = 0, rz = 0) => {
    const geo = A.cache(`ac-cbox:${w}:${h}:${d}`, () => beveledBoxGeometry(w, h, d));
    const m = matrix(x, y, z, rx, ry, rz);
    if (key) A.add(key, geo, m);
    if (collide) {
      const col = A.cache(`ac-colbox:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
      A.collideGeo(key ? A.surfaceOf(key) : "concrete", col, m);
    }
  };
  const geo = (
    key,
    g,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
    collide = false,
  ) => {
    const m = matrix(x, y, z, rx, ry, rz).scale(new THREE.Vector3(sx, sy, sz));
    A.add(key, g, m);
    if (collide) A.collideGeo(A.surfaceOf(key), g, m);
    if (![...A._geoCache.values()].includes(g)) g.dispose();
  };
  const round = (key, x, y, z, w, h, d, r = 0.06, collide = true, rx = 0, ry = 0, rz = 0) => {
    const g = A.cache(`ac-round:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
    const m = matrix(x, y, z, rx, ry, rz);
    A.add(key, g, m);
    if (collide) box(null, x, y, z, w, h, d, true, rx, ry, rz);
  };
  const cylinder = (key, x, y, z, r, h, rx = 0, rz = 0) =>
    geo(
      key,
      A.cache(`ac-cyl:${r}:${h}`, () => new THREE.CylinderGeometry(r, r, h, 24)),
      x,
      y,
      z,
      1,
      1,
      1,
      rx,
      0,
      rz,
    );
  const sphere = (key, x, y, z, sx, sy, sz) =>
    geo(
      key,
      A.cache("ac-sphere", () => new THREE.SphereGeometry(1, 24, 16)),
      x,
      y,
      z,
      sx,
      sy,
      sz,
    );
  const line = (key, a, b, r = 0.03, sides = 8) => {
    const p = new THREE.Vector3(...a),
      q = new THREE.Vector3(...b),
      v = q.clone().sub(p);
    const g = A.cache(`ac-rod:${sides}`, () => new THREE.CylinderGeometry(1, 1, 1, sides));
    const m = new THREE.Matrix4().compose(
      p.add(q).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()),
      new THREE.Vector3(r, v.length(), r),
    );
    A.add(key, g, base.clone().multiply(m));
  };
  const art = (key, x, y, z, w, h, ry = 0) =>
    geo(
      key,
      A.cache(`ac-plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
      x,
      y,
      z,
      1,
      1,
      1,
      0,
      ry,
    );
  return { box, round, geo, cylinder, sphere, line, art, matrix };
}

function wall(K, key, x, z, width, height, holes = [], ry = 0, y0 = 0.16) {
  const cuts = [
    -width / 2,
    width / 2,
    ...holes.flatMap((h) => [h.x - h.w / 2, h.x + h.w / 2]),
  ].sort((a, b) => a - b);
  const pos = (u, y) => [x + Math.cos(ry) * u, y, z - Math.sin(ry) * u];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i],
      b = cuts[i + 1],
      m = (a + b) / 2;
    const openings = holes.filter((h) => m > h.x - h.w / 2 && m < h.x + h.w / 2);
    const ranges = wallSpans(y0, y0 + height, openings);
    for (const [lo, hi] of ranges)
      if (hi - lo > 0.015) K.box(key, ...pos(m, (lo + hi) / 2), b - a, hi - lo, 0.24, true, 0, ry);
  }
  for (const h of holes) {
    for (const u of [h.x - h.w / 2 - 0.06, h.x + h.w / 2 + 0.06])
      K.box("ac-white", ...pos(u, h.y + h.h / 2), 0.1, h.h + 0.2, 0.33, false, 0, ry);
    for (const y of [h.y, h.y + h.h])
      K.box("ac-white", ...pos(h.x, y), h.w + 0.24, 0.11, 0.36, false, 0, ry);
  }
}

function fence(K, x0, z0, x1, z1, height = 1.35, key = "ac-white", picket = true) {
  const length = Math.hypot(x1 - x0, z1 - z0),
    yaw = -Math.atan2(z1 - z0, x1 - x0);
  K.box(null, (x0 + x1) / 2, height / 2 + 0.15, (z0 + z1) / 2, length, height, 0.08, true, 0, yaw);
  // Collision panel is continuous; individual boards give the visible fence depth.
  // Picket runs use thin, real-scale slats (~8.5 cm wide, ~2.4 cm thick) at a
  // tight pitch with crisp pointed tops; boarded perimeter runs keep wide,
  // near-solid boards for a privacy fence. The earlier 18 cm boards with fat
  // rounded caps read as oversized toy pickets.
  const pitch = picket ? 0.14 : 0.24,
    bw = picket ? 0.085 : 0.18,
    bd = picket ? 0.024 : 0.12,
    steps = Math.max(1, Math.floor(length / pitch));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      x = x0 + (x1 - x0) * t,
      z = z0 + (z1 - z0) * t;
    // Deterministic aging on picket runs: an occasional missing slat, a few
    // broken-off tops, and a slight lean, so the fence reads weathered.
    const rnd = (n) => {
      const s = Math.sin((x * 73.13 + z * 19.74 + n * 12.31) * 43758.5453);
      return s - Math.floor(s);
    };
    const lean = picket ? (rnd(5) - 0.5) * 0.12 : 0;
    if (picket && rnd(1) < 0.05) continue; // missing slat
    const broken = picket && rnd(9) < 0.09;
    const ph = broken ? height * (0.5 + 0.32 * rnd(3)) : height;
    K.box(key, x, ph / 2 + 0.15, z, bw, ph, bd, false, 0, yaw, lean);
    // Pointed cap: a thin square turned 45 degrees stays below the bevel
    // threshold, so the point reads sharp instead of as a rounded knob. Broken
    // slats keep a jagged flat top (no cap).
    if (picket && !broken)
      K.box(key, x, height + 0.15, z, bw, bw, bd, false, 0, yaw, Math.PI / 4 + lean);
  }
  for (let i = 0; i <= length / 2.4; i++) {
    const t = i / Math.max(1, Math.floor(length / 2.4));
    K.box(
      key,
      x0 + (x1 - x0) * t,
      height / 2 + 0.12,
      z0 + (z1 - z0) * t,
      0.11,
      height + 0.2,
      0.11,
      false,
    );
    K.box(key, x0 + (x1 - x0) * t, height + 0.24, z0 + (z1 - z0) * t, 0.15, 0.05, 0.15, false);
  }
  // Horizontal rails tie the boards together, the way a real fence is framed.
  for (const f of [0.26, 0.76]) {
    K.box(key, (x0 + x1) / 2, 0.15 + f * height, (z0 + z1) / 2, length, 0.05, 0.08, false, 0, yaw);
  }
}

/**
 * A lumpy foliage clump: several overlapping, jittered, unevenly sized lobes
 * instead of one smooth ball, so a bush reads as a mass of leaves rather than a
 * toy topiary sphere. Deterministic in (x,z) so captures stay identical. `top`
 * biases the lobes upward for an upright bush; leave it low for a mounded hedge.
 */
function shrub(K, x, y, z, r, key = "ac-hedge", top = 0.4) {
  const h = (n) => {
    const s = Math.sin((x * 12.9898 + z * 78.233 + n * 37.719) * 43758.5453);
    return s - Math.floor(s);
  };
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + h(i) * 1.3;
    const dr = i === 0 ? 0 : r * (0.34 + 0.46 * h(i + 23));
    const rad = r * (0.44 + 0.32 * h(i + 11));
    K.sphere(
      key,
      x + Math.cos(a) * dr,
      y + (h(i + 31) - 0.35) * r * top * 2,
      z + Math.sin(a) * dr,
      rad,
      rad * (0.82 + 0.3 * h(i + 7)),
      rad,
    );
  }
}

/**
 * A post-and-rail balustrade along a run in house-local space: a top and bottom
 * rail with thin, real-scale balusters (3.5 cm, below the bevel threshold so
 * they read crisp, not as fat rounded spindles).
 */
function balustrade(K, x0, z0, x1, z1, y = 0.16, height = 0.82, key = "ac-white") {
  const len = Math.hypot(x1 - x0, z1 - z0),
    yaw = -Math.atan2(z1 - z0, x1 - x0),
    cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  K.box(key, cx, y + height, cz, len, 0.07, 0.1, false, 0, yaw);
  K.box(key, cx, y + 0.14, cz, len, 0.05, 0.07, false, 0, yaw);
  const n = Math.max(2, Math.round(len / 0.14));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    K.box(
      key,
      x0 + (x1 - x0) * t,
      y + height * 0.5,
      z0 + (z1 - z0) * t,
      0.035,
      height * 0.72,
      0.035,
      false,
    );
  }
}

/**
 * A fan of thin vertical weather streaks dripping below a sill, ledge, or
 * fixture, a few millimetres proud of the wall. Original procedural grime (dirt
 * and water stains, rust where keyed to a metal tone), no copied art. (cx, topY)
 * is the ledge centre on the wall face at depth z.
 */
function drips(K, cx, topY, z, half, key = "ac-grime", n = 9) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
    const len = 0.26 + Math.abs(Math.sin(i * 2.17 + cx * 1.3)) * 0.82;
    K.box(key, cx + t * half, topY - len / 2, z, 0.028 + (i % 3) * 0.013, len, 0.014, false);
  }
}

/**
 * A gabled roof dormer facing +z in house-local space, seated on a front roof
 * slope: cheek walls, a sashed window, a gable, and a little pitched roof. Pure
 * decorative massing that breaks an otherwise plain slope and varies the
 * roofline. Crisp, real-scale members, no blobby forms.
 */
/**
 * A flat-topped mesa/butte: a low, irregular tapered prism with a flat cap and
 * eroded flanks, the landform that reads as a dry desert test-site basin rather
 * than rounded hills. Returns a ~unit geometry (y in [-0.5, 0.5], flat top at
 * +0.5) to be scaled and placed like the rock backdrop.
 */
function mesaGeometry(rng, sides = 7) {
  const g = new THREE.CylinderGeometry(0.66, 1.0, 1.0, sides, 4, false);
  const p = g.attributes.position;
  const perSide = [];
  for (let i = 0; i < sides + 1; i++) perSide.push(rng.range(0.8, 1.14));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      r = Math.hypot(x, z);
    if (r < 1e-4) continue; // keep cap/base centres on axis
    const ang = Math.atan2(z, x);
    const seg = Math.round(((ang + Math.PI) / (Math.PI * 2)) * sides);
    const lower = Math.max(0, 0.5 - y); // 0 at top, 1 at base: erode the flanks
    const j = perSide[seg] * (1 + (rng.range(-0.08, 0.08) + 0.12 * lower) * (y < 0.49 ? 1 : 0));
    p.setX(i, x * j);
    p.setZ(i, z * j);
    if (y < 0.49 && y > -0.49) p.setY(i, y + rng.range(-0.05, 0.05)); // ragged ledges
  }
  g.computeVertexNormals();
  return g;
}

function stairs(
  K,
  x,
  z,
  width,
  count = 16,
  run = 0.29,
  rise = FLOOR_HEIGHT / 16,
  ry = 0,
  base = 0.16,
) {
  for (let i = 0; i < count; i++) {
    const d = (i + 0.5) * run,
      cy = base + ((i + 1) * rise) / 2;
    K.box(
      "ac-wood",
      x + Math.sin(ry) * d,
      cy,
      z + Math.cos(ry) * d,
      width,
      (i + 1) * rise,
      run,
      true,
      0,
      ry,
    );
    K.box(
      "ac-white",
      x + Math.sin(ry) * d,
      base + (i + 1) * rise,
      z + Math.cos(ry) * d,
      width + 0.04,
      0.035,
      run + 0.035,
      false,
      0,
      ry,
    );
  }
  for (const s of [-1, 1]) {
    const dx = (Math.cos(ry) * width * s) / 2,
      dz = (-Math.sin(ry) * width * s) / 2;
    K.line(
      "ac-white",
      [x + dx, base + 0.9, z + dz],
      [
        x + dx + Math.sin(ry) * count * run,
        base + count * rise + 0.9,
        z + dz + Math.cos(ry) * count * run,
      ],
      0.045,
    );
    for (let i = 0; i <= count; i += 2) {
      const d = i * run;
      K.box(
        "ac-white",
        x + dx + Math.sin(ry) * d,
        base + i * rise + 0.45,
        z + dz + Math.cos(ry) * d,
        0.06,
        0.9,
        0.06,
        false,
      );
    }
  }
}

function furnish(K, house) {
  K.box("ac-tiles", 2.4, 0.18, -2.7, 6.3, 0.03, 4.15, false);
  wall(K, "ac-wallpaper", 0, -4.78, 11.5, 2.8, [
    { x: 0.8, y: 0.16, w: 1.6, h: 2.35 },
    { x: -3, y: 1.3, w: 2.2, h: 1.25 },
  ]);
  // Kitchen cabinets, sink, oven and chrome stools.
  for (let x = 2.15; x < 5.2; x += 0.85) {
    K.round("ac-rust", x, 0.61, -4.3, 0.8, 0.85, 0.65, 0.025, true);
    K.round("ac-rust", x, 0.69, -3.95, 0.7, 0.6, 0.055, 0.018, false);
    K.box("ac-dark", x, 0.23, -4, 0.77, 0.09, 0.08, false);
    K.box("ac-cream", x, 1.08, -4.3, 0.87, 0.08, 0.78, false);
    K.round("ac-rust", x, 2.25, -4.45, 0.8, 0.8, 0.4, 0.018, false);
    K.box("ac-chrome", x + 0.24, 0.85, -3.94, 0.16, 0.026, 0.04, false);
    K.box("ac-chrome", x + 0.24, 2.11, -4.21, 0.025, 0.18, 0.04, false);
  }
  K.box("ac-dark", 3, 1.125, -4.3, 0.55, 0.025, 0.44, false);
  K.line("ac-chrome", [3, 1.1, -4.55], [3, 1.42, -4.55], 0.025);
  K.line("ac-chrome", [3, 1.42, -4.55], [3, 1.42, -4.3], 0.025);
  K.round("ac-enamel", 5.2, 1.22, -3.1, 0.88, 2.08, 0.9, 0.12, true);
  K.round("ac-enamel", 5.2, 1.04, -2.62, 0.8, 1.52, 0.12, 0.055, false);
  K.round("ac-enamel", 5.2, 2.04, -2.62, 0.8, 0.4, 0.12, 0.05, false);
  K.box("ac-chrome", 4.92, 1.45, -2.53, 0.055, 0.39, 0.065, false);
  K.box("ac-chrome", 4.92, 2.02, -2.53, 0.055, 0.15, 0.065, false);
  K.round("ac-enamel", 2.15, 0.63, -4.25, 0.78, 0.87, 0.8, 0.04, true);
  K.round("ac-dark", 2.15, 0.64, -3.81, 0.56, 0.44, 0.025, 0.025, false);
  K.line("ac-chrome", [1.86, 0.92, -3.76], [2.43, 0.92, -3.76], 0.024);
  for (const x of [1.91, 2.08, 2.25, 2.42]) K.sphere("ac-dark", x, 1.06, -3.8, 0.038, 0.038, 0.025);
  for (let x = 1.94; x < 2.54; x += 0.35)
    for (let z = -4.45; z < -3.9; z += 0.35) K.cylinder("ac-dark", x, 1.085, z, 0.115, 0.014);
  K.round("ac-orange", 2.3, 0.98, -1.8, 1.8, 0.1, 0.95, 0.045, true);
  for (const x of [1.65, 2.95])
    for (const z of [-2.1, -1.5]) K.cylinder("ac-chrome", x, 0.58, z, 0.035, 0.8);
  for (const x of [1.6, 2.9]) {
    K.box("ac-yellow", x, 0.63, -0.75, 0.53, 0.13, 0.53, true);
    K.box("ac-yellow", x, 1, -0.53, 0.53, 0.65, 0.09, false);
    for (const dx of [-0.2, 0.2])
      for (const dz of [-0.2, 0.2]) K.cylinder("ac-chrome", x + dx, 0.39, -0.75 + dz, 0.027, 0.4);
  }
  // Living room couch, rug, coffee table and period television.
  K.box("ac-orange", 1.4, 0.2, 2.45, 4.4, 0.035, 3, false);
  K.round("ac-sofa", 3.8, 0.55, 2.1, 1.15, 0.7, 2.8, 0.13, true);
  K.round("ac-sofa", 4.3, 1.02, 2.1, 0.25, 0.85, 2.9, 0.1, false);
  for (const z of [0.65, 3.55]) K.round("ac-sofa", 3.8, 0.87, z, 1.15, 0.55, 0.2, 0.07, false);
  for (let z = 1; z < 3.5; z += 0.85) K.box("ac-cream", 3.7, 0.88, z, 0.9, 0.16, 0.77, false);
  K.box("ac-wood", 1.6, 0.65, 2.1, 1.45, 0.1, 1.75, true);
  for (const x of [1.05, 2.15])
    for (const z of [1.4, 2.8]) K.cylinder("ac-wood", x, 0.39, z, 0.045, 0.5);
  K.box("ac-wood", -0.4, 0.88, 4.3, 1.3, 1.05, 0.55, true);
  K.box("ac-dark", -0.5, 0.99, 3.99, 0.91, 0.65, 0.045, false);
  K.sphere("ac-glass", -0.5, 0.99, 3.96, 0.42, 0.28, 0.06);
  for (const x of [-0.7, -0.3]) K.line("ac-chrome", [-0.5, 1.4, 4.2], [x, 1.95, 4.2], 0.01);
  K.art("ac-art", 0, 1.92, -0.57, 1.5, 1.25);
  K.box("ac-plaster", 1.1, FLOOR_HEIGHT - 0.075, 0, 9.6, 0.015, 9.75, false);
  // Upper room, bed, writing desk, curtains, lamp.
  const y = FLOOR_HEIGHT;
  K.box("ac-wood", 2.6, y + 0.4, -2.1, 2.6, 0.4, 3.6, true);
  K.box("ac-cream", 2.6, y + 0.72, -2.1, 2.5, 0.3, 3.5, true);
  K.box("ac-blue", 2.6, y + 0.91, -1.45, 2.52, 0.12, 2.1, false);
  for (const x of [1.95, 3.22]) K.sphere("ac-white", x, y + 0.95, -3.2, 0.55, 0.14, 0.34);
  K.box("ac-wood", -0.4, y + 0.96, 3.85, 2.6, 0.13, 0.85, true);
  for (const x of [-1.5, 0.7])
    for (const z of [3.55, 4.1]) K.box("ac-wood", x, y + 0.55, z, 0.08, 0.8, 0.08, false);
  for (const x of [-1.9, 1.9]) K.box("ac-blue", x, y + 1.65, 4.66, 0.5, 2.6, 0.13, false);
  for (const z of [2, -2.5]) {
    K.cylinder("ac-dark", 1, 2.88, z, 0.012, 0.45);
    K.geo("ac-yellow", A_lamp(), 1, 2.64, z);
    K.sphere("ac-bulb", 1, 2.57, z, 0.1, 0.07, 0.1);
  }
}
const A_lamp = () => new THREE.ConeGeometry(0.29, 0.16, 16, 1, true);

/**
 * Glaze the street facade with kit window and door units: recessed frames,
 * mullions, real glass, stone sills, shutters, and an ajar front door. The
 * openings are already cut by wall(); back:false lets the furnished room show
 * through instead of a painted interior card.
 */
function kitFront(A, rng, spec) {
  const base = newTrs(spec.x, 0, spec.z, spec.yaw);
  const pm = new THREE.Matrix4().multiplyMatrices(base, newTrs(0, 0, 5.12, Math.PI));
  const y = FLOOR_HEIGHT;
  const shutterKey = spec.id === "green" ? "metal_cream" : "metal_green";
  windowUnit(A, pm, { x: -1.6, y: 1.05 + 1.65 / 2, w: 3.0, h: 1.52 }, rng, {
    t: 0.34,
    state: "glazed",
    back: false,
    frameKey: "wood_dark",
    curtain: true,
  });
  windowUnit(A, pm, { x: 0, y: y + 0.85 + 1.85 / 2, w: 3.2, h: 1.7 }, rng, {
    t: 0.34,
    state: "glazed",
    back: false,
    frameKey: "wood_dark",
    shutters: true,
    shutterKey,
    curtain: true,
  });
  doorUnit(A, pm, { x: 3.1, y: 0.16 + 2.35 / 2, w: 1.5, h: 2.3 }, rng, {
    t: 0.24,
    open: 1.1,
    leafKey: "wood_dark",
  });
}

function house(A, spec, rng) {
  const K = kit(A, spec.x, spec.z, spec.yaw),
    key = `ac-${spec.id}`,
    y = FLOOR_HEIGHT;
  const win = (x, base = 1.15, w = 2, h = 1.5) => ({ x, y: base, w, h });
  // The green house is the classic two-tone: mint-green lap siding on the ground
  // storey, white clapboard above a white belt course at the floor line. The
  // yellow house is a single body colour, so both keys collapse to its own.
  const lowerKey = key;
  const upperKey = spec.id === "green" ? "ac-white" : key;
  const BELT = FLOOR_HEIGHT;
  const TOP = 0.16 + 6.24;
  const splitWall = (sx, sz, w, holes, ry = 0) => {
    if (upperKey === lowerKey) {
      wall(K, lowerKey, sx, sz, w, 6.24, holes, ry, 0.16);
      return;
    }
    const lo = holes.filter((h) => h.y < BELT - 0.02);
    const up = holes.filter((h) => h.y >= BELT - 0.02);
    wall(K, lowerKey, sx, sz, w, BELT - 0.16, lo, ry, 0.16);
    wall(K, upperKey, sx, sz, w, TOP - BELT, up, ry, BELT);
  };
  K.box("ac-concrete", 0, 0, 0, 12.4, 0.32, 10.4, true);
  splitWall(0, 5, 12, [
    { x: -3.1, y: 0.16, w: 1.6, h: 2.35 },
    win(1.6, 1.05, 3.2, 1.65),
    win(0, y + 0.85, 3.4, 1.85),
  ]);
  splitWall(
    0,
    -5,
    12,
    [
      { x: -0.8, y: 0.16, w: 1.6, h: 2.35 },
      { x: -3.2, y: y + 0.16, w: 1.5, h: 2.25 },
      win(3, 1.3, 2.2, 1.25),
    ],
    Math.PI,
  );
  splitWall(
    -6,
    0,
    10,
    [{ x: -0.2, y: 0.16, w: 1.7, h: 2.3 }, win(2.6, y + 1.1, 1.6, 1.5)],
    Math.PI / 2,
  );
  splitWall(6, 0, 10, [win(-2, 1.1, 2, 1.5), win(2, y + 1.1, 2, 1.5)], Math.PI / 2);
  // Lap siding is modeled, with holes preserved at doors and windows.
  for (let i = 0; i < 27; i++) {
    const sy = 0.33 + i * 0.225;
    const holes = [
      { x: -3.1, y: 0.16, w: 1.7, h: 2.45 },
      win(1.6, 1.02, 3.4, 1.73),
      win(0, y + 0.8, 3.55, 1.95),
    ].filter((h) => sy >= h.y && sy <= h.y + h.h);
    const cuts = [-6, 6, ...holes.flatMap((h) => [h.x - h.w / 2, h.x + h.w / 2])].sort(
      (a, b) => a - b,
    );
    for (let j = 0; j < cuts.length - 1; j++) {
      const a = cuts[j],
        b = cuts[j + 1],
        m = (a + b) / 2;
      if (!holes.some((h) => Math.abs(m - h.x) < h.w / 2))
        K.box(sy < BELT ? lowerKey : upperKey, m, sy, 5.145, b - a, 0.032, 0.045, false);
    }
  }
  for (const x of [-6.1, 6.1])
    for (const z of [-5.1, 5.1]) K.box("ac-white", x, 3.25, z, 0.15, 6.3, 0.15, false);
  // White belt course along the floor line wraps all four walls so the two-tone
  // reads from every angle, not only the front.
  if (upperKey !== lowerKey) {
    for (const [bx, bz, bw, ry] of [
      [0, 5.2, 12.5, 0],
      [0, -5.2, 12.5, 0],
      [-6.2, 0, 10.5, Math.PI / 2],
      [6.2, 0, 10.5, Math.PI / 2],
    ])
      K.box("ac-white", bx, BELT, bz, bw, 0.26, 0.22, false, 0, ry);
  }
  K.box("ac-white", 0, y, 5.18, 12.5, 0.28, 0.24, false);
  K.box("ac-white", 0, 6.33, 5.15, 12.6, 0.24, 0.3, false);
  for (const x of [-2.25, 2.25]) {
    K.box(spec.id === "green" ? "ac-green" : "ac-orange", x, y + 1.8, 5.22, 0.68, 2.1, 0.09, false);
    for (let i = 0; i < 14; i++)
      K.box("ac-wood", x, y + 0.86 + i * 0.14, 5.28, 0.59, 0.028, 0.035, false);
  }
  // Sills under the two front windows, and shutters flanking the ground window.
  K.box("ac-white", 1.6, 0.22, 5.24, 3.5, 0.08, 0.2, false);
  K.box("ac-white", 0, y + 0.02, 5.24, 3.7, 0.08, 0.2, false);
  // Light test-site wear: a faint stain below the picture-window sill and a
  // little rust weeping from the metal wall vent. Kept subtle so the bright
  // pastel paint of the reference stays clean rather than reading as dingy.
  drips(K, 0, y + 0.78, 5.27, 1.2, "ac-grime", 5);
  drips(K, 5.4, 1.32, 5.28, 0.12, "ac-rust", 3);
  // Window flower box under the front picture window and a foundation planting
  // bed along the frontage: colour, life, and a softened wall-to-ground line.
  K.box("ac-wood", 1.6, 0.98, 5.34, 2.4, 0.2, 0.26, false);
  for (let i = 0; i < 10; i++) {
    const bx = 0.6 + i * 0.22;
    K.sphere("ac-hedge", bx, 1.12, 5.35, 0.1, 0.13, 0.1);
    K.sphere(
      ["ac-red", "ac-orange", "ac-white", "ac-blue"][i % 4],
      bx,
      1.2,
      5.36,
      0.07,
      0.07,
      0.07,
    );
  }
  for (const [x0b, x1b] of [
    [-6, -4.2],
    [-2, 5.8],
  ]) {
    K.box("ac-soil", (x0b + x1b) / 2, 0.24, 5.55, x1b - x0b, 0.12, 0.5, false);
    const n = Math.round((x1b - x0b) / 0.7);
    for (let i = 0; i < n; i++) {
      const bx = x0b + 0.35 + i * 0.7;
      shrub(K, bx, 0.42, 5.55, 0.42);
      if (A.skin) {
        // The World Labs yards edge their lawns in red flower beds: a cluster of
        // red blooms on every shrub. Decoration only, spheres never collide.
        for (const [dx, dy, dz] of [
          [-0.2, 0.88, -0.08],
          [0.18, 0.9, 0.1],
          [0.0, 0.98, 0.0],
          [-0.04, 0.86, 0.26],
        ])
          K.sphere("ac-bloom", bx + dx, dy, 5.55 + dz, 0.075, 0.065, 0.075);
      } else if (i % 2)
        K.sphere(["ac-red", "ac-orange", "ac-white"][i % 3], bx, 0.58, 5.55, 0.08, 0.08, 0.08);
    }
  }
  for (const sx of [-0.2, 3.4]) {
    K.box(spec.id === "green" ? "ac-white" : "ac-orange", sx, 1.05, 5.22, 0.5, 1.6, 0.08, false);
    for (let i = 0; i < 11; i++)
      K.box("ac-wood", sx, 0.4 + i * 0.14, 5.28, 0.42, 0.028, 0.035, false);
  }
  // Front porch over the door: a deeper covered stoop on posts, with a shed
  // roof, fascia, a timber balustrade down each side, and stone steps.
  for (const px of [-3.95, -2.25]) {
    K.round("ac-white", px, 1.42, 6.45, 0.16, 2.54, 0.16, 0.04, true);
    K.round("ac-white", px, 2.73, 6.45, 0.22, 0.12, 0.22, 0.03, false);
  }
  K.box("ac-roof", -3.1, 2.9, 6.1, 2.5, 0.12, 2.75, false, 0, 0, 0.08);
  K.box("ac-white", -3.1, 2.78, 7.42, 2.5, 0.2, 0.1, false);
  K.box("ac-white", -3.1, 2.64, 6.1, 2.4, 0.12, 0.1, false, 0, 0, 0.08);
  // Balustrade down each open side, from the wall to the front post.
  for (const s of [-1, 1]) balustrade(K, -3.1 + s * 0.85, 5.35, -3.1 + s * 0.85, 6.45);
  for (let i = 0; i < 3; i++) {
    K.box("ac-stone", -3.1, 0.13 - i * 0.04, 5.55 + i * 0.3, 2.4 - i * 0.2, 0.14, 0.32, true);
    K.box("ac-white", -3.1, 0.22 - i * 0.04, 5.72 + i * 0.3, 2.5 - i * 0.2, 0.025, 0.05, false); // nosing
  }
  // Cheek walls flanking the stoop read as a stoop railing base.
  for (const s of [-1, 1]) K.box("ac-stone", -3.1 + s * 1.2, 0.34, 5.95, 0.18, 0.52, 1.1, true);
  // Foundation skirting: a proud masonry base course grounding the street-facing walls.
  K.box("ac-stone", 2.0, 0.34, 5.23, 8.2, 0.36, 0.1, false);
  K.box("ac-stone", -5.05, 0.34, 5.23, 1.9, 0.36, 0.1, false);
  K.box("ac-stone", 6.23, 0.34, 0, 0.1, 0.36, 10.4, false);
  // Floor leaves a real stair opening along the left wall.
  K.box("ac-wood", 1.1, y + 0.04, 0, 9.6, 0.2, 9.75, true);
  K.box("ac-wood", -4.75, y + 0.04, 3.1, 2.1, 0.2, 3.6, true);
  K.box("ac-wood", -4.75, y + 0.04, -4.2, 2.1, 0.2, 1.35, true);
  stairs(K, -4.72, -3.3, 1.65);
  wall(K, "ac-cream", 1.1, -0.7, 9.4, 2.83, [{ x: -1.9, y: 0.16, w: 1.6, h: 2.4 }], 0);
  wall(K, "ac-cream", 0, -0.2, 11.6, 2.83, [{ x: -2.8, y: y + 0.16, w: 1.8, h: 2.4 }], 0, y + 0.16);
  // Roofs and chimney distinguish the two houses at a glance: the green house
  // has a gable with its ridge along the street, the yellow a perpendicular
  // gable. Both carry eave overhangs, fascia boards, and a ridge cap.
  if (spec.id === "green") {
    const rise = 1.7,
      half = 6.9,
      angle = Math.atan2(rise, half),
      len = Math.hypot(half, rise) + 0.4;
    for (const s of [-1, 1])
      K.box("ac-roof", s * 3.45, 7.15, 0, len, 0.17, 11.9, false, 0, 0, -s * angle);
    K.box("ac-roof", 0, 7.95, 0, 0.34, 0.22, 11.9, false);
    for (const z of [-5, 5]) {
      const shape = new THREE.Shape();
      shape.moveTo(-6, 0);
      shape.lineTo(6, 0);
      shape.lineTo(0, 1.55);
      shape.closePath();
      K.geo(upperKey, new THREE.ShapeGeometry(shape), 0, 6.4, z, 1, 1, 1, 0, z < 0 ? Math.PI : 0);
    }
    for (const s of [-1, 1]) {
      K.box("ac-white", s * 6.75, 6.28, 0, 0.12, 0.34, 11.9, false); // eave fascia
      K.box("ac-white", s * 6.3, 6.14, 0, 0.9, 0.05, 11.9, false); // eave soffit
      K.cylinder("ac-white", s * 6.86, 6.2, 0, 0.08, 11.9, Math.PI / 2); // gutter
      for (const z of [-5.6, 5.6]) K.box("ac-white", s * 6.86, 3.2, z, 0.07, 6.2, 0.07, false); // downspout
      for (const z of [-5.95, 5.95])
        K.box("ac-white", s * 3.45, 7.2, z, len, 0.14, 0.14, false, 0, 0, -s * angle); // rake
    }
    // Second-storey bay oriel under the front gable: projects the upper window
    // forward on corbels, so the gable-end facade is no longer one flat plane.
    {
      const oy0 = y + 0.5,
        oy1 = y + 2.3,
        proj = 0.6,
        hw = 1.9,
        zf = 5.2;
      for (const s of [-1, 0, 1])
        K.box("ac-white", s * hw * 0.82, oy0 - 0.16, zf + 0.2, 0.16, 0.42, 0.44, false); // corbels
      for (const s of [-1, 1])
        K.box(upperKey, s * hw, (oy0 + oy1) / 2, zf + proj / 2, 0.12, oy1 - oy0, proj, false); // cheeks
      K.box(upperKey, 0, oy0, zf + proj / 2, hw * 2, 0.12, proj, false); // floor slab
      K.box(
        "ac-glass",
        0,
        (oy0 + oy1) / 2 + 0.05,
        zf + proj,
        hw * 2 - 0.2,
        oy1 - oy0 - 0.3,
        0.05,
        false,
      );
      for (const s of [-1, 0, 1])
        K.box(
          "ac-white",
          s * (hw - 0.12),
          (oy0 + oy1) / 2,
          zf + proj - 0.008,
          0.07,
          oy1 - oy0 - 0.25,
          0.07,
          false,
        ); // mullions
      for (const yy of [oy0 + 0.14, oy1 - 0.06])
        K.box("ac-white", 0, yy, zf + proj, hw * 2 + 0.06, 0.08, 0.1, false); // sill and head
      K.box(
        "ac-roof",
        0,
        oy1 + 0.18,
        zf + proj / 2 + 0.03,
        hw * 2 + 0.3,
        0.1,
        proj + 0.28,
        false,
        0.4,
        0,
        0,
      );
    }
  } else {
    // MODERNIST SPLIT-LEVEL. The yellow house is the mid-century opposite of the
    // green house's clapboard gable: a thin low-slope shed roof that falls toward
    // the carport side, a clerestory ribbon in the step under its high eave, and
    // a massive stacked-stone chimney at the street front. No gable, no dormers.
    const tilt = 0.145,
      s = Math.sin(tilt);
    // Underside of the sloped slab at world x (the slab centre is x=-0.4, y=7.7).
    const roofBottom = (x) => 7.62 + (x + 0.4) * s;
    K.box("ac-roof", -0.4, 7.7, 0, 15.8, 0.16, 11.2, false, 0, 0, tilt);
    for (const z of [5.65, -5.65])
      K.box("ac-white", -0.4, 7.62, z, 15.8, 0.22, 0.1, false, 0, 0, tilt); // front/back fascia
    K.box("ac-white", 7.5, 7.98, 0, 0.1, 0.24, 11.2, false); // high side fascia
    // Side-wall infill between the old wall head (6.4) and the rising roof.
    for (const sgn of [-1, 1]) {
      const top = roofBottom(sgn * 6);
      if (top > 6.5) K.box(key, sgn * 6, (6.4 + top) / 2, 0, 10, top - 6.4, 0.24, false);
    }
    // Front (glazed clerestory) and back (solid) ramped walls under the slope.
    for (const [z, glaze] of [
      [5, true],
      [-5, false],
    ]) {
      for (let x = -5.6; x <= 5.6; x += 1.0) {
        const top = roofBottom(x),
          h = top - 6.42;
        if (h <= 0.06) continue;
        if (glaze && x > -4.8 && x < 5.2 && h > 0.55) {
          K.box(key, x, 6.56, z, 1.02, 0.28, 0.24, false); // sill
          K.box("ac-glass", x, 6.72 + (h - 0.42) / 2, z + 0.02, 0.96, h - 0.42, 0.05, false);
        } else {
          K.box(key, x, (6.42 + top) / 2, z, 1.02, h, 0.24, false);
        }
      }
      K.box("ac-white", -0.4, 6.48, z, 12.6, 0.1, 0.26, false); // sill band at the clerestory base
    }
    // The signature: a tall square stacked-stone chimney at the street front,
    // through the roof, capped. It sits on the high side of the shed slope.
    K.box("ac-stone", 4.4, 5.0, 5.0, 1.45, 9.9, 1.3, true);
    K.box("ac-dark", 4.4, 10.0, 5.0, 1.72, 0.24, 1.58, false); // concrete cap
  }
  if (spec.id === "green") {
    // The green house's tall stacked-stone chimney runs up the rear-left corner
    // (seen from the backyard), with a spark-arrestor cage and a period TV aerial.
    const cx = -5.3,
      cz = -4.3;
    K.box("ac-stone", cx, 4.1, cz, 1.7, 8.2, 0.85, true);
    K.box("ac-dark", cx, 8.29, cz, 1.96, 0.18, 1.06, false);
    for (const dx of [-0.75, 0.75]) K.box("ac-metal", cx + dx, 8.52, cz, 0.045, 0.45, 0.85, false);
    K.box("ac-metal", cx, 8.76, cz, 1.9, 0.06, 1, false);
    for (const dz of [-0.42, 0.42]) K.box("ac-metal", cx, 8.98, cz + dz, 0.95, 0.34, 0.03, false);
    K.cylinder("ac-metal", cx, 10.0, cz, 0.03, 2.4);
    for (let i = 0; i < 4; i++) {
      const yy = 9.5 + i * 0.4,
        w = 0.72 - i * 0.13;
      K.line("ac-metal", [cx, yy, cz - w], [cx, yy, cz + w], 0.014);
      K.line("ac-metal", [cx - 0.35, yy - 0.05, cz], [cx + 0.35, yy + 0.05, cz], 0.012);
    }
  }
  // Roof plumbing vents, a porch light, and a front electric meter.
  K.cylinder("ac-dark", 2.0, 8.25, -1.4, 0.06, 0.7);
  K.cylinder("ac-dark", -1.4, 8.15, 1.9, 0.055, 0.6);
  K.box("ac-metal", 3.0, 8.05, 1.1, 0.42, 0.22, 0.42, false);
  K.cylinder("ac-dark", -3.1, 2.63, 6.0, 0.12, 0.09);
  K.sphere("ac-bulb", -3.1, 2.53, 6.0, 0.1, 0.1, 0.1);
  K.cylinder("ac-metal", 5.4, 1.5, 5.26, 0.16, 0.13, 0, Math.PI / 2);
  K.sphere("ac-glass", 5.4, 1.5, 5.35, 0.12, 0.12, 0.05);
  K.line("ac-metal", [5.4, 1.35, 5.25], [5.4, 0.42, 5.25], 0.025);
  if (spec.id === "green") {
    // Green house: enclosed attached gabled garage with front and rear access.
    K.box("ac-concrete", -9, 0, 1, 6.2, 0.32, 8.2, true);
    wall(K, key, -9, 5, 6, 2.9, [{ x: 0, y: 0.16, w: 4.65, h: 2.55 }]);
    wall(K, key, -12, 1, 8, 2.9, [], Math.PI / 2);
    wall(K, key, -9, -3, 6, 2.9, [{ x: 1.6, y: 0.16, w: 1.5, h: 2.4 }], Math.PI);
    for (const s of [-1, 1])
      K.box("ac-roof", -9 + s * 1.7, 3.6, 1, 3.65, 0.15, 8.7, false, 0, 0, -s * 0.32);
    K.box("ac-white", -9, 2.77, 4.8, 4.6, 0.25, 0.9, false); // garage door head
    for (let i = 0; i < 4; i++) K.box("ac-white", -9, 1.1 + i * 0.6, 4.86, 4.5, 0.42, 0.06, false); // door panels
  } else {
    // Yellow house: an open modernist carport, a thin shed roof falling steeply
    // to slim posts over the driveway, with a small enclosed store behind.
    K.box("ac-concrete", -9, 0, 1, 6.4, 0.32, 8.4, true);
    wall(K, key, -9, -3, 6, 2.6, [{ x: 1.4, y: 0.16, w: 1.4, h: 2.2 }], Math.PI); // back store wall
    wall(K, key, -12, -1.6, 3.4, 2.6, [], Math.PI / 2); // short left return
    K.box("ac-roof", -9.2, 4.4, 1, 7.4, 0.14, 8.6, false, 0, 0, 0.34); // slanted carport slab
    K.box("ac-white", -9.2, 4.32, 5.1, 7.4, 0.18, 0.1, false, 0, 0, 0.34); // fascia
    for (const z of [-2.8, 1, 4.6]) K.box("ac-white", -12.2, 1.72, z, 0.16, 3.3, 0.16, true); // posts
  }
  K.box("ac-wood", -10.9, 0.9, -1.6, 1.4, 1.5, 0.8, true);
  K.box("ac-wood", -7.4, 0.61, -1.9, 1.2, 0.9, 1.1, true);
  // Rear deck and external staircase form the second route upstairs.
  K.box("ac-wood", -0.9, y + 0.02, -6.4, 9.8, 0.24, 2.5, true);
  for (const x of [-5.6, 3.8])
    for (const z of [-5.5, -7.4]) K.box("ac-white", x, 1.6, z, 0.15, 3.25, 0.15, true);

  // Deck rail needs the upper-floor elevation, distinct from garden fences.
  K.box("ac-white", -1.85, y + 0.97, -7.63, 7.5, 0.08, 0.08, false);
  for (let x = -5.5; x < 2; x += 0.3)
    K.box("ac-white", x, y + 0.58, -7.63, 0.055, 0.88, 0.055, false);
  stairs(K, 3.05, -12.2, 1.55, 16, 0.29, y / 16, 0);
  furnish(K, spec);
  for (const z of [2, -2.5]) {
    const p = housePoint(spec, 1, z);
    A.interiorLights.push({ x: p.x, y: 2.6, z: p.z });
  }
  const p = housePoint(spec, 0, 0);
  A.interiorLights.push({ x: p.x, y: 5.7, z: p.z });
  kitFront(A, rng, spec);
  return { spec };
}

/** Convert a {p,n,uv,i} mesh record from the character loft toolkit into a BufferGeometry. */
function meshToGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(m.n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uv, 2));
  g.setIndex(m.i);
  return g;
}

/**
 * One closed car-body cross-section in the YZ plane: a rounded rectangle whose
 * half-width tapers from the sills (wBot) up to the roof or deck (wTop), so a
 * run of these lofts into a continuous shell with fenders and a greenhouse.
 */
function bodyRing(wBot, wTop, yBot, yTop, K) {
  const pts = [];
  const yc = (yBot + yTop) / 2,
    hy = (yTop - yBot) / 2,
    // Lower exponent -> flatter faces and a crisper shoulder line, so the body
    // side reads as a flat panel with a defined crease instead of an inflated
    // soap-bar ellipsoid. The earlier 0.6 bulged every section outward.
    e = 0.42;
  for (let k = 0; k < K; k++) {
    const a = -Math.PI / 2 + (k / K) * Math.PI * 2;
    const sy = Math.sin(a),
      cx = Math.cos(a);
    const yy = yc + hy * Math.sign(sy) * Math.abs(sy) ** e;
    const tTop = (sy + 1) / 2;
    const w = wBot + (wTop - wBot) * (tTop * tTop * (3 - 2 * tTop));
    pts.push([w * Math.sign(cx) * Math.abs(cx) ** e, yy]);
  }
  return pts;
}

/** Loft {x, pts:[[z,y],...]} stations (equal point counts) into a capped, outward-oriented tube along X. */
function buildTube(stations, K) {
  const m = emptyMesh();
  let ymid = 0;
  for (const st of stations) {
    let arc = 0;
    for (let k = 0; k < K; k++) {
      const [z, y] = st.pts[k];
      m.p.push(st.x, y, z);
      m.n.push(0, 0, 0);
      if (k > 0) arc += Math.hypot(z - st.pts[k - 1][0], y - st.pts[k - 1][1]);
      m.uv.push(arc, st.x);
      ymid += y;
    }
  }
  ymid /= stations.length * K;
  for (let s = 0; s + 1 < stations.length; s++)
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      const a = s * K + k,
        b = s * K + k2,
        c = (s + 1) * K + k,
        d = (s + 1) * K + k2;
      m.i.push(a, c, b, b, c, d);
    }
  const cap = (s, flip) => {
    let cy = 0,
      cz = 0;
    for (const [z, y] of stations[s].pts) {
      cy += y;
      cz += z;
    }
    const ci = vcount(m);
    m.p.push(stations[s].x, cy / K, cz / K);
    m.n.push(0, 0, 0);
    m.uv.push(0, stations[s].x);
    const base = s * K;
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      if (flip) m.i.push(ci, base + k2, base + k);
      else m.i.push(ci, base + k, base + k2);
    }
  };
  cap(0, true);
  cap(stations.length - 1, false);
  computeNormals(m);
  weldNormals(m);
  // Flip winding if the surface ended up facing inward.
  let dot = 0;
  const nv = vcount(m);
  for (let i = 0; i < nv; i++) {
    const ry = m.p[i * 3 + 1] - ymid,
      rz = m.p[i * 3 + 2];
    const l = Math.hypot(ry, rz) || 1;
    dot += (m.n[i * 3 + 1] * ry + m.n[i * 3 + 2] * rz) / l;
  }
  if (dot < 0) {
    for (let t = 0; t < m.i.length; t += 3) {
      const tmp = m.i[t + 1];
      m.i[t + 1] = m.i[t + 2];
      m.i[t + 2] = tmp;
    }
    computeNormals(m);
    weldNormals(m);
  }
  return m;
}

/**
 * A rounded rubber tire instead of a flat disc: a torus gives the bulged
 * sidewall and a round tread that catches light, a flat tread band keeps the
 * contact patch, and a domed chrome hubcap with a whitewall sits on the outer
 * face. The axle runs along local Z, which is the torus hole axis, so no
 * rotation is needed.
 */
function tire(A, K, x, y, z, s, R = 0.52, width = 0.3) {
  const tube = Math.min(width * 0.6, R * 0.42);
  const torus = A.cache(
    `ac-tire:${R}:${width}`,
    () => new THREE.TorusGeometry(R - tube, tube, 16, 28),
  );
  K.geo("ac-rubber", torus, x, y, z);
  K.cylinder("ac-rubber", x, y, z, R - tube * 0.35, width * 0.72, Math.PI / 2);
  const outer = z + s * width * 0.5;
  K.cylinder("ac-white", x, y, outer - s * 0.012, R * 0.66, 0.012, Math.PI / 2);
  K.sphere("ac-chrome", x, y, outer, R * 0.4, R * 0.4, width * 0.34);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    K.sphere(
      "ac-dark",
      x + Math.cos(a) * R * 0.22,
      y + Math.sin(a) * R * 0.22,
      outer + s * 0.02,
      0.028,
      0.028,
      0.02,
    );
  }
}

function wheels(A, K, xs, z, radius = 0.52, width = 0.3) {
  for (const x of xs)
    for (const s of [-1, 1]) tire(A, K, x, radius + 0.08, z + s * 1.37, s, radius, width);
}

/** Recessed headlight facing +/-X: a dark reflector bowl, a chrome bezel ring, and a glass lens. */
function headlight(K, x, y, z, r = 0.14, s = 1) {
  K.cylinder("ac-dark", x - s * 0.05, y, z, r * 0.9, 0.14, 0, Math.PI / 2);
  K.cylinder("ac-chrome", x, y, z, r, 0.04, 0, Math.PI / 2);
  K.sphere("ac-bulb", x + s * 0.03, y, z, r * 0.82, r * 0.82, r * 0.82);
}
function bus(A, box) {
  // Parked at an angle across the middle of the street, the way the central bus
  // blocks sightlines and gives cover in the cul-de-sac.
  const K = kit(A, box.x, box.z, box.yaw);
  K.box("ac-dark", 0, 0.77, 0, 11.3, 0.5, 2.5, true);
  // Slab-sided body with crisp corners: a school bus is a hard-edged box with a
  // small radius on its vertical corners and a gently curved roof, not a pillow.
  // The earlier 22-30 cm roundovers inflated it into a soft toy.
  K.round("ac-bus", 0, 1.35, 0, 11.1, 0.95, 2.62, 0.05, true);
  // Cream rounded roof over the window line: the white-roofed 1940s coach.
  K.round("ac-cream", 0.7, 2.86, 0, 9.7, 0.34, 2.72, 0.12, true);
  K.round("ac-cream", 0.7, 2.66, 0, 9.75, 0.22, 2.7, 0.06, false);
  K.round("ac-bus", -4.8, 1.64, 0, 1.4, 0.46, 2.55, 0.06, true);
  // Wheel arches over each wheel keep their curve.
  for (const x of [-3.7, 3.7])
    for (const s of [-1, 1]) K.round("ac-dark", x, 0.78, s * 1.25, 1.3, 0.6, 0.2, 0.1, false);
  K.box("ac-glass", -3.94, 2.26, 0, 0.04, 0.98, 2.42, true);
  K.box("ac-bus", 5.47, 2.22, 0, 0.17, 1.2, 2.62, true);
  for (const side of [-1, 1]) {
    for (let x = -3.5; x < 5.4; x += 0.95) {
      K.box("ac-glass", x, 2.26, side * 1.315, 0.82, 0.85, 0.035, true);
      K.box("ac-bus", x - 0.48, 2.26, side * 1.33, 0.1, 1.15, 0.08, false);
      K.box("ac-chrome", x, 2.25, side * 1.36, 0.79, 0.025, 0.025, false);
    }
    for (const y of [0.99, 1.17, 1.64])
      K.box("ac-dark", 0, y, side * 1.337, 11, 0.065, 0.04, false);
    K.box("ac-bus", -3.65, 1.56, side * 1.55, 0.16, 0.23, 0.48, false);
    K.line("ac-metal", [-3.95, 2.36, side * 1.3], [-4.25, 2.4, side * 1.72]);
    K.box("ac-dark", -4.25, 2.42, side * 1.74, 0.12, 0.36, 0.18, false);
    for (let x = -4.8; x < 5.5; x += 0.32)
      K.sphere("ac-metal", x, 1.47, side * 1.352, 0.018, 0.018, 0.013);
  }
  K.box("ac-chrome", -5.67, 0.88, 0, 0.15, 0.25, 2.9, false);
  K.box("ac-dark", -5.57, 1.35, 0, 0.07, 0.6, 1.2, false);
  for (let z = -0.5; z <= 0.5; z += 0.1)
    K.box("ac-chrome", -5.63, 1.35, z, 0.06, 0.54, 0.035, false);
  for (const z of [-1, 1]) K.sphere("ac-red", 5.59, 1.5, z, 0.04, 0.12, 0.12);
  K.art("ac-bus-sign", -3.94, 2.85, 0, 2.2, 0.3, -Math.PI / 2);
  for (const z of [-1, 1]) headlight(K, -5.64, 1.57, z, 0.15, -1);
  // Road grime and rust weeps down the lower panels and around the wheel arches.
  for (const side of [-1, 1]) {
    for (let x = -4.6; x < 5.3; x += 0.78)
      K.box("ac-rust", x, 0.98, side * 1.33, 0.05, 0.42, 0.008, false);
    for (const x of [-3.7, 3.7]) K.box("ac-rust", x, 0.72, side * 1.3, 0.9, 0.12, 0.01, false);
  }
  wheels(A, K, [-3.7, 3.7], 0);
}

function truck(A, box) {
  const K = kit(A, box.x, box.z, box.yaw);
  K.box("ac-dark", 0, 0.85, 0, 13.5, 0.35, 2.4, true);
  K.round("ac-red", -5.5, 1.43, 0, 2.3, 1.2, 2.55, 0.06, true);
  K.round("ac-red", -5.1, 2.49, 0, 2.2, 0.95, 2.5, 0.07, true);
  K.round("ac-red", -5.1, 3.03, 0, 2.4, 0.18, 2.65, 0.05, false);
  K.box("ac-glass", -6.23, 2.58, 0, 0.025, 0.65, 2.24, false);
  for (const z of [-1.28, 1.28]) {
    K.box("ac-glass", -5.45, 2.56, z, 1.22, 0.65, 0.025, false);
    K.box("ac-chrome", -5.1, 1.89, z * 1.04, 0.24, 0.045, 0.05, false);
    K.cylinder("ac-chrome", -3.95, 2.15, z, 0.09, 2.9);
  }
  K.box("ac-chrome", -6.7, 1.37, 0, 0.16, 1.05, 1.15, false);
  for (let z = -0.52; z < 0.58; z += 0.12) K.box("ac-dark", -6.8, 1.4, z, 0.035, 0.85, 0.05, false);
  K.box("ac-chrome", -6.91, 0.75, 0, 0.18, 0.29, 2.82, false);
  for (const z of [-1, 1]) headlight(K, -6.8, 1.57, z, 0.17, -1);
  // Open moving trailer: a ribbed silver aluminum box, the lateral gap a passage.
  K.box("ac-wood", 1.9, 1.02, 0, 8.85, 0.2, 2.75, true);
  K.box("ac-chrome", 1.9, 3.73, 0, 9, 0.15, 2.95, true);
  K.box("ac-metal", 6.35, 2.4, 0, 0.14, 2.65, 2.85, true);
  K.box("ac-metal", -2.55, 2.4, 0, 0.14, 2.65, 2.85, true);
  for (const s of [-1, 1]) {
    K.box("ac-metal", 0.45, 2.38, s * 1.44, 6, 2.58, 0.08, true);
    // Corrugated flutes down the aluminum side.
    for (let x = -2.5; x < 3.4; x += 0.16)
      K.box("ac-chrome", x, 2.4, s * 1.49, 0.03, 2.5, 0.03, false);
    // A painted logo band on the upper side, original haulier name.
    K.box("ac-rust", 0.45, 3.2, s * 1.495, 5.6, 0.92, 0.02, false);
    K.art("ac-moving", 0.45, 3.2, s * 1.52, 4.8, 0.78, s < 0 ? Math.PI : 0);
    // Ramps at the open rear third of the trailer.
    K.box("ac-wood", 4.85, 0.6, s * 2.1, 2.35, 0.12, 1.7, true, s * 0.5);
  }
  K.box("ac-wood", -1.7, 1.75, 0, 1.3, 1.3, 1.7, true);
  K.round("ac-sofa", 1.2, 1.6, 0, 1.2, 1, 1.9, 0.1, true);
  wheels(A, K, [-5.2, -2.9, 4.2, 5.6], 0, 0.58, 0.34);
}

function car(A, box, color = "ac-car") {
  const K = kit(A, box.x, box.z, box.yaw);
  const trim = "ac-chrome",
    glass = "ac-glass",
    KK = 32;
  // ---- Sculpted lower body shell: one lofted tube with fenders and a tail ----
  const S = [];
  const st = (x, wb, wt, yb, yt) => S.push({ x, pts: bodyRing(wb, wt, yb, yt, KK) });
  st(2.42, 0.6, 0.5, 0.52, 0.86);
  st(2.18, 0.84, 0.72, 0.42, 0.93);
  st(1.75, 0.93, 0.85, 0.38, 0.99);
  st(1.45, 0.95, 0.88, 0.36, 1.0); // front fender, only slightly proud of the body
  st(1.05, 0.93, 0.88, 0.35, 1.0);
  st(0.55, 0.94, 0.89, 0.35, 1.02); // cowl
  st(0.0, 0.95, 0.9, 0.35, 1.02);
  st(-0.55, 0.95, 0.89, 0.36, 1.02);
  st(-1.05, 0.93, 0.88, 0.37, 1.01);
  st(-1.45, 0.95, 0.88, 0.38, 1.0); // rear fender, only slightly proud
  st(-1.9, 0.9, 0.82, 0.4, 1.02);
  st(-2.2, 0.8, 0.7, 0.42, 0.98);
  st(-2.45, 0.58, 0.5, 0.48, 0.9);
  K.geo(color, meshToGeometry(buildTube(S, KK)), 0, 0, 0);
  // ---- Greenhouse: roof, pillars, tinted glass, chrome surrounds ----
  K.round(color, -0.3, 1.49, 0, 1.68, 0.09, 1.12, 0.09, true);
  K.box(glass, 0.5, 1.26, 0, 0.04, 0.6, 1.5, false, 0, 0, 0.62); // raked windshield
  K.box(glass, -1.12, 1.28, 0, 0.04, 0.52, 1.4, false, 0, 0, -0.55); // backlight
  for (const s of [-1, 1]) {
    K.box(glass, -0.3, 1.3, s * 0.6, 1.5, 0.52, 0.04, false); // side glass
    K.line(color, [0.62, 1.0, s * 0.56], [0.33, 1.5, s * 0.52], 0.035); // A-pillar
    K.line(color, [-0.3, 1.02, s * 0.6], [-0.3, 1.5, s * 0.54], 0.03); // B-pillar
    K.line(color, [-0.95, 1.02, s * 0.58], [-0.62, 1.5, s * 0.5], 0.035); // C-pillar
    K.line(trim, [0.33, 1.5, s * 0.52], [-0.62, 1.5, s * 0.52], 0.02); // drip rail
    K.line(trim, [0.6, 1.01, s * 0.6], [-0.95, 1.01, s * 0.6], 0.02); // beltline chrome
    // Door and panel shut-lines: thin recessed grooves that break the monolithic
    // body side into hood, two doors, and a rear quarter, the way sheet metal is.
    for (const sx of [1.0, 0.1, -1.05, -1.7])
      K.line("ac-dark", [sx, 0.52, s * 1.0], [sx, 1.0, s * 1.0], 0.007);
    K.line("ac-dark", [0.95, 0.9, s * 1.0], [-1.6, 0.9, s * 1.0], 0.006); // body-side feature crease
  }
  // ---- Chrome side spear, overrider bumpers, eggcrate grille ----
  for (const s of [-1, 1]) K.box(trim, -0.1, 0.84, s * 0.995, 3.6, 0.06, 0.03, false);
  for (const [xx, s] of [
    [2.5, 1],
    [-2.52, -1],
  ]) {
    K.cylinder(trim, xx, 0.58, 0, 0.1, 1.75, Math.PI / 2);
    for (const z of [-0.5, 0.5])
      K.round(trim, xx - s * 0.02, 0.62, z, 0.18, 0.34, 0.18, 0.06, false);
  }
  K.round(trim, 2.46, 0.74, 0, 0.1, 0.34, 1.2, 0.05, false);
  for (let z = -0.52; z <= 0.52; z += 0.13) K.box(trim, 2.49, 0.74, z, 0.06, 0.3, 0.04, false);
  // ---- Tailfins with chrome caps and tail lights ----
  for (const s of [-1, 1]) {
    K.round(color, -2.0, 1.2, s * 0.72, 0.95, 0.42, 0.1, 0.05, false, 0, 0, 0.18);
    K.line(trim, [-1.6, 1.08, s * 0.76], [-2.42, 1.42, s * 0.74], 0.015);
    K.cylinder(trim, -2.46, 1.1, s * 0.66, 0.08, 0.06, 0, Math.PI / 2);
    K.sphere("ac-red", -2.46, 1.1, s * 0.66, 0.07, 0.12, 0.09);
  }
  // ---- Dual recessed headlights ----
  for (const s of [-1, 1]) headlight(K, 2.5, 0.82, s * 0.62, 0.13, 1);
  // ---- Wing mirrors and wipers ----
  for (const s of [-1, 1]) {
    K.line(trim, [0.62, 1.1, s * 0.95], [0.92, 1.28, s * 1.02], 0.018);
    K.round(trim, 0.94, 1.29, s * 1.03, 0.09, 0.13, 0.05, 0.03, false);
    K.line("ac-dark", [0.66, 1.42, s * 0.3], [0.44, 1.26, s * 0.5], 0.01);
  }
  // ---- Enclosed, shadowed cabin ----
  // A dark interior shell inset behind the glass, so the greenhouse reads as
  // windows over a shadowed cabin instead of open sky seen straight through.
  K.round("ac-dark", -0.3, 1.25, 0, 1.4, 0.52, 1.0, 0.06, false);
  // ---- Interior visible through the glass ----
  K.round("ac-dark", 0.1, 0.78, 0, 2.0, 0.18, 1.7, 0.1, true);
  K.round("ac-sofa", -0.15, 0.78, 0, 0.5, 0.28, 1.55, 0.12, false);
  K.round("ac-sofa", -0.45, 1.05, 0, 0.16, 0.5, 1.5, 0.1, false);
  K.round("ac-sofa", -1.05, 1.05, 0, 0.16, 0.48, 1.5, 0.1, false);
  K.round("ac-dark", 0.62, 0.95, 0, 0.26, 0.26, 1.7, 0.06, false);
  K.geo(
    "ac-dark",
    new THREE.TorusGeometry(0.15, 0.022, 10, 20),
    0.74,
    1.04,
    0.42,
    1,
    1,
    1,
    0,
    Math.PI / 2,
    0.5,
  );
  K.line("ac-dark", [0.9, 0.98, 0.42], [0.74, 1.04, 0.42], 0.02);
  // ---- Wheel arches with seated whitewall tires ----
  // A dark arch liner recesses each opening and a body-colour flared lip frames
  // it, so the tyre reads as seated in a wheel well instead of a dark blob
  // tucked under the fender bulge.
  for (const xx of [1.45, -1.45])
    for (const s of [-1, 1]) {
      const z = s * 0.97;
      K.geo(
        "ac-dark",
        new THREE.TorusGeometry(0.5, 0.055, 8, 22, Math.PI * 1.2),
        xx,
        0.49,
        z,
        1,
        1,
        1,
        0,
        0,
        -Math.PI * 0.1,
      );
      K.geo(
        color,
        new THREE.TorusGeometry(0.55, 0.03, 8, 22, Math.PI * 1.16),
        xx,
        0.49,
        z + s * 0.012,
        1,
        1,
        1,
        0,
        0,
        -Math.PI * 0.08,
      );
      tire(A, K, xx, 0.46, s * 0.88, s, 0.43, 0.27);
    }
}

function garden(A, h, rng) {
  const K = kit(A, h.x, h.z, h.yaw);
  // Perimeter runs (tall boarded fence) then the front picket runs, from the
  // shared layout data the interpenetration test also reads.
  GARDEN_FENCES.forEach((seg, i) => {
    const perimeter = i < 3;
    fence(
      K,
      seg[0],
      seg[1],
      seg[2],
      seg[3],
      perimeter ? (i === 0 ? 2.05 : 1.8) : 1.35,
      perimeter ? "ac-fence" : "ac-white",
      !perimeter,
    );
  });
  // Garden shed and lattice, separated from the circulation around the house.
  K.box("ac-wood", -13, 1.25, -14.5, 4.5, 2.3, 3.5, true);
  K.box("ac-roof", -13, 2.72, -14.5, 5, 0.15, 4, false, 0, 0, 0.13);
  K.box("ac-blue", -13, 1.25, -12.72, 1.35, 2.05, 0.06, false);
  K.box("ac-concrete", 8, 0.18, -11, 6, 0.08, 6, true);
  K.cylinder("ac-white", 8, 1.02, -10.5, 0.85, 0.07);
  K.cylinder("ac-metal", 8, 0.57, -10.5, 0.05, 0.9);
  K.cylinder("ac-metal", 8, 1.9, -10.5, 0.025, 2.3);
  K.geo("ac-orange", new THREE.ConeGeometry(1.55, 0.48, 12), 8, 2.9, -10.5);
  for (const x of [6.7, 9.3]) {
    K.box("ac-white", x, 0.67, -10.5, 0.55, 0.1, 0.65, true);
    K.box("ac-white", x, 1.06, -10.78, 0.55, 0.75, 0.08, false);
    for (const dx of [-0.22, 0.22])
      for (const dz of [-0.25, 0.25]) K.cylinder("ac-metal", x + dx, 0.43, -10.5 + dz, 0.025, 0.5);
  }
  K.cylinder("ac-dark", 11, 0.93, -13, 0.42, 0.24);
  K.sphere("ac-dark", 11, 1.1, -13, 0.42, 0.25, 0.42);
  for (const dx of [-0.25, 0.25])
    K.line("ac-metal", [11 + dx, 0.85, -13], [11 + dx, 0.2, -13], 0.025);
  // Swing set, washing line, planted borders and topiary.
  for (const x of [-5, 0]) {
    K.line("ac-metal", [x, 0.16, -16.8], [x, 2.85, -15.3], 0.055);
    K.line("ac-metal", [x, 0.16, -13.8], [x, 2.85, -15.3], 0.055);
  }
  K.line("ac-metal", [-5, 2.85, -15.3], [0, 2.85, -15.3], 0.055);
  for (const x of [-3.6, -1.4]) {
    for (const dx of [-0.22, 0.22])
      K.line("ac-dark", [x + dx, 2.82, -15.3], [x + dx, 0.72, -15.3], 0.012);
    K.box("ac-wood", x, 0.71, -15.3, 0.62, 0.06, 0.32, false);
  }
  for (const x of [-17, 16])
    for (let z = -16; z < 6; z += 3.4) {
      shrub(K, x, 0.78, z, 0.92, "ac-hedge", 0.55);
      K.box("ac-stone", x, 0.28, z, 1.7, 0.3, 1.7, true);
    }
  for (let i = 0; i < 85; i++) {
    const x = rng.range(1, 11),
      z = rng.range(6, 8);
    K.sphere(i % 3 ? "ac-hedge" : "ac-orange", x, 0.28, z, 0.1, 0.12, 0.1);
  }
  // Drainpipe, porch light and mail box.
  K.cylinder("ac-white", 5.9, 3.2, 5.25, 0.055, 6.2);
  K.box("ac-metal", 4, 0.78, 7.2, 0.06, 1.2, 0.06, true);
  K.box("ac-metal", 4, 1.42, 7.2, 0.38, 0.34, 0.62, false);
  K.sphere("ac-bulb", -2.03, 2.2, 5.22, 0.09, 0.16, 0.1);
}

/**
 * Dense set dressing tuned for a 1950s suburb: driveway tyres and crates, side
 * yard utilities and drums, backyard patio furniture and bins, and loading
 * clutter and cover around the central vehicles. Placed symmetrically per house
 * through the instanced prop library, with per-instance jitter and dust skirts.
 */
function dressYards(A, rng) {
  A.jitter = { rng, yaw: 0.35, scale: 0.1 };
  A.skirts = true;
  const Y = 0.15;
  const at = (h, id, lx, lz, ry = 0) => {
    const p = housePoint(h, lx, lz);
    A.put(id, p.x, Y, p.z, ry + h.yaw + rng.range(-0.3, 0.3));
  };
  for (const h of HOUSES) {
    at(h, "tyre", -9.5, 6.3);
    at(h, "tyre_small", -9, 6.7);
    at(h, "crate_c", -11, 6);
    at(h, "crate_b", -11, 6.7);
    at(h, "barrel_rust", -7.3, 6.8);
    at(h, "bucket", -8, 7.2);
    at(h, "pallet", -11.6, 4.5);
    at(h, "ac_unit", 6.6, -2);
    at(h, "water_tank", 7.4, -7);
    at(h, "barrel_wood", 6.8, 1);
    at(h, "gas_bottle", 6.4, 3);
    at(h, "box_card_a", 6.6, 5);
    at(h, "table", -3.5, -11.5);
    at(h, "chair", -4.8, -11.2);
    at(h, "chair", -2.3, -12);
    at(h, "chair", -3.2, -10.3);
    at(h, "barrel_rust", 5.2, -13);
    at(h, "barrel_rust", 6, -13.4);
    at(h, "crate_b", 4, -11);
    at(h, "box_card_b", 4.6, -11.6);
    at(h, "mattress", 1.5, -14.3);
    at(h, "tyre", -6.5, -13.5);
    at(h, "tyre", -6, -14);
    at(h, "bucket", 0, -9);
    at(h, "jerry_can", 1.2, -9.4);
    at(h, "crate_b", 3.5, 6.4);
    at(h, "bucket", 2.6, 6.8);
  }
  const P = (id, x, z, ry = 0) => A.put(id, x, Y, z, ry + rng.range(-0.3, 0.3));
  P("block_small", -8, 2, 0.3);
  P("block_small", 7.5, -3.5, -0.2);
  P("crate_c", -6, -5);
  P("crate_b", -5.2, -5.6);
  P("box_card_a", -6.3, -4.4);
  P("barrel_rust", 9.5, 4.2);
  P("barrel_wood", 10.2, 3.4);
  P("pallet", -10.5, 5.2);
  P("tyre", 4.2, -6);
  P("tyre", 4.8, -6.3);
  P("tyre_small", 5.3, -6);
  P("crate_b", 11, -4);
  P("bucket", -3, 6);
  A.jitter = null;
  A.skirts = false;

  // CC0 glTF models where they clearly beat the procedural prop: a hedge row
  // along the front fence, a potted plant by the porch, a kerbside bin, and
  // lawn chairs in the yard. Loaded asynchronously by the world system; absent
  // models are skipped. See assets/ASSETS.md.
  A.models = A.models ?? [];
  for (const h of HOUSES) {
    const m = (id, lx, lz, scale, yaw = 0) => {
      const p = housePoint(h, lx, lz);
      A.models.push({
        id,
        x: p.x,
        z: p.z,
        y: 0.13,
        yaw: yaw + h.yaw + rng.range(-0.25, 0.25),
        scale,
      });
    };
    for (const lx of [-5.5, -1.8, 1.8, 5.5]) m("shrub_01", lx, 7.9, rng.range(1.1, 1.4));
    m("potted_plant_01", -1.4, 6.0, 1.2);
    m("potted_plant_01", 1.2, 6.0, 1.1, 1.3);
    m("metal_trash_can", -7.6, 7.3, 1.0);
    m("metal_trash_can", -6.9, 7.3, 1.0, 2.0);
    m("GreenChair_01", 2.4, 5.6, 1.0, 2.5);
    m("GreenChair_01", 3.7, 5.7, 1.0, 3.4);
  }
  // Street furniture on the kerb verge: period lamp posts and a hydrant.
  for (const [x, z, yaw] of [
    [-18, -8.5, 0],
    [17, 8.5, Math.PI],
    [-18, 8.5, 0],
    [17, -8.5, Math.PI],
  ]) {
    A.models.push({ id: "street_lamp_01", x, z, y: 0.13, yaw, scale: 1, far: 90 });
  }
  A.models.push({ id: "fire_hydrant", x: -15.2, z: -8.7, y: 0.13, yaw: 0.6, scale: 1 });
}

/**
 * Furnish the open living area of a house with a real interiors.js room:
 * seating, shelving, floor litter, and wall dressing from the shared prop
 * library. Kept to the left half so it never fights the hand-built kitchen and
 * bed on the right.
 */
function furnishHouse(A, rng, h) {
  const c0 = housePoint(h, -5, -4);
  const c1 = housePoint(h, 0.5, 4);
  furnishRoom(A, rng, {
    kind: "living",
    x0: Math.min(c0.x, c1.x),
    x1: Math.max(c0.x, c1.x),
    z0: Math.min(c0.z, c1.z),
    z1: Math.max(c0.z, c1.z),
    y: 0.13,
    h: 2.6,
  });
}

/**
 * Progressive enhancement: swap the procedural ground maps for the CC0
 * photoscanned sets once they have been fetched (see assets/ASSETS.md). The
 * material library's shader still world-projects, parallaxes, and weathers the
 * maps, so tiling stays hidden and the surface keeps its macro variation. A
 * set that is not present leaves the procedural surface untouched, so the
 * demo, the gate, and a fresh clone all work with no network.
 */
function enhancePbr(A) {
  const jobs = [
    // The asphalt scan carries wet patches and a cool cast: raise the roughness
    // floor so it reads dry, desaturate, and warm it toward sun-baked tarmac.
    ["ac-road", "asphalt", { roughnessFloor: 0.82, desaturate: 0.5, warm: [1.08, 1.0, 0.88] }],
    ["ac-concrete", "concrete", { roughnessFloor: 0.7 }],
    ["ac-grass", "grass", {}],
    // Keep the pale grey albedo and take only the masonry relief, or the brick
    // scan's dark red albedo overrides the stone colour back to brown brick.
    ["ac-stone", "bricks", { grainOnly: true, normalScale: 0.9, roughnessFloor: 0.7 }],
    ["ac-roof", "roof", { roughnessFloor: 0.58 }],
    ["ac-fence", "planks", {}],
    // Painted vehicle panels keep their solid colour; the scan contributes only
    // panel scratches and a semi-gloss roughness, so the paint does not go camo.
    ["ac-bus", "metal", { grainOnly: true, normalScale: 0.5, roughnessFloor: 0.3 }],
    ["ac-car", "metal", { grainOnly: true, normalScale: 0.14, roughnessFloor: 0.14 }],
    ["ac-red", "metal", { grainOnly: true, normalScale: 0.5, roughnessFloor: 0.3 }],
    // Siding keeps its pastel albedo; take only the plank grain normal and a
    // matte roughness so the colour is untouched.
    ["ac-green", "siding", { grainOnly: true, normalScale: 0.4 }],
    ["ac-yellow", "siding", { grainOnly: true, normalScale: 0.4 }],
  ];
  const renderer = A.render?.renderer;
  for (const [key, name, opts] of jobs) {
    const mat = A.mat(key);
    if (!mat) continue;
    loadPbrSet(name, "/assets/pbr", { ...opts, renderer })
      .then((set) => {
        if (!set) return;
        // A skinned key owns its colour: the scan contributes relief only, so
        // the calibrated World Labs tint is what reaches the screen.
        const grainOnly = opts.grainOnly || skinTint(A.skin ?? null, key) !== null;
        if (!grainOnly && set.albedo) mat.map = set.albedo;
        if (set.normal) {
          mat.normalMap = set.normal;
          // Skinned vehicle paint is lacquered: keep only a whisper of the
          // scan's panel relief under the clearcoat.
          const ns = skinFinish(A.skin ?? null, key)
            ? Math.min(opts.normalScale ?? 1, 0.14)
            : opts.normalScale;
          if (ns && mat.normalScale) mat.normalScale.set(ns, ns);
        }
        if (set.orm) mat.roughnessMap = set.orm;
        mat.needsUpdate = true;
      })
      .catch(() => {});
  }
}

/**
 * Near-camera ground detail that breaks up the flat lawn and road planes:
 * leaning grass-blade tufts on the verges, fallen leaves and twigs, kerb and
 * road-edge chips and tar patches, and gentle dunes on the sand ring. All of
 * it is static merged geometry; live wind sway on the blades is not modeled.
 */
function groundCover(A, rng) {
  const K = kit(A);
  const vergeZ = () => (rng.range(0, 1) < 0.5 ? 1 : -1) * rng.range(8.2, 13.5);
  for (let i = 0; i < 680; i++) {
    const x = rng.range(-22.5, 22.5),
      z = vergeZ(),
      blades = 4 + Math.floor(rng.range(0, 3)),
      key = rng.range(0, 1) < 0.5 ? "ac-grass" : "ac-hedge";
    for (let b = 0; b < blades; b++) {
      const a = rng.range(0, Math.PI * 2),
        off = rng.range(0, 0.06),
        h = rng.range(0.13, 0.27),
        lean = rng.range(0.12, 0.33);
      K.box(
        key,
        x + Math.cos(a) * off,
        0.12 + h / 2,
        z + Math.sin(a) * off,
        0.022,
        h,
        0.022,
        false,
        Math.sin(a) * lean,
        0,
        -Math.cos(a) * lean,
      );
    }
  }
  for (let i = 0; i < 140; i++) {
    const x = rng.range(-22.5, 22.5),
      z = vergeZ(),
      t = rng.range(0, 1),
      key = t < 0.4 ? "ac-orange" : t < 0.7 ? "ac-rust" : "ac-wood";
    K.box(
      key,
      x,
      0.126,
      z,
      rng.range(0.07, 0.15),
      0.008,
      rng.range(0.05, 0.12),
      false,
      0,
      rng.range(0, Math.PI),
      0,
    );
  }
  for (let i = 0; i < 60; i++) {
    const x = rng.range(-22, 22),
      side = rng.range(0, 1) < 0.5 ? 1 : -1,
      z = side * (7.6 + rng.range(-0.3, 0.2));
    K.box(
      "ac-tar",
      x,
      0.172,
      z,
      rng.range(0.1, 0.45),
      0.004,
      rng.range(0.04, 0.11),
      false,
      0,
      rng.range(-0.4, 0.4),
      0,
    );
  }
  for (let i = 0; i < 22; i++) {
    const x = rng.range(-22, 22),
      side = rng.range(0, 1) < 0.5 ? 1 : -1;
    K.box(
      "ac-concrete",
      x,
      0.19,
      side * (7.6 + rng.range(-0.05, 0.05)),
      rng.range(0.12, 0.28),
      0.1,
      0.18,
      false,
      0,
      rng.range(-0.25, 0.25),
      0,
    );
  }
  for (let i = 0; i < 24; i++) {
    const a = rng.range(0, Math.PI * 2),
      r = rng.range(42, 150);
    K.geo(
      "ac-sand",
      rockGeometry(rng, 1, 2, 0.4),
      Math.sin(a) * r,
      -1.2,
      Math.cos(a) * r,
      rng.range(10, 26),
      rng.range(1.2, 3.2),
      rng.range(10, 26),
    );
  }
}

/**
 * A mature deciduous tree: a tapered trunk stepping up through a few bark
 * segments, five limbs radiating to the crown, and an irregular canopy of
 * overlapping leaf clusters in two greens. Solid cluster foliage reads as a
 * full tree from the street and avoids the transparent-sort pipeline.
 */
function tree(A, x, z, rng, scale = 1) {
  const K = kit(A, x, z, rng.range(0, Math.PI * 2));
  const h = 5.5 * scale;
  const segs = 5;
  const trunkTop = h * 0.46;
  for (let i = 0; i < segs; i++) {
    const t = i / segs,
      r = (0.22 - 0.12 * t) * scale,
      seg = trunkTop / segs;
    K.cylinder(
      "ac-wood",
      rng.range(-0.03, 0.03),
      (i + 0.5) * seg,
      rng.range(-0.03, 0.03),
      r,
      seg + 0.04,
    );
  }
  const clusters = [[0, trunkTop + 0.7 * scale, 0]];
  const nb = 5;
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * Math.PI * 2 + rng.range(-0.35, 0.35),
      reach = rng.range(1.0, 1.7) * scale,
      bx = Math.cos(a) * reach,
      bz = Math.sin(a) * reach,
      by = trunkTop + rng.range(0.2, 1.1) * scale;
    K.line("ac-wood", [0, trunkTop - 0.2, 0], [bx, by, bz], 0.07 * scale);
    clusters.push([bx, by, bz]);
  }
  for (const [cx, cy, cz] of clusters) {
    const n = 5 + Math.floor(rng.range(0, 3));
    for (let i = 0; i < n; i++) {
      const g = rng.range(0, 1) < 0.5 ? "ac-hedge" : "ac-grass",
        rr = rng.range(0.75, 1.25) * scale;
      K.sphere(
        g,
        cx + rng.range(-0.6, 0.6),
        cy + rng.range(-0.4, 0.6),
        cz + rng.range(-0.6, 0.6),
        rr,
        rr * 0.82,
        rr,
      );
    }
  }
}

/**
 * Wear on the asphalt so the road is not a clean grey strip: oil stains along
 * the driving line, hairline cracks branching off the seams, skid marks at the
 * crossing, and two cast-iron utility covers.
 */
function roadWear(A, rng) {
  const K = kit(A);
  for (let i = 0; i < 16; i++) {
    const x = rng.range(-20, 20),
      z = rng.range(-6.4, 6.4),
      r = rng.range(0.25, 0.85);
    K.geo(
      "ac-dark",
      new THREE.CircleGeometry(r, 18),
      x,
      0.141,
      z,
      1,
      rng.range(0.55, 1),
      1,
      -Math.PI / 2,
      rng.range(0, Math.PI),
    );
  }
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-21, 21),
      z = rng.range(-7, 7);
    K.box(
      "ac-tar",
      x,
      0.139,
      z,
      rng.range(0.5, 2.3),
      0.004,
      0.022,
      false,
      0,
      rng.range(0, Math.PI),
      0,
    );
  }
  for (const s of [-1, 1])
    K.box("ac-tar", s * 2.2, 0.14, 1.3, 3.4, 0.004, 0.11, false, 0, s * 0.12, 0);
  for (const [mx, mz] of [
    [-6, 1.8],
    [9, -2.2],
  ]) {
    K.cylinder("ac-metal", mx, 0.142, mz, 0.42, 0.02);
    K.cylinder("ac-dark", mx, 0.146, mz, 0.37, 0.012);
  }
  // Sidewalk grime: hairline cracks and mildew stains on the kerb walks.
  for (let i = 0; i < 44; i++) {
    const x = rng.range(-22, 22),
      side = rng.range(0, 1) < 0.5 ? 1 : -1,
      z = side * rng.range(7.1, 8.1);
    if (rng.range(0, 1) < 0.5)
      K.box(
        "ac-tar",
        x,
        0.295,
        z,
        rng.range(0.3, 1.2),
        0.004,
        0.02,
        false,
        0,
        rng.range(0, Math.PI),
        0,
      );
    else
      K.geo(
        "ac-dark",
        new THREE.CircleGeometry(rng.range(0.15, 0.5), 14),
        x,
        0.296,
        z,
        1,
        rng.range(0.5, 1),
        1,
        -Math.PI / 2,
        rng.range(0, Math.PI),
      );
  }
}

export function buildAtomicCuldesac(A, rng) {
  materials(A, rng);
  registerProps(A, rng);
  const K = kit(A);
  // Sand extends to the atmospheric horizon; only the fenced map is playable.
  K.box("ac-sand", 0, -0.3, 0, 1800, 0.4, 1800, false);
  K.box("ac-grass", 0, 0.045, 0, 46, 0.15, 66, true);
  K.box("ac-road", 0, 0.05, 0, 46, 0.17, 15, true);
  // Faded centre dashes, solid edge lines, and dark tar crack-seams. All sit a
  // few millimetres proud of the asphalt and never collide.
  for (let x = -21; x <= 21; x += 2.7) K.box("ac-line", x, 0.138, 0, 1.35, 0.004, 0.16, false);
  for (const z of [-6.5, 6.5]) K.box("ac-line", 0, 0.138, z, 44, 0.004, 0.13, false);
  for (const z of [-3.4, 3.4]) K.box("ac-tar", 0.4, 0.137, z, 44, 0.004, 0.07, false);
  for (const x of [-13, -4, 6, 16]) K.box("ac-tar", x, 0.137, 0, 0.07, 0.004, 14.4, false);
  for (const z of [-7.6, 7.6]) {
    K.box("ac-concrete", 0, 0.17, z, 46, 0.24, 1.25, true);
    for (let x = -23; x < 23; x += 1.5) K.box("ac-dark", x, 0.298, z, 0.014, 0.004, 1.2, false);
  }
  for (const h of HOUSES) {
    const d = kit(A, h.x, h.z, h.yaw);
    d.box("ac-concrete", -9, 0.16, 8.1, 6, 0.17, 6.3, true);
    d.box("ac-concrete", -3, 0.16, 8, 1.8, 0.17, 6, true);
  }
  const infos = HOUSES.map((h) => house(A, h, rng));
  for (const h of HOUSES) garden(A, h, rng);
  for (const h of HOUSES) furnishHouse(A, rng, h);
  dressYards(A, rng);
  groundCover(A, rng);
  roadWear(A, rng);
  for (const [tx, tz, ts] of [
    [-16, 15, 1.1],
    [15, 15.5, 0.95],
    [-17.5, -15, 1.05],
    [16.5, -14.5, 1.15],
    [-19, 16.5, 0.9],
    [19, -16.5, 1.0],
  ])
    tree(A, tx, tz, rng, ts);
  const vehicle = (id) => VEHICLES.find((v) => v.id === id);
  bus(A, vehicle("bus"));
  truck(A, vehicle("truck"));
  // Parked cars: a realistic CC0 covered car (Poly Haven) when the model set is
  // installed, else the procedural sedan as a fallback. The model's length runs
  // along its local Z, so it is turned a quarter-turn to lie along the bay. A
  // collision box matches the silhouette; the layout OBB is unchanged, so the
  // prop-overlap and entrance-clearance tests still hold.
  A.models = A.models ?? [];
  for (const id of ["car-green", "car-yellow"]) {
    const v = vehicle(id);
    if (A.useModels) {
      A.models.push({
        id: "covered_car",
        x: v.x,
        z: v.z,
        y: -0.05,
        yaw: v.yaw + Math.PI / 2,
        scale: 1,
        far: 140,
      });
      kit(A, v.x, v.z, v.yaw).box(null, 0, 0.6, 0, 4.5, 1.5, 1.9, true);
    } else {
      car(A, v, id === "car-yellow" ? "ac-rust" : "ac-car");
    }
  }
  // Welcome sign and test clock terminate the street vista.
  K.box("ac-white", 14.5, 1.7, -9, 3.65, 2.65, 0.22, true);
  K.art("ac-welcome", 14.5, 1.74, -8.85, 3.35, 2.35);
  for (const x of [12.53, 16.47]) {
    K.box("ac-white", x, 1.4, -9, 0.28, 2.85, 0.32, true);
    K.sphere("ac-white", x, 3, -9, 0.23, 0.23, 0.23);
  }
  for (const x of [-20, 20]) {
    K.box("ac-metal", x, 0.55, 0, 0.25, 1.1, 16, true);
    for (const z of [-6, -2, 2, 6]) K.box("ac-wood", x, 0.5, z, 0.32, 1, 0.3, true);
  }
  for (const x of [-4, 4]) K.line("ac-metal", [x + 28, 0, -9], [28 + x * 0.34, 18, -9], 0.12);
  for (let y = 1; y < 17; y += 2) {
    const w = 4 - y * 0.15;
    K.line("ac-metal", [28 - w, y, -9], [28 + w, y + 2, -9], 0.065);
    K.line("ac-metal", [28 + w, y, -9], [28 - w, y + 2, -9], 0.065);
  }
  K.geo("ac-clock", new THREE.CircleGeometry(2.1, 48), 28, 17.8, -8.9, 1, 1, 1, 0, -Math.PI / 2);
  // Neighboring pastel ranch houses ring the suburb, matching the reference
  // street: pink, pale blue, cream, and a red-and-white ranch with a red garage
  // door. Single-storey, low gabled roofs, stone wainscot, facing inward.
  const ring = [
    [-34, -31, "ac-sky", false],
    [-34, -5, "ac-pink", true],
    [-34, 26, "ac-cream", false],
    [34, -31, "ac-cream", false],
    [34, -5, "ac-red", true],
    [34, 26, "ac-sky", false],
  ];
  for (const [x, z, col, garage] of ring) {
    const fx = x < 0 ? 6 : -6; // inward-facing wall X offset from the centre
    K.box(col, x, 1.95, z, 12, 3.7, 9, false);
    K.box("ac-stone", x + fx * 0.99, 0.55, z, 0.18, 1.05, 9, false); // stone wainscot
    for (const side of [-1, 1])
      K.box("ac-roof", x + side * 3.25, 4.65, z, 6.95, 0.18, 10.4, false, 0, 0, -side * 0.27);
    K.box("ac-roof", x, 5.2, z, 0.34, 0.22, 10.4, false); // ridge
    K.box("ac-white", x + fx, 3.78, z, 0.2, 0.14, 10.2, false); // eave trim band
    K.box("ac-wood", x + fx, 1.2, z + 2.8, 0.1, 2.1, 1.1, false); // door
    for (const dz of [-1.4, -3.2, 3.4])
      K.box("ac-glass", x + fx, 2.2, z + dz, 0.05, 1.3, 1.6, false); // windows
    if (garage) {
      K.box("ac-red", x + fx * 1.01, 1.5, z - 0.9, 0.06, 2.4, 3.4, false); // red garage door
      for (let i = 0; i < 4; i++)
        K.box("ac-dark", x + fx * 1.03, 0.7 + i * 0.6, z - 0.9, 0.02, 0.05, 3.3, false);
    }
  }
  // Low stone gateway walls with ball-topped pillars flank each end of the lane,
  // the reference's cul-de-sac gateposts. The road stays open between the posts.
  for (const s of [-1, 1]) {
    const gx = s * 18.5;
    for (const gz of [-6.2, 6.2]) {
      K.box("ac-stone", gx, 1.05, gz, 0.6, 1.9, 0.6, true);
      K.box("ac-dark", gx, 2.08, gz, 0.72, 0.12, 0.72, false); // cap
      K.sphere("ac-white", gx, 2.34, gz, 0.26, 0.26, 0.26); // ball top
    }
    for (const gz of [-7.5, 7.5]) K.box("ac-stone", gx, 0.6, gz, 0.4, 1.0, 2.6, true); // low wing walls
  }
  for (const { x, z } of POLES) {
    K.cylinder("ac-wood", x, 6, z, 0.14, 12);
    K.box("ac-wood", x, 11.3, z, 3, 0.14, 0.14, false);
    for (const dx of [-1, 0, 1]) K.cylinder("ac-white", x + dx, 11.5, z, 0.075, 0.25);
    // A pole-mounted distribution transformer: a weathered metal can with its
    // bushings and a ground lead, the period utility detail on the skyline.
    const tz = z + 0.42;
    K.cylinder("ac-metal", x + 0.34, 9.6, tz, 0.3, 1.3);
    K.cylinder("ac-dark", x + 0.34, 10.32, tz, 0.26, 0.12);
    for (const bx of [-0.12, 0.12]) K.cylinder("ac-chrome", x + 0.34 + bx, 10.5, tz, 0.03, 0.26);
    K.box("ac-metal", x + 0.12, 9.6, tz, 0.1, 0.5, 0.1, false); // bracket to the pole
    K.line("ac-dark", [x + 0.2, 10.95, z], [x, 11.42, z], 0.012); // service lead up to the crossarm
  }
  for (const x of [-21, 21])
    for (const dx of [-1, 0, 1])
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12,
          t1 = (i + 1) / 12;
        K.line(
          "ac-dark",
          [x + dx, 11.6 - Math.sin(t0 * Math.PI) * 0.9, -16 + t0 * 30],
          [x + dx, 11.6 - Math.sin(t1 * Math.PI) * 0.9, -16 + t1 * 30],
          0.014,
        );
      }
  // Layered desert backdrop. The reference sits a big, rugged brown range CLOSE
  // behind the suburb, filling much of the sky, with paler hazed ridges fading
  // behind it. Three layers: a dominant near range (tall, rocky, warm brown), a
  // mid range, and a far haze range that aerial perspective washes to pale tan.
  // The ranges wrap the full circle so every street and backyard angle looks out
  // onto mountains rather than a flat horizon.
  // With the World Labs skin the panorama's own mesas ring the sky instead
  // (sky dome, world/worldlabs-horizon.ts), so these meshes are skipped. The
  // arguments are still evaluated so the rng stream, and every draw after it,
  // stays the same as the classic build. They are dressing only: no collider.
  const mtn = A.skin ? () => {} : (...args) => K.geo(...args);
  // Far hazed range: broad, tall, washed out by the dusty air.
  for (let i = 0; i < 34; i++) {
    const a = (i * Math.PI) / 17,
      r = 240 + rng.range(0, 140);
    mtn(
      "ac-mtn",
      mesaGeometry(rng),
      Math.sin(a) * r,
      -4,
      Math.cos(a) * r,
      rng.range(90, 180),
      rng.range(55, 110),
      rng.range(90, 170),
    );
  }
  // Dominant near range: big rugged peaks close behind the houses. A mix of
  // peaked rock massifs and the odd flat-topped mesa, overlapping into one
  // continuous ridgeline rather than scattered buttes.
  for (let i = 0; i < 44; i++) {
    const a = (i * Math.PI) / 22 + 0.07,
      r = 104 + rng.range(0, 48),
      mesa = rng.range(0, 1) < 0.3;
    mtn(
      "ac-mtn",
      mesa ? mesaGeometry(rng) : rockGeometry(rng, 1, 4, 0.55),
      Math.sin(a) * r,
      -3,
      Math.cos(a) * r,
      rng.range(62, 104),
      mesa ? rng.range(40, 66) : rng.range(58, 98),
      rng.range(62, 100),
    );
  }
  // Foothills skirting the near range so its base meets the desert floor.
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12 + 0.18,
      r = 92 + rng.range(0, 30);
    mtn(
      "ac-mtn",
      rockGeometry(rng, 1, 3, 0.5),
      Math.sin(a) * r,
      -2,
      Math.cos(a) * r,
      rng.range(34, 60),
      rng.range(16, 34),
      rng.range(30, 52),
    );
  }
  // Boundary collision is independent of dressing, including fence tops.
  for (const x of [MAP_BOUNDS.minX, MAP_BOUNDS.maxX]) A.box("concrete", x, 6, 0, 0.5, 12, 66);
  for (const z of [MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ]) A.box("concrete", 0, 6, z, 46, 12, 0.5);
  return infos;
}
