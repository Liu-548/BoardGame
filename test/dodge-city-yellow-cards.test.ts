// Mở rộng Dodge City (Luat_Bang_Mo_Rong_DodgeCity.txt, mục 1.1 — "kiến trúc
// trang bị trì hoãn"). Đợt 1: chỉ 6/40 lá vàng KHÔNG cần hook nhân vật mới —
// Bible/Sombrero/Ten Gallon Hat/Iron Plate (dùng NHƯ Missed!) và
// Canteen/Pony Express (hiệu ứng chủ động đơn giản: tự hồi máu, rút bài).
// Xem test/setup.test.ts's describe("bộ mở rộng 'dodge_city'") cho phần
// bộ bài — file này chỉ kiểm luồng reduce() với state dựng thẳng.
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
    turnNumber: 0,
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
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Dodge City — chơi lá vàng lần đầu (từ tay, bày ra sân)", () => {
  it("gắn vào equipment, KHÔNG vào chồng bỏ, ghi nhớ đúng lượt vừa chơi ra", () => {
    const state = makeState([makePlayer("a", { hand: ["canteen_1"] }), makePlayer("b")], { turnNumber: 3 });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });

    expect(next.players[0].hand).toEqual([]);
    expect(next.players[0].equipment).toEqual(["canteen_1"]);
    expect(next.discardPile).toEqual([]);
    expect(next.equipmentPlayedTurn["canteen_1"]).toBe(3);
    expect(events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "canteen_1" }]);
  });

  it("không được trang bị 2 lá vàng CÙNG TÊN (Iron Plate x2) — luật 'không 2 lá cùng tên' áp dụng chung với lá xanh dương", () => {
    const state = makeState([
      makePlayer("a", { hand: ["iron_plate_2"], equipment: ["iron_plate_1"] }),
      makePlayer("b"),
    ]);

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "iron_plate_2" })).toThrow(/Đã có/);
  });

  it("không sửa state gốc truyền vào (equipmentPlayedTurn không bị mutate chung)", () => {
    const state = makeState([makePlayer("a", { hand: ["canteen_1"] }), makePlayer("b")], { turnNumber: 3 });
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });
    expect(state).toEqual(snapshot);
  });
});

describe("Dodge City — kích hoạt lá vàng CHỦ ĐỘNG (Canteen, Pony Express)", () => {
  it("báo lỗi khi kích hoạt NGAY TRONG lượt vừa chơi ra", () => {
    const state = makeState([makePlayer("a", { equipment: ["canteen_1"], hp: 3 }), makePlayer("b")], {
      turnNumber: 3,
      equipmentPlayedTurn: { canteen_1: 3 },
    });

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" })).toThrow(
      /phải chờ ít nhất 1 lượt/
    );
  });

  it("kích hoạt Canteen ở lượt SAU: tự hồi 1 máu, bỏ lá vào chồng bỏ, xoá khỏi equipmentPlayedTurn", () => {
    const state = makeState([makePlayer("a", { equipment: ["canteen_1"], hp: 3 }), makePlayer("b")], {
      turnNumber: 4,
      equipmentPlayedTurn: { canteen_1: 3 },
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });

    expect(next.players[0].hp).toBe(4);
    expect(next.players[0].equipment).toEqual([]);
    expect(next.discardPile).toEqual(["canteen_1"]);
    expect(next.equipmentPlayedTurn["canteen_1"]).toBeUndefined();
    expect(events).toEqual([
      { type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "canteen_1" },
      { type: "HP_RESTORED", playerId: "a", amount: 1 },
    ]);
  });

  it("kích hoạt Canteen khi đã đầy máu: vẫn bỏ lá, không có HP_RESTORED", () => {
    const state = makeState([makePlayer("a", { equipment: ["canteen_1"], hp: 4, maxHp: 4 }), makePlayer("b")], {
      turnNumber: 4,
      equipmentPlayedTurn: { canteen_1: 3 },
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });

    expect(next.players[0].hp).toBe(4);
    expect(events).toEqual([{ type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "canteen_1" }]);
  });

  it("kích hoạt Pony Express: rút 3 lá từ bộ bài", () => {
    const state = makeState([makePlayer("a", { equipment: ["pony_express_1"] }), makePlayer("b")], {
      turnNumber: 4,
      equipmentPlayedTurn: { pony_express_1: 3 },
      deck: ["beer_1", "beer_2", "beer_3"],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "pony_express_1" });

    expect(next.players[0].hand).toEqual(["beer_3", "beer_2", "beer_1"]);
    expect(next.deck).toEqual([]);
    expect(events).toEqual([
      { type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "pony_express_1" },
      { type: "CARDS_DRAWN", playerId: "a", count: 3 },
    ]);
  });

  it("báo lỗi khi PLAY_CARD trực tiếp lá vàng nhóm Missed! đã bày sẵn (Sombrero) — chỉ dùng được để đỡ, không tự đánh ra", () => {
    const state = makeState([makePlayer("a", { equipment: ["sombrero_1"] }), makePlayer("b")], {
      turnNumber: 4,
      equipmentPlayedTurn: { sombrero_1: 3 },
    });

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "sombrero_1" })).toThrow(
      /chỉ dùng được để đỡ/
    );
  });
});

