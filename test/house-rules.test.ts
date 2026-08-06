// Giai đoạn 5, việc 5.3 — house rules (luật bổ sung chủ phòng BẬT cho riêng 1
// ván, xem GameState.houseRules ở types.ts + LO-TRINH.md/CLAUDE.md). Đợt này
// mới có 4 luật KHÔNG cần PendingAction/cơ chế mới: "extra_distance",
// "require_weapon_for_bang", "no_duplicate_card_names", "beer_below_two".
// houseRules RỖNG (mặc định, mọi test khác trong dự án đều dùng) = đúng luật
// gốc, không đổi gì — test ở đây luôn đối chiếu rõ "TẮT vẫn như cũ" trước khi
// kiểm "BẬT thì khác đi", để chắc chắn không phá ván không bật luật nào.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState, HouseRuleId, PlayerState } from "../src/core/types";

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

function makeState(players: PlayerState[], houseRules: HouseRuleId[], overrides: Partial<GameState> = {}): GameState {
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
    houseRules,
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("house rule — extra_distance", () => {
  it("TẮT (mặc định): Bang! ở khoảng cách 1 (súng ngầm định tầm 1) đánh được bình thường", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b")],
      []
    );

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it('BẬT: khoảng cách hiệu dụng +1, Bang! khoảng cách 1 (súng ngầm định tầm 1) giờ ngoài tầm bắn', () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b")],
      ["extra_distance"]
    );

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })).toThrow(
      /ngoài tầm bắn/
    );
  });

  it('BẬT: Panic! (chỉ dùng được đúng khoảng cách 1) cũng bị ảnh hưởng — 2 người ngồi cạnh nhau giờ tính khoảng cách 2', () => {
    const state = makeState(
      [makePlayer("a", { hand: ["panic_1"] }), makePlayer("b", { hand: ["missed_1"] })],
      ["extra_distance"]
    );

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" })).toThrow(
      /chỉ dùng được ở khoảng cách 1/
    );
  });
});

describe("house rule — require_weapon_for_bang", () => {
  it("TẮT (mặc định): không trang bị súng nào vẫn đánh Bang! được (súng ngầm định)", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b")],
      []
    );

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("BẬT: không trang bị súng nào thì KHÔNG đánh Bang! được nữa", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b")],
      ["require_weapon_for_bang"]
    );

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })).toThrow(
      /bắt buộc có súng/
    );
  });

  it("BẬT: có trang bị súng (Schofield) thì vẫn đánh Bang! được bình thường", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"], equipment: ["schofield_1"] }), makePlayer("b")],
      ["require_weapon_for_bang"]
    );

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });
});

describe("house rule — no_duplicate_card_names", () => {
  it("TẮT (mặc định): đánh 2 lá Panic! trùng tên trong cùng lượt vẫn được", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["panic_1", "panic_2"] }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c", { hand: ["missed_2"] }),
      ],
      []
    );

    const first = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });
    const second = reduce(first.state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_2", targetId: "c" });

    // Panic! không chỉ bỏ lá vừa đánh — nó còn CƯỚP đúng lá của mục tiêu vào
    // tay người đánh, nên hand cuối không rỗng mà chứa 2 lá vừa cướp được.
    expect(second.state.players[0].hand).toEqual(["missed_1", "missed_2"]);
  });

  it('BẬT: đánh lá Panic! thứ 2 trùng tên trong cùng lượt bị chặn', () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["panic_1", "panic_2"] }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c", { hand: ["missed_2"] }),
      ],
      ["no_duplicate_card_names"]
    );

    const first = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });

    expect(() =>
      reduce(first.state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_2", targetId: "c" })
    ).toThrow(/cấm dùng 2 lá trùng tên/);
  });

  it("BẬT: đánh 2 lá KHÁC tên nhau (Panic! rồi Beer) trong cùng lượt không bị ảnh hưởng", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["panic_1", "beer_1"], hp: 3 }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c"), // chỉ để aliveCount > 2, tránh dính ngoại lệ "Bia vô tác dụng khi còn 2 người" (luật KHÁC, không bật ở test này)
      ],
      ["no_duplicate_card_names"]
    );

    const first = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });
    const second = reduce(first.state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    // Panic! cướp missed_1 của b vào tay a TRƯỚC khi a đánh Beer — hand cuối
    // còn đúng lá vừa cướp được, Beer đã bị bỏ đi sau khi dùng.
    expect(second.state.players[0].hand).toEqual(["missed_1"]);
    expect(second.state.players[0].hp).toBe(4);
  });

  it("BẬT: lá trang bị (súng) KHÔNG bị tính vào giới hạn này — trang bị 2 súng liên tiếp vẫn được", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["schofield_1", "remington_1"] }), makePlayer("b")],
      ["no_duplicate_card_names"]
    );

    const first = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "schofield_1" });
    const second = reduce(first.state, { type: "PLAY_CARD", playerId: "a", cardId: "remington_1" });

    expect(second.state.players[0].equipment).toEqual(["remington_1"]);
  });

  it("BẬT: sang lượt mới thì đánh lại đúng tên đã dùng ở lượt trước vẫn được (reset mỗi lượt)", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["panic_1"], hp: 4 }),
        makePlayer("b", { hand: ["panic_2", "missed_1"], hp: 4 }),
      ],
      ["no_duplicate_card_names"],
      { deck: ["saloon_1", "saloon_2"] }
    );

    const afterPanic = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });
    const afterEndTurn = reduce(afterPanic.state, { type: "END_TURN", playerId: "a" });
    expect(afterEndTurn.state.cardNamesPlayedThisTurn).toEqual([]);

    const drawn = reduce(afterEndTurn.state, { type: "DRAW_CARDS", playerId: "b" });
    // b đánh Panic! ở lượt CỦA CHÍNH MÌNH — tên "panic" đã dùng ở lượt của a
    // (lượt TRƯỚC) không còn tính, vì cardNamesPlayedThisTurn đã reset.
    const played = reduce(drawn.state, { type: "PLAY_CARD", playerId: "b", cardId: "panic_2", targetId: "a" });

    expect(played.state.players[1].hand).not.toContain("panic_2");
  });
});

describe("house rule — beer_below_two", () => {
  it("TẮT (mặc định): đánh Bia khi chỉ còn 2 người sống thì vô tác dụng", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["beer_1"], hp: 3 }), makePlayer("b")],
      []
    );

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[0].hp).toBe(3);
    expect(events).toContainEqual({ type: "BEER_INEFFECTIVE", playerId: "a" });
  });

  it("BẬT: đánh Bia khi chỉ còn 2 người sống vẫn hồi máu bình thường", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["beer_1"], hp: 3 }), makePlayer("b")],
      ["beer_below_two"]
    );

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[0].hp).toBe(4);
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 1 });
  });

  it("TẮT (mặc định): máu về 0 khi chỉ còn 2 người, có Bia trên tay, vẫn chết", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b", { hand: ["beer_1"], hp: 1 })],
      []
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(events).toContainEqual({ type: "BEER_INEFFECTIVE", playerId: "b" });
  });

  it("BẬT: máu về 0 khi chỉ còn 2 người, có Bia trên tay, được hồi sinh về 1 máu", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b", { hand: ["beer_1"], hp: 1 })],
      ["beer_below_two"]
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(1);
    expect(events).toContainEqual({ type: "BEER_SAVED_FROM_DEATH", playerId: "b", cardId: "beer_1", hp: 1 });
  });
});
