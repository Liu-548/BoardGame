// Kiểu dữ liệu cho state ván đấu, hành động, và lá bài.
// Toàn bộ phải là dữ liệu JSON thuần: không class có method, không Map, không Set, không hàm.

// ----- Lá bài -----

export type Suit = "spades" | "hearts" | "diamonds" | "clubs"; // 4 chất bài Tây
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  id: string; // id duy nhất của từng lá bài vật lý, vd "bang_3" (bộ bài có nhiều lá trùng tên)
  name: string; // tên loại bài, vd "bang", "missed" — danh sách đầy đủ khai báo ở cards.ts (việc 1.2)
  suit: Suit;
  rank: Rank; // cần cho các lá bài kiểm tra chất/số, vd Barrel, Dynamite
}

// ----- Người chơi -----

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade"; // 4 phe ẩn danh

export interface PlayerState {
  id: string;
  name: string;
  role: Role;
  hp: number;
  maxHp: number;
  hand: string[]; // id các lá bài trên tay
  equipment: string[]; // id các lá bài để ngửa trước mặt: súng, Barrel, Scope, Mustang, Jail, Dynamite...
  alive: boolean;
}

// ----- Việc đang chờ -----
// Các loại "kind" cụ thể khác (NEED_DRAW_CHECK cho Jail/Dynamite/Barrel...) sẽ
// thêm dần khi cài từng cơ chế mới, từ việc 1.10/1.11 trở đi.

export type PendingAction =
  | { kind: "NEED_MISSED"; player: string; source: { card: string; from: string } }
  // Indians!: người chơi phải bỏ 1 lá Bang! hoặc mất 1 máu. Có thể chọn KHÔNG bỏ
  // dù có Bang! trong tay (RESPOND không kèm cardId) — chịu mất máu là lựa chọn hợp lệ.
  | { kind: "NEED_DISCARD_BANG"; player: string; source: { card: string; from: string } }
  // Duel: hai người luân phiên bỏ Bang!. `player` là người đang phải trả lời,
  // `opponent` là người còn lại. Khi `player` bỏ được Bang!, pending mới được đẩy
  // lên với `player`/`opponent` đổi chỗ cho nhau — không tạo 2 mục riêng.
  | { kind: "NEED_DUEL_RESPONSE"; player: string; opponent: string; source: { card: string; from: string } }
  // General Store: `options` là các id bài đã lật, vơi dần khi từng người chọn.
  | { kind: "NEED_PICK_STORE_CARD"; player: string; options: string[] }
  // Cat Balou: `player` (mục tiêu bị bắt bỏ bài) tự chọn đúng 1 lá trong `zone`
  // (tay hoặc sân) do người đánh Cat Balou chỉ định trước — không phải người
  // đánh chọn lá cụ thể, cũng không có lựa chọn "từ chối" (bị ép buộc).
  | { kind: "NEED_DISCARD_FROM_ZONE"; player: string; zone: "hand" | "equipment"; source: { card: string; from: string } };

// ----- Hành động -----
// Các hành động cho vòng lượt (việc 1.5) và đánh bài (việc 1.7/1.8, hiện chỉ hỗ
// trợ Bang!/Missed!). Các lá khác sẽ mở rộng PLAY_CARD/RESPOND dần, không cần
// thêm type hành động mới cho từng lá.

export type Action =
  | { type: "DRAW_CARDS"; playerId: string }
  | { type: "END_TURN"; playerId: string }
  | { type: "DISCARD_CARDS"; playerId: string; cardIds: string[] }
  | {
      type: "PLAY_CARD";
      playerId: string;
      cardId: string;
      targetId?: string;
      // Panic!: chỉ dùng khi tay mục tiêu đã hết bài — chỉ định đúng lá trang bị
      // cụ thể muốn cướp trên sân (trang bị để ngửa, nhìn thấy tên nên chọn được).
      targetCardId?: string;
      // Cat Balou: người đánh chọn VÙNG bắt mục tiêu bỏ bài (tay hay sân) — lá cụ
      // thể trong vùng đó do chính mục tiêu chọn, trả lời qua RESPOND.
      targetZone?: "hand" | "equipment";
    }
  | { type: "RESPOND"; playerId: string; cardId?: string };

// ----- Sự kiện -----
// Kết quả phụ của reduce(), để client hiển thị log — không ảnh hưởng đến state.

export type GameEvent =
  | { type: "CARDS_DRAWN"; playerId: string; count: number }
  | { type: "TURN_ENDED"; playerId: string }
  | { type: "CARDS_DISCARDED"; playerId: string; cardIds: string[] }
  | { type: "CARD_PLAYED"; playerId: string; cardId: string; targetId?: string }
  | { type: "MISSED_PLAYED"; playerId: string }
  | { type: "BANG_DISCARDED"; playerId: string } // đỡ Indians!/Duel bằng cách bỏ 1 lá Bang!
  | { type: "DAMAGE_DEALT"; playerId: string; amount: number }
  | { type: "HP_RESTORED"; playerId: string; amount: number }
  | { type: "STORE_REVEALED"; cardIds: string[] } // General Store lật bài
  | { type: "STORE_CARD_TAKEN"; playerId: string; cardId: string }
  | { type: "CARD_STOLEN"; playerId: string; fromPlayerId: string; cardId: string } // Panic
  | { type: "CARD_FORCE_DISCARDED"; playerId: string; byPlayerId: string; cardId: string }; // Cat Balou

// ----- State tổng -----

export interface GameState {
  players: PlayerState[]; // thứ tự trong mảng = ghế ngồi, dùng để tính khoảng cách
  deck: string[]; // id các lá bài trong chồng rút; phần tử cuối = lá trên cùng
  discardPile: string[]; // id các lá bài đã bỏ; phần tử cuối = lá trên cùng
  pending: PendingAction[]; // stack — luôn xử lý phần tử CUỐI cùng trước
  currentPlayerIndex: number; // chỉ số trong mảng players
  turnPhase: "draw" | "play" | "discard";
  rngState: number; // trạng thái bộ sinh số ngẫu nhiên — hình dạng chính xác chốt ở việc 1.3
  winner: "sheriff_deputy" | "outlaw" | "renegade" | null;
}
