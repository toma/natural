// Fetch the optional CC0 art set for NaturalFPS.
//
// Everything here is CC0 1.0 (public domain). The assets are not committed to
// git; this script downloads them into assets/ on demand so the repository
// stays small. Provenance and licensing are documented in assets/ASSETS.md.
//
// Usage (from examples/urban-raid):
//   bun run assets            full 2K maps
//   bun run assets --size=1k  downscale to 1K with ffmpeg if it is installed
//
// The demo treats the result as a progressive enhancement: a missing set falls
// back to the procedural material for that surface, so no network is required
// to build, test, or run.

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile, rename, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbrDir = join(root, "assets", "pbr");

// The ambientCG map suffixes mapped to the engine's channel names. Color is the
// albedo, NormalGL is the OpenGL-convention tangent normal, and Displacement is
// the height the parallax path reads from the albedo alpha.
const MAPS = {
  Color: "albedo",
  NormalGL: "normal",
  Roughness: "roughness",
  AmbientOcclusion: "ao",
  Displacement: "height",
};

// CC0 1.0, ambientCG, by Lennart Demes. sha256 pins the 2K-JPG zip so a silent
// re-bake upstream is noticed; a mismatch warns rather than failing so the set
// still installs.
const TEXTURES = [
  {
    name: "asphalt",
    id: "Asphalt026C",
    sha256: "957e37e07fa7631c4172fadb2445c0a75ac39b80595b9b7813e81ee0e121eebb",
  },
  {
    name: "grass",
    id: "Grass004",
    sha256: "d7d3f08e8bb1e59aed0c3dbb85ea0b46d5308481f89b6a3fd62c0ec9e862245b",
  },
  {
    name: "concrete",
    id: "Concrete034",
    sha256: "fafd7cd3aee2b703abbb12b7810ef565ab76ac7ea3b1ea9a73b088e423e670b3",
  },
  {
    name: "bricks",
    id: "Bricks094",
    sha256: "51be701039d6d2bd609744fb1d715b8c6df2fe2f42db167d20c840b47f5a954b",
  },
];

const sizeArg = process.argv.find((a) => a.startsWith("--size="));
const targetWidth = sizeArg === "--size=1k" ? 1024 : 0;
const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

async function fetchTexture(t) {
  const dir = join(pbrDir, t.name);
  await mkdir(dir, { recursive: true });
  const url = `https://ambientcg.com/get?file=${t.id}_2K-JPG.zip`;
  process.stdout.write(`${t.name} (${t.id}): downloading... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (t.sha256 && got !== t.sha256) {
    process.stdout.write(
      `checksum changed (expected ${t.sha256.slice(0, 12)}, got ${got.slice(0, 12)}) `,
    );
  }
  const zipPath = join(dir, "_set.zip");
  await writeFile(zipPath, buf);
  // Extract each map on its own so a set that omits one (some have no AO) does
  // not abort the rest; unzip returns non-zero when a member is absent.
  for (const m of Object.keys(MAPS)) {
    spawnSync("unzip", ["-o", "-j", zipPath, `${t.id}_2K-JPG_${m}.jpg`, "-d", dir], {
      stdio: "ignore",
    });
  }
  await rm(zipPath);
  for (const [suffix, channel] of Object.entries(MAPS)) {
    const src = join(dir, `${t.id}_2K-JPG_${suffix}.jpg`);
    const dst = join(dir, `${channel}.jpg`);
    if (!existsSync(src)) continue;
    await rename(src, dst);
    if (targetWidth && hasFfmpeg) {
      const tmp = join(dir, `_${channel}.jpg`);
      run("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-i",
        dst,
        "-vf",
        `scale=${targetWidth}:-1`,
        "-q:v",
        "4",
        tmp,
      ]);
      await rename(tmp, dst);
    }
  }
  // Remove any extra members unzip may have kept.
  for (const f of await readdir(dir)) {
    if (!Object.values(MAPS).some((c) => f === `${c}.jpg`)) await rm(join(dir, f));
  }
  process.stdout.write("done\n");
}

async function main() {
  if (targetWidth && !hasFfmpeg) {
    console.warn("ffmpeg not found; keeping full 2K maps.");
  }
  await mkdir(pbrDir, { recursive: true });
  for (const t of TEXTURES) {
    try {
      await fetchTexture(t);
    } catch (err) {
      console.error(`${t.name}: ${err.message}`);
    }
  }
  console.info("Assets ready under assets/. See assets/ASSETS.md for credits.");
}

await main();
