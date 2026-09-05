export type BinaryField =
  | { name: string; type: "boolean" | "u8" | "u16" | "u32" | "i32" | "f32" | "f64" }
  | { name: string; type: "string"; maxBytes?: number };

export interface BinarySchema<T extends Record<string, unknown>> {
  readonly fields: readonly BinaryField[];
  encode(value: T): Uint8Array;
  decode(value: Uint8Array): T;
}

class Writer {
  readonly #bytes: number[] = [];
  readonly #encoder = new TextEncoder();

  number(value: number, type: Exclude<BinaryField["type"], "boolean" | "string">): void {
    const size = type === "u8" ? 1 : type === "u16" ? 2 : type === "f64" ? 8 : 4;
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    if (type === "u8") view.setUint8(0, value);
    else if (type === "u16") view.setUint16(0, value, true);
    else if (type === "u32") view.setUint32(0, value, true);
    else if (type === "i32") view.setInt32(0, value, true);
    else if (type === "f32") view.setFloat32(0, value, true);
    else view.setFloat64(0, value, true);
    this.#bytes.push(...new Uint8Array(buffer));
  }

  boolean(value: boolean): void {
    this.#bytes.push(value ? 1 : 0);
  }

  string(value: string, maxBytes = 65_535): void {
    const bytes = this.#encoder.encode(value);
    if (bytes.length > maxBytes || bytes.length > 65_535)
      throw new Error(`Encoded string exceeds ${maxBytes} bytes`);
    this.number(bytes.length, "u16");
    this.#bytes.push(...bytes);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}

class Reader {
  readonly #view: DataView;
  readonly #decoder = new TextDecoder();
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  number(type: Exclude<BinaryField["type"], "boolean" | "string">): number {
    const size = type === "u8" ? 1 : type === "u16" ? 2 : type === "f64" ? 8 : 4;
    this.#assertAvailable(size);
    let value: number;
    if (type === "u8") value = this.#view.getUint8(this.#offset);
    else if (type === "u16") value = this.#view.getUint16(this.#offset, true);
    else if (type === "u32") value = this.#view.getUint32(this.#offset, true);
    else if (type === "i32") value = this.#view.getInt32(this.#offset, true);
    else if (type === "f32") value = this.#view.getFloat32(this.#offset, true);
    else value = this.#view.getFloat64(this.#offset, true);
    this.#offset += size;
    return value;
  }

  boolean(): boolean {
    const value = this.number("u8");
    if (value !== 0 && value !== 1) throw new Error("Binary boolean must be 0 or 1");
    return value === 1;
  }

  string(maxBytes = 65_535): string {
    const length = this.number("u16");
    if (length > maxBytes) throw new Error(`Encoded string exceeds ${maxBytes} bytes`);
    this.#assertAvailable(length);
    const bytes = new Uint8Array(this.#view.buffer, this.#view.byteOffset + this.#offset, length);
    this.#offset += length;
    return this.#decoder.decode(bytes);
  }

  finish(): void {
    if (this.#offset !== this.#view.byteLength)
      throw new Error("Binary packet contains trailing data");
  }

  #assertAvailable(length: number): void {
    if (this.#offset + length > this.#view.byteLength)
      throw new Error("Binary packet is truncated");
  }
}

export function defineBinarySchema<T extends Record<string, unknown>>(
  fields: readonly BinaryField[],
): BinarySchema<T> {
  const names = new Set<string>();
  for (const field of fields) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name))
      throw new Error(`Invalid binary field name: ${field.name}`);
    if (names.has(field.name)) throw new Error(`Duplicate binary field: ${field.name}`);
    names.add(field.name);
    if (
      field.type === "string" &&
      field.maxBytes !== undefined &&
      (!Number.isSafeInteger(field.maxBytes) || field.maxBytes < 0 || field.maxBytes > 65_535)
    )
      throw new Error(`Invalid maxBytes for binary field ${field.name}`);
  }
  const frozenFields = Object.freeze(fields.map((field) => Object.freeze({ ...field })));
  return Object.freeze({
    fields: frozenFields,
    encode(value: T): Uint8Array {
      const writer = new Writer();
      for (const field of frozenFields) {
        const fieldValue = value[field.name];
        if (field.type === "boolean") {
          if (typeof fieldValue !== "boolean")
            throw new Error(`Binary field ${field.name} must be a boolean`);
          writer.boolean(fieldValue);
        } else if (field.type === "string") {
          if (typeof fieldValue !== "string")
            throw new Error(`Binary field ${field.name} must be a string`);
          writer.string(fieldValue, field.maxBytes);
        } else {
          if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
            throw new Error(`Binary field ${field.name} must be a finite number`);
          }
          const bounds =
            field.type === "u8"
              ? [0, 0xff]
              : field.type === "u16"
                ? [0, 0xffff]
                : field.type === "u32"
                  ? [0, 0xffff_ffff]
                  : field.type === "i32"
                    ? [-0x8000_0000, 0x7fff_ffff]
                    : null;
          if (
            bounds !== null &&
            (!Number.isInteger(fieldValue) || fieldValue < bounds[0]! || fieldValue > bounds[1]!)
          )
            throw new Error(`Binary field ${field.name} is outside the ${field.type} range`);
          writer.number(fieldValue, field.type);
        }
      }
      return writer.finish();
    },
    decode(bytes: Uint8Array): T {
      const reader = new Reader(bytes);
      const value: Record<string, unknown> = {};
      for (const field of frozenFields) {
        value[field.name] =
          field.type === "boolean"
            ? reader.boolean()
            : field.type === "string"
              ? reader.string(field.maxBytes)
              : reader.number(field.type);
      }
      reader.finish();
      return value as T;
    },
  });
}
