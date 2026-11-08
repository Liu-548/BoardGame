// Kiểu dữ liệu game Câu cá. Luật: claude/cau-ca-luat-nha.md (Project Board_Game).

export type Suit = "h" | "d" | "s" | "c"; // cơ, rô, bích, chuồn — h/d là đỏ

export interface Card {
  rank: number; // 1 = A, 2–10, 11 = J, 12 = Q, 13 = K
  suit: Suit;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: number; // thứ tự thuận kim đồng hồ
  hand: Card[];
  captured: Card[]; // chồng bài đã câu được
  bonus: number; // điểm thưởng kinh bài (§1.6)
}

// Việc đang chờ (stack, xử lý phần tử cuối). Câu cá chỉ có 1 loại:
// lá lật từ nọc ăn được >1 lá trên bàn → người đang tới lượt chọn, hết giờ máy tự chọn.
export type Pending = { kind: "NEED_FLIP_TARGET"; playerId: string; card: Card; endsAt: number };

// Lượt vừa rồi — để mọi người thấy chuyện gì đã xảy ra.
export interface LastMove {
  playerId: string;
  played: Card; // lá đánh từ tay
  playedTook: Card[]; // lá trên bàn bị câu bằng lá tay ([] = hạ bài)
  flipped: Card | null; // lá lật từ nọc
  flipTook: Card[]; // lá trên bàn bị lá lật ăn
}

export interface GameState {
  playerCount: 3 | 4;
  players: PlayerState[];
  table: Card[];
  stock: Card[]; // nọc, rút từ đầu mảng
  firstSeat: number; // người đi đầu — random mỗi ván
  currentSeat: number;
  pending: Pending[];
  lastDiscard: Card | null; // lá vừa hạ trong lượt này — cho luật 7
  lastMove: LastMove | null;
  peek: Card; // lá kinh — chỉ người đi cuối thấy, trừ khi là A
  over: boolean;
}

// `now` do server ghi đè (giờ server), client gửi gì cũng không tin.
export type Action =
  | { type: "CAPTURE"; playerId: string; card: Card; target: Card; now: number } // câu bằng bài tay
  | { type: "DISCARD"; playerId: string; card: Card; now: number } // hạ 1 lá
  | { type: "PICK_FLIP_TARGET"; playerId: string; target: Card; now: number } // chọn lá cho lá lật
  | { type: "TIME_UP"; now: number }; // chỉ server gửi (alarm)

// Chia bài & mốc hoà theo số người (§1.1).
export const DEAL = {
  3: { hand: 7, table: 10, base: 70 },
  4: { hand: 5, table: 12, base: 55 },
} as const;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;

// Thời gian chọn lá cho lá lật trước khi máy tự chọn.
export const FLIP_PICK_MS = 15_000;

// Các hạng chỉ ăn được chính nó (5 ăn 5 vì 5+5=10; 10/J/Q/K ăn cùng hạng).
export const SAME_ONLY_RANKS = [5, 10, 11, 12, 13];
