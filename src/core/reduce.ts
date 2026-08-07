// Xương sống của engine: reduce(state, action) => state mới.
// THUẦN: không sửa state truyền vào, cùng đầu vào luôn cho cùng đầu ra.

import type { CardName, YellowCardName } from "./cards";
import {
  cardNameFromId,
  cardSuitRankFromId,
  isDelayedEquipmentCardName,
  isSelfEquipBlueCardName,
  isWeaponCardName,
  yellowCardActsAsMissed,
} from "./cards";
import {
  computeStartingHp,
  getEffectiveCharacterDefinition,
  getEffectiveCharacterHooks,
  getEffectiveEquipment,
  getHandLimit,
  triggerHandEmptyHook,
  triggerVoluntaryOutOfTurnHook,
} from "./characters";
import { drawTopCard } from "./deck";
import { computeDistance, getWeaponRange } from "./distance";
import type { EventId } from "./events";
import { giveCardToPlayer, transferDynamiteToNextPlayer } from "./equipment";
import { nextRandom } from "./rng";
import type { Action, GameEvent, GameState, PendingAction, PlayerState } from "./types";
import { checkWinCondition } from "./win";

export interface Result {
  state: GameState;
  events: GameEvent[];
}

const DRAW_COUNT = 2;

// Giai đoạn 5 (Calamity Janet, đợt 7) — coi lá `cardId` có ĐÓNG VAI Bang!
// được không: đúng là Bang! thật, HOẶC là Missed! nhưng thuộc về Janet. Dùng
// ở MỌI chỗ cần "1 lá Bang!" (đánh Bang! chủ động, đỡ Duel, đỡ Indians!).
function actsAsBang(state: GameState, cardId: string, player: PlayerState): boolean {
  const name = cardNameFromId(cardId);
  if (name === "bang") return true;
  return name === "missed" && getEffectiveCharacterDefinition(state, player)?.hasBangMissedAlias === true;
}

// Ngược lại: coi lá `cardId` có ĐÓNG VAI Missed! được không — đúng là Missed!
// thật, HOẶC là Bang! nhưng thuộc về Janet. Dùng để đỡ Bang!/Gatling.
function actsAsMissed(state: GameState, cardId: string, player: PlayerState): boolean {
  const name = cardNameFromId(cardId);
  // Mở rộng Dodge City — Dodge hoạt động y hệt Missed! (đỡ Bang!/Gatling), chỉ
  // khác tên và có rút thêm 1 lá khi đỡ thành công (xem respondToMissed()) —
  // KHÔNG cần gắn với nhân vật nào (khác alias Calamity Janet bên dưới).
  if (name === "missed" || name === "dodge") return true;
  // Mở rộng Dodge City, mục C nhóm B (Elena Fuente) — MỌI lá trên tay đều coi
  // như có thêm vai trò Missed!, không riêng "bang" như Calamity Janet.
  if (getEffectiveCharacterDefinition(state, player)?.hasAnyCardMissedAlias === true) return true;
  return name === "bang" && getEffectiveCharacterDefinition(state, player)?.hasBangMissedAlias === true;
}

// Mở rộng Dodge City (mục 1.1) — `cardId` này CÓ nằm trong equipment của
// `player` VÀ dùng được NGAY để đỡ Missed! không? 2 đường: (1) lá vàng nhóm
// yellowCardActsAsMissed() (Bible/Sombrero/Ten Gallon Hat/Iron Plate) VÀ đã
// qua ít nhất 1 lượt kể từ lúc được chơi ra (equipmentPlayedTurn khác lượt
// hiện tại); (2) mục C nhóm B (Elena Fuente, canUseOwnEquipmentAsMissed) —
// BẤT KỲ lá nào trên sân của CHÍNH mình, KHÔNG cần chờ 1 lượt, TRỪ Dynamite.
// KHÔNG liên quan gì tới actsAsMissed()/alias Calamity Janet (đó là khái
// niệm riêng cho lá TRÊN TAY, không áp dụng cho trang bị trên sân).
function isEquipmentUsableAsMissed(state: GameState, player: PlayerState, cardId: string): boolean {
  // Mở rộng Dodge City, mục C nhóm C (Belle Star) — trang bị của người ĐANG
  // PHẢN ỨNG (luôn là người khác, không bao giờ là ai đang tới lượt) mất tác
  // dụng nếu đang là lượt của 1 nhân vật disablesOthersEquipment.
  const effectiveEquipment = getEffectiveEquipment(state, player);
  if (!effectiveEquipment.includes(cardId)) return false;
  const name = cardNameFromId(cardId);
  if (getEffectiveCharacterDefinition(state, player)?.canUseOwnEquipmentAsMissed === true) {
    return name !== "dynamite";
  }
  return yellowCardActsAsMissed(name) && state.equipmentPlayedTurn[cardId] !== state.turnNumber;
}

// Tổng số nguồn Missed! HIỆN DÙNG ĐƯỢC của `player` — bài trên tay (kể cả
// alias Calamity Janet, actsAsMissed()) CỘNG trang bị vàng đã bày đủ 1 lượt.
// Dùng để kiểm missesNeeded (Slab the Killer, Giai đoạn 5) — người chơi phải
// có ĐỦ ngay từ đầu mới được bỏ dần, không được bỏ thiếu giữa chừng.
function countEligibleMissedSources(state: GameState, player: PlayerState): number {
  const fromHand = player.hand.filter((id) => actsAsMissed(state, id, player)).length;
  const fromEquipment = player.equipment.filter((id) => isEquipmentUsableAsMissed(state, player, id)).length;
  return fromHand + fromEquipment;
}

export function reduce(state: GameState, action: Action): Result {
  if (state.winner) {
    throw new Error("Ván đã kết thúc, không thể tiếp tục hành động");
  }

  // Đang chờ chọn nhân vật (xem CharacterChoice ở types.ts) — ván CHƯA thật
  // sự bắt đầu (hp/hand mọi người còn tạm 0/rỗng), nên CHẶN mọi action khác
  // ngoài đúng 2 loại việc của giai đoạn này.
  if (state.characterSelection && action.type !== "CHOOSE_CHARACTER" && action.type !== "FINALIZE_CHARACTER_SELECTION") {
    throw new Error("Đang chờ mọi người chọn nhân vật, chưa thể làm hành động khác");
  }

  switch (action.type) {
    case "DRAW_CARDS":
      return handleDrawCards(state, action);
    case "END_TURN":
      return handleEndTurn(state, action);
    case "DISCARD_CARDS":
      return handleDiscardCards(state, action);
    case "PLAY_CARD":
      return handlePlayCard(state, action);
    case "RESPOND":
      return handleRespond(state, action);
    case "USE_ABILITY":
      return handleUseAbility(state, action);
    case "CHOOSE_CHARACTER":
      return handleChooseCharacter(state, action);
    case "FINALIZE_CHARACTER_SELECTION":
      return handleFinalizeCharacterSelection(state);
    default: {
      // Nếu sau này thêm loại action mới vào union mà quên xử lý ở đây,
      // dòng dưới sẽ báo lỗi biên dịch (exhaustiveness check).
      const neverAction: never = action;
      throw new Error(`Không rõ loại hành động: ${JSON.stringify(neverAction)}`);
    }
  }
}

function handleDrawCards(
  state: GameState,
  action: Action & { type: "DRAW_CARDS" }
): Result {
  assertCurrentPlayer(state, action.playerId);
  assertPhase(state, "draw");
  if (state.pending.length > 0) {
    throw new Error("Còn việc đang chờ xử lý đầu lượt (Dynamite/Jail), chưa thể rút bài");
  }

  const next = cloneState(state);
  const player = next.players[next.currentPlayerIndex];

  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
  // — vừa thoát tù thành công Ở ĐÚNG lượt này (cờ đặt ở nhánh Jail của
  // resolveDrawCheck()): rút THẲNG 3 lá thay vì hỏi han gì (Phương án C), rồi
  // tiêu thụ (xoá) cờ ngay. Xét TRƯỚC MỌI nhánh "hỏi trước khi rút" khác —
  // không xung đột được với chúng vì đây LUÔN đi kèm vừa thoát tù (không hỏi
  // gì thêm), khác hẳn các nhánh dưới đây (đều HỎI trước khi rút).
  if (next.marcelJailBonusDrawThisTurn[player.id]) {
    delete next.marcelJailBonusDrawThisTurn[player.id];
    const drawnCount = drawCardsForPlayer(next, player, 3);
    next.turnPhase = "play";
    return { state: next, events: [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }] };
  }

  // Giai đoạn 5 (Pedro Ramirez, đợt 4) — HỎI trước khi rút gì cả: lấy lá 1 từ
  // đỉnh chồng bỏ, hay rút thẳng bộ bài như bình thường? Chỉ hỏi khi chồng bỏ
  // còn bài (rỗng thì rút thẳng bộ bài, khỏi cần hỏi). Đẩy pending rồi TRẢ VỀ
  // NGAY — turnPhase vẫn ở "draw", respondToPickDrawSource() mới thực sự rút
  // bài và chuyển sang "play".
  if (getEffectiveCharacterDefinition(next, player)?.canDrawFromDiscardPile === true && next.discardPile.length > 0) {
    next.pending.push({ kind: "NEED_PICK_DRAW_SOURCE", player: player.id });
    return { state: next, events: [] };
  }

  // Giai đoạn 5 (Jesse Jones, đợt 5) — HỎI trước khi rút gì cả: lá 1 lấy từ
  // bộ bài hay từ tay 1 người khác? Đẩy pending rồi TRẢ VỀ NGAY, y hệt Pedro
  // Ramirez — respondToPickDrawTarget() mới thực sự rút bài và chuyển "play".
  if (getEffectiveCharacterDefinition(next, player)?.canStealFirstDrawCard === true) {
    next.pending.push({ kind: "NEED_PICK_DRAW_TARGET", player: player.id });
    return { state: next, events: [] };
  }

  // Giai đoạn 5 (Kit Carlson, đợt 6) — xem riêng 3 lá trên cùng bộ bài (mỗi
  // lần gọi drawTopCard() tự xào lại chồng bỏ nếu bộ bài cạn, không cần tự
  // viết thêm gì), rồi HỎI: giữ 2 bỏ 1. Không đủ 3 lá để rút (deck + chồng bỏ
  // cùng cạn — cực hiếm) thì không có gì để CHỌN bỏ, cứ giữ hết những gì rút
  // được, khỏi cần hỏi.
  if (getEffectiveCharacterDefinition(next, player)?.canPeekTopThree === true) {
    const peeked: string[] = [];
    for (let i = 0; i < 3; i++) {
      const card = drawTopCard(next);
      if (card) peeked.push(card);
    }
    if (peeked.length < 3) {
      for (const cardId of peeked) giveCardToPlayer(next.players, player, cardId);
      next.turnPhase = "play";
      return { state: next, events: [{ type: "CARDS_DRAWN", playerId: player.id, count: peeked.length }] };
    }
    next.pending.push({ kind: "NEED_PICK_KEPT_CARDS", player: player.id, cards: peeked });
    return { state: next, events: [] };
  }

  // Mở rộng Dodge City, mục C nhóm A (Pat Brennan, xem core/characters.ts) —
  // HỎI trước khi rút gì cả: rút 2 lá như thường, hay lấy đúng 1 lá trang bị
  // bất kỳ đang bày trước mặt người khác? Đẩy pending rồi TRẢ VỀ NGAY, y hệt
  // Pedro Ramirez/Jesse Jones — respondToPickDrawOrEquipment() mới thực sự
  // rút/lấy bài và chuyển turnPhase sang "play".
  if (getEffectiveCharacterDefinition(next, player)?.canTakeEquipmentInsteadOfDraw === true) {
    next.pending.push({ kind: "NEED_PICK_DRAW_OR_EQUIPMENT", player: player.id });
    return { state: next, events: [] };
  }

  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // ĐANG trong trạng thái Miễn Tử (có entry trong elenaNoirImmortalTurnsLeft,
  // theo playerId — xem ghi chú ở GameState): rút THẲNG 3 lá, không hỏi vũ
  // trang gì cả (đã miễn nhiễm chết rồi, hỏi vô nghĩa). KHÔNG đang Miễn Tử:
  // HỎI trước khi rút gì cả — vũ trang khả năng Miễn Tử cho chu kỳ này (rút 1
  // lá) hay không (rút 2 lá bình thường)? Đẩy pending rồi TRẢ VỀ NGAY, y hệt
  // Pat Brennan — respondToPickArmed() mới thực sự rút bài và chuyển
  // turnPhase sang "play".
  if (getEffectiveCharacterDefinition(next, player)?.canArmImmortality === true) {
    if (next.elenaNoirImmortalTurnsLeft[player.id] !== undefined) {
      const drawnCount = drawCardsForPlayer(next, player, 3);
      next.turnPhase = "play";
      return { state: next, events: [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }] };
    }
    next.pending.push({ kind: "NEED_PICK_ARMED", player: player.id });
    return { state: next, events: [] };
  }

  // Giai đoạn 5 (Black Jack, xem core/characters.ts) — onDrawPhase THAY HẲN
  // pha rút 2 lá mặc định khi nhân vật có định nghĩa hook này.
  const onDrawPhase = getEffectiveCharacterHooks(next, player).onDrawPhase;
  let events: GameEvent[];
  if (onDrawPhase) {
    events = onDrawPhase(next, player);
  } else {
    for (let i = 0; i < DRAW_COUNT; i++) {
      const card = drawTopCard(next);
      if (card) giveCardToPlayer(next.players, player, card);
    }
    events = [{ type: "CARDS_DRAWN", playerId: player.id, count: DRAW_COUNT }];
  }

  next.turnPhase = "play";

  return { state: next, events };
}

// Giai đoạn 5 (Pedro Ramirez, đợt 4) — trả lời NEED_PICK_DRAW_SOURCE. Gửi kèm
// cardId ĐÚNG BẰNG lá trên cùng chồng bỏ -> lấy lá đó làm lá 1; không kèm
// cardId -> rút thẳng bộ bài như bình thường. Lá 2 LUÔN từ bộ bài (đúng luật).
function respondToPickDrawSource(
  state: GameState,
  action: Action & { type: "RESPOND" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  let firstCard: string | undefined;
  if (action.cardId) {
    const topOfDiscard = next.discardPile[next.discardPile.length - 1];
    if (action.cardId !== topOfDiscard) {
      throw new Error("Chỉ được lấy đúng lá trên cùng của chồng bài đã bỏ");
    }
    firstCard = next.discardPile.pop();
  } else {
    firstCard = drawTopCard(next);
  }
  if (firstCard) giveCardToPlayer(next.players, player, firstCard);

  const secondCard = drawTopCard(next);
  if (secondCard) giveCardToPlayer(next.players, player, secondCard);

  next.turnPhase = "play";
  const drawnCount = (firstCard ? 1 : 0) + (secondCard ? 1 : 0);
  return { state: next, events: [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }] };
}

