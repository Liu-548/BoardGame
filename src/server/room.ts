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
// đây (không phụ thuộc state ván đấu).
//
// Việc 3.6 (core/view.ts): viewFor() lọc state riêng cho từng người xem.
//
// Việc 3.7: GameState của ván đấu lưu trong `ctx.storage` (khoá "gameState")
// — KHÔNG BAO GIỜ giữ trong field thường của class, giống lý do ở việc 3.3.
//
// Việc 3.9 (lobby): KHÔNG lưu riêng "danh sách người trong phòng" ở đâu cả —
// `ctx.getWebSockets()` + `deserializeAttachment()` của từng socket ĐANG MỞ
// đã CHÍNH LÀ danh sách người có mặt, luôn đúng, không cần đồng bộ 2 nơi.
// "start_game" giờ tự lấy danh sách này thay vì client gõ tay playerIds như
// tạm bợ ở việc 3.7. Mỗi khi có người join/rời phòng, phát lại ServerMessage
// "lobby" cho cả phòng để ai cũng thấy đúng danh sách hiện tại.

import { reduce } from "../core/reduce";
import { setupGame } from "../core/setup";
import type { Action, GameEvent, GameState } from "../core/types";
import { viewFor } from "../core/view";
import type { ClientMessage, ServerMessage } from "../protocol";

interface SocketAttachment {
  playerId: string;
  name: string;
}

const GAME_STATE_KEY = "gameState";

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

    switch (parsed.type) {
      case "join":
        await this.handleJoin(ws, parsed.playerId, parsed.name);
        return;
      case "chat":
        this.broadcastChat(ws, parsed.text, parsed.to);
        return;
      case "start_game":
        await this.handleStartGame(ws, parsed.seed);
        return;
      case "action":
        await this.handleAction(ws, parsed.action);
        return;
      default: {
        const neverMessage: never = parsed;
        throw new Error(`Chưa hỗ trợ ClientMessage: ${JSON.stringify(neverMessage)}`);
      }
    }
  }

  private async handleJoin(ws: WebSocket, playerId: string, name: string): Promise<void> {
    const attachment: SocketAttachment = { playerId, name };
    ws.serializeAttachment(attachment);

    this.broadcastLobby();

    // Vừa vào lại phòng (vd sau khi deploy lại/mất mạng) mà ván đã có sẵn ->
    // gửi ngay state hiện tại, không cần chờ có action mới mới thấy.
    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (state) {
      this.sendStateTo(ws, state, []);
    }
  }

  private async handleStartGame(ws: WebSocket, seed: number): Promise<void> {
    const existing = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (existing) {
      this.sendError(ws, "Phòng này đã có ván đang chơi, không thể bắt đầu ván mới");
      return;
    }

    const joined = this.joinedPlayers();
    const playerIds = joined.map((p) => p.id);

    let state: GameState;
    try {
      state = setupGame(playerIds, seed);
    } catch (e) {
      this.sendError(ws, e instanceof Error ? e.message : "Không tạo được ván mới");
      return;
    }

    // setupGame() tạm dùng id làm tên hiển thị — gán lại tên thật đã "join".
    for (const player of state.players) {
      const info = joined.find((p) => p.id === player.id);
      if (info) player.name = info.name;
    }

    await this.ctx.storage.put(GAME_STATE_KEY, state);
    this.broadcastState(state, []);
  }

  private async handleAction(ws: WebSocket, action: Action): Promise<void> {
    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (!state) {
      this.sendError(ws, "Ván chưa bắt đầu — gửi start_game trước");
      return;
    }

    let result: { state: GameState; events: GameEvent[] };
    try {
      result = reduce(state, action);
    } catch (e) {
      this.sendError(ws, e instanceof Error ? e.message : "Hành động không hợp lệ");
      return;
    }

    await this.ctx.storage.put(GAME_STATE_KEY, result.state);
    this.broadcastState(result.state, result.events);
  }

  // Danh sách người ĐANG kết nối và đã "join" — lấy trực tiếp từ các socket
  // đang mở (không lưu riêng ở đâu cả, xem ghi chú đầu file).
  private joinedPlayers(): { id: string; name: string }[] {
    const players: { id: string; name: string }[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.playerId) players.push({ id: attachment.playerId, name: attachment.name });
    }
    return players;
  }

  private broadcastLobby(): void {
    const message: ServerMessage = { type: "lobby", players: this.joinedPlayers() };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(payload);
    }
  }

  // Gửi viewFor() RIÊNG cho từng socket đang mở — không phải cùng 1 gói tin
  // cho tất cả (quy tắc 6: không bao giờ gửi state đầy đủ, mỗi người chỉ
  // thấy bài của chính mình).
  private broadcastState(state: GameState, events: GameEvent[]): void {
    for (const socket of this.ctx.getWebSockets()) {
      this.sendStateTo(socket, state, events);
    }
  }

  private sendStateTo(socket: WebSocket, state: GameState, events: GameEvent[]): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) return; // socket chưa "join", chưa biết gửi view của ai

    const message: ServerMessage = { type: "state", view: viewFor(state, attachment.playerId), events };
    socket.send(JSON.stringify(message));
  }

  private sendError(ws: WebSocket, message: string): void {
    const outgoing: ServerMessage = { type: "action_error", message };
    ws.send(JSON.stringify(outgoing));
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

    // Báo cho người còn lại biết phòng vừa vơi đi 1 người — loại trừ chính
    // socket đang đóng (getWebSockets() có thể vẫn còn liệt kê nó lúc này).
    const closingAttachment = ws.deserializeAttachment() as SocketAttachment | null;
    const message: ServerMessage = {
      type: "lobby",
      players: this.joinedPlayers().filter((p) => p.id !== closingAttachment?.playerId),
    };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== ws) socket.send(payload);
    }
  }
}
