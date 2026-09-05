export interface ReplayFrame {
  tick: number;
  inputs: Readonly<Record<string, string>>;
  checksum?: string;
}

export interface ReplayData {
  version: 1;
  tickRate: number;
  seed: number;
  frames: ReplayFrame[];
}

export class ReplayRecorder {
  readonly #frames: ReplayFrame[] = [];

  constructor(
    readonly tickRate: number,
    readonly seed: number,
  ) {
    if (!Number.isFinite(tickRate) || tickRate <= 0)
      throw new Error("Replay tickRate must be finite and positive");
    if (!Number.isSafeInteger(seed)) throw new Error("Replay seed must be an integer");
  }

  record(frame: ReplayFrame): void {
    assertFrame(frame);
    const previous = this.#frames.at(-1);
    if (previous !== undefined && frame.tick <= previous.tick)
      throw new Error("Replay ticks must be strictly increasing");
    this.#frames.push(structuredClone(frame));
  }

  export(): ReplayData {
    return {
      version: 1,
      tickRate: this.tickRate,
      seed: this.seed,
      frames: structuredClone(this.#frames),
    };
  }

  static parse(value: unknown): ReplayData {
    if (
      typeof value !== "object" ||
      value === null ||
      (value as Partial<ReplayData>).version !== 1 ||
      !Array.isArray((value as Partial<ReplayData>).frames)
    ) {
      throw new Error("Invalid Natural replay");
    }
    const replay = value as ReplayData;
    if (
      !Number.isFinite(replay.tickRate) ||
      replay.tickRate <= 0 ||
      !Number.isSafeInteger(replay.seed)
    )
      throw new Error("Invalid Natural replay");
    let previous = -1;
    for (const frame of replay.frames) {
      assertFrame(frame);
      if (frame.tick <= previous) throw new Error("Replay ticks must be strictly increasing");
      previous = frame.tick;
    }
    return structuredClone(replay);
  }
}

function assertFrame(frame: unknown): asserts frame is ReplayFrame {
  if (typeof frame !== "object" || frame === null || Array.isArray(frame))
    throw new Error("Replay frame must be an object");
  const candidate = frame as Partial<ReplayFrame>;
  if (!Number.isSafeInteger(candidate.tick) || (candidate.tick ?? -1) < 0)
    throw new Error("Replay tick must be a non-negative integer");
  if (
    typeof candidate.inputs !== "object" ||
    candidate.inputs === null ||
    Array.isArray(candidate.inputs) ||
    Object.values(candidate.inputs).some((input) => typeof input !== "string")
  )
    throw new Error("Replay inputs must contain strings");
  if (candidate.checksum !== undefined && typeof candidate.checksum !== "string")
    throw new Error("Replay checksum must be a string");
}
