// Mở rộng High Noon — lá "The Daltons" (nhóm A, chạy 1 lần lúc lật): mỗi
// người có ít nhất 1 lá XANH DƯƠNG (kể cả Jail/Dynamite, KHÔNG tính lá VÀNG
// "trì hoãn" của Dodge City) trước mặt TỰ CHỌN 1 lá để bỏ. Xem
// Luat_Bang_Mo_Rong_HighNoon.txt mục 2, applyTheDaltonsEffect() trong reduce.ts.
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
    currentPlayerIndex: 2, // "c" vừa xong lượt -> quay về "a" (chủ trò)
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangCountThisTurn: 0,
    characterSelection: null,
    turnNumber: 1,
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
    eventDeck: ["high_noon", "the_daltons"], // "the_daltons" = lá kế tiếp
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("The Daltons — mỗi người có lá xanh dương tự bỏ 1 lá lúc lật", () => {
  it("người có đúng 1 lá xanh dương: đẩy NEED_DISCARD_FROM_ZONE, source.from = null", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.activeEventId).toBe("the_daltons");
    expect(next.pending).toEqual([
      {
        kind: "NEED_DISCARD_FROM_ZONE",
        player: "b",
        zone: "equipment",
        source: { card: "the_daltons", from: null },
      },
    ]);
  });

  it("người có NHIỀU lá xanh dương: vẫn chỉ 1 pending (tự chọn 1 lá để bỏ)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { equipment: ["barrel_1", "scope_1"] }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.pending.length).toBe(1);
    expect(next.pending[0]).toMatchObject({ kind: "NEED_DISCARD_FROM_ZONE", player: "b" });
  });

  it("không ai có lá trên sân: không đẩy pending nào", () => {
    const state = makeState();
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });
    expect(next.pending).toEqual([]);
  });

  it("chỉ có lá VÀNG trì hoãn (Dodge City) trên sân: KHÔNG tính, không đẩy pending", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { equipment: ["bible_1"] }), // lá vàng
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });
    expect(next.pending).toEqual([]);
  });

  it("Jail/Dynamite CÓ tính là lá xanh dương — người bị Jail có thể tự bỏ chính lá Jail đó", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { equipment: ["jail_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "END_TURN", playerId: "c" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_DISCARD_FROM_ZONE", player: "b", zone: "equipment", source: { card: "the_daltons", from: null } },
    ]);

    const { state: next, events } = reduce(played.state, {
      type: "RESPOND",
      playerId: "b",
      cardId: "jail_1",
    });
    expect(next.players[1].equipment).toEqual([]);
    expect(next.discardPile).toContain("jail_1");
    expect(events).toContainEqual({
      type: "CARD_FORCE_DISCARDED",
      playerId: "b",
      byPlayerId: null,
      cardId: "jail_1",
    });
  });

  it("nhiều người cùng có lá xanh dương: mỗi người 1 pending riêng, xử lý LẦN LƯỢT (stack)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", equipment: ["scope_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.pending.length).toBe(2);
    // Không có quy định thứ tự chính thức (không ai "đánh" ai) — chỉ cần xác
    // định (đẩy theo thứ tự ghế NGƯỢC, giống playGatling()): "a" (ghế đầu)
    // lên ĐỈNH stack, xử lý trước; "b" xử lý sau.
    expect(next.pending[next.pending.length - 1]).toMatchObject({ player: "a" });
    expect(next.pending[0]).toMatchObject({ player: "b" });
  });

  it("người đã chết KHÔNG bị đẩy pending dù (giả định) còn lá trên sân", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { alive: false, equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });
    expect(next.pending).toEqual([]);
  });
});
