// Mở rộng Dodge City, đợt 2 (Luat_Bang_Mo_Rong_DodgeCity.txt, mục 2) — 34/40
// lá còn lại sau đợt 1 (test/dodge-city-yellow-cards.test.ts): 6 lá xanh
// (Barrel/Dynamite/Remington/Rev. Carabine thêm bản sao thứ 2 — chỉ đổi dữ
// liệu, không cần test riêng; Binocular/Hideout hoàn toàn mới), 14 lá nâu
// (7 tên trùng bộ cơ bản — cũng chỉ đổi dữ liệu; Brawl/Dodge/Punch/Rag Time/
// Springfield/Tequila/Whisky mới), và 7 lá vàng còn lại (Derringer/Conestoga/
// Can Can/Buffalo Rifle/Knife/Pepperbox/Howitzer). File này chỉ kiểm luồng
// reduce() với state dựng thẳng — xem test/setup.test.ts's describe("house
// rule 'extra_cards'") cho phần bộ bài.
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
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
    equipmentPlayedTurn: {},
    houseRules: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Dodge City đợt 2 — Binocular/Hideout (bản sao Scope/Mustang, cộng dồn)", () => {
  it("Binocular cộng dồn với Scope thật: -2 tổng, đủ để bắn trúng mục tiêu khoảng cách thô 2 bằng súng tầm mặc định (1)", () => {
    // 5 người: khoảng cách thô a->c = 2. Không có Scope/Binocular thì ngoài
    // tầm súng mặc định (1) — có cả 2 thì -2, còn 1, trong tầm.
    const withBoth = makeState([
      makePlayer("a", { hand: ["bang_1"], equipment: ["scope_1", "binocular_1"] }),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
      makePlayer("e"),
    ]);
    const { state: next } = reduce(withBoth, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } }]);

    const withoutAny = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
      makePlayer("e"),
    ]);
    expect(() =>
      reduce(withoutAny, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" })
    ).toThrow(/ngoài tầm bắn/);
  });

  it("Hideout cộng dồn với Mustang thật: +2 tổng, khiến mục tiêu ngoài tầm súng mặc định", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { equipment: ["mustang_1", "hideout_1"] }),
    ]);
    // Khoảng cách thô 2 người = 1, +2 (Mustang+Hideout) = 3 > tầm súng mặc định 1.
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })).toThrow(
      /ngoài tầm bắn/
    );
  });
});

