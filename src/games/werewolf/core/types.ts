// Kiểu dữ liệu core của Ma Sói. Toàn bộ là JSON thuần (quy tắc 3 CLAUDE.md):
// không class, không Map/Set, không hàm. Xem docs/werewolf/02-THIET-KE.md mục 1.

export type Role = "wolf" | "villager" | "seer" | "witch" | "guard";
export type NightStep = "guard" | "wolves" | "seer" | "witch"; // thứ tự cố định R-31
export type Winner = "village" | "wolves" | "draw"; // R-60

// Mọi vai theo thứ tự hiển thị cố định (dùng để duyệt roleCounts).
export const ALL_ROLES: Role[] = ["wolf", "villager", "seer", "witch", "guard"];

// Thứ tự pha đêm v1 (R-31, R-32).
export const NIGHT_STEP_ORDER: NightStep[] = ["guard", "wolves", "seer", "witch"];

// Vai nào "thức dậy" ở pha nào — dùng để lọc pha theo config (R-82).
export const NIGHT_STEP_ROLE: Record<NightStep, Role> = {
  guard: "guard",
  wolves: "wolf",
  seer: "seer",
  witch: "witch",
};

// R-01a: giới hạn số người là hằng số, nâng được khi có bản mở rộng.
export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 12;

// R-09: mặc định 30 giây cho mỗi pha đêm.
export const DEFAULT_NIGHT_STEP_MS = 30_000;

export interface Config {
  roleCounts: Record<Role, number>; // R-01b..d — công khai
  nightStepMs: number;
}

export type Phase =
  | { kind: "night"; night: number; step: NightStep }
  | { kind: "discussion"; day: number }
  | { kind: "vote"; day: number }
  | { kind: "defense"; day: number; accusedId: string }
  | { kind: "verdict"; day: number; accusedId: string }
  | { kind: "ended"; winner: Winner };

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  role: Role;
  alive: boolean;
}

// Nhật ký CHỈ chứa thông tin công khai (D-31); client tự dịch ra chữ.
export type PublicLogEntry =
  | { kind: "deaths"; night: number; ids: string[] } // chết lúc Bình minh (R-50)
  | { kind: "vote_result"; day: number; accusedId: string | null } // R-52e
  | { kind: "verdict_result"; day: number; accusedId: string; killed: boolean } // R-54c
  | { kind: "ended"; winner: Winner };

export interface GameState {
  rngState: number;
  config: Config;
  players: PlayerState[]; // xếp theo seat
  phase: Phase;
  phaseSeq: number; // +1 mỗi lần đổi pha (chống TIME_UP trễ, D-21)
  phaseEndsAt: number | null; // epoch ms, null khi ended (D-20)
  nightSteps: NightStep[]; // tính 1 lần lúc setup từ config (R-82)
  // --- ban đêm (reset đầu mỗi đêm) ---
  guardTarget: string | null;
  lastGuardTarget: string | null; // R-40b — null nếu đêm trước không chọn
  wolfPicks: Record<string, string>; // wolfId → targetId
  bittenId: string | null; // chốt khi pha wolves kết thúc (R-41c)
  seerPick: string | null; // R-42c
  witchSave: boolean;
  witchPoisonTarget: string | null;
  // --- cả ván ---
  potions: { save: boolean; poison: boolean }; // true = còn
  seerResults: { night: number; targetId: string; isWolf: boolean }[];
  lastNightDeaths: string[]; // R-50, xếp theo seat
  // --- ban ngày (reset đầu mỗi ngày) ---
  extendUsed: boolean; // R-51a
  endEarly: Record<string, true>; // R-51b
  votes: Record<string, string>; // voterId → targetId | "blank" (R-52)
  verdicts: Record<string, "kill" | "spare">; // R-54
  log: PublicLogEntry[];
}

export type Action =
  | { type: "GUARD_PICK"; playerId: string; targetId: string | null; now: number }
  | { type: "WOLF_PICK"; playerId: string; targetId: string | null; now: number }
  | { type: "SEER_PICK"; playerId: string; targetId: string; now: number }
  | { type: "WITCH_SET"; playerId: string; save: boolean; poisonTarget: string | null; now: number }
  | { type: "EXTEND_DISCUSSION"; playerId: string; now: number }
  | { type: "TOGGLE_END_EARLY"; playerId: string; now: number }
  | { type: "CAST_VOTE"; playerId: string; targetId: string | "blank" | null; now: number }
  | { type: "CAST_VERDICT"; playerId: string; choice: "kill" | "spare" | null; now: number }
  | { type: "TIME_UP"; phaseSeq: number; now: number };
