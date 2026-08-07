// Mở rộng Dodge City, mục C nhóm C (5.4) — 3 nhân vật phụ thuộc lẫn nhau:
// Molly Stark (onVoluntaryPlayOutOfTurn), Doc Holyday (USE_ABILITY biến thể
// thứ 3, phụ thuộc isImmuneToCard của Apache Kid), Belle Star
// (disablesOthersEquipment, qua getEffectiveEquipment()). Xem LO-TRINH.md
// "Ghi chú cho 5.4" mục C để biết đặc tả gốc.
import { describe, expect, it } from "vitest";
import { computeDistance } from "../src/core/distance";
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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
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
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Molly Stark — rút thêm bài khi CHỦ ĐỘNG chơi/bỏ Missed!/Beer/Bang! NGOÀI lượt mình", () => {
  it("dùng Missed! đỡ Bang! (luôn ngoài lượt): rút ngay 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "molly_stark", hand: ["missed_1"] }),
        makePlayer("c"),
      ],
      deck: ["c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });

    expect(next.players[1].hand).toEqual(["c1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("bỏ Bang! tự vệ trước Indians!: rút ngay 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["indians_1"] }),
        makePlayer("b", { characterId: "molly_stark", hand: ["bang_1"] }),
      ],
      deck: ["c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "bang_1" });

    expect(next.players[1].hand).toEqual(["c1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("bỏ Bang! trong Duel: KHÔNG rút ngay, dồn lại — rút đủ khi Duel kết thúc thật sự", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["duel_1"] }),
        makePlayer("b", { characterId: "molly_stark", hand: ["bang_1", "bang_15"] }), // 2 lá Bang! để đỡ 2 vòng
        makePlayer("c"),
      ],
      deck: ["c2", "c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "duel_1", targetId: "b" });
    // Vòng 1: b đỡ bằng bang_1 — KHÔNG rút ngay.
    const round1 = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "bang_1" });
    expect(round1.state.players[1].hand).toEqual(["bang_15"]); // chưa rút gì thêm
    expect(round1.state.duelBangDrawPending).toEqual({ playerId: "b", count: 1 });
    expect(round1.events.some((e) => e.type === "CARDS_DRAWN")).toBe(false);

    // Vòng 2: giờ tới lượt a đỡ, a không có Bang! -> a thua, Duel kết thúc.
    const { state: next, events } = reduce(round1.state, { type: "RESPOND", playerId: "a" });

    expect(next.duelBangDrawPending).toBeNull(); // đã tiêu thụ xong
    expect(next.players[1].hand).toEqual(["bang_15", "c1"]); // rút đúng 1 lá đã dồn (dù b THẮNG, không phải người thua)
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("hồi sinh tự động (Beer) ngoài lượt mình: rút thêm 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "molly_stark", hp: 1, hand: ["beer_1"] }),
        makePlayer("c"),
      ],
      deck: ["c1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> hồi sinh

    expect(next.players[1].hp).toBe(1);
    expect(next.players[1].hand).toEqual(["c1"]); // Beer đã bỏ, rút bù 1 lá mới
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("TỰ nổ Dynamite chết ngay TRONG LƯỢT CHÍNH MÌNH: hồi sinh KHÔNG tính là ngoài lượt, không rút thêm", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "molly_stark", hp: 1, hand: ["beer_1"], equipment: ["dynamite_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      deck: ["missed_6"], // spades 2 -> khớp, nổ
      pending: [
        {
          kind: "NEED_DRAW_CHECK",
          player: "a",
          source: { card: "dynamite" },
          matchSuits: ["spades"],
          matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hp).toBe(1); // hồi sinh do Bia, KHÔNG cộng thêm lá Molly Stark
    expect(next.players[0].hand).toEqual([]); // Bia đã bỏ, KHÔNG rút bù (đang là lượt chính mình)
    expect(events.some((e) => e.type === "CARDS_DRAWN")).toBe(false);
  });
});

describe("Doc Holyday — bỏ 2 lá bất kỳ để bắn Bang!, 1 lần/lượt, không tính giới hạn 1 Bang!/lượt", () => {
  it("dùng kỹ năng: bỏ 2 lá, đẩy NEED_MISSED cho mục tiêu trong tầm súng", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday", hand: ["beer_1", "saloon_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["beer_1", "saloon_1"],
      targetId: "b",
    });

    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(["beer_1", "saloon_1"]));
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "doc_holyday", from: "a" } }]);
    expect(events).toContainEqual({
      type: "DOC_HOLYDAY_SHOT",
      playerId: "a",
      cardIds: ["beer_1", "saloon_1"],
      targetId: "b",
    });
  });

  it("KHÔNG tính vào giới hạn 1 Bang!/lượt — vẫn đánh được Bang! thật sau đó", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday", hand: ["beer_1", "saloon_1", "bang_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const used = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["beer_1", "saloon_1"],
      targetId: "b",
    });
    expect(used.state.bangUsedThisTurn).toBe(false);

    const respondedFirst = reduce(used.state, { type: "RESPOND", playerId: "b" }); // chịu mất máu
    const { state: next } = reduce(respondedFirst.state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
    });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("giới hạn 1 lần/lượt — dùng lần 2 trong CÙNG lượt bị từ chối", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday", hand: ["beer_1", "saloon_1", "wells_fargo_1", "stagecoach_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const used = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["beer_1", "saloon_1"],
      targetId: "b",
    });
    const responded = reduce(used.state, { type: "RESPOND", playerId: "b" });

    expect(() =>
      reduce(responded.state, {
        type: "USE_ABILITY",
        playerId: "a",
        cardIds: ["wells_fargo_1", "stagecoach_1"],
        targetId: "b",
      })
    ).toThrow(/dùng kỹ năng này trong lượt này/);
  });

  it("reset đúng khi sang lượt mới", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday" }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      docHolydayUsedThisTurn: true, // đã dùng ở lượt TRƯỚC
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.docHolydayUsedThisTurn).toBe(false);
  });

  it("báo lỗi nếu mục tiêu ngoài tầm súng (súng ngầm định tầm 1)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday", hand: ["beer_1", "saloon_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
        makePlayer("e"),
      ],
      currentPlayerIndex: 0,
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1", "saloon_1"], targetId: "d" })
    ).toThrow(/ngoài tầm bắn/);
  });

  it("báo lỗi nếu dùng KHÔNG PHẢI lượt của mình", () => {
    const state = makeState({
      players: [makePlayer("a"), makePlayer("b", { characterId: "doc_holyday", hand: ["beer_1", "saloon_1"] }), makePlayer("c")],
      currentPlayerIndex: 0,
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "b", cardIds: ["beer_1", "saloon_1"], targetId: "a" })
    ).toThrow();
  });

  it("nhắm Apache Kid: CẢ 2 lá đều chất Rô -> miễn nhiễm", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday", hand: ["bang_15", "bang_16"] }), // Rô 2, Rô 3
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["bang_15", "bang_16"],
      targetId: "b",
    });

    expect(next.pending).toEqual([]);
    expect(events).toContainEqual({
      type: "APACHE_KID_IMMUNE",
      playerId: "b",
      fromPlayerId: "a",
      cardId: "bang_15",
    });
  });

  it("nhắm Apache Kid: CHỈ 1 trong 2 lá chất Rô -> vẫn có tác dụng bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "doc_holyday", hand: ["bang_15", "bang_1"] }), // Rô 2, Bích A
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const { state: next } = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["bang_15", "bang_1"],
      targetId: "b",
    });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "doc_holyday", from: "a" } }]);
  });
});

