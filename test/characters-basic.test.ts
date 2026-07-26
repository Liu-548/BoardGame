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
        makePlayer("b", { role: "renegade", hp: 1, hand: ["beer_1"], equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> chết

    expect(next.players[1].alive).toBe(false);
    expect(next.players[1].hand).toEqual([]);
    expect(next.players[1].equipment).toEqual([]);
    expect(next.players[0].hand).toEqual(expect.arrayContaining(["beer_1", "scope_1"]));
    expect(next.discardPile).toEqual(["bang_1"]); // KHÔNG có beer_1/scope_1 — về tay Sam, không vào chồng bỏ
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "beer_1" });
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
