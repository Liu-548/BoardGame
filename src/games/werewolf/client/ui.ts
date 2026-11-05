// DOM của Ma Sói. Khung màn chơi dựng 1 LẦN, sau đó chỉ cập nhật phần tử theo playerId (D-65, D-66).
import type { LobbyPlayer, ServerMessage } from "../../../shared/room/protocol";
import type { Action, Config, Role } from "../core/types";
import { ALL_ROLES, MAX_PLAYERS } from "../core/types";
import type { WerewolfView } from "../core/view";
import { describeLog, describeTurn, phaseTitle, ROLE_LABEL } from "./turn";
import type { ButtonSpec } from "./turn";

type Lobby = Extract<ServerMessage, { type: "lobby" }>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
// Typings của workers-types làm append()/replaceChildren(...) không dùng được với DOM → dùng appendChild.
function add(parent: Node, ...kids: Node[]): void {
  for (const k of kids) parent.appendChild(k);
}
function fill(parent: HTMLElement, kids: Node[]): void {
  parent.replaceChildren();
  add(parent, ...kids);
}
function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}
function button(label: string, onClick: () => void, className = ""): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

// ---------- Màn nhập tên + mã phòng ----------
export interface FormHandlers {
  onJoin(name: string, code: string): void;
  onBack(): void;
  makeCode(): string;
}

export function renderForm(root: HTMLElement, init: { name: string; code: string; error: string | null }, h: FormHandlers): void {
  root.replaceChildren();
  const wrap = el("div", "ww-screen ww-form");
  wrap.appendChild(el("h2", "ww-title", "🐺 Ma Sói"));
  const nameInput = el("input");
  nameInput.placeholder = "Tên của bạn (tối đa 20 ký tự)";
  nameInput.maxLength = 20;
  nameInput.value = init.name;
  const codeInput = el("input");
  codeInput.placeholder = "Mã phòng";
  codeInput.value = init.code;
  codeInput.autocapitalize = "characters";
  const err = el("p", "ww-error", init.error ?? "");
  err.hidden = !init.error;
  const join = () => h.onJoin(nameInput.value, codeInput.value);
  add(wrap, 
    labelled("Tên", nameInput),
    labelled("Mã phòng", codeInput),
    button("Tạo mã mới", () => (codeInput.value = h.makeCode()), "ww-btn"),
    err,
    button("Vào phòng", join, "ww-btn ww-btn--primary"),
    button("← Về Sảnh", h.onBack, "ww-btn ww-btn--link"),
  );
  root.appendChild(wrap);
}

function labelled(text: string, input: HTMLElement): HTMLLabelElement {
  const l = el("label", "ww-label");
  add(l, el("span", undefined, text), input);
  return l;
}

// ---------- Phòng chờ (cũng dùng làm màn "chờ ván sau") ----------
export interface LobbyHandlers {
  onSetConfig(config: Config | null): void;
  onStart(): void;
  onLeave(): void;
}

export function renderLobby(root: HTMLElement, lobby: Lobby, myId: string, roomCode: string, h: LobbyHandlers): void {
  root.replaceChildren();
  const isOwner = lobby.ownerId === myId;
  const config = lobby.config as Config;
  const me = lobby.players.find((p) => p.playerId === myId);
  const wrap = el("div", "ww-screen ww-lobby");
  wrap.appendChild(el("h2", "ww-title", `🐺 Phòng ${roomCode}`));

  if (lobby.inGame) {
    wrap.appendChild(el("p", "ww-note", me?.waiting ? "Ván đang chơi — bạn sẽ vào ván sau." : "Ván đang chơi."));
  }

  const list = el("ul", "ww-players");
  for (const p of lobby.players) list.appendChild(playerRow(p, lobby.ownerId, myId));
  wrap.appendChild(el("h3", undefined, `Đã vào phòng (${lobby.players.length})`));
  wrap.appendChild(list);

  if (!lobby.inGame) {
    wrap.appendChild(el("h3", undefined, "Số lượng vai"));
    const roles = el("div", "ww-roles");
    const total = ALL_ROLES.reduce((s, r) => s + config.roleCounts[r], 0);
    for (const role of ALL_ROLES) roles.appendChild(roleRow(role, config, isOwner, h));
    wrap.appendChild(roles);
    wrap.appendChild(el("p", "ww-note", `Tổng ${total} vai`));

    const secs = el("label", "ww-label");
    secs.appendChild(el("span", undefined, "Thời gian mỗi pha đêm (giây)"));
    const sel = el("select");
    sel.disabled = !isOwner;
    for (const s of [10, 15, 20, 30, 45, 60]) {
      const o = el("option", undefined, String(s));
      o.value = String(s);
      if (s * 1000 === config.nightStepMs) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => h.onSetConfig({ ...config, nightStepMs: Number(sel.value) * 1000 }));
    secs.appendChild(sel);
    wrap.appendChild(secs);

    if (lobby.configError) wrap.appendChild(el("p", "ww-error", lobby.configError));
    if (isOwner) {
      wrap.appendChild(button("Dùng gợi ý", () => h.onSetConfig(null), "ww-btn"));
      const start = button("Bắt đầu", h.onStart, "ww-btn ww-btn--primary");
      start.disabled = lobby.configError !== null;
      wrap.appendChild(start);
    } else {
      wrap.appendChild(el("p", "ww-note", "Chỉ chủ phòng sửa được cấu hình và bắt đầu."));
    }
  }
  wrap.appendChild(button("← Rời phòng", h.onLeave, "ww-btn ww-btn--link"));
  root.appendChild(wrap);
}

