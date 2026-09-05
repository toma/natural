import { canonicalJson } from "./serialization.ts";

export interface SaveAdapter {
  read(slot: string): Promise<string | null>;
  write(slot: string, value: string): Promise<void>;
  remove(slot: string): Promise<void>;
}

function assertSlot(slot: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(slot))
    throw new Error(`Invalid save slot: ${slot}`);
}

export class MemorySaveAdapter implements SaveAdapter {
  readonly #data = new Map<string, string>();

  async read(slot: string): Promise<string | null> {
    assertSlot(slot);
    return this.#data.get(slot) ?? null;
  }

  async write(slot: string, value: string): Promise<void> {
    assertSlot(slot);
    this.#data.set(slot, value);
  }

  async remove(slot: string): Promise<void> {
    assertSlot(slot);
    this.#data.delete(slot);
  }
}

export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class WebStorageSaveAdapter implements SaveAdapter {
  constructor(
    readonly storage: WebStorageLike,
    readonly prefix = "natural.save.",
  ) {
    if (prefix === "") throw new Error("Save storage prefix must not be empty");
  }

  async read(slot: string): Promise<string | null> {
    assertSlot(slot);
    return this.storage.getItem(this.prefix + slot);
  }

  async write(slot: string, value: string): Promise<void> {
    assertSlot(slot);
    this.storage.setItem(this.prefix + slot, value);
  }

  async remove(slot: string): Promise<void> {
    assertSlot(slot);
    this.storage.removeItem(this.prefix + slot);
  }
}

export class SaveManager<T> {
  constructor(
    readonly adapter: SaveAdapter,
    readonly validate: (value: unknown) => value is T,
  ) {}

  async save(slot: string, value: T): Promise<void> {
    assertSlot(slot);
    await this.adapter.write(slot, canonicalJson(value));
  }

  async load(slot: string): Promise<T | null> {
    assertSlot(slot);
    const source = await this.adapter.read(slot);
    if (source === null) return null;
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new Error(`Save slot ${slot} contains invalid JSON`, { cause: error });
    }
    if (!this.validate(value)) throw new Error(`Save slot ${slot} has invalid data`);
    return value;
  }

  async remove(slot: string): Promise<void> {
    assertSlot(slot);
    await this.adapter.remove(slot);
  }
}
