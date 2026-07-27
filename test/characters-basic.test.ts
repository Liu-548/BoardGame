// Việc 5.2 (đợt 1 + đợt 2) — kiểm tra DỮ LIỆU THẬT của các nhân vật dùng
// ngay được, không cần PendingAction/luồng action mới: đợt 1 — Bart Cassidy,
// El Gringo, Paul Regret, Rose Doolan, Vulture Sam, Willy the Kid; đợt 2 —
// Jourdonnais, Black Jack. Khác test/characters.test.ts (kiểm tra HỆ THỐNG
// hook bằng nhân vật giả) — ở đây dùng THẲNG id thật trong CHARACTERS.
import { describe, expect, it } from "vitest";
import { computeDistance } from "../src/core/distance";
import { reduce } from "../src/core/reduce";
import { setupGame } from "../src/core/setup";
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
    houseRules: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("setupGame — gán nhân vật qua characterAssignments (tạm thời, xem RuleOptions)", () => {
  it("máu tối đa = bullets của nhân vật, Sheriff vẫn luôn +1 dù có nhân vật", () => {
    const state = setupGame(["a", "b", "c", "d"], 42, {
      characterAssignments: { a: "el_gringo" }, // bullets 3
    });

    const a = state.players.find((p) => p.id === "a")!;
    const expectedHp = a.role === "sheriff" ? 3 + 1 : 3;
    expect(a.characterId).toBe("el_gringo");
    expect(a.maxHp).toBe(expectedHp);
    expect(a.hp).toBe(expectedHp);
    expect(a.hand.length).toBe(expectedHp); // số lá khởi đầu = máu tối đa

    const b = state.players.find((p) => p.id === "b")!;
    const expectedBHp = b.role === "sheriff" ? 4 + 1 : 4; // không gán nhân vật -> BASE_HP=4 như cũ
    expect(b.characterId).toBeNull();
    expect(b.maxHp).toBe(expectedBHp);
  });

  it("không gán ai cả thì mọi người vẫn 4 máu y hệt trước giờ", () => {
    const state = setupGame(["a", "b", "c", "d"], 42);
    for (const player of state.players) {
      expect(player.characterId).toBeNull();
      expect(player.maxHp).toBe(player.role === "sheriff" ? 5 : 4);
    }
  });

  it("gán nhân vật không tồn tại trong registry thì báo lỗi rõ ràng", () => {
    expect(() =>
      setupGame(["a", "b", "c", "d"], 1, { characterAssignments: { a: "nhan_vat_khong_ton_tai" } })
    ).toThrow(/Không tìm thấy nhân vật/);
  });
});

