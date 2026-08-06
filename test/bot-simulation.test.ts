// Việc 1.14 — cột mốc: 4 bot đánh ngẫu nhiên, chạy 1000 ván liên tiếp, 0
// crash, 0 ván treo. File này KHÔNG đụng tới src/core/ — bot chỉ là công cụ
// kiểm thử, sinh action ứng viên rồi để reduce() thật tự quyết định đúng/sai.
//
// Nguyên tắc quan trọng: bot chỉ được "nuốt" lỗi từ chối luật (throw new
// Error(...) trong reduce.ts) để thử ứng viên khác — nếu reduce() ném ra lỗi
// KHÁC (TypeError, RangeError...) nghĩa là có bug thật, phải để lỗi đó bung ra
// làm fail test, không được coi là "chỉ là nước đi sai".

import { describe, expect, it } from "vitest";
import { cardNameFromId, isDelayedEquipmentCardName, isSelfEquipBlueCardName } from "../src/core/cards";
import { reduce } from "../src/core/reduce";
import { nextRandom } from "../src/core/rng";
import { setupGame } from "../src/core/setup";
import type { Action, GameState, PlayerState } from "../src/core/types";

interface BotRng {
  state: number;
}

function botRandom(rng: BotRng): number {
  const { value, nextState } = nextRandom(rng.state);
  rng.state = nextState;
  return value;
}

function shuffleWithBotRng<T>(rng: BotRng, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(botRandom(rng) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function otherAlivePlayers(state: GameState, playerId: string): PlayerState[] {
  return state.players.filter((p) => p.alive && p.id !== playerId);
}

// Chỉ coi là "từ chối luật hợp lệ" (thử ứng viên khác) nếu đúng là
// `new Error(...)` trơn — TypeError/RangeError/... là bug thật, phải bung ra.
function isRuleRejection(err: unknown): boolean {
  return err instanceof Error && err.constructor === Error;
}

// ----- Sinh action ứng viên khi tới lượt, turnPhase "play" -----
// Không cần biết TRƯỚC action nào hợp lệ — chỉ liệt kê MỌI khả năng có lý
// (đúng loại bài, đúng hình dạng tham số), để reduce() tự lọc đúng/sai.
function playCardCandidates(state: GameState, player: PlayerState): Action[] {
  const candidates: Action[] = [];
  const others = otherAlivePlayers(state, player.id);

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    // Mở rộng Dodge City — lá vàng "trì hoãn" (bible/sombrero/canteen...) được
    // CHƠI RA lần đầu y hệt trang bị xanh dương thường (không cần mục tiêu).
    // Bot CHƯA sinh ứng viên "kích hoạt" lá đã bày sẵn trên sân (equipment) —
    // mặc định bộ mở rộng "dodge_city" tắt nên bot không bao giờ rút được lá
    // này trong các test hiện có, chỉ cần qua compile an toàn.
    if (isSelfEquipBlueCardName(name) || isDelayedEquipmentCardName(name)) {
      candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId });
      continue;
    }

    switch (name) {
      case "bang":
      case "duel":
        for (const target of others) {
          candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id });
        }
        break;
      case "jail":
        for (const target of others) {
          if (target.role !== "sheriff") {
            candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id });
          }
        }
        break;
      case "panic":
        for (const target of others) {
          if (target.hand.length > 0) {
            candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id });
          } else {
            for (const equipId of target.equipment) {
              if (cardNameFromId(equipId) !== "dynamite") {
                candidates.push({
                  type: "PLAY_CARD", playerId: player.id, cardId,
                  targetId: target.id, targetCardId: equipId,
                });
              }
            }
          }
        }
        break;
      case "cat_balou":
        for (const target of others) {
          if (target.hand.length > 0) {
            candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id, targetZone: "hand" });
          }
          if (target.equipment.some((id) => cardNameFromId(id) !== "dynamite")) {
            candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id, targetZone: "equipment" });
          }
        }
        break;
      case "beer":
      case "saloon":
      case "stagecoach":
      case "wells_fargo":
      case "general_store":
      case "gatling":
      case "indians":
        candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId });
        break;
      case "missed":
      case "dynamite":
      case "dodge":
        break; // không bao giờ đánh chủ động được, khỏi tạo ứng viên
      // Mở rộng Dodge City đợt 2 — mặc định bộ mở rộng "dodge_city" tắt nên
      // bot không bao giờ thực sự rút được các lá này trong test hiện có, chỉ
      // cần ứng viên "có lý" để qua compile an toàn (giống ghi chú ở trên).
      case "punch":
        for (const target of others) {
          candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id });
        }
        break;
      case "rag_time":
      case "springfield": {
        const extra = player.hand.find((id) => id !== cardId);
        if (extra) {
          for (const target of others) {
            candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id, extraDiscardCardId: extra });
          }
        }
        break;
      }
      case "tequila": {
        const extra = player.hand.find((id) => id !== cardId);
        if (extra) {
          for (const target of [player, ...others]) {
            candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, targetId: target.id, extraDiscardCardId: extra });
          }
        }
        break;
      }
      case "whisky": {
        const extra = player.hand.find((id) => id !== cardId);
        if (extra) {
          candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, extraDiscardCardId: extra });
        }
        break;
      }
      case "brawl": {
        const extra = player.hand.find((id) => id !== cardId);
        if (extra) {
          const brawlZones: Record<string, "hand" | "equipment"> = {};
          for (const target of others) {
            brawlZones[target.id] = target.hand.length > 0 ? "hand" : "equipment";
          }
          candidates.push({ type: "PLAY_CARD", playerId: player.id, cardId, extraDiscardCardId: extra, brawlZones });
        }
        break;
      }
      default: {
        const neverName: never = name;
        throw new Error(`Bot chưa biết cách đánh lá: ${JSON.stringify(neverName)}`);
      }
    }
  }

  return candidates;
}

