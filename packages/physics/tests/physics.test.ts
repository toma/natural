import { expect, test } from "bun:test";
import { Active, LocalTransform, createGame, defineProject } from "@natural-engine/core";
import { Collider, RigidBody, createPhysics2DPlugin, createPhysics3DPlugin } from "../src/index.ts";

test("physics components reject unsafe geometry and material values", () => {
  expect(() => Collider.create({ radius: -1 })).toThrow("Invalid value");
  expect(() => Collider.create({ restitution: 2 })).toThrow("Invalid value");
  expect(() => RigidBody.create({ gravityScale: Number.NaN })).toThrow("Invalid value");
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
  expect(plugin.physics.bodies.size).toBe(1);
  plugin.physics.setLinearVelocity(entity, { x: 0, y: 0, z: 0 });
  plugin.physics.applyImpulse(entity, { x: 0, y: 1, z: 0 });
  game.world.destroyEntity(entity);
  await game.step(1 / 60);
  expect(plugin.physics.bodies.size).toBe(0);
  await game.dispose();
});
