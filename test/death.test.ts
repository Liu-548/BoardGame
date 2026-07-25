import { describe, expect, it } from "vitest";
import { checkWinCondition } from "../src/core/win";
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
    ...overrides,
  };
}

describe("checkWinCondition", () => {
  it("còn đủ 3 phe: ván tiếp tục", () => {
    const players = [
      makePlayer("a", { role: "sheriff" }),
      makePlayer("b", { role: "outlaw" }),
      makePlayer("c", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toBeNull();
  });

  it("hết sạch Outlaw lẫn Renegade, Sheriff còn sống: phe luật pháp thắng", () => {
    const players = [
      makePlayer("a", { role: "sheriff" }),
      makePlayer("b", { role: "deputy" }),
      makePlayer("c", { role: "outlaw", alive: false }),
      makePlayer("d", { role: "renegade", alive: false }),
    ];
    expect(checkWinCondition(players)).toBe("sheriff_deputy");
  });

  it("Sheriff chết, còn Outlaw sống: Outlaw thắng", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false }),
      makePlayer("b", { role: "deputy" }),
      makePlayer("c", { role: "outlaw" }),
      makePlayer("d", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toBe("outlaw");
  });

  it("Sheriff chết, KHÔNG còn Outlaw nào sống nhưng Deputy vẫn sống: vẫn tính Outlaw thắng (không phải Renegade)", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false }),
      makePlayer("b", { role: "deputy" }),
      makePlayer("c", { role: "outlaw", alive: false }),
      makePlayer("d", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toBe("outlaw");
  });

  it("Sheriff chết, còn 2 Renegade sống (biến thể 8 người): vẫn tính Outlaw thắng vì Renegade không sống sót một mình", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false }),
      makePlayer("b", { role: "renegade" }),
      makePlayer("c", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toBe("outlaw");
  });

  it("Renegade là người sống sót DUY NHẤT: Renegade thắng", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false }),
      makePlayer("b", { role: "deputy", alive: false }),
      makePlayer("c", { role: "outlaw", alive: false }),
      makePlayer("d", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toBe("renegade");
  });
});

describe("reduce — chết + thưởng/phạt", () => {
  it("hạ gục Outlaw: người kết liễu rút thưởng 3 lá", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { role: "outlaw", hp: 1 }),
        makePlayer("c", { role: "renegade" }),
      ],
      { deck: ["c3", "c2", "c1"] } // đỉnh deck (rút trước) = c1
    );

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.players[1].hp).toBe(0);
    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]); // a (killer) rút 3 lá thưởng
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "b", amount: 1 },
      { type: "PLAYER_ELIMINATED", playerId: "b", killedBy: "a" },
      { type: "OUTLAW_BOUNTY_DRAWN", playerId: "a", count: 3 },
    ]);
  });

  it("Sheriff giết nhầm Deputy: Sheriff bị phạt bỏ hết bài tay + sân, KHÔNG có thưởng", () => {
    const state = makeState([
      makePlayer("a", { role: "sheriff", hand: ["bang_1"], equipment: ["scope_1"] }),
      makePlayer("b", { role: "deputy", hp: 1 }),
      makePlayer("c", { role: "outlaw" }),
    ]);

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.players[0].hand).toEqual([]); // Sheriff mất hết bài trên tay
    expect(next.players[0].equipment).toEqual([]); // và cả trên sân
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "b", amount: 1 },
      { type: "PLAYER_ELIMINATED", playerId: "b", killedBy: "a" },
      { type: "SHERIFF_KILLED_DEPUTY_PENALTY", playerId: "a" },
    ]);
  });

  it("Duel: thua duel với chính mình cũng tính killer là đối thủ hiện tại", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff", hp: 1 }),
        makePlayer("b", { role: "outlaw", hand: ["duel_1"] }),
        makePlayer("c", { role: "renegade" }),
      ],
      { currentPlayerIndex: 1 }
    );

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "b", cardId: "duel_1", targetId: "a",
    });
    // a không có Bang! để đỡ -> chịu mất máu, chết luôn (hp 1 -> 0)
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].alive).toBe(false);
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "a", amount: 1 },
      { type: "PLAYER_ELIMINATED", playerId: "a", killedBy: "b" },
      { type: "GAME_ENDED", winner: "outlaw" }, // Sheriff chết -> Outlaw thắng
    ]);
    expect(next.winner).toBe("outlaw");
  });

  it("tự nổ Dynamite: không ai được thưởng, không ai bị phạt", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { role: "outlaw", hp: 2, equipment: ["dynamite_1"] }),
        makePlayer("c", { role: "renegade" }),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["missed_6"], // spades, 2 — khớp Bích 2-9
        pending: [
          {
            kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
            matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
          },
        ],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(events.some((e) => e.type === "OUTLAW_BOUNTY_DRAWN")).toBe(false);
    expect(events.some((e) => e.type === "SHERIFF_KILLED_DEPUTY_PENALTY")).toBe(false);
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "b", killedBy: null });
  });

  it("game kết thúc: không thể reduce() tiếp", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { role: "deputy" }),
      ],
      { winner: "sheriff_deputy" }
    );

    expect(() => reduce(state, { type: "END_TURN", playerId: "a" })).toThrow(/kết thúc/);
  });
});
