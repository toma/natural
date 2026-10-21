import { describe, expect, test } from "bun:test";
import { definePlugin, defineProject, defineSystem } from "@toma.com/core";
import { createRuntime, type FrameClock, type Subsystem } from "../src/natural-runtime.ts";

const clock = (): FrameClock => ({
  elapsed: 0,
  raw: 0,
  dt: 0,
  fixed: 1 / 120,
  alpha: 0,
  scale: 1,
  frame: 0,
});

function fixture(failing = false) {
  const log: string[] = [];
  const time = clock();
  const systems: Array<Subsystem<string[]>> = ["physics", "player"].map((id) => ({
    id,
    init() {
      log.push(`init:${id}`);
      if (failing && id === "player") throw new Error("init failure");
    },
    fixedUpdate(dt, context) {
      expect(context).toBe(log);
      expect(dt).toBe(1 / 120);
      log.push(`fixed:${id}`);
    },
    update: () => log.push(`update:${id}`),
    lateUpdate: () => log.push(`late:${id}`),
    dispose: () => log.push(`dispose:${id}`),
  }));
  systems.push({ id: "empty" });
  const game = createRuntime({
    context: log,
    clock: time,
    systems,
    beginFrame: () => log.push("input"),
    endFrame: () => log.push("end"),
    renderer: definePlugin({
      id: "natural.renderer",
      setup(game) {
        game.scheduler.add(
          defineSystem({
            name: "natural.renderer.sync",
            stage: "render",
            run: () => {
              log.push("render");
            },
          }),
        );
      },
      dispose: () => {
        log.push("dispose:renderer");
      },
    }),
  });
  return { game, time, log };
}

describe("NaturalFPS", () => {
  test("runs original frame phases and two 120 Hz physics ticks per capture frame", async () => {
    const { game, time, log } = fixture();
    await game.initialize();
    log.length = 0;
    await game.step(1 / 60);
    expect(log).toEqual([
      "input",
      "fixed:physics",
      "fixed:player",
      "fixed:physics",
      "fixed:player",
      "update:physics",
      "update:player",
      "late:physics",
      "late:player",
      "render",
      "end",
    ]);
    expect(game.tick).toBe(2);
    expect(time.frame).toBe(1);
    expect(time.elapsed).toBe(1 / 60);
    expect(time.alpha).toBe(0);
    await game.dispose();
    expect(log.slice(-3)).toEqual(["dispose:player", "dispose:physics", "dispose:renderer"]);
  });
  test("preserves upstream's eight-step backlog cap without a catch-up burst", async () => {
    const { game, time } = fixture();
    await game.step(1);
    expect(game.tick).toBe(8);
    expect(time.dt).toBe(0.1);
    expect(time.alpha).toBe(0);
    await game.step(1 / 120);
    expect(game.tick).toBe(9);
    await game.dispose();
  });
  test("cleans partial initialization and earlier subsystems in reverse order", async () => {
    const { game, log } = fixture(true);
    expect(game.initialize()).rejects.toThrow("init failure");
    expect(log).toEqual([
      "init:physics",
      "init:player",
      "dispose:player",
      "dispose:physics",
      "dispose:renderer",
    ]);
    expect(game.disposed).toBe(true);
  });
  test("rejects invalid fixed-step caps", () => {
    for (const maxFixedSteps of [0, -1, 1.5, Infinity, NaN]) {
      expect(() => defineProject({ id: "bad-cap", name: "Bad cap", maxFixedSteps })).toThrow(
        "maxFixedSteps",
      );
    }
  });
  test("keeps the menu clock moving while simulation time is frozen", async () => {
    const { game, time } = fixture();
    await game.step(1 / 60);
    game.setTimeScale(0);
    await game.step(1 / 60);
    expect(game.tick).toBe(2);
    expect(time.raw).toBe(1 / 30);
    expect(time.elapsed).toBe(1 / 60);
    expect(time.dt).toBe(0);
    game.setTimeScale(1);
    await game.step(1 / 60);
    expect(game.tick).toBe(4);
    await game.dispose();
  });
});