// Giai đoạn 5 (Jesse Jones, đợt 5) — trả lời NEED_PICK_DRAW_TARGET. Không kèm
// targetId -> rút thẳng bộ bài như bình thường (mặc định/timeout). Kèm
// targetId hợp lệ (còn sống, khác chính mình): tay người đó rỗng -> cũng coi
// như rút bộ bài cho lá 1 (không có gì để lấy); còn bài -> đọc letTargetChoose
// (house rule bàn với chủ dự án — CHÍNH JESSE được hỏi, không phải nạn nhân):
// true -> đẩy NEED_GIVE_CARD_TO_PLAYER hỏi nạn nhân tự chọn lá; false/bỏ
// trống -> cướp ngẫu nhiên NGAY (tái dùng đúng cách chọn ngẫu nhiên của
// Panic!). Lá 2 LUÔN từ bộ bài.
function respondToPickDrawTarget(
  state: GameState,
  action: Action & { type: "RESPOND" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  let target: PlayerState | undefined;
  if (action.targetId) {
    if (action.targetId === player.id) {
      throw new Error("Không thể tự lấy bài từ tay chính mình");
    }
    target = next.players.find((p) => p.id === action.targetId);
    if (!target || !target.alive) {
      throw new Error("Mục tiêu không hợp lệ");
    }
  }

  const events: GameEvent[] = [];
  let firstCard: string | undefined;

  if (target && target.hand.length > 0) {
    if (action.letTargetChoose) {
      next.pending.push({ kind: "NEED_GIVE_CARD_TO_PLAYER", player: target.id, giveTo: player.id });
      // Lá 1 CHƯA rút được — chờ nạn nhân chọn xong. respondToGiveCardToPlayer()
      // sẽ tự rút nốt lá 2 rồi mới chuyển turnPhase sang "play".
      return { state: next, events: [] };
    }

    const { value, nextState } = nextRandom(next.rngState);
    next.rngState = nextState;
    const index = Math.floor(value * target.hand.length);
    [firstCard] = target.hand.splice(index, 1);
    giveCardToPlayer(next.players, player, firstCard);
    events.push({ type: "CARD_STOLEN", playerId: player.id, fromPlayerId: target.id, cardId: firstCard });
    events.push(...triggerHandEmptyHook(next, target)); // Giai đoạn 5 (Suzy Lafayette)
  } else {
    firstCard = drawTopCard(next);
    if (firstCard) giveCardToPlayer(next.players, player, firstCard);
  }

  const secondCard = drawTopCard(next);
  if (secondCard) giveCardToPlayer(next.players, player, secondCard);

  next.turnPhase = "play";
  events.push({ type: "CARDS_DRAWN", playerId: player.id, count: (firstCard ? 1 : 0) + (secondCard ? 1 : 0) });
  return { state: next, events };
}

// Giai đoạn 5 (Jesse Jones, đợt 5) — trả lời NEED_GIVE_CARD_TO_PLAYER: nạn
// nhân (action.playerId === top.player) tự chọn 1 lá CỦA CHÍNH MÌNH để đưa
// cho Jesse. Không chọn (hoặc hết giờ) -> rút ngẫu nhiên thay họ, y hệt
// respondToPickDrawTarget() ở trên. Xong luôn rút nốt lá 2 (từ bộ bài) cho
// Jesse và chuyển turnPhase sang "play" — bước này mới thật sự HOÀN TẤT lượt
// rút của Jesse.
function respondToGiveCardToPlayer(
  state: GameState,
  action: Action & { type: "RESPOND" },
  top: PendingAction & { kind: "NEED_GIVE_CARD_TO_PLAYER" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const victim = next.players.find((p) => p.id === action.playerId)!;
  const jesse = next.players.find((p) => p.id === top.giveTo)!;

  let givenCardId: string | undefined;
  if (action.cardId) {
    const cardIndex = victim.hand.indexOf(action.cardId);
    if (cardIndex === -1) {
      throw new Error(`Người chơi ${victim.id} không có lá bài ${action.cardId} trong tay`);
    }
    [givenCardId] = victim.hand.splice(cardIndex, 1);
  } else if (victim.hand.length > 0) {
    const { value, nextState } = nextRandom(next.rngState);
    next.rngState = nextState;
    const index = Math.floor(value * victim.hand.length);
    [givenCardId] = victim.hand.splice(index, 1);
  }
  // Tay nạn nhân có thể đã rỗng ngay lúc này (vd Sid Ketchum tự dùng kỹ năng
  // bỏ sạch 2 lá trong lúc đang chờ họ trả lời — kỹ năng đó cố tình dùng được
  // bất cứ lúc nào, không kiểm tra pending) — coi như không còn gì để lấy,
  // bỏ qua lá 1, y hệt cách respondToPickDrawTarget() xử lý khi tay mục tiêu
  // rỗng ngay từ đầu. KHÔNG rơi vào nhánh else ở trên (tránh index vào mảng
  // rỗng, khiến givenCardId thành undefined rồi lọt vào tay Jesse).

  const events: GameEvent[] = [];
  if (givenCardId) {
    giveCardToPlayer(next.players, jesse, givenCardId);
    events.push({ type: "CARD_STOLEN", playerId: jesse.id, fromPlayerId: victim.id, cardId: givenCardId });
    events.push(...triggerHandEmptyHook(next, victim)); // Giai đoạn 5 (Suzy Lafayette)
  }

  const secondCard = drawTopCard(next);
  if (secondCard) giveCardToPlayer(next.players, jesse, secondCard);

  next.turnPhase = "play";
  events.push({ type: "CARDS_DRAWN", playerId: jesse.id, count: (givenCardId ? 1 : 0) + (secondCard ? 1 : 0) });
  return { state: next, events };
}

// Giai đoạn 5 (Kit Carlson, đợt 6) — trả lời NEED_PICK_KEPT_CARDS. Gửi kèm
// cardId ĐÚNG BẰNG 1 trong 3 lá vừa xem -> lá đó bị bỏ, 2 lá còn lại vào tay
// (giữ NGUYÊN THỨ TỰ trong `cards`, bỏ đúng phần tử trùng cardId). Không kèm
// cardId (mặc định/timeout) -> bỏ đúng cards[2] (lá rút SAU CÙNG), giữ 2 lá
// đầu — house rule, KHÁC bản gốc BANG! (xem ghi chú ở types.ts).
function respondToPickKeptCards(
  state: GameState,
  action: Action & { type: "RESPOND" },
  top: PendingAction & { kind: "NEED_PICK_KEPT_CARDS" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  let discardedCardId: string;
  if (action.cardId) {
    if (!top.cards.includes(action.cardId)) {
      throw new Error(`Lá "${action.cardId}" không nằm trong 3 lá vừa xem`);
    }
    discardedCardId = action.cardId;
  } else {
    discardedCardId = top.cards[2];
  }

  next.discardPile.push(discardedCardId);
  for (const cardId of top.cards) {
    if (cardId !== discardedCardId) giveCardToPlayer(next.players, player, cardId);
  }

  next.turnPhase = "play";
  return {
    state: next,
    events: [
      { type: "CARDS_DRAWN", playerId: player.id, count: 2 },
      { type: "KIT_CARLSON_DISCARDED", playerId: player.id, cardId: discardedCardId },
    ],
  };
}

// Mở rộng Dodge City, mục C nhóm A (Pat Brennan) — trả lời
// NEED_PICK_DRAW_OR_EQUIPMENT. Gửi kèm targetId (chủ lá) + cardId (đúng lá
// trang bị muốn lấy) -> lấy lá đó vào tay (dùng giveCardToPlayer() như mọi
// nơi khác — nếu lá đó là Dynamite, tự động gắn xuống sân thay vì vào tay,
// đúng luật Dynamite "không bao giờ nằm trên tay"); không kèm targetId -> rút
// 2 lá từ bộ bài như bình thường (mặc định/timeout).
function respondToPickDrawOrEquipment(
  state: GameState,
  action: Action & { type: "RESPOND" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  if (action.targetId) {
    if (action.targetId === player.id) {
      throw new Error("Không thể tự lấy trang bị của chính mình");
    }
    const target = next.players.find((p) => p.id === action.targetId);
    if (!target || !target.alive) {
      throw new Error("Mục tiêu không hợp lệ");
    }
    if (!action.cardId) {
      throw new Error("Phải chỉ định đúng lá trang bị muốn lấy");
    }
    const index = target.equipment.indexOf(action.cardId);
    if (index === -1) {
      throw new Error(`Người chơi ${target.id} không có lá trang bị ${action.cardId}`);
    }
    target.equipment.splice(index, 1);
    delete next.equipmentPlayedTurn[action.cardId]; // dọn rác Dodge City nếu là lá "delayed"
    giveCardToPlayer(next.players, player, action.cardId);

    next.turnPhase = "play";
    return {
      state: next,
      events: [{ type: "CARD_STOLEN", playerId: player.id, fromPlayerId: target.id, cardId: action.cardId }],
    };
  }

  const drawnCount = drawCardsForPlayer(next, player, DRAW_COUNT);
  next.turnPhase = "play";
  return { state: next, events: [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }] };
}

// Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) — trả
// lời NEED_PICK_ARMED. `armed: true` -> chỉ rút 1 lá lượt này, đặt
// elenaNoirArmed[playerId] = true (bảo vệ tới đầu lượt kế tiếp của CHÍNH
// người này — bị GHI ĐÈ ở chính chỗ này lần rút bài sau, không tự hết hạn
// giữa chừng). Không kèm/`armed: false` (mặc định/hết giờ) -> rút 2 lá bình
// thường, XOÁ key khỏi elenaNoirArmed (coi như false — dọn sạch trạng thái vũ
// trang cũ nếu có, dù về lý thuyết không thể có vì lần trước cũng ĐÃ bị ghi
// đè y hệt cách này). THEO PLAYERID (không phải field đơn) — xem ghi chú ở
// GameState.elenaNoirArmed (Vera Custer có thể mượn khả năng này).
function respondToPickArmed(state: GameState, action: Action & { type: "RESPOND" }): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  const armed = action.armed === true;
  if (armed) {
    next.elenaNoirArmed[player.id] = true;
  } else {
    delete next.elenaNoirArmed[player.id];
  }
  const drawnCount = drawCardsForPlayer(next, player, armed ? 1 : 2);
  next.turnPhase = "play";
  return { state: next, events: [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }] };
}

// Mở rộng Dodge City, mục C nhóm C (Vera Custer) — trả lời
// NEED_PICK_BORROWED_CHARACTER. BẮT BUỘC chọn đúng 1 người chơi khác còn sống
// ĐÃ có nhân vật (không có lựa chọn "không mượn ai" — hết giờ thì room.ts tự
// chọn ngẫu nhiên, xem buildReactiveTimeoutAction()). Ghi
// veraCusterBorrowedCharacterId RỒI GỌI THẲNG applyDynamiteAndJailChecks()
// (KHÔNG gọi lại applyTurnStartChecks() — sẽ hỏi lại vô hạn vì Vera Custer vẫn
// còn canBorrowCharacterAbilities) để tiếp tục đúng thứ tự Bước 0 còn lại.
function respondToPickBorrowedCharacter(
  state: GameState,
  action: Action & { type: "RESPOND" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  if (!action.targetId) {
    throw new Error("Phải chọn 1 người chơi khác còn sống để mượn khả năng — không có lựa chọn 'không mượn ai'");
  }
  if (action.targetId === player.id) {
    throw new Error("Không thể tự mượn khả năng của chính mình");
  }
  const target = next.players.find((p) => p.id === action.targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }
  if (!target.characterId) {
    throw new Error(`Người chơi ${target.id} chưa có nhân vật, không có gì để mượn`);
  }

  next.veraCusterBorrowedCharacterId = target.characterId;
  applyDynamiteAndJailChecks(next, player);

  return {
    state: next,
    events: [
      { type: "VERA_CUSTER_BORROWED", playerId: player.id, borrowedFromPlayerId: target.id, characterId: target.characterId },
    ],
  };
}

// Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
// — trả lời NEED_PICK_MARCEL_COMPANION. BẮT BUỘC chọn đúng 1 người chơi khác
// còn sống (không giới hạn khoảng cách, được phép trùng người vừa đánh Jail
// lên mình) — không có lựa chọn "không chọn ai". Hết giờ thì room.ts tự chọn
// ngẫu nhiên (xem buildReactiveTimeoutAction()).
function respondToPickMarcelCompanion(
  state: GameState,
  action: Action & { type: "RESPOND" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  if (!action.targetId) {
    throw new Error("Phải chọn 1 người chơi khác còn sống để cùng vào tù");
  }
  if (action.targetId === player.id) {
    throw new Error("Không thể tự chỉ định chính mình");
  }
  const target = next.players.find((p) => p.id === action.targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }

  next.marcelJailCompanion[player.id] = target.id;

  return {
    state: next,
    events: [{ type: "MARCEL_COMPANION_PICKED", playerId: player.id, companionId: target.id }],
  };
}

function handleEndTurn(state: GameState, action: Action & { type: "END_TURN" }): Result {
  assertCurrentPlayer(state, action.playerId);
  assertPhase(state, "play");
  if (state.pending.length > 0) {
    throw new Error("Không thể kết thúc lượt khi còn việc đang chờ xử lý");
  }

  const next = cloneState(state);
  const player = next.players[next.currentPlayerIndex];

  // Mở rộng Dodge City, mục C nhóm B (Sean Mallory) — getHandLimit() thay
  // player.hp trực tiếp (mặc định trả về đúng player.hp nếu không có hook).
  if (player.hand.length > getHandLimit(next, player)) {
    next.turnPhase = "discard";
    return { state: next, events: [] };
  }

  const advanceEvents = advanceTurn(next);
  return { state: next, events: [{ type: "TURN_ENDED", playerId: player.id }, ...advanceEvents] };
}

function handleDiscardCards(
  state: GameState,
  action: Action & { type: "DISCARD_CARDS" }
): Result {
  assertCurrentPlayer(state, action.playerId);
  assertPhase(state, "discard");
  if (state.pending.length > 0) {
    throw new Error("Không thể bỏ bài kết thúc lượt khi còn việc đang chờ xử lý");
  }

  const next = cloneState(state);
  const player = next.players[next.currentPlayerIndex];

  for (const cardId of action.cardIds) {
    const index = player.hand.indexOf(cardId);
    if (index === -1) {
      throw new Error(`Người chơi ${player.id} không có lá bài ${cardId} trong tay`);
    }
    player.hand.splice(index, 1);
    next.discardPile.push(cardId);
  }

  // Mở rộng Dodge City, mục C nhóm B (Sean Mallory) — xem ghi chú ở handleEndTurn().
  if (player.hand.length > getHandLimit(next, player)) {
    throw new Error("Phải bỏ đủ bài thừa xuống bằng đúng giới hạn cho phép");
  }

  const events: GameEvent[] = [{ type: "CARDS_DISCARDED", playerId: player.id, cardIds: action.cardIds }];
  events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)

  events.push({ type: "TURN_ENDED", playerId: player.id });
  events.push(...advanceTurn(next));
  return { state: next, events };
}

function handlePlayCard(state: GameState, action: Action & { type: "PLAY_CARD" }): Result {
  assertCurrentPlayer(state, action.playerId);
  assertPhase(state, "play");

  if (state.pending.length > 0) {
    throw new Error("Không thể đánh bài mới khi còn việc đang chờ xử lý");
  }

  const next = cloneState(state);
  const player = next.players[next.currentPlayerIndex];
  const cardName = cardNameFromId(action.cardId);

  const cardIndex = player.hand.indexOf(action.cardId);
  if (cardIndex === -1) {
    // Không có trong tay — mở rộng Dodge City (mục 1.1): có thể đang KÍCH
    // HOẠT 1 lá trang bị "trì hoãn" đã bày sẵn từ lượt trước (đứng ở
    // equipment, không phải hand). Dùng ĐÚNG action PLAY_CARD, chỉ khác
    // nguồn bài — xem activateDelayedEquipment().
    if (isDelayedEquipmentCardName(cardName) && player.equipment.includes(action.cardId)) {
      return activateDelayedEquipment(next, player, action, cardName);
    }
    throw new Error(`Người chơi ${player.id} không có lá bài ${action.cardId} trong tay`);
  }

  // Rời tay trước, rồi mới rẽ theo tác dụng riêng của từng lá. Nếu rơi vào
  // "chưa hỗ trợ" bên dưới thì throw luôn — next chỉ là bản sao cục bộ, bị huỷ
  // theo, state gốc không hề bị đụng tới.
  player.hand.splice(cardIndex, 1);
  // Giai đoạn 5 (Suzy Lafayette, đợt 3) — kiểm tra NGAY lúc lá vừa rời tay, kể
  // cả TRƯỚC KHI card này giải quyết xong hiệu ứng riêng (Stagecoach/Wells
  // Fargo tự rút lại ngay sau đó) — đúng "kích hoạt đúng thời điểm lá cuối rời
  // tay", không đợi tới cuối hàm mới kiểm tra (lúc đó có thể tay đã đầy lại).
  const handEmptyEvents = triggerHandEmptyHook(next, player);

  // Lá xanh tự trang bị (súng, Barrel, Scope, Mustang) VÀ lá vàng "trì hoãn"
  // (mở rộng Dodge City, mục 1.1 — Bible, Sombrero, Canteen...) đều ở lại
  // trên sân của chính người đánh, KHÔNG vào chồng bỏ như lá nâu. Đây là lần
  // ĐẦU TIÊN lá vàng được chơi ra (từ tay) — khác activateDelayedEquipment()
  // ở trên (bỏ lá ĐÃ bày sẵn để dùng).
  let result: Result;
  if (isSelfEquipBlueCardName(cardName) || isDelayedEquipmentCardName(cardName)) {
    result = playEquipment(next, player, action.cardId, cardName);
  } else if (cardName === "jail") {
    // Jail gắn lên sân NGƯỜI KHÁC (không phải người đánh) — cũng không vào chồng bỏ.
    result = playJail(next, player, action);
  } else {
    // Việc 5.3 (house rule "no_duplicate_card_names") — CHỈ áp dụng cho lá
    // NÂU (nhánh else này, đúng lời chủ dự án "trừ lá trang bị" — 2 nhánh
    // trang bị/Jail ở trên không đi qua đây). Kiểm TRƯỚC khi ghi nhận lá này
    // vào danh sách đã đánh — dùng đúng cardName in (tên thật trên lá), không
    // phải dispatchCardName bên dưới (Janet đánh Missed! làm Bang! vẫn tính
    // là đã đánh "missed", không phải "bang").
    if (next.houseRules.includes("no_duplicate_card_names")) {
      if (next.cardNamesPlayedThisTurn.includes(cardName)) {
        throw new Error(
          `Luật bổ sung "cấm dùng 2 lá trùng tên/lượt" đang bật — đã đánh "${cardName}" trong lượt này rồi`
        );
      }
      next.cardNamesPlayedThisTurn.push(cardName);
    }

    next.discardPile.push(action.cardId);

    // Giai đoạn 5 (Calamity Janet, đợt 7) — Janet đánh CHỦ ĐỘNG 1 lá tên
    // "missed" thì coi như đang đánh Bang! (định tuyến vào playBang() thay vì
    // báo lỗi như người khác). KHÔNG đổi gì cho case "bang" — đánh Bang! thật
    // luôn bình thường, không có gì mơ hồ ở chiều này.
    const dispatchCardName =
      cardName === "missed" && actsAsBang(next, action.cardId, player) ? "bang" : cardName;

    switch (dispatchCardName) {
      case "missed":
        // Missed! không tự đánh ra lúc tới lượt mình (mục 7 file luật) — chỉ
        // dùng để PHẢN ỨNG, đi qua action RESPOND (respondToMissed), không
        // phải PLAY_CARD.
        throw new Error("Không thể chủ động đánh Missed! — chỉ dùng để phản ứng khi bị Bang!/Gatling");
      case "bang":
        result = playBang(next, player, action);
        break;
      case "beer":
        result = playBeer(next, player, action.cardId);
        break;
      case "saloon":
        result = playSaloon(next, player, action.cardId);
        break;
      case "stagecoach":
        result = playStagecoach(next, player, action.cardId);
        break;
      case "wells_fargo":
        result = playWellsFargo(next, player, action.cardId);
        break;
      case "gatling":
        result = playGatling(next, player, action);
        break;
      case "indians":
        result = playIndians(next, player, action);
        break;
      case "duel":
        result = playDuel(next, player, action);
        break;
      case "general_store":
        result = playGeneralStore(next, player, action.cardId);
        break;
      case "panic":
        result = playPanic(next, player, action);
        break;
      case "cat_balou":
        result = playCatBalou(next, player, action);
        break;
      case "dynamite":
        // Dynamite không bao giờ nằm trên tay để đánh chủ động — tự động xuống
        // sân ngay khi vào tay (xem giveCardToPlayer() trong equipment.ts). Nhánh
        // này chỉ có thể chạy tới nếu có bug ở nơi khác làm lọt Dynamite vào tay.
        throw new Error("Dynamite không được đánh chủ động — tự động xuống sân ngay khi vào tay");
      // Mở rộng Dodge City đợt 2 (mục 2, nhóm NÂU) — xem Luat_Bang_Mo_Rong_DodgeCity.txt.
      case "dodge":
        // Y hệt "missed" ở trên: không tự đánh ra lúc tới lượt mình, chỉ dùng để
        // PHẢN ỨNG (đi qua RESPOND, xem actsAsMissed()/respondToMissed()).
        throw new Error("Không thể chủ động đánh Dodge — chỉ dùng để phản ứng khi bị Bang!/Gatling (giống Missed!)");
      case "brawl":
        result = playBrawl(next, player, action);
        break;
      case "punch":
        result = playPunch(next, player, action);
        break;
      case "rag_time":
        result = playRagTime(next, player, action);
        break;
      case "springfield":
        result = playSpringfield(next, player, action);
        break;
      case "tequila":
        result = playTequila(next, player, action);
        break;
      case "whisky":
        result = playWhisky(next, player, action);
        break;
      default: {
        // isSelfEquipBlueCardName() và nhánh "jail" ở trên đã xử lý hết lá xanh
        // rồi, switch cũng đã liệt kê đủ toàn bộ bài nâu (kể cả "missed" và
        // "dynamite" — 2 case chỉ để throw lỗi rõ ràng, không đánh chủ động được)
        // — dòng dưới chỉ để bắt lỗi biên dịch nếu sau này thêm loại bài mới mà
        // quên xử lý ở đâu đó.
        const neverCardName: never = dispatchCardName;
        throw new Error(`Không rõ loại bài: ${JSON.stringify(neverCardName)}`);
      }
    }
  }

  // handEmptyEvents xảy ra TRƯỚC (lá vừa rời tay, kiểm tra ngay — xem ghi chú
  // ở trên), result.events là hiệu ứng RIÊNG của lá vừa đánh (có thể tự rút
  // lại bài, vd Stagecoach/Wells Fargo) — xảy ra SAU. Xếp đúng thứ tự thời
  // gian thật để nhật ký ván đấu (việc 4.2) không hiện ngược.
  return { state: result.state, events: [...handEmptyEvents, ...result.events] };
}

function playBang(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  if (!action.targetId) {
    throw new Error("Đánh Bang! cần chọn mục tiêu");
  }
  if (action.targetId === player.id) {
    throw new Error("Không thể tự đánh Bang! vào chính mình");
  }
  const target = next.players.find((p) => p.id === action.targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }

  // Việc 5.3 (house rule "require_weapon_for_bang") — bỏ hẳn "súng ngầm định
  // tầm 1" luật gốc, bắt buộc phải có 1 lá súng thật đang trang bị mới đánh
  // Bang! được. getWeaponRange() không phân biệt được 2 ca này (luôn trả về
  // DEFAULT_WEAPON_RANGE khi không có súng) nên phải kiểm riêng ở đây.
  if (next.houseRules.includes("require_weapon_for_bang")) {
    const hasWeaponEquipped = player.equipment.some((id) => isWeaponCardName(cardNameFromId(id)));
    if (!hasWeaponEquipped) {
      throw new Error('Luật bổ sung "bắt buộc có súng mới đánh Bang!" đang bật — chưa trang bị súng nào');
    }
  }

  const range = getWeaponRange(player);
  const extraDistance = next.houseRules.includes("extra_distance") ? 1 : 0;
  const distance = computeDistance(next, player.id, target.id, extraDistance);
  if (distance > range) {
    throw new Error(`Mục tiêu ngoài tầm bắn (khoảng cách ${distance}, tầm súng ${range})`);
  }

  // Luật gốc: chỉ 1 lá Bang!/lượt, trừ khi đang cầm súng Volcanic HOẶC là
  // Willy the Kid (Giai đoạn 5, bỏ giới hạn này luôn dù không cầm Volcanic —
  // xem CharacterDefinition.bypassBangLimit ở core/characters.ts).
  const hasVolcanic = player.equipment.some((id) => cardNameFromId(id) === "volcanic");
  const hasUnlimitedBang = hasVolcanic || getEffectiveCharacterDefinition(next, player)?.bypassBangLimit === true;
  if (next.bangUsedThisTurn && !hasUnlimitedBang) {
    throw new Error("Đã đánh Bang! trong lượt này — cần súng Volcanic mới được đánh thêm lần nữa");
  }
  next.bangUsedThisTurn = true;

  const events: GameEvent[] = [
    { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
  ];

  // Bộ mở rộng "custom_characters" (Mary Rose, xem House_Rule.txt mục I) —
  // đánh Bang! chủ động phải bỏ ĐỦ 2 lá Bang!. Lá THỨ NHẤT (action.cardId) đã
  // rời tay/vào chồng bỏ ở handlePlayCard() TRƯỚC KHI gọi tới đây — chỉ cần
  // tìm và bỏ thêm 1 lá "bang" THỨ 2 còn lại trên tay. Không đủ thì throw
  // NGAY (next chỉ là bản sao cục bộ, throw ở đây không để lại hậu quả gì
  // trên state thật — xem ghi chú ở handlePlayCard()).
  if (getEffectiveCharacterDefinition(next, player)?.requiresTwoBangCardsToShoot === true) {
    const secondBangIndex = player.hand.findIndex((id) => cardNameFromId(id) === "bang");
    if (secondBangIndex === -1) {
      throw new Error("Mary Rose cần bỏ ĐỦ 2 lá Bang! để đánh Bang! chủ động — chỉ có 1 lá");
    }
    const [secondBangId] = player.hand.splice(secondBangIndex, 1);
    next.discardPile.push(secondBangId);
    events.push({ type: "MARY_ROSE_EXTRA_BANG_DISCARDED", playerId: player.id, cardId: secondBangId });
  }

  events.push(...pushMissedReaction(next, target, { card: "bang", from: player.id }, action.cardId));

  return { state: next, events };
}

// Đẩy NEED_MISSED cho mục tiêu; với MỖI nguồn Barrel mục tiêu có (Barrel thật
// trên sân, VÀ/HOẶC Barrel ảo của Jourdonnais — Giai đoạn 5, xem
// core/characters.ts), đẩy thêm 1 NEED_DRAW_CHECK lên TRÊN nó — Barrel tự
// động draw! trước, không cần hỏi Missed! ngay (mục 11/12 file luật). Mỗi lượt
// draw! khớp Cơ CHỈ tính là 1 Missed! (xem đoạn xử lý trong resolveDrawCheck()
// bên dưới) — thường thì 1 là đủ né hết, trừ khi người đánh là Slab the Killer
// (onOutgoingBang, đợt 3): missesNeeded > 1 thì phải đủ từng ấy lượt Missed!
// (Barrel/Jourdonnais/Missed! thật, cộng dồn được) mới né trọn vẹn.
function pushMissedReaction(
  next: GameState,
  target: PlayerState,
  source: { card: string; from: string },
  attackCardId: string
): GameEvent[] {
  // Mở rộng Dodge City, mục C nhóm B (Apache Kid) — lá chất Rô nhắm vào mình.
  // Duel có check RIÊNG ở playDuel() (chỉ tra lá Duel khởi xướng, không đi
  // qua hàm này). Lá đã bị đánh/rời tay ở nơi gọi (handlePlayCard()) — chỉ
  // riêng HIỆU ỨNG (đẩy NEED_MISSED/Barrel draw!) không xảy ra.
  if (getEffectiveCharacterHooks(next, target).isImmuneToCard?.(attackCardId) === true) {
    return [{ type: "APACHE_KID_IMMUNE", playerId: target.id, fromPlayerId: source.from, cardId: attackCardId }];
  }
  return pushMissedReactionUnconditional(next, target, source);
}

// Phần đẩy pending THẬT của pushMissedReaction() — TÁCH RIÊNG (mở rộng Dodge
// City, mục C nhóm C, Doc Holyday) để useDocHolydayShot() dùng lại được sau
// khi TỰ tính miễn nhiễm Apache Kid theo luật RIÊNG của mình (miễn nhiễm khi
// CẢ 2 lá bỏ ra đều chất Rô — khác luật chung "1 lá Rô là đủ" của
// pushMissedReaction() ở trên, nên không thể tái dùng nguyên hàm đó).
function pushMissedReactionUnconditional(
  next: GameState,
  target: PlayerState,
  source: { card: string; from: string }
): GameEvent[] {
  const attacker = next.players.find((p) => p.id === source.from);
  const missesNeeded = (attacker ? getEffectiveCharacterHooks(next, attacker).onOutgoingBang?.() : undefined) ?? 1;

  next.pending.push(
    missesNeeded > 1
      ? { kind: "NEED_MISSED", player: target.id, source, missesNeeded }
      : { kind: "NEED_MISSED", player: target.id, source }
  );

  // Mở rộng Dodge City, mục C nhóm C (Belle Star) — Barrel THẬT (vật lý trên
  // sân) của mục tiêu mất tác dụng nếu đang là lượt Belle Star. Barrel ẢO của
  // Jourdonnais (virtualBarrel) là KHẢ NĂNG nhân vật, không phải "lá bày trước
  // mặt" — không đụng gì, vẫn hoạt động bình thường.
  const targetEquipment = getEffectiveEquipment(next, target);
  const hasRealBarrel = targetEquipment.some((id) => cardNameFromId(id) === "barrel");
  const hasVirtualBarrel = getEffectiveCharacterDefinition(next, target)?.virtualBarrel === true;
  const barrelCheckCount = (hasRealBarrel ? 1 : 0) + (hasVirtualBarrel ? 1 : 0);

  for (let i = 0; i < barrelCheckCount; i++) {
    next.pending.push({
      kind: "NEED_DRAW_CHECK",
      player: target.id,
      source: { card: "barrel" },
      matchSuits: ["hearts"],
    });
  }
  return [];
}

// Gatling: giống Bang! nhưng nhắm vào TẤT CẢ người chơi còn sống khác — mỗi
// người cần Missed! hoặc mất 1 máu, y hệt Bang! thường (tái dùng NEED_MISSED).
// Đẩy theo thứ tự ngược chiều kim đồng hồ để người kế tiếp (gần nhất theo lượt)
// nằm trên đỉnh stack, được xử lý trước.
function playGatling(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const targets = otherAlivePlayersInOrder(next, player.id);
  const immunityEvents: GameEvent[] = [];
  for (let i = targets.length - 1; i >= 0; i--) {
    immunityEvents.push(...pushMissedReaction(next, targets[i], { card: "gatling", from: player.id }, action.cardId));
  }
  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId }, ...immunityEvents],
  };
}

