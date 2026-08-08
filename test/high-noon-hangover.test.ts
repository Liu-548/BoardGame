// Mở rộng High Noon — lá "Hangover" (nhóm C): mọi người MẤT khả năng đặc biệt
// của nhân vật trong vòng này. Cài ở getEffectiveCharacterHooks()/
// getEffectiveCharacterDefinition() (characters.ts) — xem
// Luat_Bang_Mo_Rong_HighNoon.txt mục 2.
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
    players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
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
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Hangover — mất khả năng đặc biệt (field tĩnh, kiểu Willy the Kid)", () => {
  it("Willy the Kid (bypassBangLimit) KHÔNG còn bỏ qua giới hạn 1 Bang!/lượt khi Hangover đang chạy", () => {
    const state = makeState({
      activeEventId: "hangover",
      players: [
        makePlayer("a", { characterId: "willy_the_kid", hand: ["bang_1", "bang_2"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const afterMiss = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ, chịu mất máu

    expect(() =>
      reduce(afterMiss.state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "c" })
    ).toThrow(/Đã đánh Bang!/);
  });

  it("KHÔNG bật Hangover: Willy the Kid vẫn bỏ qua giới hạn bình thường (đối chứng)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "willy_the_kid", hand: ["bang_1", "bang_2"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const afterMiss = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(() =>
      reduce(afterMiss.state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "c" })
    ).not.toThrow();
  });
});

describe("Hangover — mất khả năng đặc biệt (hook thật, kiểu Bart Cassidy)", () => {
  it("Bart Cassidy (onLoseLife) KHÔNG rút bài khi mất máu lúc Hangover đang chạy", () => {
    const state = makeState({
      activeEventId: "hangover",
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "bart_cassidy" }),
        makePlayer("c"),
      ],
      deck: ["card_1", "card_2"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hand).toEqual([]); // không rút được lá nào
    expect(events).not.toContainEqual(expect.objectContaining({ type: "CARDS_DRAWN", playerId: "b" }));
  });
});

describe("Hangover — giữ nguyên máu tối đa (bullets), không phải khả năng đặc biệt", () => {
  it("maxHp của nhân vật (đã tính lúc setup) không đổi khi Hangover đang chạy", () => {
    const state = makeState({
      activeEventId: "hangover",
      players: [makePlayer("a", { characterId: "jourdonnais", hp: 4, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
    });
    expect(state.players[0].maxHp).toBe(4); // Jourdonnais 4 máu, không bị Hangover đụng tới
  });
});

describe("Hangover — Vera Custer đang mượn khả năng cũng mất luôn (tự đúng qua getEffective*)", () => {
  it("Vera Custer mượn Willy the Kid: vẫn bị giới hạn 1 Bang!/lượt khi Hangover đang chạy", () => {
    const state = makeState({
      activeEventId: "hangover",
      veraCusterBorrowedCharacterId: "willy_the_kid",
      players: [
        makePlayer("a", { characterId: "vera_custer", hand: ["bang_1", "bang_2"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const afterMiss = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(() =>
      reduce(afterMiss.state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "c" })
    ).toThrow(/Đã đánh Bang!/);
  });
});

describe("Hangover hết hiệu lực: khả năng hoạt động lại bình thường", () => {
  it("activeEventId khác hangover (hoặc null): Willy the Kid lại bỏ qua giới hạn Bang!", () => {
    const state = makeState({
      activeEventId: "shootout", // lá sự kiện KHÁC đang chạy, không phải hangover
      players: [
        makePlayer("a", { characterId: "willy_the_kid", hand: ["bang_1", "bang_2"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const afterMiss = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(() =>
      reduce(afterMiss.state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "c" })
    ).not.toThrow();
  });
});
