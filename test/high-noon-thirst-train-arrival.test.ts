// Mở rộng High Noon — lá "Thirst"/"Train Arrival" (nhóm C, sửa luật nền): số
// lá rút đầu lượt ±1 SO VỚI BÌNH THƯỜNG (theo FAQ, chủ dự án đã chốt theo
// phương án FAQ chứ không phải "ép cứng 1 lá"). Áp dụng cho pha rút KHÔNG có
// nhân vật đặc biệt, Pixie Pete, Bill Noface, Kit Carlson (đủ ví dụ FAQ dẫn
// chứng) — CỐ TÌNH CHƯA áp dụng cho Black Jack/Pedro Ramirez/Jesse Jones (FAQ
// không có ví dụ, xem ghi chú getDrawCountAdjustment() trong reduce.ts). Xem
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
    players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "draw",
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
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Thirst/Train Arrival — người thường: 2 lá ±1", () => {
  it("Thirst: rút đúng 1 lá thay vì 2", () => {
    const state = makeState({ activeEventId: "thirst", deck: ["c2", "c1"] });
    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("Train Arrival: rút 3 lá thay vì 2", () => {
    const state = makeState({ activeEventId: "train_arrival", deck: ["c3", "c2", "c1"] });
    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });

  it("không active: vẫn 2 lá như bình thường", () => {
    const state = makeState({ deck: ["c2", "c1"] });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1", "c2"]);
  });
});

describe("Thirst/Train Arrival — Pixie Pete (FAQ Q13 Dodge City: 3 gốc ±1)", () => {
  it("Thirst: Pixie Pete rút 2 thay vì 3", () => {
    const state = makeState({
      activeEventId: "thirst",
      players: [makePlayer("a", { role: "sheriff", characterId: "pixie_pete" }), makePlayer("b"), makePlayer("c")],
      deck: ["c3", "c2", "c1"],
    });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1", "c2"]);
  });

  it("Train Arrival: Pixie Pete rút 4 thay vì 3", () => {
    const state = makeState({
      activeEventId: "train_arrival",
      players: [makePlayer("a", { role: "sheriff", characterId: "pixie_pete" }), makePlayer("b"), makePlayer("c")],
      deck: ["c4", "c3", "c2", "c1"],
    });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3", "c4"]);
  });
});

describe("Thirst/Train Arrival — Bill Noface (FAQ Q13 Dodge City: 1+máu đã mất ±1)", () => {
  it("Thirst: Sheriff còn 2/5 máu (mất 3) -> bình thường 4 lá, có Thirst thì 3", () => {
    const state = makeState({
      activeEventId: "thirst",
      players: [
        makePlayer("a", { role: "sheriff", characterId: "bill_noface", hp: 2, maxHp: 5 }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      deck: ["c4", "c3", "c2", "c1"],
    });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
  });

  it("Train Arrival: Sheriff còn 2/5 máu (mất 3) -> bình thường 4 lá, có Train thì 5", () => {
    const state = makeState({
      activeEventId: "train_arrival",
      players: [
        makePlayer("a", { role: "sheriff", characterId: "bill_noface", hp: 2, maxHp: 5 }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      deck: ["c5", "c4", "c3", "c2", "c1"],
    });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });
});

describe("Thirst/Train Arrival — Kit Carlson (FAQ Q6 Davinci: vẫn xem 3, đổi số lá GIỮ)", () => {
  it("Thirst: vẫn xem đủ 3 lá, nhưng chỉ giữ 1 (bỏ 2)", () => {
    const state = makeState({
      activeEventId: "thirst",
      players: [makePlayer("a", { role: "sheriff", characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      deck: ["c3", "c2", "c1"],
    });
    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(drawn.state.pending).toEqual([
      { kind: "NEED_PICK_KEPT_CARDS", player: "a", cards: ["c1", "c2", "c3"], keepCount: 1 },
    ]);

    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a", cardIds: ["c2"] });
    expect(next.players[0].hand).toEqual(["c2"]);
    expect(next.discardPile).toEqual(["c1", "c3"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("Thirst: không chọn (mặc định) -> giữ ĐÚNG 1 lá đầu, bỏ 2 lá sau", () => {
    const state = makeState({
      activeEventId: "thirst",
      players: [makePlayer("a", { role: "sheriff", characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      deck: ["c3", "c2", "c1"],
    });
    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next } = reduce(drawn.state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hand).toEqual(["c1"]);
    expect(next.discardPile).toEqual(["c2", "c3"]);
  });

  it("Train Arrival: giữ cả 3 lá, KHÔNG cần hỏi (không có pending)", () => {
    const state = makeState({
      activeEventId: "train_arrival",
      players: [makePlayer("a", { role: "sheriff", characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      deck: ["c3", "c2", "c1"],
    });
    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.pending).toEqual([]);
    expect(next.turnPhase).toBe("play");
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });
});