// Indians!: mỗi người chơi khác còn sống phải bỏ 1 lá Bang! hoặc mất 1 máu.
// Cùng cơ chế thứ tự như Gatling, chỉ khác kind pending và lá cần bỏ. Mở rộng
// Dodge City, mục C nhóm B (Apache Kid) — ĐÃ SỬA LẠI theo yêu cầu chủ dự án
// (khác quyết định cũ ghi trong CHANGELOG.md): lá Indians! chất Rô CŨNG miễn
// nhiễm với Apache Kid, y hệt Bang!/Gatling — không còn là ngoại lệ. Bộ bài
// hiện tại không có bản Indians! chất Rô nào (chỉ K♥/A♥/5♥) nên nhánh này
// chưa thể kích hoạt được với dữ liệu bài thật, nhưng vẫn cài đúng chính sách
// chung, giống Gatling/Punch/Jail/Panic! ở trên.
function playIndians(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const targets = otherAlivePlayersInOrder(next, player.id);
  const immunityEvents: GameEvent[] = [];
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (getEffectiveCharacterHooks(next, target).isImmuneToCard?.(action.cardId) === true) {
      immunityEvents.push({
        type: "APACHE_KID_IMMUNE",
        playerId: target.id,
        fromPlayerId: player.id,
        cardId: action.cardId,
      });
      continue;
    }
    next.pending.push({
      kind: "NEED_DISCARD_BANG",
      player: target.id,
      source: { card: "indians", from: player.id },
    });
  }
  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId }, ...immunityEvents],
  };
}

function playDuel(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  if (!action.targetId) {
    throw new Error("Đánh Duel cần chọn mục tiêu");
  }
  if (action.targetId === player.id) {
    throw new Error("Không thể tự thách đấu chính mình");
  }
  const target = next.players.find((p) => p.id === action.targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }

  // Mở rộng Dodge City, mục C nhóm B (Apache Kid) — ĐÃ SỬA LẠI theo yêu cầu
  // chủ dự án (khác quyết định cũ ghi trong Luat_Bang_Mo_Rong_DodgeCity.txt/
  // CHANGELOG.md, vốn nói "Duel không áp dụng miễn nhiễm"): CHỈ tra chất của
  // ĐÚNG lá Duel khởi xướng (action.cardId) — Rô thì miễn nhiễm HẲN, huỷ toàn
  // bộ ván đấu tay đôi ngay từ đầu, không đẩy pending gì cả. Nếu lá Duel
  // KHÔNG phải Rô, ván đấu diễn ra bình thường — chất của TỪNG lá Bang! hai
  // bên bỏ ra lần lượt trong lúc đấu (duelBangDrawPending) KHÔNG bị kiểm tra,
  // vì Apache Kid chỉ miễn nhiễm với lá bài THẬT do người khác trực tiếp đánh
  // nhắm vào mình — trong Duel đó là lá Duel, không phải từng lá Bang! trao đổi.
  if (getEffectiveCharacterHooks(next, target).isImmuneToCard?.(action.cardId) === true) {
    return {
      state: next,
      events: [
        { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
        { type: "APACHE_KID_IMMUNE", playerId: target.id, fromPlayerId: player.id, cardId: action.cardId },
      ],
    };
  }

  // Mở rộng Dodge City, mục C nhóm C (Molly Stark) — reset đầu mỗi ván Duel
  // MỚI, phòng rác còn sót (không nên xảy ra vì Duel luôn giải quyết trọn vẹn
  // trước khi advanceTurn() được phép chạy, nhưng reset cho chắc, đúng quy tắc 3).
  next.duelBangDrawPending = null;

  next.pending.push({
    kind: "NEED_DUEL_RESPONSE",
    player: target.id,
    opponent: player.id,
    source: { card: "duel", from: player.id },
  });

  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id }],
  };
}

// General Store: lật số lá bằng số người còn sống, người đánh bài chọn trước,
// rồi lần lượt từng người theo chiều kim đồng hồ chọn 1 lá cho tới hết.
function playGeneralStore(next: GameState, player: PlayerState, cardId: string): Result {
  const aliveCount = next.players.filter((p) => p.alive).length;
  const revealed: string[] = [];
  for (let i = 0; i < aliveCount; i++) {
    const card = drawTopCard(next);
    if (card) revealed.push(card);
  }

  const events: GameEvent[] = [
    { type: "CARD_PLAYED", playerId: player.id, cardId },
    { type: "STORE_REVEALED", cardIds: revealed },
  ];

  if (revealed.length > 0) {
    next.pending.push({ kind: "NEED_PICK_STORE_CARD", player: player.id, options: revealed });
  }

  return { state: next, events };
}

// Panic!: cướp 1 lá của mục tiêu về tay mình, tức thời (không có pending, đối
// phương không được phản ứng). Ưu tiên bài trên tay — úp, người đánh không biết
// mặt nên chọn NGẪU NHIÊN bằng RNG có seed. Chỉ khi tay mục tiêu đã hết bài mới
// được cướp trên sân (trang bị để ngửa, nhìn thấy tên) — lúc đó người đánh phải
// chỉ định đúng `targetCardId` muốn cướp.
function playPanic(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const target = findLivingTarget(next, player, action.targetId, "Đánh Panic! cần chọn mục tiêu", "Không thể tự cướp bài của chính mình");

  // Việc 5.3 (house rule "extra_distance") — áp dụng ĐÚNG khoảng cách hiệu
  // dụng chung, giống playBang(): tăng "khoảng cách mặc định" ảnh hưởng MỌI
  // lá phụ thuộc khoảng cách, không riêng gì Bang!.
  const extraDistance = next.houseRules.includes("extra_distance") ? 1 : 0;
  const distance = computeDistance(next, player.id, target.id, extraDistance);
  if (distance !== 1) {
    throw new Error(`Panic! chỉ dùng được ở khoảng cách 1 (khoảng cách hiện tại: ${distance})`);
  }

  const stealEvents = applyPanicEffect(next, player, target, action.targetCardId, action.cardId);
  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id }, ...stealEvents],
  };
}

// Thân hiệu ứng thật của Panic! (cướp 1 lá của `target` về tay `player`) —
// tách khỏi playPanic() để dùng lại cho Rag Time (mục 2 file luật Dodge City:
// y hệt Panic! nhưng KHÔNG giới hạn khoảng cách, bỏ kèm 1 lá phụ) và Conestoga
// (bản "delayed" của Panic!, cũng không giới hạn khoảng cách — xem
// activateDelayedEquipment()). Ưu tiên bài trên tay — úp, chọn NGẪU NHIÊN; tay
// hết bài mới cướp được trên sân, phải chỉ định đúng targetCardId.
// `attackCardId` = lá Panic!/Rag Time/Conestoga THẬT đang dùng (mục C nhóm B,
// Apache Kid — kiểm tra chất Rô trước khi áp dụng).
function applyPanicEffect(
  next: GameState,
  player: PlayerState,
  target: PlayerState,
  targetCardId: string | undefined,
  attackCardId: string
): GameEvent[] {
  if (getEffectiveCharacterHooks(next, target).isImmuneToCard?.(attackCardId) === true) {
    return [{ type: "APACHE_KID_IMMUNE", playerId: target.id, fromPlayerId: player.id, cardId: attackCardId }];
  }

  let stolenCardId: string;
  let stolenFromHand = false;

  if (target.hand.length > 0) {
    if (targetCardId) {
      throw new Error("Tay mục tiêu còn bài úp, không được chỉ định lá cụ thể — phải cướp ngẫu nhiên");
    }
    const { value, nextState } = nextRandom(next.rngState);
    next.rngState = nextState;
    const index = Math.floor(value * target.hand.length);
    [stolenCardId] = target.hand.splice(index, 1);
    stolenFromHand = true;
  } else {
    // Dynamite miễn nhiễm Panic! (mục 8 file luật) — loại khỏi cả phép đếm "có
    // gì để cướp không" lẫn danh sách hợp lệ để chọn.
    const stealableEquipment = target.equipment.filter((id) => cardNameFromId(id) !== "dynamite");
    if (stealableEquipment.length === 0) {
      throw new Error("Mục tiêu không còn bài nào để cướp (Dynamite trên sân, nếu có, miễn nhiễm Panic!)");
    }
    if (!targetCardId) {
      throw new Error("Tay mục tiêu đã hết bài, phải chỉ định lá trang bị cụ thể muốn cướp trên sân");
    }
    if (cardNameFromId(targetCardId) === "dynamite") {
      throw new Error("Dynamite miễn nhiễm với Panic!, không thể cướp");
    }
    const equipIndex = target.equipment.indexOf(targetCardId);
    if (equipIndex === -1) {
      throw new Error(`Mục tiêu không có trang bị "${targetCardId}" trên sân`);
    }
    target.equipment.splice(equipIndex, 1);
    // Mở rộng Dodge City (mục 1.1) — lá vừa bị cướp rời equipment, vào TAY
    // người cướp (giveCardToPlayer bên dưới) chứ không còn là trang bị "trì
    // hoãn" đang bày nữa — dọn equipmentPlayedTurn, tự ghi lại đúng lượt nếu
    // sau này họ chơi ra lại (xem playEquipment()).
    delete next.equipmentPlayedTurn[targetCardId];
    stolenCardId = targetCardId;
  }

  // Lá cướp được không bao giờ là Dynamite (miễn nhiễm, chặn ở trên) — nhưng vẫn
  // đi qua giveCardToPlayer() cho nhất quán với mọi nơi khác đưa bài vào tay.
  giveCardToPlayer(next.players, player, stolenCardId);

  const events: GameEvent[] = [{ type: "CARD_STOLEN", playerId: player.id, fromPlayerId: target.id, cardId: stolenCardId }];
  if (stolenFromHand) {
    events.push(...triggerHandEmptyHook(next, target)); // Giai đoạn 5 (Suzy Lafayette)
  }
  return events;
}

// Cat Balou: người đánh chỉ chọn VÙNG (tay hay sân) bắt mục tiêu bỏ bài, không
// chọn lá cụ thể — lá nào bị bỏ do chính mục tiêu chọn, trả lời qua RESPOND. Vì
// vậy đây KHÔNG tức thời, phải đẩy pending chờ mục tiêu chọn.
function playCatBalou(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const target = findLivingTarget(next, player, action.targetId, "Đánh Cat Balou cần chọn mục tiêu", "Không thể tự bắt chính mình bỏ bài");
  if (!action.targetZone) {
    throw new Error("Đánh Cat Balou cần chọn bắt mục tiêu bỏ bài từ tay hay từ sân");
  }

  const immunityEvents = pushDiscardFromZoneReaction(
    next,
    target,
    action.targetZone,
    { card: "cat_balou", from: player.id },
    action.cardId
  );

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
      ...immunityEvents,
    ],
  };
}

// Đẩy NEED_DISCARD_FROM_ZONE cho `target` — tách khỏi playCatBalou() để dùng
// lại cho Brawl (mỗi nạn nhân 1 lần, đẩy theo thứ tự như Gatling) và Can Can
// (mở rộng Dodge City — bản "delayed" của Cat Balou, xem
// activateDelayedEquipment()). Dynamite miễn nhiễm (mục 8 file luật) — không
// tính là "có bài trên sân để bỏ". `attackCardId` = lá Cat Balou/Brawl/Can Can
// THẬT đang dùng (mục C nhóm B, Apache Kid — kiểm tra chất Rô trước khi áp
// dụng, TRƯỚC CẢ kiểm tra "có gì để bỏ không" — miễn nhiễm thì không cần biết).
function pushDiscardFromZoneReaction(
  next: GameState,
  target: PlayerState,
  zone: "hand" | "equipment",
  source: { card: string; from: string },
  attackCardId: string
): GameEvent[] {
  if (getEffectiveCharacterHooks(next, target).isImmuneToCard?.(attackCardId) === true) {
    return [{ type: "APACHE_KID_IMMUNE", playerId: target.id, fromPlayerId: source.from, cardId: attackCardId }];
  }

  const discardableCount =
    zone === "hand" ? target.hand.length : target.equipment.filter((id) => cardNameFromId(id) !== "dynamite").length;
  if (discardableCount === 0) {
    throw new Error(
      zone === "hand"
        ? `Người chơi ${target.id} không còn bài trên tay để bỏ`
        : `Người chơi ${target.id} không có trang bị nào trên sân để bỏ (Dynamite, nếu có, miễn nhiễm)`
    );
  }

  next.pending.push({ kind: "NEED_DISCARD_FROM_ZONE", player: target.id, zone, source });
  return [];
}

// Mở rộng Dodge City, mục 1.2 — bỏ CÙNG LÚC 1 lá phụ bất kỳ từ tay `player`,
// bắt buộc để có hiệu ứng của Brawl/Rag Time/Springfield/Tequila/Whisky. Lá
// CHÍNH đã rời tay + vào chồng bỏ TRƯỚC KHI gọi hàm này (handlePlayCard()) —
// gọi hàm này SỚM trong từng playXxx() để cả 2 lá rời tay TRƯỚC KHI áp hiệu
// ứng (quan trọng với Suzy Lafayette — chỉ kiểm tra tay rỗng SAU lần rời tay
// này, không phải giữa chừng). Trả về event "tay vừa về 0" của CHÍNH lần rời
// tay này — lần rời tay của lá CHÍNH đã được handlePlayCard() kiểm riêng rồi,
// không trùng lặp (hand chỉ thật sự về 0 sau lần bỏ THỨ HAI này, nếu có).
function discardExtraCard(
  next: GameState,
  player: PlayerState,
  cardDisplayName: string,
  extraDiscardCardId: string | undefined
): GameEvent[] {
  if (!extraDiscardCardId) {
    throw new Error(`Đánh "${cardDisplayName}" cần bỏ kèm 1 lá phụ bất kỳ khác từ tay`);
  }
  const index = player.hand.indexOf(extraDiscardCardId);
  if (index === -1) {
    throw new Error(`Lá phụ "${extraDiscardCardId}" không nằm trong tay của bạn`);
  }
  player.hand.splice(index, 1);
  next.discardPile.push(extraDiscardCardId);
  return triggerHandEmptyHook(next, player); // Giai đoạn 5 (Suzy Lafayette)
}

