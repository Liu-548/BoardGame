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

import { cardNameFromId } from "../core/cards";
import { reduce } from "../core/reduce";
import { setupGame } from "../core/setup";
import type { Action, GameEvent, GameState, PendingAction } from "../core/types";
import { viewFor } from "../core/view";
import type { ClientMessage, DeadlineInfo, ServerMessage } from "../protocol";

interface SocketAttachment {
  playerId: string;
  name: string;
}

const GAME_STATE_KEY = "gameState";
// Chủ phòng — người ĐẦU TIÊN join vào phòng trống, CHỈ họ được gửi
// "start_game" (yêu cầu thêm sau việc 3.10). Ghi theo playerId (không phải
// socket) trong ctx.storage, giống lý do state ván đấu không nằm ở field
// thường của class (xem ghi chú đầu file) — sống sót qua hibernate/reconnect.
const OWNER_KEY = "ownerId";

// ----- Việc 4.1: đồng hồ đếm ngược lượt (chỉ chơi qua mạng) -----
// Đồng hồ hiện tại (DeadlineInfo | null), lưu bền để: (1) người vừa
// reconnect thấy đúng thời gian còn lại ngay, không phải chờ có action mới;
// (2) alarm() thức dậy sau hibernate vẫn đọc lại được đang tính giờ ai/việc gì.
const DEADLINE_KEY = "deadline";
// Khi lượt ĐÁNH BÀI (kind "play") của người đang tới lượt bị NGẮT NGANG vì có
// người khác phải phản hồi (vd đánh Bang! -> đối phương cần đỡ Missed!), số
// giây CÒN LẠI của lượt đánh được "tạm giữ" ở đây — resumeDeadline() sẽ dùng
// lại đúng số giây này khi quay về đúng người đó, đúng pha "play", thay vì
// cấp lại nguyên 60 giây mới (xem quyết định thiết kế: lượt đánh PAUSE chứ
// không mất hẳn thời gian khi phải chờ người khác).
const PAUSED_PLAY_KEY = "pausedPlay";

interface PausedPlay {
  playerId: string;
  remainingMs: number;
}

