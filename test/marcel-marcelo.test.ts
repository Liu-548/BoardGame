// Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
// — bị nhốt tù thì lập tức chỉ định 1 người khác "cùng vào tù" (ăn theo đúng
// kết quả thoát tù của Marcel); đầu lượt của Marcel được rút tối đa 2 lá để
// tìm Cơ thoát tù; thoát thành công thì lượt đó rút 3 lá thay vì 2.
//
// Suit/rank tra từ CARD_SUIT_RANKS (cards.ts): jail_1 = hearts,4 (khớp Cơ) —
// jail_2 = spades,10, jail_3 = spades,J (không khớp Cơ), cùng quy ước với
// test/jail.test.ts.
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
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
    equipmentPlayedTurn: {},
    joseDelgadoUsesThisTurn: 0,
    docHolydayUsedThisTurn: false,
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    houseRules: [],
    expansions: ["custom_characters"],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Marcel Marcelo — bị nhốt tù: chỉ định người cùng vào tù", () => {
  it("Jail vừa gắn lên Marcel -> đẩy NEED_PICK_MARCEL_COMPANION ngay", () => {
    const state = makeState([
      makePlayer("a", { hand: ["jail_1"] }),
      makePlayer("b", { characterId: "marcel_marcelo", hp: 4, maxHp: 4 }),
      makePlayer("c"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b",
    });

    expect(next.players[1].equipment).toEqual(["jail_1"]);
    expect(next.pending).toEqual([{ kind: "NEED_PICK_MARCEL_COMPANION", player: "b" }]);
    expect(events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "jail_1", targetId: "b" }]);
  });

  it("Jail gắn lên người KHÔNG phải Marcel -> không hỏi gì thêm", () => {
    const state = makeState([
      makePlayer("a", { hand: ["jail_1"] }),
      makePlayer("b"),
      makePlayer("c"),
    ]);

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b",
    });

    expect(next.pending).toEqual([]);
  });

  it("chọn xong -> ghi marcelJailCompanion, được phép chọn TRÙNG người vừa đánh Jail", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "marcel_marcelo" }), makePlayer("c")],
      { pending: [{ kind: "NEED_PICK_MARCEL_COMPANION", player: "b" }] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", targetId: "a" });

    expect(next.pending).toEqual([]);
    expect(next.marcelJailCompanion.b).toBe("a");
    expect(events).toEqual([{ type: "MARCEL_COMPANION_PICKED", playerId: "b", companionId: "a" }]);
  });

  it("bắt buộc chọn — không kèm targetId thì báo lỗi", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "marcel_marcelo" }), makePlayer("c")],
      { pending: [{ kind: "NEED_PICK_MARCEL_COMPANION", player: "b" }] }
    );

    expect(() => reduce(state, { type: "RESPOND", playerId: "b" })).toThrow();
  });

  it("không thể tự chỉ định chính mình", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "marcel_marcelo" }), makePlayer("c")],
      { pending: [{ kind: "NEED_PICK_MARCEL_COMPANION", player: "b" }] }
    );

    expect(() => reduce(state, { type: "RESPOND", playerId: "b", targetId: "b" })).toThrow();
  });
});

