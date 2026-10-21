import { describe, expect, test } from "bun:test";
import {
  InputState,
  MemorySaveAdapter,
  MigrationRegistry,
  Profiler,
  ResourceManager,
  SaveManager,
  SeededRandom,
  Signal,
  WebStorageSaveAdapter,
  canonicalJson,
  createGame,
  definePlugin,
  defineProject,
  defineResource,
  defineSystem,
  uuid,
} from "../src/index.ts";

describe("core foundation", () => {
  test("signals unsubscribe, fire once, and clear", () => {
    const signal = new Signal<number>();
    const values: number[] = [];
    const unsubscribe = signal.subscribe((value) => values.push(value));
    signal.once((value) => values.push(value * 10));
    signal.emit(2);
    unsubscribe();
    signal.emit(3);
    signal.clear();
    expect(values).toEqual([2, 20]);
    expect(signal.size).toBe(0);
  });

  test("input exposes frame transitions and clamped values", () => {
    const input = new InputState({ jump: { bindings: [] } });
    input.set("jump", 2);
    expect(input.value("jump")).toBe(1);
    expect(input.pressed("jump")).toBe(true);
    input.beginFrame();
    expect(input.pressed("jump")).toBe(false);
    input.set("jump", 0);
    expect(input.released("jump")).toBe(true);
    expect(input.value("missing")).toBe(0);
    expect(() => input.set("missing", 1)).toThrow("Unknown input action");
    expect(() => input.set("jump", Number.NaN)).toThrow("finite");
    expect(() => new InputState({ "not valid": { bindings: [] } })).toThrow("Invalid input");
  });

  test("seeded randomness is repeatable and validates integer bounds", () => {
    const left = new SeededRandom(123);
    const right = new SeededRandom(123);
    expect([left.next(), left.integer(2, 8), left.state]).toEqual([
      right.next(),
      right.integer(2, 8),
      right.state,
    ]);
    expect(() => left.integer(5, 4)).toThrow("bounds");
  });

  test("resources coalesce loads and dispose at the final release", async () => {
    const manager = new ResourceManager();
    let loads = 0;
    let disposals = 0;
    const resource = defineResource({
      id: "test.text",
      load: async (source: string) => {
        loads += 1;
        return source.toUpperCase();
      },
      dispose: () => {
        disposals += 1;
      },
    });
    const [first, second] = await Promise.all([
      manager.acquire(resource, "hello"),
      manager.acquire(resource, "hello"),
    ]);
    expect(first.value).toBe("HELLO");
    expect(loads).toBe(1);
    expect(manager.size).toBe(1);
    first.release();
    first.release();
    expect(disposals).toBe(0);
    second.release();
    expect(disposals).toBe(1);
    const third = await manager.acquire(resource, "other");
    expect(third.key).toBe("test.text:other");
    manager.dispose();
    expect(disposals).toBe(2);
    expect(manager.disposed).toBe(true);
    expect(manager.acquire(resource, "late")).rejects.toThrow("disposed");
  });

  test("resource cancellation is isolated and disposal aborts pending work", async () => {
    const manager = new ResourceManager();
    let releaseLoad: ((value: string) => void) | undefined;
    let disposed = 0;
    const resource = defineResource({
      id: "test.delayed",
      load: () =>
        new Promise<string>((resolve) => {
          releaseLoad = resolve;
        }),
      dispose: () => {
        disposed += 1;
      },
    });
    const controller = new AbortController();
    const acquisition = manager.acquire(resource, "asset", controller.signal);
    controller.abort();
    expect(acquisition).rejects.toThrow("aborted");
    manager.dispose();
    releaseLoad?.("loaded");
    await Bun.sleep(0);
    expect(disposed).toBe(1);
    expect(() => defineResource({ id: "not valid", load: async () => 1 })).toThrow("URL-safe");
  });

  test("save adapters round-trip typed values and reject corrupt data", async () => {
    interface Save {
      score: number;
    }
    const adapter = new MemorySaveAdapter();
    const saves = new SaveManager<Save>(
      adapter,
      (value): value is Save =>
        typeof value === "object" && value !== null && typeof (value as Save).score === "number",
    );
    expect(await saves.load("one")).toBeNull();
    await saves.save("one", { score: 42 });
    expect(await saves.load("one")).toEqual({ score: 42 });
    await adapter.write("broken", "{}\n");
    expect(saves.load("broken")).rejects.toThrow("invalid data");
    await adapter.write("corrupt", "{");
    expect(saves.load("corrupt")).rejects.toThrow("invalid JSON");
    expect(saves.load("../escape")).rejects.toThrow("Invalid save slot");
    await saves.remove("one");
    expect(await saves.load("one")).toBeNull();
  });

  test("web storage save adapter namespaces persistent slots", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const adapter = new WebStorageSaveAdapter(storage, "game.");
    await adapter.write("slot-1", "saved");
    expect(values.get("game.slot-1")).toBe("saved");
    expect(await adapter.read("slot-1")).toBe("saved");
    await adapter.remove("slot-1");
    expect(await adapter.read("slot-1")).toBeNull();
    expect(() => new WebStorageSaveAdapter(storage, "")).toThrow("prefix");
  });

  test("documents migrate one version at a time and serialize canonically", () => {
    interface Document {
      version: number;
      name?: string;
    }
    const migrations = new MigrationRegistry<Document>(2)
      .add(0, (document) => ({ ...document, version: 1, name: "natural" }))
      .add(1, (document) => ({ ...document, version: 2 }));
    expect(migrations.migrate({ version: 0 })).toEqual({ version: 2, name: "natural" });
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe(
      '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n',
    );
    expect(() => migrations.add(0, (document) => document)).toThrow("already exists");
    expect(() => migrations.migrate({ version: 3 })).toThrow("newer");
    expect(() => new MigrationRegistry<Document>(1).migrate({ version: 0 })).toThrow(
      "Missing migration",
    );
    expect(() =>
      new MigrationRegistry<Document>(1)
        .add(0, (document) => ({ ...document, version: 4 }))
        .migrate({ version: 0 }),
    ).toThrow("must produce");
  });

  test("project and UUID validation report actionable errors", () => {
    expect(() => defineProject({ id: "Not valid", name: "Bad" })).toThrow("Invalid project id");
    expect(() => defineProject({ id: "valid", name: "Bad", fixedTickRate: 0 })).toThrow("positive");
    expect(() => defineProject({ id: "valid", name: "" })).toThrow("name");
    expect(() =>
      defineProject({
        id: "valid",
        name: "Bad input",
        input: { move: { bindings: [{ type: "gamepadAxis", axis: -1 }] } },
      }),
    ).toThrow("control index");
    expect(() => definePlugin({ id: "not valid", setup: () => undefined })).toThrow("Plugin id");
    expect(() => uuid("bad")).toThrow("Invalid UUID");
  });

  test("profiler retains bounded percentile samples", () => {
    const profiler = new Profiler(3);
    profiler.record("render", 1);
    profiler.record("render", 2);
    profiler.record("render", 3);
    profiler.record("render", 4);
    profiler.begin("physics", 10);
    expect(profiler.end("physics", 12)).toBe(2);
    expect(profiler.stats("render")).toEqual({
      samples: 3,
      averageMs: 3,
      p50Ms: 3,
      p95Ms: 4,
      maxMs: 4,
    });
    expect(profiler.snapshot().physics?.averageMs).toBe(2);
    expect(profiler.stats("missing")).toBeNull();
    expect(() => profiler.record("bad", -1)).toThrow("non-negative");
    expect(() => profiler.end("missing")).toThrow("not started");
    profiler.clear();
    expect(profiler.snapshot()).toEqual({});
  });
});

