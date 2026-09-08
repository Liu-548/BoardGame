// Bộ mở rộng "custom_characters" (Paul Pauper, xem docs/bang-rules/House_Rule.txt mục I) —
// mỗi khi 1 NGƯỜI CHƠI KHÁC đánh HƠN 3 LÁ trong lượt của họ (từ lá thứ 4 trở
// đi), Paul Pauper draw! 1 lần MỖI LÁ. Ra đỏ (Cơ/Rô): lá đó bị CHẶN HOÀN
// TOÀN — không hiệu ứng gì xảy ra (coi như lá chưa từng được đánh), và lá đi
// THẲNG vào tay Paul Pauper thay vì chồng bỏ/sân. Ra đen: lá xử lý y hệt bình
// thường. KHÔNG tính lượt của chính Paul Pauper. Chặn NGAY ĐẦU
// handlePlayCard(), TRƯỚC mọi play*() — lá VẪN CÒN NGUYÊN trong tay người
// đánh trong lúc chờ draw! giải quyết (xem GameState.pendingPaulPauperPlay).
//
// ĐÃ CHỐT với chủ dự án (2026-08-23): lá bị chặn KHÔNG tính vào
// cardsPlayedThisTurn — "coi như lá chưa từng được đánh" theo đúng nghĩa
// đen, kể cả cho việc đếm lá tiếp theo trong lượt.
//
// Suit tra từ CARD_SUIT_RANKS (cards.ts): bang_1 = spades (đen, không khớp),
// jail_1 = hearts (đỏ, khớp) — cùng quy ước các test khác trong bộ này.
// deck.pop() rút từ CUỐI mảng (xem drawTopCard() ở core/deck.ts).
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

describe("Paul Pauper — chặn lá thứ 4+: hoãn lại, đẩy draw!", () => {
  it("lá thứ 4 -> hoãn NGAY, lá vẫn còn nguyên trong tay, KHÔNG có event nào", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "paul_pauper" }),
        makePlayer("c"),
      ],
      { cardsPlayedThisTurn: 3 }
    );

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });

    expect(next.players[0].hand).toEqual(["bang_1"]); // vẫn còn nguyên
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] },
    ]);
    expect(next.pendingPaulPauperPlay).toEqual({
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });
    expect(events).toEqual([]);
  });

  it("chưa đủ 3 lá (đây mới là lá thứ 3) -> KHÔNG hoãn, chơi bình thường", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "paul_pauper" }),
        makePlayer("c"),
      ],
      { cardsPlayedThisTurn: 2 }
    );

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });

    expect(next.players[0].hand).toEqual([]);
    expect(next.cardsPlayedThisTurn).toBe(3);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } }]);
    expect(events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "bang_1", targetId: "c" }]);
  });

  it("không có Paul Pauper còn sống nào trên bàn -> không hoãn dù đủ 3 lá", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "paul_pauper", alive: false }),
        makePlayer("c"),
      ],
      { cardsPlayedThisTurn: 3 }
    );

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } }]);
  });

  it("KHÔNG tính lượt của chính Paul Pauper — anh ta không tự chặn lá của mình", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "paul_pauper", hand: ["bang_1"] }),
        makePlayer("b"),
      ],
      { currentPlayerIndex: 0, cardsPlayedThisTurn: 3 }
    );

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });
});

