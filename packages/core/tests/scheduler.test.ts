import { describe, expect, test } from "bun:test";
import { createGame, defineProject, defineSystem } from "../src/index.ts";

describe("Game scheduler", () => {
  test("runs fixed stages in dependency order", async () => {
    const game = createGame({ project: defineProject({ id: "test-game", name: "Test" }) });
    const calls: string[] = [];
    game.scheduler.add(
      defineSystem({
        name: "second",
        stage: "fixedUpdate",
        after: ["first"],
        run: () => {
          calls.push("second");
        },
      }),
      defineSystem({
        name: "first",
        stage: "fixedUpdate",
        run: () => {
          calls.push("first");
        },
      }),
    );
    await game.step(1 / 60);
    expect(calls).toEqual(["first", "second"]);
    expect(game.tick).toBe(1);
  });

  test("detects dependency cycles", async () => {
    const game = createGame({ project: defineProject({ id: "test-game", name: "Test" }) });
    game.scheduler.add(
      defineSystem({ name: "a", stage: "update", after: ["b"], run: () => undefined }),
      defineSystem({ name: "b", stage: "update", after: ["a"], run: () => undefined }),
    );
    expect(game.step(0)).rejects.toThrow("cycle");
  });
});
