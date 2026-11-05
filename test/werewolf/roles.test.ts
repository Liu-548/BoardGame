// Vai mở rộng (01-LUAT mục 12): Thợ săn, Già làng, Kẻ ngốc, Kẻ chán đời, Sói con, Sói nguyền, Kỵ sĩ, Cupid, Trưởng làng.
import { describe, expect, it } from "vitest";
import { checkWinner } from "../../src/games/werewolf/core/reduce";
import type { GameState, Role } from "../../src/games/werewolf/core/types";
import { viewFor } from "../../src/games/werewolf/core/view";
import { act, makeGame, reject, skipTo, timeUp } from "./helpers";

const V: Role = "villager";
const alive = (s: GameState) => s.players.filter((p) => p.alive).map((p) => p.id);
const roleOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.role;
const bite = (s: GameState, target: string, second = false) => {
  for (const p of s.players) if (p.alive && ["wolf", "wolf_cub", "cursed_wolf"].includes(p.role)) s = act(s, { type: "WOLF_PICK", playerId: p.id, targetId: target, ...(second ? { second } : {}) });
  return s;
};
// Từ thảo luận: mọi người có quyền bỏ phiếu đưa `target` lên rồi phán "Giết".
function hang(s: GameState, target: string): GameState {
  s = skipTo(s, { kind: "vote" });
  for (const p of s.players) {
    if (s.phase.kind !== "vote") break;
    if (p.alive && s.idiotRevealed !== p.id) s = act(s, { type: "CAST_VOTE", playerId: p.id, targetId: target });
  }
  s = skipTo(s, { kind: "verdict" });
  for (const p of s.players) {
    if (s.phase.kind !== "verdict") break;
    if (p.alive && p.id !== target && s.idiotRevealed !== p.id) s = act(s, { type: "CAST_VERDICT", playerId: p.id, choice: "kill" });
  }
  return s;
}

describe("Thợ săn", () => {
  const roles: Role[] = ["wolf", "wolf", "hunter", "seer", "guard", V, V];
  it("bị cắn → Bình minh công bố rồi pha Thợ săn; bắn ai người đó chết; sau đó sang thảo luận", () => {
    let s = timeUp(bite(makeGame(roles), "p2"));
    expect(s.lastNightDeaths).toEqual(["p2"]);
    expect(s.phase).toEqual({ kind: "hunter", hunterId: "p2" });
    reject(s, { type: "HUNTER_SHOOT", playerId: "p2", targetId: "p2" });
    reject(s, { type: "HUNTER_SHOOT", playerId: "p3", targetId: "p0" });
    s = act(s, { type: "HUNTER_SHOOT", playerId: "p2", targetId: "p0" });
    expect(alive(s)).not.toContain("p0");
    expect(s.log.at(-1)).toEqual({ kind: "hunter_shot", hunterId: "p2", targetId: "p0", ids: ["p0"] });
    expect(s.phase).toMatchObject({ kind: "discussion", day: 1 });
  });
  it("hết 30 giây không chọn = không bắn", () => {
    const night = bite(makeGame(roles), "p2");
    let s = timeUp(night);
    expect(s.phaseEndsAt! - night.phaseEndsAt!).toBe(30_000);
    s = timeUp(s);
    expect(s.log.at(-1)).toEqual({ kind: "hunter_shot", hunterId: "p2", targetId: null, ids: [] });
    expect(s.phase.kind).toBe("discussion");
  });
  it("bị treo → bắn ngay sau phán quyết, rồi sang đêm", () => {
    let s = hang(skipTo(makeGame(roles), { kind: "discussion" }), "p2");
    expect(s.phase).toEqual({ kind: "hunter", hunterId: "p2" });
    s = act(s, { type: "HUNTER_SHOOT", playerId: "p2", targetId: "p5" });
    expect(s.phase).toMatchObject({ kind: "night", night: 2 });
  });
  it("phát bắn hạ Sói cuối cùng → Phe Dân thắng", () => {
    let s = makeGame(["wolf", "hunter", V, V, V, V]);
    s = { ...s, players: s.players.map((p) => (p.id === "p0" ? p : p)) };
    s = timeUp(bite(s, "p1"));
    s = act(s, { type: "HUNTER_SHOOT", playerId: "p1", targetId: "p0" });
    expect(s.phase).toEqual({ kind: "ended", winner: "village" });
  });
});

