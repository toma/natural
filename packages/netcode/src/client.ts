import {
  decodePacket,
  decodeText,
  encodePacket,
  encodeText,
  PacketKind,
  type Packet,
} from "./protocol.ts";

export interface NetworkClientOptions {
  url: string;
  resumeToken?: string;
  authToken?: string;
  reconnect?: boolean;
  onSnapshot: (payload: Uint8Array, tick: number) => void;
  onError?: (error: Error) => void;
}

export class NetworkClient {
  readonly #options: NetworkClientOptions;
  #socket: WebSocket | null = null;
  #sequence = 0;
  #resumeToken = "";
  #clientId: number | null = null;
  #closed = false;
  #connecting: Promise<void> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: NetworkClientOptions) {
    this.#options = options;
    this.#resumeToken = options.resumeToken ?? "";
  }

  connect(): Promise<void> {
    if (this.#socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.#connecting !== null) return this.#connecting;
    this.#closed = false;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    const connecting = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.#options.url);
      let welcomed = false;
      socket.binaryType = "arraybuffer";
      this.#socket = socket;
      socket.addEventListener("open", () => {
        socket.send(
          encodePacket({
            kind: PacketKind.Hello,
            sequence: 0,
            tick: 0,
            payload: encodeText(
              JSON.stringify({
                resumeToken: this.#resumeToken,
                authToken: this.#options.authToken ?? "",
              }),
            ),
          }),
        );
      });
      socket.addEventListener("message", (event) => {
        try {
          const bytes =
            typeof event.data === "string"
              ? encodeText(event.data)
              : new Uint8Array(event.data as ArrayBuffer);
          const packet = decodePacket(bytes);
          if (packet.kind === PacketKind.Welcome) {
            const [id, token, sequence] = decodeText(packet.payload).split(":");
            this.#clientId = Number(id);
            this.#resumeToken = token ?? "";
            this.#sequence = Math.max(this.#sequence, Number(sequence ?? 0));
            welcomed = true;
            this.#connecting = null;
            resolve();
          } else this.#handle(packet);
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          this.#options.onError?.(normalized);
          reject(normalized);
        }
      });
      socket.addEventListener(
        "error",
        () => {
          if (!welcomed) {
            this.#connecting = null;
            reject(new Error("WebSocket connection failed"));
          }
        },
        { once: true },
      );
      socket.addEventListener("close", () => {
        if (this.#socket === socket) this.#socket = null;
        if (!welcomed) {
          this.#connecting = null;
          reject(new Error("WebSocket closed before the session was established"));
        }
        if (!this.#closed && (this.#options.reconnect ?? true)) {
          this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = null;
            if (this.#closed) return;
            void this.connect().catch((error: unknown) => {
              this.#options.onError?.(
                error instanceof Error ? error : new Error("WebSocket reconnection failed"),
              );
            });
          }, 500);
        }
      });
    });
    this.#connecting = connecting;
    return connecting;
  }

  sendInput(payload: Uint8Array, tick: number): number {
    if (this.#socket?.readyState !== WebSocket.OPEN)
      throw new Error("Network client is not connected");
    const sequence = ++this.#sequence;
    this.#socket.send(encodePacket({ kind: PacketKind.Input, sequence, tick, payload }));
    return sequence;
  }

  close(): void {
    this.#closed = true;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#socket?.close(1000, "Client closed");
    this.#socket = null;
    this.#connecting = null;
  }

  get clientId(): number | null {
    return this.#clientId;
  }

  get resumeToken(): string {
    return this.#resumeToken;
  }

  #handle(packet: Packet): void {
    if (packet.kind === PacketKind.Snapshot) this.#options.onSnapshot(packet.payload, packet.tick);
    else if (packet.kind === PacketKind.Error)
      this.#options.onError?.(new Error(decodeText(packet.payload)));
  }
}
