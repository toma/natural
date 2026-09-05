import type { ComponentDefinition } from "./component.ts";
import { Active, LocalTransform, Name, StableId } from "./components.ts";
import type { Entity, UUID } from "./types.ts";
import { uuid } from "./types.ts";
import type { World } from "./world.ts";

export const SCENE_VERSION = 1;

export interface SceneNodeData {
  id: string;
  name: string;
  active?: boolean;
  components?: Record<string, unknown>;
  children?: SceneNodeData[];
}

export interface SceneData {
  version: number;
  id: string;
  name: string;
  root: SceneNodeData;
}

export interface CompiledScene {
  sceneId: UUID;
  root: Entity;
  entitiesByStableId: ReadonlyMap<UUID, Entity>;
}

export function defineScene(scene: SceneData): SceneData {
  validateScene(scene);
  return Object.freeze(scene);
}

export function validateScene(scene: unknown): asserts scene is SceneData {
  if (scene === null || typeof scene !== "object") throw new Error("Scene must be an object");
  const candidate = scene as Partial<SceneData>;
  if (typeof candidate.version !== "number") throw new Error("Scene version must be a number");
  if (typeof candidate.id !== "string") throw new Error("Scene id must be a UUID string");
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0)
    throw new Error("Scene name must not be empty");
  if (candidate.root === null || typeof candidate.root !== "object")
    throw new Error("Scene root must be an object");
  const valid = candidate as SceneData;
  if (valid.version !== SCENE_VERSION)
    throw new Error(`Unsupported scene version ${valid.version}`);
  uuid(valid.id);
  const ids = new Set<string>();
  const stack: Array<{ node: unknown; depth: number }> = [{ node: valid.root, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > 512) throw new Error("Scene hierarchy exceeds 512 levels");
    if (current.node === null || typeof current.node !== "object")
      throw new Error("Scene nodes must be objects");
    const node = current.node as Partial<SceneNodeData>;
    if (typeof node.id !== "string") throw new Error("Scene node id must be a UUID string");
    uuid(node.id);
    if (ids.has(node.id)) throw new Error(`Duplicate scene node id: ${node.id}`);
    ids.add(node.id);
    if (ids.size > 1_000_000) throw new Error("Scene exceeds the one-million-node limit");
    if (typeof node.name !== "string" || node.name.trim().length === 0)
      throw new Error(`Scene node ${node.id} has no name`);
    if (node.active !== undefined && typeof node.active !== "boolean")
      throw new Error(`Scene node ${node.id} has an invalid active flag`);
    if (
      node.components !== undefined &&
      (node.components === null ||
        typeof node.components !== "object" ||
        Array.isArray(node.components))
    )
      throw new Error(`Scene node ${node.id} components must be an object`);
    if (node.children !== undefined && !Array.isArray(node.children))
      throw new Error(`Scene node ${node.id} children must be an array`);
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1)
      stack.push({ node: node.children?.[index], depth: current.depth + 1 });
  }
}

export function compileScene(world: World, scene: SceneData): CompiledScene {
  validateScene(scene);
  const entitiesByStableId = new Map<UUID, Entity>();
  const instantiate = (node: SceneNodeData, parent: Entity | null): Entity => {
    const entity = world.createEntity();
    world.add(entity, StableId, { value: uuid(node.id) });
    world.add(entity, Name, { value: node.name });
    world.add(entity, Active, { value: node.active ?? true });
    if (node.components?.[LocalTransform.id] === undefined) world.add(entity, LocalTransform);
    for (const [id, value] of Object.entries(node.components ?? {})) {
      const definition = world.definition(id);
      if (definition === undefined) throw new Error(`Unknown component in scene: ${id}`);
      world.set(entity, definition as ComponentDefinition<unknown>, value);
    }
    if (parent !== null) world.setParent(entity, parent);
    entitiesByStableId.set(uuid(node.id), entity);
    for (const child of node.children ?? []) instantiate(child, entity);
    return entity;
  };
  const root = instantiate(scene.root, null);
  return { sceneId: uuid(scene.id), root, entitiesByStableId };
}

export function serializeScene(world: World, root: Entity, id: UUID, name: string): SceneData {
  const serializeNode = (entity: Entity): SceneNodeData => {
    const components: Record<string, unknown> = {};
    for (const definition of world.definitions()) {
      if (
        definition.transient === true ||
        [Name.id, StableId.id, Active.id].includes(definition.id)
      )
        continue;
      const value = world.get(entity, definition);
      if (value !== undefined) components[definition.id] = structuredClone(value);
    }
    return {
      id: world.require(entity, StableId).value,
      name: world.require(entity, Name).value,
      active: world.require(entity, Active).value,
      components,
      children: [...world.childrenOf(entity)].map(serializeNode),
    };
  };
  return { version: SCENE_VERSION, id, name, root: serializeNode(root) };
}
