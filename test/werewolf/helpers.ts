import { expect } from "vitest";
import { reduce } from "../../src/games/werewolf/core/reduce";
import { setupGame } from "../../src/games/werewolf/core/setup";
import type { Action, GameState, NightStep, Phase, Role } from "../../src/games/werewolf/core/types";
import { ALL_ROLES } from "../../src/games/werewolf/core/types";

export const STD6: Role[] = ["wolf", "wolf", "seer", "witch", "guard", "villager"];

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// Ván với vai cố định; id p0.. theo thứ tự mảng.
export function makeGame(roles: Role[], opts: { nightStepMs?: number; seed?: number; now?: number } = {}): GameState {
  const roleCounts = Object.fromEntries(ALL_ROLES.map((r) => [r, roles.filter((x) => x === r).length])) as Record<Role, number>;
  const config = { roleCounts, nightStepMs: opts.nightStepMs ?? 30_000 };
  const players = roles.map((_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const s = setupGame(players, opts.seed ?? 1, config, opts.now ?? 1000);
  return { ...s, players: s.players.map((p, i) => ({ ...p, role: roles[i] })) };
}

type Distribute<T> = T extends unknown ? Omit<T, "now"> & { now?: number } : never;
type ActionInput = Distribute<Action>;
const withNow = (a: ActionInput): Action => ({ now: 2000, ...a }) as Action;

export function act(state: GameState, action: ActionInput): GameState {
  const r = reduce(deepFreeze(state), withNow(action));
  expect(r.error).toBeUndefined();
  return r.state;
}

export function reject(state: GameState, action: ActionInput): string {
  const r = reduce(deepFreeze(state), withNow(action));
  expect(r.error).toBeDefined();
  expect(r.state).toBe(state);
  return r.error as string;
}

export function timeUp(state: GameState): GameState {
  return act(state, { type: "TIME_UP", phaseSeq: state.phaseSeq, now: state.phaseEndsAt ?? 0 });
}

export function skipTo(state: GameState, target: { kind: Phase["kind"]; step?: NightStep }): GameState {
  let s = state;
  for (let i = 0; i < 20; i++) {
    const ph = s.phase;
    if (ph.kind === target.kind && (target.step === undefined || (ph.kind === "night" && ph.step === target.step))) return s;
    s = timeUp(s);
  }
  throw new Error("skipTo không tới đích");
}
