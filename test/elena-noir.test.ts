// Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
// khả năng "dạt ra cho mẹ bắn" (Miễn Tử): vũ trang đầu lượt (Phương án 2, đã
// chốt) -> nếu trúng đòn chí mạng trong lúc vũ trang (và Bia không cứu được)
// thì vào Miễn Tử 2 lượt thay vì chết, không thể bị Jail, vẫn bị mọi lá khác
// tác động bình thường, chắc chắn chết sau đúng 2 lượt của chính cô.
//
// GameState.elenaNoirArmed/elenaNoirImmortalTurnsLeft là Record<playerId,
// ...> (KHÔNG phải field đơn) — xử lý triệt để xung đột với Vera Custer
// (Dodge City) mượn khả năng này, xem ghi chú ở types.ts/characters.ts.
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
    expansions: ["custom_characters"],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Elena Noir — bước 1: hỏi vũ trang đầu lượt", () => {
  it("đầu lượt (chưa Miễn Tử) đẩy NEED_PICK_ARMED, chưa rút gì", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "elena_noir", hp: 3, maxHp: 3 }), makePlayer("b"), makePlayer("c")],
      { turnPhase: "draw", deck: ["c1", "c2", "c3"] }
    );

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([{ kind: "NEED_PICK_ARMED", player: "a" }]);
    expect(next.turnPhase).toBe("draw");
    expect(next.players[0].hand).toEqual([]);
    expect(events).toEqual([]);
  });

  it("chọn vũ trang: rút đúng 1 lá, elenaNoirArmed[a] = true", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "elena_noir", hp: 3, maxHp: 3 }), makePlayer("b"), makePlayer("c")],
      { turnPhase: "draw", pending: [{ kind: "NEED_PICK_ARMED", player: "a" }], deck: ["c1", "c2"] }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", armed: true });

    expect(next.players[0].hand).toEqual(["c2"]); // đỉnh bộ bài rút trước
    expect(next.elenaNoirArmed.a).toBe(true);
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 1 });
  });

  it("không vũ trang (mặc định/hết giờ): rút đúng 2 lá bình thường, xoá key khỏi elenaNoirArmed", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "elena_noir", hp: 3, maxHp: 3 }), makePlayer("b"), makePlayer("c")],
      {
        turnPhase: "draw",
        pending: [{ kind: "NEED_PICK_ARMED", player: "a" }],
        deck: ["c1", "c2"],
        elenaNoirArmed: { a: true },
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c2", "c1"]); // đỉnh bộ bài (c2) rút trước
    expect(next.elenaNoirArmed.a).toBeUndefined();
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 2 });
  });

  it("ĐANG Miễn Tử: không hỏi vũ trang, rút thẳng 3 lá", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "elena_noir", hp: 0, maxHp: 3 }), makePlayer("b"), makePlayer("c")],
      { turnPhase: "draw", deck: ["c1", "c2", "c3", "c4"], elenaNoirImmortalTurnsLeft: { a: 2 } }
    );

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([]);
    expect(next.players[0].hand).toEqual(["c4", "c3", "c2"]); // đỉnh rút trước = c4
    expect(next.turnPhase).toBe("play");
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });
});

describe("Elena Noir — bước 2: kích hoạt Miễn Tử khi trúng đòn chí mạng lúc đang vũ trang", () => {
  it("đang vũ trang, trúng Bang! chí mạng, KHÔNG có Bia -> vào Miễn Tử thay vì chết", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_noir", hp: 1, maxHp: 3, hand: [] }),
        makePlayer("c"),
      ],
      { elenaNoirArmed: { b: true } }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(0);
    expect(next.elenaNoirImmortalTurnsLeft.b).toBe(2);
    expect(next.elenaNoirArmed.b).toBeUndefined(); // "vũ trang" coi như đã dùng xong
    expect(events).toContainEqual({ type: "ELENA_NOIR_IMMORTAL_TRIGGERED", playerId: "b", turnsLeft: 2 });
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);
  });

  it("đang vũ trang, trúng chí mạng, NHƯNG có Bia trên tay -> Bia cứu trước, KHÔNG kích hoạt Miễn Tử", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_noir", hp: 1, maxHp: 3, hand: ["beer_1"] }),
        makePlayer("c"),
      ],
      { elenaNoirArmed: { b: true } }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(1); // Bia hồi sinh, không phải 0
    expect(next.elenaNoirImmortalTurnsLeft.b).toBeUndefined(); // KHÔNG vào Miễn Tử
    expect(events).toContainEqual({ type: "BEER_SAVED_FROM_DEATH", playerId: "b", cardId: "beer_1", hp: 1 });
  });

  it("KHÔNG vũ trang, trúng chí mạng, không Bia -> chết thật bình thường", () => {
    const state = makeState(
      [
        // "a" phải có vai Cảnh sát trưởng — nếu không, checkWinCondition() coi
        // "không ai làm Cảnh sát trưởng" = "Cảnh sát trưởng đã chết", kết thúc
        // ván ngay khi "b" chết (đúng luật, nhưng làm hỏng test — không liên
        // quan gì tới Elena Noir, chỉ là dựng ván thật cho đúng).
        makePlayer("a", { role: "sheriff", hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_noir", hp: 1, maxHp: 3, hand: [] }),
        makePlayer("c", { role: "renegade" }),
      ],
      { elenaNoirArmed: {} }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.elenaNoirImmortalTurnsLeft.b).toBeUndefined();
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "b", killedBy: "a" });
  });
});

