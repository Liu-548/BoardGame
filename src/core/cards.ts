// Bảng dữ liệu bộ bài cơ bản. Chỉ là DỮ LIỆU — không chứa logic xử lý lá bài
// (logic thuộc về reduce.ts ở việc 1.6 trở đi).

import type { Card, Suit, Rank } from "./types";

// Tên các loại lá bài nâu (đánh từ tay, chơi xong vào chồng bỏ)
export type BrownCardName =
  | "bang"
  | "missed"
  | "beer"
  | "saloon"
  | "stagecoach"
  | "wells_fargo"
  | "panic"
  | "cat_balou"
  | "general_store"
  | "indians"
  | "duel"
  | "gatling";

// Tên các loại lá bài xanh (trang bị, để ngửa trước mặt cho tới khi bị mất)
export type BlueCardName =
  | "volcanic"
  | "schofield"
  | "remington"
  | "rev_carabine"
  | "winchester"
  | "barrel"
  | "scope"
  | "mustang"
  | "jail"
  | "dynamite";

export type CardName = BrownCardName | BlueCardName;

// Số lượng mặc định từng loại trong bộ bài cơ bản — tổng 80 lá (63 nâu + 17 xanh).
// Đây chỉ là MẶC ĐỊNH cho ván chơi thông thường. Sau này chủ phòng có thể chỉnh
// số lượng từng loại cho ván riêng bằng cách truyền một phần vào buildDeck() —
// xem tham số `counts` bên dưới.
export const DEFAULT_CARD_COUNTS: Record<CardName, number> = {
  bang: 25,
  missed: 12,
  beer: 6,
  saloon: 1,
  stagecoach: 2,
  wells_fargo: 1,
  panic: 4,
  cat_balou: 4,
  general_store: 2,
  indians: 2,
  duel: 3,
  gatling: 1,
  volcanic: 2,
  schofield: 3,
  remington: 1,
  rev_carabine: 1,
  winchester: 1,
  barrel: 2,
  scope: 1,
  mustang: 2,
  jail: 3,
  dynamite: 1,
};

// (suit, rank) IN THẬT trên từng lá của bộ bài cơ bản — tra từ danh sách bài
// chính thức dV Giochi (bang.dvgiochi.com) và Bang! Fandom wiki (đối chiếu riêng
// cho Jail, Dynamite). Đã kiểm chéo: số phần tử mỗi loại khớp đúng
// DEFAULT_CARD_COUNTS bên trên. Đây là dữ liệu tra từ nguồn cộng đồng — nếu có
// bộ bài thật trong tay, nên đối chiếu lại cho chắc.
// Thứ tự trong mảng KHÔNG có ý nghĩa luật, chỉ để liệt kê đủ.
type SuitRank = [Suit, Rank];

const CARD_SUIT_RANKS: Record<CardName, SuitRank[]> = {
  bang: [
    ["spades", "A"],
    ["hearts", "2"], ["hearts", "3"], ["hearts", "4"], ["hearts", "5"],
    ["hearts", "6"], ["hearts", "7"], ["hearts", "8"], ["hearts", "9"],
    ["hearts", "10"], ["hearts", "J"], ["hearts", "Q"], ["hearts", "K"], ["hearts", "A"],
    ["diamonds", "2"], ["diamonds", "3"], ["diamonds", "4"], ["diamonds", "5"],
    ["diamonds", "6"], ["diamonds", "7"], ["diamonds", "8"], ["diamonds", "9"],
    ["clubs", "Q"], ["clubs", "K"], ["clubs", "A"],
  ],
  missed: [
    ["diamonds", "10"], ["diamonds", "J"], ["diamonds", "Q"], ["diamonds", "K"], ["diamonds", "A"],
    ["spades", "2"], ["spades", "3"], ["spades", "4"], ["spades", "5"],
    ["spades", "6"], ["spades", "7"], ["spades", "8"],
  ],
  beer: [
    ["clubs", "6"], ["clubs", "7"], ["clubs", "8"], ["clubs", "9"], ["clubs", "10"], ["clubs", "J"],
  ],
  saloon: [["clubs", "5"]],
  stagecoach: [["spades", "9"], ["spades", "9"]],
  wells_fargo: [["clubs", "3"]],
  panic: [["clubs", "J"], ["clubs", "Q"], ["clubs", "A"], ["hearts", "8"]],
  cat_balou: [["clubs", "K"], ["hearts", "9"], ["hearts", "10"], ["hearts", "J"]],
  general_store: [["diamonds", "9"], ["spades", "Q"]],
  indians: [["hearts", "K"], ["hearts", "A"]],
  duel: [["hearts", "Q"], ["spades", "J"], ["diamonds", "8"]],
  gatling: [["clubs", "10"]],
  volcanic: [["spades", "10"], ["diamonds", "10"]],
  schofield: [["diamonds", "J"], ["diamonds", "Q"], ["spades", "K"]],
  remington: [["diamonds", "K"]],
  rev_carabine: [["diamonds", "A"]],
  winchester: [["spades", "8"]],
  barrel: [["spades", "Q"], ["spades", "K"]],
  scope: [["spades", "A"]],
  mustang: [["clubs", "8"], ["clubs", "9"]],
  jail: [["hearts", "4"], ["spades", "10"], ["spades", "J"]],
  dynamite: [["hearts", "2"]],
};

