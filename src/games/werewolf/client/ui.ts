// DOM của Ma Sói. Khung màn chơi dựng 1 LẦN, sau đó chỉ cập nhật phần tử theo playerId (D-65, D-66).
import type { LobbyPlayer, ServerMessage } from "../../../shared/room/protocol";
import type { Action, Config, Role } from "../core/types";
import { ALL_ROLES, isWolfRole, MAX_PLAYERS, NIGHT_STEP_ORDER, NIGHT_STEP_ROLES } from "../core/types";
import type { WerewolfView } from "../core/view";
import { validateConfig } from "../core/setup";
import { describeLog, describeTurn, MAYOR_INFO, phaseTitle, ROLE_INFO, ROLE_LABEL, TEAM_LABEL, wakeOrder } from "./turn";
import type { ButtonSpec } from "./turn";
import { playRoleReveal, roleCard } from "./cards";

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

// Avatar tròn: chữ cái đầu của tên, màu riêng cố định theo mã người chơi (mọi máy giống nhau).
function avatar(name: string, id: string, size: "sm" | "md"): HTMLElement {
  let h = 0;
  for (const ch of id) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const a = el("span", `ww-avatar ww-avatar--${size}`, (Array.from(name.trim())[0] ?? "?").toUpperCase());
  a.style.setProperty("--hue", String(h % 360));
  a.setAttribute("aria-hidden", "true");
  return a;
}

// ---------- Thư viện vai (giống "Thư viện bài" của Bang!) ----------
// Nhớ đóng/mở ở cấp module: phòng chờ dựng lại toàn bộ mỗi lần server gửi "lobby", không được tự đóng (D-66).
let libraryOpen = false;

function renderLibrary(): HTMLElement {
  const box = el("section", "ww-library");
  box.appendChild(el("h3", undefined, "📖 Thư viện vai"));
  for (const role of ALL_ROLES) {
    const info = ROLE_INFO[role];
    const item = el("article", "ww-libitem");
    const head = el("div", "ww-libitem__head");
    const order = wakeOrder(role);
    add(
      head,
      el("strong", undefined, ROLE_LABEL[role]),
      el("span", "ww-tag", TEAM_LABEL[info.team]),
      el("span", "ww-tag", order ? `Thức ở pha ${order} ban đêm` : "Không thức ban đêm"),
    );
    if (info.maxOne) head.appendChild(el("span", "ww-tag", "Tối đa 1/ván"));
    const text = el("div", "ww-libitem__text");
    add(text, head, el("p", undefined, info.ability));
    add(item, roleCard(role, role, "md"), text);
    box.appendChild(item);
  }
  const night = NIGHT_STEP_ORDER.map((step, i) => `pha ${i + 1} (${NIGHT_STEP_ROLES[step].map((r) => ROLE_LABEL[r]).join(", ")})`).join(" → ");
  box.appendChild(el("p", "ww-note", `Đêm: ${night} → Bình minh. Các vai cùng pha thức cùng lúc (Sói nguyền chỉ thức pha 2 khi đã kích hoạt). Phe Dân thắng khi hết Sói (và hết cặp đôi khác phe); Phe Sói thắng khi số Sói còn sống ≥ số người còn lại.`));
  box.appendChild(el("p", "ww-note", MAYOR_INFO));
  return box;
}

// Nút bật/tắt + khung thư viện (khung dựng sẵn, chỉ ẩn/hiện).
function libraryToggle(className: string): [HTMLButtonElement, HTMLElement] {
  const panel = renderLibrary();
  panel.hidden = !libraryOpen;
  const btn = button("📖 Thư viện vai", () => {
    libraryOpen = !libraryOpen;
    panel.hidden = !libraryOpen;
    btn.setAttribute("aria-expanded", String(libraryOpen));
  }, className);
  btn.setAttribute("aria-expanded", String(libraryOpen));
  return [btn, panel];
}

