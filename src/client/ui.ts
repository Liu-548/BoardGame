// Việc 2.2 (vẽ state) + 2.3 (bấm bài → gọi reduce) + 2.4 (hiện đầy đủ stack
// pending, không chỉ đỉnh) + 2.5 (màn hình thiết lập + chơi lại, chế độ
// hotseat). Nhãn tiếng Việt (tên bài, tên vai) chỉ để HIỂN THỊ nên đặt ở đây,
// không đặt trong core/ — core/ không quan tâm chuyện trình bày.

import { cardNameFromId } from "../core/cards";
import type { CardName } from "../core/cards";
import type { GameState, PendingAction, PlayerState, Role } from "../core/types";

const CARD_LABELS: Record<CardName, string> = {
  bang: "Bang!",
  missed: "Missed!",
  beer: "Bia",
  saloon: "Saloon",
  stagecoach: "Xe ngựa",
  wells_fargo: "Wells Fargo",
  panic: "Panic!",
  cat_balou: "Cat Balou",
  general_store: "Cửa hàng tổng hợp",
  indians: "Người da đỏ!",
  duel: "Đấu tay đôi",
  gatling: "Súng máy Gatling",
  volcanic: "Súng Volcanic",
  schofield: "Súng Schofield",
  remington: "Súng Remington",
  rev_carabine: "Súng Rev. Carabine",
  winchester: "Súng Winchester",
  barrel: "Thùng rượu",
  scope: "Ống nhắm",
  mustang: "Ngựa Mustang",
  jail: "Nhà tù",
  dynamite: "Thuốc nổ",
};

const ROLE_LABELS: Record<Role, string> = {
  sheriff: "Cảnh sát trưởng",
  deputy: "Phó cảnh sát trưởng",
  outlaw: "Ngoài vòng pháp luật",
  renegade: "Kẻ phản bội",
};

// Thắng thua theo PHE (sheriff_deputy gộp 2 vai), nên tách bảng nhãn riêng
// khỏi ROLE_LABELS (theo từng người) ở trên.
const WINNER_LABELS: Record<NonNullable<GameState["winner"]>, string> = {
  sheriff_deputy: "Cảnh sát trưởng + Phó cảnh sát trưởng",
  outlaw: "Ngoài vòng pháp luật",
  renegade: "Kẻ phản bội",
};

const TURN_PHASE_LABELS: Record<GameState["turnPhase"], string> = {
  draw: "rút bài",
  play: "đánh bài",
  discard: "bỏ bài thừa",
};

function cardLabel(cardId: string): string {
  return CARD_LABELS[cardNameFromId(cardId)];
}

// ----- Trạng thái "đang chọn" tạm thời, CHỈ tồn tại ở client (không phải
// GameState) — vd đã bấm 1 lá Bang!, đang chờ bấm chọn mục tiêu. main.ts giữ
// biến này, ui.ts chỉ đọc để biết vẽ gì.

export type Selection =
  | { step: "idle" }
  | { step: "picking-target"; cardId: string; cardName: CardName }
  | { step: "picking-panic-equipment"; cardId: string; targetId: string }
  | { step: "picking-cat-balou-zone"; cardId: string; targetId: string };

export interface UiHandlers {
  onDrawCards(): void;
  onEndTurn(): void;
  onToggleDiscardCard(cardId: string): void;
  onConfirmDiscard(): void;
  onHandCardClick(cardId: string): void;
  onEquipmentClick(ownerId: string, cardId: string): void;
  onPlayerClick(targetId: string): void;
  onStoreOptionClick(cardId: string): void;
  onZoneClick(zone: "hand" | "equipment"): void;
  onRespondTakeConsequence(): void;
  onCancelSelection(): void;
  onPlayAgain(): void;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

// Danh sách tên bài mà người ĐANG PHẢN HỒI (đứng đầu pending) có thể bấm để
// đáp lại — mỗi kind chỉ chấp nhận đúng 1 loại bài (xem PendingAction ở
// types.ts). Chỉ để quyết định bấm được lá nào, KHÔNG thay cho việc reduce()
// tự kiểm tra lại — bấm sai/không hợp lệ vẫn báo lỗi bình thường.
function respondableCardName(pendingKind: string): CardName | null {
  switch (pendingKind) {
    case "NEED_MISSED":
      return "missed";
    case "NEED_DISCARD_BANG":
    case "NEED_DUEL_RESPONSE":
      return "bang";
    default:
      return null;
  }
}

function renderHandSection(
  container: HTMLElement,
  state: GameState,
  player: PlayerState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  const { selection, discardSelection } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "cards";

  const top = state.pending[state.pending.length - 1];
  const isCurrentTurnToPlay =
    state.pending.length === 0 &&
    state.turnPhase === "play" &&
    state.players[state.currentPlayerIndex].id === player.id;
  const isDiscarding =
    state.pending.length === 0 &&
    state.turnPhase === "discard" &&
    state.players[state.currentPlayerIndex].id === player.id;
  const isResponding = top !== undefined && top.player === player.id;
  const respondableName = isResponding ? respondableCardName(top.kind) : null;
  const isDiscardFromHand = isResponding && top.kind === "NEED_DISCARD_FROM_ZONE" && top.zone === "hand";

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);
    const label = cardLabel(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      const el = button(selected ? `✓ ${label}` : label, () => handlers.onToggleDiscardCard(cardId));
      if (selected) el.classList.add("card--selected");
      wrapper.appendChild(el);
      continue;
    }

