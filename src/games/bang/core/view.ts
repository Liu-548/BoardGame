// Việc 3.6: viewFor(state, playerId) — lọc state CHỈ để gửi ra ngoài. Server
// LUÔN gọi hàm này thay vì gửi state đầy đủ (quy tắc 6 CLAUDE.md: "Client
// không bao giờ nhận state đầy đủ... Không có ngoại lệ, kể cả khi debug").
// KHÔNG đổi gì trong reduce()/state thật — chỉ tạo 1 bản rút gọn riêng cho
// TỪNG người xem.
//
// Ẩn với người KHÔNG PHẢI viewer:
// - Bài trên tay: chỉ biết SỐ LƯỢNG (handCount), không biết là lá gì.
// - Vai (role): ẩn, TRỪ 3 trường hợp luôn công khai đúng luật gốc — chính
//   người xem, Cảnh sát trưởng (lộ từ đầu ván), và người ĐÃ CHẾT (lật vai
//   công khai khi bị loại).
// - Bộ bài rút (deck): chỉ biết SỐ LƯỢNG, không biết thứ tự/nội dung — biết
//   trước sẽ phá luôn yếu tố may rủi của draw!.
//
// LUÔN công khai (không cần ẩn, đúng luật gốc): máu/máu tối đa, trang bị trên
// sân (súng, Barrel, Scope, Mustang, Jail, Dynamite đều để ngửa), còn sống/đã
// chết, chồng bỏ, ai đang tới lượt, turnPhase, kết quả ván.
//
// Stack pending: hầu hết các kind KHÔNG chứa lá bài ẩn nào (chỉ id/kind việc
// đang chờ, xem PendingAction ở types.ts) nên giữ nguyên, công khai. NGOẠI LỆ
// DUY NHẤT (Giai đoạn 5, Kit Carlson, đợt 6) — NEED_PICK_KEPT_CARDS.cards là 3
// lá vừa xem RIÊNG, phải ẩn với mọi người TRỪ đúng chủ nhân (xem
// PendingActionView/viewPendingItem() bên dưới).

import { computeDistance, getWeaponRange } from "./distance";
import type { CharacterChoice, ExpansionId, GameState, HouseRuleId, PendingAction, PlayerState, Role } from "./types";

export interface PlayerHandView {
  id: string;
  name: string;
  role: Role | null; // null = vai đang bị ẩn với người xem này
  hp: number;
  maxHp: number;
  handCount: number; // luôn đúng, kể cả khi hand (bên dưới) bị ẩn
  hand: string[] | null; // chỉ có giá trị thật nếu id === viewerId, còn lại null
  equipment: string[];
  alive: boolean;
  // Đợt 5 UI/UX (mục 4 ý a) — nhân vật đã chọn xong LUÔN công khai (đặt ngửa
  // lên bàn ngay khi chọn, xem CHARACTER_CHOSEN ở types.ts), không cần ẩn/lọc
  // theo viewerId gì cả, khác `hand` ở trên. null = chưa chọn xong (ván chưa
  // bật cơ chế chọn nhân vật, hoặc characterSelection còn đang chờ).
  characterId: string | null;
}

// Giống hệt PendingAction ở mọi kind, TRỪ NEED_PICK_KEPT_CARDS: `cards` là
// `string[] | null` thay vì `string[]` — null nghĩa là bị ẩn với người xem
// này (không phải chủ nhân), cùng quy ước với PlayerHandView.hand ở trên.
export type PendingActionView = Exclude<PendingAction, { kind: "NEED_PICK_KEPT_CARDS" }> | {
  kind: "NEED_PICK_KEPT_CARDS";
  player: string;
  cards: string[] | null;
  // `keepCount` KHÔNG bí mật (chỉ là số lá phải giữ, suy ra được từ nhân vật +
  // sự kiện đang chạy — công khai), khác `cards` — giữ nguyên cho MỌI người
  // xem, kể cả không phải chủ nhân, để client hiện đúng "giữ mấy lá" và nút
  // mặc định khi hết giờ.
  keepCount: number;
};

// Giai đoạn 5, cơ chế chọn nhân vật — giống PlayerHandView.hand: `options` chỉ
// có giá trị thật với chính chủ (playerId === viewerId), còn lại null. Đây là
// 2 lá RIÊNG được phát, khác `chosen` (LUÔN công khai, kể cả null = "chưa
// chọn" — biết ai CHƯA chọn không lộ gì về nội dung 2 lá của họ).
export interface CharacterChoiceView {
  playerId: string;
  options: [string, string] | null;
  chosen: string | null;
}

