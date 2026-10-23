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
import { loadSpark, waitForSplat } from "./spark.js";

/**
 * Optional photoreal backdrop for the Atomic Cul-de-sac map.
 *
 * It renders a configured World Labs (or equivalent) capture as a ring of
 * distant scenery behind the playable map. It is content-neutral plumbing: it
 * renders whatever `BACKDROP_WORLD` points at, is OFF by default, and ships no
 * world. The procedural/glTF map stays the source of gameplay geometry and
 * collision when this backdrop is in use. It stays off on the World Labs map
 * (`ctx.config.map === "worldlabs"`), where `worldlabs-map.js` draws the splat
 * as the level itself and uses `culdesac_collider.glb` for collision.
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
    // The World Labs map already draws this capture as the level itself.
    if (ctx.config.map === "worldlabs") return;
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
    await waitForSplat(mesh);

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
    // SparkRenderer sorts and refreshes itself in onBeforeRender; forcing
    // update() here every frame only regenerated the splats twice.
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
