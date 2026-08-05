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

import type { Action, ExpansionId, GameEvent, HouseRuleId } from "./core/types";
import type { PlayerView } from "./core/view";

// Việc 4.1: đồng hồ đếm ngược lượt (chỉ chơi qua mạng — dùng DO Alarm ở
// server, xem room.ts). CHỦ Ý không đặt field này trong GameState/PlayerView:
// deadline phụ thuộc THỜI GIAN THỰC (Date.now()), mà quy tắc 2 CLAUDE.md cấm
// core/ đụng tới Date.now() — nên nó sống ở "ngôn ngữ chung" protocol.ts, coi
// như 1 phần state THÊM VÀO của server, không phải của core/.
//
// Giai đoạn 5, cơ chế chọn nhân vật — "character_selection" là loại đồng hồ
// DUY NHẤT không gắn với 1 người chơi cụ thể (đồng hồ CHUNG cho cả bàn, MỌI
// người cùng chọn độc lập trong 1 khoảng thời gian — xem CharacterChoice ở
// core/types.ts), nên `playerId` ở nhánh này LUÔN là `null`. Union theo `kind`
// để TypeScript tự bắt lỗi nếu lỡ đọc `playerId` như `string` ở nhánh đó.
export type DeadlineInfo =
  | {
      playerId: string; // ai đang bị tính giờ
      expiresAt: number; // mốc thời gian hết hạn, epoch mili-giây — client tự tính
      // giây còn lại bằng (expiresAt - Date.now())/1000, tự đếm lùi bằng
      // setInterval CỦA RIÊNG CLIENT (không phải server/DO — không vi phạm quy
      // tắc 8, quy tắc đó chỉ cấm setInterval/setTimeout TRONG Durable Object).
      kind: "play" | "reactive" | "discard"; // xem room.ts để biết ý nghĩa + thời lượng từng loại
    }
  | {
      playerId: null;
      expiresAt: number;
      kind: "character_selection"; // CHUNG cho cả bàn chọn nhân vật — xem room.ts (thời lượng)
    };

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
  // `houseRules` (việc 5.3): luật bổ sung CHỦ PHÒNG chọn ngay trên màn hình
  // lobby trước khi bấm nút này — không broadcast lựa chọn đang gõ dở cho cả
  // phòng (giống `seed`, không ai khác cần biết trước khi ván thật sự bắt
  // đầu), chỉ gửi kèm 1 lần lúc bắt đầu ván thật.
  // `expansions` (mở rộng Dodge City): bộ mở rộng chủ phòng tick chọn, CÙNG
  // MÀN HÌNH và CÙNG QUY TẮC gửi như `houseRules` ở trên nhưng tách field
  // riêng — đây là "thêm nội dung" (lá bài + nhân vật), khác bản chất "chỉnh
  // luật chơi" của houseRules (xem ExpansionId ở core/types.ts).
  // `force` (nút "Bắt đầu ván mới" trong dialog Cài đặt, chơi qua mạng): CHỈ
  // chủ phòng mới gửi được field này — bỏ qua kiểm tra "đã có ván đang chơi
  // dở" ở server, HUỶ NGANG ván cũ (chưa có `winner`) để tạo ván mới đè lên.
  // Client tự hỏi xác nhận TRƯỚC khi gửi kèm `force: true` (xem main.ts) —
  // server không tự hỏi gì, tin thẳng field này.
  | { type: "start_game"; seed: number; houseRules?: HouseRuleId[]; expansions?: ExpansionId[]; force?: boolean }
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
  // `connectedPlayerIds` (việc 4.3): trong số `view.players`, ai ĐANG có socket
  // mở thật sự ngay lúc này — để client hiện chú thích "đã mất kết nối" cho
  // người không nằm trong danh sách này. Không phải bí mật gì (ai cũng thấy ai
  // còn/mất kết nối), nên gửi GIỐNG NHAU cho mọi người, không lọc riêng.
  | { type: "state"; view: PlayerView; events: GameEvent[]; deadline: DeadlineInfo | null; connectedPlayerIds: string[] }
  // Hành động bị từ chối (reduce()/setupGame() ném lỗi) — CHỈ gửi lại cho
  // đúng người vừa gửi hành động đó, không phát cho cả phòng.
  | { type: "action_error"; message: string }
  // Việc 4.3: ván đang chơi dở bị HUỶ vì chỉ còn 0-1 người chơi còn kết nối
  // (những người còn lại đều đã rời/mất mạng) — tiếp tục để 1 người tự chơi 1
  // mình bằng toàn hết-giờ-tự-động thì vô nghĩa. Server đã xoá GameState lưu
  // trong storage (room.ts), phòng quay lại trạng thái lobby — chủ phòng hiện
  // tại (ownerId gửi kèm ServerMessage "lobby" ngay sau đó) có thể bắt đầu ván
  // mới khi đủ người quay lại. KHÔNG liên quan `winner` trong GameState —
  // "huỷ" khác "kết thúc đúng luật", core/ không biết gì về khái niệm này.
  | { type: "game_abandoned" }
  // Tin nhắn chat đã chuyển tiếp. `scope` cho client biết cách hiển thị
  // ("An nói với cả phòng" hay "An nhắn riêng cho bạn"). QUAN TRỌNG: với tin
  // nhắn riêng (`scope: "private"`), server CHỈ gửi ServerMessage này cho
  // đúng người gửi + người nhận — người khác trong phòng không hề nhận được
  // gói tin này, không phải kiểu "gửi cho tất cả rồi ẩn ở giao diện".
  | { type: "chat"; from: string; text: string; scope: "room" | "private"; to?: string };
