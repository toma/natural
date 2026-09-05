export interface SpatialEntity {
  id: number;
  x: number;
  y: number;
  z?: number;
}

export class InterestGrid {
  readonly #cells = new Map<string, Set<number>>();
  readonly #entities = new Map<number, SpatialEntity>();

  constructor(readonly cellSize = 32) {
    if (!Number.isFinite(cellSize) || cellSize <= 0)
      throw new Error("Interest grid cell size must be finite and positive");
  }

  update(entity: SpatialEntity): void {
    if (!Number.isSafeInteger(entity.id) || entity.id < 0)
      throw new Error("Interest entity id must be a non-negative integer");
    if (![entity.x, entity.y, entity.z ?? 0].every(Number.isFinite))
      throw new Error("Interest entity coordinates must be finite");
    const previous = this.#entities.get(entity.id);
    if (previous !== undefined) this.#removeFromCell(previous, entity.id);
    this.#entities.set(entity.id, { ...entity });
    const key = this.#key(entity);
    const cell = this.#cells.get(key) ?? new Set<number>();
    cell.add(entity.id);
    this.#cells.set(key, cell);
  }

  remove(id: number): void {
    const entity = this.#entities.get(id);
    if (entity === undefined) return;
    this.#removeFromCell(entity, id);
    this.#entities.delete(id);
  }

  query(position: Omit<SpatialEntity, "id">, radius: number): number[] {
    if (![position.x, position.y, position.z ?? 0].every(Number.isFinite))
      throw new Error("Interest query coordinates must be finite");
    if (!Number.isFinite(radius) || radius < 0)
      throw new Error("Interest query radius must be finite and non-negative");
    const result = new Set<number>();
    const cellRadius = Math.ceil(radius / this.cellSize);
    const centerX = Math.floor(position.x / this.cellSize);
    const centerY = Math.floor(position.y / this.cellSize);
    const centerZ = Math.floor((position.z ?? 0) / this.cellSize);
    const radiusSquared = radius ** 2;
    for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z += 1) {
      for (let y = centerY - cellRadius; y <= centerY + cellRadius; y += 1) {
        for (let x = centerX - cellRadius; x <= centerX + cellRadius; x += 1) {
          for (const id of this.#cells.get(`${x}:${y}:${z}`) ?? []) {
            const entity = this.#entities.get(id);
            if (entity === undefined) continue;
            const distance =
              (entity.x - position.x) ** 2 +
              (entity.y - position.y) ** 2 +
              ((entity.z ?? 0) - (position.z ?? 0)) ** 2;
            if (distance <= radiusSquared) result.add(id);
          }
        }
      }
    }
    return [...result].sort((left, right) => left - right);
  }

  get size(): number {
    return this.#entities.size;
  }

  #key(entity: Omit<SpatialEntity, "id">): string {
    return `${Math.floor(entity.x / this.cellSize)}:${Math.floor(entity.y / this.cellSize)}:${Math.floor((entity.z ?? 0) / this.cellSize)}`;
  }

  #removeFromCell(entity: Omit<SpatialEntity, "id">, id: number): void {
    const key = this.#key(entity);
    const cell = this.#cells.get(key);
    cell?.delete(id);
    if (cell?.size === 0) this.#cells.delete(key);
  }
}
