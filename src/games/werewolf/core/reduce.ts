// Luật Ma Sói: ban đêm + Bình minh + ban ngày + hiệu ứng "khi chết" + TIME_UP.
// reduce THUẦN: không sửa state đầu vào, không dùng ngẫu nhiên/đồng hồ hệ thống (quy tắc 1-3 CLAUDE.md).
import { nextRandom } from "../../bang/core/rng";
import type { Action, GameState, NightStep, PlayerState, Role, Winner } from "./types";
import { ELECTION_MS, HUNTER_MS, isWolfRole, NIGHT_STEP_ROLES, SUCCESSOR_MS } from "./types";

// R-09/R-51..54: thời lượng các pha ban ngày.
export const DISCUSSION_MS = 180_000;
export const EXTEND_MS = 60_000; // R-51a
export const VOTE_MS = 30_000;
export const DEFENSE_MS = 30_000;
export const VERDICT_MS = 30_000;

// D-33: một câu lỗi chung cho mọi trường hợp "không được làm lúc này" — không lộ vai.
export const GENERIC_ERROR = "Bạn không thể làm việc này lúc này";

type Result = { state: GameState; error?: string };

const fail = (state: GameState, error: string = GENERIC_ERROR): Result => ({ state, error });

const findPlayer = (state: GameState, id: string): PlayerState | undefined =>
  state.players.find((p) => p.id === id);
const isAlive = (state: GameState, id: string) => findPlayer(state, id)?.alive === true;
const alivePlayers = (state: GameState) => state.players.filter((p) => p.alive);

// Đổi sang pha mới: phaseSeq+1, đặt hạn giờ (D-12).
function enterPhase(state: GameState, phase: GameState["phase"], now: number, ms: number): GameState {
  return { ...state, phase, phaseSeq: state.phaseSeq + 1, phaseEndsAt: now + ms };
}

// Vào 1 pha đêm: luôn chạy đủ thời gian cấu hình (R-81), kể cả khi vai của pha đã chết.
function enterNightStep(state: GameState, night: number, step: NightStep, now: number): GameState {
  return enterPhase(state, { kind: "night", night, step }, now, state.config.nightStepMs);
}

// Đầu mỗi đêm reset các trường "ban đêm" (02 mục 1). lastGuardTarget giữ nguyên (R-40b).
// Sói con chết hôm trước → đêm nay bầy Sói cắn 2.
export function startNight(state: GameState, night: number, now: number): GameState {
  return {
    ...enterNightStep(state, night, state.nightSteps[0], now),
    guardTarget: null,
    wolfPicks: {},
    wolfPicks2: {},
    doubleBite: state.cubRevenge,
    cubRevenge: false,
    bittenId: null,
    bittenId2: null,
    seerPick: null,
    witchSave: false,
    witchSave2: false,
    witchPoisonTarget: null,
    cupidPicks: [],
    curseTarget: null,
    deathQueue: [],
    resume: null,
  };
}

function enterDiscussion(state: GameState, day: number, now: number): GameState {
  return {
    ...enterPhase(state, { kind: "discussion", day }, now, DISCUSSION_MS),
    resume: null,
    extendUsed: false,
    endEarly: {},
    votes: {},
    verdicts: {},
  };
}

// ---------- Thắng / thua ----------

type Faction = "wolves" | "village" | "tanner";
const faction = (role: Role): Faction => (isWolfRole(role) ? "wolves" : role === "tanner" ? "tanner" : "village");

