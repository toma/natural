import { defineComponent, type Vec3 } from "@natural-engine/core";

export interface RigidBodyData {
  type: "dynamic" | "fixed" | "kinematic";
  gravityScale: number;
  canSleep: boolean;
  continuousCollisionDetection: boolean;
}

export interface ColliderData {
  shape: "box" | "sphere" | "capsule";
  size: Vec3;
  radius: number;
  height: number;
  density: number;
  friction: number;
  restitution: number;
  sensor: boolean;
}

export const RigidBody = defineComponent<RigidBodyData>({
  id: "natural.physics.rigid-body",
  defaults: () => ({
    type: "dynamic",
    gravityScale: 1,
    canSleep: true,
    continuousCollisionDetection: false,
  }),
  validate: (value): value is RigidBodyData => {
    const data = value as Partial<RigidBodyData>;
    return (
      typeof value === "object" &&
      value !== null &&
      (data.type === "dynamic" || data.type === "fixed" || data.type === "kinematic") &&
      typeof data.gravityScale === "number" &&
      Number.isFinite(data.gravityScale) &&
      typeof data.canSleep === "boolean" &&
      typeof data.continuousCollisionDetection === "boolean"
    );
  },
});

export const Collider = defineComponent<ColliderData>({
  id: "natural.physics.collider",
  defaults: () => ({
    shape: "box",
    size: { x: 1, y: 1, z: 1 },
    radius: 0.5,
    height: 1,
    density: 1,
    friction: 0.5,
    restitution: 0,
    sensor: false,
  }),
  validate: (value): value is ColliderData => {
    const data = value as Partial<ColliderData>;
    const finite = (item: unknown): item is number =>
      typeof item === "number" && Number.isFinite(item);
    return (
      typeof value === "object" &&
      value !== null &&
      (data.shape === "box" || data.shape === "sphere" || data.shape === "capsule") &&
      finite(data.size?.x) &&
      finite(data.size?.y) &&
      finite(data.size?.z) &&
      (data.size?.x ?? 0) > 0 &&
      (data.size?.y ?? 0) > 0 &&
      (data.size?.z ?? 0) > 0 &&
      finite(data.radius) &&
      (data.radius ?? 0) > 0 &&
      finite(data.height) &&
      (data.height ?? 0) >= 0 &&
      finite(data.density) &&
      (data.density ?? -1) >= 0 &&
      finite(data.friction) &&
      (data.friction ?? -1) >= 0 &&
      finite(data.restitution) &&
      (data.restitution ?? -1) >= 0 &&
      (data.restitution ?? 2) <= 1 &&
      typeof data.sensor === "boolean"
    );
  },
});

export const physicsComponents = [RigidBody, Collider] as const;
