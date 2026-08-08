// Mở rộng A Fistful of Cards — lá "Vendetta" (nhóm B, chạy mỗi lượt): SAU KHI
// kết thúc lượt của mình, rút 1 lá; ra Cơ thì chơi thêm ĐÚNG 1 LƯỢT NỮA NHƯ
// BÌNH THƯỜNG (rút, đánh, bỏ bài dư) — currentPlayerIndex GIỮ NGUYÊN, không
// lật lại lá sự kiện. Xem Luat_Bang_Mo_Rong_FistfulOfCards.txt mục
// "Vendetta", finishTurn()/resolveDrawCheck() trong reduce.ts.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState, PlayerState } from "../src/core/types";

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: id,
    role: "outlaw",
    hp: 4,
    maxHp: 4,
    hand: [],
    equipment: [],
    alive: true,
    characterId: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangCountThisTurn: 1,
    characterSelection: null,
    turnNumber: 1,
    equipmentPlayedTurn: {},
    joseDelgadoUsesThisTurn: 0,
    docHolydayUsedThisTurn: false,
    vendettaUsedThisTurn: false,
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    eventDeck: [],
    activeEventId: "vendetta",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Vendetta — END_TURN đẩy draw! thay vì chuyển lượt ngay", () => {
  it("active: END_TURN đẩy NEED_DRAW_CHECK source vendetta, currentPlayerIndex CHƯA đổi", () => {
    const state = makeState({ players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")] });
    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "vendetta" }, matchSuits: ["hearts"] },
    ]);
    expect(next.currentPlayerIndex).toBe(0);
    expect(events).toContainEqual({ type: "TURN_ENDED", playerId: "a" });
  });

  it("không active: END_TURN chuyển lượt bình thường như trước giờ", () => {
    const state = makeState({ activeEventId: null });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(next.pending).toEqual([]);
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe("Vendetta — ra Cơ: chơi thêm ĐÚNG 1 lượt nữa cho CHÍNH mình", () => {
  it("ra Cơ: currentPlayerIndex giữ nguyên, turnNumber +1, turnPhase về draw, reset các cờ trong lượt", () => {
    const state = makeState({
      deck: ["bang_2"], // hearts,"2" -> chất Cơ, xem CARD_SUIT_RANKS
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    const { state: afterDraw } = reduce(next, { type: "RESPOND", playerId: "a" });
    expect(afterDraw.currentPlayerIndex).toBe(0); // vẫn là "a"
    expect(afterDraw.turnNumber).toBe(2);
    expect(afterDraw.turnPhase).toBe("draw");
    expect(afterDraw.bangCountThisTurn).toBe(0);
    expect(afterDraw.vendettaUsedThisTurn).toBe(true);
    expect(afterDraw.pending).toEqual([]);
  });

  it("lượt thêm KHÔNG draw! Vendetta lần nữa dù vẫn đang chạy (chặn dây chuyền)", () => {
    const state = makeState({
      deck: ["bang_2", "bang_3", "bang_4"], // cả 3 đều chất Cơ
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: afterEnd1 } = reduce(state, { type: "END_TURN", playerId: "a" });
    const { state: afterDraw1 } = reduce(afterEnd1, { type: "RESPOND", playerId: "a" });
    // Lượt thêm: rút bài (turnPhase draw -> play) rồi END_TURN lần nữa ->
    // phải chuyển lượt bình thường (không đẩy thêm draw! Vendetta), vì
    // vendettaUsedThisTurn=true.
    const { state: afterDrawCards } = reduce(afterDraw1, { type: "DRAW_CARDS", playerId: "a" });
    const { state: afterEnd2 } = reduce(afterDrawCards, { type: "END_TURN", playerId: "a" });
    expect(afterEnd2.pending).toEqual([]);
    expect(afterEnd2.currentPlayerIndex).toBe(1); // chuyển hẳn sang "b"
    expect(afterEnd2.vendettaUsedThisTurn).toBe(false); // đã reset ở advanceTurn()
  });

  it("KHÔNG lật lại lá sự kiện trong lượt thêm của chính chủ trò", () => {
    const state = makeState({
      deck: ["bang_2"],
      eventDeck: ["a_fistful_of_cards", "hard_liquor"], // còn lá kế tiếp chờ lật
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    const { state: afterDraw, events } = reduce(next, { type: "RESPOND", playerId: "a" });
    expect(afterDraw.activeEventId).toBe("vendetta"); // KHÔNG bị lật đè bởi hard_liquor
    expect(afterDraw.eventDeck).toEqual(["a_fistful_of_cards", "hard_liquor"]); // chưa rút bớt
    expect(events).not.toContainEqual(expect.objectContaining({ type: "EVENT_REVEALED" }));
  });

  it("ra ĐEN: chuyển lượt bình thường sang người kế tiếp", () => {
    const state = makeState({
      deck: ["bang_23"], // clubs,"Q" -> chất đen
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    const { state: afterDraw } = reduce(next, { type: "RESPOND", playerId: "a" });
    expect(afterDraw.currentPlayerIndex).toBe(1);
    expect(afterDraw.pending).toEqual([]);
  });

  it("vẫn xét Dynamite/Jail của CHÍNH mình trong lượt thêm", () => {
    const state = makeState({
      deck: ["bang_2"],
      players: [
        makePlayer("a", { role: "sheriff", equipment: ["jail_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    const { state: afterDraw } = reduce(next, { type: "RESPOND", playerId: "a" });
    expect(afterDraw.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] },
    ]);
  });
});

describe("Vendetta — kết hợp với pha bỏ bài dư cuối lượt", () => {
  it("phải bỏ bài dư trước, rồi mới đẩy draw! Vendetta", () => {
    const state = makeState({
      turnPhase: "play",
      players: [
        makePlayer("a", { role: "sheriff", hp: 2, maxHp: 4, hand: ["bang_1", "bang_2", "bang_3"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    const { state: afterEnd } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(afterEnd.turnPhase).toBe("discard");
    expect(afterEnd.pending).toEqual([]); // chưa đẩy gì, còn phải bỏ bài dư trước
    const { state: afterDiscard } = reduce(afterEnd, {
      type: "DISCARD_CARDS",
      playerId: "a",
      cardIds: ["bang_3"],
    });
    expect(afterDiscard.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "vendetta" }, matchSuits: ["hearts"] },
    ]);
  });
});
