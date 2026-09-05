export interface ProfileStats {
  samples: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export class Profiler {
  readonly #samples = new Map<string, number[]>();
  readonly #started = new Map<string, number>();

  constructor(readonly sampleLimit = 600) {}

  begin(name: string, now = performance.now()): void {
    if (this.#started.has(name)) throw new Error(`Profile span is already active: ${name}`);
    this.#started.set(name, now);
  }

  end(name: string, now = performance.now()): number {
    const started = this.#started.get(name);
    if (started === undefined) throw new Error(`Profile span was not started: ${name}`);
    this.#started.delete(name);
    const duration = now - started;
    this.record(name, duration);
    return duration;
  }

  record(name: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0)
      throw new Error("Profile duration must be non-negative and finite");
    const samples = this.#samples.get(name) ?? [];
    samples.push(durationMs);
    if (samples.length > this.sampleLimit) samples.shift();
    this.#samples.set(name, samples);
  }

  stats(name: string): ProfileStats | null {
    const values = this.#samples.get(name);
    if (values === undefined || values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return {
      samples: sorted.length,
      averageMs: sorted.reduce((total, value) => total + value, 0) / sorted.length,
      p50Ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      maxMs: sorted.at(-1) ?? 0,
    };
  }

  snapshot(): Readonly<Record<string, ProfileStats>> {
    return Object.fromEntries(
      [...this.#samples.keys()].flatMap((name) => {
        const stats = this.stats(name);
        return stats === null ? [] : [[name, stats]];
      }),
    );
  }

  clear(): void {
    this.#samples.clear();
    this.#started.clear();
  }
}
