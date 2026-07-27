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
      makePlayer("c", { role: "outlaw", alive: false, characterId: null }),
      makePlayer("d", { role: "renegade", alive: false, characterId: null }),
    ];
    expect(checkWinCondition(players)).toEqual({ kind: "faction", faction: "sheriff_deputy" });
  });

  it("Sheriff chết, còn Outlaw sống: Outlaw thắng", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false, characterId: null }),
      makePlayer("b", { role: "deputy" }),
      makePlayer("c", { role: "outlaw" }),
      makePlayer("d", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toEqual({ kind: "faction", faction: "outlaw" });
  });

  it("Sheriff chết, KHÔNG còn Outlaw nào sống nhưng Deputy vẫn sống: vẫn tính Outlaw thắng (không phải Renegade)", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false, characterId: null }),
      makePlayer("b", { role: "deputy" }),
      makePlayer("c", { role: "outlaw", alive: false, characterId: null }),
      makePlayer("d", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toEqual({ kind: "faction", faction: "outlaw" });
  });

  it("Sheriff chết, còn 2 Renegade sống (biến thể 8 người): vẫn tính Outlaw thắng vì Renegade không sống sót một mình", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false, characterId: null }),
      makePlayer("b", { role: "renegade" }),
      makePlayer("c", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toEqual({ kind: "faction", faction: "outlaw" });
  });

  it("Renegade là người sống sót DUY NHẤT: Renegade thắng", () => {
    const players = [
      makePlayer("a", { role: "sheriff", alive: false, characterId: null }),
      makePlayer("b", { role: "deputy", alive: false, characterId: null }),
      makePlayer("c", { role: "outlaw", alive: false, characterId: null }),
      makePlayer("d", { role: "renegade" }),
    ];
    expect(checkWinCondition(players)).toEqual({ kind: "faction", faction: "renegade" });
  });

  it("Biến thể 2 người (role toàn null): người sống sót DUY NHẤT thắng, không theo phe nào", () => {
    const players = [
      makePlayer("a", { role: null }),
      makePlayer("b", { role: null, alive: false, characterId: null }),
    ];
    expect(checkWinCondition(players)).toEqual({ kind: "player", playerId: "a" });
  });

  it("Biến thể 2 người: cả 2 còn sống thì ván tiếp tục", () => {
    const players = [makePlayer("a", { role: null }), makePlayer("b", { role: null })];
    expect(checkWinCondition(players)).toBeNull();
  });

  describe("Biến thể 3 người (vòng tròn săn đuổi công khai)", () => {
    it("cảnh sát giết ĐÚNG mục tiêu (tội phạm) -> thắng ngay", () => {
      const players = [
        makePlayer("a", { role: "police" }),
        makePlayer("b", { role: "criminal", alive: false, characterId: null }),
        makePlayer("c", { role: "traitor" }),
      ];
      expect(checkWinCondition(players, "a")).toEqual({ kind: "player", playerId: "a" });
    });

    it("tội phạm giết ĐÚNG mục tiêu (kẻ phản bội) -> thắng ngay", () => {
      const players = [
        makePlayer("a", { role: "police" }),
        makePlayer("b", { role: "criminal" }),
        makePlayer("c", { role: "traitor", alive: false, characterId: null }),
      ];
      expect(checkWinCondition(players, "b")).toEqual({ kind: "player", playerId: "b" });
    });

    it("kẻ phản bội giết ĐÚNG mục tiêu (cảnh sát) -> thắng ngay", () => {
      const players = [
        makePlayer("a", { role: "police", alive: false, characterId: null }),
        makePlayer("b", { role: "criminal" }),
        makePlayer("c", { role: "traitor" }),
      ];
      expect(checkWinCondition(players, "c")).toEqual({ kind: "player", playerId: "c" });
    });

    it("giết SAI mục tiêu (vd cảnh sát giết kẻ phản bội) -> KHÔNG ai thắng ngay, ván tiếp tục", () => {
      const players = [
        makePlayer("a", { role: "police" }),
        makePlayer("b", { role: "criminal" }),
        makePlayer("c", { role: "traitor", alive: false, characterId: null }),
      ];
      // a (police) giết c (traitor) — police chỉ nên giết criminal, không phải traitor.
      expect(checkWinCondition(players, "a")).toBeNull();
    });

    it("tự chết (killerId null, vd Thuốc nổ) -> không tính là giết đúng mục tiêu, ván tiếp tục", () => {
      const players = [
        makePlayer("a", { role: "police" }),
        makePlayer("b", { role: "criminal", alive: false, characterId: null }),
        makePlayer("c", { role: "traitor" }),
      ];
      expect(checkWinCondition(players, null)).toBeNull();
    });

    it("sau khi giết sai mục tiêu, ván 'rơi' về luật sống sót — người cuối cùng còn sống thắng", () => {
      const players = [
        makePlayer("a", { role: "police", alive: false, characterId: null }),
        makePlayer("b", { role: "criminal", alive: false, characterId: null }),
        makePlayer("c", { role: "traitor" }),
      ];
      // Không cần killerId đúng nữa — chỉ còn 1 người sống là đủ để thắng.
      expect(checkWinCondition(players, "c")).toEqual({ kind: "player", playerId: "c" });
    });

    it("cả 3 còn sống thì ván tiếp tục", () => {
      const players = [
        makePlayer("a", { role: "police" }),
        makePlayer("b", { role: "criminal" }),
        makePlayer("c", { role: "traitor" }),
      ];
      expect(checkWinCondition(players, null)).toBeNull();
    });
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
      { type: "GAME_ENDED", winner: { kind: "faction", faction: "outlaw" } }, // Sheriff chết -> Outlaw thắng
    ]);
    expect(next.winner).toEqual({ kind: "faction", faction: "outlaw" });
  });

  it("Biến thể 3 người qua reduce() thật: giết ĐÚNG mục tiêu bằng Bang! thì thắng ngay, không thưởng/phạt gì", () => {
    const state = makeState([
      makePlayer("a", { role: "police", hand: ["bang_1"] }),
      makePlayer("b", { role: "criminal", hp: 1 }),
      makePlayer("c", { role: "traitor" }),
    ]);

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "b" }); // không đỡ -> chết

    expect(next.players[1].alive).toBe(false);
    expect(next.winner).toEqual({ kind: "player", playerId: "a" });
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "b", amount: 1 },
      { type: "PLAYER_ELIMINATED", playerId: "b", killedBy: "a" },
      { type: "GAME_ENDED", winner: { kind: "player", playerId: "a" } },
    ]);
    // Không có OUTLAW_BOUNTY_DRAWN/SHERIFF_KILLED_DEPUTY_PENALTY nào — vai
    // "police"/"criminal"/"traitor" KHÔNG kế thừa luật phụ của Sheriff/Outlaw.
  });

  it("Biến thể 3 người qua reduce() thật: giết SAI mục tiêu thì ván tiếp tục (chưa ai thắng)", () => {
    const state = makeState([
      makePlayer("a", { role: "police", hand: ["bang_1"] }),
      makePlayer("b", { role: "criminal" }),
      makePlayer("c", { role: "traitor", hp: 1 }),
    ]);

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "c" });

    expect(next.players[2].alive).toBe(false);
    expect(next.winner).toBeNull(); // police giết traitor -> SAI mục tiêu (đáng lẽ phải giết criminal)
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "c", amount: 1 },
      { type: "PLAYER_ELIMINATED", playerId: "c", killedBy: "a" },
    ]); // không có GAME_ENDED
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

  it("còn Bia trên tay + hơn 2 người sống: TỰ ĐỘNG bỏ Bia, hồi về 1 máu, không chết", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { role: "outlaw", hp: 1, hand: ["beer_1", "missed_1"] }),
        makePlayer("c", { role: "renegade" }),
      ],
    );

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "b" }); // không đỡ -> đáng lẽ chết

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(1); // kéo THẲNG về 1, không phải +1
    expect(next.players[1].hand).toEqual(["missed_1"]); // mất đúng lá Bia, giữ nguyên lá còn lại
    expect(next.discardPile).toContain("beer_1");
    expect(next.winner).toBeNull(); // ván chưa kết thúc — không ai chết thật
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "b", amount: 1 },
      { type: "BEER_SAVED_FROM_DEATH", playerId: "b", cardId: "beer_1" },
    ]);
  });

  it("chỉ còn 2 người sống: Bia vô tác dụng dù có trên tay — chết như bình thường", () => {
    // role "renegade" (không phải "outlaw") — CỐ TÌNH tránh kích hoạt luật
    // thưởng "hạ Outlaw thì rút 3 lá": deck rỗng ở đây sẽ làm nó xáo lại
    // CHÍNH chồng bỏ đang muốn kiểm tra (đúng lưu ý đã có ở nhiều test khác).
    const state = makeState([
      makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
      makePlayer("b", { role: "renegade", hp: 1, hand: ["beer_1"] }),
    ]);

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });
    const { state: next, events } = reduce(afterPlay, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.players[1].hand).toEqual([]); // Bia vẫn còn nguyên trong tay lúc chết -> vào chồng bỏ như mọi lá khác
    expect(next.discardPile).toContain("beer_1");
    expect(events).toEqual([
      { type: "DAMAGE_DEALT", playerId: "b", amount: 1 },
      { type: "BEER_INEFFECTIVE", playerId: "b" },
      { type: "PLAYER_ELIMINATED", playerId: "b", killedBy: "a" },
      { type: "GAME_ENDED", winner: { kind: "faction", faction: "sheriff_deputy" } },
    ]);
  });

  it("Bia hồi sinh áp dụng cả cho Thuốc nổ tự nổ (dùng chung eliminateIfDead())", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { role: "outlaw", hp: 2, hand: ["beer_1"], equipment: ["dynamite_1"] }),
        makePlayer("c", { role: "renegade" }),
      ],
      {
        currentPlayerIndex: 1,
        deck: ["missed_6"], // Bích, 2 — khớp Bích 2-9 -> nổ mất 3 máu (sàn 0)
        pending: [
          {
            kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
            matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
          },
        ],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(1);
    expect(next.players[1].hand).toEqual([]);
    expect(events).toContainEqual({ type: "BEER_SAVED_FROM_DEATH", playerId: "b", cardId: "beer_1" });
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);
  });

  it("Bia vừa tự động bỏ là lá CUỐI CÙNG: Suzy Lafayette vẫn được rút bù ngay", () => {
    const state = makeState([
      makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
      makePlayer("b", { role: "outlaw", hp: 1, hand: ["beer_1"], characterId: "suzy_lafayette" }),
      makePlayer("c", { role: "renegade" }),
    ], { deck: ["card_1"] });

    const { state: afterPlay } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b",
    });
    const { state: next } = reduce(afterPlay, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(1);
    expect(next.players[1].hand).toEqual(["card_1"]); // tay về 0 sau khi mất Bia -> rút bù ngay 1 lá
  });

  it("game kết thúc: không thể reduce() tiếp", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { role: "deputy" }),
      ],
      { winner: { kind: "faction", faction: "sheriff_deputy" } }
    );

    expect(() => reduce(state, { type: "END_TURN", playerId: "a" })).toThrow(/kết thúc/);
  });
});
