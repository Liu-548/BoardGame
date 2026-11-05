// Tạo ván Ma Sói + kiểm tra/gợi ý cấu hình. THUẦN: ngẫu nhiên và giờ đều do tham số truyền vào.
import { shuffle } from "../../bang/core/rng";
import type { Config, GameState, NightStep, PlayerState, Role } from "./types";
import {
  ALL_ROLES,
  DEFAULT_NIGHT_STEP_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NIGHT_STEP_ORDER,
  NIGHT_STEP_ROLES,
  ROLE_REVEAL_MS,
  WOLF_ROLES,
} from "./types";

// R-01e: bảng gợi ý. Dân làng = phần còn lại.
const WOLVES_BY_PLAYER_COUNT: Record<number, number> = {
  6: 2, 7: 2, 8: 2, 9: 2, 10: 3, 11: 3, 12: 3,
  13: 3, 14: 4, 15: 4, 16: 4, 17: 4, 18: 5, 19: 5, 20: 5,
};

export function suggestedConfig(playerCount: number): Config {
  // Ngoài 6–20: cố gắng gần đúng (1/4 là Sói), để UI vẫn có số liệu; validateConfig sẽ chặn nếu số người sai.
  const wolf = WOLVES_BY_PLAYER_COUNT[playerCount] ?? Math.max(1, Math.round(playerCount / 4));
  const villager = Math.max(0, playerCount - wolf - 3);
  const roleCounts = Object.fromEntries(ALL_ROLES.map((r) => [r, 0])) as Config["roleCounts"];
  return {
    roleCounts: { ...roleCounts, wolf, villager, seer: 1, witch: 1, guard: 1 },
    nightStepMs: DEFAULT_NIGHT_STEP_MS,
    mayor: false,
  };
}

// R-01a, R-01c. Trả câu lỗi tiếng Việt cho chủ phòng đọc, null = hợp lệ.
export function validateConfig(config: Config, playerCount: number): string | null {
  if (playerCount < MIN_PLAYERS) return `Cần ít nhất ${MIN_PLAYERS} người chơi`;
  if (playerCount > MAX_PLAYERS) return `Tối đa ${MAX_PLAYERS} người chơi`;
  // Cấu hình cũ (trước khi có vai mới) thiếu key → coi như 0.
  const c = Object.fromEntries(ALL_ROLES.map((r) => [r, config.roleCounts[r] ?? 0])) as Config["roleCounts"];
  for (const role of ALL_ROLES) {
    if (!Number.isInteger(c[role]) || c[role] < 0) return "Số lượng vai không hợp lệ";
  }
  if (!Number.isFinite(config.nightStepMs) || config.nightStepMs <= 0) return "Thời gian pha đêm không hợp lệ";
  const total = ALL_ROLES.reduce((sum, role) => sum + c[role], 0);
  if (total !== playerCount) return `Tổng số vai (${total}) phải bằng số người chơi (${playerCount})`;
  const wolves = WOLF_ROLES.reduce((sum, role) => sum + c[role], 0);
  if (wolves < 1) return "Cần ít nhất 1 Sói";
  if (wolves >= playerCount - wolves) return "Số Sói phải ít hơn số người không phải Sói";
  for (const role of ALL_ROLES) {
    if (role !== "wolf" && role !== "villager" && c[role] > 1) return "Mỗi vai chức năng tối đa 1 (trừ Sói và Dân làng)";
  }
  return null;
}

// Pha đêm nào có mặt, theo thứ tự cố định (R-31, R-82): pha không có vai nào trong config thì bỏ.
function computeNightSteps(config: Config): NightStep[] {
  return NIGHT_STEP_ORDER.filter((step) => NIGHT_STEP_ROLES[step].some((role) => (config.roleCounts[role] ?? 0) > 0));
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
    for (let i = 0; i < (config.roleCounts[role] ?? 0); i++) roles.push(role);
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
    phase: { kind: "reveal" }, // R-30a: xem vai trước, hết giờ mới vào Đêm 1 (R-30)
    phaseSeq: 1,
    phaseEndsAt: now + ROLE_REVEAL_MS,
    nightSteps,
    guardTarget: null,
    lastGuardTarget: null,
    wolfPicks: {},
    wolfPicks2: {},
    doubleBite: false,
    bittenId: null,
    bittenId2: null,
    seerPick: null,
    witchSave: false,
    witchSave2: false,
    witchPoisonTarget: null,
    cupidPicks: [],
    curseTarget: null,
    potions: { save: true, poison: true },
    seerResults: [],
    lastNightDeaths: [],
    lovers: [],
    elderHit: false,
    idiotRevealed: null,
    cubRevenge: false,
    knightCurse: null,
    curse: { armed: false, used: false },
    mayorId: null,
    mayorElected: false,
    deathQueue: [],
    resume: null,
    extendUsed: false,
    endEarly: {},
    votes: {},
    verdicts: {},
    log: [],
  };
}
