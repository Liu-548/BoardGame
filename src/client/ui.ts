// Việc 2.2: chỉ VẼ state ra màn hình bằng chữ, chưa xử lý bấm bài (việc 2.3)
// và chưa có UI riêng cho stack pending (việc 2.4). Nhãn tiếng Việt (tên bài,
// tên vai) chỉ để HIỂN THỊ nên đặt ở đây, không đặt trong core/ — core/ không
// quan tâm chuyện trình bày, chỉ giữ dữ liệu bằng tiếng Anh (CardName, Role).

import { cardNameFromId } from "../core/cards";
import type { CardName } from "../core/cards";
import type { GameState, PlayerState, Role } from "../core/types";

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

function cardLabel(cardId: string): string {
  return CARD_LABELS[cardNameFromId(cardId)];
}

function cardListText(cardIds: string[]): string {
  return cardIds.length > 0 ? cardIds.map(cardLabel).join(", ") : "(không có)";
}

function renderPlayer(state: GameState, player: PlayerState, index: number): HTMLElement {
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

  const hand = document.createElement("p");
  hand.textContent = `Bài trên tay (${player.hand.length}): ${cardListText(player.hand)}`;
  el.appendChild(hand);

  const equipment = document.createElement("p");
  equipment.textContent = `Trang bị: ${cardListText(player.equipment)}`;
  el.appendChild(equipment);

  return el;
}

const TURN_PHASE_LABELS: Record<GameState["turnPhase"], string> = {
  draw: "rút bài",
  play: "đánh bài",
  discard: "bỏ bài thừa",
};

// Vẽ toàn bộ state vào `container` — xoá sạch nội dung cũ rồi vẽ lại từ đầu
// (đơn giản, đủ dùng khi chưa cần tối ưu re-render).
export function renderGameState(container: HTMLElement, state: GameState): void {
  container.replaceChildren();

  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent =
    `Giai đoạn lượt: ${TURN_PHASE_LABELS[state.turnPhase]} · ` +
    `Bộ bài còn ${state.deck.length} lá · Chồng bỏ ${state.discardPile.length} lá` +
    (state.winner ? ` · VÁN KẾT THÚC — phe thắng: ${WINNER_LABELS[state.winner]}` : "");
  container.appendChild(summary);

  const playersEl = document.createElement("div");
  playersEl.className = "players";
  for (const [index, player] of state.players.entries()) {
    playersEl.appendChild(renderPlayer(state, player, index));
  }
  container.appendChild(playersEl);
}
