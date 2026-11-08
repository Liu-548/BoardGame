// Câu cá client: nối mạng + điều phối màn hình (theo khuôn Ma Sói). `mountCauCa` được Sảnh gọi.
import "./style.css";
import { getOrCreateToken } from "../../../shared/room/identity";
import { RoomClient } from "../../../shared/room/net";
import type { ServerMessage } from "../../../shared/room/protocol";
import type { Action, Card } from "../core/types";
import type { CauCaView } from "../core/view";
import { canCapture, canDiscard, captureTargets, sameCard } from "../core/rules";
import { renderForm, renderGame, renderLobby } from "./ui";

type Lobby = Extract<ServerMessage, { type: "lobby" }>;
// Client không gửi `now` — server tự ghi giờ của nó.
type PlayerAction = Exclude<Action, { type: "TIME_UP" }> extends infer A ? (A extends unknown ? Omit<A, "now"> : never) : never;
const NAME_KEY = "cc:name";
// Phiên đang chơi (sessionStorage: sống qua F5 trong cùng tab) để tải lại trang vẫn vào lại đúng phòng.
const SESSION_KEY = "cc:session";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function serverUrl(code: string): string {
  const host = new URLSearchParams(location.search).get("server") ?? location.host;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${host}/cau-ca/room/${encodeURIComponent(code)}`;
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

// Gọi lúc mở trang: nếu tab này đang ở trong phòng Câu cá thì vào lại, trả true.
export function resumeCauCa(root: HTMLElement, onExit: () => void): boolean {
  let saved: { name: string; code: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (!saved || typeof saved.name !== "string" || typeof saved.code !== "string") return false;
  mountCauCa(root, onExit, saved);
  return true;
}

export function mountCauCa(root: HTMLElement, onExit: () => void, resume?: { name: string; code: string }): void {
  let conn: RoomClient | null = null;
  let roomCode = "";
  let myId: string | null = null;
  let lobby: Lobby | null = null;
  let view: CauCaView | null = null;
  let selected: Card | null = null; // lá trên tay đang chọn
  let dismissedEnded = false; // đã bấm "Về phòng chờ" sau khi hết ván
  let draft = { name: readName(), code: "" };
  // Đồng hồ đếm ngược chọn lá cho lá lật — chỉ sửa chữ, không vẽ lại cả màn.
  const clock = setInterval(() => {
    const span = root.querySelector(".cc-clock");
    if (!span || !conn) return;
    const endsAt = view?.pending?.endsAt;
    span.textContent = endsAt ? `⏱ ${Math.max(0, Math.ceil((endsAt - conn.serverTime()) / 1000))}s` : "";
  }, 250);

  function leave(): void {
    conn?.close();
    conn = null;
    clearInterval(clock);
    clearSession();
    root.replaceChildren();
    onExit();
  }

  function showForm(error: string | null): void {
    clearSession();
    conn?.close();
    conn = null;
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
    conn = new RoomClient(serverUrl(cleanCode), name, getOrCreateToken(cleanCode, name), { onMessage });
  }

  const send = (action: PlayerAction) => {
    selected = null;
    conn?.send({ type: "action", action });
  };

  function onMessage(m: ServerMessage): void {
    switch (m.type) {
      case "joined":
        myId = m.playerId;
        return;
      case "join_rejected":
        return showForm(m.reason);
      case "error":
        return toast(m.message);
      case "lobby":
        lobby = m;
        // Ván bị huỷ → về phòng chờ. Ván đã hết thì giữ màn kết quả tới khi tự bấm "Về phòng chờ".
        if (!m.inGame && !view?.over) view = null;
        return refresh();
      case "state": {
        const next = m.view as CauCaView;
        if (next.over && dismissedEnded) return;
        dismissedEnded = false;
        view = next;
        return refresh();
      }
    }
  }

  function toast(message: string): void {
    const note = document.createElement("div");
    note.className = "cc-toast";
    note.textContent = message;
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 2500);
  }

  function refresh(): void {
    if (!myId || !lobby) return;
    if (!view || (!lobby.inGame && !view.over)) {
      return renderLobby(root, lobby, myId, roomCode, { onStart: () => conn?.send({ type: "start_game" }), onLeave: leave });
    }
    const v = view;
    renderGame(root, v, lobby, roomCode, selected, {
      onHand(card) {
        selected = selected && sameCard(selected, card) ? null : card;
        refresh();
      },
      onTable(card) {
        if (!myId) return;
        if (v.pending && v.pending.playerId === myId) {
          if (captureTargets(v.pending.card, v.table).some((t) => sameCard(t, card))) {
            send({ type: "PICK_FLIP_TARGET", playerId: myId, target: card });
          }
        } else if (selected && canCapture(selected, card)) {
          send({ type: "CAPTURE", playerId: myId, card: selected, target: card });
        }
      },
      onDiscard() {
        if (myId && selected && canDiscard(selected, v.table)) send({ type: "DISCARD", playerId: myId, card: selected });
      },
      onNewGame: () => conn?.send({ type: "start_game" }),
      onToLobby() {
        dismissedEnded = true;
        view = null;
        refresh();
      },
      onLeave: leave,
    });
  }

  if (resume) join(resume.name, resume.code);
  else showForm(null);
}
