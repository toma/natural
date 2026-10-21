import type { World } from "./world.ts";

export const stages = [
  "input",
  "fixedUpdate",
  "physics",
  "network",
  "update",
  "animation",
  "render",
] as const;

export type Stage = (typeof stages)[number];

export interface SystemContext {
  world: World;
  delta: number;
  /** Clamped real frame duration, including while simulation time is scaled to zero. */
  unscaledDelta?: number;
  elapsed: number;
  tick: number;
  alpha: number;
}

export interface System {
  name: string;
  stage: Stage;
  after?: readonly string[];
  before?: readonly string[];
  run: (context: SystemContext) => void | Promise<void>;
}

export function defineSystem(system: System): System {
  return Object.freeze(system);
}

function orderSystems(systems: readonly System[]): readonly System[] {
  const byName = new Map(systems.map((system) => [system.name, system]));
  if (byName.size !== systems.length) throw new Error("System names must be unique within a stage");
  const edges = new Map(systems.map((system) => [system.name, new Set<string>()]));
  for (const system of systems) {
    for (const dependency of system.after ?? []) {
      if (byName.has(dependency)) edges.get(dependency)?.add(system.name);
    }
    for (const dependent of system.before ?? []) {
      if (byName.has(dependent)) edges.get(system.name)?.add(dependent);
    }
  }
  const indegree = new Map(systems.map((system) => [system.name, 0]));
  for (const targets of edges.values()) {
    for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }
  const ready = systems.filter((system) => indegree.get(system.name) === 0);
  const result: System[] = [];
  while (ready.length > 0) {
    const system = ready.shift();
    if (system === undefined) break;
    result.push(system);
    for (const target of edges.get(system.name) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) ready.push(byName.get(target)!);
    }
  }
  if (result.length !== systems.length) throw new Error("System ordering contains a cycle");
  return result;
}

export class Scheduler {
  readonly #systems = new Map<Stage, System[]>(stages.map((stage) => [stage, []]));
  readonly #ordered = new Map<Stage, readonly System[]>();

  add(...systemsToAdd: readonly System[]): void {
    for (const system of systemsToAdd) {
      const systemsForStage = this.#systems.get(system.stage)!;
      if (systemsForStage.some((existing) => existing.name === system.name)) {
        throw new Error(`System already exists in ${system.stage}: ${system.name}`);
      }
      systemsForStage.push(system);
      this.#ordered.delete(system.stage);
    }
  }

  remove(name: string): boolean {
    for (const [stage, systemsForStage] of this.#systems) {
      const index = systemsForStage.findIndex((system) => system.name === name);
      if (index >= 0) {
        systemsForStage.splice(index, 1);
        this.#ordered.delete(stage);
        return true;
      }
    }
    return false;
  }

  async run(stage: Stage, context: SystemContext): Promise<void> {
    let ordered = this.#ordered.get(stage);
    if (ordered === undefined) {
      ordered = orderSystems(this.#systems.get(stage) ?? []);
      this.#ordered.set(stage, ordered);
    }
    for (const system of ordered) await system.run(context);
  }

  systems(stage?: Stage): readonly System[] {
    return stage === undefined
      ? stages.flatMap((value) => this.#systems.get(value) ?? [])
      : [...(this.#systems.get(stage) ?? [])];
  }
}
