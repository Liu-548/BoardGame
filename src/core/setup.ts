// Tạo state ban đầu cho 1 ván đấu 4-7 người, theo đúng luật gốc BANG!.

import type { CardName } from "./cards";
import { buildDeck } from "./cards";
import { CHARACTERS, computeStartingHp, getCharacterDefinition } from "./characters";
import { giveCardToPlayer } from "./equipment";
import { applyTurnStartChecks } from "./reduce";
import { shuffle } from "./rng";
import type { CharacterChoice, GameState, PlayerState, Role } from "./types";

export interface RuleOptions {
  cardCounts?: Partial<Record<CardName, number>>; // tuỳ chỉnh số lượng bài, để dành cho house rules sau này
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

  const sheriffIndex = players.findIndex((player) => player.role === "sheriff");

  const characterSelection: CharacterChoice[] | null = useCharacterSelection
    ? playerIds.map((id) => ({ playerId: id, options: characterOptionsByPlayer[id], chosen: null }))
    : null;

  const state: GameState = {
    players,
    deck: remainingDeck.map((card) => card.id),
    discardPile: [],
    pending: [],
    currentPlayerIndex: sheriffIndex, // Sheriff luôn đi lượt đầu tiên
    turnPhase: "draw",
    rngState: rngStateAfterCharacterDeck,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection,
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
