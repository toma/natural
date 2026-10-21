import { Vector3 } from "three";

interface Point {
  x: number;
  y: number;
  z: number;
}
interface RayHit {
  hit: boolean;
  distance: number;
  point: Point;
  normal: Point;
}
interface Physics {
  MASK: { WORLD: number };
  raycast(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    distance: number,
    mask: number,
  ): RayHit;
  raycastAny(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    distance: number,
    mask: number,
  ): boolean;
}
interface Options {
  bounds: { min: Point; max: Point };
  cell?: number;
  radius?: number;
  height?: number;
}
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Separate walkable floors in each column, linked only by physically clear steps. */
export class LayeredNavGrid {
  readonly cell: number;
  readonly radius: number;
  readonly height: number;
  readonly maxStep = 0.45;
  readonly minX: number;
  readonly minZ: number;
  readonly nx: number;
  readonly nz: number;
  readonly rows: number;
  readonly layers = 4;
  readonly floor: Float32Array;
  readonly flags: Uint8Array;
  readonly enclosure: Uint8Array;
  readonly edges: number[][];
  walkableCount = 0;
  buildMs = 0;

  constructor(
    readonly physics: Physics,
    readonly options: Options,
  ) {
    this.cell = options.cell ?? 0.4;
    this.radius = options.radius ?? 0.33;
    this.height = options.height ?? 1.78;
    this.minX = Math.floor(options.bounds.min.x / this.cell) * this.cell;
    this.minZ = Math.floor(options.bounds.min.z / this.cell) * this.cell;
    this.nx = Math.ceil((options.bounds.max.x - this.minX) / this.cell) + 1;
    this.rows = Math.ceil((options.bounds.max.z - this.minZ) / this.cell) + 1;
    this.nz = this.rows * this.layers;
    this.floor = new Float32Array(this.nx * this.nz);
    this.floor.fill(-Infinity);
    this.flags = new Uint8Array(this.floor.length);
    this.enclosure = new Uint8Array(this.floor.length);
    this.edges = Array.from({ length: this.floor.length }, () => []);
  }
  index(x: number, z: number) {
    return z * this.nx + x;
  }
  cellX(x: number) {
    return Math.round((x - this.minX) / this.cell);
  }
  cellZ(z: number) {
    return Math.round((z - this.minZ) / this.cell);
  }
  worldX(x: number) {
    return this.minX + x * this.cell;
  }
  worldZ(z: number) {
    return this.minZ + (z % this.rows) * this.cell;
  }
  inside(x: number, z: number) {
    return x >= 0 && x < this.nx && z >= 0 && z < this.nz;
  }
  walkable(x: number, z: number) {
    return this.inside(x, z) && this.flags[this.index(x, z)] === 1;
  }
  floorAt(x: number, z: number) {
    return this.floor[this.index(x, z)]!;
  }
  position(i: number, out: Vector3) {
    return out.set(this.worldX(i % this.nx), this.floor[i]!, this.worldZ(Math.floor(i / this.nx)));
  }

