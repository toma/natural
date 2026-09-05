import {
  LocalTransform,
  defineComponent,
  definePlugin,
  defineSystem,
  type EnginePlugin,
  type Entity,
} from "@natural-engine/core";

export interface AudioSourceData {
  source: string;
  autoplay: boolean;
  loop: boolean;
  volume: number;
  spatial: boolean;
  playing: boolean;
}

export const AudioSource = defineComponent<AudioSourceData>({
  id: "natural.audio.source",
  defaults: () => ({
    source: "",
    autoplay: false,
    loop: false,
    volume: 1,
    spatial: true,
    playing: false,
  }),
  validate: (value): value is AudioSourceData => {
    const data = value as Partial<AudioSourceData>;
    return (
      typeof value === "object" &&
      value !== null &&
      typeof data.source === "string" &&
      typeof data.autoplay === "boolean" &&
      typeof data.loop === "boolean" &&
      typeof data.volume === "number" &&
      Number.isFinite(data.volume) &&
      data.volume >= 0 &&
      data.volume <= 1 &&
      typeof data.spatial === "boolean" &&
      typeof data.playing === "boolean"
    );
  },
});

interface PlayingSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner?: PannerNode;
  sourceUrl: string;
  spatial: boolean;
}

interface PendingSource {
  sourceUrl: string;
  cancelled: boolean;
}

const key = (entity: Entity): string => `${entity.index}:${entity.generation}`;

export function createAudioPlugin(context = new AudioContext()): EnginePlugin {
  const playing = new Map<string, PlayingSource>();
  const starting = new Map<string, PendingSource>();
  const autoplayed = new Map<string, string>();
  const buffers = new Map<string, Promise<AudioBuffer>>();
  const load = (source: string): Promise<AudioBuffer> => {
    const existing = buffers.get(source);
    if (existing !== undefined) return existing;
    const pending = fetch(source)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load audio ${source}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((value) => context.decodeAudioData(value));
    buffers.set(source, pending);
    void pending.catch(() => {
      if (buffers.get(source) === pending) buffers.delete(source);
    });
    return pending;
  };
  const stop = (entityKey: string): void => {
    const pending = starting.get(entityKey);
    if (pending !== undefined) pending.cancelled = true;
    starting.delete(entityKey);
    const active = playing.get(entityKey);
    if (active === undefined) return;
    try {
      active.source.stop();
    } catch {
      // An already-ended source is safe to disconnect.
    }
    active.source.disconnect();
    active.gain.disconnect();
    active.panner?.disconnect();
    playing.delete(entityKey);
  };
  return definePlugin({
    id: "natural.audio.web",
    setup: (game) => {
      game.world.register(AudioSource);
      game.scheduler.add(
        defineSystem({
          name: "natural.audio.sync",
          stage: "update",
          run: () => {
            const seen = new Set<string>();
            for (const row of game.world.query(LocalTransform, AudioSource)) {
              const [transform, audio] = row.components;
              const entityKey = key(row.entity);
              seen.add(entityKey);
              let active = playing.get(entityKey);
              if (
                active !== undefined &&
                (active.sourceUrl !== audio.source || active.spatial !== audio.spatial)
              ) {
                stop(entityKey);
                active = undefined;
              }
              if (!audio.autoplay) autoplayed.delete(entityKey);
              const shouldAutoplay = audio.autoplay && autoplayed.get(entityKey) !== audio.source;
              if (
                (audio.playing || shouldAutoplay) &&
                active === undefined &&
                !starting.has(entityKey) &&
                audio.source !== ""
              ) {
                const requested = audio.source;
                const pending: PendingSource = { sourceUrl: requested, cancelled: false };
                starting.set(entityKey, pending);
                if (shouldAutoplay) autoplayed.set(entityKey, requested);
                void load(requested)
                  .then((buffer) => {
                    if (
                      pending.cancelled ||
                      starting.get(entityKey) !== pending ||
                      !game.world.isAlive(row.entity)
                    )
                      return;
                    const current = game.world.get(row.entity, AudioSource);
                    const currentTransform = game.world.get(row.entity, LocalTransform);
                    if (
                      current === undefined ||
                      currentTransform === undefined ||
                      current.source !== requested ||
                      (!current.playing && !current.autoplay)
                    )
                      return;
                    const source = context.createBufferSource();
                    source.buffer = buffer;
                    source.loop = current.loop;
                    const gain = context.createGain();
                    gain.gain.value = current.volume;
                    let started: PlayingSource;
                    if (current.spatial) {
                      const panner = context.createPanner();
                      panner.positionX.value = currentTransform.position.x;
                      panner.positionY.value = currentTransform.position.y;
                      panner.positionZ.value = currentTransform.position.z;
                      source.connect(gain).connect(panner).connect(context.destination);
                      started = { source, gain, panner, sourceUrl: requested, spatial: true };
                    } else {
                      source.connect(gain).connect(context.destination);
                      started = { source, gain, sourceUrl: requested, spatial: false };
                    }
                    source.addEventListener(
                      "ended",
                      () => {
                        if (playing.get(entityKey) === started) playing.delete(entityKey);
                        if (game.world.isAlive(row.entity)) {
                          const latest = game.world.get(row.entity, AudioSource);
                          if (latest?.source === requested) latest.playing = false;
                        }
                      },
                      { once: true },
                    );
                    playing.set(entityKey, started);
                    current.playing = true;
                    source.start();
                  })
                  .catch((error: unknown) => {
                    if (!pending.cancelled) {
                      audio.playing = false;
                      game.onError.emit(
                        error instanceof Error ? error : new Error(`Could not load ${requested}`),
                      );
                    }
                  })
                  .finally(() => {
                    if (starting.get(entityKey) === pending) starting.delete(entityKey);
                  });
              } else if (!audio.playing && active !== undefined) stop(entityKey);
              if (active !== undefined) {
                active.gain.gain.value = audio.volume;
                active.source.loop = audio.loop;
                if (active.panner !== undefined) {
                  active.panner.positionX.value = transform.position.x;
                  active.panner.positionY.value = transform.position.y;
                  active.panner.positionZ.value = transform.position.z;
                }
              }
            }
            for (const entityKey of new Set([...playing.keys(), ...starting.keys()])) {
              if (!seen.has(entityKey)) {
                stop(entityKey);
                autoplayed.delete(entityKey);
              }
            }
          },
        }),
      );
    },
    dispose: async () => {
      for (const entityKey of [...playing.keys()]) stop(entityKey);
      for (const pending of starting.values()) pending.cancelled = true;
      starting.clear();
      autoplayed.clear();
      buffers.clear();
      await context.close();
    },
  });
}