describe("Bart Cassidy — mất máu thì rút đúng số lá tương ứng", () => {
  it("mất 1 máu vì Bang! thì rút 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "bart_cassidy" }),
        makePlayer("c"),
      ],
      deck: ["beer_1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // chịu mất máu

    expect(next.players[1].hp).toBe(3);
    expect(next.players[1].hand).toEqual(["beer_1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("mất máu vì Thuốc nổ cũng rút bài (đúng luật 'kể cả Dynamite')", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "bart_cassidy", hp: 4, maxHp: 4, equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
      // Đỉnh deck (rút trước) = PHẦN TỬ CUỐI mảng: "missed_6" (spades,2 — khớp
      // Bích 2-9) nổ trước, rồi "beer_3"/"beer_2"/"beer_1" rút thêm cho Bart —
      // đủ đúng 4 lá, KHÔNG để deck cạn giữa chừng (cạn thì drawTopCard() tự
      // xáo lại chồng bỏ, làm bài rút được phụ thuộc RNG, khó viết test ổn định).
      deck: ["beer_1", "beer_2", "beer_3", "missed_6"],
      pending: [
        {
          kind: "NEED_DRAW_CHECK",
          player: "b",
          source: { card: "dynamite" },
          matchSuits: ["spades"],
          matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(1); // 4 - 3 (nổ tối đa 3)
    expect(next.players[1].hand).toEqual(["beer_3", "beer_2", "beer_1"]); // rút đúng 3 lá thưởng
  });
});

describe("El Gringo — mất máu vì lá bài người khác đánh thì cướp ngẫu nhiên tay họ", () => {
  it("mất 1 máu vì Bang!: cướp đúng 1 lá trong tay người đánh", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1", "beer_1"] }),
        // hp/maxHp 3 — đúng "bullets" thật của El Gringo (makePlayer() mặc
        // định 4, không tự áp theo characterId — chỉ setupGame() làm việc đó).
        makePlayer("b", { characterId: "el_gringo", hp: 3, maxHp: 3 }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(2); // El Gringo 3 máu - 1
    expect(next.players[1].hand).toEqual(["beer_1"]); // cướp được lá duy nhất còn lại của a
    expect(next.players[0].hand).toEqual([]); // a mất lá vào tay b
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "b", fromPlayerId: "a", cardId: "beer_1" });
  });

  it("mất máu vì Thuốc nổ (không có người gây): KHÔNG cướp gì cả", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["beer_1"] }),
        makePlayer("b", { characterId: "el_gringo", hp: 3, maxHp: 3, equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
      deck: ["missed_6"],
      pending: [
        {
          kind: "NEED_DRAW_CHECK",
          player: "b",
          source: { card: "dynamite" },
          matchSuits: ["spades"],
          matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[0].hand).toEqual(["beer_1"]); // tay a KHÔNG bị đụng tới
  });
});

describe("Paul Regret / Rose Doolan — hiệu ứng khoảng cách như trang bị ảo", () => {
  it("Paul Regret: người khác luôn nhìn xa hơn 1, như có sẵn Ngựa Mustang", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[1] = makePlayer("b", { characterId: "paul_regret" });

    expect(computeDistance(players, "a", "b")).toBe(2); // gốc 1, +1 Mustang ảo
  });

  it("Rose Doolan: mình luôn nhìn người khác gần hơn 1, như có sẵn Ống nhắm", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { characterId: "rose_doolan" });

    expect(computeDistance(players, "a", "c")).toBe(1); // gốc 2, -1 Ống nhắm ảo
  });

  it("cộng dồn được với Mustang/Ống nhắm THẬT", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[1] = makePlayer("b", { characterId: "paul_regret", equipment: ["mustang_1"] });

    expect(computeDistance(players, "a", "b")).toBe(3); // gốc 1, +1 Mustang thật, +1 Mustang ảo
  });
});

describe("Vulture Sam — người chết thì mất hết bài về tay Sam", () => {
  it("Sam nhận cả bài trên tay lẫn trang bị trên sân của người vừa chết", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: "vulture_sam" }),
        // KHÔNG dùng "beer" ở đây — Bia trên tay người sắp chết giờ kích hoạt
        // cơ chế "hồi sinh tự động" (xem eliminateIfDead() trong reduce.ts),
        // làm b sống sót thay vì chết như bài test này cần kiểm tra.
        makePlayer("b", { role: "renegade", hp: 1, hand: ["missed_1"], equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> chết

    expect(next.players[1].alive).toBe(false);
    expect(next.players[1].hand).toEqual([]);
    expect(next.players[1].equipment).toEqual([]);
    expect(next.players[0].hand).toEqual(expect.arrayContaining(["missed_1", "scope_1"]));
    expect(next.discardPile).toEqual(["bang_1"]); // KHÔNG có missed_1/scope_1 — về tay Sam, không vào chồng bỏ
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "missed_1" });
  });

  it("người chết đang cầm Dynamite chưa nổ: Sam thừa kế luôn, tự gắn vào trang bị Sam", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: "vulture_sam" }),
        makePlayer("b", { role: "renegade", hp: 1, hand: [], equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    // Dynamite không vào TAY thường (giveCardToPlayer tự chuyển vào equipment).
    expect(next.players[0].equipment).toEqual(["dynamite_1"]);
    expect(next.players[0].hand).toEqual([]);
  });
});

describe("Willy the Kid — bỏ giới hạn 1 Bang!/lượt dù không cầm Volcanic", () => {
  it("đánh Bang! lần 2 trong cùng lượt vẫn hợp lệ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_2"], characterId: "willy_the_kid" }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      bangUsedThisTurn: true, // đã đánh 1 lá Bang! trước đó trong lượt này
    });

    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "b" });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });

  it("người KHÔNG phải Willy vẫn bị chặn như thường", () => {
    const state = makeState({
      players: [makePlayer("a", { hand: ["bang_2"] }), makePlayer("b"), makePlayer("c")],
      bangUsedThisTurn: true,
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "b" })
    ).toThrow();
  });
});