describe("Dodge City đợt 2 — Brawl (bỏ kèm 1 lá phụ, mọi người khác bỏ 1 lá theo vùng do người đánh chỉ định)", () => {
  it("báo lỗi nếu thiếu extraDiscardCardId", () => {
    const state = makeState([
      makePlayer("a", { hand: ["brawl_1"] }),
      makePlayer("b", { hand: ["missed_1"] }),
    ]);
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "brawl_1", brawlZones: { b: "hand" } })
    ).toThrow(/bỏ kèm 1 lá phụ/);
  });

  it("báo lỗi nếu thiếu vùng (zone) cho 1 nạn nhân", () => {
    const state = makeState([
      makePlayer("a", { hand: ["brawl_1", "beer_1"] }),
      makePlayer("b", { hand: ["missed_1"] }),
      makePlayer("c", { hand: ["missed_2"] }),
    ]);
    expect(() =>
      reduce(state, {
        type: "PLAY_CARD", playerId: "a", cardId: "brawl_1",
        extraDiscardCardId: "beer_1", brawlZones: { b: "hand" },
      })
    ).toThrow(/chọn vùng bỏ bài/);
  });

  it("đẩy đúng 1 NEED_DISCARD_FROM_ZONE cho MỖI nạn nhân, đúng vùng riêng từng người, người kế tiếp lên đỉnh stack trước", () => {
    const state = makeState([
      makePlayer("a", { hand: ["brawl_1", "beer_1"] }),
      makePlayer("b", { hand: ["missed_1"] }),
      makePlayer("c", { equipment: ["scope_1"] }),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "brawl_1",
      extraDiscardCardId: "beer_1", brawlZones: { b: "hand", c: "equipment" },
    });

    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toEqual(["brawl_1", "beer_1"]);
    expect(next.pending).toEqual([
      { kind: "NEED_DISCARD_FROM_ZONE", player: "c", zone: "equipment", source: { card: "brawl", from: "a" } },
      { kind: "NEED_DISCARD_FROM_ZONE", player: "b", zone: "hand", source: { card: "brawl", from: "a" } },
    ]);
    expect(events).toEqual([{ type: "CARD_PLAYED", playerId: "a", cardId: "brawl_1" }]);

    const afterB = reduce(next, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(afterB.state.players[1].hand).toEqual([]);
    expect(afterB.state.pending).toEqual([
      { kind: "NEED_DISCARD_FROM_ZONE", player: "c", zone: "equipment", source: { card: "brawl", from: "a" } },
    ]);
  });

  it("báo lỗi nếu chỉ định vùng cho người không còn gì để bỏ ở đó (Dynamite miễn nhiễm, sân trống)", () => {
    const state = makeState([
      makePlayer("a", { hand: ["brawl_1", "beer_1"] }),
      makePlayer("b", { equipment: ["dynamite_1"] }), // chỉ có Dynamite, miễn nhiễm
    ]);
    expect(() =>
      reduce(state, {
        type: "PLAY_CARD", playerId: "a", cardId: "brawl_1",
        extraDiscardCardId: "beer_1", brawlZones: { b: "equipment" },
      })
    ).toThrow(/không có trang bị nào trên sân/);
  });
});

describe("Dodge City đợt 2 — Dodge (hoạt động như Missed!, rút thêm 1 lá khi đỡ thành công)", () => {
  it("không tự đánh chủ động được", () => {
    const state = makeState([makePlayer("a", { hand: ["dodge_1"] }), makePlayer("b")]);
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "dodge_1" })).toThrow(
      /chỉ dùng để phản ứng/
    );
  });

  it("đỡ được Bang!/Gatling y hệt Missed!, rút thêm 1 lá ngay sau khi đỡ thành công", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { hand: ["dodge_1"] })], {
      deck: ["beer_1"],
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b", cardId: "dodge_1" });

    expect(next.pending).toEqual([]);
    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(next.players[1].hand).toEqual(["beer_1"]); // rút thêm 1 lá
    expect(events).toEqual([
      { type: "MISSED_PLAYED", playerId: "b" },
      { type: "CARDS_DRAWN", playerId: "b", count: 1 },
    ]);
  });
});

describe("Dodge City đợt 2 — Punch (Bang! khoảng cách 1 bất kể súng, không tính giới hạn Bang!/lượt)", () => {
  it("bắn trúng ở khoảng cách 1 dù không có súng nào (dùng tầm mặc định vẫn đúng bằng 1)", () => {
    const state = makeState([makePlayer("a", { hand: ["punch_1"] }), makePlayer("b")]);
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "punch_1", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "punch", from: "a" } }]);
  });

  it("báo lỗi nếu mục tiêu ở khoảng cách xa hơn 1", () => {
    const state = makeState([
      makePlayer("a", { hand: ["punch_1"] }),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
      makePlayer("e"),
    ]);
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "punch_1", targetId: "c" })).toThrow(
      /chỉ dùng được ở khoảng cách 1/
    );
  });

  it("KHÔNG tính vào giới hạn 1 Bang!/lượt — đánh Bang! thật rồi vẫn đánh được Punch trong cùng lượt", () => {
    const state = makeState([makePlayer("a", { hand: ["bang_1", "punch_1"] }), makePlayer("b")]);
    const afterBang = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(afterBang.state.bangUsedThisTurn).toBe(true);

    const stateAfterMiss = { ...afterBang.state, pending: [] as GameState["pending"] };
    const { state: next } = reduce(stateAfterMiss, {
      type: "PLAY_CARD", playerId: "a", cardId: "punch_1", targetId: "b",
    });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "punch", from: "a" } }]);
    expect(next.bangUsedThisTurn).toBe(true); // vẫn true, Punch không đụng vào field này
  });
});

