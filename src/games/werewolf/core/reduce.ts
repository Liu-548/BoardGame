// Luật Ma Sói: ban đêm + Bình minh + ban ngày + TIME_UP (W2, W3).
// reduce THUẦN: không sửa state đầu vào, không dùng ngẫu nhiên/đồng hồ hệ thống (quy tắc 1-3 CLAUDE.md).
import { nextRandom } from "../../bang/core/rng";
import type { Action, GameState, NightStep, PlayerState, Winner } from "./types";

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

// Đầu mỗi đêm reset các trường "ban đêm" (02 mục 1). lastGuardTarget giữ nguyên (R-40b).
export function startNight(state: GameState, night: number, now: number): GameState {
  return {
    ...state,
    phase: { kind: "night", night, step: state.nightSteps[0] },
    phaseSeq: state.phaseSeq + 1,
    phaseEndsAt: now + state.config.nightStepMs,
    guardTarget: null,
    wolfPicks: {},
    bittenId: null,
    seerPick: null,
    witchSave: false,
    witchPoisonTarget: null,
  };
}

// R-60: kiểm tra thắng. Thứ tự c (hoà) → a → b.
export function checkWinner(players: PlayerState[]): Winner | null {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === "wolf").length;
  const others = alive.length - wolves;
  if (wolves === 0 && others === 0) return "draw"; // R-60c
  if (wolves === 0) return "village"; // R-60a
  if (wolves >= others) return "wolves"; // R-60b
  return null;
}

// Kết thúc ván: ended, không còn hạn giờ (D-20).
function endGame(state: GameState, winner: Winner): GameState {
  return {
    ...state,
    phase: { kind: "ended", winner },
    phaseSeq: state.phaseSeq + 1,
    phaseEndsAt: null,
    log: [...state.log, { kind: "ended", winner }],
  };
}

// D-13, R-41c: đa số phiếu Sói; hoà thì bốc ngẫu nhiên bằng RNG có seed.
function resolveWolfBite(state: GameState): GameState {
  const counts = new Map<string, number>();
  for (const target of Object.values(state.wolfPicks)) counts.set(target, (counts.get(target) ?? 0) + 1);
  if (counts.size === 0) return { ...state, bittenId: null }; // R-41d
  const max = Math.max(...counts.values());
  // Xếp theo ghế để kết quả tất định, không phụ thuộc thứ tự key của object.
  const tied = state.players.filter((p) => counts.get(p.id) === max).map((p) => p.id);
  if (tied.length === 1) return { ...state, bittenId: tied[0] };
  const { value, nextState } = nextRandom(state.rngState);
  return { ...state, bittenId: tied[Math.floor(value * tied.length)], rngState: nextState };
}

// D-14, R-44: Bình minh — áp mọi hiệu ứng đêm cùng lúc.
function resolveDawn(state: GameState, now: number): GameState {
  const dies = new Set<string>();
  const { bittenId, guardTarget, witchSave, witchPoisonTarget } = state;
  if (bittenId && guardTarget !== bittenId && !witchSave) dies.add(bittenId); // R-44a,b
  if (witchPoisonTarget) dies.add(witchPoisonTarget); // R-44c: Bảo vệ không chặn độc (R-40d)

  const players = state.players.map((p) => (dies.has(p.id) ? { ...p, alive: false } : p));
  const ids = players.filter((p) => dies.has(p.id)).map((p) => p.id); // players đã xếp theo ghế (R-50)
  const night = state.phase.kind === "night" ? state.phase.night : 0;

  const next: GameState = {
    ...state,
    players,
    // Bình chỉ bị trừ ở đây (02 §10.4).
    potions: {
      save: state.potions.save && !witchSave,
      poison: state.potions.poison && !witchPoisonTarget,
    },
    lastGuardTarget: guardTarget,
    lastNightDeaths: ids,
    log: [...state.log, { kind: "deaths", night, ids }],
  };

  const winner = checkWinner(players); // R-44e
  if (winner) return endGame(next, winner);
  return {
    ...next,
    phase: { kind: "discussion", day: night },
    phaseSeq: state.phaseSeq + 1,
    phaseEndsAt: now + DISCUSSION_MS,
    extendUsed: false,
    endEarly: {},
    votes: {},
    verdicts: {},
  };
}


