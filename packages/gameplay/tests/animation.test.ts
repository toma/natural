import { expect, test } from "bun:test";
import { LocalTransform, World } from "@toma.com/core";
import { AnimationPlayer, animationSystem, defineAnimationClip } from "../src/animation.ts";

test("animation systems advance looping and finite clips", async () => {
  const world = new World();
  const entity = world.createEntity();
  world.add(entity, LocalTransform);
  const player = world.add(entity, AnimationPlayer, {
    playing: true,
    clip: {
      name: "move",
      duration: 1,
      loop: true,
      keyframes: [
        { time: 0, position: { x: 1 } },
        { time: 0.5, position: { x: 2 } },
      ],
    },
  });
  await animationSystem.run({ world, delta: 0.6, elapsed: 0, tick: 0, alpha: 0 });
  expect(world.require(entity, LocalTransform).position.x).toBe(2);
  await animationSystem.run({ world, delta: 0.6, elapsed: 0, tick: 0, alpha: 0 });
  expect(player.time).toBeCloseTo(0.2);
  player.clip = { ...player.clip!, loop: false };
  player.time = 0.9;
  await animationSystem.run({ world, delta: 0.2, elapsed: 0, tick: 0, alpha: 0 });
  expect(player.playing).toBe(false);
  expect(player.time).toBe(1);
});

test("animation clips validate and interpolate transform channels", async () => {
  const world = new World();
  const entity = world.createEntity();
  world.add(entity, LocalTransform);
  world.add(entity, AnimationPlayer, {
    playing: true,
    clip: defineAnimationClip({
      name: "blend",
      duration: 1,
      loop: false,
      keyframes: [
        { time: 0, position: { x: 0 }, rotation: { w: 1 } },
        { time: 1, position: { x: 10 }, rotation: { z: 1, w: 0 } },
      ],
    }),
  });
  await animationSystem.run({ world, delta: 0.25, elapsed: 0, tick: 0, alpha: 0 });
  expect(world.require(entity, LocalTransform).position.x).toBeCloseTo(2.5);
  expect(world.require(entity, LocalTransform).rotation.w).toBeCloseTo(0.948_683, 4);
  expect(() =>
    defineAnimationClip({ name: "bad", duration: 0, loop: false, keyframes: [] }),
  ).toThrow("positive");
  expect(() =>
    defineAnimationClip({
      name: "bad-channel",
      duration: 1,
      loop: false,
      keyframes: [{ time: 0, position: { x: Number.NaN } }],
    }),
  ).toThrow("finite");
  expect(() =>
    defineAnimationClip({
      name: "bad-order",
      duration: 1,
      loop: false,
      keyframes: [{ time: 0.8 }, { time: 0.2 }],
    }),
  ).toThrow("time-ordered");
});

test("animation handles reverse playback and shortest-path quaternion blending", async () => {
  const clip = defineAnimationClip({
    name: "reverse",
    duration: 1,
    loop: true,
    keyframes: [
      { time: 0, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { time: 1, rotation: { x: 0, y: 0, z: 0, w: -1 } },
    ],
  });
  expect(Object.isFrozen(clip.keyframes[0]?.rotation)).toBe(true);
  const world = new World();
  const entity = world.createEntity();
  world.add(entity, LocalTransform);
  const player = world.add(entity, AnimationPlayer, {
    clip,
    time: 0.1,
    speed: -1,
    playing: true,
  });
  await animationSystem.run({ world, delta: 0.2, elapsed: 0, tick: 0, alpha: 0 });
  expect(player.time).toBeCloseTo(0.9);
  expect(world.require(entity, LocalTransform).rotation.w).toBeCloseTo(1);
  player.clip = { ...clip, loop: false };
  player.time = 0.1;
  await animationSystem.run({ world, delta: 0.2, elapsed: 0, tick: 0, alpha: 0 });
  expect(player.time).toBe(0);
  expect(player.playing).toBe(false);
  expect(() => AnimationPlayer.create({ speed: Number.NaN })).toThrow("Invalid value");
});
