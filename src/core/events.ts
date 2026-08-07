// Lá sự kiện (High Noon + A Fistful of Cards) — xem mục 1.1
// Luat_Bang_Mo_Rong_HighNoon.txt. KHÔNG PHẢI Card: không suit/rank, không vào
// bộ bài rút (deck/discardPile), không ai cầm trên tay, không bị Cat Balou/
// Panic! đụng tới. Đây là dữ liệu THUẦN — hiệu ứng của từng lá nằm rải ở đúng
// chỗ luật gốc tương ứng trong reduce.ts/distance.ts, KHÔNG gom vào đây.

import type { ExpansionId, GameState } from "./types";

export type EventId =
  // ----- High Noon (13 lá, "high_noon" là lá cuối) -----
  | "blessing"
  | "curse"
  | "hangover"
  | "shootout"
  | "the_reverend"
  | "the_sermon"
  | "thirst"
  | "train_arrival"
  | "gold_rush"
  | "the_daltons"
  | "the_doctor"
  | "ghost_town"
  | "high_noon"
  // ----- A Fistful of Cards (15 lá, "a_fistful_of_cards" là lá cuối — riêng
  // "abandoned_mine" chủ dự án CHỐT tạm bỏ khỏi bộ bốc, xem EXPANSION_EVENT_IDS
  // bên dưới, nhưng vẫn khai báo dữ liệu ở đây cho đủ) -----
  | "ambush"
  | "lasso"
  | "the_judge"
  | "abandoned_mine"
  | "hard_liquor"
  | "law_of_the_west"
  | "peyote"
  | "ranch"
  | "russian_roulette"
  | "dead_man"
  | "blood_brothers"
  | "vendetta"
  | "sniper"
  | "ricochet"
  | "a_fistful_of_cards";

export interface EventDefinition {
  id: EventId;
  name: string;
  expansion: ExpansionId;
  // true = lá cuối chồng sự kiện (High Noon/A Fistful of Cards) — hiệu lực
  // tới hết ván, không bao giờ bị lá khác đè lên (xem mục 1.3/1.6).
  isFinalCard?: boolean;
}

export const EVENT_CARDS: Record<EventId, EventDefinition> = {
  blessing: { id: "blessing", name: "Blessing", expansion: "high_noon" },
  curse: { id: "curse", name: "Curse", expansion: "high_noon" },
  hangover: { id: "hangover", name: "Hangover", expansion: "high_noon" },
  shootout: { id: "shootout", name: "Shootout", expansion: "high_noon" },
  the_reverend: { id: "the_reverend", name: "The Reverend", expansion: "high_noon" },
  the_sermon: { id: "the_sermon", name: "The Sermon", expansion: "high_noon" },
  thirst: { id: "thirst", name: "Thirst", expansion: "high_noon" },
  train_arrival: { id: "train_arrival", name: "Train Arrival", expansion: "high_noon" },
  gold_rush: { id: "gold_rush", name: "Gold Rush", expansion: "high_noon" },
  the_daltons: { id: "the_daltons", name: "The Daltons", expansion: "high_noon" },
  the_doctor: { id: "the_doctor", name: "The Doctor", expansion: "high_noon" },
  ghost_town: { id: "ghost_town", name: "Ghost Town", expansion: "high_noon" },
  high_noon: { id: "high_noon", name: "High Noon", expansion: "high_noon", isFinalCard: true },

  ambush: { id: "ambush", name: "Ambush", expansion: "a_fistful_of_cards" },
  lasso: { id: "lasso", name: "Lasso", expansion: "a_fistful_of_cards" },
  the_judge: { id: "the_judge", name: "The Judge", expansion: "a_fistful_of_cards" },
  abandoned_mine: { id: "abandoned_mine", name: "Abandoned Mine", expansion: "a_fistful_of_cards" },
  hard_liquor: { id: "hard_liquor", name: "Hard Liquor", expansion: "a_fistful_of_cards" },
  law_of_the_west: { id: "law_of_the_west", name: "Law of the West", expansion: "a_fistful_of_cards" },
  peyote: { id: "peyote", name: "Peyote", expansion: "a_fistful_of_cards" },
  ranch: { id: "ranch", name: "Ranch", expansion: "a_fistful_of_cards" },
  russian_roulette: { id: "russian_roulette", name: "Russian Roulette", expansion: "a_fistful_of_cards" },
  dead_man: { id: "dead_man", name: "Dead Man", expansion: "a_fistful_of_cards" },
  blood_brothers: { id: "blood_brothers", name: "Blood Brothers", expansion: "a_fistful_of_cards" },
  vendetta: { id: "vendetta", name: "Vendetta", expansion: "a_fistful_of_cards" },
  sniper: { id: "sniper", name: "Sniper", expansion: "a_fistful_of_cards" },
  ricochet: { id: "ricochet", name: "Ricochet", expansion: "a_fistful_of_cards" },
  a_fistful_of_cards: {
    id: "a_fistful_of_cards",
    name: "A Fistful of Cards",
    expansion: "a_fistful_of_cards",
    isFinalCard: true,
  },
};

// Danh sách id lá sự kiện đóng góp bởi từng bộ mở rộng — setup.ts gộp mảng
// của MỌI bộ đang bật, đúng khuôn EXPANSION_CARD_COUNTS (cards.ts)/
// EXPANSION_CHARACTER_IDS (characters.ts). "abandoned_mine" CỐ TÌNH bị loại
// khỏi đây (chủ dự án quyết định tạm bỏ lá này khỏi bộ bài, xem
// Luat_Bang_Mo_Rong_FistfulOfCards.txt) — EventDefinition vẫn khai báo đủ ở
// trên, chỉ không đưa vào bộ bốc thật.
export const EXPANSION_EVENT_IDS: Record<ExpansionId, EventId[]> = {
  dodge_city: [],
  custom_characters: [],
  high_noon: [
    "blessing",
    "curse",
    "hangover",
    "shootout",
    "the_reverend",
    "the_sermon",
    "thirst",
    "train_arrival",
    "gold_rush",
    "the_daltons",
    "the_doctor",
    "ghost_town",
    "high_noon",
  ],
  a_fistful_of_cards: [
    "ambush",
    "lasso",
    "the_judge",
    "hard_liquor",
    "law_of_the_west",
    "peyote",
    "ranch",
    "russian_roulette",
    "dead_man",
    "blood_brothers",
    "vendetta",
    "sniper",
    "ricochet",
    "a_fistful_of_cards",
  ],
};

// Hàm trung tâm DUY NHẤT để hỏi "lá X có đang chạy không" — mọi nơi trong
// core/ cần biết phải gọi qua đây, KHÔNG so sánh chuỗi state.activeEventId
// rải rác (xem mục 1.5).
export function isEventActive(state: GameState, id: EventId): boolean {
  return state.activeEventId === id;
}
