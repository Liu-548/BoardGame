// Phòng Ma Sói = khung phòng chung + adapter (02 mục 5.1). Không chứa luật.
import { BaseRoom } from "../../../shared/room/base-room";
import type { GameAdapter } from "../../../shared/room/base-room";
import { reduce } from "../core/reduce";
import { setupGame, suggestedConfig, validateConfig } from "../core/setup";
import type { Action, Config, GameState } from "../core/types";
import { ALL_ROLES, MAX_PLAYERS, MIN_PLAYERS } from "../core/types";
import { viewFor } from "../core/view";
import type { WerewolfView } from "../core/view";

// Ép dữ liệu thô từ client về Config đúng hình dạng; thời gian đêm giới hạn 5–120s.
function sanitizeConfig(raw: unknown): Config | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { roleCounts?: Record<string, unknown>; nightStepMs?: unknown };
  if (typeof r.roleCounts !== "object" || r.roleCounts === null || typeof r.nightStepMs !== "number") return null;
  const counts = {} as Config["roleCounts"];
  for (const role of ALL_ROLES) {
    const n = r.roleCounts[role];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_PLAYERS) return null;
    counts[role] = n;
  }
  return { roleCounts: counts, nightStepMs: Math.min(120_000, Math.max(5_000, Math.round(r.nightStepMs))) };
}

const adapter: GameAdapter<GameState, Action, WerewolfView, Config> = {
  defaultConfig: suggestedConfig,
  validateConfig,
  sanitizeConfig,
  setup: setupGame,
  reduce,
  viewFor,
  deadline: (state) => state.phaseEndsAt,
  timeUpAction: (state, now) => ({ type: "TIME_UP", phaseSeq: state.phaseSeq, now }),
  isOver: (state) => state.phase.kind === "ended",
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
};

export class WerewolfRoom extends BaseRoom<GameState, Action, WerewolfView, Config> {
  constructor(ctx: DurableObjectState, _env: unknown) {
    super(ctx, adapter);
  }
}
