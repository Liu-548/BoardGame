// Bộ mở rộng "custom_characters" (Nomad Norman, xem House_Rule.txt mục I) —
// đầu mỗi lượt của chính mình, draw! 1 lá NGẦM (chỉ mình biết): đỏ (Cơ/Rô) thì
// có 1 "lá chắn" tới đầu lượt kế tiếp của chính mình, có thể tự chọn dùng để
// chặn TRỌN 1 cụm sát thương bất kỳ (kể cả Thuốc nổ 3 máu). Bí mật thật sự —
// KHÔNG được lộ qua discardPile/events (xem resolveDrawCheck() nhánh
// "the_drifter") LẪN không được lộ qua sự XUẤT HIỆN của NEED_USE_DRIFTER_SHIELD
// (pending này đẩy VÔ ĐIỀU KIỆN, xem maybeAskDrifterShield() trong reduce.ts).
//
// Suit tra từ CARD_SUIT_RANKS (cards.ts): jail_1 = hearts (đỏ), missed_1 =
// diamonds (đỏ), bang_1 = spades (đen), gatling_1 = clubs (đen) — cùng quy
// ước tái dùng id đã biết suit của test/the-thief.test.ts/dynamite.test.ts.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import { viewFor } from "../src/core/view";
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
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangCountThisTurn: 0,
    characterSelection: null,
    turnNumber: 1,
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

describe("Nomad Norman — draw! bí mật đầu lượt", () => {
  it("rút 2 lá bình thường xong -> đẩy NEED_DRAW_CHECK cho draw! bí mật", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      deck: ["jail_1", "bang_2", "bang_1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["bang_1", "bang_2"]);
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] },
    ]);
    expect(events).toEqual([{ type: "CARDS_DRAWN", playerId: "a", count: 2 }]);
  });

  it("nhân vật KHÔNG phải Nomad Norman -> không có draw! bí mật nào", () => {
    const state = makeState({
      players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      deck: ["bang_1", "bang_2"],
    });

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([]);
  });

  it("ra chất Cơ (đỏ) -> có lá chắn, KHÔNG lộ gì qua discardPile/events", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      deck: ["jail_1"], // hearts -> khớp
      pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.drifterShield.a).toBe(true);
    expect(next.drifterHiddenCard.a).toBe("jail_1"); // giữ kín, chưa vào chồng bỏ
    expect(next.discardPile).toEqual([]); // KHÔNG rò qua chồng bỏ công khai
    expect(next.pending).toEqual([]);
    expect(events).toEqual([]); // KHÔNG emit event nào tiết lộ chất/lá
  });

  it("ra chất Rô (đỏ) -> vẫn tính là có lá chắn", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      deck: ["missed_1"], // diamonds -> khớp
      pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.drifterShield.a).toBe(true);
  });

  it("ra chất đen (Bích/Nhép) -> KHÔNG có lá chắn", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      deck: ["bang_1"], // spades -> không khớp
      pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.drifterShield.a).toBe(false);
    expect(next.discardPile).toEqual([]);
  });

  it("draw! bí mật CŨ (nếu có) được trả về chồng bỏ khi draw! MỚI chạy", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      deck: ["bang_1"],
      drifterHiddenCard: { a: "jail_1" }, // lá cũ đang treo, chưa vào chồng bỏ
      drifterShield: { a: true },
      pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.discardPile).toEqual(["jail_1"]); // lá cũ hết hạn, xả ra
    expect(next.drifterHiddenCard.a).toBe("bang_1"); // lá mới thay vào
    expect(next.drifterShield.a).toBe(false); // ghi đè theo kết quả mới (đen)
  });

  it("Lasso đang active -> draw! bí mật vẫn đẩy bình thường (hook nằm ở pha rút, không phải Bước 0)", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      deck: ["jail_1", "bang_2", "bang_1"],
      activeEventId: "lasso",
    });

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] },
    ]);
  });

  it("bị Jail và KHÔNG thoát -> lượt bị bỏ qua hoàn toàn, KHÔNG có draw! bí mật nào chạy lượt đó", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { characterId: "the_drifter", equipment: ["jail_2"] }), // jail_2 = spades, không khớp Cơ
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
      pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      deck: ["bang_1"], // spades — không khớp Cơ, kẹt tù
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(events).toContainEqual({ type: "JAIL_SKIPPED_TURN", playerId: "b" });
    expect(next.currentPlayerIndex).toBe(2); // bỏ qua hẳn lượt b, sang c
    expect(next.pending).toEqual([]); // không có NEED_DRAW_CHECK the_drifter nào bị đẩy
    expect(next.drifterShield.b).toBeUndefined();
  });
});