describe("Jourdonnais — luôn có sẵn 1 Barrel ảo, cộng dồn được với Barrel thật", () => {
  it("không có Barrel thật: bị Bang! vẫn được draw! 1 lần, ra Cơ thì né miễn phí", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "jourdonnais" }),
        makePlayer("c"),
      ],
      deck: ["duel_1"], // hearts, Q — khớp
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
      { kind: "NEED_DRAW_CHECK", player: "b", source: { card: "barrel" }, matchSuits: ["hearts"] },
    ]);

    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]); // né xong, không còn gì chờ
    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(events).toContainEqual({ type: "BARREL_DODGED", playerId: "b" });
  });

  it("không ra Cơ thì vẫn phải đỡ Missed!/chịu mất máu như bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "jourdonnais" }),
        makePlayer("c"),
      ],
      deck: ["duel_2"], // spades, J — không khớp
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    // draw! không khớp -> bỏ luôn, còn lại đúng NEED_MISSED chờ Missed!/chịu máu.
    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);
  });

  it("có thêm Barrel thật: 2 nguồn cộng dồn (2 lượt draw! chờ sẵn), khớp Cơ ở BẤT KỲ lượt nào cũng né hết", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "jourdonnais", equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
      deck: ["duel_1"], // hearts, Q — khớp ngay ở lượt draw! ĐẦU TIÊN
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(played.state.pending.length).toBe(3); // NEED_MISSED + 2 NEED_DRAW_CHECK

    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    // Khớp ngay từ lượt đầu -> dọn sạch NEED_DRAW_CHECK còn lại LẪN NEED_MISSED,
    // không cần draw! thêm lần 2 (chỉ tốn đúng 1 lá từ deck).
    expect(next.pending).toEqual([]);
    expect(next.deck).toEqual([]);
    expect(events).toContainEqual({ type: "BARREL_DODGED", playerId: "b" });
  });
});

describe("Black Jack — lật ngửa lá thứ 2 lúc rút bài, đỏ thì rút thêm lá thứ 3", () => {
  it("lá thứ 2 ra ĐEN: chỉ rút đúng 2 lá như thường", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "black_jack" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["beer_2", "beer_1"], // rút thứ tự: beer_1 rồi beer_2 (clubs, đen)
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["beer_1", "beer_2"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "BLACK_JACK_REVEALED", playerId: "a", cardId: "beer_2" });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("lá thứ 2 ra ĐỎ: rút thêm lá thứ 3", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "black_jack" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      // rút thứ tự: beer_1 (thứ 1), duel_1 (thứ 2, hearts — đỏ), beer_3 (thứ 3)
      deck: ["beer_3", "duel_1", "beer_1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["beer_1", "duel_1", "beer_3"]);
    expect(events).toContainEqual({ type: "BLACK_JACK_REVEALED", playerId: "a", cardId: "duel_1" });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });

  it("người KHÔNG phải Black Jack vẫn rút đúng 2 lá như cũ, không có sự kiện lật ngửa", () => {
    const state = makeState({
      players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["beer_2", "beer_1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["beer_1", "beer_2"]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "BLACK_JACK_REVEALED" }));
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });
});

describe("Slab the Killer — Bang!/Gatling của mình cần 2 Missed! mới né được", () => {
  it("không có Barrel: phải bỏ ĐỦ 2 Missed! mới né hết, chưa đủ thì vẫn đang chờ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: "slab_the_killer" }),
        makePlayer("b", { hand: ["missed_1", "missed_2"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(played.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" }, missesNeeded: 2 },
    ]);

    const step1 = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(step1.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);
    expect(step1.state.players[1].hp).toBe(4); // chỉ mới bỏ 1/2, chưa mất máu

    const step2 = reduce(step1.state, { type: "RESPOND", playerId: "b", cardId: "missed_2" });
    expect(step2.state.pending).toEqual([]);
    expect(step2.state.players[1].hp).toBe(4); // đủ 2 lá -> né trọn vẹn
  });

  it("chỉ có 1 Missed!: bỏ được 1 lá xong vẫn phải chịu mất đúng 1 máu như bình thường khi hết bài", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: "slab_the_killer" }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const step1 = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(step1.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);

    const step2 = reduce(step1.state, { type: "RESPOND", playerId: "b" }); // hết Missed!, chịu máu
    expect(step2.state.pending).toEqual([]);
    expect(step2.state.players[1].hp).toBe(3); // mất đúng 1 máu, không phạt thêm vì thiếu
  });

  it("Barrel/Jourdonnais khớp Cơ chỉ tính là 1 trong 2 Missed! cần, KHÔNG tự né hết", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: "slab_the_killer" }),
        makePlayer("b", { equipment: ["barrel_1"], hand: ["missed_1"] }),
        makePlayer("c"),
      ],
      deck: ["duel_1"], // hearts, Q — khớp
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const drawResolved = reduce(played.state, { type: "RESPOND", playerId: "b" }); // draw! của Barrel

    expect(drawResolved.events).toContainEqual({ type: "BARREL_DODGED", playerId: "b" });
    expect(drawResolved.state.pending).toEqual([
      { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } },
    ]);
    expect(drawResolved.state.players[1].hp).toBe(4); // chưa mất máu, chỉ mới đủ 1/2

    const final = reduce(drawResolved.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });
    expect(final.state.pending).toEqual([]);
    expect(final.state.players[1].hp).toBe(4); // đủ 2 (1 Barrel + 1 Missed!) -> né trọn vẹn
  });

  it("áp dụng cả cho Gatling: mỗi mục tiêu đều cần 2 Missed!", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["gatling_1"], characterId: "slab_the_killer" }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c", { hand: ["missed_2"] }),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "gatling_1" });
    expect(played.state.pending.length).toBe(2);
    for (const pending of played.state.pending) {
      expect(pending).toMatchObject({ kind: "NEED_MISSED", missesNeeded: 2 });
    }
  });
});