// ----- Chọn action RESPOND khi có pending đang chờ -----
// Luôn chọn được đúng 1 hình dạng CHẮC CHẮN hợp lệ (không cần thử-sai) — mỗi
// loại pending chỉ có đúng 1 "lối thoát an toàn" (thường là chịu hậu quả thay
// vì chống trả), đủ để không bao giờ kẹt.
function chooseRespondAction(state: GameState): Action {
  const top = state.pending[state.pending.length - 1];

  switch (top.kind) {
    case "NEED_MISSED":
    case "NEED_DISCARD_BANG": {
      const requiredName = top.kind === "NEED_MISSED" ? "missed" : "bang";
      const player = state.players.find((p) => p.id === top.player)!;
      const cardId = player.hand.find((id) => cardNameFromId(id) === requiredName);
      return cardId
        ? { type: "RESPOND", playerId: top.player, cardId }
        : { type: "RESPOND", playerId: top.player };
    }
    case "NEED_DUEL_RESPONSE": {
      const player = state.players.find((p) => p.id === top.player)!;
      const cardId = player.hand.find((id) => cardNameFromId(id) === "bang");
      return cardId
        ? { type: "RESPOND", playerId: top.player, cardId }
        : { type: "RESPOND", playerId: top.player };
    }
    case "NEED_PICK_STORE_CARD":
      return { type: "RESPOND", playerId: top.player, cardId: top.options[0] };
    case "NEED_DISCARD_FROM_ZONE": {
      const player = state.players.find((p) => p.id === top.player)!;
      const zoneArray = top.zone === "hand" ? player.hand : player.equipment;
      const eligible = top.zone === "equipment"
        ? zoneArray.filter((id) => cardNameFromId(id) !== "dynamite")
        : zoneArray;
      return { type: "RESPOND", playerId: top.player, cardId: eligible[0] };
    }
    case "NEED_DRAW_CHECK":
      return { type: "RESPOND", playerId: top.player };
    case "NEED_PICK_DRAW_SOURCE":
      // Giai đoạn 5 (Pedro Ramirez) — bot cứ rút bộ bài như bình thường, khỏi
      // cần lấy chồng bỏ (an toàn, luôn hợp lệ).
      return { type: "RESPOND", playerId: top.player };
    case "NEED_PICK_DRAW_TARGET":
      // Giai đoạn 5 (Jesse Jones) — bot cứ rút bộ bài như bình thường, khỏi
      // cần lấy tay ai (an toàn, luôn hợp lệ).
      return { type: "RESPOND", playerId: top.player };
    case "NEED_GIVE_CARD_TO_PLAYER":
      // Giai đoạn 5 (Jesse Jones) — bot cứ để rút ngẫu nhiên, khỏi tự chọn lá.
      return { type: "RESPOND", playerId: top.player };
    case "NEED_PICK_KEPT_CARDS":
      // Giai đoạn 5 (Kit Carlson) — bot cứ giữ 2 lá đầu, bỏ lá thứ 3 (mặc định).
      return { type: "RESPOND", playerId: top.player };
    case "NEED_PICK_DRAW_OR_EQUIPMENT":
      // Mở rộng Dodge City (Pat Brennan) — bot cứ rút bộ bài như bình thường,
      // khỏi cần lấy trang bị của ai (an toàn, luôn hợp lệ).
      return { type: "RESPOND", playerId: top.player };
    case "NEED_PICK_BORROWED_CHARACTER": {
      // Mở rộng Dodge City (Vera Custer) — bot không dùng nhân vật nên pending
      // này không thực sự phát sinh, nhưng vẫn xử lý an toàn cho đủ exhaustive:
      // chọn ngẫu nhiên 1 người còn sống khác có nhân vật (nếu có).
      const player = state.players.find((p) => p.id === top.player)!;
      const candidates = state.players.filter((p) => p.alive && p.id !== player.id && p.characterId !== null);
      return candidates[0]
        ? { type: "RESPOND", playerId: top.player, targetId: candidates[0].id }
        : { type: "RESPOND", playerId: top.player };
    }
    case "NEED_PICK_ARMED":
      // Bộ mở rộng "custom_characters" (Elena Noir) — bot không dùng nhân vật
      // này nên pending không thực sự phát sinh, nhưng vẫn xử lý an toàn: cứ
      // KHÔNG vũ trang (an toàn, luôn hợp lệ, giống mọi pending "có mặc định"
      // khác ở trên).
      return { type: "RESPOND", playerId: top.player };
    case "NEED_PICK_MARCEL_COMPANION": {
      // Bộ mở rộng "custom_characters" (Marcel Marcelo) — bot không dùng nhân
      // vật này nên pending không thực sự phát sinh, nhưng vẫn xử lý an toàn
      // cho đủ exhaustive: chọn ngẫu nhiên 1 người còn sống khác (BẮT BUỘC
      // chọn, không có lựa chọn "không chọn ai").
      const player = state.players.find((p) => p.id === top.player)!;
      const candidates = state.players.filter((p) => p.alive && p.id !== player.id);
      return candidates[0]
        ? { type: "RESPOND", playerId: top.player, targetId: candidates[0].id }
        : { type: "RESPOND", playerId: top.player };
    }
    default: {
      const neverKind: never = top;
      throw new Error(`Bot chưa biết cách phản hồi: ${JSON.stringify(neverKind)}`);
    }
  }
}