function playerRow(p: LobbyPlayer, ownerId: string | null, myId: string): HTMLLIElement {
  const li = el("li", "ww-player" + (p.playerId === myId ? " ww-player--me" : ""));
  li.appendChild(el("span", undefined, `${p.playerId === ownerId ? "👑 " : ""}${p.name}${p.playerId === myId ? " (bạn)" : ""}`));
  if (p.waiting) li.appendChild(el("span", "ww-tag", "chờ ván sau"));
  if (!p.connected) li.appendChild(el("span", "ww-tag ww-tag--off", "mất kết nối"));
  return li;
}

function roleRow(role: Role, config: Config, isOwner: boolean, h: LobbyHandlers): HTMLElement {
  const row = el("div", "ww-role");
  row.appendChild(el("span", "ww-role__name", ROLE_LABEL[role]));
  const set = (delta: number) => {
    const next = Math.max(0, Math.min(MAX_PLAYERS, config.roleCounts[role] + delta));
    h.onSetConfig({ ...config, roleCounts: { ...config.roleCounts, [role]: next } });
  };
  const minus = button("−", () => set(-1), "ww-step");
  const plus = button("+", () => set(1), "ww-step");
  minus.disabled = plus.disabled = !isOwner;
  add(row, minus, el("span", "ww-role__count", String(config.roleCounts[role])), plus);
  return row;
}

// ---------- Màn chơi: dựng khung 1 lần ----------
export interface GameHandlers {
  onAction(action: Action): void;
  onReturnToLobby(): void;
  onLeave(): void;
}

export interface GameFrame {
  update(view: WerewolfView, lobby: Lobby | null): void;
  setClock(text: string): void;
  setOffline(offline: boolean): void;
}