// ---------- Ban ngày (W3) ----------

const alivePlayers = (state: GameState) => state.players.filter((p) => p.alive);

// Đổi sang pha mới: phaseSeq+1, đặt hạn giờ (D-12).
function enterPhase(state: GameState, phase: GameState["phase"], now: number, ms: number): GameState {
  return { ...state, phase, phaseSeq: state.phaseSeq + 1, phaseEndsAt: now + ms };
}

function enterVote(state: GameState, day: number, now: number): GameState {
  return { ...enterPhase(state, { kind: "vote", day }, now, VOTE_MS), votes: {} };
}

// R-52d,e: phiếu trắng không phải ứng viên; cao nhất > 0 và duy nhất mới bị đưa lên.
function resolveVote(state: GameState, day: number, now: number): GameState {
  const counts = new Map<string, number>();
  for (const t of Object.values(state.votes)) if (t !== "blank") counts.set(t, (counts.get(t) ?? 0) + 1);
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

// R-54c: Giết > Tha mới chết (không lật vai). R-54d: rồi kiểm thắng.
function resolveVerdict(state: GameState, day: number, accusedId: string, now: number): GameState {
  const kills = Object.values(state.verdicts).filter((v) => v === "kill").length;
  const spares = Object.values(state.verdicts).filter((v) => v === "spare").length;
  const killed = kills > spares;
  const players = killed ? state.players.map((p) => (p.id === accusedId ? { ...p, alive: false } : p)) : state.players;
  const next = { ...state, players, log: [...state.log, { kind: "verdict_result" as const, day, accusedId, killed }] };
  const winner = checkWinner(players);
  return winner ? endGame(next, winner) : startNight(next, day + 1, now);
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
    default:
      return state; // ended: không đổi gì
  }
}

// Người gửi còn sống? (R-70)
const aliveActor = (state: GameState, id: string) => findPlayer(state, id)?.alive === true;

function dayAction(state: GameState, action: Action): Result {
  const ph = state.phase;
  switch (action.type) {
    case "EXTEND_DISCUSSION": {
      if (ph.kind !== "discussion" || !aliveActor(state, action.playerId) || state.extendUsed) return fail(state);
      return { state: { ...state, extendUsed: true, phaseEndsAt: (state.phaseEndsAt ?? 0) + EXTEND_MS } };
    }
    case "TOGGLE_END_EARLY": {
      if (ph.kind !== "discussion" || !aliveActor(state, action.playerId)) return fail(state);
      const endEarly = { ...state.endEarly };
      if (endEarly[action.playerId]) delete endEarly[action.playerId];
      else endEarly[action.playerId] = true;
      const next = { ...state, endEarly };
      // R-51b: quá nửa người còn sống đang bật → kết thúc ngay.
      if (Object.keys(endEarly).length * 2 > alivePlayers(state).length) return { state: enterVote(next, ph.day, action.now) };
      return { state: next };
    }
    case "CAST_VOTE": {
      if (ph.kind !== "vote" || !aliveActor(state, action.playerId)) return fail(state);
      const votes = { ...state.votes };
      if (action.targetId === null) delete votes[action.playerId];
      else if (action.targetId !== "blank" && !aliveActor(state, action.targetId)) return fail(state);
      else votes[action.playerId] = action.targetId;
      const next = { ...state, votes };
      // R-52c: mọi người còn sống đã bỏ phiếu → kết thúc ngay.
      if (alivePlayers(state).every((p) => votes[p.id] !== undefined)) return { state: resolveVote(next, ph.day, action.now) };
      return { state: next };
    }
    case "CAST_VERDICT": {
      if (ph.kind !== "verdict" || !aliveActor(state, action.playerId) || action.playerId === ph.accusedId) return fail(state);
      const verdicts = { ...state.verdicts };
      if (action.choice === null) delete verdicts[action.playerId];
      else verdicts[action.playerId] = action.choice;
      const next = { ...state, verdicts };
      // R-54b: mọi người có quyền đã chọn → kết thúc ngay.
      const voters = alivePlayers(state).filter((p) => p.id !== ph.accusedId);
      if (voters.every((p) => verdicts[p.id] !== undefined)) return { state: resolveVerdict(next, ph.day, ph.accusedId, action.now) };
      return { state: next };
    }
    default:
      return fail(state);
  }
}

