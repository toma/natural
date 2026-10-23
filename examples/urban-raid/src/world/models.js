import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { modelUrl, modelLodFar, modelScale, SENTINEL_MODEL_ID } from "./model-manifest.ts";
import { recolorPaint } from "./vehicle-models.ts";

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
const availability = new Map();
export function assetsAvailable(id = SENTINEL_MODEL_ID) {
  let probe = availability.get(id);
  if (!probe) {
    probe = fetch(modelUrl(id))
      .then((r) => r.ok)
      .catch(() => false);
    availability.set(id, probe);
  }
  return probe;
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
      const scene = await loadScene(modelUrl(r.id));
      if (!scene) return;
      const obj = scene.clone(true);
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      if (r.vehicle) finishVehicle(obj, r.vehicle);
      const sc = r.scale ?? modelScale(r.id);
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(r.x, r.y ?? 0, r.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.yaw ?? 0, 0)),
        new THREE.Vector3(sc, sc, sc),
      );
      const world = new THREE.Matrix4().multiplyMatrices(xform, local);
      const lod = new THREE.LOD();
      lod.addLevel(obj, 0);
      lod.addLevel(new THREE.Group(), r.far ?? modelLodFar(r.id));
      world.decompose(lod.position, lod.quaternion, lod.scale);
      lod.updateMatrix();
      root.add(lod);
      outLods.push(lod);
    }),
  );
}

const repaintCache = new Map();

/**
 * Repaint a body texture's stock paint to the skin colour (see recolorPaint),
 * once per texture and colour. The pixels are read back through a canvas.
 */
function repaintTexture(tex, stock, paint, minSat) {
  const key = `${tex.uuid}:${paint.join(",")}:${minSat}`;
  let out = repaintCache.get(key);
  if (out) return out;
  const img = tex.image;
  const w = img?.width ?? 0,
    h = img?.height ?? 0;
  if (!w || !h || typeof document === "undefined") return tex;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  recolorPaint(data.data, stock, paint, { minSat });
  g.putImageData(data, 0, 0);
  out = new THREE.CanvasTexture(canvas);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.channel = tex.channel;
  out.anisotropy = 8;
  repaintCache.set(key, out);
  return out;
}

const _paint = new THREE.Color();

/**
 * Turn a stock vehicle's stylised materials into finished automotive ones:
 * the body paint takes the skin colour under a clearcoat, chrome becomes
 * polished metal, glass goes dark and reflective, tyres go matte black. The
 * mapping keys off the material names the Grab3D exports use
 * (`<model>_body_pbr`, `_paint_`, `_chrome_`, `_hubcap_`, `_window_glass_`,
 * `_tire_`, `_rim_`, `_roof_white_`).
 */
function finishVehicle(obj, { paint, stockPaint, minSat }) {
  _paint.setRGB(paint[0] / 255, paint[1] / 255, paint[2] / 255, THREE.SRGBColorSpace);
  const done = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    if (Array.isArray(src) || !src) return;
    let m = done.get(src);
    if (!m) {
      m = finishMaterial(src, stockPaint, paint, minSat);
      done.set(src, m);
    }
    o.material = m;
  });
  mergeByMaterial(obj);
}

/**
 * Collapse a model into one mesh per material. The vehicle glbs split into a
 * dozen nodes that mostly share a handful of finished materials; merging them
 * cuts the draw calls (times the shadow cascades) that made the models cost
 * several milliseconds a frame.
 */
function mergeByMaterial(obj) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const groups = new Map();
  const meshes = [];
  obj.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.isSkinnedMesh) return;
    const g = o.geometry;
    const key = `${o.material.uuid}|${g.index ? 1 : 0}|${Object.keys(g.attributes).sort().join(",")}`;
    const geo = g.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    geo.morphAttributes = {};
    let list = groups.get(key);
    if (!list) groups.set(key, (list = { material: o.material, geos: [] }));
    list.geos.push(geo);
    meshes.push(o);
  });
  if (meshes.length === 0) return;
  for (const o of meshes) o.removeFromParent();
  for (const { material, geos } of groups.values()) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = true;
    obj.add(mesh);
  }
}

function finishMaterial(src, stockPaint, paint, minSat) {
  const name = src.name ?? "";
  const phys = (extra) => {
    const m = new THREE.MeshPhysicalMaterial({
      name,
      color: src.color.clone(),
      map: src.map,
      normalMap: src.normalMap,
      normalScale: src.normalScale?.clone(),
      roughnessMap: src.roughnessMap,
      metalnessMap: src.metalnessMap,
      roughness: src.roughness,
      metalness: src.metalness,
      transparent: src.transparent,
      opacity: src.opacity,
      side: src.side,
    });
    Object.assign(m, extra);
    return m;
  };
  if (/_(body|tailgate)_pbr/.test(name)) {
    return phys({
      map: src.map ? repaintTexture(src.map, stockPaint, paint, minSat) : null,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      envMapIntensity: 1.0,
    });
  }
  if (/_(paint|rim)_/.test(name)) {
    return phys({
      color: _paint.clone(),
      metalness: 0.1,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      envMapIntensity: 1.0,
    });
  }
  if (/_(chrome|hubcap)_/.test(name)) {
    return phys({
      color: new THREE.Color(0.78, 0.8, 0.82),
      metalness: 1,
      roughness: 0.14,
      envMapIntensity: 1.6,
    });
  }
  if (/glass/.test(name)) {
    return phys({
      color: new THREE.Color(0.035, 0.045, 0.05),
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 2.2,
      depthWrite: false,
    });
  }
  if (/_tire_/.test(name)) {
    const m = phys({ roughness: 0.9, metalness: 0 });
    m.color.multiplyScalar(0.55);
    return m;
  }
  if (/_roof_white_/.test(name)) {
    return phys({ color: new THREE.Color(0.8, 0.77, 0.7), roughness: 0.36, clearcoat: 0.6 });
  }
  return src;
}

export function updateModelLods(lods, camera) {
  for (const lod of lods) lod.update(camera);
}