// Khoảng cách/tầm bắn 2 chiều giữa NGƯỜI XEM và 1 người chơi khác. Mọi thứ
// dùng để tính (thứ tự ghế, trang bị bày ngửa, nhân vật, lá sự kiện, luật bổ
// sung) đều công khai, nên lộ ra không giúp gian lận gì — server tính sẵn bằng
// đúng computeDistance()/getWeaponRange() để giao diện KHÔNG phải tự cài lại
// luật khoảng cách (tự cài lại rất dễ lệch, như lỗi cardActsAsMissed cũ).
export interface DistanceInfo {
  toThem: number; // khoảng cách từ người xem tới người này
  toMe: number; // khoảng cách từ người này tới người xem (có thể khác toThem: Mustang/Scope/nhân vật)
  myRange: number; // tầm súng của người xem
  theirRange: number; // tầm súng của người này
}

export interface PlayerView {
  viewerId: string;
  players: PlayerHandView[];
  deckCount: number;
  discardPile: string[];
  pending: PendingActionView[];
  currentPlayerIndex: number;
  turnPhase: GameState["turnPhase"];
  winner: GameState["winner"];
  characterSelection: CharacterChoiceView[] | null;
  // Việc 5.3 — luật bổ sung đang bật cho ván này, KHÔNG bí mật gì (chủ phòng
  // chọn công khai trước khi bắt đầu ván) nên giữ nguyên, không cần ẩn/lọc.
  houseRules: HouseRuleId[];
  // Mở rộng Dodge City — cùng lý do KHÔNG bí mật như houseRules ở trên.
  expansions: ExpansionId[];
  // Mở rộng Dodge City, mục 1.1 — client cần biết đúng như core để tự vẽ nút
  // "kích hoạt"/"dùng làm Missed!" cho lá vàng trên sân (xem
  // isDelayedEquipmentCardName() ở cards.ts) đúng lúc, không sớm hơn. KHÔNG bí
  // mật gì (lá đã bày ngửa công khai, ai cũng nhìn thấy) — chỉ đơn giản trước
  // đây chưa cần lộ ra vì chưa có nút bấm nào phụ thuộc 2 field này.
  equipmentPlayedTurn: GameState["equipmentPlayedTurn"];
  turnNumber: number;
  // Mở rộng Dodge City, mục C — client cần biết đúng như core để tự vẽ/ẩn nút
  // "Dùng kỹ năng" của José Delgado (tối đa 2 lần/lượt) và Doc Holyday (tối đa
  // 1 lần/lượt). KHÔNG bí mật gì — chỉ là bộ đếm số lần dùng trong lượt, không
  // liên quan bài úp/thông tin ẩn nào.
  joseDelgadoUsesThisTurn: number;
  docHolydayUsedThisTurn: boolean;
  // Bộ mở rộng "custom_characters" (The DareDevil, xem docs/bang/rules/House_Rule.txt mục
  // I) — client cần biết đúng như core để tự vẽ/ẩn nút "Dùng kỹ năng" (tối đa
  // 1 lần/lượt, giống Doc Holyday). KHÔNG bí mật gì, cùng lý do 2 field trên.
  fairKillerUsedThisTurn: boolean;
  // Bộ mở rộng "custom_characters" (Jonny Bettor, xem docs/bang/rules/House_Rule.txt mục I)
  // — client cần biết đúng như core để tự vẽ/ẩn nút "Dùng kỹ năng" (tối đa 2
  // lần/lượt, giống José Delgado). KHÔNG bí mật gì, cùng lý do các field trên.
  gamblerUsesThisTurn: number;
  // Bộ mở rộng "custom_characters" (Elena Noir, xem docs/bang/rules/House_Rule.txt mục I) —
  // client cần biết đúng như core để tự vẽ nút "vũ trang" (chỉ hiện khi KHÔNG
  // đang Miễn Tử) và hiển thị trạng thái "đang Miễn Tử (còn N lượt)". KHÔNG bí
  // mật gì — không liên quan bài úp/thông tin ẩn nào, giống 2 field trên. THEO
  // PLAYERID (không phải field đơn) — xem ghi chú ở GameState (Vera Custer có
  // thể mượn khả năng này, cần trạng thái riêng với Elena Noir thật).
  elenaNoirArmed: Record<string, boolean>;
  elenaNoirImmortalTurnsLeft: Record<string, number>;
  // Bộ mở rộng "custom_characters" (Nomad Norman, xem docs/bang/rules/House_Rule.txt mục I) —
  // BÍ MẬT, KHÁC HẲN elenaNoirArmed ngay phía trên (field đó công khai vì
  // không có gì để giấu). CHỈ chứa ĐÚNG 1 key — của chính viewerId (nếu có) —
  // mọi playerId khác KHÔNG xuất hiện trong map này (không phải `false`, mà
  // KHÔNG CÓ KEY), để đối phương không suy luận được gì. Client tự đọc
  // `drifterShield[viewerId]`; coi bất kỳ playerId nào khác là "không biết"
  // (không đọc được, không phải biết chắc là false).
  drifterShield: Record<string, boolean>;
  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem docs/bang/rules/House_Rule.txt mục I)
  // — cùng lý do KHÔNG bí mật như 2 field Elena Noir ở trên: ai "cùng vào tù"
  // với ai, và ai sắp mất lượt kế tiếp, đều công khai (không liên quan bài úp).
  marcelJailCompanion: GameState["marcelJailCompanion"];
  marcelCompanionSkipNextTurn: GameState["marcelCompanionSkipNextTurn"];
  // Bộ mở rộng "custom_characters" (Aura The Soul-Weaver, xem docs/bang/rules/House_Rule.txt mục I) —
  // client cần biết đúng như core để tự ẩn nút "hồi sinh" nếu đã dùng hết
  // lượt. KHÔNG bí mật gì (giống elenaNoirArmed/marcelJailCompanion — công
  // khai, không cần lọc theo viewerId).
  sentinelUsed: GameState["sentinelUsed"];
  // Mở rộng High Noon/A Fistful of Cards, mục 1.2 — CHỈ lộ lá ĐANG chạy + lá
  // KẾ TIẾP (đã hỏi lại và chốt: đây là điểm bán-ẩn thứ 2 trong dự án, tiền lệ
  // NEED_PICK_KEPT_CARDS của Kit Carlson) — phần CÒN LẠI của eventDeck (thứ tự
  // các lá sau đó) bị ẩn hoàn toàn, không lộ qua field nào. eventDiscard KHÔNG
  // bí mật gì (lịch sử các lá đã lật), giữ nguyên đầy đủ.
  activeEventId: GameState["activeEventId"];
  nextEventId: string | null;
  eventDiscard: GameState["eventDiscard"];
  // Mở rộng Dodge City, mục C (Vera Custer) — client cần biết đúng như core
  // (getEffectiveCharacterId() ở characters.ts) để tự vẽ nút/badge theo ĐÚNG
  // khả năng đang mượn, không phải characterId thật của Vera. KHÔNG bí mật gì
  // (giống elenaNoirArmed/marcelJailCompanion — ai mượn khả năng gì công khai,
  // như bài Vera Custer lật ngửa ngoài đời thật).
  veraCusterBorrowedCharacterId: GameState["veraCusterBorrowedCharacterId"];
  // Bố cục bàn chơi mới (2026-11-08) — theo id từng người CÒN SỐNG khác người
  // xem. Rỗng khi người xem đã chết/không ngồi trong ván, hoặc đang chọn nhân vật.
  distances: Record<string, DistanceInfo>;
}

