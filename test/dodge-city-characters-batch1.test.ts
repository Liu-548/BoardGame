// Mở rộng Dodge City, mục C nhóm A (5.4) — 7 nhân vật dùng lại cơ chế có sẵn:
// Pixie Pete/Bill Noface (onDrawPhase), Greg Digger/Herb Hunter (onAnyDeath),
// Pat Brennan (NEED_PICK_DRAW_OR_EQUIPMENT, PendingAction mới), Chuck Wengam/
// José Delgado (USE_ABILITY, cùng action với Sid Ketchum nhưng khác luật).
// Xem LO-TRINH.md "Ghi chú cho 5.4" mục C để biết đặc tả gốc.
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

describe("Pixie Pete — rút 3 lá thay vì 2 ở đầu lượt", () => {
  it("rút đúng 3 lá từ đỉnh bộ bài", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pixie_pete" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["c3", "c2", "c1"], // đỉnh (rút trước) = c1
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });

  it("bộ bài + chồng bỏ cạn giữa chừng: rút được bao nhiêu hay bấy nhiêu", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pixie_pete" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["c1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });
});

describe("Bill Noface — rút 1 + số máu đã mất", () => {
  it("đủ máu: rút đúng 1 lá (1 + 0)", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "bill_noface", hp: 4, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["c1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("mất 2 máu: rút đúng 3 lá (1 + 2)", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "bill_noface", hp: 2, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["c3", "c2", "c1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });
});

describe("Greg Digger — người KHÁC chết thì hồi ngay 2 máu (không vượt trần)", () => {
  it("hồi đúng 2 máu khi có người khác chết", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { role: "renegade", hp: 1 }),
        makePlayer("c", { characterId: "greg_digger", hp: 1, maxHp: 4 }),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> chết

    expect(next.players[1].alive).toBe(false);
    expect(next.players[2].hp).toBe(3); // 1 + 2
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "c", amount: 2 });
  });

  it("gần đầy máu: chỉ hồi tới trần, không vượt quá maxHp", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { role: "renegade", hp: 1 }),
        makePlayer("c", { characterId: "greg_digger", hp: 3, maxHp: 4 }),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[2].hp).toBe(4); // không lên 5
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "c", amount: 1 });
  });

  it("chính Greg Digger chết thì KHÔNG tự hồi cho mình", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "greg_digger", role: "renegade", hp: 1, maxHp: 4 }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.players[1].hp).toBe(0); // không tự hồi rồi "sống lại"
    expect(events.some((e) => e.type === "HP_RESTORED")).toBe(false);
  });
});

describe("Herb Hunter — người KHÁC chết thì rút thêm 2 lá", () => {
  it("rút đúng 2 lá khi có người khác chết", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { role: "renegade", hp: 1 }),
        makePlayer("c", { characterId: "herb_hunter" }),
      ],
      deck: ["c2", "c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[2].hand).toEqual(["c1", "c2"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "c", count: 2 });
  });

  it("cộng dồn TỰ NHIÊN với thưởng hạ Outlaw (không loại trừ nhau)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: "herb_hunter" }),
        makePlayer("b", { role: "outlaw", hp: 1 }),
        makePlayer("c"),
      ],
      deck: ["c5", "c4", "c3", "c2", "c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    // 3 lá thưởng Outlaw + 2 lá Herb Hunter = 5 (Herb Hunter tự giết Outlaw)
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("chính Herb Hunter chết thì KHÔNG tự rút thêm cho mình", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "herb_hunter", role: "renegade", hp: 1 }),
        makePlayer("c"),
      ],
      deck: ["c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.deck).toEqual(["c1"]); // không đụng bộ bài
  });
});

describe("Pat Brennan — đầu lượt chọn rút bộ bài hay lấy 1 lá trang bị của người khác", () => {
  it("chọn lấy 1 lá trang bị của người khác", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "pat_brennan" }),
        makePlayer("b", { equipment: ["scope_1", "barrel_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(drawn.state.pending).toEqual([{ kind: "NEED_PICK_DRAW_OR_EQUIPMENT", player: "a" }]);
    expect(drawn.state.turnPhase).toBe("draw");

    const { state: next, events } = reduce(drawn.state, {
      type: "RESPOND",
      playerId: "a",
      targetId: "b",
      cardId: "scope_1",
    });

    expect(next.players[0].hand).toEqual(["scope_1"]);
    expect(next.players[1].equipment).toEqual(["barrel_1"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "scope_1" });
  });

  it("lấy được cả lá 'delayed' (mở rộng Dodge City)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "pat_brennan" }),
        makePlayer("b", { equipment: ["canteen_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      equipmentPlayedTurn: { canteen_1: 0 },
      turnNumber: 5,
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next } = reduce(drawn.state, {
      type: "RESPOND",
      playerId: "a",
      targetId: "b",
      cardId: "canteen_1",
    });

    expect(next.players[0].hand).toEqual(["canteen_1"]);
    expect(next.equipmentPlayedTurn).toEqual({}); // dọn rác đúng theo quy tắc 3
  });

  it("lấy Dynamite: tự động gắn xuống sân Pat Brennan, KHÔNG vào tay", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "pat_brennan" }),
        makePlayer("b", { equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next } = reduce(drawn.state, {
      type: "RESPOND",
      playerId: "a",
      targetId: "b",
      cardId: "dynamite_1",
    });

    expect(next.players[0].equipment).toEqual(["dynamite_1"]);
    expect(next.players[0].hand).toEqual([]);
  });

  it("không chọn ai (mặc định/timeout): rút 2 lá từ bộ bài như bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "pat_brennan" }),
        makePlayer("b", { equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      deck: ["c2", "c1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1", "c2"]);
    expect(next.players[1].equipment).toEqual(["scope_1"]); // không đụng gì
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("báo lỗi nếu tự chọn lấy trang bị của CHÍNH mình", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pat_brennan", equipment: ["scope_1"] }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(() =>
      reduce(drawn.state, { type: "RESPOND", playerId: "a", targetId: "a", cardId: "scope_1" })
    ).toThrow(/chính mình/);
  });

  it("báo lỗi nếu lá không thuộc về đúng người đó", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "pat_brennan" }),
        makePlayer("b", { equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(() =>
      reduce(drawn.state, { type: "RESPOND", playerId: "a", targetId: "b", cardId: "barrel_1" })
    ).toThrow(/không có lá trang bị/);
  });
});

