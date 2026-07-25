// Việc 3.5: giao thức tin nhắn giữa client và server, qua WebSocket (JSON,
// gửi dạng chuỗi văn bản qua `JSON.stringify`/`JSON.parse`).
//
// File này CHỈ định nghĩa KIỂU DỮ LIỆU — "viết ra giấy trước" theo đúng tinh
// thần LO-TRINH.md. Việc 3.7 đã nối message "start_game"/"action" vào Room
// thật (đọc/ghi state qua ctx.storage, gọi reduce(), gửi lại viewFor() riêng
// cho từng người) — xem room.ts.
//
// Đặt ở src/protocol.ts (không phải trong core/, server/, hay client/) vì đây
// là "ngôn ngữ chung" cả 2 bên đều cần đọc — core/ vẫn không đụng tới file
// này (không vi phạm quy tắc 1), chỉ server/ và client/ cùng import.

import type { Action, GameEvent } from "./core/types";
import type { PlayerView } from "./core/view";

// Việc 4.1: đồng hồ đếm ngược lượt (chỉ chơi qua mạng — dùng DO Alarm ở
// server, xem room.ts). CHỦ Ý không đặt field này trong GameState/PlayerView:
// deadline phụ thuộc THỜI GIAN THỰC (Date.now()), mà quy tắc 2 CLAUDE.md cấm
// core/ đụng tới Date.now() — nên nó sống ở "ngôn ngữ chung" protocol.ts, coi
// như 1 phần state THÊM VÀO của server, không phải của core/.
export interface DeadlineInfo {
  playerId: string; // ai đang bị tính giờ
  expiresAt: number; // mốc thời gian hết hạn, epoch mili-giây — client tự tính
  // giây còn lại bằng (expiresAt - Date.now())/1000, tự đếm lùi bằng
  // setInterval CỦA RIÊNG CLIENT (không phải server/DO — không vi phạm quy
  // tắc 8, quy tắc đó chỉ cấm setInterval/setTimeout TRONG Durable Object).
  kind: "play" | "reactive" | "discard"; // xem room.ts để biết ý nghĩa + thời lượng từng loại
}

// ----- Client → Server -----

export type ClientMessage =
  // Việc đầu tiên khi vừa kết nối: cho server biết mình là ai + tên hiển thị
  // — WebSocket không tự mang theo danh tính, phải tự giới thiệu. Server
  // dùng `name` để hiện trong danh sách chờ ở lobby (việc 3.9).
  | { type: "join"; playerId: string; name: string }
  // Bắt đầu ván mới trong phòng này — dùng ĐÚNG những người đang kết nối và
  // đã "join" (server tự biết, không cần client liệt kê lại — khác việc 3.7
  // lúc CHƯA có lobby thật, phải gõ tay playerIds). Nếu phòng đã có ván đang
  // chơi, server bỏ qua (không ghi đè ván đang chơi dở).
  | { type: "start_game"; seed: number }
  // Một hành động luật chơi (rút bài, đánh bài, trả lời...) — forward nguyên
  // si vào reduce(state, action) ở server.
  | { type: "action"; action: Action }
  // Tin nhắn chat (bonus của việc 3.5). KHÔNG có `to` = gửi cho CẢ PHÒNG;
  // CÓ `to` = CHỈ gửi riêng cho đúng 1 người chơi đó. Dùng playerId (không
  // phải tên hiển thị) vì tên có thể trùng nhau giữa 2 người trong ván.
  | { type: "chat"; text: string; to?: string };

// ----- Server → Client -----

export type ServerMessage =
  // Danh sách người đang có mặt trong phòng (đã "join", CHƯA CHẮC đã bắt đầu
  // ván) — dùng để vẽ màn hình lobby (việc 3.9): ai đã vào, đủ người chưa.
  // Gửi lại cho CẢ PHÒNG mỗi khi có người vào/rời phòng.
  // `ownerId`: người duy nhất được phép gửi "start_game" (mới, theo yêu cầu
  // sau việc 3.10) — người ĐẦU TIÊN join vào phòng trống. null nếu phòng vừa
  // trống hẳn (ai join tiếp theo sẽ tự thành chủ phòng mới, xem room.ts).
  | { type: "lobby"; players: { id: string; name: string }[]; ownerId: string | null }
  // State đã LỌC RIÊNG cho từng người nhận (viewFor(), việc 3.6) — KHÔNG BAO
  // GIỜ gửi state đầy đủ (quy tắc 6 CLAUDE.md).
  // `deadline`: đồng hồ đếm ngược hiện tại (việc 4.1), null nếu ván chưa bắt
  // đầu/đã kết thúc — GIỐNG NHAU cho mọi người nhận (không phải riêng theo viewer).
  | { type: "state"; view: PlayerView; events: GameEvent[]; deadline: DeadlineInfo | null }
  // Hành động bị từ chối (reduce()/setupGame() ném lỗi) — CHỈ gửi lại cho
  // đúng người vừa gửi hành động đó, không phát cho cả phòng.
  | { type: "action_error"; message: string }
  // Tin nhắn chat đã chuyển tiếp. `scope` cho client biết cách hiển thị
  // ("An nói với cả phòng" hay "An nhắn riêng cho bạn"). QUAN TRỌNG: với tin
  // nhắn riêng (`scope: "private"`), server CHỈ gửi ServerMessage này cho
  // đúng người gửi + người nhận — người khác trong phòng không hề nhận được
  // gói tin này, không phải kiểu "gửi cho tất cả rồi ẩn ở giao diện".
  | { type: "chat"; from: string; text: string; scope: "room" | "private"; to?: string };