export function createGameFrame(root: HTMLElement, h: GameHandlers): GameFrame {
  root.replaceChildren();
  const wrap = el("div", "ww-game");
  const top = el("header", "ww-top");
  const title = el("span", "ww-top__title");
  const clock = el("span", "ww-top__clock");
  const roleBtn = button("Vai của tôi", () => (rolePanel.hidden = !rolePanel.hidden), "ww-btn ww-btn--small");
  const leave = button("Rời", h.onLeave, "ww-btn ww-btn--small ww-btn--link");
  add(top, title, clock, roleBtn, leave);
  const offline = el("div", "ww-offline", "Mất kết nối — đang nối lại…");
  offline.hidden = true;
  const rolePanel = el("div", "ww-rolepanel");
  rolePanel.hidden = true;

  const body = el("div", "ww-body");
  const grid = el("div", "ww-grid");
  const side = el("aside", "ww-side");
  const hint = el("p", "ww-hint");
  const buttons = el("div", "ww-actions");
  const result = el("div", "ww-result");
  const log = el("ul", "ww-log");
  add(side, hint, buttons, result, log);
  add(body, grid, side);
  add(wrap, top, offline, rolePanel, body);
  root.appendChild(wrap);

  const cards = new Map<string, { card: HTMLElement; name: HTMLElement; status: HTMLElement; role: HTMLElement; chips: HTMLElement; chipSig: string }>();
  let current: WerewolfView | null = null;
  let buttonSig = "";

  function ensureCard(id: string) {
    let c = cards.get(id);
    if (c) return c;
    const card = el("div", "ww-card");
    const seat = el("span", "ww-card__seat");
    const name = el("span", "ww-card__name");
    const status = el("span", "ww-card__status");
    const role = el("span", "ww-card__role");
    const chips = el("div", "ww-card__chips");
    add(card, seat, name, status, role, chips);
    card.addEventListener("click", () => {
      if (!current) return;
      const action = describeTurn(current).cardAction(id);
      if (action) h.onAction(action);
    });
    grid.appendChild(card);
    c = { card, name, status, role, chips, chipSig: "" };
    (card as HTMLElement & { _seat?: HTMLElement })._seat = seat;
    cards.set(id, c);
    return c;
  }

  function update(view: WerewolfView, lobby: Lobby | null): void {
    current = view;
    const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
    const turn = describeTurn(view);
    const connected = new Map((lobby?.players ?? []).map((p) => [p.playerId, p.connected]));
    setText(title, phaseTitle(view.phase, nameOf));
    setText(rolePanel, `Vai của bạn: ${ROLE_LABEL[view.myRole]}`);

    // Chip phiếu dưới thẻ: phiếu ngày/phán quyết (công khai) hoặc lựa chọn của Sói (chỉ Sói thấy).
    const chipsFor = new Map<string, string[]>();
    const addChip = (target: string, text: string) => chipsFor.set(target, [...(chipsFor.get(target) ?? []), text]);
    if (view.phase.kind === "vote") for (const [voter, t] of Object.entries(view.votes)) if (t !== "blank") addChip(t, nameOf(voter));
    if (view.phase.kind === "verdict") for (const [voter, v] of Object.entries(view.verdicts)) addChip(view.phase.accusedId, `${nameOf(voter)} ${v === "kill" ? "⚔️" : "🕊️"}`);
    if (view.wolfPicks) for (const [wolf, t] of Object.entries(view.wolfPicks)) addChip(t, `🐺 ${nameOf(wolf)}`);

    for (const p of view.players) {
      const c = ensureCard(p.id);
      const isConnected = connected.get(p.id) ?? true;
      const cls =
        "ww-card" +
        (p.id === view.viewerId ? " ww-card--me" : "") +
        (p.alive ? "" : " ww-card--dead") +
        (turn.myPicks.includes(p.id) ? " ww-card--picked" : "") +
        (turn.cardAction(p.id) ? " ww-card--tappable" : "");
      if (c.card.className !== cls) c.card.className = cls;
      setText((c.card as HTMLElement & { _seat?: HTMLElement })._seat as HTMLElement, String(p.seat + 1));
      setText(c.name, p.name);
      setText(c.status, (p.alive ? "" : "💀") + (isConnected ? "" : " 📴"));
      // Vai của chính mình mặc định ẨN trên thẻ (xem qua nút "Vai của tôi"), trừ khi đã chết/hết ván.
      const showRole = p.role && (p.id !== view.viewerId || !view.amAlive || view.phase.kind === "ended");
      setText(c.role, showRole && p.role ? ROLE_LABEL[p.role] : "");
      const chips = chipsFor.get(p.id) ?? [];
      const sig = chips.join("|");
      if (sig !== c.chipSig) {
        c.chipSig = sig;
        fill(c.chips, chips.map((t) => el("span", "ww-chip", t)));
      }
    }

    // Phiếu trắng (không thuộc thẻ nào) hiện ở khu thao tác.
    const blanks = Object.entries(view.votes).filter(([, t]) => t === "blank").map(([v]) => nameOf(v));
    setText(hint, turn.hint + (view.phase.kind === "vote" && blanks.length ? ` Phiếu trắng: ${blanks.join(", ")}.` : ""));

    const sig = JSON.stringify(turn.buttons.map((b) => [b.key, b.label, b.pressed, b.disabled]));
    if (sig !== buttonSig) {
      buttonSig = sig;
      fill(buttons, turn.buttons.map((b) => actionButton(b)));
    }
    // Giữ handler theo b.action mới nhất: gắn lại qua dataset-free closure bằng cách đọc turn mỗi lần bấm.
    for (const node of Array.from(buttons.children) as HTMLButtonElement[]) {
      node.onclick = () => {
        if (!current) return;
        const spec = describeTurn(current).buttons.find((b) => b.key === node.dataset.key);
        if (spec?.action && !spec.disabled) h.onAction(spec.action);
      };
    }

    const ended = view.phase.kind === "ended";
    result.hidden = !ended;
    if (ended && result.childElementCount === 0) {
      add(result, el("p", "ww-result__text", phaseTitle(view.phase, nameOf)));
      const ret = button("Về phòng chờ", h.onReturnToLobby, "ww-btn ww-btn--primary");
      ret.dataset.owner = "1";
      result.appendChild(ret);
    }
    const retBtn = result.querySelector<HTMLButtonElement>("button[data-owner]");
    if (retBtn) retBtn.hidden = lobby ? lobby.ownerId !== view.viewerId : true;

    const lines = describeLog(view);
    if (log.childElementCount !== lines.length) fill(log, lines.map((t) => el("li", undefined, t)));
  }

  return {
    update,
    setClock: (text) => setText(clock, text),
    setOffline: (off) => {
      offline.hidden = !off;
    },
  };
}

function actionButton(b: ButtonSpec): HTMLButtonElement {
  const node = el("button", "ww-btn" + (b.pressed ? " ww-btn--pressed" : ""), b.label);
  node.type = "button";
  node.dataset.key = b.key;
  node.disabled = b.disabled === true;
  node.setAttribute("aria-pressed", String(b.pressed === true));
  return node;
}
