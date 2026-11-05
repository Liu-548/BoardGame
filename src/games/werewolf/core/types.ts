// Kiểu dữ liệu core của Ma Sói. Toàn bộ là JSON thuần (quy tắc 3 CLAUDE.md):
// không class, không Map/Set, không hàm. Xem docs/werewolf/02-THIET-KE.md mục 1.

export type Role =
  | "wolf"
  | "villager"
  | "seer"
  | "witch"
  | "guard"
  // Vai mới (01-LUAT mục 12)
  | "wolf_cub" // Sói con: chết → đêm sau bầy cắn 2
  | "cursed_wolf" // Sói nguyền: 1 lần, biến người bị cắn thành Sói
  | "hunter" // Thợ săn: chết → bắn 1 người
  | "elder" // Già làng: chịu 1 lần cắn
  | "idiot" // Kẻ ngốc: bị treo không chết, lộ vai, mất quyền bỏ phiếu
  | "knight" // Kỵ sĩ: bị cắn chết → Sói gần nhất phía ghế nhỏ hơn chết sáng hôm sau nữa
  | "cupid" // Cupid: đêm 1 ghép đôi
  | "tanner"; // Kẻ chán đời: phe riêng, thắng nếu bị treo cổ
// R-31 (sửa 2026-11-05): đêm có 2 pha, các vai trong cùng pha thức CÙNG LÚC.
// first = Sói, Bảo vệ, Tiên tri (không cần thông tin của nhau); second = Phù thủy (cần biết ai bị cắn).
export type NightStep = "first" | "second";
export type Winner = "village" | "wolves" | "draw" | "tanner" | "lovers"; // R-60

// Mọi vai theo thứ tự hiển thị cố định (dùng để duyệt roleCounts).
// Vai mới thêm ở CUỐI để thứ tự chia vai bằng seed của các vai cũ không đổi.
export const ALL_ROLES: Role[] = ["wolf", "villager", "seer", "witch", "guard", "wolf_cub", "cursed_wolf", "hunter", "elder", "idiot", "knight", "cupid", "tanner"];

// Phe Sói (thức cùng bầy, Tiên tri soi ra "Là Sói", tính vào số Sói khi xét thắng).
export const WOLF_ROLES: Role[] = ["wolf", "wolf_cub", "cursed_wolf"];
export const isWolfRole = (role: Role): boolean => WOLF_ROLES.includes(role);

// Thứ tự pha đêm (R-31, R-32).
export const NIGHT_STEP_ORDER: NightStep[] = ["first", "second"];

// Vai nào thức ở pha nào — dùng để lọc pha theo config (R-82) và kiểm người gửi action.
export const NIGHT_STEP_ROLES: Record<NightStep, Role[]> = {
  first: ["wolf", "wolf_cub", "cursed_wolf", "guard", "seer", "cupid"], // Cupid chỉ đêm 1
  second: ["witch", "cursed_wolf"], // Sói nguyền: chỉ khi đã kích hoạt (pha 2 vẫn luôn chạy nếu có vai này)
};

// R-01a: giới hạn số người là hằng số, nâng được khi có bản mở rộng.
export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 20;

// R-09: mặc định 30 giây cho mỗi pha đêm.
export const DEFAULT_NIGHT_STEP_MS = 30_000;

// R-30a: pha "Xem vai" trước Đêm 1 (client chạy animation chia vai).
export const ROLE_REVEAL_MS = 6_000;

// Pha "khi chết" và bầu Trưởng làng (01-LUAT mục 12).
export const HUNTER_MS = 30_000;
export const SUCCESSOR_MS = 30_000;
export const ELECTION_MS = 60_000;

export interface Config {
  roleCounts: Record<Role, number>; // R-01b..d — công khai
  nightStepMs: number;
  mayor: boolean; // có bầu Trưởng làng (danh hiệu) hay không — công khai
}

