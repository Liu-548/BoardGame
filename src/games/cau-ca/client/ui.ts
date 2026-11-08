// Vẽ DOM cho Câu cá: màn nhập tên/mã, phòng chờ, bàn chơi. Không nối mạng — main.ts lo.
import type { ServerMessage } from "../../../shared/room/protocol";
import type { Card } from "../core/types";
import type { CauCaView } from "../core/view";
import { canCapture, canDiscard, captureTargets, cardPoints, isRed, sameCard } from "../core/rules";

type Lobby = Extract<ServerMessage, { type: "lobby" }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
// Không dùng .append(): kiểu Cloudflare Workers đè kiểu DOM của nó (giống Ma Sói).
function add(parent: HTMLElement, ...children: Node[]): void {
  for (const c of children) parent.appendChild(c);
}
function button(text: string, onClick: () => void, className = "cc-btn"): HTMLButtonElement {
  const b = el("button", className, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = { h: "♥", d: "♦", s: "♠", c: "♣" };
// ︎: ép vẽ chất bài dạng chữ, không thành emoji màu trên điện thoại.
export const cardText = (c: Card) => `${RANKS[c.rank]}${SUITS[c.suit]}︎`;
const cardsText = (cards: Card[]) => cards.map(cardText).join(" ");

function cardButton(c: Card, extra: string, onClick: (() => void) | null): HTMLButtonElement {
  const b = el("button", `cc-card ${isRed(c) ? "cc-card--red" : ""} ${extra}`, cardText(c));
  b.type = "button";
  b.setAttribute("aria-label", cardText(c));
  if (onClick) b.addEventListener("click", onClick);
  else b.disabled = true;
  return b;
}

// ---------- Màn nhập tên + mã phòng ----------
export interface FormHandlers {
  onJoin(name: string, code: string): void;
  onBack(): void;
  makeCode(): string;
}

export function renderForm(root: HTMLElement, init: { name: string; code: string; error: string | null }, h: FormHandlers): void {
  const wrap = el("div", "cc-screen");
  wrap.appendChild(el("h1", "cc-title", "Câu cá 🎣"));
  wrap.appendChild(el("p", "cc-muted", "Bài Tây 3–4 người. Mỗi người mở trên máy của mình, cùng nhập 1 mã phòng."));
  const name = el("input");
  name.type = "text";
  name.placeholder = "Tên của bạn (tối đa 20 ký tự)";
  name.maxLength = 20;
  name.value = init.name;
  const code = el("input");
  code.type = "text";
  code.placeholder = "Mã phòng";
  code.value = init.code;
  code.autocapitalize = "characters";
  const nameLabel = el("label", "cc-label", "Tên của bạn");
  nameLabel.appendChild(name);
  const codeLabel = el("label", "cc-label", "Mã phòng");
  const codeRow = el("div", "cc-row");
  add(codeRow, code, button("Tạo mã mới", () => (code.value = h.makeCode()), "cc-btn cc-btn--ghost"));
  codeLabel.appendChild(codeRow);
  add(wrap, nameLabel, codeLabel);
  if (init.error) wrap.appendChild(el("p", "cc-error", init.error));
  const row = el("div", "cc-row");
  add(row, button("Vào phòng", () => h.onJoin(name.value, code.value), "cc-btn cc-btn--primary"), button("Về Sảnh", h.onBack, "cc-btn cc-btn--ghost"));
  wrap.appendChild(row);
  root.replaceChildren(wrap);
}

// ---------- Phòng chờ ----------
export interface LobbyHandlers {
  onStart(): void;
  onLeave(): void;
}

export function renderLobby(root: HTMLElement, lobby: Lobby, myId: string, roomCode: string, h: LobbyHandlers): void {
  const wrap = el("div", "cc-screen");
  wrap.appendChild(el("h1", "cc-title", "Câu cá — phòng chờ"));
  wrap.appendChild(el("p", "", `Mã phòng: `)).appendChild(el("strong", "cc-code", roomCode));
  const list = el("ul", "cc-list");
  for (const p of lobby.players) {
    const tags = [p.playerId === myId ? "bạn" : "", p.playerId === lobby.ownerId ? "chủ phòng" : "", p.connected ? "" : "mất kết nối", p.waiting ? "chờ ván sau" : ""];
    list.appendChild(el("li", p.connected ? "" : "cc-muted", [p.name, ...tags.filter(Boolean).map((t) => `(${t})`)].join(" ")));
  }
  wrap.appendChild(list);
  if (lobby.inGame) wrap.appendChild(el("p", "cc-muted", "Ván đang chơi — bạn sẽ vào từ ván sau."));
  else if (lobby.configError) wrap.appendChild(el("p", "cc-error", lobby.configError));
  const row = el("div", "cc-row");
  if (myId === lobby.ownerId && !lobby.inGame) {
    const start = button("Bắt đầu", h.onStart, "cc-btn cc-btn--primary");
    start.disabled = lobby.configError !== null;
    row.appendChild(start);
  } else if (!lobby.inGame) {
    wrap.appendChild(el("p", "cc-muted", "Chờ chủ phòng bắt đầu…"));
  }
  row.appendChild(button("Rời phòng", h.onLeave, "cc-btn cc-btn--ghost"));
  wrap.appendChild(row);
  root.replaceChildren(wrap);
}

// ---------- Bàn chơi ----------
export interface GameHandlers {
  onHand(card: Card): void;
  onTable(card: Card): void;
  onDiscard(): void;
  onNewGame(): void;
  onToLobby(): void;
  onLeave(): void;
}

function lastMoveText(v: CauCaView): string {
  const m = v.lastMove;
  if (!m) return "";
  const who = v.players.find((p) => p.id === m.playerId)?.name ?? "?";
  const played = m.playedTook.length ? `câu ${cardText(m.played)} ăn ${cardsText(m.playedTook)}` : `hạ ${cardText(m.played)}`;
  const flip = !m.flipped ? "" : m.flipTook.length ? ` · lật ${cardText(m.flipped)} ăn ${cardsText(m.flipTook)}` : ` · lật ${cardText(m.flipped)} (để lại bàn)`;
  return `${who}: ${played}${flip}`;
}

export function renderGame(root: HTMLElement, v: CauCaView, lobby: Lobby, roomCode: string, selected: Card | null, h: GameHandlers): void {
  const wrap = el("div", "cc-screen cc-game");
  const me = v.you;
  const myTurn = me !== null && v.currentSeat === me.seat && !v.over;
  const myPending = v.pending !== null && v.pending.playerId === me?.id;
  const current = v.players[v.currentSeat];

  const top = el("div", "cc-row cc-top");
  add(top, el("span", "", `Phòng ${roomCode}`), el("span", "cc-muted", `Nọc: ${v.stockCount}`), el("span", "cc-clock"));
  top.appendChild(button("Rời phòng", h.onLeave, "cc-btn cc-btn--ghost cc-btn--small"));
  wrap.appendChild(top);

  // Trạng thái lượt
  let status: string;
  if (v.over) status = "Hết ván!";
  else if (myPending) status = `Lá lật ${cardText(v.pending!.card)} ăn được nhiều lá — chọn 1 lá trên bàn.`;
  else if (v.pending) status = `${current.name} đang chọn lá cho lá lật ${cardText(v.pending.card)}…`;
  else if (myTurn) status = selected ? `Đã chọn ${cardText(selected)} — bấm lá sáng trên bàn để câu, hoặc Hạ.` : "Lượt của bạn — chọn 1 lá trên tay.";
  else status = `Lượt của ${current.name}`;
  wrap.appendChild(el("p", `cc-status ${myTurn || myPending ? "cc-status--me" : ""}`, status));
  const last = lastMoveText(v);
  if (last) wrap.appendChild(el("p", "cc-muted cc-last", last));

  // Người chơi
  const seats = el("div", "cc-seats");
  for (const p of v.players) {
    const pts = p.captured.reduce((t, c) => t + cardPoints(c, v.playerCount), 0) + p.bonus;
    const tags = [p.seat === v.firstSeat ? "đi đầu" : "", p.seat === v.lastSeat ? "đi cuối" : ""].filter(Boolean).join(", ");
    const box = el("div", `cc-seat ${p.seat === v.currentSeat && !v.over ? "cc-seat--turn" : ""}`);
    add(box, 
      el("strong", "", `${p.name}${p.id === me?.id ? " (bạn)" : ""}`),
      el("span", "cc-muted", tags),
      el("span", "", `${p.handCount} lá trên tay · ăn ${p.captured.length} lá · ${pts} điểm${p.bonus ? ` (kinh +${p.bonus})` : ""}`),
    );
    seats.appendChild(box);
  }
  wrap.appendChild(seats);

  // Lá kinh
  if (v.peek) {
    const lastName = v.players[v.lastSeat].name;
    const text = v.peek.rank === 1 ? `Lá kinh là ${cardText(v.peek)} — ${lastName} được thưởng.` : `Bạn kinh được lá ${cardText(v.peek)} (chỉ mình bạn thấy).`;
    wrap.appendChild(el("p", "cc-peek", text));
  }

  // Bàn
  wrap.appendChild(el("h2", "cc-h2", "Trên bàn"));
  const table = el("div", "cc-cards");
  const pendingTargets = myPending ? captureTargets(v.pending!.card, v.table) : [];
  for (const c of v.table) {
    const lit = myPending ? pendingTargets.some((t) => sameCard(t, c)) : myTurn && !v.pending && selected !== null && canCapture(selected, c);
    table.appendChild(cardButton(c, lit ? "cc-card--lit" : "", lit ? () => h.onTable(c) : null));
  }
  if (v.table.length === 0) table.appendChild(el("span", "cc-muted", "(trống)"));
  wrap.appendChild(table);

  // Bài tay
  if (me && !v.over) {
    wrap.appendChild(el("h2", "cc-h2", "Bài của bạn"));
    const hand = el("div", "cc-cards");
    const canAct = myTurn && !v.pending;
    for (const c of me.hand) {
      const sel = selected !== null && sameCard(selected, c);
      const can = captureTargets(c, v.table).length > 0;
      hand.appendChild(cardButton(c, `${sel ? "cc-card--sel" : ""} ${canAct && can ? "cc-card--can" : ""}`, canAct ? () => h.onHand(c) : null));
    }
    wrap.appendChild(hand);
    if (canAct) {
      const discard = button("Hạ lá đã chọn", h.onDiscard, "cc-btn");
      discard.disabled = selected === null || !canDiscard(selected, v.table);
      if (selected && !canDiscard(selected, v.table)) discard.title = "Lá này câu được — chỉ được hạ lá không câu được lá nào";
      wrap.appendChild(discard);
    }
  }

  // Kết quả
  if (v.over && v.scores) {
    wrap.appendChild(el("h2", "cc-h2", "Kết quả"));
    const tbl = el("table", "cc-scores");
    const head = el("tr");
    add(head, el("th", "", "Người chơi"), el("th", "", "Điểm"), el("th", "", "So với mốc"));
    tbl.appendChild(head);
    for (const s of v.scores) {
      const row = el("tr");
      const name = v.players.find((p) => p.id === s.playerId)?.name ?? "?";
      add(row, el("td", "", name), el("td", "", String(s.points)), el("td", s.delta >= 0 ? "cc-win" : "cc-lose", (s.delta > 0 ? "+" : "") + s.delta));
      tbl.appendChild(row);
    }
    wrap.appendChild(tbl);
    const row = el("div", "cc-row");
    if (me?.id === lobby.ownerId) row.appendChild(button("Ván mới", h.onNewGame, "cc-btn cc-btn--primary"));
    row.appendChild(button("Về phòng chờ", h.onToLobby, "cc-btn cc-btn--ghost"));
    wrap.appendChild(row);
  }
  root.replaceChildren(wrap);
}