describe("Già làng, Kẻ ngốc, Kẻ chán đời", () => {
  it("Già làng sống sót lần cắn đầu, chết lần thứ hai", () => {
    let s = timeUp(bite(makeGame(["wolf", "wolf", "elder", V, V, V]), "p2"));
    expect(s.lastNightDeaths).toEqual([]);
    expect(s.elderHit).toBe(true);
    s = skipTo(s, { kind: "night" });
    s = timeUp(bite(s, "p2"));
    expect(s.lastNightDeaths).toEqual(["p2"]);
  });
  it("Kẻ ngốc bị treo lần đầu: không chết, lộ vai, mất quyền bỏ phiếu; lần sau chết", () => {
    let s = hang(skipTo(makeGame(["wolf", "wolf", "idiot", V, V, V, V]), { kind: "discussion" }), "p2");
    expect(alive(s)).toContain("p2");
    expect(s.idiotRevealed).toBe("p2");
    expect(s.log.at(-1)).toMatchObject({ kind: "verdict_result", accusedId: "p2", killed: false, idiot: true });
    expect(s.phase).toMatchObject({ kind: "night", night: 2 });
    expect(viewFor(s, "p3").players[2].role).toBe("idiot"); // công khai
    s = skipTo(s, { kind: "vote" });
    reject(s, { type: "CAST_VOTE", playerId: "p2", targetId: "p0" });
    s = hang(s, "p2");
    expect(alive(s)).not.toContain("p2");
  });
  it("Kẻ chán đời bị treo → thắng một mình", () => {
    const s = hang(skipTo(makeGame(["wolf", "wolf", "tanner", V, V, V, V]), { kind: "discussion" }), "p2");
    expect(s.phase).toEqual({ kind: "ended", winner: "tanner" });
  });
  it("Kẻ chán đời bị cắn thì chỉ chết như thường", () => {
    const s = timeUp(bite(makeGame(["wolf", "wolf", "tanner", V, V, V, V]), "p2"));
    expect(s.phase.kind).toBe("discussion");
  });
});

describe("Sói con", () => {
  const roles: Role[] = ["wolf", "wolf_cub", "witch", V, V, V, V];
  it("không được cắn thứ 2 khi Sói con còn sống", () => {
    reject(makeGame(roles), { type: "WOLF_PICK", playerId: "p0", targetId: "p3", second: true });
  });
  it("Sói con chết → đêm sau cắn 2; Phù thủy thấy cả 2, chỉ cứu 1", () => {
    let s = hang(skipTo(makeGame(roles), { kind: "discussion" }), "p1");
    expect(s.phase).toMatchObject({ kind: "night", night: 2 });
    expect(s.doubleBite).toBe(true);
    expect(viewFor(s, "p0").doubleBite).toBe(true);
    s = bite(s, "p3");
    s = act(s, { type: "WOLF_PICK", playerId: "p0", targetId: "p4", second: true });
    s = timeUp(s);
    expect([s.bittenId, s.bittenId2]).toEqual(["p3", "p4"]);
    expect(viewFor(s, "p2").witch).toMatchObject({ bittenId: "p3", bittenId2: "p4" });
    reject(s, { type: "WITCH_SET", playerId: "p2", save: true, saveSecond: true, poisonTarget: null });
    s = act(s, { type: "WITCH_SET", playerId: "p2", save: false, saveSecond: true, poisonTarget: null });
    s = timeUp(s);
    expect(s.lastNightDeaths).toEqual(["p3"]);
    expect(s.potions.save).toBe(false);
    expect(s.cubRevenge).toBe(false);
    expect(skipTo(s, { kind: "night" }).doubleBite).toBe(false); // chỉ 1 đêm
  });
});

