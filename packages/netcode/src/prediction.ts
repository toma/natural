export interface PredictedInput<TInput> {
  sequence: number;
  input: TInput;
}

export class Reconciler<TState, TInput> {
  readonly #pending: Array<PredictedInput<TInput>> = [];

  constructor(readonly simulate: (state: TState, input: TInput) => TState) {}

  predict(state: TState, input: TInput, sequence: number): TState {
    if (!Number.isSafeInteger(sequence) || sequence < 0)
      throw new Error("Prediction sequence must be a non-negative integer");
    const previous = this.#pending.at(-1);
    if (previous !== undefined && sequence <= previous.sequence)
      throw new Error("Prediction sequences must be strictly increasing");
    this.#pending.push({ sequence, input });
    return this.simulate(state, input);
  }

  reconcile(authoritative: TState, acknowledgedSequence: number): TState {
    if (!Number.isSafeInteger(acknowledgedSequence) || acknowledgedSequence < 0)
      throw new Error("Acknowledged sequence must be a non-negative integer");
    while ((this.#pending[0]?.sequence ?? Infinity) <= acknowledgedSequence) this.#pending.shift();
    return this.#pending.reduce(
      (state, pending) => this.simulate(state, pending.input),
      authoritative,
    );
  }

  clear(): void {
    this.#pending.length = 0;
  }

  get pendingCount(): number {
    return this.#pending.length;
  }
}

export class TickHistory<T> {
  readonly #entries = new Map<number, T>();

  constructor(readonly capacity = 120) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new Error("Tick history capacity must be a positive integer");
  }

  set(tick: number, value: T): void {
    if (!Number.isSafeInteger(tick) || tick < 0)
      throw new Error("History tick must be a non-negative integer");
    this.#entries.set(tick, structuredClone(value));
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  get(tick: number): T | undefined {
    const value = this.#entries.get(tick);
    return value === undefined ? undefined : structuredClone(value);
  }

  nearest(tick: number): { tick: number; value: T } | null {
    if (!Number.isSafeInteger(tick) || tick < 0)
      throw new Error("History tick must be a non-negative integer");
    const candidates = [...this.#entries.keys()].filter((candidate) => candidate <= tick);
    const nearest = Math.max(...candidates);
    const value = this.#entries.get(nearest);
    return value === undefined ? null : { tick: nearest, value: structuredClone(value) };
  }
}
