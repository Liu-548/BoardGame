import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState } from "../src/core/types";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
    ],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection: null,
    houseRules: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("reduce — PLAY_CARD (Gatling)", () => {
  it("đẩy NEED_MISSED cho mọi người khác, người kế tiếp (b) nằm trên đỉnh", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["gatling_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "gatling_1" });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "d", source: { card: "gatling", from: "a" } },
      { kind: "NEED_MISSED", player: "c", source: { card: "gatling", from: "a" } },
      { kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } },
    ]);
    expect(events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "gatling_1" }]);
  });

  it("bỏ qua người đã chết", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["gatling_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 0, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "gatling_1" });

    expect(next.pending.map((p) => p.player)).toEqual(["d", "c"]);
  });
});

describe("reduce — PLAY_CARD (Indians!)", () => {
  it("đẩy NEED_DISCARD_BANG cho mọi người khác, theo đúng thứ tự", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["indians_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1" });

    expect(next.pending).toEqual([
      { kind: "NEED_DISCARD_BANG", player: "d", source: { card: "indians", from: "a" } },
      { kind: "NEED_DISCARD_BANG", player: "c", source: { card: "indians", from: "a" } },
      { kind: "NEED_DISCARD_BANG", player: "b", source: { card: "indians", from: "a" } },
    ]);
  });
});

describe("reduce — RESPOND (NEED_DISCARD_BANG)", () => {
  function stateWithIndiansPending(): GameState {
    return makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      pending: [{ kind: "NEED_DISCARD_BANG", player: "b", source: { card: "indians", from: "a" } }],
    });
  }

  it("bỏ Bang! thì gỡ pending, không mất máu", () => {
    const { state: next, events } = reduce(stateWithIndiansPending(), {
      type: "RESPOND",
      playerId: "b",
      cardId: "bang_1",
    });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4);
    expect(next.discardPile).toEqual(["bang_1"]);
    expect(events).toEqual([{ type: "BANG_DISCARDED", playerId: "b" }]);
  });

  it("có Bang! nhưng chọn không bỏ vẫn hợp lệ, mất 1 máu", () => {
    const { state: next, events } = reduce(stateWithIndiansPending(), {
      type: "RESPOND",
      playerId: "b",
    });

    expect(next.players[1].hp).toBe(3);
    expect(next.players[1].hand).toEqual(["bang_1"]); // vẫn giữ lá Bang!, không bị ép dùng
    expect(events).toEqual([{ type: "DAMAGE_DEALT", playerId: "b", amount: 1 }]);
  });

  it("gửi lá không phải Bang! thì báo lỗi", () => {
    const state = stateWithIndiansPending();
    state.players[1].hand = ["missed_1"];
    expect(() =>
      reduce(state, { type: "RESPOND", playerId: "b", cardId: "missed_1" })
    ).toThrow();
  });
});

describe("reduce — PLAY_CARD / RESPOND (Duel)", () => {
  it("đẩy NEED_DUEL_RESPONSE cho mục tiêu", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["duel_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });

    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "duel_1",
      targetId: "b",
    });

    expect(next.pending).toEqual([
      { kind: "NEED_DUEL_RESPONSE", player: "b", opponent: "a", source: { card: "duel", from: "a" } },
    ]);
  });

  it("cả hai đều bỏ được Bang! thì đổi vai qua lại, ai hết Bang! trước thì mất máu", () => {
    let state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      pending: [{ kind: "NEED_DUEL_RESPONSE", player: "b", opponent: "a", source: { card: "duel", from: "a" } }],
    });

    // b bỏ Bang!, lượt chuyển sang a
    let result = reduce(state, { type: "RESPOND", playerId: "b", cardId: "bang_1" });
    expect(result.state.pending).toEqual([
      { kind: "NEED_DUEL_RESPONSE", player: "a", opponent: "b", source: { card: "duel", from: "a" } },
    ]);

    // a không còn Bang! -> chịu mất máu, duel kết thúc
    result = reduce(result.state, { type: "RESPOND", playerId: "a" });
    expect(result.state.pending).toEqual([]);
    expect(result.state.players[0].hp).toBe(3);
  });
});

describe("reduce — PLAY_CARD / RESPOND (General Store)", () => {
  it("lật đúng số lá bằng số người sống, người đánh bài chọn trước", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["general_store_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
      deck: ["c1", "c2", "c3", "c4"], // đỉnh deck = phần tử cuối
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "general_store_1",
    });

    expect(next.deck).toEqual([]);
    expect(next.pending).toEqual([
      { kind: "NEED_PICK_STORE_CARD", player: "a", options: ["c4", "c3", "c2", "c1"] },
    ]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "general_store_1" },
      { type: "STORE_REVEALED", cardIds: ["c4", "c3", "c2", "c1"] },
    ]);
  });

  it("chọn xong thì chuyển lượt chọn cho người kế tiếp, hết bài thì không còn pending", () => {
    let state = makeState({
      pending: [{ kind: "NEED_PICK_STORE_CARD", player: "a", options: ["c4", "c3"] }],
    });

    let result = reduce(state, { type: "RESPOND", playerId: "a", cardId: "c4" });
    expect(result.state.players[0].hand).toEqual(["c4"]);
    expect(result.state.pending).toEqual([
      { kind: "NEED_PICK_STORE_CARD", player: "b", options: ["c3"] },
    ]);

    result = reduce(result.state, { type: "RESPOND", playerId: "b", cardId: "c3" });
    expect(result.state.players[1].hand).toEqual(["c3"]);
    expect(result.state.pending).toEqual([]);
  });

  it("chọn lá không nằm trong các lá đã lật thì báo lỗi", () => {
    const state = makeState({
      pending: [{ kind: "NEED_PICK_STORE_CARD", player: "a", options: ["c4"] }],
    });
    expect(() =>
      reduce(state, { type: "RESPOND", playerId: "a", cardId: "khong_ton_tai" })
    ).toThrow();
  });
});

