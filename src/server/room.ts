// Việc 3.2: Durable Object đầu tiên — đếm số lần truy cập, lưu BỀN trong
// ctx.storage (không phải biến JS thường) nên không mất khi Worker khởi động
// lại hay deploy lại — storage sống độc lập với vòng đời instance class.
//
// Việc 3.3: WebSocket + Hibernation API. BẮT BUỘC dùng `ctx.acceptWebSocket(ws)`
// — KHÔNG BAO GIỜ dùng `ws.accept()` (quy tắc 7 CLAUDE.md): `ws.accept()` giữ
// Durable Object "thức" suốt thời gian kết nối còn mở, bị tính duration liên
// tục (1 phòng mở 24h ≈ 10.800 GB-s/ngày, vượt xa hạn mức miễn phí 13.000
// GB-s/ngày). `ctx.acceptWebSocket(ws)` cho phép Durable Object "ngủ" (hibernate)
// giữa các tin nhắn. Đổi lại, không được giữ state ngoài `ctx.storage` HAY
// `ws.serializeAttachment(...)` (đính kèm nhỏ vào chính socket, đọc lại bằng
// `ws.deserializeAttachment()`, sống sót qua hibernate) — field thường của
// class sẽ mất vì code có thể chạy lại từ constructor mới sau khi thức dậy.
//
// Việc 3.5 (giao thức tin nhắn — xem src/protocol.ts): phần CHAT nối thật vào
// đây luôn (không phụ thuộc state ván đấu nên không cần chờ view.ts). Mỗi
// socket tự giới thiệu bằng ClientMessage "join", server nhớ playerId của
// socket đó bằng serializeAttachment.
//
// Việc 3.6 (core/view.ts): viewFor() đã có, nhưng phần "action" (đánh bài
// thật) CHƯA xử lý ở đây — Room còn chưa có chỗ LƯU state ván đấu (việc 3.7:
// lưu vào ctx.storage), nên chưa có gì để gọi reduce()/viewFor() lên.
//
// Dùng chung tên "Room" cho lớp Durable Object luật chơi thật sau này (từ
// việc 3.4 đã có mã phòng riêng, 1 phòng = 1 instance).

import type { ClientMessage, ServerMessage } from "../protocol";

interface SocketAttachment {
  playerId: string;
}

export class Room {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // ctx.acceptWebSocket(), KHÔNG server.accept() — xem ghi chú đầu file.
      this.ctx.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    const count = (await this.ctx.storage.get<number>("visitCount")) ?? 0;
    const nextCount = count + 1;
    await this.ctx.storage.put("visitCount", nextCount);

    return new Response(`Số lần truy cập: ${nextCount}`);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return; // chỉ hỗ trợ JSON dạng chữ, bỏ qua nhị phân

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      return; // không phải JSON hợp lệ — bỏ qua, chưa cần báo lỗi ở việc này
    }

    if (parsed.type === "join") {
      const attachment: SocketAttachment = { playerId: parsed.playerId };
      ws.serializeAttachment(attachment);
      return;
    }

    if (parsed.type === "chat") {
      this.broadcastChat(ws, parsed.text, parsed.to);
      return;
    }

    // parsed.type === "action": để dành việc 3.7 trở đi (Room chưa có chỗ lưu state ván đấu).
  }

  // Không có `to` -> gửi cho CẢ PHÒNG. Có `to` -> CHỈ gửi cho đúng người gửi
  // và đúng người nhận (playerId khớp) — người khác trong phòng không nhận
  // được gói tin này, không phải kiểu "gửi hết rồi ẩn ở giao diện".
  private broadcastChat(sender: WebSocket, text: string, to: string | undefined): void {
    const attachment = sender.deserializeAttachment() as SocketAttachment | null;
    const fromId = attachment?.playerId ?? "?";

    const outgoing: ServerMessage = {
      type: "chat",
      from: fromId,
      text,
      scope: to ? "private" : "room",
      to,
    };
    const payload = JSON.stringify(outgoing);

    for (const socket of this.ctx.getWebSockets()) {
      if (!to) {
        socket.send(payload);
        continue;
      }
      if (socket === sender) {
        socket.send(payload); // người gửi cũng thấy lại tin riêng của chính mình
        continue;
      }
      const socketAttachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (socketAttachment?.playerId === to) {
        socket.send(payload);
      }
    }
  }

  // Boilerplate theo tài liệu Cloudflare cho Hibernatable WebSockets: xác nhận
  // đóng lại từ phía Durable Object khi client đóng kết nối. `code` đôi khi là
  // mã "dự phòng" (1005 "No Status Rcvd", 1006 "Abnormal Closure"...) mà chính
  // WebSocket API cấm tự gửi lại (ném lỗi nếu gọi close() với mã đó) — bắt lỗi
  // cho an toàn, kết nối coi như đã đóng dù close() có thành công hay không.
  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Mã đóng không hợp lệ để gửi lại — bỏ qua, không ảnh hưởng gì thêm.
    }
  }
}
