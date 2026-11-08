import { describe, expect, it } from "vitest";
import { setupGame } from "../../src/games/cau-ca/core/setup";
import { reduce, finalScores } from "../../src/games/cau-ca/core/reduce";
import { viewFor } from "../../src/games/cau-ca/core/view";
import { captureTargets, canDiscard, cardPoints, lastSeat } from "../../src/games/cau-ca/core/rules";
import type { Card, GameState } from "../../src/games/cau-ca/core/types";

const C = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });
const mkPlayers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

/** Ván dựng tay: 3 người, p0 đi đầu (người đi cuối = p2). */
function mkState(over: Partial<GameState> = {}): GameState {
  return {
    playerCount: 3,
    players: [
      { id: "p0", name: "P0", seat: 0, hand: [C(8, "s"), C(3, "h")], captured: [], bonus: 0 },
      { id: "p1", name: "P1", seat: 1, hand: [C(4, "c")], captured: [], bonus: 0 },
      { id: "p2", name: "P2", seat: 2, hand: [C(6, "c")], captured: [], bonus: 0 },
    ],
    table: [C(8, "h"), C(7, "d")],
    stock: [C(2, "c"), C(9, "c"), C(9, "d")],
    firstSeat: 0,
    currentSeat: 0,
    pending: [],
    lastDiscard: null,
    peek: C(2, "s"),
    over: false,
    ...over,
  };
}

describe("Câu cá — chia bài", () => {
  it("chỉ 3 hoặc 4 người", () => {
    expect(setupGame(mkPlayers(2), 1)).toBeNull();
    expect(setupGame(mkPlayers(5), 1)).toBeNull();
  });
  it("3 người: 7 lá/người, bàn 10, nọc 21; 4 người: 5 lá, bàn 12, nọc 20", () => {
    const s3 = setupGame(mkPlayers(3), 7)!;
    expect(s3.players.map((p) => p.hand.length)).toEqual([7, 7, 7]);
    expect(s3.table.length + s3.players.reduce((t, p) => t + p.captured.length, 0)).toBe(10);
    expect(s3.stock.length).toBe(21);
    const s4 = setupGame(mkPlayers(4), 7)!;
    expect(s4.players.map((p) => p.hand.length)).toEqual([5, 5, 5, 5]);
    expect(s4.stock.length).toBe(20);
  });
  it("cùng seed → cùng ván", () => {
    expect(setupGame(mkPlayers(4), 42)).toEqual(setupGame(mkPlayers(4), 42));
  });
});

describe("Câu cá — luật ăn", () => {
  it("cộng 10 / cùng hạng 10–K, không xét chất", () => {
    expect(captureTargets(C(3, "s"), [C(7, "h"), C(3, "d")])).toEqual([C(7, "h")]);
    expect(captureTargets(C(12, "s"), [C(12, "h"), C(2, "d")])).toEqual([C(12, "h")]);
    expect(captureTargets(C(10, "s"), [C(10, "c")])).toEqual([C(10, "c")]);
  });
  it("chỉ được hạ lá không câu được lá nào", () => {
    expect(canDiscard(C(3, "h"), [C(7, "d")])).toBe(false);
    const r = reduce(mkState(), { type: "DISCARD", playerId: "p0", card: C(3, "h") });
    expect(r.error).toBeDefined();
  });
  it("sai lượt bị chặn", () => {
    expect(reduce(mkState(), { type: "DISCARD", playerId: "p1", card: C(4, "c") }).error).toBeDefined();
  });
  it("luật 7: hạ 8♠, lật 2♣ → bắt buộc ăn 8♠ dù bàn có 8♥", () => {
    const { state } = reduce(mkState(), { type: "DISCARD", playerId: "p0", card: C(8, "s") });
    expect(state.players[0].captured).toEqual([C(2, "c"), C(8, "s")]);
    expect(state.table).toEqual([C(8, "h"), C(7, "d")]);
    expect(state.currentSeat).toBe(1);
  });
  it("lá lật có 2 lựa chọn → chờ người chơi chọn", () => {
    const start = mkState({ table: [C(1, "h"), C(1, "s"), C(7, "c")], stock: [C(9, "c")] });
    let { state } = reduce(start, { type: "CAPTURE", playerId: "p0", card: C(3, "h"), target: C(7, "c") });
    expect(state.pending).toEqual([{ kind: "NEED_FLIP_TARGET", playerId: "p0", card: C(9, "c") }]);
    expect(reduce(state, { type: "DISCARD", playerId: "p0", card: C(8, "s") }).error).toBeDefined();
    ({ state } = reduce(state, { type: "PICK_FLIP_TARGET", playerId: "p0", target: C(1, "h") }));
    expect(state.table).toEqual([C(1, "s")]);
    expect(state.currentSeat).toBe(1);
  });
  it("bộ ba lúc chia: lá thứ 4 ăn cả 3", () => {
    const start = mkState({ table: [C(12, "h"), C(12, "s"), C(12, "d")], stock: [C(2, "c")] });
    start.players[0].hand = [C(12, "c")];
    const { state } = reduce(start, { type: "CAPTURE", playerId: "p0", card: C(12, "c"), target: C(12, "s") });
    expect(state.players[0].captured).toHaveLength(4);
  });
  it("reduce không sửa state truyền vào", () => {
    const start = mkState();
    const copy = structuredClone(start);
    reduce(start, { type: "DISCARD", playerId: "p0", card: C(8, "s") });
    expect(start).toEqual(copy);
  });
});

