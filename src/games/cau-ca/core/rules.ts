// Các hàm luật nhỏ, dùng chung cho setup/reduce/view/client.
import type { Card, GameState } from "./types";
import { SAME_ONLY_RANKS } from "./types";

export const isRed = (c: Card) => c.suit === "h" || c.suit === "d";
export const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

/** §1.2: A–9 cộng đúng 10; 10/J/Q/K chỉ ăn cùng hạng. Không xét chất. */
export const canCapture = (a: Card, b: Card) =>
  a.rank >= 10 || b.rank >= 10 ? a.rank === b.rank : a.rank + b.rank === 10;

/** Người đi cuối = người ngồi ngay trước người đi đầu (thuận kim đồng hồ). */
export const lastSeat = (s: GameState) => (s.firstSeat - 1 + s.playerCount) % s.playerCount;

/** Bàn có đúng 3 lá cùng hạng 5/10/J/Q/K (chỉ xảy ra lúc chia — §1.5). */
export const isTriple = (rank: number, table: Card[]) =>
  SAME_ONLY_RANKS.includes(rank) && table.filter((t) => t.rank === rank).length === 3;

/** Các lựa chọn ăn của lá `c`. Bộ ba gộp thành 1 lựa chọn (ăn cả 3). */
export function captureTargets(c: Card, table: Card[]): Card[] {
  const targets = table.filter((t) => canCapture(c, t));
  return targets.length > 0 && isTriple(targets[0].rank, table) ? [targets[0]] : targets;
}

/** §1.3: chỉ được hạ lá KHÔNG ăn được lá nào trên bàn. */
export const canDiscard = (c: Card, table: Card[]) => captureTargets(c, table).length === 0;

/** §1.7: điểm khi ĂN được lá. A đen chỉ 5 điểm khi chơi 4 người. */
export function cardPoints(c: Card, playerCount: 3 | 4): number {
  if (c.rank === 1) return isRed(c) ? 20 : playerCount === 4 ? 5 : 0;
  if (!isRed(c)) return 0;
  return c.rank <= 8 ? c.rank : 10;
}

/** §1.6: thưởng kinh bài — A đen luôn 5, kể cả chơi 3 người. */
export const peekBonus = (c: Card) => (c.rank !== 1 ? 0 : isRed(c) ? 20 : 5);