// Brawl (mở rộng Dodge City) — bỏ kèm 1 lá phụ (mục 1.2), TẤT CẢ người chơi
// khác còn sống phải bỏ 1 lá do NGƯỜI ĐÁNH chỉ định VÙNG (tay/sân — action
// .brawlZones, khoá theo playerId nạn nhân, có thể khác nhau cho từng người),
// lá cụ thể trong vùng đó do chính nạn nhân chọn (RESPOND, y hệt Cat Balou).
// Đẩy pending riêng cho TỪNG nạn nhân theo thứ tự, giống cách Gatling đẩy
// nhiều NEED_MISSED liên tiếp — người kế tiếp (gần nhất theo lượt) nằm trên
// đỉnh stack, được xử lý trước.
function playBrawl(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const extraEvents = discardExtraCard(next, player, "brawl", action.extraDiscardCardId);

  const targets = otherAlivePlayersInOrder(next, player.id);
  const zones = action.brawlZones ?? {};
  const immunityEvents: GameEvent[] = [];
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    const zone = zones[target.id];
    if (!zone) {
      throw new Error(`Đánh Brawl cần chọn vùng bỏ bài (tay/sân) cho người chơi ${target.id}`);
    }
    immunityEvents.push(
      ...pushDiscardFromZoneReaction(next, target, zone, { card: "brawl", from: player.id }, action.cardId)
    );
  }

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId },
      ...extraEvents,
      ...immunityEvents,
    ],
  };
}

// Punch (mở rộng Dodge City) — hiệu ứng như Bang! nhắm người ở khoảng cách 1,
// BẤT KỂ súng đang cầm (bỏ qua getWeaponRange() hoàn toàn); KHÔNG tính vào
// giới hạn 1 Bang!/lượt (mục 1.4 — không đụng next.bangUsedThisTurn).
function playPunch(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const target = findLivingTarget(next, player, action.targetId, "Đánh Punch cần chọn mục tiêu", "Không thể tự đánh Punch vào chính mình");

  const extraDistance = next.houseRules.includes("extra_distance") ? 1 : 0;
  const distance = computeDistance(next, player.id, target.id, extraDistance);
  if (distance > 1) {
    throw new Error(`Punch chỉ dùng được ở khoảng cách 1 (khoảng cách hiện tại: ${distance})`);
  }

  const immunityEvents = pushMissedReaction(next, target, { card: "punch", from: player.id }, action.cardId);

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
      ...immunityEvents,
    ],
  };
}

// Rag Time (mở rộng Dodge City) — bỏ kèm 1 lá phụ (mục 1.2), hiệu ứng y hệt
// Panic! (applyPanicEffect()) nhưng KHÔNG giới hạn khoảng cách (*dev note của
// chủ dự án trong Luat_Bang_Mo_Rong_DodgeCity.txt, mục 2).
function playRagTime(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const target = findLivingTarget(next, player, action.targetId, "Đánh Rag Time cần chọn mục tiêu", "Không thể tự cướp bài của chính mình");
  const extraEvents = discardExtraCard(next, player, "rag_time", action.extraDiscardCardId);
  const stealEvents = applyPanicEffect(next, player, target, action.targetCardId, action.cardId);

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
      ...extraEvents,
      ...stealEvents,
    ],
  };
}

// Springfield (mở rộng Dodge City) — bỏ kèm 1 lá phụ (mục 1.2), hiệu ứng Bang!
// nhắm 1 người BẤT KỲ, bất kể khoảng cách/tầm súng (KHÔNG kiểm tra khoảng cách
// gì cả — khác Punch, cố định khoảng cách 1); không tính vào giới hạn 1
// Bang!/lượt.
function playSpringfield(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const target = findLivingTarget(next, player, action.targetId, "Đánh Springfield cần chọn mục tiêu", "Không thể tự đánh Springfield vào chính mình");
  const extraEvents = discardExtraCard(next, player, "springfield", action.extraDiscardCardId);

  const immunityEvents = pushMissedReaction(next, target, { card: "springfield", from: player.id }, action.cardId);

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
      ...extraEvents,
      ...immunityEvents,
    ],
  };
}

// Tequila (mở rộng Dodge City) — bỏ kèm 1 lá phụ (mục 1.2), chọn 1 người BẤT
// KỲ (kể cả chính mình) để hồi ngay 1 máu (không vượt máu tối đa). KHÁC
// findLivingTarget() ở chỗ CHO PHÉP tự chọn chính mình.
function playTequila(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  if (!action.targetId) {
    throw new Error("Đánh Tequila cần chọn người được hồi máu");
  }
  const target = next.players.find((p) => p.id === action.targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }

  const extraEvents = discardExtraCard(next, player, "tequila", action.extraDiscardCardId);

  const events: GameEvent[] = [
    { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
    ...extraEvents,
  ];
  const restored = Math.min(1, target.maxHp - target.hp);
  if (restored > 0) {
    target.hp += restored;
    events.push({ type: "HP_RESTORED", playerId: target.id, amount: restored });
  }

  return { state: next, events };
}

// Whisky (mở rộng Dodge City) — bỏ kèm 1 lá phụ (mục 1.2) để TỰ hồi 2 máu.
// Chỉ chơi được trong lượt của chính mình — KHÔNG có ngoại lệ "dùng ngoài lượt
// lúc sắp chết" như Beer (đã tự động đúng: handlePlayCard() luôn bắt buộc
// assertCurrentPlayer(), không có đường nào gọi playWhisky() ngoài lượt).
function playWhisky(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const extraEvents = discardExtraCard(next, player, "whisky", action.extraDiscardCardId);

  const events: GameEvent[] = [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId }, ...extraEvents];
  const restored = Math.min(2, player.maxHp - player.hp);
  if (restored > 0) {
    player.hp += restored;
    events.push({ type: "HP_RESTORED", playerId: player.id, amount: restored });
  }

  return { state: next, events };
}

// Đánh lá xanh: nằm lại trên sân (equipment) chứ không vào chồng bỏ.
// - Súng: loại trừ theo NHÓM — chỉ được 1 khẩu, đánh khẩu mới thì gỡ khẩu cũ
//   (bất kể tên khẩu cũ là gì) rồi mới gắn khẩu mới.
// - Các lá xanh khác: áp luật chung "không 2 lá CÙNG TÊN trước mặt".
// Không giới hạn tổng số lá xanh trên sân — miễn không trùng tên (và súng chỉ 1).
function playEquipment(
  next: GameState,
  player: PlayerState,
  cardId: string,
  cardName: CardName
): Result {
  const events: GameEvent[] = [{ type: "CARD_PLAYED", playerId: player.id, cardId }];

  if (isWeaponCardName(cardName)) {
    const oldWeaponIndex = player.equipment.findIndex((id) => isWeaponCardName(cardNameFromId(id)));
    if (oldWeaponIndex !== -1) {
      const [oldWeaponId] = player.equipment.splice(oldWeaponIndex, 1);
      next.discardPile.push(oldWeaponId);
      events.push({ type: "WEAPON_REPLACED", playerId: player.id, oldCardId: oldWeaponId });
    }
  } else if (player.equipment.some((id) => cardNameFromId(id) === cardName)) {
    throw new Error(`Đã có "${cardName}" trước mặt, không thể đánh thêm lá cùng tên`);
  }

  player.equipment.push(cardId);

  // Mở rộng Dodge City (mục 1.1) — lá "trì hoãn" ghi nhớ lượt vừa được chơi
  // ra, để chặn kích hoạt ngay trong CHÍNH lượt này (xem
  // activateDelayedEquipment()/respondToMissed()). Lá "instant" (xanh dương
  // thường) không cần gì ở đây — dùng được ngay.
  if (isDelayedEquipmentCardName(cardName)) {
    next.equipmentPlayedTurn[cardId] = next.turnNumber;
  }

  return { state: next, events };
}

// Mở rộng Dodge City (mục 1.1, nhóm KHÔNG có ký hiệu Missed!: Canteen, Pony
// Express, Derringer, Conestoga, Can Can, Buffalo Rifle, Knife, Pepperbox,
// Howitzer) — bỏ 1 lá trang bị "trì hoãn" ĐÃ BÀY SẴN từ lượt trước để kích
// hoạt hiệu ứng CHỦ ĐỘNG của nó. Nhóm CÓ ký hiệu Missed! (Bible/Sombrero/Ten
// Gallon Hat/Iron Plate) KHÔNG đi qua đây — chúng chỉ dùng để PHẢN ỨNG qua
// RESPOND (xem respondToMissed()), tự chặn ngay dưới nếu ai lỡ gọi PLAY_CARD.
// Nhận cả `action` (không chỉ cardId) vì các lá đợt 2 cần targetId/
// targetCardId/targetZone — cùng khuôn field đã có sẵn trên PLAY_CARD.
function activateDelayedEquipment(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" },
  cardName: YellowCardName
): Result {
  const cardId = action.cardId;
  if (yellowCardActsAsMissed(cardName)) {
    throw new Error(`"${cardName}" chỉ dùng được để đỡ Bang!/Gatling (như Missed!), không thể tự đánh ra`);
  }
  if (next.equipmentPlayedTurn[cardId] === next.turnNumber) {
    throw new Error(`Chưa thể dùng "${cardName}" — phải chờ ít nhất 1 lượt sau khi đánh ra mới được kích hoạt`);
  }

  const equipIndex = player.equipment.indexOf(cardId);
  player.equipment.splice(equipIndex, 1);
  delete next.equipmentPlayedTurn[cardId];
  next.discardPile.push(cardId);

  const events: GameEvent[] = [{ type: "DELAYED_EQUIPMENT_ACTIVATED", playerId: player.id, cardId }];
  const extraDistance = next.houseRules.includes("extra_distance") ? 1 : 0;

  switch (cardName) {
    case "canteen": {
      const restored = Math.min(1, player.maxHp - player.hp);
      if (restored > 0) {
        player.hp += restored;
        events.push({ type: "HP_RESTORED", playerId: player.id, amount: restored });
      }
      break;
    }
    case "pony_express": {
      const drawnCount = drawCardsForPlayer(next, player, 3);
      events.push({ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount });
      break;
    }
    // Đợt 2 — Derringer/Knife/Pepperbox/Buffalo Rifle/Howitzer: hiệu ứng Bang!
    // KHÔNG có ký hiệu Missed!, KHÔNG tính vào giới hạn 1 Bang!/lượt (mục 1.4).
    case "derringer": {
      const target = findLivingTarget(next, player, action.targetId, "Kích hoạt Derringer cần chọn mục tiêu", "Không thể tự đánh Derringer vào chính mình");
      const distance = computeDistance(next, player.id, target.id, extraDistance);
      if (distance > 1) {
        throw new Error(`Derringer chỉ dùng được ở khoảng cách 1 (khoảng cách hiện tại: ${distance})`);
      }
      // Luôn rút thêm 1 lá khi dùng, BẤT KỂ mục tiêu có đỡ được hay không (đã
      // chốt với chủ dự án — rút là phần thưởng cho hành động DÙNG lá, không
      // phụ thuộc kết quả trúng/né, nên rút NGAY ở đây, không đợi resolve xong
      // NEED_MISSED bên dưới).
      const drawnCount = drawCardsForPlayer(next, player, 1);
      if (drawnCount > 0) events.push({ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount });
      events.push(...pushMissedReaction(next, target, { card: "derringer", from: player.id }, cardId));
      break;
    }
    case "knife": {
      const target = findLivingTarget(next, player, action.targetId, "Kích hoạt Knife cần chọn mục tiêu", "Không thể tự đánh Knife vào chính mình");
      const distance = computeDistance(next, player.id, target.id, extraDistance);
      if (distance > 1) {
        throw new Error(`Knife chỉ dùng được ở khoảng cách 1 (khoảng cách hiện tại: ${distance})`);
      }
      events.push(...pushMissedReaction(next, target, { card: "knife", from: player.id }, cardId));
      break;
    }
    case "pepperbox": {
      // Đúng TẦM SÚNG đang cầm (khác Buffalo Rifle — bỏ qua tầm hoàn toàn) —
      // đây là điểm phân biệt 2 lá súng "delayed" này (đã chốt với chủ dự án).
      const target = findLivingTarget(next, player, action.targetId, "Kích hoạt Pepperbox cần chọn mục tiêu", "Không thể tự đánh Pepperbox vào chính mình");
      const range = getWeaponRange(player);
      const distance = computeDistance(next, player.id, target.id, extraDistance);
      if (distance > range) {
        throw new Error(`Mục tiêu ngoài tầm bắn của Pepperbox (khoảng cách ${distance}, tầm súng ${range})`);
      }
      events.push(...pushMissedReaction(next, target, { card: "pepperbox", from: player.id }, cardId));
      break;
    }
    case "buffalo_rifle": {
      const target = findLivingTarget(next, player, action.targetId, "Kích hoạt Buffalo Rifle cần chọn mục tiêu", "Không thể tự đánh Buffalo Rifle vào chính mình");
      events.push(...pushMissedReaction(next, target, { card: "buffalo_rifle", from: player.id }, cardId));
      break;
    }
    case "howitzer": {
      // Bắn TẤT CẢ người khác cùng lúc, bất kể khoảng cách — bản "delayed" của
      // Gatling (đã chốt với chủ dự án).
      const targets = otherAlivePlayersInOrder(next, player.id);
      for (let i = targets.length - 1; i >= 0; i--) {
        events.push(...pushMissedReaction(next, targets[i], { card: "howitzer", from: player.id }, cardId));
      }
      break;
    }
    // Đợt 2 — Conestoga/Can Can: bản "delayed" của Panic!/Cat Balou, KHÔNG
    // giới hạn khoảng cách (đã chốt với chủ dự án).
    case "conestoga": {
      const target = findLivingTarget(next, player, action.targetId, "Kích hoạt Conestoga cần chọn mục tiêu", "Không thể tự cướp bài của chính mình bằng Conestoga");
      events.push(...applyPanicEffect(next, player, target, action.targetCardId, cardId));
      break;
    }
    case "can_can": {
      const target = findLivingTarget(next, player, action.targetId, "Kích hoạt Can Can cần chọn mục tiêu", "Không thể tự bắt chính mình bỏ bài bằng Can Can");
      if (!action.targetZone) {
        throw new Error("Kích hoạt Can Can cần chọn bắt mục tiêu bỏ bài từ tay hay từ sân");
      }
      events.push(
        ...pushDiscardFromZoneReaction(next, target, action.targetZone, { card: "can_can", from: player.id }, cardId)
      );
      break;
    }
    case "bible":
    case "sombrero":
    case "ten_gallon_hat":
    case "iron_plate": {
      // Đã bị chặn ở kiểm tra yellowCardActsAsMissed() phía trên — nhánh này
      // không bao giờ chạy tới, chỉ để switch xét đủ YellowCardName (TypeScript
      // exhaustive check bên dưới sẽ báo lỗi biên dịch nếu quên xử lý lá mới).
      throw new Error(`"${cardName}" không có hiệu ứng chủ động`);
    }
    default: {
      const neverCardName: never = cardName;
      throw new Error(`Chưa cài đặt kích hoạt cho lá trang bị trì hoãn: ${JSON.stringify(neverCardName)}`);
    }
  }

  return { state: next, events };
}

// Jail: gắn lên sân NGƯỜI KHÁC (không phải người đánh) — khác hẳn playEquipment
// ở trên. KHÔNG BAO GIỜ được đánh lên Cảnh sát trưởng (mục 8 file luật) — đây
// là chốt chặn DUY NHẤT nơi Jail có thể được gắn lên ai đó (Jail không có
// đường nào khác lên sân, không tự động như Dynamite), nên chặn ở đây là chặn
// triệt để.
function playJail(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const target = findLivingTarget(next, player, action.targetId, "Đánh Jail cần chọn mục tiêu", "Không thể tự đánh Jail lên chính mình");

  if (target.role === "sheriff") {
    throw new Error("Không được đánh Jail lên Cảnh sát trưởng");
  }
  if (target.equipment.some((id) => cardNameFromId(id) === "jail")) {
    throw new Error("Mục tiêu đã có Jail trước mặt, không thể đánh thêm");
  }
  // Mở rộng Dodge City, mục C nhóm B (Apache Kid) — đã hỏi lại và chốt: Jail
  // chất Rô KHÔNG THỂ gắn lên Apache Kid, chặn NGAY LÚC ĐÁNH (khác Bang!-like/
  // Cat Balou/Panic! — lá vẫn "dùng" được nhưng vô hiệu; Jail thì bị từ chối
  // hẳn, y hệt cách chặn Cảnh sát trưởng ở trên).
  if (getEffectiveCharacterHooks(next, target).isImmuneToCard?.(action.cardId) === true) {
    throw new Error("Apache Kid miễn nhiễm với lá chất Rô — không thể đánh Jail chất Rô lên người này");
  }
  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // KHÔNG bị nhốt tù trong lúc Miễn Tử (ngoại lệ DUY NHẤT — mọi lá khác vẫn
  // nhắm tới cô bình thường, chỉ riêng Jail bị chặn hẳn NGAY LÚC ĐÁNH, y hệt
  // cách chặn Apache Kid/Cảnh sát trưởng ở trên — KHÔNG dùng isImmuneToCard
  // vì hook đó PURE, không biết state để phân biệt "đang Miễn Tử hay không").
  if (
    getEffectiveCharacterDefinition(next, target)?.canArmImmortality === true &&
    next.elenaNoirImmortalTurnsLeft[target.id] !== undefined
  ) {
    throw new Error("Elena Noir đang trong trạng thái Miễn Tử, không thể bị nhốt tù");
  }

  target.equipment.push(action.cardId);

  const events: GameEvent[] = [
    { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
  ];

  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
  // — vừa bị nhốt tù xong, LẬP TỨC chọn 1 người chơi khác còn sống bất kỳ
  // (không giới hạn khoảng cách, kể cả chính người vừa đánh Jail) để "cùng vào
  // tù" — đẩy pending NGAY trước khi trả về, y hệt cơ chế Missed!/mượn khả
  // năng Vera Custer. Luôn có ít nhất 1 ứng viên (chí ít là `player` vừa đánh).
  if (getEffectiveCharacterDefinition(next, target)?.canJailCompanion === true) {
    next.pending.push({ kind: "NEED_PICK_MARCEL_COMPANION", player: target.id });
  }

  return { state: next, events };
}

function findLivingTarget(
  next: GameState,
  player: PlayerState,
  targetId: string | undefined,
  missingTargetMessage: string,
  selfTargetMessage: string
): PlayerState {
  if (!targetId) {
    throw new Error(missingTargetMessage);
  }
  if (targetId === player.id) {
    throw new Error(selfTargetMessage);
  }
  const target = next.players.find((p) => p.id === targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }
  return target;
}

// Danh sách người chơi còn sống khác, theo thứ tự chiều kim đồng hồ bắt đầu
// ngay sau `attackerId`. Tái dùng nextAlivePlayerIndex nên tự động bỏ qua
// người đã chết.
function otherAlivePlayersInOrder(state: GameState, attackerId: string): PlayerState[] {
  const startIndex = state.players.findIndex((p) => p.id === attackerId);
  const result: PlayerState[] = [];
  let index = startIndex;
  while (true) {
    index = nextAlivePlayerIndex(state, index);
    if (index === startIndex) break;
    result.push(state.players[index]);
  }
  return result;
}

// Đã đầy máu thì Bia KHÔNG THỂ có tác dụng gì trong MỌI trường hợp (không như
// ngoại lệ "chỉ còn 2 người sống" — cái đó vẫn có thể TẮT qua house rule
// "beer_below_two", còn "đã đầy máu" thì không có điều kiện đặc biệt nào bù
// lại được) — từ chối luôn action này (throw, giống cách playBang() từ chối
// đánh Bang! thứ 2/lượt), KHÔNG cho đánh ra rồi lãng phí trong im lặng như
// trước. CHỈ chặn đúng việc TỰ ĐÁNH Bia để hồi máu (hàm này) — KHÔNG ảnh
// hưởng gì tới việc dùng lá Bia làm "lá phụ" bỏ kèm cho Brawl/Rag Time/
// Springfield/Tequila/Whisky (mở rộng Dodge City, mục 1.2) hay bất kỳ chỗ nào
// khác chỉ cần bỏ 1 lá bất kỳ khỏi tay (Cat Balou, Sid Ketchum...) — những chỗ
// đó không đi qua hàm này, không quan tâm lá bị bỏ là gì.
function assertBeerCanHeal(player: PlayerState): void {
  if (player.hp >= player.maxHp) {
    throw new Error("Đã đầy máu — không thể đánh Bia (không còn tác dụng gì để hồi)");
  }
}

// Bia vô tác dụng khi chỉ còn 2 người sống (luật gốc — ép ván 1-chọi-1 phải
// có kết quả, không ai tự hồi máu vô hạn). Lá vẫn bị bỏ vào chồng bỏ như bình
// thường (đã làm ở handlePlayCard() TRƯỚC KHI gọi hàm này) — chỉ riêng hiệu
// ứng hồi máu là không xảy ra, không phải "không đánh được lá này".
function playBeer(next: GameState, player: PlayerState, cardId: string): Result {
  assertBeerCanHeal(player);

  const events: GameEvent[] = [{ type: "CARD_PLAYED", playerId: player.id, cardId }];

  const aliveCount = next.players.filter((p) => p.alive).length;
  // Việc 5.3 (house rule "beer_below_two") — bỏ hẳn ngoại lệ "còn 2 người
  // sống" của luật gốc, coi như luôn đủ điều kiện hồi máu.
  const beerWorksBelowTwo = next.houseRules.includes("beer_below_two");
  if (aliveCount > 2 || beerWorksBelowTwo) {
    // Mở rộng Dodge City, mục C nhóm B (Tequila Joe) — modifyHealAmount CHỈ
    // áp dụng ở ĐÂY (đúng lời chốt "chỉ Beer hồi 2, các lá hồi máu khác vẫn 1").
    const baseHeal = getEffectiveCharacterHooks(next, player).modifyHealAmount?.("beer", 1) ?? 1;
    const restored = Math.min(baseHeal, player.maxHp - player.hp);
    if (restored > 0) {
      player.hp += restored;
      events.push({ type: "HP_RESTORED", playerId: player.id, amount: restored });
    }
  } else {
    // Báo cho người chơi biết rõ lá vừa đánh KHÔNG có tác dụng gì (khác im
    // lặng như trước) — chỉ còn 2 người sống, không phải do đã đầy máu.
    events.push({ type: "BEER_INEFFECTIVE", playerId: player.id });
  }

  return { state: next, events };
}

function playSaloon(next: GameState, player: PlayerState, cardId: string): Result {
  const events: GameEvent[] = [{ type: "CARD_PLAYED", playerId: player.id, cardId }];

  for (const target of next.players) {
    if (!target.alive) continue;
    const restored = Math.min(1, target.maxHp - target.hp);
    if (restored > 0) {
      target.hp += restored;
      events.push({ type: "HP_RESTORED", playerId: target.id, amount: restored });
    }
  }

  return { state: next, events };
}

function playStagecoach(next: GameState, player: PlayerState, cardId: string): Result {
  return drawCardsAsCardEffect(next, player, cardId, 2);
}

function playWellsFargo(next: GameState, player: PlayerState, cardId: string): Result {
  return drawCardsAsCardEffect(next, player, cardId, 3);
}

function drawCardsAsCardEffect(
  next: GameState,
  player: PlayerState,
  cardId: string,
  count: number
): Result {
  const drawnCount = drawCardsForPlayer(next, player, count);

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId },
      { type: "CARDS_DRAWN", playerId: player.id, count: drawnCount },
    ],
  };
}