describe("Suzy Lafayette — tay CHUYỂN từ còn bài sang hết bài (0 lá) thì rút bù ngay 1 lá", () => {
  it("đánh hết lá cuối cùng trên tay: rút bù ngay sau khi đánh", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "suzy_lafayette", hand: ["beer_1"], hp: 3, maxHp: 4 }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      deck: ["saloon_1"],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "beer_1" });

    expect(next.players[0].hand).toEqual(["saloon_1"]);
    expect(events).toContainEqual({ type: "HP_RESTORED", playerId: "a", amount: 1 });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("bỏ bài thừa cuối lượt xuống hết tay (bỏ nhiều hơn bắt buộc): rút bù ngay 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "suzy_lafayette", hand: ["beer_1", "beer_2"], hp: 2, maxHp: 4 }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      turnPhase: "discard",
      deck: ["saloon_1"],
    });

    const { state: next, events } = reduce(state, {
      type: "DISCARD_CARDS",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
    });

    expect(next.players[0].hand).toEqual(["saloon_1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("bị Panic! cướp lá cuối cùng: rút bù ngay 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["panic_1"] }),
        makePlayer("b", { characterId: "suzy_lafayette", hand: ["beer_1"] }),
        makePlayer("c"),
      ],
      deck: ["saloon_1"],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "panic_1",
      targetId: "b",
    });

    expect(next.players[1].hand).toEqual(["saloon_1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("bị Cat Balou bắt bỏ lá cuối cùng trên tay: rút bù ngay 1 lá", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["cat_balou_1"] }),
        makePlayer("b", { characterId: "suzy_lafayette", hand: ["beer_1"] }),
        makePlayer("c"),
      ],
      deck: ["saloon_1"],
    });

    const played = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "cat_balou_1",
      targetId: "b",
      targetZone: "hand",
    });
    const { state: next, events } = reduce(played.state, {
      type: "RESPOND",
      playerId: "b",
      cardId: "beer_1",
    });

    expect(next.players[1].hand).toEqual(["saloon_1"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("đánh Cỗ xe ngựa (Stagecoach) là lá cuối cùng: rút bù xảy ra TRƯỚC, đúng thứ tự thời gian thật trong nhật ký", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "suzy_lafayette", hand: ["stagecoach_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
      deck: ["saloon_3", "saloon_2", "saloon_1"],
    });

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "stagecoach_1" });

    // Rút bù (Suzy) xảy ra TRƯỚC lúc rời tay, Stagecoach tự rút 2 lá RIÊNG của
    // nó xảy ra SAU — đúng thứ tự thời gian thật, không phải thứ tự viết code.
    expect(events).toEqual([
      { type: "CARDS_DRAWN", playerId: "a", count: 1 },
      { type: "CARD_PLAYED", playerId: "a", cardId: "stagecoach_1" },
      { type: "CARDS_DRAWN", playerId: "a", count: 2 },
    ]);
    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2", "saloon_3"]);
  });

  it("El Gringo cướp đúng lá cuối cùng của Suzy: Suzy vẫn được rút bù (2 hook nối tiếp nhau)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "el_gringo", hp: 3, maxHp: 3 }),
        makePlayer("b", { characterId: "suzy_lafayette", hand: ["bang_1", "beer_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
      deck: ["saloon_1"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "bang_1", targetId: "a" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "a" }); // không đỡ -> mất máu

    expect(next.players[1].hand).toEqual(["saloon_1"]); // Suzy (b) hết bài sau khi bị cướp -> rút bù
    expect(next.players[0].hand).toEqual(["beer_1"]); // El Gringo cướp được
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "beer_1" });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });
});

