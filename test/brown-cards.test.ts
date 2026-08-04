import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState } from "../src/core/types";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: ["beer_1"], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 2, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null }, // đã đầy máu
      { id: "d", name: "d", role: "renegade", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
    ],
    deck: ["card_1", "card_2", "card_3", "card_4"],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
    equipmentPlayedTurn: {},
    houseRules: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("reduce — PLAY_CARD (Beer)", () => {
  it("hồi 1 máu cho chính mình, không quá maxHp", () => {
    const { state: next, events } = reduce(makeState(), {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "beer_1",
    });

    expect(next.players[0].hp).toBe(4);
    expect(next.discardPile).toEqual(["beer_1"]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "beer_1" },
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
    ]);
  });

  it("đã đầy máu thì KHÔNG được đánh Bia — reduce() từ chối, không mất lá, không đổi state gốc", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: ["beer_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(state));

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" })).toThrow(/Đã đầy máu/);
    expect(state).toEqual(snapshot); // reduce() thuần — throw giữa chừng không được để lại dấu vết trên state gốc
  });

  it("chỉ còn 2 người sống: Bia vô tác dụng — lá vẫn bị bỏ, nhưng không hồi máu", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: ["beer_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 2, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
      ],
    });
    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[0].hp).toBe(3); // không đổi
    expect(next.discardPile).toEqual(["beer_1"]); // lá vẫn bị bỏ như bình thường
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "beer_1" },
      { type: "BEER_INEFFECTIVE", playerId: "a" },
    ]);
  });
});

describe("reduce — PLAY_CARD (Saloon)", () => {
  // Ngoại lệ "chỉ còn 2 người sống thì vô tác dụng" CHỈ áp dụng riêng cho Bia
  // (luật gốc) — Saloon (và mọi nguồn hồi máu khác) không bị ảnh hưởng gì.
  it("chỉ còn 2 người sống: Saloon VẪN hồi máu bình thường, không giống Bia", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: ["saloon_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 2, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
      ],
    });
    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "saloon_1" });

    expect(next.players[0].hp).toBe(4);
    expect(next.players[1].hp).toBe(3);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "saloon_1" },
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
      { type: "HP_RESTORED", playerId: "b", amount: 1 },
    ]);
  });

  it("hồi 1 máu cho mọi người còn sống, bỏ qua người đã chết và người đầy máu", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: ["saloon_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 2, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "saloon_1",
    });

    expect(next.players[0].hp).toBe(4); // a: 3 -> 4
    expect(next.players[1].hp).toBe(3); // b: 2 -> 3
    expect(next.players[2].hp).toBe(4); // c: đầy máu, không đổi
    expect(next.players[3].hp).toBe(0); // d: đã chết, không đổi

    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "saloon_1" },
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
      { type: "HP_RESTORED", playerId: "b", amount: 1 },
    ]);
  });
});

describe("reduce — PLAY_CARD (Stagecoach / Wells Fargo)", () => {
  it("Stagecoach rút đúng 2 lá từ đỉnh deck", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: ["stagecoach_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "stagecoach_1",
    });

    expect(next.players[0].hand).toEqual(["card_4", "card_3"]);
    expect(next.deck).toEqual(["card_1", "card_2"]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "stagecoach_1" },
      { type: "CARDS_DRAWN", playerId: "a", count: 2 },
    ]);
  });

  it("Wells Fargo rút đúng 3 lá từ đỉnh deck", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: ["wells_fargo_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "wells_fargo_1",
    });

    expect(next.players[0].hand).toEqual(["card_4", "card_3", "card_2"]);
    expect(next.deck).toEqual(["card_1"]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "wells_fargo_1" },
      { type: "CARDS_DRAWN", playerId: "a", count: 3 },
    ]);
  });
});

describe("reduce — không sửa state gốc khi đánh các lá này", () => {
  it("Beer/Saloon/Stagecoach/Wells Fargo đều không đụng state truyền vào", () => {
    const cases: Array<[string, string]> = [
      ["beer_1", "a"],
      ["stagecoach_1", "a"],
      ["wells_fargo_1", "a"],
    ];

    for (const [cardId, playerId] of cases) {
      const state = makeState({
        players: [
          { id: "a", name: "a", role: "sheriff", hp: 3, maxHp: 5, hand: [cardId], equipment: [], alive: true, characterId: null },
          ...makeState().players.slice(1),
        ],
      });
      const snapshot = JSON.parse(JSON.stringify(state));
      reduce(state, { type: "PLAY_CARD", playerId, cardId });
      expect(state).toEqual(snapshot);
    }
  });
});
