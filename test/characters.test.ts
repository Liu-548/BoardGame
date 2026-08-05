// Việc 5.1 — kiểm tra DÂY NỐI của hệ thống hook (không phải nhân vật thật:
// CHARACTERS thật sự luôn rỗng, xem core/characters.ts). Mỗi test tự cắm 1
// "nhân vật giả" thẳng vào registry thật rồi tự dọn lại ở afterEach — cách
// này kiểm tra đúng con đường thật (getCharacterHooks() -> registry -> hook)
// mà không cần thêm tham số/đường vòng riêng chỉ để phục vụ test.
import { afterEach, describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/core/characters";
import { computeDistance } from "../src/core/distance";
import { reduce } from "../src/core/reduce";
import type { GameEvent, GameState, PlayerState } from "../src/core/types";

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
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

const TEST_ID = "__test_character__";

afterEach(() => {
  delete CHARACTERS[TEST_ID];
});

describe("modifyDistance", () => {
  it("vai target: cộng thêm khoảng cách, giống Ngựa Mustang ảo (Paul Regret)", () => {
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (target +1)",
      bullets: 4,
      hooks: {
        modifyDistance: (distance, role) => (role === "target" ? distance + 1 : distance),
      },
    };
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[1] = makePlayer("b", { characterId: TEST_ID });

    expect(computeDistance(makeState({ players }), "a", "b")).toBe(2); // gốc 1, +1 nhân vật
  });

  it("vai attacker: trừ khoảng cách, giống Ống nhắm ảo (Rose Doolan)", () => {
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (attacker -1)",
      bullets: 4,
      hooks: {
        modifyDistance: (distance, role) => (role === "attacker" ? distance - 1 : distance),
      },
    };
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { characterId: TEST_ID });

    expect(computeDistance(makeState({ players }), "a", "c")).toBe(1); // gốc 2, -1 nhân vật
  });

  it("cộng dồn được với Ống nhắm/Ngựa Mustang THẬT, không tách riêng", () => {
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (attacker -1)",
      bullets: 4,
      hooks: {
        modifyDistance: (distance, role) => (role === "attacker" ? distance - 1 : distance),
      },
    };
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { characterId: TEST_ID, equipment: ["scope_1"] });

    // Gốc 2 (a-c), -1 Ống nhắm thật, -1 nhân vật giả -> 0, chặn sàn ở 1.
    expect(computeDistance(makeState({ players }), "a", "c")).toBe(1);
  });

  it("không có characterId thì không đụng gì tới khoảng cách", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    expect(computeDistance(makeState({ players }), "a", "c")).toBe(2);
  });
});

