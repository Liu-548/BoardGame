// D-40: mã trình duyệt ngẫu nhiên, lưu localStorage khoá theo (mã phòng, tên). Lỗi localStorage → mã tạm.
import { normalizeName } from "./logic";

export function getOrCreateToken(roomCode: string, name: string): string {
  const n = normalizeName(name);
  const key = `room-token:${roomCode.toUpperCase()}:${n.ok ? n.key : name}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
