// viewFor: state đã lọc gửi cho 1 người. Ẩn bài tay người khác, nọc, và lá kinh.
import type { Card, GameState, Pending } from "./types";
import { lastSeat } from "./rules";
import { finalScores } from "./reduce";

export interface ViewPlayer {
  id: string;
  name: string;
  seat: number;
  handCount: number;
  captured: Card[]; // chồng ăn công khai — để mọi người tự tính điểm
  bonus: number;
}

export interface CauCaView {
  playerCount: 3 | 4;
  you: { id: string; seat: number; hand: Card[] } | null; // null = người xem
  players: ViewPlayer[];
  table: Card[];
  stockCount: number;
  firstSeat: number;
  lastSeat: number;
  currentSeat: number;
  pending: Pending | null;
  peek: Card | null; // chỉ người đi cuối thấy, trừ khi là A (cả bàn thấy)
  over: boolean;
  scores: ReturnType<typeof finalScores> | null;
}

export function viewFor(state: GameState, playerId: string): CauCaView {
  const me = state.players.find((p) => p.id === playerId);
  const last = lastSeat(state);
  const showPeek = state.peek.rank === 1 || me?.seat === last;
  return {
    playerCount: state.playerCount,
    you: me ? { id: me.id, seat: me.seat, hand: me.hand } : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      handCount: p.hand.length,
      captured: p.captured,
      bonus: p.bonus,
    })),
    table: state.table,
    stockCount: state.stock.length,
    firstSeat: state.firstSeat,
    lastSeat: last,
    currentSeat: state.currentSeat,
    pending: state.pending[state.pending.length - 1] ?? null,
    peek: showPeek ? state.peek : null,
    over: state.over,
    scores: state.over ? finalScores(state) : null,
  };
}