describe("Nomad Norman — NEED_USE_DRIFTER_SHIELD luôn xuất hiện, không rò rỉ", () => {
  it("bị Bang! trúng dù KHÔNG có lá chắn -> vẫn đẩy NEED_USE_DRIFTER_SHIELD (không lộ qua sự xuất hiện của pending)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "the_drifter" }),
        makePlayer("c"),
      ],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
      drifterShield: { b: false },
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      { kind: "NEED_USE_DRIFTER_SHIELD", player: "b", amount: 1, killerId: "a", resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } } },
    ]);
  });

  it("dùng useShield:true khi KHÔNG có khiên thật -> coi như từ chối, vẫn mất máu bình thường", () => {
    const state = makeState({
      players: [makePlayer("a", { hp: 4, hand: [] }), makePlayer("b"), makePlayer("c", { characterId: "the_drifter" })],
      pending: [
        {
          kind: "NEED_USE_DRIFTER_SHIELD",
          player: "a",
          amount: 1,
          killerId: "b",
          resume: { kind: "indians" },
        },
      ],
      drifterShield: {}, // "a" không hề có lá chắn (chỉ "c" mới là Nomad Norman thật ở test này)
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", useShield: true });

    expect(next.players[0].hp).toBe(3); // vẫn mất máu, không có tác dụng
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DRIFTER_SHIELD_USED" }));
  });
});

describe("Nomad Norman — dùng lá chắn chặn TRỌN sát thương", () => {
  it("Bang! đơn lẻ (qua NEED_MISSED) -> dùng khiên chặn trọn, không mất máu", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { hp: 4, characterId: "the_drifter" }),
        makePlayer("c"),
      ],
      pending: [
        {
          kind: "NEED_USE_DRIFTER_SHIELD",
          player: "b",
          amount: 1,
          killerId: "a",
          resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } },
        },
      ],
      drifterShield: { b: true },
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", useShield: true });

    expect(next.players[1].hp).toBe(4); // KHÔNG mất máu
    expect(next.drifterShield.b).toBeUndefined(); // dùng 1 lần là hết (xoá key)
    expect(events).toEqual([{ type: "DRIFTER_SHIELD_USED", playerId: "b", amount: 1 }]);
    expect(next.pending).toEqual([]);
  });

  it("Indians! -> dùng khiên chặn trọn", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter", hand: [] }), makePlayer("b"), makePlayer("c")],
      pending: [
        { kind: "NEED_USE_DRIFTER_SHIELD", player: "a", amount: 1, killerId: "b", resume: { kind: "indians" } },
      ],
      drifterShield: { a: true },
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", useShield: true });

    expect(next.players[0].hp).toBe(4);
    expect(events).toEqual([{ type: "DRIFTER_SHIELD_USED", playerId: "a", amount: 1 }]);
  });

  it("Đấu tay đôi (Duel) thua -> dùng khiên chặn trọn, drainDuelBangDrawPending() vẫn chạy tiếp", () => {
    const state = makeState({
      players: [makePlayer("a"), makePlayer("b", { hp: 4, characterId: "the_drifter", hand: [] })],
      pending: [
        { kind: "NEED_USE_DRIFTER_SHIELD", player: "b", amount: 1, killerId: "a", resume: { kind: "duel", opponent: "a" } },
      ],
      drifterShield: { b: true },
      duelBangDrawPending: null, // không có gì để rút thêm — chỉ xác nhận không lỗi
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", useShield: true });

    expect(next.players[1].hp).toBe(4);
    expect(events).toEqual([{ type: "DRIFTER_SHIELD_USED", playerId: "b", amount: 1 }]);
  });

  it("High Noon (mất 1 máu đầu lượt) -> dùng khiên chặn trọn, Bước 0 vẫn tiếp tục sau đó", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b", { characterId: "the_drifter", hp: 4 }), makePlayer("c")],
      currentPlayerIndex: 0,
      turnPhase: "play",
      activeEventId: "high_noon",
      drifterShield: { b: true },
    });

    // "a" kết thúc lượt -> sang "b" (Nomad Norman) -> applyTurnStartChecks() hỏi khiên trước khi trừ máu High Noon.
    const afterEndTurn = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(afterEndTurn.state.pending).toEqual([
      { kind: "NEED_USE_DRIFTER_SHIELD", player: "b", amount: 1, killerId: null, resume: { kind: "high_noon_turn_start" } },
    ]);
    expect(afterEndTurn.state.players[1].hp).toBe(4); // chưa trừ, đang chờ trả lời

    const { state: next, events } = reduce(afterEndTurn.state, { type: "RESPOND", playerId: "b", useShield: true });

    expect(next.players[1].hp).toBe(4); // chặn trọn, không mất máu
    expect(events).toContainEqual({ type: "DRIFTER_SHIELD_USED", playerId: "b", amount: 1 });
    expect(next.turnPhase).toBe("draw"); // Bước 0 chạy tiếp bình thường sau đó
    expect(next.pending).toEqual([]);
  });

  it("Thuốc nổ (Dynamite) nổ 3 máu -> dùng khiên chặn TRỌN cả 3, không phải từng máu", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter", hp: 4, equipment: ["dynamite_1"] }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      pending: [
        { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "dynamite" }, matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"] },
      ],
      deck: ["missed_6"], // spades, 2 — khớp, nổ
      drifterShield: { a: true },
    });

    const afterDraw = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(afterDraw.state.pending).toEqual([
      { kind: "NEED_USE_DRIFTER_SHIELD", player: "a", amount: 3, killerId: null, resume: { kind: "dynamite" } },
    ]);
    expect(afterDraw.state.players[0].equipment).toEqual([]); // Thuốc nổ vẫn tiêu thụ dù chưa biết có chặn hay không
    expect(afterDraw.state.discardPile).toContain("dynamite_1");
    expect(afterDraw.state.players[0].hp).toBe(4); // chưa trừ, đang chờ trả lời

    const { state: next, events } = reduce(afterDraw.state, { type: "RESPOND", playerId: "a", useShield: true });

    expect(next.players[0].hp).toBe(4); // chặn TRỌN cả 3, không phải trừ bớt
    expect(next.players[0].alive).toBe(true);
    expect(events).toContainEqual({ type: "DRIFTER_SHIELD_USED", playerId: "a", amount: 3 });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DYNAMITE_EXPLODED" }));
  });

  it("Russian Roulette 2 máu -> dùng khiên chặn trọn", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter", hp: 4 }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
      drifterShield: { a: true },
    });

    const afterFire = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(afterFire.state.pending).toEqual([
      { kind: "NEED_USE_DRIFTER_SHIELD", player: "a", amount: 2, killerId: null, resume: { kind: "russian_roulette" } },
    ]);

    const { state: next, events } = reduce(afterFire.state, { type: "RESPOND", playerId: "a", useShield: true });

    expect(next.players[0].hp).toBe(4);
    expect(events).toEqual([{ type: "DRIFTER_SHIELD_USED", playerId: "a", amount: 2 }]);
  });

  it("từ chối dùng khiên (dù đang có) -> mất máu bình thường như không có khiên", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter", hp: 4 }), makePlayer("b"), makePlayer("c")],
      pending: [
        { kind: "NEED_USE_DRIFTER_SHIELD", player: "a", amount: 1, killerId: "b", resume: { kind: "indians" } },
      ],
      drifterShield: { a: true },
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" }); // không kèm useShield = từ chối

    expect(next.players[0].hp).toBe(3);
    expect(next.drifterShield.a).toBe(true); // TỪ CHỐI dùng -> vẫn còn khiên, để dành
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DRIFTER_SHIELD_USED" }));
  });
});

