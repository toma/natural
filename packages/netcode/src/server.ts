import { decodePacket, decodeText, encodePacket, encodeText, PacketKind } from "./protocol.ts";

export interface ClientSession<TClient> {
  id: number;
  resumeToken: string;
  data: TClient;
  connectedAt: number;
  lastSequence: number;
  messagesThisSecond: number;
  connected: boolean;
  disconnectedAt?: number;
}

interface SocketData<TClient> {
  session: ClientSession<TClient> | null;
  windowStartedAt: number;
  messagesThisSecond: number;
}

export interface AuthoritativeServerOptions<TClient> {
  port?: number;
  hostname?: string;
  tickRate?: number;
  snapshotRate?: number;
  maxClients?: number;
  maxMessagesPerSecond?: number;
  maxPacketBytes?: number;
  resumeGraceMs?: number;
  authenticate?: (credential: string) => boolean;
  createClient: (id: number) => TClient;
  onInput: (session: ClientSession<TClient>, payload: Uint8Array, sequence: number) => void;
  onTick: (
    delta: number,
    tick: number,
    sessions: ReadonlyArray<ClientSession<TClient>>,
  ) => void | Promise<void>;
  createSnapshot: (session: ClientSession<TClient>, tick: number) => Uint8Array;
  onConnect?: (session: ClientSession<TClient>) => void;
  onDisconnect?: (session: ClientSession<TClient>) => void;
}

export interface ServerMetrics {
  tick: number;
  clients: number;
  p95TickMs: number;
  maxTickMs: number;
}

