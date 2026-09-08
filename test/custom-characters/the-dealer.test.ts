// Bộ mở rộng "custom_characters" (Envoy Evy, xem docs/bang-rules/House_Rule.txt mục I) — mỗi
// khi bị nhắm bởi 1 đòn "kiểu Bang!" (Bang!, Gatling, Punch, Springfield,
// Derringer, Knife, Pepperbox, Buffalo Rifle, Howitzer, đòn của Doc
// Holyday...) và không đỡ được, được hỏi có muốn đưa 2 lá NGẪU NHIÊN trên tay
// cho NGƯỜI ĐÁNH lá đó để vô hiệu đòn đó hay không — không giới hạn số lần,
// miễn còn đủ 2 lá.
//
// Khác Nomad Norman: "còn đủ 2 lá" KHÔNG phải bí mật (handCount vốn đã công
// khai) nên pending NEED_USE_DEALER_TRADE chỉ đẩy KHI THẬT SỰ đủ điều kiện,
// không cần mẹo "đẩy vô điều kiện". Điểm cắm DUY NHẤT: nhánh "không đỡ được"
// của respondToMissed() — mọi lá "kiểu Bang!" đều đi qua NEED_MISSED.
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

describe("Envoy Evy — NEED_USE_DEALER_TRADE chỉ đẩy khi đủ điều kiện", () => {
  it("bị Bang!, không đỡ, còn ≥2 lá -> đẩy NEED_USE_DEALER_TRADE", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      {
        kind: "NEED_USE_DEALER_TRADE",
        player: "b",
        missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      },
    ]);
    expect(events).toEqual([]);
    expect(next.players[1].hp).toBe(4); // chưa trừ máu, đang chờ trả lời
  });

  it("tay CHỈ có 1 lá -> KHÔNG đẩy pending, áp damage bình thường luôn", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hand: ["missed_2"] }),
        makePlayer("c"),
      ],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(3);
    expect(next.players[1].hand).toEqual(["missed_2"]); // không đụng gì tới tay
  });

  it("nhân vật KHÔNG phải Envoy Evy -> không có pending nào, mất máu bình thường", () => {
    const state = makeState({
      players: [makePlayer("a"), makePlayer("b", { hand: ["missed_2", "beer_1"] }), makePlayer("c")],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(3);
  });

  it("A Fistful of Cards (source.from: null) nhắm trúng -> KHÔNG đẩy pending (không có ai để đưa bài)", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "a_fistful_of_cards", from: null } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(3);
    expect(next.players[1].hand).toEqual(["missed_2", "beer_1"]); // không đụng tay
  });

  it("người vừa đánh mình ĐÃ chết -> KHÔNG đẩy pending, áp damage bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { alive: false }),
        makePlayer("b", { characterId: "the_dealer", hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(3);
  });

  it("áp dụng cho Gatling (source.card = 'gatling') — khác Mary Rose, Gatling VẪN kích hoạt được", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      {
        kind: "NEED_USE_DEALER_TRADE",
        player: "b",
        missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } },
      },
    ]);
  });
});

describe("Envoy Evy — trả lời NEED_USE_DEALER_TRADE", () => {
  it("đồng ý trao đổi -> 2 lá ngẫu nhiên rời tay, SANG ĐÚNG tay kẻ tấn công, không mất máu", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: [] }),
        makePlayer("b", { characterId: "the_dealer", hp: 4, hand: ["missed_2", "beer_1", "bang_3"] }),
        makePlayer("c"),
      ],
      pending: [
        {
          kind: "NEED_USE_DEALER_TRADE",
          player: "b",
          missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", useDealerTrade: true });

    expect(next.players[1].hp).toBe(4); // KHÔNG mất máu
    expect(next.players[1].hand).toHaveLength(1); // còn lại đúng 1 lá (3 - 2)
    expect(next.players[0].hand).toHaveLength(2); // "a" (kẻ tấn công) nhận đủ 2 lá
    const tradedEvent = events.find((e) => e.type === "DEALER_TRADE_USED");
    expect(tradedEvent).toMatchObject({ type: "DEALER_TRADE_USED", playerId: "b", targetId: "a" });
    if (tradedEvent?.type === "DEALER_TRADE_USED") {
      expect(tradedEvent.cardIds).toHaveLength(2);
      // 2 lá vừa nhận đúng bằng 2 lá đã báo trong event.
      expect(next.players[0].hand.slice().sort()).toEqual([...tradedEvent.cardIds].sort());
    }
    expect(next.discardPile).toEqual([]); // KHÔNG vào chồng bỏ
    expect(next.pending).toEqual([]);
  });

  it("từ chối (không kèm useDealerTrade) -> mất máu bình thường, tay không đổi", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hp: 4, hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [
        {
          kind: "NEED_USE_DEALER_TRADE",
          player: "b",
          missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(3);
    expect(next.players[1].hand).toEqual(["missed_2", "beer_1"]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "DEALER_TRADE_USED" }));
  });

  it("đúng 2 lá cuối cùng -> tay về 0 -> triggerHandEmptyHook() chạy SAU KHI cả 2 lá đã rời tay", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hp: 4, hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [
        {
          kind: "NEED_USE_DEALER_TRADE",
          player: "b",
          missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        },
      ],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b", useDealerTrade: true });

    expect(next.players[1].hand).toEqual([]);
    expect(next.players[0].hand).toHaveLength(2);
  });

  it("KHÔNG kích hoạt phản đòn Mary Rose khi đã trao đổi thành công (không mất máu thật)", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hp: 4, hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      pending: [
        {
          kind: "NEED_USE_DEALER_TRADE",
          player: "b",
          missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        },
      ],
    });

    const { events } = reduce(state, { type: "RESPOND", playerId: "b", useDealerTrade: true });

    expect(events).not.toContainEqual(expect.objectContaining({ type: "MARY_ROSE_REFLECTED" }));
  });

  it("không giới hạn số lần trong ván — bị bắn lần 2 vẫn dùng được, miễn còn đủ 2 lá", () => {
    let state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "the_dealer", hp: 4, hand: ["missed_2", "beer_1", "bang_3", "jail_1"] }),
        makePlayer("c"),
      ],
      pending: [
        {
          kind: "NEED_USE_DEALER_TRADE",
          player: "b",
          missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
        },
      ],
    });

    let result = reduce(state, { type: "RESPOND", playerId: "b", useDealerTrade: true });
    expect(result.state.players[1].hand).toHaveLength(2); // 4 - 2

    // Bị bắn lần 2 ngay sau đó — vẫn còn đủ 2 lá.
    result = {
      state: {
        ...result.state,
        pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
      },
      events: [],
    };
    result = reduce(result.state, { type: "RESPOND", playerId: "b" });
    expect(result.state.pending).toEqual([
      {
        kind: "NEED_USE_DEALER_TRADE",
        player: "b",
        missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      },
    ]);
  });
});

describe("Envoy Evy — Vera Custer mượn khả năng", () => {
  it("Vera Custer mượn Envoy Evy -> cũng đẩy NEED_USE_DEALER_TRADE khi bị bắn", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "vera_custer", hand: ["missed_2", "beer_1"] }),
        makePlayer("c"),
      ],
      veraCusterBorrowedCharacterId: "the_dealer",
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      {
        kind: "NEED_USE_DEALER_TRADE",
        player: "b",
        missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      },
    ]);
  });
});