describe("Pedro Ramirez — đầu lượt được HỎI thật: lấy lá trên cùng chồng bỏ hay rút bộ bài", () => {
  it("chồng bỏ còn bài: đầu lượt bị hỏi, chọn lấy lá trên cùng chồng bỏ", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pedro_ramirez" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      discardPile: ["beer_5"],
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(drawn.state.pending).toEqual([{ kind: "NEED_PICK_DRAW_SOURCE", player: "a" }]);
    expect(drawn.state.turnPhase).toBe("draw"); // chưa rút gì cả, còn đang chờ chọn

    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a", cardId: "beer_5" });

    expect(next.players[0].hand).toEqual(["beer_5", "saloon_1"]);
    expect(next.discardPile).toEqual([]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("chọn rút bộ bài như bình thường (không kèm cardId): chồng bỏ không bị đụng tới", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pedro_ramirez" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      discardPile: ["beer_5"],
      deck: ["saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next } = reduce(drawn.state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2"]);
    expect(next.discardPile).toEqual(["beer_5"]); // KHÔNG đụng chồng bỏ
    expect(next.turnPhase).toBe("play");
  });

  it("chồng bỏ rỗng: khỏi hỏi, rút thẳng bộ bài như bình thường", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pedro_ramirez" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      discardPile: [],
      deck: ["saloon_2", "saloon_1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([]);
    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("gửi sai lá (không phải lá trên cùng chồng bỏ) thì báo lỗi", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "pedro_ramirez" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      discardPile: ["beer_5", "beer_6"], // trên cùng là beer_6
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(() => reduce(drawn.state, { type: "RESPOND", playerId: "a", cardId: "beer_5" })).toThrow(/lá trên cùng/);
  });
});

describe("Lucky Duke — mọi lần draw! đều lật thêm 1 lá, chọn kết quả có lợi theo ngữ cảnh", () => {
  it("Barrel: chỉ cần 1 trong 2 lá khớp Cơ là né (ưu tiên khớp)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "lucky_duke", equipment: ["barrel_1"] }),
        makePlayer("c"),
      ],
      // rút thứ tự: duel_2 (spades,J — không khớp) rồi duel_1 (hearts,Q — khớp)
      deck: ["duel_1", "duel_2"],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([]); // né hết, không mất máu
    expect(next.players[1].hp).toBe(4);
    expect(events).toContainEqual({ type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "duel_1", matched: true });
    expect(events).toContainEqual({ type: "LUCKY_DUKE_EXTRA_DRAW", playerId: "b", cardId: "duel_2" });
    expect(events).toContainEqual({ type: "BARREL_DODGED", playerId: "b" });
    expect(next.discardPile).toEqual(expect.arrayContaining(["duel_1", "duel_2"]));
  });

  it("Dynamite: ưu tiên KHÔNG khớp (không nổ) — chỉ cần 1 trong 2 lá an toàn", () => {
    const state = makeState({
      players: [
        makePlayer("a"),
        makePlayer("b", { characterId: "lucky_duke", equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
      // rút thứ tự: missed_6 (spades,2 — sẽ nổ nếu dùng riêng) rồi beer_1 (clubs,6 — an toàn)
      deck: ["beer_1", "missed_6"],
      pending: [
        {
          kind: "NEED_DRAW_CHECK",
          player: "b",
          source: { card: "dynamite" },
          matchSuits: ["spades"],
          matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
        },
      ],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(4); // không nổ nhờ Lucky Duke có 1 lá an toàn
    expect(events).toContainEqual({ type: "DRAW_CHECK_RESOLVED", playerId: "b", cardId: "beer_1", matched: false });
    expect(events).toContainEqual({ type: "LUCKY_DUKE_EXTRA_DRAW", playerId: "b", cardId: "missed_6" });
    expect(events).toContainEqual({ type: "DYNAMITE_PASSED", playerId: "b" });
    expect(next.players[2].equipment).toContain("dynamite_1"); // chuyển sang người kế tiếp
    expect(next.players[1].equipment).not.toContain("dynamite_1");
  });
});

describe("Jesse Jones — đầu lượt được HỎI: lá 1 từ bộ bài hay từ tay 1 người khác", () => {
  it("không chọn ai: rút bộ bài như bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jesse_jones" }),
        makePlayer("b", { hand: ["bang_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      deck: ["saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(drawn.state.pending).toEqual([{ kind: "NEED_PICK_DRAW_TARGET", player: "a" }]);
    expect(drawn.state.turnPhase).toBe("draw");

    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2"]);
    expect(next.players[1].hand).toEqual(["bang_1"]); // b không bị đụng
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("chọn 1 người có bài, KHÔNG cho tự chọn: cướp ngẫu nhiên NGAY", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jesse_jones" }),
        makePlayer("b", { hand: ["bang_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.players[0].hand).toEqual(["bang_1", "saloon_1"]);
    expect(next.players[1].hand).toEqual([]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "bang_1" });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("chọn 1 người, CHO tự chọn lá đưa: đẩy tiếp NEED_GIVE_CARD_TO_PLAYER cho nạn nhân", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jesse_jones" }),
        makePlayer("b", { hand: ["bang_1", "beer_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const asked = reduce(drawn.state, {
      type: "RESPOND",
      playerId: "a",
      targetId: "b",
      letTargetChoose: true,
    });

    expect(asked.state.pending).toEqual([{ kind: "NEED_GIVE_CARD_TO_PLAYER", player: "b", giveTo: "a" }]);
    expect(asked.state.turnPhase).toBe("draw"); // vẫn chưa xong lượt rút

    const { state: next, events } = reduce(asked.state, { type: "RESPOND", playerId: "b", cardId: "beer_1" });

    expect(next.players[1].hand).toEqual(["bang_1"]); // b tự chọn đưa beer_1, giữ lại bang_1
    expect(next.players[0].hand).toEqual(["beer_1", "saloon_1"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "beer_1" });
  });

  it("nạn nhân không chọn (hết giờ): rút ngẫu nhiên thay họ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jesse_jones" }),
        makePlayer("b", { hand: ["bang_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const asked = reduce(drawn.state, {
      type: "RESPOND",
      playerId: "a",
      targetId: "b",
      letTargetChoose: true,
    });
    const { state: next, events } = reduce(asked.state, { type: "RESPOND", playerId: "b" }); // không chọn gì

    expect(next.players[1].hand).toEqual([]);
    expect(next.players[0].hand).toEqual(["bang_1", "saloon_1"]);
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "bang_1" });
  });

  it("nạn nhân là Sid Ketchum, tự dùng kỹ năng bỏ sạch tay TRƯỚC KHI trả lời: không lọt lá undefined vào tay Jesse", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jesse_jones" }),
        makePlayer("b", { characterId: "sid_ketchum", hand: ["bang_1", "missed_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const asked = reduce(drawn.state, {
      type: "RESPOND",
      playerId: "a",
      targetId: "b",
      letTargetChoose: true,
    });
    expect(asked.state.pending).toEqual([{ kind: "NEED_GIVE_CARD_TO_PLAYER", player: "b", giveTo: "a" }]);

    // b (Sid Ketchum) tự dùng kỹ năng NGAY LÚC ĐANG BỊ CHỜ trả lời — hợp lệ vì
    // USE_ABILITY cố tình không kiểm tra pending. Tay b về rỗng trước khi kịp
    // trả lời NEED_GIVE_CARD_TO_PLAYER.
    const healed = reduce(asked.state, { type: "USE_ABILITY", playerId: "b", cardIds: ["bang_1", "missed_1"] });
    expect(healed.state.players[1].hand).toEqual([]);
    expect(healed.state.pending).toEqual([{ kind: "NEED_GIVE_CARD_TO_PLAYER", player: "b", giveTo: "a" }]);

    // Giờ mới xử lý RESPOND (hết giờ/không chọn gì) — tay b đã rỗng từ trước.
    const { state: next, events } = reduce(healed.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[0].hand).toEqual(["saloon_1"]); // chỉ có lá 2 (từ bộ bài), KHÔNG có undefined
    expect(next.players[1].hand).toEqual([]);
    expect(next.turnPhase).toBe("play");
    expect(events).not.toContainEqual(expect.objectContaining({ type: "CARD_STOLEN" }));
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("mục tiêu tay rỗng: coi như rút bộ bài cho lá 1, không cướp gì cả", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "jesse_jones" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2"]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "CARD_STOLEN" }));
  });

  it("báo lỗi nếu tự chọn chính mình", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "jesse_jones" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(() => reduce(drawn.state, { type: "RESPOND", playerId: "a", targetId: "a" })).toThrow();
  });

  it("cướp đúng lá cuối cùng của Suzy Lafayette: Suzy vẫn được rút bù ngay", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "jesse_jones" }),
        makePlayer("b", { characterId: "suzy_lafayette", hand: ["bang_1"] }),
        makePlayer("c"),
      ],
      turnPhase: "draw",
      // rút thứ tự: saloon_1 (Suzy rút bù) rồi saloon_2 (lá 2 của Jesse)
      deck: ["saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.players[1].hand).toEqual(["saloon_1"]); // Suzy hết bài -> rút bù
    expect(next.players[0].hand).toEqual(["bang_1", "saloon_2"]);
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "bang_1" });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });
});

