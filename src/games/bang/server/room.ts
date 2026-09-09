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
// Việc 3.5 (giao thức tin nhắn — xem src/games/bang/protocol.ts): phần CHAT nối thật vào
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
import { getHandLimit } from "../core/characters";
import { reduce } from "../core/reduce";
import { setupGame } from "../core/setup";
import type { Action, ExpansionId, GameEvent, GameState, HouseRuleId, PendingAction } from "../core/types";
import { viewFor } from "../core/view";
import type { ClientMessage, DeadlineInfo, ServerMessage } from "../protocol";

interface SocketAttachment {
  playerId: string;
  name: string;
  // Bổ sung — mốc thời gian lần cuối NHẬN được bất kỳ tin nhắn nào từ socket
  // này (kể cả "ping" thuần tuý, xem protocol.ts + net.ts) — dùng để lọc ra
  // "socket ma" (còn bị ctx.getWebSockets() liệt kê nhưng thật ra đã chết từ
  // lâu, server chưa kịp nhận sự kiện "close"/"error" — ca thật đã gặp: 1
  // client còn kẹt trong danh sách phòng từ tận hôm qua). Xem
  // touchLastSeen()/joinedPlayers().
  lastSeenAt: number;
}

const GAME_STATE_KEY = "gameState";
// "Socket ma" — còn bị ctx.getWebSockets() liệt kê nhưng đã im lặng quá lâu
// (không "ping" lẫn không gửi gì khác) — coi như đã chết, loại khỏi mọi danh
// sách "đang kết nối" (xem joinedPlayers()). Gấp hơn 4 lần PING_INTERVAL_MS
// bên net.ts (20s) để chừa dư dả cho độ trễ mạng/tab bị trình duyệt tạm ngưng
// (throttle) — không cần khớp chính xác 2 bên, chỉ cần đủ lớn hơn hẳn.
const STALE_SOCKET_MS = 90_000;
// Độ trễ trước khi THẬT SỰ coi 1 người là đã mất kết nối/rời phòng, tính từ
// lúc socket của họ đóng (webSocketClose()/webSocketError()) — xem
// markDisconnectPending(). Bug thật đã gặp lúc test: khoá màn hình di động
// vài giây, hay nhiều socket đóng gần như đồng thời (rớt mạng tạm/hot-reload
// lúc dev), đều bị coi là "rời hẳn" NGAY LẬP TỨC — ván 2 người bị huỷ oan dù
// người đó tự nối lại được ngay sau đó. Chốt 60 giây theo yêu cầu chủ dự án.
const DISCONNECT_GRACE_MS = 60_000;
// playerId -> mốc thời gian (epoch ms) sẽ coi là "đã rời hẳn" nếu tới lúc đó
// vẫn chưa tự nối lại — xem markDisconnectPending()/clearDisconnectPending().
const PENDING_DISCONNECT_KEY = "pendingDisconnects";
// Chủ phòng — KHÔNG lưu trực tiếp 1 giá trị "ownerId" nữa (bug phát hiện sau
// khi chơi thật: dùng lại 1 mã phòng đã trống hẳn từ vài ngày trước, không ai
// được công nhận là chủ phòng — vì "ownerId" cũ vẫn còn ĐỌNG LẠI trong storage
// trỏ tới 1 playerId đã rời từ lâu, và không có gì đảm bảo webSocketClose()/
// webSocketError() LUÔN chạy kịp lúc mất kết nối đột ngột — vd rớt mạng không
// đóng socket "sạch" — để dọn giá trị đó). Đổi sang lưu THỨ TỰ VÀO PHÒNG LẦN
// ĐẦU của từng playerId (mảng CHỈ THÊM, không bao giờ xoá) — chủ phòng LUÔN
// được TÍNH LẠI (không lưu rời rạc): là người có thứ tự thấp nhất trong số
// đang THẬT SỰ CÒN KẾT NỐI (xem getOwnerId()). Cách này tự "lành" — playerId
// cũ dù còn kẹt trong mảng cũng không bao giờ được tính là chủ phòng nữa 1
// khi không còn socket nào của họ đang mở, bất kể vì lý do gì.
const JOIN_ORDER_KEY = "joinOrder";

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
// Phản hồi thật từ chủ dự án: CHỐT lại quy tắc timeout — chỉ lượt đánh bài
// (60s) và bỏ bài thừa (+15s) là 2 mốc riêng; MỌI hành động khác (đỡ Missed!/
// Đấu tay đôi/Người da đỏ/Cat Balou/Cửa hàng tổng hợp/hạ Bang! ngoài lượt...)
// ĐỀU 15s như nhau — trước đó 10s là SAI, sửa lại đúng 15s.
const REACTIVE_MS = 15_000; // người khác phải phản hồi (đỡ Missed!/Đấu tay đôi/Người da đỏ/Cat Balou/Cửa hàng tổng hợp...)
const DISCARD_PHASE_MS = 15_000; // bỏ bài thừa cuối lượt (chỉ khi hand > hp)
// Giai đoạn 5, cơ chế chọn nhân vật — CHUNG cho CẢ BÀN (không phải từng
// người riêng), tính từ lúc ván vừa được tạo (setupGame() với
// dealCharacterCards:true) cho tới khi MỌI người đã chọn xong. Từng đổi qua
// lại: 30s ban đầu -> 15s (chủ dự án chốt gộp về mốc chung 15s) -> QUAY LẠI
// 30s (chủ dự án phản hồi thật: 15s hơi gấp để đọc kỹ mô tả 2 nhân vật rồi
// chọn, khác các phản hồi 1 lựa chọn đơn giản khác).
const CHARACTER_SELECTION_MS = 30_000;

