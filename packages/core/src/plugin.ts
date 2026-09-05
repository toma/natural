import type { Game } from "./game.ts";

export interface EnginePlugin {
  readonly id: string;
  readonly setup: (game: Game) => void | Promise<void>;
  readonly dispose?: (game: Game) => void | Promise<void>;
}

export function definePlugin(plugin: EnginePlugin): EnginePlugin {
  if (!/^[a-z][a-z0-9.-]+$/i.test(plugin.id))
    throw new Error(`Plugin id must be namespaced and URL-safe: ${plugin.id}`);
  return Object.freeze(plugin);
}
