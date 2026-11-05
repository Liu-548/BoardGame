// Ma Sói client: nối mạng + điều phối màn hình. `mountWerewolf` được Sảnh gọi (D-03).
import "./style.css";
import { getOrCreateToken } from "../../../shared/room/identity";
import { RoomClient } from "../../../shared/room/net";
import type { ServerMessage } from "../../../shared/room/protocol";
import type { Action, Config } from "../core/types";
import type { WerewolfView } from "../core/view";
import { createGameFrame, renderForm, renderLobby } from "./ui";
import type { GameFrame } from "./ui";

type Lobby = Extract<ServerMessage, { type: "lobby" }>;
const NAME_KEY = "ww:name";
// Phiên đang chơi (sessionStorage: sống qua F5 trong cùng tab) để tải lại trang vẫn vào lại đúng phòng (M-03).
const SESSION_KEY = "ww:session";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function serverUrl(code: string): string {
  const host = new URLSearchParams(location.search).get("server") ?? location.host;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${host}/werewolf/room/${encodeURIComponent(code)}`;
}
function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveSession(name: string, code: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name, code }));
  } catch {
    // không lưu được thì F5 sẽ về Sảnh
  }
}
function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // bỏ qua
  }
}

// Gọi lúc mở trang: nếu tab này đang ở trong phòng Ma Sói thì vào lại, trả true.
export function resumeWerewolf(root: HTMLElement, onExit: () => void): boolean {
  let saved: { name: string; code: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (!saved || typeof saved.name !== "string" || typeof saved.code !== "string") return false;
  mountWerewolf(root, onExit, saved);
  return true;
}

export function mountWerewolf(root: HTMLElement, onExit: () => void, resume?: { name: string; code: string }): void {
  document.body.classList.add("ww-active");
  let conn: RoomClient | null = null;
  let roomCode = "";
  let myId: string | null = null;
  let lobby: Lobby | null = null;
  let view: WerewolfView | null = null;
  let frame: GameFrame | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  // Cấu hình đang chờ server xác nhận (để chạm nhanh +/− không dùng số cũ).
  let localConfig: Config | null = null;
  let draft = { name: readName(), code: "" };

  const stopClock = () => {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  };

  function leave(): void {
    conn?.close();
    conn = null;
    stopClock();
    clearSession();
    document.body.classList.remove("ww-active");
    root.replaceChildren();
    onExit();
  }

  function showForm(error: string | null): void {
    clearSession();
    conn?.close();
    conn = null;
    frame = null;
    stopClock();
    myId = null;
    lobby = null;
    view = null;
    renderForm(root, { ...draft, error }, { onJoin: join, onBack: leave, makeCode });
  }

  function join(name: string, code: string): void {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return showForm("Hãy nhập hoặc tạo mã phòng");
    draft = { name, code: cleanCode };
    saveSession(name, cleanCode);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // không lưu được tên thì thôi
    }
    roomCode = cleanCode;
    const token = getOrCreateToken(cleanCode, name);
    conn = new RoomClient(serverUrl(cleanCode), name, token, {
      onMessage: onServerMessage,
      onClose: () => frame?.setOffline(true),
      onOpen: () => frame?.setOffline(false),
    });
  }

  const send = (action: Action) => conn?.send({ type: "action", action });

  function onServerMessage(m: ServerMessage): void {
    switch (m.type) {
      case "joined":
        myId = m.playerId;
        return;
      case "join_rejected":
        return showForm(m.reason);
      case "error":
        frame ? flash(m.message) : undefined;
        return;
      case "lobby":
        lobby = m;
        localConfig = null;
        if (!m.inGame) view = null; // ván đã kết thúc/huỷ → về phòng chờ
        return refresh();
      case "state":
        view = m.view as WerewolfView;
        return refresh();
    }
  }

  function flash(message: string): void {
    const note = document.createElement("div");
    note.className = "ww-toast";
    note.textContent = message;
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 2500);
  }

  function refresh(): void {
    if (!myId || !lobby) return;
    if (view && lobby.inGame) {
      if (!frame) {
        frame = createGameFrame(root, {
          onAction: send,
          onReturnToLobby: () => conn?.send({ type: "return_to_lobby" }),
          onLeave: leave,
        });
        clockTimer = setInterval(tickClock, 250); // D-65: chỉ sửa chữ của đồng hồ
      }
      frame.update(view, lobby);
      tickClock();
      return;
    }
    frame = null;
    stopClock();
    renderLobby(root, lobby, myId, roomCode, {
      onSetConfig: (update) => {
        if (!lobby) return;
        localConfig = update ? update(localConfig ?? (lobby.config as Config)) : null;
        conn?.send({ type: "set_config", config: localConfig });
      },
      onStart: () => conn?.send({ type: "start_game" }),
      onLeave: leave,
    });
  }

  function tickClock(): void {
    if (!frame || !view || !conn) return;
    if (view.phaseEndsAt === null) return frame.setClock("");
    const left = Math.max(0, Math.ceil((view.phaseEndsAt - conn.serverTime()) / 1000));
    frame.setClock(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
  }

  if (resume) join(resume.name, resume.code);
  else showForm(null);
}
