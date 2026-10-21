import { expect, test } from "bun:test";
import { World } from "@toma.com/core";
import { Health, RecoilSpring, WeaponState, applyDamage, hitscanDirection } from "../src/fps.ts";

test("weapon state enforces cadence, empty magazines, and tactical reloads", () => {
  const weapon = new WeaponState({ magazineSize: 2, startingReserve: 3, roundsPerMinute: 600 });
  expect(weapon.trigger()).toEqual({ fired: true });
  expect(weapon.trigger()).toEqual({ fired: false, reason: "cooldown" });
  weapon.tick(0.1);
  expect(weapon.trigger()).toEqual({ fired: true });
  weapon.tick(0.1);
  expect(weapon.trigger()).toEqual({ fired: false, reason: "empty" });
  expect(weapon.requestReload()).toBe(true);
  weapon.tick(weapon.config.reloadSeconds);
  expect({ magazine: weapon.magazine, reserve: weapon.reserve }).toEqual({
    magazine: 2,
    reserve: 1,
  });
});

test("damage clamps health and reports only the lethal transition", () => {
  const world = new World();
  world.register(Health);
  const entity = world.createEntity();
  world.add(entity, Health);
  expect(applyDamage(world, entity, 35)).toMatchObject({ current: 65, killed: false });
  expect(applyDamage(world, entity, 90)).toMatchObject({ current: 0, killed: true });
  expect(applyDamage(world, entity, 1)).toMatchObject({ current: 0, killed: false });
  expect(() => applyDamage(world, entity, -1)).toThrow("non-negative");
});

test("hitscan direction and recoil are deterministic and normalized", () => {
  const samples = [0.75, 0.25];
  const direction = hitscanDirection(0, 0, 0.1, () => samples.shift() ?? 0.5);
  expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 6);
  expect(direction.x).toBeGreaterThan(0);
  expect(direction.y).toBeLessThan(0);
  const recoil = new RecoilSpring(10);
  recoil.impulse(0.1, -0.05);
  recoil.tick(0.1);
  expect(recoil.pitch).toBeCloseTo(0.1 * Math.exp(-1), 6);
  expect(() => hitscanDirection(0, 0, -1)).toThrow("non-negative spread");
});
