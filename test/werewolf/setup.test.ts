import { describe, expect, it } from "vitest";
import { setupGame, suggestedConfig, validateConfig } from "../../src/games/werewolf/core/setup";
import { reduce } from "../../src/games/werewolf/core/reduce";
import type { Config } from "../../src/games/werewolf/core/types";
import { ALL_ROLES } from "../../src/games/werewolf/core/types";

const mkPlayers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
const cfg = (wolf: number, villager: number, seer = 1, witch = 1, guard = 1): Config => ({
  roleCounts: { ...(Object.fromEntries(ALL_ROLES.map((r) => [r, 0])) as Config["roleCounts"]), wolf, villager, seer, witch, guard },
  nightStepMs: 30_000,
  mayor: false,
});

describe("T-SET-01 validateConfig", () => {
  it("chấp nhận cấu hình hợp lệ", () => expect(validateConfig(cfg(2, 1), 6)).toBeNull());
  it("tổng ≠ số người", () => expect(validateConfig(cfg(2, 2), 6)).not.toBeNull());
  it("0 Sói", () => expect(validateConfig(cfg(0, 3), 6)).not.toBeNull());
  it("Sói ≥ số không phải Sói", () => expect(validateConfig(cfg(3, 0), 6)).not.toBeNull());
  it("2 Tiên tri", () => expect(validateConfig(cfg(2, 0, 2), 6)).not.toBeNull());
  it("số người < 6 hoặc > 20", () => {
    expect(validateConfig(suggestedConfig(6), 5)).not.toBeNull();
    expect(validateConfig(suggestedConfig(20), 21)).not.toBeNull();
  });
});

describe("T-SET-02 suggestedConfig", () => {
  const table: Record<number, [number, number]> = {
    6: [2, 1], 7: [2, 2], 8: [2, 3], 9: [2, 4], 10: [3, 4], 11: [3, 5], 12: [3, 6],
    13: [3, 7], 14: [4, 7], 15: [4, 8], 16: [4, 9], 17: [4, 10], 18: [5, 10], 19: [5, 11], 20: [5, 12],
  };
  for (const n of Object.keys(table).map(Number)) {
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

  it("T-SET-04 pha đầu là Xem vai 6 giây (R-30a); hết giờ → Đêm 1, phaseSeq+1, phaseEndsAt=now+nightStepMs", () => {
    const s = setupGame(mkPlayers(6), 1, suggestedConfig(6), 1000);
    expect(s.phase).toEqual({ kind: "reveal" });
    expect(s.phaseSeq).toBe(1);
    expect(s.phaseEndsAt).toBe(7_000);
    const n = reduce(s, { type: "TIME_UP", phaseSeq: 1, now: 7_000 }).state;
    expect(n.phase).toEqual({ kind: "night", night: 1, step: "first" });
    expect(n.phaseSeq).toBe(2);
    expect(n.phaseEndsAt).toBe(37_000);
  });

  it("T-SET-07 trong pha Xem vai không ai hành động được; TIME_UP cũ bị bỏ qua (R-30a, D-21)", () => {
    const s = setupGame(mkPlayers(6), 1, suggestedConfig(6), 1000);
    const wolf = s.players.find((p) => p.role === "wolf")!.id;
    const guard = s.players.find((p) => p.role === "guard")!.id;
    for (const a of [
      { type: "GUARD_PICK", playerId: guard, targetId: guard, now: 2000 },
      { type: "WOLF_PICK", playerId: wolf, targetId: guard, now: 2000 },
      { type: "TOGGLE_END_EARLY", playerId: wolf, now: 2000 },
      { type: "CAST_VOTE", playerId: wolf, targetId: "blank", now: 2000 },
    ] as const) {
      const r = reduce(s, a);
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    expect(reduce(s, { type: "TIME_UP", phaseSeq: 0, now: 9_000 }).state).toBe(s);
  });

  it("T-SET-05 nightSteps đúng thứ tự, bỏ vai không có", () => {
    expect(setupGame(mkPlayers(6), 1, suggestedConfig(6), 0).nightSteps).toEqual(["first", "second"]);
    const noGuardSeer = setupGame(mkPlayers(6), 1, cfg(2, 2, 0, 1, 0), 0);
    expect(noGuardSeer.nightSteps).toEqual(["first", "second"]);
    expect(reduce(noGuardSeer, { type: "TIME_UP", phaseSeq: 1, now: 0 }).state.phase).toEqual({ kind: "night", night: 1, step: "first" });
    // ca biên: chỉ Sói + Dân
    expect(setupGame(mkPlayers(6), 1, cfg(2, 4, 0, 0, 0), 0).nightSteps).toEqual(["first"]); // không có Phù thủy → không có pha 2
  });

  it("T-SET-06 state là JSON thuần", () => {
    const s = setupGame(mkPlayers(9), 3, suggestedConfig(9), 5);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
