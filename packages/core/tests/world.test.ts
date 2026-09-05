import { describe, expect, test } from "bun:test";
import { LocalTransform, defineComponent, World } from "../src/index.ts";

const Position = defineComponent({
  id: "test.position",
  defaults: () => ({ x: 0, y: 0 }),
});

describe("World", () => {
  test("generation-checks reused entities", () => {
    const world = new World();
    const first = world.createEntity();
    world.destroyEntity(first);
    const second = world.createEntity();
    expect(second.index).toBe(first.index);
    expect(second.generation).toBe(first.generation + 1);
    expect(() => world.add(first, Position)).toThrow("stale or destroyed");
  });

  test("queries typed component intersections", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 4 });
    const rows = [...world.query(Position)];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.components[0]).toEqual({ x: 4, y: 0 });
  });

  test("destroys child hierarchies and rejects cycles", () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    world.setParent(child, parent);
    expect(() => world.setParent(parent, child)).toThrow("cycles");
    world.destroyEntity(parent);
    expect(world.isAlive(child)).toBe(false);
  });

  test("sets, requires, removes, and clears components", () => {
    const world = new World();
    const entity = world.createEntity();
    world.set(entity, Position, { x: 2, y: 3 });
    expect(world.has(entity, Position)).toBe(true);
    expect(world.require(entity, Position)).toEqual({ x: 2, y: 3 });
    expect(world.parentOf(entity)).toBeNull();
    expect(world.remove(entity, Position)).toBe(true);
    expect(() => world.require(entity, Position)).toThrow("does not have");
    expect(world.definition(Position.id)).toBe(Position);
    expect(world.definitions()).toContain(Position);
    world.clear();
    expect(world.entityCount).toBe(0);
  });

  test("component creation validates merged values", () => {
    const world = new World();
    const entity = world.createEntity();
    expect(() => world.add(entity, LocalTransform, { position: { x: Number.NaN } })).toThrow(
      "Invalid value",
    );
  });
});
