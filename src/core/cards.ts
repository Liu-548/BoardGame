// Bảng dữ liệu bộ bài cơ bản. Chỉ là DỮ LIỆU — không chứa logic xử lý lá bài
// (logic thuộc về reduce.ts ở việc 1.6 trở đi).

import type { Card, ExpansionId, Suit, Rank } from "./types";

// Tên các loại lá bài nâu (đánh từ tay, chơi xong vào chồng bỏ)
// Mở rộng Dodge City đợt 2 (Luat_Bang_Mo_Rong_DodgeCity.txt, mục 2 nhóm NÂU) —
// thêm 7 tên mới: brawl, dodge, punch, rag_time, springfield, tequila, whisky.
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
  | "gatling"
  | "brawl"
  | "dodge"
  | "punch"
  | "rag_time"
  | "springfield"
  | "tequila"
  | "whisky";

// Tên các loại lá bài xanh (trang bị, để ngửa trước mặt cho tới khi bị mất)
// Mở rộng Dodge City đợt 2 — thêm binocular (bản sao Scope) và hideout (bản
// sao Mustang), xem SELF_EQUIP_BLUE_CARD_NAMES + distance.ts.
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
  | "dynamite"
  | "binocular"
  | "hideout";

// Mở rộng Dodge City (Luat_Bang_Mo_Rong_DodgeCity.txt, mục 1.1 + mục 2 nhóm
// VÀNG — đổi tên từ "green-bordered" gốc, xem ghi chú màu ở đầu file .txt).
// Là 1 BIẾN THỂ của trang bị (đứng yên trước mặt, chịu luật "không 2 lá cùng
// tên" y hệt BlueCardName) — KHÁC BIỆT DUY NHẤT: không dùng được ngay trong
// CHÍNH lượt vừa chơi ra, phải chờ ít nhất 1 lượt (xem
// GameState.equipmentPlayedTurn + isDelayedEquipmentCardName() bên dưới).
// ĐỢT 1 (6/40 lá): Bible/Sombrero/Ten Gallon Hat/Iron Plate (dùng như Missed!)
// và Canteen/Pony Express (hiệu ứng chủ động đơn giản).
// ĐỢT 2 (7 lá còn lại, xem reduce.ts's activateDelayedEquipment()): Derringer/
// Knife/Pepperbox/Buffalo Rifle/Howitzer (hiệu ứng Bang!, KHÔNG có ký hiệu
// Missed!) và Conestoga/Can Can (bản "delayed" của Panic!/Cat Balou).
export type YellowCardName =
  | "bible" | "sombrero" | "ten_gallon_hat" | "iron_plate"
  | "canteen" | "pony_express"
  | "derringer" | "conestoga" | "can_can" | "buffalo_rifle" | "knife" | "pepperbox" | "howitzer";

export type CardName = BrownCardName | BlueCardName | YellowCardName;

const YELLOW_CARD_NAMES: readonly YellowCardName[] = [
  "bible", "sombrero", "ten_gallon_hat", "iron_plate", "canteen", "pony_express",
  "derringer", "conestoga", "can_can", "buffalo_rifle", "knife", "pepperbox", "howitzer",
];

export function isDelayedEquipmentCardName(name: CardName): name is YellowCardName {
  return (YELLOW_CARD_NAMES as readonly CardName[]).includes(name);
}

// Nhóm lá vàng CÓ ký hiệu Missed! — dùng để đỡ Bang!/Gatling qua RESPOND,
// giống hệt Missed! thường (xem respondToMissed() trong reduce.ts). Nhóm còn
// lại (Canteen, Pony Express) là hiệu ứng CHỦ ĐỘNG, kích hoạt qua PLAY_CARD
// (xem activateDelayedEquipment()).
const YELLOW_MISSED_CARD_NAMES: readonly YellowCardName[] = [
  "bible", "sombrero", "ten_gallon_hat", "iron_plate",
];

export function yellowCardActsAsMissed(name: CardName): boolean {
  return (YELLOW_MISSED_CARD_NAMES as readonly CardName[]).includes(name);
}