describe("Paul Pauper — draw! ra đỏ: chặn trọn, lá về tay Paul Pauper", () => {
  it("lá NÂU có mục tiêu (Bang!) bị chặn -> KHÔNG đẩy NEED_MISSED, lá sang tay Paul Pauper", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "paul_pauper", hand: [] }),
        makePlayer("c"),
      ],
      {
        cardsPlayedThisTurn: 3,
        pendingPaulPauperPlay: { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" },
        deck: ["c1", "jail_1"], // đỉnh (jail_1, hearts) rút trước -> khớp
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[0].hand).toEqual([]); // bang_1 rời tay a
    expect(next.players[1].hand).toEqual(["bang_1"]); // sang tay Paul Pauper
    expect(next.discardPile).toEqual(["jail_1"]); // chỉ lá KIỂM TRA vào chồng bỏ, KHÔNG phải bang_1
    expect(next.pending).toEqual([]); // KHÔNG có NEED_MISSED nào cho c
    expect(next.pendingPaulPauperPlay).toBeNull();
    expect(next.cardsPlayedThisTurn).toBe(3); // KHÔNG tăng — "coi như lá chưa từng được đánh"
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
      { type: "PAUL_PAUPER_INTERCEPTED", playerId: "b", fromPlayerId: "a", cardId: "bang_1" },
    ]);
  });

  it("lá trang bị (xanh dương, Barrel) bị chặn -> KHÔNG gắn lên sân, đi thẳng vào tay Paul Pauper", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["barrel_1"] }),
        makePlayer("b", { characterId: "paul_pauper", hand: [] }),
      ],
      {
        cardsPlayedThisTurn: 3,
        pendingPaulPauperPlay: { type: "PLAY_CARD", playerId: "a", cardId: "barrel_1" },
        deck: ["c1", "jail_1"],
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[0].equipment).toEqual([]); // KHÔNG gắn sân
    expect(next.players[0].hand).toEqual([]);
    expect(next.players[1].hand).toEqual(["barrel_1"]);
  });

  it("lá NÂU không mục tiêu, chỉ lợi cho chính người đánh (Bia) bị chặn -> KHÔNG hồi máu, mất trắng cả lá", () => {
    const state = makeState(
      [
        makePlayer("a", { hp: 2, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("b", { characterId: "paul_pauper", hand: [] }),
      ],
      {
        cardsPlayedThisTurn: 3,
        pendingPaulPauperPlay: { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" },
        deck: ["c1", "jail_1"],
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[0].hp).toBe(2); // KHÔNG hồi máu
    expect(next.players[1].hand).toEqual(["beer_1"]);
  });
});

describe("Paul Pauper — draw! ra đen: xử lý y hệt bình thường", () => {
  it("Bang! không bị chặn -> đẩy NEED_MISSED bình thường, cardsPlayedThisTurn tăng lên 4", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "paul_pauper", hand: [] }),
        makePlayer("c"),
      ],
      {
        cardsPlayedThisTurn: 3,
        pendingPaulPauperPlay: { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" },
        // đỉnh (bang_23, table[22] = clubs Q) rút trước -> KHÔNG khớp (đen).
        deck: ["jail_1", "bang_23"],
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[0].hand).toEqual([]); // bang_1 rời tay a, xử lý bình thường
    expect(next.players[1].hand).toEqual([]); // Paul Pauper KHÔNG nhận gì
    expect(next.discardPile).toEqual(["bang_23", "bang_1"]); // lá kiểm tra, rồi bang_1 (lá NÂU luôn vào chồng bỏ ngay khi đánh, kể cả đang chờ Missed!)
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } }]);
    expect(next.pendingPaulPauperPlay).toBeNull();
    expect(next.cardsPlayedThisTurn).toBe(4); // TĂNG — lá này ĐÃ thật sự được đánh
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "bang_23", matched: false },
      { type: "CARD_PLAYED", playerId: "a", cardId: "bang_1", targetId: "c" },
    ]);
  });
});

describe("Paul Pauper — lá bị chặn KHÔNG tính vào cardsPlayedThisTurn (chốt 2026-08-23)", () => {
  it("lá thứ 4 bị chặn (đỏ) -> lá thứ 5 kế tiếp VẪN bị hỏi lại (đếm vẫn dừng ở 3)", () => {
    // Sau khi lá thứ 4 (bang_1) bị chặn, cardsPlayedThisTurn KHÔNG tăng (vẫn
    // là 3) — mô phỏng trực tiếp trạng thái NGAY SAU đó (không replay lại từ
    // đầu, vì hành vi "không tính" đã được test riêng ở trên).
    const state = makeState(
      [
        makePlayer("a", { hand: ["beer_1"] }), // lá thứ 5 trong lượt
        makePlayer("b", { characterId: "paul_pauper" }),
      ],
      { cardsPlayedThisTurn: 3 }
    );

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] },
    ]);
    expect(next.players[0].hand).toEqual(["beer_1"]); // vẫn hoãn, vẫn còn nguyên
  });
});

describe("Paul Pauper — sang lượt mới reset cardsPlayedThisTurn", () => {
  it("END_TURN -> cardsPlayedThisTurn về 0", () => {
    const state = makeState(
      [makePlayer("a", { hand: [] }), makePlayer("b", { hand: [] })],
      { currentPlayerIndex: 0, turnPhase: "play", cardsPlayedThisTurn: 5 }
    );

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.cardsPlayedThisTurn).toBe(0);
  });
});

describe("Paul Pauper — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn Paul Pauper -> cũng chặn được lá thứ 4+", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "vera_custer", hand: [] }),
        makePlayer("c"),
      ],
      { cardsPlayedThisTurn: 3, veraCusterBorrowedCharacterId: "paul_pauper" }
    );

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "paul_pauper" }, matchSuits: ["hearts", "diamonds"] },
    ]);
  });
});
