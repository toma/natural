# Art assets

NaturalFPS is procedural by default: every texture, material, and prop in the
demo is generated at runtime from GLSL and geometry code, so a clean checkout
needs no binary art to build or run.

This folder holds optional CC0 (public-domain) art that raises surface realism
when present. The assets are not committed. They are fetched on demand so the
repository stays small and its history clean:

```
bun run assets          # from examples/urban-raid, downloads the set below
bun run assets --size=1k # smaller 1K maps for lower-VRAM machines
```

The loader treats these as a progressive enhancement. When a set is missing the
demo falls back to the procedural material for that surface, so the gate and a
fresh clone work with no network access.

Every asset below is CC0 1.0 (public domain, no attribution required). Nothing
here is ripped, commercial, or derived from any Call of Duty or Activision
product. Credits are listed anyway, which is good open-source manners.

## Textures (ambientCG, by Lennart Demes, CC0 1.0)

| Surface                                      | Asset           | Source                                        |
| -------------------------------------------- | --------------- | --------------------------------------------- |
| Asphalt road                                 | Asphalt026C     | https://ambientcg.com/view?id=Asphalt026C     |
| Grass / lawn                                 | Grass004        | https://ambientcg.com/view?id=Grass004        |
| Concrete curb and sidewalk                   | Concrete034     | https://ambientcg.com/view?id=Concrete034     |
| Brick chimney                                | Bricks094       | https://ambientcg.com/view?id=Bricks094       |
| Roof shingles                                | RoofingTiles010 | https://ambientcg.com/view?id=RoofingTiles010 |
| Wood fence planks                            | Planks018       | https://ambientcg.com/view?id=Planks018       |
| Painted vehicle metal                        | PaintedMetal002 | https://ambientcg.com/view?id=PaintedMetal002 |
| Lap siding grain (normal and roughness only) | WoodSiding001   | https://ambientcg.com/view?id=WoodSiding001   |

ambientCG releases all of its material scans under CC0 1.0:
https://docs.ambientcg.com/books/licensing/page/the-license

Each set ships albedo (Color), OpenGL normal (NormalGL), roughness (Roughness),
ambient occlusion (AmbientOcclusion), and displacement (Displacement) maps. The
loader packs them into the engine's layout: albedo RGB plus height in alpha, and
an occlusion/roughness/metalness map, then lets the material library's world
projection, macro variation, and vertex weathering blend out the tiling.

## Models (Poly Haven, CC0 1.0)

Fetched as glTF (a .gltf plus its .bin and 1K textures). Loaded asynchronously
and wrapped in a distance LOD; a missing model falls back to procedural dressing.

| Use                    | Asset           | Source                                  |
| ---------------------- | --------------- | --------------------------------------- |
| Hedges along the fence | shrub_01        | https://polyhaven.com/a/shrub_01        |
| Porch potted plants    | potted_plant_01 | https://polyhaven.com/a/potted_plant_01 |
| Kerbside bins          | metal_trash_can | https://polyhaven.com/a/metal_trash_can |
| Lawn chairs            | GreenChair_01   | https://polyhaven.com/a/GreenChair_01   |
| Kerb lamp posts        | street_lamp_01  | https://polyhaven.com/a/street_lamp_01  |
| Corner hydrant         | fire_hydrant    | https://polyhaven.com/a/fire_hydrant    |
| Parked cars (covered)  | covered_car     | https://polyhaven.com/a/covered_car     |
| Utility poles          | modular_electricity_poles | https://polyhaven.com/a/modular_electricity_poles |
| Pole transformer       | power_box_01    | https://polyhaven.com/a/power_box_01    |

Poly Haven publishes all of its assets as CC0 1.0: https://polyhaven.com/license

## Vehicles (Grab3D, CC0 1.0)

Single-file .glb models fetched by `bun run assets` (or only these with
`bun run assets --only=vehicles`) and checked against pinned SHA-256 hashes.
They replace the procedural school bus and the two parked cars. The procedural
builders still run in collider-only mode, so collision and navigation do not
change. Body paint is repainted to the active skin colour and finished as a
clearcoat lacquer. Without the files the improved procedural vehicles render.
The moving truck stays procedural because no period model of that size exists.

| Use                    | Asset               | Source                                               |
| ---------------------- | ------------------- | ---------------------------------------------------- |
| School bus             | grab3d_school_bus   | https://grab3d.com/models/vehicles/school-bus/       |
| Parked sedan (green)   | grab3d_1950s_sedan  | https://grab3d.com/models/vehicles/1950s-sedan/      |
| Parked pickup (yellow) | grab3d_1950s_pickup | https://grab3d.com/models/vehicles/1950s-pickup-truck/ |

Grab3D publishes its models as CC0 1.0: https://grab3d.com/license

## Photoreal backdrop (World Labs Marble)

The optional distance backdrop in `assets/worldlabs/` (Gaussian splats, a
collider mesh, an equirectangular panorama, and `world.json`) is output from
[World Labs Marble](https://marble.worldlabs.ai), generated by the project author
through their own World Labs account from an image prompt they created. The
output is owned by the project author. Unlike the CC0 art above it is not CC0 and
is not covered by those licenses; it is included only for this project's use.

The backdrop system that renders it (`src/world/backdrop.js`,
`src/world/backdrop-config.ts`) is content-neutral: it is off by default, ships
no world (`BACKDROP_WORLD` is `null`), and renders whatever world you configure.
See `assets/worldlabs/README.md` to point it at a world. Rendering uses Spark
(https://github.com/sparkjsdev/spark), World Labs' open-source three.js splat
renderer, an optional dependency installed with `bun add @sparkjsdev/spark`.

## KTX2 compression (optional)

For less VRAM and faster GPU upload, the JPG sets can be packed into
GPU-compressed KTX2 (Basis UASTC with Zstd supercompression):

```
bun run assets:ktx2     # writes assets/ktx2/ and assets/basis/ (transcoder)
```

This needs ffmpeg and `toktx` from KTX-Software
(https://github.com/KhronosGroup/KTX-Software/releases); point at a specific
binary with `TOKTX=/path/to/toktx`. The pack step bakes the same per-surface
tuning the JPG path applies at runtime, so the result matches. When a KTX2 set
is present the loader uses it; otherwise it falls back to the JPG set, and then
to the procedural surface. KTX2 transcodes to a compressed GPU format
(roughly a quarter of the VRAM of the decoded JPGs).

## How to add more

Add an entry to the manifest in `tools/fetch-assets.mjs` with its id, CC0
source URL, and author, then run the fetch script. Keep the list CC0 only:
ambientCG and Poly Haven (https://polyhaven.com/license) publish everything as
CC0; on Quaternius and Kenney, confirm the specific pack is CC0 before adding it.
