// Mở rộng High Noon — lá "Shootout" (nhóm C, sửa luật nền): mỗi người được
// đánh 2 lá Bang!/lượt (thay vì 1). Volcanic/Willy the Kid vẫn bỏ qua giới
// hạn hoàn toàn. Xem Luat_Bang_Mo_Rong_HighNoon.txt mục 2, playBang() trong
// reduce.ts (bangCountThisTurn).
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
    players: [makePlayer("a", { role: "sheriff" }), makePlayer("b")],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
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
    activeEventId: "shootout",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Shootout — 2 lá Bang!/lượt thay vì 1", () => {
  it("active: đánh lá Bang! THỨ 2 trong lượt vẫn được, không cần Volcanic", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_2", "bang_3"] }), makePlayer("b")],
    });
    const afterFirst = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "b" });
    expect(afterFirst.state.bangCountThisTurn).toBe(1);

    const stateAfterMiss = { ...afterFirst.state, pending: [] as GameState["pending"] };
    const { state: next } = reduce(stateAfterMiss, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_3",
      targetId: "b",
    });
    expect(next.bangCountThisTurn).toBe(2);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("active: đánh lá Bang! THỨ 3 vẫn bị chặn (không phải vô hạn)", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_3"] }), makePlayer("b")],
      bangCountThisTurn: 2,
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_3", targetId: "b" })
    ).toThrow();
  });

  it("không active: đánh lá Bang! THỨ 2 vẫn bị chặn như luật gốc", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_2"] }), makePlayer("b")],
      bangCountThisTurn: 1,
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "b" })
    ).toThrow();
  });

  it("active + Volcanic: vẫn bỏ qua giới hạn hoàn toàn (đánh lá thứ 3 vẫn được)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_3"], equipment: ["volcanic_1"] }),
        makePlayer("b"),
      ],
      bangCountThisTurn: 2,
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_3", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });
});