// R-60 (mở rộng): cặp đôi KHÁC phe (Cupid) là phe riêng, thắng khi chỉ còn 2 người họ.
// Làng thắng khi hết Sói và hết cặp đôi khác phe; Sói thắng khi số Sói ≥ phần còn lại (tính cả cặp đôi).
export function checkWinner(state: GameState): Winner | null {
  const alive = alivePlayers(state);
  if (alive.length === 0) return "draw"; // R-60c
  const [a, b] = state.lovers.map((id) => findPlayer(state, id));
  const pair = new Set<string>(a && b && a.alive && b.alive && faction(a.role) !== faction(b.role) ? [a.id, b.id] : []);
  const wolves = alive.filter((p) => !pair.has(p.id) && isWolfRole(p.role)).length;
  const others = alive.filter((p) => !pair.has(p.id) && !isWolfRole(p.role)).length;
  if (pair.size > 0 && wolves === 0 && others === 0) return "lovers";
  if (wolves === 0 && pair.size === 0) return "village"; // R-60a
  if (wolves > 0 && wolves >= others + pair.size) return "wolves"; // R-60b
  return null;
}

// Kết thúc ván: ended, không còn hạn giờ (D-20).
function endGame(state: GameState, winner: Winner): GameState {
  return {
    ...state,
    phase: { kind: "ended", winner },
    phaseSeq: state.phaseSeq + 1,
    phaseEndsAt: null,
    deathQueue: [],
    resume: null,
    log: [...state.log, { kind: "ended", winner }],
  };
}

// ---------- Cái chết và hiệu ứng "khi chết" ----------

type Cause = "bite" | "poison" | "hang" | "shot" | "knight";

// Sói còn sống gần nhất đi NGƯỢC số ghế (ghế nhỏ hơn, vòng tròn) — Kỵ sĩ.
function nearestWolfBelow(state: GameState, seat: number): string | null {
  const n = state.players.length;
  for (let k = 1; k < n; k++) {
    const p = state.players.find((x) => x.seat === (seat - k + n) % n);
    if (p && p.alive && isWolfRole(p.role)) return p.id;
  }
  return null;
}

// Áp chết cho `ids` (bỏ qua người đã chết), kéo theo người yêu chết theo, ghi hiệu ứng "khi chết":
// Thợ săn → hàng chờ bắn; Trưởng làng → hàng chờ kế nhiệm; Sói con → đêm sau cắn 2; Kỵ sĩ bị cắn → nguyền Sói.
function applyDeaths(state: GameState, ids: string[], cause: Cause): { state: GameState; died: string[]; grief: string[] } {
  const dead = new Set(ids.filter((id) => isAlive(state, id)));
  const grief: string[] = [];
  if (state.lovers.length === 2) {
    const [a, b] = state.lovers;
    if (dead.has(a) && !dead.has(b) && isAlive(state, b)) grief.push(b);
    if (dead.has(b) && !dead.has(a) && isAlive(state, a)) grief.push(a);
    for (const id of grief) dead.add(id);
  }
  let s: GameState = { ...state, players: state.players.map((p) => (dead.has(p.id) ? { ...p, alive: false } : p)) };
  const died = s.players.filter((p) => dead.has(p.id)); // players xếp theo ghế (R-50)
  const queue = [...s.deathQueue];
  for (const p of died) {
    if (p.role === "hunter") queue.push({ kind: "hunter", playerId: p.id });
    if (p.id === s.mayorId) queue.push({ kind: "successor", playerId: p.id });
    if (p.role === "wolf_cub") s = { ...s, cubRevenge: true };
    if (p.role === "knight" && cause === "bite" && !grief.includes(p.id)) s = { ...s, knightCurse: nearestWolfBelow(s, p.seat) };
  }
  return { state: { ...s, deathQueue: queue }, died: died.map((p) => p.id), grief };
}