describe("Marcel Marcelo — draw!-check Jail: tối đa 2 lá", () => {
  it("lá đầu ĐÃ là Cơ -> thoát ngay, không rút lá thứ 2", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("c"),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["jail_3", "jail_1"], // đỉnh (jail_1, hearts) rút trước -> khớp ngay
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.deck).toEqual(["jail_3"]); // chỉ rút đúng 1 lá
    expect(next.discardPile).toEqual(["jail_1", "jail_2"]);
    expect(next.players[1].equipment).toEqual([]);
    expect(next.marcelJailBonusDrawThisTurn.b).toBe(true);
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
      { type: "JAIL_ESCAPED", playerId: "b" },
    ]);
  });

  it("lá đầu KHÔNG phải Cơ, lá thứ 2 là Cơ -> rút thêm lá thứ 2, thoát tù", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("c"),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["jail_1", "jail_3"], // đỉnh (jail_3, spades) rút trước -> không khớp, rút thêm jail_1 (hearts) -> khớp
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.deck).toEqual([]); // đã rút cả 2 lá
    expect(next.discardPile).toEqual(["jail_3", "jail_1", "jail_2"]);
    expect(next.marcelJailBonusDrawThisTurn.b).toBe(true);
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
      { type: "MARCEL_JAIL_SECOND_DRAW", playerId: "b", cardId: "jail_1", matched: true },
      { type: "JAIL_ESCAPED", playerId: "b" },
    ]);
  });

  it("cả 2 lá đều KHÔNG phải Cơ -> kẹt tù, mất cả lượt", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("c"),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["jail_2", "jail_3"], // cả 2 lá lật ra đều chất Bích, không khớp
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.deck).toEqual([]);
    expect(next.marcelJailBonusDrawThisTurn.b).toBeUndefined();
    expect(next.currentPlayerIndex).toBe(2); // bỏ qua b, sang thẳng c
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_2", matched: false },
      { type: "MARCEL_JAIL_SECOND_DRAW", playerId: "b", cardId: "jail_2", matched: false },
      { type: "JAIL_SKIPPED_TURN", playerId: "b" },
    ]);
  });

  it("thoát tù thành công -> lượt rút bài kế tiếp rút 3 lá thay vì 2 (Phương án C)", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("c"),
      ],
      {
        currentPlayerIndex: 1,
        turnPhase: "draw",
        deck: ["c3", "c2", "c1", "jail_1"],
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: afterEscape } = reduce(state, { type: "RESPOND", playerId: "b" });
    expect(afterEscape.turnPhase).toBe("draw"); // vẫn phải tự rút bài như bình thường

    const { state: afterDraw, events } = reduce(afterEscape, { type: "DRAW_CARDS", playerId: "b" });

    expect(afterDraw.players[1].hand).toEqual(["c1", "c2", "c3"]); // đỉnh (c1) rút trước, đủ 3 lá
    expect(afterDraw.turnPhase).toBe("play");
    expect(afterDraw.marcelJailBonusDrawThisTurn.b).toBeUndefined(); // tiêu thụ xong
    expect(events).toEqual([{ type: "CARDS_DRAWN", playerId: "b", count: 3 }]);
  });
});

