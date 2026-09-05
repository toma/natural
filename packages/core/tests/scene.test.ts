import { expect, test } from "bun:test";
import {
  builtinComponents,
  compileScene,
  defineScene,
  serializeScene,
  uuid,
  validateScene,
  World,
} from "../src/index.ts";

test("scene data round-trips through a world", () => {
  const world = new World();
  for (const component of builtinComponents) world.register(component);
  const scene = defineScene({
    version: 1,
    id: "00000000-0000-4000-8000-000000000001",
    name: "Scene",
    root: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Root",
      children: [{ id: "00000000-0000-4000-8000-000000000003", name: "Child" }],
    },
  });
  const compiled = compileScene(world, scene);
  const serialized = serializeScene(world, compiled.root, uuid(scene.id), scene.name);
  expect(serialized.root.children?.[0]?.name).toBe("Child");
  expect(world.entityCount).toBe(2);
});

test("scene validation rejects incompatible, duplicate, and unknown data", () => {
  expect(() => validateScene(null)).toThrow("object");
  expect(() => validateScene({ version: 1 })).toThrow("id");
  expect(() =>
    validateScene({
      version: 2,
      id: "00000000-0000-4000-8000-000000000001",
      name: "Future",
      root: { id: "00000000-0000-4000-8000-000000000002", name: "Root" },
    }),
  ).toThrow("Unsupported scene version");
  expect(() =>
    validateScene({
      version: 1,
      id: "00000000-0000-4000-8000-000000000001",
      name: "Duplicate",
      root: {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Root",
        children: [{ id: "00000000-0000-4000-8000-000000000002", name: "Child" }],
      },
    }),
  ).toThrow("Duplicate scene node id");
  const world = new World();
  for (const component of builtinComponents) world.register(component);
  expect(() =>
    compileScene(world, {
      version: 1,
      id: "00000000-0000-4000-8000-000000000001",
      name: "Unknown",
      root: {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Root",
        components: { "other.missing": {} },
      },
    }),
  ).toThrow("Unknown component");
});
