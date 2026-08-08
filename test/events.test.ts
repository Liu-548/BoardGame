// Mở rộng High Noon/A Fistful of Cards — mục 1 (nền tảng chồng sự kiện):
// core/events.ts (EventId/EVENT_CARDS/EXPANSION_EVENT_IDS/isEventActive),
// setup.ts (tráo chồng sự kiện), reduce.ts's applyTurnStartChecks() (lật lá
// đúng thời điểm/thứ tự), view.ts (chỉ lộ lá đang chạy + lá kế tiếp). CHƯA có
// lá sự kiện nào có hiệu ứng thật — xem TaskList/LO-TRINH.md cho từng lá.
import { describe, expect, it } from "vitest";
import { EVENT_CARDS, isEventActive } from "../src/core/events";
import { applyTurnStartChecks, reduce } from "../src/core/reduce";
import { setupGame } from "../src/core/setup";
import type { GameState, PlayerState } from "../src/core/types";
import { viewFor } from "../src/core/view";

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

describe("setupGame() — tráo chồng sự kiện (mục 1.6)", () => {
  it("chỉ bật High Noon: đủ 13 lá (12 thường + 1 lá cuối), lá cuối luôn ở eventDeck[0]", () => {
    const state = setupGame(["a", "b", "c", "d"], 42, { expansions: ["high_noon"] });
    expect(state.eventDeck.length).toBe(13);
    expect(state.eventDeck[0]).toBe("high_noon");
    expect(state.activeEventId).toBeNull();
    expect(state.eventDiscard).toEqual([]);
    // Không lẫn lá của Fistful of Cards.
    expect(state.eventDeck).not.toContain("a_fistful_of_cards");
  });

  it("chỉ bật A Fistful of Cards: đủ 14 lá (13 thường, Abandoned Mine bị loại + 1 lá cuối)", () => {
    const state = setupGame(["a", "b", "c", "d"], 42, { expansions: ["a_fistful_of_cards"] });
    expect(state.eventDeck.length).toBe(14);
    expect(state.eventDeck[0]).toBe("a_fistful_of_cards");
    expect(state.eventDeck).not.toContain("abandoned_mine");
  });

  it("bật CẢ HAI bộ: cắt còn eventDeckSize (mặc định 12) lá thường + ĐÚNG 1 trong 2 lá cuối", () => {
    const state = setupGame(["a", "b", "c", "d"], 42, {
      expansions: ["high_noon", "a_fistful_of_cards"],
    });
    expect(state.eventDeck.length).toBe(13); // 12 + 1 lá cuối
    const finalCards = state.eventDeck.filter(
      (id) => id === "high_noon" || id === "a_fistful_of_cards"
    );
    expect(finalCards.length).toBe(1); // chỉ 1 trong 2, không phải cả 2
    expect(state.eventDeck).not.toContain("abandoned_mine");
  });

  it("bật CẢ HAI bộ, eventDeckSize tuỳ chỉnh: đúng số lá đã cấu hình", () => {
    const state = setupGame(["a", "b", "c", "d"], 42, {
      expansions: ["high_noon", "a_fistful_of_cards"],
      eventDeckSize: 5,
    });
    expect(state.eventDeck.length).toBe(6); // 5 + 1 lá cuối
  });

  it("không bật bộ mở rộng sự kiện nào: eventDeck rỗng, không lật gì", () => {
    const state = setupGame(["a", "b", "c", "d"], 42, {});
    expect(state.eventDeck).toEqual([]);
    expect(state.activeEventId).toBeNull();
    expect(state.eventDiscard).toEqual([]);
  });
});

