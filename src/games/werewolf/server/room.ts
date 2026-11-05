// Phòng Ma Sói = khung phòng chung + adapter (02 mục 5.1). Không chứa luật.
import { BaseRoom } from "../../../shared/room/base-room";
import type { GameAdapter } from "../../../shared/room/base-room";
import { reduce } from "../core/reduce";
import { setupGame, suggestedConfig, validateConfig } from "../core/setup";
import type { Action, Config, GameState, Role } from "../core/types";
import { ALL_ROLES, MAX_PLAYERS, MIN_PLAYERS } from "../core/types";
import { viewFor } from "../core/view";
import type { WerewolfView } from "../core/view";

// Ép dữ liệu thô từ client về Config đúng hình dạng; thời gian đêm giới hạn 5–120s.
function sanitizeConfig(raw: unknown): Config | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { roleCounts?: Record<string, unknown>; nightStepMs?: unknown; mayor?: unknown };
  if (typeof r.roleCounts !== "object" || r.roleCounts === null || typeof r.nightStepMs !== "number") return null;
  const counts = {} as Config["roleCounts"];
  for (const role of ALL_ROLES) {
    const n = r.roleCounts[role] ?? 0; // client cũ chưa biết vai mới → 0
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_PLAYERS) return null;
    counts[role] = n;
  }
  return { roleCounts: counts, nightStepMs: Math.min(120_000, Math.max(5_000, Math.round(r.nightStepMs))), mayor: r.mayor === true };
}

// Phòng test (chỉ bản beta): vai theo bảng chủ phòng gán. Số lượng vai suy ra từ bảng gán, vẫn phải hợp lệ
// (validateConfig) để luật chạy đúng; tạo ván bằng setupGame như thường rồi đặt lại vai từng người.
export function setupWithRoles(
  players: { id: string; name: string }[],
  seed: number,
  config: Config,
  now: number,
  roles: Record<string, string>,
): { state: GameState } | { error: string } {
  const assigned: Role[] = [];
  for (const p of players) {
    const role = roles[p.id] as Role;
    if (!ALL_ROLES.includes(role)) return { error: `Chưa gán vai cho ${p.name}` };
    assigned.push(role);
  }
  const roleCounts = Object.fromEntries(ALL_ROLES.map((r) => [r, assigned.filter((x) => x === r).length])) as Config["roleCounts"];
  const cfg: Config = { ...config, roleCounts };
  const err = validateConfig(cfg, players.length);
  if (err) return { error: err };
  const state = setupGame(players, seed, cfg, now);
  return { state: { ...state, players: state.players.map((p, i) => ({ ...p, role: assigned[i] })) } };
}

const adapter: GameAdapter<GameState, Action, WerewolfView, Config> = {
  defaultConfig: suggestedConfig,
  validateConfig,
  sanitizeConfig,
  setup: setupGame,
  setupWithRoles,
  reduce,
  viewFor,
  deadline: (state) => state.phaseEndsAt,
  timeUpAction: (state, now) => ({ type: "TIME_UP", phaseSeq: state.phaseSeq, now }),
  isOver: (state) => state.phase.kind === "ended",
  phaseToken: (state) => state.phaseSeq, // đêm: người không giữ vai không thấy hạn giờ (R-81d) → so bằng phaseSeq
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
};

export class WerewolfRoom extends BaseRoom<GameState, Action, WerewolfView, Config> {
  constructor(ctx: DurableObjectState, env: { DEV_TOOLS?: string }) {
    super(ctx, adapter, env.DEV_TOOLS === "1");
  }
}
