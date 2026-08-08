// Mở rộng A Fistful of Cards — lá "The Judge" (nhóm C, sửa luật nền): cấm ĐẶT
// bài trang bị/Jail xuống trước mặt BẤT KỲ ai (kể cả chính mình), nhưng KHÔNG
// cấm DÙNG lá đã bày sẵn từ trước (Barrel vẫn draw!, lá vàng vẫn kích hoạt
// qua activateDelayedEquipment()) — điểm phân biệt với Lasso. Xem
// Luat_Bang_Mo_Rong_FistfulOfCards.txt mục "The Judge", playEquipment()/
// playJail() trong reduce.ts.
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
    activeEventId: "the_judge",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("The Judge — cấm đặt trang bị/Jail xuống sân", () => {
  it("active: tự trang bị súng (Schofield) bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["schofield_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "schofield_1" })).toThrow(/The Judge/);
  });

  it("active: đặt Barrel bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["barrel_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "barrel_1" })).toThrow(/The Judge/);
  });

  it("active: đánh Jail lên người khác bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b" })).toThrow(
      /The Judge/
    );
  });

  it("active: đặt lá vàng trì hoãn (Canteen) cũng bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["canteen_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" })).toThrow(/The Judge/);
  });

  it("không active: tự trang bị súng hoạt động bình thường", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hand: ["schofield_1"] }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "schofield_1" });
    expect(next.players[0].equipment).toEqual(["schofield_1"]);
  });
});

describe("The Judge — KHÔNG cấm dùng trang bị đã bày sẵn từ trước", () => {
  it("active: Barrel đã bày sẵn TRƯỚC khi The Judge lật vẫn draw! bình thường khi bị Bang!", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toHaveLength(2);
    expect(next.pending[1]).toEqual(
      expect.objectContaining({ kind: "NEED_DRAW_CHECK", source: { card: "barrel" }, player: "b" })
    );
  });

  it("active: kích hoạt Canteen đã bày sẵn ≥1 lượt vẫn hoạt động bình thường (hồi 1 máu)", () => {
    const state = makeState({
      turnNumber: 5,
      players: [makePlayer("a", { role: "sheriff", hp: 2, equipment: ["canteen_1"] }), makePlayer("b"), makePlayer("c")],
      equipmentPlayedTurn: { canteen_1: 1 },
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });
    expect(next.players[0].hp).toBe(3);
  });

  it("active: Dynamite rút được vào tay vẫn tự động xuống sân bình thường (không đi qua playEquipment())", () => {
    const state = makeState({
      turnPhase: "draw",
      deck: ["dynamite_1", "bang_1"],
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].equipment).toEqual(["dynamite_1"]);
    expect(next.players[0].hand).toEqual(["bang_1"]);
  });
});