    if (isDiscardFromHand) {
      wrapper.appendChild(button(label, () => handlers.onHandCardClick(cardId)));
      continue;
    }

    if (respondableName !== null) {
      if (name === respondableName) {
        wrapper.appendChild(button(label, () => handlers.onHandCardClick(cardId)));
      } else {
        const span = document.createElement("span");
        span.className = "card card--inert";
        span.textContent = label;
        wrapper.appendChild(span);
      }
      continue;
    }

    if (isCurrentTurnToPlay && name !== "missed") {
      const armed = selection.step === "picking-target" && selection.cardId === cardId;
      const el = button(label, () => handlers.onHandCardClick(cardId));
      if (armed) el.classList.add("card--selected");
      wrapper.appendChild(el);
      continue;
    }

    const span = document.createElement("span");
    span.className = "card card--inert";
    span.textContent = label;
    wrapper.appendChild(span);
  }

  container.appendChild(wrapper);
}

function renderEquipmentSection(
  container: HTMLElement,
  state: GameState,
  player: PlayerState,
  selection: Selection,
  handlers: UiHandlers
): void {
  const wrapper = document.createElement("div");
  wrapper.className = "cards";

  const top = state.pending[state.pending.length - 1];
  const isDiscardFromEquipment =
    top !== undefined && top.player === player.id && top.kind === "NEED_DISCARD_FROM_ZONE" && top.zone === "equipment";
  const isPickingPanicTarget = selection.step === "picking-panic-equipment" && selection.targetId === player.id;

  for (const cardId of player.equipment) {
    const label = cardLabel(cardId);
    const isDynamite = cardNameFromId(cardId) === "dynamite";

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(button(label, () => handlers.onEquipmentClick(player.id, cardId)));
      continue;
    }

    const span = document.createElement("span");
    span.className = "card card--inert";
    span.textContent = label;
    wrapper.appendChild(span);
  }

  container.appendChild(wrapper);
}

function renderPlayer(
  state: GameState,
  player: PlayerState,
  index: number,
  options: RenderOptions,
  handlers: UiHandlers
): HTMLElement {
  const { selection } = options;
  const el = document.createElement("article");
  el.className = "player";
  if (index === state.currentPlayerIndex) el.classList.add("player--current");
  if (!player.alive) el.classList.add("player--dead");

  const heading = document.createElement("h3");
  heading.textContent = player.name + (index === state.currentPlayerIndex ? " ← đang tới lượt" : "");
  el.appendChild(heading);

  const roleText = player.role ? ROLE_LABELS[player.role] : "(chưa chia vai)";
  const roleAndHp = document.createElement("p");
  roleAndHp.textContent =
    `${roleText} · Máu: ${player.hp}/${player.maxHp} · ${player.alive ? "Còn sống" : "Đã chết"}`;
  el.appendChild(roleAndHp);

  const handLabel = document.createElement("p");
  handLabel.textContent = `Bài trên tay (${player.hand.length}):`;
  el.appendChild(handLabel);
  renderHandSection(el, state, player, options, handlers);

  const equipmentLabel = document.createElement("p");
  equipmentLabel.textContent = "Trang bị:";
  el.appendChild(equipmentLabel);
  renderEquipmentSection(el, state, player, selection, handlers);

  // Chọn mục tiêu: chỉ hiện nút này cho người KHÁC người đang cầm bài, và chỉ
  // khi đang ở bước "picking-target".
  if (selection.step === "picking-target" && player.alive) {
    const acting = state.players[state.currentPlayerIndex];
    if (player.id !== acting.id) {
      el.appendChild(button("Chọn làm mục tiêu", () => handlers.onPlayerClick(player.id)));
    }
  }

  // Cat Balou: sau khi chọn xong mục tiêu, hỏi bỏ tay hay bỏ sân — chỉ hỏi
  // cho ĐÚNG người vừa được chọn, và chỉ hiện lựa chọn nào còn bài để bỏ.
  if (selection.step === "picking-cat-balou-zone" && selection.targetId === player.id) {
    const zoneWrapper = document.createElement("div");
    zoneWrapper.className = "cards";
    if (player.hand.length > 0) {
      zoneWrapper.appendChild(button("Bắt bỏ bài trên tay", () => handlers.onZoneClick("hand")));
    }
    if (player.equipment.some((id) => cardNameFromId(id) !== "dynamite")) {
      zoneWrapper.appendChild(button("Bắt bỏ bài trên sân", () => handlers.onZoneClick("equipment")));
    }
    el.appendChild(zoneWrapper);
  }

  return el;
}

