export interface VersionedDocument {
  version: number;
}

export type Migration<T extends VersionedDocument> = (document: Readonly<T>) => T;

export class MigrationRegistry<T extends VersionedDocument> {
  readonly #migrations = new Map<number, Migration<T>>();

  constructor(readonly currentVersion: number) {}

  add(fromVersion: number, migration: Migration<T>): this {
    if (this.#migrations.has(fromVersion))
      throw new Error(`Migration ${fromVersion} already exists`);
    this.#migrations.set(fromVersion, migration);
    return this;
  }

  migrate(document: T): T {
    let current = structuredClone(document);
    if (current.version > this.currentVersion) {
      throw new Error(`Document version ${current.version} is newer than ${this.currentVersion}`);
    }
    while (current.version < this.currentVersion) {
      const migration = this.#migrations.get(current.version);
      if (migration === undefined)
        throw new Error(`Missing migration from version ${current.version}`);
      const previousVersion = current.version;
      current = migration(Object.freeze(current));
      if (current.version !== previousVersion + 1) {
        throw new Error(`Migration ${previousVersion} must produce version ${previousVersion + 1}`);
      }
    }
    return current;
  }
}

export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return item;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