// Rút đúng `count` lá từ bộ bài cho `player` (tự xào chồng bỏ nếu cạn giữa
// chừng, xem drawTopCard() ở core/deck.ts), trả về SỐ LÁ THẬT SỰ rút được
// (có thể ít hơn count nếu deck+chồng bỏ CÙNG cạn — cực hiếm). Tách riêng
// khỏi drawCardsAsCardEffect() để dùng lại cho Pony Express (mở rộng Dodge
// City) — lá đó không "đánh ra" từ tay nên không cần bắn CARD_PLAYED.
function drawCardsForPlayer(next: GameState, player: PlayerState, count: number): number {
  let drawnCount = 0;
  for (let i = 0; i < count; i++) {
    const card = drawTopCard(next);
    if (card) {
      giveCardToPlayer(next.players, player, card);
      drawnCount++;
    }
  }
  return drawnCount;
}

// Kỹ năng CHỦ ĐỘNG dùng CHUNG action USE_ABILITY cho 3 nhân vật khác nhau —
// tự nhánh theo field tĩnh nào có mặt trên CharacterDefinition (mỗi người chỉ
// có ĐÚNG 1 nhân vật nên không lo đụng nhau). Xem ghi chú chi tiết từng nhánh
// ở 3 hàm con bên dưới.
function handleUseAbility(state: GameState, action: Action & { type: "USE_ABILITY" }): Result {
  const player = state.players.find((p) => p.id === action.playerId);
  // Bất biến: alive => hp > 0 (xem eliminatePlayer()) — không cần kiểm tra hp
  // riêng, chỉ cần loại người chơi không tồn tại/đã chết.
  if (!player || !player.alive) {
    throw new Error("Người chơi không hợp lệ hoặc đã chết");
  }

  // Mở rộng Dodge City, mục C nhóm C (Vera Custer) — getEffectiveCharacterDefinition()
  // thay getCharacterDefinition(player.characterId) trực tiếp, để mượn được
  // CẢ kỹ năng chủ động (Sid Ketchum/Chuck Wengam/José Delgado/Doc Holyday).
  const definition = getEffectiveCharacterDefinition(state, player);
  if (definition?.canSelfHeal === true) return useSidKetchumHeal(state, action, player);
  if (definition?.canPayLifeToDraw === true) return useChuckWengamTrade(state, action, player);
  if (definition?.canDiscardEquipmentToDraw === true) return useJoseDelgadoTrade(state, action, player);
  if (definition?.canDiscardTwoForBang === true) return useDocHolydayShot(state, action, player);
  throw new Error("Nhân vật này không có kỹ năng chủ động này");
}

// Giai đoạn 5 (Sid Ketchum, đợt 7) — kỹ năng CHỦ ĐỘNG, dùng được BẤT CỨ LÚC
// NÀO: KHÔNG gọi assertCurrentPlayer()/kiểm tra state.pending.length như mọi
// action khác (cố tình — đây là điểm khác biệt duy nhất của action này so
// với phần còn lại của reduce.ts). Chỉ đổi hand/discardPile/hp của CHÍNH
// player này — không đụng gì tới lượt/pending/turnPhase của bất kỳ ai, kể cả
// khi dùng lúc không phải lượt/phản ứng của mình.
function useSidKetchumHeal(state: GameState, action: Action & { type: "USE_ABILITY" }, player: PlayerState): Result {
  const next = cloneState(state);
  const nextPlayer = next.players.find((p) => p.id === player.id)!;

  const [cardId1, cardId2] = action.cardIds;
  if (cardId1 === undefined || cardId2 === undefined || action.cardIds.length !== 2 || cardId1 === cardId2) {
    throw new Error("Phải chọn ĐÚNG 2 lá KHÁC NHAU để bỏ");
  }
  const index1 = nextPlayer.hand.indexOf(cardId1);
  const index2 = nextPlayer.hand.indexOf(cardId2);
  if (index1 === -1 || index2 === -1) {
    throw new Error("Cả 2 lá phải nằm trong tay của chính bạn");
  }

  // Bỏ theo chỉ số GIẢM DẦN để splice() không làm lệch chỉ số của nhau.
  for (const index of [index1, index2].sort((a, b) => b - a)) {
    const [cardId] = nextPlayer.hand.splice(index, 1);
    next.discardPile.push(cardId);
  }

  const handEmptyEvents = triggerHandEmptyHook(next, nextPlayer); // Giai đoạn 5 (Suzy Lafayette)

  const restored = Math.min(1, nextPlayer.maxHp - nextPlayer.hp);
  nextPlayer.hp += restored;

  return {
    state: next,
    events: [
      { type: "SID_KETCHUM_HEALED", playerId: nextPlayer.id, cardIds: [cardId1, cardId2], amount: restored },
      ...handEmptyEvents,
    ],
  };
}

// Mở rộng Dodge City, mục C nhóm A (Chuck Wengam) — CHỈ dùng được TRONG lượt
// của chính mình (khác Sid Ketchum), lặp lại được nhiều lần trong CÙNG 1
// lượt: mất 1 máu để rút 2 lá, chặn nếu chỉ còn đúng 1 máu (không được tự sát
// bằng cách này). Không bỏ lá nào — `action.cardIds` phải rỗng.
function useChuckWengamTrade(
  state: GameState,
  action: Action & { type: "USE_ABILITY" },
  player: PlayerState
): Result {
  assertCurrentPlayer(state, player.id);
  assertPhase(state, "play");
  if (state.pending.length > 0) {
    throw new Error("Không thể dùng kỹ năng khi còn việc đang chờ xử lý");
  }
  if (action.cardIds.length > 0) {
    throw new Error("Kỹ năng này không cần bỏ lá nào — chỉ tốn máu");
  }
  if (player.hp <= 1) {
    throw new Error("Không thể mất máu cuối cùng theo cách này");
  }

  const next = cloneState(state);
  const nextPlayer = next.players.find((p) => p.id === player.id)!;

  nextPlayer.hp -= 1;
  const drawnCount = drawCardsForPlayer(next, nextPlayer, DRAW_COUNT);

  return {
    state: next,
    events: [{ type: "CHUCK_WENGAM_TRADED_LIFE", playerId: nextPlayer.id, count: drawnCount }],
  };
}

// Mở rộng Dodge City, mục C nhóm A (José Delgado) — CHỈ dùng được TRONG lượt
// của chính mình (khác Sid Ketchum), tối đa 2 LẦN/lượt (đếm bằng
// GameState.joseDelgadoUsesThisTurn, reset ở advanceTurn()): bỏ ĐÚNG 1 lá
// xanh dương (equipment "instant" — isSelfEquipBlueCardName(), KHÔNG tính lá
// vàng "delayed", đã chốt ở LO-TRINH.md "Ghi chú cho 5.4" mục C.8) từ tay để
// rút 2 lá.
function useJoseDelgadoTrade(
  state: GameState,
  action: Action & { type: "USE_ABILITY" },
  player: PlayerState
): Result {
  assertCurrentPlayer(state, player.id);
  assertPhase(state, "play");
  if (state.pending.length > 0) {
    throw new Error("Không thể dùng kỹ năng khi còn việc đang chờ xử lý");
  }
  if (state.joseDelgadoUsesThisTurn >= 2) {
    throw new Error("Đã dùng kỹ năng này đủ 2 lần trong lượt này");
  }
  const [cardId] = action.cardIds;
  if (cardId === undefined || action.cardIds.length !== 1) {
    throw new Error("Phải chọn ĐÚNG 1 lá xanh dương để bỏ");
  }
  const cardIndex = player.hand.indexOf(cardId);
  if (cardIndex === -1) {
    throw new Error("Lá này phải nằm trong tay của chính bạn");
  }
  if (!isSelfEquipBlueCardName(cardNameFromId(cardId))) {
    throw new Error("Chỉ được bỏ lá xanh dương (trang bị) cho kỹ năng này, không tính lá vàng");
  }

  const next = cloneState(state);
  const nextPlayer = next.players.find((p) => p.id === player.id)!;

  const [discardedCardId] = nextPlayer.hand.splice(nextPlayer.hand.indexOf(cardId), 1);
  next.discardPile.push(discardedCardId);
  const handEmptyEvents = triggerHandEmptyHook(next, nextPlayer); // Giai đoạn 5 (Suzy Lafayette)

  next.joseDelgadoUsesThisTurn += 1;
  const drawnCount = drawCardsForPlayer(next, nextPlayer, DRAW_COUNT);

  return {
    state: next,
    events: [
      { type: "JOSE_DELGADO_TRADED_EQUIPMENT", playerId: nextPlayer.id, cardId: discardedCardId, count: drawnCount },
      ...handEmptyEvents,
    ],
  };
}

// Mở rộng Dodge City, mục C nhóm C (Doc Holyday) — CHỈ dùng được TRONG lượt
// của chính mình (khác Sid Ketchum), tối đa 1 LẦN/lượt: bỏ ĐÚNG 2 lá KHÁC
// NHAU bất kỳ (không cần cùng tên, khác José Delgado) để bắn hiệu ứng Bang!
// nhắm `action.targetId` (bắt buộc), trong tầm súng đang cầm, KHÔNG tính vào
// giới hạn 1 Bang!/lượt (không đụng next.bangUsedThisTurn).
function useDocHolydayShot(
  state: GameState,
  action: Action & { type: "USE_ABILITY" },
  player: PlayerState
): Result {
  assertCurrentPlayer(state, player.id);
  assertPhase(state, "play");
  if (state.pending.length > 0) {
    throw new Error("Không thể dùng kỹ năng khi còn việc đang chờ xử lý");
  }
  if (state.docHolydayUsedThisTurn) {
    throw new Error("Đã dùng kỹ năng này trong lượt này");
  }
  const [cardId1, cardId2] = action.cardIds;
  if (cardId1 === undefined || cardId2 === undefined || action.cardIds.length !== 2 || cardId1 === cardId2) {
    throw new Error("Phải chọn ĐÚNG 2 lá KHÁC NHAU để bỏ");
  }
  const index1 = player.hand.indexOf(cardId1);
  const index2 = player.hand.indexOf(cardId2);
  if (index1 === -1 || index2 === -1) {
    throw new Error("Cả 2 lá phải nằm trong tay của chính bạn");
  }
  if (!action.targetId) {
    throw new Error("Kỹ năng này cần chọn mục tiêu");
  }
  if (action.targetId === player.id) {
    throw new Error("Không thể tự nhắm vào chính mình");
  }
  const target = state.players.find((p) => p.id === action.targetId);
  if (!target || !target.alive) {
    throw new Error("Mục tiêu không hợp lệ");
  }
  const range = getWeaponRange(player);
  const extraDistance = state.houseRules.includes("extra_distance") ? 1 : 0;
  const distance = computeDistance(state, player.id, target.id, extraDistance);
  if (distance > range) {
    throw new Error(`Mục tiêu ngoài tầm bắn (khoảng cách ${distance}, tầm súng ${range})`);
  }

  const next = cloneState(state);
  const nextPlayer = next.players.find((p) => p.id === player.id)!;
  const nextTarget = next.players.find((p) => p.id === target.id)!;

  // Bỏ theo chỉ số GIẢM DẦN để splice() không làm lệch chỉ số của nhau.
  for (const index of [index1, index2].sort((a, b) => b - a)) {
    const [cardId] = nextPlayer.hand.splice(index, 1);
    next.discardPile.push(cardId);
  }
  const handEmptyEvents = triggerHandEmptyHook(next, nextPlayer); // Giai đoạn 5 (Suzy Lafayette)
  next.docHolydayUsedThisTurn = true;

  // Apache Kid: miễn nhiễm CHỈ khi CẢ 2 lá bỏ ra đều chất Rô — khác luật
  // chung "1 lá Rô là đủ" của isImmuneToCard/pushMissedReaction() (đã hỏi lại
  // và chốt riêng cho Doc Holyday) — nên KHÔNG tái dùng pushMissedReaction()
  // nguyên hàm, tự tính miễn nhiễm rồi gọi thẳng phần đẩy pending không điều
  // kiện (pushMissedReactionUnconditional()).
  const immuneHook = getEffectiveCharacterHooks(next, nextTarget).isImmuneToCard;
  const immune = immuneHook !== undefined && immuneHook(cardId1) && immuneHook(cardId2);
  const shotEvents: GameEvent[] = immune
    ? [{ type: "APACHE_KID_IMMUNE", playerId: nextTarget.id, fromPlayerId: nextPlayer.id, cardId: cardId1 }]
    : pushMissedReactionUnconditional(next, nextTarget, { card: "doc_holyday", from: nextPlayer.id });

  return {
    state: next,
    events: [
      { type: "DOC_HOLYDAY_SHOT", playerId: nextPlayer.id, cardIds: [cardId1, cardId2], targetId: nextTarget.id },
      ...handEmptyEvents,
      ...shotEvents,
    ],
  };
}

// ----- Chọn nhân vật đầu ván (xem CharacterChoice ở types.ts) -----
// KHÔNG dùng chung switch/handleRespond() với `pending` — đây KHÔNG phải
// ngăn xếp, mỗi người chọn ĐỘC LẬP, không cần đúng thứ tự. Validate trên
// STATE GỐC (state, chưa cloneState()) trước khi tạo bản sao, giống các hàm
// khác trong file — chỉ khác object đang đọc là characterSelection.

function handleChooseCharacter(state: GameState, action: Action & { type: "CHOOSE_CHARACTER" }): Result {
  if (!state.characterSelection) {
    throw new Error("Ván này không ở giai đoạn chọn nhân vật");
  }
  const index = state.characterSelection.findIndex((c) => c.playerId === action.playerId);
  if (index === -1) {
    throw new Error(`Người chơi ${action.playerId} không có trong danh sách chọn nhân vật`);
  }
  const entry = state.characterSelection[index];
  if (entry.chosen !== null) {
    throw new Error("Người chơi này đã chọn nhân vật rồi, không đổi lại được");
  }
  if (!entry.options.includes(action.characterId)) {
    throw new Error(`Nhân vật "${action.characterId}" không nằm trong 2 lá được phát cho người chơi này`);
  }

  const next = cloneState(state);
  // Thay THẲNG cả mảng bằng mảng mới (không mutate entry cũ tại chỗ) — giữ
  // đúng nguyên tắc reduce() không sửa state truyền vào, dù cloneState() chỉ
  // copy nông (shallow) mảng characterSelection.
  next.characterSelection = next.characterSelection!.map((c, i) => (i === index ? { ...c, chosen: action.characterId } : c));
  next.players.find((p) => p.id === action.playerId)!.characterId = action.characterId;

  const events: GameEvent[] = [{ type: "CHARACTER_CHOSEN", playerId: action.playerId, characterId: action.characterId }];

  if (next.characterSelection.every((c) => c.chosen !== null)) {
    events.push(...finishCharacterSelection(next));
  }

  return { state: next, events };
}

// Hết giờ CHUNG cho cả bàn (room.ts gọi action này, xem ghi chú ở types.ts)
// — chốt NGẪU NHIÊN 1 trong 2 lá được phát cho MỌI người CHƯA tự chọn (chủ dự
// án CHỐT rõ phải ngẫu nhiên, không ưu tiên lá nào — KHÁC quy ước "mặc định
// lá đầu tiên" ở những chỗ hết giờ khác trong dự án, vd Kit Carlson). Ai đã tự
// chọn trước đó thì giữ nguyên, không ghi đè.
function handleFinalizeCharacterSelection(state: GameState): Result {
  if (!state.characterSelection) {
    throw new Error("Ván này không ở giai đoạn chọn nhân vật");
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];

  next.characterSelection = next.characterSelection!.map((entry) => {
    if (entry.chosen !== null) return entry;
    const { value, nextState } = nextRandom(next.rngState);
    next.rngState = nextState;
    const chosen = entry.options[value < 0.5 ? 0 : 1];
    next.players.find((p) => p.id === entry.playerId)!.characterId = chosen;
    events.push({ type: "CHARACTER_CHOSEN", playerId: entry.playerId, characterId: chosen });
    return { ...entry, chosen };
  });

  events.push(...finishCharacterSelection(next));
  return { state: next, events };
}

// Gọi ĐÚNG 1 LẦN, khi MỌI người đã chọn xong (tự chọn thật hoặc bị chốt mặc
// định lúc hết giờ) — tính máu theo nhân vật (+1 nếu Sheriff, đúng luật gốc
// dù nhân vật là ai), chia bài tay theo đúng số máu (y hệt setupGame() cũ,
// chỉ khác là biết nhân vật MUỘN hơn nên phải chia ở đây thay vì lúc setup),
// rồi mở khoá ván thật (characterSelection = null) và chạy Bước 0 đầu lượt
// cho Cảnh sát trưởng — giống hệt việc setupGame() làm trước khi có cơ chế
// chọn nhân vật này.
function finishCharacterSelection(next: GameState): GameEvent[] {
  for (const player of next.players) {
    const hp = computeStartingHp(player.role, player.characterId);
    player.hp = hp;
    player.maxHp = hp;
  }
  for (const player of next.players) {
    for (let n = 0; n < player.hp; n++) {
      const cardId = drawTopCard(next);
      if (!cardId) break;
      giveCardToPlayer(next.players, player, cardId);
    }
  }
  next.characterSelection = null;
  return applyTurnStartChecks(next);
}

