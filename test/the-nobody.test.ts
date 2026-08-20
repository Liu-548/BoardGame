// Bộ mở rộng "custom_characters" (The Nobody, xem House_Rule.txt mục I) —
// bị NHẮM TỚI bởi bất kỳ lá nào, BẮT BUỘC draw! 1 lá — ra Bích thì lá đó VÔ
// HIỆU HOÀN TOÀN. NHÓM A (Bang!/Gatling, Indians!, Đấu tay đôi, Cat Balou/Can
// Can/Brawl, Cửa hàng tổng hợp) VÀ NHÓM B (Panic!/Jail/Saloon/Tequila/Marcel
// companion — lá áp dụng NGAY LẬP TỨC, phải hoãn lại rồi mới áp dụng) đều đã
// cài đủ.
//
// Suit tra từ CARD_SUIT_RANKS (cards.ts): bang_1 = spades (đen, dùng làm lá
// "khớp" cho draw! của The Nobody), missed_1 = diamonds (đen — dùng làm lá
// "không khớp"), indians_1 = hearts (đỏ — dùng riêng cho test bẫy Blessing/Curse).
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

describe("The Nobody — Bang! đơn lẻ", () => {
  it("draw! ra Bích -> huỷ hoàn toàn NEED_MISSED, không mất máu, bắn THE_NOBODY_IMMUNE", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { characterId: "the_nobody" }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] }; // bang_1 = Bích A
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(events.map((e) => e.type)).toEqual(["DRAW_CHECK_RESOLVED", "THE_NOBODY_IMMUNE"]);
  });

  it("draw! KHÔNG ra Bích -> NEED_MISSED giữ nguyên, chờ đỡ/chịu mất máu bình thường", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { characterId: "the_nobody" }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const drawState = { ...played.state, deck: ["missed_1"] }; // missed_1 = Rô (không khớp)
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(events.map((e) => e.type)).toEqual(["DRAW_CHECK_RESOLVED"]);
  });
});

describe("The Nobody — Gatling (nhắm cả bàn, chỉ ảnh hưởng riêng anh ta)", () => {
  it("chỉ huỷ NEED_MISSED của chính The Nobody, người khác vẫn phải đỡ bình thường", () => {
    const state = makeState([
      makePlayer("a", { hand: ["gatling_1"] }),
      makePlayer("b", { characterId: "the_nobody" }),
      makePlayer("c"),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "gatling_1" });
    // otherAlivePlayersInOrder đẩy ngược để người gần nhất (b) nằm TRÊN cùng — the_nobody check của b còn ở trên b nữa.
    expect(played.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "c", source: { card: "gatling", from: "a" } },
      { kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "gatling", from: "a" } }]);
    expect(next.players[1].hp).toBe(4); // b (The Nobody) không mất máu
  });
});

