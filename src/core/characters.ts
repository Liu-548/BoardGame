// Giai đoạn 5 — hệ thống hook cho nhân vật (việc 5.1) + 6 nhân vật cơ bản đầu
// tiên (việc 5.2, đợt 1). Xem NHAN-VAT-BANG-CO-BAN.txt để biết đủ 16 nhân vật
// dự tính và toàn bộ 9 loại hook.
//
// Vì sao nhân vật không nằm trong GameState: quy tắc 3 CLAUDE.md — state
// phải là JSON thuần, không được chứa hàm. Nên PlayerState (xem types.ts)
// chỉ giữ `characterId: string | null` (1 chuỗi) — hàm hook THẬT nằm ở
// registry CHARACTERS bên dưới, tra theo id lúc cần.
//
// Hook ở đây KHÔNG "thuần" theo nghĩa "không side effect" — hầu hết nhận
// thẳng `next: GameState` (bản sao cục bộ mà reduce() đang giữ, đã an toàn
// để sửa) và được phép mutate trực tiếp, giống MỌI hàm nội bộ khác trong
// reduce.ts (vd playBeer()/playSaloon() cũng mutate `next` trực tiếp, không
// trả về state mới tách biệt). Ngoại lệ duy nhất là `modifyDistance` — hàm
// THUẦN thực sự (không nhận `next`, không side effect), vì distance.ts gọi
// nó ở nhiều chỗ chỉ để ĐỌC khoảng cách (không phải lúc nào cũng đang xử lý
// 1 action) — mutate ở đó sẽ sai.
//
// Việc 5.1 CHỈ nối dây 4 trong 9 hook — 4 hook này không cần thêm loại
// PendingAction mới hay đổi luồng action, chỉ cần chèn đúng 1 chỗ đã tính
// toán sẵn (distance.ts/reduce.ts). 5 hook còn lại (liệt kê cuối file) ĐỂ
// DÀNH cho các đợt 5.2 sau — xây cùng lúc với đúng nhân vật cần nó, cố tình
// KHÔNG đoán trước chữ ký hàm, đoán sai sẽ phải sửa lại tốn công hơn chờ có
// ví dụ thật để đối chiếu.
//
// Việc 5.2 (đợt 1, xem lịch sử trò chuyện) CHƯA làm cơ chế "phát 2 lá nhân
// vật, chọn giữ 1" thật — đó là 1 việc riêng. Tạm thời gán `characterId` thủ
// công qua `RuleOptions.characterAssignments` khi gọi setupGame() (xem
// setup.ts), chỉ để có nhân vật thật mà thử/test.

import { cardSuitRankFromId } from "./cards";
import { giveCardToPlayer } from "./equipment";
import { drawTopCard } from "./deck";
import { nextRandom } from "./rng";
import type { ExpansionId, GameEvent, GameState, PlayerState, Role } from "./types";

// Máu khởi điểm — dùng chung cho CẢ 2 đường vào ván (setup.ts's
// characterAssignments/dealCharacterCards LẪN finishCharacterSelection() ở
// reduce.ts) để không lặp công thức 2 nơi. Đặt ở đây (không phải setup.ts)
// để tránh vòng lặp import: setup.ts đã import applyTurnStartChecks từ
// reduce.ts, nếu đặt ở setup.ts thì reduce.ts import ngược lại sẽ thành vòng.
export const BASE_HP = 4; // ai cũng 4 máu nếu chưa có nhân vật
export const SHERIFF_BONUS_HP = 1;

export function computeStartingHp(role: Role | null, characterId: string | null): number {
  const character = getCharacterDefinition(characterId);
  const baseHp = character ? character.bullets : BASE_HP;
  return role === "sheriff" ? baseHp + SHERIFF_BONUS_HP : baseHp;
}

// Mở rộng Dodge City, mục C nhóm C (Vera Custer) — characterId "HIỆU LỰC" của
// `player`: nếu nhân vật THẬT của họ có canBorrowCharacterAbilities (chỉ Vera
// Custer) VÀ đang có mượn ai (state.veraCusterBorrowedCharacterId khác null),
// trả characterId đang mượn; ngược lại trả characterId thật. HÀM TRUNG TÂM
// DUY NHẤT — MỌI nơi trong core/ cần tra hook/field tĩnh theo nhân vật của 1
// người phải gọi qua đây (hoặc getEffectiveCharacterHooks/Definition bên
// dưới), KHÔNG đọc thẳng player.characterId, để tự động "mượn" đúng mà không
// cần sửa từng điểm gọi hook riêng lẻ. CHỈ ảnh hưởng hook/field tĩnh — KHÔNG
// đụng bullets/maxHp (computeStartingHp() ở trên vẫn luôn dùng characterId
// THẬT — đã hỏi lại và chốt "không mượn chỉ số nhân vật").
export function getEffectiveCharacterId(state: GameState, player: PlayerState): string | null {
  if (getCharacterDefinition(player.characterId)?.canBorrowCharacterAbilities === true && state.veraCusterBorrowedCharacterId) {
    return state.veraCusterBorrowedCharacterId;
  }
  return player.characterId;
}

export function getEffectiveCharacterHooks(state: GameState, player: PlayerState): CharacterHooks {
  return getCharacterHooks(getEffectiveCharacterId(state, player));
}

export function getEffectiveCharacterDefinition(state: GameState, player: PlayerState): CharacterDefinition | undefined {
  return getCharacterDefinition(getEffectiveCharacterId(state, player));
}

// Mở rộng Dodge City, mục C nhóm B (Sean Mallory) — giới hạn số lá được GIỮ
// cuối lượt (đủ máu thì không cần bỏ bớt). Dùng CHUNG cho cả `reduce.ts`
// (handleEndTurn()/handleDiscardCards()) LẪN `room.ts` (tự động bỏ bài thay
// khi hết giờ) — đặt ở đây (không phải reduce.ts) để room.ts import được mà
// không phải kéo theo toàn bộ reduce.ts. Nhận `state` (mục C nhóm C, Vera
// Custer) để tra đúng hook hiệu lực thay vì characterId thật.
export function getHandLimit(state: GameState, player: PlayerState): number {
  return getEffectiveCharacterHooks(state, player).modifyHandLimit?.(player.hp) ?? player.hp;
}

// Mở rộng Dodge City, mục C nhóm C (Belle Star) — trang bị "hiệu dụng" của
// `player`: trả `[]` nếu ĐANG là lượt của 1 nhân vật có disablesOthersEquipment
// (tra qua characterId HIỆU LỰC — mục C nhóm C, Vera Custer mượn Belle Star
// cũng phải có tác dụng) VÀ `player` không phải chính người đó (equipment của
// CHÍNH Belle Star không bao giờ bị chính cô vô hiệu hoá); ngược lại trả
// `player.equipment` thật. Dùng CHUNG cho MỌI nơi cần đọc trang bị 1 người để
// TÍNH HIỆU ỨNG (khoảng cách, Barrel, Missed! trì hoãn...) — KHÔNG dùng cho
// các nơi chỉ cần biết trang bị có TỒN TẠI VẬT LÝ hay không (cướp/bắt bỏ bài
// — Panic!/Cat Balou vẫn thấy và lấy được bình thường, chỉ HIỆU ỨNG tắt tạm thời).
export function getEffectiveEquipment(state: GameState, player: PlayerState): string[] {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (getEffectiveCharacterDefinition(state, currentPlayer)?.disablesOthersEquipment === true && player.id !== currentPlayer.id) {
    return [];
  }
  return player.equipment;
}

