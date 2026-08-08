// Mở rộng A Fistful of Cards — lá "Russian Roulette" (nhóm A, chạy 1 lần lúc
// lật): rút 1 lá (KHÔNG áp dụng Lucky Duke), đếm từ chủ trò theo GIÁ TRỊ lá
// vừa rút, CHIỀU do MÀU CHẤT quyết định (đỏ = kim đồng hồ, đen = ngược lại,
// chỉ đếm người CÒN SỐNG). Người bị đếm trúng phải bỏ 1 Missed!, rồi người kế
// tiếp (đúng chiều) cũng vậy — ai KHÔNG bỏ được thì mất 2 máu, chuỗi DỪNG hẳn.
// Barrel/Jourdonnais dùng được y hệt Missed! thật. Xem
// Luat_Bang_Mo_Rong_FistfulOfCards.txt mục "Russian Roulette",
// applyRussianRouletteEffect()/respondToRussianRouletteChain() trong reduce.ts.
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
    players: [makePlayer("a", { role: "sheriff" }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 3, // "d" vừa xong lượt -> quay về "a" (chủ trò)
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
    eventDeck: ["high_noon", "russian_roulette"], // "russian_roulette" = lá kế tiếp
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Russian Roulette — đếm người bắt đầu chuỗi lúc lật", () => {
  it("lá đỏ (9 Rô): đếm THEO chiều kim đồng hồ từ chủ trò, chủ trò=1 -> số 9 rơi vào ghế thứ 9 (vòng lại)", () => {
    // 4 người còn sống: a(0) b(1) c(2) d(3). Chủ trò = a. Đếm kim đồng hồ,
    // a=1,b=2,c=3,d=4,a=5,b=6,c=7,d=8,a=9 -> "a" tự bắt đầu chuỗi với chính mình.
    const state = makeState({ deck: ["general_store_1"] }); // diamonds, 9
    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "d" });

    expect(next.activeEventId).toBe("russian_roulette");
    expect(events).toContainEqual({
      type: "RUSSIAN_ROULETTE_STARTED",
      cardId: "general_store_1",
      startPlayerId: "a",
      direction: 1,
    });
    expect(next.pending).toEqual([{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }]);
    expect(next.discardPile).toContain("general_store_1");
  });

  it("lá đen (2 Bích): đếm NGƯỢC chiều kim đồng hồ từ chủ trò, bước 1 -> người ngồi TRƯỚC chủ trò", () => {
    // Ngược chiều 1 bước từ "a" (index 0, alive list [a,b,c,d]) -> "d" (index 3).
    const state = makeState({ deck: ["missed_6"] }); // spades, 2
    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "d" });

    expect(events).toContainEqual({
      type: "RUSSIAN_ROULETTE_STARTED",
      cardId: "missed_6",
      startPlayerId: "d",
      direction: -1,
    });
    expect(next.pending).toEqual([{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "d", direction: -1 }]);
  });

  it("chỉ đếm người CÒN SỐNG — người đã chết bị bỏ qua trong vòng đếm", () => {
    // "b" đã chết -> danh sách còn sống [a,c,d]. Lá đỏ, rank 9 -> steps=8,
    // (0 + 8) % 3 = 2 -> alivePlayers[2] = "d".
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff" }), makePlayer("b", { alive: false }), makePlayer("c"), makePlayer("d")],
      deck: ["general_store_1"], // diamonds, 9
    });
    const { events } = reduce(state, { type: "END_TURN", playerId: "d" });
    expect(events).toContainEqual(expect.objectContaining({ startPlayerId: "d" }));
  });

  it("KHÔNG áp dụng Lucky Duke dù chủ trò có nhân vật này", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", characterId: "lucky_duke" }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
      deck: ["general_store_1", "bang_1"], // chỉ 1 lá bị rút nếu không có Lucky Duke
    });
    const { state: next } = reduce(state, { type: "END_TURN", playerId: "d" });
    expect(next.deck).toEqual(["general_store_1"]); // "bang_1" (đỉnh) vẫn còn nguyên trong deck
    expect(next.discardPile).toContain("bang_1");
  });
});

describe("Russian Roulette — chuỗi bỏ Missed!", () => {
  it("bỏ được: mất lá Missed!, đẩy tiếp cho người KẾ TIẾP đúng chiều", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["missed_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", cardId: "missed_1" });
    expect(events).toContainEqual({ type: "MISSED_PLAYED", playerId: "a" });
    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toContain("missed_1");
    expect(next.pending).toEqual([{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "b", direction: 1 }]);
  });

  it("bỏ được, chiều ngược: đẩy tiếp cho người NGỒI TRƯỚC", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d", { hand: ["missed_1"] }),
      ],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "d", direction: -1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "d", cardId: "missed_1" });
    expect(next.pending).toEqual([{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "c", direction: -1 }]);
  });

  it("không bỏ (không kèm cardId): mất 2 máu, chuỗi DỪNG hẳn, không đẩy tiếp", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4 }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hp).toBe(2);
    expect(events).toContainEqual({ type: "RUSSIAN_ROULETTE_FIRED", playerId: "a", amount: 2 });
    expect(next.pending).toEqual([]);
  });

  it("máu không đủ 2: mất hết chỗ còn lại (sàn 0), không âm", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 1 }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].alive).toBe(false);
    expect(events).toContainEqual({ type: "RUSSIAN_ROULETTE_FIRED", playerId: "a", amount: 1 });
  });

  it("El Gringo KHÔNG kích hoạt khi mất máu (không có người bắn)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4 }),
        makePlayer("b", { characterId: "el_gringo", hand: ["bang_1"] }),
        makePlayer("c"),
        makePlayer("d"),
      ],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[1].hand).toEqual(["bang_1"]);
  });

  it("Bart Cassidy vẫn rút bài khi mất máu (onLoseLife chạy)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hp: 4, characterId: "bart_cassidy" }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      deck: ["saloon_1"],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hand).toContain("saloon_1");
  });

  it("Barrel khớp Cơ: né miễn phí, tự đẩy tiếp cho người kế tiếp", () => {
    // Mô phỏng ĐÚNG những gì applyRussianRouletteEffect()/pushMissedReactionUnconditional()
    // sẽ tự đẩy khi "a" có Barrel thật trên sân: NEED_DISCARD_MISSED_OR_DAMAGE
    // ở dưới, NEED_DRAW_CHECK (barrel) ở đỉnh — xử lý trước.
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", equipment: ["barrel_1"] }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
      pending: [
        { kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 },
        { kind: "NEED_DRAW_CHECK", player: "a", source: { card: "barrel" }, matchSuits: ["hearts"] },
      ],
      activeEventId: "russian_roulette",
      deck: ["bang_5"], // hearts 5 -> khớp Barrel
    });
    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(events).toContainEqual({ type: "BARREL_DODGED", playerId: "a" });
    expect(next.players[0].hp).toBe(4);
    expect(next.pending).toEqual([{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "b", direction: 1 }]);
  });

  it("chọn KHÔNG bỏ dù có Missed! trong tay: vẫn hợp lệ (giống Indians!)", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hp: 4, hand: ["missed_1"] }), makePlayer("b"), makePlayer("c"), makePlayer("d")],
      pending: [{ kind: "NEED_DISCARD_MISSED_OR_DAMAGE", player: "a", direction: 1 }],
      activeEventId: "russian_roulette",
    });
    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a" });
    expect(next.players[0].hp).toBe(2);
    expect(next.players[0].hand).toEqual(["missed_1"]); // vẫn giữ nguyên, không bị ép dùng
  });
});
