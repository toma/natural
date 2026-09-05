import {
  definePlugin,
  defineSystem,
  type EnginePlugin,
  type InputBinding,
} from "@natural-engine/core";

export interface BrowserInputOptions {
  target?: Window;
  preventDefault?: boolean;
}

export function createBrowserInputPlugin(options: BrowserInputOptions = {}): EnginePlugin {
  const target = options.target ?? window;
  const keys = new Set<string>();
  const mouseButtons = new Set<number>();
  const onKeyDown = (event: KeyboardEvent): void => {
    keys.add(event.code);
    if (options.preventDefault === true) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.code);
    if (options.preventDefault === true) event.preventDefault();
  };
  const onMouseDown = (event: MouseEvent): void => {
    mouseButtons.add(event.button);
  };
  const onMouseUp = (event: MouseEvent): void => {
    mouseButtons.delete(event.button);
  };

  const bindingValue = (binding: InputBinding): number => {
    const scale = binding.scale ?? 1;
    if (binding.type === "key") return keys.has(binding.code) ? scale : 0;
    if (binding.type === "mouseButton") return mouseButtons.has(binding.button) ? scale : 0;
    const gamepad = navigator.getGamepads()[binding.gamepad ?? 0];
    if (binding.type === "gamepadButton")
      return (gamepad?.buttons[binding.button]?.value ?? 0) * scale;
    const value = gamepad?.axes[binding.axis] ?? 0;
    return Math.abs(value) < (binding.deadzone ?? 0.15) ? 0 : value * scale;
  };

  return definePlugin({
    id: "natural.input.browser",
    setup: (game) => {
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
      target.addEventListener("mousedown", onMouseDown);
      target.addEventListener("mouseup", onMouseUp);
      game.scheduler.add(
        defineSystem({
          name: "natural.input.browser.poll",
          stage: "input",
          run: () => {
            for (const [action, definition] of Object.entries(game.project.input ?? {})) {
              let value = 0;
              for (const binding of definition.bindings) {
                const candidate = bindingValue(binding);
                if (Math.abs(candidate) > Math.abs(value)) value = candidate;
              }
              game.input.set(action, value);
            }
          },
        }),
      );
    },
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("mousedown", onMouseDown);
      target.removeEventListener("mouseup", onMouseUp);
    },
  });
}