describe("The Nobody — Indians!", () => {
  it("draw! ra Bích -> huỷ NEED_DISCARD_BANG, không mất máu, không cần bỏ Bang!", () => {
    const state = makeState([
      makePlayer("a", { hand: ["indians_1"] }),
      makePlayer("b", { characterId: "the_nobody", hand: ["bang_1"] }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1" });
    const drawState = { ...played.state, deck: ["bang_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4);
    expect(next.players[1].hand).toEqual(["bang_1"]); // vẫn giữ nguyên lá Bang!, không cần bỏ
  });
});

describe("The Nobody — Đấu tay đôi", () => {
  it("The Nobody là mục tiêu ban đầu, draw! ra Bích -> huỷ NEED_DUEL_RESPONSE, không mất máu", () => {
    const state = makeState([
      makePlayer("a", { hand: ["duel_1"] }),
      makePlayer("b", { characterId: "the_nobody" }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "duel_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_DUEL_RESPONSE", player: "b", opponent: "a", source: { card: "duel", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4);
  });

  it("The Nobody trở thành người phải đáp trả SAU KHI đổi vai (không phải mục tiêu ban đầu) vẫn được hỏi", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_nobody" }), // người khởi xướng Duel, không có Bang! trên tay
      makePlayer("b", { hand: ["bang_1"] }),
    ]);

    const played = reduce(
      { ...state, players: [{ ...state.players[0], hand: ["duel_1"] }, state.players[1]] },
      { type: "PLAY_CARD", playerId: "a", cardId: "duel_1", targetId: "b" }
    );
    // b bỏ Bang! để đỡ -> đổi vai, giờ a (The Nobody) phải trả lời -> đẩy thêm the_nobody check cho a
    const flipped = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "bang_1" });
    expect(flipped.state.pending).toEqual([
      { kind: "NEED_DUEL_RESPONSE", player: "a", opponent: "b", source: { card: "duel", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_nobody" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...flipped.state, deck: ["bang_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "a" });
    expect(next.pending).toEqual([]);
    expect(next.players[0].hp).toBe(4); // a không mất máu dù hết Bang! để đỡ
  });
});

describe("The Nobody — Cat Balou", () => {
  it("draw! ra Bích -> huỷ NEED_DISCARD_FROM_ZONE, không mất lá nào", () => {
    const state = makeState([
      makePlayer("a", { hand: ["cat_balou_1"] }),
      makePlayer("b", { characterId: "the_nobody", hand: ["missed_1"] }),
    ]);

    const played = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "cat_balou_1",
      targetId: "b",
      targetZone: "hand",
    });
    const drawState = { ...played.state, deck: ["bang_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hand).toEqual(["missed_1"]);
  });
});

describe("The Nobody — thứ tự với Barrel (draw! của The Nobody chạy TRƯỚC)", () => {
  it("có Barrel + bị Bang!, draw! ra Bích -> huỷ LUÔN cả Barrel draw! chưa xử lý", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { characterId: "the_nobody", equipment: ["barrel_1"] }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "barrel" }, matchSuits: ["hearts"] },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] }; // Bích
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    // Pending rỗng hẳn — không còn phải lật Barrel nữa, đúng "The Nobody chạy TRƯỚC".
    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4);
  });
});

describe("The Nobody — bẫy Blessing/Curse (đã chốt: đọc chất THẬT, không qua getEffectiveSuit)", () => {
  it("Curse đang chạy (mọi lá bị coi là Bích) nhưng lá thật là Đỏ -> KHÔNG khớp, không miễn nhiễm", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b", { characterId: "the_nobody" })],
      { activeEventId: "curse" }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const drawState = { ...played.state, deck: ["indians_1"] }; // indians_1 = Cơ (đỏ) — dưới Curse getEffectiveSuit() sẽ trả "spades"
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    // KHÔNG bị huỷ — NEED_MISSED vẫn còn nguyên, chứng minh đọc chất THẬT chứ không qua Curse.
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(events.find((e) => e.type === "DRAW_CHECK_RESOLVED")).toMatchObject({ matched: false });
  });
});

describe("The Nobody — Cửa hàng tổng hợp (lá khó nhất nhóm A, tách 2 giai đoạn)", () => {
  it("không ai bị bỏ qua (draw! không khớp) -> lật ĐỦ số người sống, người đánh chọn trước như thường", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["general_store_1"] }), makePlayer("b", { characterId: "the_nobody" }), makePlayer("c")],
      { deck: ["c1", "c2", "c3", "missed_1"] } // missed_1 = Rô (không khớp) — bị pop đầu tiên cho draw! kiểm tra
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "general_store_1" });
    // Giai đoạn 1: HOÃN lật bài, chỉ đẩy draw! kiểm tra cho b — chưa có STORE_REVEALED.
    expect(played.events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "general_store_1" }]);
    expect(played.state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody_store" }, matchSuits: ["spades"] },
    ]);

    const { events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    // Không khớp -> lật đủ 3 lá (bằng số người sống), a chọn trước như luật gốc.
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "missed_1", matched: false },
      { type: "STORE_REVEALED", cardIds: ["c3", "c2", "c1"] },
    ]);
  });

  it("bị bỏ qua (draw! khớp Bích) -> lật ÍT HƠN 1 lá, loại hẳn khỏi vòng chọn, không mất máu/không phát bài", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["general_store_1"] }), makePlayer("b", { characterId: "the_nobody" }), makePlayer("c")],
      { deck: ["c1", "c2", "bang_1"] } // bang_1 = Bích — khớp, bị pop đầu tiên cho draw! kiểm tra
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "general_store_1" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "bang_1", matched: true },
      { type: "THE_NOBODY_IMMUNE", playerId: "b" },
      { type: "STORE_REVEALED", cardIds: ["c2", "c1"] }, // 3 người sống - 1 bị bỏ qua = lật 2 lá
    ]);
    // a (người đánh, không bị bỏ qua) vẫn chọn trước — b KHÔNG xuất hiện trong pending.
    expect(next.pending).toEqual([
      { kind: "NEED_PICK_STORE_CARD", player: "a", options: ["c2", "c1"], skippedIds: ["b"] },
    ]);

    // Chơi hết vòng chọn: a chọn, rồi tới c (KHÔNG BAO GIỜ tới b).
    const afterA = reduce(next, { type: "RESPOND", playerId: "a", cardId: "c2" });
    expect(afterA.state.pending).toEqual([
      { kind: "NEED_PICK_STORE_CARD", player: "c", options: ["c1"], skippedIds: ["b"] },
    ]);
    const afterC = reduce(afterA.state, { type: "RESPOND", playerId: "c", cardId: "c1" });
    expect(afterC.state.pending).toEqual([]);
    expect(afterC.state.players[1]).toMatchObject({ hp: 4, hand: [] }); // b không được phát gì, không mất máu
  });

  it("chính The Nobody là người đánh lá VÀ bị bỏ qua -> người chọn ĐẦU TIÊN là người kế tiếp, không phải anh ta", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "the_nobody", hand: ["general_store_1"] }), makePlayer("c")],
      { deck: ["c1", "c2", "bang_1"], currentPlayerIndex: 1 }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "general_store_1" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    // b vừa là người đánh vừa bị bỏ qua -> người chọn đầu tiên là c (kế tiếp b theo chiều ghế).
    expect(next.pending).toEqual([
      { kind: "NEED_PICK_STORE_CARD", player: "c", options: ["c2", "c1"], skippedIds: ["b"] },
    ]);
  });
});

