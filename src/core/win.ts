// Điều kiện thắng 3 phe (việc 1.13). Gọi sau MỖI lần có người chết.
//
// Thứ tự kiểm tra (đúng luật gốc BANG!, xử lý cả ca hiếm Cảnh sát trưởng chết
// mà Outlaw đã chết sạch từ trước nhưng Phó cảnh sát trưởng hay Renegade khác
// vẫn còn sống):
// 1. Renegade thắng khi là NGƯỜI SỐNG SÓT DUY NHẤT trên bàn (luật gốc: "cuối
//    cùng còn sống một mình") — không phải chỉ cần hết Outlaw.
// 2. Hết sạch Outlaw lẫn Renegade -> phe Sheriff + Deputy thắng.
// 3. Cảnh sát trưởng đã chết (và chưa rơi vào ca (1) ở trên) -> Outlaw thắng
//    mặc định, KỂ CẢ khi không còn Outlaw nào sống — mục tiêu "hạ Cảnh sát
//    trưởng" đã đạt, không cần có Outlaw sống sót để "nhận thưởng".
// 4. Chưa rơi vào 3 ca trên -> ván tiếp tục (null).

import type { GameState, PlayerState } from "./types";

export function checkWinCondition(players: PlayerState[]): GameState["winner"] {
  const survivors = players.filter((p) => p.alive);

  if (survivors.length === 1 && survivors[0].role === "renegade") {
    return "renegade";
  }

  const outlawsAlive = survivors.filter((p) => p.role === "outlaw").length;
  const renegadesAlive = survivors.filter((p) => p.role === "renegade").length;
  if (outlawsAlive === 0 && renegadesAlive === 0) {
    return "sheriff_deputy";
  }

  const sheriffAlive = survivors.some((p) => p.role === "sheriff");
  if (!sheriffAlive) {
    return "outlaw";
  }

  return null;
}
