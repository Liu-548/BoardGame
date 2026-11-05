// Khung phòng chơi dùng chung (02 mục 5). Không biết gì về luật: game cung cấp `GameAdapter`.
// Tuân thủ CLAUDE.md: acceptWebSocket + webSocketMessage/Close/Error (quy tắc 7), không setTimeout/
// setInterval (8), không fetch treo (9). Mọi thứ cần nhớ nằm trong ctx.storage hoặc attachment socket.
import type { ClientMessage, LobbyPlayer, ServerMessage } from "./protocol";
import { decideJoin, pickOwner, viewHash } from "./logic";
import type { Seat } from "./logic";

export interface GameAdapter<S, A, V, C> {
  defaultConfig(playerCount: number): C;
  validateConfig(config: C, playerCount: number): string | null;
  // Ép dữ liệu thô từ client thành C hợp lệ về hình dạng (không xét số người); null = từ chối.
  sanitizeConfig(raw: unknown): C | null;
  setup(players: { id: string; name: string }[], seed: number, config: C, now: number): S;
  reduce(state: S, action: A): { state: S; error?: string };
  viewFor(state: S, playerId: string): V;
  deadline(state: S): number | null;
  timeUpAction(state: S, now: number): A;
  isOver(state: S): boolean;
  minPlayers: number;
  maxPlayers: number;
}

interface SocketAttachment {
  playerId: string | null;
  lastSeenAt: number;
  lastViewHash: string | null;
}

interface StoredConfig<C> {
  config: C | null; // null = dùng bộ gợi ý theo số người
}

const SEATS_KEY = "seats";
const GAME_KEY = "game";
const CONFIG_KEY = "config";
// D-44: "đang kết nối" = có tin nhắn trong 90s gần nhất (client ping mỗi 20s).
const STALE_SOCKET_MS = 90_000;

export abstract class BaseRoom<S, A extends { type: string }, V, C> {
  protected readonly ctx: DurableObjectState;
  // Chỉ để tránh phát lobby thừa; mất khi hibernate cũng không sao (chỉ thêm 1 lần phát).
  private lastLobbyHash = "";

