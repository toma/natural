import {
  createGame,
  definePlugin,
  defineProject,
  defineSystem,
  type EnginePlugin,
  type Game,
} from "@toma.com/core";

export interface Subsystem<C> {
  id: string;
  init?(context: C): void | Promise<void>;
  fixedUpdate?: (delta: number, context: C) => void;
  update?: (delta: number, context: C) => void;
  lateUpdate?: (delta: number, context: C) => void;
  dispose?(): void;
}

export interface FrameClock {
  elapsed: number;
  raw: number;
  dt: number;
  fixed: number;
  alpha: number;
  scale: number;
  frame: number;
}

/** Preserve subsystem ordering while Natural owns scheduling and fixed ticks. */
export function createRuntime<C>(options: {
  context: C;
  clock: FrameClock;
  systems: ReadonlyArray<Subsystem<C>>;
  renderer: EnginePlugin;
  beginFrame(): void;
  endFrame(): void;
}) {
  const { context, clock } = options;
  const framePlugin = definePlugin({
    id: "natural-fps.frame",
    setup(game) {
      game.scheduler.add(
        defineSystem({
          name: "natural-fps.frame.begin",
          stage: "input",
          run: ({ delta, unscaledDelta }) => {
            clock.raw += unscaledDelta ?? delta;
            clock.dt = delta;
            clock.elapsed += delta;
            clock.frame += 1;
            options.beginFrame();
          },
        }),
        defineSystem({
          name: "natural-fps.frame.alpha",
          stage: "update",
          run: ({ alpha }) => {
            clock.alpha = alpha;
          },
        }),
        defineSystem({
          name: "natural-fps.frame.end",
          stage: "render",
          after: ["natural.renderer.sync"],
          run: () => options.endFrame(),
        }),
      );
    },
  });
  const systems = options.systems.map((system, index) =>
    definePlugin({
      id: `natural-fps.${system.id}`,
      async setup(game) {
        try {
          await system.init?.(context);
        } catch (error) {
          try {
            system.dispose?.();
          } catch {
            /* retain the initialization error */
          }
          throw error;
        }
        for (const [method, stage] of [
          ["fixedUpdate", "fixedUpdate"],
          ["update", "update"],
          ["lateUpdate", "animation"],
        ] as const) {
          const callback = system[method];
          if (callback === undefined) continue;
          const before = options.systems
            .slice(0, index)
            .filter((s) => s[method] !== undefined)
            .at(-1);
          game.scheduler.add(
            defineSystem({
              name: `natural-fps.${system.id}.${method}`,
              stage,
              after: before
                ? [`natural-fps.${before.id}.${method}`]
                : stage === "update"
                  ? ["natural-fps.frame.alpha"]
                  : [],
              run: ({ delta }) => callback(delta, context),
            }),
          );
        }
      },
      dispose: () => system.dispose?.(),
    }),
  );
  const game: Game = createGame({
    ...(globalThis.requestAnimationFrame === undefined
      ? {}
      : {
          requestFrame: (callback: (time: number) => void) =>
            requestAnimationFrame((now) => {
              game.setTimeScale(clock.scale);
              callback(now);
            }),
        }),
    project: defineProject({
      id: "natural-fps",
      name: "NaturalFPS",
      fixedTickRate: 120,
      maxFrameDelta: 0.1,
      maxFixedSteps: 8,
      plugins: [options.renderer, framePlugin, ...systems],
    }),
  });
  return game;
}
