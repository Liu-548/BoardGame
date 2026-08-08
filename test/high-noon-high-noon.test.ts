// Mở rộng High Noon — lá "High Noon" (nhóm B, chạy MỖI ĐẦU LƯỢT, LÁ CUỐI):
// người TỚI LƯỢT mất 1 máu VÔ ĐIỀU KIỆN, TRƯỚC CẢ Marcel companion/Vera
// Custer/Dynamite/Jail. Xem Luat_Bang_Mo_Rong_HighNoon.txt mục 2 (High Noon),
// applyTurnStartChecks() trong reduce.ts.
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
    eventDeck: [], // "high_noon" đã lật từ trước (lá cuối, không lật lại)
    activeEventId: "high_noon",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("High Noon — mất 1 máu vô điều kiện đầu lượt", () => {
  it("người tới lượt mất đúng 1 máu", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4 }), makePlayer("b"), makePlayer("c")],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.currentPlayerIndex).toBe(0); // sang "a"
    expect(next.players[0].hp).toBe(3);
    expect(events).toContainEqual({ type: "DAMAGE_DEALT", playerId: "a", amount: 1 });
  });

  it("không active thì không mất máu gì", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hp: 4 }), makePlayer("b"), makePlayer("c")],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.players[0].hp).toBe(4);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DAMAGE_DEALT" }));
  });

  it("áp dụng TRƯỚC Dynamite: mất máu High Noon rồi mới push draw-check Dynamite", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, equipment: ["dynamite_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.players[0].hp).toBe(3); // High Noon đã trừ trước
    expect(events).toContainEqual({ type: "DAMAGE_DEALT", playerId: "a", amount: 1 });
    expect(next.pending).toEqual([
      {
        kind: "NEED_DRAW_CHECK",
        player: "a",
        source: { card: "dynamite" },
        matchSuits: ["spades"],
        matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
      },
    ]);
  });

  it("người bị Marcel companion bỏ qua HẲN lượt vẫn mất máu High Noon", () => {
    // Dựng đúng tình huống: "c" sắp tới lượt và bị đánh dấu bỏ qua vì Marcel.
    const stateForC = makeState({
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c", { hp: 4 })],
      currentPlayerIndex: 1, // "b" đang chơi, kết thúc lượt sẽ sang "c"
      marcelCompanionSkipNextTurn: { c: true },
    });

    const { state: next, events } = reduce(stateForC, { type: "END_TURN", playerId: "b" });

    expect(next.players[2].hp).toBe(3); // "c" vẫn mất máu dù bị bỏ qua lượt
    const damageIndex = events.findIndex((e) => e.type === "DAMAGE_DEALT" && e.playerId === "c");
    const skipIndex = events.findIndex((e) => e.type === "MARCEL_COMPANION_TURN_SKIPPED");
    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(skipIndex).toBeGreaterThan(damageIndex); // High Noon chạy TRƯỚC
  });

  it("mất máu cuối cùng -> chết ngay đầu lượt, tự chuyển sang người kế tiếp", () => {
    // "a" là outlaw (không phải sheriff) để "a" chết không kết thúc ván ngay
    // (tránh lẫn logic checkWinCondition vào phép thử cascade lượt).
    const state = makeState({
      players: [makePlayer("a", { role: "outlaw", hp: 1 }), makePlayer("b", { role: "sheriff" }), makePlayer("c")],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.players[0].alive).toBe(false);
    expect(next.winner).toBeNull();
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "a", killedBy: null });
    // "a" chết ngay đầu lượt của chính mình -> lượt chuyển tiếp cho "b"
    expect(next.currentPlayerIndex).toBe(1);
  });
});
