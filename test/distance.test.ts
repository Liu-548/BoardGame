import { describe, expect, it } from "vitest";
import { computeDistance, getWeaponRange } from "../src/core/distance";
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

// Vòng tròn 5 người a-b-c-d-e (chỗ ngồi theo thứ tự mảng), dùng chung cho các
// test khoảng cách/tầm bắn.
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
    ...overrides,
  };
}

describe("computeDistance — vòng tròn cơ bản (mọi người còn sống)", () => {
  const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));

  it("người ngồi cạnh nhau: khoảng cách 1", () => {
    expect(computeDistance(players, "a", "b")).toBe(1);
    expect(computeDistance(players, "a", "e")).toBe(1); // vòng tròn, e cạnh a phía bên kia
  });

  it("người ngồi cách nhau 2 ghế theo chiều ngắn hơn", () => {
    expect(computeDistance(players, "a", "c")).toBe(2);
    expect(computeDistance(players, "a", "d")).toBe(2); // đi ngược chiều: a-e-d, cũng 2 ghế
  });

  it("khoảng cách đối xứng 2 chiều", () => {
    expect(computeDistance(players, "c", "a")).toBe(2);
  });
});

describe("computeDistance — vòng tròn co lại khi có người chết", () => {
  it("người chết ở giữa: 2 người sống 2 bên xích lại gần nhau", () => {
    const players = [
      makePlayer("a"),
      makePlayer("b", { alive: false, characterId: null }), // b chết, ghế biến mất
      makePlayer("c"),
      makePlayer("d"),
      makePlayer("e"),
    ];

    // Trước khi b chết: a-c cách 2. Sau khi b chết, vòng tròn còn a,c,d,e (4
    // ghế) — a cạnh c luôn (b đã biến mất khỏi vòng).
    expect(computeDistance(players, "a", "c")).toBe(1);
  });

  it("chết nhiều người: vòng tròn co lại chỉ còn người sống", () => {
    const players = [
      makePlayer("a"),
      makePlayer("b", { alive: false, characterId: null }),
      makePlayer("c", { alive: false, characterId: null }),
      makePlayer("d"),
      makePlayer("e"),
    ];

    // Còn sống: a, d, e — vòng tròn 3 người, ai cũng cạnh ai.
    expect(computeDistance(players, "a", "d")).toBe(1);
    expect(computeDistance(players, "d", "e")).toBe(1);
  });
});

describe("computeDistance — Scope và Mustang", () => {
  it("Scope: người đánh nhìn mục tiêu gần hơn 1", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { equipment: ["scope_1"] });

    expect(computeDistance(players, "a", "c")).toBe(1); // gốc 2, Scope trừ 1
  });

  it("Mustang: người khác nhìn mục tiêu xa hơn 1", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[1] = makePlayer("b", { equipment: ["mustang_1"] });

    expect(computeDistance(players, "a", "b")).toBe(2); // gốc 1, Mustang cộng 1
  });

  it("Scope + Mustang cùng lúc: có thể triệt tiêu lẫn nhau", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { equipment: ["scope_1"] });
    players[2] = makePlayer("c", { equipment: ["mustang_1"] });

    expect(computeDistance(players, "a", "c")).toBe(2); // gốc 2, -1 (Scope) +1 (Mustang) = 2
  });

  it("Mustang không ảnh hưởng khoảng cách người mang nó nhìn ra ngoài", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[1] = makePlayer("b", { equipment: ["mustang_1"] });

    // b đánh a: Mustang chỉ đổi cách NGƯỜI KHÁC nhìn b, không đổi cách b nhìn người khác.
    expect(computeDistance(players, "b", "a")).toBe(1);
  });

  it("khoảng cách tối thiểu là 1, không thể về 0 hay âm", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => makePlayer(id));
    players[0] = makePlayer("a", { equipment: ["scope_1"] });

    expect(computeDistance(players, "a", "b")).toBe(1); // gốc 1, Scope trừ 1 -> vẫn 1 (chặn ở 1)
  });
});

describe("getWeaponRange", () => {
  it("không trang bị súng nào: tầm mặc định 1", () => {
    expect(getWeaponRange(makePlayer("a"))).toBe(1);
  });

  it("trả đúng tầm bắn từng khẩu súng", () => {
    expect(getWeaponRange(makePlayer("a", { equipment: ["volcanic_1"] }))).toBe(1);
    expect(getWeaponRange(makePlayer("a", { equipment: ["schofield_1"] }))).toBe(2);
    expect(getWeaponRange(makePlayer("a", { equipment: ["remington_1"] }))).toBe(3);
    expect(getWeaponRange(makePlayer("a", { equipment: ["rev_carabine_1"] }))).toBe(4);
    expect(getWeaponRange(makePlayer("a", { equipment: ["winchester_1"] }))).toBe(5);
  });
});

describe("reduce — Bang! bị giới hạn bởi tầm bắn", () => {
  it("không có súng, mục tiêu cách 2 ghế: bị chặn", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) =>
      makePlayer(id, { hand: id === "a" ? ["bang_1"] : [] })
    );
    const state = makeState(players);

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" })
    ).toThrow(/ngoài tầm bắn/);
  });

  it("có Schofield (tầm 2), mục tiêu cách 2 ghế: đánh được", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) =>
      makePlayer(id, {
        hand: id === "a" ? ["bang_1"] : [],
        equipment: id === "a" ? ["schofield_1"] : [],
      })
    );
    const state = makeState(players);

    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } },
    ]);
  });

  it("Mustang trên mục tiêu đẩy nó ra ngoài tầm súng", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) =>
      makePlayer(id, {
        hand: id === "a" ? ["bang_1"] : [],
        equipment: id === "b" ? ["mustang_1"] : [],
      })
    );
    const state = makeState(players);

    // a-b vốn cách 1, nhưng b có Mustang -> hiệu dụng thành 2, súng ngầm định
    // (tầm 1) không bắn tới.
    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" })
    ).toThrow(/ngoài tầm bắn/);
  });

  it("Scope trên người đánh kéo mục tiêu vào tầm", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) =>
      makePlayer(id, {
        hand: id === "a" ? ["bang_1"] : [],
        equipment: id === "a" ? ["scope_1"] : [],
      })
    );
    const state = makeState(players);

    // a-c vốn cách 2, Scope trừ 1 -> hiệu dụng 1, súng ngầm định (tầm 1) bắn tới.
    const { state: next } = reduce(state, {
      type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c",
    });

    expect(next.pending).toEqual([
      { kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } },
    ]);
  });
});

describe("reduce — Panic! chỉ dùng được ở khoảng cách 1", () => {
  it("mục tiêu cách 2 ghế: bị chặn", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) =>
      makePlayer(id, { hand: id === "a" ? ["panic_1"] : ["bang_9"] })
    );
    const state = makeState(players);

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "c" })
    ).toThrow(/khoảng cách 1/);
  });

  it("Mustang trên mục tiêu ở ghế cạnh nhau cũng chặn được Panic!", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) =>
      makePlayer(id, {
        hand: id === "a" ? ["panic_1"] : id === "b" ? ["bang_9"] : [],
        equipment: id === "b" ? ["mustang_1"] : [],
      })
    );
    const state = makeState(players);

    expect(() =>
      reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "panic_1", targetId: "b" })
    ).toThrow(/khoảng cách 1/);
  });
});
