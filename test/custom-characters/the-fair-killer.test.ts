// Bộ mở rộng "custom_characters" (The DareDevil, xem docs/bang-rules/House_Rule.txt mục I)
// — mỗi lượt 1 lần, tự mất 1 máu (KHÔNG hoàn lại dù mục tiêu đỡ được) để bắn
// hiệu ứng Bang! vào BẤT KỲ ai, bỏ qua khoảng cách/tầm súng hoàn toàn, KHÔNG
// tính vào giới hạn 1 Bang!/lượt. Chặn khi chỉ còn 1 máu (không tự sát được).
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

describe("The DareDevil — dùng kỹ năng (USE_ABILITY): mất 1 máu bắn Bang!", () => {
  it("mất 1 máu NGAY, đẩy NEED_MISSED cho mục tiêu, đánh dấu đã dùng lượt này", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer", hp: 4, maxHp: 4 }),
      makePlayer("b"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b",
    });

    expect(next.players[0].hp).toBe(3);
    expect(next.fairKillerUsedThisTurn).toBe(true);
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "fair_killer", from: "a" } },
    ]);
    expect(events).toEqual([{ type: "FAIR_KILLER_TRADED_LIFE", playerId: "a", targetId: "b" }]);
  });

  it("KHÔNG tính vào bangCountThisTurn (không giới hạn 1 Bang!/lượt)", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_fair_killer" }), makePlayer("b")],
      { bangCountThisTurn: 1 } // đã dùng hết suất Bang! bình thường của lượt
    );

    const { state: next } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b",
    });

    expect(next.bangCountThisTurn).toBe(1); // không đổi
  });

  it("KHÔNG phải lượt của mình -> báo lỗi", () => {
    const state = makeState([
      makePlayer("a"),
      makePlayer("b", { characterId: "the_fair_killer" }),
    ]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "b", cardIds: [], targetId: "a" })
    ).toThrow();
  });

  it("đã dùng trong lượt này -> báo lỗi", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "the_fair_killer" }), makePlayer("b")],
      { fairKillerUsedThisTurn: true }
    );

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b" })
    ).toThrow();
  });

  it("kèm cardIds không rỗng -> báo lỗi (kỹ năng này không cần bỏ lá)", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer", hand: ["bang_1"] }),
      makePlayer("b"),
    ]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["bang_1"], targetId: "b" })
    ).toThrow();
  });

  it("chỉ còn 1 máu -> không cho tự sát bằng cách này", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer", hp: 1, maxHp: 4 }),
      makePlayer("b"),
    ]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b" })
    ).toThrow();
  });

  it("không kèm targetId -> báo lỗi (bắt buộc chọn mục tiêu)", () => {
    const state = makeState([makePlayer("a", { characterId: "the_fair_killer" }), makePlayer("b")]);

    expect(() => reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [] })).toThrow();
  });

  it("không thể tự nhắm vào chính mình", () => {
    const state = makeState([makePlayer("a", { characterId: "the_fair_killer" }), makePlayer("b")]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "a" })
    ).toThrow();
  });

  it("mục tiêu đã chết -> báo lỗi", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer" }),
      makePlayer("b", { alive: false }),
    ]);

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b" })
    ).toThrow();
  });

  it("bỏ qua khoảng cách hoàn toàn — bắn trúng dù mục tiêu ở xa (house rule extra_distance)", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "the_fair_killer" }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      { houseRules: ["extra_distance"] } // tăng khoảng cách vòng tròn, vẫn không ảnh hưởng
    );

    const { state: next } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "c", // xa nhất bàn
    });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "c", source: { card: "fair_killer", from: "a" } },
    ]);
  });
});

describe("The DareDevil — mất máu KHÔNG hoàn lại dù mục tiêu đỡ được", () => {
  it("mục tiêu đỡ bằng Missed! -> DareDevil VẪN mất máu (không hoàn)", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer", hp: 4, maxHp: 4 }),
      makePlayer("b", { hand: ["missed_1"] }),
    ]);

    const { state: afterShot } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b",
    });
    expect(afterShot.players[0].hp).toBe(3);

    const { state: afterDodge, events } = reduce(afterShot, {
      type: "RESPOND", playerId: "b", cardId: "missed_1",
    });

    expect(afterDodge.players[0].hp).toBe(3); // KHÔNG hoàn lại
    expect(afterDodge.players[1].hp).toBe(4); // mục tiêu không mất máu (đỡ được)
    expect(events).toEqual([{ type: "MISSED_PLAYED", playerId: "b" }]);
  });
});

describe("The DareDevil — KHÔNG đi qua Apache Kid / Mary Rose", () => {
  it("mục tiêu là Apache Kid -> VẪN đẩy NEED_MISSED bình thường (không miễn nhiễm)", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer" }),
      makePlayer("b", { characterId: "apache_kid" }),
    ]);

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b",
    });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "fair_killer", from: "a" } },
    ]);
    expect(events.some((e) => e.type === "APACHE_KID_IMMUNE")).toBe(false);
  });

  it("mục tiêu là Mary Rose, chịu mất máu -> KHÔNG bắn trả (source.card khác 'bang')", () => {
    const state = makeState([
      makePlayer("a", { characterId: "the_fair_killer", hp: 4, maxHp: 4 }),
      makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3 }),
    ]);

    const { state: afterShot } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b",
    });
    const { state: next, events } = reduce(afterShot, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2); // Mary Rose mất máu thật
    expect(events.some((e) => e.type === "MARY_ROSE_REFLECTED")).toBe(false);
    expect(next.pending).toEqual([]); // không có phản đòn nào chờ "a"
  });
});

describe("The DareDevil — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn The DareDevil -> dùng được kỹ năng mất máu bắn Bang!", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "vera_custer", hp: 5, maxHp: 5 }), makePlayer("b")],
      { veraCusterBorrowedCharacterId: "the_fair_killer" }
    );

    const { state: next } = reduce(state, {
      type: "USE_ABILITY", playerId: "a", cardIds: [], targetId: "b",
    });

    expect(next.players[0].hp).toBe(4);
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "fair_killer", from: "a" } },
    ]);
  });
});
