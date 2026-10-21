import {
  WorldTransform,
  definePlugin,
  defineSystem,
  isEntityActive,
  type EnginePlugin,
  type Entity,
  type Game,
  type Transform,
} from "@toma.com/core";
import {
  AmbientLight,
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  InstancedMesh as ThreeInstancedMesh,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Points,
  PointsMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  WebGLRenderer,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  Camera2D,
  Camera3D,
  InstancedMesh,
  Light,
  MeshRenderer,
  ParticleEmitter,
  renderComponents,
  SpriteRenderer,
  Terrain,
  Tilemap,
} from "./components.ts";

export interface RendererOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  antialias?: boolean;
  forceWebGL?: boolean;
  clearColor?: string;
  pixelRatio?: number;
  backend?: "webgpu" | "webgl2";
}

/** A renderer-owned pass chain. Dispose releases its targets and materials. */
export interface RenderPipeline {
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface RenderStats {
  objects: number;
  drawCalls: number;
  triangles: number;
}

function applyTransform(object: Object3D, transform: Transform): void {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.quaternion.set(
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
    transform.rotation.w,
  );
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

function entityKey(entity: Entity): string {
  return `${entity.index}:${entity.generation}`;
}

export class NaturalRenderer {
  readonly scene = new Scene();
  readonly renderer: WebGPURenderer | WebGLRenderer;
  #pipeline: RenderPipeline | null = null;
  readonly #objects = new Map<string, Object3D>();
  readonly #signatures = new Map<string, string>();
  readonly #textures = new Map<string, Promise<Texture>>();
  readonly #textureLoader = new TextureLoader();
  #camera: Camera | null = null;
  #width = 1;
  #height = 1;

  constructor(readonly options: RendererOptions = {}) {
    const parameters: NonNullable<ConstructorParameters<typeof WebGPURenderer>[0]> = {
      antialias: options.antialias ?? true,
      ...(options.canvas === undefined ? {} : { canvas: options.canvas as HTMLCanvasElement }),
      forceWebGL: options.forceWebGL ?? false,
    };
    this.renderer =
      options.backend === "webgl2"
        ? new WebGLRenderer({
            ...(options.canvas === undefined ? {} : { canvas: options.canvas }),
            antialias: options.antialias ?? true,
            alpha: false,
            depth: true,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
          })
        : new WebGPURenderer(parameters);
    this.renderer.setPixelRatio(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1);
    this.renderer.setClearColor(new Color(options.clearColor ?? "#111827"));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = ACESFilmicToneMapping;
  }

  async initialize(): Promise<void> {
    if (this.renderer instanceof WebGPURenderer) await this.renderer.init();
  }

  setPipeline(pipeline: RenderPipeline | null): void {
    if (pipeline === this.#pipeline) return;
    this.#pipeline?.dispose();
    this.#pipeline = pipeline;
  }

  resize(width: number, height: number): void {
    this.#width = Math.max(1, width);
    this.#height = Math.max(1, height);
    if (this.#pipeline !== null) {
      this.#pipeline.resize(this.#width, this.#height);
      return;
    }
    this.renderer.setSize(this.#width, this.#height, false);
    if (this.#camera instanceof PerspectiveCamera) {
      this.#camera.aspect = this.#width / this.#height;
      this.#camera.updateProjectionMatrix();
    }
  }

  sync(game: Game): void {
    const seen = new Set<string>();
    for (const row of game.world.query(WorldTransform, MeshRenderer)) {
      const [transform, meshData] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const object = this.#objects.get(key);
      let mesh: Mesh;
      if (
        !(object instanceof Mesh) ||
        object instanceof ThreeInstancedMesh ||
        object.userData.kind === "sprite"
      ) {
        mesh = new Mesh(
          this.#geometry(meshData.primitive),
          new MeshStandardMaterial({ color: meshData.color }),
        );
        this.#replace(key, mesh);
      } else {
        mesh = object;
      }
      applyTransform(mesh, transform);
      mesh.visible = meshData.visible && isEntityActive(game.world, row.entity);
      mesh.castShadow = meshData.castShadow;
      mesh.receiveShadow = meshData.receiveShadow;
      const material = mesh.material as MeshStandardMaterial;
      material.color.set(meshData.color);
      material.emissive.set(meshData.emissive);
      material.metalness = meshData.metalness;
      material.roughness = meshData.roughness;
      material.wireframe = meshData.wireframe;
      this.#syncMaterialTextures(key, material, meshData);
    }
    for (const row of game.world.query(WorldTransform, SpriteRenderer)) {
      const [transform, sprite] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const object = this.#objects.get(key);
      let mesh: Mesh;
      if (
        !(object instanceof Mesh) ||
        object instanceof ThreeInstancedMesh ||
        object.userData.kind !== "sprite"
      ) {
        const material = new MeshStandardMaterial({
          color: sprite.color,
          transparent: true,
          opacity: sprite.opacity,
        });
        mesh = new Mesh(new PlaneGeometry(1, 1), material);
        mesh.userData.kind = "sprite";
        this.#replace(key, mesh);
      } else {
        mesh = object;
      }
      applyTransform(mesh, transform);
      mesh.scale.x *= sprite.size.x;
      mesh.scale.y *= sprite.size.y;
      mesh.position.z = sprite.layer;
      mesh.visible = sprite.visible && isEntityActive(game.world, row.entity);
      const material = mesh.material as MeshStandardMaterial;
      material.color.set(sprite.color);
      material.opacity = sprite.opacity;
    }
    for (const row of game.world.query(WorldTransform, InstancedMesh)) {
      const [transform, data] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const signature = JSON.stringify(data);
      const object = this.#objects.get(key);
      let instances: ThreeInstancedMesh;
      if (
        !(object instanceof ThreeInstancedMesh) ||
        object.userData.kind !== "instances" ||
        object.count !== data.count
      ) {
        instances = new ThreeInstancedMesh(
          this.#geometry(data.primitive),
          new MeshStandardMaterial({ color: data.color }),
          data.count,
        );
        instances.userData.kind = "instances";
        this.#replace(key, instances);
      } else {
        instances = object;
      }
      applyTransform(instances, transform);
      instances.visible = isEntityActive(game.world, row.entity);
      (instances.material as MeshStandardMaterial).color.set(data.color);
      if (this.#signatures.get(key) !== signature) {
        const matrix = new Matrix4();
        const side = Math.max(1, Math.ceil(Math.sqrt(data.count)));
        for (let index = 0; index < data.count; index += 1) {
          const x = (index % side) * data.spacing.x;
          const z = Math.floor(index / side) * data.spacing.z;
          matrix.makeTranslation(x, data.spacing.y * index, z);
          instances.setMatrixAt(index, matrix);
        }
        instances.instanceMatrix.needsUpdate = true;
        this.#signatures.set(key, signature);
      }
    }
    for (const row of game.world.query(WorldTransform, Tilemap)) {
      const [transform, data] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const activeTiles = data.tiles.reduce((count, tile) => count + (tile === 0 ? 0 : 1), 0);
      const signature = JSON.stringify(data);
      const previous = this.#objects.get(key);
      let instances: ThreeInstancedMesh;
      if (
        !(previous instanceof ThreeInstancedMesh) ||
        previous.userData.kind !== "tilemap" ||
        previous.count !== activeTiles
      ) {
        instances = new ThreeInstancedMesh(
          new PlaneGeometry(1, 1),
          new MeshStandardMaterial({ color: data.color }),
          activeTiles,
        );
        instances.userData.kind = "tilemap";
        this.#replace(key, instances);
      } else {
        instances = previous;
      }
      applyTransform(instances, transform);
      instances.visible = isEntityActive(game.world, row.entity);
      (instances.material as MeshStandardMaterial).color.set(data.color);
      if (this.#signatures.get(key) !== signature) {
        const matrix = new Matrix4();
        let instance = 0;
        for (let index = 0; index < data.tiles.length; index += 1) {
          if (data.tiles[index] === 0) continue;
          matrix.makeScale(data.tileSize.x, data.tileSize.y, 1);
          matrix.setPosition(
            (index % data.width) * data.tileSize.x,
            Math.floor(index / data.width) * data.tileSize.y,
            0,
          );
          instances.setMatrixAt(instance++, matrix);
        }
        instances.instanceMatrix.needsUpdate = true;
        this.#signatures.set(key, signature);
      }
    }
    for (const row of game.world.query(WorldTransform, ParticleEmitter)) {
      const [transform, data] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const signature = JSON.stringify(data);
      const previous = this.#objects.get(key);
      let points: Points;
      if (!(previous instanceof Points) || this.#signatures.get(key) !== signature) {
        let random = data.seed >>> 0 || 1;
        const positions = new Float32Array(data.count * 3);
        for (let index = 0; index < positions.length; index += 1) {
          random ^= random << 13;
          random ^= random >>> 17;
          random ^= random << 5;
          const spread =
            index % 3 === 0 ? data.spread.x : index % 3 === 1 ? data.spread.y : data.spread.z;
          positions[index] = ((random >>> 0) / 0x1_0000_0000 - 0.5) * spread;
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        points = new Points(geometry, new PointsMaterial({ color: data.color, size: data.size }));
        points.userData.kind = "particles";
        this.#replace(key, points);
        this.#signatures.set(key, signature);
      } else {
        points = previous;
      }
      applyTransform(points, transform);
      points.visible = data.visible && isEntityActive(game.world, row.entity);
    }
    for (const row of game.world.query(WorldTransform, Terrain)) {
      const [transform, data] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const signature = JSON.stringify(data);
      const previous = this.#objects.get(key);
      let terrain: Mesh;
      if (
        !(previous instanceof Mesh) ||
        previous instanceof ThreeInstancedMesh ||
        previous.userData.kind !== "terrain" ||
        this.#signatures.get(key) !== signature
      ) {
        const geometry = new PlaneGeometry(data.width, data.depth, data.segmentsX, data.segmentsZ);
        geometry.rotateX(-Math.PI / 2);
        const positions = geometry.getAttribute("position");
        for (let index = 0; index < positions.count; index += 1)
          positions.setY(index, data.heights[index] ?? 0);
        geometry.computeVertexNormals();
        terrain = new Mesh(geometry, new MeshStandardMaterial({ color: data.color }));
        terrain.userData.kind = "terrain";
        terrain.receiveShadow = true;
        this.#replace(key, terrain);
        this.#signatures.set(key, signature);
      } else {
        terrain = previous;
      }
      applyTransform(terrain, transform);
      terrain.visible = isEntityActive(game.world, row.entity);
    }
    for (const row of game.world.query(WorldTransform, Light)) {
      const [transform, data] = row.components;
      const key = entityKey(row.entity);
      seen.add(key);
      const previous = this.#objects.get(key);
      const expected = data.type;
      let object: AmbientLight | PointLight | DirectionalLight;
      if (
        previous?.userData.kind !== expected ||
        !(
          previous instanceof AmbientLight ||
          previous instanceof PointLight ||
          previous instanceof DirectionalLight
        )
      ) {
        object =
          data.type === "ambient"
            ? new AmbientLight(data.color, data.intensity)
            : data.type === "point"
              ? new PointLight(data.color, data.intensity, data.range)
              : new DirectionalLight(data.color, data.intensity);
        object.userData.kind = expected;
        this.#replace(key, object);
      } else {
        object = previous;
      }
      applyTransform(object, transform);
      object.intensity = data.intensity;
      object.color.set(data.color);
      object.castShadow = data.castShadow;
      object.visible = isEntityActive(game.world, row.entity);
    }
    this.#syncCamera(game, seen);
    for (const [key, object] of this.#objects) {
      if (!seen.has(key)) {
        this.#disposeObject(object);
        this.scene.remove(object);
        this.#objects.delete(key);
        this.#signatures.delete(key);
      }
    }
  }

  render(): void {
    if (this.#pipeline !== null) {
      this.#pipeline.render();
      return;
    }
    if (this.#camera !== null) void this.renderer.render(this.scene, this.#camera);
  }

  stats(): RenderStats {
    const info = this.renderer.info.render;
    return { objects: this.#objects.size, drawCalls: info.calls, triangles: info.triangles };
  }

  get activeCamera(): Camera | null {
    return this.#camera;
  }

  dispose(): void {
    this.#pipeline?.dispose();
    this.#pipeline = null;
    for (const object of this.#objects.values()) this.#disposeObject(object);
    this.#objects.clear();
    this.#signatures.clear();
    for (const texture of this.#textures.values())
      void texture.then((value) => value.dispose()).catch(() => undefined);
    this.#textures.clear();
    this.renderer.dispose();
  }

  #syncCamera(game: Game, seen: Set<string>): void {
    const cameras: Array<{
      entity: Entity;
      transform: Transform;
      camera: unknown;
      priority: number;
      type: "2d" | "3d";
    }> = [];
    for (const row of game.world.query(WorldTransform, Camera3D)) {
      if (!isEntityActive(game.world, row.entity)) continue;
      cameras.push({
        entity: row.entity,
        transform: row.components[0],
        camera: row.components[1],
        priority: row.components[1].priority,
        type: "3d",
      });
    }
    for (const row of game.world.query(WorldTransform, Camera2D)) {
      if (!isEntityActive(game.world, row.entity)) continue;
      cameras.push({
        entity: row.entity,
        transform: row.components[0],
        camera: row.components[1],
        priority: row.components[1].priority,
        type: "2d",
      });
    }
    cameras.sort((left, right) => right.priority - left.priority);
    const active = cameras[0];
    if (active === undefined) {
      this.#camera = null;
      return;
    }
    const key = entityKey(active.entity);
    seen.add(key);
    const previous = this.#objects.get(key);
    let camera: PerspectiveCamera | OrthographicCamera;
    if (active.type === "3d") {
      const data = active.camera as { fov: number; near: number; far: number };
      if (!(previous instanceof PerspectiveCamera)) {
        camera = new PerspectiveCamera(data.fov, this.#width / this.#height, data.near, data.far);
        this.#replace(key, camera);
      } else {
        camera = previous;
      }
      camera.fov = data.fov;
      camera.near = data.near;
      camera.far = data.far;
      camera.aspect = this.#width / this.#height;
      camera.updateProjectionMatrix();
    } else {
      const data = active.camera as { size: number; near: number; far: number };
      const aspect = this.#width / this.#height;
      if (!(previous instanceof OrthographicCamera)) {
        camera = new OrthographicCamera(
          -data.size * aspect,
          data.size * aspect,
          data.size,
          -data.size,
          data.near,
          data.far,
        );
        this.#replace(key, camera);
      } else {
        camera = previous;
      }
      camera.left = -data.size * aspect;
      camera.right = data.size * aspect;
      camera.top = data.size;
      camera.bottom = -data.size;
      camera.near = data.near;
      camera.far = data.far;
      camera.updateProjectionMatrix();
    }
    applyTransform(camera, active.transform);
    this.#camera = camera;
  }

  #replace(key: string, object: Object3D): void {
    const previous = this.#objects.get(key);
    if (previous !== undefined) {
      this.scene.remove(previous);
      this.#disposeObject(previous);
    }
    this.#signatures.delete(key);
    this.#objects.set(key, object);
    this.scene.add(object);
  }

  #geometry(primitive: "box" | "sphere" | "plane"): BoxGeometry | SphereGeometry | PlaneGeometry {
    if (primitive === "sphere") return new SphereGeometry(0.5, 24, 16);
    if (primitive === "plane") return new PlaneGeometry(1, 1);
    return new BoxGeometry(1, 1, 1);
  }

  #syncMaterialTextures(
    objectKey: string,
    material: MeshStandardMaterial,
    data: {
      baseColorMap: string | null;
      normalMap: string | null;
      roughnessMap: string | null;
      metalnessMap: string | null;
      aoMap: string | null;
      textureRepeat: { x: number; y: number };
    },
  ): void {
    const signature = JSON.stringify([
      data.baseColorMap,
      data.normalMap,
      data.roughnessMap,
      data.metalnessMap,
      data.aoMap,
      data.textureRepeat,
    ]);
    if (material.userData.textureSignature === signature) return;
    material.userData.textureSignature = signature;
    const slots = [
      ["map", data.baseColorMap, true],
      ["normalMap", data.normalMap, false],
      ["roughnessMap", data.roughnessMap, false],
      ["metalnessMap", data.metalnessMap, false],
      ["aoMap", data.aoMap, false],
    ] as const;
    for (const [slot, source, color] of slots) {
      if (source === null || source.trim() === "") {
        material[slot] = null;
        continue;
      }
      void this.#loadTexture(source, data.textureRepeat.x, data.textureRepeat.y, color)
        .then((texture) => {
          const object = this.#objects.get(objectKey);
          if (!(object instanceof Mesh) || object.material !== material) return;
          if (material.userData.textureSignature !== signature) return;
          material[slot] = texture;
          material.needsUpdate = true;
        })
        .catch(() => undefined);
    }
    material.needsUpdate = true;
  }

  #loadTexture(source: string, repeatX: number, repeatY: number, color: boolean): Promise<Texture> {
    const cacheKey = JSON.stringify([source, repeatX, repeatY, color]);
    const cached = this.#textures.get(cacheKey);
    if (cached !== undefined) return cached;
    const pending = this.#textureLoader.loadAsync(source).then((texture) => {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      if (color) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
    this.#textures.set(cacheKey, pending);
    void pending.catch(() => {
      if (this.#textures.get(cacheKey) === pending) this.#textures.delete(cacheKey);
    });
    return pending;
  }

  #disposeObject(object: Object3D): void {
    if (
      object instanceof Mesh ||
      object instanceof ThreeInstancedMesh ||
      object instanceof Points
    ) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials as Material[]) material.dispose();
    }
  }
}

export function createRendererPlugin(
  options: RendererOptions = {},
): EnginePlugin & { readonly renderer: NaturalRenderer } {
  const naturalRenderer = new NaturalRenderer(options);
  const plugin = {
    id: "natural.renderer",
    renderer: naturalRenderer,
    setup: async (game: Game) => {
      for (const component of renderComponents) game.world.register(component);
      await naturalRenderer.initialize();
      game.scheduler.add(
        defineSystem({
          name: "natural.renderer.sync",
          stage: "render",
          after: ["natural.transforms"],
          run: () => {
            naturalRenderer.sync(game);
            naturalRenderer.render();
          },
        }),
      );
    },
    dispose: () => naturalRenderer.dispose(),
  };
  return definePlugin(plugin) as EnginePlugin & { readonly renderer: NaturalRenderer };
}