function handleRespond(state: GameState, action: Action & { type: "RESPOND" }): Result {
  const top = state.pending[state.pending.length - 1];
  if (!top) {
    throw new Error("Không có việc gì đang chờ để phản hồi");
  }
  if (top.player !== action.playerId) {
    throw new Error(`Việc đang chờ không dành cho người chơi ${action.playerId}`);
  }

  switch (top.kind) {
    case "NEED_MISSED":
      return respondToMissed(state, action, top);
    case "NEED_DISCARD_BANG":
      return respondDiscardOrDamage(state, action, "bang", "BANG_DISCARDED", top.source.from);
    case "NEED_DUEL_RESPONSE":
      return respondToDuel(state, action, top);
    case "NEED_PICK_STORE_CARD":
      return respondToStorePick(state, action);
    case "NEED_DISCARD_FROM_ZONE":
      return respondToDiscardFromZone(state, action, top);
    case "NEED_DRAW_CHECK":
      return resolveDrawCheck(state, action, top);
    case "NEED_PICK_DRAW_SOURCE":
      return respondToPickDrawSource(state, action);
    case "NEED_PICK_DRAW_TARGET":
      return respondToPickDrawTarget(state, action);
    case "NEED_GIVE_CARD_TO_PLAYER":
      return respondToGiveCardToPlayer(state, action, top);
    case "NEED_PICK_KEPT_CARDS":
      return respondToPickKeptCards(state, action, top);
    case "NEED_PICK_DRAW_OR_EQUIPMENT":
      return respondToPickDrawOrEquipment(state, action);
    case "NEED_PICK_BORROWED_CHARACTER":
      return respondToPickBorrowedCharacter(state, action);
    case "NEED_PICK_ARMED":
      return respondToPickArmed(state, action);
    case "NEED_PICK_MARCEL_COMPANION":
      return respondToPickMarcelCompanion(state, action);
    default: {
      const neverKind: never = top;
      throw new Error(`Chưa hỗ trợ phản hồi loại việc: ${JSON.stringify(neverKind)}`);
    }
  }
}

// Dùng cho NEED_DISCARD_BANG (đỡ Indians!): gửi đúng lá Bang! thì bỏ pending,
// không mất máu; không gửi gì (dù có lá trong tay) thì tự nguyện chịu 1 máu —
// người chơi luôn có quyền chọn. (NEED_MISSED có respondToMissed() riêng bên
// dưới, kể từ Giai đoạn 5 đợt 3 — cần xử lý missesNeeded của Slab the Killer
// mà Indians! không có.)
function respondDiscardOrDamage(
  state: GameState,
  action: Action & { type: "RESPOND" },
  requiredCardName: CardName,
  playedEventType: "MISSED_PLAYED" | "BANG_DISCARDED",
  attackerId: string
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  if (action.cardId) {
    const cardIndex = player.hand.indexOf(action.cardId);
    if (cardIndex === -1) {
      throw new Error(`Người chơi ${player.id} không có lá bài ${action.cardId} trong tay`);
    }
    const cardName = cardNameFromId(action.cardId);
    // Giai đoạn 5 (Calamity Janet, đợt 7) — requiredCardName ở đây LUÔN là
    // "bang" (chỉ NEED_DISCARD_BANG/Indians! còn dùng hàm này) nên chấp nhận
    // luôn lá Missed! của Janet qua actsAsBang(); giữ nhánh so khớp thường cho
    // an toàn nếu sau này có ai gọi hàm này với requiredCardName khác "bang".
    const isValidCard = requiredCardName === "bang" ? actsAsBang(next, action.cardId, player) : cardName === requiredCardName;
    if (!isValidCard) {
      throw new Error(`Lá "${cardName}" không hợp lệ cho việc đang chờ này`);
    }

    player.hand.splice(cardIndex, 1);
    next.discardPile.push(action.cardId);
    const events: GameEvent[] = [{ type: playedEventType, playerId: player.id }];
    events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)
    // Mở rộng Dodge City, mục C nhóm C (Molly Stark) — bỏ Bang! tự vệ trước
    // Indians! LUÔN là "ngoài lượt mình" (đúng hàm này chỉ dùng cho
    // NEED_DISCARD_BANG/Indians!, không phải Duel) — đã CHỐT tính là chủ
    // động, context "immediate", rút ngay.
    events.push(...triggerVoluntaryOutOfTurnHook(next, player, "bang", "immediate"));
    return { state: next, events };
  }

  return { state: next, events: applyDamage(next, player, 1, attackerId) };
}

// NEED_MISSED (đỡ Bang!/Gatling) — TÁCH RIÊNG khỏi respondDiscardOrDamage() ở
// trên từ Giai đoạn 5 đợt 3: Slab the Killer có thể yêu cầu missesNeeded > 1,
// bỏ đúng 1 Missed! chỉ trừ đi 1 trong số đó — chưa đủ thì đẩy lại NEED_MISSED
// (cùng người/nguồn) với số còn thiếu, CHỜ TIẾP Missed! khác; đủ (hoặc mặc
// định 1) thì mới thực sự né. Chọn chịu máu thì luôn kết thúc ngay, mất đúng 1
// máu như bình thường, không liên quan missesNeeded.
function respondToMissed(
  state: GameState,
  action: Action & { type: "RESPOND" },
  top: PendingAction & { kind: "NEED_MISSED" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  if (action.cardId) {
    const cardName = cardNameFromId(action.cardId);
    const inHand = player.hand.includes(action.cardId);
    // Mở rộng Dodge City (mục 1.1) — CŨNG chấp nhận lá vàng "trì hoãn" ĐÃ BÀY
    // SẴN trên sân (Bible/Sombrero/Ten Gallon Hat/Iron Plate), miễn đã qua ít
    // nhất 1 lượt kể từ lúc chơi ra. Kiểm TRƯỚC actsAsMissed() (hàm đó chỉ
    // biết về bài TRÊN TAY/alias Janet, không biết gì về trang bị).
    const fromEquipment = !inHand && isEquipmentUsableAsMissed(next, player, action.cardId);

    // Giai đoạn 5 (Calamity Janet, đợt 7) — chấp nhận cả lá Bang! của Janet để đỡ.
    if (!fromEquipment && (!inHand || !actsAsMissed(next, action.cardId, player))) {
      if (inHand) {
        throw new Error(`Lá "${cardName}" không hợp lệ cho việc đang chờ này`);
      }
      if (player.equipment.includes(action.cardId)) {
        // Mở rộng Dodge City, mục C nhóm B (Elena Fuente) — Dynamite LUÔN bị
        // loại trừ (kể cả với canUseOwnEquipmentAsMissed), không phải vì
        // "chưa đủ 1 lượt" — báo lỗi riêng để khỏi gây hiểu nhầm.
        if (cardName === "dynamite") {
          throw new Error("Thuốc nổ không bao giờ dùng được như Missed!");
        }
        // Mở rộng Dodge City, mục C nhóm C (Belle Star) — phân biệt rõ "đang
        // bị vô hiệu hoá tạm thời" với "chưa đủ 1 lượt" (2 lý do khác hẳn
        // nhau, dùng chung 1 thông báo dễ gây hiểu nhầm là bug).
        const currentPlayer = next.players[next.currentPlayerIndex];
        if (
          getEffectiveCharacterDefinition(next, currentPlayer)?.disablesOthersEquipment === true &&
          player.id !== currentPlayer.id
        ) {
          throw new Error(`"${cardName}" đang bị Belle Star vô hiệu hoá tạm thời trong lượt này`);
        }
        throw new Error(`"${cardName}" vừa được đánh ra lượt này — phải chờ ít nhất 1 lượt mới dùng được`);
      }
      throw new Error(`Người chơi ${player.id} không có lá bài ${action.cardId} trong tay`);
    }

    // Slab the Killer (missesNeeded > 1) — luật gốc là "if able": chỉ được bỏ
    // bài khi CÓ ĐỦ số Missed! cần NGAY TỪ ĐẦU (tay + trang bị vàng dùng
    // được), không được bỏ dần từng lá rồi hết giữa chừng. Không đủ thì coi
    // như không làm gì được — GIỮ NGUYÊN lá, chỉ còn cách chịu mất máu (action
    // không kèm cardId, nhánh dưới).
    const missesNeeded = top.missesNeeded ?? 1;
    const eligibleCount = countEligibleMissedSources(next, player);
    if (eligibleCount < missesNeeded) {
      throw new Error(
        `Không đủ Missed! để né (cần ${missesNeeded}, chỉ có ${eligibleCount}) — chỉ có thể chịu mất máu`
      );
    }

    if (fromEquipment) {
      const equipIndex = player.equipment.indexOf(action.cardId);
      player.equipment.splice(equipIndex, 1);
      delete next.equipmentPlayedTurn[action.cardId];
    } else {
      const cardIndex = player.hand.indexOf(action.cardId);
      player.hand.splice(cardIndex, 1);
    }
    next.discardPile.push(action.cardId);

    const missesRemaining = (top.missesNeeded ?? 1) - 1;
    if (missesRemaining > 0) {
      next.pending.push(
        missesRemaining > 1
          ? { kind: "NEED_MISSED", player: top.player, source: top.source, missesNeeded: missesRemaining }
          : { kind: "NEED_MISSED", player: top.player, source: top.source }
      );
    }

    const events: GameEvent[] = [{ type: "MISSED_PLAYED", playerId: player.id }];
    // Mở rộng Dodge City — Bible (nhóm VÀNG) và Dodge (nhóm NÂU) đều kèm rút
    // thêm 1 lá khi dùng để đỡ thành công (xem mục 2, Luat_Bang_Mo_Rong_DodgeCity.txt).
    if (cardName === "bible" || cardName === "dodge") {
      const drawnCount = drawCardsForPlayer(next, player, 1);
      if (drawnCount > 0) {
        events.push({ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount });
      }
    }
    if (!fromEquipment) {
      events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)
    }
    // Mở rộng Dodge City, mục C nhóm C (Molly Stark) — dùng Missed! LÀ luôn
    // "ngoài lượt mình" (NEED_MISSED không bao giờ nhắm chính người đang tới
    // lượt) — context "immediate", rút ngay.
    events.push(...triggerVoluntaryOutOfTurnHook(next, player, cardName, "immediate"));
    return { state: next, events };
  }

  const damageEvents = applyDamage(next, player, 1, top.source.from);

  // Bộ mở rộng "custom_characters" (Mary Rose, xem House_Rule.txt mục I) —
  // THẬT SỰ mất máu (nhánh "chịu mất máu", không đỡ được) VÀ nguồn là Bang!
  // ĐƠN LẺ (top.source.card === "bang" — literal, KHÔNG tính Gatling/Duel/
  // Indians!: Gatling cũng qua đây nhưng source.card = "gatling"; Duel/
  // Indians! không đi qua respondToMissed() luôn, xem playDuel()/
  // respondDiscardOrDamage()) -> bắn trả MIỄN PHÍ. Kích hoạt NGAY CẢ KHI đòn
  // này vừa giết chết cô (applyDamage() ở trên đã tự xử lý chết/Bia/Miễn Tử
  // Elena Noir nếu có — không liên quan gì tới việc CÓ bắn trả hay không).
  if (
    top.source.card === "bang" &&
    getEffectiveCharacterDefinition(next, player)?.canReflectBangDamage === true
  ) {
    const attacker = next.players.find((p) => p.id === top.source.from);
    if (attacker?.alive) {
      damageEvents.push(...pushMaryRoseReflection(next, player, attacker));
    }
  }

  return { state: next, events: damageEvents };
}

// Bộ mở rộng "custom_characters" (Mary Rose) — đẩy NEED_MISSED miễn phí nhắm
// vào `attacker` (bỏ qua khoảng cách, LUÔN cần 2 Missed!). Cố tình KHÔNG dùng
// chung pushMissedReaction()/pushMissedReactionUnconditional():
// (1) KHÔNG qua Apache Kid isImmuneToCard() — đòn phản không gắn với lá bài
//     thật nào để tra chất Rô (khác Duel/Indians!, cả 2 đều ĐÃ có check chất
//     Rô riêng — xem playDuel()/playIndians() — vì chúng có lá bài thật để
//     tra; đòn phản Mary Rose thì không, đây là hiệu ứng "miễn phí").
// (2) missesNeeded LUÔN LÀ 2 (đặc thù riêng của đòn phản này) — không tra
//     onOutgoingBang() của Mary Rose, vì hook đó (nếu có) sẽ áp dụng SAI cho
//     CẢ lượt Bang! chủ động bình thường của chính cô, không chỉ đòn phản.
// Vẫn tôn trọng Barrel thật/Jourdonnais ảo của người bị bắn trả — đây là
// phần logic DÙNG CHUNG với pushMissedReactionUnconditional(), chỉ khác ở 2
// điểm trên.
function pushMaryRoseReflection(next: GameState, maryRose: PlayerState, attacker: PlayerState): GameEvent[] {
  next.pending.push({
    kind: "NEED_MISSED",
    player: attacker.id,
    source: { card: "bang", from: maryRose.id },
    missesNeeded: 2,
  });

  const attackerEquipment = getEffectiveEquipment(next, attacker);
  const hasRealBarrel = attackerEquipment.some((id) => cardNameFromId(id) === "barrel");
  const hasVirtualBarrel = getEffectiveCharacterDefinition(next, attacker)?.virtualBarrel === true;
  const barrelCheckCount = (hasRealBarrel ? 1 : 0) + (hasVirtualBarrel ? 1 : 0);
  for (let i = 0; i < barrelCheckCount; i++) {
    next.pending.push({ kind: "NEED_DRAW_CHECK", player: attacker.id, source: { card: "barrel" }, matchSuits: ["hearts"] });
  }

  return [{ type: "MARY_ROSE_REFLECTED", playerId: maryRose.id, targetId: attacker.id }];
}

function respondToDuel(
  state: GameState,
  action: Action & { type: "RESPOND" },
  top: PendingAction & { kind: "NEED_DUEL_RESPONSE" }
): Result {
  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;

  if (action.cardId) {
    const cardIndex = player.hand.indexOf(action.cardId);
    if (cardIndex === -1) {
      throw new Error(`Người chơi ${player.id} không có lá bài ${action.cardId} trong tay`);
    }
    const cardName = cardNameFromId(action.cardId);
    // Giai đoạn 5 (Calamity Janet, đợt 7) — chấp nhận cả lá Missed! của Janet để đỡ.
    if (!actsAsBang(next, action.cardId, player)) {
      throw new Error(`Lá "${cardName}" không đỡ được Duel, cần Bang!`);
    }

    player.hand.splice(cardIndex, 1);
    next.discardPile.push(action.cardId);

    // Đổi vai: người vừa đỡ được giờ chờ đối thủ trả lời, không tạo mục pending mới riêng.
    next.pending.push({
      kind: "NEED_DUEL_RESPONSE",
      player: top.opponent,
      opponent: top.player,
      source: top.source,
    });

    const events: GameEvent[] = [{ type: "BANG_DISCARDED", playerId: player.id }];
    events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)
    // Mở rộng Dodge City, mục C nhóm C (Molly Stark) — bỏ Bang! trong Duel:
    // context "duel" (KHÔNG rút ngay, dồn lại — xem ghi chú hook ở
    // characters.ts). Duel vẫn còn tiếp diễn (vừa đẩy lại NEED_DUEL_RESPONSE ở
    // trên) nên chưa phải lúc "kết thúc thật sự" — chỉ ghi nhận, chưa rút.
    events.push(...triggerVoluntaryOutOfTurnHook(next, player, "bang", "duel"));
    return { state: next, events };
  }

  // Duel kết thúc thật sự (thua) — rút hết số Bang! Molly Stark đã dồn (nếu có).
  return {
    state: next,
    events: [...applyDamage(next, player, 1, top.opponent), ...drainDuelBangDrawPending(next)],
  };
}

// Mở rộng Dodge City, mục C nhóm C (Molly Stark) — rút hết số lá đã dồn khi
// Đấu tay đôi (Duel) THẬT SỰ kết thúc (mốc: nhánh thua ở respondToDuel() —
// không có Bang! để đỡ nữa). Không quan tâm ai thắng/thua — Molly Stark được
// tính công bất kể kết quả cuối cùng, chỉ cần cô ĐÃ chủ động bỏ Bang! ngoài
// lượt mình trong ván Duel đó.
function drainDuelBangDrawPending(next: GameState): GameEvent[] {
  const pending = next.duelBangDrawPending;
  next.duelBangDrawPending = null;
  if (!pending) return [];
  const player = next.players.find((p) => p.id === pending.playerId);
  if (!player) return [];
  const drawnCount = drawCardsForPlayer(next, player, pending.count);
  if (drawnCount === 0) return [];
  return [{ type: "CARDS_DRAWN", playerId: player.id, count: drawnCount }];
}

function respondToStorePick(state: GameState, action: Action & { type: "RESPOND" }): Result {
  if (!action.cardId) {
    throw new Error("Phải chọn 1 lá trong các lá đã lật ở General Store");
  }

  const next = cloneState(state);
  const current = next.pending[next.pending.length - 1] as PendingAction & { kind: "NEED_PICK_STORE_CARD" };
  const optionIndex = current.options.indexOf(action.cardId);
  if (optionIndex === -1) {
    throw new Error(`Lá "${action.cardId}" không nằm trong các lá đã lật`);
  }

  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;
  giveCardToPlayer(next.players, player, action.cardId);

  const events: GameEvent[] = [{ type: "STORE_CARD_TAKEN", playerId: player.id, cardId: action.cardId }];

  const remainingOptions = [...current.options];
  remainingOptions.splice(optionIndex, 1);

  if (remainingOptions.length > 0) {
    const playerIndex = next.players.findIndex((p) => p.id === player.id);
    const nextIndex = nextAlivePlayerIndex(next, playerIndex);
    next.pending.push({
      kind: "NEED_PICK_STORE_CARD",
      player: next.players[nextIndex].id,
      options: remainingOptions,
    });
  }

  return { state: next, events };
}

// Cat Balou: mục tiêu (`action.playerId` === top.player) tự chọn đúng 1 lá
// trong `top.zone` (tay hoặc sân) để bỏ. Không có lựa chọn "từ chối" vì đây là
// bị ép buộc, không phải phòng thủ như Missed!/Bang!.
function respondToDiscardFromZone(
  state: GameState,
  action: Action & { type: "RESPOND" },
  top: PendingAction & { kind: "NEED_DISCARD_FROM_ZONE" }
): Result {
  if (!action.cardId) {
    throw new Error(`Phải chọn 1 lá trong ${top.zone === "hand" ? "bài trên tay" : "trang bị trên sân"} để bỏ`);
  }

  const next = cloneState(state);
  next.pending.pop();
  const player = next.players.find((p) => p.id === action.playerId)!;
  const zoneArray = top.zone === "hand" ? player.hand : player.equipment;

  if (top.zone === "equipment" && cardNameFromId(action.cardId) === "dynamite") {
    throw new Error("Dynamite miễn nhiễm với Cat Balou, không thể chọn để bỏ");
  }

  const cardIndex = zoneArray.indexOf(action.cardId);
  if (cardIndex === -1) {
    throw new Error(`Lá "${action.cardId}" không nằm trong ${top.zone === "hand" ? "bài trên tay" : "trang bị trên sân"} của bạn`);
  }
  zoneArray.splice(cardIndex, 1);
  // Mở rộng Dodge City (mục 1.1) — dọn equipmentPlayedTurn nếu Cat Balou vừa bắt
  // bỏ 1 lá "delayed" đang bày trên sân (delete với key không tồn tại là no-op,
  // an toàn gọi vô điều kiện dù zone là "hand").
  delete next.equipmentPlayedTurn[action.cardId];
  next.discardPile.push(action.cardId);

  const events: GameEvent[] = [
    { type: "CARD_FORCE_DISCARDED", playerId: player.id, byPlayerId: top.source.from, cardId: action.cardId },
  ];
  if (top.zone === "hand") {
    events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)
  }
  return { state: next, events };
}

