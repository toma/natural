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

/**
 * One-shot probe for whether the fetched CC0 model set is present, cached for
 * the session. The world build awaits this so model-backed props (the car, the
 * utility poles) can be built as glTF when the set is installed and fall back
 * to their procedural geometry when it is not (a clean production build, CI, or
 * the saved parity baselines). `covered_car` is the sentinel: it ships only
 * with this set, so its presence means `bun run assets` has been run.
 */
let availability = null;
export function assetsAvailable() {
  if (!availability) {
    availability = fetch("/assets/models/covered_car/covered_car_1k.gltf")
      .then((r) => r.ok)
      .catch(() => false);
  }
  return availability;
}

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
  // Load every request concurrently: sequential awaits made the full dressing
  // set take many seconds to appear (and dropped the last entries from timed
  // captures). Each resolved scene is attached as it arrives.
  await Promise.all(
    requests.map(async (r) => {
      const scene = await loadScene(`/assets/models/${r.id}/${r.id}_1k.gltf`);
      if (!scene) return;
      const obj = scene.clone(true);
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const sc = r.scale ?? 1;
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(r.x, r.y ?? 0, r.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.yaw ?? 0, 0)),
        new THREE.Vector3(sc, sc, sc),
      );
      const world = new THREE.Matrix4().multiplyMatrices(xform, local);
      const lod = new THREE.LOD();
      lod.addLevel(obj, 0);
      lod.addLevel(new THREE.Group(), r.far ?? 55);
      world.decompose(lod.position, lod.quaternion, lod.scale);
      lod.updateMatrix();
      root.add(lod);
      outLods.push(lod);
    }),
  );
}

export function updateModelLods(lods, camera) {
  for (const lod of lods) lod.update(camera);
}
