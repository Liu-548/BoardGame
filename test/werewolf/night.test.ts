import { describe, expect, it } from "vitest";
import { act, makeGame, reject, skipTo, STD6, timeUp } from "./helpers";
import { reduce, GENERIC_ERROR } from "../../src/games/werewolf/core/reduce";

// STD6: p0,p1 Sói; p2 Tiên tri; p3 Phù thủy; p4 Bảo vệ; p5 Dân
const toWolves = (s = makeGame(STD6)) => skipTo(s, { kind: "night", step: "first" });
const toWitch = (s = makeGame(STD6)) => skipTo(s, { kind: "night", step: "second" });
const dawn = (s: ReturnType<typeof makeGame>) => timeUp(s); // hết pha 2 → Bình minh

describe("T-NIGHT Bảo vệ", () => {
  it("T-N-01 chọn chính mình được", () => {
    expect(act(makeGame(STD6), { type: "GUARD_PICK", playerId: "p4", targetId: "p4" }).guardTarget).toBe("p4");
  });
  it("T-N-02 không chọn lại người đêm trước; đêm trước bỏ qua thì chọn tự do", () => {
    let s = makeGame(STD6);
    s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p0" });
    s = dawn(skipTo(s, { kind: "night", step: "second" }));
    expect(s.lastGuardTarget).toBe("p0");
    // sang đêm 2 (W3 chưa có) → dựng tay
    const n2 = { ...s, phase: { kind: "night" as const, night: 2, step: "first" as const }, guardTarget: null };
    reject(n2, { type: "GUARD_PICK", playerId: "p4", targetId: "p0" });
    act({ ...n2, lastGuardTarget: null }, { type: "GUARD_PICK", playerId: "p4", targetId: "p0" });
  });
  it("T-N-03 đổi lựa chọn → giữ lựa chọn cuối", () => {
    let s = makeGame(STD6);
    s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p0" });
    s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p1" });
    expect(s.guardTarget).toBe("p1");
  });
  it("T-N-04 lỗi cùng một câu cho người sai vai và người đúng vai sai pha", () => {
    const s = makeGame(STD6);
    const wrongRole = reject(s, { type: "GUARD_PICK", playerId: "p5", targetId: "p0" });
    const wrongPhase = reject(toWitch(s), { type: "GUARD_PICK", playerId: "p4", targetId: "p0" }); // Bảo vệ không thức ở pha 2
    expect(wrongRole).toBe(GENERIC_ERROR);
    expect(wrongPhase).toBe(wrongRole);
  });
});

describe("T-NIGHT Sói", () => {
  const wolves8 = ["wolf", "wolf", "wolf", "seer", "witch", "guard", "villager", "villager"] as const;
  it("T-N-05 đa số phiếu", () => {
    let s = toWolves(makeGame([...wolves8]));
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p6" });
    s = act(s, { type: "WOLF_PICK", playerId: "p1", targetId: "p6" });
    s = act(s, { type: "WOLF_PICK", playerId: "p2", targetId: "p7" });
    expect(timeUp(s).bittenId).toBe("p6");
  });
  it("T-N-06 hoà phiếu → 1 trong 2, cùng seed cùng kết quả", () => {
    const run = (seed: number) => {
      let s = toWolves(makeGame(STD6, { seed }));
      s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p4" });
      s = act(s, { type: "WOLF_PICK", playerId: "p1", targetId: "p5" });
      return timeUp(s).bittenId;
    };
    expect(["p4", "p5"]).toContain(run(3));
    expect(run(3)).toBe(run(3));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(run)).size).toBe(2);
  });
  it("T-N-07 chỉ 1 Sói chọn → người đó bị cắn", () => {
    const s = act(toWolves(), { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    expect(timeUp(s).bittenId).toBe("p5");
  });
  it("T-N-08 không ai chọn → bittenId null, sáng không ai chết", () => {
    const s = timeUp(toWolves());
    expect(s.bittenId).toBeNull();
    expect(dawn(toWitch()).lastNightDeaths).toEqual([]);
  });
  it("T-N-09 Sói chọn Sói khác / chính mình hợp lệ", () => {
    let s = toWolves();
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p1" });
    s = act(s, { type: "WOLF_PICK", playerId: "p1", targetId: "p1" });
    expect(timeUp(s).bittenId).toBe("p1");
  });
  it("T-N-10 Sói đã chết gửi WOLF_PICK → lỗi", () => {
    const s = toWolves();
    const dead = { ...s, players: s.players.map((p) => (p.id === "p0" ? { ...p, alive: false } : p)) };
    reject(dead, { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
  });
  it("bỏ chọn (null) xoá phiếu", () => {
    let s = act(toWolves(), { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: null });
    expect(s.wolfPicks).toEqual({});
  });
});

describe("T-NIGHT Tiên tri", () => {
  const toSeer = () => skipTo(makeGame(STD6), { kind: "night", step: "first" });
  it("T-N-11 soi Sói → true; soi Phù thủy → false", () => {
    expect(act(toSeer(), { type: "SEER_PICK", playerId: "p2", targetId: "p0" }).seerResults[0].isWolf).toBe(true);
    expect(act(toSeer(), { type: "SEER_PICK", playerId: "p2", targetId: "p3" }).seerResults[0].isWolf).toBe(false);
  });
  it("T-N-12 soi mình → lỗi; soi lần 2 → lỗi", () => {
    reject(toSeer(), { type: "SEER_PICK", playerId: "p2", targetId: "p2" });
    const s = act(toSeer(), { type: "SEER_PICK", playerId: "p2", targetId: "p0" });
    reject(s, { type: "SEER_PICK", playerId: "p2", targetId: "p1" });
  });
});

function bitten(target: string) {
  let s = toWolves();
  s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: target });
  return skipTo(s, { kind: "night", step: "second" });
}

