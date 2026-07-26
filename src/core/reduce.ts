// Xương sống của engine: reduce(state, action) => state mới.
// THUẦN: không sửa state truyền vào, cùng đầu vào luôn cho cùng đầu ra.

import type { CardName } from "./cards";
import { cardNameFromId, cardSuitRankFromId, isSelfEquipBlueCardName, isWeaponCardName } from "./cards";
import { getCharacterDefinition, getCharacterHooks, triggerHandEmptyHook } from "./characters";
import { drawTopCard } from "./deck";
import { computeDistance, getWeaponRange } from "./distance";
import { giveCardToPlayer, transferDynamiteToNextPlayer } from "./equipment";
import { nextRandom } from "./rng";
import type { Action, GameEvent, GameState, PendingAction, PlayerState } from "./types";
import { checkWinCondition } from "./win";

export interface Result {
  state: GameState;
  events: GameEvent[];
}

const DRAW_COUNT = 2;

export function reduce(state: GameState, action: Action): Result {
  if (state.winner) {
    throw new Error("Ván đã kết thúc, không thể tiếp tục hành động");
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

  // Giai đoạn 5 (Pedro Ramirez, đợt 4) — HỎI trước khi rút gì cả: lấy lá 1 từ
  // đỉnh chồng bỏ, hay rút thẳng bộ bài như bình thường? Chỉ hỏi khi chồng bỏ
  // còn bài (rỗng thì rút thẳng bộ bài, khỏi cần hỏi). Đẩy pending rồi TRẢ VỀ
  // NGAY — turnPhase vẫn ở "draw", respondToPickDrawSource() mới thực sự rút
  // bài và chuyển sang "play".
  if (getCharacterDefinition(player.characterId)?.canDrawFromDiscardPile === true && next.discardPile.length > 0) {
    next.pending.push({ kind: "NEED_PICK_DRAW_SOURCE", player: player.id });
    return { state: next, events: [] };
  }

  // Giai đoạn 5 (Black Jack, xem core/characters.ts) — onDrawPhase THAY HẲN
  // pha rút 2 lá mặc định khi nhân vật có định nghĩa hook này.
  const onDrawPhase = getCharacterHooks(player.characterId).onDrawPhase;
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

function handleEndTurn(state: GameState, action: Action & { type: "END_TURN" }): Result {
  assertCurrentPlayer(state, action.playerId);
  assertPhase(state, "play");
  if (state.pending.length > 0) {
    throw new Error("Không thể kết thúc lượt khi còn việc đang chờ xử lý");
  }

  const next = cloneState(state);
  const player = next.players[next.currentPlayerIndex];

  if (player.hand.length > player.hp) {
    next.turnPhase = "discard";
    return { state: next, events: [] };
  }

  advanceTurn(next);
  return { state: next, events: [{ type: "TURN_ENDED", playerId: player.id }] };
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

  if (player.hand.length > player.hp) {
    throw new Error("Phải bỏ đủ bài thừa xuống bằng đúng số máu hiện có");
  }

  const events: GameEvent[] = [{ type: "CARDS_DISCARDED", playerId: player.id, cardIds: action.cardIds }];
  events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)

  advanceTurn(next);
  events.push({ type: "TURN_ENDED", playerId: player.id });
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

  const cardIndex = player.hand.indexOf(action.cardId);
  if (cardIndex === -1) {
    throw new Error(`Người chơi ${player.id} không có lá bài ${action.cardId} trong tay`);
  }

  const cardName = cardNameFromId(action.cardId);

  // Rời tay trước, rồi mới rẽ theo tác dụng riêng của từng lá. Nếu rơi vào
  // "chưa hỗ trợ" bên dưới thì throw luôn — next chỉ là bản sao cục bộ, bị huỷ
  // theo, state gốc không hề bị đụng tới.
  player.hand.splice(cardIndex, 1);
  // Giai đoạn 5 (Suzy Lafayette, đợt 3) — kiểm tra NGAY lúc lá vừa rời tay, kể
  // cả TRƯỚC KHI card này giải quyết xong hiệu ứng riêng (Stagecoach/Wells
  // Fargo tự rút lại ngay sau đó) — đúng "kích hoạt đúng thời điểm lá cuối rời
  // tay", không đợi tới cuối hàm mới kiểm tra (lúc đó có thể tay đã đầy lại).
  const handEmptyEvents = triggerHandEmptyHook(next, player);

  // Lá xanh tự trang bị (súng, Barrel, Scope, Mustang) ở lại trên sân của
  // chính người đánh, KHÔNG vào chồng bỏ như lá nâu.
  let result: Result;
  if (isSelfEquipBlueCardName(cardName)) {
    result = playEquipment(next, player, action.cardId, cardName);
  } else if (cardName === "jail") {
    // Jail gắn lên sân NGƯỜI KHÁC (không phải người đánh) — cũng không vào chồng bỏ.
    result = playJail(next, player, action);
  } else {
    next.discardPile.push(action.cardId);

    switch (cardName) {
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
      default: {
        // isSelfEquipBlueCardName() và nhánh "jail" ở trên đã xử lý hết lá xanh
        // rồi, switch cũng đã liệt kê đủ toàn bộ bài nâu (kể cả "missed" và
        // "dynamite" — 2 case chỉ để throw lỗi rõ ràng, không đánh chủ động được)
        // — dòng dưới chỉ để bắt lỗi biên dịch nếu sau này thêm loại bài mới mà
        // quên xử lý ở đâu đó.
        const neverCardName: never = cardName;
        throw new Error(`Không rõ loại bài: ${JSON.stringify(neverCardName)}`);
      }
    }
  }

  return { state: result.state, events: [...result.events, ...handEmptyEvents] };
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

  const range = getWeaponRange(player);
  const distance = computeDistance(next.players, player.id, target.id);
  if (distance > range) {
    throw new Error(`Mục tiêu ngoài tầm bắn (khoảng cách ${distance}, tầm súng ${range})`);
  }

  // Luật gốc: chỉ 1 lá Bang!/lượt, trừ khi đang cầm súng Volcanic HOẶC là
  // Willy the Kid (Giai đoạn 5, bỏ giới hạn này luôn dù không cầm Volcanic —
  // xem CharacterDefinition.bypassBangLimit ở core/characters.ts).
  const hasVolcanic = player.equipment.some((id) => cardNameFromId(id) === "volcanic");
  const hasUnlimitedBang = hasVolcanic || getCharacterDefinition(player.characterId)?.bypassBangLimit === true;
  if (next.bangUsedThisTurn && !hasUnlimitedBang) {
    throw new Error("Đã đánh Bang! trong lượt này — cần súng Volcanic mới được đánh thêm lần nữa");
  }
  next.bangUsedThisTurn = true;

  pushMissedReaction(next, target, { card: "bang", from: player.id });

  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id }],
  };
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
  source: { card: string; from: string }
): void {
  const attacker = next.players.find((p) => p.id === source.from);
  const missesNeeded = getCharacterHooks(attacker?.characterId ?? null).onOutgoingBang?.() ?? 1;

  next.pending.push(
    missesNeeded > 1
      ? { kind: "NEED_MISSED", player: target.id, source, missesNeeded }
      : { kind: "NEED_MISSED", player: target.id, source }
  );

  const hasRealBarrel = target.equipment.some((id) => cardNameFromId(id) === "barrel");
  const hasVirtualBarrel = getCharacterDefinition(target.characterId)?.virtualBarrel === true;
  const barrelCheckCount = (hasRealBarrel ? 1 : 0) + (hasVirtualBarrel ? 1 : 0);

  for (let i = 0; i < barrelCheckCount; i++) {
    next.pending.push({
      kind: "NEED_DRAW_CHECK",
      player: target.id,
      source: { card: "barrel" },
      matchSuits: ["hearts"],
    });
  }
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
  for (let i = targets.length - 1; i >= 0; i--) {
    pushMissedReaction(next, targets[i], { card: "gatling", from: player.id });
  }
  return { state: next, events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId }] };
}