// NHÓM B — Panic!/Jail/Saloon/Tequila/Marcel companion. KHÁC hẳn nhóm A: các
// lá này áp dụng NGAY LẬP TỨC bình thường (không có pending sẵn để huỷ), nên
// draw!-check phải HOÃN LẠI phần áp dụng, xem GameState.pendingNobodyCheck.
describe("The Nobody — Panic! (nhóm B, hoãn phần chuyển lá)", () => {
  it("draw! ra Bích -> lá KHÔNG rời tay mục tiêu, không ai được gì", () => {
    const state = makeState([
      makePlayer("a", { hand: ["panic_1"] }),
      makePlayer("b", { characterId: "the_nobody", hand: ["missed_1"] }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody_panic" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] }; // Bích
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hand).toEqual(["missed_1"]); // vẫn còn nguyên
    expect(next.players[0].hand).toEqual([]); // a không cướp được gì
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "bang_1", matched: true },
      { type: "THE_NOBODY_IMMUNE", playerId: "b" },
    ]);
  });

  it("draw! KHÔNG khớp -> cướp bình thường, đúng ĐÚNG lá đã xác định lúc đánh (RNG tất định)", () => {
    const state = makeState([
      makePlayer("a", { hand: ["panic_1"] }),
      makePlayer("b", { characterId: "the_nobody", hand: ["missed_1"] }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });
    const drawState = { ...played.state, deck: ["missed_2"] }; // Rô — không khớp
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hand).toEqual([]); // mất lá
    expect(next.players[0].hand).toEqual(["missed_1"]); // a cướp được
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "missed_2", matched: false },
      { type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "missed_1" },
    ]);
  });
});