describe("Dodge City — dùng lá vàng NHƯ Missed! để đỡ Bang!/Gatling (RESPOND)", () => {
  it("đỡ được bằng Sombrero đã bày TỪ LƯỢT TRƯỚC — bắn MISSED_PLAYED, bỏ khỏi equipment", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { equipment: ["sombrero_1"] })], {
      turnNumber: 5,
      equipmentPlayedTurn: { sombrero_1: 3 },
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", cardId: "sombrero_1" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(next.players[1].equipment).toEqual([]);
    expect(next.discardPile).toEqual(["sombrero_1"]);
    expect(next.equipmentPlayedTurn["sombrero_1"]).toBeUndefined();
    expect(events).toEqual([{ type: "MISSED_PLAYED", playerId: "b" }]);
  });

  it("báo lỗi nếu cố đỡ bằng Sombrero vừa bày ra CHÍNH LƯỢT NÀY", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { equipment: ["sombrero_1"] })], {
      turnNumber: 3,
      equipmentPlayedTurn: { sombrero_1: 3 },
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    expect(() => reduce(state, { type: "RESPOND", playerId: "b", cardId: "sombrero_1" })).toThrow(
      /phải chờ ít nhất 1 lượt/
    );
  });

  it("Bible đỡ thành công thì rút thêm 1 lá", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { equipment: ["bible_1"] })], {
      turnNumber: 5,
      equipmentPlayedTurn: { bible_1: 3 },
      deck: ["beer_1"],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", cardId: "bible_1" });

    expect(next.players[1].hand).toEqual(["beer_1"]);
    expect(events).toEqual([
      { type: "MISSED_PLAYED", playerId: "b" },
      { type: "CARDS_DRAWN", playerId: "b", count: 1 },
    ]);
  });

  it("kết hợp Missed! trên tay + Sombrero trên sân để đủ 2 Missed! cần (Slab the Killer, missesNeeded)", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { hand: ["missed_1"], equipment: ["sombrero_1"] })],
      {
        turnNumber: 5,
        equipmentPlayedTurn: { sombrero_1: 3 },
        pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" }, missesNeeded: 2 }],
      }
    );

    const first = reduce(state, { type: "RESPOND", playerId: "b", cardId: "sombrero_1" });
    expect(first.state.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(first.state.players[1].hp).toBe(4);

    const second = reduce(first.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(second.state.pending).toEqual([]);
    expect(second.state.players[1].hp).toBe(4);
  });

  it("báo lỗi nếu chưa đủ Missed! cần ngay từ đầu (không được bỏ dở dang)", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { hand: ["missed_1"] })], {
      turnNumber: 5,
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" }, missesNeeded: 2 }],
    });

    expect(() => reduce(state, { type: "RESPOND", playerId: "b", cardId: "missed_1" })).toThrow(/Không đủ Missed!/);
  });
});

