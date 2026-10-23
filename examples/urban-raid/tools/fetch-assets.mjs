// Fetch the optional CC0 art set for NaturalFPS.
//
// Everything here is CC0 1.0 (public domain). The assets are not committed to
// git; this script downloads them into assets/ on demand so the repository
// stays small. Provenance and licensing are documented in assets/ASSETS.md.
//
// Usage (from examples/urban-raid):
//   bun run assets            full 2K maps
//   bun run assets --size=1k  downscale to 1K with ffmpeg if it is installed
//   bun run assets --only=vehicles  just the Grab3D vehicle models
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
import { MODELS as MANIFEST } from "../src/world/model-manifest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbrDir = join(root, "assets", "pbr");
const modelsDir = join(root, "assets", "models");

// CC0 1.0, Poly Haven (https://polyhaven.com/license). Fetched as glTF (a
// .gltf plus its .bin and textures) at 1K so the set stays small.
const MODELS = [
  "GreenChair_01",
  "metal_trash_can",
  "potted_plant_01",
  "shrub_01",
  "street_lamp_01",
  "fire_hydrant",
  // Realistic CC0 replacements for the weak hand-sculpted props (see ASSETS.md).
  "covered_car", // parked car under a fitted cover
  "modular_electricity_poles", // utility poles
  "power_box_01", // pole transformer / distribution box
];

// CC0 1.0, Grab3D (https://grab3d.com/license). Single-file .glb binaries
// listed in the model manifest with their download URLs. sha256 pins the
// current upload; a mismatch warns, like the texture pins.
const VEHICLES = MANIFEST.filter((m) => m.format === "glb");
const VEHICLE_SHA256 = {
  grab3d_school_bus: "fc29fa32ad61cb7fe1b7edce479f8dc5d80ce6eafc3558b657291b3ce9fb29a2",
  grab3d_1950s_sedan: "41c83367e34271d8f5a7d4567d756079303cd8513226c8029fab6a18d73e35f9",
  grab3d_1950s_pickup: "16dfcb7588d8e33f87dfb0848eae11b61a14afea14de192d70ee8a646536b024",
};

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
  {
    name: "roof",
    id: "RoofingTiles010",
    sha256: "54f92d5abfc1bbb51f8c6fd6680402306c52a910420a42403088b0b4963369e8",
  },
  {
    name: "planks",
    id: "Planks018",
    sha256: "67de89450524150189b4817a501584809b8ec9f5937ae61f6d361ab20e7da17c",
  },
  {
    name: "metal",
    id: "PaintedMetal002",
    sha256: "c95fc5a065582deded194e7bc4d9592706b58aa0259110989931ec8f8ad1a9a0",
  },
  {
    name: "siding",
    id: "WoodSiding001",
    sha256: "f6391718002cd2f5da737f89a371e2a3dae573540b8c2b301271d7f02cec4e54",
  },
];

const sizeArg = process.argv.find((a) => a.startsWith("--size="));
const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "";
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

async function fetchModel(id) {
  const dir = join(modelsDir, id);
  await mkdir(dir, { recursive: true });
  process.stdout.write(`${id}: downloading... `);
  const meta = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = meta.gltf?.["1k"]?.gltf;
  if (!g?.url) throw new Error("no 1k glTF");
  const write = async (url, dest) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  };
  await write(g.url, join(dir, g.url.split("/").pop()));
  for (const [rel, info] of Object.entries(g.include ?? {})) {
    await write(info.url, join(dir, rel));
  }
  process.stdout.write("done\n");
}

async function fetchGlb(m) {
  const dir = join(modelsDir, m.id);
  await mkdir(dir, { recursive: true });
  process.stdout.write(`${m.id}: downloading... `);
  const res = await fetch(m.download);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${m.download}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString("latin1") !== "glTF") throw new Error("not a .glb");
  const want = VEHICLE_SHA256[m.id];
  const got = sha256(buf);
  if (want && got !== want) {
    process.stdout.write(
      `checksum changed (expected ${want.slice(0, 12)}, got ${got.slice(0, 12)}) `,
    );
  }
  await writeFile(join(dir, `${m.id}.glb`), buf);
  process.stdout.write("done\n");
}

async function fetchVehicles() {
  await mkdir(modelsDir, { recursive: true });
  for (const m of VEHICLES) {
    try {
      await fetchGlb(m);
    } catch (err) {
      console.error(`${m.id}: ${err.message}`);
    }
  }
}

async function main() {
  if (onlyArg === "vehicles") {
    await fetchVehicles();
    console.info("Vehicle models ready under assets/models. See assets/ASSETS.md for credits.");
    return;
  }
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
  await mkdir(modelsDir, { recursive: true });
  for (const id of MODELS) {
    try {
      await fetchModel(id);
    } catch (err) {
      console.error(`${id}: ${err.message}`);
    }
  }
  await fetchVehicles();
  console.info("Assets ready under assets/. See assets/ASSETS.md for credits.");
}

await main();
