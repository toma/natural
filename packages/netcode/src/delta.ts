export function encodeDelta(previous: Uint8Array, current: Uint8Array): Uint8Array {
  const changes: number[] = [];
  const length = current.length;
  for (let index = 0; index < length; index += 1) {
    const value = current[index] ?? 0;
    if ((previous[index] ?? 0) !== value) changes.push(index, value);
  }
  if (length > 0xffff || changes.length / 2 > 0xffff)
    throw new Error("Delta payload exceeds 65535 bytes or changes");
  const result = new Uint8Array(4 + (changes.length / 2) * 3);
  const view = new DataView(result.buffer);
  view.setUint16(0, current.length, true);
  view.setUint16(2, changes.length / 2, true);
  for (let index = 0; index < changes.length; index += 2) {
    const offset = 4 + (index / 2) * 3;
    view.setUint16(offset, changes[index] ?? 0, true);
    view.setUint8(offset + 2, changes[index + 1] ?? 0);
  }
  return result;
}

export function applyDelta(previous: Uint8Array, delta: Uint8Array): Uint8Array {
  if (delta.length < 4) throw new Error("Delta is truncated");
  const view = new DataView(delta.buffer, delta.byteOffset, delta.byteLength);
  const length = view.getUint16(0, true);
  const changeCount = view.getUint16(2, true);
  if (delta.length !== 4 + changeCount * 3) throw new Error("Delta length is invalid");
  const result = new Uint8Array(length);
  result.set(previous.subarray(0, length));
  for (let change = 0; change < changeCount; change += 1) {
    const offset = 4 + change * 3;
    const index = view.getUint16(offset, true);
    if (index >= length) throw new Error("Delta change is out of range");
    result[index] = view.getUint8(offset + 2);
  }
  return result;
}
