export const protocolVersion = 1;

export enum PacketKind {
  Hello = 1,
  Welcome = 2,
  Input = 3,
  Snapshot = 4,
  Ping = 5,
  Pong = 6,
  Error = 7,
}

export interface Packet {
  kind: PacketKind;
  sequence: number;
  tick: number;
  payload: Uint8Array;
}

const packetKinds = new Set<number>([
  PacketKind.Hello,
  PacketKind.Welcome,
  PacketKind.Input,
  PacketKind.Snapshot,
  PacketKind.Ping,
  PacketKind.Pong,
  PacketKind.Error,
]);

function assertUint32(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff)
    throw new Error(`Packet ${name} must be an unsigned 32-bit integer`);
}

export function encodePacket(packet: Packet): Uint8Array {
  if (!packetKinds.has(packet.kind)) throw new Error(`Unsupported packet kind ${packet.kind}`);
  assertUint32("sequence", packet.sequence);
  assertUint32("tick", packet.tick);
  if (!(packet.payload instanceof Uint8Array)) throw new Error("Packet payload must be Uint8Array");
  const result = new Uint8Array(14 + packet.payload.byteLength);
  const view = new DataView(result.buffer);
  view.setUint8(0, protocolVersion);
  view.setUint8(1, packet.kind);
  view.setUint32(2, packet.sequence, true);
  view.setUint32(6, packet.tick, true);
  view.setUint32(10, packet.payload.byteLength, true);
  result.set(packet.payload, 14);
  return result;
}

export function decodePacket(bytes: Uint8Array): Packet {
  if (bytes.byteLength < 14) throw new Error("Packet is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== protocolVersion) throw new Error(`Unsupported protocol version ${version}`);
  const kind = view.getUint8(1);
  if (!packetKinds.has(kind)) throw new Error(`Unsupported packet kind ${kind}`);
  const payloadLength = view.getUint32(10, true);
  if (payloadLength !== bytes.byteLength - 14) throw new Error("Packet payload length is invalid");
  return {
    kind: kind as PacketKind,
    sequence: view.getUint32(2, true),
    tick: view.getUint32(6, true),
    payload: bytes.slice(14),
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeText = (value: string): Uint8Array => encoder.encode(value);
export const decodeText = (value: Uint8Array): string => decoder.decode(value);