describe("The Nobody — Jail (nhóm B, hoãn phần gắn lá)", () => {
  it("draw! ra Bích -> Jail KHÔNG gắn được, bị bỏ vào chồng bỏ, không xét Marcel companion", () => {
    const state = makeState([
      makePlayer("a", { hand: ["jail_1"] }),
      makePlayer("b", { characterId: "the_nobody" }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody_jail" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] }; // Bích
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].equipment).toEqual([]); // không bị nhốt
    expect(next.discardPile).toContain("jail_1"); // lá vẫn phải có chỗ đi
    expect(events.some((e) => e.type === "THE_NOBODY_IMMUNE")).toBe(true);
  });

  it("draw! KHÔNG khớp -> gắn Jail bình thường như luật gốc", () => {
    const state = makeState([
      makePlayer("a", { hand: ["jail_1"] }),
      makePlayer("b", { characterId: "the_nobody" }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b" });
    const drawState = { ...played.state, deck: ["missed_1"] }; // không khớp
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].equipment).toEqual(["jail_1"]);
  });
});

describe("The Nobody — Saloon (nhóm B, hồi máu 'cả bàn')", () => {
  it("người khác vẫn hồi máu NGAY, chỉ riêng The Nobody hoãn lại chờ draw!", () => {
    const state = makeState([
      makePlayer("a", { hand: ["saloon_1"], hp: 2, maxHp: 4 }),
      makePlayer("b", { characterId: "the_nobody", hp: 1, maxHp: 3 }),
      makePlayer("c", { hp: 3, maxHp: 4 }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "saloon_1" });
    // a và c hồi máu NGAY (không chờ b) — đúng vì Saloon KHÔNG cần biết trước như Cửa hàng tổng hợp.
    expect(played.events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "saloon_1" },
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
      { type: "HP_RESTORED", playerId: "c", amount: 1 },
    ]);
    expect(played.state.players[0].hp).toBe(3);
    expect(played.state.players[2].hp).toBe(4);
    expect(played.state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody_saloon" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] }; // Bích -> bị bỏ qua
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });
    expect(next.players[1].hp).toBe(1); // không hồi
    expect(next.pending).toEqual([]);
  });

  it("draw! KHÔNG khớp -> The Nobody cũng được hồi +1 máu như bình thường", () => {
    const state = makeState([
      makePlayer("a", { hand: ["saloon_1"] }),
      makePlayer("b", { characterId: "the_nobody", hp: 1, maxHp: 3 }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "saloon_1" });
    const drawState = { ...played.state, deck: ["missed_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2);
  });
});

describe("The Nobody — Tequila (nhóm B, không cần state phụ)", () => {
  it("draw! ra Bích -> không hồi máu", () => {
    const state = makeState([
      makePlayer("a", { hand: ["tequila_1", "missed_2"] }),
      makePlayer("b", { characterId: "the_nobody", hp: 1, maxHp: 3 }),
    ]);

    const played = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "tequila_1",
      targetId: "b",
      extraDiscardCardId: "missed_2",
    });
    expect(played.state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody_tequila" }, matchSuits: ["spades"] },
    ]);

    const drawState = { ...played.state, deck: ["bang_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(1);
  });

  it("draw! KHÔNG khớp -> hồi +1 máu bình thường", () => {
    const state = makeState([
      makePlayer("a", { hand: ["tequila_1", "missed_2"] }),
      makePlayer("b", { characterId: "the_nobody", hp: 1, maxHp: 3 }),
    ]);

    const played = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "tequila_1",
      targetId: "b",
      extraDiscardCardId: "missed_2",
    });
    const drawState = { ...played.state, deck: ["missed_1"] };
    const { state: next } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2);
  });
});

describe("The Nobody — Marcel Marcelo 'cùng vào tù' (nhóm B)", () => {
  it("companion được chọn draw! ra Bích -> KHÔNG ghi nhận companion", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "marcel_marcelo" }), makePlayer("b", { characterId: "the_nobody" })],
      { pending: [{ kind: "NEED_PICK_MARCEL_COMPANION", player: "a" }] }
    );

    const picked = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });
    expect(picked.state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "the_nobody_marcel_companion" }, matchSuits: ["spades"] },
    ]);
    expect(picked.events).toEqual([]);

    const drawState = { ...picked.state, deck: ["bang_1"] }; // Bích
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.marcelJailCompanion).toEqual({});
    expect(events.some((e) => e.type === "MARCEL_COMPANION_PICKED")).toBe(false);
    expect(events.some((e) => e.type === "THE_NOBODY_IMMUNE")).toBe(true);
  });

  it("draw! KHÔNG khớp -> ghi nhận companion bình thường", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "marcel_marcelo" }), makePlayer("b", { characterId: "the_nobody" })],
      { pending: [{ kind: "NEED_PICK_MARCEL_COMPANION", player: "a" }] }
    );

    const picked = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });
    const drawState = { ...picked.state, deck: ["missed_1"] };
    const { state: next, events } = reduce(drawState, { type: "RESPOND", playerId: "b" });

    expect(next.marcelJailCompanion).toEqual({ a: "b" });
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "missed_1", matched: false },
      { type: "MARCEL_COMPANION_PICKED", playerId: "a", companionId: "b" },
    ]);
  });
});
