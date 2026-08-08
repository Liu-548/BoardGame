// Mở rộng High Noon — lá "Gold Rush" (nhóm C, sửa luật nền): CHỈ thứ tự LƯỢT
// bị đảo ngược chiều kim đồng hồ. Hiệu ứng lá bài (Indians!/Gatling/Brawl,
// General Store) VẪN đi chiều gốc. Xem Luat_Bang_Mo_Rong_HighNoon.txt mục 2,
// nextTurnPlayerIndex()/nextSeatIndex() trong reduce.ts.
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
    players: [
      makePlayer("a", { role: "sheriff" }),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
    ],
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
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    eventDeck: [],
    activeEventId: "gold_rush",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Gold Rush — đảo chiều LƯỢT, giữ nguyên chiều hiệu ứng lá bài", () => {
  it("không active: kết thúc lượt đi chiều gốc a->b->c->d", () => {
    const state = makeState({ activeEventId: null, currentPlayerIndex: 0 });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(next.currentPlayerIndex).toBe(1); // "b"
  });

  it("active: kết thúc lượt đi NGƯỢC chiều a->d->c->b", () => {
    const state = makeState({ currentPlayerIndex: 0 });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(next.currentPlayerIndex).toBe(3); // "d", KHÔNG phải "b"
  });

  it("active: bỏ qua người đã chết, vẫn đúng chiều ngược", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b"),
        makePlayer("c", { alive: false, hp: 0 }),
        makePlayer("d"),
      ],
      currentPlayerIndex: 0,
    });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(next.currentPlayerIndex).toBe(3); // "d" (bỏ qua "c" đã chết)
  });

  it("active: Indians! vẫn nhắm mục tiêu theo CHIỀU GỐC (a->b->c->d), không đảo", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["indians_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      currentPlayerIndex: 0,
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1" });
    // pending là stack (xử lý phần tử CUỐI trước) -> đẩy theo thứ tự NGƯỢC với
    // thứ tự muốn xử lý -> phần tử cuối cùng phải là người ĐẦU TIÊN theo chiều
    // gốc (b), phần tử đầu là người CUỐI CÙNG theo chiều gốc (d).
    expect(next.pending.map((p) => p.player)).toEqual(["d", "c", "b"]);
  });
});