// Sau mỗi đợt chết: Thợ săn bắn trước (có thể đổi kết quả), rồi kiểm thắng, rồi kế nhiệm Trưởng làng,
// cuối cùng quay về chỗ đang dở (sang ngày / sang đêm). Bầu Trưởng làng đầu Ngày 1 nếu bật.
function continueAfterDeaths(state: GameState, now: number): GameState {
  const hunterAt = state.deathQueue.findIndex((q) => q.kind === "hunter");
  if (hunterAt >= 0) {
    const q = state.deathQueue[hunterAt];
    const rest = state.deathQueue.filter((_, i) => i !== hunterAt);
    return enterPhase({ ...state, deathQueue: rest }, { kind: "hunter", hunterId: q.playerId }, now, HUNTER_MS);
  }
  const winner = checkWinner(state);
  if (winner) return endGame(state, winner);
  if (state.deathQueue.length > 0) {
    const [q, ...rest] = state.deathQueue;
    return enterPhase({ ...state, deathQueue: rest }, { kind: "successor", mayorId: q.playerId }, now, SUCCESSOR_MS);
  }
  const r = state.resume;
  if (!r || r.kind === "night") return startNight(state, r ? r.night : 1, now);
  if (state.config.mayor && !state.mayorElected) return { ...enterPhase(state, { kind: "election", day: r.day }, now, ELECTION_MS), votes: {} };
  return enterDiscussion(state, r.day, now);
}

// ---------- Ban đêm ----------

// D-13, R-41c: đa số phiếu; hoà thì bốc ngẫu nhiên bằng RNG có seed. `exclude` = không tính người này.
function majority(state: GameState, picks: Record<string, string>, exclude: string | null): { id: string | null; state: GameState } {
  const counts = new Map<string, number>();
  for (const target of Object.values(picks)) if (target !== exclude) counts.set(target, (counts.get(target) ?? 0) + 1);
  if (counts.size === 0) return { id: null, state }; // R-41d
  const max = Math.max(...counts.values());
  // Xếp theo ghế để kết quả tất định, không phụ thuộc thứ tự key của object.
  const tied = state.players.filter((p) => counts.get(p.id) === max).map((p) => p.id);
  if (tied.length === 1) return { id: tied[0], state };
  const { value, nextState } = nextRandom(state.rngState);
  return { id: tied[Math.floor(value * tied.length)], state: { ...state, rngState: nextState } };
}

// Hết pha 1: chốt người bị cắn (1 hoặc 2), chốt cặp đôi của Cupid (đêm 1).
function resolveWolfBite(state: GameState): GameState {
  const first = majority(state, state.wolfPicks, null);
  let s: GameState = { ...first.state, bittenId: first.id };
  if (state.doubleBite) {
    const second = majority(s, state.wolfPicks2, first.id);
    s = { ...second.state, bittenId2: second.id };
  }
  if (state.cupidPicks.length === 2) s = { ...s, lovers: [...state.cupidPicks] };
  return s;
}

// D-14, R-44: Bình minh — áp mọi hiệu ứng đêm cùng lúc.
function resolveDawn(state: GameState, now: number): GameState {
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  let players = state.players;
  let elderHit = state.elderHit;
  let curse = state.curse;
  const bitten: string[] = [];
  for (const [id, saved] of [[state.bittenId, state.witchSave], [state.bittenId2, state.witchSave2]] as const) {
    if (!id || state.guardTarget === id || saved) continue; // R-44a,b: được bảo vệ / cứu
    if (state.curseTarget === id && curse.armed && !curse.used) {
      // Sói nguyền: biến thành Sói thay vì chết.
      players = players.map((p) => (p.id === id ? { ...p, role: "wolf" as const } : p));
      curse = { armed: false, used: true };
      continue;
    }
    if (findPlayer(state, id)?.role === "elder" && !elderHit) {
      elderHit = true; // Già làng chịu được lần cắn đầu
      continue;
    }
    bitten.push(id);
  }
  const knightVictim = state.knightCurse;
  let s: GameState = {
    ...state,
    players,
    elderHit,
    curse,
    knightCurse: null,
    // Bình chỉ bị trừ ở đây (02 §10.4).
    potions: {
      save: state.potions.save && !state.witchSave && !state.witchSave2,
      poison: state.potions.poison && !state.witchPoisonTarget,
    },
    lastGuardTarget: state.guardTarget,
  };
  const died = new Set<string>();
  for (const [ids, cause] of [
    [bitten, "bite"],
    [state.witchPoisonTarget ? [state.witchPoisonTarget] : [], "poison"], // R-44c: Bảo vệ không chặn độc (R-40d)
    [knightVictim ? [knightVictim] : [], "knight"],
  ] as const) {
    const r = applyDeaths(s, [...ids], cause);
    s = r.state;
    for (const id of r.died) died.add(id);
  }
  const ids = s.players.filter((p) => died.has(p.id)).map((p) => p.id); // xếp theo ghế (R-50)
  return continueAfterDeaths(
    { ...s, lastNightDeaths: ids, log: [...s.log, { kind: "deaths", night, ids }], resume: { kind: "day", day: night } },
    now,
  );
}

