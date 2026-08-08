// Mở rộng A Fistful of Cards — lá "Hard Liquor" (nhóm C, sửa luật nền):
// trong lượt của mình, CÓ THỂ bỏ qua pha rút bài để hồi 1 máu (chọn 1 trong
// 2, không được cả hai). Hỏi TRƯỚC các nhân vật override onDrawPhase. Xem
// Luat_Bang_Mo_Rong_FistfulOfCards.txt mục "Hard Liquor",
// continueDrawCardsAfterHardLiquor()/respondToPickHardLiquor() trong reduce.ts.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState, PlayerState } from "../src/core/types";

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: id,
    role: "outlaw",
    hp: 2,
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
    deck: ["bang_1", "bang_2"],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "draw",
    rngState: 1,
    winner: null,
    bangCountThisTurn: 0,
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
    activeEventId: "hard_liquor",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Hard Liquor — đẩy pending đầu pha rút", () => {
  it("active: DRAW_CARDS đẩy NEED_PICK_HARD_LIQUOR, chưa rút gì", () => {
    const state = makeState();
    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.pending).toEqual([{ kind: "NEED_PICK_HARD_LIQUOR", player: "a" }]);
    expect(next.turnPhase).toBe("draw");
    expect(next.players[0].hand).toEqual([]);
    expect(events).toEqual([]);
  });

  it("không active: DRAW_CARDS rút bài bình thường, không đẩy pending", () => {
    const state = makeState({ activeEventId: null });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.pending).toEqual([]);
    expect(next.turnPhase).toBe("play");
    expect(next.players[0].hand).toEqual(["bang_2", "bang_1"]);
  });
});

describe("Hard Liquor — chọn hồi máu thay vì rút bài", () => {
  it("skipDrawForHardLiquor: true -> hồi 1 máu, KHÔNG rút bài, chuyển thẳng play", () => {
    const state = makeState();
    const { state: afterAsk } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(afterAsk, {
      type: "RESPOND",
      playerId: "a",
      skipDrawForHardLiquor: true,
    });
    expect(next.players[0].hp).toBe(3);
    expect(next.players[0].hand).toEqual([]);
    expect(next.turnPhase).toBe("play");
    expect(events).toEqual([{ type: "HP_RESTORED", playerId: "a", amount: 1 }]);
  });

  it("đã đầy máu: vẫn cho chọn, hồi 0 (không lỗi, không event HP_RESTORED)", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
    });
    const { state: afterAsk } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(afterAsk, {
      type: "RESPOND",
      playerId: "a",
      skipDrawForHardLiquor: true,
    });
    expect(next.players[0].hp).toBe(4);
    expect(next.turnPhase).toBe("play");
    expect(events).toEqual([]);
  });
});

describe("Hard Liquor — chọn rút bài như bình thường", () => {
  it("không kèm skipDrawForHardLiquor: rút 2 lá bình thường, không hồi máu", () => {
    const state = makeState();
    const { state: afterAsk } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(afterAsk, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hp).toBe(2);
    expect(next.players[0].hand).toEqual(["bang_2", "bang_1"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toEqual([{ type: "CARDS_DRAWN", playerId: "a", count: 2 }]);
  });

  it("chọn rút bài thường: nhân vật override onDrawPhase (Jesse Jones) vẫn được hỏi tiếp SAU", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", characterId: "jesse_jones" }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: afterAsk } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next } = reduce(afterAsk, { type: "RESPOND", playerId: "a" });
    expect(next.pending).toEqual([{ kind: "NEED_PICK_DRAW_TARGET", player: "a" }]);
  });
});
