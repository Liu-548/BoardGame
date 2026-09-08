// Điều kiện thắng (việc 1.13 + biến thể 2/3 người). Gọi sau MỖI lần có người chết.
//
// Thứ tự kiểm tra:
// 0. Biến thể 2 người (không chia vai — role: null cho MỌI người, xem
//    setup.ts's isDuelMode()): thắng khi là người sống sót DUY NHẤT, không
//    theo phe nào cả.
// 0.5. Biến thể 3 người — vòng tròn săn đuổi công khai (role là
//    "police"/"criminal"/"traitor", xem setup.ts's isHuntMode()): giết ĐÚNG
//    mục tiêu của mình (theo HUNT_CIRCLE cố định) thì thắng NGAY LẬP TỨC.
//    Giết SAI (hoặc tự chết vì Dynamite, killerId null) -> KHÔNG ai thắng
//    ngay, ván tự động "rơi" về đúng luật 2 người ở trên (2 người còn lại,
//    ai sống sót cuối cùng thắng — không cần code thêm gì, vì lần gọi
//    checkWinCondition() TIẾP THEO sẽ chỉ còn 1 người sống, khớp thẳng nhánh
//    "sống sót duy nhất" bên dưới).
// Kiểm 2 nhánh trên TRƯỚC hết vì các bước dưới đều dựa vào 4 Role gốc.
// Đúng luật gốc BANG! (xử lý cả ca hiếm Cảnh sát trưởng chết mà Outlaw đã
// chết sạch từ trước nhưng Phó cảnh sát trưởng hay Renegade khác vẫn còn sống):
// 1. Renegade thắng khi là NGƯỜI SỐNG SÓT DUY NHẤT trên bàn (luật gốc: "cuối
//    cùng còn sống một mình") — không phải chỉ cần hết Outlaw.
// 2. Hết sạch Outlaw lẫn Renegade -> phe Sheriff + Deputy thắng.
// 3. Cảnh sát trưởng đã chết (và chưa rơi vào ca (1) ở trên) -> Outlaw thắng
//    mặc định, KỂ CẢ khi không còn Outlaw nào sống — mục tiêu "hạ Cảnh sát
//    trưởng" đã đạt, không cần có Outlaw sống sót để "nhận thưởng".
// 4. Chưa rơi vào các ca trên -> ván tiếp tục (null).

import type { GameState, PlayerState, Role } from "./types";

// Biến thể 3 người — vòng tròn CỐ ĐỊNH: cảnh sát săn tội phạm, tội phạm săn
// kẻ phản bội, kẻ phản bội săn cảnh sát. "Cảnh sát" ở đây là "cảnh sát
// thường" — KHÁC hẳn Sheriff, không kế thừa luật phụ nào (không thưởng/phạt).
const HUNT_CIRCLE: Partial<Record<Role, Role>> = {
  police: "criminal",
  criminal: "traitor",
  traitor: "police",
};

// `killerId` — người trực tiếp gây đòn đánh khiến người vừa chết về 0 máu
// (null nếu tự chết, vd Thuốc nổ) — CHỈ dùng cho nhánh biến thể 3 người, để
// biết có đúng người săn giết đúng mục tiêu hay không. Các nhánh khác (2
// người, 4-8 người) không cần tham số này, giữ nguyên logic cũ.
export function checkWinCondition(players: PlayerState[], killerId: string | null = null): GameState["winner"] {
  const survivors = players.filter((p) => p.alive);

  // Biến thể 2 người — không ai có vai (role toàn null), nên không có khái
  // niệm "phe" — chỉ đơn giản người cuối cùng còn sống thắng.
  if (players.every((p) => p.role === null)) {
    return survivors.length === 1 ? { kind: "player", playerId: survivors[0].id } : null;
  }

  // Biến thể 3 người.
  if (players.some((p) => p.role === "police" || p.role === "criminal" || p.role === "traitor")) {
    // Đã "rơi" về chế độ sống sót (sau 1 lần giết sai mục tiêu) — người cuối
    // cùng còn sống thắng, y hệt nhánh 2 người ở trên, KHÔNG xét vòng tròn nữa.
    if (survivors.length === 1) {
      return { kind: "player", playerId: survivors[0].id };
    }

    // Vừa có ĐÚNG 1 người chết (3 người ban đầu -> còn 2 sống) — kiểm tra có
    // đúng người săn giết đúng mục tiêu của họ không.
    if (survivors.length === 2 && killerId) {
      const killer = players.find((p) => p.id === killerId);
      const deadPlayer = players.find((p) => !p.alive);
      if (killer?.role && deadPlayer?.role && HUNT_CIRCLE[killer.role] === deadPlayer.role) {
        return { kind: "player", playerId: killer.id };
      }
    }

    return null; // sai mục tiêu (hoặc killerId null — tự chết) -> ván tiếp tục, đã "rơi" về chế độ sống sót
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
