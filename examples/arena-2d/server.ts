import { createServer, defineBinarySchema } from "@natural-engine/natural";

interface Player {
  x: number;
  y: number;
  inputX: number;
  inputY: number;
}
const input = defineBinarySchema<{ x: number; y: number }>([
  { name: "x", type: "f32" },
  { name: "y", type: "f32" },
]);
const snapshot = defineBinarySchema<{ id: number; x: number; y: number }>([
  { name: "id", type: "u32" },
  { name: "x", type: "f32" },
  { name: "y", type: "f32" },
]);
const server = createServer<Player>({
  port: Number(process.env.PORT ?? 4200),
  createClient: () => ({ x: 0, y: 0, inputX: 0, inputY: 0 }),
  onInput: (session, payload) =>
    Object.assign(session.data, {
      inputX: input.decode(payload).x,
      inputY: input.decode(payload).y,
    }),
  onTick: (delta, _tick, sessions) => {
    for (const session of sessions) {
      session.data.x += session.data.inputX * delta * 8;
      session.data.y += session.data.inputY * delta * 8;
    }
  },
  createSnapshot: (session) =>
    snapshot.encode({ id: session.id, x: session.data.x, y: session.data.y }),
}).start();
console.info(`Natural authoritative arena server: ws://localhost:${server.port}/connect`);