export interface CharacterHooks {
  // Thay thế HOÀN TOÀN pha rút 2 lá đầu lượt mặc định (xem handleDrawCards()
  // trong reduce.ts) — chỉ gọi khi nhân vật có định nghĩa hook này. Black Jack:
  // rút lá 1 úp, lá 2 lật ngửa cho mọi người xem, đỏ (Cơ/Rô) thì rút thêm lá 3.
  // Không cần pending mới vì không có lựa chọn nào — hoàn toàn tự động theo lá
  // lật ra. (Jesse Jones/Kit Carlson/Pedro Ramirez sau này CÓ lựa chọn, sẽ cần
  // thêm PendingAction riêng khi tới lượt cài — chưa làm ở đây.)
  onDrawPhase?(next: GameState, player: PlayerState): GameEvent[];

  // distance.ts gọi SAU khi đã cộng/trừ Ống nhắm/Ngựa Mustang thật — `role`
  // cho biết nhân vật đang là bên bắn hay bên bị bắn tới. Paul Regret: role
  // "target" trả về distance + 1 (Mustang ảo). Rose Doolan: role "attacker"
  // trả về distance - 1 (Ống nhắm ảo).
  modifyDistance?(distance: number, role: "attacker" | "target"): number;

  // Gọi SAU khi `target` đã bị trừ máu, BẤT KỂ nguồn gây ra (Bang!, Dynamite,
  // Duel, Indians!...). Bart Cassidy: rút đúng `amount` lá từ bộ bài.
  onLoseLife?(next: GameState, target: PlayerState, amount: number): GameEvent[];

  // Gọi CÙNG LÚC với onLoseLife, nhưng CHỈ khi nguồn sát thương là 1 lá bài
  // người chơi khác đánh (Bang!/Gatling/thua Duel/không bỏ được Indians!) —
  // KHÔNG gọi cho Dynamite (tự nổ, không có "người gây"). El Gringo: cướp
  // ngẫu nhiên 1 lá trên tay `byPlayerId`, lặp lại theo TỪNG điểm máu mất.
  onLoseLifeFromCard?(next: GameState, target: PlayerState, amount: number, byPlayerId: string): GameEvent[];

  // Gọi khi CÓ NGƯỜI CHẾT (bất kỳ ai, không chỉ chính mình) — TRƯỚC khi bài
  // người chết bị bỏ vào chồng bỏ (xem eliminatePlayer() trong reduce.ts).
  // `self` = chính người chơi ĐANG SỞ HỮU nhân vật này (không phải người vừa
  // chết) — cần tham số này để hook biết "mình" là ai (vd Vulture Sam phải
  // biết chuyển bài VÀO TAY AI). Muốn "nhận" bài thì hook PHẢI tự dọn
  // deadPlayer.hand/deadPlayer.equipment — không dọn thì bài vẫn rơi vào
  // chồng bỏ như bình thường NGAY SAU hook, không mất cũng không nhân đôi.
  // Vulture Sam: chuyển hết bài người chết (kể cả Dynamite chưa nổ) về tay
  // chính mình.
  onAnyDeath?(next: GameState, self: PlayerState, deadPlayer: PlayerState): GameEvent[];

  // Giai đoạn 5 (đợt 3), Slab the Killer — trả về số lá Missed! CẦN để né TRỌN
  // VẸN 1 phát Bang!/Gatling do CHÍNH người này đánh ra (không áp dụng Duel/
  // Indians! — 2 lá đó không đi qua pushMissedReaction()). Không có hook này
  // (undefined) nghĩa là mặc định 1, y hệt trước Giai đoạn 5. pushMissedReaction()
  // trong reduce.ts tra hook này qua NHÂN VẬT CỦA NGƯỜI ĐÁNH (không phải người
  // bị nhắm) rồi gắn vào NEED_MISSED.missesNeeded.
  onOutgoingBang?(): number;

  // Giai đoạn 5 (đợt 3), Suzy Lafayette — gọi ngay khi tay CHÍNH người này vừa
  // CHUYỂN từ còn bài sang hết bài (0 lá), bất kể lý do (đánh ra, bị cướp, bị
  // bắt bỏ...). reduce.ts/characters.ts gọi qua triggerHandEmptyHook() bên dưới
  // — hàm đó tự đảm bảo chỉ gọi hook này đúng 1 lần ngay sau 1 lần rời tay làm
  // tay về 0, không tự lặp lại nếu tay đã trống sẵn từ trước.
  onHandEmpty?(next: GameState, player: PlayerState): GameEvent[];

  // Mở rộng Dodge City, mục C nhóm B (Sean Mallory) — thay công thức mặc định
  // "giới hạn số lá cuối lượt = currentHp" bằng `defaultLimit` truyền vào (đã
  // TÍNH SẴN = currentHp, hàm chỉ cần biết có ghi đè hay không). PURE — giống
  // modifyDistance, không nhận `next`/side effect. Không có hook (undefined)
  // nghĩa là giữ nguyên `defaultLimit`, y hệt trước Dodge City. Xem
  // getHandLimit() bên dưới — dùng CHUNG cho cả reduce.ts lẫn room.ts (timeout).
  modifyHandLimit?(defaultLimit: number): number;

  // Mở rộng Dodge City, mục C nhóm B (Tequila Joe) — thay lượng máu hồi mặc
  // định (LUÔN là 1, TRƯỚC khi trừ theo maxHp còn trống) theo TÊN LÁ cụ thể.
  // PURE. CHỈ áp dụng ở playBeer() (reduce.ts) — Saloon/Tequila/Canteen/Whisky
  // vẫn hồi đúng 1 như bình thường, không gọi qua hook này.
  modifyHealAmount?(cardName: string, defaultAmount: number): number;

  // Mở rộng Dodge City, mục C nhóm B (Apache Kid) — `cardId` là lá CỤ THỂ
  // (có chất/số thật) đang gây hiệu ứng NHẮM VÀO người có nhân vật này. Trả
  // true thì hiệu ứng KHÔNG áp dụng (lá vẫn bị đánh/rời tay/vào chồng bỏ bình
  // thường ở nơi gọi — chỉ riêng HIỆU ỨNG bị chặn). PURE — chỉ tra chất/số lá,
  // không cần biết `self`/`fromPlayer` (caller đã biết đang tra hook của AI).
  // CHỈ gọi ở hiệu ứng TỨC THỜI nhắm 1 người cụ thể (Bang!-like qua
  // pushMissedReaction(), Cat Balou-like qua pushDiscardFromZoneReaction(),
  // Panic!-like qua applyPanicEffect(), và playJail() chặn NGAY LÚC ĐÁNH nếu
  // lá Jail là chất Rô) — KHÔNG áp dụng cho Duel (không đi qua 3 hàm trên,
  // tự động loại trừ) hay Indians! (cơ chế khác hẳn Missed!, đã hỏi chủ dự án
  // và CHỐT không tính "tương đương Bang!" cho miễn nhiễm này).
  isImmuneToCard?(cardId: string): boolean;

  // Mở rộng Dodge City, mục C nhóm C (Molly Stark) — gọi ngay khi CHÍNH `self`
  // chủ động chơi/bỏ 1 lá Missed!/Beer/Bang! (`cardName`) LÚC KHÔNG PHẢI lượt
  // mình (caller đã tự kiểm `self.id !== lượt hiện tại` trước khi gọi — xem
  // triggerVoluntaryOutOfTurnHook() trong reduce.ts). `context`:
  // - "immediate": Missed!/Bang! đỡ Indians!/hồi sinh tự động bỏ Beer — nên
  //   rút NGAY 1 lá, trả về event tương ứng.
  // - "duel": Bang! bỏ trong Đấu tay đôi (Duel) — KHÔNG rút ngay, chỉ ghi
  //   nhận vào GameState.duelBangDrawPending (mutate `next` trực tiếp, trả về
  //   mảng rỗng) — reduce.ts tự rút hết khi Duel THẬT SỰ kết thúc.
  onVoluntaryPlayOutOfTurn?(
    next: GameState,
    self: PlayerState,
    cardName: string,
    context: "immediate" | "duel"
  ): GameEvent[];
}

