// Việc 3.8: WebSocket + tự động kết nối lại (reconnect). Nếu mất mạng, server
// deploy lại, hay Durable Object bị "đuổi" (evict) tạm thời, kết nối sẽ đóng
// (sự kiện "close") — RoomConnection tự thử kết nối lại sau một khoảng chờ cố
// định, KHÔNG cần người chơi tự bấm gì. Kết nối lại xong tự gửi "join" ngay,
// và vì server đã lưu state vào ctx.storage (việc 3.7), người chơi nhận được
// đúng ván đang chơi dở, không mất gì.
//
// Đơn giản trước, tối ưu sau: chờ CỐ ĐỊNH giữa các lần thử lại (không có
// backoff tăng dần) — đủ dùng cho vài người bạn chơi chung, không cần phức
// tạp hơn cho tới khi thật sự cần.

import type { ClientMessage, ServerMessage } from "../protocol";

export interface NetHandlers {
  onMessage(message: ServerMessage): void;
  onConnected?(): void;
  onDisconnected?(): void;
}

const RECONNECT_DELAY_MS = 1000;

export class RoomConnection {
  private ws: WebSocket | null = null;
  private closedByUser = false;

  constructor(
    private readonly url: string,
    private readonly playerId: string,
    private readonly name: string,
    private readonly handlers: NetHandlers
  ) {
    this.connect();
  }

  private connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.send({ type: "join", playerId: this.playerId, name: this.name });
      this.handlers.onConnected?.();
    });

    ws.addEventListener("message", (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      this.handlers.onMessage(message);
    });

    // "close" xảy ra cả khi mất mạng LẪN khi server chủ động đóng — trong cả
    // 2 trường hợp đều tự thử lại, trừ khi chính người dùng gọi close() (vd
    // rời phòng chủ động).
    ws.addEventListener("close", () => {
      this.handlers.onDisconnected?.();
      if (!this.closedByUser) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    });
  }

  send(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }
}