// draw! (lật bài kiểm tra) — cơ chế DÙNG CHUNG, việc 1.10. Không cần người chơi
// chọn gì (không phải lựa chọn, chỉ là "châm ngòi" cho bước lật bài tự động),
// nên KHÔNG nhận cardId. Chỉ báo `matched` — ý nghĩa của khớp/không khớp (nổ,
// thoát tù, né đạn...) do lá bài cụ thể ở việc 1.11 quyết định, không phải ở đây.
function resolveDrawCheck(
  state: GameState,
  action: Action & { type: "RESPOND" },
  top: PendingAction & { kind: "NEED_DRAW_CHECK" }
): Result {
  if (action.cardId) {
    throw new Error("draw! không cần chọn lá, không được gửi kèm cardId");
  }

  const next = cloneState(state);
  next.pending.pop();

  const primaryCardId = drawTopCard(next);
  if (!primaryCardId) {
    throw new Error("Không còn lá nào để draw! (cả bộ bài lẫn chồng bài đã bỏ đều hết)");
  }
  next.discardPile.push(primaryCardId);

  const matches = (id: string) => {
    const { suit, rank } = cardSuitRankFromId(id);
    return top.matchSuits.includes(suit) && (!top.matchRanks || top.matchRanks.includes(rank));
  };
  const primaryMatched = matches(primaryCardId);

  let cardId = primaryCardId;
  let matched = primaryMatched;
  const events: GameEvent[] = [];

  // Giai đoạn 5 (Lucky Duke, đợt 4) — lật thêm 1 lá thứ 2, cả 2 đều vào chồng
  // bỏ. "Có lợi" theo NGỮ CẢNH: Barrel/Jail có lợi = khớp (né/thoát); Dynamite
  // có lợi = KHÔNG khớp (không nổ) — nên công thức kết hợp NGƯỢC NHAU: Barrel/
  // Jail dùng "hoặc" (chỉ cần 1 lá khớp là đủ), Dynamite dùng "và" (cả 2 đều
  // phải khớp mới thật sự nổ, còn không thì đã có ít nhất 1 lá không khớp).
  const drawer = next.players.find((p) => p.id === top.player);
  const hasLuckyDraw = (drawer ? getEffectiveCharacterDefinition(next, drawer)?.hasLuckyDraw : undefined) === true;
  if (hasLuckyDraw) {
    const secondCardId = drawTopCard(next);
    if (secondCardId) {
      next.discardPile.push(secondCardId);
      const secondMatched = matches(secondCardId);
      const preferMatched = top.source.card !== "dynamite";
      matched = preferMatched ? primaryMatched || secondMatched : primaryMatched && secondMatched;

      const isFavorable = (m: boolean) => (preferMatched ? m : !m);
      if (isFavorable(primaryMatched)) {
        cardId = primaryCardId;
        events.push({ type: "LUCKY_DUKE_EXTRA_DRAW", playerId: top.player, cardId: secondCardId });
      } else {
        cardId = secondCardId;
        events.push({ type: "LUCKY_DUKE_EXTRA_DRAW", playerId: top.player, cardId: primaryCardId });
      }
    }
    // Nếu deck+chồng bỏ cạn giữa chừng (secondCardId undefined) thì đành chỉ
    // dùng đúng lá đã lật, y hệt không có Lucky Duke — hiếm khi xảy ra.
  } else if (
    !matched &&
    top.source.card === "jail" &&
    drawer &&
    getEffectiveCharacterDefinition(next, drawer)?.canJailCompanion === true
  ) {
    // Bộ mở rộng "custom_characters" (Marcel Marcelo) — lá đầu KHÔNG phải Cơ
    // -> rút thêm lá thứ 2 (tối đa 2 lá/lượt để tìm Cơ thoát tù, xem
    // House_Rule.txt mục I). KHÔNG rút lá thứ 2 nếu lá đầu ĐÃ khớp (nhánh
    // `!matched` ở trên) — khỏi lãng phí thêm 1 lá của bộ bài. Khác Lucky Duke
    // (luôn rút cả 2 lá cùng lúc rồi mới so sánh), đây là rút TUẦN TỰ, dừng
    // sớm nếu lá đầu đã đủ.
    const secondCardId = drawTopCard(next);
    if (secondCardId) {
      next.discardPile.push(secondCardId);
      const secondMatched = matches(secondCardId);
      cardId = secondCardId;
      matched = secondMatched;
      events.push({ type: "MARCEL_JAIL_SECOND_DRAW", playerId: top.player, cardId: secondCardId, matched: secondMatched });
    }
    // Nếu deck+chồng bỏ cạn giữa chừng thì đành chỉ dùng đúng lá đầu (kẹt tù),
    // giống ca hiếm gặp của Lucky Duke ở trên.
  }

  events.unshift({ type: "DRAW_CHECK_RESOLVED", playerId: action.playerId, cardId, matched });

  // Barrel khớp Cơ: tính như vừa bỏ 1 Missed! (miễn phí, không tốn bài trên
  // tay) — KHÔNG tự né hết toàn bộ, vì Slab the Killer (Giai đoạn 5, đợt 3) có
  // thể yêu cầu missesNeeded > 1. Tìm đúng NEED_MISSED tương ứng (không nhất
  // thiết ngay dưới — có thể còn NEED_DRAW_CHECK Barrel khác của cùng người
  // chưa xử lý ở giữa, xem pushMissedReaction()), giảm missesNeeded đi 1: về 0
  // (hoặc đã ở mức mặc định 1) thì mới THẬT SỰ né trọn vẹn — dọn nốt các
  // NEED_DRAW_CHECK Barrel còn lại (không cần lật thêm, đã đủ); còn thiếu thì
  // giữ nguyên NEED_MISSED (số liệu mới) để chờ tiếp Barrel khác/Missed! thật.
  if (top.source.card === "barrel" && matched) {
    events.push({ type: "BARREL_DODGED", playerId: top.player });

    const needMissedIndex = next.pending.findIndex(
      (p) => p.kind === "NEED_MISSED" && p.player === top.player
    );
    const needMissed = next.pending[needMissedIndex] as PendingAction & { kind: "NEED_MISSED" };
    const missesRemaining = (needMissed.missesNeeded ?? 1) - 1;

    if (missesRemaining <= 0) {
      next.pending.splice(needMissedIndex, 1);
      for (let i = next.pending.length - 1; i >= 0; i--) {
        const entry = next.pending[i];
        if (entry.kind === "NEED_DRAW_CHECK" && entry.source.card === "barrel" && entry.player === top.player) {
          next.pending.splice(i, 1);
        }
      }
    } else {
      next.pending[needMissedIndex] =
        missesRemaining > 1
          ? { kind: "NEED_MISSED", player: needMissed.player, source: needMissed.source, missesNeeded: missesRemaining }
          : { kind: "NEED_MISSED", player: needMissed.player, source: needMissed.source };
    }
  }

  // Dynamite đầu lượt: khớp Bích 2-9 → nổ, mất 3 máu (sàn 0), bỏ Dynamite.
  // Không khớp → chuyển cho người kế tiếp. Cả 2 ca đều xét tiếp Jail ngay sau
  // (đúng thứ tự Bước 0: Dynamite trước, Jail sau — mục 4 file luật).
  if (top.source.card === "dynamite") {
    const holder = next.players.find((p) => p.id === top.player)!;
    if (matched) {
      const dynamiteIndex = holder.equipment.findIndex((id) => cardNameFromId(id) === "dynamite");
      const [dynamiteId] = holder.equipment.splice(dynamiteIndex, 1);
      next.discardPile.push(dynamiteId);
      const amount = Math.min(3, holder.hp);
      holder.hp -= amount;
      events.push({ type: "DYNAMITE_EXPLODED", playerId: holder.id, amount });
      // Giai đoạn 5 (Bart Cassidy) — byPlayerId null: Dynamite không có
      // "người gây", nên chỉ onLoseLife chạy, KHÔNG chạy onLoseLifeFromCard
      // (El Gringo không kích hoạt ở đây, đúng luật đã ghi ở core/characters.ts).
      events.push(...triggerLoseLifeHooks(next, holder, amount, null));
      // Tự nổ, không ai "giết" cả -> killerId = null, không có thưởng/phạt.
      events.push(...eliminateIfDead(next, holder, null));
    } else {
      transferDynamiteToNextPlayer(next.players, holder);
      events.push({ type: "DYNAMITE_PASSED", playerId: holder.id });
    }
    // holder có thể vừa chết ở trên (eliminateIfDead) — nếu vậy alive đã false,
    // bỏ qua Jail-check (người chết không cần thoát tù) và eliminatePlayer() đã
    // tự chuyển lượt (advanceTurn) nếu cần rồi, không phải lo ở đây.
    if (holder.alive) applyJailCheck(next, holder);
    return { state: next, events };
  }

  // Jail đầu lượt: khớp Cơ → thoát, bỏ Jail, chơi lượt bình thường. Không khớp
  // → bỏ Jail, bỏ qua CẢ lượt này (không rút, không đánh) — sang thẳng người kế.
  if (top.source.card === "jail") {
    const jailedPlayer = next.players.find((p) => p.id === top.player)!;
    const jailIndex = jailedPlayer.equipment.findIndex((id) => cardNameFromId(id) === "jail");
    const [jailId] = jailedPlayer.equipment.splice(jailIndex, 1);
    next.discardPile.push(jailId);

    // Bộ mở rộng "custom_characters" (Marcel Marcelo) — chốt XONG trạng thái
    // của người "cùng vào tù" (mutate state + gom event) TRƯỚC KHI gọi
    // advanceTurn() ở nhánh kẹt tù bên dưới — advanceTurn() có thể NGAY LẬP
    // TỨC chạy applyTurnStartChecks() cho chính companion (nếu ngồi liền sau
    // Marcel trong vòng chơi), nên cờ marcelCompanionSkipNextTurn PHẢI có mặt
    // TRƯỚC lúc đó, không phải sau. Người được chỉ định lỡ đã chết giữa chừng
    // thì bỏ qua, không có gì để chia sẻ.
    const companionId = next.marcelJailCompanion[jailedPlayer.id];
    let companionEvent: GameEvent | null = null;
    if (companionId) {
      delete next.marcelJailCompanion[jailedPlayer.id];
      const companion = next.players.find((p) => p.id === companionId);
      if (companion?.alive) {
        if (matched) {
          companionEvent = { type: "MARCEL_COMPANION_FREED", playerId: companion.id };
        } else {
          next.marcelCompanionSkipNextTurn[companion.id] = true;
          companionEvent = { type: "MARCEL_COMPANION_JAILED", playerId: companion.id };
        }
      }
    }

    if (matched) {
      events.push({ type: "JAIL_ESCAPED", playerId: jailedPlayer.id });
      if (companionEvent) events.push(companionEvent);
      // Thoát tù thành công -> lượt này rút 3 lá thay vì 2, tiêu thụ ở
      // handleDrawCards() (Phương án C).
      if (getEffectiveCharacterDefinition(next, jailedPlayer)?.canJailCompanion === true) {
        next.marcelJailBonusDrawThisTurn[jailedPlayer.id] = true;
      }
    } else {
      events.push({ type: "JAIL_SKIPPED_TURN", playerId: jailedPlayer.id });
      if (companionEvent) events.push(companionEvent);
      events.push(...advanceTurn(next)); // bỏ qua cả lượt — người kế tiếp lại được xét Bước 0 y hệt
    }

    return { state: next, events };
  }

  return { state: next, events };
}

// ----- Việc 1.13: chết, thưởng/phạt, điều kiện thắng -----

// Gây damage cho `target`, phát DAMAGE_DEALT, rồi xử lý chết nếu hp về 0.
// `killerId` = người trực tiếp gây đòn đánh (Bang!/Gatling/Indians!/Duel);
// truyền null nếu tự chết (Dynamite) — không có thưởng/phạt trong ca đó.
function applyDamage(
  next: GameState,
  target: PlayerState,
  amount: number,
  killerId: string | null
): GameEvent[] {
  target.hp -= amount;
  return [
    { type: "DAMAGE_DEALT", playerId: target.id, amount },
    ...triggerLoseLifeHooks(next, target, amount, killerId),
    ...eliminateIfDead(next, target, killerId),
  ];
}

// Giai đoạn 5 (Bart Cassidy/El Gringo, xem core/characters.ts) — gọi SAU khi
// đã trừ máu, TRƯỚC khi xét chết. Dùng chung cho cả applyDamage() (Bang!/
// Gatling/Duel/Indians!) LẪN nhánh Thuốc nổ tự trừ máu trong resolveDrawCheck()
// (byPlayerId = null ở đó — Dynamite không có "người gây", nên chỉ onLoseLife
// chạy, KHÔNG chạy onLoseLifeFromCard, đúng luật đã ghi trong file nhân vật).
function triggerLoseLifeHooks(
  next: GameState,
  target: PlayerState,
  amount: number,
  byPlayerId: string | null
): GameEvent[] {
  const hooks = getEffectiveCharacterHooks(next, target);
  const events: GameEvent[] = [];
  if (hooks.onLoseLife) events.push(...hooks.onLoseLife(next, target, amount));
  if (byPlayerId && hooks.onLoseLifeFromCard) {
    events.push(...hooks.onLoseLifeFromCard(next, target, amount, byPlayerId));
  }
  return events;
}

// Kiểm tra hp sau khi ĐÃ trừ máu (bởi applyDamage() hoặc trực tiếp như
// Dynamite) — tách riêng để Dynamite không bị phát thêm DAMAGE_DEALT chồng
// lên DYNAMITE_EXPLODED đã có sẵn ý nghĩa tương đương. Dùng CHUNG cho MỌI
// nguồn sát thương (Bang!/Gatling/Duel/Indians!/Dynamite) nên "Bia hồi sinh"
// đặt ĐÚNG 1 chỗ này là áp dụng đủ cho tất cả, không cần sửa từng nơi.
function eliminateIfDead(next: GameState, target: PlayerState, killerId: string | null): GameEvent[] {
  if (target.hp > 0) return [];

  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // ĐÃ đang trong Miễn Tử (đòn kích hoạt đầu tiên đã xử lý ở nhánh riêng bên
  // dưới, xong 1 lần thì elenaNoirImmortalTurnsLeft khác null suốt 2 lượt) —
  // MỌI sát thương tiếp theo trong lúc này giữ máu NGUYÊN ở 0, không chạm gì
  // khác (không xét Bia — Bia không được "cứu nhầm" cô về 1 máu giữa chừng
  // Miễn Tử, không gọi eliminatePlayer()). Chặn ở đây SỚM, TRƯỚC nhánh Bia bên
  // dưới, để không lỡ tiêu mất 1 lá Bia của cô một cách vô nghĩa.
  if (
    getEffectiveCharacterDefinition(next, target)?.canArmImmortality === true &&
    next.elenaNoirImmortalTurnsLeft[target.id] !== undefined
  ) {
    target.hp = 0;
    return [];
  }

  // Bia "hồi sinh" — TỰ ĐỘNG (không hỏi người chơi, đúng ghi chú "tự động"
  // trong NHAN-VAT-BANG-CO-BAN.txt, mục Sid Ketchum): còn ít nhất 1 lá Bia
  // trên tay VÀ tổng số người còn sống (TÍNH CẢ target — target.alive vẫn
  // đang true tới tận eliminatePlayer()) lớn hơn 2 -> bỏ 1 lá Bia, kéo THẲNG
  // về 1 máu (không phải +1 từ số âm nếu bị dư sát thương), không chết. Bằng
  // hoặc dưới 2 người sống -> Bia vô tác dụng (giống playBeer() ở trên), chết
  // như bình thường.
  const aliveCount = next.players.filter((p) => p.alive).length;
  const beerIndex = target.hand.findIndex((id) => cardNameFromId(id) === "beer");
  // Việc 5.3 (house rule "beer_below_two") — đúng ngoại lệ đã bỏ ở playBeer(),
  // áp dụng CHUNG cho cả đường hồi sinh tự động này.
  const beerWorksBelowTwo = next.houseRules.includes("beer_below_two");

  if ((aliveCount > 2 || beerWorksBelowTwo) && beerIndex !== -1) {
    const [beerId] = target.hand.splice(beerIndex, 1);
    next.discardPile.push(beerId);
    target.hp = 1;
    // Mở rộng Dodge City, mục C nhóm B (Tequila Joe) — cộng thêm RIÊNG +1 máu
    // nữa (không qua modifyHealAmount, đã chốt — xem ghi chú doubleRevivalHp
    // ở characters.ts), tổng 2 máu sau hồi sinh.
    if (getEffectiveCharacterDefinition(next, target)?.doubleRevivalHp === true) {
      target.hp = Math.min(target.hp + 1, target.maxHp);
    }
    return [
      { type: "BEER_SAVED_FROM_DEATH", playerId: target.id, cardId: beerId, hp: target.hp },
      ...triggerHandEmptyHook(next, target), // Giai đoạn 5 (Suzy Lafayette) — nếu Bia vừa bỏ là lá cuối
      // Mở rộng Dodge City, mục C nhóm C (Molly Stark) — hồi sinh tự động là
      // ĐƯỜNG DUY NHẤT "chơi Beer ngoài lượt" thật sự tồn tại trong engine
      // (playBeer() bình thường luôn bắt buộc đúng lượt mình) — nhưng
      // triggerVoluntaryOutOfTurnHook() tự loại đúng ca "tự nổ Dynamite chết
      // ngay trong lượt chính mình" (không tính là ngoài lượt), khớp chính
      // xác lời chốt.
      ...triggerVoluntaryOutOfTurnHook(next, target, "beer", "immediate"),
    ];
  }

  // Đang cầm Bia nhưng KHÔNG cứu được vì chỉ còn 2 người sống — báo rõ cho
  // người chơi biết lý do (khác hẳn "không có Bia nên chết", tránh hiểu nhầm
  // là bug). CHỈ báo khi thật sự có Bia trên tay — không có thì im lặng như
  // bình thường, không phải ca "Bia vô tác dụng".
  const ineffectiveEvents: GameEvent[] =
    !(aliveCount > 2 || beerWorksBelowTwo) && beerIndex !== -1
      ? [{ type: "BEER_INEFFECTIVE", playerId: target.id }]
      : [];

  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // Bia không cứu được (hoặc không có) — đòn này lẽ ra giết cô. Đang "vũ
  // trang" khả năng Miễn Tử VÀ CHƯA đang trong Miễn Tử (có entry trong
  // elenaNoirImmortalTurnsLeft nghĩa là đã kích hoạt từ trước — không kích
  // hoạt CHỒNG lên chính nó, dù về lý thuyết không thể xảy ra vì trong Miễn
  // Tử cô không thể chết) -> thay vì eliminatePlayer(), vào Miễn Tử đúng 2
  // LƯỢT CỦA CHÍNH cô. Máu giữ nguyên ở 0 (không phải "hồi sinh" như Bia —
  // không đặt lại = 1). "Vũ trang" coi như đã dùng xong (xoá key khỏi
  // elenaNoirArmed — không còn ý nghĩa gì trong lúc Miễn Tử, xem
  // handleDrawCards() tự bỏ qua bước hỏi khi đã có entry Miễn Tử).
  if (
    getEffectiveCharacterDefinition(next, target)?.canArmImmortality === true &&
    (next.elenaNoirArmed[target.id] ?? false) &&
    next.elenaNoirImmortalTurnsLeft[target.id] === undefined
  ) {
    target.hp = 0;
    delete next.elenaNoirArmed[target.id];
    next.elenaNoirImmortalTurnsLeft[target.id] = 2;
    return [...ineffectiveEvents, { type: "ELENA_NOIR_IMMORTAL_TRIGGERED", playerId: target.id, turnsLeft: 2 }];
  }

  return [...ineffectiveEvents, ...eliminatePlayer(next, target, killerId)];
}

