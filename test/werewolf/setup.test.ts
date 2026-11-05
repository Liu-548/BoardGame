import { describe, expect, it } from "vitest";
import { setupGame, suggestedConfig, validateConfig } from "../../src/games/werewolf/core/setup";
import type { Config } from "../../src/games/werewolf/core/types";

const mkPlayers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
const cfg = (wolf: number, villager: number, seer = 1, witch = 1, guard = 1): Config => ({
  roleCounts: { wolf, villager, seer, witch, guard },
  nightStepMs: 30_000,
});

describe("T-SET-01 validateConfig", () => {
  it("chấp nhận cấu hình hợp lệ", () => expect(validateConfig(cfg(2, 1), 6)).toBeNull());
  it("tổng ≠ số người", () => expect(validateConfig(cfg(2, 2), 6)).not.toBeNull());
  it("0 Sói", () => expect(validateConfig(cfg(0, 3), 6)).not.toBeNull());
  it("Sói ≥ số không phải Sói", () => expect(validateConfig(cfg(3, 0), 6)).not.toBeNull());
  it("2 Tiên tri", () => expect(validateConfig(cfg(2, 0, 2), 6)).not.toBeNull());
  it("số người < 6 hoặc > 12", () => {
    expect(validateConfig(suggestedConfig(6), 5)).not.toBeNull();
    expect(validateConfig(suggestedConfig(12), 13)).not.toBeNull();
  });
});

describe("T-SET-02 suggestedConfig", () => {
  const table: Record<number, [number, number]> = { 6: [2, 1], 7: [2, 2], 8: [2, 3], 9: [2, 4], 10: [3, 4], 11: [3, 5], 12: [3, 6] };
  for (const n of [6, 7, 8, 9, 10, 11, 12]) {
    it(`n=${n} khớp bảng R-01e và hợp lệ`, () => {
      const c = suggestedConfig(n);
      expect([c.roleCounts.wolf, c.roleCounts.villager]).toEqual(table[n]);
      expect([c.roleCounts.seer, c.roleCounts.witch, c.roleCounts.guard]).toEqual([1, 1, 1]);
      expect(validateConfig(c, n)).toBeNull();
    });
  }
});

describe("setupGame", () => {
  it("T-SET-03 cùng seed → cùng chia vai; khác seed → không luôn giống", () => {
    const c = suggestedConfig(8);
    const rolesOf = (seed: number) => setupGame(mkPlayers(8), seed, c, 0).players.map((p) => p.role).join();
    expect(rolesOf(7)).toBe(rolesOf(7));
    expect(new Set(Array.from({ length: 20 }, (_, i) => rolesOf(i + 1))).size).toBeGreaterThan(1);
  });

  it("chia đúng số lượng từng vai, ghế theo thứ tự truyền vào", () => {
    const s = setupGame(mkPlayers(8), 1, suggestedConfig(8), 0);
    expect(s.players.map((p) => p.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.players.filter((p) => p.role === "wolf")).toHaveLength(2);
    expect(s.players.filter((p) => p.role === "villager")).toHaveLength(3);
  });

  it("T-SET-04 pha đầu là đêm 1, phaseSeq=1, phaseEndsAt=now+nightStepMs", () => {
    const s = setupGame(mkPlayers(6), 1, suggestedConfig(6), 1000);
    expect(s.phase).toEqual({ kind: "night", night: 1, step: "guard" });
    expect(s.phaseSeq).toBe(1);
    expect(s.phaseEndsAt).toBe(31_000);
  });

  it("T-SET-05 nightSteps đúng thứ tự, bỏ vai không có", () => {
    expect(setupGame(mkPlayers(6), 1, suggestedConfig(6), 0).nightSteps).toEqual(["guard", "wolves", "seer", "witch"]);
    const noGuardSeer = setupGame(mkPlayers(6), 1, cfg(2, 2, 0, 1, 0), 0);
    expect(noGuardSeer.nightSteps).toEqual(["wolves", "witch"]);
    expect(noGuardSeer.phase).toEqual({ kind: "night", night: 1, step: "wolves" });
    // ca biên: chỉ Sói + Dân
    expect(setupGame(mkPlayers(6), 1, cfg(2, 4, 0, 0, 0), 0).nightSteps).toEqual(["wolves"]);
  });

  it("T-SET-06 state là JSON thuần", () => {
    const s = setupGame(mkPlayers(9), 3, suggestedConfig(9), 5);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
