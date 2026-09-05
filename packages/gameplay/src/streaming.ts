import type { Vec3 } from "@natural-engine/core";

export interface WorldCell {
  key: string;
  center: Vec3;
  load: (signal: AbortSignal) => Promise<void>;
  unload: () => void | Promise<void>;
}

interface CellState {
  cell: WorldCell;
  state: "unloaded" | "loading" | "loaded";
  controller: AbortController | null;
}

export interface WorldStreamerOptions {
  loadRadius: number;
  unloadRadius?: number;
  maxConcurrentLoads?: number;
}

export class WorldStreamer {
  readonly #cells = new Map<string, CellState>();
  readonly #options: Required<WorldStreamerOptions>;
  readonly #pending = new Set<Promise<void>>();
  #activeLoads = 0;
  #disposed = false;

  constructor(options: WorldStreamerOptions) {
    const unloadRadius = options.unloadRadius ?? options.loadRadius * 1.25;
    if (
      !Number.isFinite(options.loadRadius) ||
      !Number.isFinite(unloadRadius) ||
      options.loadRadius <= 0 ||
      unloadRadius < options.loadRadius
    ) {
      throw new Error("World streaming radii must be positive with unloadRadius >= loadRadius");
    }
    const maxConcurrentLoads = options.maxConcurrentLoads ?? 4;
    if (!Number.isSafeInteger(maxConcurrentLoads) || maxConcurrentLoads <= 0)
      throw new Error("World streaming maxConcurrentLoads must be a positive integer");
    this.#options = {
      loadRadius: options.loadRadius,
      unloadRadius,
      maxConcurrentLoads,
    };
  }

  add(cell: WorldCell): void {
    if (this.#disposed) throw new Error("World streamer is disposed");
    if (cell.key.trim() === "") throw new Error("World cell key must not be empty");
    if (Object.values(cell.center).some((value) => !Number.isFinite(value)))
      throw new Error(`World cell ${cell.key} center must be finite`);
    if (this.#cells.has(cell.key)) throw new Error(`World cell already exists: ${cell.key}`);
    this.#cells.set(cell.key, { cell, state: "unloaded", controller: null });
  }

  async update(focusPoints: readonly Vec3[]): Promise<void> {
    if (this.#disposed) throw new Error("World streamer is disposed");
    if (focusPoints.some((point) => Object.values(point).some((value) => !Number.isFinite(value))))
      throw new Error("World streaming focus points must be finite");
    const distance = (center: Vec3): number =>
      Math.min(
        ...focusPoints.map((focus) =>
          Math.hypot(center.x - focus.x, center.y - focus.y, center.z - focus.z),
        ),
      );
    const unloads: Array<Promise<void>> = [];
    for (const state of this.#cells.values()) {
      const cellDistance = focusPoints.length === 0 ? Infinity : distance(state.cell.center);
      if (state.state === "loaded" && cellDistance > this.#options.unloadRadius) {
        state.state = "unloaded";
        unloads.push(Promise.resolve(state.cell.unload()));
      } else if (state.state === "loading" && cellDistance > this.#options.unloadRadius) {
        state.controller?.abort();
      }
    }
    await Promise.all(unloads);
    const candidates = [...this.#cells.values()]
      .filter(
        (state) =>
          state.state === "unloaded" && distance(state.cell.center) <= this.#options.loadRadius,
      )
      .sort((left, right) => distance(left.cell.center) - distance(right.cell.center));
    const available = Math.max(0, this.#options.maxConcurrentLoads - this.#activeLoads);
    await Promise.all(candidates.slice(0, available).map((state) => this.#trackLoad(state)));
  }

  states(): Readonly<Record<string, CellState["state"]>> {
    return Object.fromEntries([...this.#cells].map(([key, value]) => [key, value.state]));
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const state of this.#cells.values()) {
      state.controller?.abort();
    }
    await Promise.allSettled([...this.#pending]);
    const unloads: Array<Promise<void>> = [];
    for (const state of this.#cells.values()) {
      if (state.state === "loaded") unloads.push(Promise.resolve(state.cell.unload()));
      state.state = "unloaded";
      state.controller = null;
    }
    await Promise.all(unloads);
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #trackLoad(state: CellState): Promise<void> {
    const pending = this.#load(state);
    this.#pending.add(pending);
    void pending.then(
      () => this.#pending.delete(pending),
      () => this.#pending.delete(pending),
    );
    return pending;
  }

  async #load(state: CellState): Promise<void> {
    const controller = new AbortController();
    state.controller = controller;
    state.state = "loading";
    this.#activeLoads += 1;
    try {
      await state.cell.load(controller.signal);
      if (controller.signal.aborted || this.#disposed) {
        state.state = "unloaded";
        await state.cell.unload();
      } else state.state = "loaded";
    } catch (error) {
      state.state = "unloaded";
      if (!controller.signal.aborted) throw error;
    } finally {
      state.controller = null;
      this.#activeLoads -= 1;
    }
  }
}