// Thử LẦN LƯỢT các action ứng viên (đã xáo ngẫu nhiên) cho tới khi reduce()
// chấp nhận 1 cái. Chỉ nuốt lỗi từ chối luật — lỗi khác (bug thật) bung thẳng ra.
function applyFirstValid(state: GameState, candidates: Action[]): GameState | null {
  for (const action of candidates) {
    try {
      return reduce(state, action).state;
    } catch (err) {
      if (!isRuleRejection(err)) throw err;
    }
  }
  return null;
}

const MAX_ACTIONS_PER_GAME = 4000;

// Chơi 1 ván tới khi có người thắng. Trả về số action đã dùng — ném lỗi nếu
// vượt MAX_ACTIONS_PER_GAME (nghi ngờ ván treo) hoặc reduce() gặp bug thật.
function playOneRandomGame(seed: number, playerIds: string[]): number {
  let state = setupGame(playerIds, seed);
  const botRng: BotRng = { state: seed + 1_000_000 };

  for (let actionCount = 0; actionCount < MAX_ACTIONS_PER_GAME; actionCount++) {
    if (state.winner) return actionCount;

    if (state.pending.length > 0) {
      state = reduce(state, chooseRespondAction(state)).state;
      continue;
    }

    const player = state.players[state.currentPlayerIndex];

    if (state.turnPhase === "draw") {
      state = reduce(state, { type: "DRAW_CARDS", playerId: player.id }).state;
      continue;
    }

    if (state.turnPhase === "discard") {
      const excess = player.hand.length - player.hp;
      const cardIds = shuffleWithBotRng(botRng, player.hand).slice(0, excess);
      state = reduce(state, { type: "DISCARD_CARDS", playerId: player.id, cardIds }).state;
      continue;
    }

    // turnPhase === "play": ưu tiên thử đánh bài thật, END_TURN luôn ở cuối
    // làm lưới an toàn (luôn hợp lệ khi pending rỗng và đang lượt mình).
    const candidates = shuffleWithBotRng(botRng, playCardCandidates(state, player));
    candidates.push({ type: "END_TURN", playerId: player.id });

    const next = applyFirstValid(state, candidates);
    if (!next) {
      throw new Error(`Bot không tìm được action hợp lệ nào (seed=${seed}, action thứ ${actionCount})`);
    }
    state = next;
  }

  throw new Error(`Nghi ngờ ván treo: sau ${MAX_ACTIONS_PER_GAME} action vẫn chưa có người thắng (seed=${seed})`);
}