describe("T-NIGHT Phù thủy", () => {
  it("T-N-13 thấy bittenId kể cả khi người đó được Bảo vệ", () => {
    let s = act(makeGame(STD6), { type: "GUARD_PICK", playerId: "p4", targetId: "p5" });
    s = act(toWolves(s), { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    expect(skipTo(s, { kind: "night", step: "second" }).bittenId).toBe("p5");
  });
  it("T-N-14 cứu khi không ai bị cắn / hết bình → lỗi", () => {
    reject(toWitch(), { type: "WITCH_SET", playerId: "p3", save: true, poisonTarget: null });
    const s = { ...bitten("p5"), potions: { save: false, poison: true } };
    reject(s, { type: "WITCH_SET", playerId: "p3", save: true, poisonTarget: null });
    expect(s.bittenId).toBe("p5");
  });
  it("T-N-15 tự cứu khi bị cắn đêm 1 → sống", () => {
    const s = act(bitten("p3"), { type: "WITCH_SET", playerId: "p3", save: true, poisonTarget: null });
    expect(dawn(s).players[3].alive).toBe(true);
  });
  it("T-N-16 độc chính mình OK; độc người chết → lỗi", () => {
    act(toWitch(), { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p3" });
    const s = toWitch();
    const dead = { ...s, players: s.players.map((p) => (p.id === "p5" ? { ...p, alive: false } : p)) };
    reject(dead, { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p5" });
  });
  it("T-N-17 dùng cả 2 bình 1 đêm", () => {
    const s = act(bitten("p5"), { type: "WITCH_SET", playerId: "p3", save: true, poisonTarget: "p0" });
    const d = dawn(s);
    expect(d.players[5].alive).toBe(true);
    expect(d.players[0].alive).toBe(false);
    expect(d.potions).toEqual({ save: false, poison: false });
  });
  it("T-N-18 bình chỉ trừ ở Bình minh; bỏ cứu trước hết pha → còn bình", () => {
    let s = act(bitten("p5"), { type: "WITCH_SET", playerId: "p3", save: true, poisonTarget: null });
    expect(s.potions.save).toBe(true);
    s = act(s, { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: null });
    const d = dawn(s);
    expect(d.potions.save).toBe(true);
    expect(d.players[5].alive).toBe(false);
  });
});

describe("T-DAWN", () => {
  const bite = (target: string, guard: string | null, save: boolean, poison: string | null = null) => {
    let s = makeGame(STD6);
    if (guard) s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: guard });
    s = act(toWolves(s), { type: "WOLF_PICK", playerId: "p0", targetId: target });
    s = skipTo(s, { kind: "night", step: "second" });
    if (save || poison) s = act(s, { type: "WITCH_SET", playerId: "p3", save, poisonTarget: poison });
    return dawn(s);
  };
  it("T-DW-01 cắn không cứu → chết", () => expect(bite("p5", null, false).players[5].alive).toBe(false));
  it("T-DW-02 Bảo vệ → sống", () => expect(bite("p5", "p5", false).players[5].alive).toBe(true));
  it("T-DW-03 bình cứu → sống", () => expect(bite("p5", null, true).players[5].alive).toBe(true));
  it("T-DW-04 Bảo vệ + bình cứu → sống", () => expect(bite("p5", "p5", true).players[5].alive).toBe(true));
  it("T-DW-05 độc + Bảo vệ → chết", () => expect(bite("p0", "p5", false, "p5").players[5].alive).toBe(false));
  it("T-DW-06 cắn A + độc B → xếp theo ghế", () => {
    const d = bite("p5", null, false, "p0");
    expect(d.lastNightDeaths).toEqual(["p0", "p5"]);
    expect(d.phase.kind).toBe("discussion");
  });
  it("T-DW-07 Phù thủy bị cắn vẫn dùng bình trong pha của mình", () => {
    const s = act(bitten("p3"), { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p0" });
    expect(dawn(s).players[0].alive).toBe(false);
  });
  it("T-DW-08 không ai chết → []", () => expect(dawn(toWitch()).lastNightDeaths).toEqual([]));
  it("Bình minh kiểm thắng: giết hết Dân → Sói thắng", () => {
    const s = makeGame(["wolf", "villager", "villager"] as never);
    const d = dawn({ ...s, phase: { kind: "night", night: 1, step: "first" }, wolfPicks: { p0: "p1" }, players: s.players.map((p) => (p.id === "p2" ? { ...p, alive: false } : p)) });
    expect(d.phase).toEqual({ kind: "ended", winner: "wolves" });
    expect(d.phaseEndsAt).toBeNull();
  });
});

describe("T-TIME", () => {
  it("T-T-01/05 action ban đêm không đổi phaseEndsAt dù now khác nhau", () => {
    const s = makeGame(STD6);
    const s2 = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p0", now: 99_999 });
    expect(s2.phaseEndsAt).toBe(s.phaseEndsAt);
    expect(s2.phaseSeq).toBe(s.phaseSeq);
  });
  it("T-T-02 vai đã chết: pha vẫn đủ giờ, chỉ TIME_UP mới đi tiếp (R-81)", () => {
    const s = makeGame(STD6);
    const dead = { ...s, players: s.players.map((p) => (p.id === "p4" ? { ...p, alive: false } : p)) };
    expect(dead.phase).toMatchObject({ step: "first" });
    expect(dead.phaseEndsAt).toBe(31_000);
    expect(timeUp(dead).phase).toMatchObject({ step: "second" });
  });
  it("T-T-03 TIME_UP phaseSeq cũ → không đổi, không lỗi", () => {
    const s = makeGame(STD6);
    const r = reduce(s, { type: "TIME_UP", phaseSeq: s.phaseSeq - 1, now: 99_999 });
    expect(r.error).toBeUndefined();
    expect(r.state).toBe(s);
  });
  it("T-T-04 đổi pha → phaseSeq+1, phaseEndsAt = now + thời lượng", () => {
    const s = makeGame(STD6);
    const n = timeUp(s);
    expect(n.phaseSeq).toBe(s.phaseSeq + 1);
    expect(n.phaseEndsAt).toBe(31_000 + 30_000);
    expect(dawn(toWitch()).phaseEndsAt).toBe(toWitch().phaseEndsAt! + 180_000);
  });
});

describe("T-PURE", () => {
  it("T-P-02 cùng seed + log → cùng state cuối", () => {
    const run = () => {
      let s = toWolves(makeGame(STD6, { seed: 5 }));
      s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p4" });
      s = act(s, { type: "WOLF_PICK", playerId: "p1", targetId: "p5" });
      return dawn(skipTo(s, { kind: "night", step: "second" }));
    };
    expect(run()).toEqual(run());
  });
  it("T-P-03 core không dùng Math.random/Date.now/crypto", () => {
    // import.meta.glob là của Vite; ép kiểu vì tsconfig không nạp kiểu vite/client.
    const files = (import.meta as unknown as { glob: (p: string, o: object) => Record<string, string> }).glob(
      "../../src/games/werewolf/core/*.ts",
      { query: "?raw", import: "default", eager: true },
    );
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const text of Object.values(files)) expect(text).not.toMatch(/Math\.random|Date\.now|crypto/);
  });
});

describe("R-31 gộp pha: các vai cùng pha thức cùng lúc", () => {
  it("pha 1: Sói, Bảo vệ, Tiên tri cùng hành động; Phù thủy chưa được", () => {
    let s = makeGame(STD6);
    expect(s.phase).toEqual({ kind: "night", night: 1, step: "first" });
    s = act(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p5" });
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    s = act(s, { type: "SEER_PICK", playerId: "p2", targetId: "p0" });
    reject(s, { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p0" });
    expect([s.guardTarget, s.wolfPicks, s.seerPick]).toEqual(["p5", { p0: "p5" }, "p0"]);
  });
  it("pha 2: Phù thủy biết người bị cắn; Sói/Bảo vệ/Tiên tri không hành động được nữa", () => {
    const s = timeUp(act(makeGame(STD6), { type: "WOLF_PICK", playerId: "p0", targetId: "p5" }));
    expect(s.phase).toEqual({ kind: "night", night: 1, step: "second" });
    expect(s.bittenId).toBe("p5");
    reject(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p4" });
    reject(s, { type: "GUARD_PICK", playerId: "p4", targetId: "p5" });
    reject(s, { type: "SEER_PICK", playerId: "p2", targetId: "p1" });
    act(s, { type: "WITCH_SET", playerId: "p3", save: true, poisonTarget: null });
  });
  it("đêm chỉ có 2 lần TIME_UP: pha 1 → pha 2 → Bình minh", () => {
    const s = timeUp(timeUp(makeGame(STD6)));
    expect(s.phase).toEqual({ kind: "discussion", day: 1 });
  });
});
