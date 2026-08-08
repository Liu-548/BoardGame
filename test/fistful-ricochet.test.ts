// Mở rộng A Fistful of Cards — lá "Ricochet" (nhóm C bổ sung — thêm nước đi
// mới): bỏ 1 lá Bang! để bắn 1 lá TRANG BỊ trước mặt người khác, BẤT KỂ
// KHOẢNG CÁCH. Người đó cần Missed! mới giữ được lá, không thì lá bị bắn mất.
// Không giới hạn số lần, không tính vào bangCountThisTurn. Xem
// Luat_Bang_Mo_Rong_FistfulOfCards.txt mục "Ricochet", playRicochetShot()/
// respondToMissedForEquipment() trong reduce.ts.
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
    activeEventId: "ricochet",
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Ricochet — bỏ Bang! bắn 1 lá trang bị", () => {
  it("active: bắn trúng -> đẩy NEED_MISSED_FOR_EQUIPMENT, lá Bang! rời tay, KHÔNG tính bangCountThisTurn", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      targetCardId: "barrel_1",
    });
    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toContain("bang_1");
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED_FOR_EQUIPMENT", player: "b", source: { card: "ricochet", from: "a" }, targetCardId: "barrel_1" },
    ]);
    expect(next.bangCountThisTurn).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: "CARD_PLAYED", cardId: "bang_1", targetId: "b" }));
  });

  it("active: BẤT KỂ khoảng cách (4 người, cách 2 ghế) vẫn bắn được", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c", { equipment: ["barrel_1"] }),
        makePlayer("d"),
      ],
    });
    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "c",
      targetCardId: "barrel_1",
    });
    expect(next.pending).toHaveLength(1);
  });

  it("không active (sự kiện khác): kèm targetCardId cho lá Bang! bị từ chối", () => {
    const state = makeState({
      activeEventId: null,
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1"] }), makePlayer("b", { equipment: ["barrel_1"] }), makePlayer("c")],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b", targetCardId: "barrel_1" })
    ).toThrow(/Ricochet/);
  });

  it("active: không bắn được trang bị của chính mình", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1"], equipment: ["barrel_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "a", targetCardId: "barrel_1" })
    ).toThrow(/chính mình/);
  });

  it("active: lá trang bị không tồn tại trên sân mục tiêu bị từ chối", () => {
    const state = makeState({
      players: [makePlayer("a", { role: "sheriff", hand: ["bang_1"] }), makePlayer("b"), makePlayer("c")],
    });
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b", targetCardId: "barrel_1" })
    ).toThrow(/không có trang bị/);
  });

  it("active: vẫn bắn được lá đang bị Belle Star vô hiệu tạm thời (đọc equipment THẬT, không qua getEffectiveEquipment)", () => {
    const state = makeState({
      turnNumber: 5,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"], characterId: "belle_star" }),
        makePlayer("b", { equipment: ["bible_1"] }),
        makePlayer("c"),
      ],
      equipmentPlayedTurn: { bible_1: 1 },
    });
    // Đang là lượt Belle Star ("a") -> getEffectiveEquipment(b) trả về [] —
    // nhưng playRicochetShot() đọc target.equipment THẬT nên vẫn tìm/bắn được.
    const { state: next } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      targetCardId: "bible_1",
    });
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED_FOR_EQUIPMENT", player: "b", source: { card: "ricochet", from: "a" }, targetCardId: "bible_1" },
    ]);
  });

  it("Belle Star đang chạy: nạn nhân KHÔNG tự cứu được bằng chính lá bị vô hiệu đó", () => {
    const state = makeState({
      turnNumber: 5,
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"], characterId: "belle_star" }),
        makePlayer("b", { equipment: ["bible_1"] }),
        makePlayer("c"),
      ],
      equipmentPlayedTurn: { bible_1: 1 },
    });
    const afterShot = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      targetCardId: "bible_1",
    });
    expect(() => reduce(afterShot.state, { type: "RESPOND", playerId: "b", cardId: "bible_1" })).toThrow(
      /không dùng được/
    );
  });
});

describe("Ricochet — trả lời NEED_MISSED_FOR_EQUIPMENT", () => {
  it("đỡ được bằng Missed! trên tay: lá trang bị GIỮ LẠI, Missed! rời tay vào chồng bỏ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"], hand: ["missed_1"] }),
        makePlayer("c"),
      ],
    });
    const afterShot = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      targetCardId: "barrel_1",
    });
    const { state: next, events } = reduce(afterShot.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(next.players[1].equipment).toEqual(["barrel_1"]);
    expect(next.players[1].hand).toEqual([]);
    expect(next.discardPile).toContain("missed_1");
    expect(events).toContainEqual({ type: "MISSED_PLAYED", playerId: "b" });
    expect(next.pending).toEqual([]);
  });

  it("không đỡ (không kèm cardId): lá trang bị bị bắn mất, rời sân vào chồng bỏ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const afterShot = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      targetCardId: "barrel_1",
    });
    const { state: next, events } = reduce(afterShot.state, { type: "RESPOND", playerId: "b" });
    expect(next.players[1].equipment).toEqual([]);
    expect(next.discardPile).toContain("barrel_1");
    expect(next.players[1].hp).toBe(4); // KHÔNG mất máu, chỉ mất lá trang bị
    expect(events).toEqual([{ type: "RICOCHET_EQUIPMENT_DESTROYED", playerId: "b", cardId: "barrel_1" }]);
  });

  it("đỡ bằng lá vàng Dodge City đã bày sẵn ≥1 lượt (Bible) — không cần dùng chính lá trang bị bị nhắm", () => {
    const state = makeState({
      turnNumber: 5,
      deck: ["missed_2"], // Bible kèm rút thêm 1 lá khi đỡ thành công — tránh xào lại chồng bỏ giữa test
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["barrel_1", "bible_1"] }),
        makePlayer("c"),
      ],
      equipmentPlayedTurn: { bible_1: 1 },
    });
    const afterShot = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
      targetCardId: "barrel_1",
    });
    const { state: next } = reduce(afterShot.state, { type: "RESPOND", playerId: "b", cardId: "bible_1" });
    expect(next.players[1].equipment).toEqual(["barrel_1"]); // Barrel giữ lại, Bible bị dùng để đỡ
    expect(next.discardPile).toContain("bible_1");
  });
});

describe("Ricochet — Apache Kid miễn nhiễm nếu lá Bang! là chất Rô", () => {
  it("lá Bang! chất Rô nhắm vào Apache Kid -> miễn nhiễm, không đẩy pending", () => {
    const state = makeState({
      players: [
        makePlayer("a", { role: "sheriff", hand: ["bang_15"] }), // diamonds
        makePlayer("b", { characterId: "apache_kid", equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
    });
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_15",
      targetId: "b",
      targetCardId: "barrel_1",
    });
    expect(next.pending).toEqual([]);
    expect(next.players[1].equipment).toEqual(["barrel_1"]); // vẫn còn nguyên
    expect(events).toContainEqual(expect.objectContaining({ type: "APACHE_KID_IMMUNE" }));
  });
});