function timeUp(state: GameState, action: Extract<Action, { type: "TIME_UP" }>): Result {
  // D-21: TIME_UP của pha cũ (pha đã đổi) bị bỏ qua, không báo lỗi.
  if (action.phaseSeq !== state.phaseSeq) return { state };
  if (state.phase.kind !== "night") return { state: dayTimeUp(state, action.now) };

  let s = state;
  if (state.phase.step === "wolves") s = resolveWolfBite(s);
  const idx = state.nightSteps.indexOf(state.phase.step);
  const nextStep: NightStep | undefined = state.nightSteps[idx + 1];
  if (nextStep) {
    return {
      state: {
        ...s,
        phase: { kind: "night", night: state.phase.night, step: nextStep },
        phaseSeq: s.phaseSeq + 1,
        phaseEndsAt: action.now + s.config.nightStepMs,
      },
    };
  }
  return { state: resolveDawn(s, action.now) };
}

// Kiểm người gửi đúng pha đêm, đúng vai, còn sống (D-15). Trả người chơi hoặc null.
function nightActor(state: GameState, playerId: string, step: NightStep, role: PlayerState["role"]) {
  if (state.phase.kind !== "night" || state.phase.step !== step) return null;
  const p = findPlayer(state, playerId);
  return p && p.alive && p.role === role ? p : null;
}

const isAlive = (state: GameState, id: string) => findPlayer(state, id)?.alive === true;

export function reduce(state: GameState, action: Action): Result {
  switch (action.type) {
    case "TIME_UP":
      return timeUp(state, action);

    case "GUARD_PICK": {
      if (!nightActor(state, action.playerId, "guard", "guard")) return fail(state);
      const t = action.targetId;
      if (t !== null) {
        if (!isAlive(state, t)) return fail(state);
        if (t === state.lastGuardTarget) return fail(state, "Không được bảo vệ cùng một người hai đêm liên tiếp"); // R-40b
      }
      return { state: { ...state, guardTarget: t } };
    }

    case "WOLF_PICK": {
      if (!nightActor(state, action.playerId, "wolves", "wolf")) return fail(state);
      const picks = { ...state.wolfPicks };
      if (action.targetId === null) delete picks[action.playerId];
      else if (!isAlive(state, action.targetId)) return fail(state); // R-41b: được chọn Sói/chính mình
      else picks[action.playerId] = action.targetId;
      return { state: { ...state, wolfPicks: picks } };
    }

    case "SEER_PICK": {
      if (!nightActor(state, action.playerId, "seer", "seer")) return fail(state);
      if (state.seerPick !== null) return fail(state); // R-42c: chọn xong không đổi
      const target = findPlayer(state, action.targetId);
      if (!target || !target.alive || target.id === action.playerId) return fail(state); // R-42a
      const night = state.phase.kind === "night" ? state.phase.night : 0;
      return {
        state: {
          ...state,
          seerPick: target.id,
          seerResults: [...state.seerResults, { night, targetId: target.id, isWolf: target.role === "wolf" }],
        },
      };
    }

    case "WITCH_SET": {
      if (!nightActor(state, action.playerId, "witch", "witch")) return fail(state);
      if (action.save && (state.bittenId === null || !state.potions.save)) return fail(state); // R-43b
      if (action.poisonTarget !== null) {
        if (!state.potions.poison || !isAlive(state, action.poisonTarget)) return fail(state); // R-43c
      }
      return { state: { ...state, witchSave: action.save, witchPoisonTarget: action.poisonTarget } };
    }

    default:
      return dayAction(state, action);
  }
}
