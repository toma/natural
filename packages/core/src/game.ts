import { builtinComponents } from "./components.ts";
import { InputState } from "./input.ts";
import type { EnginePlugin } from "./plugin.ts";
import type { ProjectDefinition } from "./project.ts";
import { ResourceManager } from "./resources.ts";
import { Scheduler, defineSystem, stages, type Stage, type SystemContext } from "./scheduler.ts";
import { Signal } from "./signal.ts";
import { updateWorldTransforms } from "./transform.ts";
import { World } from "./world.ts";

export interface GameOptions {
  project: Readonly<ProjectDefinition>;
  now?: () => number;
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export class Game {
  readonly world = new World();
  readonly scheduler = new Scheduler();
  readonly resources = new ResourceManager();
  readonly input: InputState;
  readonly onError = new Signal<unknown>();
  readonly project: Readonly<ProjectDefinition>;
  readonly #now: () => number;
  readonly #requestFrame?: (callback: (time: number) => void) => number;
  readonly #cancelFrame?: (handle: number) => void;
  readonly #plugins: readonly EnginePlugin[];
  readonly #initializedPlugins: EnginePlugin[] = [];
  #running = false;
  #initialized = false;
  #disposed = false;
  #initialization: Promise<void> | null = null;
  #paused = false;
  #frameHandle: number | undefined;
  #lastTime = 0;
  #accumulator = 0;
  #elapsed = 0;
  #tick = 0;
  #timeScale = 1;
  #unscaledDelta = 0;

  constructor(options: GameOptions) {
    this.project = options.project;
    this.input = new InputState(options.project.input);
    this.#now = options.now ?? (() => performance.now());
    this.#requestFrame = options.requestFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
    this.#cancelFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
    this.#plugins = options.project.plugins ?? [];
    for (const component of builtinComponents) this.world.register(component);
    this.scheduler.add(
      defineSystem({
        name: "natural.transforms",
        stage: "render",
        run: () => updateWorldTransforms(this.world),
      }),
    );
  }

  async initialize(): Promise<void> {
    if (this.#disposed) throw new Error("Game is disposed");
    if (this.#initialized) return;
    if (this.#initialization !== null) return this.#initialization;
    const pending = this.#initializePlugins();
    this.#initialization = pending;
    try {
      await pending;
    } finally {
      if (this.#initialization === pending) this.#initialization = null;
    }
  }

  async step(deltaSeconds: number): Promise<void> {
    if (this.#disposed) throw new Error("Game is disposed");
    if (!this.#initialized) await this.initialize();
    const maxFrameDelta = this.project.maxFrameDelta ?? 0.25;
    this.#unscaledDelta = Math.min(Math.max(deltaSeconds, 0), maxFrameDelta);
    const frameDelta = this.#unscaledDelta * this.#timeScale;
    const fixedDelta = 1 / (this.project.fixedTickRate ?? 60);
    this.input.beginFrame();
    await this.#run("input", frameDelta, 0);
    if (!this.#paused) {
      this.#accumulator += frameDelta;
      let steps = 0;
      const maxSteps = this.project.maxFixedSteps ?? Infinity;
      while (this.#accumulator >= fixedDelta && steps < maxSteps) {
        for (const stage of ["fixedUpdate", "physics", "network"] as const) {
          await this.#run(stage, fixedDelta, 0);
        }
        this.#accumulator -= fixedDelta;
        this.#elapsed += fixedDelta;
        this.#tick += 1;
        steps += 1;
      }
      if (steps === maxSteps) this.#accumulator = 0;
      const alpha = this.#accumulator / fixedDelta;
      for (const stage of ["update", "animation", "render"] as const) {
        await this.#run(stage, frameDelta, alpha);
      }
    }
  }

  async start(): Promise<void> {
    if (this.#disposed) throw new Error("Game is disposed");
    if (this.#running) return;
    if (!this.#initialized) await this.initialize();
    if (this.#requestFrame === undefined)
      throw new Error("No animation frame provider is available");
    this.#running = true;
    this.#lastTime = this.#now();
    const frame = (time: number): void => {
      if (!this.#running) return;
      const delta = (time - this.#lastTime) / 1000;
      this.#lastTime = time;
      void this.step(delta)
        .catch((error: unknown) => this.onError.emit(error))
        .finally(() => {
          if (this.#running) this.#frameHandle = this.#requestFrame?.(frame);
        });
    };
    this.#frameHandle = this.#requestFrame(frame);
  }

  pause(value = true): void {
    this.#paused = value;
  }

  stop(): void {
    this.#running = false;
    if (this.#frameHandle !== undefined) this.#cancelFrame?.(this.#frameHandle);
    this.#frameHandle = undefined;
  }

  setTimeScale(value: number): void {
    if (!Number.isFinite(value) || value < 0)
      throw new Error("Time scale must be finite and non-negative");
    this.#timeScale = value;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    if (this.#initialization !== null) {
      try {
        await this.#initialization;
      } catch {
        return;
      }
    }
    this.#disposed = true;
    this.stop();
    const errors: unknown[] = [];
    for (const plugin of [...this.#initializedPlugins].reverse()) {
      try {
        await plugin.dispose?.(this);
      } catch (error) {
        errors.push(error);
      }
    }
    this.#initializedPlugins.length = 0;
    this.resources.dispose();
    this.world.clear();
    this.onError.clear();
    if (errors.length > 0)
      throw new AggregateError(errors, "One or more game plugins failed to dispose");
  }

  get tick(): number {
    return this.#tick;
  }

  get elapsed(): number {
    return this.#elapsed;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get running(): boolean {
    return this.#running;
  }

  get initialized(): boolean {
    return this.#initialized;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  async #initializePlugins(): Promise<void> {
    try {
      for (const plugin of this.#plugins) {
        await plugin.setup(this);
        this.#initializedPlugins.push(plugin);
      }
      this.#initialized = true;
    } catch (error) {
      const errors: unknown[] = [error];
      for (const plugin of [...this.#initializedPlugins].reverse()) {
        try {
          await plugin.dispose?.(this);
        } catch (disposeError) {
          errors.push(disposeError);
        }
      }
      this.#initializedPlugins.length = 0;
      this.resources.dispose();
      this.world.clear();
      this.#disposed = true;
      throw errors.length === 1 ? error : new AggregateError(errors, "Game initialization failed");
    }
  }

  async #run(stage: Stage, delta: number, alpha: number): Promise<void> {
    const context: SystemContext = {
      world: this.world,
      delta,
      unscaledDelta: this.#unscaledDelta,
      elapsed: this.#elapsed,
      tick: this.#tick,
      alpha,
    };
    await this.scheduler.run(stage, context);
  }
}

export function createGame(options: GameOptions): Game {
  return new Game(options);
}

export { stages };
