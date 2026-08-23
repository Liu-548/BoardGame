// Bộ mở rộng "custom_characters" (Aura The Soul-Weaver, xem House_Rule.txt mục I) —
// bất kỳ lúc nào có 1 người chơi (kể cả chính Aura The Soul-Weaver) sắp bị ghi nhận
// CHẾT (đã hết mọi cách tự cứu — Bia/Elena Noir Miễn Tử), hỏi SAU CÙNG có
// muốn trả 2 máu tối đa VĨNH VIỄN để hồi sinh người đó với ĐÚNG 1 máu hay
// không — ĐÚNG 1 LẦN CẢ VÁN (đã chốt 3 máu, không phải 4 — xem đoạn "GHI CHÚ
// KHI CODE" trong House_Rule.txt mục I).
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
    fairKillerUsedThisTurn: false,
    gamblerUsesThisTurn: 0,
    vendettaUsedThisTurn: false,
    duelBangDrawPending: null,
    pendingGeneralStore: null,
    pendingNobodyCheck: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    drifterShield: {},
    drifterHiddenCard: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    sentinelUsed: {},
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: ["custom_characters"],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Aura The Soul-Weaver — hỏi khi có người sắp chết (Bang!, resume bang_missed)", () => {
  it("Bang! không đỡ, sắp chết -> đẩy NEED_SENTINEL_REVIVE, KHÔNG PLAYER_ELIMINATED, KHÔNG GAME_ENDED", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { hp: 1, maxHp: 4 }),
      makePlayer("c", { characterId: "the_sentinel", hp: 3, maxHp: 3 }),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].hp).toBe(0);
    expect(next.players[1].alive).toBe(true); // chưa ghi nhận chết, đang chờ Aura The Soul-Weaver
    expect(next.pending).toEqual([
      {
        kind: "NEED_SENTINEL_REVIVE",
        player: "c",
        targetId: "b",
        killerId: "a",
        resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } },
        remainingSentinelIds: [],
      },
    ]);
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);
    expect(events.some((e) => e.type === "GAME_ENDED")).toBe(false);
  });

  it("đồng ý hồi sinh -> target về 1 máu, còn sống, Aura The Soul-Weaver trừ 2 máu tối đa vĩnh viễn, đánh dấu đã dùng", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { hp: 1, maxHp: 4 }),
        makePlayer("c", { characterId: "the_sentinel", hp: 3, maxHp: 3 }),
      ],
      {
        pending: [
          {
            kind: "NEED_SENTINEL_REVIVE",
            player: "c",
            targetId: "b",
            killerId: "a",
            resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } },
            remainingSentinelIds: [],
          },
        ],
      }
    );
    // b đã về 0 máu TRƯỚC ĐÓ (giả lập đúng thời điểm hỏi) — set thủ công cho khớp kịch bản.
    state.players[1].hp = 0;

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "c", reviveTarget: true });

    expect(next.players[1]).toMatchObject({ hp: 1, alive: true });
    expect(next.players[2]).toMatchObject({ hp: 1, maxHp: 1 }); // 3 - 2 = 1, hp kẹp theo
    expect(next.sentinelUsed).toEqual({ c: true });
    expect(next.pending).toEqual([]);
    expect(events).toEqual([{ type: "SENTINEL_REVIVED", playerId: "b", sentinelId: "c", sentinelNewMaxHp: 1 }]);
  });

  it("từ chối -> chết thật (PLAYER_ELIMINATED), KHÔNG trừ máu Aura The Soul-Weaver, KHÔNG đánh dấu đã dùng", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { hp: 0, maxHp: 4 }),
        makePlayer("c", { characterId: "the_sentinel", hp: 3, maxHp: 3 }),
      ],
      {
        pending: [
          {
            kind: "NEED_SENTINEL_REVIVE",
            player: "c",
            targetId: "b",
            killerId: "a",
            resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } },
            remainingSentinelIds: [],
          },
        ],
      }
    );

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "c" });

    expect(next.players[1].alive).toBe(false);
    expect(next.players[2]).toMatchObject({ hp: 3, maxHp: 3 }); // không đổi gì
    expect(next.sentinelUsed).toEqual({});
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(true);
  });
});