describe("Sói nguyền", () => {
  const roles: Role[] = ["wolf", "cursed_wolf", "seer", "guard", V, V, V];
  const day1 = () => skipTo(makeGame(roles), { kind: "discussion" });
  it("chưa kích hoạt thì không nguyền được; Tiên tri soi thấy là Sói", () => {
    let s = makeGame(roles);
    s = act(s, { type: "SEER_PICK", playerId: "p2", targetId: "p1" });
    expect(s.seerResults[0].isWolf).toBe(true);
    s = timeUp(bite(s, "p4"));
    reject(s, { type: "CURSE_SET", playerId: "p1", targetId: "p4" });
  });
  it("kích hoạt ban ngày → đêm đó biến người bị cắn thành Sói; chỉ 1 lần/ván", () => {
    let s = act(day1(), { type: "ARM_CURSE", playerId: "p1" });
    expect(s.curse.armed).toBe(true);
    reject(s, { type: "ARM_CURSE", playerId: "p0" });
    s = skipTo(s, { kind: "night" });
    s = timeUp(bite(s, "p4"));
    expect(viewFor(s, "p1").curse).toMatchObject({ armed: true, bitten: ["p4"] });
    reject(s, { type: "CURSE_SET", playerId: "p1", targetId: "p5" });
    s = act(s, { type: "CURSE_SET", playerId: "p1", targetId: "p4" });
    s = timeUp(s);
    expect(s.lastNightDeaths).toEqual([]);
    expect(roleOf(s, "p4")).toBe("wolf");
    expect(s.curse).toEqual({ armed: false, used: true });
    expect(viewFor(s, "p0").players[4].role).toBe("wolf"); // bầy Sói thấy đồng đội mới
    reject(s, { type: "ARM_CURSE", playerId: "p1" });
  });
  it("người bị cắn được Bảo vệ → nguyền không tác dụng, chưa tính là đã dùng", () => {
    let s = skipTo(act(day1(), { type: "ARM_CURSE", playerId: "p1" }), { kind: "night" });
    s = act(bite(s, "p4"), { type: "GUARD_PICK", playerId: "p3", targetId: "p4" });
    s = act(timeUp(s), { type: "CURSE_SET", playerId: "p1", targetId: "p4" });
    s = timeUp(s);
    expect(roleOf(s, "p4")).toBe(V);
    expect(s.curse.used).toBe(false);
  });
});

describe("Kỵ sĩ", () => {
  it("bị cắn chết → Sói gần nhất phía ghế nhỏ hơn chết ở Bình minh hôm sau", () => {
    let s = timeUp(bite(makeGame([V, "wolf", V, "knight", "wolf", V, V]), "p3"));
    expect(s.lastNightDeaths).toEqual(["p3"]);
    expect(s.knightCurse).toBe("p1");
    s = timeUp(skipTo(s, { kind: "night" }));
    expect(s.lastNightDeaths).toEqual(["p1"]);
  });
  it("vòng tròn: ghế 1 → ghế 7, 6…", () => {
    const s = timeUp(bite(makeGame(["knight", V, V, V, "wolf", "wolf", V]), "p0"));
    expect(s.knightCurse).toBe("p5");
  });
  it("chết vì bị treo thì không nguyền", () => {
    const s = hang(skipTo(makeGame([V, "wolf", V, "knight", "wolf", V, V]), { kind: "discussion" }), "p3");
    expect(s.knightCurse).toBeNull();
  });
});

describe("Cupid", () => {
  const roles: Role[] = ["wolf", "wolf", "cupid", V, V, V, V];
  it("ghép chính mình với người khác; tối đa 2; cặp đôi thấy vai nhau", () => {
    let s = act(makeGame(roles), { type: "CUPID_PICK", playerId: "p2", targetId: "p2" });
    s = act(s, { type: "CUPID_PICK", playerId: "p2", targetId: "p0" });
    reject(s, { type: "CUPID_PICK", playerId: "p2", targetId: "p3" });
    s = timeUp(s);
    expect(s.lovers).toEqual(["p2", "p0"]);
    expect(viewFor(s, "p2").players[0].role).toBe("wolf");
    expect(viewFor(s, "p0").players[2].role).toBe("cupid");
    expect(viewFor(s, "p3").lovers).toEqual([]);
  });
  it("Cupid ghép 2 người khác: biết cặp đôi nhưng không biết vai họ", () => {
    let s = act(makeGame(roles), { type: "CUPID_PICK", playerId: "p2", targetId: "p3" });
    s = timeUp(act(s, { type: "CUPID_PICK", playerId: "p2", targetId: "p4" }));
    const v = viewFor(s, "p2");
    expect(v.lovers).toEqual(["p3", "p4"]);
    expect(v.players[3].role).toBeUndefined();
  });
  it("một người chết → người kia chết theo ngay", () => {
    let s = act(makeGame(roles), { type: "CUPID_PICK", playerId: "p2", targetId: "p3" });
    s = act(s, { type: "CUPID_PICK", playerId: "p2", targetId: "p4" });
    s = timeUp(bite(s, "p3"));
    expect(s.lastNightDeaths).toEqual(["p3", "p4"]);
  });
  it("cặp đôi khác phe là phe riêng: thắng khi chỉ còn 2 người họ; Làng chưa thắng khi còn cặp đôi", () => {
    const base = { ...makeGame(roles), lovers: ["p0", "p3"] };
    const only = (s: GameState, ids: string[]) => ({ ...s, players: s.players.map((p) => ({ ...p, alive: ids.includes(p.id) })) });
    expect(checkWinner(only(base, ["p0", "p3"]))).toBe("lovers");
    expect(checkWinner(only(base, ["p0", "p3", "p4", "p5"]))).toBeNull();
    expect(checkWinner(only({ ...base, lovers: [] }, ["p0", "p3", "p4", "p5"]))).toBeNull();
    expect(checkWinner(only({ ...base, lovers: [] }, ["p3", "p4"]))).toBe("village");
  });
});

