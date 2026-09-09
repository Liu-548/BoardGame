// Sảnh chọn game — màn hình ĐẦU TIÊN khi mở link, đứng trước màn "Chọn cách
// chơi" của Bang!. File này KHÔNG import gì từ src/games/bang/ (đặt ngang
// hàng src/games/, không phải bên trong) — sau này Mạt Chược/Coup có code
// thật thì màn này vẫn dùng lại y nguyên, chỉ cần đổi `locked: false` ở GAMES
// bên dưới.
//
// Mạt Chược/Coup CHƯA có code thật (chỉ để chỗ sẵn ở src/games/mahjong|coup/,
// xem README.md trong 2 thư mục đó) — thẻ của 2 game này bấm vào chỉ xổ ra 1
// dòng ghi chú ngay dưới thẻ, không dẫn đi đâu cả.

export type HubGameId = "bang" | "mahjong" | "coup";

export interface HubHandlers {
  onSelectGame(id: HubGameId): void;
  onToggleLockedNote(id: HubGameId): void;
}

interface HubGameEntry {
  id: HubGameId;
  title: string;
  posterGlyph: string;
  // Chữ trên poster viết kiểu "khắc gỗ" (font Rye, chỉ Bang! dùng — xem
  // .hub-card__poster-label--wordmark, style.css) thay vì 1 chữ cái thường.
  posterIsWordmark: boolean;
  description: string;
  playersHint: string;
  locked: boolean;
}

const GAMES: HubGameEntry[] = [
  {
    id: "bang",
    title: "Bang!",
    posterGlyph: "Bang!",
    posterIsWordmark: true,
    description: "Miền Tây hoang dã: cảnh sát, ngoài vòng pháp luật và phản diện so tài bằng bài lá và súng.",
    playersHint: "2–8 người",
    locked: false,
  },
  {
    id: "mahjong",
    title: "Mạt Chược",
    posterGlyph: "麻",
    posterIsWordmark: false,
    description: "Xếp bộ, chờ ù, đấu trí quanh bàn gỗ 4 người.",
    playersHint: "4 người",
    locked: true,
  },
  {
    id: "coup",
    title: "Coup",
    posterGlyph: "C",
    posterIsWordmark: false,
    description: "Nói dối, tố cáo, lật bài — ai giữ được ảnh hưởng cuối cùng, người đó thắng.",
    playersHint: "2–6 người",
    locked: true,
  },
];

const SVG_NS = "http://www.w3.org/2000/svg";

// Ngôi sao mờ trên poster Bang! — chỉ để trang trí, giống hệt bản xem trước
// đã duyệt (Artifact). Dựng qua DOM API (không dùng innerHTML) cho nhất quán
// với phần còn lại của dự án (xem quy tắc an toàn ở CLAUDE.md).
function createStarIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "hub-star-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M12 2l2.6 6.6L22 9l-5.3 4.6L18.2 21 12 17l-6.2 4 1.5-7.4L2 9l7.4-.4z");
  svg.appendChild(path);
  return svg;
}

export function renderHubScreen(container: HTMLElement, expandedLockedGame: HubGameId | null, handlers: HubHandlers): void {
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "hub-header";

  const eyebrow = document.createElement("p");
  eyebrow.className = "hub-eyebrow";
  eyebrow.textContent = "Chơi cùng nhóm bạn";

  const title = document.createElement("h1");
  title.className = "hub-title";
  title.textContent = "Sảnh Bài Xóm";

  const subtitle = document.createElement("p");
  subtitle.className = "hub-subtitle";
  subtitle.textContent = "Chọn một trò bên dưới để bắt đầu.";

  const titleBlock = document.createElement("div");
  titleBlock.appendChild(eyebrow);
  titleBlock.appendChild(title);
  titleBlock.appendChild(subtitle);

  const meta = document.createElement("p");
  meta.className = "hub-header__meta";
  meta.appendChild(document.createTextNode("Bang! chơi được ngay"));
  meta.appendChild(document.createElement("br"));
  meta.appendChild(document.createTextNode("2 trò còn lại sắp có"));

  header.appendChild(titleBlock);
  header.appendChild(meta);
  container.appendChild(header);

  const shelf = document.createElement("div");
  shelf.className = "hub-shelf";
  for (const game of GAMES) {
    shelf.appendChild(renderHubCard(game, expandedLockedGame === game.id, handlers));
  }
  container.appendChild(shelf);
}

function renderHubCard(game: HubGameEntry, noteOpen: boolean, handlers: HubHandlers): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "hub-card" + (game.locked ? " hub-card--locked" : "");
  card.setAttribute("aria-label", game.locked ? `${game.title} — sắp ra mắt` : `Chơi ${game.title}`);
  if (game.locked) card.setAttribute("aria-expanded", noteOpen ? "true" : "false");
  card.addEventListener("click", () => {
    if (game.locked) handlers.onToggleLockedNote(game.id);
    else handlers.onSelectGame(game.id);
  });

  const poster = document.createElement("div");
  poster.className = "hub-card__poster hub-card__poster--" + game.id;
  if (game.id === "bang") poster.appendChild(createStarIcon());
  const posterLabel = document.createElement("span");
  posterLabel.className = "hub-card__poster-label" + (game.posterIsWordmark ? " hub-card__poster-label--wordmark" : "");
  posterLabel.textContent = game.posterGlyph;
  poster.appendChild(posterLabel);
  card.appendChild(poster);

  const body = document.createElement("div");
  body.className = "hub-card__body";

  const titleEl = document.createElement("h2");
  titleEl.className = "hub-card__title";
  titleEl.textContent = game.title;

  const desc = document.createElement("p");
  desc.className = "hub-card__desc";
  desc.textContent = game.description;

  const foot = document.createElement("div");
  foot.className = "hub-card__foot";
  const players = document.createElement("span");
  players.className = "hub-card__players";
  players.textContent = game.playersHint;
  const pill = document.createElement("span");
  pill.className = "hub-pill " + (game.locked ? "hub-pill--soon" : "hub-pill--go");
  pill.textContent = game.locked ? "Sắp ra mắt" : "Chơi ngay →";
  foot.appendChild(players);
  foot.appendChild(pill);

  body.appendChild(titleEl);
  body.appendChild(desc);
  body.appendChild(foot);
  card.appendChild(body);

  if (game.locked) {
    const note = document.createElement("p");
    note.className = "hub-lock-note" + (noteOpen ? " hub-lock-note--open" : "");
    note.textContent = "Đang được chuẩn bị, chưa chơi được đâu. Trong lúc chờ, chơi thử Bang! nhé!";
    card.appendChild(note);
  }

  return card;
}
