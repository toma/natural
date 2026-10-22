import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Loader for the optional CC0 glTF models (see assets/ASSETS.md). Like the PBR
 * sets they are fetched, not committed, so this is a progressive enhancement:
 * a model that is not present is simply skipped and the procedural dressing in
 * its place stays. Each placed model is wrapped in a THREE.LOD that culls it
 * past a distance, driven from the world update by updateModelLods().
 */

const gltfLoader = new GLTFLoader();
const sceneCache = new Map();

function loadScene(url) {
  let promise = sceneCache.get(url);
  if (!promise) {
    promise = new Promise((resolve) => {
      gltfLoader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => resolve(null),
      );
    });
    sceneCache.set(url, promise);
  }
  return promise;
}

/**
 * Load each request and add it to `root`, baking the level-to-world transform
 * into the instance like the rest of the world. Requests are
 * { id, x, z, yaw?, y?, scale?, far? } in level coordinates. Resolves after all
 * have loaded; LODs are pushed into `outLods` as they appear.
 */
export async function placeModels(root, xform, requests, outLods) {
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const r of requests) {
    const scene = await loadScene(`/assets/models/${r.id}/${r.id}_1k.gltf`);
    if (!scene) continue;
    const obj = scene.clone(true);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const sc = r.scale ?? 1;
    e.set(0, r.yaw ?? 0, 0);
    local.compose(p.set(r.x, r.y ?? 0, r.z), q.setFromEuler(e), s.set(sc, sc, sc));
    world.multiplyMatrices(xform, local);
    const lod = new THREE.LOD();
    lod.addLevel(obj, 0);
    lod.addLevel(new THREE.Group(), r.far ?? 55);
    world.decompose(lod.position, lod.quaternion, lod.scale);
    lod.updateMatrix();
    root.add(lod);
    outLods.push(lod);
  }
}

export function updateModelLods(lods, camera) {
  for (const lod of lods) lod.update(camera);
}
