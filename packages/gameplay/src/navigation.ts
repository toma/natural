import type { Vec2 } from "@toma.com/core";

export interface NavigationGridOptions {
  width: number;
  height: number;
  cellSize?: number;
  blocked?: ReadonlySet<number>;
}

const directions = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

export class NavigationGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly blocked: Set<number>;

  constructor(options: NavigationGridOptions) {
    if (
      !Number.isSafeInteger(options.width) ||
      !Number.isSafeInteger(options.height) ||
      options.width <= 0 ||
      options.height <= 0 ||
      options.width * options.height > 100_000_000
    )
      throw new Error("Navigation dimensions must be positive integers within the grid limit");
    const cellSize = options.cellSize ?? 1;
    if (!Number.isFinite(cellSize) || cellSize <= 0)
      throw new Error("Navigation cellSize must be finite and positive");
    if (
      [...(options.blocked ?? [])].some(
        (index) =>
          !Number.isSafeInteger(index) || index < 0 || index >= options.width * options.height,
      )
    )
      throw new Error("Navigation blocked-cell index is out of bounds");
    this.width = options.width;
    this.height = options.height;
    this.cellSize = cellSize;
    this.blocked = new Set(options.blocked);
  }

  setBlocked(cell: Vec2, blocked = true): void {
    const index = this.#index(cell);
    if (blocked) this.blocked.add(index);
    else this.blocked.delete(index);
  }

  findPath(start: Vec2, goal: Vec2): Vec2[] {
    const startIndex = this.#index(start);
    const goalIndex = this.#index(goal);
    if (this.blocked.has(startIndex) || this.blocked.has(goalIndex)) return [];
    const frontier: Array<{ index: number; priority: number }> = [
      { index: startIndex, priority: 0 },
    ];
    const cameFrom = new Map<number, number>();
    const costs = new Map<number, number>([[startIndex, 0]]);
    while (frontier.length > 0) {
      frontier.sort((left, right) => left.priority - right.priority);
      const current = frontier.shift()!.index;
      if (current === goalIndex) break;
      const point = this.#point(current);
      for (const direction of directions) {
        const next = { x: point.x + direction.x, y: point.y + direction.y };
        if (!this.#inside(next)) continue;
        const nextIndex = this.#index(next);
        if (this.blocked.has(nextIndex)) continue;
        const newCost = (costs.get(current) ?? 0) + 1;
        if (newCost >= (costs.get(nextIndex) ?? Infinity)) continue;
        costs.set(nextIndex, newCost);
        cameFrom.set(nextIndex, current);
        frontier.push({
          index: nextIndex,
          priority: newCost + Math.abs(goal.x - next.x) + Math.abs(goal.y - next.y),
        });
      }
    }
    if (startIndex !== goalIndex && !cameFrom.has(goalIndex)) return [];
    const path: Vec2[] = [this.#point(goalIndex)];
    let current = goalIndex;
    while (current !== startIndex) {
      current = cameFrom.get(current)!;
      path.push(this.#point(current));
    }
    return path.reverse();
  }

  #inside(point: Vec2): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height;
  }

  #index(point: Vec2): number {
    if (!this.#inside(point) || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      throw new Error(`Navigation cell is out of bounds: ${point.x},${point.y}`);
    }
    return point.y * this.width + point.x;
  }

  #point(index: number): Vec2 {
    return { x: index % this.width, y: Math.floor(index / this.width) };
  }
}