// Indians!: mỗi người chơi khác còn sống phải bỏ 1 lá Bang! hoặc mất 1 máu.
// Cùng cơ chế thứ tự như Gatling, chỉ khác kind pending và lá cần bỏ.
function playIndians(
  next: GameState,
  player: PlayerState,
  action: Action & { type: "PLAY_CARD" }
): Result {
  const targets = otherAlivePlayersInOrder(next, player.id);
  for (let i = targets.length - 1; i >= 0; i--) {
    next.pending.push({
      kind: "NEED_DISCARD_BANG",
      player: targets[i].id,
      source: { card: "indians", from: player.id },
    });
  }
  return { state: next, events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId }] };
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

  const distance = computeDistance(next.players, player.id, target.id);
  if (distance !== 1) {
    throw new Error(`Panic! chỉ dùng được ở khoảng cách 1 (khoảng cách hiện tại: ${distance})`);
  }

  let stolenCardId: string;
  let stolenFromHand = false;

  if (target.hand.length > 0) {
    if (action.targetCardId) {
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
    if (!action.targetCardId) {
      throw new Error("Tay mục tiêu đã hết bài, phải chỉ định lá trang bị cụ thể muốn cướp trên sân");
    }
    if (cardNameFromId(action.targetCardId) === "dynamite") {
      throw new Error("Dynamite miễn nhiễm với Panic!, không thể cướp");
    }
    const equipIndex = target.equipment.indexOf(action.targetCardId);
    if (equipIndex === -1) {
      throw new Error(`Mục tiêu không có trang bị "${action.targetCardId}" trên sân`);
    }
    target.equipment.splice(equipIndex, 1);
    stolenCardId = action.targetCardId;
  }

  // Lá cướp được không bao giờ là Dynamite (miễn nhiễm, chặn ở trên) — nhưng vẫn
  // đi qua giveCardToPlayer() cho nhất quán với mọi nơi khác đưa bài vào tay.
  giveCardToPlayer(next.players, player, stolenCardId);

  const events: GameEvent[] = [
    { type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id },
    { type: "CARD_STOLEN", playerId: player.id, fromPlayerId: target.id, cardId: stolenCardId },
  ];
  if (stolenFromHand) {
    events.push(...triggerHandEmptyHook(next, target)); // Giai đoạn 5 (Suzy Lafayette)
  }
  return { state: next, events };
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

  // Dynamite miễn nhiễm Cat Balou (mục 8 file luật) — không tính là "có bài trên
  // sân để bỏ".
  const discardableCount =
    action.targetZone === "hand"
      ? target.hand.length
      : target.equipment.filter((id) => cardNameFromId(id) !== "dynamite").length;
  if (discardableCount === 0) {
    throw new Error(
      action.targetZone === "hand"
        ? "Tay mục tiêu không còn bài để bỏ"
        : "Mục tiêu không có trang bị nào trên sân để bỏ (Dynamite, nếu có, miễn nhiễm Cat Balou)"
    );
  }

  next.pending.push({
    kind: "NEED_DISCARD_FROM_ZONE",
    player: target.id,
    zone: action.targetZone,
    source: { card: "cat_balou", from: player.id },
  });

  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id }],
  };
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

  target.equipment.push(action.cardId);

  return {
    state: next,
    events: [{ type: "CARD_PLAYED", playerId: player.id, cardId: action.cardId, targetId: target.id }],
  };
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