describe("Kit Carlson — xem riêng 3 lá trên cùng bộ bài, chọn giữ 2 bỏ 1", () => {
  it("chọn 1 trong 3 lá để bỏ: 2 lá còn lại vào tay, đúng lá đã chọn vào chồng bỏ", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      // rút thứ tự: saloon_1, saloon_2, saloon_3
      deck: ["saloon_3", "saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(drawn.state.pending).toEqual([
      { kind: "NEED_PICK_KEPT_CARDS", player: "a", cards: ["saloon_1", "saloon_2", "saloon_3"] },
    ]);
    expect(drawn.state.turnPhase).toBe("draw"); // chưa xong lượt rút
    expect(drawn.state.players[0].hand).toEqual([]); // chưa vào tay ai cả

    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a", cardId: "saloon_2" });

    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_3"]);
    expect(next.discardPile).toEqual(["saloon_2"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
    expect(events).toContainEqual({ type: "KIT_CARLSON_DISCARDED", playerId: "a", cardId: "saloon_2" });
  });

  it("không chọn (mặc định/timeout): giữ 2 lá ĐẦU, bỏ lá thứ 3", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["saloon_3", "saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    const { state: next, events } = reduce(drawn.state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2"]);
    expect(next.discardPile).toEqual(["saloon_3"]);
    expect(events).toContainEqual({ type: "KIT_CARLSON_DISCARDED", playerId: "a", cardId: "saloon_3" });
  });

  it("gửi lá không nằm trong 3 lá vừa xem thì báo lỗi", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["saloon_3", "saloon_2", "saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(() =>
      reduce(drawn.state, { type: "RESPOND", playerId: "a", cardId: "khong_ton_tai" })
    ).toThrow(/không nằm trong 3 lá/);
  });

  it("bộ bài + chồng bỏ không đủ 3 lá: giữ hết những gì rút được, khỏi hỏi", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["saloon_2", "saloon_1"], // chỉ có 2 lá, chồng bỏ cũng rỗng
      discardPile: [],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([]);
    expect(next.players[0].hand).toEqual(["saloon_1", "saloon_2"]);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("bộ bài cạn giữa chừng lúc xem: tự xào lại chồng bỏ để đủ 3 lá", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "kit_carlson" }), makePlayer("b"), makePlayer("c")],
      turnPhase: "draw",
      deck: ["saloon_1"], // chỉ đủ 1 lá, phần còn lại phải xào từ chồng bỏ
      discardPile: ["beer_2", "beer_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(drawn.state.pending.length).toBe(1);
    const pending = drawn.state.pending[0] as { kind: "NEED_PICK_KEPT_CARDS"; cards: string[] };
    expect(pending.kind).toBe("NEED_PICK_KEPT_CARDS");
    expect([...pending.cards].sort()).toEqual(["beer_1", "beer_2", "saloon_1"].sort());
    // Dùng hết sạch bộ bài + chồng bỏ để có đủ 3 lá xem — chưa bỏ lá nào (chưa RESPOND).
    expect(drawn.state.deck).toEqual([]);
    expect(drawn.state.discardPile).toEqual([]);
  });
});

