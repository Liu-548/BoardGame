// Bộ mở rộng "custom_characters" (Victor Boozer, xem docs/bang-rules/House_Rule.txt mục I) —
// mỗi khi NGƯỜI KHÁC (không phải chính mình) dùng lá Beer hồi máu THÀNH CÔNG,
// Victor Boozer hồi thêm 1 máu ngay lập tức (không vượt máu tối đa). CHỈ lá
// Beer — Saloon/Tequila/Canteen/Whisky/Sid Ketchum không kích hoạt. Beer
// dùng để cứu mạng (hồi sinh tự động) không đi qua nhánh này.
//
// LƯU Ý: luật gốc "Bia vô tác dụng khi bàn chỉ còn 2 người sống" (xem
// assertBeerCanHeal()/playBeer() trong reduce.ts) áp dụng độc lập với Victor Boozer
// — mọi test ở đây (trừ test kiểm tra ĐÚNG luật đó) dùng ÍT NHẤT 3 người còn
// sống để lá Bia hồi máu thật.
//
// Nhân vật này HOÀN TOÀN KHÔNG CẦN state riêng trong GameState — hook
// onOtherPlayerHealedByBeer tự tính lại mỗi lần qua getEffectiveCharacterHooks(),
// không có gì để lưu theo thời gian.
import { describe, expect, it } from "vitest";
import { reduce } from "../../src/games/bang/core/reduce";
import type { GameState, PlayerState } from "../../src/games/bang/core/types";

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
    pendingPaulPauperPlay: null,
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
    cardsPlayedThisTurn: 0,
    ...overrides,
  };
}

describe("Victor Boozer — ăn theo Beer của người khác", () => {
  it("người khác uống Bia hồi máu thành công -> Victor Boozer hồi thêm 1 máu", () => {
    const state = makeState([
      makePlayer("a", { hp: 3, maxHp: 4, hand: ["beer_1"] }),
      makePlayer("b", { characterId: "the_drunker", hp: 2, maxHp: 4 }),
      makePlayer("c"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "beer_1",
    });

    expect(next.players[0].hp).toBe(4); // người uống hồi bình thường
    expect(next.players[1].hp).toBe(3); // Victor Boozer ăn theo +1
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "beer_1" },
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
      { type: "HP_RESTORED", playerId: "b", amount: 1 },
    ]);
  });

  it("không vượt quá máu tối đa của Victor Boozer", () => {
    const state = makeState([
      makePlayer("a", { hp: 3, maxHp: 4, hand: ["beer_1"] }),
      makePlayer("b", { characterId: "the_drunker", hp: 4, maxHp: 4 }), // đã đầy máu
      makePlayer("c"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "beer_1",
    });

    expect(next.players[1].hp).toBe(4); // không đổi
    expect(events.filter((e) => e.type === "HP_RESTORED")).toEqual([
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
    ]); // không có HP_RESTORED nào cho Victor Boozer
  });

  it("Bia TỰ ĐÁNH của chính Victor Boozer không được ăn theo", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_drunker", hp: 2, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("c"),
      ],
      { currentPlayerIndex: 1 }
    );

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "b", cardId: "beer_1",
    });

    expect(next.players[1].hp).toBe(3); // chỉ hồi 1 máu bình thường, KHÔNG +1 nữa
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "b", cardId: "beer_1" },
      { type: "HP_RESTORED", playerId: "b", amount: 1 },
    ]);
  });

  it("luật gốc: bàn chỉ còn 2 người sống -> Bia vô tác dụng -> Victor Boozer cũng KHÔNG ăn theo", () => {
    const state = makeState([
      makePlayer("a", { hp: 3, maxHp: 4, hand: ["beer_1"] }),
      makePlayer("b", { characterId: "the_drunker", hp: 2, maxHp: 4 }),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "beer_1",
    });

    expect(next.players[0].hp).toBe(3); // không đổi — Bia vô tác dụng
    expect(next.players[1].hp).toBe(2); // Victor Boozer không ăn theo
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "beer_1" },
      { type: "BEER_INEFFECTIVE", playerId: "a" },
    ]);
  });

  it("CHỈ Beer — Saloon KHÔNG kích hoạt ăn theo (Victor Boozer đã đầy máu để cô lập hiệu ứng)", () => {
    const state = makeState([
      makePlayer("a", { hp: 3, maxHp: 4, hand: ["saloon_1"] }),
      makePlayer("b", { characterId: "the_drunker", hp: 4, maxHp: 4 }), // đầy máu — Saloon tự thân không đổi gì
      makePlayer("c"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "saloon_1",
    });

    expect(next.players[1].hp).toBe(4); // Saloon không đổi (đã đầy) — nếu Victor Boozer ăn theo sẽ vẫn là 4 vì maxHp, nên xét events là bằng chứng chính
    expect(events.filter((e) => e.type === "HP_RESTORED")).toEqual([
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
    ]); // KHÔNG có HP_RESTORED thứ 2 nào cho "b" — Saloon không kích hoạt Victor Boozer
  });

  it("Beer dùng để CỨU MẠNG (hồi sinh tự động) KHÔNG kích hoạt ăn theo", () => {
    const state = makeState(
      [
        makePlayer("a", { hp: 1, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("b", { characterId: "the_drunker", hp: 2, maxHp: 4 }),
        makePlayer("c", { hand: ["bang_1"] }),
      ],
      { currentPlayerIndex: 2 }
    );

    // "a" trúng Bang! xuống 0 máu, tự động bỏ Bia để hồi sinh (BEER_SAVED_FROM_DEATH)
    // — nhánh này KHÔNG đi qua playBeer(), nên Victor Boozer không ăn theo.
    const played = reduce(state, { type: "PLAY_CARD", playerId: "c", cardId: "bang_1", targetId: "a" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hp).toBe(1); // hồi sinh về 1 máu
    expect(next.players[1].hp).toBe(2); // Victor Boozer KHÔNG ăn theo
    expect(events.some((e) => e.type === "BEER_SAVED_FROM_DEATH")).toBe(true);
    expect(events.some((e) => e.type === "HP_RESTORED")).toBe(false);
  });
});

describe("Victor Boozer — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn Victor Boozer -> cũng ăn theo Beer của người khác", () => {
    const state = makeState(
      [
        makePlayer("a", { hp: 3, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("b", { characterId: "vera_custer", hp: 2, maxHp: 4 }),
        makePlayer("c"),
      ],
      { veraCusterBorrowedCharacterId: "the_drunker" }
    );

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[1].hp).toBe(3);
  });
});