// Chưa xử lý ngoại lệ "Beer vô tác dụng khi chỉ còn 2 người sống" — cần đếm
// người còn sống, để dành khi cài việc 1.13 (chết/điều kiện thắng).
function playBeer(next: GameState, player: PlayerState, cardId: string): Result {
  const restored = Math.min(1, player.maxHp - player.hp);
  player.hp += restored;

  const events: GameEvent[] = [{ type: "CARD_PLAYED", playerId: player.id, cardId }];
  if (restored > 0) {
    events.push({ type: "HP_RESTORED", playerId: player.id, amount: restored });
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
  let drawnCount = 0;
  for (let i = 0; i < count; i++) {
    const card = drawTopCard(next);
    if (card) {
      giveCardToPlayer(next.players, player, card);
      drawnCount++;
    }
  }

  return {
    state: next,
    events: [
      { type: "CARD_PLAYED", playerId: player.id, cardId },
      { type: "CARDS_DRAWN", playerId: player.id, count: drawnCount },
    ],
  };
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
    if (cardName !== requiredCardName) {
      throw new Error(`Lá "${cardName}" không hợp lệ cho việc đang chờ này`);
    }

    player.hand.splice(cardIndex, 1);
    next.discardPile.push(action.cardId);
    const events: GameEvent[] = [{ type: playedEventType, playerId: player.id }];
    events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)
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
    const cardIndex = player.hand.indexOf(action.cardId);
    if (cardIndex === -1) {
      throw new Error(`Người chơi ${player.id} không có lá bài ${action.cardId} trong tay`);
    }
    const cardName = cardNameFromId(action.cardId);
    if (cardName !== "missed") {
      throw new Error(`Lá "${cardName}" không hợp lệ cho việc đang chờ này`);
    }

    player.hand.splice(cardIndex, 1);
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
    events.push(...triggerHandEmptyHook(next, player)); // Giai đoạn 5 (Suzy Lafayette)
    return { state: next, events };
  }

  return { state: next, events: applyDamage(next, player, 1, top.source.from) };
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
    if (cardName !== "bang") {
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
    return { state: next, events };
  }

  return { state: next, events: applyDamage(next, player, 1, top.opponent) };
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
  const hasLuckyDraw = getCharacterDefinition(drawer?.characterId ?? null)?.hasLuckyDraw === true;
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

    if (matched) {
      events.push({ type: "JAIL_ESCAPED", playerId: jailedPlayer.id });
    } else {
      events.push({ type: "JAIL_SKIPPED_TURN", playerId: jailedPlayer.id });
      advanceTurn(next); // bỏ qua cả lượt — người kế tiếp lại được xét Bước 0 y hệt
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
  const hooks = getCharacterHooks(target.characterId);
  const events: GameEvent[] = [];
  if (hooks.onLoseLife) events.push(...hooks.onLoseLife(next, target, amount));
  if (byPlayerId && hooks.onLoseLifeFromCard) {
    events.push(...hooks.onLoseLifeFromCard(next, target, amount, byPlayerId));
  }
  return events;
}