describe("Bot ngẫu nhiên — cột mốc việc 1.14", () => {
  it("chạy 1000 ván 4 người liên tiếp: không crash, không treo", () => {
    const playerIds = ["a", "b", "c", "d"];

    for (let seed = 0; seed < 1000; seed++) {
      expect(() => playOneRandomGame(seed, playerIds)).not.toThrow();
    }
  }, 60_000);

  // Engine hỗ trợ 4-8 người (setup.ts, đủ cả biến thể 8 người) — chạy thêm
  // vài trăm ván mỗi cỡ bàn để bắt lỗi riêng của từng số người chơi (Gatling/
  // Indians nhiều mục tiêu hơn, General Store lật nhiều lá hơn, vòng tròn
  // khoảng cách dài hơn, 8 người có tới 2 Kẻ phản bội cùng lúc...).
  it.each([5, 6, 7, 8])("chạy 300 ván %i người liên tiếp: không crash, không treo", (playerCount) => {
    const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);

    for (let seed = 0; seed < 300; seed++) {
      expect(() => playOneRandomGame(seed, playerIds)).not.toThrow();
    }
  }, 60_000);

  // Biến thể 2 người (xem LO-TRINH.md, setup.ts's isDuelMode()) — không chia
  // vai, ván kết thúc bằng Winner.kind "player" thay vì "faction" (khác hẳn
  // 4-8 người) — chạy riêng để bắt lỗi (Jail/Cat Balou/Panic! chỉ có đúng 1
  // mục tiêu khả dĩ, checkWinCondition() nhánh mới...).
  it("chạy 500 ván 2 người liên tiếp: không crash, không treo", () => {
    const playerIds = ["a", "b"];

    for (let seed = 0; seed < 500; seed++) {
      expect(() => playOneRandomGame(seed, playerIds)).not.toThrow();
    }
  }, 60_000);

  // Biến thể 3 người (vòng tròn săn đuổi công khai, xem LO-TRINH.md,
  // setup.ts's isHuntMode()) — checkWinCondition() có nhánh mới xét killerId
  // + có thể "rơi" về chế độ sống sót giữa ván, chạy riêng để bắt lỗi.
  it("chạy 500 ván 3 người liên tiếp: không crash, không treo", () => {
    const playerIds = ["a", "b", "c"];

    for (let seed = 0; seed < 500; seed++) {
      expect(() => playOneRandomGame(seed, playerIds)).not.toThrow();
    }
  }, 60_000);
});