function eliminatePlayer(next: GameState, target: PlayerState, killerId: string | null): GameEvent[] {
  target.alive = false;
  target.hp = 0;

  // Giai đoạn 5 (Vulture Sam, xem core/characters.ts) — hỏi TRƯỚC khi bỏ bài
  // người chết vào chồng bỏ, cho MỌI người còn sống có hook onAnyDeath (không
  // chỉ chính killer). Hook nào muốn "nhận" bài phải tự dọn target.hand/
  // target.equipment — dòng push() ngay sau chỉ đẩy phần CÒN LẠI (rỗng nếu
  // hook đã lấy hết), không mất cũng không nhân đôi.
  const deathHookEvents: GameEvent[] = [];
  for (const player of next.players) {
    if (!player.alive || player.id === target.id) continue;
    const hooks = getEffectiveCharacterHooks(next, player);
    if (hooks.onAnyDeath) deathHookEvents.push(...hooks.onAnyDeath(next, player, target));
  }

  // Bỏ hết bài trên tay + trang bị trên sân vào chồng bỏ — người chết không giữ gì cả.
  // Mở rộng Dodge City (mục 1.1) — dọn luôn equipmentPlayedTurn cho lá "delayed"
  // còn lại trên sân (nếu có), tránh để rác key cũ tồn tại vĩnh viễn trong state
  // (không gây bug — mọi chỗ đọc field này đều kiểm tra lá có ĐANG nằm trong
  // equipment không trước, chỉ là dọn cho sạch, đúng quy tắc 3 CLAUDE.md).
  for (const id of target.equipment) delete next.equipmentPlayedTurn[id];
  next.discardPile.push(...target.hand, ...target.equipment);
  target.hand = [];
  target.equipment = [];

  const events: GameEvent[] = [
    { type: "PLAYER_ELIMINATED", playerId: target.id, killedBy: killerId },
    ...deathHookEvents,
  ];

  const killer = killerId ? next.players.find((p) => p.id === killerId) : undefined;
  if (killer) {
    if (target.role === "outlaw") {
      // Thưởng hạ gục Outlaw: rút 3 lá (có thể ít hơn nếu deck+chồng bỏ cạn giữa chừng).
      let drawnCount = 0;
      for (let i = 0; i < 3; i++) {
        const card = drawTopCard(next);
        if (!card) break;
        giveCardToPlayer(next.players, killer, card);
        drawnCount++;
      }
      events.push({ type: "OUTLAW_BOUNTY_DRAWN", playerId: killer.id, count: drawnCount });
    } else if (killer.role === "sheriff" && target.role === "deputy") {
      // Phạt Cảnh sát trưởng giết nhầm Phó cảnh sát trưởng: bỏ hết bài của
      // CHÍNH killer (không phải của người vừa chết) tay lẫn sân.
      const killerHadCards = killer.hand.length > 0; // Giai đoạn 5 (Suzy Lafayette) — chỉ tính là "vừa rời tay" nếu THẬT SỰ có gì để mất
      for (const id of killer.equipment) delete next.equipmentPlayedTurn[id]; // mở rộng Dodge City, mục 1.1 — dọn rác, xem ghi chú ở trên
      next.discardPile.push(...killer.hand, ...killer.equipment);
      killer.hand = [];
      killer.equipment = [];
      events.push({ type: "SHERIFF_KILLED_DEPUTY_PENALTY", playerId: killer.id });
      if (killerHadCards) {
        events.push(...triggerHandEmptyHook(next, killer));
      }
    } else if (target.role === "police" || target.role === "criminal" || target.role === "traitor") {
      // Mở rộng Dodge City, mục D (biến thể 3 người) — hạ BẤT KỲ ai, kể cả sai
      // vòng tròn săn đuổi, đều được thưởng ngay 3 lá rút. Khác nguồn thưởng
      // "hạ đúng Outlaw" ở nhánh trên — 2 nguồn không đụng nhau vì role của
      // biến thể 3 người ("police"/"criminal"/"traitor") không trùng "outlaw".
      let drawnCount = 0;
      for (let i = 0; i < 3; i++) {
        const card = drawTopCard(next);
        if (!card) break;
        giveCardToPlayer(next.players, killer, card);
        drawnCount++;
      }
      events.push({ type: "HUNT_KILL_BOUNTY_DRAWN", playerId: killer.id, count: drawnCount });
    }
  }

  // killerId cần cho biến thể 3 người (vòng tròn săn đuổi) — xem win.ts.
  const winner = checkWinCondition(next.players, killerId);
  if (winner) {
    next.winner = winner;
    events.push({ type: "GAME_ENDED", winner });
    return events;
  }

  // Người vừa chết đang là người tới lượt (chỉ có thể xảy ra khi tự thua Duel
  // với chính mình, tự nổ Dynamite ở Bước 0 đầu lượt, hoặc bộ mở rộng
  // "custom_characters" — Elena Noir hết hạn Miễn Tử, xem advanceTurn()) và
  // không còn việc gì khác đang chờ -> chuyển lượt ngay, người chết không thể
  // tự rút/đánh/bỏ bài.
  const isCurrentPlayer = next.players[next.currentPlayerIndex].id === target.id;
  if (isCurrentPlayer && next.pending.length === 0) {
    events.push(...advanceTurn(next));
  }

  return events;
}

// ----- Hàm phụ trợ -----

function assertCurrentPlayer(state: GameState, playerId: string): void {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error(`Không phải lượt của người chơi ${playerId}`);
  }
}

function assertPhase(state: GameState, phase: GameState["turnPhase"]): void {
  if (state.turnPhase !== phase) {
    throw new Error(`Hành động này chỉ hợp lệ ở giai đoạn "${phase}", đang ở "${state.turnPhase}"`);
  }
}

// Trả về GameEvent[] (khác `void` trước đây) vì bộ mở rộng "custom_characters"
// (Elena Noir, xem House_Rule.txt mục I) có thể khiến việc "chuyển lượt" kéo
// theo cả 1 người chết (chết chắc chắn sau đúng 2 lượt Miễn Tử) — cascade
// events đó phải truyền ngược lên MỌI nơi gọi hàm này (4 chỗ, xem lịch sử
// sửa). Người MỚI kết thúc lượt CHƯA bị đổi (next.currentPlayerIndex vẫn trỏ
// đúng họ) lúc hàm này bắt đầu chạy — dùng để biết ai "vừa hết 1 lượt".
function advanceTurn(next: GameState): GameEvent[] {
  const departingPlayer = next.players[next.currentPlayerIndex];

  // Bộ mở rộng "custom_characters" (Elena Noir) — lượt VỪA KẾT THÚC của
  // departingPlayer tính là 1 trong 2 lượt Miễn Tử -> giảm đếm ngược. Về 0 ->
  // chết chắc chắn NGAY BÂY GIỜ, gọi eliminatePlayer() THAY VÌ tự chuyển lượt
  // bình thường bên dưới — eliminatePlayer() tự thấy cô VẪN đang là người tới
  // lượt (currentPlayerIndex CHƯA đổi ở đây) nên tự gọi LẠI advanceTurn() này
  // (đệ quy) để thật sự chuyển sang người kế tiếp, không cần lặp code.
  if (
    next.elenaNoirImmortalTurnsLeft[departingPlayer.id] !== undefined &&
    getEffectiveCharacterDefinition(next, departingPlayer)?.canArmImmortality === true
  ) {
    const turnsLeft = next.elenaNoirImmortalTurnsLeft[departingPlayer.id] - 1;
    if (turnsLeft <= 0) {
      delete next.elenaNoirImmortalTurnsLeft[departingPlayer.id];
      return eliminatePlayer(next, departingPlayer, null);
    }
    next.elenaNoirImmortalTurnsLeft[departingPlayer.id] = turnsLeft;
  }

  next.currentPlayerIndex = nextAlivePlayerIndex(next, next.currentPlayerIndex);
  next.turnPhase = "draw";
  next.bangUsedThisTurn = false;
  next.cardNamesPlayedThisTurn = []; // việc 5.3 (house rule "no_duplicate_card_names")
  next.turnNumber += 1; // mở rộng Dodge City, mục 1.1 (xem GameState.turnNumber ở types.ts)
  next.joseDelgadoUsesThisTurn = 0; // mở rộng Dodge City, mục C nhóm A (José Delgado)
  next.docHolydayUsedThisTurn = false; // mở rộng Dodge City, mục C nhóm C (Doc Holyday)
  return applyTurnStartChecks(next);
}

// Bước ĐẦU TIÊN của lượt (mở rộng Dodge City, mục C nhóm C — Vera Custer, đã
// hỏi lại và chốt): TRƯỚC CẢ Dynamite/Jail, nếu người tới lượt có
// canBorrowCharacterAbilities (chỉ Vera Custer) VÀ có ít nhất 1 người chơi
// khác còn sống đã có nhân vật, HỎI chọn mượn ai — vì lựa chọn này có thể ảnh
// hưởng tới CHÍNH draw!-check Dynamite/Jail sắp tới (vd mượn Lucky Duke).
// Không có ai để mượn thì bỏ qua, xét thẳng Dynamite/Jail như bình thường.
// Export để setup.ts gọi cho LƯỢT ĐẦU TIÊN của ván (setupGame không đi qua
// advanceTurn, nhưng lượt đầu vẫn phải qua đủ các bước này nếu cần). Trả về
// GameEvent[] (khác `void` trước đây) vì bộ mở rộng "custom_characters"
// (Marcel Marcelo) có thể khiến lượt này bị BỎ QUA HOÀN TOÀN ngay từ đầu
// (người "cùng vào tù" của Marcel) — kéo theo 1 lần advanceTurn() đệ quy nữa,
// y hệt cascade Elena Noir ở advanceTurn().
export function applyTurnStartChecks(next: GameState): GameEvent[] {
  // Mở rộng High Noon/A Fistful of Cards, mục 1.3 — ĐẦU TIÊN, TRƯỚC CẢ Marcel/
  // Vera Custer/Dynamite/Jail (đã hỏi lại và chốt đúng thứ tự này với chủ dự
  // án). Chỉ lật khi đang là lượt CHỦ TRÒ và không phải lượt đầu ván của họ —
  // xem revealNextEventIfDue().
  const eventEvents = revealNextEventIfDue(next);
  const player = next.players[next.currentPlayerIndex];

  // Bộ mở rộng "custom_characters" (Marcel Marcelo) — người "cùng vào tù" ăn
  // theo kết quả kẹt tù của Marcel: bỏ qua HẲN lượt này (không rút, không
  // đánh), y hệt JAIL_SKIPPED_TURN nhưng KHÔNG tự rút bài kiểm tra gì — chỉ
  // tiêu thụ đúng 1 lần cờ rồi chuyển lượt tiếp. Xét TRƯỚC CẢ Vera Custer/
  // Dynamite/Jail vì đây là hệ quả đã định đoạt từ trước, không có gì để hỏi/
  // kiểm nữa (kể cả nếu người này CŨNG có Dynamite/Jail riêng của họ).
  if (next.marcelCompanionSkipNextTurn[player.id]) {
    delete next.marcelCompanionSkipNextTurn[player.id];
    return [
      ...eventEvents,
      { type: "MARCEL_COMPANION_TURN_SKIPPED", playerId: player.id },
      ...advanceTurn(next),
    ];
  }

  if (getEffectiveCharacterDefinition(next, player)?.canBorrowCharacterAbilities === true) {
    const candidates = otherAlivePlayersInOrder(next, player.id).filter((p) => p.characterId !== null);
    if (candidates.length > 0) {
      next.pending.push({ kind: "NEED_PICK_BORROWED_CHARACTER", player: player.id });
      return eventEvents;
    }
  }
  applyDynamiteAndJailChecks(next, player);
  return eventEvents;
}

// "Chủ trò" (mục 1.3) — có Sheriff thì là Sheriff, không có (biến thể 2/3
// người) thì là người ngồi ghế 0. setup.ts đã CHỐT để chủ trò luôn đi lượt
// đầu tiên (firstPlayerIndex), nên chỉ số này cũng chính là "ghế xuất phát"
// của vòng lượt.
function getDealerIndex(state: GameState): number {
  const sheriffIndex = state.players.findIndex((p) => p.role === "sheriff");
  return sheriffIndex >= 0 ? sheriffIndex : 0;
}

// Mở rộng High Noon/A Fistful of Cards, mục 1.3 — lật lá sự kiện TRÊN CÙNG
// (phần tử CUỐI eventDeck) khi: còn lá để lật, VÀ đang đúng lượt chủ trò,
// VÀ không phải lượt đầu ván của họ ("lượt THỨ HAI trở đi"). Vì chủ trò LUÔN
// đi lượt đầu ván (setup.ts), điều kiện "không phải lượt đầu ván" đơn giản
// chỉ là turnNumber > 0 — hễ currentPlayerIndex quay lại đúng ghế chủ trò với
// turnNumber > 0 thì chắc chắn đã đi hết 1 vòng, tự động là "lượt thứ 2 trở
// đi" của họ, KHÔNG cần đếm số người chơi hay thêm field nhớ riêng (đơn giản
// hơn đề xuất gốc trong file spec, vẫn đúng cả khi có người chết giữa vòng).
//
// LƯU Ý cho Vendetta (Fistful of Cards, chưa cài) — *dev đã chốt: lượt THÊM
// do Vendetta cấp cho CHÍNH chủ trò không được lật lại lá sự kiện (chỉ lượt
// "thật" mới lật). Nhớ xử lý khi cài lá đó (không gọi hàm này lần 2 trong
// cùng 1 lượt Vendetta kéo dài).
function revealNextEventIfDue(next: GameState): GameEvent[] {
  if (next.eventDeck.length === 0) return [];
  if (next.turnNumber === 0) return [];
  if (next.currentPlayerIndex !== getDealerIndex(next)) return [];

  const eventId = next.eventDeck.pop() as EventId;
  if (next.activeEventId !== null) {
    next.eventDiscard.push(next.activeEventId);
  }
  next.activeEventId = eventId;
  return [{ type: "EVENT_REVEALED", eventId }, ...applyEventRevealEffect(next, eventId)];
}

// Hiệu ứng nhóm (A) — chạy ĐÚNG 1 LẦN ngay lúc lá được lật (mục 1.4). Điền
// dần theo LO-TRINH.md/TaskList — CHƯA có Russian Roulette/Dead Man.
function applyEventRevealEffect(next: GameState, eventId: EventId): GameEvent[] {
  switch (eventId) {
    case "the_doctor":
      return applyTheDoctorEffect(next);
    case "the_daltons":
      return applyTheDaltonsEffect(next);
    default:
      return [];
  }
}

// High Noon — "The Daltons": mỗi người có ít nhất 1 lá XANH DƯƠNG (kể cả
// Jail/Dynamite — ĐÃ XÁC NHẬN qua bản dịch luật, KHÔNG tính lá VÀNG "trì
// hoãn" của Dodge City) trước mặt TỰ CHỌN 1 lá để bỏ. Tái dùng NGUYÊN
// NEED_DISCARD_FROM_ZONE (vốn làm cho Cat Balou) — chỉ khác `source.from:
// null` (không ai "bắt" cả, xem [ĐỔI STATE] source.from ở types.ts) — nên
// KHÔNG đi qua pushDiscardFromZoneReaction() (hàm đó kiểm miễn nhiễm Apache
// Kid theo CHẤT 1 lá cụ thể, không áp dụng ở đây — giống Indians!, không có
// lá bài thật nào để tra chất).
function applyTheDaltonsEffect(next: GameState): GameEvent[] {
  const alivePlayers = next.players.filter((p) => p.alive);
  for (let i = alivePlayers.length - 1; i >= 0; i--) {
    const player = alivePlayers[i];
    const hasBlueEquipment = player.equipment.some((id) => !isDelayedEquipmentCardName(cardNameFromId(id)));
    if (!hasBlueEquipment) continue;
    next.pending.push({
      kind: "NEED_DISCARD_FROM_ZONE",
      player: player.id,
      zone: "equipment",
      source: { card: "the_daltons", from: null },
    });
  }
  return [];
}

// High Noon — "The Doctor": người ÍT MÁU NHẤT (trong số người CÒN SỐNG) được
// +1 máu; bằng nhau thì MỖI NGƯỜI được +1 máu. KHÔNG qua modifyHealAmount
// (hook đó CHỈ áp ở playBeer(), xem chú thích characterHooks.modifyHealAmount)
// — Tequila Joe không được nhân đôi ở đây.
function applyTheDoctorEffect(next: GameState): GameEvent[] {
  const alivePlayers = next.players.filter((p) => p.alive);
  if (alivePlayers.length === 0) return [];
  const minHp = Math.min(...alivePlayers.map((p) => p.hp));

  const events: GameEvent[] = [];
  for (const player of alivePlayers) {
    if (player.hp !== minHp) continue;
    const restored = Math.min(1, player.maxHp - player.hp);
    if (restored <= 0) continue;
    player.hp += restored;
    events.push({ type: "HP_RESTORED", playerId: player.id, amount: restored });
  }
  return events;
}

// Bước 0 đầu lượt (mục 4 file luật): Dynamite kiểm tra TRƯỚC (có thể giết luôn,
// khỏi xét Jail), Jail SAU. Chỉ đẩy pending cho bước đang xét đầu tiên còn áp
// dụng — bước tiếp theo (vd Jail sau khi Dynamite nổ/chuyển xong) được
// resolveDrawCheck() đẩy tiếp sau khi xử lý xong hậu quả của bước trước, không
// đẩy cả 2 cùng lúc ở đây. TÁCH RIÊNG khỏi applyTurnStartChecks() (mở rộng
// Dodge City, mục C nhóm C) để respondToPickBorrowedCharacter() gọi thẳng vào
// đây SAU KHI đã ghi nhận xong lựa chọn mượn — không quay lại từ đầu
// applyTurnStartChecks() (sẽ hỏi lại vô hạn vì Vera Custer vẫn còn
// canBorrowCharacterAbilities).
function applyDynamiteAndJailChecks(next: GameState, player: PlayerState): void {
  if (player.equipment.some((id) => cardNameFromId(id) === "dynamite")) {
    next.pending.push({
      kind: "NEED_DRAW_CHECK",
      player: player.id,
      source: { card: "dynamite" },
      matchSuits: ["spades"],
      matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
    });
    return;
  }
  applyJailCheck(next, player);
}

function applyJailCheck(next: GameState, player: PlayerState): void {
  if (player.equipment.some((id) => cardNameFromId(id) === "jail")) {
    next.pending.push({
      kind: "NEED_DRAW_CHECK",
      player: player.id,
      source: { card: "jail" },
      matchSuits: ["hearts"],
    });
  }
}

function nextAlivePlayerIndex(state: GameState, fromIndex: number): number {
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const index = (fromIndex + step) % total;
    if (state.players[index].alive) return index;
  }
  throw new Error("Không còn người chơi nào sống"); // ván phải đã kết thúc trước khi tới đây
}

// Nhân bản state để sửa trên bản sao, không đụng vào state gốc.
function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      equipment: [...player.equipment],
    })),
    deck: [...state.deck],
    discardPile: [...state.discardPile],
    pending: [...state.pending],
    // việc 5.3 (house rule "no_duplicate_card_names") — mảng này bị mutate
    // TRỰC TIẾP bằng .push() ở handlePlayCard(), không phải gán lại — spread
    // nông ở trên (`...state`) chỉ copy THAM CHIẾU, chưa đủ để "không sửa
    // state gốc truyền vào" (quy tắc 3). Sửa cùng lúc với equipmentPlayedTurn
    // bên dưới vì cùng 1 lớp lỗi (field không phải mảng/object con của
    // players, dễ bị bỏ sót khỏi danh sách clone riêng ở trên).
    cardNamesPlayedThisTurn: [...state.cardNamesPlayedThisTurn],
    // Mở rộng Dodge City (mục 1.1) — equipmentPlayedTurn cũng bị mutate TRỰC
    // TIẾP (gán/xoá key) ở playEquipment()/activateDelayedEquipment()/
    // respondToMissed() — cùng lý do cần clone nông (Record phẳng, không có
    // giá trị lồng nhau nào cần clone sâu hơn).
    equipmentPlayedTurn: { ...state.equipmentPlayedTurn },
    // Bộ mở rộng "custom_characters" (Elena Noir) — cùng lý do
    // equipmentPlayedTurn ở trên: 2 Record này bị mutate TRỰC TIẾP (gán/xoá
    // key theo playerId) ở handleDrawCards()/respondToPickArmed()/
    // eliminateIfDead()/advanceTurn(), cần clone nông mỗi lần.
    elenaNoirArmed: { ...state.elenaNoirArmed },
    elenaNoirImmortalTurnsLeft: { ...state.elenaNoirImmortalTurnsLeft },
    // Bộ mở rộng "custom_characters" (Marcel Marcelo) — cùng lý do 3 Record ở
    // trên: bị mutate TRỰC TIẾP (gán/xoá key theo playerId) ở playJail()/
    // respondToPickMarcelCompanion()/resolveDrawCheck()/handleDrawCards()/
    // applyTurnStartChecks(), cần clone nông mỗi lần.
    marcelJailCompanion: { ...state.marcelJailCompanion },
    marcelCompanionSkipNextTurn: { ...state.marcelCompanionSkipNextTurn },
    marcelJailBonusDrawThisTurn: { ...state.marcelJailBonusDrawThisTurn },
    // Mở rộng High Noon/A Fistful of Cards — eventDeck/eventDiscard bị mutate
    // TRỰC TIẾP bằng .pop()/.push() ở revealNextEventIfDue(), cần clone nông
    // mỗi lần, cùng lý do deck/discardPile ở trên.
    eventDeck: [...state.eventDeck],
    eventDiscard: [...state.eventDiscard],
  };
}
