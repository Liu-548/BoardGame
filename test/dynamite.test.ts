import { describe, expect, it } from "vitest";
import { giveCardToPlayer, transferDynamiteToNextPlayer } from "../src/core/equipment";
import { reduce } from "../src/core/reduce";
import { setupGame } from "../src/core/setup";
import type { GameState, PlayerState } from "../src/core/types";

// Suit/rank tra từ CARD_SUIT_RANKS (cards.ts):
//   missed_6 = spades,2  (khớp Bích 2-9)   jail_2 = spades,10 (Bích nhưng ngoài 2-9)
//   jail_1   = hearts,4  (sai chất)
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
    ],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 123,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
    equipmentPlayedTurn: {},
    houseRules: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("equipment.ts — giveCardToPlayer/transferDynamiteToNextPlayer", () => {
  function makePlayers(): PlayerState[] {
    return [
      { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
      { id: "c", name: "c", role: "renegade", hp: 4, maxHp: 4, hand: [], equipment: [], alive: true, characterId: null },
    ];
  }

  it("Dynamite vào tay ai đó thì tự gắn vào equipment CỦA CHÍNH HỌ, không vào hand", () => {
    const players = makePlayers();
    giveCardToPlayer(players, players[1], "dynamite_1");

    expect(players[1].hand).toEqual([]);
    expect(players[1].equipment).toEqual(["dynamite_1"]);
  });

  it("lá thường (không phải Dynamite) vẫn vào tay như bình thường", () => {
    const players = makePlayers();
    giveCardToPlayer(players, players[1], "bang_1");

    expect(players[1].hand).toEqual(["bang_1"]);
    expect(players[1].equipment).toEqual([]);
  });

  it("Dynamite thứ 2 vào tay người ĐÃ có sẵn 1 quả: chuyển cho người kế tiếp còn sống", () => {
    const players = makePlayers();
    players[1].equipment = ["dynamite_1"]; // b đã có sẵn

    giveCardToPlayer(players, players[1], "dynamite_2");

    expect(players[1].equipment).toEqual(["dynamite_1"]); // giữ nguyên quả cũ
    expect(players[2].equipment).toEqual(["dynamite_2"]); // c (kế tiếp b) nhận quả mới
  });

  it("logic chuyển bỏ qua người đã chết", () => {
    const players = makePlayers();
    players[1].equipment = ["dynamite_1"];
    players[2].alive = false; // c chết, bỏ qua

    giveCardToPlayer(players, players[1], "dynamite_2");

    expect(players[0].equipment).toEqual(["dynamite_2"]); // vòng lại a
  });

  it("transferDynamiteToNextPlayer: chuyển Dynamite đang ở sân sang người kế tiếp", () => {
    const players = makePlayers();
    players[1].equipment = ["dynamite_1"];

    transferDynamiteToNextPlayer(players, players[1]);

    expect(players[1].equipment).toEqual([]);
    expect(players[2].equipment).toEqual(["dynamite_1"]);
  });

  it("2 người, cả hai đã có Dynamite riêng (bộ tuỳ chỉnh nhiều hơn 1 quả): quay vòng về chính mình", () => {
    const players: PlayerState[] = [
      { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: ["dynamite_2"], alive: true, characterId: null },
      { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
    ];

    transferDynamiteToNextPlayer(players, players[1]); // b chuyển dynamite_1 đi

    // a đã có dynamite_2 rồi, đi hết vòng quay lại b (chính người vừa chuyển)
    expect(players[1].equipment).toEqual(["dynamite_1"]);
    expect(players[0].equipment).toEqual(["dynamite_2"]);
  });
});

describe("reduce — DRAW_CARDS rút phải Dynamite", () => {
  it("Dynamite rút được tự xuống sân, không vào tay", () => {
    const state = makeState({
      deck: ["bang_1", "dynamite_1"], // đỉnh deck (rút trước) = dynamite_1
      currentPlayerIndex: 0,
      turnPhase: "draw",
    });

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].equipment).toEqual(["dynamite_1"]);
    expect(next.players[0].hand).toEqual(["bang_1"]);
  });
});

