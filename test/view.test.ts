import { describe, expect, it } from "vitest";
import { viewFor } from "../src/core/view";
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
    deck: ["c1", "c2", "c3"],
    discardPile: ["d1"],
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

describe("viewFor — bài trên tay", () => {
  it("người xem thấy ĐÚNG bài trên tay của chính mình", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1", "missed_1"] }),
      makePlayer("b", { hand: ["beer_1"] }),
    ]);

    const view = viewFor(state, "a");

    expect(view.players[0].hand).toEqual(["bang_1", "missed_1"]);
    expect(view.players[0].handCount).toBe(2);
  });

  it("người xem KHÔNG thấy nội dung bài của người khác, chỉ thấy số lượng", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1", "missed_1"] }),
      makePlayer("b", { hand: ["beer_1"] }),
    ]);

    const view = viewFor(state, "a");

    expect(view.players[1].hand).toBeNull();
    expect(view.players[1].handCount).toBe(1);
  });
});

describe("viewFor — vai (role)", () => {
  it("luôn thấy vai của CHÍNH MÌNH, kể cả không phải sheriff", () => {
    const state = makeState([
      makePlayer("a", { role: "renegade" }),
      makePlayer("b", { role: "outlaw" }),
    ]);

    expect(viewFor(state, "a").players[0].role).toBe("renegade");
  });

  it("Cảnh sát trưởng luôn công khai với MỌI người xem", () => {
    const state = makeState([
      makePlayer("a", { role: "sheriff" }),
      makePlayer("b", { role: "outlaw" }),
    ]);

    expect(viewFor(state, "b").players[0].role).toBe("sheriff");
  });

  it("vai của người khác (không phải sheriff, còn sống) bị ẩn", () => {
    const state = makeState([
      makePlayer("a", { role: "outlaw" }),
      makePlayer("b", { role: "renegade" }),
    ]);

    expect(viewFor(state, "a").players[1].role).toBeNull();
  });

  it("vai của người ĐÃ CHẾT được lật công khai cho mọi người, kể cả không phải sheriff", () => {
    const state = makeState([
      makePlayer("a", { role: "outlaw" }),
      makePlayer("b", { role: "renegade", alive: false, characterId: null }),
    ]);

    expect(viewFor(state, "a").players[1].role).toBe("renegade");
  });
});

describe("viewFor — bộ bài rút (deck)", () => {
  it("chỉ lộ số lượng, không có nội dung/thứ tự bài", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")]);
    const view = viewFor(state, "a");

    expect(view.deckCount).toBe(3);
    expect(view).not.toHaveProperty("deck");
  });
});

describe("viewFor — thông tin luôn công khai", () => {
  it("máu, trang bị, còn sống/chết, chồng bỏ, pending, lượt, kết quả ván đều giữ nguyên", () => {
    const state = makeState(
      [
        makePlayer("a", { hp: 3, maxHp: 4, equipment: ["barrel_1", "jail_1"], alive: true, characterId: null }),
        makePlayer("b", { hp: 0, maxHp: 4, alive: false, characterId: null }),
      ],
      {
        discardPile: ["bang_5", "missed_2"],
        pending: [{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }],
        currentPlayerIndex: 1,
        turnPhase: "discard",
        winner: { kind: "faction", faction: "outlaw" },
      }
    );

    const view = viewFor(state, "a");

    expect(view.players[0].hp).toBe(3);
    expect(view.players[0].maxHp).toBe(4);
    expect(view.players[0].equipment).toEqual(["barrel_1", "jail_1"]);
    expect(view.players[1].alive).toBe(false);
    expect(view.discardPile).toEqual(["bang_5", "missed_2"]);
    expect(view.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
    expect(view.currentPlayerIndex).toBe(1);
    expect(view.turnPhase).toBe("discard");
    expect(view.winner).toEqual({ kind: "faction", faction: "outlaw" });
  });

  it("characterId công khai với MỌI người xem, kể cả không phải chính mình (Đợt 5 UI/UX)", () => {
    const state = makeState([
      makePlayer("a", { characterId: "bart_cassidy" }),
      makePlayer("b", { characterId: null }),
    ]);

    const view = viewFor(state, "b");

    expect(view.players[0].characterId).toBe("bart_cassidy");
    expect(view.players[1].characterId).toBeNull();
  });

  it("gắn đúng viewerId vào kết quả", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")]);
    expect(viewFor(state, "b").viewerId).toBe("b");
  });
});

describe("viewFor — NEED_PICK_KEPT_CARDS (Kit Carlson, Giai đoạn 5 đợt 6) — pending DUY NHẤT chứa thông tin ẩn", () => {
  it("chính chủ (Kit Carlson) thấy đúng 3 lá thật", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")], {
      pending: [{ kind: "NEED_PICK_KEPT_CARDS", player: "a", cards: ["c1", "c2", "c3"] }],
    });

    const view = viewFor(state, "a");

    expect(view.pending).toEqual([{ kind: "NEED_PICK_KEPT_CARDS", player: "a", cards: ["c1", "c2", "c3"] }]);
  });

  it("người khác KHÔNG thấy nội dung 3 lá — cards bị thay bằng null", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")], {
      pending: [{ kind: "NEED_PICK_KEPT_CARDS", player: "a", cards: ["c1", "c2", "c3"] }],
    });

    const view = viewFor(state, "b");

    expect(view.pending).toEqual([{ kind: "NEED_PICK_KEPT_CARDS", player: "a", cards: null }]);
  });
});

describe("viewFor — characterSelection (cơ chế phát 2 lá nhân vật, chọn giữ 1)", () => {
  it("null khi ván không ở giai đoạn chọn nhân vật (đúng bản v1 hiện tại)", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")]);
    expect(viewFor(state, "a").characterSelection).toBeNull();
  });

  it("chính chủ thấy đúng 2 lá của mình", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")], {
      characterSelection: [
        { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
        { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
      ],
    });

    const view = viewFor(state, "a");

    expect(view.characterSelection).toEqual([
      { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: null },
      { playerId: "b", options: null, chosen: null },
    ]);
  });

  it("chosen LUÔN công khai (kể cả với người khác), chỉ options bị ẩn", () => {
    const state = makeState([makePlayer("a"), makePlayer("b")], {
      characterSelection: [
        { playerId: "a", options: ["el_gringo", "bart_cassidy"], chosen: "el_gringo" },
        { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
      ],
    });

    const view = viewFor(state, "b");

    expect(view.characterSelection).toEqual([
      { playerId: "a", options: null, chosen: "el_gringo" },
      { playerId: "b", options: ["willy_the_kid", "rose_doolan"], chosen: null },
    ]);
  });
});