describe("Nomad Norman — hết hạn lá chắn", () => {
  it("khiên sống sót qua lượt người khác xen giữa, tới đầu lượt kế tiếp của chính mình mới bị ghi đè", () => {
    // Giả lập: đã qua lượt b, c mà không đụng gì tới khiên của a (không field
    // nào khác ghi đè drifterShield ngoài đúng 2 chỗ: draw! mới của chính chủ
    // / lúc dùng) — giờ tới lượt a lại, đang ở pha rút.
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      drifterShield: { a: true },
      currentPlayerIndex: 0,
      turnPhase: "draw",
      // deck.pop() rút từ CUỐI: "bang_2"/"bang_3" cho 2 lá rút bình thường,
      // "bang_1" (spades, không khớp) còn lại cho draw! bí mật.
      deck: ["bang_1", "bang_3", "bang_2"],
    });

    const afterDraw = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(afterDraw.state.drifterShield.a).toBe(true); // vẫn còn NGUYÊN tới khi draw! mới GIẢI QUYẾT xong

    const { state: next } = reduce(afterDraw.state, { type: "RESPOND", playerId: "a" });
    expect(next.drifterShield.a).toBe(false); // ghi đè theo kết quả draw! mới (đen)
  });
});

describe("Nomad Norman — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn Nomad Norman -> cũng có draw! bí mật đầu lượt, ghi field theo ĐÚNG playerId của Vera Custer", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "vera_custer" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      deck: ["jail_1", "bang_2", "bang_1"],
      veraCusterBorrowedCharacterId: "the_drifter",
    });

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "the_drifter" }, matchSuits: ["hearts", "diamonds"] },
    ]);

    const afterCheck = reduce({ ...next, deck: ["jail_1"] }, { type: "RESPOND", playerId: "a" });
    expect(afterCheck.state.drifterShield.a).toBe(true); // theo "a" (Vera Custer), KHÔNG phải "the_drifter"
  });
});

describe("Nomad Norman — viewFor() lọc riêng tư", () => {
  it("viewer khác KHÔNG bao giờ thấy key drifterShield của Nomad Norman, bất kể giá trị thật", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      drifterShield: { a: true },
    });

    const viewFromB = viewFor(state, "b");
    expect(viewFromB.drifterShield).toEqual({}); // không có key "a" nào cả, không phải false

    const viewFromA = viewFor(state, "a");
    expect(viewFromA.drifterShield).toEqual({ a: true }); // chính chủ thấy đúng giá trị thật
  });

  it("Nomad Norman KHÔNG có lá chắn -> viewer khác vẫn không thấy key (không suy luận được false)", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "the_drifter" }), makePlayer("b"), makePlayer("c")],
      drifterShield: { a: false },
    });

    expect(viewFor(state, "b").drifterShield).toEqual({});
    expect(viewFor(state, "a").drifterShield).toEqual({ a: false });
  });
});
