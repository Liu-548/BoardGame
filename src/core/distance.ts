// Khoảng cách & tầm bắn (việc 1.12).
//
// "Khoảng cách vòng tròn" = số ghế ngắn nhất giữa 2 người, đi theo 1 trong 2
// chiều quanh bàn — CHỈ đếm người còn sống (người chết coi như ghế biến mất,
// vòng tròn co lại quanh những người còn sống). Sau đó cộng thêm hiệu ứng
// Scope/Mustang để ra "khoảng cách hiệu dụng", dùng để so với tầm súng (Bang!)
// hay kiểm tra "đúng khoảng cách 1" (Panic!).
//
// Scope/Mustang KHÔNG đổi khoảng cách vòng tròn thật — chỉ đổi cách 1 người
// NHÌN THẤY khoảng cách đó (luật gốc BANG!): Scope giúp người đánh nhìn người
// khác gần hơn 1; Mustang khiến người khác nhìn mình xa hơn 1.

import { cardNameFromId, DEFAULT_WEAPON_RANGE, isWeaponCardName, WEAPON_RANGES } from "./cards";
import { getCharacterHooks } from "./characters";
import type { PlayerState } from "./types";

// Tầm bắn của súng người chơi đang trang bị. Không có súng nào thì trả về
// DEFAULT_WEAPON_RANGE (súng ngầm định).
export function getWeaponRange(player: PlayerState): number {
  for (const cardId of player.equipment) {
    const name = cardNameFromId(cardId);
    if (isWeaponCardName(name)) {
      return WEAPON_RANGES[name];
    }
  }
  return DEFAULT_WEAPON_RANGE;
}

function hasEquipment(player: PlayerState, cardName: string): boolean {
  return player.equipment.some((id) => cardNameFromId(id) === cardName);
}

// Khoảng cách vòng tròn thô giữa 2 người — chỉ tính người còn sống, không liên
// quan Scope/Mustang.
function seatDistance(players: PlayerState[], fromId: string, toId: string): number {
  const aliveInOrder = players.filter((p) => p.alive);
  const fromIndex = aliveInOrder.findIndex((p) => p.id === fromId);
  const toIndex = aliveInOrder.findIndex((p) => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) {
    throw new Error("Không tính được khoảng cách với người chơi đã chết hoặc không tồn tại");
  }

  const total = aliveInOrder.length;
  const diff = Math.abs(fromIndex - toIndex);
  return Math.min(diff, total - diff);
}

// Khoảng cách HIỆU DỤNG từ `fromId` (người đánh) tới `toId` (mục tiêu): khoảng
// cách vòng tròn, trừ 1 nếu `fromId` có Scope, cộng 1 nếu `toId` có Mustang.
// Tối thiểu là 1, dù cộng dồn nhiều hiệu ứng cũng không thể về 0 hay âm.
//
// `extraBaseDistance` (Giai đoạn 5, việc 5.3 — house rule "extra_distance"):
// cộng thêm vào khoảng cách vòng tròn THÔ, TRƯỚC Scope/Mustang/hook nhân vật —
// mặc định 0 (không đổi gì so với trước). Nhận số thuần thay vì đọc thẳng
// GameState.houseRules để hàm này KHÔNG phải import gì từ types.ts ngoài
// PlayerState — chỗ gọi (reduce.ts) tự tra houseRules rồi truyền số vào.
export function computeDistance(
  players: PlayerState[],
  fromId: string,
  toId: string,
  extraBaseDistance: number = 0
): number {
  const attacker = players.find((p) => p.id === fromId);
  const target = players.find((p) => p.id === toId);
  if (!attacker || !target) {
    throw new Error("Không tính được khoảng cách với người chơi không tồn tại");
  }

  let distance = seatDistance(players, fromId, toId) + extraBaseDistance;
  if (hasEquipment(attacker, "scope")) distance -= 1;
  if (hasEquipment(target, "mustang")) distance += 1;

  // Giai đoạn 5 (Paul Regret/Rose Doolan, xem core/characters.ts) — cộng dồn
  // SAU Ống nhắm/Ngựa Mustang thật, đúng công thức chung, không tách riêng.
  const attackerHooks = getCharacterHooks(attacker.characterId);
  if (attackerHooks.modifyDistance) distance = attackerHooks.modifyDistance(distance, "attacker");
  const targetHooks = getCharacterHooks(target.characterId);
  if (targetHooks.modifyDistance) distance = targetHooks.modifyDistance(distance, "target");

  return Math.max(1, distance);
}
