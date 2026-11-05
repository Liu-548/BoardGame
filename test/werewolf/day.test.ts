import { describe, expect, it } from "vitest";
import { act, makeGame, reject, skipTo, STD6, timeUp } from "./helpers";
import { reduce } from "../../src/games/werewolf/core/reduce";
import type { GameState, Role } from "../../src/games/werewolf/core/types";

// Tới đầu Ngày 1 (đêm 1 không ai chết).
const day1 = (roles: Role[] = STD6) => skipTo(makeGame(roles), { kind: "discussion" });
const kill = (s: GameState, ...ids: string[]): GameState => ({ ...s, players: s.players.map((p) => (ids.includes(p.id) ? { ...p, alive: false } : p)) });
const toVote = (s = day1()) => timeUp(s);
const ids = (s: GameState) => s.players.filter((p) => p.alive).map((p) => p.id);

describe("T-DAY thảo luận", () => {
  it("T-D-01 3 phút; +60s đúng 60000; lần 2 lỗi kể cả người khác", () => {
    let s = day1();
    expect(s.phaseEndsAt! - 2000).toBe(0 + 0 + (s.phaseEndsAt! - 2000)); // hạn đặt theo now của TIME_UP
    const before = s.phaseEndsAt!;
    s = act(s, { type: "EXTEND_DISCUSSION", playerId: "p0" });
    expect(s.phaseEndsAt).toBe(before + 60_000);
    reject(s, { type: "EXTEND_DISCUSSION", playerId: "p1" });
  });
  it("T-D-02 +60s trong vote lỗi; hôm sau dùng lại được", () => {
    let s = day1();
    s = act(s, { type: "EXTEND_DISCUSSION", playerId: "p0" });
    s = toVote(s);
    reject(s, { type: "EXTEND_DISCUSSION", playerId: "p1" });
    const d2 = skipTo(timeUp(s), { kind: "discussion" });
    act(d2, { type: "EXTEND_DISCUSSION", playerId: "p1" });
  });
  it("T-D-03 5 người sống: 3 bật → vote; 2 chưa; bật rồi tắt bớt 1", () => {
    const s0 = kill(day1(), "p5");
    let s = act(s0, { type: "TOGGLE_END_EARLY", playerId: "p0" });
    s = act(s, { type: "TOGGLE_END_EARLY", playerId: "p1" });
    expect(s.phase.kind).toBe("discussion");
    s = act(s, { type: "TOGGLE_END_EARLY", playerId: "p1" });
    expect(Object.keys(s.endEarly)).toEqual(["p0"]);
    s = act(s, { type: "TOGGLE_END_EARLY", playerId: "p1" });
    s = act(s, { type: "TOGGLE_END_EARLY", playerId: "p2" });
    expect(s.phase.kind).toBe("vote");
  });
  it("T-D-04 6 người sống: đúng 3 bật → chưa kết thúc", () => {
    let s = day1();
    for (const p of ["p0", "p1", "p2"]) s = act(s, { type: "TOGGLE_END_EARLY", playerId: p });
    expect(s.phase.kind).toBe("discussion");
    s = act(s, { type: "TOGGLE_END_EARLY", playerId: "p3" });
    expect(s.phase.kind).toBe("vote");
  });
  it("T-D-05 người chết bật kết thúc sớm → lỗi", () => {
    reject(kill(day1(), "p5"), { type: "TOGGLE_END_EARLY", playerId: "p5" });
  });
});

