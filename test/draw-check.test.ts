import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState, PendingAction, Rank, Suit } from "../src/core/types";

// State tối giản, tự tay dựng để kiểm soát đúng lá nào nằm trên đỉnh deck.
// Suit/rank của các id dùng trong test này (tra từ CARD_SUIT_RANKS trong cards.ts):
//   jail_1   = hearts, 4     jail_2   = spades, 10
//   missed_1 = diamonds, 10  missed_6 = spades, 2
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
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

// "example" (không phải "barrel"/"jail"/"dynamite" thật) — các test ở đây chỉ
// kiểm tra cơ chế draw! TỔNG QUÁT (việc 1.10), không phải hậu quả riêng của
// từng lá (Barrel/Jail/Dynamite — việc 1.11, xem test/equipment.test.ts,
// test/jail.test.ts, test/dynamite.test.ts).
function drawCheckPending(matchSuits: Suit[], matchRanks?: Rank[]): PendingAction {
  return { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "example" }, matchSuits, matchRanks };
}

describe("reduce — RESPOND (NEED_DRAW_CHECK)", () => {
  it("lật khớp chất (matchSuits, không giới hạn rank) → matched true, gỡ pending, bỏ lá vào chồng bỏ", () => {
    const state = makeState({
      deck: ["jail_1"], // hearts, 4 — khớp matchSuits: ["hearts"]
      pending: [drawCheckPending(["hearts"])],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.deck).toEqual([]);
    expect(next.discardPile).toEqual(["jail_1"]);
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
    ]);
  });

  it("lật không khớp chất → matched false", () => {
    const state = makeState({
      deck: ["jail_2"], // spades, 10 — không khớp matchSuits: ["hearts"]
      pending: [drawCheckPending(["hearts"])],
    });

    const { events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_2", matched: false },
    ]);
  });

  it("có matchRanks: đúng chất lẫn giá trị mới tính khớp (kiểu Dynamite: Bích 2-9)", () => {
    const state = makeState({
      deck: ["missed_6"], // spades, 2
      pending: [
        drawCheckPending(["spades"], ["2", "3", "4", "5", "6", "7", "8", "9"]),
      ],
    });

    const { events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "missed_6", matched: true },
    ]);
  });

  it("có matchRanks: đúng chất nhưng sai giá trị → matched false", () => {
    const state = makeState({
      deck: ["jail_2"], // spades, 10 — đúng chất Bích nhưng 10 không nằm trong 2-9
      pending: [
        drawCheckPending(["spades"], ["2", "3", "4", "5", "6", "7", "8", "9"]),
      ],
    });

    const { events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_2", matched: false },
    ]);
  });

  it("hết deck giữa chừng thì tự xáo lại chồng bỏ rồi lật tiếp", () => {
    const state = makeState({
      deck: [],
      discardPile: ["jail_1", "missed_1", "missed_6"],
      pending: [drawCheckPending(["hearts"])],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    // tổng số lá không đổi: 3 lá cũ, giờ 1 lá bị lật ra nằm trong discardPile, 2 lá còn lại trong deck
    expect(next.deck.length).toBe(2);
    expect(next.discardPile.length).toBe(1);
    expect(["jail_1", "missed_1", "missed_6"]).toContain((events[0] as { cardId: string }).cardId);
  });

  it("việc draw! đẩy lên đỉnh stack, giải quyết xong quay lại đúng mục bên dưới", () => {
    const state = makeState({
      deck: ["jail_1"],
      pending: [
        { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        drawCheckPending(["hearts"]),
      ],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);
  });

  it("báo lỗi nếu gửi kèm cardId (draw! không cần chọn lá)", () => {
    const state = makeState({
      deck: ["jail_1"],
      pending: [drawCheckPending(["hearts"])],
    });

    expect(() =>
      reduce(state, { type: "RESPOND", playerId: "b", cardId: "jail_1" })
    ).toThrow();
  });

  it("báo lỗi nếu không phải người đang được chờ draw!", () => {
    const state = makeState({
      deck: ["jail_1"],
      pending: [drawCheckPending(["hearts"])],
    });

    expect(() => reduce(state, { type: "RESPOND", playerId: "a" })).toThrow();
  });

  it("không sửa state gốc truyền vào", () => {
    const state = makeState({
      deck: ["jail_1"],
      pending: [drawCheckPending(["hearts"])],
    });
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { type: "RESPOND", playerId: "b" });
    expect(state).toEqual(snapshot);
  });
});
