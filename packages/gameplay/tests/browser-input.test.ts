import { expect, test } from "bun:test";
import { BrowserPointerState } from "../src/browser-input.ts";

test("browser pointer snapshots accumulated movement once per frame", () => {
  const pointer = new BrowserPointerState(0.5);
  pointer.setLocked(true);
  pointer.recordMovement(10, -4);
  pointer.recordMovement(2, 2);
  pointer.beginFrame();
  expect(pointer.delta).toEqual({ x: 6, y: -1 });
  pointer.beginFrame();
  expect(pointer.delta).toEqual({ x: 0, y: 0 });
});

test("browser pointer validates sensitivity and clears when unlocked", () => {
  expect(() => new BrowserPointerState(0)).toThrow("finite and positive");
  const pointer = new BrowserPointerState();
  pointer.setLocked(true);
  pointer.recordMovement(4, 8);
  pointer.setLocked(false);
  pointer.beginFrame();
  expect(pointer.locked).toBe(false);
  expect(pointer.delta).toEqual({ x: 0, y: 0 });
});
