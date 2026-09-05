import { defineComponent, type Vec2, type Vec3 } from "@natural-engine/core";

export type Primitive3D = "box" | "sphere" | "plane";

export interface MeshRendererData {
  primitive: Primitive3D;
  color: string;
  emissive: string;
  metalness: number;
  roughness: number;
  wireframe: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  visible: boolean;
}

export interface SpriteRendererData {
  color: string;
  size: Vec2;
  opacity: number;
  layer: number;
  visible: boolean;
}

export interface Camera3DData {
  fov: number;
  near: number;
  far: number;
  priority: number;
}

export interface Camera2DData {
  size: number;
  near: number;
  far: number;
  priority: number;
}

export interface LightData {
  type: "ambient" | "directional" | "point";
  color: string;
  intensity: number;
  range: number;
  castShadow: boolean;
}

export interface InstancedMeshData {
  primitive: Primitive3D;
  color: string;
  count: number;
  spacing: Vec3;
}

export interface TilemapData {
  width: number;
  height: number;
  tileSize: Vec2;
  tiles: number[];
  color: string;
}

export interface ParticleEmitterData {
  count: number;
  color: string;
  size: number;
  spread: Vec3;
  seed: number;
  visible: boolean;
}

export interface TerrainData {
  width: number;
  depth: number;
  segmentsX: number;
  segmentsZ: number;
  heights: number[];
  color: string;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const primitive = (value: unknown): value is Primitive3D =>
  value === "box" || value === "sphere" || value === "plane";

export const MeshRenderer = defineComponent<MeshRendererData>({
  id: "natural.render.mesh",
  defaults: () => ({
    primitive: "box",
    color: "#ffffff",
    emissive: "#000000",
    metalness: 0,
    roughness: 1,
    wireframe: false,
    castShadow: true,
    receiveShadow: true,
    visible: true,
  }),
  validate: (value): value is MeshRendererData => {
    const data = value as Partial<MeshRendererData>;
    return (
      typeof value === "object" &&
      value !== null &&
      primitive(data.primitive) &&
      typeof data.color === "string" &&
      typeof data.emissive === "string" &&
      finite(data.metalness) &&
      data.metalness >= 0 &&
      data.metalness <= 1 &&
      finite(data.roughness) &&
      data.roughness >= 0 &&
      data.roughness <= 1 &&
      typeof data.wireframe === "boolean" &&
      typeof data.castShadow === "boolean" &&
      typeof data.receiveShadow === "boolean" &&
      typeof data.visible === "boolean"
    );
  },
});

export const SpriteRenderer = defineComponent<SpriteRendererData>({
  id: "natural.render.sprite",
  defaults: () => ({ color: "#ffffff", size: { x: 1, y: 1 }, opacity: 1, layer: 0, visible: true }),
  validate: (value): value is SpriteRendererData => {
    const data = value as Partial<SpriteRendererData>;
    return (
      typeof value === "object" &&
      value !== null &&
      typeof data.color === "string" &&
      positive(data.size?.x) &&
      positive(data.size?.y) &&
      finite(data.opacity) &&
      data.opacity >= 0 &&
      data.opacity <= 1 &&
      finite(data.layer) &&
      typeof data.visible === "boolean"
    );
  },
});

export const Camera3D = defineComponent<Camera3DData>({
  id: "natural.render.camera-3d",
  defaults: () => ({ fov: 60, near: 0.1, far: 10_000, priority: 0 }),
  validate: (value): value is Camera3DData => {
    const data = value as Partial<Camera3DData>;
    return (
      typeof value === "object" &&
      value !== null &&
      positive(data.fov) &&
      data.fov < 180 &&
      positive(data.near) &&
      positive(data.far) &&
      data.far > data.near &&
      finite(data.priority)
    );
  },
});

export const Camera2D = defineComponent<Camera2DData>({
  id: "natural.render.camera-2d",
  defaults: () => ({ size: 20, near: -1_000, far: 1_000, priority: 0 }),
  validate: (value): value is Camera2DData => {
    const data = value as Partial<Camera2DData>;
    return (
      typeof value === "object" &&
      value !== null &&
      positive(data.size) &&
      finite(data.near) &&
      finite(data.far) &&
      data.far > data.near &&
      finite(data.priority)
    );
  },
});

export const Light = defineComponent<LightData>({
  id: "natural.render.light",
  defaults: () => ({
    type: "directional",
    color: "#ffffff",
    intensity: 1,
    range: 20,
    castShadow: true,
  }),
  validate: (value): value is LightData => {
    const data = value as Partial<LightData>;
    return (
      typeof value === "object" &&
      value !== null &&
      (data.type === "ambient" || data.type === "directional" || data.type === "point") &&
      typeof data.color === "string" &&
      finite(data.intensity) &&
      data.intensity >= 0 &&
      positive(data.range) &&
      typeof data.castShadow === "boolean"
    );
  },
});

export const InstancedMesh = defineComponent<InstancedMeshData>({
  id: "natural.render.instanced-mesh",
  defaults: () => ({
    primitive: "box",
    color: "#ffffff",
    count: 1,
    spacing: { x: 1, y: 0, z: 1 },
  }),
  validate: (value): value is InstancedMeshData => {
    const data = value as Partial<InstancedMeshData>;
    return (
      typeof value === "object" &&
      value !== null &&
      primitive(data.primitive) &&
      typeof data.color === "string" &&
      Number.isSafeInteger(data.count) &&
      (data.count ?? -1) >= 0 &&
      (data.count ?? Infinity) <= 10_000_000 &&
      finite(data.spacing?.x) &&
      finite(data.spacing?.y) &&
      finite(data.spacing?.z)
    );
  },
});

export const Tilemap = defineComponent<TilemapData>({
  id: "natural.render.tilemap",
  defaults: () => ({ width: 1, height: 1, tileSize: { x: 1, y: 1 }, tiles: [1], color: "#ffffff" }),
  validate: (value): value is TilemapData => {
    const data = value as Partial<TilemapData>;
    return (
      typeof value === "object" &&
      value !== null &&
      Number.isSafeInteger(data.width) &&
      Number.isSafeInteger(data.height) &&
      (data.width ?? 0) > 0 &&
      (data.height ?? 0) > 0 &&
      positive(data.tileSize?.x) &&
      positive(data.tileSize?.y) &&
      Array.isArray(data.tiles) &&
      data.tiles.length === (data.width ?? 0) * (data.height ?? 0) &&
      data.tiles.every((tile) => Number.isSafeInteger(tile) && tile >= 0) &&
      typeof data.color === "string"
    );
  },
});

export const ParticleEmitter = defineComponent<ParticleEmitterData>({
  id: "natural.render.particles",
  defaults: () => ({
    count: 100,
    color: "#ffffff",
    size: 0.1,
    spread: { x: 1, y: 1, z: 1 },
    seed: 1,
    visible: true,
  }),
  validate: (value): value is ParticleEmitterData => {
    const data = value as Partial<ParticleEmitterData>;
    return (
      typeof value === "object" &&
      value !== null &&
      Number.isSafeInteger(data.count) &&
      (data.count ?? -1) >= 0 &&
      (data.count ?? Infinity) <= 10_000_000 &&
      typeof data.color === "string" &&
      positive(data.size) &&
      finite(data.spread?.x) &&
      finite(data.spread?.y) &&
      finite(data.spread?.z) &&
      Number.isSafeInteger(data.seed) &&
      typeof data.visible === "boolean"
    );
  },
});

export const Terrain = defineComponent<TerrainData>({
  id: "natural.render.terrain",
  defaults: () => ({
    width: 10,
    depth: 10,
    segmentsX: 10,
    segmentsZ: 10,
    heights: [],
    color: "#54705a",
  }),
  validate: (value): value is TerrainData => {
    const data = value as Partial<TerrainData>;
    const vertices = ((data.segmentsX ?? -1) + 1) * ((data.segmentsZ ?? -1) + 1);
    return (
      typeof value === "object" &&
      value !== null &&
      positive(data.width) &&
      positive(data.depth) &&
      Number.isSafeInteger(data.segmentsX) &&
      Number.isSafeInteger(data.segmentsZ) &&
      (data.segmentsX ?? 0) > 0 &&
      (data.segmentsZ ?? 0) > 0 &&
      vertices <= 4_000_000 &&
      Array.isArray(data.heights) &&
      data.heights.length <= vertices &&
      data.heights.every(finite) &&
      typeof data.color === "string"
    );
  },
});

export const renderComponents = [
  MeshRenderer,
  SpriteRenderer,
  Camera3D,
  Camera2D,
  Light,
  InstancedMesh,
  Tilemap,
  ParticleEmitter,
  Terrain,
] as const;