describe("Lật lá sự kiện (mục 1.3) — qua applyTurnStartChecks()/advanceTurn()", () => {
  it("lượt ĐẦU TIÊN của chủ trò (turnNumber = 0): KHÔNG lật, dù eventDeck có sẵn", () => {
    // Đúng tình huống setupGame() gặp phải ở lượt đầu ván — gọi thẳng
    // applyTurnStartChecks() (hàm export, mutate state truyền vào) để kiểm tra
    // trực tiếp, vì reduce()+END_TURN không bao giờ tạo lại được tổ hợp
    // "turnNumber = 0" (advanceTurn() luôn +1 trước khi gọi hàm này).
    const state = makeState({
      currentPlayerIndex: 0, // "a" là Sheriff = chủ trò, đang ở lượt đầu (turnNumber 0)
      turnNumber: 0,
      eventDeck: ["high_noon", "hangover"],
    });

    const events = applyTurnStartChecks(state);

    expect(state.activeEventId).toBeNull();
    expect(state.eventDeck).toEqual(["high_noon", "hangover"]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "EVENT_REVEALED" }));
  });

  it("tới ĐÚNG lượt thứ 2 của chủ trò: lật lá trên cùng (phần tử cuối), bắn EVENT_REVEALED", () => {
    // "c" vừa kết thúc lượt (turnNumber=1, tức đã qua hết vòng đầu: a->b->c),
    // advanceTurn() sẽ quay currentPlayerIndex về 0 ("a", Sheriff = chủ trò)
    // với turnNumber tăng lên 2 — đúng "lượt thứ 2 của chủ trò".
    const state = makeState({
      currentPlayerIndex: 2, // "c"
      turnNumber: 1,
      eventDeck: ["high_noon", "hangover"], // "hangover" = phần tử cuối = lật kế tiếp
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.currentPlayerIndex).toBe(0);
    expect(next.activeEventId).toBe("hangover");
    expect(next.eventDeck).toEqual(["high_noon"]); // đã pop "hangover" ra
    expect(next.eventDiscard).toEqual([]); // chưa có lá cũ nào bị đè
    expect(events).toContainEqual({ type: "EVENT_REVEALED", eventId: "hangover" });
  });

  it("lật lá THỨ 2: lá cũ (activeEventId) chuyển vào eventDiscard", () => {
    const state = makeState({
      currentPlayerIndex: 2,
      turnNumber: 3,
      activeEventId: "hangover",
      eventDeck: ["high_noon", "shootout"],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.activeEventId).toBe("shootout");
    expect(next.eventDeck).toEqual(["high_noon"]);
    expect(next.eventDiscard).toEqual(["hangover"]);
    expect(events).toContainEqual({ type: "EVENT_REVEALED", eventId: "shootout" });
  });

  it("KHÔNG phải lượt chủ trò: không lật, dù turnNumber > 0 và còn lá trong eventDeck", () => {
    // "a" (Sheriff/chủ trò) vừa kết thúc lượt -> chuyển sang "b" (không phải
    // chủ trò) — không được lật, dù đã qua nhiều lượt trước đó.
    const state = makeState({
      currentPlayerIndex: 0, // "a"
      turnNumber: 5,
      eventDeck: ["high_noon", "hangover"],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "a" });

    expect(next.currentPlayerIndex).toBe(1); // "b"
    expect(next.activeEventId).toBeNull();
    expect(next.eventDeck).toEqual(["high_noon", "hangover"]); // nguyên vẹn
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "EVENT_REVEALED" })
    );
  });

  it("eventDeck rỗng: không lật gì, không lỗi", () => {
    const state = makeState({
      currentPlayerIndex: 2,
      turnNumber: 3,
      eventDeck: [],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.activeEventId).toBeNull();
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "EVENT_REVEALED" })
    );
  });

  it("biến thể không có Sheriff (2/3 người): chủ trò là ghế 0", () => {
    const state = makeState({
      players: [makePlayer("a", { role: null }), makePlayer("b", { role: null })],
      currentPlayerIndex: 1, // "b" vừa xong lượt
      turnNumber: 1,
      eventDeck: ["high_noon", "hangover"],
    });

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "b" });

    expect(next.currentPlayerIndex).toBe(0); // "a" = ghế 0 = chủ trò
    expect(next.activeEventId).toBe("hangover");
    expect(events).toContainEqual({ type: "EVENT_REVEALED", eventId: "hangover" });
  });
});

describe("isEventActive()", () => {
  it("true khi đúng activeEventId, false nếu khác hoặc null", () => {
    const state = makeState({ activeEventId: "hangover" });
    expect(isEventActive(state, "hangover")).toBe(true);
    expect(isEventActive(state, "shootout")).toBe(false);
    expect(isEventActive(makeState({ activeEventId: null }), "hangover")).toBe(false);
  });
});

describe("EVENT_CARDS — dữ liệu tĩnh", () => {
  it("high_noon/a_fistful_of_cards là 2 lá cuối duy nhất (isFinalCard)", () => {
    const finalIds = Object.values(EVENT_CARDS).filter((def) => def.isFinalCard === true);
    expect(finalIds.map((def) => def.id).sort()).toEqual(["a_fistful_of_cards", "high_noon"]);
  });
});

describe("viewFor() — chỉ lộ lá đang chạy + lá kế tiếp (mục 1.2)", () => {
  it("activeEventId công khai, nextEventId = phần tử CUỐI eventDeck, không lộ phần còn lại", () => {
    const state = makeState({
      activeEventId: "hangover",
      eventDeck: ["high_noon", "shootout", "thirst"], // "thirst" = lá kế tiếp
      eventDiscard: ["blessing"],
    });

    const view = viewFor(state, "a");

    expect(view.activeEventId).toBe("hangover");
    expect(view.nextEventId).toBe("thirst");
    expect(view.eventDiscard).toEqual(["blessing"]);
    // PlayerView không có field eventDeck nào lộ toàn bộ thứ tự còn lại.
    expect(Object.keys(view)).not.toContain("eventDeck");
  });

  it("eventDeck rỗng: nextEventId = null", () => {
    const view = viewFor(makeState({ eventDeck: [] }), "a");
    expect(view.nextEventId).toBeNull();
  });
});