// Mô tả ngắn gọn 1 mục pending BẤT KỲ trong stack (không chỉ đỉnh) — dùng để
// vẽ cả stack ở renderPendingPanel(), không nhắc "đang chờ" (chữ đó tuỳ vị trí
// trong stack: đỉnh thì đang chờ THẬT, phía dưới thì "sắp tới" — thêm ở nơi gọi).
function pendingDescription(state: GameState, item: PendingAction): string {
  const player = state.players.find((p) => p.id === item.player)!.name;

  switch (item.kind) {
    case "NEED_MISSED":
      return `${player} đỡ Bang! bằng Missed! (hoặc chịu mất máu)`;
    case "NEED_DISCARD_BANG":
      return `${player} bỏ 1 lá Bang! (hoặc chịu mất máu)`;
    case "NEED_DUEL_RESPONSE":
      return `${player} bỏ 1 lá Bang! trong Đấu tay đôi (hoặc chịu mất máu)`;
    case "NEED_PICK_STORE_CARD":
      return `${player} chọn 1 lá từ Cửa hàng tổng hợp`;
    case "NEED_DISCARD_FROM_ZONE":
      return `${player} chọn 1 lá để bỏ (${item.zone === "hand" ? "trên tay" : "trên sân"})`;
    case "NEED_DRAW_CHECK":
      return `${player} lật bài kiểm tra (draw!)`;
    default: {
      const neverKind: never = item;
      throw new Error(`Chưa biết mô tả cho pending: ${JSON.stringify(neverKind)}`);
    }
  }
}

