// Các quyết định THUẦN của khung phòng (không đụng Cloudflare) để test bằng Vitest (04 mục T-ROOM).

export const MAX_NAME_LENGTH = 20; // D-42

export type NormalizedName = { ok: true; display: string; key: string } | { ok: false; error: string };

// D-42: trim + NFC; khoá so khớp thêm không phân biệt hoa thường.
export function normalizeName(raw: string): NormalizedName {
  const display = (typeof raw === "string" ? raw : "").normalize("NFC").trim();
  if (display.length === 0) return { ok: false, error: "Tên không được để trống" };
  if (display.length > MAX_NAME_LENGTH) return { ok: false, error: `Tên tối đa ${MAX_NAME_LENGTH} ký tự` };
  return { ok: true, display, key: display.toLowerCase() };
}

export interface Seat {
  playerId: string; // id công khai, server tự sinh
  name: string;
  token: string; // BÍ MẬT — không bao giờ ra khỏi server (D-41)
  waiting: boolean;
}

export type JoinDecision =
  | { kind: "reclaim"; playerId: string }
  | { kind: "takeover"; playerId: string }
  | { kind: "new_seat"; display: string }
  | { kind: "wait_next_game"; display: string }
  | { kind: "reject"; reason: string };

// D-43. `connectedIds`: các playerId đang kết nối.
export function decideJoin(
  seats: Seat[],
  connectedIds: ReadonlySet<string>,
  inGame: boolean,
  rawName: string,
  token: string,
  maxPlayers: number,
): JoinDecision {
  const name = normalizeName(rawName);
  if (!name.ok) return { kind: "reject", reason: name.error };
  const seat = seats.find((s) => normalizeName(s.name).ok && (normalizeName(s.name) as { key: string }).key === name.key);
  if (seat) {
    if (seat.token === token) return { kind: "reclaim", playerId: seat.playerId }; // D-43.1
    if (connectedIds.has(seat.playerId)) return { kind: "reject", reason: "Tên đã có người dùng" }; // D-43.2
    return { kind: "takeover", playerId: seat.playerId }; // đổi máy
  }
  if (inGame) return { kind: "wait_next_game", display: name.display }; // D-43.3
  if (seats.length >= maxPlayers) return { kind: "reject", reason: "Phòng đã đầy" };
  return { kind: "new_seat", display: name.display };
}

// D-30: băm FNV-1a 32-bit của JSON — chỉ để so "view có đổi không", không cần mật mã.
export function viewHash(view: unknown): string {
  const text = JSON.stringify(view);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// D-46: chủ phòng = người vào sớm nhất còn kết nối.
export function pickOwner(joinOrder: string[], connectedIds: ReadonlySet<string>): string | null {
  return joinOrder.find((id) => connectedIds.has(id)) ?? null;
}