describe("onLoseLife / onLoseLifeFromCard", () => {
  it("mất máu vì Bang! (có người gây): cả 2 hook đều chạy, đúng amount/byPlayerId", () => {
    const calls: string[] = [];
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (Bart + El Gringo)",
      bullets: 4,
      hooks: {
        onLoseLife: (_next, target, amount): GameEvent[] => {
          calls.push(`onLoseLife:${target.id}:${amount}`);
          return [];
        },
        onLoseLifeFromCard: (_next, target, amount, byPlayerId): GameEvent[] => {
          calls.push(`onLoseLifeFromCard:${target.id}:${amount}:${byPlayerId}`);
          return [];
        },
      },
    };

    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: TEST_ID }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> chịu 1 máu

    expect(calls).toEqual(["onLoseLife:b:1", "onLoseLifeFromCard:b:1:a"]);
  });

  it("hook trả về event thì event đó có trong kết quả reduce()", () => {
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (rút bài khi mất máu)",
      bullets: 4,
      hooks: {
        onLoseLife: (_next, target, amount): GameEvent[] => [
          { type: "CARDS_DRAWN", playerId: target.id, count: amount },
        ],
      },
    };

    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"] }),
        makePlayer("b", { characterId: TEST_ID }),
        makePlayer("c"),
      ],
    });

    const played = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    const { events } = reduce(played.state, { type: "RESPOND", playerId: "b" });

    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "b", count: 1 });
  });

  it("mất máu vì Thuốc nổ (không có người gây): CHỈ onLoseLife chạy, không chạy onLoseLifeFromCard", () => {
    const calls: string[] = [];
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (Bart + El Gringo)",
      bullets: 4,
      hooks: {
        onLoseLife: (_next, target, amount): GameEvent[] => {
          calls.push(`onLoseLife:${target.id}:${amount}`);
          return [];
        },
        onLoseLifeFromCard: (_next, target, amount, byPlayerId): GameEvent[] => {
          calls.push(`onLoseLifeFromCard:${target.id}:${amount}:${byPlayerId}`);
          return [];
        },
      },
    };

    const state = makeState({
      players: [
        makePlayer("a", { hp: 5, maxHp: 5 }),
        makePlayer("b", { hp: 5, maxHp: 5, characterId: TEST_ID, equipment: ["dynamite_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1,
      deck: ["missed_6"], // spades, 2 — khớp Bích 2-9, đúng dữ liệu dùng ở dynamite.test.ts
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

    reduce(state, { type: "RESPOND", playerId: "b" });

    expect(calls).toEqual(["onLoseLife:b:3"]); // KHÔNG có onLoseLifeFromCard
  });
});

describe("onAnyDeath", () => {
  function stateWithDyingB(): GameState {
    return makeState({
      players: [
        makePlayer("a", { hand: ["bang_1"], characterId: TEST_ID }),
        // role "renegade" (không phải "outlaw") — CỐ TÌNH tránh kích hoạt
        // luật thưởng "hạ Outlaw thì rút 3 lá" (eliminatePlayer trong
        // reduce.ts) không liên quan gì tới test này, mà deck rỗng ở đây sẽ
        // làm nó rút bằng cách xáo lại CHÍNH chồng bỏ đang muốn kiểm tra.
        // KHÔNG dùng "beer" trong tay — giờ kích hoạt cơ chế "hồi sinh tự
        // động" (xem eliminateIfDead() trong reduce.ts), làm b sống sót thay
        // vì chết như bài test này cần.
        makePlayer("b", { role: "renegade", hp: 1, hand: ["missed_1", "bang_2"], equipment: ["scope_1"] }),
        makePlayer("c"),
      ],
    });
  }

  it("hook nhận hết bài người chết thì bài KHÔNG rơi vào chồng bỏ (không mất, không nhân đôi)", () => {
    CHARACTERS[TEST_ID] = {
      id: TEST_ID,
      name: "Nhân vật giả (Vulture Sam)",
      bullets: 4,
      hooks: {
        onAnyDeath: (_next, self, deadPlayer): GameEvent[] => {
          self.hand.push(...deadPlayer.hand, ...deadPlayer.equipment);
          deadPlayer.hand = [];
          deadPlayer.equipment = [];
          return [];
        },
      },
    };

    const played = reduce(stateWithDyingB(), {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_1",
      targetId: "b",
    });
    const { state: next } = reduce(played.state, { type: "RESPOND", playerId: "b" }); // không đỡ -> chết

    expect(next.players[1].alive).toBe(false);
    expect(next.players[0].hand).toEqual(expect.arrayContaining(["missed_1", "bang_2", "scope_1"]));
    // Không bị bỏ lại vào chồng bỏ — chỉ có bang_1 (lá a vừa đánh), không có missed_1/bang_2/scope_1.
    expect(next.discardPile).toEqual(["bang_1"]);
  });

  it("không có hook nào nhận thì bài người chết vẫn về chồng bỏ như bình thường", () => {
    const { state: next } = (() => {
      const played = reduce(
        makeState({
          players: [
            makePlayer("a", { hand: ["bang_1"] }),
            // KHÔNG dùng "beer" — xem ghi chú stateWithDyingB() ở trên.
            makePlayer("b", { role: "renegade", hp: 1, hand: ["missed_1"] }),
            makePlayer("c"),
          ],
        }),
        { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" }
      );
      return reduce(played.state, { type: "RESPOND", playerId: "b" });
    })();

    expect(next.players[1].hand).toEqual([]);
    expect(next.discardPile).toEqual(expect.arrayContaining(["bang_1", "missed_1"]));
  });
});
