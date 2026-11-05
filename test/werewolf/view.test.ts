import { describe, expect, it } from "vitest";
import { act, makeGame, skipTo, STD6, timeUp } from "./helpers";
import { viewFor } from "../../src/games/werewolf/core/view";
import type { WerewolfView } from "../../src/games/werewolf/core/view";
import type { GameState, NightStep } from "../../src/games/werewolf/core/types";

// STD6: p0,p1 Sói; p2 Tiên tri; p3 Phù thủy; p4 Bảo vệ; p5 Dân
const V8 = ["wolf", "wolf", "seer", "witch", "guard", "villager", "villager", "villager"] as const;
const roleOf = (v: WerewolfView, id: string) => v.players.find((p) => p.id === id)!.role;
const at = (step: NightStep, s = makeGame(STD6)) => skipTo(s, { kind: "night", step });
const j = (s: GameState, id: string) => JSON.stringify(viewFor(s, id));

describe("T-VIEW vai", () => {
  const s = makeGame(STD6);
  it("T-V-01 Dân không thấy vai người khác", () => {
    const v = viewFor(s, "p5");
    expect(roleOf(v, "p5")).toBe("villager");
    for (const id of ["p0", "p1", "p2", "p3", "p4"]) expect(roleOf(v, id)).toBeUndefined();
  });
  it("T-V-02 Sói thấy Sói khác, không thấy chức năng", () => {
    const v = viewFor(s, "p0");
    expect(roleOf(v, "p1")).toBe("wolf");
    for (const id of ["p2", "p3", "p4", "p5"]) expect(roleOf(v, id)).toBeUndefined();
  });
  it("T-V-07 người chết thấy vai mọi người", () => {
    const dead = { ...s, players: s.players.map((p) => (p.id === "p5" ? { ...p, alive: false } : p)) };
    const v = viewFor(dead, "p5");
    expect(v.players.every((p) => p.role !== undefined)).toBe(true);
  });
  it("T-V-08 hết ván ai cũng thấy vai", () => {
    const ended = { ...s, phase: { kind: "ended" as const, winner: "wolves" as const }, phaseEndsAt: null };
    expect(viewFor(ended, "p5").players.every((p) => p.role !== undefined)).toBe(true);
  });
});

