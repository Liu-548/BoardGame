// Bộ mở rộng "custom_characters" (The Gambler, xem House_Rule.txt mục I) —
// trong lượt của mình, bỏ ĐÚNG 2 lá bất kỳ trên tay rồi lật bài kiểm tra
// (draw!): ra Cơ/Rô thì rút 3 lá, ra Nhép/Bích thì rút 1 lá. Không giới hạn
// số lần trong lượt, miễn còn đủ 2 lá.
//
// Nhân vật này HOÀN TOÀN KHÔNG CẦN state riêng trong GameState (giống Mary
// Rose/The Thief) — mọi thứ tính lại ngay mỗi lần qua getEffectiveCharacterDefinition().
//
// Suit tra từ CARD_SUIT_RANKS (cards.ts): jail_1 = hearts (đỏ, khớp),
// jail_2 = spades (đen, không khớp) — cùng quy ước test/the-thief.test.ts.
// deck.pop() rút từ CUỐI mảng (xem drawTopCard() ở core/deck.ts).
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

describe("The Gambler — dùng kỹ năng (USE_ABILITY): bỏ 2 lá rồi draw!", () => {
  it("bỏ đúng 2 lá -> vào chồng bỏ, đẩy NEED_DRAW_CHECK, KHÔNG rút gì ngay", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_gambler", hand: ["bang_1", "bang_2", "beer_1"] }),
      makePlayer("b"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1", "bang_2"],
    });

    expect(next.players[0].hand).toEqual(["beer_1"]);
    // Bỏ theo chỉ số GIẢM DẦN (xem useGamblerDraw()) -> thứ tự vào chồng bỏ
    // ĐẢO NGƯỢC so với cardIds truyền vào (bang_2 rời tay trước bang_1).
    expect(next.discardPile).toEqual(["bang_2", "bang_1"]);
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_gambler" }, matchSuits: ["hearts", "diamonds"] },
    ]);
    expect(events).toEqual([{ type: "GAMBLER_DISCARDED", playerId: "a", cardIds: ["bang_1", "bang_2"] }]);
  });

  it("KHÔNG phải lượt của mình -> báo lỗi", () => {
    const state = makeState([
      makePlayer("a"),
      makePlayer("b", { characterId: "the_gambler", hand: ["bang_1", "bang_2"] }),
    ]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "b", cardIds: ["bang_1", "bang_2"] })
    ).toThrow();
  });

  it("còn việc đang chờ xử lý -> báo lỗi", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_gambler", hand: ["bang_1", "bang_2"] }), makePlayer("b")],
      { pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "barrel" }, matchSuits: ["hearts"] }] }
    );

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1", "bang_2"] })
    ).toThrow();
  });

  it("không đúng 2 lá KHÁC NHAU -> báo lỗi", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_gambler", hand: ["bang_1", "bang_2"] }),
      makePlayer("b"),
    ]);

    expect(() => reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1"] })).toThrow();
    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1", "bang_1"] })
    ).toThrow();
  });

  it("lá không nằm trong tay -> báo lỗi", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_gambler", hand: ["bang_1"] }),
      makePlayer("b"),
    ]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1", "beer_1"] })
    ).toThrow();
  });

  it("không giới hạn số lần trong lượt — dùng lại được ngay sau khi giải quyết xong lần đầu", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "the_gambler", hand: ["bang_1", "bang_2", "beer_1", "beer_2"] }),
        makePlayer("b"),
      ],
      // deck.pop() rút từ CUỐI mảng: jail_2 (chất kiểm tra, spades -> không
      // khớp) rút TRƯỚC, rồi mới tới c1 (phần thưởng, rút 1 lá vì không khớp).
      { deck: ["c1", "jail_2"] }
    );

    const { state: afterUse } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1", "bang_2"],
    });
    const { state: afterDraw } = reduce(afterUse, { type: "RESPOND", playerId: "a" });

    expect(afterDraw.players[0].hand).toEqual(["beer_1", "beer_2", "c1"]);
    expect(afterDraw.pending).toEqual([]);

    // Dùng lại lần 2 ngay trong CÙNG lượt — không có field nào chặn (khác Doc
    // Holyday/José Delgado giới hạn số lần/lượt).
    const { state: next2, events: events2 } = reduce(afterDraw, {
      type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1", "beer_2"],
    });

    expect(next2.players[0].hand).toEqual(["c1"]);
    expect(next2.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_gambler" }, matchSuits: ["hearts", "diamonds"] },
    ]);
    expect(events2).toEqual([{ type: "GAMBLER_DISCARDED", playerId: "a", cardIds: ["beer_1", "beer_2"] }]);
  });
});

describe("The Gambler — kết quả draw! (resolveDrawCheck)", () => {
  it("ra chất đỏ (Cơ) -> rút 3 lá (lá kiểm tra KHÔNG tính vào tay, chỉ 3 lá thưởng)", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_gambler" }), makePlayer("b")],
      {
        // đỉnh (jail_1, hearts) rút trước làm lá KIỂM TRA -> khớp -> vào
        // discardPile, không vào tay. 3 lá còn lại (c1/c2/c3) là PHẦN THƯỞNG.
        deck: ["c3", "c2", "c1", "jail_1"],
        pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_gambler" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
    expect(next.discardPile).toEqual(["jail_1"]);
    expect(next.deck).toEqual([]);
    expect(next.pending).toEqual([]);
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "a", cardId: "jail_1", matched: true },
      { type: "CARDS_DRAWN", playerId: "a", count: 3 },
    ]);
  });

  it("ra chất đen (Bích) -> rút 1 lá (cộng thêm lá kiểm tra KHÔNG khớp vào chồng bỏ)", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_gambler" }), makePlayer("b")],
      {
        // đỉnh (jail_2, spades) rút trước làm lá KIỂM TRA -> không khớp. c1
        // là PHẦN THƯỞNG (1 lá).
        deck: ["c1", "jail_2"],
        pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_gambler" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1"]);
    expect(next.discardPile).toEqual(["jail_2"]);
    expect(next.deck).toEqual([]);
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "a", cardId: "jail_2", matched: false },
      { type: "CARDS_DRAWN", playerId: "a", count: 1 },
    ]);
  });
});

describe("The Gambler — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn The Gambler -> dùng được kỹ năng bỏ 2 lá rồi draw!", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "vera_custer", hand: ["bang_1", "bang_2"] }), makePlayer("b")],
      { veraCusterBorrowedCharacterId: "the_gambler" }
    );

    const { state: next } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1", "bang_2"],
    });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_gambler" }, matchSuits: ["hearts", "diamonds"] },
    ]);
  });
});