function viewRole(player: PlayerState, viewerId: string): Role | null {
  if (player.id === viewerId) return player.role;
  if (player.role === "sheriff") return player.role;
  // Biến thể 3 người (vòng tròn săn đuổi) — chủ dự án CHỐT cả 3 vai công
  // khai ngay từ đầu, khác hẳn Sheriff (chỉ 1 trong 4 vai công khai ở luật
  // gốc) — xem setup.ts's isHuntMode()/win.ts's HUNT_CIRCLE.
  if (player.role === "police" || player.role === "criminal" || player.role === "traitor") return player.role;
  if (!player.alive) return player.role; // lật vai công khai khi bị loại
  return null;
}

// Xem DistanceInfo ở trên.
// shortcut: computeDistance() đọc Scope/Binocular của người "đánh" KHÔNG qua
// getEffectiveEquipment() (vì trong reduce.ts người đánh luôn là người đang tới
// lượt) — nên chiều toMe có thể lệch 1 khi đang là lượt Belle Star (cô ta vô
// hiệu trang bị người khác). Sửa trong computeDistance() nếu cần số đúng tuyệt đối.
function viewDistances(state: GameState, viewerId: string): Record<string, DistanceInfo> {
  const me = state.players.find((p) => p.id === viewerId);
  if (!me || !me.alive || state.characterSelection) return {};
  const extraDistance = state.houseRules.includes("extra_distance") ? 1 : 0; // giống hệt reduce.ts
  const myRange = getWeaponRange(state, me);
  const result: Record<string, DistanceInfo> = {};
  for (const other of state.players) {
    if (other.id === viewerId || !other.alive) continue;
    result[other.id] = {
      toThem: computeDistance(state, me.id, other.id, extraDistance),
      toMe: computeDistance(state, other.id, me.id, extraDistance),
      myRange,
      theirRange: getWeaponRange(state, other),
    };
  }
  return result;
}

