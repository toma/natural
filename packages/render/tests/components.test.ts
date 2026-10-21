import { expect, test } from "bun:test";
import {
  Camera3D,
  InstancedMesh,
  MeshRenderer,
  ParticleEmitter,
  SpriteRenderer,
  Terrain,
  Tilemap,
} from "../src/components.ts";

test("render components create isolated defaults", () => {
  const first = SpriteRenderer.create({ size: { x: 4 } });
  const second = SpriteRenderer.create();
  expect(first.size).toEqual({ x: 4, y: 1 });
  expect(second.size).toEqual({ x: 1, y: 1 });
  expect(MeshRenderer.create().primitive).toBe("box");
  expect(MeshRenderer.create({ metalness: 0.8, roughness: 0.2 })).toMatchObject({
    metalness: 0.8,
    roughness: 0.2,
  });
  expect(
    MeshRenderer.create({ baseColorMap: "/asphalt.png", textureRepeat: { x: 4, y: 2 } }),
  ).toMatchObject({ baseColorMap: "/asphalt.png", textureRepeat: { x: 4, y: 2 } });
  expect(InstancedMesh.create().count).toBe(1);
  expect(Tilemap.create().tiles).toEqual([1]);
  expect(ParticleEmitter.create().count).toBe(100);
  expect(Terrain.create().segmentsX).toBe(10);
  expect(() => InstancedMesh.create({ count: -1 })).toThrow("Invalid value");
  expect(() => Tilemap.create({ width: 2, tiles: [1] })).toThrow("Invalid value");
  expect(() => Camera3D.create({ near: 10, far: 1 })).toThrow("Invalid value");
  expect(() => MeshRenderer.create({ metalness: 2 })).toThrow("Invalid value");
  expect(() => MeshRenderer.create({ textureRepeat: { x: 0 } })).toThrow("Invalid value");
});
