// Mở rộng High Noon — lá "The Sermon" (nhóm C, sửa luật nền): trong lượt của
// mình, KHÔNG được CHƠI lá Bang! (kể cả Calamity Janet dùng Missed! làm
// Bang!) — nhưng KHÔNG cấm BỎ Bang! để đỡ, 7 lá "tương đương Bang!" của Dodge
// City, hay Doc Holyday. Xem Luat_Bang_Mo_Rong_HighNoon.txt mục 2, playBang()
// trong reduce.ts.
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
    activeEventId: "the_sermon",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("The Sermon — cấm CHƠI Bang! trong lượt của mình", () => {
  it("active: đánh Bang! thật bị chặn", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })
    ).toThrow(/The Sermon/);
  });

  it("không active: đánh Bang! thật vẫn bình thường", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1"] }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("active: Calamity Janet đánh Missed! làm Bang! CŨNG bị chặn (theo bản dịch, không theo *dev ban đầu)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["missed_1"], characterId: "calamity_janet" }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "missed_1", targetId: "b" })
    ).toThrow(/The Sermon/);
  });

  it("active: Calamity Janet vẫn dùng Bang! LÀM Missed! được (chiều ngược lại không bị cấm)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", characterId: "calamity_janet" }),
        makePlayer("b", { hand: ["bang_1"], characterId: "calamity_janet" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
    });
    // "b" (Calamity Janet) đánh Bang! nhắm "a" trước — nhưng đây vẫn là "chơi
    // Bang! thật" trong lượt của b, nên PHẢI bị chặn (b đang tới lượt).
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "bang_1", targetId: "a" })
    ).toThrow(/The Sermon/);
  });

  it("active: BỎ Bang! để đỡ Indians!/Duel vẫn được (không đi qua playBang())", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["indians_1"] }),
        makePlayer("b", { hand: ["bang_1"] }),
        makePlayer("c"),
      ],
    });
    const afterIndians = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1" });
    const { state: next } = reduce(afterIndians.state, {
      type: "RESPOND",
      playerId: "b",
      cardId: "bang_1",
    });
    expect(next.players[1].hp).toBe(4); // đỡ thành công, không mất máu
  });

  it("active: 7 lá tương đương Bang! của Dodge City (Punch...) vẫn đánh được bình thường", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["punch_1"] }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "punch_1",
      targetId: "b",
    });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "punch", from: "a" } }]);
  });
});
