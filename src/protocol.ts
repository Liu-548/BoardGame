// Việc 3.5: giao thức tin nhắn giữa client và server, qua WebSocket (JSON,
// gửi dạng chuỗi văn bản qua `JSON.stringify`/`JSON.parse`).
//
// File này CHỈ định nghĩa KIỂU DỮ LIỆU — "viết ra giấy trước" theo đúng tinh
// thần LO-TRINH.md. Việc nối message "action" vào Room thật (đọc state, gọi
// reduce(), gửi lại viewFor() riêng cho từng người) để dành việc 3.7 trở đi
// (cần lưu state vào ctx.storage trước). Ngoại lệ: phần chat (bonus) không
// phụ thuộc state ván đấu nên đã nối thật vào room.ts luôn, xem ghi chú ở đó.
//
// Đặt ở src/protocol.ts (không phải trong core/, server/, hay client/) vì đây
// là "ngôn ngữ chung" cả 2 bên đều cần đọc — core/ vẫn không đụng tới file
// này (không vi phạm quy tắc 1), chỉ server/ và client/ cùng import.

import type { Action, GameEvent } from "./core/types";
import type { PlayerView } from "./core/view";

// ----- Client → Server -----

export type ClientMessage =
  // Việc đầu tiên khi vừa kết nối: cho server biết mình là ai trong ván —
  // WebSocket không tự mang theo danh tính, phải tự giới thiệu.
  | { type: "join"; playerId: string }
  // Một hành động luật chơi (rút bài, đánh bài, trả lời...) — sẽ forward
  // nguyên si vào reduce(state, action) ở server (việc 3.7 trở đi, sau khi
  // Room có chỗ lưu state ván đấu).
  | { type: "action"; action: Action }
  // Tin nhắn chat (bonus của việc 3.5). KHÔNG có `to` = gửi cho CẢ PHÒNG;
  // CÓ `to` = CHỈ gửi riêng cho đúng 1 người chơi đó. Dùng playerId (không
  // phải tên hiển thị) vì tên có thể trùng nhau giữa 2 người trong ván.
  | { type: "chat"; text: string; to?: string };

// ----- Server → Client -----

export type ServerMessage =
  // State đã LỌC RIÊNG cho từng người nhận (viewFor(), việc 3.6) — KHÔNG BAO
  // GIỜ gửi state đầy đủ (quy tắc 6 CLAUDE.md).
  | { type: "state"; view: PlayerView; events: GameEvent[] }
  // Hành động bị từ chối (reduce() ném lỗi) — CHỈ gửi lại cho đúng người vừa
  // gửi hành động đó, không phát cho cả phòng.
  | { type: "action_error"; message: string }
  // Tin nhắn chat đã chuyển tiếp. `scope` cho client biết cách hiển thị
  // ("An nói với cả phòng" hay "An nhắn riêng cho bạn"). QUAN TRỌNG: với tin
  // nhắn riêng (`scope: "private"`), server CHỈ gửi ServerMessage này cho
  // đúng người gửi + người nhận — người khác trong phòng không hề nhận được
  // gói tin này, không phải kiểu "gửi cho tất cả rồi ẩn ở giao diện".
  | { type: "chat"; from: string; text: string; scope: "room" | "private"; to?: string };