// Ai/việc gì đang cần tính giờ — dùng chung cho determineActiveDecision() và
// DeadlineInfo (protocol.ts, trừ `expiresAt`). Tách riêng "character_selection"
// (playerId luôn null, đồng hồ CHUNG cho cả bàn) khỏi 3 loại còn lại (luôn
// gắn đúng 1 người) để TypeScript tự phân biệt kiểu playerId theo `kind`.
type ActiveDecision =
  | { kind: "play" | "reactive" | "discard"; playerId: string }
  | { kind: "character_selection"; playerId: null };

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

    // Bất kỳ tin nhắn nào (kể cả "ping" thuần tuý) đều chứng tỏ socket còn
    // sống — cập nhật NGAY trước khi xử lý theo từng loại, xem ghi chú
    // STALE_SOCKET_MS/SocketAttachment.lastSeenAt ở trên. Không làm gì nếu
    // socket này chưa từng "join" (chưa có attachment).
    this.touchLastSeen(ws);

    switch (parsed.type) {
      case "join":
        await this.handleJoin(ws, parsed.playerId, parsed.name);
        return;
      case "ping":
        return; // touchLastSeen() ở trên đã đủ, không cần làm gì thêm
      case "chat":
        this.broadcastChat(ws, parsed.text, parsed.to);
        return;
      case "start_game":
        await this.handleStartGame(
          ws,
          parsed.seed,
          parsed.houseRules,
          parsed.expansions,
          parsed.eventDeckSize,
          parsed.force
        );
        return;
      case "action":
        await this.handleAction(ws, parsed.action);
        return;
      case "return_to_lobby":
        await this.handleReturnToLobby(ws);
        return;
      default: {
        const neverMessage: never = parsed;
        throw new Error(`Chưa hỗ trợ ClientMessage: ${JSON.stringify(neverMessage)}`);
      }
    }
  }

  private async handleJoin(ws: WebSocket, playerId: string, name: string): Promise<void> {
    const attachment: SocketAttachment = { playerId, name, lastSeenAt: Date.now() };
    ws.serializeAttachment(attachment);

    // Ghi lại đúng 1 LẦN thứ tự "vào phòng lần đầu" của playerId này (không
    // ghi lại nếu họ đã từng vào trước đó, kể cả đang reconnect) — chủ phòng
    // không gán ở đây nữa, xem getOwnerId().
    const joinOrder = (await this.ctx.storage.get<string[]>(JOIN_ORDER_KEY)) ?? [];
    if (!joinOrder.includes(playerId)) {
      joinOrder.push(playerId);
      await this.ctx.storage.put(JOIN_ORDER_KEY, joinOrder);
    }

    // Vừa join (lần đầu hoặc tự nối lại) -> huỷ mọi độ trễ "coi là mất kết
    // nối" đang đếm dở cho đúng playerId này, xem markDisconnectPending().
    await this.clearDisconnectPending(playerId);

    await this.broadcastLobby();

    // Vừa vào lại phòng (vd sau khi deploy lại/mất mạng) mà ván đã có sẵn ->
    // gửi ngay state hiện tại (kèm đồng hồ đang chạy), không cần chờ có
    // action mới mới thấy.
    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (state) {
      const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
      this.sendStateTo(ws, state, [], deadline ?? null, await this.connectedPlayerIdsInGame(state));
    }
  }

  // Chủ phòng = người có thứ tự vào phòng THẤP NHẤT trong số đang THẬT SỰ
  // CÒN KẾT NỐI ngay lúc gọi hàm này — tính lại mỗi lần, không đọc 1 giá trị
  // đã lưu sẵn (xem lý do đổi ở ghi chú JOIN_ORDER_KEY). `excludeSocket`
  // dùng đúng lúc socket vừa đóng có thể vẫn còn bị `ctx.getWebSockets()`
  // liệt kê (xem ghi chú ở `joinedPlayers()`), để không tính nhầm người vừa
  // rời làm chủ phòng.
  private async getOwnerId(excludeSocket?: WebSocket): Promise<string | null> {
    const joinOrder = (await this.ctx.storage.get<string[]>(JOIN_ORDER_KEY)) ?? [];
    const connected = new Set(this.joinedPlayers(excludeSocket).map((p) => p.id));
    for (const id of joinOrder) {
      if (connected.has(id)) return id;
    }
    return null;
  }

  private async handleStartGame(
    ws: WebSocket,
    seed: number,
    houseRules?: HouseRuleId[],
    expansions?: ExpansionId[],
    eventDeckSize?: number,
    force?: boolean
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const ownerId = await this.getOwnerId();
    if (!attachment?.playerId || attachment.playerId !== ownerId) {
      this.sendError(ws, "Chỉ chủ phòng mới có quyền bắt đầu ván mới");
      return;
    }

    const existing = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    // `force` (nút "Bắt đầu ván mới" giữa ván, xem protocol.ts) — CHỦ PHÒNG đã
    // tự xác nhận huỷ ván cũ ở client, bỏ qua kiểm tra "đang có ván dở" bên
    // dưới. Không cần tự dọn DEADLINE_KEY/PAUSED_PLAY_KEY/alarm thủ công ở
    // đây — afterStateChange()'s scheduleDeadline() tự ghi đè đúng theo state
    // MỚI (characterSelection khác null) ngay sau khi hàm này return.
    if (existing && !existing.winner && !force) {
      this.sendError(ws, "Phòng này đã có ván đang chơi, không thể bắt đầu ván mới");
      return;
    }

    const joined = this.joinedPlayers();
    const playerIds = joined.map((p) => p.id);

    let state: GameState;
    try {
      // Giai đoạn 5, cơ chế "phát 2 lá nhân vật, chọn giữ 1" — bật thật ở đây
      // (xem CLAUDE.md): mọi ván qua mạng từ giờ đều bắt đầu bằng bước chọn
      // nhân vật. CHƯA có đồng hồ "hết giờ tổng" thật ở việc này — nếu ai đó
      // còn kết nối nhưng cứ không bấm chọn, ván sẽ chờ vô thời hạn ở bước
      // này (mất kết nối thì cơ chế huỷ ván có sẵn từ việc 4.3 vẫn hoạt động
      // bình thường, không liên quan gì tới field mới này).
      state = setupGame(playerIds, seed, { dealCharacterCards: true, houseRules, expansions, eventDeckSize });
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

  // Bổ sung — nút "Về phòng chờ (sửa tuỳ chọn)" trong dialog Cài đặt (CHỈ chủ
  // phòng thấy nút này, giống handleStartGame() ở trên). Khác `force: true`
  // của "Bắt đầu ván mới" (restart NGAY với house rules/expansions CŨ): đây
  // HUỶ ván đang chơi rồi đưa CẢ PHÒNG về lobby, KHÔNG tự tạo ván mới nào —
  // chủ phòng cần tự bấm "Bắt đầu ván" lại sau khi sửa xong tuỳ chọn.
  // Tái dùng THẲNG abandonGame() (đã có sẵn từ việc 4.3, dùng khi mất kết nối)
  // — cùng 1 việc "xoá GameState + đồng hồ/alarm, đưa phòng về lobby", chỉ
  // khác LÝ DO hiển thị cho người chơi (`reason`). Gọi KHÔNG kèm `excludeSocket`
  // (khác lúc gọi từ webSocketClose()) vì chính chủ phòng — người vừa gửi yêu
  // cầu — cũng cần nhận lại thông báo để chuyển màn hình về lobby, không phải
  // socket đang đóng.
  private async handleReturnToLobby(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const ownerId = await this.getOwnerId();
    if (!attachment?.playerId || attachment.playerId !== ownerId) {
      this.sendError(ws, "Chỉ chủ phòng mới có quyền quay lại phòng chờ");
      return;
    }

    const existing = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (!existing) {
      this.sendError(ws, "Chưa có ván nào đang chơi để quay lại phòng chờ");
      return;
    }

    await this.abandonGame(undefined, "host_returned_to_lobby");
  }

  private async handleAction(ws: WebSocket, action: Action): Promise<void> {
    // Chống giả mạo: action nào có field playerId thì playerId đó PHẢI đúng
    // bằng danh tính thật của socket đang gửi (không phải client tự khai) —
    // nếu không, 1 client có thể gửi hành động THAY MẶT người chơi khác (vd
    // tự chọn hộ lá bỏ của Cat Balou nhắm vào người khác). Cùng nguyên tắc
    // handleStartGame() đã áp dụng với ownerId.
    if ("playerId" in action) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (action.playerId !== attachment?.playerId) {
        this.sendError(ws, "Không thể gửi hành động thay người chơi khác");
        return;
      }
    }

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

    // Giai đoạn 5 (Sid Ketchum, đợt 7) — truyền kèm ai VỪA hành động, để
    // scheduleDeadline() biết mà KHÔNG cấp lại đồng hồ mới cho người khác khi
    // hành động này không phải của chính người đang được tính giờ (xem ghi
    // chú ở scheduleDeadline()). FINALIZE_CHARACTER_SELECTION (chọn nhân vật,
    // Giai đoạn 5) là action HỆ THỐNG DUY NHẤT không có playerId — không có
    // "ai vừa hành động" cụ thể nào liên quan tới việc giữ nguyên đồng hồ.
    const actingPlayerId = "playerId" in action ? action.playerId : undefined;
    // USE_ABILITY (Sid Ketchum) không bao giờ là "quyết định đang được tính
    // giờ" — đánh dấu riêng để scheduleDeadline() không tự cấp lại đồng hồ dù
    // chính người dùng kỹ năng đang là người bị tính giờ (xem ghi chú ở đó).
    const isSelfServiceAction = action.type === "USE_ABILITY";
    await this.afterStateChange(result.state, result.events, actingPlayerId, isSelfServiceAction);
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
  //
  // `actingPlayerId` (Giai đoạn 5, Sid Ketchum đợt 7) — người vừa gửi action
  // THẬT SỰ (không tính bởi bước "cuốn" tự động ở trên). undefined cho
  // start_game (không có "người vừa hành động" nào liên quan tới việc giữ
  // nguyên đồng hồ, xử lý như trước giờ). Xem scheduleDeadline().
  private async afterStateChange(
    state: GameState,
    events: GameEvent[],
    actingPlayerId?: string,
    isSelfServiceAction?: boolean
  ): Promise<void> {
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
      // Giai đoạn 5, cơ chế chọn nhân vật — CHƯA thể tự rút bài đầu lượt lúc
      // characterSelection còn khác null (chưa ai có máu/bài tay thật, xem
      // CLAUDE.md) — reduce() cũng chặn DRAW_CARDS lúc này, tự gọi vào đây sẽ
      // ném lỗi không được bắt (crash luôn Durable Object), nên PHẢI kiểm
      // trước khi vào nhánh "cuốn" rút bài tự động.
      if (!finalState.characterSelection && finalState.pending.length === 0 && finalState.turnPhase === "draw") {
        const currentPlayerId = finalState.players[finalState.currentPlayerIndex].id;
        const result = reduce(finalState, { type: "DRAW_CARDS", playerId: currentPlayerId });
        finalState = result.state;
        allEvents = allEvents.concat(result.events);
        continue;
      }
      break;
    }

    await this.ctx.storage.put(GAME_STATE_KEY, finalState);
    const deadline = await this.scheduleDeadline(finalState, actingPlayerId, isSelfServiceAction);
    await this.broadcastState(finalState, allEvents, deadline);
  }

  // Ai/việc gì đang thật sự cần tính giờ NGAY BÂY GIỜ, sau khi đã cuốn qua
  // hết các bước tự động ở afterStateChange() — false nếu ván đã kết thúc.
  // "reactive" = có người (không nhất thiết là người đang tới lượt) phải trả
  // lời 1 pending cụ thể; "play"/"discard" = 2 pha của chính lượt hiện tại;
  // "character_selection" (Giai đoạn 5) = CẢ BÀN đang chọn nhân vật, kiểm
  // TRƯỚC mọi nhánh khác — lúc này pending/turnPhase chưa có ý nghĩa thật
  // (xem finishCharacterSelection() trong core/reduce.ts).
  private determineActiveDecision(state: GameState): ActiveDecision | null {
    if (state.winner) return null;

    if (state.characterSelection) return { kind: "character_selection", playerId: null };

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
  private async scheduleDeadline(
    state: GameState,
    actingPlayerId?: string,
    isSelfServiceAction?: boolean
  ): Promise<DeadlineInfo | null> {
    const decision = this.determineActiveDecision(state);

    if (!decision) {
      await this.ctx.storage.delete(DEADLINE_KEY);
      await this.ctx.storage.delete(PAUSED_PLAY_KEY);
      // KHÔNG deleteAlarm() thẳng nữa — có thể vẫn còn ai đó đang trong độ trễ
      // "coi là mất kết nối" (xem PENDING_DISCONNECT_KEY), scheduleAlarm() tự
      // biết giữ lại alarm cho đúng việc đó nếu có.
      await this.scheduleAlarm();
      return null;
    }

    const previous = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
    const pausedPlay = await this.ctx.storage.get<PausedPlay>(PAUSED_PLAY_KEY);

    // Giai đoạn 5 (Sid Ketchum, đợt 7) — kỹ năng chủ động dùng được BẤT CỨ LÚC
    // NÀO, kể cả khi KHÔNG phải lượt/phản ứng của chính người dùng. Nếu "ai
    // cần làm gì" không đổi (vẫn cùng kind/playerId) VÀ người vừa hành động
    // KHÁC người đang được tính giờ -> GIỮ NGUYÊN đồng hồ đang chạy, không cấp
    // lại thời gian mới — đúng yêu cầu "không can thiệp vào cơ chế tính giờ
    // của bất kỳ ai". Người ĐANG được tính giờ tự hành động (vd chơi thêm 1 lá
    // Bia trong lượt mình) vẫn được cấp lại đồng hồ mới như trước giờ.
    //
    // NGOẠI LỆ (phát hiện sau đợt 7): `isSelfServiceAction` (USE_ABILITY) LUÔN
    // giữ nguyên đồng hồ dù actingPlayerId === decision.playerId — vì kỹ năng
    // này KHÔNG BAO GIỜ thật sự là "quyết định đang được tính giờ" (không đụng
    // pending/turnPhase của ai, kể cả chính người dùng). Thiếu điều kiện này,
    // chính người ĐANG bị tính giờ (vd đang chờ đỡ Missed!) có thể tự dùng kỹ
    // năng lặp lại để tự cấp lại đồng hồ mới cho MÌNH nhiều lần — "câu giờ" vô
    // hạn cho phản hồi của chính họ.
    if (
      previous &&
      previous.kind === decision.kind &&
      previous.playerId === decision.playerId &&
      (isSelfServiceAction || (actingPlayerId !== undefined && actingPlayerId !== decision.playerId))
    ) {
      return previous;
    }

    let expiresAt: number;
    if (decision.kind === "play" && pausedPlay && pausedPlay.playerId === decision.playerId) {
      // Quay lại ĐÚNG người vừa bị ngắt ngang lượt đánh (vd đối phương vừa đỡ
      // xong Missed!) -> tiếp tục đúng số giây còn lại, không cấp lại 60s mới.
      expiresAt = Date.now() + pausedPlay.remainingMs;
      await this.ctx.storage.delete(PAUSED_PLAY_KEY);
    } else {
      // BUG thật (báo từ chủ dự án 2026-08-11, sửa cùng ngày) — lá đánh NHIỀU
      // người liền (Gatling/Indians!/Brawl...) đẩy 1 LOẠT pending "reactive"
      // riêng cho từng nạn nhân, giải quyết LẦN LƯỢT từng người (xem
      // CLAUDE.md's "Mô hình chờ"). Bản cũ chỉ lưu pausedPlay ĐÚNG lúc chuyển
      // TỪ "play" SANG "reactive" (nạn nhân đầu tiên) — mọi lần chuyển tiếp
      // theo SAU đó (reactive người này -> reactive người kế) đều rơi vào
      // nhánh else bên dưới và XOÁ MẤT pausedPlay đang giữ số giây còn lại
      // của người vừa đánh, dù lượt đánh của họ CHƯA hề quay lại. Tới lúc nạn
      // nhân CUỐI cùng phản hồi xong, quay về "play" thì pausedPlay đã rỗng ->
      // cấp NHẦM 60 giây mới hoàn toàn thay vì đúng số giây còn lại. Sửa:
      // pausedPlay phải sống sót qua SUỐT chuỗi reactive->reactive (không
      // đụng gì tới nó), CHỈ xoá khi quyết định mới KHÔNG còn là "reactive"
      // (đổi lượt/pha bỏ bài/chọn nhân vật, hoặc "play" nhưng lệch người —
      // trường hợp resume ĐÚNG người đã được nhánh if ở trên xử lý riêng).
      if (previous?.kind === "play" && decision.kind === "reactive") {
        // Lượt đánh đang chạy bị ngắt ngang vì có người khác phải phản hồi ->
        // tạm giữ số giây CÒN LẠI, không cho trôi mất trong lúc chờ.
        const remainingMs = Math.max(0, previous.expiresAt - Date.now());
        const paused: PausedPlay = { playerId: previous.playerId, remainingMs };
        await this.ctx.storage.put(PAUSED_PLAY_KEY, paused);
      } else if (decision.kind !== "reactive") {
        // Quyết định mới không còn là "reactive" (và không khớp nhánh resume
        // ở trên) -> dữ liệu tạm giữ cũ (nếu có) đã hết ý nghĩa thật, dọn đi
        // tránh dùng nhầm về sau.
        await this.ctx.storage.delete(PAUSED_PLAY_KEY);
      }
      // else: decision.kind === "reactive" nhưng KHÔNG phải lần đầu ngắt lượt
      // đánh (previous cũng đã là "reactive") -> đang giữa chuỗi nhiều nạn
      // nhân của cùng 1 lá, GIỮ NGUYÊN pausedPlay đang có, không đụng vào.

      const baseDurationMs =
        decision.kind === "play"
          ? PLAY_PHASE_MS
          : decision.kind === "discard"
            ? DISCARD_PHASE_MS
            : decision.kind === "character_selection"
              ? CHARACTER_SELECTION_MS
              : REACTIVE_MS;
      // House rule "double_timers" (xem types.ts) — gấp đôi mốc GỐC trước khi
      // cấp đồng hồ mới. KHÔNG đụng nhánh resume-từ-pausedPlay ở trên: số
      // giây còn lại ở đó vốn đã được tính từ 1 lần cấp mới TRƯỚC ĐÓ (đã nhân
      // đôi sẵn nếu luật này đang bật lúc đó), nhân lại lần nữa sẽ SAI.
      const durationMs = state.houseRules.includes("double_timers") ? baseDurationMs * 2 : baseDurationMs;
      expiresAt = Date.now() + durationMs;
    }

    const deadline: DeadlineInfo = { ...decision, expiresAt };
    await this.ctx.storage.put(DEADLINE_KEY, deadline);
    await this.scheduleAlarm();
    return deadline;
  }

  // Durable Object chỉ có ĐÚNG 1 alarm tại 1 thời điểm (setAlarm() sau ghi đè
  // cái trước) — nhưng giờ có 2 việc CÓ THỂ cùng cần alarm: đồng hồ lượt chơi
  // (DEADLINE_KEY) VÀ độ trễ "coi là mất kết nối" của từng người
  // (PENDING_DISCONNECT_KEY, xem markDisconnectPending()). Gọi hàm này SAU
  // MỖI lần đổi 1 trong 2 key đó thay vì tự gọi setAlarm()/deleteAlarm() rời
  // rạc — luôn hẹn đúng mốc SỚM NHẤT trong số các việc đang chờ, không mất
  // việc nào.
  private async scheduleAlarm(): Promise<void> {
    const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
    const pendingDisconnects = await this.ctx.storage.get<Record<string, number>>(PENDING_DISCONNECT_KEY);

    const times: number[] = [];
    if (deadline) times.push(deadline.expiresAt);
    if (pendingDisconnects) times.push(...Object.values(pendingDisconnects));

    if (times.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  // Ghi lại "playerId này VỪA mất kết nối" — KHÔNG xử lý gì ngay (không
  // broadcast, không huỷ ván) — chỉ hẹn giờ, alarm() sẽ tự xử lý đúng lúc hết
  // hạn NẾU họ vẫn chưa tự nối lại (xem clearDisconnectPending()). Đây là chỗ
  // tạo ra "độ trễ" — xem ghi chú DISCONNECT_GRACE_MS.
  private async markDisconnectPending(playerId: string): Promise<void> {
    const pending = (await this.ctx.storage.get<Record<string, number>>(PENDING_DISCONNECT_KEY)) ?? {};
    pending[playerId] = Date.now() + DISCONNECT_GRACE_MS;
    await this.ctx.storage.put(PENDING_DISCONNECT_KEY, pending);
    await this.scheduleAlarm();
  }

  // playerId vừa (tự) nối lại được -> huỷ độ trễ đang đếm dở cho họ, nếu có.
  private async clearDisconnectPending(playerId: string): Promise<void> {
    const pending = await this.ctx.storage.get<Record<string, number>>(PENDING_DISCONNECT_KEY);
    if (!pending || !(playerId in pending)) return;
    delete pending[playerId];
    if (Object.keys(pending).length === 0) {
      await this.ctx.storage.delete(PENDING_DISCONNECT_KEY);
    } else {
      await this.ctx.storage.put(PENDING_DISCONNECT_KEY, pending);
    }
    await this.scheduleAlarm();
  }

  // Cloudflare gọi hàm này (tên bắt buộc là "alarm") đúng lúc setAlarm() đã
  // hẹn — kể cả khi Durable Object đã hibernate từ lâu, nó sẽ tự thức dậy.
  // Tự soạn ra 1 Action HỢP LỆ (y hệt loại action mà chính người chơi có thể
  // tự gửi) rồi cho đi qua reduce() y như bình thường — KHÔNG có luật riêng
  // nào nằm ở đây, chỉ là "thay người chơi bấm nút mặc định khi họ im lặng".
  async alarm(): Promise<void> {
    // Xử lý TRƯỚC những ai đã hết độ trễ "coi là mất kết nối" (nếu có) — độc
    // lập hoàn toàn với đồng hồ lượt chơi bên dưới, xem finalizeDueDisconnects().
    await this.finalizeDueDisconnects();

    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (!state || state.winner) {
      // Vẫn có thể còn ai đó khác đang trong độ trễ mất kết nối CHƯA tới hạn
      // — scheduleAlarm() tự tính lại đúng mốc kế tiếp cho việc đó.
      await this.scheduleAlarm();
      return;
    }

    const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
    if (!deadline) {
      await this.scheduleAlarm();
      return;
    }

    const action = this.buildTimeoutAction(state, deadline);
    if (!action) {
      // State đã đổi khác trước khi kịp hết giờ (hiếm — DO chạy đơn luồng
      // nên gần như không xảy ra) -> không có gì để tự làm, chỉ lên lịch lại
      // đúng theo state hiện tại. deadline.playerId là `null` ở đồng hồ
      // "character_selection" (không gắn 1 người) — scheduleDeadline() nhận
      // `actingPlayerId?: string`, nên đổi null -> undefined ở đây.
      await this.scheduleDeadline(state, deadline.playerId ?? undefined);
      return;
    }

    let result: { state: GameState; events: GameEvent[] };
    try {
      result = reduce(state, action);
    } catch {
      await this.scheduleDeadline(state, deadline.playerId ?? undefined);
      return;
    }

    // "Người vừa hành động" ở đây chính là chủ nhân đồng hồ vừa hết giờ (hệ
    // thống tự bấm nút mặc định thay họ) — không phải ca "bystander" của Sid
    // Ketchum, nên vẫn cấp lại đồng hồ mới bình thường cho quyết định TIẾP
    // THEO (thường đã đổi người/kind sau hành động mặc định này). null ->
    // undefined cùng lý do ở trên (đồng hồ "character_selection").
    await this.afterStateChange(result.state, result.events, deadline.playerId ?? undefined);
  }

  // Hành động MẶC ĐỊNH khi hết giờ, theo đúng loại đồng hồ đang chạy — không
  // bao giờ tự chọn đánh 1 lá tấn công ai thay người chơi, chỉ "bỏ qua"/"chịu
  // hậu quả"/"chọn đại 1 lá hợp lệ" cho các trường hợp KHÔNG có lựa chọn
  // "không làm gì".
  private buildTimeoutAction(state: GameState, deadline: DeadlineInfo): Action | null {
    // Giai đoạn 5, chọn nhân vật — hết giờ CHUNG cho cả bàn, chốt hết những ai
    // còn chưa tự chọn (xem handleFinalizeCharacterSelection() trong
    // core/reduce.ts — rút NGẪU NHIÊN 1 trong 2 lá, không ưu tiên lá nào).
    if (deadline.kind === "character_selection") {
      return { type: "FINALIZE_CHARACTER_SELECTION" };
    }

    if (deadline.kind === "play") {
      return { type: "END_TURN", playerId: deadline.playerId };
    }

    if (deadline.kind === "discard") {
      const player = state.players.find((p) => p.id === deadline.playerId);
      if (!player) return null;
      // Mở rộng Dodge City, mục C nhóm B (Sean Mallory) — getHandLimit() thay
      // player.hp trực tiếp, giống reduce.ts's handleEndTurn()/handleDiscardCards().
      const excess = player.hand.length - getHandLimit(state, player);
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

      // Giai đoạn 5 (Pedro Ramirez) — hết giờ thì rút bộ bài như bình thường,
      // đúng "Timeout → rút cả 2 từ bộ bài" trong file luật (RESPOND không kèm
      // cardId).
      case "NEED_PICK_DRAW_SOURCE":
        return { type: "RESPOND", playerId: top.player };

      // Giai đoạn 5 (Jesse Jones) — hết giờ ở bước Jesse tự quyết đầu lượt ->
      // mặc định rút bộ bài như bình thường (không kèm targetId), đúng luật.
      case "NEED_PICK_DRAW_TARGET":
        return { type: "RESPOND", playerId: top.player };

      // Giai đoạn 5 (Jesse Jones) — hết giờ ở bước NẠN NHÂN tự chọn lá đưa ->
      // rút ngẫu nhiên thay họ (không kèm cardId), đúng "Timeout → rút ngẫu
      // nhiên" trong file luật.
      case "NEED_GIVE_CARD_TO_PLAYER":
        return { type: "RESPOND", playerId: top.player };

      // Giai đoạn 5 (Kit Carlson) — hết giờ thì giữ 2 lá ĐẦU, bỏ lá thứ 3
      // (top.cards[2]), đúng house rule đã chốt (khác bản gốc BANG!). `top` ở
      // đây là PendingAction THẬT từ GameState (server-side), không phải bản
      // đã ẩn qua viewFor(), nên vẫn đọc được top.cards bình thường.
      case "NEED_PICK_KEPT_CARDS":
        return { type: "RESPOND", playerId: top.player, cardId: top.cards[2] };

      // Mở rộng Dodge City, mục C nhóm A (Pat Brennan) — hết giờ thì rút bộ
      // bài như bình thường (không kèm targetId), cùng quy ước timeout với
      // Pedro Ramirez/Jesse Jones ở trên.
      case "NEED_PICK_DRAW_OR_EQUIPMENT":
        return { type: "RESPOND", playerId: top.player };

      // Mở rộng Dodge City, mục C nhóm C (Vera Custer) — BẮT BUỘC chọn (không
      // có lựa chọn "không mượn ai", đã hỏi lại và chốt) — hết giờ tự chọn
      // NGẪU NHIÊN 1 người còn sống khác đã có nhân vật. Không dùng RNG có
      // seed (không thuộc core/, không ảnh hưởng tính replay-được của reduce()),
      // giống cách bỏ bài ngẫu nhiên ở nhánh "discard" phía trên.
      case "NEED_PICK_BORROWED_CHARACTER": {
        const player = state.players.find((p) => p.id === top.player);
        if (!player) return null;
        const candidates = state.players.filter((p) => p.alive && p.id !== player.id && p.characterId !== null);
        if (candidates.length === 0) return null;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        return { type: "RESPOND", playerId: top.player, targetId: target.id };
      }

      // Bộ mở rộng "custom_characters" (Elena Noir) — hết giờ thì mặc định
      // KHÔNG vũ trang (không kèm `armed`, respondToPickArmed() tự hiểu là
      // false) — an toàn hơn (rút 2 lá bình thường) so với tự ý vũ trang thay
      // người chơi (sẽ mất 1 lá rút mà họ không hề chọn).
      case "NEED_PICK_ARMED":
        return { type: "RESPOND", playerId: top.player };

      // Bộ mở rộng "custom_characters" (Marcel Marcelo) — BẮT BUỘC chọn
      // (không có lựa chọn "không chọn ai") — hết giờ tự chọn NGẪU NHIÊN 1
      // người còn sống khác, cùng quy ước timeout với Vera Custer ở trên
      // (khác Vera: không cần lọc characterId !== null, ai cũng chọn được).
      case "NEED_PICK_MARCEL_COMPANION": {
        const player = state.players.find((p) => p.id === top.player);
        if (!player) return null;
        const candidates = state.players.filter((p) => p.alive && p.id !== player.id);
        if (candidates.length === 0) return null;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        return { type: "RESPOND", playerId: top.player, targetId: target.id };
      }

      // Bộ mở rộng "custom_characters" (The Thief) — KHÁC mọi pending "tự
      // chọn" khác ở trên: hết giờ KHÔNG mặc định "bỏ qua" (RESPOND không kèm
      // targetId vẫn hợp lệ, nhưng đó là lựa chọn TỰ NGUYỆN của người chơi,
      // không phải hành vi mặc định lúc hết giờ) — house rule đã chốt tự chọn
      // NGẪU NHIÊN 1 người còn sống CÓ BÀI, chỉ rơi về "không chọn ai" khi thật
      // sự không còn ai có bài (xem docs/bang-rules/House_Rule.txt mục I).
      case "NEED_PICK_THIEF_TARGET": {
        const player = state.players.find((p) => p.id === top.player);
        if (!player) return null;
        const candidates = state.players.filter((p) => p.alive && p.id !== player.id && p.hand.length > 0);
        if (candidates.length === 0) return { type: "RESPOND", playerId: top.player };
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        return { type: "RESPOND", playerId: top.player, targetId: target.id };
      }

      // Mở rộng A Fistful of Cards (Blood Brothers) — hết giờ thì mặc định bỏ
      // qua, không tặng ai (không kèm targetId) — an toàn hơn tự ý chọn người
      // nhận thay người chơi.
      case "NEED_BLOOD_BROTHERS_GIFT":
        return { type: "RESPOND", playerId: top.player };

      // Mở rộng A Fistful of Cards (Hard Liquor) — hết giờ thì mặc định rút
      // bài như bình thường (không kèm skipDrawForHardLiquor) — an toàn hơn
      // tự ý hồi máu thay người chơi (họ có thể muốn giữ bài trên tay).
      case "NEED_PICK_HARD_LIQUOR":
        return { type: "RESPOND", playerId: top.player };

      // Mở rộng A Fistful of Cards (Ricochet) — có lựa chọn "không đỡ" (mất
      // lá trang bị), giống hệt NEED_MISSED — RESPOND không kèm cardId.
      case "NEED_MISSED_FOR_EQUIPMENT":
        return { type: "RESPOND", playerId: top.player };

      // Mở rộng A Fistful of Cards (Ranch) — hết giờ thì mặc định không đổi
      // lá nào (không kèm cardIds) — an toàn hơn tự ý chọn lá đổi thay người
      // chơi.
      case "NEED_RANCH_EXCHANGE":
        return { type: "RESPOND", playerId: top.player };

      // Mở rộng A Fistful of Cards (Russian Roulette) — có lựa chọn "không bỏ"
      // (chịu mất 2 máu, chuỗi dừng lại), giống hệt NEED_MISSED — RESPOND
      // không kèm cardId.
      case "NEED_DISCARD_MISSED_OR_DAMAGE":
        return { type: "RESPOND", playerId: top.player };

      // Bộ mở rộng "custom_characters" (Nomad Norman) — hết giờ mặc định TỪ
      // CHỐI (không kèm useShield) — giữ khiên lại để dành, an toàn hơn tự ý
      // dùng thay người chơi.
      case "NEED_USE_DRIFTER_SHIELD":
        return { type: "RESPOND", playerId: top.player };

      // Bộ mở rộng "custom_characters" (Envoy Evy) — hết giờ mặc định TỪ
      // CHỐI (không kèm useDealerTrade) — an toàn hơn tự ý tiêu 2 lá bài thay
      // người chơi.
      case "NEED_USE_DEALER_TRADE":
        return { type: "RESPOND", playerId: top.player };

      // Bộ mở rộng "custom_characters" (Aura The Soul-Weaver) — hết giờ mặc định TỪ
      // CHỐI (không kèm reviveTarget) — an toàn hơn tự ý trừ 2 máu tối đa
      // VĨNH VIỄN của người chơi thay họ (từ chối không tiêu hao lượt dùng).
      case "NEED_SENTINEL_REVIVE":
        return { type: "RESPOND", playerId: top.player };
    }
  }

  // Danh sách người ĐANG kết nối và đã "join" — lấy trực tiếp từ các socket
  // đang mở (không lưu riêng ở đâu cả, xem ghi chú đầu file).
  //
  // `excludeSocket`: loại theo ĐÚNG socket (so sánh tham chiếu), KHÔNG PHẢI
  // theo playerId — quan trọng lúc socket cũ sắp đóng chồng lấn với socket
  // mới đã tự reconnect xong (net.ts tự nối lại + gửi "join" ngay, có thể xảy
  // ra TRƯỚC khi server nhận ra socket cũ đã đóng): nếu loại theo playerId sẽ
  // xoá NHẦM CẢ socket mới (cùng playerId) dù nó vẫn đang sống, khiến đếm
  // thiếu người/chuyển nhầm quyền chủ phòng/huỷ nhầm ván (xem handleSocketGone()).
  private joinedPlayers(excludeSocket?: WebSocket): { id: string; name: string }[] {
    const players: { id: string; name: string }[] = [];
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeSocket) continue;
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.playerId) continue;
      // "Socket ma" — quá lâu không thấy tin nhắn nào (kể cả "ping", xem
      // net.ts) — coi như đã chết dù ctx.getWebSockets() vẫn liệt kê, loại
      // khỏi danh sách "đang kết nối". `lastSeenAt` có thể là `undefined` với
      // những socket đã kết nối TỪ TRƯỚC lúc thêm field này (deploy giữa
      // chừng) — `now - undefined` ra `NaN`, so sánh `NaN > STALE_SOCKET_MS`
      // luôn `false` nên KHÔNG bị loại nhầm, tự "lành" ngay lần "ping" đầu
      // tiên kế tiếp của họ (touchLastSeen() ghi đè lại giá trị thật).
      if (now - attachment.lastSeenAt > STALE_SOCKET_MS) continue;
      players.push({ id: attachment.playerId, name: attachment.name });
    }
    return players;
  }

  // Ghi lại "vừa thấy socket này còn sống" — gọi mỗi khi nhận BẤT KỲ tin nhắn
  // nào từ nó (xem webSocketMessage()), không riêng "ping". Không làm gì nếu
  // socket này chưa từng "join" (chưa có attachment).
  private touchLastSeen(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    ws.serializeAttachment({ ...attachment, lastSeenAt: Date.now() });
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
  private async broadcastState(state: GameState, events: GameEvent[], deadline: DeadlineInfo | null): Promise<void> {
    const connectedPlayerIds = await this.connectedPlayerIdsInGame(state);
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

  // Việc 4.3: trong số NGƯỜI CHƠI CỦA VÁN ĐANG CHẠY (state.players), ai được
  // coi là "đang kết nối" ngay lúc gọi hàm này — dùng để (1) gửi kèm cho
  // client hiện chú thích "đã mất kết nối", và (2) tự huỷ ván nếu còn quá ít
  // người (xem finalizeDueDisconnects()). Không chỉ tính socket ĐANG THẬT SỰ
  // mở — CỘNG THÊM cả những ai socket vừa đóng nhưng vẫn còn trong ĐỘ TRỄ
  // "coi là mất kết nối" (PENDING_DISCONNECT_KEY, xem markDisconnectPending())
  // — nếu không, 1 hành động BẤT KỲ của người khác trong lúc đang chờ độ trễ
  // sẽ vô tình phát broadcastState() mới, lộ ngay huy hiệu "mất kết nối" sớm
  // hơn cả độ trễ đã định, đi ngược lại đúng mục đích của độ trễ đó.
  private async connectedPlayerIdsInGame(state: GameState): Promise<string[]> {
    const connected = new Set(this.joinedPlayers().map((p) => p.id));
    const pendingDisconnects = await this.ctx.storage.get<Record<string, number>>(PENDING_DISCONNECT_KEY);
    if (pendingDisconnects) {
      for (const id of Object.keys(pendingDisconnects)) connected.add(id);
    }
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
    await this.handleSocketGone(ws);
  }

  // Cloudflare gọi hàm này (thay vì webSocketClose()) khi kết nối bị lỗi chứ
  // không đóng "sạch" — theo tài liệu Hibernatable WebSockets, chỉ ĐÚNG MỘT
  // TRONG HAI hàm này chạy cho mỗi lần mất kết nối, không phải cả hai. Trước
  // đây file này CHỈ có webSocketClose() — nếu runtime chọn gọi đường lỗi này,
  // toàn bộ dọn dẹp bên dưới (chuyển quyền chủ phòng, huỷ ván khi hết người,
  // cập nhật "đã mất kết nối") sẽ bị bỏ sót hoàn toàn cho ca đó. Dùng chung
  // đúng 1 hàm dọn dẹp với webSocketClose() để không lặp lại logic 2 nơi.
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.handleSocketGone(ws);
  }

  // Dọn dẹp DÙNG CHUNG cho cả webSocketClose() lẫn webSocketError() — 1 socket
  // vừa đóng (dù đóng sạch hay vì lỗi). KHÔNG kết luận "đã rời hẳn" ngay ở
  // đây nữa (bug thật đã gặp: khoá màn hình di động vài giây/mất mạng chốc
  // lát cũng đóng socket y hệt rời hẳn) — chỉ ghi nhận độ trễ, xem
  // markDisconnectPending()/finalizeDueDisconnects().
  private async handleSocketGone(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) return; // socket này chưa từng "join", không có gì để theo dõi

    // Vẫn còn ÍT NHẤT 1 socket khác của ĐÚNG playerId này đang mở (vd tự nối
    // lại xong TRƯỚC KHI server kịp nhận ra socket cũ đã đóng, xem ghi chú
    // `excludeSocket` ở joinedPlayers()) -> không phải mất kết nối thật, họ
    // vẫn đang có mặt, không cần làm gì thêm.
    if (this.joinedPlayers(ws).some((p) => p.id === attachment.playerId)) return;

    await this.markDisconnectPending(attachment.playerId);
  }

  // Xử lý đúng lúc: những playerId đã hết ĐỘ TRỄ (xem markDisconnectPending())
  // mà VẪN CHƯA tự nối lại (nếu đã nối lại, clearDisconnectPending() đã xoá
  // họ khỏi PENDING_DISCONNECT_KEY từ trước, không bao giờ tới đây) — giờ mới
  // THẬT SỰ coi là đã mất kết nối: huỷ ván nếu ván đang chơi dở chỉ còn ≤1
  // người của ván đó còn kết nối (xem abandonGame(), việc 4.3), và báo lại
  // danh sách phòng/trạng thái "đang kết nối" cho mọi người. Gọi từ alarm()
  // — lúc này (đã qua ít nhất DISCONNECT_GRACE_MS) mọi socket thật sự đã đóng
  // chắc chắn không còn nằm trong ctx.getWebSockets() nữa, không cần loại trừ
  // gì như handleSocketGone() cũ.
  private async finalizeDueDisconnects(): Promise<void> {
    const pending = await this.ctx.storage.get<Record<string, number>>(PENDING_DISCONNECT_KEY);
    if (!pending) return;

    const now = Date.now();
    const dueIds = Object.keys(pending).filter((id) => pending[id] <= now);
    if (dueIds.length === 0) return;

    for (const id of dueIds) delete pending[id];
    if (Object.keys(pending).length === 0) {
      await this.ctx.storage.delete(PENDING_DISCONNECT_KEY);
    } else {
      await this.ctx.storage.put(PENDING_DISCONNECT_KEY, pending);
    }

    // Danh sách "lobby" hiển thị chỉ tính ai ĐANG THẬT SỰ có socket mở — khác
    // `connectedPlayerIds` bên dưới (CỘNG THÊM cả người đang trong độ trễ
    // riêng của họ, nếu có).
    const remaining = this.joinedPlayers();

    const state = await this.ctx.storage.get<GameState>(GAME_STATE_KEY);
    if (state && !state.winner) {
      // KHÔNG dùng thẳng `remaining` (chỉ tính socket ĐANG mở) để quyết định
      // huỷ ván — 1 playerId khác của CHÍNH ván này có thể đang trong độ trễ
      // riêng của HỌ (chưa tới hạn), vẫn cần được tính là "còn đó" để không
      // huỷ oan (đúng ca bug gốc: nhiều socket đóng gần như đồng thời, xem
      // ghi chú DISCONNECT_GRACE_MS) — connectedPlayerIdsInGame() đã cộng
      // đúng cả 2 nhóm này.
      const connectedPlayerIds = await this.connectedPlayerIdsInGame(state);
      if (connectedPlayerIds.length <= 1) {
        // KHÔNG return ở đây — abandonGame() chỉ phát "game_abandoned", CHƯA
        // phát "lobby" (bug thật đã gặp lúc tự kiểm bằng trình duyệt: chủ
        // phòng quay về lobby nhưng vẫn thấy tên người vừa mất kết nối treo
        // lại trong danh sách "Đã vào phòng"). Phải chạy tiếp xuống dưới để
        // gửi đúng "lobby" MỚI (đã loại người vừa rời) — giống nguyên bản
        // trước khi có độ trễ, "lobby" luôn gửi kèm ngay sau "game_abandoned".
        // KHÔNG gửi thêm "state" nữa bên dưới (khác nhánh else) — GAME_STATE_KEY
        // vừa bị abandonGame() xoá, gửi "state" cũ (biến `state` đọc từ TRƯỚC
        // khi xoá) sẽ đè client quay lại màn hình ván ngay sau khi vừa nhận
        // "game_abandoned" chuyển họ về lobby.
        await this.abandonGame(undefined, "disconnect");
      } else {
        // Báo NGAY cho mọi người biết ai vừa mất kết nối thật — không đợi
        // tới hành động kế tiếp mới cập nhật `connectedPlayerIds` (state
        // không đổi gì, chỉ gửi lại để vẽ đúng chú thích "đã mất kết nối").
        const deadline = await this.ctx.storage.get<DeadlineInfo>(DEADLINE_KEY);
        for (const socket of this.ctx.getWebSockets()) {
          this.sendStateTo(socket, state, [], deadline ?? null, connectedPlayerIds);
        }
      }
    }

    const message: ServerMessage = { type: "lobby", players: remaining, ownerId: await this.getOwnerId() };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(payload);
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
  // trừ nó tường minh, không dựa vào try/catch (dễ nuốt lỗi thật khác). Gọi từ
  // handleReturnToLobby() thì KHÔNG truyền — chính người gửi yêu cầu cũng cần
  // nhận lại thông báo để chuyển màn hình.
  // `reason`: forward NGUYÊN VẸN vào ServerMessage cho client hiện đúng câu
  // thông báo — xem protocol.ts.
  private async abandonGame(
    excludeSocket: WebSocket | undefined,
    reason: "disconnect" | "host_returned_to_lobby"
  ): Promise<void> {
    await this.ctx.storage.delete(GAME_STATE_KEY);
    await this.ctx.storage.delete(DEADLINE_KEY);
    await this.ctx.storage.delete(PAUSED_PLAY_KEY);
    // KHÔNG deleteAlarm() thẳng — có thể vẫn còn NGƯỜI KHÁC (không liên quan
    // ván vừa huỷ) đang trong độ trễ "coi là mất kết nối" (xem
    // PENDING_DISCONNECT_KEY), scheduleAlarm() tự giữ lại alarm cho đúng việc
    // đó nếu có.
    await this.scheduleAlarm();

    const message: ServerMessage = { type: "game_abandoned", reason };
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== excludeSocket) socket.send(payload);
    }
  }
}