describe("Elena Noir — trong lúc Miễn Tử", () => {
  it("KHÔNG thể bị nhốt tù (Jail bị chặn ngay lúc đánh)", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["jail_1"] }),
        makePlayer("b", { characterId: "elena_noir", hp: 0, maxHp: 3, role: "outlaw" }),
        makePlayer("c"),
      ],
      { elenaNoirImmortalTurnsLeft: { b: 2 } }
    );

    expect(() => reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "jail_1", targetId: "b" })).toThrow(
      "Miễn Tử"
    );
  });

  it("VẪN bị Panic! cướp bài bình thường (chỉ máu là miễn nhiễm, không phải mọi lá)", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["panic_1"] }),
        makePlayer("b", { characterId: "elena_noir", hp: 0, maxHp: 3, hand: ["missed_1"] }),
        makePlayer("c"),
      ],
      { elenaNoirImmortalTurnsLeft: { b: 2 } }
    );

    const { state: next, events } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" });

    expect(next.players[1].hand).toEqual([]);
    expect(next.players[0].hand).toContain("missed_1");
    expect(events).toContainEqual({ type: "CARD_STOLEN", playerId: "a", fromPlayerId: "b", cardId: "missed_1" });
  });

  it("sát thương thêm trong lúc Miễn Tử không giết được, máu giữ nguyên ở 0", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: "elena_noir", hp: 0, maxHp: 3, hand: [] }),
        makePlayer("c"),
      ],
      { elenaNoirImmortalTurnsLeft: { b: 2 } }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(0);
    expect(next.elenaNoirImmortalTurnsLeft.b).toBe(2); // không đổi
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);
    expect(events.some((e) => e.type === "BEER_SAVED_FROM_DEATH")).toBe(false);
  });

  it("cuối lượt trong Miễn Tử phải bỏ HẾT bài (hand limit = hp = 0)", () => {
    const state = makeState(
      [makePlayer("a", { characterId: "elena_noir", hp: 0, maxHp: 3, hand: ["bang_1", "missed_1"] }), makePlayer("b"), makePlayer("c")],
      { currentPlayerIndex: 0, turnPhase: "play", elenaNoirImmortalTurnsLeft: { a: 2 } }
    );

    const { state: afterEnd } = reduce(state, { type: "END_TURN", playerId: "a" });
    expect(afterEnd.turnPhase).toBe("discard");
    expect(afterEnd.currentPlayerIndex).toBe(0); // vẫn là Elena Noir, chưa qua lượt ai

    const { state: afterDiscard } = reduce(afterEnd, {
      type: "DISCARD_CARDS", playerId: "a", cardIds: ["bang_1", "missed_1"],
    });
    expect(afterDiscard.players[0].hand).toEqual([]);
    expect(afterDiscard.currentPlayerIndex).not.toBe(0); // giờ mới thật sự qua lượt
    expect(afterDiscard.elenaNoirImmortalTurnsLeft.a).toBe(1); // lượt này đã tính vào 2 lượt Miễn Tử
  });

  it("Dynamite nổ trúng lúc ĐANG Miễn Tử: không giết được cô", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", {
          characterId: "elena_noir", hp: 0, maxHp: 3, hand: [], equipment: ["dynamite_1"],
        }),
        makePlayer("c"),
      ],
      {
        currentPlayerIndex: 1,
        elenaNoirImmortalTurnsLeft: { b: 2 },
        deck: ["missed_6"], // Bích 2 — khớp Bích 2-9 -> nổ
        pending: [
          {
            kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
            matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
          },
        ],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.players[1].hp).toBe(0);
    expect(next.elenaNoirImmortalTurnsLeft.b).toBe(2); // vẫn còn nguyên, không bị ảnh hưởng
    expect(events).toContainEqual({ type: "DYNAMITE_EXPLODED", playerId: "b", amount: 0 }); // sàn 0, đã ở 0 sẵn
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);
  });
});