// Lá xanh TỰ trang bị cho chính người đánh (súng, Barrel, Scope, Mustang).
// KHÔNG gồm Jail (đánh lên sân người KHÁC) hay Dynamite (không đánh chủ động,
// tự xuống sân khi vào tay) — hai lá đó có cách gắn vào sân khác hẳn. Khai báo
// riêng type này (thay vì dùng chung BlueCardName) để isSelfEquipBlueCardName()
// thu hẹp kiểu CHÍNH XÁC — dùng BlueCardName ở đây sẽ khiến TypeScript tưởng
// nhánh "jail"/"dynamite" cũng bị loại trừ theo, sai với thực tế runtime.
// Mở rộng Dodge City đợt 2 — binocular/hideout cũng tự trang bị cho chính
// người đánh (bản sao vật lý thứ 2 của Scope/Mustang, xem distance.ts).
export type SelfEquipBlueCardName =
  | "volcanic" | "schofield" | "remington" | "rev_carabine" | "winchester"
  | "barrel" | "scope" | "mustang" | "binocular" | "hideout";

const SELF_EQUIP_BLUE_CARD_NAMES: readonly SelfEquipBlueCardName[] = [
  "volcanic", "schofield", "remington", "rev_carabine", "winchester",
  "barrel", "scope", "mustang", "binocular", "hideout",
];

export function isSelfEquipBlueCardName(name: CardName): name is SelfEquipBlueCardName {
  return (SELF_EQUIP_BLUE_CARD_NAMES as readonly CardName[]).includes(name);
}

// Súng — loại trừ lẫn nhau theo NHÓM (chỉ được 1 khẩu, bất kể tên), khác luật
// "không 2 lá cùng tên" áp dụng cho các lá xanh còn lại.
export type WeaponCardName = "volcanic" | "schofield" | "remington" | "rev_carabine" | "winchester";

const WEAPON_CARD_NAMES: readonly WeaponCardName[] = [
  "volcanic", "schofield", "remington", "rev_carabine", "winchester",
];

export function isWeaponCardName(name: CardName): name is WeaponCardName {
  return (WEAPON_CARD_NAMES as readonly CardName[]).includes(name);
}

// Tầm bắn của từng khẩu súng (việc 1.12) — Bang! chỉ đánh được mục tiêu ở
// khoảng cách nhỏ hơn hoặc bằng tầm này. Không trang bị súng nào thì dùng
// DEFAULT_WEAPON_RANGE (súng lục ngầm định, tầm 1).
export const DEFAULT_WEAPON_RANGE = 1;

export const WEAPON_RANGES: Record<WeaponCardName, number> = {
  volcanic: 1,
  schofield: 2,
  remington: 3,
  rev_carabine: 4,
  winchester: 5,
};

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
  // Mở rộng Dodge City — KHÔNG thuộc bộ bài cơ bản, nên mặc định 0 (không
  // xuất hiện trong ván bình thường). Chỉ được cộng vào khi bộ mở rộng
  // "dodge_city" bật (xem EXPANSION_CARD_COUNTS bên dưới + setup.ts).
  bible: 0,
  sombrero: 0,
  ten_gallon_hat: 0,
  iron_plate: 0,
  canteen: 0,
  pony_express: 0,
  binocular: 0,
  hideout: 0,
  brawl: 0,
  dodge: 0,
  punch: 0,
  rag_time: 0,
  springfield: 0,
  tequila: 0,
  whisky: 0,
  derringer: 0,
  conestoga: 0,
  can_can: 0,
  buffalo_rifle: 0,
  knife: 0,
  pepperbox: 0,
  howitzer: 0,
};

