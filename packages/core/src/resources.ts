import { Signal } from "./signal.ts";

export interface ResourceDefinition<T> {
  readonly id: string;
  readonly load: (source: string, signal: AbortSignal) => Promise<T>;
  readonly dispose?: (value: T) => void;
}

export interface ResourceHandle<T> {
  readonly key: string;
  readonly value: T;
  release(): void;
}

interface Entry<T> {
  value: T;
  references: number;
  dispose?: (value: T) => void;
}

interface LoadingEntry<T> {
  promise: Promise<Entry<T>>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
}

export function defineResource<T>(definition: ResourceDefinition<T>): ResourceDefinition<T> {
  if (!/^[a-z][a-z0-9.-]+$/i.test(definition.id))
    throw new Error(`Resource id must be namespaced and URL-safe: ${definition.id}`);
  return Object.freeze(definition);
}

export class ResourceManager {
  readonly onChanged = new Signal<{ key: string; action: "loaded" | "disposed" }>();
  // Resource managers erase values internally and restore them on typed handles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #entries = new Map<string, Entry<any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #loading = new Map<string, LoadingEntry<any>>();
  readonly #definitions = new Map<string, ResourceDefinition<unknown>>();
  #disposed = false;

  async acquire<T>(
    definition: ResourceDefinition<T>,
    source: string,
    signal?: AbortSignal,
  ): Promise<ResourceHandle<T>> {
    if (this.#disposed) throw new Error("Resource manager is disposed");
    const registered = this.#definitions.get(definition.id);
    if (registered !== undefined && registered !== definition)
      throw new Error(`A different resource definition already uses ${definition.id}`);
    this.#definitions.set(definition.id, definition as ResourceDefinition<unknown>);
    const key = `${definition.id}:${source}`;
    let entry = this.#entries.get(key) as Entry<T> | undefined;
    let acquiredFromLoad = false;
    if (entry === undefined) {
      let loading = this.#loading.get(key) as LoadingEntry<T> | undefined;
      if (loading === undefined) {
        const controller = new AbortController();
        const promise = definition.load(source, controller.signal).then((value) => {
          if (this.#disposed) {
            definition.dispose?.(value);
            throw new Error("Resource manager was disposed while loading");
          }
          const created: Entry<T> = {
            value,
            references: 0,
            ...(definition.dispose === undefined ? {} : { dispose: definition.dispose }),
          };
          this.#entries.set(key, created);
          this.onChanged.emit({ key, action: "loaded" });
          return created;
        });
        loading = { promise, controller, consumers: 0, settled: false };
        this.#loading.set(key, loading);
        void promise.then(
          () => this.#finishLoading(key, loading!),
          () => this.#finishLoading(key, loading!),
        );
      }
      loading.consumers += 1;
      try {
        entry = await this.#waitFor(loading.promise, signal);
        entry.references += 1;
        acquiredFromLoad = true;
      } finally {
        loading.consumers -= 1;
        if (loading.consumers === 0) {
          if (!loading.settled) loading.controller.abort();
          else {
            const unused = this.#entries.get(key) as Entry<T> | undefined;
            if (unused?.references === 0) this.#disposeEntry(key, unused);
          }
        }
      }
    }
    if (!acquiredFromLoad) entry.references += 1;
    let released = false;
    return {
      key,
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        this.release(key);
      },
    };
  }

  release(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    entry.references -= 1;
    if (entry.references > 0) return;
    this.#disposeEntry(key, entry);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const loading of this.#loading.values()) loading.controller.abort();
    this.#loading.clear();
    for (const [key, entry] of this.#entries) {
      entry.dispose?.(entry.value);
      this.onChanged.emit({ key, action: "disposed" });
    }
    this.#entries.clear();
    this.#definitions.clear();
  }

  get size(): number {
    return this.#entries.size;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #finishLoading<T>(key: string, loading: LoadingEntry<T>): void {
    loading.settled = true;
    if (this.#loading.get(key) === loading) this.#loading.delete(key);
    const unused = this.#entries.get(key);
    if (loading.consumers === 0 && unused?.references === 0) this.#disposeEntry(key, unused);
  }

  #disposeEntry<T>(key: string, entry: Entry<T>): void {
    entry.dispose?.(entry.value);
    this.#entries.delete(key);
    this.onChanged.emit({ key, action: "disposed" });
  }

  #waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal === undefined) return promise;
    if (signal.aborted) return Promise.reject(new Error("Resource acquisition aborted"));
    return new Promise<T>((resolve, reject) => {
      const abort = (): void => reject(new Error("Resource acquisition aborted"));
      signal.addEventListener("abort", abort, { once: true });
      void promise.then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", abort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}