  constructor(ctx: DurableObjectState, protected readonly adapter: GameAdapter<S, A, V, C>) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Cần WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null, lastSeenAt: Date.now(), lastViewHash: null } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- đọc/ghi storage ----------
  private async getSeats(): Promise<Seat[]> {
    return (await this.ctx.storage.get<Seat[]>(SEATS_KEY)) ?? [];
  }
  private async getGame(): Promise<S | null> {
    return (await this.ctx.storage.get<S>(GAME_KEY)) ?? null;
  }
  // `n` = số người sẽ chơi (đang kết nối, không chờ ván sau) — dùng cho bộ gợi ý.
  private async currentConfig(n: number): Promise<C> {
    const stored = await this.ctx.storage.get<StoredConfig<C>>(CONFIG_KEY);
    if (stored?.config) return stored.config;
    return this.adapter.defaultConfig(Math.min(this.adapter.maxPlayers, Math.max(this.adapter.minPlayers, n)));
  }

  // ---------- kết nối ----------
  private attachment(ws: WebSocket): SocketAttachment {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? { playerId: null, lastSeenAt: 0, lastViewHash: null };
  }
  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1);
  }
  private connectedIds(): Set<string> {
    const now = Date.now();
    const ids = new Set<string>();
    for (const ws of this.openSockets()) {
      const a = this.attachment(ws);
      if (a.playerId && now - a.lastSeenAt <= STALE_SOCKET_MS) ids.add(a.playerId);
    }
    return ids;
  }
  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket đã đóng giữa chừng — bỏ qua
    }
  }

  // ---------- phát tin ----------
  private async broadcastLobby(force = false): Promise<void> {
    const seats = await this.getSeats();
    const game = await this.getGame();
    const connected = this.connectedIds();
    const playing = seats.filter((s) => !s.waiting && connected.has(s.playerId));
    const config = await this.currentConfig(playing.length);
    const players: LobbyPlayer[] = seats.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      connected: connected.has(s.playerId),
      waiting: s.waiting,
    }));
    const message: ServerMessage = {
      type: "lobby",
      players,
      ownerId: pickOwner(seats.map((s) => s.playerId), connected),
      config,
      configError: game ? null : this.adapter.validateConfig(config, playing.length),
      inGame: game !== null,
    };
    const hash = viewHash(message);
    if (!force && hash === this.lastLobbyHash) return;
    this.lastLobbyHash = hash;
    for (const ws of this.openSockets()) if (this.attachment(ws).playerId) this.send(ws, message);
  }

  // D-30: chỉ gửi view cho socket nào có băm view khác lần trước.
  private async broadcastViews(state: S, onlyWs?: WebSocket): Promise<void> {
    const seats = await this.getSeats();
    const inGame = new Set(seats.filter((s) => !s.waiting).map((s) => s.playerId));
    const serverNow = Date.now();
    for (const ws of onlyWs ? [onlyWs] : this.openSockets()) {
      const a = this.attachment(ws);
      if (!a.playerId || !inGame.has(a.playerId)) continue;
      const view = this.adapter.viewFor(state, a.playerId);
      const hash = viewHash(view);
      if (!onlyWs && hash === a.lastViewHash) continue;
      ws.serializeAttachment({ ...a, lastViewHash: hash } satisfies SocketAttachment);
      this.send(ws, { type: "state", view, serverNow });
    }
  }

  // Mọi đường đổi state đi qua đây (W5): lưu → đặt alarm (D-21) → gửi view có lọc (D-30).
  private async commit(state: S): Promise<void> {
    await this.ctx.storage.put(GAME_KEY, state);
    const deadline = this.adapter.deadline(state);
    if (deadline === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(deadline);
    await this.broadcastViews(state);
  }

  // ---------- sự kiện socket ----------
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    ws.serializeAttachment({ ...this.attachment(ws), lastSeenAt: Date.now() } satisfies SocketAttachment);

    switch (msg.type) {
      case "join":
        await this.handleJoin(ws, msg.name, msg.token);
        break;
      case "ping":
        break;
      case "set_config":
        await this.handleSetConfig(ws, msg.config);
        break;
      case "start_game":
        await this.handleStart(ws);
        break;
      case "action":
        await this.handleAction(ws, msg.action);
        break;
      case "return_to_lobby":
        await this.handleReturnToLobby(ws);
        break;
    }
    await this.broadcastLobby(); // phát khi có đổi (kể cả ai đó vừa im lặng quá 90s)
  }

  async webSocketClose(): Promise<void> {
    await this.broadcastLobby();
  }
  async webSocketError(): Promise<void> {
    await this.broadcastLobby();
  }

  // ---------- xử lý từng message ----------
  private async handleJoin(ws: WebSocket, name: string, token: string): Promise<void> {
    if (typeof token !== "string" || token.length === 0 || token.length > 100) {
      this.send(ws, { type: "join_rejected", reason: "Mã trình duyệt không hợp lệ" });
      return;
    }
    const seats = await this.getSeats();
    const game = await this.getGame();
    const decision = decideJoin(seats, this.connectedIds(), game !== null, name, token, this.adapter.maxPlayers);
    if (decision.kind === "reject") {
      this.send(ws, { type: "join_rejected", reason: decision.reason });
      return;
    }

    let playerId: string;
    if (decision.kind === "reclaim") playerId = decision.playerId;
    else if (decision.kind === "takeover") {
      playerId = decision.playerId;
      await this.ctx.storage.put(SEATS_KEY, seats.map((s) => (s.playerId === playerId ? { ...s, token } : s)));
    } else {
      playerId = crypto.randomUUID();
      const display = decision.display;
      await this.ctx.storage.put(SEATS_KEY, [...seats, { playerId, name: display, token, waiting: decision.kind === "wait_next_game" }]);
    }

    // Đóng socket cũ của cùng ghế (đổi máy / tab trùng) để không có 2 socket cho 1 người.
    for (const other of this.openSockets()) {
      if (other !== ws && this.attachment(other).playerId === playerId) other.close(1000, "Ghế được dùng ở nơi khác");
    }
    ws.serializeAttachment({ playerId, lastSeenAt: Date.now(), lastViewHash: null } satisfies SocketAttachment);
    this.send(ws, { type: "joined", playerId });
    await this.broadcastLobby(true);
    if (game) await this.broadcastViews(game, ws); // chỉ gửi cho đúng socket này (D-30)
  }

  private async ownerOnly(ws: WebSocket): Promise<boolean> {
    const seats = await this.getSeats();
    const owner = pickOwner(seats.map((s) => s.playerId), this.connectedIds());
    const ok = owner !== null && owner === this.attachment(ws).playerId;
    if (!ok) this.send(ws, { type: "error", message: "Chỉ chủ phòng mới làm được việc này" });
    return ok;
  }

  private async handleSetConfig(ws: WebSocket, raw: unknown): Promise<void> {
    if (!(await this.ownerOnly(ws))) return;
    if (await this.getGame()) return this.send(ws, { type: "error", message: "Ván đang chơi, không sửa được cấu hình" });
    let config: C | null = null;
    if (raw !== null) {
      config = this.adapter.sanitizeConfig(raw);
      if (config === null) return this.send(ws, { type: "error", message: "Cấu hình không hợp lệ" });
    }
    await this.ctx.storage.put(CONFIG_KEY, { config } satisfies StoredConfig<C>);
    await this.broadcastLobby(true);
  }

  private async handleStart(ws: WebSocket): Promise<void> {
    if (!(await this.ownerOnly(ws))) return;
    if (await this.getGame()) return this.send(ws, { type: "error", message: "Ván đang chơi" });
    const seats = await this.getSeats();
    const connected = this.connectedIds();
    // Chỉ người đang kết nối được vào ván; ghế mất kết nối bị bỏ (họ vào lại sẽ chờ ván sau).
    const players = seats.filter((s) => !s.waiting && connected.has(s.playerId));
    const config = await this.currentConfig(players.length);
    const err = this.adapter.validateConfig(config, players.length);
    if (err) return this.send(ws, { type: "error", message: err });
    await this.ctx.storage.put(SEATS_KEY, seats.filter((s) => s.waiting || players.includes(s)));
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const state = this.adapter.setup(players.map((s) => ({ id: s.playerId, name: s.name })), seed, config, Date.now());
    await this.commit(state);
    await this.broadcastLobby(true);
  }

  private async handleAction(ws: WebSocket, raw: unknown): Promise<void> {
    const playerId = this.attachment(ws).playerId;
    const game = await this.getGame();
    const generic = "Bạn không thể làm việc này lúc này";
    if (!playerId || !game || typeof raw !== "object" || raw === null) return this.send(ws, { type: "error", message: generic });
    const action = raw as { type?: unknown; playerId?: unknown };
    // D-50: chặn TIME_UP từ client và giả mạo playerId.
    if (typeof action.type !== "string" || action.type === "TIME_UP" || action.playerId !== playerId) {
      return this.send(ws, { type: "error", message: generic });
    }
    const result = this.adapter.reduce(game, { ...(raw as object), now: Date.now() } as unknown as A);
    if (result.error) return this.send(ws, { type: "error", message: result.error }); // D-32: chỉ socket gửi
    await this.commit(result.state);
  }

  private async handleReturnToLobby(ws: WebSocket): Promise<void> {
    if (!(await this.ownerOnly(ws))) return;
    const game = await this.getGame();
    if (!game || !this.adapter.isOver(game)) return this.send(ws, { type: "error", message: "Ván chưa kết thúc" });
    const connected = this.connectedIds();
    // D-45: phòng chờ chỉ giữ người đang kết nối; người chờ ván sau trở thành người chơi thường.
    const seats = (await this.getSeats()).filter((s) => connected.has(s.playerId)).map((s) => ({ ...s, waiting: false }));
    await this.ctx.storage.put(SEATS_KEY, seats);
    await this.ctx.storage.delete(GAME_KEY);
    await this.ctx.storage.deleteAlarm();
    for (const sock of this.openSockets()) sock.serializeAttachment({ ...this.attachment(sock), lastViewHash: null });
    await this.broadcastLobby(true);
  }

  // D-21: alarm sớm thì đặt lại; đúng hạn thì TIME_UP.
  async alarm(): Promise<void> {
    const game = await this.getGame();
    if (!game) return;
    const deadline = this.adapter.deadline(game);
    if (deadline === null) return;
    const now = Date.now();
    if (now < deadline) {
      await this.ctx.storage.setAlarm(deadline);
      return;
    }
    const result = this.adapter.reduce(game, this.adapter.timeUpAction(game, now));
    if (!result.error) await this.commit(result.state);
  }
}