describe("Calamity Janet — Bang! và Missed! hoán đổi cho nhau", () => {
  it("đánh CHỦ ĐỘNG 1 lá tên 'missed' như Bang!", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["missed_1"], characterId: "calamity_janet" }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "missed_1",
      targetId: "b",
    });

    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(next.bangUsedThisTurn).toBe(true);
    expect(events).toContainEqual({ type: "CARD_PLAYED", playerId: "a", cardId: "missed_1", targetId: "b" });
  });

  it("người KHÔNG phải Janet vẫn không được chủ động đánh Missed!", () => {
    const state = makeState({
      players: [makePlayer("a", { hand: ["missed_1"] }), makePlayer("b"), makePlayer("c")],
    });

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "missed_1", targetId: "b" })
    ).toThrow();
  });

  it("dùng Missed! làm Bang! vẫn tính là đã dùng 1 Bang!/lượt — đánh thêm lần 2 bị chặn", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["missed_1", "bang_2"], characterId: "calamity_janet" }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "missed_1", targetId: "b" });
    const responded = reduce(played.state, { type: "RESPOND", playerId: "b" }); // chịu mất máu, hết pending
    expect(responded.state.pending).toEqual([]);

    expect(() =>
      reduce(responded.state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_2", targetId: "b" })
    ).toThrow();
  });

  it("dùng lá Bang! của mình để đỡ Bang!/Gatling (như Missed!)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { hand: ["bang_2"], characterId: "calamity_janet" }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "bang_2" });

    expect(next.players[1].hp).toBe(4); // né được, không mất máu
    expect(next.players[1].hand).toEqual([]);
    expect(events).toContainEqual({ type: "MISSED_PLAYED", playerId: "b" });
  });

  it("trong Duel: dùng lá Missed! của mình thay Bang! để đỡ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["duel_1"] }),
        makePlayer("b", { hand: ["missed_1"], characterId: "calamity_janet" }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "duel_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });

    expect(next.pending).toEqual([
      { kind: "NEED_DUEL_RESPONSE", player: "a", opponent: "b", source: { card: "duel", from: "a" } },
    ]);
    expect(events).toContainEqual({ type: "BANG_DISCARDED", playerId: "b" });
  });

  it("Indians!: dùng lá Missed! của mình thay Bang! để bỏ", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["indians_1"] }),
        makePlayer("b", { hand: ["missed_1"], characterId: "calamity_janet" }),
        makePlayer("c", { hand: [] }),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "indians_1" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" });

    expect(next.players[1].hand).toEqual([]);
    expect(next.players[1].hp).toBe(4); // không mất máu
    expect(events).toContainEqual({ type: "BANG_DISCARDED", playerId: "b" });
  });

  it("người KHÔNG phải Janet không được dùng Missed! đỡ Duel", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["duel_1"] }),
        makePlayer("b", { hand: ["missed_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "duel_1", targetId: "b" });
    expect(() => reduce(played.state, { type: "RESPOND", playerId: "b", cardId: "missed_1" })).toThrow();
  });
});

