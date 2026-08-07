// Mở rộng High Noon — lá "The Doctor" (nhóm A, chạy 1 lần lúc lật): người ÍT
// MÁU NHẤT (trong số còn sống) +1 máu; bằng nhau thì MỖI NGƯỜI +1. Xem
// Luat_Bang_Mo_Rong_HighNoon.txt mục 2, applyTheDoctorEffect() trong reduce.ts.
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
    currentPlayerIndex: 2, // "c" vừa xong lượt -> quay về "a" (chủ trò)
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangUsedThisTurn: false,
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
    eventDeck: ["high_noon", "the_doctor"], // "the_doctor" = lá kế tiếp
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("The Doctor — hồi 1 máu người ít máu nhất lúc lật", () => {
  it("1 người ít máu nhất duy nhất: chỉ người đó +1 máu", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, maxHp: 5 }),
        makePlayer("b", { hp: 1, maxHp: 4 }),
        makePlayer("c", { hp: 3, maxHp: 4 }),
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.activeEventId).toBe("the_doctor");
    expect(next.players[1].hp).toBe(2); // "b" ít máu nhất -> +1
    expect(next.players[0].hp).toBe(4); // không đổi
    expect(next.players[2].hp).toBe(3); // không đổi
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "b", amount: 1 });
    expect(events.filter((e) => e.type === "HP_RESTORED").length).toBe(1);
  });

  it("nhiều người bằng máu nhau (ít nhất): MỖI NGƯỜI +1", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 2, maxHp: 5 }),
        makePlayer("b", { hp: 2, maxHp: 4 }),
        makePlayer("c", { hp: 3, maxHp: 4 }),
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.players[0].hp).toBe(3);
    expect(next.players[1].hp).toBe(3);
    expect(next.players[2].hp).toBe(3); // không phải người ít máu nhất, không đổi
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 1 });
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "b", amount: 1 });
    expect(events.filter((e) => e.type === "HP_RESTORED").length).toBe(2);
  });

  it("người đã chết (alive=false) KHÔNG được tính vào so máu/hồi máu", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, maxHp: 4 }),
        makePlayer("b", { hp: 0, maxHp: 4, alive: false }), // đã chết, máu 0 nhưng KHÔNG phải "ít nhất"
        makePlayer("c", { hp: 3, maxHp: 4 }),
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.players[1].hp).toBe(0); // người chết không được hồi
    expect(next.players[2].hp).toBe(4); // "c" là người còn sống ít máu nhất -> +1
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "c", amount: 1 });
    expect(events).not.toContainEqual(expect.objectContaining({ playerId: "b" }));
  });

  it("mọi người còn sống đều đã đầy máu: không hồi gì, không bắn event", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, maxHp: 4 }),
        makePlayer("b", { hp: 4, maxHp: 4 }),
        makePlayer("c", { hp: 4, maxHp: 4 }),
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.players.map((p) => p.hp)).toEqual([4, 4, 4]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "HP_RESTORED" }));
  });
});
