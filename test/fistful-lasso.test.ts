// Mở rộng A Fistful of Cards — lá "Lasso" (nhóm C, sửa luật nền): vô hiệu hoá
// 100% MỌI trang bị của MỌI người trong lúc lá này đang chạy, kể cả Dynamite/
// Jail (đã xác nhận qua bản dịch luật — xem Luat_Bang_Mo_Rong_FistfulOfCards.txt,
// mục "Lasso"). Cắm ở getEffectiveEquipment() (characters.ts) + kiểm riêng ở
// applyDynamiteAndJailChecks()/activateDelayedEquipment() (reduce.ts).
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
    activeEventId: "lasso",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Lasso — vô hiệu hoá mọi trang bị (khoảng cách/tầm súng)", () => {
  it("active: Mustang của mục tiêu mất tác dụng, Bang! tầm 1 vẫn bắn trúng khoảng cách 2", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c", { equipment: ["mustang_1"] }), // khoảng cách a->c vòng tròn = ... xem seatDistance
      ],
    });
    // 3 người: a(0) c(2) cách nhau seatDistance = min(2,1) = 1. Mustang bình
    // thường sẽ +1 thành 2 (ngoài tầm súng mặc định 1) — Lasso vô hiệu Mustang
    // nên vẫn bắn trúng ở tầm 1.
    const { events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" });
    expect(events).toContainEqual(expect.objectContaining({ type: "CARD_PLAYED", cardId: "bang_1" }));
  });

  it("không active: Mustang vẫn có tác dụng, Bang! tầm 1 KHÔNG bắn tới khoảng cách 2", () => {
    const state = makeState({
      activeEventId: null,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c", { equipment: ["mustang_1"] }),
      ],
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" })).toThrow(
      /ngoài tầm bắn/
    );
  });

  it("active: súng Schofield (tầm 2) bị vô hiệu, chỉ bắn được tầm mặc định 1", () => {
    // 4 người: a(0) c(2), seatDistance = min(2,2) = 2 — Schofield tầm 2 sẽ bắn
    // tới bình thường, nhưng Lasso vô hiệu súng -> chỉ còn tầm mặc định 1 -> ngoài tầm.
    const state4 = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"], equipment: ["schofield_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
    });
    expect(() => reduce(state4, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" })).toThrow(
      /ngoài tầm bắn/
    );
  });

  it("không active: Schofield tầm 2 vẫn bắn trúng khoảng cách 2", () => {
    const state4 = makeState({
      activeEventId: null,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"], equipment: ["schofield_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
    });
    const { events } = reduce(state4, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" });
    expect(events).toContainEqual(expect.objectContaining({ type: "CARD_PLAYED", cardId: "bang_1" }));
  });
});

describe("Lasso — Barrel không draw! khi đang chạy", () => {
  it("active: mục tiêu có Barrel nhưng bị Bang! đẩy NEED_MISSED, KHÔNG có NEED_DRAW_CHECK Barrel", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("không active: mục tiêu có Barrel -> đẩy thêm NEED_DRAW_CHECK barrel lên trên NEED_MISSED", () => {
    const state = makeState({
      activeEventId: null,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toHaveLength(2);
    expect(next.pending[1]).toEqual(
      expect.objectContaining({ kind: "NEED_DRAW_CHECK", source: { card: "barrel" } })
    );
  });
});

describe("Lasso — Dynamite/Jail bị bỏ qua hoàn toàn đầu lượt", () => {
  it("active: người tới lượt có Dynamite VÀ Jail nhưng KHÔNG có pending nào, vào thẳng pha rút", () => {
    const state = makeState({
      turnNumber: 0, // applyTurnStartChecks đọc trực tiếp, không qua advanceTurn()
      currentPlayerIndex: 0,
      players: [
        makePlayer("a", { role: "sheriff", equipment: ["dynamite_1", "jail_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });
    applyTurnStartChecks(state);
    expect(state.pending).toEqual([]);
    // 2 lá vẫn nằm nguyên trên sân, chỉ tạm ngưng tác dụng.
    expect(state.players[0].equipment).toEqual(["dynamite_1", "jail_1"]);
  });

  it("không active: người tới lượt có Dynamite -> đẩy NEED_DRAW_CHECK dynamite", () => {
    const state = makeState({
      activeEventId: null,
      turnNumber: 0,
      currentPlayerIndex: 0,
      players: [makePlayer("a", { role: "sheriff", equipment: ["dynamite_1"] }), makePlayer("b"), makePlayer("c")],
    });
    applyTurnStartChecks(state);
    expect(state.pending).toEqual([
      { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "dynamite" }, matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"] },
    ]);
  });
});

describe("Lasso — lá vàng Dodge City (Bible/Canteen) mất tác dụng", () => {
  it("active: Bible đã bày sẵn ≥1 lượt KHÔNG dùng được để đỡ Bang! (báo lỗi rõ ràng)", () => {
    const state = makeState({
      turnNumber: 5,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["bible_1"] }),
        makePlayer("c"),
      ],
      equipmentPlayedTurn: { bible_1: 1 }, // đã bày từ lượt 1, giờ là lượt 5 -> đủ điều kiện thường
    });
    const afterBang = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(() => reduce(afterBang.state, { type: "RESPOND", playerId: "b", cardId: "bible_1" })).toThrow(/Lasso/);
  });

  it("không active: Bible đã bày sẵn ≥1 lượt dùng được để đỡ Bang! bình thường", () => {
    const state = makeState({
      activeEventId: null,
      turnNumber: 5,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["bible_1"] }),
        makePlayer("c"),
      ],
      equipmentPlayedTurn: { bible_1: 1 },
    });
    const afterBang = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(afterBang.state, { type: "RESPOND", playerId: "b", cardId: "bible_1" });
    expect(next.players[1].equipment).toEqual([]);
  });

  it("active: kích hoạt Canteen đã bày sẵn bị từ chối", () => {
    const state = makeState({
      turnNumber: 5,
      players: [makePlayer("a", { role: "sheriff", hp: 2, equipment: ["canteen_1"] }), makePlayer("b"), makePlayer("c")],
      equipmentPlayedTurn: { canteen_1: 1 },
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" })).toThrow(/Lasso/);
  });

  it("không active: kích hoạt Canteen đã bày sẵn hoạt động bình thường (hồi 1 máu)", () => {
    const state = makeState({
      activeEventId: null,
      turnNumber: 5,
      players: [makePlayer("a", { role: "sheriff", hp: 2, equipment: ["canteen_1"] }), makePlayer("b"), makePlayer("c")],
      equipmentPlayedTurn: { canteen_1: 1 },
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });
    expect(next.players[0].hp).toBe(3);
  });
});
