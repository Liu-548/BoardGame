// Mở rộng A Fistful of Cards — lá "Ranch" (nhóm C, sửa luật nền, *dev đã đổi
// cơ chế khác bản dịch gốc): NGAY SAU bước rút bài, cho 20s chọn bất kỳ số lá
// nào trên tay để đổi lấy đúng bấy nhiêu lá mới. Dùng CHUNG completeDrawPhase()
// cho MỌI điểm kết thúc pha rút. Xem Luat_Bang_Mo_Rong_FistfulOfCards.txt mục
// "Ranch", completeDrawPhase()/respondToRanchExchange() trong reduce.ts.
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
    deck: ["bang_1", "bang_2", "bang_3", "bang_4", "bang_5"],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "draw",
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
    activeEventId: "ranch",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Ranch — đẩy pending ngay sau bước rút bài", () => {
  it("active: DRAW_CARDS rút xong rồi đẩy NEED_RANCH_EXCHANGE, turnPhase đã là play", () => {
    const state = makeState();
    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.turnPhase).toBe("play");
    expect(next.players[0].hand).toEqual(["bang_5", "bang_4"]);
    expect(next.pending).toEqual([{ kind: "NEED_RANCH_EXCHANGE", player: "a" }]);
    expect(events).toEqual([{ type: "CARDS_DRAWN", playerId: "a", count: 2 }]);
  });

  it("không active: DRAW_CARDS rút bài bình thường, không đẩy pending", () => {
    const state = makeState({ activeEventId: null });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.pending).toEqual([]);
    expect(next.turnPhase).toBe("play");
  });
});

describe("Ranch — trả lời NEED_RANCH_EXCHANGE", () => {
  it("đổi 2 lá: cả 2 vào chồng bỏ TRƯỚC, rồi rút lại đúng 2 lá mới", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["missed_1", "missed_2"] }), makePlayer("b"), makePlayer("c")],
      pending: [{ kind: "NEED_RANCH_EXCHANGE", player: "a" }],
      turnPhase: "play",
    });
    const { state: next, events } = reduce(state, {
      type: "RESPOND",
      playerId: "a",
      cardIds: ["missed_1", "missed_2"],
    });
    expect(next.discardPile).toEqual(["missed_1", "missed_2"]);
    expect(next.players[0].hand).toEqual(["bang_5", "bang_4"]);
    expect(next.pending).toEqual([]);
    expect(events).toContainEqual({
      type: "RANCH_EXCHANGED",
      playerId: "a",
      cardIds: ["missed_1", "missed_2"],
      count: 2,
    });
  });

  it("không đổi lá nào (không kèm cardIds): tay giữ nguyên, không rút gì thêm", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["missed_1"] }), makePlayer("b"), makePlayer("c")],
      pending: [{ kind: "NEED_RANCH_EXCHANGE", player: "a" }],
      turnPhase: "play",
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hand).toEqual(["missed_1"]);
    expect(next.discardPile).toEqual([]);
    expect(events).toEqual([]);
  });

  it("mảng rỗng cũng coi như không đổi", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["missed_1"] }), makePlayer("b"), makePlayer("c")],
      pending: [{ kind: "NEED_RANCH_EXCHANGE", player: "a" }],
      turnPhase: "play",
    });
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a", cardIds: [] });
    expect(next.players[0].hand).toEqual(["missed_1"]);
  });

  it("đổi lá không có trong tay bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["missed_1"] }), makePlayer("b"), makePlayer("c")],
      pending: [{ kind: "NEED_RANCH_EXCHANGE", player: "a" }],
      turnPhase: "play",
    });
    expect(() => reduce(state, { type: "RESPOND", playerId: "a", cardIds: ["bang_99"] })).toThrow();
  });
});

describe("Ranch — kết hợp với nhân vật override onDrawPhase (Jesse Jones)", () => {
  it("Jesse Jones rút xong (qua NEED_PICK_DRAW_TARGET) vẫn được hỏi Ranch ngay sau đó", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", characterId: "jesse_jones" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: afterAsk } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(afterAsk.pending).toEqual([{ kind: "NEED_PICK_DRAW_TARGET", player: "a" }]);
    const { state: next } = reduce(afterAsk, { type: "RESPOND", playerId: "a" }); // rút bộ bài như thường
    expect(next.turnPhase).toBe("play");
    expect(next.pending).toEqual([{ kind: "NEED_RANCH_EXCHANGE", player: "a" }]);
  });
});

describe("Ranch — kết hợp với Hard Liquor (cùng chạy được không? chỉ 1 event active tại 1 thời điểm, kiểm tra riêng Hard Liquor không active ở đây)", () => {
  it("chọn hồi máu (Hard Liquor không active — chỉ Ranch) vẫn theo đúng luồng Ranch bình thường", () => {
    // Chỉ Ranch active trong test này (2 lá sự kiện không thể cùng active),
    // xác nhận completeDrawPhase() được gọi đúng cả từ nhánh Marcel bonus
    // draw (rút thẳng 3 lá) — gián tiếp qua marcelJailBonusDrawThisTurn.
    const state = makeState({
      marcelJailBonusDrawThisTurn: { a: true },
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c")],
    });
    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(next.players[0].hand).toHaveLength(3);
    expect(next.pending).toEqual([{ kind: "NEED_RANCH_EXCHANGE", player: "a" }]);
  });
});