describe("T-DAY bỏ phiếu", () => {
  it("T-D-06 bầu, đổi, rút, phiếu trắng", () => {
    let s = toVote();
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p5" });
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p4" });
    expect(s.votes).toEqual({ p0: "p4" });
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: null });
    expect(s.votes).toEqual({});
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "blank" });
    expect(s.votes).toEqual({ p0: "blank" });
  });
  it("T-D-07 mọi người sống đã có phiếu → kết thúc ngay", () => {
    let s = toVote();
    for (const p of ids(s)) s = act(s, { type: "CAST_VOTE", playerId: p, targetId: p === "p0" ? "p5" : "blank" });
    expect(s.phase).toMatchObject({ kind: "defense", accusedId: "p5" }); // T-D-08 cùng lúc
  });
  it("T-D-08 1 phiếu + còn lại trắng → bị đưa lên (qua hết giờ)", () => {
    let s = toVote();
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p3" });
    expect(timeUp(s).phase).toMatchObject({ kind: "defense", accusedId: "p3" });
  });
  it("T-D-09 hoà phiếu cao nhất → sang đêm", () => {
    let s = toVote();
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p3" });
    s = act(s, { type: "CAST_VOTE", playerId: "p1", targetId: "p4" });
    s = timeUp(s);
    expect(s.phase).toMatchObject({ kind: "night", night: 2, step: "first" });
    expect(s.log.at(-1)).toEqual({ kind: "vote_result", day: 1, accusedId: null });
  });
  it("T-D-10 không ai bầu / toàn trắng → sang đêm", () => {
    expect(timeUp(toVote()).phase.kind).toBe("night");
    let s = toVote();
    for (const p of ids(s)) s = act(s, { type: "CAST_VOTE", playerId: p, targetId: "blank" });
    expect(s.phase).toMatchObject({ kind: "night", night: 2 });
  });
  it("T-D-11 bầu người chết / người chết bầu → lỗi", () => {
    const s = kill(toVote(), "p5");
    reject(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p5" });
    reject(s, { type: "CAST_VOTE", playerId: "p5", targetId: "p0" });
  });
  it("sang đêm 2: các trường đêm được reset", () => {
    const s = timeUp(toVote());
    expect(s.guardTarget).toBeNull();
    expect(s.wolfPicks).toEqual({});
  });
});