describe("Sid Ketchum — bỏ 2 lá tuỳ ý để hồi 1 máu, dùng được BẤT CỨ LÚC NÀO", () => {
  it("dùng trong lượt của chính mình: bỏ đúng 2 lá, hồi 1 máu", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "sid_ketchum", hand: ["beer_1", "beer_2"], hp: 2, maxHp: 4 }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
    });

    expect(next.players[0].hp).toBe(3);
    expect(next.players[0].hand).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(["beer_1", "beer_2"]));
    expect(events).toContainEqual({
      type: "SID_KETCHUM_HEALED",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
      amount: 1,
    });
  });

  it("dùng được KHÔNG PHẢI lượt của mình, kể cả đang có pending của người khác — không đụng gì tới pending/lượt đó", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c", { characterId: "sid_ketchum", hand: ["beer_1", "beer_2"], hp: 2, maxHp: 4 }),
      ],
      currentPlayerIndex: 0,
      pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
    });

    const { state: next } = reduce(state, { type: "USE_ABILITY", playerId: "c", cardIds: ["beer_1", "beer_2"] });

    expect(next.players[2].hp).toBe(3);
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(next.currentPlayerIndex).toBe(0);
  });

  it("đã đầy máu vẫn dùng được, chỉ là không hồi thêm (amount = 0)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "sid_ketchum", hand: ["beer_1", "beer_2"], hp: 4, maxHp: 4 }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
    });

    expect(next.players[0].hp).toBe(4);
    expect(events).toContainEqual({
      type: "SID_KETCHUM_HEALED",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
      amount: 0,
    });
  });

  it("báo lỗi nếu gửi 2 lá GIỐNG NHAU", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "sid_ketchum", hand: ["beer_1", "beer_2"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1", "beer_1"] })
    ).toThrow();
  });

  it("báo lỗi nếu 1 trong 2 lá không nằm trong tay", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "sid_ketchum", hand: ["beer_1"] }),
        makePlayer("b"),
        makePlayer("c"),
      ],
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1", "khong_ton_tai"] })
    ).toThrow();
  });

  it("người KHÔNG phải Sid Ketchum thì không dùng được kỹ năng này", () => {
    const state = makeState({
      players: [makePlayer("a", { hand: ["beer_1", "beer_2"] }), makePlayer("b"), makePlayer("c")],
    });

    expect(() =>
      reduce(state, { type: "USE_ABILITY", playerId: "a", cardIds: ["beer_1", "beer_2"] })
    ).toThrow();
  });
});
