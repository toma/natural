import {
  LocalTransform,
  defineComponent,
  defineSystem,
  type Transform,
} from "@natural-engine/core";

export interface TransformKeyframe {
  time: number;
  position?: Partial<Transform["position"]>;
  rotation?: Partial<Transform["rotation"]>;
  scale?: Partial<Transform["scale"]>;
}

export function defineAnimationClip(clip: AnimationClip): Readonly<AnimationClip> {
  if (clip.name.trim() === "") throw new Error("Animation name must not be empty");
  if (!Number.isFinite(clip.duration) || clip.duration <= 0)
    throw new Error("Animation duration must be finite and positive");
  let previous = -Infinity;
  for (const keyframe of clip.keyframes) {
    if (!Number.isFinite(keyframe.time) || keyframe.time < 0 || keyframe.time > clip.duration)
      throw new Error(`Animation keyframe ${keyframe.time} is outside the clip duration`);
    if (keyframe.time < previous) throw new Error("Animation keyframes must be time-ordered");
    for (const channel of [keyframe.position, keyframe.rotation, keyframe.scale]) {
      if (channel !== undefined && Object.values(channel).some((value) => !Number.isFinite(value)))
        throw new Error("Animation keyframe channels must be finite");
    }
    previous = keyframe.time;
  }
  const keyframes = clip.keyframes.map((keyframe) =>
    Object.freeze({
      ...keyframe,
      ...(keyframe.position === undefined
        ? {}
        : { position: Object.freeze({ ...keyframe.position }) }),
      ...(keyframe.rotation === undefined
        ? {}
        : { rotation: Object.freeze({ ...keyframe.rotation }) }),
      ...(keyframe.scale === undefined ? {} : { scale: Object.freeze({ ...keyframe.scale }) }),
    }),
  );
  return Object.freeze({ ...clip, keyframes: Object.freeze(keyframes) });
}

export interface AnimationClip {
  name: string;
  duration: number;
  loop: boolean;
  keyframes: readonly TransformKeyframe[];
}

export interface AnimationPlayerData {
  clip: AnimationClip | null;
  time: number;
  speed: number;
  playing: boolean;
}

export const AnimationPlayer = defineComponent<AnimationPlayerData>({
  id: "natural.animation.player",
  defaults: () => ({ clip: null, time: 0, speed: 1, playing: false }),
  validate: (value): value is AnimationPlayerData => {
    const data = value as Partial<AnimationPlayerData>;
    return (
      typeof value === "object" &&
      value !== null &&
      (data.clip === null ||
        (typeof data.clip === "object" &&
          typeof data.clip.name === "string" &&
          Number.isFinite(data.clip.duration) &&
          data.clip.duration > 0 &&
          typeof data.clip.loop === "boolean" &&
          Array.isArray(data.clip.keyframes))) &&
      Number.isFinite(data.time) &&
      Number.isFinite(data.speed) &&
      typeof data.playing === "boolean"
    );
  },
});

function sample(
  keyframes: readonly TransformKeyframe[],
  time: number,
): { previous: TransformKeyframe; next: TransformKeyframe; alpha: number } | null {
  const first = keyframes[0];
  if (first === undefined) return null;
  let previous = first;
  let next = first;
  for (const keyframe of keyframes) {
    if (keyframe.time <= time) previous = keyframe;
    if (keyframe.time >= time) {
      next = keyframe;
      break;
    }
    next = keyframe;
  }
  const span = next.time - previous.time;
  return { previous, next, alpha: span <= 0 ? 0 : (time - previous.time) / span };
}

function blend(
  previous: number | undefined,
  next: number | undefined,
  fallback: number,
  alpha: number,
): number {
  const from = previous ?? fallback;
  const to = next ?? from;
  return from + (to - from) * alpha;
}

function blendRotation(
  previous: TransformKeyframe["rotation"],
  next: TransformKeyframe["rotation"],
  fallback: Transform["rotation"],
  alpha: number,
): Transform["rotation"] {
  const from = {
    x: previous?.x ?? fallback.x,
    y: previous?.y ?? fallback.y,
    z: previous?.z ?? fallback.z,
    w: previous?.w ?? fallback.w,
  };
  const rawTo = {
    x: next?.x ?? from.x,
    y: next?.y ?? from.y,
    z: next?.z ?? from.z,
    w: next?.w ?? from.w,
  };
  const sign =
    from.x * rawTo.x + from.y * rawTo.y + from.z * rawTo.z + from.w * rawTo.w < 0 ? -1 : 1;
  const rotation = {
    x: from.x + (rawTo.x * sign - from.x) * alpha,
    y: from.y + (rawTo.y * sign - from.y) * alpha,
    z: from.z + (rawTo.z * sign - from.z) * alpha,
    w: from.w + (rawTo.w * sign - from.w) * alpha,
  };
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) || 1;
  return {
    x: rotation.x / length,
    y: rotation.y / length,
    z: rotation.z / length,
    w: rotation.w / length,
  };
}

export const animationSystem = defineSystem({
  name: "natural.animation.update",
  stage: "animation",
  run: ({ world, delta }) => {
    for (const row of world.query(LocalTransform, AnimationPlayer)) {
      const [transform, player] = row.components;
      if (!player.playing || player.clip === null) continue;
      if (!Number.isFinite(player.clip.duration) || player.clip.duration <= 0) {
        player.playing = false;
        continue;
      }
      player.time += delta * player.speed;
      if (player.clip.loop) {
        player.time =
          ((player.time % player.clip.duration) + player.clip.duration) % player.clip.duration;
      } else if (player.time >= player.clip.duration) {
        player.time = player.clip.duration;
        player.playing = false;
      } else if (player.time <= 0 && player.speed < 0) {
        player.time = 0;
        player.playing = false;
      }
      const sampled = sample(player.clip.keyframes, player.time);
      if (sampled === null) continue;
      const { previous, next, alpha } = sampled;
      if (previous.position !== undefined || next.position !== undefined) {
        transform.position.x = blend(
          previous.position?.x,
          next.position?.x,
          transform.position.x,
          alpha,
        );
        transform.position.y = blend(
          previous.position?.y,
          next.position?.y,
          transform.position.y,
          alpha,
        );
        transform.position.z = blend(
          previous.position?.z,
          next.position?.z,
          transform.position.z,
          alpha,
        );
      }
      if (previous.scale !== undefined || next.scale !== undefined) {
        transform.scale.x = blend(previous.scale?.x, next.scale?.x, transform.scale.x, alpha);
        transform.scale.y = blend(previous.scale?.y, next.scale?.y, transform.scale.y, alpha);
        transform.scale.z = blend(previous.scale?.z, next.scale?.z, transform.scale.z, alpha);
      }
      if (previous.rotation !== undefined || next.rotation !== undefined) {
        transform.rotation = blendRotation(
          previous.rotation,
          next.rotation,
          transform.rotation,
          alpha,
        );
      }
    }
  },
});
