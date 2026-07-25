// Dynamite gắn vào sân theo cách ĐẶC BIỆT (mục 8 file luật): tự động xuống sân
// ngay khi lọt vào tay ai đó — rút bài, chia lúc setup, Stagecoach/Wells
// Fargo/General Store, hay bất kỳ đường nào khác — không bao giờ nằm trên tay.
// MỌI nơi đưa bài vào tay một người phải gọi giveCardToPlayer() thay vì tự
// player.hand.push(cardId), để không bao giờ bỏ sót ca Dynamite.

import { cardNameFromId } from "./cards";
import type { PlayerState } from "./types";

export function giveCardToPlayer(players: PlayerState[], player: PlayerState, cardId: string): void {
  if (cardNameFromId(cardId) === "dynamite") {
    attachDynamite(players, player, cardId);
    return;
  }
  player.hand.push(cardId);
}

// Dynamite ở sân, draw! đầu lượt không nổ → chuyển cho người kế tiếp (mục 8:
// "LOGIC CHUYỂN"). Tìm người ĐẦU TIÊN còn sống chưa có Dynamite, bắt đầu từ
// người kế tiếp `holder` — có thể quay vòng lại chính `holder` nếu ai khác
// cũng đã có Dynamite (chỉ xảy ra với bộ bài tuỳ chỉnh nhiều hơn 1 Dynamite).
export function transferDynamiteToNextPlayer(players: PlayerState[], holder: PlayerState): void {
  const dynamiteIndex = holder.equipment.findIndex((id) => cardNameFromId(id) === "dynamite");
  const [dynamiteId] = holder.equipment.splice(dynamiteIndex, 1);

  const holderIndex = players.findIndex((p) => p.id === holder.id);
  const recipient = findFirstAliveWithoutDynamiteFrom(players, holderIndex + 1);
  recipient.equipment.push(dynamiteId);
}

// Dynamite mới vào tay `owner`: ưu tiên gắn cho chính họ; nếu đã có sẵn 1
// Dynamite rồi thì mới chạy logic tìm chỗ trống (bắt đầu từ người kế tiếp).
function attachDynamite(players: PlayerState[], owner: PlayerState, cardId: string): void {
  const ownerIndex = players.findIndex((p) => p.id === owner.id);
  const holder = findFirstAliveWithoutDynamiteFrom(players, ownerIndex);
  holder.equipment.push(cardId);
}

function findFirstAliveWithoutDynamiteFrom(players: PlayerState[], startIndex: number): PlayerState {
  const hasDynamite = (p: PlayerState) => p.equipment.some((id) => cardNameFromId(id) === "dynamite");
  for (let step = 0; step < players.length; step++) {
    const candidate = players[(startIndex + step) % players.length];
    if (candidate.alive && !hasDynamite(candidate)) return candidate;
  }
  // Không thể xảy ra ở ván bình thường: số Dynamite luôn ít hơn số người còn
  // sống (xem mục 8 file luật) — nên luôn còn ít nhất 1 chỗ trống.
  throw new Error("Không tìm được chỗ trống cho Dynamite (số Dynamite phải luôn ít hơn số người còn sống)");
}
