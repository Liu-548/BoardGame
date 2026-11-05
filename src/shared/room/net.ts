// Client WebSocket cho khung phòng chung: tự nối lại + gửi lại `join` + nhịp tim (D-67, D-44).
import type { ClientMessage, ServerMessage } from "./protocol";

export interface RoomClientHandlers {
  onMessage(message: ServerMessage): void;
  onOpen?(): void;
  onClose?(): void;
}

const RECONNECT_DELAY_MS = 1000;
const PING_INTERVAL_MS = 20_000;

export class RoomClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // D-23: độ lệch đồng hồ = serverNow - Date.now() lúc nhận message.
  private offset = 0;

  constructor(
    private readonly url: string,
    private readonly name: string,
    private readonly token: string,
    private readonly handlers: RoomClientHandlers,
  ) {
    this.connect();
  }

  // Giờ server ước tính ở máy này.
  serverTime(): number {
    return Date.now() + this.offset;
  }

  private connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.send({ type: "join", name: this.name, token: this.token });
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_INTERVAL_MS);
      this.handlers.onOpen?.();
    });
    ws.addEventListener("message", (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      if (message.type === "state") this.offset = message.serverNow - Date.now();
      this.handlers.onMessage(message);
    });
    ws.addEventListener("close", () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.handlers.onClose?.();
      if (!this.closedByUser) this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    });
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
