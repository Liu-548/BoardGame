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
import type { GameEvent, GameState, PlayerState } from "./types";

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
}

// Giai đoạn 5 (đợt 3), Suzy Lafayette — gọi ở MỌI nơi trong reduce.ts (và ngay
// trong file này, xem el_gringo bên dưới) có 1 lá THẬT SỰ vừa rời khỏi 1 bàn
// tay đang có bài (splice thành công từ hand không rỗng) — an toàn gọi vô điều
// kiện: nếu tay còn bài (>0) hoặc nhân vật không có onHandEmpty thì trả về
// mảng rỗng, không có gì xảy ra.
export function triggerHandEmptyHook(next: GameState, player: PlayerState): GameEvent[] {
  if (player.hand.length !== 0) return [];
  const hook = getCharacterHooks(player.characterId).onHandEmpty;
  if (!hook) return [];
  return hook(next, player);
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
};

// ----- Hook/nhân vật còn lại, ĐỂ DÀNH cho các đợt 5.2 sau -----
//
// onDrawPhase (đã nối dây ở việc 5.2 đợt 2, xem handleDrawCards() trong
// reduce.ts) — Black Jack dùng được ngay vì KHÔNG có lựa chọn (tự động theo lá
// lật ra). 2 người còn lại (Jesse Jones/Kit Carlson) vẫn để dành vì CÓ lựa
// chọn thật SAU KHI đã biết thông tin (tay người khác/3 lá vừa lật) — không
// đủ để trả lời ngay trong 1 action như Pedro Ramirez, cần PendingAction mới
// riêng cho từng người:
//   Jesse Jones     chọn rút lá 1 từ bộ bài hay từ tay 1 người khác — CÒN có
//                    bonus hỏi tiếp người bị lấy (tự chọn lá đưa hay ngẫu
//                    nhiên), nên cần TỚI 2 bước chờ nối tiếp nhau.
//   Kit Carlson     xem 3 lá trên cùng, giữ 2, bỏ 1 vào chồng bỏ — pending
//                    phải lưu tạm 3 lá đó, và viewFor() (quy tắc 6) phải chỉ
//                    lộ 3 lá này cho ĐÚNG Kit Carlson, không phải mọi người
//                    (khác NEED_PICK_STORE_CARD — General Store vốn công khai
//                    cho cả bàn) — đụng tới view.ts, không chỉ reduce.ts.
//
// cardAlias         Coi lá bài này như lá khác (Calamity Janet: Bang! <->
//                    Missed!) — đụng NHIỀU chỗ đang so khớp tên lá rải rác
//                    trong reduce.ts, cần bọc qua 1 hàm dùng chung trước.
// activatedAbility  Kỹ năng bấm CHỦ ĐỘNG, bất cứ lúc nào kể cả ngoài lượt
//                    mình (Sid Ketchum) — KHÔNG khớp mô hình "lượt của ai/
//                    đang chờ ai phản hồi" hiện có, cần thiết kế riêng hẳn 1
//                    luồng action mới, không chỉ là 1 hook đơn giản.
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
