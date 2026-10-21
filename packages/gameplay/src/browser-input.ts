import { definePlugin, defineSystem, type EnginePlugin, type InputBinding } from "@toma.com/core";

export interface BrowserInputOptions {
  target?: Window;
  preventDefault?: boolean;
  pointerLockElement?: HTMLElement;
  pointerSensitivity?: number;
}

export interface PointerDelta {
  readonly x: number;
  readonly y: number;
}

export class BrowserPointerState {
  #pendingX = 0;
  #pendingY = 0;
  #frameX = 0;
  #frameY = 0;
  #locked = false;

  constructor(readonly sensitivity = 1) {
    if (!Number.isFinite(sensitivity) || sensitivity <= 0)
      throw new Error("Pointer sensitivity must be finite and positive");
  }

  recordMovement(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#pendingX += x * this.sensitivity;
    this.#pendingY += y * this.sensitivity;
  }

  beginFrame(): void {
    this.#frameX = this.#pendingX;
    this.#frameY = this.#pendingY;
    this.#pendingX = 0;
    this.#pendingY = 0;
  }

  clear(): void {
    this.#pendingX = 0;
    this.#pendingY = 0;
    this.#frameX = 0;
    this.#frameY = 0;
  }

  setLocked(value: boolean): void {
    this.#locked = value;
    if (!value) this.clear();
  }

  get delta(): PointerDelta {
    return { x: this.#frameX, y: this.#frameY };
  }

  get locked(): boolean {
    return this.#locked;
  }
}

export type BrowserInputPlugin = EnginePlugin & {
  readonly pointer: BrowserPointerState;
  requestPointerLock(): Promise<void>;
  exitPointerLock(): void;
};

export function createBrowserInputPlugin(options: BrowserInputOptions = {}): BrowserInputPlugin {
  const target = options.target ?? window;
  const document = target.document;
  const pointer = new BrowserPointerState(options.pointerSensitivity ?? 1);
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
  const onMouseMove = (event: MouseEvent): void => {
    if (pointer.locked) pointer.recordMovement(event.movementX, event.movementY);
  };
  const onPointerLockChange = (): void => {
    pointer.setLocked(document.pointerLockElement === options.pointerLockElement);
  };
  const clear = (): void => {
    keys.clear();
    mouseButtons.clear();
    pointer.clear();
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

  const plugin: BrowserInputPlugin = {
    id: "natural.input.browser",
    pointer,
    requestPointerLock: async (): Promise<void> => {
      const element = options.pointerLockElement;
      if (element === undefined) throw new Error("No pointer-lock element was configured");
      await element.requestPointerLock();
    },
    exitPointerLock: (): void => document.exitPointerLock(),
    setup: (game) => {
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
      target.addEventListener("mousedown", onMouseDown);
      target.addEventListener("mouseup", onMouseUp);
      target.addEventListener("mousemove", onMouseMove);
      target.addEventListener("blur", clear);
      document.addEventListener("pointerlockchange", onPointerLockChange);
      game.scheduler.add(
        defineSystem({
          name: "natural.input.browser.poll",
          stage: "input",
          run: () => {
            pointer.beginFrame();
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
      target.removeEventListener("mousemove", onMouseMove);
      target.removeEventListener("blur", clear);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      clear();
    },
  };
  return definePlugin(plugin) as BrowserInputPlugin;
}