describe("Belle Star — trong lượt của cô ta, MỌI trang bị của người KHÁC mất tác dụng", () => {
  it("Mustang của mục tiêu KHÔNG cộng khoảng cách khi Belle Star bắn", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "belle_star", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["mustang_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    // 3 người ngồi vòng tròn: a-b cách 1 ghế. Nếu Mustang có tác dụng sẽ thành 2 (ngoài tầm súng mặc định 1).
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("Barrel của mục tiêu KHÔNG có tác dụng (không có NEED_DRAW_CHECK nào được đẩy)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "belle_star", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("trang bị vàng 'delayed' đã đủ 1 lượt của người khác KHÔNG dùng được làm Missed! trong lượt Belle Star", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "belle_star", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["sombrero_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      turnNumber: 5,
      equipmentPlayedTurn: { sombrero_1: 0 },
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(() => reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "sombrero_1" })).toThrow(
      /vô hiệu hoá tạm thời/
    );
  });

  it("NGOÀI lượt Belle Star: trang bị người khác hoạt động bình thường (regression)", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "belle_star", equipment: ["mustang_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0, // lượt của a, KHÔNG phải Belle Star (b)
    });

    // Mustang của Belle Star (b) VẪN có tác dụng khi KHÔNG phải lượt cô ta.
    expect(computeDistance(state, "a", "b")).toBe(2); // gốc 1 + Mustang
  });

  it("trang bị của CHÍNH Belle Star vẫn hoạt động bình thường trong lượt của cô ta", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "belle_star", hand: ["bang_1"], equipment: ["scope_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      currentPlayerIndex: 0,
    });

    // a-c cách 2 ghế, Scope của CHÍNH a trừ 1 -> còn 1, trong tầm súng mặc định.
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } }]);
  });

  it("Panic! vẫn cướp được trang bị 'vô hiệu hoá' của người khác bình thường (vật lý vẫn tồn tại)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "belle_star", hand: ["panic_1"] }),
        makePlayer("b", { hand: [], equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
    });

    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "panic_1",
      targetId: "b",
      targetCardId: "scope_1",
    });

    expect(next.players[0].hand).toContain("scope_1");
    expect(next.players[1].equipment).toEqual([]);
  });
});
