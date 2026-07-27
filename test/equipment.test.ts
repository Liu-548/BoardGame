import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState } from "../src/core/types";

// State tối giản. Suit/rank của các id draw! dùng trong test này (tra từ
// CARD_SUIT_RANKS trong cards.ts): jail_1 = hearts,4 (khớp Cơ) — jail_2 = spades,10 (không khớp).
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
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
    houseRules: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("reduce — PLAY_CARD (lá xanh tự trang bị)", () => {
  it("đánh súng: gắn vào equipment, KHÔNG vào chồng bỏ", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["schofield_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "schofield_1" });

    expect(next.players[0].hand).toEqual([]);
    expect(next.players[0].equipment).toEqual(["schofield_1"]);
    expect(next.discardPile).toEqual([]);
    expect(events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "schofield_1" }]);
  });

  it("đánh súng mới khi đã có súng cũ: gỡ súng cũ (khác tên) vào chồng bỏ, báo WEAPON_REPLACED", () => {
    const state = makeState({
      players: [
        {
          id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4,
          hand: ["volcanic_1"], equipment: ["schofield_1"], alive: true, characterId: null,
        },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "volcanic_1" });

    expect(next.players[0].equipment).toEqual(["volcanic_1"]);
    expect(next.discardPile).toEqual(["schofield_1"]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "volcanic_1" },
      { type: "WEAPON_REPLACED", playerId: "a", oldCardId: "schofield_1" },
    ]);
  });

  it("Barrel/Scope/Mustang không đụng tới súng đang có, và cùng tồn tại được với nhau", () => {
    const state = makeState({
      players: [
        {
          id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4,
          hand: ["scope_1"], equipment: ["schofield_1", "barrel_1"], alive: true, characterId: null,
        },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "scope_1" });

    expect(next.players[0].equipment).toEqual(["schofield_1", "barrel_1", "scope_1"]);
    expect(next.discardPile).toEqual([]);
  });

  it("báo lỗi nếu đánh thêm lá xanh CÙNG TÊN đã có trên sân (không áp dụng cho súng)", () => {
    const state = makeState({
      players: [
        {
          id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4,
          hand: ["barrel_2"], equipment: ["barrel_1"], alive: true, characterId: null,
        },
        ...makeState().players.slice(1),
      ],
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "barrel_2" })
    ).toThrow();
  });

  it("không sửa state gốc truyền vào", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["schofield_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "schofield_1" });
    expect(state).toEqual(snapshot);
  });

  // Jail (đánh lên sân người khác) và Dynamite (không đánh chủ động) có test
  // riêng ở test/jail.test.ts và test/dynamite.test.ts (việc 1.11 Phần B).
});

describe("reduce — Bang!/Gatling vào mục tiêu có Barrel", () => {
  it("đánh Bang! vào mục tiêu có Barrel: đẩy NEED_DRAW_CHECK lên TRÊN NEED_MISSED", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["barrel_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "barrel" }, matchSuits: ["hearts"] },
    ]);
  });

  it("Barrel draw! khớp Cơ: né miễn phí, gỡ luôn cả NEED_MISSED bên dưới, không tốn máu", () => {
    const state = makeState({
      deck: ["jail_1"], // hearts, 4 — khớp
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["barrel_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      pending: [
        { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "barrel" }, matchSuits: ["hearts"] },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
      { type: "BARREL_DODGED", playerId: "b" },
    ]);
  });

  it("Barrel draw! không khớp: vẫn còn NEED_MISSED, mục tiêu trả lời bình thường", () => {
    const state = makeState({
      deck: ["jail_2"], // spades, 10 — không khớp
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["missed_1"], equipment: ["barrel_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      pending: [
        { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "barrel" }, matchSuits: ["hearts"] },
      ],
    });

    const { state: afterDraw, events: drawEvents } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(drawEvents).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_2", matched: false },
    ]);
    expect(afterDraw.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);

    // vẫn trả lời NEED_MISSED bình thường được sau khi Barrel thất bại
    const { state: afterMissed } = reduce(afterDraw, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(afterMissed.pending).toEqual([]);
    expect(afterMissed.players[1].hp).toBe(4);
  });

  it("Gatling: chỉ mục tiêu có Barrel mới có thêm NEED_DRAW_CHECK, người khác thì không", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["gatling_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["barrel_1"], alive: true, characterId: null },
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "gatling_1" });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "c", source: { card: "gatling", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "c", source: { card: "barrel" }, matchSuits: ["hearts"] },
      { kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } },
    ]);
  });
});