describe("Aura The Soul-Weaver — đã dùng hết lượt (1 lần cả ván)", () => {
  it("sentinelUsed[c]=true từ trước -> KHÔNG hỏi nữa, chết thẳng", () => {
    const state = makeState(
      [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { hp: 1, maxHp: 4 }),
        makePlayer("c", { characterId: "the_sentinel", hp: 3, maxHp: 1 }),
      ],
      { sentinelUsed: { c: true } }
    );

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.pending).toEqual([]);
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(true);
    expect(events.some((e) => e.type === "SENTINEL_REVIVED")).toBe(false);
  });
});

describe("Aura The Soul-Weaver — tự cứu chính mình", () => {
  it("chính Aura The Soul-Weaver sắp chết -> vẫn được hỏi (target === player)", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { characterId: "the_sentinel", hp: 1, maxHp: 3 }),
      makePlayer("c"),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      {
        kind: "NEED_SENTINEL_REVIVE",
        player: "b",
        targetId: "b",
        killerId: "a",
        resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } },
        remainingSentinelIds: [],
      },
    ]);

    const { state: revived } = reduce(next, { type: "RESPOND", playerId: "b", reviveTarget: true });
    expect(revived.players[1]).toMatchObject({ hp: 1, alive: true, maxHp: 1 });
    expect(revived.sentinelUsed).toEqual({ b: true });
  });
});

describe("Aura The Soul-Weaver — Indians! (resume indians)", () => {
  it("không bỏ Bang! để đỡ, sắp chết -> đẩy NEED_SENTINEL_REVIVE với resume indians", () => {
    const state = makeState(
      [
        makePlayer("a"),
        makePlayer("b", { hp: 1, maxHp: 4 }),
        makePlayer("c", { characterId: "the_sentinel", hp: 3, maxHp: 3 }),
      ],
      { pending: [{ kind: "NEED_DISCARD_BANG", player: "b", source: { card: "indians", from: "a" } }] }
    );

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(next.pending).toEqual([
      {
        kind: "NEED_SENTINEL_REVIVE",
        player: "c",
        targetId: "b",
        killerId: "a",
        resume: { kind: "indians" },
        remainingSentinelIds: [],
      },
    ]);
    expect(next.players[1].alive).toBe(true);
  });
});

describe("Aura The Soul-Weaver — Thuốc nổ (resume dynamite, epilogue Jail-check hoãn lại)", () => {
  it("nổ chết -> hỏi Aura The Soul-Weaver; đồng ý -> hồi sinh, KHÔNG bỏ qua Jail-check nếu holder có Jail", () => {
    const state = makeState(
      [
        makePlayer("a", { role: "sheriff", hp: 5, maxHp: 5 }),
        makePlayer("b", { hp: 2, maxHp: 4, equipment: ["dynamite_1", "jail_2"] }),
        makePlayer("c", { characterId: "the_sentinel", hp: 3, maxHp: 3 }),
      ],
      {
        deck: ["missed_6"], // spades, 2 — khớp Bích 2-9
        currentPlayerIndex: 1,
        pending: [
          {
            kind: "NEED_DRAW_CHECK", player: "b", source: { card: "dynamite" },
            matchSuits: ["spades"], matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
          },
        ],
      }
    );

    const { state: afterExplosion, events } = reduce(state, { type: "RESPOND", playerId: "b" });

    expect(afterExplosion.players[1]).toMatchObject({ hp: 0, alive: true });
    // Chỉ ĐÚNG quả Dynamite vừa nổ bị bỏ — Jail vẫn còn nguyên (equipment chỉ
    // bị dọn SẠCH ở eliminatePlayer(), mà b chưa từng qua đó — đang chờ Aura The Soul-Weaver).
    expect(afterExplosion.players[1].equipment).toEqual(["jail_2"]);
    expect(afterExplosion.pending).toEqual([
      {
        kind: "NEED_SENTINEL_REVIVE",
        player: "c",
        targetId: "b",
        killerId: null,
        resume: { kind: "dynamite" },
        remainingSentinelIds: [],
      },
    ]);
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(false);

    const { state: revived } = reduce(afterExplosion, { type: "RESPOND", playerId: "c", reviveTarget: true });
    expect(revived.players[1]).toMatchObject({ hp: 1, alive: true });
    // b còn sống VÀ vẫn còn Jail trên sân -> applyJailCheck() chạy lại đúng
    // bước này (KHÔNG bị bỏ qua chỉ vì vừa trải qua Aura The Soul-Weaver) -> đẩy draw!-check Jail.
    expect(revived.pending).toEqual([{ kind: "NEED_DRAW_CHECK", player: "b", source: { card: "jail" }, matchSuits: ["hearts"] }]);
    expect(revived.currentPlayerIndex).toBe(1);
  });
});