describe("Elena Noir — hết hạn Miễn Tử", () => {
  it("còn 2 lượt: hết lượt của cô giảm còn 1, vẫn sống, chuyển đúng người kế tiếp", () => {
    const state = makeState(
      [makePlayer("a"), makePlayer("b", { characterId: "elena_noir", hp: 0, maxHp: 3, hand: [] }), makePlayer("c")],
      { currentPlayerIndex: 1, turnPhase: "play", elenaNoirImmortalTurnsLeft: { b: 2 } }
    );

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "b" });

    expect(next.players[1].alive).toBe(true);
    expect(next.elenaNoirImmortalTurnsLeft.b).toBe(1);
    expect(next.currentPlayerIndex).toBe(2); // "c" — người kế tiếp
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);
  });

  it("còn ĐÚNG 1 lượt: hết lượt của cô -> chết chắc chắn, chuyển sang người kế tiếp", () => {
    const state = makeState(
      [
        // "a" cần vai Cảnh sát trưởng — xem ghi chú y hệt ở test "chết thật
        // bình thường" phía trên (tránh checkWinCondition() kết thúc ván sớm).
        makePlayer("a", { role: "sheriff" }),
        makePlayer("b", { characterId: "elena_noir", hp: 0, maxHp: 3, hand: [] }),
        makePlayer("c", { role: "renegade" }),
      ],
      { currentPlayerIndex: 1, turnPhase: "play", elenaNoirImmortalTurnsLeft: { b: 1 } }
    );

    const { state: next, events } = reduce(state, { type: "END_TURN", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.elenaNoirImmortalTurnsLeft.b).toBeUndefined();
    expect(next.currentPlayerIndex).toBe(2); // "c" — bỏ qua "b" vừa chết
    expect(events).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "b", killedBy: null });
  });
});

describe("Elena Noir — Vera Custer mượn khả năng (xử lý xung đột state theo playerId)", () => {
  it("Elena Noir thật đang vũ trang KHÔNG bị ảnh hưởng khi Vera Custer (mượn Elena Noir) cũng vũ trang ở lượt riêng", () => {
    const state = makeState(
      [
        makePlayer("a", { characterId: "elena_noir", hp: 1, maxHp: 3 }),
        makePlayer("b", { characterId: "vera_custer", hp: 3, maxHp: 3 }),
        makePlayer("c"),
      ],
      {
        // "a" (Elena Noir thật) ĐÃ vũ trang từ trước.
        elenaNoirArmed: { a: true },
        // "b" (Vera Custer) đang mượn đúng "elena_noir".
        veraCusterBorrowedCharacterId: "elena_noir",
        currentPlayerIndex: 1,
        turnPhase: "draw",
        deck: ["c1", "c2"],
      }
    );

    // Vera Custer (đang mượn Elena Noir) rút bài đầu lượt -> cũng bị hỏi vũ
    // trang (getEffectiveCharacterDefinition đúng ý đồ Vera Custer).
    const { state: afterDraw } = reduce(state, { type: "DRAW_CARDS", playerId: "b" });
    expect(afterDraw.pending).toEqual([{ kind: "NEED_PICK_ARMED", player: "b" }]);

    const { state: afterArm } = reduce(afterDraw, { type: "RESPOND", playerId: "b", armed: true });

    // "b" có entry riêng, KHÔNG đụng gì tới "a" — đây chính là điểm mấu chốt
    // đã sửa (trước đây 2 người tranh nhau đúng 1 field, ai vũ trang sau cùng
    // sẽ XOÁ mất trạng thái của người kia).
    expect(afterArm.elenaNoirArmed.a).toBe(true); // Elena Noir thật vẫn còn nguyên
    expect(afterArm.elenaNoirArmed.b).toBe(true);
    expect(afterArm.players[1].hand.length).toBe(1); // Vera Custer rút đúng 1 lá (vũ trang)
  });
});