describe("reduce — PLAY_CARD (Panic!)", () => {
  it("cướp 1 lá ngẫu nhiên từ tay mục tiêu về tay người đánh", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "panic_1",
      targetId: "b",
    });

    expect(next.players[0].hand).toEqual(["bang_1"]);
    expect(next.players[1].hand).toEqual([]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "panic_1", targetId: "b" },
      { type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "bang_1" },
    ]);
  });

  it("tay mục tiêu hết bài thì cướp đúng lá trang bị đã chỉ định trên sân", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["barrel_1", "scope_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "panic_1",
      targetId: "b",
      targetCardId: "scope_1",
    });

    expect(next.players[0].hand).toEqual(["scope_1"]);
    expect(next.players[1].equipment).toEqual(["barrel_1"]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "panic_1", targetId: "b" },
      { type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "scope_1" },
    ]);
  });

  it("tay mục tiêu hết bài mà không chỉ định lá trên sân thì báo lỗi", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["barrel_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" })
    ).toThrow();
  });

  it("tay mục tiêu còn bài mà vẫn chỉ định lá cụ thể thì báo lỗi (phải ngẫu nhiên)", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: ["barrel_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b", targetCardId: "barrel_1" })
    ).toThrow();
  });

  it("mục tiêu không còn gì để cướp (tay lẫn sân đều rỗng) thì báo lỗi", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" })
    ).toThrow();
  });

  it("báo lỗi nếu tự cướp chính mình", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["panic_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(1),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "a" })
    ).toThrow();
  });
});

describe("reduce — PLAY_CARD / RESPOND (Cat Balou)", () => {
  it("chọn vùng 'tay' thì đẩy NEED_DISCARD_FROM_ZONE, mục tiêu tự chọn lá để bỏ", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["cat_balou_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1", "missed_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const playResult = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "cat_balou_1",
      targetId: "b",
      targetZone: "hand",
    });

    expect(playResult.state.pending).toEqual([
      { kind: "NEED_DISCARD_FROM_ZONE", player: "b", zone: "hand", source: { card: "cat_balou", from: "a" } },
    ]);
    expect(playResult.events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "cat_balou_1", targetId: "b" },
    ]);
    // chưa bỏ bài gì ngay lúc đánh — chờ mục tiêu chọn
    expect(playResult.state.players[1].hand).toEqual(["bang_1", "missed_1"]);

    const respondResult = reduce(playResult.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(respondResult.state.pending).toEqual([]);
    expect(respondResult.state.players[1].hand).toEqual(["bang_1"]);
    expect(respondResult.state.discardPile).toContain("missed_1");
    expect(respondResult.events).toEqual([
      { type: "CARD_FORCE_DISCARDED", playerId: "b", byPlayerId: "a", cardId: "missed_1" },
    ]);
  });

  it("chọn vùng 'sân' thì mục tiêu chỉ được chọn trong trang bị, không phải bài trên tay", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["cat_balou_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: ["barrel_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const playResult = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "cat_balou_1",
      targetId: "b",
      targetZone: "equipment",
    });

    // không được chọn bài trên tay dù đang có
    expect(() =>
      reduce(playResult.state, { type: "RESPOND", playerId: "b", cardId: "bang_1" })
    ).toThrow();

    const respondResult = reduce(playResult.state, { type: "RESPOND", playerId: "b", cardId: "barrel_1" });
    expect(respondResult.state.players[1].equipment).toEqual([]);
    expect(respondResult.state.players[1].hand).toEqual(["bang_1"]); // tay không bị đụng tới
  });

  it("không chọn vùng nào thì báo lỗi ngay khi đánh bài", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["cat_balou_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "cat_balou_1", targetId: "b" })
    ).toThrow();
  });

  it("chọn vùng rỗng thì báo lỗi ngay khi đánh bài, không tạo pending", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["cat_balou_1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "cat_balou_1", targetId: "b", targetZone: "equipment" })
    ).toThrow();
  });
});

describe("reduce — không sửa state gốc khi đánh các lá tấn công", () => {
  it("Gatling/Indians/Duel/General Store/Panic/Cat Balou đều không đụng state truyền vào", () => {
    const cases: Array<{ cardId: string; targetId?: string; targetZone?: "hand" | "equipment" }> = [
      { cardId: "gatling_1" },
      { cardId: "indians_1" },
      { cardId: "duel_1", targetId: "b" },
      { cardId: "general_store_1" },
      { cardId: "panic_1", targetId: "b" },
      { cardId: "cat_balou_1", targetId: "b", targetZone: "hand" },
    ];

    for (const { cardId, targetId, targetZone } of cases) {
      const state = makeState({
        players: [
          { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [cardId], equipment: [], alive: true, characterId: null },
          { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true, characterId: null },
          ...makeState().players.slice(2),
        ],
        deck: ["c1", "c2", "c3", "c4"],
      });
      const snapshot = JSON.parse(JSON.stringify(state));
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId, targetId, targetZone });
      expect(state).toEqual(snapshot);
    }
  });
});
