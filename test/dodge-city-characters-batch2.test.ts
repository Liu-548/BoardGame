// Mở rộng Dodge City, mục C nhóm B (5.4) — 4 nhân vật cần hook mới nhưng độc
// lập: Sean Mallory (modifyHandLimit), Tequila Joe (modifyHealAmount +
// doubleRevivalHp), Elena Fuente (hasAnyCardMissedAlias +
// canUseOwnEquipmentAsMissed), Apache Kid (isImmuneToCard). Xem LO-TRINH.md
// "Ghi chú cho 5.4" mục C để biết đặc tả gốc.
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
    players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
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
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Sean Mallory — giữ tối đa 10 lá cuối lượt, không theo số máu", () => {
  it("8 lá, 3 máu: KHÔNG cần bỏ (dưới 10)", () => {
    const hand = Array.from({ length: 8 }, (_, i) => `beer_${i + 1}`);
    const state = makeState({
      players: [makePlayer("a", { characterId: "sean_mallory", hp: 3, hand }), makePlayer("b"), makePlayer("c")],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.turnPhase).toBe("draw"); // đã chuyển lượt luôn, không phải "discard"
  });

  it("11 lá, 3 máu: phải bỏ xuống đúng 10", () => {
    const hand = Array.from({ length: 11 }, (_, i) => `beer_${i + 1}`);
    const state = makeState({
      players: [makePlayer("a", { characterId: "sean_mallory", hp: 3, hand }), makePlayer("b"), makePlayer("c")],
    });

    const ended = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(ended.state.turnPhase).toBe("discard");

    // Bỏ CHƯA đủ (11 -> 10 vẫn thừa 0, nhưng thử bỏ 0 lá thì vẫn còn 11 > 10) — báo lỗi.
    expect(() =>
      reduce(ended.state, { type: "DISCARD_CARDS", playerId: "a", cardIds: [] })
    ).toThrow(/giới hạn cho phép/);

    // Bỏ đúng 1 lá (11 -> 10) là ĐỦ, không cần bỏ hết xuống dưới 10.
    const { state: next } = reduce(ended.state, {
      type: "DISCARD_CARDS",
      playerId: "a",
      cardIds: ["beer_1"],
    });
    expect(next.players[0].hand.length).toBe(10);
    expect(next.turnPhase).toBe("draw");
  });

  it("người KHÔNG phải Sean Mallory vẫn theo giới hạn = số máu như bình thường", () => {
    const hand = Array.from({ length: 8 }, (_, i) => `beer_${i + 1}`);
    const state = makeState({
      players: [makePlayer("a", { hp: 3, hand }), makePlayer("b"), makePlayer("c")],
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(next.turnPhase).toBe("discard"); // 8 > 3, phải bỏ
  });
});

describe("Tequila Joe — Beer hồi 2 máu thay vì 1, lá hồi máu khác vẫn 1", () => {
  it("đánh Beer: hồi đúng 2 máu (đủ chỗ trống)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "tequila_joe", hp: 1, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[0].hp).toBe(3);
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 2 });
  });

  it("chỉ còn 1 chỗ trống: hồi đúng 1 (không vượt trần dù nhân đôi)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "tequila_joe", hp: 3, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[0].hp).toBe(4);
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 1 });
  });

  it("đánh Saloon: mọi người (kể cả Tequila Joe) vẫn hồi đúng 1", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "tequila_joe", hp: 1, maxHp: 4, hand: ["saloon_1"] }),
        makePlayer("b", { hp: 1, maxHp: 4 }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "saloon_1" });

    expect(next.players[0].hp).toBe(2); // KHÔNG phải 3
    expect(next.players[1].hp).toBe(2);
  });

  it("hồi sinh tự động: kéo về 1 máu RỒI cộng thêm riêng +1, thành 2", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "tequila_joe", hp: 1, maxHp: 4, hand: ["beer_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> hồi sinh

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(2);
    expect(events).toContainEqual({ type: "BEER_SAVED_FROM_DEATH", playerId: "b", cardId: "beer_1", hp: 2 });
  });
});

describe("Elena Fuente — dùng BẤT KỲ lá nào trên tay như Missed!, kể cả trang bị của chính mình", () => {
  it("dùng lá bất kỳ trên tay (không phải Missed!/Bang!) để đỡ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_fuente", hand: ["saloon_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "saloon_1" });

    expect(next.players[1].hp).toBe(4); // né được, không mất máu
    expect(next.players[1].hand).toEqual([]);
    expect(events).toContainEqual({ type: "MISSED_PLAYED", playerId: "b" });
  });

  it("dùng lá trang bị của CHÍNH mình làm Missed! — KHÔNG cần chờ 1 lượt như nhóm 'delayed'", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_fuente", equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
      turnNumber: 5,
      equipmentPlayedTurn: { scope_1: 5 }, // vừa chơi ra NGAY lượt này
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "scope_1" });

    expect(next.players[1].hp).toBe(4);
    expect(next.players[1].equipment).toEqual([]);
    expect(next.discardPile).toContain("scope_1");
  });

  it("dùng Jail đang giam CHÍNH MÌNH làm Missed! — thoát giam sớm", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_fuente", equipment: ["jail_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "jail_1" });

    expect(next.players[1].hp).toBe(4);
    expect(next.players[1].equipment).toEqual([]); // Jail đã mất — thoát giam sớm
  });

  it("KHÔNG được dùng Dynamite của chính mình làm Missed!", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_fuente", equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(() =>
      reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "dynamite_1" })
    ).toThrow(/Thuốc nổ không bao giờ dùng được/);
  });

  it("người KHÔNG phải Elena Fuente không dùng được lá bất kỳ làm Missed!", () => {
    const state = makeState({
      players: [makePlayer("a", { hand: ["bang_1"] }), makePlayer("b", { hand: ["saloon_1"] }), makePlayer("c")],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(() =>
      reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "saloon_1" })
    ).toThrow();
  });
});