// Giai đoạn 5 (đợt 3), Suzy Lafayette — gọi ở MỌI nơi trong reduce.ts (và ngay
// trong file này, xem el_gringo bên dưới) có 1 lá THẬT SỰ vừa rời khỏi 1 bàn
// tay đang có bài (splice thành công từ hand không rỗng) — an toàn gọi vô điều
// kiện: nếu tay còn bài (>0) hoặc nhân vật không có onHandEmpty thì trả về
// mảng rỗng, không có gì xảy ra.
export function triggerHandEmptyHook(next: GameState, player: PlayerState): GameEvent[] {
  if (player.hand.length !== 0) return [];
  const hook = getEffectiveCharacterHooks(next, player).onHandEmpty;
  if (!hook) return [];
  return hook(next, player);
}

// Mở rộng Dodge City, mục C nhóm C (Molly Stark) — gọi ở MỌI nơi trong
// reduce.ts có 1 lá Missed!/Beer/Bang! THẬT SỰ vừa được CHÍNH CHỦ chọn chơi/bỏ
// (không phải bị ép bởi Cat Balou/Brawl/Can Can — 3 lá đó không đi qua đây,
// dùng NEED_DISCARD_FROM_ZONE riêng). Tự kiểm "ngoài lượt mình" ở ĐÂY (so với
// next.currentPlayerIndex) — an toàn gọi vô điều kiện, quan trọng nhất cho ca
// hồi sinh tự động (Beer) vì người tự nổ Dynamite CHẾT NGAY TRONG LƯỢT CHÍNH
// MÌNH vẫn có thể rơi vào nhánh này, KHÔNG được tính là "ngoài lượt".
export function triggerVoluntaryOutOfTurnHook(
  next: GameState,
  player: PlayerState,
  cardName: string,
  context: "immediate" | "duel"
): GameEvent[] {
  const currentPlayer = next.players[next.currentPlayerIndex];
  if (player.id === currentPlayer.id) return [];
  const hook = getEffectiveCharacterHooks(next, player).onVoluntaryPlayOutOfTurn;
  if (!hook) return [];
  return hook(next, player, cardName, context);
}

