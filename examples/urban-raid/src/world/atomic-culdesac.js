import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { newTrs, rockGeometry } from "./util.js";
import { registerProps } from "./props.js";
import { furnishRoom } from "./interiors.js";
import { windowUnit, doorUnit } from "./kit.js";
import { loadPbrSet } from "../materials/textures.js";
import {
  HOUSES,
  FLOOR_HEIGHT,
  MAP_BOUNDS,
  VEHICLES,
  POLES,
  GARDEN_FENCES,
  GARDEN_MANNEQUINS,
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
  const surface = (key, color, kind, roughness = 0.8, metalness = 0) => {
    const tint = new THREE.Color(color).getHex();
    let name, surf, opts;
    switch (kind) {
      case "wood": {
        // Painted clapboard reads as vivid pastel only over a light base, so
        // the house colours tint plaster (the lap grooves are modelled
        // geometry); bare timber keeps the wood grain. Weathering stays light.
        const painted = ["ac-green", "ac-yellow", "ac-white", "ac-blue", "ac-cream"].includes(key);
        if (painted) {
          // Clean painted clapboard: a light base, minimal weathering, and a
          // flattened macro/patch so the colour reads as a uniform vivid pastel
          // rather than a mottled, grimed wash.
          name = "plaster";
          surf = "wood";
          opts = {
            tint,
            scale: 1.7,
            normalStrength: 0.45,
            weather: [0.08, 0.05, 0.08, 0.2],
            macro: [0.05, 0.16, 0.07, 0.25],
            macroBig: [1.6, 0.06, 0.03, 0],
            patch: [0.08, 2.0, 0.07, -0.04],
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
    return A.registerMaterial(key, A.materials.get(name, opts), surf);
  };
  surface("ac-green", "#c6f06a", "wood");
  surface("ac-yellow", "#ffe238", "wood");
  surface("ac-white", "#f4efe2", "wood");
  surface("ac-blue", "#3a93a6", "wood");
  surface("ac-wood", "#8e6b47", "wood");
  surface("ac-fence", "#b6a17a", "wood");
  surface("ac-roof", "#606560", "roof");
  surface("ac-stone", "#817461", "stone");
  surface("ac-road", "#514b42", "road");
  surface("ac-line", "#cfc8b0", "concrete");
  surface("ac-tar", "#1c1f1d", "road");
  surface("ac-concrete", "#bdb9aa", "concrete");
  surface("ac-grass", "#5f8236", "grass");
  surface("ac-hedge", "#4a6529", "grass");
  surface("ac-sand", "#bfa780", "sand");
  surface("ac-cream", "#ded3b7", "wood");
  surface("ac-rust", "#914e3e", "metal", 0.53, 0.35);
  surface("ac-bus", "#ffc21e", "metal", 0.4, 0.35);
  surface("ac-red", "#a73e35", "metal", 0.4, 0.35);
  surface("ac-car", "#90a64d", "metal", 0.35, 0.4);
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
  surface("ac-curtain", "#397887", "fabric");
  surface("ac-plaster", "#d7d1bc", "plaster");
  surface("ac-enamel", "#ebe7d4", "metal", 0.28, 0.05);
  surface("ac-orange", "#b5733f", "fabric");
  surface("ac-sofa", "#809263", "fabric");
  enhancePbr(A);
  A.registerMaterial(
    "ac-glass",
    A.materials.get("glass", {
      scale: 2.0,
      roughness: [0.28, 0.05, 0.03],
      three: { opacity: 0.22, envMapIntensity: 1.8 },
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
    const geo = A.cache(`ac-box:${w}:${h}:${d}`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv,
        normals = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(normals.getX(i)),
          ny = Math.abs(normals.getY(i));
        uv.setXY(i, uv.getX(i) * (nx > 0.5 ? d : w), uv.getY(i) * (ny > 0.5 ? d : h));
      }
      return g;
    });
    const m = matrix(x, y, z, rx, ry, rz);
    if (key) A.add(key, geo, m);
    if (collide) A.collideGeo(key ? A.surfaceOf(key) : "concrete", geo, m);
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
  const line = (key, a, b, r = 0.03) => {
    const p = new THREE.Vector3(...a),
      q = new THREE.Vector3(...b),
      v = q.clone().sub(p);
    const g = A.cache("ac-rod", () => new THREE.CylinderGeometry(1, 1, 1, 8));
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
  for (let i = 0; i <= length / 0.24; i++) {
    const t = i / Math.floor(length / 0.24),
      x = x0 + (x1 - x0) * t,
      z = z0 + (z1 - z0) * t;
    K.box(key, x, height / 2 + 0.15, z, 0.18, height, 0.12, false, 0, yaw);
    if (picket) K.box(key, x, height + 0.16, z, 0.127, 0.127, 0.12, false, 0, yaw, Math.PI / 4);
  }
  for (let i = 0; i <= length / 2.4; i++) {
    const t = i / Math.max(1, Math.floor(length / 2.4));
    K.box(
      key,
      x0 + (x1 - x0) * t,
      height / 2 + 0.12,
      z0 + (z1 - z0) * t,
      0.17,
      height + 0.24,
      0.17,
      false,
    );
  }
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

function mannequin(K, x, z, y = 0.16, ry = 0, female = false) {
  // Painted showroom mannequins: defined faces, fitted period clothes and joint seams.
  const c = Math.cos(ry),
    s = Math.sin(ry),
    point = (px, py, pz) => [x + c * px + s * pz, y + py, z - s * px + c * pz];
  const ball = (key, px, py, pz, sx, sy, sz) =>
    K.geo(key, new THREE.SphereGeometry(1, 24, 16), ...point(px, py, pz), sx, sy, sz, 0, ry);
  const line = (key, a, b, r) => K.line(key, point(...a), point(...b), r);
  const block = (key, px, py, pz, w, h, d, r = 0.02) =>
    K.round(key, ...point(px, py, pz), w, h, d, r, false, 0, ry);
  const shirt = female ? "ac-orange" : "ac-shirt";
  ball("ac-skin", 0, 1.64, 0, 0.112, 0.15, 0.105);
  ball("ac-skin", 0, 1.56, 0.038, 0.087, 0.073, 0.075);
  ball("ac-hair", 0, 1.7, -0.032, 0.119, 0.105, 0.097);
  if (female) {
    ball("ac-hair", 0, 1.59, -0.075, 0.13, 0.14, 0.075);
    for (const side of [-1, 1]) ball("ac-hair", side * 0.09, 1.62, -0.02, 0.055, 0.095, 0.071);
  } else {
    block("ac-hair", 0.063, 1.685, 0.07, 0.08, 0.065, 0.055, 0.02);
    ball("ac-hair", -0.024, 1.73, 0.025, 0.107, 0.053, 0.085);
  }
  ball("ac-skin", 0, 1.62, 0.112, 0.022, 0.047, 0.03);
  for (const side of [-1, 1]) {
    ball("ac-skin", side * 0.112, 1.63, 0, 0.022, 0.034, 0.02);
    ball("ac-enamel", side * 0.042, 1.659, 0.09, 0.026, 0.011, 0.015);
    ball("ac-dark", side * 0.042, 1.659, 0.103, 0.01, 0.009, 0.003);
    block("ac-hair", side * 0.044, 1.677, 0.103, 0.043, 0.008, 0.004, 0.002);
  }
  ball(female ? "ac-lips" : "ac-skin", 0, 1.571, 0.105, 0.035, 0.009, 0.007);
  line("ac-dark", [-0.025, 1.565, 0.109], [0.025, 1.565, 0.109], 0.002);
  line("ac-skin", [0, 1.42, 0], [0, 1.53, 0], 0.049);
  ball(shirt, 0, 1.204, 0, female ? 0.185 : 0.221, 0.249, 0.128);
  ball(shirt, 0, 1.356, 0, female ? 0.194 : 0.25, 0.101, 0.132);
  block(shirt, 0, 1.01, 0, female ? 0.28 : 0.35, 0.18, 0.226, 0.05);
  if (female) {
    K.geo(
      shirt,
      new THREE.CylinderGeometry(0.143, 0.29, 0.55, 32, 6),
      ...point(0, 0.765, 0),
      1,
      1,
      0.85,
      0,
      ry,
    );
    for (let i = 0; i < 18; i++) {
      const a = (i * Math.PI) / 9;
      line(
        "ac-rust",
        [Math.sin(a) * 0.152, 1.02, Math.cos(a) * 0.131],
        [Math.sin(a) * 0.285, 0.505, Math.cos(a) * 0.24],
        0.004,
      );
    }
    block("ac-dark", 0, 1.03, 0, 0.295, 0.025, 0.24, 0.015);
  } else {
    block("ac-trousers", 0, 0.9, 0, 0.35, 0.22, 0.235, 0.07);
    block("ac-dark", 0, 1.02, 0.005, 0.36, 0.04, 0.25, 0.015);
    block("ac-chrome", 0, 1.02, 0.14, 0.05, 0.038, 0.012, 0.005);
    for (const side of [-1, 1]) {
      line("ac-trousers", [side * 0.097, 0.89, 0], [side * 0.12, 0.48, 0.017], 0.086);
      line("ac-trousers", [side * 0.12, 0.48, 0.017], [side * 0.127, 0.13, 0.018], 0.068);
      line("ac-dark", [side * 0.12, 0.83, 0.084], [side * 0.13, 0.15, 0.08], 0.003);
    }
  }
  for (const side of [-1, 1]) {
    if (female) {
      line("ac-skin", [side * 0.105, 0.58, 0], [side * 0.11, 0.13, 0.022], 0.05);
      ball("ac-skin", side * 0.11, 0.48, 0.01, 0.055, 0.065, 0.052);
    }
    block("ac-dark", side * 0.12, 0.076, 0.065, 0.15, 0.1, 0.29, 0.045);
    const shoulder = [side * (female ? 0.183 : 0.228), 1.34, 0],
      elbow = [side * 0.255, 1.055, 0.007],
      wrist = [side * 0.27, 0.86, 0.072];
    line(shirt, shoulder, [side * 0.246, 1.16, 0.005], female ? 0.058 : 0.071);
    line("ac-skin", [side * 0.247, 1.16, 0.005], elbow, 0.052);
    ball("ac-skin", ...elbow, 0.051, 0.059, 0.052);
    line("ac-skin", elbow, wrist, 0.045);
    ball("ac-skin", side * 0.27, 0.819, 0.072, 0.041, 0.069, 0.021);
    for (let finger = 0; finger < 4; finger++)
      line(
        "ac-skin",
        [side * 0.27 + (finger - 1.5) * 0.016, 0.806, 0.082],
        [side * 0.27 + (finger - 1.5) * 0.016, 0.765, 0.096],
        0.008,
      );
    line("ac-dark", [side * 0.22, 1.345, 0.01], [side * 0.235, 1.305, 0.05], 0.0025);
    // Shirt collar and front placket.
    line("ac-enamel", [side * 0.05, 1.421, 0.085], [side * 0.084, 1.363, 0.125], 0.023);
  }
  for (let h = 1.08; h < 1.35; h += 0.075) ball("ac-dark", 0, h, 0.128, 0.005, 0.005, 0.003);
  K.box(null, x, y + 0.9, z, 0.38, 1.8, 0.26, true);
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
  mannequin(K, 4, -2, 0.2, 0, true);
  mannequin(K, -1.9, 3.8, y + 0.17, Math.PI);
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
  const shutterKey = spec.id === "green" ? "metal_blue" : "metal_green";
  windowUnit(A, pm, { x: -1.6, y: 1.05 + 1.65 / 2, w: 3.0, h: 1.52 }, rng, {
    t: 0.24,
    state: "glazed",
    back: false,
    frameKey: "wood_dark",
    curtain: true,
  });
  windowUnit(A, pm, { x: 0, y: y + 0.85 + 1.85 / 2, w: 3.2, h: 1.7 }, rng, {
    t: 0.24,
    state: "glazed",
    back: false,
    frameKey: "wood_dark",
    shutters: true,
    shutterKey,
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
  K.box("ac-concrete", 0, 0, 0, 12.4, 0.32, 10.4, true);
  wall(K, key, 0, 5, 12, 6.24, [
    { x: -3.1, y: 0.16, w: 1.6, h: 2.35 },
    win(1.6, 1.05, 3.2, 1.65),
    win(0, y + 0.85, 3.4, 1.85),
  ]);
  wall(
    K,
    key,
    0,
    -5,
    12,
    6.24,
    [
      { x: -0.8, y: 0.16, w: 1.6, h: 2.35 },
      { x: -3.2, y: y + 0.16, w: 1.5, h: 2.25 },
      win(3, 1.3, 2.2, 1.25),
    ],
    Math.PI,
  );
  wall(
    K,
    key,
    -6,
    0,
    10,
    6.24,
    [{ x: -0.2, y: 0.16, w: 1.7, h: 2.3 }, win(2.6, y + 1.1, 1.6, 1.5)],
    Math.PI / 2,
  );
  wall(K, key, 6, 0, 10, 6.24, [win(-2, 1.1, 2, 1.5), win(2, y + 1.1, 2, 1.5)], Math.PI / 2);
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
        K.box(key, m, sy, 5.145, b - a, 0.032, 0.045, false);
    }
  }
  for (const x of [-6.1, 6.1])
    for (const z of [-5.1, 5.1]) K.box("ac-white", x, 3.25, z, 0.15, 6.3, 0.15, false);
  K.box("ac-white", 0, y, 5.18, 12.5, 0.28, 0.24, false);
  K.box("ac-white", 0, 6.33, 5.15, 12.6, 0.24, 0.3, false);
  for (const x of [-2.25, 2.25]) {
    K.box(spec.id === "green" ? "ac-blue" : "ac-orange", x, y + 1.8, 5.22, 0.68, 2.1, 0.09, false);
    for (let i = 0; i < 14; i++)
      K.box("ac-wood", x, y + 0.86 + i * 0.14, 5.28, 0.59, 0.028, 0.035, false);
  }
  // Sills under the two front windows, and shutters flanking the ground window.
  K.box("ac-white", 1.6, 0.22, 5.24, 3.5, 0.08, 0.2, false);
  K.box("ac-white", 0, y + 0.02, 5.24, 3.7, 0.08, 0.2, false);
  for (const sx of [-0.2, 3.4]) {
    K.box(spec.id === "green" ? "ac-blue" : "ac-orange", sx, 1.05, 5.22, 0.5, 1.6, 0.08, false);
    for (let i = 0; i < 11; i++)
      K.box("ac-wood", sx, 0.4 + i * 0.14, 5.28, 0.42, 0.028, 0.035, false);
  }
  // Front porch over the door: posts, a shed roof, fascia, and stone steps.
  for (const px of [-3.95, -2.25]) {
    K.round("ac-white", px, 1.35, 6.0, 0.16, 2.4, 0.16, 0.04, true);
    K.round("ac-white", px, 2.57, 6.0, 0.22, 0.12, 0.22, 0.03, false);
  }
  K.box("ac-roof", -3.1, 2.74, 6.0, 2.4, 0.12, 2.0, false, 0, 0, 0.08);
  K.box("ac-white", -3.1, 2.64, 6.98, 2.4, 0.18, 0.1, false);
  K.box("ac-white", -3.1, 2.5, 6.0, 2.3, 0.12, 0.1, false, 0, 0, 0.08);
  for (let i = 0; i < 3; i++)
    K.box("ac-stone", -3.1, 0.13 - i * 0.04, 5.55 + i * 0.3, 2.4 - i * 0.2, 0.14, 0.32, true);
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
      K.geo(key, new THREE.ShapeGeometry(shape), 0, 6.4, z, 1, 1, 1, 0, z < 0 ? Math.PI : 0);
    }
    for (const s of [-1, 1]) {
      K.box("ac-white", s * 6.75, 6.28, 0, 0.12, 0.34, 11.9, false); // eave fascia
      for (const z of [-5.95, 5.95])
        K.box("ac-white", s * 3.45, 7.2, z, len, 0.14, 0.14, false, 0, 0, -s * angle); // rake
    }
  } else {
    const rise = 1.55,
      half = 5,
      angle = Math.atan2(rise, half),
      len = Math.hypot(half, rise) + 0.4;
    for (const s of [-1, 1])
      K.box("ac-roof", 0, 7.0, s * 2.5, 13.9, 0.17, len, false, s * angle, 0, 0);
    K.box("ac-roof", 0, 7.78, 0, 13.9, 0.22, 0.34, false);
    for (const x of [-6, 6]) {
      const shape = new THREE.Shape();
      shape.moveTo(-5, 0);
      shape.lineTo(5, 0);
      shape.lineTo(0, 1.55);
      shape.closePath();
      K.geo(
        key,
        new THREE.ShapeGeometry(shape),
        x,
        6.23,
        0,
        1,
        1,
        1,
        0,
        x < 0 ? -Math.PI / 2 : Math.PI / 2,
      );
    }
    for (const s of [-1, 1]) {
      K.box("ac-white", 0, 6.13, s * 5.3, 13.9, 0.34, 0.12, false); // eave fascia
      for (const x of [-6.95, 6.95])
        K.box("ac-white", x, 7.05, s * 2.5, 0.14, 0.14, len, false, s * angle, 0, 0); // rake
    }
  }
  K.box("ac-stone", -4.55, 4.1, 4.9, 1.9, 8.2, 0.85, true);
  K.box("ac-dark", -4.55, 8.29, 4.9, 2.18, 0.18, 1.06, false);
  for (const x of [-5.3, -3.8]) K.box("ac-metal", x, 8.52, 4.9, 0.045, 0.45, 0.85, false);
  K.box("ac-metal", -4.55, 8.76, 4.9, 2.13, 0.06, 1, false);
  // Attached garage with front and rear access.
  K.box("ac-concrete", -9, 0, 1, 6.2, 0.32, 8.2, true);
  wall(K, key, -9, 5, 6, 2.9, [{ x: 0, y: 0.16, w: 4.65, h: 2.55 }]);
  wall(K, key, -12, 1, 8, 2.9, [], Math.PI / 2);
  wall(K, key, -9, -3, 6, 2.9, [{ x: 1.6, y: 0.16, w: 1.5, h: 2.4 }], Math.PI);
  for (const s of [-1, 1])
    K.box("ac-roof", -9 + s * 1.7, 3.6, 1, 3.65, 0.15, 8.7, false, 0, 0, -s * 0.32);
  K.box("ac-blue", -9, 2.77, 4.8, 4.6, 0.25, 0.9, false);
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

function wheels(K, xs, z, radius = 0.52) {
  for (const x of xs)
    for (const s of [-1, 1]) {
      K.cylinder("ac-rubber", x, radius + 0.08, z + s * 1.28, radius, 0.3, Math.PI / 2);
      K.cylinder("ac-chrome", x, radius + 0.08, z + s * 1.46, radius * 0.52, 0.035, Math.PI / 2);
      K.cylinder("ac-dark", x, radius + 0.08, z + s * 1.485, radius * 0.25, 0.04, Math.PI / 2);
    }
}
function bus(A, box) {
  // Parked at an angle across the middle of the street, the way the central bus
  // blocks sightlines and gives cover in the cul-de-sac.
  const K = kit(A, box.x, box.z, box.yaw);
  K.box("ac-dark", 0, 0.77, 0, 11.3, 0.5, 2.5, true);
  K.round("ac-bus", 0, 1.35, 0, 11.1, 0.95, 2.62, 0.22, true);
  K.round("ac-bus", 0.7, 2.86, 0, 9.7, 0.3, 2.72, 0.3, true);
  K.round("ac-bus", -4.8, 1.64, 0, 1.4, 0.46, 2.55, 0.2, true);
  // Rounded wheel arches over each wheel.
  for (const x of [-3.7, 3.7])
    for (const s of [-1, 1]) K.round("ac-dark", x, 0.78, s * 1.25, 1.3, 0.6, 0.2, 0.18, false);
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
  for (const z of [-1, 1]) {
    K.sphere("ac-bulb", -5.61, 1.57, z, 0.055, 0.17, 0.17);
    K.sphere("ac-red", 5.59, 1.5, z, 0.04, 0.12, 0.12);
  }
  K.art("ac-bus-sign", -3.94, 2.85, 0, 2.2, 0.3, -Math.PI / 2);
  wheels(K, [-3.7, 3.7], 0);
}

function truck(A, box) {
  const K = kit(A, box.x, box.z, box.yaw);
  K.box("ac-dark", 0, 0.85, 0, 13.5, 0.35, 2.4, true);
  K.round("ac-red", -5.5, 1.43, 0, 2.3, 1.2, 2.55, 0.18, true);
  K.round("ac-red", -5.1, 2.49, 0, 2.2, 0.95, 2.5, 0.22, true);
  K.round("ac-red", -5.1, 3.03, 0, 2.4, 0.18, 2.65, 0.1, false);
  K.box("ac-glass", -6.23, 2.58, 0, 0.025, 0.65, 2.24, false);
  for (const z of [-1.28, 1.28]) {
    K.box("ac-glass", -5.45, 2.56, z, 1.22, 0.65, 0.025, false);
    K.box("ac-chrome", -5.1, 1.89, z * 1.04, 0.24, 0.045, 0.05, false);
    K.cylinder("ac-chrome", -3.95, 2.15, z, 0.09, 2.9);
  }
  K.box("ac-chrome", -6.7, 1.37, 0, 0.16, 1.05, 1.15, false);
  for (let z = -0.52; z < 0.58; z += 0.12) K.box("ac-dark", -6.8, 1.4, z, 0.035, 0.85, 0.05, false);
  K.box("ac-chrome", -6.91, 0.75, 0, 0.18, 0.29, 2.82, false);
  for (const z of [-1, 1]) K.sphere("ac-bulb", -6.77, 1.57, z, 0.08, 0.19, 0.19);
  // Open moving trailer: the lateral gap is a playable passage.
  K.box("ac-wood", 1.9, 1.02, 0, 8.85, 0.2, 2.75, true);
  K.box("ac-white", 1.9, 3.73, 0, 9, 0.15, 2.95, true);
  K.box("ac-white", 6.35, 2.4, 0, 0.14, 2.65, 2.85, true);
  K.box("ac-white", -2.55, 2.4, 0, 0.14, 2.65, 2.85, true);
  for (const s of [-1, 1]) {
    K.box("ac-white", 0.45, 2.38, s * 1.44, 6, 2.58, 0.08, true);
    K.art("ac-moving", 0.45, 2.4, s * 1.49, 5.8, 2.5, s < 0 ? Math.PI : 0);
    for (let x = -2.5; x < 3.4; x += 0.25)
      K.box("ac-chrome", x, 2.4, s * 1.51, 0.016, 2.5, 0.016, false);
    // Ramps at the open rear third of the trailer.
    K.box("ac-wood", 4.85, 0.6, s * 2.1, 2.35, 0.12, 1.7, true, s * 0.5);
  }
  K.box("ac-wood", -1.7, 1.75, 0, 1.3, 1.3, 1.7, true);
  K.round("ac-sofa", 1.2, 1.6, 0, 1.2, 1, 1.9, 0.1, true);
  wheels(K, [-5.2, -2.9, 4.2, 5.6], 0, 0.58);
}

function car(A, box, color = "ac-car") {
  const K = kit(A, box.x, box.z, box.yaw);
  const trim = "ac-chrome",
    glass = "ac-glass",
    tire = "ac-rubber";
  // Rounded body with a waistline, sloping hood and trunk, and a domed cabin.
  K.round(color, 0, 0.66, 0, 4.7, 0.5, 1.95, 0.26, true);
  K.round(color, 0.1, 0.96, 0, 3.1, 0.34, 1.9, 0.3, true);
  K.round(color, 1.5, 1.0, 0, 1.5, 0.22, 1.82, 0.18, false, 0, 0, -0.07);
  K.round(color, -1.55, 1.02, 0, 1.25, 0.2, 1.82, 0.18, false, 0, 0, 0.06);
  K.round(color, -0.15, 1.42, 0, 2.1, 0.5, 1.64, 0.3, true);
  K.round(color, -0.2, 1.68, 0, 1.85, 0.16, 1.5, 0.34, false);
  // Tinted glass: windshield, backlight, side windows.
  K.box(glass, 0.95, 1.46, 0, 0.05, 0.42, 1.46, false, 0, 0, 0.42);
  K.box(glass, -1.18, 1.47, 0, 0.05, 0.4, 1.46, false, 0, 0, -0.38);
  for (const s of [-1, 1]) K.box(glass, -0.15, 1.5, s * 0.8, 1.9, 0.42, 0.04, false);
  // Fenders over each wheel.
  for (const xx of [1.5, -1.5])
    for (const s of [-1, 1]) K.round(color, xx, 0.62, s * 0.9, 1.35, 0.5, 0.34, 0.24, false);
  // Chrome bumpers with overriders, grille, side spear.
  for (const xx of [2.42, -2.42]) {
    K.cylinder(trim, xx, 0.6, 0, 0.1, 2.0, Math.PI / 2);
    for (const s of [-1, 1]) K.round(trim, xx, 0.64, s * 0.52, 0.16, 0.36, 0.17, 0.05, false);
  }
  for (let z = -0.5; z <= 0.5; z += 0.13) K.box(trim, 2.44, 0.8, z, 0.08, 0.34, 0.05, false);
  for (const s of [-1, 1]) K.box(trim, 0, 0.84, s * 0.99, 4.0, 0.05, 0.03, false);
  // Headlights, tail lights.
  for (const s of [-1, 1]) {
    K.cylinder(trim, 2.42, 0.93, s * 0.66, 0.15, 0.12, 0, Math.PI / 2);
    K.sphere("ac-bulb", 2.48, 0.93, s * 0.66, 0.11, 0.11, 0.08);
    K.sphere("ac-red", -2.44, 0.93, s * 0.62, 0.06, 0.15, 0.1);
  }
  // Whitewall wheels with chrome hubcaps.
  for (const xx of [1.5, -1.5])
    for (const zz of [-0.96, 0.96]) {
      K.cylinder(tire, xx, 0.45, zz, 0.42, 0.26, Math.PI / 2);
      K.cylinder("ac-white", xx, 0.45, zz * 1.03, 0.31, 0.27, Math.PI / 2);
      K.cylinder(trim, xx, 0.45, zz * 1.1, 0.2, 0.06, Math.PI / 2);
      K.sphere("ac-dark", xx, 0.45, zz * 1.16, 0.05, 0.05, 0.05);
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
      K.sphere("ac-hedge", x, 0.75, z, 0.75, 0.6, 0.8);
      K.box("ac-stone", x, 0.28, z, 1.7, 0.3, 1.7, true);
    }
  for (let i = 0; i < 85; i++) {
    const x = rng.range(1, 11),
      z = rng.range(6, 8);
    K.sphere(i % 3 ? "ac-hedge" : "ac-orange", x, 0.28, z, 0.1, 0.12, 0.1);
  }
  for (const m of GARDEN_MANNEQUINS) mannequin(K, m.x, m.z, 0.18, 0, m.female);
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
    ["ac-stone", "bricks", {}],
  ];
  for (const [key, name, opts] of jobs) {
    const mat = A.mat(key);
    if (!mat) continue;
    loadPbrSet(name, "/assets/pbr", opts)
      .then((set) => {
        if (!set) return;
        mat.map = set.albedo;
        if (set.normal) mat.normalMap = set.normal;
        mat.roughnessMap = set.orm;
        mat.needsUpdate = true;
      })
      .catch(() => {});
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
  const vehicle = (id) => VEHICLES.find((v) => v.id === id);
  bus(A, vehicle("bus"));
  truck(A, vehicle("truck"));
  car(A, vehicle("car-green"));
  car(A, vehicle("car-yellow"), "ac-rust");
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
  // Neighboring houses and utility poles give the playable suburb a larger setting.
  for (const s of [-1, 1])
    for (const z of [-31, -5, 26]) {
      const x = s * 34;
      K.box(z < 0 ? "ac-green" : "ac-rust", x, 2, z, 12, 4, 9, false);
      for (const dx of [-3.3, 3.3]) K.box("ac-glass", x + dx, 2.5, z + 4.52, 2.1, 1.5, 0.04, false);
      for (const side of [-1, 1])
        K.box("ac-roof", x + side * 3.2, 4.8, z, 6.7, 0.18, 10, false, 0, 0, -side * 0.26);
    }
  for (const { x, z } of POLES) {
    K.cylinder("ac-wood", x, 6, z, 0.14, 12);
    K.box("ac-wood", x, 11.3, z, 3, 0.14, 0.14, false);
    for (const dx of [-1, 0, 1]) K.cylinder("ac-white", x + dx, 11.5, z, 0.075, 0.25);
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
  // Layered desert mountains: a taller far range and a nearer ridge for depth,
  // read against the sky's atmospheric haze.
  for (let i = 0; i < 30; i++) {
    const a = (i * Math.PI) / 15,
      r = 170 + rng.range(0, 90);
    K.geo(
      "ac-sand",
      rockGeometry(rng, 1, 3, 0.5),
      Math.sin(a) * r,
      -3,
      Math.cos(a) * r,
      rng.range(40, 85),
      rng.range(34, 72),
      rng.range(34, 66),
    );
  }
  for (let i = 0; i < 26; i++) {
    const a = (i * Math.PI) / 13 + 0.12,
      r = 95 + rng.range(0, 45);
    K.geo(
      "ac-sand",
      rockGeometry(rng, 1, 3, 0.5),
      Math.sin(a) * r,
      -2,
      Math.cos(a) * r,
      rng.range(26, 50),
      rng.range(14, 30),
      rng.range(22, 40),
    );
  }
  // Boundary collision is independent of dressing, including fence tops.
  for (const x of [MAP_BOUNDS.minX, MAP_BOUNDS.maxX]) A.box("concrete", x, 6, 0, 0.5, 12, 66);
  for (const z of [MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ]) A.box("concrete", 0, 6, z, 46, 12, 0.5);
  return infos;
}
