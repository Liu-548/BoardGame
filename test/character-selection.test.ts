// Giai đoạn 5 — cơ chế "phát 2 lá nhân vật, chọn giữ 1" (xem CharacterChoice ở
// types.ts + CHOOSE_CHARACTER/FINALIZE_CHARACTER_SELECTION ở reduce.ts). Test
// ở ĐÂY dùng THẲNG state.characterSelection tự dựng (không qua setupGame()) để
// kiểm đúng luồng reduce() — test riêng cho việc setupGame() PHÁT bài nhân vật
// thật (ngẫu nhiên, không trùng) nằm ở test/setup.test.ts.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { CharacterChoice, GameState, PlayerState } from "../src/core/types";

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: id,
    role: "outlaw",
    hp: 0,
    maxHp: 0,
    hand: [],
    equipment: [],
    alive: true,
    characterId: null,
    ...overrides,
  };
}

// deck đủ lớn, toàn lá Beer (không phải Dynamite/súng) để việc chia bài sau
// khi chọn xong không đụng nhánh đặc biệt nào, dễ đếm số lá.
function fillerDeck(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `beer_${i + 1}`);
}

function makeState(characterSelection: CharacterChoice[], overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      makePlayer("a", { role: "sheriff" }),
      makePlayer("b", { role: "outlaw" }),
    ],
    deck: fillerDeck(20),
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "draw",
    rngState: 1,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection,
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    turnNumber: 0,
    equipmentPlayedTurn: {},
    joseDelgadoUsesThisTurn: 0,
    docHolydayUsedThisTurn: false,
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    ...overrides,
  };
}

describe("reduce — CHOOSE_CHARACTER", () => {
  it("người đầu chọn xong: cập nhật characterId + chosen, ván CHƯA bắt đầu (còn người khác chưa chọn)", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);

    const { state: next, events } = reduce(state, { type: "CHOOSE_CHARACTER", playerId: "a", characterId: "el_gringo" });

    expect(next.players[0].characterId).toBe("el_gringo");
    expect(next.characterSelection).toEqual([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: "el_gringo" },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    // Chưa xong hết — hp/hand vẫn tạm 0/rỗng, ván chưa mở khoá.
    expect(next.players[0].hp).toBe(0);
    expect(next.players[0].hand).toEqual([]);
    expect(events).toEqual([{ type: "CHARACTER_CHOSEN", playerId: "a", characterId: "el_gringo" }]);
  });

  it("không sửa state gốc", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { type: "CHOOSE_CHARACTER", playerId: "a", characterId: "el_gringo" });
    expect(state).toEqual(snapshot);
  });

  it("người CUỐI chọn xong: tự tính máu (El Gringo 3 máu + Sheriff +1 = 4), chia đúng số lá tay, mở khoá ván", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: "el_gringo" },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    // Sheriff (a) đã chọn El Gringo (bullets 3) từ trước, chưa finalize vì b chưa chọn.
    state.players[0].characterId = "el_gringo";

    const { state: next, events } = reduce(state, { type: "CHOOSE_CHARACTER", playerId: "b", characterId: "rose_doolan" });

    expect(next.characterSelection).toBeNull();
    expect(next.players[0].characterId).toBe("el_gringo");
    expect(next.players[0].hp).toBe(4); // 3 (bullets El Gringo) + 1 (Sheriff)
    expect(next.players[0].maxHp).toBe(4);
    expect(next.players[0].hand.length).toBe(4);
    expect(next.players[1].characterId).toBe("rose_doolan");
    expect(next.players[1].hp).toBe(4); // Rose Doolan bullets 4, không phải Sheriff nên không +1
    expect(next.players[1].hand.length).toBe(4);
    expect(next.turnPhase).toBe("draw");
    expect(next.pending).toEqual([]); // không ai được chia Dynamite (deck toàn Beer)

    expect(events).toEqual([{ type: "CHARACTER_CHOSEN", playerId: "b", characterId: "rose_doolan" }]);
  });

  it("báo lỗi khi chọn nhân vật KHÔNG nằm trong 2 lá được phát cho người đó", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    expect(() =>
      reduce(state, { type: "CHOOSE_CHARACTER", playerId: "a", characterId: "sid_ketchum" })
    ).toThrow();
  });

  it("báo lỗi khi chọn 2 lần", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: "el_gringo" },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    state.players[0].characterId = "el_gringo";
    expect(() =>
      reduce(state, { type: "CHOOSE_CHARACTER", playerId: "a", characterId: "bart_cassidy" })
    ).toThrow();
  });

  it("báo lỗi khi người chơi không có trong danh sách chọn nhân vật", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    expect(() =>
      reduce(state, { type: "CHOOSE_CHARACTER", playerId: "c", characterId: "el_gringo" })
    ).toThrow();
  });

  it("báo lỗi khi gọi CHOOSE_CHARACTER lúc ván KHÔNG ở giai đoạn chọn nhân vật", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ], { characterSelection: null });
    expect(() =>
      reduce(state, { type: "CHOOSE_CHARACTER", playerId: "a", characterId: "el_gringo" })
    ).toThrow();
  });

  it("chặn MỌI action khác trong lúc đang chờ chọn nhân vật", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    expect(() => reduce(state, { type: "DRAW_CARDS", playerId: "a" })).toThrow();
    expect(() => reduce(state, { type: "END_TURN", playerId: "a" })).toThrow();
  });
});

describe("reduce — FINALIZE_CHARACTER_SELECTION (hết giờ tổng)", () => {
  it("chốt NGẪU NHIÊN 1 trong 2 lá cho người CHƯA chọn, giữ nguyên người ĐÃ chọn", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: "bart_cassidy" },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
    state.players[0].characterId = "bart_cassidy";

    const { state: next, events } = reduce(state, { type: "FINALIZE_CHARACTER_SELECTION" });

    expect(next.characterSelection).toBeNull();
    expect(next.players[0].characterId).toBe("bart_cassidy"); // đã tự chọn, giữ nguyên
    expect(["willy_the_kid", "rose_doolan"]).toContain(next.players[1].characterId); // chưa chọn -> ngẫu nhiên 1 trong 2
    expect(next.players[1].hp).toBe(4); // cả 2 lựa chọn đều 4 máu (không phải Sheriff)
    expect(events).toEqual([{ type: "CHARACTER_CHOSEN", playerId: "b", characterId: next.players[1].characterId }]);
  });

  it("không đổi rngState khi mọi người đã tự chọn hết (không cần rút ngẫu nhiên gì)", () => {
    const state = makeState([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: "bart_cassidy" },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: "rose_doolan" },
    ], { rngState: 12345 });
    state.players[0].characterId = "bart_cassidy";
    state.players[1].characterId = "rose_doolan";

    const { state: next } = reduce(state, { type: "FINALIZE_CHARACTER_SELECTION" });

    expect(next.rngState).toBe(12345);
    expect(next.players[0].characterId).toBe("bart_cassidy");
    expect(next.players[1].characterId).toBe("rose_doolan");
  });

  it("báo lỗi khi gọi lúc ván không ở giai đoạn chọn nhân vật", () => {
    const state = makeState([], { characterSelection: null });
    expect(() => reduce(state, { type: "FINALIZE_CHARACTER_SELECTION" })).toThrow();
  });
});
