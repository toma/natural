import * as THREE from "three";
import { createRendererPlugin } from "@toma.com/render";
import { createRuntime } from "../natural-runtime.ts";
import { Registry, EventBus } from "./registry.js";
import { FIXED_DT } from "./config.js";
import { Input } from "./input.js";
import { Rng } from "./rng.js";

/** Compatibility context for the port. Natural owns the runtime and renderer. */
export class Engine {
  constructor({ canvas, config }) {
    this.canvas = canvas;
    this.config = config;
    this.registry = new Registry();
    this.events = new EventBus();
    this.input = new Input(canvas, config);
    const seed = config.deterministic ? 0x5eed1234 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.rng = new Rng(seed);
    this.rendererPlugin = createRendererPlugin({
      canvas,
      backend: "webgl2",
      antialias: false,
      pixelRatio: 1,
    });
    this.naturalRenderer = this.rendererPlugin.renderer;
    this.scene = this.naturalRenderer.scene;
    this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.05, 1200);
    this.camera.rotation.order = "YXZ";
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(60, 1, 0.005, 12);
    this.time = { elapsed: 0, raw: 0, dt: 0, fixed: FIXED_DT, alpha: 0, scale: 1, frame: 0 };
    this.ctx = {
      engine: this,
      scene: this.scene,
      camera: this.camera,
      viewScene: this.viewScene,
      viewCamera: this.viewCamera,
      canvas,
      config,
      events: this.events,
      input: this.input,
      time: this.time,
      rng: this.rng,
      get: (id) => this.registry.get(id),
      peek: (id) => this.registry.peek(id),
      has: (id) => this.registry.has(id),
    };
    this._last = 0;
    this._onResize = () => this.resize();
  }

  add(SystemClass, opts) {
    this.registry.add(new SystemClass(opts));
    return this;
  }

  async init() {
    const systems = this.registry.resolve().map((system) => ({
      id: system.constructor.id,
      init: system.init?.bind(system),
      fixedUpdate: system.fixedUpdate?.bind(system),
      update: system.update?.bind(system),
      lateUpdate: system.lateUpdate?.bind(system),
      // NaturalRenderer releases the render pipeline after gameplay resources.
      dispose: system.constructor.id === "render" ? undefined : system.dispose?.bind(system),
    }));
    this.game = createRuntime({
      context: this.ctx,
      clock: this.time,
      systems,
      renderer: this.rendererPlugin,
      beginFrame: () => this.input.beginFrame(),
      endFrame: () => this.input.endFrame(),
    });
    this.game.onError.subscribe((error) => console.error("[natural] frame failed", error));
    await this.game.initialize();
    this.input.attach();
    addEventListener("resize", this._onResize);
    this.resize();
    return this;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || innerHeight);
    for (const camera of [this.camera, this.viewCamera]) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    this.naturalRenderer.resize(w, h);
    for (const sys of this.registry.with("resize")) {
      if (sys.constructor.id !== "render") sys.resize(w, h, this.ctx);
    }
    this.events.emit("resize", { width: w, height: h });
  }

  async start() {
    this._last = performance.now();
    await this.game.start();
  }

  stop() {
    this.game?.stop();
  }

  async step(now = performance.now()) {
    const delta = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this.game.setTimeScale(this.time.scale);
    await this.game.step(delta);
  }

  async dispose() {
    this.stop();
    removeEventListener("resize", this._onResize);
    this.input.detach();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    try {
      await this.game?.dispose();
    } finally {
      this.events.clear();
    }
  }
}