// Dựng bộ bài từ bảng số lượng. Không truyền gì thì dùng số lượng mặc định
// (DEFAULT_CARD_COUNTS). Truyền một phần thì chỉ các loại đó bị đổi, còn lại vẫn
// giữ mặc định — dùng cho tính năng chủ phòng tuỳ chỉnh bộ bài (làm ở việc sau).
//
// (suit, rank) của từng lá lấy từ CARD_SUIT_RANKS (danh sách thật). Nếu số lượng
// tuỳ chỉnh VƯỢT QUÁ số lá thật của loại đó, lặp lại vòng qua danh sách thật
// (không bịa suit/rank ngẫu nhiên) — đủ dùng cho việc test/tuỳ biến, không ảnh
// hưởng bộ bài mặc định 80 lá.
export function buildDeck(counts: Partial<Record<CardName, number>> = {}): Card[] {
  const finalCounts: Record<CardName, number> = { ...DEFAULT_CARD_COUNTS, ...counts };
  const deck: Card[] = [];

  for (const name of Object.keys(finalCounts) as CardName[]) {
    const count = finalCounts[name];
    const table = CARD_SUIT_RANKS[name];
    for (let i = 0; i < count; i++) {
      const [suit, rank] = table[i % table.length];
      deck.push({ id: `${name}_${i + 1}`, name, suit, rank });
    }
  }

  return deck;
}

// Bộ bài mặc định, dùng ngay cho ván chơi thông thường.
export const DECK: Card[] = buildDeck();

// Suy ra tên loại bài từ id (vd "bang_3" -> "bang", "wells_fargo_1" -> "wells_fargo").
// Dựa vào quy tắc đặt id ở buildDeck(): luôn là `${tên}_${số thứ tự}`.
export function cardNameFromId(id: string): CardName {
  const lastUnderscore = id.lastIndexOf("_");
  return id.slice(0, lastUnderscore) as CardName;
}

// Suy ra (suit, rank) từ id — dùng cho draw! (việc 1.10), vì state chỉ lưu id
// dạng chuỗi (xem GameState.deck), không lưu cả object Card. Suy ngược lại được
// vì buildDeck() gán suit/rank theo đúng công thức
// `CARD_SUIT_RANKS[name][soThuTu % table.length]` — công thức này không phụ
// thuộc số lượng bài (count), nên đúng cả với bộ bài đã tuỳ chỉnh số lượng.
export function cardSuitRankFromId(id: string): { suit: Suit; rank: Rank } {
  const name = cardNameFromId(id);
  const lastUnderscore = id.lastIndexOf("_");
  const orderInType = Number(id.slice(lastUnderscore + 1)) - 1;
  const table = CARD_SUIT_RANKS[name];
  const [suit, rank] = table[orderInType % table.length];
  return { suit, rank };
}