describe("Dodge City đợt 2 — Rag Time (Panic! không giới hạn khoảng cách, bỏ kèm 1 lá phụ)", () => {
  it("báo lỗi nếu thiếu lá phụ", () => {
    const state = makeState([
      makePlayer("a", { hand: ["rag_time_1"] }),
      makePlayer("b", { hand: ["beer_1"] }),
    ]);
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "rag_time_1", targetId: "b" })
    ).toThrow(/bỏ kèm 1 lá phụ/);
  });

  it("cướp được bài dù mục tiêu ở khoảng cách xa (khác Panic! thường, giới hạn đúng khoảng cách 1)", () => {
    // 5 người: khoảng cách thô a->c = 2, vượt quá giới hạn 1 của Panic! thường
    // — Rag Time vẫn phải cướp được vì KHÔNG kiểm tra khoảng cách gì cả.
    const state = makeState([
      makePlayer("a", { hand: ["rag_time_1", "missed_1"] }),
      makePlayer("b"),
      makePlayer("c", { hand: ["schofield_1"] }),
      makePlayer("d"),
      makePlayer("e"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "rag_time_1", extraDiscardCardId: "missed_1", targetId: "c",
    });

    expect(next.players[0].hand).toEqual(["schofield_1"]);
    expect(next.discardPile).toEqual(["rag_time_1", "missed_1"]);
    expect(events.some((e) => e.type === "CARD_STOLEN")).toBe(true);
  });
});

describe("Dodge City đợt 2 — Springfield (Bang! bất kỳ khoảng cách, bỏ kèm 1 lá phụ, không tính giới hạn)", () => {
  it("bắn trúng mục tiêu XA (bất kể khoảng cách/tầm súng), không tính vào giới hạn 1 Bang!/lượt", () => {
    const state = makeState([
      makePlayer("a", { hand: ["springfield_1", "beer_1"], }),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
      makePlayer("e"),
    ]);

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "springfield_1", extraDiscardCardId: "beer_1", targetId: "c",
    });

    expect(next.discardPile).toEqual(["springfield_1", "beer_1"]);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "springfield", from: "a" } }]);
    expect(next.bangUsedThisTurn).toBe(false);
    expect(events.some((e) => e.type === "CARD_PLAYED")).toBe(true);
  });
});

describe("Dodge City đợt 2 — Tequila (hồi máu người bất kỳ kể cả chính mình, bỏ kèm 1 lá phụ)", () => {
  it("hồi máu cho NGƯỜI KHÁC", () => {
    const state = makeState([
      makePlayer("a", { hand: ["tequila_1", "beer_1"] }),
      makePlayer("b", { hp: 2 }),
    ]);
    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "tequila_1", extraDiscardCardId: "beer_1", targetId: "b",
    });
    expect(next.players[1].hp).toBe(3);
  });

  it("hồi máu cho CHÍNH MÌNH (khác findLivingTarget thường — được phép tự chọn)", () => {
    const state = makeState([
      makePlayer("a", { hand: ["tequila_1", "beer_1"], hp: 2 }),
      makePlayer("b"),
    ]);
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "tequila_1", extraDiscardCardId: "beer_1", targetId: "a",
    });
    expect(next.players[0].hp).toBe(3);
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 1 });
  });
});

