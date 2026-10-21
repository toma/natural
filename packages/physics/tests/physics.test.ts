import { expect, test } from "bun:test";
import { Active, LocalTransform, createGame, defineProject } from "@toma.com/core";
import { Collider, RigidBody, createPhysics2DPlugin, createPhysics3DPlugin } from "../src/index.ts";

test("physics components reject unsafe geometry and material values", () => {
  expect(() => Collider.create({ radius: -1 })).toThrow("Invalid value");
  expect(() => Collider.create({ restitution: 2 })).toThrow("Invalid value");
  expect(() => RigidBody.create({ gravityScale: Number.NaN })).toThrow("Invalid value");
  expect(() => createPhysics3DPlugin({ characterController: { offset: 0 } })).toThrow(
    "finite and positive",
  );
});

test("Rapier 2D advances dynamic bodies through the fixed physics stage", async () => {
  const plugin = createPhysics2DPlugin();
  const game = createGame({
    project: defineProject({ id: "physics-2d-test", name: "Physics 2D", plugins: [plugin] }),
  });
  await game.initialize();
  const entity = game.world.createEntity();
  game.world.add(entity, LocalTransform, { position: { y: 10 } });
  game.world.add(entity, RigidBody);
  game.world.add(entity, Collider, { shape: "sphere" });
  await game.step(1 / 60);
  await game.step(1 / 60);
  expect(game.world.require(entity, LocalTransform).position.y).toBeLessThan(10);
  expect(plugin.physics.bodies.size).toBe(1);
  plugin.physics.setLinearVelocity(entity, { x: 1, y: 0 });
  plugin.physics.applyImpulse(entity, { x: 0, y: 1 });
  expect(plugin.physics.castRay({ x: 0, y: 20 }, { x: 0, y: -1 }, 30)).not.toBeNull();
  game.world.add(entity, Active, { value: false });
  await game.step(1 / 60);
  expect(plugin.physics.bodies.size).toBe(0);
  await game.dispose();
});

test("Rapier emits ECS-addressable collision events", async () => {
  const plugin = createPhysics2DPlugin({ gravity: { x: 0, y: 0 } });
  const game = createGame({
    project: defineProject({ id: "collision-test", name: "Collisions", plugins: [plugin] }),
  });
  await game.initialize();
  const fixed = game.world.createEntity();
  game.world.add(fixed, LocalTransform);
  game.world.add(fixed, RigidBody, { type: "fixed" });
  game.world.add(fixed, Collider);
  const dynamic = game.world.createEntity();
  game.world.add(dynamic, LocalTransform);
  game.world.add(dynamic, RigidBody);
  game.world.add(dynamic, Collider);
  const collisions: Array<{ started: boolean }> = [];
  plugin.physics.onCollision.subscribe((event) => collisions.push(event));
  await game.step(1 / 60);
  expect(collisions.some((event) => event.started)).toBe(true);
  await game.dispose();
});

test("Rapier 3D advances bodies and supports ray queries", async () => {
  const plugin = createPhysics3DPlugin();
  const game = createGame({
    project: defineProject({ id: "physics-3d-test", name: "Physics 3D", plugins: [plugin] }),
  });
  await game.initialize();
  const entity = game.world.createEntity();
  game.world.add(entity, LocalTransform, { position: { y: 2 } });
  game.world.add(entity, RigidBody, { type: "fixed" });
  game.world.add(entity, Collider, { shape: "box" });
  await game.step(1 / 60);
  const hit = plugin.physics.castRay({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, 20);
  expect(hit).not.toBeNull();
  expect(
    plugin.physics.castRayEntity({ x: 0, y: 10, z: 0 }, { x: 0, y: -2, z: 0 }, 20),
  ).toMatchObject({ entity, distance: 7.5, normal: { x: 0, y: 1, z: 0 } });
  expect(() => plugin.physics.castRayEntity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1)).toThrow(
    "must not be zero",
  );
  expect(plugin.physics.bodies.size).toBe(1);
  plugin.physics.setLinearVelocity(entity, { x: 0, y: 0, z: 0 });
  plugin.physics.applyImpulse(entity, { x: 0, y: 1, z: 0 });
  game.world.destroyEntity(entity);
  await game.step(1 / 60);
  expect(plugin.physics.bodies.size).toBe(0);
  await game.dispose();
});

test("Rapier character controller moves a kinematic capsule and reports grounding", async () => {
  const plugin = createPhysics3DPlugin({ gravity: { x: 0, y: 0, z: 0 } });
  const game = createGame({
    project: defineProject({ id: "character-test", name: "Character", plugins: [plugin] }),
  });
  await game.initialize();
  const ground = game.world.createEntity();
  game.world.add(ground, LocalTransform, { position: { y: -0.5 }, scale: { x: 20, y: 1, z: 20 } });
  game.world.add(ground, RigidBody, { type: "fixed" });
  game.world.add(ground, Collider, { size: { x: 20, y: 1, z: 20 } });
  const player = game.world.createEntity();
  game.world.add(player, LocalTransform, { position: { y: 1 } });
  game.world.add(player, RigidBody, { type: "kinematic" });
  game.world.add(player, Collider, { shape: "capsule", radius: 0.35, height: 1.2 });
  await game.step(1 / 60);
  const result = plugin.physics.moveCharacter(game, player, { x: 1, y: -0.2, z: 0 });
  expect(result.movement.x).toBeGreaterThan(0.9);
  expect(game.world.require(player, LocalTransform).position.x).toBeGreaterThan(0.9);
  expect(() => plugin.physics.moveCharacter(game, ground, { x: 1, y: 0, z: 0 })).toThrow(
    "must be kinematic",
  );
  await game.dispose();
});