export type Phase =
  | { kind: "reveal" } // R-30a: không ai hành động, hết giờ → Đêm 1
  | { kind: "night"; night: number; step: NightStep }
  | { kind: "discussion"; day: number }
  | { kind: "vote"; day: number }
  | { kind: "defense"; day: number; accusedId: string }
  | { kind: "verdict"; day: number; accusedId: string }
  | { kind: "election"; day: number } // bầu Trưởng làng đầu Ngày 1
  | { kind: "hunter"; hunterId: string } // Thợ săn (đã chết) chọn người bắn
  | { kind: "successor"; mayorId: string } // Trưởng làng (đã chết) chỉ định người kế nhiệm
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
  | { kind: "verdict_result"; day: number; accusedId: string; killed: boolean; idiot?: true; grief?: string[] } // R-54c; idiot = Kẻ ngốc lộ vai; grief = chết theo người yêu
  | { kind: "hunter_shot"; hunterId: string; targetId: string | null; ids: string[] } // ids = mọi người chết vì phát bắn (kể cả chết theo)
  | { kind: "mayor"; mayorId: string | null; how: "elected" | "passed" | "lost" }
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
  wolfPicks2: Record<string, string>; // phát cắn thứ 2 (đêm Sói con báo thù)
  doubleBite: boolean; // đêm nay bầy Sói cắn 2 (Sói con chết hôm trước)
  bittenId: string | null; // chốt khi pha 1 kết thúc (R-41c)
  bittenId2: string | null;
  seerPick: string | null; // R-42c
  witchSave: boolean; // cứu bittenId
  witchSave2: boolean; // cứu bittenId2 (bình cứu chỉ 1: không cùng lúc với witchSave)
  witchPoisonTarget: string | null;
  cupidPicks: string[]; // đêm 1: tối đa 2 người
  curseTarget: string | null; // Sói nguyền chọn biến ai (pha 2)
  // --- cả ván ---
  potions: { save: boolean; poison: boolean }; // true = còn
  seerResults: { night: number; targetId: string; isWolf: boolean }[];
  lastNightDeaths: string[]; // R-50, xếp theo seat
  lovers: string[]; // Cupid ghép (0 hoặc 2 người)
  elderHit: boolean; // Già làng đã chịu 1 lần cắn
  idiotRevealed: string | null; // Kẻ ngốc đã lộ (mất quyền bỏ phiếu)
  cubRevenge: boolean; // Sói con vừa chết → đêm kế tiếp cắn 2
  knightCurse: string | null; // Sói sẽ chết ở Bình minh kế tiếp (Kỵ sĩ)
  curse: { armed: boolean; used: boolean }; // Sói nguyền
  mayorId: string | null;
  mayorElected: boolean; // đã bầu (chỉ bầu 1 lần, đầu Ngày 1)
  // --- hàng chờ hiệu ứng "khi chết" + nơi quay về sau khi xử lý xong ---
  deathQueue: { kind: "hunter" | "successor"; playerId: string }[];
  resume: { kind: "day"; day: number } | { kind: "night"; night: number } | null;
  // --- ban ngày (reset đầu mỗi ngày) ---
  extendUsed: boolean; // R-51a
  endEarly: Record<string, true>; // R-51b
  votes: Record<string, string>; // voterId → targetId | "blank" (R-52)
  verdicts: Record<string, "kill" | "spare">; // R-54
  log: PublicLogEntry[];
}

export type Action =
  | { type: "GUARD_PICK"; playerId: string; targetId: string | null; now: number }
  | { type: "WOLF_PICK"; playerId: string; targetId: string | null; second?: boolean; now: number } // second = phát cắn thứ 2
  | { type: "SEER_PICK"; playerId: string; targetId: string; now: number }
  | { type: "WITCH_SET"; playerId: string; save: boolean; saveSecond?: boolean; poisonTarget: string | null; now: number }
  | { type: "CUPID_PICK"; playerId: string; targetId: string; now: number } // bật/tắt chọn 1 người (tối đa 2)
  | { type: "ARM_CURSE"; playerId: string; now: number } // Sói nguyền bật/tắt kích hoạt (ban ngày)
  | { type: "CURSE_SET"; playerId: string; targetId: string | null; now: number } // pha 2
  | { type: "HUNTER_SHOOT"; playerId: string; targetId: string | null; now: number } // null = không bắn
  | { type: "MAYOR_PASS"; playerId: string; targetId: string; now: number }
  | { type: "EXTEND_DISCUSSION"; playerId: string; now: number }
  | { type: "TOGGLE_END_EARLY"; playerId: string; now: number }
  | { type: "CAST_VOTE"; playerId: string; targetId: string | "blank" | null; now: number }
  | { type: "CAST_VERDICT"; playerId: string; choice: "kill" | "spare" | null; now: number }
  | { type: "TIME_UP"; phaseSeq: number; now: number };