// ---------- Cài đặt (giống Bang!) ----------
// Dùng CHUNG khoá localStorage với Bang! (applyStoredSettings của Bang! áp dụng lúc mở trang) → 1 lựa chọn cho cả Sảnh.
const FONT_KEY = "bang_font_size";
const LOG_KEY = "ww_log"; // "mini" = khung lịch sử thu nhỏ (chỉ hiện dòng mới nhất)
const EFFECTS_KEY = "ww_effects"; // hiệu ứng chuyển cảnh Ma Sói: "off" = tắt (mặc định bật)

// Hiệu ứng bật khi người chơi không tắt trong Cài đặt VÀ máy không bật "giảm chuyển động".
export function effectsOn(): boolean {
  return readPref(EFFECTS_KEY) !== "off" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
// Class trên body bật chuyển màu dần giữa đêm/ngày (CSS .ww-fx).
export function applyEffectsPref(): void {
  document.body.classList.toggle("ww-fx", effectsOn());
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // không lưu được thì chỉ áp dụng cho lần này
  }
}

function segmented(label: string, options: [string, string][], current: string, onChange: (value: string) => void): HTMLElement {
  const group = el("div", "settings-group");
  group.appendChild(el("p", "settings-group__label", label));
  const row = el("div", "segmented");
  for (const [value, text] of options) {
    const b = button(text, () => {
      for (const x of Array.from(row.children)) x.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
      onChange(value);
    });
    b.setAttribute("aria-pressed", String(value === current));
    row.appendChild(b);
  }
  group.appendChild(row);
  return group;
}

// Nút cần bấm 2 lần (lần đầu đổi chữ thành câu xác nhận) — cho việc ảnh hưởng cả phòng.
function confirmButton(label: string, confirmLabel: string, onConfirm: () => void): HTMLButtonElement {
  let armed = false;
  const b = button(label, () => {
    if (armed) return onConfirm();
    armed = true;
    b.textContent = confirmLabel;
    b.classList.add("ww-btn--danger");
  }, "ww-btn");
  return b;
}

export interface OwnerActions {
  ended: boolean;
  onRestart(): void;
  onCancel(): void;
}