// Số lượng bài THẬT do từng BỘ MỞ RỘNG đóng góp khi bật (xem ExpansionId ở
// types.ts + setup.ts — setup.ts gộp EXPANSION_CARD_COUNTS của MỌI bộ đang
// bật cho ván, nên nhiều bộ mở rộng cùng lúc cũng chạy qua đúng 1 đường code
// này, không cần rẽ nhánh riêng từng bộ). Giá trị của từng bộ là TỔNG SỐ CUỐI
// CÙNG muốn có trong bộ bài khi bật (buildDeck() GHI ĐÈ, không cộng dồn với
// DEFAULT_CARD_COUNTS).
//
// dodge_city — với các tên đã có sẵn trong bộ cơ bản (bang, beer, missed,
// cat_balou, general_store, indians, panic, barrel, dynamite, remington,
// rev_carabine), số ở đây = số gốc CỘNG THÊM số lá Dodge City in trong danh
// sách bài chính thức (xem Luat_Bang_Mo_Rong_DodgeCity.txt mục 2). ĐỢT 1: 6 lá
// vàng không cần hook mới. ĐỢT 2: nốt 34/40 lá còn lại — 6 lá xanh (Barrel/
// Dynamite/Remington/Rev.Carabine thêm bản sao thứ 2, Binocular/Hideout hoàn
// toàn mới), 14 lá nâu (7 tên trùng bộ cơ bản thêm bản sao, 7 tên mới: Brawl/
// Dodge/Punch/Rag Time/Springfield/Tequila/Whisky), và 7 lá vàng còn lại
// (Derringer/Conestoga/Can Can/Buffalo Rifle/Knife/Pepperbox/Howitzer).
export const EXPANSION_CARD_COUNTS: Record<ExpansionId, Partial<Record<CardName, number>>> = {
  dodge_city: {
    bible: 1,
    sombrero: 1,
    ten_gallon_hat: 1,
    iron_plate: 2,
    canteen: 1,
    pony_express: 1,
    // Đợt 2 — lá xanh: thêm 1 bản sao thứ 2 cho 4 tên đã có sẵn, cộng 2 tên mới.
    barrel: 3, // 2 (gốc) + 1 (Dodge City)
    dynamite: 2, // 1 (gốc) + 1
    remington: 2, // 1 (gốc) + 1
    rev_carabine: 2, // 1 (gốc) + 1
    binocular: 1,
    hideout: 1,
    // Đợt 2 — lá nâu: 7 tên trùng bộ cơ bản (thêm số lượng Dodge City vào).
    bang: 29, // 25 (gốc) + 4
    beer: 8, // 6 (gốc) + 2
    missed: 13, // 12 (gốc) + 1
    cat_balou: 5, // 4 (gốc) + 1
    general_store: 3, // 2 (gốc) + 1
    indians: 3, // 2 (gốc) + 1
    panic: 5, // 4 (gốc) + 1
    // Đợt 2 — lá nâu hoàn toàn mới.
    brawl: 1,
    dodge: 2,
    punch: 1,
    rag_time: 1,
    springfield: 1,
    tequila: 1,
    whisky: 1,
    // Đợt 2 — 7 lá vàng còn lại.
    derringer: 1,
    conestoga: 1,
    can_can: 1,
    buffalo_rifle: 1,
    knife: 1,
    pepperbox: 1,
    howitzer: 1,
  },
  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt) — CHỈ
  // thêm nhân vật, KHÔNG thêm lá bài nào — object rỗng vẫn PHẢI có mặt vì
  // Record<ExpansionId, ...> bắt buộc đủ mọi key của union (ExpansionId).
  custom_characters: {},
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
    // Mở rộng Dodge City đợt 2 (xem ghi chú tra suit ở dưới) — 4 lá thêm.
    ["spades", "8"], ["diamonds", "5"], ["diamonds", "6"], ["diamonds", "K"],
  ],
  missed: [
    ["diamonds", "10"], ["diamonds", "J"], ["diamonds", "Q"], ["diamonds", "K"], ["diamonds", "A"],
    ["spades", "2"], ["spades", "3"], ["spades", "4"], ["spades", "5"],
    ["spades", "6"], ["spades", "7"], ["spades", "8"],
    ["hearts", "8"], // Dodge City đợt 2
  ],
  beer: [
    ["clubs", "6"], ["clubs", "7"], ["clubs", "8"], ["clubs", "9"], ["clubs", "10"], ["clubs", "J"],
    ["clubs", "6"], ["spades", "6"], // Dodge City đợt 2
  ],
  saloon: [["clubs", "5"]],
  stagecoach: [["spades", "9"], ["spades", "9"]],
  wells_fargo: [["clubs", "3"]],
  panic: [
    ["clubs", "J"], ["clubs", "Q"], ["clubs", "A"], ["hearts", "8"],
    ["clubs", "J"], // Dodge City đợt 2
  ],
  cat_balou: [
    ["clubs", "K"], ["hearts", "9"], ["hearts", "10"], ["hearts", "J"],
    ["diamonds", "8"], // Dodge City đợt 2
  ],
  general_store: [["diamonds", "9"], ["spades", "Q"], ["spades", "A"] /* Dodge City đợt 2 */],
  indians: [["hearts", "K"], ["hearts", "A"], ["hearts", "5"] /* Dodge City đợt 2 */],
  duel: [["hearts", "Q"], ["spades", "J"], ["diamonds", "8"]],
  gatling: [["clubs", "10"]],
  volcanic: [["spades", "10"], ["diamonds", "10"]],
  schofield: [["diamonds", "J"], ["diamonds", "Q"], ["spades", "K"]],
  remington: [["diamonds", "K"], ["hearts", "6"] /* Dodge City đợt 2 */],
  rev_carabine: [["diamonds", "A"], ["spades", "5"] /* Dodge City đợt 2 */],
  winchester: [["spades", "8"]],
  barrel: [["spades", "Q"], ["spades", "K"], ["diamonds", "A"] /* Dodge City đợt 2 */],
  scope: [["spades", "A"]],
  mustang: [["clubs", "8"], ["clubs", "9"]],
  jail: [["hearts", "4"], ["spades", "10"], ["spades", "J"]],
  dynamite: [["hearts", "2"], ["diamonds", "10"] /* Dodge City đợt 2 */],
  // Mở rộng Dodge City — tra từ danh sách bài chính thức dV Giochi
  // (bang.dvgiochi.com/cardslist.php?id=3), đối chiếu suit bằng cách hiệu
  // chỉnh mã icon Ý (i_p/i_f/i_c/i_q) qua 4 lá bộ cơ bản đã biết chắc chắn
  // đúng (Volcanic 10♠/10♦, Scope A♠, Mustang 8♣/9♣, Indians! K♥/A♥) —
  // KHÔNG suy diễn trực tiếp tên viết tắt tiếng Anh (dễ sai, xem lịch sử hỏi
  // 2 nguồn khác đối chiếu ra kết quả khác nhau). Nếu có bộ bài thật Dodge
  // City trong tay, nên đối chiếu lại cho chắc.
  bible: [["clubs", "10"]],
  sombrero: [["diamonds", "7"]],
  ten_gallon_hat: [["hearts", "J"]],
  iron_plate: [["hearts", "A"], ["spades", "Q"]],
  canteen: [["clubs", "7"]],
  pony_express: [["hearts", "Q"]],
  // Đợt 2 (đủ 40/40 lá) — tra cùng nguồn/cùng cách hiệu chỉnh icon như trên.
  binocular: [["hearts", "10"]],
  hideout: [["hearts", "K"]],
  brawl: [["spades", "J"]],
  dodge: [["hearts", "7"], ["clubs", "K"]],
  punch: [["spades", "10"]],
  rag_time: [["clubs", "9"]],
  springfield: [["spades", "K"]],
  tequila: [["diamonds", "9"]],
  whisky: [["hearts", "Q"]],
  derringer: [["spades", "7"]],
  conestoga: [["hearts", "9"]],
  can_can: [["diamonds", "J"]],
  buffalo_rifle: [["diamonds", "Q"]],
  knife: [["clubs", "8"]],
  pepperbox: [["clubs", "A"]],
  howitzer: [["spades", "9"]],
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