describe("Marcel Marcelo — người cùng vào tù ăn theo kết quả", () => {
  it("Marcel thoát tù -> companion được tự do, không có gì khác xảy ra", () => {
    const state = makeState(
      [
        makePlayer("a"), // companion
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("c"),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["jail_1"],
        marcelJailCompanion: { b: "a" },
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.marcelJailCompanion.b).toBeUndefined();
    expect(next.marcelCompanionSkipNextTurn.a).toBeUndefined();
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: true },
      { type: "JAIL_ESCAPED", playerId: "b" },
      { type: "MARCEL_COMPANION_FREED", playerId: "a" },
    ]);
  });

  it("Marcel kẹt tù -> companion bị đánh dấu mất lượt kế tiếp CỦA CHÍNH HỌ", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("c"), // companion, NGỒI SAU b — lượt kế tiếp sẽ tới thẳng "c"
      ],
      {
        currentPlayerIndex: 1,
        deck: ["jail_2", "jail_3"],
        marcelJailCompanion: { b: "c" },
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    // "c" ngồi NGAY SAU "b" trong vòng chơi -> advanceTurn() của Jail kẹt tù
    // chạy applyTurnStartChecks() cho "c" NGAY TRONG CÙNG lần reduce() này ->
    // cờ marcelCompanionSkipNextTurn PHẢI đã có mặt trước đó (test này xác
    // nhận đúng thứ tự xử lý, không phải chỉ đặt cờ suông).
    expect(next.marcelCompanionSkipNextTurn.c).toBeUndefined(); // đã bị TIÊU THỤ ngay lượt này
    expect(next.currentPlayerIndex).toBe(0); // bỏ qua CẢ b (kẹt tù) LẪN c (ăn theo) -> quay về a
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_2", matched: false },
      { type: "MARCEL_JAIL_SECOND_DRAW", playerId: "b", cardId: "jail_2", matched: false },
      { type: "JAIL_SKIPPED_TURN", playerId: "b" },
      { type: "MARCEL_COMPANION_JAILED", playerId: "c" },
      { type: "MARCEL_COMPANION_TURN_SKIPPED", playerId: "c" },
    ]);
  });

  it("companion ngồi CÁCH XA Marcel — cờ vẫn sống sót qua lượt của người khác tới đúng lượt companion", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "marcel_marcelo", equipment: ["jail_2"] }),
        makePlayer("b"), // xen giữa, KHÔNG bị ảnh hưởng gì
        makePlayer("c"), // companion
      ],
      {
        currentPlayerIndex: 0,
        deck: ["jail_2", "jail_3"],
        marcelJailCompanion: { a: "c" },
        pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    // a kẹt tù -> sang thẳng b (KHÔNG phải companion, chơi bình thường).
    const { state: afterJail } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(afterJail.currentPlayerIndex).toBe(1);
    expect(afterJail.turnPhase).toBe("draw");
    expect(afterJail.marcelCompanionSkipNextTurn.c).toBe(true); // cờ vẫn còn, chờ tới lượt c

    // b chơi 1 lượt HOÀN CHỈNH bình thường (rút bài rồi kết thúc lượt) -> sang
    // c, cờ phát huy tác dụng, bỏ qua c luôn, quay về a.
    const { state: bDrawn } = reduce(afterJail, { type: "DRAW_CARDS", playerId: "b" });
    const { state: afterB, events } = reduce(bDrawn, { type: "END_TURN", playerId: "b" });
    expect(afterB.marcelCompanionSkipNextTurn.c).toBeUndefined();
    expect(afterB.currentPlayerIndex).toBe(0);
    expect(events).toContainEqual({ type: "MARCEL_COMPANION_TURN_SKIPPED", playerId: "c" });
  });

  it("companion đã chết giữa chừng trước khi Marcel thoát/kẹt tù -> bỏ qua, không lỗi", () => {
    const state = makeState(
      [
        makePlayer("a", { alive: false, role: "outlaw" }), // companion đã chết
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"], role: "sheriff" }),
        makePlayer("c", { role: "renegade" }),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["jail_2", "jail_3"],
        marcelJailCompanion: { b: "a" },
        pending: [{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.marcelJailCompanion.b).toBeUndefined();
    expect(events.some((e) => e.type === "MARCEL_COMPANION_JAILED" || e.type === "MARCEL_COMPANION_FREED")).toBe(false);
  });
});

describe("Marcel Marcelo — Vera Custer mượn khả năng (Record theo playerId, không tranh state)", () => {
  it("Vera Custer mượn Marcel Marcelo -> cũng được chỉ định người cùng vào tù, tách biệt với Marcel thật", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["jail_1"] }),
        makePlayer("b", { characterId: "marcel_marcelo", equipment: ["jail_2"] }), // Marcel thật, đang kẹt sẵn
        makePlayer("c", { characterId: "vera_custer" }),
      ],
      {
        marcelJailCompanion: { b: "a" }, // Marcel thật đã có companion riêng từ trước
        veraCusterBorrowedCharacterId: "marcel_marcelo",
      }
    );

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "c",
    });

    // "c" (Vera Custer, đang mượn Marcel) bị nhốt -> cũng được hỏi companion.
    expect(next.pending).toEqual([{ kind: "NEED_PICK_MARCEL_COMPANION", player: "c" }]);

    const { state: afterPick } = reduce(next, { type: "RESPOND", playerId: "c", targetId: "a" });

    // Entry của "c" độc lập hoàn toàn với entry có sẵn của "b" — không ai ghi
    // đè lên ai (điểm mấu chốt đã áp dụng bài học từ vụ Elena Noir).
    expect(afterPick.marcelJailCompanion.b).toBe("a");
    expect(afterPick.marcelJailCompanion.c).toBe("a");
  });
});