export class AuthoritativeServer<TClient> {
  readonly sessions = new Map<number, ClientSession<TClient>>();
  readonly #byResumeToken = new Map<string, ClientSession<TClient>>();
  readonly #options: Required<
    Pick<
      AuthoritativeServerOptions<TClient>,
      | "tickRate"
      | "snapshotRate"
      | "maxClients"
      | "maxMessagesPerSecond"
      | "maxPacketBytes"
      | "resumeGraceMs"
    >
  > &
    AuthoritativeServerOptions<TClient>;
  #server: Bun.Server<SocketData<TClient>> | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #tick = 0;
  #nextClientId = 1;
  #tickInFlight = false;
  #stopping = false;
  readonly #tickDurations: number[] = [];
  readonly #sessionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(options: AuthoritativeServerOptions<TClient>) {
    this.#options = {
      tickRate: 30,
      snapshotRate: 20,
      maxClients: 256,
      maxMessagesPerSecond: 120,
      maxPacketBytes: 64 * 1024,
      resumeGraceMs: 30_000,
      ...options,
    };
    if (!Number.isFinite(this.#options.tickRate) || this.#options.tickRate <= 0)
      throw new Error("Server tickRate must be finite and positive");
    if (!Number.isFinite(this.#options.snapshotRate) || this.#options.snapshotRate <= 0)
      throw new Error("Server snapshotRate must be finite and positive");
    for (const [name, value] of [
      ["maxClients", this.#options.maxClients],
      ["maxMessagesPerSecond", this.#options.maxMessagesPerSecond],
      ["maxPacketBytes", this.#options.maxPacketBytes],
    ] as const) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`Server ${name} must be a positive integer`);
    }
    if (this.#options.maxPacketBytes < 14)
      throw new Error("Server maxPacketBytes must fit the packet header");
    if (!Number.isFinite(this.#options.resumeGraceMs) || this.#options.resumeGraceMs < 0)
      throw new Error("Server resumeGraceMs must be finite and non-negative");
  }

  start(): this {
    if (this.#server !== null) return this;
    this.#stopping = false;
    this.#server = Bun.serve<SocketData<TClient>>({
      port: this.#options.port ?? 0,
      hostname: this.#options.hostname ?? "0.0.0.0",
      fetch: (request, server) => {
        const url = new URL(request.url);
        if (url.pathname === "/health") {
          return Response.json({ ok: true, ...this.metrics() });
        }
        if (
          url.pathname === "/connect" &&
          server.upgrade(request, {
            data: { session: null, windowStartedAt: Date.now(), messagesThisSecond: 0 },
          })
        ) {
          return undefined;
        }
        return new Response("Not found", { status: 404 });
      },
      websocket: {
        message: (socket, message) => {
          try {
            const bytes =
              typeof message === "string" ? encodeText(message) : new Uint8Array(message);
            if (bytes.byteLength > this.#options.maxPacketBytes) {
              socket.close(1009, "Packet is too large");
              return;
            }
            const packet = decodePacket(bytes);
            const now = Date.now();
            if (now - socket.data.windowStartedAt >= 1_000) {
              socket.data.windowStartedAt = now;
              socket.data.messagesThisSecond = 0;
              if (socket.data.session !== null) socket.data.session.messagesThisSecond = 0;
            }
            socket.data.messagesThisSecond += 1;
            if (socket.data.messagesThisSecond > this.#options.maxMessagesPerSecond) {
              socket.close(1008, "Rate limit exceeded");
              return;
            }
            if (socket.data.session !== null) socket.data.session.messagesThisSecond += 1;
            if (packet.kind === PacketKind.Hello) {
              if (socket.data.session !== null) {
                socket.close(1008, "Session is already established");
                return;
              }
              const helloText = decodeText(packet.payload);
              let requestedToken = helloText;
              let credential = "";
              try {
                const hello = JSON.parse(helloText) as {
                  resumeToken?: unknown;
                  authToken?: unknown;
                };
                requestedToken = typeof hello.resumeToken === "string" ? hello.resumeToken : "";
                credential = typeof hello.authToken === "string" ? hello.authToken : "";
              } catch {
                // Protocol v1 accepted a raw resume token; preserve compatibility for open servers.
              }
              if (requestedToken.length > 256 || credential.length > 4_096) {
                socket.close(1008, "Handshake credentials are too large");
                return;
              }
              if (this.#options.authenticate?.(credential) === false) {
                socket.close(1008, "Authentication failed");
                return;
              }
              let session =
                requestedToken === "" ? undefined : this.#byResumeToken.get(requestedToken);
              if (session === undefined) {
                if (this.sessions.size >= this.#options.maxClients) {
                  socket.close(1013, "Server full");
                  return;
                }
                const id = this.#nextClientId++;
                session = {
                  id,
                  resumeToken: crypto.randomUUID(),
                  data: this.#options.createClient(id),
                  connectedAt: now,
                  lastSequence: 0,
                  messagesThisSecond: 0,
                  connected: true,
                };
                this.sessions.set(id, session);
                this.#byResumeToken.set(session.resumeToken, session);
              } else if (session.connected) {
                socket.close(1008, "Resume token is already connected");
                return;
              }
              const expiry = this.#sessionTimers.get(session.id);
              if (expiry !== undefined) clearTimeout(expiry);
              this.#sessionTimers.delete(session.id);
              session.connected = true;
              delete session.disconnectedAt;
              socket.data.session = session;
              socket.subscribe(`natural.session.${session.id}`);
              socket.send(
                encodePacket({
                  kind: PacketKind.Welcome,
                  sequence: 0,
                  tick: this.#tick,
                  payload: encodeText(
                    `${session.id}:${session.resumeToken}:${session.lastSequence}`,
                  ),
                }),
              );
              this.#options.onConnect?.(session);
              return;
            }
            const session = socket.data.session;
            if (session === null) throw new Error("Client must send hello before other packets");
            if (packet.sequence <= session.lastSequence) return;
            session.lastSequence = packet.sequence;
            if (packet.kind === PacketKind.Input)
              this.#options.onInput(session, packet.payload, packet.sequence);
            else if (packet.kind === PacketKind.Ping) {
              socket.send(encodePacket({ ...packet, kind: PacketKind.Pong, tick: this.#tick }));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid packet";
            socket.send(
              encodePacket({
                kind: PacketKind.Error,
                sequence: 0,
                tick: this.#tick,
                payload: encodeText(message),
              }),
            );
          }
        },
        close: (socket) => {
          const session = socket.data.session;
          if (session !== null) {
            session.connected = false;
            session.disconnectedAt = Date.now();
            this.#options.onDisconnect?.(session);
            if (this.#stopping) return;
            const timer = setTimeout(() => {
              if (session.connected) return;
              this.sessions.delete(session.id);
              this.#byResumeToken.delete(session.resumeToken);
              this.#sessionTimers.delete(session.id);
            }, this.#options.resumeGraceMs);
            this.#sessionTimers.set(session.id, timer);
          }
        },
      },
    });
    const fixedDelta = 1 / this.#options.tickRate;
    const snapshotEvery = Math.max(
      1,
      Math.round(this.#options.tickRate / this.#options.snapshotRate),
    );
    this.#timer = setInterval(() => {
      if (this.#tickInFlight) return;
      this.#tickInFlight = true;
      const tickStarted = performance.now();
      this.#tick += 1;
      const currentTick = this.#tick;
      void Promise.resolve(
        this.#options.onTick(fixedDelta, currentTick, [...this.sessions.values()]),
      )
        .then(() => {
          if (currentTick % snapshotEvery === 0) this.#broadcastSnapshots();
        })
        .catch((error: unknown) => console.error("Natural server tick failed", error))
        .finally(() => {
          this.#tickDurations.push(performance.now() - tickStarted);
          if (this.#tickDurations.length > 600) this.#tickDurations.shift();
          this.#tickInFlight = false;
        });
    }, 1_000 / this.#options.tickRate);
    return this;
  }

  stop(): void {
    this.#stopping = true;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    for (const timer of this.#sessionTimers.values()) clearTimeout(timer);
    this.#sessionTimers.clear();
    void this.#server?.stop(true);
    this.#server = null;
    this.sessions.clear();
    this.#byResumeToken.clear();
  }

  get port(): number | null {
    return this.#server?.port ?? null;
  }

  get tick(): number {
    return this.#tick;
  }

  metrics(): ServerMetrics {
    const sorted = [...this.#tickDurations].sort((left, right) => left - right);
    return {
      tick: this.#tick,
      clients: [...this.sessions.values()].filter((session) => session.connected).length,
      p95TickMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      maxTickMs: sorted.at(-1) ?? 0,
    };
  }

  #broadcastSnapshots(): void {
    // Bun topics keep one binary allocation per session while allowing resumed sessions to retain state.
    // Socket-specific relevance payloads are sent by walking active sockets through a private registry.
    const server = this.#server;
    if (server === null) return;
    for (const session of this.sessions.values()) {
      if (!session.connected) continue;
      const payload = this.#options.createSnapshot(session, this.#tick);
      server.publish(
        `natural.session.${session.id}`,
        encodePacket({ kind: PacketKind.Snapshot, sequence: 0, tick: this.#tick, payload }),
      );
    }
  }
}

export function createServer<TClient>(
  options: AuthoritativeServerOptions<TClient>,
): AuthoritativeServer<TClient> {
  return new AuthoritativeServer(options);
}
