import { NetworkClient, createServer, defineBinarySchema } from "../packages/netcode/src/index.ts";

interface ClientData {
  value: number;
}
const schema = defineBinarySchema<{ value: number }>([{ name: "value", type: "u32" }]);
const clientCount = Number(process.env.NATURAL_CLIENTS ?? 256);
const server = createServer<ClientData>({
  port: 0,
  maxClients: clientCount,
  createClient: () => ({ value: 0 }),
  onInput: (session, payload) => {
    session.data.value = schema.decode(payload).value;
  },
  onTick: () => undefined,
  createSnapshot: (session) => schema.encode(session.data),
}).start();
const clients = Array.from(
  { length: clientCount },
  () =>
    new NetworkClient({
      url: `ws://127.0.0.1:${server.port}/connect`,
      reconnect: false,
      onSnapshot: () => undefined,
    }),
);
await Promise.all(clients.map((client) => client.connect()));
for (const [index, client] of clients.entries())
  client.sendInput(schema.encode({ value: index }), 0);
await Bun.sleep(2_000);
const metrics = server.metrics();
for (const client of clients) client.close();
server.stop();
console.info(
  JSON.stringify(
    { benchmark: "authoritative-network", requestedClients: clientCount, ...metrics },
    null,
    2,
  ),
);
if (metrics.p95TickMs > 33.3) process.exitCode = 1;
