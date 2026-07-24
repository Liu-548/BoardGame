import { describe, expect, it } from "vitest";
import { setupGame } from "../src/core/setup";

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${i + 1}`);
}

function countRoles(state: ReturnType<typeof setupGame>) {
  const counts: Record<string, number> = {};
  for (const player of state.players) {
    counts[player.role] = (counts[player.role] ?? 0) + 1;
  }
  return counts;
}

describe("setupGame", () => {
  it("báo lỗi nếu số người chơi ngoài khoảng 4-7", () => {
    expect(() => setupGame(ids(3), 1)).toThrow();
    expect(() => setupGame(ids(8), 1)).toThrow();
  });

  it("cùng seed + cùng danh sách người chơi luôn cho ra cùng state", () => {
    const a = setupGame(ids(5), 42);
    const b = setupGame(ids(5), 42);
    expect(a).toEqual(b);
  });

  it.each([4, 5, 6, 7])("chia đúng số vai với %i người chơi", (playerCount) => {
    const state = setupGame(ids(playerCount), 1);
    const roleCounts = countRoles(state);

    expect(roleCounts.sheriff).toBe(1);
    expect(roleCounts.renegade).toBe(1);

    const expectedOutlaws: Record<number, number> = { 4: 2, 5: 2, 6: 3, 7: 3 };
    const expectedDeputies: Record<number, number> = { 4: 0, 5: 1, 6: 1, 7: 2 };
    expect(roleCounts.outlaw ?? 0).toBe(expectedOutlaws[playerCount]);
    expect(roleCounts.deputy ?? 0).toBe(expectedDeputies[playerCount]);
  });

  it("Sheriff có 5 máu, người khác có 4 máu, và đi lượt đầu tiên", () => {
    const state = setupGame(ids(5), 7);
    const sheriff = state.players.find((p) => p.role === "sheriff")!;

    expect(sheriff.hp).toBe(5);
    expect(sheriff.maxHp).toBe(5);
    for (const player of state.players) {
      if (player.role !== "sheriff") {
        expect(player.hp).toBe(4);
      }
    }

    expect(state.players[state.currentPlayerIndex].role).toBe("sheriff");
    expect(state.turnPhase).toBe("draw");
    expect(state.pending).toEqual([]);
    expect(state.discardPile).toEqual([]);
    expect(state.winner).toBeNull();
  });

  it("mỗi người rút đúng số lá bằng máu hiện có, không ai trùng lá", () => {
    const state = setupGame(ids(6), 9);
    const allHandCards = state.players.flatMap((p) => p.hand);

    for (const player of state.players) {
      expect(player.hand.length).toBe(player.hp);
    }
    expect(new Set(allHandCards).size).toBe(allHandCards.length);
  });

  it("tổng số lá bài (tay + chồng rút) vẫn đủ 80 với bộ mặc định", () => {
    const state = setupGame(ids(6), 9);
    const handTotal = state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(handTotal + state.deck.length + state.discardPile.length).toBe(80);
  });

  it("nhận cardCounts tuỳ chỉnh qua RuleOptions", () => {
    const state = setupGame(ids(4), 1, { cardCounts: { bang: 35 } });
    const handTotal = state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(handTotal + state.deck.length).toBe(90); // 80 + 10 lá bang thêm
  });
});
