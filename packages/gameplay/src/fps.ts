import { defineComponent, type Entity, type Vec3, type World } from "@toma.com/core";

export interface HealthData {
  current: number;
  maximum: number;
  alive: boolean;
}

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const Health = defineComponent<HealthData>({
  id: "natural.gameplay.health",
  defaults: () => ({ current: 100, maximum: 100, alive: true }),
  validate: (value): value is HealthData => {
    const data = value as Partial<HealthData>;
    return (
      typeof value === "object" &&
      value !== null &&
      finiteNonNegative(data.current) &&
      finiteNonNegative(data.maximum) &&
      data.maximum > 0 &&
      data.current <= data.maximum &&
      typeof data.alive === "boolean" &&
      data.alive === data.current > 0
    );
  },
});

export interface DamageResult {
  previous: number;
  current: number;
  amount: number;
  killed: boolean;
}

export function applyDamage(world: World, entity: Entity, amount: number): DamageResult {
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error("Damage must be finite and non-negative");
  const health = world.require(entity, Health);
  const previous = health.current;
  health.current = Math.max(0, previous - amount);
  health.alive = health.current > 0;
  return { previous, current: health.current, amount, killed: previous > 0 && !health.alive };
}

export interface WeaponConfig {
  magazineSize: number;
  startingReserve: number;
  roundsPerMinute: number;
  reloadSeconds: number;
  damage: number;
  headshotMultiplier: number;
  hipSpread: number;
  adsSpread: number;
}

export const defaultRifleConfig: Readonly<WeaponConfig> = Object.freeze({
  magazineSize: 30,
  startingReserve: 120,
  roundsPerMinute: 720,
  reloadSeconds: 1.9,
  damage: 34,
  headshotMultiplier: 1.65,
  hipSpread: 0.012,
  adsSpread: 0.0025,
});

export type WeaponAction =
  { fired: true } | { fired: false; reason: "cooldown" | "empty" | "reloading" };

export class WeaponState {
  readonly config: Readonly<WeaponConfig>;
  magazine: number;
  reserve: number;
  cooldown = 0;
  reloadRemaining = 0;

  constructor(config: Partial<WeaponConfig> = {}) {
    const resolved = { ...defaultRifleConfig, ...config };
    for (const [name, value] of Object.entries(resolved)) {
      if (!Number.isFinite(value) || value < 0)
        throw new Error(`Weapon ${name} must be finite and non-negative`);
    }
    if (
      !Number.isSafeInteger(resolved.magazineSize) ||
      resolved.magazineSize <= 0 ||
      !Number.isSafeInteger(resolved.startingReserve) ||
      resolved.roundsPerMinute <= 0 ||
      resolved.reloadSeconds <= 0 ||
      resolved.headshotMultiplier <= 0
    )
      throw new Error("Weapon configuration is outside supported bounds");
    this.config = Object.freeze(resolved);
    this.magazine = resolved.magazineSize;
    this.reserve = resolved.startingReserve;
  }

  get reloading(): boolean {
    return this.reloadRemaining > 0;
  }

  tick(delta: number): void {
    if (!Number.isFinite(delta) || delta < 0)
      throw new Error("Weapon delta must be finite and non-negative");
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (!this.reloading) return;
    this.reloadRemaining = Math.max(0, this.reloadRemaining - delta);
    if (this.reloadRemaining > 0) return;
    const loaded = Math.min(this.config.magazineSize - this.magazine, this.reserve);
    this.magazine += loaded;
    this.reserve -= loaded;
  }

  trigger(): WeaponAction {
    if (this.reloading) return { fired: false, reason: "reloading" };
    if (this.cooldown > 0) return { fired: false, reason: "cooldown" };
    if (this.magazine === 0) return { fired: false, reason: "empty" };
    this.magazine -= 1;
    this.cooldown = 60 / this.config.roundsPerMinute;
    return { fired: true };
  }

  requestReload(): boolean {
    if (this.reloading || this.magazine >= this.config.magazineSize || this.reserve === 0)
      return false;
    this.reloadRemaining = this.config.reloadSeconds;
    return true;
  }
}

export class RecoilSpring {
  pitch = 0;
  yaw = 0;

  constructor(readonly recovery = 13) {
    if (!Number.isFinite(recovery) || recovery <= 0)
      throw new Error("Recoil recovery must be finite and positive");
  }

  impulse(pitch: number, yaw: number): void {
    if (!Number.isFinite(pitch) || !Number.isFinite(yaw))
      throw new Error("Recoil impulse must be finite");
    this.pitch += pitch;
    this.yaw += yaw;
  }

  tick(delta: number): void {
    if (!Number.isFinite(delta) || delta < 0)
      throw new Error("Recoil delta must be finite and non-negative");
    const decay = Math.exp(-this.recovery * delta);
    this.pitch *= decay;
    this.yaw *= decay;
  }
}

export function hitscanDirection(
  yaw: number,
  pitch: number,
  spread: number,
  random: () => number = Math.random,
): Vec3 {
  if (![yaw, pitch, spread].every(Number.isFinite) || spread < 0)
    throw new Error("Hitscan angles and spread must be finite with non-negative spread");
  const shotYaw = yaw + (random() * 2 - 1) * spread;
  const shotPitch = pitch + (random() * 2 - 1) * spread;
  const cosine = Math.cos(shotPitch);
  return {
    x: Math.sin(shotYaw) * cosine,
    y: Math.sin(shotPitch),
    z: -Math.cos(shotYaw) * cosine,
  };
}