describe("Bước 0 đầu lượt — Dynamite", () => {
  it("người kế tiếp có Dynamite: END_TURN đẩy NEED_DRAW_CHECK (Bích 2-9)", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.pending).toEqual([
      {
        kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
        matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
      },
    ]);
  });

  it("draw! khớp Bích 2-9: nổ, trừ 3 máu (sàn 0), bỏ Dynamite, chết vì tự nổ nên tự chuyển lượt", () => {
    const state = makeState({
      deck: ["missed_6"], // spades, 2 — khớp
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 2, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [
        {
          kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
          matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(0); // 2 máu - 3 sát thương, sàn ở 0
    expect(next.players[1].alive).toBe(false); // tự nổ chết, không ai "giết"
    expect(next.players[1].equipment).toEqual([]);
    // "missed_6" = lá vừa lật ra, "dynamite_1" = chính quả Dynamite phát nổ
    expect(next.discardPile).toEqual(["missed_6", "dynamite_1"]);
    expect(next.pending).toEqual([]);
    // b vừa chết mà đang là người tới lượt -> tự chuyển sang c (bỏ qua rút/đánh/bỏ bài)
    expect(next.currentPlayerIndex).toBe(2);
    expect(next.turnPhase).toBe("draw");
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "missed_6", matched: true },
      { type: "DYNAMITE_EXPLODED", playerId: "b", amount: 2 },
      { type: "PLAYER_ELIMINATED", playerId: "b", killedBy: null },
    ]);
  });

  it("draw! không khớp: chuyển Dynamite cho người kế tiếp, không mất máu", () => {
    const state = makeState({
      deck: ["jail_1"], // hearts, 4 — không khớp Bích
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [
        {
          kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
          matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(next.players[1].equipment).toEqual([]);
    expect(next.players[2].equipment).toEqual(["dynamite_1"]); // chuyển sang c
    expect(next.pending).toEqual([]);
    expect(events).toEqual([
      { type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "jail_1", matched: false },
      { type: "DYNAMITE_PASSED", playerId: "b" },
    ]);
  });

  it("Dynamite kiểm tra TRƯỚC Jail: xong Dynamite thì tự đẩy tiếp Jail-check nếu còn", () => {
    const state = makeState({
      deck: ["jail_1"], // hearts, 4 — không khớp Bích → Dynamite chuyển đi
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1", "jail_2"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [
        {
          kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
          matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] },
    ]);
  });

  it("DRAW_CARDS bị chặn khi còn Dynamite-check đang chờ", () => {
    const state = makeState({
      players: [
        { id: "a", name: "a", role: "sheriff", hp: 5, maxHp: 5, hand: [], equipment: [], alive: true, characterId: null },
        { id: "b", name: "b", role: "outlaw", hp: 4, maxHp: 4, hand: [], equipment: ["dynamite_1"], alive: true, characterId: null },
        ...makeState().players.slice(2),
      ],
      currentPlayerIndex: 1,
      pending: [
        {
          kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
          matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    expect(() => reduce(state, { type: "DRAW_CARDS", playerId: "b" })).toThrow();
  });
});

describe("setupGame — Bước 0 áp dụng cả cho lượt đầu tiên", () => {
  it("nếu người đi lượt đầu (Sheriff) được chia Dynamite, ván phải bắt đầu với NEED_DRAW_CHECK sẵn trong pending", () => {
    // setupGame không đi qua advanceTurn() nên phải tự applyTurnStartChecks() ở
    // cuối — thử nhiều seed để chắc chắn bắt được ít nhất 1 ca Sheriff dính
    // Dynamite ngay từ đầu (dò tay, không đoán trước seed nào ra kết quả gì).
    let sawSheriffWithDynamite = false;

    for (let seed = 0; seed < 100; seed++) {
      const state = setupGame(["a", "b", "c", "d"], seed);
      const current = state.players[state.currentPlayerIndex];
      const currentHasDynamite = current.equipment.some((id) => id.startsWith("dynamite"));

      if (currentHasDynamite) {
        sawSheriffWithDynamite = true;
        expect(state.pending).toEqual([
          { kind: "NEED_DRAW_CHECK", player: current.id, source: { card: "dynamite" }, matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"] },
        ]);
      } else {
        expect(state.pending).toEqual([]);
      }
    }

    expect(sawSheriffWithDynamite).toBe(true);
  });
});
