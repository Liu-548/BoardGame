// Mở rộng A Fistful of Cards — lá "Sniper" (nhóm C bổ sung — thêm nước đi
// mới): trong lượt của mình, bỏ CÙNG LÚC 2 lá Bang! để bắn 1 người trong tầm
// súng đang cầm, cần ĐỦ 2 Missed! mới né được. Không giới hạn số lần, không
// tính vào bangCountThisTurn. Xem Luat_Bang_Mo_Rong_FistfulOfCards.txt mục
// "Sniper", playBang()/playSniperShot() trong reduce.ts.
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
    activeEventId: "sniper",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Sniper — bỏ 2 lá Bang! bắn 1 người, cần 2 Missed!", () => {
  it("active: đủ điều kiện -> đẩy NEED_MISSED missesNeeded=2, cả 2 lá Bang! rời tay", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      extraDiscardCardId: "bang_2",
    });
    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(["bang_1", "bang_2"]));
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "sniper", from: "a" }, missesNeeded: 2 },
    ]);
    expect(next.bangCountThisTurn).toBe(0); // không tính vào giới hạn Bang!/lượt
    expect(events).toContainEqual(expect.objectContaining({ type: "CARD_PLAYED", cardId: "bang_1", targetId: "b" }));
  });

  it("active: sau khi bắn Sniper vẫn còn nguyên suất Bang! thường của lượt", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2", "bang_3"] }),
        makePlayer("b", { hand: ["missed_1", "missed_2"] }),
        makePlayer("c"),
      ],
    });
    const afterSniper = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      extraDiscardCardId: "bang_2",
    });
    const afterMissed1 = reduce(afterSniper.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    const afterMissed2 = reduce(afterMissed1.state, { type: "RESPOND", playerId: "b", cardId: "missed_2" });
    expect(afterMissed2.state.pending).toEqual([]);
    // Vẫn đánh được Bang! thường (không kèm extraDiscardCardId) trong CHÍNH lượt này.
    const { state: next } = reduce(afterMissed2.state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_3",
      targetId: "b",
    });
    expect(next.bangCountThisTurn).toBe(1);
  });

  it("không active (sự kiện khác): kèm extraDiscardCardId bị từ chối", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b", extraDiscardCardId: "bang_2" })
    ).toThrow(/Sniper/);
  });

  it("active: lá phụ không phải Bang! bị từ chối", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1", "missed_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b", extraDiscardCardId: "missed_1" })
    ).toThrow(/Bang!/);
  });

  it("active: ngoài tầm súng đang cầm bị từ chối", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
    });
    // a(0) c(2): khoảng cách 2, súng mặc định tầm 1.
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c", extraDiscardCardId: "bang_2" })
    ).toThrow(/ngoài tầm bắn/);
  });

  it("Apache Kid: miễn nhiễm khi CẢ 2 lá Bang! đều chất Rô", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_15", "bang_16"] }), // cả 2 diamonds
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_15",
      targetId: "b",
      extraDiscardCardId: "bang_16",
    });
    expect(next.pending).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "APACHE_KID_IMMUNE" }));
  });

  it("Apache Kid: KHÔNG miễn nhiễm nếu chỉ 1 trong 2 lá là chất Rô", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_15", "bang_1"] }), // bang_15 diamonds, bang_1 spades
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_15",
      targetId: "b",
      extraDiscardCardId: "bang_1",
    });
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "sniper", from: "a" }, missesNeeded: 2 },
    ]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "APACHE_KID_IMMUNE" }));
  });

  it("Slab the Killer bắn Sniper: cần ĐỦ 4 Missed! (2 x 2), không phải 2", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2"], characterId: "slab_the_killer" }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      extraDiscardCardId: "bang_2",
    });
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "sniper", from: "a" }, missesNeeded: 4 },
    ]);
  });

  it("Barrel của mục tiêu vẫn draw! đúng 1 lần (luật riêng FAQ Q.08), khớp Cơ trừ 1 trong 2 Missed! cần thiết", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1", "bang_2"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      extraDiscardCardId: "bang_2",
    });
    expect(next.pending).toHaveLength(2);
    expect(next.pending[0]).toEqual({
      kind: "NEED_MISSED",
      player: "b",
      source: { card: "sniper", from: "a" },
      missesNeeded: 2,
    });
    expect(next.pending[1]).toEqual(
      expect.objectContaining({ kind: "NEED_DRAW_CHECK", source: { card: "barrel" }, player: "b" })
    );
  });
});