// Vẽ TOÀN BỘ stack pending (việc 2.4), không chỉ đỉnh — mục 5 file luật: "Việc
// đang chờ là mảng dùng như stack, luôn xử lý phần tử CUỐI cùng". Đỉnh (phần
// tử cuối mảng) là việc đang chờ THẬT SỰ, có nút bấm phản hồi; các mục còn lại
// chỉ để NGƯỜI CHƠI BIẾT trước việc gì sẽ tới, không bấm được (bấm sai thứ tự
// stack là sai luật — xem mục 5 CLAUDE.md).
function renderPendingPanel(container: HTMLElement, state: GameState, handlers: UiHandlers): void {
  if (state.pending.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "panel panel--pending";

  const heading = document.createElement("p");
  heading.className = "pending-heading";
  heading.textContent =
    state.pending.length > 1
      ? `Đang có ${state.pending.length} việc chờ xử lý (việc mới phát sinh luôn xử lý trước):`
      : "Đang chờ xử lý:";
  panel.appendChild(heading);

  const list = document.createElement("ol");
  list.className = "pending-list";
  // Duyệt từ ĐỈNH (phần tử cuối mảng) xuống ĐÁY — đúng thứ tự sẽ được xử lý.
  for (let i = state.pending.length - 1; i >= 0; i--) {
    const item = state.pending[i];
    const isTop = i === state.pending.length - 1;
    const li = document.createElement("li");
    li.className = isTop ? "pending-item pending-item--current" : "pending-item";
    li.textContent = isTop
      ? `Đang chờ: ${pendingDescription(state, item)}`
      : `Sắp tới: ${pendingDescription(state, item)}`;
    list.appendChild(li);
  }
  panel.appendChild(list);

  // Nút phản hồi CHỈ áp dụng cho đỉnh stack — các mục "sắp tới" không có nút,
  // vì chưa tới lượt xử lý (phải giải quyết xong đỉnh trước).
  const top = state.pending[state.pending.length - 1];
  if (top.kind === "NEED_PICK_STORE_CARD") {
    const wrapper = document.createElement("div");
    wrapper.className = "cards";
    for (const cardId of top.options) {
      wrapper.appendChild(button(cardLabel(cardId), () => handlers.onStoreOptionClick(cardId)));
    }
    panel.appendChild(wrapper);
  } else if (top.kind === "NEED_DRAW_CHECK") {
    panel.appendChild(button("Lật bài", () => handlers.onRespondTakeConsequence()));
  } else if (top.kind === "NEED_MISSED" || top.kind === "NEED_DISCARD_BANG" || top.kind === "NEED_DUEL_RESPONSE") {
    panel.appendChild(button("Chịu mất máu (không đỡ)", () => handlers.onRespondTakeConsequence()));
  }

  container.appendChild(panel);
}

function renderPhaseActions(
  container: HTMLElement,
  state: GameState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  if (state.pending.length > 0 || state.winner) return;

  const panel = document.createElement("div");
  panel.className = "panel";

  if (state.turnPhase === "draw") {
    panel.appendChild(button("Rút bài", () => handlers.onDrawCards()));
  } else if (state.turnPhase === "discard") {
    const player = state.players[state.currentPlayerIndex];
    const excess = player.hand.length - player.hp;
    const selectedCount = options.discardSelection.length;
    const info = document.createElement("p");
    info.textContent = `Cần bỏ ${excess} lá — đã chọn ${selectedCount}`;
    panel.appendChild(info);
    const confirmBtn = button("Xác nhận bỏ bài", () => handlers.onConfirmDiscard());
    confirmBtn.disabled = selectedCount !== excess;
    panel.appendChild(confirmBtn);
  } else {
    panel.appendChild(button("Kết thúc lượt", () => handlers.onEndTurn()));
  }

  container.appendChild(panel);
}

export interface RenderOptions {
  selection: Selection;
  error: string | null;
  discardSelection: string[]; // các cardId đã chọn để bỏ, chỉ có ý nghĩa khi turnPhase === "discard"
}

export function renderApp(
  container: HTMLElement,
  state: GameState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  container.replaceChildren();

  if (options.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = options.error;
    container.appendChild(errorEl);
  }

  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent =
    `Giai đoạn lượt: ${TURN_PHASE_LABELS[state.turnPhase]} · ` +
    `Bộ bài còn ${state.deck.length} lá · Chồng bỏ ${state.discardPile.length} lá` +
    (state.winner ? ` · VÁN KẾT THÚC — phe thắng: ${WINNER_LABELS[state.winner]}` : "");
  container.appendChild(summary);

  if (state.winner) {
    const panel = document.createElement("div");
    panel.className = "panel panel--selection";
    panel.appendChild(button("Chơi ván mới", () => handlers.onPlayAgain()));
    container.appendChild(panel);
  }

  if (options.selection.step !== "idle") {
    const hint = document.createElement("div");
    hint.className = "panel panel--selection";
    hint.appendChild(document.createTextNode("Đang chọn mục tiêu... "));
    hint.appendChild(button("Huỷ", () => handlers.onCancelSelection()));
    container.appendChild(hint);
  }

  renderPendingPanel(container, state, handlers);
  renderPhaseActions(container, state, options, handlers);

  const playersEl = document.createElement("div");
  playersEl.className = "players";
  for (const [index, player] of state.players.entries()) {
    playersEl.appendChild(renderPlayer(state, player, index, options, handlers));
  }
  container.appendChild(playersEl);
}

// ----- Việc 2.5: màn hình thiết lập ván mới (chế độ hotseat — 4-7 người chia
// nhau gõ tên rồi ngồi chung 1 máy chơi hết ván). Đây là màn hình HIỆN RA
// TRƯỚC khi có GameState (chưa gọi setupGame()), nên không nhận GameState làm
// tham số như renderApp() — chỉ nhận danh sách tên đang gõ dở.

export interface SetupHandlers {
  onNameChange(index: number, value: string): void;
  onAddPlayer(): void;
  onRemovePlayer(): void;
  onStartGame(): void;
}

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 7;

export function renderSetupScreen(
  container: HTMLElement,
  names: string[],
  error: string | null,
  handlers: SetupHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Thiết lập ván mới (chơi chung 1 máy)";
  container.appendChild(heading);

  const hint = document.createElement("p");
  hint.textContent = `Cần 4-7 người chơi — đang có ${names.length}. Mỗi người tự gõ tên của mình.`;
  container.appendChild(hint);

  if (error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = error;
    container.appendChild(errorEl);
  }

  const list = document.createElement("div");
  list.className = "setup-list";
  names.forEach((name, index) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.placeholder = `Người chơi ${index + 1}`;
    // CHỈ cập nhật biến ở main.ts, KHÔNG render lại ở đây — render lại giữa
    // lúc đang gõ sẽ xoá và tạo lại input mới, làm mất luôn con trỏ đang gõ.
    input.addEventListener("input", () => handlers.onNameChange(index, input.value));
    list.appendChild(input);
  });
  container.appendChild(list);

  const controls = document.createElement("div");
  controls.className = "panel";
  const addBtn = button("+ Thêm người chơi", () => handlers.onAddPlayer());
  addBtn.disabled = names.length >= MAX_PLAYERS;
  controls.appendChild(addBtn);
  const removeBtn = button("- Bớt người chơi", () => handlers.onRemovePlayer());
  removeBtn.disabled = names.length <= MIN_PLAYERS;
  controls.appendChild(removeBtn);
  container.appendChild(controls);

  container.appendChild(button("Bắt đầu ván", () => handlers.onStartGame()));
}
