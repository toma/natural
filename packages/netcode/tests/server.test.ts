import { afterEach, expect, test } from "bun:test";
import {
  NetworkClient,
  createServer,
  defineBinarySchema,
  type AuthoritativeServer,
} from "../src/index.ts";

interface ClientData {
  value: number;
}
const input = defineBinarySchema<{ value: number }>([{ name: "value", type: "u16" }]);
let server: AuthoritativeServer<ClientData> | null = null;
let client: NetworkClient | null = null;

afterEach(() => {
  client?.close();
  server?.stop();
  client = null;
  server = null;
});

test("authoritative server validates capacity and timing options", () => {
  expect(() =>
    createServer<ClientData>({
      tickRate: 0,
      createClient: () => ({ value: 0 }),
      onInput: () => undefined,
      onTick: () => undefined,
      createSnapshot: () => new Uint8Array(),
    }),
  ).toThrow("tickRate");
});

test("authoritative clients connect, send input, and receive snapshots", async () => {
  server = createServer<ClientData>({
    port: 0,
    tickRate: 60,
    snapshotRate: 60,
    authenticate: (credential) => credential === "secret",
    createClient: () => ({ value: 0 }),
    onInput: (session, payload) => {
      session.data.value = input.decode(payload).value;
    },
    onTick: () => undefined,
    createSnapshot: (session) => input.encode(session.data),
  }).start();
  let snapshot = 0;
  client = new NetworkClient({
    url: `ws://127.0.0.1:${server.port}/connect`,
    reconnect: false,
    authToken: "secret",
    onSnapshot: (payload) => {
      snapshot = input.decode(payload).value;
    },
  });
  await client.connect();
  client.sendInput(input.encode({ value: 77 }), 0);
  const timeout = Date.now() + 2_000;
  while (snapshot !== 77 && Date.now() < timeout) await Bun.sleep(10);
  expect(client.clientId).toBe(1);
  expect(snapshot).toBe(77);
  const resumeToken = client.resumeToken;
  client.close();
  const disconnectTimeout = Date.now() + 2_000;
  while (server.sessions.get(1)?.connected === true && Date.now() < disconnectTimeout)
    await Bun.sleep(10);
  client = new NetworkClient({
    url: `ws://127.0.0.1:${server.port}/connect`,
    resumeToken,
    reconnect: false,
    authToken: "secret",
    onSnapshot: (payload) => {
      snapshot = input.decode(payload).value;
    },
  });
  await client.connect();
  expect(client.clientId).toBe(1);
  expect(client.sendInput(input.encode({ value: 88 }), 0)).toBe(2);
  const resumeTimeout = Date.now() + 2_000;
  while (snapshot !== 88 && Date.now() < resumeTimeout) await Bun.sleep(10);
  expect(snapshot).toBe(88);
  const unauthorized = new NetworkClient({
    url: `ws://127.0.0.1:${server.port}/connect`,
    reconnect: false,
    authToken: "wrong",
    onSnapshot: () => undefined,
  });
  expect(unauthorized.connect()).rejects.toThrow("closed before");
  unauthorized.close();
  server.stop();
  expect(server.sessions.size).toBe(0);
});
