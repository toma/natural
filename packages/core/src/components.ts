import { defineComponent } from "./component.ts";
import { identityTransform, type Transform, type UUID } from "./types.ts";

export interface NameData {
  value: string;
}

export interface StableIdData {
  value: UUID;
}

export const Name = defineComponent<NameData>({
  id: "natural.name",
  defaults: () => ({ value: "Entity" }),
  validate: (value): value is NameData =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as NameData).value === "string" &&
    (value as NameData).value.trim().length > 0,
});

export const StableId = defineComponent<StableIdData>({
  id: "natural.stable-id",
  defaults: () => ({ value: crypto.randomUUID() as UUID }),
  validate: (value): value is StableIdData =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as StableIdData).value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      (value as StableIdData).value,
    ),
});

const validTransform = (value: unknown): value is Transform => {
  if (typeof value !== "object" || value === null) return false;
  const transform = value as Transform;
  return [
    transform.position?.x,
    transform.position?.y,
    transform.position?.z,
    transform.rotation?.x,
    transform.rotation?.y,
    transform.rotation?.z,
    transform.rotation?.w,
    transform.scale?.x,
    transform.scale?.y,
    transform.scale?.z,
  ].every((item) => typeof item === "number" && Number.isFinite(item));
};

export const LocalTransform = defineComponent<Transform>({
  id: "natural.local-transform",
  defaults: identityTransform,
  validate: validTransform,
});

export const WorldTransform = defineComponent<Transform>({
  id: "natural.world-transform",
  defaults: identityTransform,
  validate: validTransform,
  transient: true,
});

export const Active = defineComponent<{ value: boolean }>({
  id: "natural.active",
  defaults: () => ({ value: true }),
  validate: (value): value is { value: boolean } =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { value: unknown }).value === "boolean",
});

export const builtinComponents = [Name, StableId, LocalTransform, WorldTransform, Active] as const;