describe("Chuck Wengam — mất 1 máu để rút 2 lá, lặp lại được, CHỈ trong lượt mình", () => {
  it("dùng 1 lần: mất 1 máu, rút 2 lá", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "chuck_wengam", hp: 4, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      deck: ["c2", "c1"],
    });

    const { state: next, events } = reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [] });

    expect(next.players[0].hp).toBe(3);
    expect(next.players[0].hand).toEqual(["c1", "c2"]);
    expect(events).toContainEqual({ type: "CHUCK_WENGAM_TRADED_LIFE", playerId: "a", count: 2 });
  });

  it("dùng lặp lại nhiều lần trong CÙNG 1 lượt", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "chuck_wengam", hp: 4, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      deck: ["c4", "c3", "c2", "c1"],
    });

    const first = reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [] });
    const { state: next } = reduce(first.state, { type: "USE_ABILITY", playerId: "a", cardIds: [] });

    expect(next.players[0].hp).toBe(2);
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("chặn nếu chỉ còn đúng 1 máu — không được tự sát bằng cách này", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "chuck_wengam", hp: 1, maxHp: 4 }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
    });

    expect(() => reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [] })).toThrow(/máu cuối cùng/);
  });

  it("báo lỗi nếu dùng KHÔNG PHẢI lượt của mình", () => {
    const state = makeState({
      players: [makePlayer("a"), makePlayer("b", { characterId: "chuck_wengam", hp: 4 }), makePlayer("c")],
      currentPlayerIndex: 0,
    });

    expect(() => reduce(state, { type: "USE_ABILITY", playerId: "b", cardIds: [] })).toThrow();
  });

  it("báo lỗi nếu kèm cardIds — kỹ năng này không bỏ lá nào cả", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "chuck_wengam", hp: 4, hand: ["beer_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1"] })
    ).toThrow(/không cần bỏ lá nào/);
  });
});

describe("José Delgado — bỏ 1 lá xanh dương từ tay để rút 2 lá, tối đa 2 lần/lượt", () => {
  it("dùng 1 lần: bỏ đúng 1 lá xanh dương, rút 2 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jose_delgado", hand: ["scope_1", "beer_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      deck: ["c2", "c1"],
    });

    const { state: next, events } = reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["scope_1"] });

    expect(next.players[0].hand).toEqual(["beer_1", "c1", "c2"]);
    expect(next.discardPile).toEqual(["scope_1"]);
    expect(next.joseDelgadoUsesThisTurn).toBe(1);
    expect(events).toContainEqual({
      type: "JOSE_DELGADO_TRADED_EQUIPMENT",
      playerId: "a",
      cardId: "scope_1",
      count: 2,
    });
  });

  it("dùng đủ 2 lần trong CÙNG 1 lượt", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jose_delgado", hand: ["scope_1", "barrel_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      deck: ["c4", "c3", "c2", "c1"],
    });

    const first = reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["scope_1"] });
    const { state: next } = reduce(first.state, { type: "USE_ABILITY", playerId: "a", cardIds: ["barrel_1"] });

    expect(next.joseDelgadoUsesThisTurn).toBe(2);
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("chặn lần dùng thứ 3 trong CÙNG 1 lượt", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jose_delgado", hand: ["scope_1", "barrel_1", "mustang_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      deck: ["c6", "c5", "c4", "c3", "c2", "c1"],
      joseDelgadoUsesThisTurn: 2,
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["mustang_1"] })
    ).toThrow(/đủ 2 lần/);
  });

  it("reset lại đủ 2 lần khi sang lượt mới", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "jose_delgado", hand: ["scope_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      turnPhase: "play",
      joseDelgadoUsesThisTurn: 2, // đã dùng đủ 2 lần ở lượt TRƯỚC của b
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.currentPlayerIndex).toBe(1);
    expect(next.joseDelgadoUsesThisTurn).toBe(0);
  });

  it("báo lỗi nếu bỏ lá NÂU (không phải xanh dương)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jose_delgado", hand: ["beer_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1"] })
    ).toThrow(/lá xanh dương/);
  });

  it("báo lỗi nếu bỏ lá VÀNG 'delayed' — KHÔNG tính là xanh dương cho kỹ năng này", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jose_delgado", hand: ["canteen_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["canteen_1"] })
    ).toThrow(/lá xanh dương/);
  });

  it("báo lỗi nếu dùng KHÔNG PHẢI lượt của mình", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "jose_delgado", hand: ["scope_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    expect(() => reduce(state, { type: "USE_ABILITY", playerId: "b", cardIds: ["scope_1"] })).toThrow();
  });
});
