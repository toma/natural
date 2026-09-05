export type InputBinding =
  | { type: "key"; code: string; scale?: number }
  | { type: "mouseButton"; button: number; scale?: number }
  | { type: "gamepadButton"; button: number; gamepad?: number; scale?: number }
  | { type: "gamepadAxis"; axis: number; gamepad?: number; deadzone?: number; scale?: number };

export interface InputActionDefinition {
  bindings: readonly InputBinding[];
}

export type InputMap = Readonly<Record<string, InputActionDefinition>>;

export function validateInputMap(map: InputMap): void {
  for (const [action, definition] of Object.entries(map)) {
    if (!/^[a-z][a-zA-Z0-9.-]*$/.test(action)) throw new Error(`Invalid input action: ${action}`);
    if (!Array.isArray(definition.bindings))
      throw new Error(`Input action ${action} bindings must be an array`);
    for (const binding of definition.bindings) {
      if (binding.scale !== undefined && !Number.isFinite(binding.scale))
        throw new Error(`Input action ${action} has a non-finite scale`);
      if (binding.type === "key") {
        if (binding.code.trim() === "") throw new Error(`Input action ${action} has an empty key`);
        continue;
      }
      const control = binding.type === "gamepadAxis" ? binding.axis : binding.button;
      if (!Number.isSafeInteger(control) || control < 0)
        throw new Error(`Input action ${action} has an invalid control index`);
      if (
        "gamepad" in binding &&
        binding.gamepad !== undefined &&
        (!Number.isSafeInteger(binding.gamepad) || binding.gamepad < 0 || binding.gamepad > 15)
      )
        throw new Error(`Input action ${action} has an invalid gamepad index`);
      if (
        binding.type === "gamepadAxis" &&
        binding.deadzone !== undefined &&
        (!Number.isFinite(binding.deadzone) || binding.deadzone < 0 || binding.deadzone > 1)
      )
        throw new Error(`Input action ${action} has an invalid deadzone`);
    }
  }
}

interface ActionState {
  value: number;
  previous: number;
}

export class InputState {
  readonly #actions = new Map<string, ActionState>();

  constructor(readonly map: InputMap = {}) {
    validateInputMap(map);
    for (const action of Object.keys(map)) this.#actions.set(action, { value: 0, previous: 0 });
  }

  beginFrame(): void {
    for (const state of this.#actions.values()) state.previous = state.value;
  }

  set(action: string, value: number): void {
    if (!Number.isFinite(value)) throw new Error(`Input action ${action} value must be finite`);
    const state = this.#actions.get(action);
    if (state === undefined) throw new Error(`Unknown input action: ${action}`);
    state.value = Math.max(-1, Math.min(1, value));
  }

  value(action: string): number {
    return this.#actions.get(action)?.value ?? 0;
  }

  pressed(action: string): boolean {
    const state = this.#actions.get(action);
    return state !== undefined && state.value > 0 && state.previous <= 0;
  }

  released(action: string): boolean {
    const state = this.#actions.get(action);
    return state !== undefined && state.value <= 0 && state.previous > 0;
  }
}
