export type Unsubscribe = () => void;

export class Signal<T> {
  readonly #listeners = new Set<(value: T) => void>();

  subscribe(listener: (value: T) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  once(listener: (value: T) => void): Unsubscribe {
    const unsubscribe = this.subscribe((value) => {
      unsubscribe();
      listener(value);
    });
    return unsubscribe;
  }

  emit(value: T): void {
    for (const listener of [...this.#listeners]) listener(value);
  }

  clear(): void {
    this.#listeners.clear();
  }

  get size(): number {
    return this.#listeners.size;
  }
}