const PLAY_PHASE_MS = 60_000; // lượt đánh bài (turnPhase "play") của người đang tới lượt
const REACTIVE_MS = 10_000; // người khác phải phản hồi (đỡ Missed!/Đấu tay đôi/Người da đỏ/Cat Balou/Cửa hàng tổng hợp...)
const DISCARD_PHASE_MS = 15_000; // bỏ bài thừa cuối lượt (chỉ khi hand > hp)

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

    // Chưa có chủ phòng (phòng mới toanh, hoặc vừa trống hẳn rồi có người
    // join lại — xem webSocketClose) -> người ĐẦU TIÊN join lúc này tự thành
    // chủ phòng mới.
    const ownerId = await this.getOwnerId();
    if (!ownerId) {
      await this.ctx.storage.put(OWNER_KEY, playerId);
    }

    await this.broadcastLobby();

    // Vừa vào lại phòng (vd sau khi deploy lại/mất mạng) mà ván đã có sẵn ->
    // gửi ngay state hiện tại (kèm đồng hồ đang chạy), không cần chờ có
    // action mới mới thấy.
    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (state) {
      const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
      this.sendStateTo(ws, state, [], deadline ?? null, this.connectedPlayerIdsInGame(state));
    }
  }

  private async getOwnerId(): Promise<string | null> {
    return (await this.ctx.storage.get<string>(OWNER_KEY)) ?? null;
  }

  private async handleStartGame(ws: WebSocket, seed: number): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const ownerId = await this.getOwnerId();
    if (!attachment?.playerId || attachment.playerId !== ownerId) {
      this.sendError(ws, "Chỉ chủ phòng mới có quyền bắt đầu ván mới");
      return;
    }

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

    await this.afterStateChange(state, []);
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

    await this.afterStateChange(result.state, result.events);
  }

  // ----- Việc 4.1: đồng hồ đếm ngược lượt -----
  //
  // MỌI thay đổi state (action thật của người chơi, start_game, HAY hành
  // động tự động lúc hết giờ ở alarm() bên dưới) đều phải đi qua đúng 1 chỗ
  // này — để không bao giờ quên lên lịch lại đồng hồ sau khi state đổi.
  //
  // Bước 1: "cuốn" (auto-cascade) qua các bước KHÔNG có lựa chọn thật để hỏi,
  // làm LUÔN không chờ ai bấm gì: rút bài đầu lượt (turnPhase "draw"), và
  // draw! (NEED_DRAW_CHECK — Barrel/Jail/Dynamite, "lật bài kiểm tra" không
  // phải quyết định, chỉ là hình thức). Nhờ vậy các bước này không cần (và
  // không có) đồng hồ đếm giờ riêng.
  private async afterStateChange(state: GameState, events: GameEvent[]): Promise<void> {
    let finalState = state;
    let allEvents = events;

    while (!finalState.winner) {
      const top = finalState.pending[finalState.pending.length - 1];
      if (top && top.kind === "NEED_DRAW_CHECK") {
        const result = reduce(finalState, { type: "RESPOND", playerId: top.player });
        finalState = result.state;
        allEvents = allEvents.concat(result.events);
        continue;
      }
      if (finalState.pending.length === 0 && finalState.turnPhase === "draw") {
        const currentPlayerId = finalState.players[finalState.currentPlayerIndex].id;
        const result = reduce(finalState, { type: "DRAW_CARDS", playerId: currentPlayerId });
        finalState = result.state;
        allEvents = allEvents.concat(result.events);
        continue;
      }
      break;
    }

    await this.ctx.storage.put(GAME_STATE_KEY, finalState);
    const deadline = await this.scheduleDeadline(finalState);
    this.broadcastState(finalState, allEvents, deadline);
  }

  // Ai/việc gì đang thật sự cần tính giờ NGAY BÂY GIỜ, sau khi đã cuốn qua
  // hết các bước tự động ở afterStateChange() — false nếu ván đã kết thúc.
  // "reactive" = có người (không nhất thiết là người đang tới lượt) phải trả
  // lời 1 pending cụ thể; "play"/"discard" = 2 pha của chính lượt hiện tại.
  private determineActiveDecision(
    state: GameState
  ): { kind: "play" | "reactive" | "discard"; playerId: string } | null {
    if (state.winner) return null;

    const top = state.pending[state.pending.length - 1];
    if (top) return { kind: "reactive", playerId: top.player };

    const currentPlayerId = state.players[state.currentPlayerIndex].id;
    if (state.turnPhase === "play") return { kind: "play", playerId: currentPlayerId };
    if (state.turnPhase === "discard") return { kind: "discard", playerId: currentPlayerId };
    return null; // turnPhase "draw" không tới đây — afterStateChange() đã tự rút bài xong
  }

  // Tính đồng hồ mới cho state hiện tại, LƯU lại (storage + setAlarm), và trả
  // về để broadcastState() gửi kèm cho mọi người. Đây là chỗ DUY NHẤT gọi
  // ctx.storage.setAlarm() — quy tắc 8 CLAUDE.md cấm setInterval/setTimeout
  // trong Durable Object, Alarm là cách THAY THẾ được phép, sống sót qua
  // hibernate.
  private async scheduleDeadline(state: GameState): Promise<DeadlineInfo | null> {
    const decision = this.determineActiveDecision(state);

    if (!decision) {
      await this.ctx.storage.delete(DEADLINE_KEY);
      await this.ctx.storage.delete(PAUSED_PLAY_KEY);
      await this.ctx.storage.deleteAlarm();
      return null;
    }

    const previous = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
    const pausedPlay = await this.ctx.storage.get<PausedPlay>(PAUSED_PLAY_KEY);

    let expiresAt: number;
    if (decision.kind === "play" && pausedPlay && pausedPlay.playerId === decision.playerId) {
      // Quay lại ĐÚNG người vừa bị ngắt ngang lượt đánh (vd đối phương vừa đỡ
      // xong Missed!) -> tiếp tục đúng số giây còn lại, không cấp lại 60s mới.
      expiresAt = Date.now() + pausedPlay.remainingMs;
      await this.ctx.storage.delete(PAUSED_PLAY_KEY);
    } else {
      if (previous?.kind === "play" && decision.kind === "reactive") {
        // Lượt đánh đang chạy bị ngắt ngang vì có người khác phải phản hồi ->
        // tạm giữ số giây CÒN LẠI, không cho trôi mất trong lúc chờ.
        const remainingMs = Math.max(0, previous.expiresAt - Date.now());
        const paused: PausedPlay = { playerId: previous.playerId, remainingMs };
        await this.ctx.storage.put(PAUSED_PLAY_KEY, paused);
      } else {
        // Mọi trường hợp khác (lượt đánh đổi sang người khác, sang pha bỏ bài
        // thừa, hay pausedPlay không khớp người) -> dữ liệu tạm giữ cũ (nếu
        // có) đã hết ý nghĩa, dọn đi tránh dùng nhầm về sau.
        await this.ctx.storage.delete(PAUSED_PLAY_KEY);
      }

      const durationMs =
        decision.kind === "play" ? PLAY_PHASE_MS : decision.kind === "discard" ? DISCARD_PHASE_MS : REACTIVE_MS;
      expiresAt = Date.now() + durationMs;
    }

    const deadline: DeadlineInfo = { playerId: decision.playerId, expiresAt, kind: decision.kind };
    await this.ctx.storage.put(DEADLINE_KEY, deadline);
    await this.ctx.storage.setAlarm(expiresAt);
    return deadline;
  }

  // Cloudflare gọi hàm này (tên bắt buộc là "alarm") đúng lúc setAlarm() đã
  // hẹn — kể cả khi Durable Object đã hibernate từ lâu, nó sẽ tự thức dậy.
  // Tự soạn ra 1 Action HỢP LỆ (y hệt loại action mà chính người chơi có thể
  // tự gửi) rồi cho đi qua reduce() y như bình thường — KHÔNG có luật riêng
  // nào nằm ở đây, chỉ là "thay người chơi bấm nút mặc định khi họ im lặng".
  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (!state || state.winner) return;

    const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
    if (!deadline) return;

    const action = this.buildTimeoutAction(state, deadline);
    if (!action) {
      // State đã đổi khác trước khi kịp hết giờ (hiếm — DO chạy đơn luồng
      // nên gần như không xảy ra) -> không có gì để tự làm, chỉ lên lịch lại
      // đúng theo state hiện tại.
      await this.scheduleDeadline(state);
      return;
    }

    let result: { state: GameState; events: GameEvent[] };
    try {
      result = reduce(state, action);
    } catch {
      await this.scheduleDeadline(state);
      return;
    }

    await this.afterStateChange(result.state, result.events);
  }

  // Hành động MẶC ĐỊNH khi hết giờ, theo đúng loại đồng hồ đang chạy — không
  // bao giờ tự chọn đánh 1 lá tấn công ai thay người chơi, chỉ "bỏ qua"/"chịu
  // hậu quả"/"chọn đại 1 lá hợp lệ" cho các trường hợp KHÔNG có lựa chọn
  // "không làm gì".
  private buildTimeoutAction(state: GameState, deadline: DeadlineInfo): Action | null {
    if (deadline.kind === "play") {
      return { type: "END_TURN", playerId: deadline.playerId };
    }

    if (deadline.kind === "discard") {
      const player = state.players.find((p) => p.id === deadline.playerId);
      if (!player) return null;
      const excess = player.hand.length - player.hp;
      if (excess <= 0) return null;
      // Bỏ ngẫu nhiên đủ số dư — không cần seed (không thuộc core/, không
      // ảnh hưởng tính replay-được của reduce()).
      const shuffled = [...player.hand].sort(() => Math.random() - 0.5);
      return { type: "DISCARD_CARDS", playerId: deadline.playerId, cardIds: shuffled.slice(0, excess) };
    }

    // "reactive": lấy top MỚI NHẤT từ state hiện tại (không tin lại thông tin
    // cũ trong deadline) — phòng trường hợp state đã đổi khác đi.
    const top = state.pending[state.pending.length - 1];
    if (!top || top.player !== deadline.playerId) return null;
    return this.buildReactiveTimeoutAction(state, top);
  }

  private buildReactiveTimeoutAction(state: GameState, top: PendingAction): Action | null {
    switch (top.kind) {
      // Có lựa chọn "không làm gì" (chịu mất máu/không đỡ) -> RESPOND không
      // kèm cardId, giống hệt bấm nút "Chịu mất máu (không đỡ)" trên UI.
      case "NEED_MISSED":
      case "NEED_DISCARD_BANG":
      case "NEED_DUEL_RESPONSE":
        return { type: "RESPOND", playerId: top.player };

      // KHÔNG có lựa chọn "không làm gì" (bắt buộc chọn đúng 1 lá) -> tự
      // chọn lá ĐẦU TIÊN hợp lệ.
      case "NEED_PICK_STORE_CARD":
        return top.options[0] ? { type: "RESPOND", playerId: top.player, cardId: top.options[0] } : null;

      case "NEED_DISCARD_FROM_ZONE": {
        const player = state.players.find((p) => p.id === top.player);
        if (!player) return null;
        // Dynamite miễn nhiễm với Cat Balou trên sân (reduce.ts từ chối nếu
        // chọn) -> loại khỏi danh sách ứng viên, giống ui.ts đã lọc sẵn.
        const candidates =
          top.zone === "hand"
            ? player.hand
            : player.equipment.filter((id) => cardNameFromId(id) !== "dynamite");
        return candidates[0] ? { type: "RESPOND", playerId: top.player, cardId: candidates[0] } : null;
      }

      case "NEED_DRAW_CHECK":
        return null; // không bao giờ tới đây — afterStateChange() luôn tự giải quyết trước
    }
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

  private async broadcastLobby(): Promise<void> {
    const message: ServerMessage = { type: "lobby", players: this.joinedPlayers(), ownerId: await this.getOwnerId() };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(payload);
    }
  }

  // Gửi viewFor() RIÊNG cho từng socket đang mở — không phải cùng 1 gói tin
  // cho tất cả (quy tắc 6: không bao giờ gửi state đầy đủ, mỗi người chỉ
  // thấy bài của chính mình). `deadline` giống nhau cho mọi người (không cần
  // lọc riêng — không chứa thông tin bí mật gì).
  private broadcastState(state: GameState, events: GameEvent[], deadline: DeadlineInfo | null): void {
    const connectedPlayerIds = this.connectedPlayerIdsInGame(state);
    for (const socket of this.ctx.getWebSockets()) {
      this.sendStateTo(socket, state, events, deadline, connectedPlayerIds);
    }
  }

  private sendStateTo(
    socket: WebSocket,
    state: GameState,
    events: GameEvent[],
    deadline: DeadlineInfo | null,
    connectedPlayerIds: string[]
  ): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) return; // socket chưa "join", chưa biết gửi view của ai

    const message: ServerMessage = {
      type: "state",
      view: viewFor(state, attachment.playerId),
      events,
      deadline,
      connectedPlayerIds,
    };
    socket.send(JSON.stringify(message));
  }

  // Việc 4.3: trong số NGƯỜI CHƠI CỦA VÁN ĐANG CHẠY (state.players), ai đang
  // có socket mở thật sự ngay lúc gọi hàm này — dùng để (1) gửi kèm cho client
  // hiện chú thích "đã mất kết nối", và (2) tự huỷ ván nếu còn quá ít người
  // (xem maybeAbandonGame() ở webSocketClose).
  private connectedPlayerIdsInGame(state: GameState): string[] {
    const connected = new Set(this.joinedPlayers().map((p) => p.id));
    return state.players.filter((p) => connected.has(p.id)).map((p) => p.id);
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
    const remaining = this.joinedPlayers().filter((p) => p.id !== closingAttachment?.playerId);

    // Chủ phòng vừa rời (mất socket cuối cùng của họ) -> tự chuyển quyền cho
    // người đang có mặt kế tiếp; hết sạch người thì để trống — ai join đầu
    // tiên sau đó sẽ tự thành chủ phòng mới (xem handleJoin). LƯU Ý: đây là
    // chuyển NGAY khi mất kết nối, không phân biệt được "rời hẳn" hay "chỉ
    // mất mạng tạm, sắp tự reconnect" — nếu chủ phòng mất mạng chớp nhoáng
    // lúc còn người khác trong phòng, quyền sẽ đổi chủ ngay, không tự trả lại
    // khi họ nối lại.
    const ownerId = await this.getOwnerId();
    if (closingAttachment?.playerId && closingAttachment.playerId === ownerId) {
      const nextOwnerId = remaining[0]?.id;
      if (nextOwnerId) {
        await this.ctx.storage.put(OWNER_KEY, nextOwnerId);
      } else {
        await this.ctx.storage.delete(OWNER_KEY);
      }
    }

    // Việc 4.3: ván đang chơi dở mà giờ chỉ còn 0-1 người CỦA VÁN ĐÓ còn kết
    // nối -> huỷ luôn, không để nó tự chạy 1 mình mãi bằng toàn hết-giờ-tự-
    // động (xem abandonGame()). Dùng `remaining` đã tính sẵn ở trên (đã loại
    // trừ đúng socket vừa đóng) thay vì gọi lại connectedPlayerIdsInGame() từ
    // joinedPlayers() — lúc này getWebSockets() có thể vẫn còn liệt kê socket
    // đang đóng, dễ đếm dư 1.
    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (state && !state.winner) {
      const remainingIdsInGame = remaining.filter((p) => state.players.some((sp) => sp.id === p.id));
      if (remainingIdsInGame.length <= 1) {
        await this.abandonGame(ws);
      } else {
        // Báo NGAY cho người còn lại biết ai vừa mất kết nối — không đợi tới
        // hành động kế tiếp mới cập nhật `connectedPlayerIds` (state không đổi
        // gì, chỉ gửi lại để vẽ đúng chú thích "đã mất kết nối"). Dùng thẳng
        // `remainingIdsInGame` (đã loại trừ đúng socket vừa đóng) thay vì gọi
        // connectedPlayerIdsInGame() — hàm đó đọc lại joinedPlayers(), lúc này
        // getWebSockets() có thể vẫn còn liệt kê socket đang đóng.
        const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
        const connectedPlayerIds = remainingIdsInGame.map((p) => p.id);
        for (const socket of this.ctx.getWebSockets()) {
          if (socket !== ws) this.sendStateTo(socket, state, [], deadline ?? null, connectedPlayerIds);
        }
      }
    }

    const message: ServerMessage = { type: "lobby", players: remaining, ownerId: await this.getOwnerId() };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== ws) socket.send(payload);
    }
  }

  // Việc 4.3: xoá ván đang chơi dở (KHÔNG đụng gì "winner" — đây là "huỷ",
  // khác "kết thúc đúng luật") + dọn đồng hồ/alarm liên quan, rồi báo cho
  // những người còn lại (thường là 0-1 người) biết. Phòng quay lại được trạng
  // thái lobby bình thường — GAME_STATE_KEY trống nên handleStartGame() lại
  // cho bắt đầu ván mới khi đủ người quay lại.
  //
  // `excludeSocket`: khi gọi từ webSocketClose(), socket vừa đóng vẫn có thể
  // còn nằm trong ctx.getWebSockets() (xem ghi chú ở webSocketClose) NHƯNG đã
  // bị đóng thật rồi — gọi send() trên nó ném lỗi và làm HỎNG NGANG vòng lặp,
  // khiến những socket đến sau trong danh sách không nhận được gì. Phải loại
  // trừ nó tường minh, không dựa vào try/catch (dễ nuốt lỗi thật khác).
  private async abandonGame(excludeSocket?: WebSocket): Promise<void> {
    await this.ctx.storage.delete(GAME_STATE_KEY);
    await this.ctx.storage.delete(DEADLINE_KEY);
    await this.ctx.storage.delete(PAUSED_PLAY_KEY);
    await this.ctx.storage.deleteAlarm();

    const message: ServerMessage = { type: "game_abandoned" };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== excludeSocket) socket.send(payload);
    }
  }
}
