// Mở rộng A Fistful of Cards — lá "Ambush" (nhóm C, sửa luật nền): khoảng
// cách vòng tròn CƠ BẢN = 1 giữa 2 người bất kỳ, nhưng VẪN cộng/trừ Scope/
// Mustang/Binocular/Hideout/hook nhân vật như bình thường (theo FAQ Q17 chính
// thức — chủ dự án đã duyệt lại và chọn phương án này thay vì ghi chú *dev cũ
// "ép cứng bằng 1"). House rule "extra_distance" bị ghi đè, mất tác dụng.
import { describe, expect, it } from "vitest";
import { computeDistance } from "../src/core/distance";
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
    activeEventId: "ambush",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Ambush — khoảng cách vòng tròn cơ bản = 1", () => {
  it("2 người ngồi xa nhau (5 người, cách 2 ghế): khoảng cách CƠ BẢN vẫn về 1", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    expect(computeDistance(makeState(players), "a", "c")).toBe(1);
  });

  it("không active: 2 người cách 2 ghế vẫn là khoảng cách 2 như bình thường", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    expect(computeDistance(makeState(players, { activeEventId: null }), "a", "c")).toBe(2);
  });

  it("active: Scope VẪN trừ 1 như bình thường (1 - 1 -> chặn ở tối thiểu 1, không đổi)", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { equipment: ["scope_1"] });
    expect(computeDistance(makeState(players), "a", "c")).toBe(1); // 1 - 1 = 0, chặn sàn 1
  });

  it("active: Mustang của mục tiêu VẪN cộng 1 như bình thường (1 + 1 = 2)", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[2] = makePlayer("c", { equipment: ["mustang_1"] });
    expect(computeDistance(makeState(players), "a", "c")).toBe(2);
  });

  it('active: Bang! tầm 1 KHÔNG bắn tới người có Mustang (cơ bản 1 + Mustang 1 = 2, ngoài tầm)', () => {
    const state = makeState(
      [makePlayer("a", { role: "sheriff", hand: ["bang_1"] }), makePlayer("b"), makePlayer("c", { equipment: ["mustang_1"] })],
    );
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" })).toThrow(
      /ngoài tầm bắn/
    );
  });

  it('active: house rule "extra_distance" bị ghi đè, không cộng thêm — khoảng cách vẫn về 1', () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    expect(computeDistance(makeState(players, { houseRules: ["extra_distance"] }), "a", "c", 1)).toBe(1);
  });

  it('không active: house rule "extra_distance" vẫn cộng thêm 1 như bình thường', () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    expect(
      computeDistance(makeState(players, { activeEventId: null, houseRules: ["extra_distance"] }), "a", "b", 1)
    ).toBe(2);
  });
});