describe("Câu cá — điểm & kinh bài", () => {
  it("A đen: ăn khi 3 người = 0, 4 người = 5", () => {
    expect(cardPoints(C(1, "s"), 3)).toBe(0);
    expect(cardPoints(C(1, "c"), 4)).toBe(5);
    expect(cardPoints(C(9, "h"), 3)).toBe(10);
    expect(cardPoints(C(7, "d"), 3)).toBe(7);
  });
  it("lá kinh: chỉ người đi cuối thấy, trừ khi là A; bài tay người khác bị ẩn", () => {
    const s = mkState(); // người đi cuối = p2
    expect(viewFor(s, "p0").peek).toBeNull();
    expect(viewFor(s, "p2").peek).toEqual(C(2, "s"));
    expect(viewFor(s, "p0").players[2]).not.toHaveProperty("hand");
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain('"stock"');
    expect(viewFor({ ...s, peek: C(1, "d") }, "p0").peek).toEqual(C(1, "d"));
  });
});

describe("Câu cá — bot chơi ngẫu nhiên đến hết ván", () => {
  for (const n of [3, 4]) {
    it(`${n} người: không kẹt, mọi lá về tay ai đó, tổng = 0 trừ thưởng kinh`, () => {
      for (let seed = 1; seed <= 500; seed++) {
        let s = setupGame(mkPlayers(n), seed)!;
        let pick = seed;
        while (!s.over) {
          const p = s.players[s.currentSeat];
          const top = s.pending[s.pending.length - 1];
          const r = top
            ? reduce(s, { type: "PICK_FLIP_TARGET", playerId: p.id, target: captureTargets(top.card, s.table)[0] })
            : (() => {
                const caps = p.hand.flatMap((c) => captureTargets(c, s.table).map((t) => ({ c, t })));
                const dis = p.hand.filter((c) => canDiscard(c, s.table));
                pick = (pick * 31 + 7) % 101;
                return dis.length && (pick < 30 || !caps.length)
                  ? reduce(s, { type: "DISCARD", playerId: p.id, card: dis[0] })
                  : reduce(s, { type: "CAPTURE", playerId: p.id, card: caps[0].c, target: caps[0].t });
              })();
          expect(r.error).toBeUndefined();
          s = r.state;
        }
        expect(s.players.reduce((t, p) => t + p.captured.length, 0)).toBe(52);
        expect(s.currentSeat).toBe(lastSeat(s));
        const bonus = s.players.reduce((t, p) => t + p.bonus, 0);
        expect(finalScores(s).reduce((t, x) => t + x.delta, 0)).toBe(bonus);
      }
    });
  }
});