describe("Trưởng làng", () => {
  const roles: Role[] = ["wolf", "wolf", "seer", V, V, V, V];
  const election = () => skipTo(makeGame(roles, { mayor: true }), { kind: "election" });
  it("đầu Ngày 1 bầu (60 giây); đủ phiếu thì chốt ngay; chỉ bầu 1 lần", () => {
    let s = election();
    expect(s.phaseEndsAt! - skipTo(makeGame(roles, { mayor: true }), { kind: "night" }).phaseEndsAt!).toBe(60_000);
    for (const id of alive(s)) s = act(s, { type: "CAST_VOTE", playerId: id, targetId: "p3" });
    expect(s.mayorId).toBe("p3");
    expect(s.phase).toMatchObject({ kind: "discussion", day: 1 });
    s = skipTo(timeUp(skipTo(s, { kind: "night" })), { kind: "discussion" });
    expect(s.phase).toMatchObject({ kind: "discussion", day: 2 });
  });
  it("hoà → bốc ngẫu nhiên trong nhóm cao nhất", () => {
    let s = act(election(), { type: "CAST_VOTE", playerId: "p0", targetId: "p3" });
    s = timeUp(act(s, { type: "CAST_VOTE", playerId: "p1", targetId: "p4" }));
    expect(["p3", "p4"]).toContain(s.mayorId);
  });
  it("phiếu Trưởng làng x2 ở bỏ phiếu và phán quyết", () => {
    let s: GameState = { ...timeUp(election()), mayorId: "p3" };
    s = skipTo(s, { kind: "vote" });
    s = act(s, { type: "CAST_VOTE", playerId: "p3", targetId: "p5" });
    s = act(s, { type: "CAST_VOTE", playerId: "p0", targetId: "p4" });
    s = timeUp(s);
    expect(s.phase).toMatchObject({ kind: "defense", accusedId: "p5" });
    s = skipTo(s, { kind: "verdict" });
    s = act(s, { type: "CAST_VERDICT", playerId: "p3", choice: "kill" });
    s = act(s, { type: "CAST_VERDICT", playerId: "p0", choice: "spare" });
    s = timeUp(s);
    expect(alive(s)).not.toContain("p5"); // 2 > 1
  });
  it("Trưởng làng chết → chọn người kế nhiệm; hết giờ → làng mất Trưởng làng", () => {
    let s = act(election(), { type: "CAST_VOTE", playerId: "p0", targetId: "p3" });
    s = skipTo(timeUp(s), { kind: "night" });
    s = timeUp(bite(s, "p3"));
    expect(s.phase).toEqual({ kind: "successor", mayorId: "p3" });
    reject(s, { type: "MAYOR_PASS", playerId: "p3", targetId: "p3" });
    const passed = act(s, { type: "MAYOR_PASS", playerId: "p3", targetId: "p6" });
    expect(passed.mayorId).toBe("p6");
    expect(passed.phase.kind).toBe("discussion");
    const lost = timeUp(s);
    expect(lost.mayorId).toBeNull();
    expect(lost.log.at(-1)).toEqual({ kind: "mayor", mayorId: null, how: "lost" });
  });
});
