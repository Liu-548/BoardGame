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

// Chu kỳ chất + số của 1 bộ bài Tây chuẩn (52 lá), dùng để gán (suit, rank) cho
// từng lá — quay vòng vì bộ 80 lá lớn hơn 52. Cách gán này không sao chép bản in
// gốc của BANG!, chỉ đảm bảo mỗi lá có (suit, rank) hợp lệ để các cơ chế "lật bài
// kiểm tra" (Jail, Dynamite, Barrel...) hoạt động được ở các việc sau.
const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Dựng bộ bài từ bảng số lượng. Không truyền gì thì dùng số lượng mặc định
// (DEFAULT_CARD_COUNTS). Truyền một phần thì chỉ các loại đó bị đổi, còn lại vẫn
// giữ mặc định — dùng cho tính năng chủ phòng tuỳ chỉnh bộ bài (làm ở việc sau).
export function buildDeck(counts: Partial<Record<CardName, number>> = {}): Card[] {
  const finalCounts: Record<CardName, number> = { ...DEFAULT_CARD_COUNTS, ...counts };
  const deck: Card[] = [];
  let cursor = 0;

  for (const name of Object.keys(finalCounts) as CardName[]) {
    const count = finalCounts[name];
    for (let i = 0; i < count; i++) {
      deck.push({
        id: `${name}_${i + 1}`,
        name,
        suit: SUITS[cursor % SUITS.length],
        rank: RANKS[cursor % RANKS.length],
      });
      cursor++;
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
