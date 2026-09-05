import { expect, test } from "bun:test";
import { applyDelta, encodeDelta, Reconciler, ReplayRecorder, TickHistory } from "../src/index.ts";

test("snapshot deltas reconstruct changed and resized payloads", () => {
  const previous = new Uint8Array([1, 2, 3, 4]);
  const current = new Uint8Array([1, 9, 3, 4, 5]);
  expect(applyDelta(previous, encodeDelta(previous, current))).toEqual(current);
  expect(applyDelta(current, encodeDelta(current, new Uint8Array([1, 9])))).toEqual(
    new Uint8Array([1, 9]),
  );
  expect(() => applyDelta(previous, new Uint8Array())).toThrow("truncated");
});

test("prediction reapplies unacknowledged inputs after reconciliation", () => {
  const reconciler = new Reconciler<{ x: number }, number>((state, input) => ({
    x: state.x + input,
  }));
  let state = reconciler.predict({ x: 0 }, 2, 1);
  state = reconciler.predict(state, 3, 2);
  expect(state).toEqual({ x: 5 });
  expect(reconciler.reconcile({ x: 1 }, 1)).toEqual({ x: 4 });
  expect(reconciler.pendingCount).toBe(1);
  reconciler.clear();
  expect(reconciler.pendingCount).toBe(0);
  expect(() => reconciler.predict(state, 1, -1)).toThrow("sequence");
});

test("tick history supports bounded lag compensation", () => {
  const history = new TickHistory<{ x: number }>(2);
  history.set(1, { x: 1 });
  history.set(2, { x: 2 });
  history.set(3, { x: 3 });
  expect(history.get(1)).toBeUndefined();
  expect(history.nearest(4)).toEqual({ tick: 3, value: { x: 3 } });
  expect(history.nearest(0)).toBeNull();
  expect(() => new TickHistory(0)).toThrow("capacity");
  expect(() => history.set(-1, { x: 0 })).toThrow("tick");
});

test("replays validate and retain ordered, isolated frame data", () => {
  const recorder = new ReplayRecorder(30, 42);
  recorder.record({ tick: 1, inputs: { one: "left" } });
  const replay = recorder.export();
  (replay.frames[0]!.inputs as Record<string, string>).one = "mutated";
  expect(recorder.export().frames[0]?.inputs.one).toBe("left");
  expect(ReplayRecorder.parse(recorder.export()).seed).toBe(42);
  expect(() => recorder.record({ tick: 1, inputs: {} })).toThrow("strictly increasing");
  expect(() => ReplayRecorder.parse({})).toThrow("Invalid Natural replay");
  expect(() => new ReplayRecorder(0, 42)).toThrow("tickRate");
  expect(() =>
    ReplayRecorder.parse({
      version: 1,
      tickRate: 30,
      seed: 42,
      frames: [{ tick: 1, inputs: { player: 1 } }],
    }),
  ).toThrow("inputs");
});