describe("Aura The Soul-Weaver — Vera Custer mượn khả năng", () => {
  it("Vera Custer đang mượn the_sentinel -> vẫn được hỏi, trừ máu tối đa CỦA CHÍNH VERA", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { hp: 1, maxHp: 4 }),
      makePlayer("c", { characterId: "vera_custer", hp: 4, maxHp: 4 }),
    ]);
    state.veraCusterBorrowedCharacterId = "the_sentinel";

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: afterAsk } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(afterAsk.pending[0]).toMatchObject({ kind: "NEED_SENTINEL_REVIVE", player: "c", targetId: "b" });

    const { state: revived } = reduce(afterAsk, { type: "RESPOND", playerId: "c", reviveTarget: true });
    expect(revived.players[2]).toMatchObject({ hp: 2, maxHp: 2 }); // Vera: 4 - 2 = 2
    expect(revived.sentinelUsed).toEqual({ c: true });
  });
});

describe("Aura The Soul-Weaver — không có ai đủ điều kiện thì chết bình thường", () => {
  it("không có nhân vật Aura The Soul-Weaver trong ván -> PLAYER_ELIMINATED thẳng, không có pending mới", () => {
    const state = makeState([
      makePlayer("a", { hand: ["bang_1"] }),
      makePlayer("b", { hp: 1, maxHp: 4 }),
      makePlayer("c"),
    ]);

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { state: next, events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(next.players[1].alive).toBe(false);
    expect(next.pending).toEqual([]);
    expect(events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(true);
  });
});

describe("Aura The Soul-Weaver — điều kiện thắng chờ đúng lúc Aura The Soul-Weaver quyết định xong", () => {
  it("biến thể 2 người: từ chối -> game kết thúc NGAY tại lúc từ chối, không sớm hơn", () => {
    // b chính là Aura The Soul-Weaver, sắp chết, được hỏi về CHÍNH MÌNH — mô phỏng qua
    // pending trực tiếp cho gọn (không cần dựng lại toàn bộ luồng Bang!).
    const dying = makeState(
      [makePlayer("a", { role: null }), makePlayer("b", { role: null, hp: 0, maxHp: 4, characterId: "the_sentinel" })],
      {
        pending: [
          {
            kind: "NEED_SENTINEL_REVIVE",
            player: "b",
            targetId: "b",
            killerId: "a",
            resume: { kind: "bang_missed", missedTop: { kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } } },
            remainingSentinelIds: [],
          },
        ],
      }
    );

    const declined = reduce(dying, { type: "RESPOND", playerId: "b" });
    expect(declined.state.winner).toEqual({ kind: "player", playerId: "a" });
    expect(declined.events.some((e) => e.type === "GAME_ENDED")).toBe(true);

    const accepted = reduce(dying, { type: "RESPOND", playerId: "b", reviveTarget: true });
    expect(accepted.state.winner).toBeNull();
    expect(accepted.events.some((e) => e.type === "GAME_ENDED")).toBe(false);
  });
});
