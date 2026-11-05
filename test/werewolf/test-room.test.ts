// Phòng test (bản beta): chủ phòng tự gán vai.
import { describe, expect, it } from "vitest";
import { setupWithRoles } from "../../src/games/werewolf/server/room";
import type { Config } from "../../src/games/werewolf/core/types";

const players = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, name: id.toUpperCase() }));
const config = { roleCounts: { wolf: 1, villager: 5, seer: 0, witch: 0, guard: 0 }, nightStepMs: 15_000, mayor: false } as Config;

describe("Phòng test — gán vai", () => {
  it("vai đúng như gán, số lượng vai tính lại theo bảng gán, giữ thời gian đêm", () => {
    const roles = { a: "villager", b: "wolf", c: "wolf", d: "seer", e: "witch", f: "guard" };
    const r = setupWithRoles(players, 7, config, 1000, roles);
    if ("error" in r) throw new Error(r.error);
    expect(r.state.players.map((p) => p.role)).toEqual(["villager", "wolf", "wolf", "seer", "witch", "guard"]);
    expect(r.state.config.roleCounts).toMatchObject({ wolf: 2, villager: 1, seer: 1, witch: 1, guard: 1 });
    expect(r.state.config.nightStepMs).toBe(15_000);
    expect(r.state.nightSteps).toEqual(["first", "second"]);
    expect(r.state.phase).toEqual({ kind: "reveal" });
  });
  it("thiếu người chưa gán hoặc gán vai lạ → báo lỗi kèm tên", () => {
    expect(setupWithRoles(players, 1, config, 0, { a: "wolf" })).toEqual({ error: "Chưa gán vai cho B" });
    expect(setupWithRoles(players, 1, config, 0, { a: "wolf", b: "hacker", c: "villager", d: "villager", e: "villager", f: "villager" })).toEqual({ error: "Chưa gán vai cho B" });
  });
  it("bảng gán không hợp lệ theo luật (vd 0 Sói, 2 Tiên tri) → từ chối", () => {
    const noWolf = setupWithRoles(players, 1, config, 0, Object.fromEntries(players.map((p) => [p.id, "villager"])));
    expect("error" in noWolf).toBe(true);
    const twoSeers = setupWithRoles(players, 1, config, 0, { a: "seer", b: "seer", c: "wolf", d: "villager", e: "villager", f: "villager" });
    expect("error" in twoSeers).toBe(true);
  });
});