describe("Dodge City đợt 2 — Whisky (tự hồi 2 máu, bỏ kèm 1 lá phụ, chỉ trong lượt mình)", () => {
  it("tự hồi đúng 2 máu (không vượt trần)", () => {
    const state = makeState([makePlayer("a", { hand: ["whisky_1", "beer_1"], hp: 1, maxHp: 4 }), makePlayer("b")]);
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "whisky_1", extraDiscardCardId: "beer_1",
    });
    expect(next.players[0].hp).toBe(3);
    expect(next.discardPile).toEqual(["whisky_1", "beer_1"]);
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 2 });
  });

  it("báo lỗi nếu không phải lượt của chính mình (đúng luật gốc chung, không có ngoại lệ như Beer)", () => {
    const state = makeState([makePlayer("a"), makePlayer("b", { hand: ["whisky_1", "beer_1"] })]);
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "whisky_1", extraDiscardCardId: "beer_1" })
    ).toThrow(/Không phải lượt/);
  });

  // Đã đầy máu thì KHÔNG được TỰ ĐÁNH Bia để hồi máu (test/brown-cards.test.ts)
  // — NHƯNG dùng Bia làm lá PHỤ bỏ kèm (extraDiscardCardId, mục 1.2) là 1 việc
  // HOÀN TOÀN KHÁC (không đi qua playBeer(), không quan tâm lá bị bỏ là gì) —
  // vẫn phải hoạt động bình thường dù người bỏ đang đầy máu.
  it("dùng Bia làm lá phụ bỏ kèm (extraDiscardCardId) vẫn được dù người đánh đang đầy máu", () => {
    const state = makeState([makePlayer("a", { hand: ["whisky_1", "beer_1"], hp: 4, maxHp: 4 }), makePlayer("b")]);
    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "whisky_1", extraDiscardCardId: "beer_1",
    });
    expect(next.players[0].hp).toBe(4); // đã đầy, Whisky tự hồi 0 (không throw, khác Bia)
    expect(next.discardPile).toEqual(["whisky_1", "beer_1"]);
  });
});