// Dialog gắn vào body (không phải root) → phòng chờ dựng lại khi có người vào cũng không làm mất dialog.
export function openSettings(owner: OwnerActions | null): void {
  const dlg = el("dialog", "app-dialog ww-dialog");
  dlg.appendChild(el("h2", "dialog__title", "⚙️ Cài đặt"));
  // Ma Sói có màu riêng theo đêm/ngày, không theo Sáng/Tối của Sảnh → không có mục Giao diện.
  dlg.appendChild(segmented("Hiệu ứng chuyển cảnh", [["on", "Bật"], ["off", "Tắt"]], readPref(EFFECTS_KEY) === "off" ? "off" : "on", (v) => {
    savePref(EFFECTS_KEY, v);
    applyEffectsPref();
  }));
  const storedFont = readPref(FONT_KEY);
  const font = storedFont === "small" || storedFont === "large" ? storedFont : "medium";
  dlg.appendChild(segmented("Cỡ chữ", [["small", "Nhỏ"], ["medium", "Vừa"], ["large", "Lớn"]], font, (v) => {
    savePref(FONT_KEY, v);
    document.documentElement.classList.remove("font-size-small", "font-size-large");
    if (v !== "medium") document.documentElement.classList.add(`font-size-${v}`);
  }));
  if (owner) {
    dlg.appendChild(el("p", "settings-group__label", "Chủ phòng"));
    dlg.appendChild(confirmButton("🔄 Bắt đầu lại", "Bấm lần nữa: bắt đầu ván mới (cùng cấu hình)", () => {
      owner.onRestart();
      dlg.close();
    }));
    if (!owner.ended) {
      dlg.appendChild(confirmButton("✖ Hủy ván", "Bấm lần nữa: hủy ván, cả phòng về phòng chờ", () => {
        owner.onCancel();
        dlg.close();
      }));
    }
  }
  dlg.appendChild(button("Đóng", () => dlg.close(), "ww-btn ww-btn--link"));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

// ---------- Màn nhập tên + mã phòng ----------
export interface FormHandlers {
  onJoin(name: string, code: string): void;
  onBack(): void;
  makeCode(): string;
}

export function renderForm(root: HTMLElement, init: { name: string; code: string; error: string | null }, h: FormHandlers): void {
  root.replaceChildren();
  document.body.classList.remove("ww-day");
  const wrap = el("div", "ww-screen ww-form");
  const hero = el("header", "ww-hero");
  add(hero, el("span", "ww-hero__moon"), el("h1", "ww-hero__title", "Ma Sói"), el("p", "ww-hero__tag", "Chơi cùng bạn bè, máy làm quản trò. Mỗi người mở trên điện thoại của mình."));
  wrap.appendChild(hero);
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
  const codeRow = el("div", "ww-coderow");
  add(codeRow, codeInput, button("Tạo mã mới", () => (codeInput.value = h.makeCode()), "ww-btn ww-btn--ghost"));
  const panel = el("div", "ww-panel ww-form__panel");
  add(panel, labelled("Tên của bạn", nameInput), labelled("Mã phòng", codeRow), err, button("Vào phòng", join, "ww-btn ww-btn--primary ww-btn--block"));
  const foot = el("div", "ww-footrow");
  add(foot, ...libraryToggle("ww-btn ww-btn--ghost"), button("Về Sảnh", h.onBack, "ww-btn ww-btn--link"));
  add(wrap, panel, foot);
  root.appendChild(wrap);
}

function labelled(text: string, input: HTMLElement): HTMLLabelElement {
  const l = el("label", "ww-label");
  add(l, el("span", "ww-label__text", text), input);
  return l;
}

// ---------- Phòng chờ (cũng dùng làm màn "chờ ván sau") ----------
export interface LobbyHandlers {
  // `update` nhận cấu hình MỚI NHẤT (kể cả chưa được server xác nhận) → chạm nhanh nhiều lần không mất lần nào.
  onSetConfig(update: ((current: Config) => Config) | null): void;
  // Phòng test (bản beta): null = tắt gán vai; hàm = sửa bảng gán mới nhất (kể cả chưa được server xác nhận).
  onSetTestRoles(update: ((current: Record<string, string>) => Record<string, string>) | null): void;
  onStart(): void;
  onLeave(): void;
}

export function renderLobby(root: HTMLElement, lobby: Lobby, myId: string, roomCode: string, h: LobbyHandlers): void {
  root.replaceChildren();
  document.body.classList.remove("ww-day");
  const isOwner = lobby.ownerId === myId;
  const config = lobby.config as Config;
  const me = lobby.players.find((p) => p.playerId === myId);
  const wrap = el("div", "ww-screen ww-lobby");
  const head = el("header", "ww-lobbyhead");
  const copy = button("Chép mã", () => {
    navigator.clipboard?.writeText(roomCode).then(() => (copy.textContent = "Đã chép"), () => undefined);
  }, "ww-btn ww-btn--ghost ww-btn--small");
  add(head, el("h1", "ww-lobbyhead__title", `Phòng ${roomCode}`), copy);
  wrap.appendChild(head);

  if (lobby.inGame) {
    wrap.appendChild(el("p", "ww-note", me?.waiting ? "Ván đang chơi — bạn sẽ vào ván sau." : "Ván đang chơi."));
  }

  const testRoles = lobby.devTools && !lobby.inGame ? lobby.testRoles : null;
  const list = el("ul", "ww-players");
  for (const p of lobby.players) {
    const row = playerRow(p, lobby.ownerId, myId);
    if (testRoles) row.appendChild(testRoleCell(p, testRoles, isOwner, h));
    list.appendChild(row);
  }
  const playersPanel = el("section", "ww-panel");
  add(playersPanel, el("h2", "ww-panel__title", `Người chơi (${lobby.players.length})`), list);
  wrap.appendChild(playersPanel);

  // Phòng test: lỗi bảng gán (thay cho lỗi cấu hình số lượng vai).
  let startError = lobby.configError;
  if (lobby.devTools && !lobby.inGame) {
    const box = el("section", "ww-panel ww-testbox");
    box.appendChild(el("h2", "ww-panel__title", "🧪 Phòng test (chỉ bản thử nghiệm)"));
    if (isOwner) {
      box.appendChild(button(testRoles ? "Tắt gán vai (chia ngẫu nhiên)" : "Bật gán vai thủ công", () => h.onSetTestRoles(testRoles ? null : (c) => c), "ww-btn ww-btn--dev"));
    }
    if (testRoles) {
      startError = testRolesError(lobby, testRoles, config);
      const counts = ALL_ROLES.map((r) => [r, lobby.players.filter((p) => p.connected && testRoles[p.playerId] === r).length] as const)
        .filter(([, n]) => n > 0)
        .map(([r, n]) => `${n} ${ROLE_LABEL[r]}`);
      box.appendChild(el("p", "ww-note", `Chủ phòng tự chọn vai cho từng người. Đã gán: ${counts.join(", ") || "chưa ai"}.`));
    } else {
      box.appendChild(el("p", "ww-note", "Đang chia vai ngẫu nhiên như thường."));
    }
    wrap.appendChild(box);
  }

  // Bảng cấu hình ván: số vai (khi không gán tay) + thời gian đêm + bắt đầu.
  const setup = el("section", "ww-panel");
  if (!lobby.inGame && !testRoles) {
    const total = ALL_ROLES.reduce((s, r) => s + (config.roleCounts[r] ?? 0), 0);
    const roles = el("div", "ww-roles");
    for (const role of ALL_ROLES) roles.appendChild(roleRow(role, config, isOwner, h));
    add(setup, el("h2", "ww-panel__title", `Vai trong ván (${total})`), roles);
  }
  if (!lobby.inGame) {
    wrap.appendChild(setup);
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
    sel.addEventListener("change", () => h.onSetConfig((c) => ({ ...c, nightStepMs: Number(sel.value) * 1000 })));
    secs.appendChild(sel);
    setup.appendChild(secs);
    // Trưởng làng: danh hiệu bật/tắt, không phải vai.
    const mayor = el("label", "ww-label ww-label--check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = config.mayor === true;
    box.disabled = !isOwner;
    box.addEventListener("change", () => h.onSetConfig((c) => ({ ...c, mayor: box.checked })));
    add(mayor, box, el("span", undefined, "👑 Bầu Trưởng làng đầu Ngày 1 (phiếu x2)"));
    setup.appendChild(mayor);
    if (isOwner && !testRoles) setup.appendChild(button("Dùng gợi ý theo số người", () => h.onSetConfig(null), "ww-btn ww-btn--ghost ww-btn--small"));

    if (startError) wrap.appendChild(el("p", "ww-error", startError));
    if (isOwner) {
      const start = button("Bắt đầu ván", h.onStart, "ww-btn ww-btn--primary ww-btn--block");
      start.disabled = startError !== null;
      wrap.appendChild(start);
    } else {
      wrap.appendChild(el("p", "ww-note ww-note--center", "Chờ chủ phòng 👑 bắt đầu ván."));
    }
  }
  const foot = el("div", "ww-footrow");
  add(foot, ...libraryToggle("ww-btn ww-btn--ghost"));
  add(foot, button("⚙️ Cài đặt", () => openSettings(null), "ww-btn ww-btn--ghost"), button("Rời phòng", h.onLeave, "ww-btn ww-btn--link"));
  wrap.appendChild(foot);
  root.appendChild(wrap);
}

function playerRow(p: LobbyPlayer, ownerId: string | null, myId: string): HTMLLIElement {
  const li = el("li", "ww-player" + (p.playerId === myId ? " ww-player--me" : "") + (p.connected ? "" : " ww-player--off"));
  add(li, avatar(p.name, p.playerId, "sm"), el("span", "ww-player__name", `${p.playerId === ownerId ? "👑 " : ""}${p.name}${p.playerId === myId ? " (bạn)" : ""}`));
  if (p.waiting) li.appendChild(el("span", "ww-tag", "chờ ván sau"));
  if (!p.connected) li.appendChild(el("span", "ww-tag ww-tag--off", "mất kết nối"));
  return li;
}

// Ô vai cạnh tên người chơi trong phòng test: chủ phòng chọn, người khác chỉ xem.
function testRoleCell(p: LobbyPlayer, testRoles: Record<string, string>, isOwner: boolean, h: LobbyHandlers): Node {
  const current = testRoles[p.playerId] as Role | undefined;
  if (!isOwner) return el("span", "ww-tag", current && ROLE_LABEL[current] ? ROLE_LABEL[current] : "chưa gán");
  const sel = el("select", "ww-testrole");
  sel.setAttribute("aria-label", `Vai của ${p.name}`);
  for (const value of ["", ...ALL_ROLES]) {
    const o = el("option", undefined, value ? ROLE_LABEL[value as Role] : "— chọn vai —");
    o.value = value;
    if (value === (current ?? "")) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () =>
    h.onSetTestRoles((c) => {
      const next = { ...c };
      if (sel.value) next[p.playerId] = sel.value;
      else delete next[p.playerId];
      return next;
    }),
  );
  return sel;
}

// Kiểm bảng gán giống server (setupWithRoles) để khoá nút Bắt đầu và báo lý do ngay.
function testRolesError(lobby: Lobby, testRoles: Record<string, string>, config: Config): string | null {
  const playing = lobby.players.filter((p) => p.connected);
  const missing = playing.filter((p) => !ALL_ROLES.includes(testRoles[p.playerId] as Role)).map((p) => p.name);
  if (missing.length) return `Chưa gán vai cho: ${missing.join(", ")}`;
  const roleCounts = Object.fromEntries(ALL_ROLES.map((r) => [r, playing.filter((p) => testRoles[p.playerId] === r).length])) as Config["roleCounts"];
  return validateConfig({ ...config, roleCounts }, playing.length);
}

function roleRow(role: Role, config: Config, isOwner: boolean, h: LobbyHandlers): HTMLElement {
  const row = el("div", "ww-role");
  row.appendChild(el("span", "ww-role__name", ROLE_LABEL[role]));
  const set = (delta: number) => {
    h.onSetConfig((c) => ({ ...c, roleCounts: { ...c.roleCounts, [role]: Math.max(0, Math.min(MAX_PLAYERS, (c.roleCounts[role] ?? 0) + delta)) } }));
  };
  const minus = button("−", () => set(-1), "ww-step");
  const plus = button("+", () => set(1), "ww-step");
  minus.disabled = plus.disabled = !isOwner;
  add(row, minus, el("span", "ww-role__count", String(config.roleCounts[role] ?? 0)), plus);
  return row;
}

// ---------- Màn chơi: dựng khung 1 lần ----------
export interface GameHandlers {
  onAction(action: Action): void;
  onReturnToLobby(): void; // chỉ màn hình của mình về phòng chờ (sau khi hết ván)
  onRestart(): void; // chủ phòng
  onCancelGame(): void; // chủ phòng
  onSkipPhase(token: number): void; // chủ phòng, chỉ bản thử nghiệm; token = phaseSeq của pha đang thấy
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
  // Dải "bầu trời": hàng nút nhỏ + tên pha in lớn (dòng chính / dòng phụ) + đồng hồ.
  const top = el("header", "ww-top");
  const bar = el("div", "ww-top__bar");
  const sky = el("div", "ww-top__sky");
  const title = el("div", "ww-top__title");
  const titleMain = el("span", "ww-top__main");
  const titleSub = el("span", "ww-top__sub");
  add(title, titleMain, titleSub);
  const clock = el("span", "ww-top__clock");
  const roleBtn = button("🎴 Vai của tôi", () => (rolePanel.hidden = !rolePanel.hidden), "ww-btn ww-btn--small ww-btn--ghost");
  const leave = button("Rời", h.onLeave, "ww-btn ww-btn--small ww-btn--link");
  const [libBtn, library] = libraryToggle("ww-btn ww-btn--small ww-btn--ghost");
  libBtn.textContent = "📖";
  libBtn.title = libBtn.ariaLabel = "Thư viện vai";
  const settingsBtn = button("⚙️", () => {
    const isOwner = current !== null && currentLobby?.ownerId === current.viewerId;
    openSettings(isOwner ? { ended: current?.phase.kind === "ended", onRestart: h.onRestart, onCancel: h.onCancelGame } : null);
  }, "ww-btn ww-btn--small ww-btn--ghost");
  settingsBtn.title = settingsBtn.ariaLabel = "Cài đặt";
  add(bar, roleBtn, libBtn, settingsBtn, el("span", "ww-top__spacer"), leave);
  add(sky, title, clock);
  add(top, bar, sky);
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
  // Thu nhỏ lịch sử: chỉ còn dòng mới nhất; nhớ lựa chọn trên máy này.
  const logToggle = button("", () => {
    savePref(LOG_KEY, log.classList.contains("ww-log--mini") ? "full" : "mini");
    syncLog();
  }, "ww-btn ww-btn--small ww-btn--ghost ww-logtoggle");
  const syncLog = () => {
    const mini = readPref(LOG_KEY) === "mini";
    log.classList.toggle("ww-log--mini", mini);
    logToggle.hidden = log.childElementCount === 0;
    logToggle.setAttribute("aria-expanded", String(!mini));
    setText(logToggle, mini ? `▸ Lịch sử (${log.childElementCount})` : "▾ Thu nhỏ lịch sử");
  };
  const skip = button("⏭ Bỏ qua pha (thử nghiệm)", () => current && h.onSkipPhase(current.phaseSeq), "ww-btn ww-btn--small ww-btn--dev");
  skip.hidden = true;
  add(side, hint, buttons, skip, result, logToggle, log);
  add(body, grid, side);
  add(wrap, top, offline, rolePanel, library, body);
  root.appendChild(wrap);

  const cards = new Map<string, { card: HTMLElement; name: HTMLElement; status: HTMLElement; role: HTMLElement; chips: HTMLElement; chipSig: string; thumb: HTMLElement; thumbSig: string }>();
  let myRoleSig = "";
  let revealShown = false; // khung dựng lại cho mỗi ván mới → mỗi ván chiếu 1 lần
  let prevPhase: WerewolfView["phase"] | null = null; // null = lần vẽ đầu (vd vừa nối lại) → không chiếu chữ chuyển cảnh
  let closeReveal: (() => void) | null = null;
  let current: WerewolfView | null = null;
  let currentLobby: Lobby | null = null;
  let buttonSig = "";

  function ensureCard(id: string) {
    let c = cards.get(id);
    if (c) return c;
    const p = current?.players.find((x) => x.id === id);
    const card = el("div", "ww-card");
    const seat = el("span", "ww-card__seat");
    // Hàng mặt: avatar (kèm 💀/📴) + lá vai nhỏ bên cạnh khi được phép thấy vai.
    const face = el("div", "ww-card__face");
    const ava = el("span", "ww-card__ava");
    const status = el("span", "ww-card__status");
    add(ava, avatar(p?.name ?? "?", id, "md"), status);
    const thumb = el("span", "ww-card__thumb");
    add(face, ava, thumb);
    const name = el("span", "ww-card__name");
    const role = el("span", "ww-card__role");
    const chips = el("div", "ww-card__chips");
    add(card, seat, face, name, role, chips);
    card.addEventListener("click", () => {
      if (!current) return;
      const action = describeTurn(current).cardAction(id);
      if (action) h.onAction(action);
    });
    grid.appendChild(card);
    c = { card, name, status, role, chips, chipSig: "", thumb, thumbSig: "" };
    (card as HTMLElement & { _seat?: HTMLElement })._seat = seat;
    cards.set(id, c);
    return c;
  }

  function update(view: WerewolfView, lobby: Lobby | null): void {
    current = view;
    currentLobby = lobby;
    const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
    const turn = describeTurn(view);
    const connected = new Map((lobby?.players ?? []).map((p) => [p.playerId, p.connected]));
    const [main, sub = ""] = phaseTitle(view.phase, nameOf).split(" — ");
    setText(titleMain, main);
    setText(titleSub, sub);
    // Nền theo thời điểm: ban ngày (thảo luận → phán quyết) sáng màu rơm; đêm/chia vai tối. Hết ván theo phe thắng.
    const day =
      ["discussion", "vote", "defense", "verdict", "election", "hunter", "successor"].includes(view.phase.kind) ||
      (view.phase.kind === "ended" && view.phase.winner !== "wolves");
    document.body.classList.toggle("ww-day", day);
    if (myRoleSig !== view.myRole + view.viewerId) {
      myRoleSig = view.myRole + view.viewerId;
      fill(rolePanel, [roleCard(view.myRole, view.viewerId, "md")]);
    }

    // Chip phiếu dưới thẻ: phiếu ngày/phán quyết (công khai) hoặc lựa chọn của Sói (chỉ Sói thấy).
    const chipsFor = new Map<string, string[]>();
    const addChip = (target: string, text: string) => chipsFor.set(target, [...(chipsFor.get(target) ?? []), text]);
    if (view.phase.kind === "vote") for (const [voter, t] of Object.entries(view.votes)) if (t !== "blank") addChip(t, nameOf(voter));
    if (view.phase.kind === "verdict") for (const [voter, v] of Object.entries(view.verdicts)) addChip(view.phase.accusedId, `${nameOf(voter)} ${v === "kill" ? "⚔️" : "🕊️"}`);
    if (view.wolfPicks) for (const [wolf, t] of Object.entries(view.wolfPicks)) addChip(t, `🐺 ${nameOf(wolf)}`);
    if (view.wolfPicks2) for (const [wolf, t] of Object.entries(view.wolfPicks2)) addChip(t, `🐺² ${nameOf(wolf)}`);
    if (view.phase.kind === "election") for (const [voter, t] of Object.entries(view.votes)) if (t !== "blank") addChip(t, `👑 ${nameOf(voter)}`);

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
      // 👑 Trưởng làng (công khai), 💘 cặp đôi (chỉ người được biết mới có view.lovers).
      setText(c.name, p.name + (p.id === view.mayorId ? " 👑" : "") + (view.lovers.includes(p.id) ? " 💘" : ""));
      setText(c.status, (p.alive ? "" : "💀") + (isConnected ? "" : "📴"));
      // Vai của chính mình mặc định ẨN trên thẻ (xem qua nút "Vai của tôi"), trừ khi đã chết/hết ván.
      const showRole = p.role && (p.id !== view.viewerId || !view.amAlive || view.phase.kind === "ended");
      setText(c.role, showRole && p.role ? ROLE_LABEL[p.role] : "");
      const thumbSig = showRole && p.role ? p.role : "";
      if (thumbSig !== c.thumbSig) {
        c.thumbSig = thumbSig;
        fill(c.thumb, showRole && p.role ? [roleCard(p.role, p.id, "sm")] : []);
      }
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

    // Chữ chuyển cảnh: đêm buông xuống / trời sáng / hết ván (tắt được trong Cài đặt).
    const ph = view.phase;
    if (prevPhase && effectsOn()) {
      if (ph.kind === "night" && prevPhase.kind !== "night") showBanner(root, `Đêm ${ph.night} buông xuống`, "Mọi người nhắm mắt");
      else if (prevPhase.kind === "night" && ph.kind !== "night" && ph.kind !== "ended") {
        const dead = view.lastNightDeaths.map(nameOf);
        showBanner(root, "Trời sáng", dead.length ? `${dead.join(", ")} đã chết` : "Đêm qua không ai chết");
      } else if (ph.kind === "ended" && prevPhase.kind !== "ended") showBanner(root, phaseTitle(ph, nameOf).replace("🏁 ", ""), "");
    }
    prevPhase = ph;

    if (view.phase.kind === "reveal" && !revealShown) {
      revealShown = true;
      closeReveal = playRoleReveal(root, {
        myRole: view.myRole,
        myKey: view.viewerId,
        instant: !effectsOn(),
        roles: ALL_ROLES.filter((r) => (view.config.roleCounts[r] ?? 0) > 0),
        // Sói thấy vai đồng đội (view chỉ có role của Sói khác khi mình là Sói).
        teammates: view.players.filter((p) => p.id !== view.viewerId && p.role && isWolfRole(p.role) && isWolfRole(view.myRole)).map((p) => p.name),
      });
    } else if (view.phase.kind !== "reveal" && closeReveal) {
      closeReveal(); // sang Đêm 1 thì tự đóng
      closeReveal = null;
    }

    const ended = view.phase.kind === "ended";
    wrap.classList.toggle("ww-game--ended", ended); // hết ván: màn kết quả thay chỗ lưới người chơi
    skip.hidden = !(lobby?.devTools && lobby.ownerId === view.viewerId && !ended);
    result.hidden = !ended;
    if (ended && result.childElementCount === 0) {
      if (view.phase.kind === "ended") result.dataset.winner = view.phase.winner;
      add(result, el("p", "ww-result__text", phaseTitle(view.phase, nameOf).replace("🏁 ", "")));
      // Lật bài cả bàn (hết ván ai cũng thấy vai mọi người, R-61).
      const reveal = el("div", "ww-endcards");
      for (const p of view.players) {
        if (!p.role) continue;
        const cell = el("div", "ww-endcard" + (p.alive ? "" : " ww-endcard--dead"));
        add(cell, roleCard(p.role, p.id, "md"), el("span", "ww-endcard__name", (p.alive ? "" : "💀 ") + p.name));
        reveal.appendChild(cell);
      }
      result.appendChild(reveal);
      const endActions = el("div", "ww-result__actions");
      const restart = button("🔄 Bắt đầu lại", h.onRestart, "ww-btn");
      restart.dataset.owner = "1";
      add(endActions, button("Về phòng chờ", h.onReturnToLobby, "ww-btn ww-btn--primary"), restart);
      result.appendChild(endActions);
    }
    const restartBtn = result.querySelector<HTMLButtonElement>("button[data-owner]");
    if (restartBtn) restartBtn.hidden = lobby ? lobby.ownerId !== view.viewerId : true;

    const lines = describeLog(view);
    if (log.childElementCount !== lines.length) fill(log, lines.map((t) => el("li", undefined, t)));
    syncLog();
  }

  return {
    update,
    setClock: (text) => setText(clock, text),
    setOffline: (off) => {
      offline.hidden = !off;
    },
  };
}

// Dòng chữ lớn thoáng qua giữa màn hình (~1,8 giây), không chặn thao tác.
function showBanner(host: HTMLElement, main: string, sub: string): void {
  host.querySelector(".ww-banner")?.remove();
  const b = el("div", "ww-banner");
  b.setAttribute("role", "status");
  add(b, el("span", "ww-banner__main", main));
  if (sub) add(b, el("span", "ww-banner__sub", sub));
  host.appendChild(b);
  b.addEventListener("animationend", () => b.remove());
  setTimeout(() => b.remove(), 2500); // dự phòng nếu animationend không bắn
}

function actionButton(b: ButtonSpec): HTMLButtonElement {
  const node = el("button", "ww-btn" + (b.pressed ? " ww-btn--pressed" : ""), b.label);
  node.type = "button";
  node.dataset.key = b.key;
  node.disabled = b.disabled === true;
  node.setAttribute("aria-pressed", String(b.pressed === true));
  return node;
}
