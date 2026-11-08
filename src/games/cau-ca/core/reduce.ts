// reduce(state, action) => state mới. Thuần: không sửa state truyền vào.
import type { Action, Card, GameState } from "./types";
import { DEAL } from "./types";
import { canCapture, captureTargets, cardPoints, isTriple, lastSeat, sameCard } from "./rules";

type Result = { state: GameState; error?: string };

const fail = (state: GameState, error: string): Result => ({ state, error });

/** Lá `by` ăn `target` (bộ ba thì ăn cả 3), cho vào chồng của người đang tới lượt. */
function take(s: GameState, by: Card, target: Card) {
  const taken = isTriple(target.rank, s.table) ? s.table.filter((t) => t.rank === target.rank) : [target];
  s.table = s.table.filter((t) => !taken.some((x) => sameCard(x, t)));
  s.players[s.currentSeat].captured.push(by, ...taken);
}

function endTurn(s: GameState) {
  s.lastDiscard = null;
  if (s.players.every((p) => p.hand.length === 0)) {
    // §1.8: hết ván — mọi lá còn trên bàn về người đi cuối.
    s.players[lastSeat(s)].captured.push(...s.table);
    s.table = [];
    s.over = true;
    return;
  }
  s.currentSeat = (s.currentSeat + 1) % s.playerCount; // thuận kim đồng hồ
}

/** Bước 2 của lượt: lật 1 lá nọc. Ăn được thì BẮT BUỘC ăn. */
function flip(s: GameState) {
  const card = s.stock.shift()!;
  // Luật 7: lá lật ăn được lá vừa hạ → bắt buộc ăn đúng lá đó.
  if (s.lastDiscard && canCapture(card, s.lastDiscard)) {
    take(s, card, s.lastDiscard);
    return endTurn(s);
  }
  const targets = captureTargets(card, s.table);
  if (targets.length === 0) {
    s.table.push(card);
    return endTurn(s);
  }
  if (targets.length === 1) {
    take(s, card, targets[0]);
    return endTurn(s);
  }
  // >1 lựa chọn → chờ người đang tới lượt chọn (§1.2).
  s.pending.push({ kind: "NEED_FLIP_TARGET", playerId: s.players[s.currentSeat].id, card });
}

export function reduce(state: GameState, action: Action): Result {
  if (state.over) return fail(state, "Ván đã kết thúc");
  const seat = state.players.findIndex((p) => p.id === action.playerId);
  if (seat !== state.currentSeat) return fail(state, "Chưa tới lượt bạn");

  const s: GameState = structuredClone(state);
  const top = s.pending[s.pending.length - 1];

  if (action.type === "PICK_FLIP_TARGET") {
    if (!top) return fail(state, "Không có lá lật nào đang chờ chọn");
    if (!captureTargets(top.card, s.table).some((t) => sameCard(t, action.target))) {
      return fail(state, "Lá lật không ăn được lá này");
    }
    s.pending.pop();
    take(s, top.card, action.target);
    endTurn(s);
    return { state: s };
  }

  if (top) return fail(state, "Hãy chọn lá cho lá vừa lật trước");
  const hand = s.players[seat].hand;
  const index = hand.findIndex((c) => sameCard(c, action.card));
  if (index < 0) return fail(state, "Bạn không có lá này");

  if (action.type === "CAPTURE") {
    const onTable = s.table.some((t) => sameCard(t, action.target));
    if (!onTable || !canCapture(action.card, action.target)) return fail(state, "Không câu được lá này");
    hand.splice(index, 1);
    take(s, action.card, action.target);
  } else {
    // Câu là tự nguyện, nhưng lá hạ phải không ăn được lá nào (§1.3).
    if (captureTargets(action.card, s.table).length > 0) {
      return fail(state, "Lá này câu được — chỉ được hạ lá không câu được lá nào");
    }
    hand.splice(index, 1);
    s.table.push(action.card);
    s.lastDiscard = action.card;
  }
  flip(s);
  return { state: s };
}

/** Kết quả cuối ván: điểm (bài câu được + thưởng kinh) và chênh lệch so với mốc. */
export function finalScores(state: GameState) {
  return state.players.map((p) => {
    const points = p.captured.reduce((sum, c) => sum + cardPoints(c, state.playerCount), 0) + p.bonus;
    return { playerId: p.id, points, delta: points - DEAL[state.playerCount].base };
  });
}
