import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { parseWorldMeta } from "./backdrop-config.ts";
import { loadSpark, waitForSplat } from "./spark.js";
import {
  SPAWN_RULES,
  WORLDLABS_MAP,
  WORLDLABS_PLAY_HEIGHT,
  WORLDLABS_PLAY_RADIUS,
  chooseSpawns,
  spawnCandidates,
  worldLabsPlacement,
  worldLabsSplatUrl,
} from "./worldlabs-map-config.ts";

/** Probe rays start this far above the captured ground plane. */
const PROBE_TOP = 3;

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

function applyPlacement(obj, placed) {
  obj.position.fromArray(placed.position);
  obj.rotation.set(placed.rotation[0], placed.rotation[1], placed.rotation[2]);
  obj.scale.setScalar(placed.scale);
  obj.updateMatrixWorld(true);
}

async function loadCollider(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const meshes = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  return { scene: gltf.scene, meshes };
}

async function loadSplat(ctx, url) {
  const spark = await loadSpark();
  if (!spark?.SplatMesh || !spark.SparkRenderer) return null;
  const renderer = ctx.peek("render")?.renderer;
  if (!renderer) return null;
  const sparkRenderer = new spark.SparkRenderer({ renderer });
  sparkRenderer.name = "worldlabs-spark";
  const mesh = new spark.SplatMesh({ url });
  mesh.name = "worldlabs-splat";
  const ok = await waitForSplat(mesh);
  if (!ok) {
    mesh.dispose?.();
    sparkRenderer.dispose?.();
    return null;
  }
  return { sparkRenderer, mesh };
}

/**
 * Probe the collider under a spawn candidate: ground height, its normal, and
 * the clear height above it.
 */
export function probeGround(physics, x, z) {
  const mask = physics.MASK?.WORLD;
  const down = physics.raycast(x, PROBE_TOP, z, 0, -1, 0, PROBE_TOP + 8, mask);
  if (!down.hit) return { y: null, normalY: 0, headroom: 0 };
  const y = down.point.y;
  const normalY = down.normal.y;
  const up = physics.raycast(x, y + 0.05, z, 0, 1, 0, SPAWN_RULES.minHeadroom + 1, mask);
  return { y, normalY, headroom: up.hit ? up.distance : Infinity };
}

/**
 * Build the World Labs map into `root`: the full splat as the visible level and
 * the exported collider (invisible) as physics geometry, both with the metric
 * placement from world.json. Returns null if either half fails to load, so the
 * caller can fall back to the procedural map.
 */
export async function buildWorldLabsMap(ctx, root, physics, map = WORLDLABS_MAP) {
  const t0 = performance.now();
  const url = worldLabsSplatUrl(ctx.config.quality, map);
  const [meta, collider, splat] = await Promise.all([
    fetchJson(map.meta).then(parseWorldMeta),
    loadCollider(map.collider).catch((err) => {
      console.warn("[worldlabs] collider failed to load", err?.message ?? err);
      return null;
    }),
    loadSplat(ctx, url).catch((err) => {
      console.warn("[worldlabs] splat failed to load", err?.message ?? err);
      return null;
    }),
  ]);
  if (!collider?.meshes.length || !splat || !physics) {
    splat?.mesh.dispose?.();
    splat?.sparkRenderer.dispose?.();
    return null;
  }

  const placed = worldLabsPlacement(meta, map);

  // ---- collision: the exported mesh, invisible, same placement as the splat --
  const colliderRoot = new THREE.Group();
  colliderRoot.name = "worldlabs-collider";
  applyPlacement(colliderRoot, placed);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  let collideTris = 0;
  for (const m of collider.meshes) {
    m.removeFromParent();
    colliderRoot.add(m);
  }
  root.add(colliderRoot);
  colliderRoot.updateMatrixWorld(true);
  for (const m of collider.meshes) {
    m.material = hidden;
    m.visible = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.owNoPrepass = true;
    physics.addStatic(m, "concrete");
    const index = m.geometry.index;
    collideTris += (index ? index.count : m.geometry.attributes.position.count) / 3;
  }
  physics.rebuildStatic();

  // ---- visuals: the full splat, uncropped --------------------------------------
  applyPlacement(splat.mesh, placed);
  root.add(splat.sparkRenderer);
  root.add(splat.mesh);

  // ---- spawns: walkable ground found by probing the collider ---------------
  const spawns = chooseSpawns(spawnCandidates(), (c) => probeGround(physics, c.x, c.z));
  const spawnPoints = spawns.map((s, i) => ({
    position: new THREE.Vector3(s.x, s.y, s.z),
    yaw: s.yaw,
    tag: i === 0 ? "origin" : `ring_${i}`,
  }));
  if (!spawnPoints.length) {
    console.warn("[worldlabs] no walkable spawn found on the collider; using the origin");
    spawnPoints.push({ position: new THREE.Vector3(0, 0, 0), yaw: 0, tag: "origin" });
  }

  const r = WORLDLABS_PLAY_RADIUS;
  const bounds = new THREE.Box3(
    new THREE.Vector3(-r, WORLDLABS_PLAY_HEIGHT[0], -r),
    new THREE.Vector3(r, WORLDLABS_PLAY_HEIGHT[1], r),
  );

  const ms = performance.now() - t0;
  console.info(
    `[worldlabs] map ready in ${ms.toFixed(0)}ms - ${url}, ${(collideTris / 1000).toFixed(1)}k collision tris, ` +
      `${spawnPoints.length} spawns, scale ${placed.scale.toFixed(3)}`,
  );
  return {
    splat: splat.mesh,
    sparkRenderer: splat.sparkRenderer,
    collider: colliderRoot,
    spawnPoints,
    bounds,
    placed,
    stats: {
      staticTris: 0,
      instTris: 0,
      instances: 0,
      drawCalls: 1,
      collideTris,
      splatUrl: url,
    },
  };
}