describe("game lifecycle", () => {
  test("initializes plugins, pauses simulation, scales time, and disposes", async () => {
    const events: string[] = [];
    const plugin = definePlugin({
      id: "test.plugin",
      setup: (game) => {
        events.push("setup");
        game.scheduler.add(
          defineSystem({
            name: "tick",
            stage: "fixedUpdate",
            run: () => {
              events.push("tick");
            },
          }),
        );
      },
      dispose: () => {
        events.push("dispose");
      },
    });
    const game = createGame({
      project: defineProject({ id: "lifecycle", name: "Lifecycle", plugins: [plugin] }),
    });
    await game.initialize();
    await game.initialize();
    game.pause();
    await game.step(1 / 60);
    expect(game.tick).toBe(0);
    game.pause(false);
    game.setTimeScale(2);
    await game.step(1 / 120);
    expect(game.tick).toBe(1);
    expect(game.elapsed).toBeCloseTo(1 / 60);
    expect(() => game.setTimeScale(-1)).toThrow("non-negative");
    expect(game.scheduler.systems("fixedUpdate")).toHaveLength(1);
    expect(game.scheduler.remove("missing")).toBe(false);
    expect(game.scheduler.remove("tick")).toBe(true);
    await game.dispose();
    expect(events).toEqual(["setup", "tick", "dispose"]);
  });

  test("animation-frame loop reports errors and cancels on disposal", async () => {
    let callback: ((time: number) => void) | undefined;
    let cancelled = -1;
    const game = createGame({
      project: defineProject({ id: "frames", name: "Frames" }),
      now: () => 100,
      requestFrame: (next) => {
        callback = next;
        return 7;
      },
      cancelFrame: (handle) => {
        cancelled = handle;
      },
    });
    await game.start();
    expect(callback).toBeDefined();
    game.stop();
    expect(cancelled).toBe(7);
    expect(game.running).toBe(false);
    expect(game.initialized).toBe(true);
    expect(game.disposed).toBe(false);
    await game.start();
    expect(game.running).toBe(true);
    callback?.(116.67);
    await Bun.sleep(0);
    await game.dispose();
    expect(cancelled).toBe(7);
  });

  test("initialization is idempotent and rolls back initialized plugins on failure", async () => {
    const events: string[] = [];
    const first = definePlugin({
      id: "test.first",
      setup: () => {
        events.push("first setup");
      },
      dispose: () => {
        events.push("first dispose");
      },
    });
    const broken = definePlugin({
      id: "test.broken",
      setup: () => {
        throw new Error("setup failed");
      },
    });
    const game = createGame({
      project: defineProject({ id: "rollback", name: "Rollback", plugins: [first, broken] }),
    });
    expect(game.initialize()).rejects.toThrow("setup failed");
    expect(events).toEqual(["first setup", "first dispose"]);
    expect(game.disposed).toBe(true);
    expect(game.initialize()).rejects.toThrow("disposed");
    await game.dispose();
  });
});