describe("T-VIEW thông tin đêm", () => {
  it("T-V-03 wolfPicks: chỉ Sói sống, trong pha 1", () => {
    let s = at("first");
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    expect(viewFor(s, "p1").wolfPicks).toEqual({ p0: "p5" });
    for (const id of ["p2", "p3", "p4", "p5"]) expect(viewFor(s, id).wolfPicks).toBeUndefined();
    const dead = { ...s, players: s.players.map((p) => (p.id === "p5" ? { ...p, alive: false } : p)) };
    expect(viewFor(dead, "p5").wolfPicks).toBeUndefined();
    expect(viewFor(at("second", s), "p0").wolfPicks).toBeUndefined(); // hết pha 1 thì không còn thấy
  });
  it("T-V-04 bittenId chỉ Phù thủy, chỉ từ pha 2", () => {
    let s = at("first");
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    expect(viewFor(at("first", s), "p3").witch?.bittenId).toBeNull();
    const w = at("second", s);
    expect(viewFor(w, "p3").witch?.bittenId).toBe("p5");
    for (const id of ["p0", "p2", "p4", "p5"]) expect(JSON.stringify(viewFor(w, id))).not.toContain("bittenId");
  });
  it("T-V-05 seerResults chỉ Tiên tri", () => {
    let s = at("first");
    s = act(s, { type: "SEER_PICK", playerId: "p2", targetId: "p0" });
    expect(viewFor(s, "p2").seer?.results).toHaveLength(1);
    for (const id of ["p0", "p3", "p4", "p5"]) expect(viewFor(s, id).seer).toBeUndefined();
  });
  it("T-V-06 số bình chỉ Phù thủy", () => {
    const s = at("second");
    expect(viewFor(s, "p3").witch?.potions).toEqual({ save: true, poison: true });
    for (const id of ["p0", "p2", "p4", "p5"]) expect(viewFor(s, id).witch).toBeUndefined();
  });
  it("T-V-09 không lộ rngState/token/guardTarget/witchPoisonTarget", () => {
    let s = at("first");
    s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p5" });
    s = at("second", s);
    s = act(s, { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p5" });
    for (const id of ["p0", "p1", "p2", "p3", "p4", "p5"]) {
      const t = j(s, id);
      expect(t).not.toContain("rngState");
      expect(t).not.toContain("token");
      expect(t).not.toContain("guardTarget");
      expect(t).not.toContain("witchPoisonTarget");
    }
    expect(viewFor(s, "p3").witch?.poisonTarget).toBe("p5");
    expect(viewFor(makeGame(STD6), "p4").guard).toBeDefined();
  });
  it("T-V-10 mọi pha đêm: 2 Dân có view giống hệt (bỏ trường của tôi)", () => {
    let s = makeGame([...V8], { seed: 2 });
    s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p5" });
    for (const step of ["first", "second"] as NightStep[]) {
      s = at(step, s);
      const strip = (id: string) => {
        const v = viewFor(s, id) as unknown as Record<string, unknown>;
        const { viewerId, myRole, players, ...rest } = v;
        void viewerId; void myRole; void players;
        return JSON.stringify(rest);
      };
      expect(strip("p5")).toBe(strip("p6"));
      const pl = (id: string) => JSON.stringify(viewFor(s, id).players.map(({ role, ...r }) => (void role, r)));
      expect(pl("p5")).toBe(pl("p6"));
    }
  });
});

describe("T-VIEW gói tin chỉ gửi khi đổi (D-30)", () => {
  const others = (s: GameState, ids: string[]) => ids.map((id) => j(s, id));
  it("T-V-11 Bảo vệ đổi lựa chọn → chỉ view Bảo vệ đổi", () => {
    const s = makeGame(STD6);
    const s2 = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p0" });
    expect(others(s2, ["p0", "p1", "p2", "p3", "p5"])).toEqual(others(s, ["p0", "p1", "p2", "p3", "p5"]));
    expect(j(s2, "p4")).not.toBe(j(s, "p4"));
  });
  it("T-V-12 Tiên tri / Phù thủy / Sói đổi → chỉ người liên quan đổi", () => {
    const sSeer = at("first");
    const s2 = act(sSeer, { type: "SEER_PICK", playerId: "p2", targetId: "p0" });
    expect(others(s2, ["p0", "p1", "p3", "p4", "p5"])).toEqual(others(sSeer, ["p0", "p1", "p3", "p4", "p5"]));
    let w = at("first");
    w = act(w, { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    const w2 = act(w, { type: "WOLF_PICK", playerId: "p0", targetId: "p4" });
    expect(others(w2, ["p2", "p3", "p4", "p5"])).toEqual(others(w, ["p2", "p3", "p4", "p5"]));
    expect(j(w2, "p1")).not.toBe(j(w, "p1"));
    let t = at("second");
    const t2 = act(t, { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p5" });
    expect(others(t2, ["p0", "p1", "p2", "p4", "p5"])).toEqual(others(t, ["p0", "p1", "p2", "p4", "p5"]));
    t = timeUp(t2);
  });
  it("T-V-13 ban ngày: votes/verdicts/endEarly có trong view mọi người", () => {
    let s = skipTo(makeGame(STD6), { kind: "discussion" });
    s = act(s, { type: "TOGGLE_END_EARLY", playerId: "p0" });
    expect(viewFor(s, "p5").endEarly).toEqual({ p0: true });
    s = timeUp(s);
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p5" });
    for (const id of ["p0", "p3", "p5"]) expect(viewFor(s, id).votes).toEqual({ p0: "p5" });
    s = timeUp(s);
    s = timeUp(s);
    s = act(s, { type: "CAST_VERDICT", playerId: "p0", choice: "kill" });
    expect(viewFor(s, "p4").verdicts).toEqual({ p0: "kill" });
  });
});