export interface CharacterDefinition {
  id: string;
  name: string; // tên nhân vật — HIỂN THỊ RIÊNG với tên người chơi (xem ui.ts, việc bổ sung sau 4.6)
  // Máu tối đa CHƯA cộng +1 Cảnh sát trưởng (setup.ts tự cộng thêm nếu vai là
  // sheriff) — đúng thuật ngữ "bullets" trong NHAN-VAT-BANG-CO-BAN.txt.
  bullets: number;
  // Willy the Kid: bỏ hẳn giới hạn "1 Bang!/lượt" (xem playBang() trong
  // reduce.ts) dù không cầm Volcanic. Đây là DỮ LIỆU tĩnh (luôn true/không có
  // gì để tính), không phải hook — nên không đặt trong CharacterHooks.
  bypassBangLimit?: boolean;
  // Jourdonnais: luôn coi như CÓ SẴN 1 Barrel (draw! khi bị Bang!, ra Cơ thì
  // né), CỘNG DỒN với Barrel thật nếu có (xem pushMissedReaction() trong
  // reduce.ts — đẩy 1 NEED_DRAW_CHECK cho mỗi nguồn Barrel, ảo lẫn thật). Cũng
  // là DỮ LIỆU tĩnh, không phải hook — không có gì để tính, chỉ là "có/không".
  virtualBarrel?: boolean;
  // Pedro Ramirez (đợt 4) — được HỎI đầu lượt (xem NEED_PICK_DRAW_SOURCE ở
  // types.ts + handleDrawCards()/respondToPickDrawSource() trong reduce.ts):
  // lấy lá 1 từ đỉnh chồng bỏ, hay rút thẳng bộ bài như bình thường? Chỉ hỏi
  // khi chồng bỏ còn ít nhất 1 lá — rỗng thì rút thẳng bộ bài, khỏi hỏi. Cũng
  // là DỮ LIỆU tĩnh — bản thân việc HỎI/xử lý câu trả lời là luồng action dùng
  // chung, không có gì riêng để tính trong 1 hàm hook.
  canDrawFromDiscardPile?: boolean;
  // Lucky Duke (đợt 4) — MỌI lần draw! (Barrel/Jail/Dynamite...) đều lật thêm
  // 1 lá thứ 2, dùng lá có lợi hơn làm kết quả, cả 2 lá đều vào chồng bỏ (xem
  // resolveDrawCheck() trong reduce.ts). KHÔNG đặt trong CharacterHooks dù file
  // đặc tả gọi đây là 1 "hook" (onDrawCheck) — "có lợi" nghĩa là gì đã được
  // CHỐT theo NGỮ CẢNH của từng loại draw! (Barrel/Jail: có lợi = khớp Cơ;
  // Dynamite: có lợi = KHÔNG khớp, tức không nổ), logic đó DÙNG CHUNG cho bất
  // kỳ ai có field này, không phải hàm riêng của Lucky Duke.
  hasLuckyDraw?: boolean;
  // Jesse Jones (đợt 5) — được HỎI đầu lượt (xem NEED_PICK_DRAW_TARGET ở
  // types.ts + handleDrawCards()/respondToPickDrawTarget() trong reduce.ts):
  // lá 1 lấy từ bộ bài hay từ tay 1 người khác (rồi tự quyết tiếp để người đó
  // chọn lá đưa hay cướp ngẫu nhiên)? Cũng là DỮ LIỆU tĩnh — luồng HỎI/xử lý
  // câu trả lời dùng chung, không có gì riêng để tính trong 1 hàm hook.
  canStealFirstDrawCard?: boolean;
  // Kit Carlson (đợt 6) — được HỎI đầu lượt (xem NEED_PICK_KEPT_CARDS ở
  // types.ts + handleDrawCards()/respondToPickKeptCards() trong reduce.ts):
  // xem riêng 3 lá trên cùng bộ bài, chọn giữ 2 bỏ 1. Cũng là DỮ LIỆU tĩnh.
  canPeekTopThree?: boolean;
  // Calamity Janet (đợt 7) — lá Bang!/Missed! của người này HOÁN ĐỔI được cho
  // nhau ở MỌI chỗ kiểm tra "có lá Bang!/Missed! không" (đánh Bang! chủ động
  // bằng lá Missed!, đỡ Bang! bằng lá Bang!, đỡ Duel/Indians! bằng lá Missed!)
  // — xem actsAsBang()/actsAsMissed() trong reduce.ts. KHÔNG đặt trong
  // CharacterHooks dù file đặc tả gọi là "hook" (cardAlias) — không có gì
  // riêng để TÍNH, chỉ là "có/không" áp dụng logic hoán đổi dùng chung.
  hasBangMissedAlias?: boolean;
  // Sid Ketchum (đợt 7) — có kỹ năng CHỦ ĐỘNG dùng bất cứ lúc nào (action mới
  // USE_ABILITY, xem types.ts + handleUseAbility() trong reduce.ts): bỏ 2 lá
  // trên tay để hồi 1 máu. Cũng là DỮ LIỆU tĩnh — bản thân luồng xử lý action
  // này dùng chung, không có gì riêng để tính trong 1 hàm hook.
  canSelfHeal?: boolean;
  // Mở rộng Dodge City, mục C nhóm A — Pat Brennan: đầu lượt được HỎI (xem
  // NEED_PICK_DRAW_OR_EQUIPMENT ở types.ts + handleDrawCards()/
  // respondToPickDrawOrEquipment() trong reduce.ts): rút 2 lá như thường, hay
  // lấy đúng 1 lá trang bị bất kỳ đang bày trước mặt người khác vào tay mình?
  // Cũng là DỮ LIỆU tĩnh — luồng HỎI/xử lý câu trả lời dùng chung, không có gì
  // riêng để tính trong 1 hàm hook.
  canTakeEquipmentInsteadOfDraw?: boolean;
  // Mở rộng Dodge City, mục C nhóm A — Chuck Wengam: kỹ năng CHỦ ĐỘNG dùng
  // action USE_ABILITY (giống Sid Ketchum) nhưng CHỈ trong lượt của chính
  // mình: mất 1 máu để rút 2 lá, lặp lại được nhiều lần, chặn nếu chỉ còn
  // đúng 1 máu. `cardIds` truyền rỗng (không bỏ lá nào) — xem handleUseAbility().
  canPayLifeToDraw?: boolean;
  // Mở rộng Dodge City, mục C nhóm A — José Delgado: kỹ năng CHỦ ĐỘNG dùng
  // action USE_ABILITY (giống Sid Ketchum) nhưng CHỈ trong lượt của chính
  // mình, tối đa 2 LẦN/lượt (xem GameState.joseDelgadoUsesThisTurn): bỏ ĐÚNG 1
  // lá xanh dương (equipment "instant", KHÔNG tính lá vàng "delayed" — đã
  // chốt ở LO-TRINH.md "Ghi chú cho 5.4" mục C.8) từ tay để rút 2 lá.
  canDiscardEquipmentToDraw?: boolean;
  // Mở rộng Dodge City, mục C nhóm B — Elena Fuente: MỌI lá trên tay đều coi
  // như có thêm vai trò Missed! (mở rộng khái niệm alias của Calamity Janet
  // — hasBangMissedAlias chỉ đúng 1 cặp tên "bang"/"missed", field này áp
  // dụng cho MỌI tên lá). DỮ LIỆU tĩnh — actsAsMissed() (reduce.ts) đọc field
  // này, không cần hook riêng.
  hasAnyCardMissedAlias?: boolean;
  // Mở rộng Dodge City, mục C nhóm B — Elena Fuente (bonus, đã hỏi lại và xác
  // nhận): CŨNG được dùng BẤT KỲ lá nào đang bày trước mặt CHÍNH MÌNH
  // (equipment) làm Missed!, KỂ CẢ Jail đang giam chính mình (dùng xong thì
  // Jail mất — "thoát giam sớm", không cần đợi draw! đầu lượt) — TRỪ Dynamite.
  // KHÔNG cần chờ 1 lượt như nhóm trang bị "delayed" thường (Bible/Sombrero...).
  // DỮ LIỆU tĩnh — isUsableDelayedMissedEquipment() (reduce.ts) đọc field này.
  canUseOwnEquipmentAsMissed?: boolean;
  // Mở rộng Dodge City, mục C nhóm B — Tequila Joe: cơ chế "hồi sinh tự động"
  // (máu về 0, tự bỏ Bia, kéo thẳng về 1 máu — xem eliminateIfDead() trong
  // reduce.ts) cộng thêm RIÊNG +1 máu nữa cho nhân vật này (tổng 2 máu sau
  // hồi sinh) — KHÔNG qua modifyHealAmount (đã chốt: cơ chế hồi sinh không
  // phải "lượng hồi" theo đúng nghĩa của 1 lá bài, không nhân đôi công thức
  // cũ). DỮ LIỆU tĩnh, tách riêng khỏi modifyHealAmount cho rõ nghĩa.
  doubleRevivalHp?: boolean;
  // Mở rộng Dodge City, mục C nhóm C — Doc Holyday: kỹ năng CHỦ ĐỘNG dùng
  // action USE_ABILITY (giống Sid Ketchum/Chuck Wengam/José Delgado) nhưng
  // CHỈ trong lượt của chính mình, tối đa 1 LẦN/lượt (xem
  // GameState.docHolydayUsedThisTurn): bỏ 2 lá bất kỳ để bắn hiệu ứng Bang!
  // nhắm 1 người trong tầm súng đang cầm, KHÔNG tính vào giới hạn 1 Bang!/lượt.
  canDiscardTwoForBang?: boolean;
  // Mở rộng Dodge City, mục C nhóm C — Belle Star: TRONG LƯỢT CỦA CHÍNH CÔ
  // TA, MỌI lá trang bị đang bày trước mặt NGƯỜI KHÁC đều mất tác dụng (không
  // ngoại lệ) — xem getEffectiveEquipment() bên dưới, hàm TRUNG TÂM DUY NHẤT
  // mọi nơi cần đọc trang bị của 1 người để TÍNH HIỆU ỨNG (không áp dụng cho
  // việc cướp/bắt bỏ bài — equipment vẫn tồn tại VẬT LÝ, chỉ HIỆU ỨNG bị tắt)
  // phải gọi qua, thay vì đọc thẳng player.equipment.
  disablesOthersEquipment?: boolean;
  // Mở rộng Dodge City, mục C nhóm C — Vera Custer: đầu lượt (trước cả
  // Dynamite/Jail) được HỎI chọn mượn khả năng đặc biệt của 1 người chơi khác
  // còn sống, hiệu lực tới lượt kế tiếp của chính mình — xem
  // NEED_PICK_BORROWED_CHARACTER ở types.ts + getEffectiveCharacterId() bên
  // trên (hàm TRUNG TÂM mọi hook/field tĩnh khác trong file này đều tra qua,
  // tự động "mượn" đúng mà không cần biết gì về field này).
  canBorrowCharacterAbilities?: boolean;
  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // đầu MỖI lượt của chính người này (khi KHÔNG đang trong trạng thái Miễn Tử
  // — GameState.elenaNoirImmortalTurnsLeft === null), được HỎI (xem
  // NEED_PICK_ARMED ở types.ts + handleDrawCards()/respondToPickArmed() trong
  // reduce.ts) có muốn "vũ trang" khả năng Miễn Tử cho chu kỳ này không (chọn
  // có thì rút 1 lá thay vì 2 lượt đó). Toàn bộ logic Miễn Tử (kích hoạt lúc
  // sắp chết, đếm 2 lượt, chặn Jail, chết chắc sau 2 lượt...) nằm thẳng trong
  // reduce.ts (eliminateIfDead()/playJail()/advanceTurn()), KHÔNG qua
  // CharacterHooks — đây CHỈ là cờ tĩnh bật/tắt câu hỏi đầu lượt, giống
  // canTakeEquipmentInsteadOfDraw (Pat Brennan). DỮ LIỆU tĩnh, không có gì để
  // tính trong 1 hàm hook.
  //
  // ĐÃ XỬ LÝ triệt để xung đột với Vera Custer (mở rộng Dodge City,
  // canBorrowCharacterAbilities): GameState.elenaNoirArmed/
  // elenaNoirImmortalTurnsLeft là Record<playerId, ...> (KHÔNG phải field
  // đơn) — nếu 1 ván có CẢ Elena Noir thật LẪN Vera Custer mượn đúng cô ta,
  // mỗi người có entry RIÊNG theo id, không tranh nhau state. Xem ghi chú đầy
  // đủ ở 2 field đó (types.ts).
  canArmImmortality?: boolean;
  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
  // — bó gọn 3 hệ quả CÙNG kích hoạt bởi 1 khả năng duy nhất (khác Elena Noir
  // ở trên chỉ có 1 hệ quả): (1) vừa bị Jail gắn lên -> LẬP TỨC chọn 1 người
  // "cùng vào tù" (playJail()); (2) draw!-check Jail đầu lượt của CHÍNH người
  // này được rút TỐI ĐA 2 LÁ thay vì 1 (resolveDrawCheck()); (3) thoát tù
  // thành công -> lượt đó rút 3 lá thay vì 2 (handleDrawCards()). Toàn bộ logic
  // nằm thẳng trong reduce.ts, KHÔNG qua CharacterHooks — giống canArmImmortality,
  // đây CHỈ là cờ tĩnh bật/tắt, không có gì để tính trong 1 hàm hook.
  //
  // Dùng Record<playerId, ...> cho cả 3 field GameState liên quan
  // (marcelJailCompanion/marcelCompanionSkipNextTurn/marcelJailBonusDrawThisTurn)
  // ngay từ đầu — ÁP DỤNG TRƯỚC bài học từ vụ xung đột Vera Custer/Elena Noir,
  // khỏi cần sửa lại lần 2 nếu 1 ván có CẢ Marcel thật LẪN Vera Custer mượn
  // đúng anh ta.
  canJailCompanion?: boolean;
  // Bộ mở rộng "custom_characters" (Mary Rose, xem House_Rule.txt mục I) — cả
  // 2 field dưới đây HOÀN TOÀN KHÔNG CẦN state gì trong GameState (khác Elena
  // Noir/Marcel Marcelo ở trên) — tính lại NGAY MỖI LẦN qua
  // getEffectiveCharacterDefinition(), không có gì để lưu theo thời gian, nên
  // cũng không có xung đột Vera Custer nào phải lo (mượn khả năng này của ai
  // là áp dụng ngay, trả lại là mất ngay, không cần dọn dẹp Record gì cả).
  //
  // requiresTwoBangCardsToShoot: đánh Bang! CHỦ ĐỘNG (playBang()) phải bỏ ĐỦ 2
  // lá Bang! (không phải 1) — kiểm tra ngay trong playBang().
  requiresTwoBangCardsToShoot?: boolean;
  // canReflectBangDamage: THẬT SỰ mất máu (không đỡ được) vì trúng Bang! ĐƠN
  // LẺ (KHÔNG tính Gatling/Duel/Indians! — những lá đó không đi qua
  // respondToMissed(), hoặc source.card khác "bang") -> bắn trả MIỄN PHÍ,
  // không tốn bài, bỏ qua khoảng cách, cần 2 Missed! mới né được. Xem nhánh
  // "chịu mất máu" của respondToMissed() + pushMaryRoseReflection() trong
  // reduce.ts.
  canReflectBangDamage?: boolean;
  hooks: CharacterHooks;
}

