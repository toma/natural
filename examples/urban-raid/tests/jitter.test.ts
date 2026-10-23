import { expect, test } from "bun:test";
import { createJitterSequence, haltonPoint, radicalInverse } from "../src/render/jitter.ts";

test("radical inverse matches the van der Corput sequence", () => {
  expect(radicalInverse(1, 2)).toBeCloseTo(0.5, 12);
  expect(radicalInverse(2, 2)).toBeCloseTo(0.25, 12);
  expect(radicalInverse(3, 2)).toBeCloseTo(0.75, 12);
  expect(radicalInverse(1, 3)).toBeCloseTo(1 / 3, 12);
  expect(radicalInverse(0, 2)).toBe(0);
});

test("halton points stay inside the unit square", () => {
  for (let i = 1; i <= 64; i += 1) {
    const [x, y] = haltonPoint(i);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(1);
  }
});

test("the jitter sequence is pixel-centred, zero-mean, and deterministic", () => {
  const seq = createJitterSequence(16);
  expect(seq.length).toBe(16);
  let sx = 0;
  let sy = 0;
  for (const [x, y] of seq) {
    expect(x).toBeGreaterThanOrEqual(-0.5);
    expect(x).toBeLessThanOrEqual(0.5);
    expect(y).toBeGreaterThanOrEqual(-0.5);
    expect(y).toBeLessThanOrEqual(0.5);
    sx += x;
    sy += y;
  }
  // The whole point of the correction: the net offset is zero, so the converged
  // image is not shifted off centre.
  expect(sx / 16).toBeCloseTo(0, 12);
  expect(sy / 16).toBeCloseTo(0, 12);

  const again = createJitterSequence(16);
  expect(again).toEqual(seq);
});

test("sequence length is configurable", () => {
  expect(createJitterSequence(8).length).toBe(8);
  expect(createJitterSequence(32).length).toBe(32);
});
