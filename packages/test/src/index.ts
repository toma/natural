import { createGame, defineProject, type Game, type ProjectDefinition } from "@toma.com/core";

export interface HeadlessGame {
  game: Game;
  advanceTicks(count: number): Promise<void>;
}

export async function createHeadlessGame(
  project: Partial<ProjectDefinition> = {},
): Promise<HeadlessGame> {
  const definition = defineProject({ id: "headless-test", name: "Headless Test", ...project });
  const game = createGame({ project: definition, now: () => 0 });
  await game.initialize();
  return {
    game,
    async advanceTicks(count: number): Promise<void> {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Tick count must be a non-negative integer");
      const delta = 1 / (definition.fixedTickRate ?? 60);
      for (let index = 0; index < count; index += 1) await game.step(delta);
    },
  };
}

export async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeoutMs)
      throw new Error(`Condition was not met within ${timeoutMs}ms`);
    await Bun.sleep(5);
  }
}