export function getCharacterDefinition(characterId: string | null): CharacterDefinition | undefined {
  if (!characterId) return undefined;
  return CHARACTERS[characterId];
}

export function getCharacterHooks(characterId: string | null): CharacterHooks {
  return getCharacterDefinition(characterId)?.hooks ?? {};
}

// ----- 8 nhân vật (đợt 1: 6 người dùng ngay 4 hook nối dây ở 5.1; đợt 2 nối
// thêm onDrawPhase + virtualBarrel — CẢ HAI vẫn không cần PendingAction/luồng
// action mới) — 8 nhân vật còn lại để dành đợt sau.
export const CHARACTERS: Record<string, CharacterDefinition> = {
  jourdonnais: {
    id: "jourdonnais",
    name: "Jourdonnais",
    bullets: 4,
    virtualBarrel: true,
    hooks: {},
  },

  black_jack: {
    id: "black_jack",
    name: "Black Jack",
    bullets: 4,
    hooks: {
      onDrawPhase: (next, player) => {
        const events: GameEvent[] = [];
        let drawnCount = 0;

        const firstCard = drawTopCard(next);
        if (firstCard) {
          giveCardToPlayer(next.players, player, firstCard);
          drawnCount++;
        }

        const secondCard = drawTopCard(next);
        if (secondCard) {
          giveCardToPlayer(next.players, player, secondCard);
          drawnCount++;
          events.push({ type: "BLACK_JACK_REVEALED", playerId: player.id, cardId: secondCard });

          const { suit } = cardSuitRankFromId(secondCard);
          if (suit === "hearts" || suit === "diamonds") {
            const thirdCard = drawTopCard(next);
            if (thirdCard) {
              giveCardToPlayer(next.players, player, thirdCard);
              drawnCount++;
            }
          }
        }

        events.push({ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount });
        return events;
      },
    },
  },

  bart_cassidy: {
    id: "bart_cassidy",
    name: "Bart Cassidy",
    bullets: 4,
    hooks: {
      onLoseLife: (next, target, amount) => {
        let drawnCount = 0;
        for (let i = 0; i < amount; i++) {
          const cardId = drawTopCard(next);
          if (!cardId) break;
          giveCardToPlayer(next.players, target, cardId);
          drawnCount++;
        }
        if (drawnCount === 0) return [];
        return [{ type: "CARDS_DRAWN", playerId: target.id, count: drawnCount }];
      },
    },
  },

  el_gringo: {
    id: "el_gringo",
    name: "El Gringo",
    bullets: 3,
    hooks: {
      onLoseLifeFromCard: (next, target, amount, byPlayerId) => {
        const attacker = next.players.find((p) => p.id === byPlayerId);
        if (!attacker) return [];

        const events: GameEvent[] = [];
        for (let i = 0; i < amount; i++) {
          if (attacker.hand.length === 0) break;
          const { value, nextState } = nextRandom(next.rngState);
          next.rngState = nextState;
          const index = Math.floor(value * attacker.hand.length);
          const [stolenCardId] = attacker.hand.splice(index, 1);
          giveCardToPlayer(next.players, target, stolenCardId);
          events.push({ type: "CARD_STOLEN", playerId: target.id, fromPlayerId: attacker.id, cardId: stolenCardId });
          // Giai đoạn 5 (đợt 3) — nếu người bị El Gringo cướp (attacker) vừa hết
          // bài, VÀ chính họ là Suzy Lafayette, họ vẫn phải được rút bù ngay.
          events.push(...triggerHandEmptyHook(next, attacker));
        }
        return events;
      },
    },
  },

  paul_regret: {
    id: "paul_regret",
    name: "Paul Regret",
    bullets: 3,
    hooks: {
      modifyDistance: (distance, role) => (role === "target" ? distance + 1 : distance),
    },
  },

  rose_doolan: {
    id: "rose_doolan",
    name: "Rose Doolan",
    bullets: 4,
    hooks: {
      modifyDistance: (distance, role) => (role === "attacker" ? distance - 1 : distance),
    },
  },

  vulture_sam: {
    id: "vulture_sam",
    name: "Vulture Sam",
    bullets: 4,
    hooks: {
      onAnyDeath: (next, self, deadPlayer) => {
        const events: GameEvent[] = [];
        for (const cardId of [...deadPlayer.hand, ...deadPlayer.equipment]) {
          giveCardToPlayer(next.players, self, cardId);
          events.push({ type: "CARD_STOLEN", playerId: self.id, fromPlayerId: deadPlayer.id, cardId });
        }
        deadPlayer.hand = [];
        deadPlayer.equipment = [];
        return events;
      },
    },
  },

  willy_the_kid: {
    id: "willy_the_kid",
    name: "Willy the Kid",
    bullets: 4,
    bypassBangLimit: true,
    hooks: {},
  },

  slab_the_killer: {
    id: "slab_the_killer",
    name: "Slab the Killer",
    bullets: 4,
    hooks: {
      onOutgoingBang: () => 2,
    },
  },

  suzy_lafayette: {
    id: "suzy_lafayette",
    name: "Suzy Lafayette",
    bullets: 4,
    hooks: {
      onHandEmpty: (next, player) => {
        const cardId = drawTopCard(next);
        if (!cardId) return [];
        // Nếu lá rút được là Dynamite, giveCardToPlayer() tự xuống thẳng
        // trang bị (không vào tay) — tay Suzy có thể VẪN còn 0 lá sau "rút 1
        // lá" trong ca hiếm này. Chấp nhận như 1 hệ quả tự nhiên của luật
        // Dynamite (không tự rút bù thêm lần nữa), không coi là bug.
        giveCardToPlayer(next.players, player, cardId);
        return [{ type: "CARDS_DRAWN", playerId: player.id, count: 1 }];
      },
    },
  },

  pedro_ramirez: {
    id: "pedro_ramirez",
    name: "Pedro Ramirez",
    bullets: 4,
    canDrawFromDiscardPile: true,
    hooks: {},
  },

  lucky_duke: {
    id: "lucky_duke",
    name: "Lucky Duke",
    bullets: 4,
    hasLuckyDraw: true,
    hooks: {},
  },

  jesse_jones: {
    id: "jesse_jones",
    name: "Jesse Jones",
    bullets: 4,
    canStealFirstDrawCard: true,
    hooks: {},
  },

  kit_carlson: {
    id: "kit_carlson",
    name: "Kit Carlson",
    bullets: 4,
    canPeekTopThree: true,
    hooks: {},
  },

  calamity_janet: {
    id: "calamity_janet",
    name: "Calamity Janet",
    bullets: 4,
    hasBangMissedAlias: true,
    hooks: {},
  },

  sid_ketchum: {
    id: "sid_ketchum",
    name: "Sid Ketchum",
    bullets: 4,
    canSelfHeal: true,
    hooks: {},
  },

  // ----- Mở rộng Dodge City, mục C nhóm A (7 người dùng lại cơ chế có sẵn) -----

  pixie_pete: {
    id: "pixie_pete",
    name: "Pixie Pete",
    bullets: 3,
    hooks: {
      onDrawPhase: (next, player) => {
        let drawnCount = 0;
        for (let i = 0; i < 3; i++) {
          const card = drawTopCard(next);
          if (!card) break;
          giveCardToPlayer(next.players, player, card);
          drawnCount++;
        }
        return [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }];
      },
    },
  },

  bill_noface: {
    id: "bill_noface",
    name: "Bill Noface",
    bullets: 4,
    hooks: {
      onDrawPhase: (next, player) => {
        const count = 1 + (player.maxHp - player.hp);
        let drawnCount = 0;
        for (let i = 0; i < count; i++) {
          const card = drawTopCard(next);
          if (!card) break;
          giveCardToPlayer(next.players, player, card);
          drawnCount++;
        }
        return [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }];
      },
    },
  },

  greg_digger: {
    id: "greg_digger",
    name: "Greg Digger",
    bullets: 4,
    hooks: {
      // Caller (eliminatePlayer() trong reduce.ts) đã tự loại chính người vừa
      // chết ra khỏi vòng lặp gọi onAnyDeath — không cần tự kiểm tra lại
      // deadPlayer !== self ở đây (xem Vulture Sam, cùng khuôn).
      onAnyDeath: (_next, self) => {
        const restored = Math.min(2, self.maxHp - self.hp);
        if (restored <= 0) return [];
        self.hp += restored;
        return [{ type: "HP_RESTORED", playerId: self.id, amount: restored }];
      },
    },
  },

  herb_hunter: {
    id: "herb_hunter",
    name: "Herb Hunter",
    bullets: 4,
    hooks: {
      onAnyDeath: (next, self) => {
        let drawnCount = 0;
        for (let i = 0; i < 2; i++) {
          const card = drawTopCard(next);
          if (!card) break;
          giveCardToPlayer(next.players, self, card);
          drawnCount++;
        }
        if (drawnCount === 0) return [];
        return [{ type: "CARDS_DRAWN", playerId: self.id, count: drawnCount }];
      },
    },
  },

  pat_brennan: {
    id: "pat_brennan",
    name: "Pat Brennan",
    bullets: 4,
    canTakeEquipmentInsteadOfDraw: true,
    hooks: {},
  },

  chuck_wengam: {
    id: "chuck_wengam",
    name: "Chuck Wengam",
    bullets: 4,
    canPayLifeToDraw: true,
    hooks: {},
  },

  jose_delgado: {
    id: "jose_delgado",
    name: "José Delgado",
    bullets: 4,
    canDiscardEquipmentToDraw: true,
    hooks: {},
  },

  // ----- Mở rộng Dodge City, mục C nhóm B (4 người, hook mới nhưng độc lập) -----

  sean_mallory: {
    id: "sean_mallory",
    name: "Sean Mallory",
    bullets: 3,
    hooks: {
      modifyHandLimit: (defaultLimit) => (defaultLimit < 10 ? 10 : defaultLimit),
    },
  },

  tequila_joe: {
    id: "tequila_joe",
    name: "Tequila Joe",
    bullets: 4,
    doubleRevivalHp: true,
    hooks: {
      modifyHealAmount: (cardName, defaultAmount) => (cardName === "beer" ? defaultAmount * 2 : defaultAmount),
    },
  },

  elena_fuente: {
    id: "elena_fuente",
    name: "Elena Fuente",
    bullets: 3,
    hasAnyCardMissedAlias: true,
    canUseOwnEquipmentAsMissed: true,
    hooks: {},
  },

  apache_kid: {
    id: "apache_kid",
    name: "Apache Kid",
    bullets: 3,
    hooks: {
      isImmuneToCard: (cardId) => cardSuitRankFromId(cardId).suit === "diamonds",
    },
  },

  // ----- Mở rộng Dodge City, mục C nhóm C (3 người, phụ thuộc lẫn nhau) -----

  doc_holyday: {
    id: "doc_holyday",
    name: "Doc Holyday",
    bullets: 4,
    canDiscardTwoForBang: true,
    hooks: {},
  },

  molly_stark: {
    id: "molly_stark",
    name: "Molly Stark",
    bullets: 4,
    hooks: {
      onVoluntaryPlayOutOfTurn: (next, self, _cardName, context) => {
        if (context === "duel") {
          const pending = next.duelBangDrawPending;
          const count = pending && pending.playerId === self.id ? pending.count + 1 : 1;
          next.duelBangDrawPending = { playerId: self.id, count };
          return [];
        }
        const card = drawTopCard(next);
        if (!card) return [];
        giveCardToPlayer(next.players, self, card);
        return [{ type: "CARDS_DRAWN", playerId: self.id, count: 1 }];
      },
    },
  },

  belle_star: {
    id: "belle_star",
    name: "Belle Star",
    bullets: 4,
    disablesOthersEquipment: true,
    hooks: {},
  },

  vera_custer: {
    id: "vera_custer",
    name: "Vera Custer",
    bullets: 3,
    canBorrowCharacterAbilities: true,
    hooks: {},
  },

  // ----- Bộ mở rộng "custom_characters" — nhân vật TỰ CHẾ, xem House_Rule.txt -----

  elena_noir: {
    id: "elena_noir",
    name: "Elena Noir *ex",
    bullets: 3,
    canArmImmortality: true,
    hooks: {},
  },

  marcel_marcelo: {
    id: "marcel_marcelo",
    name: "Marcel Marcelo *ex",
    bullets: 4,
    canJailCompanion: true,
    hooks: {},
  },

  mary_rose: {
    id: "mary_rose",
    name: "Mary Rose *ex",
    bullets: 3,
    requiresTwoBangCardsToShoot: true,
    canReflectBangDamage: true,
    hooks: {},
  },
};

