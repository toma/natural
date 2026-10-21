import * as THREE from "three";

/** A selection-time still of the playable model, rendered by Natural's shared device. */
export class WeaponPreview {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.pending = "rifle";
    this.current = null;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xd7e4ed, 0x252326, 2.1));
    for (const [color, intensity, x, y, z] of [[0xffedcb, 3.5, 2, 4, 3], [0xb9d8f5, 3, -2, 1, -4]]) {
      const lamp = new THREE.DirectionalLight(color, intensity);
      lamp.position.set(x, y, z);
      this.scene.add(lamp);
    }
    this.camera = new THREE.PerspectiveCamera(26, 2.3, 0.005, 20);
    this.target = null;
    this.pixels = null;
    this.image = null;
  }

  select(id) { if (id !== this.current) this.pending = id; }

  update() {
    if (!this.pending) return;
    const entry = this.ctx.peek("weapons")?.viewmodel?.weapons.get(this.pending);
    const renderer = this.ctx.peek("render")?.renderer;
    if (!entry || !renderer) return;
    const id = this.pending;
    const width = 1400, height = 600;
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.UnsignedByteType });
      this.target.texture.colorSpace = THREE.SRGBColorSpace;
      this.pixels = new Uint8Array(width * height * 4);
      this.image = new ImageData(width, height);
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const model = entry.group.clone(true);
    model.visible = true;
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.scale.setScalar(1);
    model.traverse((node) => {
      node.matrixAutoUpdate = true;
      if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
    });
    const nodes = entry.model.nodes;
    for (const [part, key] of [["magazine", "magSeat"], ["charging", "chargeRest"], ["bolt", "boltRest"], ["slide", "slideRest"], ["trigger", "triggerPivot"], ["selector", "selectorPivot"]]) {
      const obj = model.getObjectByName(`${id}-${part}`);
      const node = nodes[key];
      if (obj && node) {
        obj.position.fromArray(node.pos);
        obj.rotation.fromArray(node.rot);
        obj.visible = !(id === "shotgun" && part === "magazine");
      }
    }
    this.scene.add(model);
    this.scene.environment = this.ctx.viewScene.environment;
    this.scene.environmentIntensity = 0.7;
    model.rotation.y = Math.PI * 0.52;
    model.rotation.z = -0.035;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(centre);
    const aspect = width / height;
    const fit = Math.max(size.y, size.x / aspect) * 0.64 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0.025, fit + size.z * 0.6);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    const prev = {
      target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), level: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
      auto: renderer.autoClear, tone: renderer.toneMapping, exposure: renderer.toneMappingExposure,
      shadow: renderer.shadowMap.autoUpdate,
    };
    try {
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.setRenderTarget(this.target);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.setClearColor(0x000000, 0);
      renderer.render(this.scene, this.camera);
      renderer.readRenderTargetPixels(this.target, 0, 0, width, height, this.pixels);
      for (let y = 0; y < height; y++) {
        const offset = (height - y - 1) * width * 4;
        this.image.data.set(this.pixels.subarray(offset, offset + width * 4), y * width * 4);
      }
      this.canvas.getContext("2d").putImageData(this.image, 0, 0);
      this.current = id;
      this.pending = null;
      this.canvas.dataset.weapon = id;
    } finally {
      this.scene.remove(model);
      renderer.setRenderTarget(prev.target, prev.face, prev.level);
      renderer.setViewport(prev.viewport);
      renderer.setScissor(prev.scissor);
      renderer.setScissorTest(prev.scissorTest);
      renderer.setClearColor(prev.color, prev.alpha);
      renderer.autoClear = prev.auto;
      renderer.toneMapping = prev.tone;
      renderer.toneMappingExposure = prev.exposure;
      renderer.shadowMap.autoUpdate = prev.shadow;
    }
  }

  dispose() {
    this.target?.dispose();
    this.scene.clear();
    this.pixels = this.image = null;
  }
}
