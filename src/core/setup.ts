// Tạo state ban đầu cho 1 ván đấu 4-8 người (luật gốc BANG!), hoặc 2/3 người
// (biến thể riêng của dự án, xem LO-TRINH.md).

import type { CardName } from "./cards";
import { buildDeck } from "./cards";
import { CHARACTERS, computeStartingHp, getCharacterDefinition } from "./characters";
import { giveCardToPlayer } from "./equipment";
import { applyTurnStartChecks } from "./reduce";
import { shuffle } from "./rng";
import type { CharacterChoice, GameState, HouseRuleId, PlayerState, Role } from "./types";

export interface RuleOptions {
  cardCounts?: Partial<Record<CardName, number>>; // tuỳ chỉnh số lượng bài, để dành cho house rules sau này
  // Giai đoạn 5, việc 5.3 — luật bổ sung chủ phòng BẬT cho riêng ván này (xem
  // HouseRuleId ở types.ts). Mặc định [] = đúng luật gốc, không đổi gì.
  houseRules?: HouseRuleId[];
  // Giai đoạn 5, việc 5.2 (đợt 1) — gán THẲNG nhân vật cho từng người chơi
  // theo playerId, BỎ QUA HẲN bước "phát 2 lá, tự chọn" bên dưới — chỉ để có
  // nhân vật thật mà thử/test nhanh (đa số test hiện có dùng cách này).
  // playerId nào không có trong bản đồ này thì characterId vẫn null. Có
  // characterAssignments thì dealCharacterCards (dưới) bị BỎ QUA, dù có bật.
  characterAssignments?: Record<string, string>;
  // Cơ chế THẬT theo đúng luật gốc: phát 2 lá nhân vật úp cho MỖI người, tự
  // xem rồi chọn giữ 1 (xem CharacterChoice ở types.ts + CHOOSE_CHARACTER/
  // FINALIZE_CHARACTER_SELECTION ở reduce.ts). Mặc định TẮT (false/không có)
  // — room.ts/main.ts hiện CHƯA bật cờ này (chưa có màn hình chọn nhân vật
  // trên giao diện), nên ván hotseat/qua mạng thật KHÔNG đổi gì so với
  // trước. Chỉ dùng được qua code/test cho tới khi làm xong màn hình chọn.
  dealCharacterCards?: boolean;
}

