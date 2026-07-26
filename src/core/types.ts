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
  // null = chưa/không chia vai — để dành chế độ chơi tương lai không chia role
  // (xem LO-TRINH.md, ý tưởng "2 người: không chia vai"). Bản v1 hiện tại luôn
  // gán Role thật cho mọi người, setup.ts chưa dùng nhánh null.
  role: Role | null;
  hp: number;
  maxHp: number;
  hand: string[]; // id các lá bài trên tay
  equipment: string[]; // id các lá bài để ngửa trước mặt: súng, Barrel, Scope, Mustang, Jail, Dynamite...
  alive: boolean;
  // Giai đoạn 5 (xem core/characters.ts) — null = chưa/không có nhân vật
  // (đúng bản v1 hiện tại, mọi người 4 máu không skill). Chỉ là 1 CHUỖI tra
  // vào registry CHARACTERS — hàm hook không nằm trong state (quy tắc 3).
  characterId: string | null;
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
  | { kind: "NEED_DISCARD_FROM_ZONE"; player: string; zone: "hand" | "equipment"; source: { card: string; from: string } }
  // draw! (lật bài kiểm tra) — cơ chế DÙNG CHUNG cho Barrel/Jail/Dynamite (việc
  // 1.11) và sau này là kỹ năng nhân vật (Giai đoạn 5). Chỉ lật ĐÚNG 1 lá, báo
  // "khớp" hay không — không tự suy ra hậu quả (nổ/thoát tù/né đạn...), vì mỗi
  // lá bài hiểu "khớp" theo nghĩa khác nhau. `matchSuits` là các chất tính là
  // khớp; `matchRanks` không có nghĩa là mọi giá trị đều tính, chỉ cần đúng chất
  // (vd Barrel/Jail: chỉ cần Cơ, mọi giá trị). Muốn lật thêm lần nữa (nhiều
  // Barrel, kỹ năng nhân vật...) thì đẩy thêm 1 mục NEED_DRAW_CHECK mới sau khi
  // mục này bị pop, không phải việc của kind này.
  | {
      kind: "NEED_DRAW_CHECK";
      player: string;
      source: { card: string };
      matchSuits: Suit[];
      matchRanks?: Rank[];
    };

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
  | { type: "CARD_FORCE_DISCARDED"; playerId: string; byPlayerId: string; cardId: string } // Cat Balou
  | { type: "DRAW_CHECK_RESOLVED"; playerId: string; cardId: string; matched: boolean } // draw!
  | { type: "WEAPON_REPLACED"; playerId: string; oldCardId: string } // đánh súng mới, bỏ súng cũ
  | { type: "BARREL_DODGED"; playerId: string } // Barrel draw! khớp Cơ, né miễn phí không tốn Missed!
  | { type: "DYNAMITE_EXPLODED"; playerId: string; amount: number } // draw! khớp Bích 2-9 đầu lượt
  | { type: "DYNAMITE_PASSED"; playerId: string } // draw! không khớp, chuyển cho người kế tiếp
  | { type: "JAIL_ESCAPED"; playerId: string } // draw! khớp Cơ đầu lượt, thoát tù chơi bình thường
  | { type: "JAIL_SKIPPED_TURN"; playerId: string } // draw! không khớp, bỏ qua cả lượt
  // Giai đoạn 5 (Black Jack) — lá thứ 2 lúc rút bài đầu lượt lật NGỬA cho mọi
  // người xem (dù vẫn nằm trong tay, bình thường bị ẩn — xem view.ts). Tiền lệ
  // giống DRAW_CHECK_RESOLVED đã công khai 1 lá vốn bị ẩn.
  | { type: "BLACK_JACK_REVEALED"; playerId: string; cardId: string }
  // ----- Việc 1.13: chết, thưởng/phạt, điều kiện thắng -----
  // killedBy = người trực tiếp gây đòn đánh khiến hp về 0 (Bang!/Gatling/
  // Indians!/Duel). null nếu tự chết (Dynamite) — không có ai "giết" cả.
  | { type: "PLAYER_ELIMINATED"; playerId: string; killedBy: string | null }
  // playerId = người kết liễu (được thưởng), count = số lá rút được (có thể
  // ít hơn 3 nếu deck+chồng bỏ cạn giữa chừng).
  | { type: "OUTLAW_BOUNTY_DRAWN"; playerId: string; count: number }
  // playerId = Cảnh sát trưởng bị phạt (chính là người kết liễu Phó cảnh sát trưởng).
  | { type: "SHERIFF_KILLED_DEPUTY_PENALTY"; playerId: string }
  | { type: "GAME_ENDED"; winner: "sheriff_deputy" | "outlaw" | "renegade" };

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
  // Chuẩn bị cho Giai đoạn 5 (Willy the Kid/Calamity Janet, xem
  // NHAN-VAT-BANG-CO-BAN.txt): luật gốc chỉ cho đánh 1 lá Bang!/lượt, trừ khi
  // đang cầm súng Volcanic — luật này bị THIẾU từ Giai đoạn 1, bổ sung ở đây
  // (không phải hook nhân vật, là luật nền ai cũng áp dụng). Reset về false
  // mỗi khi sang lượt mới (advanceTurn() trong reduce.ts).
  bangUsedThisTurn: boolean;
}
