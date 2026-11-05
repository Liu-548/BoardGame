// Thư viện vai: đủ mọi vai, thứ tự thức khớp core (để thêm vai mở rộng không quên mô tả).
import { describe, expect, it } from "vitest";
import { ROLE_INFO, wakeOrder } from "../../src/games/werewolf/client/turn";
import { ALL_ROLES } from "../../src/games/werewolf/core/types";

describe("Thư viện vai", () => {
  it("mọi vai đều có mô tả", () => {
    for (const role of ALL_ROLES) expect(ROLE_INFO[role]?.ability.length).toBeGreaterThan(0);
  });
  it("pha thức đúng R-31: bầy Sói, Bảo vệ, Tiên tri, Cupid pha 1; Phù thủy pha 2; còn lại không thức", () => {
    expect(Object.fromEntries(ALL_ROLES.map((r) => [r, wakeOrder(r)]))).toEqual({
      wolf: 1, villager: null, seer: 1, witch: 2, guard: 1, wolf_cub: 1, cursed_wolf: 1,
      hunter: null, elder: null, idiot: null, knight: null, cupid: 1, tanner: null,
    });
  });
  it("phe Sói = 3 loại Sói; Kẻ chán đời phe riêng; tối đa 1 cho mọi vai chức năng", () => {
    expect(ALL_ROLES.filter((r) => ROLE_INFO[r].team === "wolves")).toEqual(["wolf", "wolf_cub", "cursed_wolf"]);
    expect(ALL_ROLES.filter((r) => ROLE_INFO[r].team === "solo")).toEqual(["tanner"]);
    expect(ALL_ROLES.filter((r) => !ROLE_INFO[r].maxOne)).toEqual(["wolf", "villager"]);
  });
});
