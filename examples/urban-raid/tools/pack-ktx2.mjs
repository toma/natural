// Offline: pack each fetched CC0 PBR set into the engine's three-texture layout
// and encode them to KTX2 (Basis UASTC + Zstd) for a smaller, GPU-ready set.
//
// KTX2 textures are GPU-compressed and cannot be read back to pack channels at
// runtime, so the packing that textures.js does on the fly for JPGs is done
// here instead: map = albedo.rgb + height.a, orm = ao.r + roughness.g, normal.
//
// Requires ffmpeg (to decode the source JPGs) and toktx from KTX-Software
// (https://github.com/KhronosGroup/KTX-Software/releases). Point at a specific
// binary with TOKTX=/path/to/toktx; otherwise `toktx` on PATH is used.
//
// Usage (from examples/urban-raid): bun tools/pack-ktx2.mjs

import { mkdir, rm, readdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbrDir = join(root, "assets", "pbr");
const outDir = join(root, "assets", "ktx2");
const basisDir = join(root, "assets", "basis");
const toktx = process.env.TOKTX ?? "toktx";

// Per-surface tuning, baked in here so a KTX2 set matches what textures.js does
// to the JPG set at runtime (see enhancePbr in world/atomic-culdesac.js).
const TUNING = {
  asphalt: { roughnessFloor: 0.82, desaturate: 0.5, warm: [1.08, 1.0, 0.88] },
  concrete: { roughnessFloor: 0.7 },
  metal: { roughnessFloor: 0.3 },
};

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

function jpgToPng(src, dst) {
  sh("ffmpeg", ["-y", "-loglevel", "error", "-i", src, dst]);
  return PNG.sync.read(readFileSync(dst));
}

function encode(png, dst, linear) {
  const tmp = dst.replace(/\.ktx2$/, ".png");
  writeFileSync(tmp, PNG.sync.write(png));
  sh(toktx, [
    "--encode",
    "uastc",
    "--zcmp",
    "18",
    "--assign_oetf",
    linear ? "linear" : "srgb",
    "--genmipmap",
    dst,
    tmp,
  ]);
  spawnSync("rm", ["-f", tmp]);
}

async function packSet(name) {
  const dir = join(pbrDir, name);
  if (!existsSync(join(dir, "albedo.jpg"))) return;
  const out = join(outDir, name);
  await mkdir(out, { recursive: true });
  const tmp = join(out, "_tmp");
  await mkdir(tmp, { recursive: true });

  const albedo = jpgToPng(join(dir, "albedo.jpg"), join(tmp, "a.png"));
  const w = albedo.width;
  const h = albedo.height;
  const read = (f) =>
    existsSync(join(dir, f)) ? jpgToPng(join(dir, f), join(tmp, f + ".png")) : null;
  const height = read("height.jpg");
  const rough = read("roughness.jpg");
  const ao = read("ao.jpg");
  const normal = read("normal.jpg");

  const tune = TUNING[name] ?? {};
  const desat = tune.desaturate ?? 0;
  const warm = tune.warm ?? null;
  const floor = Math.round((tune.roughnessFloor ?? 0) * 255);

  // map = albedo.rgb (optionally desaturated/warmed) + height.a
  for (let i = 0; i < w * h; i++) {
    let r = albedo.data[i * 4];
    let g = albedo.data[i * 4 + 1];
    let b = albedo.data[i * 4 + 2];
    if (desat > 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r += (lum - r) * desat;
      g += (lum - g) * desat;
      b += (lum - b) * desat;
    }
    if (warm) {
      r *= warm[0];
      g *= warm[1];
      b *= warm[2];
    }
    albedo.data[i * 4] = Math.min(255, r);
    albedo.data[i * 4 + 1] = Math.min(255, g);
    albedo.data[i * 4 + 2] = Math.min(255, b);
    albedo.data[i * 4 + 3] = height ? height.data[i * 4] : 255;
  }
  encode(albedo, join(out, "map.ktx2"), false);

  // orm = ao.r, roughness.g (floored), metalness 0
  const orm = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    orm.data[i * 4] = ao ? ao.data[i * 4] : 255;
    orm.data[i * 4 + 1] = Math.max(floor, rough ? rough.data[i * 4 + 1] : 205);
    orm.data[i * 4 + 2] = 0;
    orm.data[i * 4 + 3] = 255;
  }
  encode(orm, join(out, "orm.ktx2"), true);

  if (normal) encode(normal, join(out, "normal.ktx2"), true);

  await rm(tmp, { recursive: true, force: true });
  process.stdout.write(`${name}: packed\n`);
}

async function main() {
  if (spawnSync(toktx, ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("toktx not found. Install KTX-Software or set TOKTX=/path/to/toktx.");
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });
  for (const name of await readdir(pbrDir)) {
    try {
      await packSet(name);
    } catch (err) {
      console.error(`${name}: ${err.message}`);
    }
  }
  // Serve the Basis transcoder KTX2Loader needs next to the sets.
  const src = join(root, "node_modules", "three", "examples", "jsm", "libs", "basis");
  await mkdir(basisDir, { recursive: true });
  for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
    await cp(join(src, f), join(basisDir, f));
  }
  console.info("KTX2 sets ready under assets/ktx2/ (transcoder in assets/basis/).");
}

await main();
