// Bộ mở rộng "custom_characters" (Mary Rose, xem House_Rule.txt mục I) —
// THẬT SỰ mất máu (không đỡ được) vì trúng Bang! ĐƠN LẺ (không tính Gatling/
// Duel/Indians!) thì bắn trả MIỄN PHÍ, bỏ qua khoảng cách, cần 2 Missed! mới
// né được. Đổi lại, đánh Bang! chủ động phải bỏ đủ 2 lá Bang! thay vì 1.
//
// Nhân vật này HOÀN TOÀN KHÔNG CẦN state riêng trong GameState (khác Elena
// Noir/Marcel Marcelo) — mọi thứ tính lại ngay mỗi lần qua
// getEffectiveCharacterDefinition(), nên không cần sửa makeState() ở các file
// test khác.
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
    expansions: ["custom_characters"],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Mary Rose — bắn trả miễn phí khi trúng Bang! đơn lẻ", () => {
  it("trúng Bang!, KHÔNG đỡ (chịu mất máu) -> bắn trả, cần 2 Missed!", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3 }),
      makePlayer("c"),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2);
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "bang", from: "b" }, missesNeeded: 2 },
    ]);
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "b", amount: 1 },
      { type: "MARY_ROSE_REFLECTED", playerId: "b", targetId: "a" },
    ]);
  });

  it("đỡ được bằng Missed! -> KHÔNG mất máu -> KHÔNG bắn trả", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3, hand: ["missed_1"] }),
      makePlayer("c"),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });

    expect(next.players[1].hp).toBe(3);
    expect(next.pending).toEqual([]);
    expect(events.some((e) => e.type === "MARY_ROSE_REFLECTED")).toBe(false);
  });

  it("Gatling trúng, không đỡ -> KHÔNG bắn trả (chỉ tính Bang! đơn lẻ)", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3 }), makePlayer("c")],
      { pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } }] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2);
    expect(next.pending).toEqual([]);
    expect(events.some((e) => e.type === "MARY_ROSE_REFLECTED")).toBe(false);
  });

  it("Indians! trúng, không đỡ -> KHÔNG bắn trả (khác cơ chế hẳn, không qua respondToMissed())", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3 }), makePlayer("c")],
      { pending: [{ kind: "NEED_DISCARD_BANG", player: "b", source: { card: "indians", from: "a" } }] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2);
    expect(events.some((e) => e.type === "MARY_ROSE_REFLECTED")).toBe(false);
  });

  it("thua Đấu tay đôi (Duel), không đỡ -> KHÔNG bắn trả", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3 }), makePlayer("c")],
      { pending: [{ kind: "NEED_DUEL_RESPONSE", player: "b", opponent: "a", source: { card: "duel", from: "a" } }] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2);
    expect(events.some((e) => e.type === "MARY_ROSE_REFLECTED")).toBe(false);
  });

  it("người bị bắn trả cần ĐỦ 2 Missed! mới né được — 1 lá là chưa đủ", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["missed_1", "missed_2"] }), makePlayer("b", { characterId: "mary_rose" }), makePlayer("c")],
      { pending: [{ kind: "NEED_MISSED", player: "a", source: { card: "bang", from: "b" }, missesNeeded: 2 }] }
    );

    const { state: afterFirst } = reduce(state, { type: "RESPOND", playerId: "a", cardId: "missed_1" });
    expect(afterFirst.players[0].hp).toBe(4); // chưa mất máu
    expect(afterFirst.pending).toEqual([{ kind: "NEED_MISSED", player: "a", source: { card: "bang", from: "b" } }]);

    const { state: afterSecond, events } = reduce(afterFirst, { type: "RESPOND", playerId: "a", cardId: "missed_2" });
    expect(afterSecond.players[0].hp).toBe(4); // né trọn vẹn, không mất máu
    expect(afterSecond.pending).toEqual([]);
    expect(events).toEqual([{ type: "MISSED_PLAYED", playerId: "a" }]);
  });

  it("kích hoạt NGAY CẢ KHI đòn Bang! đó giết chết Mary Rose", () => {
    const state = makeState([
      makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
      makePlayer("b", { characterId: "mary_rose", hp: 1, maxHp: 3, hand: [] }),
      makePlayer("c", { role: "renegade" }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "b", killedBy: "a" });
    expect(events).toContainEqual({ type: "MARY_ROSE_REFLECTED", playerId: "b", targetId: "a" });
  });

  it("vẫn tôn trọng Barrel thật của người bị bắn trả (đẩy draw! check lên trên)", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"], equipment: ["barrel_1"] }),
      makePlayer("b", { characterId: "mary_rose", hp: 3, maxHp: 3 }),
      makePlayer("c"),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "bang", from: "b" }, missesNeeded: 2 },
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "barrel" }, matchSuits: ["hearts"] },
    ]);
  });
});

describe("Mary Rose — phải bỏ đủ 2 lá Bang! để đánh Bang! chủ động", () => {
  it("chỉ có 1 lá Bang! trên tay -> báo lỗi, không đánh được", () => {
    const state = makeState([
      makePlayer("a", { characterId: "mary_rose", hand: ["bang_1"] }),
      makePlayer("b"),
      makePlayer("c"),
    ]);

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })
    ).toThrow(/2 lá Bang/);
  });

  it("đủ 2 lá Bang! -> bỏ CẢ 2, mục tiêu vẫn bị nhắm bình thường", () => {
    const state = makeState([
      makePlayer("a", { characterId: "mary_rose", hand: ["bang_1", "bang_2"] }),
      makePlayer("b"),
      makePlayer("c"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });

    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toEqual(["bang_1", "bang_2"]);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "bang_1", targetId: "b" },
      { type: "MARY_ROSE_EXTRA_BANG_DISCARDED", playerId: "a", cardId: "bang_2" },
    ]);
  });
});

describe("Mary Rose — Vera Custer mượn khả năng (không cần state riêng)", () => {
  it("Vera Custer đang mượn Mary Rose: đánh Bang! chủ động vẫn phải bỏ đủ 2 lá", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { characterId: "vera_custer", hand: ["bang_1", "bang_2"] }),
        makePlayer("c"),
      ],
      { currentPlayerIndex: 1, veraCusterBorrowedCharacterId: "mary_rose" }
    );

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "b", cardId: "bang_1", targetId: "a",
    });

    expect(next.players[1].hand).toEqual([]);
    expect(events).toContainEqual({ type: "MARY_ROSE_EXTRA_BANG_DISCARDED", playerId: "b", cardId: "bang_2" });
  });

  it("Vera Custer đang mượn Mary Rose: trúng Bang!, không đỡ -> cũng bắn trả lại", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "vera_custer" }),
        makePlayer("c"),
      ],
      { veraCusterBorrowedCharacterId: "mary_rose" }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(events).toContainEqual({ type: "MARY_ROSE_REFLECTED", playerId: "b", targetId: "a" });
  });
});