describe("Apache Kid — miễn nhiễm với lá chất Rô do người khác đánh nhắm vào mình (kể cả lá Duel khởi xướng, kể cả Indians!)", () => {
  it("Bang! chất Rô (bang_15 = Rô 2): miễn nhiễm, không mất máu, không có NEED_MISSED", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_15"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_15",
      targetId: "b",
    });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4);
    expect(next.discardPile).toContain("bang_15"); // lá vẫn bị đánh ra bình thường
    expect(events).toContainEqual({
      type: "APACHE_KID_IMMUNE",
      playerId: "b",
      fromPlayerId: "a",
      cardId: "bang_15",
    });
  });

  it("Bang! KHÔNG phải chất Rô (bang_1 = Bích A): vẫn bị ảnh hưởng bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("Cat Balou chất Rô (cat_balou_5 = Rô 8): miễn nhiễm, không bị bắt bỏ bài dù tay đang RỖNG", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["cat_balou_5"] }),
        makePlayer("b", { characterId: "apache_kid", hand: [], equipment: [] }),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "cat_balou_5",
      targetId: "b",
      targetZone: "hand",
    });

    expect(next.pending).toEqual([]); // không throw "không còn bài để bỏ" — miễn nhiễm được kiểm TRƯỚC
    expect(events).toContainEqual({
      type: "APACHE_KID_IMMUNE",
      playerId: "b",
      fromPlayerId: "a",
      cardId: "cat_balou_5",
    });
  });

  it("Đấu tay đôi (Duel) chất Rô (duel_3 = Rô 8): miễn nhiễm, huỷ ván đấu ngay từ đầu", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["duel_3"] }), // duel_3 = Rô 8
        makePlayer("b", { characterId: "apache_kid", hp: 1 }),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "duel_3",
      targetId: "b",
    });

    expect(next.pending).toEqual([]);
    expect(next.players[1].alive).toBe(true); // không phải bỏ Bang! gì cả, miễn nhiễm hẳn
    expect(events).toContainEqual({
      type: "APACHE_KID_IMMUNE",
      playerId: "b",
      fromPlayerId: "a",
      cardId: "duel_3",
    });
  });

  it("Đấu tay đôi (Duel) KHÔNG phải chất Rô (duel_1 = Cơ Q): ván đấu diễn ra bình thường, chất của TỪNG lá Bang! trao đổi trong lúc đấu không quan trọng", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["duel_1"] }), // duel_1 = Cơ Q, không phải Rô
        makePlayer("b", { characterId: "apache_kid", hp: 1 }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "duel_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không có Bang! -> thua

    expect(next.players[1].alive).toBe(false); // vẫn thua bình thường — lá Duel không phải Rô
  });

  it("Buffalo Rifle chất Rô (trang bị trì hoãn): miễn nhiễm khi kích hoạt nhắm vào Apache Kid", () => {
    const state = makeState({
      players: [
        makePlayer("a", { equipment: ["buffalo_rifle_1"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
      turnNumber: 5,
      equipmentPlayedTurn: { buffalo_rifle_1: 0 },
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "buffalo_rifle_1",
      targetId: "b",
    });

    expect(next.pending).toEqual([]);
    expect(events).toContainEqual({
      type: "APACHE_KID_IMMUNE",
      playerId: "b",
      fromPlayerId: "a",
      cardId: "buffalo_rifle_1",
    });
  });

  it("Nhà tù (Jail) KHÔNG chất Rô: vẫn gắn lên Apache Kid bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["jail_1"] }), // jail_1 = Cơ 4, không phải Rô
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b" });

    expect(next.players[1].equipment).toEqual(["jail_1"]);
  });

  it("Indians! KHÔNG phải chất Rô (indians_1 = Cơ K): vẫn bị ảnh hưởng bình thường (bộ bài hiện không có bản Indians! chất Rô nào để test trực tiếp nhánh miễn nhiễm — cùng 1 hàm isImmuneToCard đã kiểm chứng qua Bang!/Cat Balou/Buffalo Rifle/Can Can ở trên)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["indians_1"] }),
        makePlayer("b", { characterId: "apache_kid", hp: 4 }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1", targetId: "b" });

    expect(next.pending).toContainEqual({
      kind: "NEED_DISCARD_BANG",
      player: "b",
      source: { card: "indians", from: "a" },
    });
  });

  it("Gatling chất không Rô nhắm nhiều người: Apache Kid vẫn nằm trong danh sách NEED_MISSED như người khác (không có Gatling chất Rô nào tồn tại trong bộ bài)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["gatling_1"] }),
        makePlayer("b", { characterId: "apache_kid" }),
        makePlayer("c"),
      ],
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "gatling_1" });

    expect(next.pending).toContainEqual({ kind: "NEED_MISSED", player: "b", source: { card: "gatling", from: "a" } });
    expect(next.pending).toContainEqual({ kind: "NEED_MISSED", player: "c", source: { card: "gatling", from: "a" } });
  });
});
