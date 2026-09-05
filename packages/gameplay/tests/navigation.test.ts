import { expect, test } from "bun:test";
import { NavigationGrid } from "../src/navigation.ts";

test("navigation routes around blocked cells", () => {
  const grid = new NavigationGrid({ width: 4, height: 3 });
  grid.setBlocked({ x: 1, y: 0 });
  const path = grid.findPath({ x: 0, y: 0 }, { x: 3, y: 0 });
  expect(path.at(0)).toEqual({ x: 0, y: 0 });
  expect(path.at(-1)).toEqual({ x: 3, y: 0 });
  expect(path).not.toContainEqual({ x: 1, y: 0 });
});

test("navigation validates grid configuration and endpoints", () => {
  expect(() => new NavigationGrid({ width: 1.5, height: 3 })).toThrow("positive integers");
  expect(() => new NavigationGrid({ width: 4, height: 3, cellSize: Number.NaN })).toThrow(
    "cellSize",
  );
  expect(() => new NavigationGrid({ width: 4, height: 3, blocked: new Set([12]) })).toThrow(
    "out of bounds",
  );
  const grid = new NavigationGrid({ width: 2, height: 2 });
  expect(() => grid.findPath({ x: -1, y: 0 }, { x: 1, y: 1 })).toThrow("out of bounds");
});
