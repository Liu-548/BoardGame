import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState } from "../src/core/types";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["bang_1"], equipment: [], alive: true },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: ["missed_1"], equipment: [], alive: true },
      { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true },
      { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: false },
    ],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 1,
    winner: null,
    ...overrides,
  };
}

describe("reduce — PLAY_CARD (Bang!)", () => {
  it("đánh Bang! đẩy NEED_MISSED lên pending, bỏ lá vào chồng bỏ", () => {
    const state = makeState();
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
    });

    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toEqual(["bang_1"]);
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);
    expect(events).toEqual([
      { type: "CARD_PLAYED", playerId: "a", cardId: "bang_1", targetId: "b" },
    ]);
    // chưa trừ máu ngay
    expect(next.players[1].hp).toBe(4);
  });

  it("không sửa state gốc", () => {
    const state = makeState();
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(state).toEqual(snapshot);
  });

  it("báo lỗi nếu không phải giai đoạn play", () => {
    const state = makeState({ turnPhase: "draw" });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })
    ).toThrow();
  });

  it("báo lỗi nếu còn pending chưa giải quyết", () => {
    const state = makeState({
      pending: [{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "b" } }],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })
    ).toThrow();
  });

  it("báo lỗi nếu tự bắn chính mình", () => {
    const state = makeState();
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "a" })
    ).toThrow();
  });

  it("báo lỗi nếu mục tiêu đã chết", () => {
    const state = makeState();
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "d" })
    ).toThrow();
  });

  it("báo lỗi nếu đánh lá chưa hỗ trợ", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["jail_1"], equipment: [], alive: true },
        ...makeState().players.slice(1),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b" })
    ).toThrow();
  });
});

describe("reduce — RESPOND", () => {
  function stateWithPending(): GameState {
    return makeState({
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });
  }

  it("đưa Missed! thì gỡ pending, không mất máu", () => {
    const { state: next, events } = reduce(stateWithPending(), {
      type: "RESPOND",
      playerId: "b",
      cardId: "missed_1",
    });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4);
    expect(next.players[1].hand).toEqual([]);
    expect(next.discardPile).toEqual(["missed_1"]);
    expect(events).toEqual([{ type: "MISSED_PLAYED", playerId: "b" }]);
  });

  it("không đưa gì thì gỡ pending, trừ 1 máu", () => {
    const { state: next, events } = reduce(stateWithPending(), {
      type: "RESPOND",
      playerId: "b",
    });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(3);
    expect(events).toEqual([{ type: "DAMAGE_DEALT", playerId: "b", amount: 1 }]);
  });

  it("báo lỗi nếu không phải người đang được chờ phản hồi", () => {
    expect(() => reduce(stateWithPending(), { type: "RESPOND", playerId: "c" })).toThrow();
  });

  it("báo lỗi nếu không có pending nào", () => {
    expect(() => reduce(makeState(), { type: "RESPOND", playerId: "b" })).toThrow();
  });

  it("báo lỗi nếu đưa lá không phải Missed!", () => {
    const state = stateWithPending();
    state.players[1].hand = ["beer_1"];
    expect(() =>
      reduce(state, { type: "RESPOND", playerId: "b", cardId: "beer_1" })
    ).toThrow();
  });
});
