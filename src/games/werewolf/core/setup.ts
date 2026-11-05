// Tạo ván Ma Sói + kiểm tra/gợi ý cấu hình. THUẦN: ngẫu nhiên và giờ đều do tham số truyền vào.
import { shuffle } from "../../bang/core/rng";
import type { Config, GameState, NightStep, PlayerState, Role } from "./types";
import {
  ALL_ROLES,
  DEFAULT_NIGHT_STEP_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NIGHT_STEP_ORDER,
  NIGHT_STEP_ROLE,
} from "./types";

// R-01e: bảng gợi ý. Dân làng = phần còn lại.
const WOLVES_BY_PLAYER_COUNT: Record<number, number> = { 6: 2, 7: 2, 8: 2, 9: 2, 10: 3, 11: 3, 12: 3 };

export function suggestedConfig(playerCount: number): Config {
  // Ngoài 6–12: cố gắng gần đúng (1/4 là Sói), để UI vẫn có số liệu; validateConfig sẽ chặn nếu số người sai.
  const wolf = WOLVES_BY_PLAYER_COUNT[playerCount] ?? Math.max(1, Math.round(playerCount / 4));
  const villager = Math.max(0, playerCount - wolf - 3);
  return {
    roleCounts: { wolf, villager, seer: 1, witch: 1, guard: 1 },
    nightStepMs: DEFAULT_NIGHT_STEP_MS,
  };
}

// R-01a, R-01c. Trả câu lỗi tiếng Việt cho chủ phòng đọc, null = hợp lệ.
export function validateConfig(config: Config, playerCount: number): string | null {
  if (playerCount < MIN_PLAYERS) return `Cần ít nhất ${MIN_PLAYERS} người chơi`;
  if (playerCount > MAX_PLAYERS) return `Tối đa ${MAX_PLAYERS} người chơi`;
  const c = config.roleCounts;
  for (const role of ALL_ROLES) {
    if (!Number.isInteger(c[role]) || c[role] < 0) return "Số lượng vai không hợp lệ";
  }
  if (!Number.isFinite(config.nightStepMs) || config.nightStepMs <= 0) return "Thời gian pha đêm không hợp lệ";
  const total = ALL_ROLES.reduce((sum, role) => sum + c[role], 0);
  if (total !== playerCount) return `Tổng số vai (${total}) phải bằng số người chơi (${playerCount})`;
  if (c.wolf < 1) return "Cần ít nhất 1 Sói";
  if (c.wolf >= playerCount - c.wolf) return "Số Sói phải ít hơn số người không phải Sói";
  for (const role of ["seer", "witch", "guard"] as const) {
    if (c[role] > 1) return "Tiên tri, Phù thủy, Bảo vệ mỗi vai tối đa 1";
  }
  return null;
}

// Pha đêm nào có mặt, theo thứ tự cố định (R-31, R-82): vai không có trong config thì bỏ pha.
function computeNightSteps(config: Config): NightStep[] {
  return NIGHT_STEP_ORDER.filter((step) => config.roleCounts[NIGHT_STEP_ROLE[step]] > 0);
}

export function setupGame(
  players: { id: string; name: string }[],
  seed: number,
  config: Config,
  now: number,
): GameState {
  // R-01f: chia vai bằng RNG có seed. Ghế theo đúng thứ tự `players` truyền vào.
  const roles: Role[] = [];
  for (const role of ALL_ROLES) {
    for (let i = 0; i < config.roleCounts[role]; i++) roles.push(role);
  }
  const shuffled = shuffle(roles, seed);

  const playerStates: PlayerState[] = players.map((p, index) => ({
    id: p.id,
    name: p.name,
    seat: index,
    role: shuffled.result[index],
    alive: true,
  }));

  const nightSteps = computeNightSteps(config);

  return {
    rngState: shuffled.nextState,
    config,
    players: playerStates,
    phase: { kind: "night", night: 1, step: nightSteps[0] }, // R-30
    phaseSeq: 1,
    phaseEndsAt: now + config.nightStepMs,
    nightSteps,
    guardTarget: null,
    lastGuardTarget: null,
    wolfPicks: {},
    bittenId: null,
    seerPick: null,
    witchSave: false,
    witchPoisonTarget: null,
    potions: { save: true, poison: true },
    seerResults: [],
    lastNightDeaths: [],
    extendUsed: false,
    endEarly: {},
    votes: {},
    verdicts: {},
    log: [],
  };
}