// Giai đoạn 5 (Kit Carlson, đợt 6) — ẩn `cards` với bất kỳ ai KHÔNG PHẢI
// chính người đang xem 3 lá đó. Mọi kind khác giữ nguyên, trả thẳng lại.
function viewPendingItem(item: PendingAction, viewerId: string): PendingActionView {
  if (item.kind === "NEED_PICK_KEPT_CARDS" && item.player !== viewerId) {
    return { kind: item.kind, player: item.player, cards: null, keepCount: item.keepCount };
  }
  return item;
}

// Giai đoạn 5, cơ chế chọn nhân vật — ẩn `options` với bất kỳ ai KHÔNG PHẢI
// chính chủ của phần tử đó.
function viewCharacterChoice(choice: CharacterChoice, viewerId: string): CharacterChoiceView {
  return {
    playerId: choice.playerId,
    options: choice.playerId === viewerId ? choice.options : null,
    chosen: choice.chosen,
  };
}

export function viewFor(state: GameState, viewerId: string): PlayerView {
  const players: PlayerHandView[] = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    role: viewRole(player, viewerId),
    hp: player.hp,
    maxHp: player.maxHp,
    handCount: player.hand.length,
    hand: player.id === viewerId ? [...player.hand] : null,
    equipment: [...player.equipment],
    alive: player.alive,
    characterId: player.characterId,
  }));

  return {
    viewerId,
    players,
    deckCount: state.deck.length,
    discardPile: [...state.discardPile],
    pending: state.pending.map((item) => viewPendingItem(item, viewerId)),
    currentPlayerIndex: state.currentPlayerIndex,
    turnPhase: state.turnPhase,
    winner: state.winner,
    characterSelection: state.characterSelection
      ? state.characterSelection.map((c) => viewCharacterChoice(c, viewerId))
      : null,
    houseRules: state.houseRules,
    expansions: state.expansions,
    equipmentPlayedTurn: state.equipmentPlayedTurn,
    turnNumber: state.turnNumber,
    joseDelgadoUsesThisTurn: state.joseDelgadoUsesThisTurn,
    docHolydayUsedThisTurn: state.docHolydayUsedThisTurn,
    fairKillerUsedThisTurn: state.fairKillerUsedThisTurn,
    gamblerUsesThisTurn: state.gamblerUsesThisTurn,
    elenaNoirArmed: state.elenaNoirArmed,
    elenaNoirImmortalTurnsLeft: state.elenaNoirImmortalTurnsLeft,
    drifterShield:
      state.drifterShield[viewerId] !== undefined ? { [viewerId]: state.drifterShield[viewerId] } : {},
    marcelJailCompanion: state.marcelJailCompanion,
    marcelCompanionSkipNextTurn: state.marcelCompanionSkipNextTurn,
    sentinelUsed: state.sentinelUsed,
    activeEventId: state.activeEventId,
    nextEventId: state.eventDeck.length > 0 ? state.eventDeck[state.eventDeck.length - 1] : null,
    eventDiscard: [...state.eventDiscard],
    veraCusterBorrowedCharacterId: state.veraCusterBorrowedCharacterId,
    distances: viewDistances(state, viewerId),
  };
}
