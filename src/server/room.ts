// Việc 3.2: Durable Object đầu tiên — đếm số lần truy cập, lưu BỀN trong
// ctx.storage (không phải biến JS thường) nên không mất khi Worker khởi động
// lại hay deploy lại — storage sống độc lập với vòng đời instance class.
//
// Việc 3.3: WebSocket + Hibernation API. BẮT BUỘC dùng `ctx.acceptWebSocket(ws)`
// — KHÔNG BAO GIỜ dùng `ws.accept()` (quy tắc 7 CLAUDE.md): `ws.accept()` giữ
// Durable Object "thức" suốt thời gian kết nối còn mở, bị tính duration liên
// tục (1 phòng mở 24h ≈ 10.800 GB-s/ngày, vượt xa hạn mức miễn phí 13.000
// GB-s/ngày). `ctx.acceptWebSocket(ws)` cho phép Durable Object "ngủ" (hibernate)
// giữa các tin nhắn — chỉ tính duration lúc thực sự xử lý, không tính lúc rảnh
// chờ tin nhắn. Đổi lại, không được giữ state ngoài `ctx.storage`/tham số của
// các handler bên dưới — code có thể chạy lại từ đầu (constructor mới) sau khi
// thức dậy, biến JS thường (kể cả field của class) sẽ mất.
//
// Dùng chung tên "Room" cho lớp Durable Object luật chơi thật sau này (từ
// việc 3.4 trở đi mới có mã phòng riêng, 1 phòng = 1 instance) — hiện tại
// index.ts tạm cho MỌI request dùng chung đúng 1 instance để demo.

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

  // Việc 3.3 chỉ cần demo "chat" tối giản: tin nhắn ai gửi lên thì phát lại
  // cho TẤT CẢ kết nối đang mở (kể cả người gửi) — đủ để 2 tab thấy nhau.
  // Giao thức tin nhắn thật cho ván bài (JSON có type...) để dành việc 3.5.
  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(message);
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