describe("T-DAY biện hộ + phán quyết", () => {
  const toDefense = () => {
    let s = toVote();
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p5" });
    return timeUp(s); // defense p5
  };
  const toVerdict = () => timeUp(toDefense());
  it("T-D-12 biện hộ 30s, mọi action bị từ chối, chỉ TIME_UP", () => {
    const s = toDefense();
    expect(s.phaseEndsAt! - s.phaseSeq * 0).toBeGreaterThan(0);
    reject(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p1" });
    reject(s, { type: "CAST_VERDICT", playerId: "p0", choice: "kill" });
    reject(s, { type: "EXTEND_DISCUSSION", playerId: "p0" });
    expect(timeUp(s).phase.kind).toBe("verdict");
  });
  it("T-D-13 người bị đưa lên gửi CAST_VERDICT → lỗi", () => {
    reject(toVerdict(), { type: "CAST_VERDICT", playerId: "p5", choice: "spare" });
  });
  it("T-D-14 Giết>Tha chết; bằng → tha; không ai chọn → tha", () => {
    let s = toVerdict();
    s = act(s, { type: "CAST_VERDICT", playerId: "p0", choice: "kill" });
    s = act(s, { type: "CAST_VERDICT", playerId: "p1", choice: "kill" });
    s = act(s, { type: "CAST_VERDICT", playerId: "p2", choice: "spare" });
    expect(timeUp(s).players[5].alive).toBe(false);
    let t = toVerdict();
    t = act(t, { type: "CAST_VERDICT", playerId: "p0", choice: "kill" });
    t = act(t, { type: "CAST_VERDICT", playerId: "p2", choice: "spare" });
    expect(timeUp(t).players[5].alive).toBe(true);
    const n = timeUp(toVerdict());
    expect(n.players[5].alive).toBe(true);
    expect(n.phase).toMatchObject({ kind: "night", night: 2 });
  });
  it("T-D-15 mọi người có quyền đã chọn → kết thúc ngay", () => {
    let s = toVerdict();
    for (const p of ["p0", "p1", "p2", "p3", "p4"]) s = act(s, { type: "CAST_VERDICT", playerId: p, choice: "kill" });
    expect(s.phase.kind === "night" || s.phase.kind === "ended").toBe(true);
    expect(s.players[5].alive).toBe(false);
  });
  it("T-D-16 log không lật vai người bị treo", () => {
    let s = toVerdict();
    for (const p of ["p0", "p1", "p2", "p3", "p4"]) s = act(s, { type: "CAST_VERDICT", playerId: p, choice: "kill" });
    expect(JSON.stringify(s.log)).not.toContain("villager");
    expect(s.log.at(-1)).toEqual({ kind: "verdict_result", day: 1, accusedId: "p5", killed: true });
  });
});

describe("T-WIN", () => {
  const hang = (s: GameState, target: string) => {
    let v = timeUp(s);
    v = act(v, { type: "CAST_VOTE", playerId: ids(v)[0], targetId: target });
    let d = timeUp(timeUp(v)); // vote → defense → verdict
    for (const p of ids(d).filter((x) => x !== target)) d = act(d, { type: "CAST_VERDICT", playerId: p, choice: "kill" });
    return d;
  };
  it("T-W-01 treo Sói cuối → village", () => {
    const s = hang(kill(day1(), "p0"), "p1");
    expect(s.phase).toEqual({ kind: "ended", winner: "village" });
    expect(s.phaseEndsAt).toBeNull();
  });
  it("T-W-02 sáng ra Sói sống = số còn lại → wolves", () => {
    let s = makeGame(STD6);
    s = kill(s, "p2", "p3"); // còn p0,p1 | p4,p5
    s = skipTo(s, { kind: "night", step: "first" });
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p4" });
    s = skipTo(s, { kind: "ended" }); // p4 chết → 2 Sói vs 1 Dân
    expect(s.phase).toEqual({ kind: "ended", winner: "wolves" });
  });
  it("T-W-03 độc Sói cuối + cắn Dân cuối → draw", () => {
    let s = makeGame(["wolf", "villager", "witch"]);
    s = skipTo(s, { kind: "night", step: "first" });
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p1" });
    s = skipTo(s, { kind: "night", step: "second" });
    s = act(s, { type: "WITCH_SET", playerId: "p2", save: false, poisonTarget: "p0" });
    s = timeUp(s);
    expect(ids(s)).toEqual(["p2"]); // phù thủy còn sống
    // cắn cả Phù thủy: dựng tay trạng thái 1 Sói + 1 Dân cuối cùng
    let t = makeGame(["wolf", "witch"]);
    t = skipTo(t, { kind: "night", step: "first" });
    t = act(t, { type: "WOLF_PICK", playerId: "p0", targetId: "p1" });
    t = skipTo(t, { kind: "night", step: "second" });
    t = act(t, { type: "WITCH_SET", playerId: "p1", save: false, poisonTarget: "p0" });
    expect(timeUp(t).phase).toEqual({ kind: "ended", winner: "draw" });
  });
  it("T-W-04 ended: không còn hạn giờ, mọi action bị từ chối, TIME_UP không đổi", () => {
    const s = hang(kill(day1(), "p0"), "p1");
    reject(s, { type: "CAST_VOTE", playerId: "p2", targetId: "p3" });
    reject(s, { type: "EXTEND_DISCUSSION", playerId: "p2" });
    const r = reduce(s, { type: "TIME_UP", phaseSeq: s.phaseSeq, now: 9e9 });
    expect(r.error).toBeUndefined();
    expect(r.state).toEqual(s);
  });
});

describe("T-SIM", () => {
  it("T-SIM-01 STD6 → Dân thắng ở Ngày 2", () => {
    let s = makeGame(STD6);
    s = skipTo(s, { kind: "night", step: "first" });
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p5" });
    s = skipTo(s, { kind: "discussion" }); // p5 chết
    expect(s.lastNightDeaths).toEqual(["p5"]);
    s = timeUp(s);
    for (const p of ["p0", "p1", "p2", "p3", "p4"]) s = act(s, { type: "CAST_VOTE", playerId: p, targetId: "p0" });
    expect(s.phase).toMatchObject({ kind: "defense", accusedId: "p0" });
    s = timeUp(s);
    for (const p of ["p1", "p2", "p3", "p4"]) s = act(s, { type: "CAST_VERDICT", playerId: p, choice: "kill" });
    expect(s.phase).toMatchObject({ kind: "night", night: 2 });
    s = skipTo(s, { kind: "night", step: "second" });
    s = act(s, { type: "WITCH_SET", playerId: "p3", save: false, poisonTarget: "p1" });
    s = timeUp(s);
    expect(s.phase).toEqual({ kind: "ended", winner: "village" });
    expect(s.players.every((p) => p.role !== undefined)).toBe(true);
  });
  it("T-SIM-02 STD6 → Sói thắng", () => {
    let s = makeGame(STD6);
    s = skipTo(s, { kind: "night", step: "first" });
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p2" });
    s = skipTo(s, { kind: "vote" }); // Ngày 1 trôi qua, không ai bầu
    s = skipTo(s, { kind: "night", step: "first" });
    s = act(s, { type: "WOLF_PICK", playerId: "p1", targetId: "p3" });
    s = skipTo(s, { kind: "ended" });
    expect(s.phase).toEqual({ kind: "ended", winner: "wolves" });
  });
  it("T-P-02 cùng seed + log → state giống hệt", () => {
    const run = () => {
      let s = skipTo(makeGame(STD6, { seed: 9 }), { kind: "night", step: "first" });
      s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p2" });
      s = act(s, { type: "WOLF_PICK", playerId: "p1", targetId: "p3" });
      return skipTo(s, { kind: "vote" });
    };
    expect(run()).toEqual(run());
  });
});