// Kiểm tra hp sau khi ĐÃ trừ máu (bởi applyDamage() hoặc trực tiếp như
// Dynamite) — tách riêng để Dynamite không bị phát thêm DAMAGE_DEALT chồng
// lên DYNAMITE_EXPLODED đã có sẵn ý nghĩa tương đương.
function eliminateIfDead(next: GameState, target: PlayerState, killerId: string | null): GameEvent[] {
  if (target.hp > 0) return [];
  return eliminatePlayer(next, target, killerId);
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
    const hooks = getCharacterHooks(player.characterId);
    if (hooks.onAnyDeath) deathHookEvents.push(...hooks.onAnyDeath(next, player, target));
  }

  // Bỏ hết bài trên tay + trang bị trên sân vào chồng bỏ — người chết không giữ gì cả.
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
      next.discardPile.push(...killer.hand, ...killer.equipment);
      killer.hand = [];
      killer.equipment = [];
      events.push({ type: "SHERIFF_KILLED_DEPUTY_PENALTY", playerId: killer.id });
    }
  }

  const winner = checkWinCondition(next.players);
  if (winner) {
    next.winner = winner;
    events.push({ type: "GAME_ENDED", winner });
    return events;
  }

  // Người vừa chết đang là người tới lượt (chỉ có thể xảy ra khi tự thua Duel
  // với chính mình, hoặc tự nổ Dynamite ở Bước 0 đầu lượt) và không còn việc
  // gì khác đang chờ -> chuyển lượt ngay, người chết không thể tự rút/đánh/bỏ bài.
  const isCurrentPlayer = next.players[next.currentPlayerIndex].id === target.id;
  if (isCurrentPlayer && next.pending.length === 0) {
    advanceTurn(next);
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

function advanceTurn(next: GameState): void {
  next.currentPlayerIndex = nextAlivePlayerIndex(next, next.currentPlayerIndex);
  next.turnPhase = "draw";
  next.bangUsedThisTurn = false;
  applyTurnStartChecks(next);
}

// Bước 0 đầu lượt (mục 4 file luật): Dynamite kiểm tra TRƯỚC (có thể giết luôn,
// khỏi xét Jail), Jail SAU. Chỉ đẩy pending cho bước đang xét đầu tiên còn áp
// dụng — bước tiếp theo (vd Jail sau khi Dynamite nổ/chuyển xong) được
// resolveDrawCheck() đẩy tiếp sau khi xử lý xong hậu quả của bước trước, không
// đẩy cả 2 cùng lúc ở đây. Export để setup.ts gọi cho LƯỢT ĐẦU TIÊN của ván
// (setupGame không đi qua advanceTurn, nhưng lượt đầu vẫn phải qua Bước 0 nếu
// ai đó chẳng may được chia Dynamite ngay lúc setup).
export function applyTurnStartChecks(next: GameState): void {
  const player = next.players[next.currentPlayerIndex];
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
  };
}
