import * as THREE from "three";

import { MAP_BOUNDS } from "./atomic-culdesac-layout.ts";
import {
  BACKDROP_WORLD,
  DEFAULT_CROP_MARGIN,
  insideCropBounds,
  normalizeBackdropMode,
  parseWorldMeta,
  pickSplatUrl,
  placeBackdrop,
} from "./backdrop-config.ts";

// Imported at runtime only, and only when the backdrop is set to 'splat', so the
// package is an optional dependency: a clean checkout, CI, and the pano/off paths
// never touch it. The specifier is held in a variable so neither the bundler nor
// the type checker tries to resolve it at build time. Install it to enable
// splats:  bun add @sparkjsdev/spark
const SPARK_MODULE = "@sparkjsdev/spark";
async function loadSpark() {
  try {
    return await import(/* @vite-ignore */ SPARK_MODULE);
  } catch (err) {
    console.warn(
      "[backdrop] Spark is not installed; falling back to pano/sky",
      err?.message ?? err,
    );
    return null;
  }
}

/**
 * Optional photoreal backdrop for the Atomic Cul-de-sac map.
 *
 * It renders a configured World Labs (or equivalent) capture as a ring of
 * distant scenery behind the playable map. It is content-neutral plumbing: it
 * renders whatever `BACKDROP_WORLD` points at, is OFF by default, and ships no
 * world. The procedural/glTF map remains the only source of gameplay geometry
 * and collision; `culdesac_collider.glb` is never used here.
 *
 * Quality (`ctx.config.backdrop`):
 *   'splat'  Gaussian splats through Spark, 500k on high / 150k on low.
 *   'pano'   equirectangular panorama on a far sky shell.
 *   'off'    nothing; the procedural sky shows through (default).
 *
 * Fallback chain: a 'splat' that cannot load (no Spark, fetch/WebGL failure)
 * drops to 'pano'; a 'pano' that cannot load drops to 'off'.
 */
export class BackdropSystem {
  static id = "backdrop";
  static deps = ["render"];

  async init(ctx) {
    this.ctx = ctx;
    this.group = null;
    this.splatMesh = null;
    this.sparkRenderer = null;
    this.panoMesh = null;
    this.panoTexture = null;

    const world = BACKDROP_WORLD;
    const mode = normalizeBackdropMode(ctx.config.backdrop, "off");
    if (mode === "off" || world === null) {
      if (mode !== "off" && world === null)
        console.info("[backdrop] enabled but no world configured (BACKDROP_WORLD is null); off");
      return;
    }

    this.group = new THREE.Group();
    this.group.name = "backdrop";
    ctx.scene.add(this.group);

    if (mode === "splat") {
      const ok = await this._initSplat(ctx, world).catch((err) => {
        console.warn("[backdrop] splat init failed; falling back to pano", err?.message ?? err);
        return false;
      });
      if (ok) {
        console.info("[backdrop] splat backdrop ready");
        return;
      }
    }

    const panoOk = await this._initPano(ctx, world).catch((err) => {
      console.warn("[backdrop] pano init failed; falling back to sky", err?.message ?? err);
      return false;
    });
    console.info(
      panoOk ? "[backdrop] pano backdrop ready" : "[backdrop] disabled (procedural sky)",
    );
  }

  async _initSplat(ctx, world) {
    const spark = await loadSpark();
    if (!spark?.SplatMesh) return false;

    const meta = parseWorldMeta(await this._fetchJson(world.meta));
    const url = pickSplatUrl(world, ctx.config.quality);

    const renderer = ctx.get("render").renderer;
    if (spark.SparkRenderer && renderer) {
      this.sparkRenderer = new spark.SparkRenderer({ renderer });
      this.group.add(this.sparkRenderer);
    }

    const mesh = new spark.SplatMesh({ url });
    this.splatMesh = mesh;
    // SplatMesh loads asynchronously. Support both the promise and callback APIs
    // across Spark versions; resolve either way so a slow or silent load cannot
    // wedge boot.
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      if (mesh.initialized?.then) mesh.initialized.then(done, done);
      if (typeof mesh.addEventListener === "function") mesh.addEventListener("load", done);
      mesh.onLoad = done;
      setTimeout(done, 15000);
    });

    const placed = placeBackdrop(meta, { flipToYUp: world.flipToYUp, transform: world.transform });
    mesh.position.fromArray(placed.position);
    mesh.rotation.set(placed.rotation[0], placed.rotation[1], placed.rotation[2]);
    mesh.scale.setScalar(placed.scale);
    mesh.updateMatrixWorld(true);

    this._cropToDistance(mesh);

    this.group.add(mesh);
    return true;
  }

  /**
   * Hide every splat whose world position sits inside the playable map (plus a
   * margin), so the backdrop only fills the horizon and never double-draws the
   * houses the real geometry already provides. Best-effort: if this Spark build
   * does not expose per-splat editing, the backdrop still renders uncropped.
   */
  _cropToDistance(mesh) {
    const bounds = MAP_BOUNDS;
    const margin = DEFAULT_CROP_MARGIN;
    const world = new THREE.Vector3();
    let hidden = 0;
    try {
      if (typeof mesh.forEachSplat !== "function") {
        console.info("[backdrop] splat editing API unavailable; backdrop left uncropped");
        return;
      }
      mesh.forEachSplat((index, center, scales, quaternion, opacity, color) => {
        world.copy(center).applyMatrix4(mesh.matrixWorld);
        if (insideCropBounds(world.x, world.z, bounds, margin)) {
          scales.setScalar(0);
          mesh.setSplat?.(index, center, scales, quaternion, 0, color);
          hidden += 1;
        }
      });
      if (mesh.packedSplats) mesh.packedSplats.needsUpdate = true;
      mesh.needsUpdate = true;
      console.info(`[backdrop] cropped ${hidden} splats inside the play area`);
    } catch (err) {
      console.warn("[backdrop] crop skipped", err?.message ?? err);
    }
  }

  async _initPano(ctx, world) {
    const texture = await new Promise((resolve) => {
      new THREE.TextureLoader().load(world.pano, resolve, undefined, () => {
        resolve(null);
      });
    });
    if (!texture) return false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    this.panoTexture = texture;

    // A large back-faced shell the camera sits inside. It is kept well within the
    // camera far plane and recentred on the camera every frame so it reads as an
    // infinitely distant horizon without ever clipping into the play space.
    const geo = new THREE.SphereGeometry(900, 48, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "backdrop-pano";
    mesh.renderOrder = -1;
    this.panoMesh = mesh;
    this.group.add(mesh);
    return true;
  }

  async _fetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  update(_dt, ctx) {
    if (this.panoMesh) this.panoMesh.position.copy(ctx.camera.position);
    if (this.sparkRenderer?.update)
      this.sparkRenderer.update({ scene: ctx.scene, camera: ctx.camera });
  }

  dispose() {
    if (this.group) this.ctx.scene.remove(this.group);
    this.splatMesh?.dispose?.();
    this.sparkRenderer?.dispose?.();
    this.panoMesh?.geometry?.dispose();
    this.panoMesh?.material?.dispose();
    this.panoTexture?.dispose();
  }
}
