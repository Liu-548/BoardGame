import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState } from "../src/core/types";

// Dynamite miễn nhiễm Panic!/Cat Balou (mục 8 file luật) — test này xác nhận
// cả 2 lá không thể lấy/bỏ Dynamite trên sân, kể cả khi nó là thứ duy nhất còn.
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1", "cat_balou_1"], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
    ],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 123,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
    equipmentPlayedTurn: {},
    joseDelgadoUsesThisTurn: 0,
    docHolydayUsedThisTurn: false,
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Panic! và Dynamite miễn nhiễm", () => {
  it("mục tiêu chỉ có Dynamite trên sân, tay trống: không có mục tiêu hợp lệ để cướp", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
      ],
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" })
    ).toThrow();
  });

  it("chỉ định đúng Dynamite làm targetCardId: bị từ chối", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1", "scope_1"], alive: true, characterId: null },
      ],
    });

    expect(() =>
      reduce(state, {
        type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b", targetCardId: "dynamite_1",
      })
    ).toThrow();
  });

  it("mục tiêu có Dynamite + lá khác: vẫn cướp được lá KHÔNG PHẢI Dynamite bình thường", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1", "scope_1"], alive: true, characterId: null },
      ],
    });

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b", targetCardId: "scope_1",
    });

    expect(next.players[1].equipment).toEqual(["dynamite_1"]); // Dynamite vẫn còn nguyên
    expect(next.players[0].hand).toContain("scope_1");
  });
});

describe("Cat Balou và Dynamite miễn nhiễm", () => {
  it("targetZone sân nhưng mục tiêu chỉ có Dynamite: coi như trống, cấm đánh", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["cat_balou_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
      ],
    });

    expect(() =>
      reduce(state, {
        type: "PLAY_CARD", playerId: "a", cardId: "cat_balou_1", targetId: "b", targetZone: "equipment",
      })
    ).toThrow();
  });

  it("mục tiêu có Dynamite + Jail trên sân: chọn bỏ đúng Dynamite bị từ chối, chọn Jail thì được", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["cat_balou_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1", "jail_1"], alive: true, characterId: null },
      ],
    });

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "cat_balou_1", targetId: "b", targetZone: "equipment",
    });

    expect(() =>
      reduce(afterPlay, { type: "RESPOND", playerId: "b", cardId: "dynamite_1" })
    ).toThrow();

    const { state: afterDiscard } = reduce(afterPlay, { type: "RESPOND", playerId: "b", cardId: "jail_1" });
    expect(afterDiscard.players[1].equipment).toEqual(["dynamite_1"]);
    // "cat_balou_1" vào chồng bỏ ngay lúc đánh, "jail_1" vào sau khi mục tiêu chọn bỏ
    expect(afterDiscard.discardPile).toEqual(["cat_balou_1", "jail_1"]);
  });
});
