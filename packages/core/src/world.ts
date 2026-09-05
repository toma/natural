import type { AnyComponentDefinition, ComponentDefinition, ComponentValue } from "./component.ts";
import { Signal } from "./signal.ts";
import type { Entity } from "./types.ts";

type Store = Map<number, unknown>;

export interface EntityDestroyedEvent {
  entity: Entity;
}

export class World {
  readonly onEntityDestroyed = new Signal<EntityDestroyedEvent>();
  readonly #generations: number[] = [];
  readonly #alive = new Set<number>();
  readonly #free: number[] = [];
  readonly #stores = new Map<string, Store>();
  readonly #definitions = new Map<string, AnyComponentDefinition>();
  readonly #parents = new Map<number, number>();
  readonly #children = new Map<number, Set<number>>();

  createEntity(): Entity {
    const reused = this.#free.pop();
    const index = reused ?? this.#generations.length;
    if (reused === undefined) this.#generations.push(0);
    this.#alive.add(index);
    return Object.freeze({ index, generation: this.#generations[index] ?? 0 });
  }

  isAlive(entity: Entity): boolean {
    return this.#alive.has(entity.index) && this.#generations[entity.index] === entity.generation;
  }

  assertAlive(entity: Entity): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Entity ${entity.index}:${entity.generation} is stale or destroyed`);
    }
  }

  destroyEntity(entity: Entity): void {
    this.assertAlive(entity);
    for (const child of [...this.childrenOf(entity)]) this.destroyEntity(child);
    this.setParent(entity, null);
    for (const store of this.#stores.values()) store.delete(entity.index);
    this.#alive.delete(entity.index);
    this.#generations[entity.index] = entity.generation + 1;
    this.#free.push(entity.index);
    this.onEntityDestroyed.emit({ entity });
  }

  register(definition: AnyComponentDefinition): void {
    const existing = this.#definitions.get(definition.id);
    if (existing !== undefined && existing !== definition) {
      throw new Error(`Component id already registered: ${definition.id}`);
    }
    this.#definitions.set(definition.id, definition);
    if (!this.#stores.has(definition.id)) this.#stores.set(definition.id, new Map());
  }

  definition(id: string): AnyComponentDefinition | undefined {
    return this.#definitions.get(id);
  }

  definitions(): readonly AnyComponentDefinition[] {
    return [...this.#definitions.values()];
  }

  add<T>(
    entity: Entity,
    definition: ComponentDefinition<T>,
    value?: Parameters<ComponentDefinition<T>["create"]>[0],
  ): T {
    this.assertAlive(entity);
    this.register(definition);
    const component = definition.create(value);
    this.#stores.get(definition.id)?.set(entity.index, component);
    return component;
  }

  set<T>(entity: Entity, definition: ComponentDefinition<T>, value: T): void {
    this.assertAlive(entity);
    this.register(definition);
    if (definition.validate !== undefined && !definition.validate(value)) {
      throw new Error(`Invalid value for component ${definition.id}`);
    }
    this.#stores.get(definition.id)?.set(entity.index, value);
  }

  get<T>(entity: Entity, definition: ComponentDefinition<T>): T | undefined {
    this.assertAlive(entity);
    return this.#stores.get(definition.id)?.get(entity.index) as T | undefined;
  }

  require<T>(entity: Entity, definition: ComponentDefinition<T>): T {
    const value = this.get(entity, definition);
    if (value === undefined) throw new Error(`Entity does not have ${definition.id}`);
    return value;
  }

  has<T>(entity: Entity, definition: ComponentDefinition<T>): boolean {
    return this.isAlive(entity) && (this.#stores.get(definition.id)?.has(entity.index) ?? false);
  }

  remove<T>(entity: Entity, definition: ComponentDefinition<T>): boolean {
    this.assertAlive(entity);
    return this.#stores.get(definition.id)?.delete(entity.index) ?? false;
  }

  *entities(): IterableIterator<Entity> {
    for (const index of this.#alive) {
      yield { index, generation: this.#generations[index] ?? 0 };
    }
  }

  *query<const D extends readonly AnyComponentDefinition[]>(
    ...definitions: D
  ): IterableIterator<{ entity: Entity; components: { [K in keyof D]: ComponentValue<D[K]> } }> {
    if (definitions.length === 0) return;
    const stores = definitions.map((definition) => this.#stores.get(definition.id));
    const smallest = stores.reduce<Store | undefined>(
      (candidate, store) =>
        candidate === undefined || (store?.size ?? Infinity) < candidate.size ? store : candidate,
      undefined,
    );
    if (smallest === undefined) return;
    for (const index of smallest.keys()) {
      if (!this.#alive.has(index) || !stores.every((store) => store?.has(index))) continue;
      yield {
        entity: { index, generation: this.#generations[index] ?? 0 },
        components: stores.map((store) => store?.get(index)) as {
          [K in keyof D]: ComponentValue<D[K]>;
        },
      };
    }
  }

  setParent(entity: Entity, parent: Entity | null): void {
    this.assertAlive(entity);
    if (parent !== null) {
      this.assertAlive(parent);
      if (entity.index === parent.index || this.#isDescendant(parent.index, entity.index)) {
        throw new Error("Entity hierarchy cannot contain cycles");
      }
    }
    const oldParent = this.#parents.get(entity.index);
    if (oldParent !== undefined) this.#children.get(oldParent)?.delete(entity.index);
    if (parent === null) {
      this.#parents.delete(entity.index);
      return;
    }
    this.#parents.set(entity.index, parent.index);
    const children = this.#children.get(parent.index) ?? new Set<number>();
    children.add(entity.index);
    this.#children.set(parent.index, children);
  }

  parentOf(entity: Entity): Entity | null {
    this.assertAlive(entity);
    const index = this.#parents.get(entity.index);
    return index === undefined ? null : { index, generation: this.#generations[index] ?? 0 };
  }

  *childrenOf(entity: Entity): IterableIterator<Entity> {
    this.assertAlive(entity);
    for (const index of this.#children.get(entity.index) ?? []) {
      yield { index, generation: this.#generations[index] ?? 0 };
    }
  }

  clear(): void {
    for (const entity of [...this.entities()]) {
      if (this.isAlive(entity)) this.destroyEntity(entity);
    }
  }

  get entityCount(): number {
    return this.#alive.size;
  }

  #isDescendant(candidate: number, ancestor: number): boolean {
    let current: number | undefined = candidate;
    while (current !== undefined) {
      if (current === ancestor) return true;
      current = this.#parents.get(current);
    }
    return false;
  }
}