// Id nhân vật do từng BỘ MỞ RỘNG đóng góp (xem ExpansionId ở types.ts +
// EXPANSION_CARD_COUNTS ở cards.ts — cùng kiến trúc: setup.ts gộp danh sách
// của MỌI bộ đang bật cho ván). 16 nhân vật gốc (jourdonnais...sid_ketchum, ở
// trên) không thuộc bộ mở rộng nào nên KHÔNG xuất hiện trong map này — luôn
// có sẵn bất kể expansions đang bật gì. dodge_city liệt kê đúng 15 nhân vật ở
// khối "Mở rộng Dodge City, mục C" bên trên (3 nhóm A/B/C).
export const EXPANSION_CHARACTER_IDS: Record<ExpansionId, string[]> = {
  dodge_city: [
    "pixie_pete",
    "bill_noface",
    "greg_digger",
    "herb_hunter",
    "pat_brennan",
    "chuck_wengam",
    "jose_delgado",
    "sean_mallory",
    "tequila_joe",
    "elena_fuente",
    "apache_kid",
    "doc_holyday",
    "molly_stark",
    "belle_star",
    "vera_custer",
  ],
  custom_characters: ["elena_noir", "marcel_marcelo", "mary_rose"],
};

// ----- Hook/nhân vật còn lại, ĐỂ DÀNH cho các đợt 5.2 sau -----
//
// onDrawPhase (đã nối dây ở việc 5.2 đợt 2, xem handleDrawCards() trong
// reduce.ts) — Black Jack dùng được ngay vì KHÔNG có lựa chọn (tự động theo lá
// lật ra). Jesse Jones (đợt 5) + Kit Carlson (đợt 6) đã xong (xem bên dưới).
//
// Đủ 16/16 nhân vật kể từ đợt 7 (Calamity Janet + Sid Ketchum, xem bên dưới).
//
// Jourdonnais (Barrel ảo, xem virtualBarrel ở CharacterDefinition + đợt 2 ở
// trên) đã xong — hoá ra KHÔNG cần hook riêng, chỉ cần 1 field tĩnh cộng vào
// đúng công thức đếm Barrel có sẵn trong pushMissedReaction()/resolveDrawCheck()
// (reduce.ts).
//
// Slab the Killer (onOutgoingBang, đợt 3) đã xong — pushMissedReaction() tra
// hook này qua NGƯỜI ĐÁNH, gắn missesNeeded vào NEED_MISSED. Mỗi lượt Barrel/
// Jourdonnais khớp Cơ CHỈ tính là 1 Missed! (giảm missesNeeded đi 1, không tự
// né hết nếu vẫn còn thiếu) — xem đoạn xử lý trong resolveDrawCheck().
//
// Suzy Lafayette (onHandEmpty, đợt 3) đã xong — gắn ở MỌI nơi trong reduce.ts
// (đánh bài, bỏ bài thừa cuối lượt, bị Panic!/Cat Balou cướp/bắt bỏ, tự bỏ
// Missed!/Bang! khi đỡ Bang!/Indians!/Duel) VÀ ngay trong file này (El Gringo
// cướp bài của người khác) có 1 lá THẬT SỰ vừa rời khỏi 1 bàn tay đang có bài
// — xem triggerHandEmptyHook() ở trên. KHÔNG gắn ở 2 chỗ hand bị xoá sạch vì
// chết/bị phạt (eliminatePlayer()/hình phạt Cảnh sát trưởng trong reduce.ts) —
// 2 ca đó không nằm trong các tình huống file đặc tả liệt kê.
//
// Pedro Ramirez (canDrawFromDiscardPile, đợt 4) đã xong — đầu lượt được HỎI
// thật (NEED_PICK_DRAW_SOURCE, xem types.ts + handleDrawCards()/
// respondToPickDrawSource() trong reduce.ts), KHÔNG nhét lựa chọn thẳng vào
// action DRAW_CARDS (bàn lại với chủ dự án, đổi hướng so với đề xuất ban đầu).
// Đỉnh chồng bỏ vốn công khai nên không cần view.ts đụng gì. Chồng bỏ rỗng thì
// khỏi hỏi, rút thẳng bộ bài như bình thường.
//
// Lucky Duke (hasLuckyDraw, đợt 4) đã xong — hoá ra KHÔNG cần hook/pending gì,
// chỉ 1 field tĩnh: resolveDrawCheck() tự lật thêm 1 lá thứ 2 và áp logic
// "có lợi theo ngữ cảnh" (Barrel/Jail: khớp Cơ; Dynamite: KHÔNG khớp) đã CHỐT
// sẵn trong file đặc tả — không phải quyết định của người chơi nên không cần
// hỏi gì cả.
//
// Jesse Jones (canStealFirstDrawCard, đợt 5) đã xong — CẦN 2 PendingAction nối
// tiếp (NEED_PICK_DRAW_TARGET rồi NEED_GIVE_CARD_TO_PLAYER, xem types.ts +
// handleDrawCards()/respondToPickDrawTarget()/respondToGiveCardToPlayer()
// trong reduce.ts). "Bonus hỏi ai" là house rule KHÔNG có trong luật gốc —
// bàn lại với chủ dự án để chốt: CHÍNH JESSE được hỏi (không phải nạn nhân)
// có muốn để nạn nhân tự chọn lá đưa hay cướp ngẫu nhiên; nạn nhân CHỈ được
// hỏi tiếp (chọn lá cụ thể của CHÍNH mình, không lộ gì mới) khi Jesse chọn
// "để tự chọn". Hết giờ ở bước nạn nhân chọn lá → rút ngẫu nhiên thay họ.
//
// Kit Carlson (canPeekTopThree, đợt 6) đã xong — pending NEED_PICK_KEPT_CARDS
// (xem types.ts) là PENDING DUY NHẤT chứa thông tin ẨN (3 lá vừa lật riêng),
// nên đây là lần ĐẦU TIÊN đụng tới view.ts (quy tắc 6) kể từ khi hệ thống
// pending ra đời — viewFor() phải thay `cards` bằng null với người xem không
// phải Kit Carlson (xem PendingActionView trong view.ts). Timeout/mặc định:
// giữ 2 lá ĐẦU, bỏ lá thứ 3 — ĐÂY LÀ HOUSE RULE, khác bản gốc BANG! (bản gốc
// đặt lá thứ 3 TRỞ LẠI lên đỉnh bộ bài, bản này bỏ vào chồng bài bỏ luôn).
//
// Calamity Janet (hasBangMissedAlias, đợt 7) đã xong — actsAsBang()/
// actsAsMissed() (reduce.ts) là 2 hàm dùng chung, sửa ĐÚNG 4 chỗ đang so
// khớp cứng tên lá "bang"/"missed": dispatch trong handlePlayCard() (đánh chủ
// động lá "missed" của Janet -> định tuyến vào playBang()), respondToMissed(),
// respondToDuel(), respondDiscardOrDamage() (Indians!). File đặc tả không nêu
// rõ Indians! nhưng "MỌI hàm kiểm tra người này có lá Bang!/Missed!" đủ bao
// quát nên áp dụng luôn — không cần hỏi lại. Không đổi gì trong playBang() —
// dispatch đã định tuyến đúng trước khi vào đó.
//
// Sid Ketchum (canSelfHeal, đợt 7) đã xong — action mới USE_ABILITY (xem
// types.ts + handleUseAbility() trong reduce.ts), KHÔNG qua assertCurrentPlayer/
// kiểm tra pending như mọi action khác, dùng được bất cứ lúc nào. Chủ dự án
// xác nhận: dùng lúc KHÔNG PHẢI lượt/phản ứng của mình thì CHỈ đổi hand/
// discardPile/hp của chính Sid, KHÔNG được can thiệp vào cơ chế tính giờ của
// bất kỳ ai — sửa `room.ts`'s scheduleDeadline() nhận thêm "ai vừa hành động"
// để giữ nguyên đồng hồ đang chạy nếu người đó khác người đang được tính giờ
// (xem ghi chú trong room.ts).
//
// Mở rộng Dodge City, mục C nhóm A (7 người dùng lại cơ chế có sẵn) đã xong:
// Pixie Pete/Bill Noface (onDrawPhase, tự động không cần hỏi gì — cùng khuôn
// Black Jack); Greg Digger/Herb Hunter (onAnyDeath, cùng khuôn Vulture Sam —
// caller đã tự loại trừ chính người vừa chết); Pat Brennan
// (canTakeEquipmentInsteadOfDraw, CẦN PendingAction mới NEED_PICK_DRAW_OR_EQUIPMENT,
// cùng khuôn Pedro Ramirez/Jesse Jones); Chuck Wengam (canPayLifeToDraw) +
// José Delgado (canDiscardEquipmentToDraw) đều dùng chung action USE_ABILITY
// với Sid Ketchum nhưng CHỈ trong lượt của chính mình (khác Sid Ketchum dùng
// được bất cứ lúc nào) — xem handleUseAbility() trong reduce.ts, tự nhánh
// theo field tĩnh nào có mặt trên CharacterDefinition.
//
// Mở rộng Dodge City, mục C nhóm B (4 người, hook mới nhưng độc lập) đã xong:
// Sean Mallory (modifyHandLimit, dùng qua getHandLimit() ở trên — CHUNG cho
// reduce.ts lẫn room.ts); Tequila Joe (modifyHealAmount CHỈ áp dụng ở
// playBeer(), + doubleRevivalHp RIÊNG cho cơ chế hồi sinh tự động, không qua
// modifyHealAmount); Elena Fuente (hasAnyCardMissedAlias mở rộng
// actsAsMissed() sang MỌI lá trên tay, + canUseOwnEquipmentAsMissed cho phép
// dùng CẢ trang bị của chính mình làm Missed! ngay lập tức, không cần chờ 1
// lượt như nhóm "delayed" thường — gộp vào isUsableDelayedMissedEquipment()
// đã có sẵn, đổi tên hàm cho đúng nghĩa mới); Apache Kid (isImmuneToCard, CHỈ
// tra chất lá — gọi tại pushMissedReaction()/applyPanicEffect()/
// pushDiscardFromZoneReaction()/playJail() trong reduce.ts, KHÔNG áp dụng cho
// Duel (không đi qua 3 hàm trên) hay Indians! (đã hỏi chủ dự án, CHỐT không
// tính là "tương đương Bang!").
//
// Mở rộng Dodge City, mục C nhóm C (3 người, phụ thuộc lẫn nhau) đã xong:
// Molly Stark (onVoluntaryPlayOutOfTurn, 2 ngữ cảnh "immediate"/"duel" — xem
// ghi chú đầy đủ ở khai báo hook trong CharacterHooks); Doc Holyday
// (canDiscardTwoForBang, dùng chung USE_ABILITY với Sid Ketchum/Chuck Wengam/
// José Delgado nhưng CHỈ trong lượt chính mình, cần thêm `targetId` vào
// action USE_ABILITY — miễn nhiễm Apache Kid CHỈ khi CẢ 2 lá bỏ ra đều chất
// Rô, khác luật chung "1 lá Rô là đủ" của isImmuneToCard, xử lý riêng ở
// useDocHolydayShot() trong reduce.ts, không tái dùng logic chung của
// pushMissedReaction()); Belle Star (disablesOthersEquipment, đọc qua
// getEffectiveEquipment() ở trên — dùng ở computeDistance() (distance.ts, chỉ
// Mustang/Hideout của MỤC TIÊU — Scope/Binocular của người bắn luôn tự đọc,
// không cần đổi), pushMissedReaction() (Barrel thật của mục tiêu — Barrel ảo
// Jourdonnais không đổi), isEquipmentUsableAsMissed() (trang bị của người
// ĐANG PHẢN ỨNG). KHÔNG áp dụng cho Panic!/Cat Balou (cướp/bắt bỏ bài vẫn lấy
// được trang bị "vô hiệu hoá" bình thường — chỉ HIỆU ỨNG tắt, lá không biến
// mất khỏi sân) hay bất kỳ chỗ nào chỉ tự đọc equipment của CHÍNH người đang
// hành động (luôn là lượt của chính họ, không bao giờ bị chính mình vô hiệu hoá).
//
// Mở rộng Dodge City, mục C — Vera Custer (nhân vật cuối cùng, mục 9 file đặc
// tả) đã xong — cơ chế uỷ quyền toàn hệ thống hook: `canBorrowCharacterAbilities`
// (field tĩnh, chỉ cô có) + `getEffectiveCharacterId()`/`getEffectiveCharacterHooks()`/
// `getEffectiveCharacterDefinition()` (3 hàm TRUNG TÂM ở trên) — MỌI hook/field
// tĩnh trong file này VÀ mọi lời gọi `getCharacterHooks()`/`getCharacterDefinition()`
// rải rác trong `reduce.ts`/`distance.ts` (đã rà soát ~30 điểm trước khi code,
// đúng quy tắc CLAUDE.md "kiến trúc lớn → bàn trước") đều đổi sang tra qua 3
// hàm này thay vì đọc thẳng `characterId`. Nhờ vậy MỌI nhân vật khác (kể cả
// Apache Kid/Belle Star, đã hỏi lại và CHỐT không có ngoại lệ nào bị chặn) tự
// động "mượn được" mà không cần code riêng thêm cho từng nhân vật. CHỈ mượn
// hook/field tĩnh — `computeStartingHp()` ở đầu file LUÔN dùng characterId
// THẬT (không đụng bullets/maxHp, đã chốt). Cơ chế "chọn mượn đầu lượt"
// (PendingAction `NEED_PICK_BORROWED_CHARACTER`) đẩy Ở BƯỚC ĐẦU TIÊN của lượt
// cô ta, TRƯỚC CẢ draw!-check Dynamite/Jail (đã hỏi lại và chốt — xem
// `applyTurnStartChecks()` trong `reduce.ts`) — vì lựa chọn này có thể ảnh
// hưởng tới CHÍNH draw!-check đó (vd mượn Lucky Duke's hasLuckyDraw). Hết giờ
// (15 giây, đúng `REACTIVE_MS` sẵn có — không cần hằng số riêng) tự chọn NGẪU
// NHIÊN 1 người còn sống có nhân vật (bắt buộc chọn, không có lựa chọn "không
// mượn ai" — xem `room.ts`'s `buildReactiveTimeoutAction()`).