// Yêu cầu chủ dự án xác nhận rõ: lá vàng, sau khi qua đủ 1 lượt, KHÔNG buộc
// phải dùng ngay — được phép nằm trên sân BAO LÂU TUỲ THÍCH (bất kỳ lượt nào
// sau đó, không chỉ đúng lượt kế tiếp), CHỈ biến mất khi CHỦ ĐỘNG dùng (đã
// kiểm ở các describe trên) HOẶC bị bỏ bài bởi lá khác (Cat Balou/Panic!) HOẶC
// chủ nó chết. Cả 3 đường "biến mất" đều phải dọn sạch equipmentPlayedTurn —
// không bắt buộc để đúng, chỉ để state không có rác (quy tắc 3 CLAUDE.md).
describe("Dodge City — lá vàng tồn tại trên sân bao lâu tuỳ thích, không tự hết hạn/bị ép dùng", () => {
  it("Canteen (chủ động) vẫn kích hoạt được ở lượt RẤT XA sau đó, không chỉ đúng lượt kế tiếp", () => {
    const state = makeState([makePlayer("a", { equipment: ["canteen_1"], hp: 3 }), makePlayer("b")], {
      turnNumber: 50,
      equipmentPlayedTurn: { canteen_1: 3 }, // chơi ra từ lượt 3, giờ đã lượt 50
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "canteen_1" });
    expect(next.players[0].hp).toBe(4);
  });

  it("Sombrero (Missed!) vẫn đỡ được ở lượt RẤT XA sau đó", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { equipment: ["sombrero_1"] })], {
      turnNumber: 50,
      equipmentPlayedTurn: { sombrero_1: 3 },
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b", cardId: "sombrero_1" });
    expect(next.players[1].hp).toBe(4);
  });

  it("KHÔNG tự bị bỏ/mất hiệu lực nếu không ai đụng tới — vẫn nguyên trên sân qua nhiều lượt (END_TURN liên tiếp)", () => {
    let state = makeState(
      [makePlayer("a", { equipment: ["canteen_1"] }), makePlayer("b"), makePlayer("c")],
      { turnNumber: 3, equipmentPlayedTurn: { canteen_1: 3 }, turnPhase: "play" }
    );

    // a kết thúc lượt, b rút+kết thúc, c rút+kết thúc — canteen_1 không hề bị đụng tới.
    state = reduce(state, { type: "END_TURN", playerId: "a" }).state;
    state = reduce(state, { type: "DRAW_CARDS", playerId: "b" }).state;
    state = reduce(state, { type: "END_TURN", playerId: "b" }).state;
    state = reduce(state, { type: "DRAW_CARDS", playerId: "c" }).state;
    state = reduce(state, { type: "END_TURN", playerId: "c" }).state;

    expect(state.players[0].equipment).toEqual(["canteen_1"]);
    expect(state.equipmentPlayedTurn["canteen_1"]).toBe(3); // không đổi, không bị xoá
    expect(state.turnNumber).toBeGreaterThan(3); // nhiều lượt đã trôi qua thật
  });

  it("biến mất khi bị Cat Balou bắt bỏ (zone equipment) — dọn sạch equipmentPlayedTurn theo", () => {
    const state = makeState([makePlayer("a", { equipment: ["canteen_1"] }), makePlayer("b")], {
      turnNumber: 10,
      equipmentPlayedTurn: { canteen_1: 3 },
      pending: [{ kind: "NEED_DISCARD_FROM_ZONE", player: "a", zone: "equipment", source: { card: "cat_balou", from: "b" } }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", cardId: "canteen_1" });

    expect(next.players[0].equipment).toEqual([]);
    expect(next.discardPile).toEqual(["canteen_1"]);
    expect(next.equipmentPlayedTurn["canteen_1"]).toBeUndefined();
    expect(events).toEqual([{ type: "CARD_FORCE_DISCARDED", playerId: "a", byPlayerId: "b", cardId: "canteen_1" }]);
  });

  it("biến mất khỏi sân (chuyển sang tay người cướp) khi bị Panic! cướp — dọn sạch equipmentPlayedTurn theo", () => {
    const state = makeState(
      [makePlayer("a", { hand: ["panic_1"] }), makePlayer("b", { equipment: ["canteen_1"] })],
      { turnNumber: 10, equipmentPlayedTurn: { canteen_1: 3 } }
    );

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b", targetCardId: "canteen_1",
    });

    expect(next.players[1].equipment).toEqual([]);
    expect(next.players[0].hand).toEqual(["canteen_1"]); // giờ nằm ở tay người cướp
    expect(next.equipmentPlayedTurn["canteen_1"]).toBeUndefined();
  });

  it("biến mất khi chủ nó bị loại (chết) — dọn sạch equipmentPlayedTurn theo", () => {
    // vai "renegade" (không phải "outlaw") để tránh dính thưởng "hạ Outlaw rút
    // 3 lá" — với deck rỗng trong test này, thưởng đó sẽ tự xáo lại discardPile
    // thành deck mới (drawTopCard()), làm xáo trộn đúng lá đang muốn kiểm tra.
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { hp: 1, equipment: ["canteen_1"], role: "renegade" }),
      ],
      { turnNumber: 10, equipmentPlayedTurn: { canteen_1: 3 } }
    );

    const dealt = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(dealt.state, { type: "RESPOND", playerId: "b" }); // không đỡ, chịu mất máu -> chết

    expect(next.players[1].alive).toBe(false);
    expect(next.discardPile).toContain("canteen_1");
    expect(next.equipmentPlayedTurn["canteen_1"]).toBeUndefined();
  });
});
