import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import { setupGame } from "../src/core/setup";
import type { Action, GameState } from "../src/core/types";

// State tối giản, tự tay dựng (không qua setupGame) để kiểm soát chính xác
// từng tình huống biên: người chết, deck rỗng...
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
    ],
    deck: ["card_1", "card_2", "card_3", "card_4"],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "draw",
    rngState: 123,
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

describe("reduce — DRAW_CARDS", () => {
  it("rút đúng 2 lá từ đỉnh deck, chuyển sang giai đoạn play", () => {
    const state = makeState();
    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["card_4", "card_3"]); // rút từ cuối mảng (đỉnh deck)
    expect(next.deck).toEqual(["card_1", "card_2"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toEqual([{ type: "CARDS_DRAWN", playerId: "a", count: 2 }]);
  });

  it("không sửa state gốc truyền vào", () => {
    const state = makeState();
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(state).toEqual(snapshot);
  });

  it("báo lỗi nếu không phải lượt của người đó", () => {
    const state = makeState();
    expect(() => reduce(state, { type: "DRAW_CARDS", playerId: "b" })).toThrow();
  });

  it("báo lỗi nếu sai giai đoạn", () => {
    const state = makeState({ turnPhase: "play" });
    expect(() => reduce(state, { type: "DRAW_CARDS", playerId: "a" })).toThrow();
  });

  it("hết deck thì xáo chồng bỏ làm deck mới rồi rút tiếp", () => {
    const state = makeState({ deck: ["card_1"], discardPile: ["d1", "d2", "d3"] });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    // rút được đủ 2 lá: 1 từ deck cũ + 1 từ deck xáo lại từ chồng bỏ
    expect(next.players[0].hand.length).toBe(2);
    expect(next.players[0].hand).toContain("card_1");
    // tổng bài không đổi: 1 lá từ deck cũ + 3 lá từ chồng bỏ = 4
    expect(next.discardPile).toEqual([]);
    expect(next.deck.length + next.players[0].hand.length).toBe(4);
  });
});

describe("reduce — END_TURN", () => {
  it("tay ≤ máu thì chuyển lượt luôn, bỏ qua người đã chết", () => {
    const state = makeState({
      turnPhase: "play",
      currentPlayerIndex: 0,
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 4, maxHp: 4, hand: ["c1"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: false, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.currentPlayerIndex).toBe(2); // bỏ qua b (đã chết)
    expect(next.turnPhase).toBe("draw");
    expect(events).toEqual([{ type: "TURN_ENDED", playerId: "a" }]);
  });

  it("tay > máu thì chuyển sang giai đoạn discard, chưa qua lượt", () => {
    const state = makeState({
      turnPhase: "play",
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 2, maxHp: 2, hand: ["c1", "c2", "c3"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      ],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.turnPhase).toBe("discard");
    expect(next.currentPlayerIndex).toBe(0); // chưa chuyển lượt
    expect(events).toEqual([]);
  });
});

describe("reduce — DISCARD_CARDS", () => {
  const baseDiscardState = (): GameState =>
    makeState({
      turnPhase: "discard",
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 2, maxHp: 2, hand: ["c1", "c2", "c3"], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "c", name: "c", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
        { id: "d", name: "d", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      ],
    });

  it("bỏ đủ bài thừa thì chuyển lượt, bài rơi vào chồng bỏ", () => {
    const { state: next, events } = reduce(baseDiscardState(), {
      type: "DISCARD_CARDS",
      playerId: "a",
      cardIds: ["c1"],
    });

    expect(next.players[0].hand).toEqual(["c2", "c3"]);
    expect(next.discardPile).toEqual(["c1"]);
    expect(next.turnPhase).toBe("draw");
    expect(next.currentPlayerIndex).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["CARDS_DISCARDED", "TURN_ENDED"]);
  });

  it("báo lỗi nếu bỏ chưa đủ (vẫn còn dư so với máu)", () => {
    expect(() =>
      reduce(baseDiscardState(), { type: "DISCARD_CARDS", playerId: "a", cardIds: [] })
    ).toThrow();
  });

  it("báo lỗi nếu bỏ lá không có trong tay", () => {
    expect(() =>
      reduce(baseDiscardState(), { type: "DISCARD_CARDS", playerId: "a", cardIds: ["khong-ton-tai"] })
    ).toThrow();
  });
});

describe("reduce — hành động không rõ", () => {
  it("báo lỗi thay vì âm thầm bỏ qua", () => {
    const state = makeState();
    const badAction = { type: "UNKNOWN", playerId: "a" } as unknown as Action;
    expect(() => reduce(state, badAction)).toThrow();
  });
});

describe("reduce — chạy trọn vòng lượt từ setupGame", () => {
  it("draw → end turn (dư bài phải bỏ) → discard → sang người kế tiếp", () => {
    let state = setupGame(["a", "b", "c", "d"], 1);
    const firstPlayerId = state.players[state.currentPlayerIndex].id;

    ({ state } = reduce(state, { type: "DRAW_CARDS", playerId: firstPlayerId }));
    expect(state.turnPhase).toBe("play");

    ({ state } = reduce(state, { type: "END_TURN", playerId: firstPlayerId }));

    // Vừa rút 2 lá cộng với bài chia lúc đầu chắc chắn dư so với máu, nên phải
    // qua giai đoạn discard trước khi thật sự chuyển lượt — đây là hành vi đúng.
    if (state.turnPhase === "discard") {
      const player = state.players.find((p) => p.id === firstPlayerId)!;
      const excess = player.hand.length - player.hp;
      const toDiscard = player.hand.slice(0, excess);
      ({ state } = reduce(state, {
        type: "DISCARD_CARDS",
        playerId: firstPlayerId,
        cardIds: toDiscard,
      }));
    }

    expect(state.turnPhase).toBe("draw");
    expect(state.players[state.currentPlayerIndex].id).not.toBe(firstPlayerId);
  });
});
