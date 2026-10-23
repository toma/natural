import * as THREE from "three";

/**
 * Material id pass for the skin calibration tool (tools/worldlabs-skins.mjs).
 *
 * Renders the current camera once into an offscreen target with every mesh
 * swapped to a flat unlit colour that encodes its palette key: id `i + 1` for
 * `keys[i]`, 254 for any other mesh, and 0 where nothing is drawn (the sky).
 * Materials, visibility and instance colours are restored before returning,
 * so the next frame is untouched. Returns the ids top row first, base64.
 */
export function renderMaterialMask(engine, keys) {
  const world = engine.ctx.peek("world");
  const renderer = engine.ctx.peek("render")?.renderer;
  const A = world?.A;
  if (!A || !renderer) return { error: "world or renderer not ready" };
  const scene = engine.ctx.scene;
  const camera = engine.camera;
  const size = renderer.getSize(new THREE.Vector2());
  const w = Math.round(size.x);
  const h = Math.round(size.y);

  const flat = (id) =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(id / 255, 0, 0, THREE.LinearSRGBColorSpace),
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  const idOf = new Map();
  keys.forEach((key, i) => {
    const m = A.mat(key);
    if (m) idOf.set(m, flat(i + 1));
  });
  const other = flat(254);

  const restore = [];
  scene.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) {
      const swap = (m) => idOf.get(m) ?? other;
      const original = o.material;
      const instanceColor = o.instanceColor ?? null;
      restore.push(() => {
        o.material = original;
        if (instanceColor) o.instanceColor = instanceColor;
      });
      o.material = Array.isArray(original) ? original.map(swap) : swap(original);
      if (instanceColor) o.instanceColor = null;
    } else if ((o.isPoints || o.isSprite || o.isLine) && o.visible) {
      o.visible = false;
      restore.push(() => (o.visible = true));
    }
  });
  const dome = engine.ctx.peek("sky")?.dome?.mesh;
  if (dome?.visible) {
    dome.visible = false;
    restore.push(() => (dome.visible = true));
  }
  const background = scene.background;
  const fog = scene.fog;
  scene.background = null;
  scene.fog = null;

  const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
  const previous = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  const buf = new Uint8Array(w * h * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, buf);
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clear, alpha);
    scene.background = background;
    scene.fog = fog;
    for (const undo of restore) undo();
    target.dispose();
    other.dispose();
    for (const m of idOf.values()) m.dispose();
  }

  // GL rows run bottom-up; flip so row 0 is the top of the screen.
  const ids = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) ids[y * w + x] = buf[((h - 1 - y) * w + x) * 4];
  let bin = "";
  for (let i = 0; i < ids.length; i += 0x8000)
    bin += String.fromCharCode.apply(null, ids.subarray(i, i + 0x8000));
  return { width: w, height: h, ids: globalThis.btoa(bin) };
}
