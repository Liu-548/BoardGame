// Mở rộng A Fistful of Cards — lá "Blood Brothers" (nhóm B, chạy mỗi lượt):
// TRƯỚC KHI lượt chơi thật sự bắt đầu (sau High Noon nếu có, TRƯỚC Vera
// Custer/Dynamite/Jail — xem continueTurnStartAfterVeraCuster() trong
// reduce.ts), người tới lượt có thể tặng ĐÚNG 1 máu (không được là giọt cuối)
// cho 1 người chơi bất kỳ. Bart Cassidy vẫn rút bài, El Gringo không kích
// hoạt (không có "người gây"). Xem Luat_Bang_Mo_Rong_FistfulOfCards.txt mục
// "Blood Brothers".
import { describe, expect, it } from "vitest";
import { applyTurnStartChecks, reduce } from "../src/core/reduce";
import type { GameState, PlayerState } from "../src/core/types";

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: id,
    role: "outlaw",
    hp: 3,
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
    turnNumber: 0,
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
    activeEventId: "blood_brothers",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Blood Brothers — đẩy pending đầu lượt", () => {
  it("active, hp > 1: đẩy NEED_BLOOD_BROTHERS_GIFT, CHƯA xét Dynamite/Jail", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 3, equipment: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    expect(state.pending).toEqual([{ kind: "NEED_BLOOD_BROTHERS_GIFT", player: "a" }]);
  });

  it("active, hp = 1: bỏ qua hẳn (không hỏi), xét thẳng Dynamite/Jail", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 1, equipment: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    expect(state.pending).toEqual([{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] }]);
  });

  it("không active: không đẩy gì, xét thẳng Dynamite/Jail như bình thường", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hp: 3, equipment: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    expect(state.pending).toEqual([{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] }]);
  });
});

describe("Blood Brothers — trả lời RESPOND", () => {
  it("tặng cho 1 người: donor -1 máu, người nhận +1 máu, sự kiện riêng BLOOD_BROTHERS_GIFT", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 3 }), makePlayer("b", { hp: 2 }), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });
    expect(next.players[0].hp).toBe(2);
    expect(next.players[1].hp).toBe(3);
    expect(events).toContainEqual({ type: "BLOOD_BROTHERS_GIFT", playerId: "a", targetId: "b" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DAMAGE_DEALT" }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "HP_RESTORED" }));
    // Đã xử lý xong -> tiếp tục nốt Bước 0 (không còn Dynamite/Jail ở đây nên pending rỗng).
    expect(next.pending).toEqual([]);
  });

  it("bỏ qua (không kèm targetId): không đổi máu ai, vẫn tiếp tục Dynamite/Jail", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 3, equipment: ["jail_1"] }), makePlayer("b", { hp: 2 }), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hp).toBe(3);
    expect(next.players[1].hp).toBe(2);
    expect(next.pending).toEqual([{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] }]);
  });

  it("người nhận đã đầy máu: bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 3 }), makePlayer("b", { hp: 4, maxHp: 4 }), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    expect(() => reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" })).toThrow(/đầy máu/);
  });

  it("Bart Cassidy nhận blood gift (mất máu) vẫn rút bài (onLoseLife)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 3, characterId: "bart_cassidy" }),
        makePlayer("b", { hp: 2 }),
        makePlayer("c"),
      ],
      deck: ["bang_1"],
    });
    applyTurnStartChecks(state);
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });
    expect(next.players[0].hand).toEqual(["bang_1"]); // Bart Cassidy rút bài vì mất máu
  });
});
