// Giai đoạn 5, việc 5.1 — hệ thống hook cho nhân vật. Xem
// NHAN-VAT-BANG-CO-BAN.txt để biết đủ 16 nhân vật dự tính và toàn bộ 9 loại
// hook. File này CHỈ dựng khung — CHƯA có nhân vật thật nào, `CHARACTERS`
// rỗng (việc 5.2 mới điền dữ liệu).
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
// DÀNH cho việc 5.2, xây cùng lúc với đúng nhân vật cần nó — cố tình KHÔNG
// đoán trước chữ ký hàm ở đây, đoán sai sẽ phải sửa lại tốn công hơn chờ có
// ví dụ thật để đối chiếu.

import type { GameEvent, GameState, PlayerState } from "./types";

export interface CharacterHooks {
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
  // Muốn "nhận" bài thì hook PHẢI tự dọn deadPlayer.hand/deadPlayer.equipment
  // — không dọn thì bài vẫn rơi vào chồng bỏ như bình thường NGAY SAU hook,
  // không mất cũng không nhân đôi. Vulture Sam: chuyển hết bài người chết
  // (kể cả Dynamite chưa nổ) về tay chính mình.
  onAnyDeath?(next: GameState, deadPlayer: PlayerState): GameEvent[];
}

export interface CharacterDefinition {
  id: string;
  name: string; // tên nhân vật — HIỂN THỊ RIÊNG với tên người chơi (xem ui.ts, việc bổ sung sau 4.6)
  hooks: CharacterHooks;
}

// RỖNG ở việc 5.1 — việc 5.2 mới điền đủ 16 nhân vật (xem
// NHAN-VAT-BANG-CO-BAN.txt). Cố tình KHÔNG đóng băng (không Object.freeze) —
// test cắm 1 nhân vật giả vào thẳng registry này để kiểm tra dây nối chạy
// đúng, rồi tự dọn lại (xem test/characters.test.ts) — sản phẩm thật (5.2)
// chỉ nên gán 1 lần lúc module load, không mutate lúc chạy.
export const CHARACTERS: Record<string, CharacterDefinition> = {};

export function getCharacterHooks(characterId: string | null): CharacterHooks {
  if (!characterId) return {};
  return CHARACTERS[characterId]?.hooks ?? {};
}

// ----- 5 hook còn lại, ĐỂ DÀNH cho việc 5.2 (chưa có chữ ký hàm) -----
//
// onDrawPhase       Thay hẳn pha rút bài đầu lượt (Black Jack/Jesse Jones/
//                    Kit Carlson/Pedro Ramirez) — 3 trong 4 người cần thêm 1
//                    loại PendingAction mới (bước chờ chọn nguồn rút/lá giữ).
// onDrawCheck       Thay cách lật bài kiểm tra (Lucky Duke: lật 2 chọn 1).
// onOutgoingBang    Đổi yêu cầu né Bang! mình bắn ra (Slab the Killer: cần 2
//                    Missed! thay vì 1, áp cả cho Gatling).
// cardAlias         Coi lá bài này như lá khác (Calamity Janet: Bang! <->
//                    Missed!) — đụng NHIỀU chỗ đang so khớp tên lá rải rác
//                    trong reduce.ts, cần bọc qua 1 hàm dùng chung trước.
// activatedAbility  Kỹ năng bấm CHỦ ĐỘNG, bất cứ lúc nào kể cả ngoài lượt
//                    mình (Sid Ketchum) — KHÔNG khớp mô hình "lượt của ai/
//                    đang chờ ai phản hồi" hiện có, cần thiết kế riêng hẳn 1
//                    luồng action mới, không chỉ là 1 hook đơn giản.
