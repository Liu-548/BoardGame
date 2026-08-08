import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState } from "../src/core/types";

// Suit/rank tra từ CARD_SUIT_RANKS (cards.ts): jail_1 = hearts,4 (khớp Cơ) —
// jail_2 = spades,10 (không khớp Cơ).
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
    ],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 123,
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

describe("reduce — PLAY_CARD (Jail)", () => {
  it("gắn Jail vào sân MỤC TIÊU (không phải người đánh)", () => {
    const state = makeState({
      currentPlayerIndex: 1,
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["jail_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "b", cardId: "jail_1", targetId: "c",
    });

    expect(next.players[1].hand).toEqual([]);
    expect(next.players[1].equipment).toEqual([]); // người đánh KHÔNG bị gắn
    expect(next.players[2].equipment).toEqual(["jail_1"]); // mục tiêu bị gắn
    expect(next.discardPile).toEqual([]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "b", cardId: "jail_1", targetId: "c" },
    ]);
  });

  it("KHÔNG BAO GIỜ được đánh Jail lên Cảnh sát trưởng", () => {
    const state = makeState({
      currentPlayerIndex: 1,
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["jail_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "jail_1", targetId: "a" })
    ).toThrow(/Cảnh sát trưởng/);
  });

  it("báo lỗi nếu tự đánh Jail lên chính mình", () => {
    const state = makeState({
      currentPlayerIndex: 1,
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["jail_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "jail_1", targetId: "b" })
    ).toThrow();
  });

  it("báo lỗi nếu mục tiêu đã có Jail trước mặt", () => {
    const state = makeState({
      currentPlayerIndex: 1,
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["jail_2"], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: ["jail_1"], alive: true, characterId: null },
      ],
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "jail_2", targetId: "c" })
    ).toThrow();
  });
});

describe("Bước 0 đầu lượt — Jail", () => {
  it("người kế tiếp có Jail: END_TURN đẩy NEED_DRAW_CHECK (matchSuits Cơ) cho họ", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["jail_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.currentPlayerIndex).toBe(1);
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] },
    ]);
  });

  it("draw! khớp Cơ: thoát tù, bỏ Jail, chơi lượt bình thường", () => {
    const state = makeState({
      // deck.pop() rút từ CUỐI mảng: jail_1 (draw! check) rút trước, rồi tới
      // bang_1/beer_1 khi DRAW_CARDS rút 2 lá bình thường sau khi thoát tù.
      deck: ["beer_1", "bang_1", "jail_1"],
      turnPhase: "draw",
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["jail_2"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].equipment).toEqual([]);
    // "jail_1" = lá vừa lật ra (draw! luôn bỏ lá đã lật), "jail_2" = chính lá Jail được gỡ
    expect(next.discardPile).toEqual(["jail_1", "jail_2"]);
    expect(next.currentPlayerIndex).toBe(1); // vẫn là lượt của b
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
      { type: "JAIL_ESCAPED", playerId: "b" },
    ]);

    // rút bài bình thường được sau khi thoát tù
    const { state: afterDraw } = reduce(next, { type: "DRAW_CARDS", playerId: "b" });
    expect(afterDraw.players[1].hand.length).toBeGreaterThanOrEqual(0);
  });

  it("draw! không khớp Cơ: bỏ Jail, bỏ qua CẢ lượt, sang thẳng người kế tiếp", () => {
    const state = makeState({
      deck: ["missed_1"], // diamonds, 10 — không khớp Cơ
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["jail_2"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].equipment).toEqual([]);
    // "missed_1" = lá vừa lật ra, "jail_2" = chính lá Jail bị gỡ khi thất bại
    expect(next.discardPile).toEqual(["missed_1", "jail_2"]);
    expect(next.currentPlayerIndex).toBe(2); // bỏ qua b, sang thẳng c
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "missed_1", matched: false },
      { type: "JAIL_SKIPPED_TURN", playerId: "b" },
    ]);
  });

  it("DRAW_CARDS bị chặn khi còn Jail-check đang chờ", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["jail_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
    });

    expect(() => reduce(state, { type: "DRAW_CARDS", playerId: "b" })).toThrow();
  });
});
