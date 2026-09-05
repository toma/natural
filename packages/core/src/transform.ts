import { Active, LocalTransform, WorldTransform } from "./components.ts";
import type { Entity, Quaternion, Transform, Vec3 } from "./types.ts";
import type { World } from "./world.ts";

function multiplyQuaternion(parent: Quaternion, local: Quaternion): Quaternion {
  const value = {
    x: parent.w * local.x + parent.x * local.w + parent.y * local.z - parent.z * local.y,
    y: parent.w * local.y - parent.x * local.z + parent.y * local.w + parent.z * local.x,
    z: parent.w * local.z + parent.x * local.y - parent.y * local.x + parent.z * local.w,
    w: parent.w * local.w - parent.x * local.x - parent.y * local.y - parent.z * local.z,
  };
  const length = Math.hypot(value.x, value.y, value.z, value.w) || 1;
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length,
  };
}

function rotateVector(rotation: Quaternion, vector: Vec3): Vec3 {
  const ix = rotation.w * vector.x + rotation.y * vector.z - rotation.z * vector.y;
  const iy = rotation.w * vector.y + rotation.z * vector.x - rotation.x * vector.z;
  const iz = rotation.w * vector.z + rotation.x * vector.y - rotation.y * vector.x;
  const iw = -rotation.x * vector.x - rotation.y * vector.y - rotation.z * vector.z;
  return {
    x: ix * rotation.w + iw * -rotation.x + iy * -rotation.z - iz * -rotation.y,
    y: iy * rotation.w + iw * -rotation.y + iz * -rotation.x - ix * -rotation.z,
    z: iz * rotation.w + iw * -rotation.z + ix * -rotation.y - iy * -rotation.x,
  };
}

export function composeTransforms(parent: Transform, local: Transform): Transform {
  const translated = rotateVector(parent.rotation, {
    x: local.position.x * parent.scale.x,
    y: local.position.y * parent.scale.y,
    z: local.position.z * parent.scale.z,
  });
  return {
    position: {
      x: parent.position.x + translated.x,
      y: parent.position.y + translated.y,
      z: parent.position.z + translated.z,
    },
    rotation: multiplyQuaternion(parent.rotation, local.rotation),
    scale: {
      x: parent.scale.x * local.scale.x,
      y: parent.scale.y * local.scale.y,
      z: parent.scale.z * local.scale.z,
    },
  };
}

function cloneTransform(transform: Transform): Transform {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale },
  };
}

export function updateWorldTransforms(world: World): void {
  const computed = new Set<number>();
  const visit = (entity: Entity): Transform | undefined => {
    if (computed.has(entity.index)) return world.get(entity, WorldTransform);
    const local = world.get(entity, LocalTransform);
    if (local === undefined) return undefined;
    const parent = world.parentOf(entity);
    const parentTransform = parent === null ? undefined : visit(parent);
    const result =
      parentTransform === undefined
        ? cloneTransform(local)
        : composeTransforms(parentTransform, local);
    if (world.has(entity, WorldTransform)) world.set(entity, WorldTransform, result);
    else world.add(entity, WorldTransform, result);
    computed.add(entity.index);
    return result;
  };
  for (const { entity } of world.query(LocalTransform)) visit(entity);
}

export function isEntityActive(world: World, entity: Entity): boolean {
  let current: Entity | null = entity;
  while (current !== null) {
    if (world.get(current, Active)?.value === false) return false;
    current = world.parentOf(current);
  }
  return true;
}
