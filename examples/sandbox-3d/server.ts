import { createServer, defineBinarySchema, InterestGrid } from "@toma.com/natural";

interface Player {
  x: number;
  z: number;
  inputX: number;
  inputZ: number;
}
const grid = new InterestGrid(64);
const movement = defineBinarySchema<{ x: number; z: number }>([
  { name: "x", type: "f32" },
  { name: "z", type: "f32" },
]);
const state = defineBinarySchema<{ id: number; x: number; z: number; nearby: number }>([
  { name: "id", type: "u32" },
  { name: "x", type: "f32" },
  { name: "z", type: "f32" },
  { name: "nearby", type: "u16" },
]);
const server = createServer<Player>({
  port: Number(process.env.PORT ?? 4300),
  maxClients: 256,
  createClient: (id) => ({ x: id % 16, z: Math.floor(id / 16), inputX: 0, inputZ: 0 }),
  onInput: (session, payload) => {
    const value = movement.decode(payload);
    session.data.inputX = Math.max(-1, Math.min(1, value.x));
    session.data.inputZ = Math.max(-1, Math.min(1, value.z));
  },
  onTick: (delta, _tick, sessions) => {
    for (const session of sessions) {
      session.data.x += session.data.inputX * delta * 10;
      session.data.z += session.data.inputZ * delta * 10;
      grid.update({ id: session.id, x: session.data.x, y: 0, z: session.data.z });
    }
  },
  createSnapshot: (session) =>
    state.encode({
      id: session.id,
      x: session.data.x,
      z: session.data.z,
      nearby: grid.query({ x: session.data.x, y: 0, z: session.data.z }, 128).length,
    }),
}).start();
console.info(`Natural authoritative sandbox server: ws://localhost:${server.port}/connect`);
