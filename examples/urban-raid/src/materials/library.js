import * as THREE from "three";
import { CONCRETE, BRICK, PLASTER, TILE, PAINT } from "./glsl/surfaces-arch.js";
import { ASPHALT, SAND, DIRT, GRAVEL } from "./glsl/surfaces-ground.js";
import {
  METAL_RUST,
  METAL_PAINTED,
  METAL_BRUSHED,
  CORRUGATED,
  CAR_PAINT,
} from "./glsl/surfaces-metal.js";
import { WOOD, FABRIC, BURLAP, FOLIAGE, TURF, RUBBER, GLASS } from "./glsl/surfaces-organic.js";

/**
 * The surface library.
 *
 * `bake`  - how the texture set is generated (resolution, the metres the tile
 *           spans, and the peak-to-trough relief that sets the normal slope).
 * `mat`   - parameters for the material shader extension (see shader.js).
 * `three` - properties applied straight to the THREE material.
 * `surface` - the shared physics/FX surface vocabulary from ARCHITECTURE.md.
 */
export const LIBRARY = {
  // ------------------------------------------------------------ masonry ----
  concrete: {
    glsl: CONCRETE,
    surface: "concrete",
    bake: { size: 1024, worldSize: 2.5, relief: 0.09, seed: 11, param: [1, 0, 0, 0] },
    mat: {
      scale: 2.5,
      parallax: 0.016,
      detile: 0.4,
      detail: [9, 0.95, 0.58, 26],
      macro: [0.085, 0.62, 0.24, 0.45],
      // 3-4 m pour/wash variation at real contrast plus a 12 m band, so a long
      // retaining wall or a barrier run is not one value end to end.
      macroBig: [2.05, 0.13, 0.028, 0],
      patch: [0.28, 2.0, 0.145, -0.08],
      weather: [0.42, 0.4, 0.55, 0.5],
      wearColor: 0x9a978f,
      dustColor: 0x8b7f6a,
      grimeColor: 0x2b2823,
      roughness: [0.98, -0.01, 0.24],
    },
  },
  concrete_floor: {
    glsl: CONCRETE,
    surface: "concrete",
    bake: { size: 1024, worldSize: 2.5, relief: 0.075, seed: 47, param: [0, 1, 0, 0] },
    mat: {
      scale: 3.2,
      parallax: 0.01,
      detile: 0,
      detail: [9, 0.9, 0.52, 26],
      macro: [0.075, 0.48, 0.18, 0.3],
      macroRelief: 0.3,
      weather: [0.55, 0.1, 0.15, 0.5],
      roughness: [1.0, 0.0, 0.22],
    },
  },
  brick: {
    glsl: BRICK,
    surface: "concrete",
    bake: { size: 1024, worldSize: 1.35, relief: 0.055, seed: 23 },
    mat: {
      scale: 1.35,
      // 0.12 of height range x 0.024 m = ~2.5 mm of mortar parallax
      parallax: 0.024,
      parallaxLayers: 24,
      detile: 0,
      detail: [7, 0.88, 0.48, 22],
      macro: [0.09, 0.58, 0.22, 0.55],
      macroBig: [1.95, 0.115, 0.03, 0],
      weather: [0.4, 0.5, 0.6, 0.55],
      wearColor: 0xa08678,
      grimeColor: 0x241f19,
      roughness: [0.98, -0.01, 0.26],
    },
  },
  plaster: {
    glsl: PLASTER,
    surface: "plaster",
    bake: { size: 1024, worldSize: 2.2, relief: 0.06, seed: 5 },
    mat: {
      scale: 2.2,
      parallax: 0.014,
      detile: 0.8,
      detail: [10, 0.95, 0.54, 24],
      // 0.085 puts the coarsest band of the macro map at ~4 m; the contrast
      // expansion is what turns it from a 5% wash into a real 20% swing, and the
      // second band at 0.026 zones the facade at ~13 m. Between them a 12 m
      // elevation reads as damp/dry/bleached areas instead of one flat colour.
      macro: [0.085, 0.72, 0.26, 0.5],
      macroBig: [2.15, 0.15, 0.026, 0],
      // ~18% of every facade is a replastered rectangle at +/-17% value.
      // A 12 m elevation seen at 3 m is mostly ONE surface, so the only thing
      // that can stop it reading as flat colour is structure at 1-4 m.
      patch: [0.34, 2.2, 0.175, -0.1],
      // streaks are gated by the runoff model now, so the amplitude can be real
      weather: [0.34, 0.5, 0.6, 0.5],
      wearColor: 0xb0a692,
      dustColor: 0x9c8a6c,
      grimeColor: 0x2a251d,
      roughness: [0.97, -0.02, 0.26],
    },
  },
  tile: {
    glsl: TILE,
    surface: "concrete",
    bake: { size: 1024, worldSize: 1.5, relief: 0.03, seed: 31 },
    mat: {
      scale: 1.5,
      // 0.06 of height range x 0.03 m = ~1.8 mm of grout recess
      parallax: 0.03,
      parallaxLayers: 20,
      detail: [8, 0.6, 0.36, 18],
      macro: [0.09, 0.4, 0.16, 0.3],
      // tiled walls are laid in batches: whole areas came from a different kiln
      macroBig: [1.7, 0.075, 0.032, 0],
      patch: [0.14, 1.7, 0.1, -0.05],
      weather: [0.3, 0.2, 0.3, 0.5],
      roughness: [0.9, -0.04, 0.16],
    },
  },

  // ------------------------------------------------------------- ground ----
  asphalt: {
    glsl: ASPHALT,
    surface: "concrete",
    bake: { size: 1024, worldSize: 3.0, relief: 0.075, seed: 71 },
    mat: {
      scale: 3.0,
      parallax: 0.014,
      detile: 1.0,
      // micro detail is gone by 16 m, so the near ground gains detail instead
      // of shimmering at range
      detail: [8, 0.8, 0.42, 18],
      macro: [0.062, 0.52, 0.22, 0.25],
      macroRelief: 0.55,
      weather: [0.45, 0.05, 0.1, 0.26],
      dustColor: 0x8b8071,
      grimeColor: 0x232120,
      roughness: [0.98, -0.02, 0.3],
    },
  },
  sand: {
    glsl: SAND,
    surface: "sand",
    bake: { size: 1024, worldSize: 2.5, relief: 0.1, seed: 91 },
    mat: {
      uvMode: "triplanar",
      scale: 2.5,
      detile: 0,
      detail: [8, 0.7, 0.3, 18],
      macro: [0.05, 0.44, 0.14, 0.35],
      macroRelief: 0.45,
      weather: [0.15, 0.0, 0.0, 0.18],
      dustColor: 0xa89066,
      grimeColor: 0x4c4132,
      roughness: [1.0, 0.0, 0.3],
    },
  },
  dirt: {
    glsl: DIRT,
    surface: "dirt",
    bake: { size: 1024, worldSize: 2.5, relief: 0.12, seed: 13 },
    mat: {
      uvMode: "triplanar",
      scale: 2.5,
      detail: [7, 0.85, 0.36, 18],
      macro: [0.055, 0.48, 0.18, 0.4],
      macroRelief: 0.6,
      weather: [0.2, 0.0, 0.0, 0.22],
      dustColor: 0x94805c,
      grimeColor: 0x37301f,
      roughness: [0.98, -0.02, 0.3],
    },
  },
  gravel: {
    glsl: GRAVEL,
    // 1K, not 512: at 512 the 9 mm grade was 2.5 texels wide and baked as
    // noise. Aggregate has to be resolved in the tile or it cannot be resolved
    // at all - the mip chain only ever removes information.
    bake: { size: 1024, worldSize: 1.6, relief: 0.055, seed: 57 },
    surface: "dirt",
    mat: {
      uvMode: "triplanar",
      scale: 1.6,
      detail: [6, 0.8, 0.34, 20],
      macro: [0.07, 0.44, 0.2, 0.3],
      macroRelief: 0.7,
      // Cavity grime on a surface whose height field IS its aggregate turns
      // every gap between stones into a black pit; 0.5 was most of the
      // bimodal histogram the critics measured on the road.
      weather: [0.2, 0.0, 0.0, 0.16],
      dustColor: 0xa2947a,
      grimeColor: 0x4a4238,
      roughness: [0.96, -0.03, 0.28],
    },
  },

  // -------------------------------------------------------------- metal ----
  metal_rust: {
    glsl: METAL_RUST,
    surface: "metal",
    bake: { size: 1024, worldSize: 1.2, relief: 0.035, seed: 37 },
    mat: {
      scale: 1.2,
      parallax: 0.004,
      detail: [9, 0.7, 0.36, 16],
      macro: [0.1, 0.3, 0.14, 0.4],
      weather: [0.25, 0.4, 0.5, 0.35],
      wearColor: 0x8c8f93,
      wearMaterial: [0.28, 1.0, 0, 0.85],
    },
  },
  metal_painted: {
    glsl: METAL_PAINTED,
    surface: "metal",
    bake: {
      size: 1024,
      worldSize: 1.5,
      relief: 0.018,
      seed: 61,
      tintA: 0x4a5340,
      tintB: 0x2a2f26,
    },
    mat: {
      scale: 1.5,
      parallax: 0.003,
      detail: [10, 0.6, 0.32, 16],
      macro: [0.1, 0.28, 0.14, 0.35],
      weather: [0.3, 0.45, 0.35, 0.35],
      wearColor: 0x8f9296,
      wearMaterial: [0.3, 1.0, 0, 0.9],
      // painted metal has to stay glossy enough to glint, but never mirror
      roughness: [0.92, -0.03, 0.22],
    },
  },
  metal_brushed: {
    glsl: METAL_BRUSHED,
    surface: "metal",
    bake: { size: 512, worldSize: 0.8, relief: 0.004, seed: 83 },
    mat: {
      scale: 0.8,
      detail: [8, 0.25, 0.15, 8],
      macro: [0.09, 0.14, 0.1, 0.2],
      weather: [0.15, 0.15, 0.2, 0.2],
      wearColor: 0xb9bcc0,
      wearMaterial: [0.16, 1.0, 0, 0.9],
    },
    three: { anisotropy: 0.65, anisotropyRotation: 0, physical: true },
  },
  corrugated: {
    glsl: CORRUGATED,
    surface: "metal",
    bake: { size: 1024, worldSize: 2.4, relief: 0.075, seed: 29 },
    mat: {
      scale: 2.4,
      parallax: 0.03,
      parallaxLayers: 24,
      detail: [10, 0.6, 0.32, 18],
      macro: [0.09, 0.26, 0.12, 0.3],
      weather: [0.3, 0.5, 0.5, 0.4],
      wearColor: 0x9aa0a4,
      wearMaterial: [0.32, 1.0, 0, 0.85],
    },
  },

  // ------------------------------------------------------------ organic ----
  wood: {
    glsl: WOOD,
    surface: "wood",
    bake: { size: 1024, worldSize: 2.0, relief: 0.038, seed: 19 },
    mat: {
      scale: 2.0,
      parallax: 0.008,
      detail: [10, 0.8, 0.42, 18],
      macro: [0.085, 0.34, 0.14, 0.5],
      weather: [0.3, 0.35, 0.5, 0.45],
      wearColor: 0xa88b62,
      wearMaterial: [0.5, 0.0, 0, 0.7],
    },
  },
  fabric: {
    glsl: FABRIC,
    surface: "fabric",
    // The weave carries ~0.3 of the height range, so 0.011 m of relief over a
    // 0.7 m tile is a ~1.5-2 mm thread bump at the 0.26 m mapping the awnings
    // use - a real weave, not a painted grid.
    bake: { size: 512, worldSize: 0.7, relief: 0.008, seed: 43, tintA: 0x5a5445, tintB: 0x3a3830 },
    mat: {
      scale: 0.7,
      detail: [6, 0.42, 0.28, 10],
      // 1.4 m macro at real contrast: sun-bleached panels and damp panels
      macro: [0.12, 0.34, 0.12, 0.3],
      macroBig: [1.8, 0.07, 0.09, 0],
      weather: [0.25, 0.2, 0.3, 0.35],
      normalStrength: 1.15,
      /**
       * Canvas passes 18% of the beam, its underside sits ~0.75 stops under its
       * top, and the drape structure is a 10 cm fold field. This is the whole
       * difference between fabric and painted cardboard.
       */
      cloth: [0.2, 0.72, 0.26, 0],
    },
    three: { physical: true, sheen: 0.55, sheenRoughness: 0.85, sheenColor: 0x8a8272 },
  },
  burlap: {
    glsl: BURLAP,
    surface: "fabric",
    // hessian is coarse: a fat, visible thread bump
    bake: { size: 512, worldSize: 0.5, relief: 0.018, seed: 67 },
    mat: {
      scale: 0.5,
      parallax: 0.003,
      detail: [6, 0.4, 0.28, 9],
      macro: [0.14, 0.32, 0.12, 0.35],
      macroBig: [1.7, 0.06, 0.11, 0],
      weather: [0.4, 0.15, 0.35, 0.4],
      dustColor: 0x9c8760,
      normalStrength: 1.15,
      // a filled bag transmits far less than a stretched canvas
      cloth: [0.06, 0.86, 0.1, 0],
    },
    three: { physical: true, sheen: 0.4, sheenRoughness: 0.95, sheenColor: 0x9c8b68 },
  },
  foliage: {
    glsl: FOLIAGE,
    surface: "foliage",
    bake: { size: 512, worldSize: 0.6, relief: 0.02, seed: 79 },
    mat: {
      uvMode: "mesh",
      scale: 1,
      alphaMask: true,
      detail: [4, 0.25, 0.15, 8],
      macro: [0.16, 0.3, 0.08, 0.6],
      weather: [0.15, 0.0, 0.0, 0.2],
    },
    three: {
      side: THREE.DoubleSide,
      alphaTest: 0.45,
      physical: true,
      sheen: 0.3,
      sheenRoughness: 0.8,
      sheenColor: 0x9fbd6a,
    },
  },
  turf: {
    glsl: TURF,
    surface: "foliage",
    // 1.1 m tile so a mown blade sits at a believable few centimetres, and 5 cm
    // of relief so the blade field reads as real geometry through the normal map.
    bake: { size: 1024, worldSize: 1.1, relief: 0.05, seed: 53 },
    mat: {
      // Lawns lie on the ground plane and large lawns wrap corners, so triplanar
      // mapping avoids the UV seams a planar lawn shows at bed edges.
      uvMode: "triplanar",
      scale: 1.1,
      detile: 0.6,
      // The blades carry the look, so the shared micro layer stays light: just
      // enough soil tooth to keep the gaps from going plastic at close range.
      detail: [6, 0.35, 0.22, 12],
      macro: [0.06, 0.52, 0.2, 0.4],
      macroRelief: 0.5,
      weather: [0.12, 0.0, 0.0, 0.2],
      normalStrength: 1.2,
      roughness: [0.86, -0.04, 0.2],
    },
    // Grass has a faint waxy sheen that a plain rough dielectric misses; the
    // sheen lobe is what gives a lush lawn its soft grazing-angle highlight.
    three: { physical: true, sheen: 0.4, sheenRoughness: 0.75, sheenColor: 0x9fbf63 },
  },
  rubber: {
    glsl: RUBBER,
    surface: "rubber",
    bake: { size: 512, worldSize: 0.5, relief: 0.013, seed: 97 },
    mat: {
      scale: 0.45,
      detail: [7, 0.62, 0.42, 13],
      // A tyre stack is a dark mass low in the frame, so it has nothing but its
      // own variation to read by: bleached crowns, damp black sidewalls and the
      // road dust that fills the tread. Without these it is a grey lozenge.
      macro: [0.16, 0.36, 0.2, 0.18],
      macroBig: [1.8, 0.1, 0.11, 0],
      weather: [0.4, 0.18, 0.22, 0.45],
      dustColor: 0x8d8478,
      grimeColor: 0x181715,
      tint: 0xfffaf2,
      normalStrength: 1.25,
      roughness: [0.94, -0.03, 0.34],
    },
  },
  glass: {
    glsl: GLASS,
    surface: "glass",
    bake: { size: 512, worldSize: 2.0, relief: 0.0008, seed: 3 },
    mat: {
      scale: 2.0,
      detail: [3, 0.06, 0.05, 6],
      macro: [0.05, 0.1, 0.06, 0.1],
      weather: [0.1, 0.3, 0.4, 0.15],
      normalStrength: 0.35,
      roughness: [0.9, -0.01, 0.03],
    },
    three: {
      physical: true,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      envMapIntensity: 1.6,
      ior: 1.52,
      specularIntensity: 1,
      depthWrite: false,
    },
  },

  // --------------------------------------------------- mid-century set ----
  // Period finishes for a 1950s-1960s scene, built by reusing the proven
  // surface shaders above with glossier, cleaner tunings and a clearcoat or
  // anisotropy lobe. No new GLSL: these are data-only looks any scene can use.
  enamel: {
    glsl: METAL_PAINTED,
    surface: "metal",
    // Cream enamel over pressed steel: the glossy appliance / enamelled-sign
    // finish of the era. Reuses the painted-metal shader with a cream tint.
    bake: {
      size: 1024,
      worldSize: 1.6,
      relief: 0.012,
      seed: 64,
      tintA: 0xede4cf,
      tintB: 0xd7c7a4,
    },
    mat: {
      scale: 1.6,
      parallax: 0.002,
      detail: [10, 0.4, 0.22, 14],
      macro: [0.09, 0.2, 0.1, 0.3],
      weather: [0.18, 0.3, 0.25, 0.3],
      wearColor: 0x9a9ca0,
      wearMaterial: [0.2, 1.0, 0, 0.9],
      // Glossy but not a mirror: a tight bright roughness with little variation.
      roughness: [0.34, -0.06, 0.12],
    },
    three: { physical: true, clearcoat: 0.5, clearcoatRoughness: 0.18 },
  },
  paint: {
    glsl: PAINT,
    surface: "plaster",
    // Fresh exterior paint on siding, trim and pickets: even colour, a faint
    // brush direction, and only light dust and a low splash band from the
    // weathering layer.
    bake: { size: 1024, worldSize: 1.7, relief: 0.01, seed: 9 },
    mat: {
      scale: 1.7,
      detail: [10, 0.3, 0.12, 16],
      macro: [0.12, 0.06, 0.05, 0.1],
      macroBig: [1.2, 0.04, 0.06, 0],
      patch: [0, 2.0, 0, 0],
      weather: [0.07, 0.04, 0.32, 0.3],
      wearColor: 0xb0a692,
      dustColor: 0x9c8a6c,
      grimeColor: 0x2a251d,
      roughness: [0.8, -0.02, 0.12],
    },
  },
  car_paint: {
    glsl: CAR_PAINT,
    surface: "metal",
    // Solid factory enamel under a lacquer for vehicle bodies. The bake's base
    // colour matches painted metal's mean so a tint calibrated on one lands
    // on the other; only the weathering is gone.
    bake: { size: 1024, worldSize: 1.5, relief: 0.006, seed: 62, tintA: 0x3d4535 },
    mat: {
      scale: 1.5,
      parallax: 0.001,
      detail: [10, 0.25, 0.06, 16],
      macro: [0.1, 0.05, 0.03, 0.06],
      weather: [0.08, 0.06, 0.12, 0.2],
      wearColor: 0x8f9296,
      wearMaterial: [0.3, 1.0, 0, 0.9],
      roughness: [0.4, -0.02, 0.12],
    },
    three: { physical: true, clearcoat: 0.7, clearcoatRoughness: 0.1 },
  },
  chrome: {
    glsl: METAL_BRUSHED,
    surface: "metal",
    // Polished chrome trim: near-mirror, with the faint brushing holding a
    // grazing highlight so it is not a flat specular.
    bake: { size: 512, worldSize: 0.9, relief: 0.0025, seed: 85 },
    mat: {
      scale: 0.9,
      detail: [8, 0.15, 0.1, 8],
      macro: [0.08, 0.1, 0.08, 0.18],
      weather: [0.1, 0.1, 0.12, 0.18],
      wearColor: 0xc8ccd0,
      wearMaterial: [0.1, 1.0, 0, 0.95],
      roughness: [0.14, -0.03, 0.08],
    },
    three: { physical: true, anisotropy: 0.5, anisotropyRotation: 0, envMapIntensity: 1.4 },
  },
  lacquer: {
    glsl: WOOD,
    surface: "wood",
    // Lacquered mid-century wood: the WOOD grain under a clearcoat sheen, for
    // furniture, panelling, and trim.
    bake: { size: 1024, worldSize: 1.6, relief: 0.03, seed: 20 },
    mat: {
      scale: 1.6,
      parallax: 0.006,
      detail: [10, 0.7, 0.4, 18],
      macro: [0.08, 0.3, 0.12, 0.5],
      weather: [0.15, 0.2, 0.3, 0.4],
      wearColor: 0xa88b62,
      wearMaterial: [0.4, 0.0, 0, 0.7],
      roughness: [0.42, -0.05, 0.14],
    },
    three: { physical: true, clearcoat: 0.85, clearcoatRoughness: 0.08 },
  },
  ceramic: {
    glsl: TILE,
    surface: "concrete",
    // Glazed ceramic wall tile: the TILE layout under a bright glaze, for
    // kitchens and bathrooms of the period.
    bake: { size: 1024, worldSize: 1.3, relief: 0.022, seed: 32 },
    mat: {
      scale: 1.3,
      parallax: 0.024,
      parallaxLayers: 20,
      detail: [8, 0.4, 0.24, 16],
      macro: [0.08, 0.3, 0.12, 0.25],
      patch: [0.1, 1.7, 0.08, -0.04],
      weather: [0.2, 0.15, 0.2, 0.4],
      roughness: [0.22, -0.03, 0.06],
    },
    three: { physical: true, clearcoat: 0.6, clearcoatRoughness: 0.12 },
  },
};

/** Alias -> library key, so callers can ask for the physics surface name. */
export const ALIASES = {
  metal: "metal_painted",
  steel: "metal_brushed",
  rust: "metal_rust",
  sandbag: "burlap",
  ground: "dirt",
  road: "asphalt",
  stucco: "plaster",
  wall: "concrete",
  floor: "concrete_floor",
  plank: "wood",
  leaf: "foliage",
  window: "glass",
  lawn: "turf",
  grass: "turf",
};

export function resolveName(name) {
  return LIBRARY[name] ? name : (ALIASES[name] ?? name);
}
