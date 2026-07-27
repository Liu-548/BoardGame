// Điều kiện thắng (việc 1.13 + biến thể 2 người). Gọi sau MỖI lần có người chết.
//
// Thứ tự kiểm tra:
// 0. Biến thể 2 người (không chia vai — role: null cho MỌI người, xem
//    setup.ts's isDuelMode()): thắng khi là người sống sót DUY NHẤT, không
//    theo phe nào cả. Kiểm TRƯỚC hết vì các bước dưới đều dựa vào Role thật.
// Đúng luật gốc BANG! (xử lý cả ca hiếm Cảnh sát trưởng chết mà Outlaw đã
// chết sạch từ trước nhưng Phó cảnh sát trưởng hay Renegade khác vẫn còn sống):
// 1. Renegade thắng khi là NGƯỜI SỐNG SÓT DUY NHẤT trên bàn (luật gốc: "cuối
//    cùng còn sống một mình") — không phải chỉ cần hết Outlaw.
// 2. Hết sạch Outlaw lẫn Renegade -> phe Sheriff + Deputy thắng.
// 3. Cảnh sát trưởng đã chết (và chưa rơi vào ca (1) ở trên) -> Outlaw thắng
//    mặc định, KỂ CẢ khi không còn Outlaw nào sống — mục tiêu "hạ Cảnh sát
//    trưởng" đã đạt, không cần có Outlaw sống sót để "nhận thưởng".
// 4. Chưa rơi vào các ca trên -> ván tiếp tục (null).

import type { GameState, PlayerState } from "./types";

export function checkWinCondition(players: PlayerState[]): GameState["winner"] {
  const survivors = players.filter((p) => p.alive);

  // Biến thể 2 người — không ai có vai (role toàn null), nên không có khái
  // niệm "phe" — chỉ đơn giản người cuối cùng còn sống thắng.
  if (players.every((p) => p.role === null)) {
    return survivors.length === 1 ? { kind: "player", playerId: survivors[0].id } : null;
  }

  if (survivors.length === 1 && survivors[0].role === "renegade") {
    return { kind: "faction", faction: "renegade" };
  }

  const outlawsAlive = survivors.filter((p) => p.role === "outlaw").length;
  const renegadesAlive = survivors.filter((p) => p.role === "renegade").length;
  if (outlawsAlive === 0 && renegadesAlive === 0) {
    return { kind: "faction", faction: "sheriff_deputy" };
  }

  const sheriffAlive = survivors.some((p) => p.role === "sheriff");
  if (!sheriffAlive) {
    return { kind: "faction", faction: "outlaw" };
  }

  return null;
}