  build() {
    const start = performance.now(),
      mask = this.physics.MASK.WORLD;
    for (let iz = 0; iz < this.rows; iz++)
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.worldX(ix),
          z = this.worldZ(iz),
          floors: number[] = [];
        let from = this.options.bounds.max.y + 2;
        for (let probe = 0; probe < 16 && from > this.options.bounds.min.y; probe++) {
          const hit = this.physics.raycast(
            x,
            from,
            z,
            0,
            -1,
            0,
            from - this.options.bounds.min.y + 1,
            mask,
          );
          if (!hit.hit) break;
          const y = hit.point.y,
            normal = hit.normal.y;
          from = y - 0.06;
          if (normal < 0.68 || y > 6 || floors.some((f) => Math.abs(f - y) < 0.2)) continue;
          if (this.physics.raycastAny(x, y + 0.06, z, 0, 1, 0, this.height - 0.08, mask)) continue;
          let blocked = false;
          for (const [dx, dz] of DIRECTIONS.slice(0, 4)) {
            if (this.physics.raycastAny(x, y + 0.75, z, dx, 0, dz, this.radius + 0.015, mask)) {
              blocked = true;
              break;
            }
          }
          if (!blocked) floors.push(y);
        }
        floors.sort((a, b) => a - b);
        for (let layer = 0; layer < Math.min(this.layers, floors.length); layer++) {
          const i = this.index(ix, iz + layer * this.rows);
          this.flags[i] = 1;
          this.floor[i] = floors[layer]!;
          this.walkableCount++;
          this.enclosure[i] = DIRECTIONS.slice(0, 4).filter(([dx, dz]) =>
            this.physics.raycastAny(x, this.floor[i]! + 0.9, z, dx, 0, dz, this.cell * 1.5, mask),
          ).length;
        }
      }
    const a = new Vector3(),
      b = new Vector3();
    for (let i = 0; i < this.floor.length; i++)
      if (this.flags[i]) {
        const ix = i % this.nx,
          iz = Math.floor(i / this.nx) % this.rows;
        this.position(i, a);
        for (const [dx, dz] of DIRECTIONS) {
          const xx = ix + dx,
            zz = iz + dz;
          if (xx < 0 || xx >= this.nx || zz < 0 || zz >= this.rows) continue;
          for (let layer = 0; layer < this.layers; layer++) {
            const j = this.index(xx, zz + layer * this.rows);
            if (!this.flags[j] || Math.abs(this.floor[j]! - a.y) > this.maxStep) continue;
            this.position(j, b);
            if (this.clearSegment(a, b)) this.edges[i]!.push(j);
          }
        }
      }
    this.buildMs = performance.now() - start;
    return this;
  }

  private clearSegment(a: Point, b: Point) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d = Math.hypot(dx, dz);
    if (d < 0.0001) return Math.abs(b.y - a.y) < 0.2;
    const nx = dx / d,
      nz = dz / d;
    for (const offset of [-this.radius, 0, this.radius]) {
      if (
        this.physics.raycastAny(
          a.x - nz * offset,
          Math.max(a.y, b.y) + 0.55,
          a.z + nx * offset,
          nx,
          0,
          nz,
          d,
          this.physics.MASK.WORLD,
        )
      )
        return false;
    }
    return true;
  }

  nearest(x: number, z: number, y: number | null = null, maxRings = 8, yTol = 1.4) {
    const cx = this.cellX(x),
      cz = this.cellZ(z);
    for (let ring = 0; ring <= maxRings; ring++) {
      let best = -1,
        score = Infinity;
      for (let dz = -ring; dz <= ring; dz++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const ix = cx + dx,
            iz = cz + dz;
          if (ix < 0 || ix >= this.nx || iz < 0 || iz >= this.rows) continue;
          for (let layer = 0; layer < this.layers; layer++) {
            const i = this.index(ix, iz + layer * this.rows);
            if (!this.flags[i]) continue;
            const dy = y === null ? 0 : Math.abs(this.floor[i]! - y);
            if (dy > yTol) continue;
            const s = dx * dx + dz * dz + dy * dy * 25;
            if (s < score) {
              score = s;
              best = i;
            }
          }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  lineOfWalk(a: Point, b: Point) {
    if (!this.clearSegment(a, b)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell * 0.6)));
    let previous = a.y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const i = this.nearest(
        a.x + (b.x - a.x) * t,
        a.z + (b.z - a.z) * t,
        previous,
        0,
        this.maxStep + 0.02,
      );
      if (i < 0) return false;
      previous = this.floor[i]!;
    }
    return Math.abs(previous - b.y) < this.maxStep;
  }

  findPath(from: Point, to: Point, out: Vector3[], opts: { maxNodes?: number } = {}) {
    const start = this.nearest(from.x, from.z, from.y),
      goal = this.nearest(to.x, to.z, to.y);
    if (start < 0 || goal < 0) return 0;
    const costs = new Float32Array(this.floor.length);
    costs.fill(Infinity);
    const parents = new Int32Array(this.floor.length);
    parents.fill(-1);
    const open: { i: number; score: number }[] = [];
    const push = (i: number, score: number) => {
      open.push({ i, score });
      let n = open.length - 1;
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (open[p]!.score <= score) break;
        [open[p], open[n]] = [open[n]!, open[p]!];
        n = p;
      }
    };
    const pop = () => {
      const top = open[0]!;
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let n = 0;
        for (;;) {
          let c = n * 2 + 1;
          if (c >= open.length) break;
          if (c + 1 < open.length && open[c + 1]!.score < open[c]!.score) c++;
          if (open[n]!.score <= open[c]!.score) break;
          [open[n], open[c]] = [open[c]!, open[n]!];
          n = c;
        }
      }
      return top.i;
    };
    const goalPos = this.position(goal, new Vector3()),
      p = new Vector3(),
      q = new Vector3();
    costs[start] = 0;
    push(start, 0);
    let found = false,
      count = 0;
    while (open.length && count++ < (opts.maxNodes ?? 14000)) {
      const i = pop();
      if (i === goal) {
        found = true;
        break;
      }
      this.position(i, p);
      for (const j of this.edges[i]!) {
        this.position(j, q);
        const cost = costs[i]! + p.distanceTo(q) + Math.abs(p.y - q.y) * 0.25;
        if (cost >= costs[j]!) continue;
        costs[j] = cost;
        parents[j] = i;
        push(j, cost + q.distanceTo(goalPos));
      }
    }
    if (!found) return 0;
    const raw: number[] = [];
    for (let i = goal; i >= 0; i = parents[i]!) raw.push(i);
    raw.reverse();
    let n = 0,
      index = 0;
    const anchor = new Vector3(from.x, from.y, from.z);
    while (index < raw.length - 1) {
      let next = index + 1;
      for (let j = Math.min(raw.length - 1, index + 20); j > index + 1; j--) {
        this.position(raw[j]!, p);
        if (this.lineOfWalk(anchor, p)) {
          next = j;
          break;
        }
      }
      this.position(raw[next]!, p);
      (out[n] ??= new Vector3()).copy(p);
      anchor.copy(p);
      n++;
      index = next;
    }
    if (n === 0 || this.lineOfWalk(anchor, to)) (out[n++] ??= new Vector3()).set(to.x, to.y, to.z);
    return n;
  }
}
