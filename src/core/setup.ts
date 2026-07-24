// Tạo state ban đầu cho 1 ván đấu 4-7 người, theo đúng luật gốc BANG!
// (chưa có nhân vật/skill riêng — mọi người 4 máu, xem CLAUDE.md).

import type { CardName } from "./cards";
import { buildDeck } from "./cards";
import { shuffle } from "./rng";
import type { GameState, PlayerState, Role } from "./types";

export interface RuleOptions {
  cardCounts?: Partial<Record<CardName, number>>; // tuỳ chỉnh số lượng bài, để dành cho house rules sau này
}

const BASE_HP = 4; // ai cũng 4 máu (chưa có nhân vật)
const SHERIFF_BONUS_HP = 1;

// Danh sách vai theo số người chơi, đúng phân bổ luật gốc BANG! (chỉ 4-7 người).
const ROLE_SETS: Record<number, Role[]> = {
  4: ["sheriff", "renegade", "outlaw", "outlaw"],
  5: ["sheriff", "renegade", "outlaw", "outlaw", "deputy"],
  6: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy"],
  7: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"],
};

export function setupGame(
  playerIds: string[],
  seed: number,
  options: RuleOptions = {}
): GameState {
  const roleSet = ROLE_SETS[playerIds.length];
  if (!roleSet) {
    throw new Error(
      `Số người chơi không hợp lệ: ${playerIds.length}. Chỉ hỗ trợ 4-7 người ở bản cơ bản.`
    );
  }

  // Xáo vai trước, lấy nextState để xáo bài tiếp — cùng seed luôn ra đúng 1 kết quả
  // duy nhất cho cả vai lẫn bài.
  const { result: shuffledRoles, nextState: stateAfterRoles } = shuffle(roleSet, seed);

  const deck = buildDeck(options.cardCounts);
  const { result: shuffledDeck, nextState: stateAfterDeck } = shuffle(deck, stateAfterRoles);

  // Rút bài từ đỉnh bộ bài (phần tử cuối mảng), chia từng người một, mỗi người
  // rút số lá = đúng số máu hiện có.
  const remainingDeck = [...shuffledDeck];

  const players: PlayerState[] = playerIds.map((id, i) => {
    const role = shuffledRoles[i];
    const hp = role === "sheriff" ? BASE_HP + SHERIFF_BONUS_HP : BASE_HP;

    const hand: string[] = [];
    for (let n = 0; n < hp; n++) {
      const card = remainingDeck.pop();
      if (card) hand.push(card.id);
    }

    return {
      id,
      name: id, // tên hiển thị thật do server/client gán sau, ở đây tạm dùng id
      role,
      hp,
      maxHp: hp,
      hand,
      equipment: [],
      alive: true,
    };
  });

  const sheriffIndex = players.findIndex((player) => player.role === "sheriff");

  return {
    players,
    deck: remainingDeck.map((card) => card.id),
    discardPile: [],
    pending: [],
    currentPlayerIndex: sheriffIndex, // Sheriff luôn đi lượt đầu tiên
    turnPhase: "draw",
    rngState: stateAfterDeck,
    winner: null,
  };
}