// Kiểm người gửi đúng vai, vai đó thức ở pha đêm hiện tại, còn sống (D-15). Trả người chơi hoặc null.
function nightActor(state: GameState, playerId: string, role: Role) {
  if (state.phase.kind !== "night" || !NIGHT_STEP_ROLES[state.phase.step].includes(role)) return null;
  const p = findPlayer(state, playerId);
  return p && p.alive && p.role === role ? p : null;
}

// ---------- Ban ngày ----------

// Kẻ ngốc đã lộ mất quyền bỏ phiếu/phán quyết.
const canVote = (state: GameState, id: string) => isAlive(state, id) && state.idiotRevealed !== id;
// Phiếu của Trưởng làng tính x2.
const weight = (state: GameState, voterId: string) => (voterId === state.mayorId ? 2 : 1);

function enterVote(state: GameState, day: number, now: number): GameState {
  return { ...enterPhase(state, { kind: "vote", day }, now, VOTE_MS), votes: {} };
}

// R-52d,e: phiếu trắng không phải ứng viên; cao nhất > 0 và duy nhất mới bị đưa lên.
function resolveVote(state: GameState, day: number, now: number): GameState {
  const counts = new Map<string, number>();
  for (const [voter, t] of Object.entries(state.votes)) if (t !== "blank") counts.set(t, (counts.get(t) ?? 0) + weight(state, voter));
  const max = counts.size ? Math.max(...counts.values()) : 0;
  const top = [...counts].filter(([, n]) => n === max).map(([id]) => id);
  if (max > 0 && top.length === 1) {
    const accusedId = top[0];
    const logged = { ...state, log: [...state.log, { kind: "vote_result" as const, day, accusedId }] };
    return enterPhase(logged, { kind: "defense", day, accusedId }, now, DEFENSE_MS);
  }
  const logged = { ...state, log: [...state.log, { kind: "vote_result" as const, day, accusedId: null }] };
  return startNight(logged, day + 1, now);
}

// R-54c: Giết > Tha mới chết (không lật vai). Kẻ ngốc không chết (lộ vai); Kẻ chán đời bị treo → thắng.
function resolveVerdict(state: GameState, day: number, accusedId: string, now: number): GameState {
  let kills = 0;
  let spares = 0;
  for (const [voter, v] of Object.entries(state.verdicts)) {
    if (v === "kill") kills += weight(state, voter);
    else spares += weight(state, voter);
  }
  const accused = findPlayer(state, accusedId);
  if (kills <= spares || !accused) {
    return startNight({ ...state, log: [...state.log, { kind: "verdict_result", day, accusedId, killed: false }] }, day + 1, now);
  }
  if (accused.role === "idiot" && state.idiotRevealed === null) {
    const log = [...state.log, { kind: "verdict_result" as const, day, accusedId, killed: false, idiot: true as const }];
    return startNight({ ...state, idiotRevealed: accusedId, log }, day + 1, now);
  }
  const r = applyDeaths(state, [accusedId], "hang");
  const entry = { kind: "verdict_result" as const, day, accusedId, killed: true, ...(r.grief.length ? { grief: r.grief } : {}) };
  const s = { ...r.state, log: [...r.state.log, entry] };
  if (accused.role === "tanner") return endGame(s, "tanner");
  return continueAfterDeaths({ ...s, resume: { kind: "night", night: day + 1 } }, now);
}

