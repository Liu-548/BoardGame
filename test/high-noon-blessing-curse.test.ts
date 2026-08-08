// Mở rộng High Noon — lá "Blessing"/"Curse" (nhóm C, sửa luật nền): chất của
// MỌI lá bài đều là Cơ (Blessing) hoặc Bích (Curse) trong suốt vòng này. Ảnh
// hưởng MỌI draw! (Barrel/Jail/Dynamite) và miễn nhiễm Apache Kid (Dodge
// City) — *dev đã chốt xét theo CHẤT ĐÃ ĐỔI. Xem Luat_Bang_Mo_Rong_HighNoon.txt
// mục 2, getEffectiveSuit() trong cards.ts.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState, PlayerState } from "../src/core/types";

// Suit/rank tra từ CARD_SUIT_RANKS (cards.ts):
//   jail_1     = hearts,4     jail_2     = spades,10
//   barrel_1   = spades,Q
//   bang_1     = spades,A     bang_2 = hearts,2   bang_15 = diamonds,2
//   missed_6   = spades,2  (Bích, rank trong 2-9)
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
    vendettaUsedThisTurn: false,
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Blessing/Curse — Barrel (cần Cơ để né)", () => {
  it("Blessing: lá thật Bích (barrel_1 spades,Q) vẫn né được (đọc thành Cơ)", () => {
    const state = makeState({
      activeEventId: "blessing",
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
      deck: ["jail_2"], // top = jail_2 (spades,10) — thật KHÔNG phải Cơ
    });
    const afterBang = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(afterBang.state, { type: "RESPOND", playerId: "b" });
    expect(next.players[1].hp).toBe(4); // né thành công, không mất máu
    expect(events).toContainEqual({ type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_2", matched: true });
  });

  it("Curse: lá thật CƠ (jail_1 hearts,4) KHÔNG né được nữa (đọc thành Bích)", () => {
    const state = makeState({
      activeEventId: "curse",
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
      deck: ["jail_1"], // top = jail_1 (hearts,4) — thật LÀ Cơ nhưng bị Curse ghi đè
    });
    const afterBang = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(afterBang.state, { type: "RESPOND", playerId: "b" });
    expect(events).toContainEqual({ type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: false });
    // Barrel thất bại -> vẫn còn NEED_MISSED chờ đỡ/mất máu
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });
});

describe("Blessing/Curse — Jail (cần Cơ để thoát)", () => {
  // Dynamite/Jail draw-check được đẩy sẵn ở applyTurnStartChecks() (đầu
  // lượt) — dựng thẳng pending NEED_DRAW_CHECK y hệt draw-check.test.ts,
  // không cần đi lại từ đầu applyTurnStartChecks().
  it("Blessing: lá thật Bích (jail_2 spades,10) vẫn thoát tù được", () => {
    const state = makeState({
      activeEventId: "blessing",
      players: [makePlayer("a", { role: "sheriff", equipment: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
      pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] }],
      deck: ["jail_2"],
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).toContainEqual({ type: "JAIL_ESCAPED", playerId: "a" });
    expect(next.players[0].equipment).toEqual([]);
  });

  it("Curse: lá thật Cơ (jail_1) KHÔNG thoát được nữa (đọc thành Bích)", () => {
    const state = makeState({
      activeEventId: "curse",
      players: [makePlayer("a", { role: "sheriff", equipment: ["jail_2"] }), makePlayer("b"), makePlayer("c")],
      pending: [{ kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] }],
      deck: ["jail_1"], // thật là Cơ, Curse ghi đè thành Bích -> không khớp yêu cầu Cơ
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).toContainEqual({ type: "JAIL_SKIPPED_TURN", playerId: "a" });
    expect(next.players[0].equipment).toEqual([]); // lá Jail tiêu thụ dù thoát hay không, nhưng LƯỢT bị bỏ qua
  });
});

describe("Blessing/Curse — Dynamite (nổ khi Bích 2-9)", () => {
  it("Blessing: lá thật Bích rank hợp lệ (missed_6 spades,2) KHÔNG nổ nữa (đọc thành Cơ)", () => {
    const state = makeState({
      activeEventId: "blessing",
      players: [makePlayer("a", { role: "sheriff", equipment: ["dynamite_1"] }), makePlayer("b"), makePlayer("c")],
      pending: [
        {
          kind: "NEED_DRAW_CHECK",
          player: "a",
          source: { card: "dynamite" },
          matchSuits: ["spades"],
          matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
      deck: ["missed_6"],
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DYNAMITE_EXPLODED" }));
    expect(next.players[0].hp).toBe(4);
  });

  it("Curse: lá thật KHÔNG phải Bích nhưng rank hợp lệ (bang_2 hearts,2) VẪN NỔ (đọc thành Bích)", () => {
    const state = makeState({
      activeEventId: "curse",
      players: [makePlayer("a", { role: "sheriff", equipment: ["dynamite_1"] }), makePlayer("b"), makePlayer("c")],
      pending: [
        {
          kind: "NEED_DRAW_CHECK",
          player: "a",
          source: { card: "dynamite" },
          matchSuits: ["spades"],
          matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
      deck: ["bang_2"],
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).toContainEqual(expect.objectContaining({ type: "DYNAMITE_EXPLODED" }));
    expect(next.players[0].hp).toBe(1);
  });
});

describe("Blessing/Curse — Apache Kid (miễn nhiễm Rô) mất tác dụng vì không còn lá nào là Rô", () => {
  it("Blessing: lá THẬT Rô (bang_15 diamonds,2) vẫn TRÚNG (không còn miễn nhiễm)", () => {
    const state = makeState({
      activeEventId: "blessing",
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_15"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });
    const { events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_15", targetId: "b" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "APACHE_KID_IMMUNE" }));
  });

  it("Curse: lá THẬT Rô (bang_15 diamonds,2) cũng TRÚNG (đọc thành Bích, không phải Rô nữa)", () => {
    const state = makeState({
      activeEventId: "curse",
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_15"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });
    const { events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_15", targetId: "b" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "APACHE_KID_IMMUNE" }));
  });

  it("không active: lá THẬT Rô vẫn được miễn nhiễm như bình thường (đối chứng)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_15"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });
    const { events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_15", targetId: "b" });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "APACHE_KID_IMMUNE", playerId: "b", cardId: "bang_15" })
    );
  });
});