// Danh sách vai theo số người chơi, đúng phân bổ luật gốc BANG! (4-8 người —
// biến thể 8 người, xem LO-TRINH.md: giống 7 người mặc định, cộng thêm 1 Kẻ
// phản bội nữa. win.ts đã sẵn sàng cho nhiều Renegade cùng lúc từ trước, xem
// test "Sheriff chết, còn 2 Renegade sống" trong test/death.test.ts).
const ROLE_SETS: Record<number, Role[]> = {
  4: ["sheriff", "renegade", "outlaw", "outlaw"],
  5: ["sheriff", "renegade", "outlaw", "outlaw", "deputy"],
  6: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy"],
  7: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"],
  8: ["sheriff", "renegade", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"],
};

// Biến thể 2 người (xem LO-TRINH.md) — KHÔNG chia vai, `role: null` cho cả 2
// (kiểu dữ liệu đã tính trước từ Giai đoạn 1, xem PlayerState.role ở
// types.ts). Giết người kia là thắng, không theo phe nào cả — xem
// checkWinCondition() trong win.ts (kiểm `role === null` khắp bàn để biết
// đang ở chế độ này). Không có Sheriff nên không có ai "đi trước theo luật" —
// CHỐT đơn giản: người đầu tiên trong danh sách (ghế đầu) đi trước.
function isDuelMode(playerIds: string[]): boolean {
  return playerIds.length === 2;
}

// Biến thể 3 người (xem LO-TRINH.md) — vòng tròn săn đuổi CÔNG KHAI: cảnh
// sát (thường, KHÁC Sheriff — không kế thừa luật phụ nào) săn tội phạm, tội
// phạm săn kẻ phản bội, kẻ phản bội săn cảnh sát. Giết ĐÚNG mục tiêu của
// mình thì thắng ngay (xem HUNT_CIRCLE trong win.ts) — vì cả 3 vai CÔNG
// KHAI ngay từ đầu (view.ts's viewRole()), ai cũng tự biết chính xác mục
// tiêu của mình, không cần cơ chế "tiết lộ mục tiêu" riêng.
const HUNT_ROLES: Role[] = ["police", "criminal", "traitor"];
function isHuntMode(playerIds: string[]): boolean {
  return playerIds.length === 3;
}

export function setupGame(
  playerIds: string[],
  seed: number,
  options: RuleOptions = {}
): GameState {
  const duel = isDuelMode(playerIds);
  const hunt = isHuntMode(playerIds);
  const roleSet: (Role | null)[] | undefined = duel
    ? [null, null]
    : hunt
      ? HUNT_ROLES
      : ROLE_SETS[playerIds.length];
  if (!roleSet) {
    throw new Error(
      `Số người chơi không hợp lệ: ${playerIds.length}. Chỉ hỗ trợ 2, 3, hoặc 4-8 người ở bản cơ bản.`
    );
  }

  // Xáo vai trước, lấy nextState để xáo bài tiếp — cùng seed luôn ra đúng 1 kết quả
  // duy nhất cho cả vai lẫn bài. 2 người thì "xáo" 2 phần tử null với nhau
  // không có ý nghĩa gì, nhưng vẫn gọi shuffle() để rngState tiến đúng 1 bước
  // GIỐNG HỆT đường 4-8 người — tránh 2 đường có "hình dạng" rngState khác
  // nhau chỉ vì số nhánh gọi shuffle() không đều.
  const { result: shuffledRoles, nextState: stateAfterRoles } = shuffle(roleSet, seed);

  const deck = buildDeck(options.cardCounts);
  const { result: shuffledDeck, nextState: stateAfterDeck } = shuffle(deck, stateAfterRoles);

  // dealCharacterCards CHỈ áp dụng khi KHÔNG có characterAssignments (2 cách
  // gán nhân vật loại trừ nhau — xem ghi chú ở RuleOptions).
  const useCharacterSelection = options.dealCharacterCards === true && !options.characterAssignments;

  // Xáo bộ bài nhân vật (toàn bộ registry CHARACTERS, đúng luật gốc — bản cơ
  // bản dùng hết 16 lá, người chơi càng ít thì càng dư nhiều, số dư không
  // dùng tới trong ván này). Phát 2 lá LIÊN TIẾP cho từng người theo đúng thứ
  // tự ghế ngồi (playerIds), giống cách chia bài tay bên dưới.
  let characterOptionsByPlayer: Record<string, [string, string]> = {};
  let rngStateAfterCharacterDeck = stateAfterDeck;
  if (useCharacterSelection) {
    const characterIds = Object.keys(CHARACTERS);
    if (characterIds.length < playerIds.length * 2) {
      throw new Error(
        `Không đủ nhân vật trong registry (${characterIds.length}) để phát 2 lá cho mỗi người trong ${playerIds.length} người chơi`
      );
    }
    const { result: shuffledCharacters, nextState } = shuffle(characterIds, stateAfterDeck);
    rngStateAfterCharacterDeck = nextState;
    characterOptionsByPlayer = Object.fromEntries(
      playerIds.map((id, i) => [id, [shuffledCharacters[i * 2], shuffledCharacters[i * 2 + 1]] as [string, string]])
    );
  }

  // Dựng đủ danh sách người chơi TRƯỚC (tay rỗng), rồi mới chia bài — cần vậy vì
  // Dynamite tự xuống sân ngay lúc chia (mục 8 file luật: "được phát lúc
  // setup" cũng tính), mà logic chuyển Dynamite khi đụng lá thứ 2 cần thấy
  // được cả bàn, không chỉ người đang được chia.
  const players: PlayerState[] = playerIds.map((id, i) => {
    const role = shuffledRoles[i];

    // Đang chờ chọn nhân vật (useCharacterSelection) — CHƯA biết máu/bài tay,
    // để tạm hp/maxHp = 0, hand = []. finishCharacterSelection() (reduce.ts)
    // mới thật sự tính máu + chia bài, SAU KHI mọi người đã chọn xong.
    if (useCharacterSelection) {
      return { id, name: id, role, hp: 0, maxHp: 0, hand: [], equipment: [], alive: true, characterId: null };
    }

    const characterId = options.characterAssignments?.[id] ?? null;
    if (characterId && !getCharacterDefinition(characterId)) {
      throw new Error(`Không tìm thấy nhân vật "${characterId}" trong registry CHARACTERS`);
    }
    const hp = computeStartingHp(role, characterId);

    return {
      id,
      name: id, // tên hiển thị thật do server/client gán sau, ở đây tạm dùng id
      role,
      hp,
      maxHp: hp,
      hand: [],
      equipment: [],
      alive: true,
      characterId,
    };
  });

  // Rút bài từ đỉnh bộ bài (phần tử cuối mảng), chia từng người một, mỗi người
  // rút số lá = đúng số máu hiện có. Bỏ qua hẳn bước này nếu còn đang chờ
  // chọn nhân vật — chưa biết máu thì chưa chia được, finishCharacterSelection()
  // sẽ tự làm việc này sau.
  const remainingDeck = [...shuffledDeck];
  if (!useCharacterSelection) {
    for (const player of players) {
      for (let n = 0; n < player.hp; n++) {
        const card = remainingDeck.pop();
        if (card) giveCardToPlayer(players, player, card.id);
      }
    }
  }

  // Biến thể 2/3 người không có Sheriff — người đầu tiên trong danh sách đi
  // trước (xem isDuelMode()/isHuntMode() ở trên).
  const firstPlayerIndex = duel || hunt ? 0 : players.findIndex((player) => player.role === "sheriff");

  const characterSelection: CharacterChoice[] | null = useCharacterSelection
    ? playerIds.map((id) => ({ playerId: id, options: characterOptionsByPlayer[id], chosen: null }))
    : null;

  const state: GameState = {
    players,
    deck: remainingDeck.map((card) => card.id),
    discardPile: [],
    pending: [],
    currentPlayerIndex: firstPlayerIndex, // Sheriff đi trước (4-8 người); ghế đầu đi trước (2 người, không có Sheriff)
    turnPhase: "draw",
    rngState: rngStateAfterCharacterDeck,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection,
    houseRules: options.houseRules ?? [],
    cardNamesPlayedThisTurn: [],
  };

  // Lượt đầu tiên cũng phải qua Bước 0 (mục 4): nếu Sheriff (hoặc ai đi lượt
  // đầu ở chế độ sau này) chẳng may được CHIA Dynamite ở trên, phải kiểm tra
  // ngay — không có lượt nào "miễn" Bước 0, kể cả lượt đầu ván. Bỏ qua nếu
  // đang chờ chọn nhân vật — chưa ai có equipment gì để kiểm tra, ĐỢI
  // finishCharacterSelection() gọi lại đúng bước này sau khi chia bài xong.
  if (!useCharacterSelection) {
    applyTurnStartChecks(state);
  }

  return state;
}