// Bầu Trưởng làng: nhiều phiếu nhất; hoà (hoặc không ai bầu) → bốc ngẫu nhiên trong nhóm cao nhất.
function resolveElection(state: GameState, day: number, now: number): GameState {
  const counts = new Map<string, number>();
  for (const t of Object.values(state.votes)) if (t !== "blank" && isAlive(state, t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const max = counts.size ? Math.max(...counts.values()) : 0;
  const pool = alivePlayers(state).filter((p) => (max === 0 ? true : counts.get(p.id) === max)).map((p) => p.id);
  let s = state;
  let mayorId = pool[0] ?? null;
  if (pool.length > 1) {
    const { value, nextState } = nextRandom(state.rngState);
    mayorId = pool[Math.floor(value * pool.length)];
    s = { ...s, rngState: nextState };
  }
  s = { ...s, mayorId, mayorElected: true, log: [...s.log, { kind: "mayor", mayorId, how: "elected" }] };
  return enterDiscussion(s, day, now);
}

// Thợ săn bắn (null = không bắn).
function hunterShoot(state: GameState, hunterId: string, targetId: string | null, now: number): GameState {
  if (!targetId) return continueAfterDeaths({ ...state, log: [...state.log, { kind: "hunter_shot", hunterId, targetId: null, ids: [] }] }, now);
  const r = applyDeaths(state, [targetId], "shot");
  return continueAfterDeaths({ ...r.state, log: [...r.state.log, { kind: "hunter_shot", hunterId, targetId, ids: r.died }] }, now);
}

function passMayor(state: GameState, targetId: string | null, now: number): GameState {
  const log = [...state.log, { kind: "mayor" as const, mayorId: targetId, how: targetId ? ("passed" as const) : ("lost" as const) }];
  return continueAfterDeaths({ ...state, mayorId: targetId, log }, now);
}

function dayTimeUp(state: GameState, now: number): GameState {
  const ph = state.phase;
  switch (ph.kind) {
    case "discussion":
      return enterVote(state, ph.day, now);
    case "vote":
      return resolveVote(state, ph.day, now);
    case "defense":
      return { ...enterPhase(state, { kind: "verdict", day: ph.day, accusedId: ph.accusedId }, now, VERDICT_MS), verdicts: {} };
    case "verdict":
      return resolveVerdict(state, ph.day, ph.accusedId, now);
    case "election":
      return resolveElection(state, ph.day, now);
    case "hunter":
      return hunterShoot(state, ph.hunterId, null, now); // hết giờ = không bắn
    case "successor":
      return passMayor(state, null, now); // hết giờ = làng mất Trưởng làng
    default:
      return state; // ended: không đổi gì
  }
}

const DAY_KINDS = ["discussion", "vote", "defense", "verdict", "election"];

function dayAction(state: GameState, action: Action): Result {
  const ph = state.phase;
  switch (action.type) {
    case "EXTEND_DISCUSSION": {
      if (ph.kind !== "discussion" || !isAlive(state, action.playerId) || state.extendUsed) return fail(state);
      return { state: { ...state, extendUsed: true, phaseEndsAt: (state.phaseEndsAt ?? 0) + EXTEND_MS } };
    }
    case "TOGGLE_END_EARLY": {
      if (ph.kind !== "discussion" || !isAlive(state, action.playerId)) return fail(state);
      const endEarly = { ...state.endEarly };
      if (endEarly[action.playerId]) delete endEarly[action.playerId];
      else endEarly[action.playerId] = true;
      const next = { ...state, endEarly };
      // R-51b: quá nửa người còn sống đang bật → kết thúc ngay.
      if (Object.keys(endEarly).length * 2 > alivePlayers(state).length) return { state: enterVote(next, ph.day, action.now) };
      return { state: next };
    }
    case "CAST_VOTE": {
      // Dùng cho cả bỏ phiếu ban ngày lẫn bầu Trưởng làng.
      if ((ph.kind !== "vote" && ph.kind !== "election") || !canVote(state, action.playerId)) return fail(state);
      const votes = { ...state.votes };
      if (action.targetId === null) delete votes[action.playerId];
      else if (action.targetId !== "blank" && !isAlive(state, action.targetId)) return fail(state);
      else votes[action.playerId] = action.targetId;
      const next = { ...state, votes };
      // R-52c: mọi người có quyền đã bỏ phiếu → kết thúc ngay.
      if (alivePlayers(state).every((p) => !canVote(state, p.id) || votes[p.id] !== undefined)) {
        return { state: ph.kind === "vote" ? resolveVote(next, ph.day, action.now) : resolveElection(next, ph.day, action.now) };
      }
      return { state: next };
    }
    case "CAST_VERDICT": {
      if (ph.kind !== "verdict" || !canVote(state, action.playerId) || action.playerId === ph.accusedId) return fail(state);
      const verdicts = { ...state.verdicts };
      if (action.choice === null) delete verdicts[action.playerId];
      else verdicts[action.playerId] = action.choice;
      const next = { ...state, verdicts };
      // R-54b: mọi người có quyền đã chọn → kết thúc ngay.
      const voters = alivePlayers(state).filter((p) => p.id !== ph.accusedId && canVote(state, p.id));
      if (voters.every((p) => verdicts[p.id] !== undefined)) return { state: resolveVerdict(next, ph.day, ph.accusedId, action.now) };
      return { state: next };
    }
    case "ARM_CURSE": {
      // Sói nguyền bật/tắt kích hoạt ban ngày; đêm đó dùng ở pha 2.
      const me = findPlayer(state, action.playerId);
      if (!DAY_KINDS.includes(ph.kind) || !me || !me.alive || me.role !== "cursed_wolf" || state.curse.used) return fail(state);
      return { state: { ...state, curse: { ...state.curse, armed: !state.curse.armed } } };
    }
    case "HUNTER_SHOOT": {
      const t = action.targetId;
      if (ph.kind !== "hunter" || action.playerId !== ph.hunterId) return fail(state);
      if (t !== null && (t === ph.hunterId || !isAlive(state, t))) return fail(state);
      return { state: hunterShoot(state, ph.hunterId, t, action.now) };
    }
    case "MAYOR_PASS": {
      if (ph.kind !== "successor" || action.playerId !== ph.mayorId) return fail(state);
      if (action.targetId === ph.mayorId || !isAlive(state, action.targetId)) return fail(state);
      return { state: passMayor(state, action.targetId, action.now) };
    }
    default:
      return fail(state);
  }
}

function timeUp(state: GameState, action: Extract<Action, { type: "TIME_UP" }>): Result {
  // D-21: TIME_UP của pha cũ (pha đã đổi) bị bỏ qua, không báo lỗi.
  if (action.phaseSeq !== state.phaseSeq) return { state };
  if (state.phase.kind === "reveal") return { state: startNight(state, 1, action.now) }; // R-30a
  if (state.phase.kind !== "night") return { state: dayTimeUp(state, action.now) };

  let s = state;
  if (state.phase.step === "first") s = resolveWolfBite(s); // R-41c: chốt ai bị cắn khi hết pha 1
  const idx = state.nightSteps.indexOf(state.phase.step);
  const nextStep: NightStep | undefined = state.nightSteps[idx + 1];
  if (nextStep) return { state: enterNightStep(s, state.phase.night, nextStep, action.now) };
  return { state: resolveDawn(s, action.now) };
}

export function reduce(state: GameState, action: Action): Result {
  switch (action.type) {
    case "TIME_UP":
      return timeUp(state, action);

    case "GUARD_PICK": {
      if (!nightActor(state, action.playerId, "guard")) return fail(state);
      const t = action.targetId;
      if (t !== null) {
        if (!isAlive(state, t)) return fail(state);
        if (t === state.lastGuardTarget) return fail(state, "Không được bảo vệ cùng một người hai đêm liên tiếp"); // R-40b
      }
      return { state: { ...state, guardTarget: t } };
    }

    case "WOLF_PICK": {
      // Cả bầy Sói (Sói, Sói con, Sói nguyền) cắn ở pha 1. `second` chỉ dùng được đêm cắn 2.
      const me = findPlayer(state, action.playerId);
      if (state.phase.kind !== "night" || state.phase.step !== "first" || !me || !me.alive || !isWolfRole(me.role)) return fail(state);
      if (action.second && !state.doubleBite) return fail(state);
      const key = action.second ? "wolfPicks2" : "wolfPicks";
      const picks = { ...state[key] };
      if (action.targetId === null) delete picks[action.playerId];
      else if (!isAlive(state, action.targetId)) return fail(state); // R-41b: được chọn Sói/chính mình
      else picks[action.playerId] = action.targetId;
      return { state: { ...state, [key]: picks } };
    }

    case "SEER_PICK": {
      if (!nightActor(state, action.playerId, "seer")) return fail(state);
      if (state.seerPick !== null) return fail(state); // R-42c: chọn xong không đổi
      const target = findPlayer(state, action.targetId);
      if (!target || !target.alive || target.id === action.playerId) return fail(state); // R-42a
      const night = state.phase.kind === "night" ? state.phase.night : 0;
      return {
        state: {
          ...state,
          seerPick: target.id,
          seerResults: [...state.seerResults, { night, targetId: target.id, isWolf: isWolfRole(target.role) }],
        },
      };
    }

    case "WITCH_SET": {
      if (!nightActor(state, action.playerId, "witch")) return fail(state);
      const save2 = action.saveSecond === true;
      if ((action.save || save2) && !state.potions.save) return fail(state); // R-43b
      if (action.save && state.bittenId === null) return fail(state);
      if (save2 && (state.bittenId2 === null || action.save)) return fail(state); // 1 bình cứu: chỉ cứu 1 người
      if (action.poisonTarget !== null) {
        if (!state.potions.poison || !isAlive(state, action.poisonTarget)) return fail(state); // R-43c
      }
      return { state: { ...state, witchSave: action.save, witchSave2: save2, witchPoisonTarget: action.poisonTarget } };
    }

    case "CUPID_PICK": {
      // Đêm 1, pha 1: bật/tắt chọn, tối đa 2 người, được chọn chính mình.
      if (!nightActor(state, action.playerId, "cupid") || state.phase.kind !== "night" || state.phase.night !== 1) return fail(state);
      if (!isAlive(state, action.targetId)) return fail(state);
      const has = state.cupidPicks.includes(action.targetId);
      if (!has && state.cupidPicks.length >= 2) return fail(state, "Chỉ ghép được 2 người");
      const cupidPicks = has ? state.cupidPicks.filter((id) => id !== action.targetId) : [...state.cupidPicks, action.targetId];
      return { state: { ...state, cupidPicks } };
    }

    case "CURSE_SET": {
      if (!nightActor(state, action.playerId, "cursed_wolf") || !state.curse.armed || state.curse.used) return fail(state);
      const t = action.targetId;
      if (t !== null && t !== state.bittenId && t !== state.bittenId2) return fail(state); // chỉ biến người vừa bị cắn
      return { state: { ...state, curseTarget: t } };
    }

    default:
      return dayAction(state, action);
  }
}
