import { expect, test } from "bun:test";
import {
  Active,
  LocalTransform,
  World,
  WorldTransform,
  composeTransforms,
  isEntityActive,
  updateWorldTransforms,
} from "../src/index.ts";

test("hierarchy transforms compose translation, rotation, and scale", () => {
  const world = new World();
  const parent = world.createEntity();
  const child = world.createEntity();
  world.add(parent, LocalTransform, {
    position: { x: 10, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
    scale: { x: 2, y: 2, z: 2 },
  });
  world.add(child, LocalTransform, { position: { x: 1, y: 0, z: 0 } });
  world.setParent(child, parent);
  updateWorldTransforms(world);
  const transform = world.require(child, WorldTransform);
  expect(transform.position.x).toBeCloseTo(10);
  expect(transform.position.y).toBeCloseTo(2);
  expect(transform.scale).toEqual({ x: 2, y: 2, z: 2 });

  world.require(parent, LocalTransform).position.x = 20;
  updateWorldTransforms(world);
  expect(world.require(child, WorldTransform).position.x).toBeCloseTo(20);
});

test("active state is inherited and transform composition normalizes rotations", () => {
  const world = new World();
  const parent = world.createEntity();
  const child = world.createEntity();
  world.add(parent, Active, { value: false });
  world.setParent(child, parent);
  expect(isEntityActive(world, child)).toBe(false);
  world.require(parent, Active).value = true;
  expect(isEntityActive(world, child)).toBe(true);

  const result = composeTransforms(
    {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 2 },
      scale: { x: 1, y: 1, z: 1 },
    },
    {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 2 },
      scale: { x: 1, y: 1, z: 1 },
    },
  );
  expect(result.rotation.w).toBe(1);
});
