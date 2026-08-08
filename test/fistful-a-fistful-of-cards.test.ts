// Mở rộng A Fistful of Cards — lá "A Fistful of Cards" (nhóm B, lá cuối, hiệu
// lực tới hết ván): đầu lượt (SAU Vera Custer, TRƯỚC Dynamite/Jail), người tới
// lượt bị bắn bấy nhiêu phát Bang! bằng đúng số lá trên tay lúc đó — TỪNG PHÁT
// MỘT (không phải 1 đòn missesNeeded cao), cho phép dùng Beer/Missed! giữa
// chừng. Không có "người bắn" (source.from = null) — El Gringo không cướp bài,
// Mary Rose không bắn trả. Xem Luat_Bang_Mo_Rong_FistfulOfCards.txt mục
// "A Fistful of Cards", continueTurnStartAfterVeraCuster()/
// continueAfterMissedResolved() trong reduce.ts.
import { describe, expect, it } from "vitest";
import { applyTurnStartChecks, reduce } from "../src/core/reduce";
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
    activeEventId: "a_fistful_of_cards",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("A Fistful of Cards — đẩy pending đầu lượt", () => {
  it("tay rỗng: không đẩy gì, tiếp thẳng Dynamite/Jail", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: [], equipment: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
    });
    const events = applyTurnStartChecks(state);
    expect(state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] },
    ]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "A_FISTFUL_OF_CARDS_TRIGGERED" }));
  });

  it("tay có 3 lá: đẩy NEED_MISSED shotsRemaining=2, bắn A_FISTFUL_OF_CARDS_TRIGGERED shotCount=3", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2", "bang_3"] }), makePlayer("b"), makePlayer("c")],
    });
    const events = applyTurnStartChecks(state);
    expect(state.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "a_fistful_of_cards", from: null }, shotsRemaining: 2 },
    ]);
    expect(events).toContainEqual({ type: "A_FISTFUL_OF_CARDS_TRIGGERED", playerId: "a", shotCount: 3 });
  });

  it("tay có 1 lá: shotsRemaining KHÔNG xuất hiện (0 phát còn lại, đây là phát cuối)", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    expect(state.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "a_fistful_of_cards", from: null } },
    ]);
  });
});

describe("A Fistful of Cards — resolve từng phát", () => {
  it("đỡ được (có Missed!): tay mất 1 lá, đẩy tiếp phát kế với shotsRemaining giảm 1", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2", "missed_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", cardId: "missed_1" });
    expect(events).toContainEqual({ type: "MISSED_PLAYED", playerId: "a" });
    expect(next.players[0].hand.sort()).toEqual(["bang_1", "bang_2"]);
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "a_fistful_of_cards", from: null }, shotsRemaining: 1 },
    ]);
  });

  it("không đỡ (không kèm cardId): mất 1 máu, đẩy tiếp phát kế", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4, hand: ["bang_1", "bang_2", "bang_3"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hp).toBe(3);
    expect(events).toContainEqual({ type: "DAMAGE_DEALT", playerId: "a", amount: 1 });
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "a_fistful_of_cards", from: null }, shotsRemaining: 1 },
    ]);
  });

  it("phát CUỐI resolve xong: tiếp tục Dynamite/Jail check", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4, hand: ["bang_1"], equipment: ["jail_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hp).toBe(3);
    expect(next.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "jail" }, matchSuits: ["hearts"] },
    ]);
  });

  it("phát CUỐI resolve xong, không có Dynamite/Jail: pending rỗng", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4, hand: ["bang_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.pending).toEqual([]);
  });

  it("chết giữa chừng (hp về 0): KHÔNG đẩy phát tiếp theo, không còn pending sót lại", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 1, hand: ["bang_1", "bang_2", "bang_3"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].alive).toBe(false);
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "a", killedBy: null });
    expect(next.pending).toEqual([]);
  });

  it("Bart Cassidy vẫn rút bài khi mất máu (onLoseLife chạy)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, characterId: "bart_cassidy", hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      deck: ["saloon_1"],
    });
    applyTurnStartChecks(state);
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hand).toContain("saloon_1");
  });

  it("El Gringo KHÔNG kích hoạt (không có người gây, source.from = null)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, hand: ["bang_1"] }),
        makePlayer("b", { characterId: "el_gringo", hand: ["missed_1"] }),
        makePlayer("c"),
      ],
    });
    applyTurnStartChecks(state);
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    // El Gringo (b) không cướp được gì từ "a" vì không có ai "bắn" cả.
    expect(next.players[1].hand).toEqual(["missed_1"]);
  });

  it("Mary Rose KHÔNG bắn trả (source.card = 'a_fistful_of_cards', không phải 'bang')", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, characterId: "mary_rose", hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    applyTurnStartChecks(state);
    const { events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "MARY_ROSE_REFLECTED" }));
  });
});

describe("A Fistful of Cards — Barrel tự động dodge vẫn tiếp tục chuỗi", () => {
  it("Barrel khớp Cơ: né miễn phí phát này, tự đẩy phát kế tiếp", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, hand: ["bang_1", "bang_2"], equipment: ["barrel_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      deck: ["bang_5"], // hearts 5 -> khớp Barrel (chỉ cần chất Cơ, không cần rank cụ thể)
    });
    applyTurnStartChecks(state);
    // Đỉnh stack lúc này là NEED_DRAW_CHECK (barrel), dưới là NEED_MISSED shotsRemaining=1.
    expect(state.pending[state.pending.length - 1]).toMatchObject({ kind: "NEED_DRAW_CHECK", source: { card: "barrel" } });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).toContainEqual({ type: "BARREL_DODGED", playerId: "a" });
    expect(next.players[0].hp).toBe(4); // không mất máu
    // Phát kế tiếp được đẩy — vẫn còn Barrel trên sân nên tự kèm luôn 1
    // NEED_DRAW_CHECK Barrel MỚI cho phát này (mỗi phát độc lập, đều được thử
    // Barrel riêng).
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "a", source: { card: "a_fistful_of_cards", from: null } },
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "barrel" }, matchSuits: ["hearts"] },
    ]);
  });
});
