// Tạo ván mới. Thứ tự đầu ván (§3): random người đi đầu → chia → lật bàn
// → kinh bài → luật 5 tứ quý.
import { nextRandom, shuffle } from "../../bang/core/rng";
import type { Card, GameState, PlayerState, Suit } from "./types";
import { DEAL, SAME_ONLY_RANKS } from "./types";
import { lastSeat, peekBonus } from "./rules";

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ["h", "d", "s", "c"] as Suit[]) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  }
  return deck;
}

/** `players` theo đúng thứ tự ngồi thuận kim đồng hồ. Trả null nếu không phải 3–4 người. */
export function setupGame(players: { id: string; name: string }[], seed: number): GameState | null {
  const playerCount = players.length;
  if (playerCount !== 3 && playerCount !== 4) return null; // §1.1: chỉ 3 hoặc 4 người
  const deal = DEAL[playerCount];

  const shuffled = shuffle(fullDeck(), seed);
  const deck = shuffled.result;
  const firstPick = nextRandom(shuffled.nextState);
  const peekPick = nextRandom(firstPick.nextState);

  const playerStates: PlayerState[] = players.map((p, seat) => ({
    id: p.id,
    name: p.name,
    seat,
    hand: deck.splice(0, deal.hand),
    captured: [],
    bonus: 0,
  }));
  const table = deck.splice(0, deal.table);
  const firstSeat = Math.floor(firstPick.value * playerCount);

  // Lá kinh chọn trong cả 52 lá, vẫn nằm nguyên chỗ cũ (§1.6).
  const allCards = [...playerStates.flatMap((p) => p.hand), ...table, ...deck];
  const peek = allCards[Math.floor(peekPick.value * allCards.length)];

  const state: GameState = {
    playerCount,
    players: playerStates,
    table,
    stock: deck,
    firstSeat,
    currentSeat: firstSeat,
    pending: [],
    lastDiscard: null,
    lastMove: null,
    peek,
    over: false,
  };

  const last = state.players[lastSeat(state)];
  last.bonus = peekBonus(peek);

  // Luật 5: đủ 4 lá cùng hạng 5/10/J/Q/K trên bàn → người đi cuối hưởng.
  for (const rank of SAME_ONLY_RANKS) {
    const four = state.table.filter((c) => c.rank === rank);
    if (four.length === 4) {
      last.captured.push(...four);
      state.table = state.table.filter((c) => c.rank !== rank);
    }
  }
  return state;
}
