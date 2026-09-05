import { defineComponent, World } from "../packages/core/src/index.ts";

const Transform = defineComponent({
  id: "benchmark.transform",
  defaults: () => ({ x: 0, y: 0, z: 0 }),
});
const Velocity = defineComponent({
  id: "benchmark.velocity",
  defaults: () => ({ x: 1, y: 1, z: 1 }),
});
const entityCount = Number(process.env.NATURAL_ACTIVE_ENTITIES ?? 10_000);
const frames = Number(process.env.NATURAL_BENCH_FRAMES ?? 60);
const maxP95Ms = Number(process.env.NATURAL_BENCH_MAX_P95_MS ?? 16.7);
if (!Number.isSafeInteger(entityCount) || entityCount <= 0)
  throw new Error("NATURAL_ACTIVE_ENTITIES must be a positive integer");
if (!Number.isSafeInteger(frames) || frames <= 0)
  throw new Error("NATURAL_BENCH_FRAMES must be a positive integer");
if (!Number.isFinite(maxP95Ms) || maxP95Ms <= 0)
  throw new Error("NATURAL_BENCH_MAX_P95_MS must be finite and positive");
const world = new World();
const allocationStarted = performance.now();
for (let index = 0; index < entityCount; index += 1) {
  const entity = world.createEntity();
  world.add(entity, Transform, { x: index });
  world.add(entity, Velocity);
}
const allocationMs = performance.now() - allocationStarted;
const samples: number[] = [];
for (let frame = 0; frame < frames; frame += 1) {
  const started = performance.now();
  for (const row of world.query(Transform, Velocity)) {
    row.components[0].x += row.components[1].x / 60;
    row.components[0].y += row.components[1].y / 60;
    row.components[0].z += row.components[1].z / 60;
  }
  samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);
const p95 = samples[Math.floor(samples.length * 0.95)] ?? Infinity;
console.info(
  JSON.stringify(
    {
      benchmark: "ecs-active-simulation",
      entityCount,
      frames,
      allocationMs,
      p95FrameMs: p95,
      budgetMs: maxP95Ms,
    },
    null,
    2,
  ),
);
if (p95 > maxP95Ms) {
  console.error(`Active simulation p95 ${p95.toFixed(2)}ms exceeded ${maxP95Ms}ms`);
  process.exitCode = 1;
}
