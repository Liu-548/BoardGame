// Mở rộng High Noon — lá "The Reverend" (nhóm C, sửa luật nền): cấm đánh lá
// Beer trong vòng này, CẢ trong lẫn ngoài lượt — *dev đã chốt CÓ chặn luôn cơ
// chế "Bia hồi sinh tự động" (eliminateIfDead()). Xem
// Luat_Bang_Mo_Rong_HighNoon.txt mục 2, playBeer()/eliminateIfDead() trong
// reduce.ts.
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
    activeEventId: "the_reverend",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("The Reverend — cấm đánh Beer cả trong lẫn ngoài lượt", () => {
  it("active: tự đánh Beer bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 2, hand: ["beer_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" })).toThrow(/The Reverend/);
  });

  it("không active: tự đánh Beer vẫn hoạt động bình thường", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hp: 2, hand: ["beer_1"] }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });
    expect(next.players[0].hp).toBe(3);
  });

  it("active: mất máu tới 0 vì Bang! KHÔNG được Bia cứu, chết thật (không có BEER_SAVED_FROM_DEATH)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "outlaw", hp: 1, hand: ["beer_1"] }),
        makePlayer("b", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
    });
    const afterBang = reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "bang_1", targetId: "a" });
    const { state: next, events } = reduce(afterBang.state, { type: "RESPOND", playerId: "a" }); // chịu mất máu, không đỡ

    expect(next.players[0].alive).toBe(false);
    expect(next.players[0].hand).toEqual([]); // Bia đã theo người chết vào chồng bỏ, không được dùng
    expect(events).not.toContainEqual(expect.objectContaining({ type: "BEER_SAVED_FROM_DEATH" }));
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "a", killedBy: "b" });
  });
});
