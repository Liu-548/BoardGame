// Bộ mở rộng "custom_characters" (The Thief, xem House_Rule.txt mục I) — đầu
// lượt, SAU KHI đã rút 2 lá từ bộ bài NHƯ BÌNH THƯỜNG (không thay pha rút,
// khác Jesse Jones), CỘNG THÊM 1 draw!: ra Cơ/Rô thì được chọn 1 người khác
// còn sống để cướp ngẫu nhiên 1 lá của họ (tay rỗng thì thôi, KHÔNG rút bù).
// Ra đen thì hết, không có gì thêm.
//
// Nhân vật này HOÀN TOÀN KHÔNG CẦN state riêng trong GameState (giống Mary
// Rose) — mọi thứ tính lại ngay mỗi lần qua getEffectiveCharacterDefinition().
//
// Suit tra từ CARD_SUIT_RANKS (cards.ts): jail_1 = hearts (đỏ, khớp),
// jail_2 = spades (đen, không khớp), sombrero_1 = diamonds (đỏ, khớp) — cùng
// quy ước tái dùng id đã biết suit của test/marcel-marcelo.test.ts.
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

function makeState(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    players,
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
    fairKillerUsedThisTurn: false,
    gamblerUsesThisTurn: 0,
    vendettaUsedThisTurn: false,
    duelBangDrawPending: null,
    pendingGeneralStore: null,
    pendingNobodyCheck: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    drifterShield: {},
    drifterHiddenCard: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    sentinelUsed: {},
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: ["custom_characters"],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("The Thief — pha rút bình thường + draw! cộng thêm", () => {
  it("rút 2 lá bình thường xong -> đẩy NEED_DRAW_CHECK cho draw! cộng thêm", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_thief" }), makePlayer("b")],
      // deck.pop() rút từ CUỐI mảng — thứ tự rút là bang_1 rồi bang_2, còn
      // jail_1 (lá thứ 3) chưa bị đụng tới.
      { currentPlayerIndex: 0, turnPhase: "draw", deck: ["jail_1", "bang_2", "bang_1"] }
    );

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["bang_1", "bang_2"]); // đúng 2 lá, chưa đụng lá thứ 3
    expect(next.deck).toEqual(["jail_1"]);
    expect(next.turnPhase).toBe("play"); // completeDrawPhase() đã chuyển phase dù còn draw! đang chờ
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_thief" }, matchSuits: ["hearts", "diamonds"] },
    ]);
    expect(events).toEqual([{ type: "CARDS_DRAWN", playerId: "a", count: 2 }]);
  });

  it("nhân vật KHÔNG phải The Thief -> không có draw! cộng thêm nào", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")], {
      currentPlayerIndex: 0,
      turnPhase: "draw",
      deck: ["bang_1", "bang_2"],
    });

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([]);
  });

  it("ra chất đỏ (Cơ) -> đẩy NEED_PICK_THIEF_TARGET", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_thief" }), makePlayer("b")],
      {
        currentPlayerIndex: 0,
        deck: ["jail_1"], // hearts -> khớp
        pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_thief" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.pending).toEqual([{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }]);
    expect(events).toEqual([{ type: "DRAW_CHECK_RESOLVED", playerId: "a", cardId: "jail_1", matched: true }]);
  });

  it("ra chất Rô -> vẫn khớp (đủ cả 2 chất đỏ)", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_thief" }), makePlayer("b")],
      {
        currentPlayerIndex: 0,
        deck: ["sombrero_1"], // diamonds -> khớp
        pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_thief" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.pending).toEqual([{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }]);
  });

  it("ra chất đen (Bích/Nhép) -> KHÔNG có gì thêm", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_thief" }), makePlayer("b")],
      {
        currentPlayerIndex: 0,
        deck: ["jail_2"], // spades -> không khớp
        pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_thief" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.pending).toEqual([]);
    expect(events).toEqual([{ type: "DRAW_CHECK_RESOLVED", playerId: "a", cardId: "jail_2", matched: false }]);
  });
});

describe("The Thief — chọn mục tiêu cướp bài (NEED_PICK_THIEF_TARGET)", () => {
  it("chọn mục tiêu CÓ bài -> cướp NGẪU NHIÊN đúng 1 lá (tay chỉ 1 lá nên kết quả xác định)", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "the_thief" }),
        makePlayer("b", { hand: ["bang_1"] }),
      ],
      { pending: [{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[0].hand).toEqual(["bang_1"]);
    expect(next.players[1].hand).toEqual([]);
    expect(events).toEqual([{ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "bang_1" }]);
  });

  it("mục tiêu tay RỖNG -> không lấy được gì, KHÔNG rút bù", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_thief" }), makePlayer("b", { hand: [] })],
      { pending: [{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }], deck: ["bang_1"] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[0].hand).toEqual([]);
    expect(next.deck).toEqual(["bang_1"]); // không rút bù, bộ bài y nguyên
    expect(events).toEqual([]);
  });

  it("không kèm targetId -> tự bỏ qua, không lấy gì cả (KHÔNG bắt buộc, khác Marcel Marcelo)", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "the_thief" }),
        makePlayer("b", { hand: ["bang_1"] }),
      ],
      { pending: [{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hand).toEqual(["bang_1"]); // không đụng gì
    expect(events).toEqual([]);
  });

  it("không thể tự chọn chính mình", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_thief", hand: ["bang_1"] })],
      { pending: [{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }] }
    );

    expect(() => reduce(state, { type: "RESPOND", playerId: "a", targetId: "a" })).toThrow();
  });

  it("mục tiêu đã chết -> báo lỗi", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "the_thief" }),
        makePlayer("b", { alive: false, hand: ["bang_1"] }),
      ],
      { pending: [{ kind: "NEED_PICK_THIEF_TARGET", player: "a" }] }
    );

    expect(() => reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" })).toThrow();
  });
});

describe("The Thief — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn The Thief -> cũng có draw! cộng thêm sau pha rút", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "vera_custer" }), makePlayer("b")],
      {
        currentPlayerIndex: 0,
        turnPhase: "draw",
        deck: ["jail_1", "bang_2", "bang_1"], // deck.pop() rút từ cuối, xem ghi chú ở test trên
        veraCusterBorrowedCharacterId: "the_thief",
      }
    );

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_thief" }, matchSuits: ["hearts", "diamonds"] },
    ]);
  });
});