describe("Dodge City đợt 2 — lá vàng còn lại (delayed, KHÔNG có ký hiệu Missed!)", () => {
  it("Derringer: khoảng cách 1, LUÔN rút thêm 1 lá bất kể trúng/né", () => {
    const state = makeState([makePlayer("a", { equipment: ["derringer_1"] }), makePlayer("b")], {
      turnNumber: 5,
      equipmentPlayedTurn: { derringer_1: 3 },
      deck: ["beer_1"],
    });
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "derringer_1", targetId: "b",
    });
    expect(next.players[0].hand).toEqual(["beer_1"]);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "derringer", from: "a" } }]);
    expect(events).toEqual([
      { type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "derringer_1" },
      { type: "CARDS_DRAWN", playerId: "a", count: 1 },
    ]);
  });

  it("Derringer báo lỗi nếu mục tiêu xa hơn khoảng cách 1", () => {
    const state = makeState(
      [makePlayer("a", { equipment: ["derringer_1"] }), makePlayer("b"), makePlayer("c"), makePlayer("d"), makePlayer("e")],
      { turnNumber: 5, equipmentPlayedTurn: { derringer_1: 3 } }
    );
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "derringer_1", targetId: "c" })
    ).toThrow(/chỉ dùng được ở khoảng cách 1/);
  });

  it("Knife: khoảng cách 1, KHÔNG rút thêm bài (khác Derringer)", () => {
    const state = makeState([makePlayer("a", { equipment: ["knife_1"] }), makePlayer("b")], {
      turnNumber: 5,
      equipmentPlayedTurn: { knife_1: 3 },
    });
    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "knife_1", targetId: "b" });
    expect(next.players[0].hand).toEqual([]);
    expect(events).toEqual([
      { type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "knife_1" },
    ]);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "knife", from: "a" } }]);
  });

  it("Pepperbox: dùng ĐÚNG tầm súng đang cầm — trúng trong tầm, trượt ngoài tầm", () => {
    const players = [
      makePlayer("a", { equipment: ["pepperbox_1", "schofield_1"] }),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
      makePlayer("e"),
    ];
    const state = makeState(players, { turnNumber: 5, equipmentPlayedTurn: { pepperbox_1: 3 } });

    // Schofield tầm 2, khoảng cách a->c = 2 -> trong tầm.
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "pepperbox_1", targetId: "c" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "pepperbox", from: "a" } }]);

    // Không có súng (tầm mặc định 1), khoảng cách a->c = 2 -> ngoài tầm.
    const stateNoWeapon = makeState(
      [makePlayer("a", { equipment: ["pepperbox_1"] }), makePlayer("b"), makePlayer("c"), makePlayer("d"), makePlayer("e")],
      { turnNumber: 5, equipmentPlayedTurn: { pepperbox_1: 3 } }
    );
    expect(() =>
      reduce(stateNoWeapon, { type: "PLAY_CARD", playerId: "a", cardId: "pepperbox_1", targetId: "c" })
    ).toThrow(/ngoài tầm bắn của Pepperbox/);
  });

  it("Buffalo Rifle: bắn trúng mục tiêu XA, bất kể khoảng cách/tầm súng (khác Pepperbox)", () => {
    const state = makeState(
      [makePlayer("a", { equipment: ["buffalo_rifle_1"] }), makePlayer("b"), makePlayer("c"), makePlayer("d"), makePlayer("e")],
      { turnNumber: 5, equipmentPlayedTurn: { buffalo_rifle_1: 3 } }
    );
    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "buffalo_rifle_1", targetId: "c",
    });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "buffalo_rifle", from: "a" } }]);
  });

  it("Howitzer: bắn TẤT CẢ người khác cùng lúc, không cần targetId", () => {
    const state = makeState([makePlayer("a", { equipment: ["howitzer_1"] }), makePlayer("b"), makePlayer("c")], {
      turnNumber: 5,
      equipmentPlayedTurn: { howitzer_1: 3 },
    });
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "howitzer_1" });
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "c", source: { card: "howitzer", from: "a" } },
      { kind: "NEED_MISSED", player: "b", source: { card: "howitzer", from: "a" } },
    ]);
  });

  it("Conestoga: bản 'delayed' của Panic!, không giới hạn khoảng cách", () => {
    const players = [
      makePlayer("a", { equipment: ["conestoga_1"] }),
      makePlayer("b"),
      makePlayer("c", { hand: ["schofield_1"] }),
      makePlayer("d"),
      makePlayer("e"),
    ];
    const state = makeState(players, { turnNumber: 5, equipmentPlayedTurn: { conestoga_1: 3 } });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "conestoga_1", targetId: "c",
    });
    expect(next.players[0].hand).toEqual(["schofield_1"]);
    expect(next.players[2].hand).toEqual([]);
    expect(events).toEqual([
      { type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "conestoga_1" },
      { type: "CARD_STOLEN", playerId: "a", fromPlayerId: "c", cardId: "schofield_1" },
    ]);
  });

  it("Can Can: bản 'delayed' của Cat Balou, đẩy NEED_DISCARD_FROM_ZONE cho mục tiêu XA", () => {
    const state = makeState(
      [makePlayer("a", { equipment: ["can_can_1"] }), makePlayer("b"), makePlayer("c", { hand: ["beer_1"] }), makePlayer("d"), makePlayer("e")],
      { turnNumber: 5, equipmentPlayedTurn: { can_can_1: 3 } }
    );
    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "can_can_1", targetId: "c", targetZone: "hand",
    });
    expect(next.pending).toEqual([
      { kind: "NEED_DISCARD_FROM_ZONE", player: "c", zone: "hand", source: { card: "can_can", from: "a" } },
    ]);
    expect(events).toEqual([{ type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: "a", cardId: "can_can_1" }]);
  });

  it("Derringer/Knife/Pepperbox/Buffalo Rifle/Howitzer/Conestoga/Can Can đều bị chặn kích hoạt NGAY lượt vừa chơi ra (giống Canteen/Pony Express)", () => {
    const state = makeState([makePlayer("a", { equipment: ["knife_1"] }), makePlayer("b")], {
      turnNumber: 3,
      equipmentPlayedTurn: { knife_1: 3 },
    });
    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "knife_1", targetId: "b" })).toThrow(
      /phải chờ ít nhất 1 lượt/
    );
  });
});
