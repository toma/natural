import { expect, test } from "bun:test";
import {
  decodePacket,
  defineBinarySchema,
  encodePacket,
  InterestGrid,
  PacketKind,
} from "../src/index.ts";

test("packet envelopes round-trip", () => {
  const encoded = encodePacket({
    kind: PacketKind.Input,
    sequence: 42,
    tick: 9,
    payload: new Uint8Array([1, 2]),
  });
  expect(decodePacket(encoded)).toEqual({
    kind: PacketKind.Input,
    sequence: 42,
    tick: 9,
    payload: new Uint8Array([1, 2]),
  });
});

test("binary schemas reject trailing or truncated data", () => {
  const schema = defineBinarySchema<{ x: number; jumping: boolean; name: string }>([
    { name: "x", type: "f32" },
    { name: "jumping", type: "boolean" },
    { name: "name", type: "string", maxBytes: 20 },
  ]);
  const encoded = schema.encode({ x: 1.5, jumping: true, name: "player" });
  expect(schema.decode(encoded)).toEqual({ x: 1.5, jumping: true, name: "player" });
  expect(() => schema.decode(encoded.slice(0, -1))).toThrow("truncated");
  const invalidBoolean = encoded.slice();
  invalidBoolean[4] = 2;
  expect(() => schema.decode(invalidBoolean)).toThrow("boolean");
});

test("interest grids return nearby entities only", () => {
  const grid = new InterestGrid(10);
  grid.update({ id: 1, x: 1, y: 1 });
  grid.update({ id: 2, x: 100, y: 100 });
  grid.update({ id: 1, x: 2, y: 2 });
  expect(grid.query({ x: 0, y: 0 }, 5)).toEqual([1]);
  grid.remove(1);
  expect(grid.size).toBe(1);
  expect(grid.query({ x: 0, y: 0 }, 5)).toEqual([]);
  expect(() => new InterestGrid(0)).toThrow("positive");
  expect(() => grid.update({ id: -1, x: 0, y: 0 })).toThrow("id");
  expect(() => grid.query({ x: 0, y: 0 }, -1)).toThrow("radius");
});

test("binary schemas cover numeric primitives and validate malformed values", () => {
  const schema = defineBinarySchema<Record<string, unknown>>([
    { name: "tiny", type: "u8" },
    { name: "small", type: "u16" },
    { name: "count", type: "u32" },
    { name: "signed", type: "i32" },
    { name: "single", type: "f32" },
    { name: "double", type: "f64" },
  ]);
  const value = { tiny: 1, small: 2, count: 3, signed: -4, single: 1.5, double: Math.PI };
  expect(schema.decode(schema.encode(value))).toEqual(value);
  expect(() => schema.encode({ ...value, tiny: "bad" })).toThrow("finite number");
  expect(() => schema.encode({ ...value, tiny: 256 })).toThrow("u8 range");
  expect(() => schema.encode({ ...value, small: 1.5 })).toThrow("u16 range");
  const text = defineBinarySchema<{ name: string; ready: boolean }>([
    { name: "name", type: "string", maxBytes: 4 },
    { name: "ready", type: "boolean" },
  ]);
  expect(() => text.encode({ name: "hello", ready: true })).toThrow("exceeds");
  expect(() => text.encode({ name: "ok", ready: 1 as unknown as boolean })).toThrow("boolean");
  expect(() => defineBinarySchema([{ name: "not valid", type: "u8" }])).toThrow("field name");
  expect(() => defineBinarySchema([{ name: "name", type: "string", maxBytes: 70_000 }])).toThrow(
    "maxBytes",
  );
  expect(() =>
    defineBinarySchema([
      { name: "x", type: "u8" },
      { name: "x", type: "u16" },
    ]),
  ).toThrow("Duplicate");
  expect(() => decodePacket(new Uint8Array(2))).toThrow("truncated");
  const packet = encodePacket({
    kind: PacketKind.Input,
    sequence: 1,
    tick: 1,
    payload: new Uint8Array(),
  });
  packet[0] = 99;
  expect(() => decodePacket(packet)).toThrow("Unsupported protocol");
  expect(() =>
    encodePacket({
      kind: PacketKind.Input,
      sequence: -1,
      tick: 0,
      payload: new Uint8Array(),
    }),
  ).toThrow("unsigned 32-bit");
  const unsupportedKind = encodePacket({
    kind: PacketKind.Input,
    sequence: 0,
    tick: 0,
    payload: new Uint8Array(),
  });
  unsupportedKind[1] = 255;
  expect(() => decodePacket(unsupportedKind)).toThrow("packet kind");
});
