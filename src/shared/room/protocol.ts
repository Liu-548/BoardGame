// Message chung client↔server cho mọi game dùng khung phòng chung (02 mục 7).
// Phần riêng từng game (config, action, view) đi qua kiểu `unknown`, game tự ép kiểu.

export type ClientMessage =
  | { type: "join"; name: string; token: string }
  | { type: "set_config"; config: unknown | null } // chỉ chủ phòng; null = quay về bộ gợi ý
  | { type: "start_game"; force?: boolean } // chỉ chủ phòng; seed do server sinh. force = bắt đầu lại khi ván đang chơi
  | { type: "action"; action: unknown } // server kiểm playerId khớp socket, ghi đè `now`
  | { type: "return_to_lobby" } // chỉ chủ phòng: hủy ván (kể cả đang chơi), đưa cả phòng về phòng chờ
  | { type: "set_test_roles"; roles: Record<string, string> | null } // chỉ chủ phòng, chỉ bản thử nghiệm: null = tắt gán vai
  // Chỉ chủ phòng, chỉ bản thử nghiệm: kết thúc pha hiện tại ngay (như hết giờ). `token` = mã pha client đang
  // thấy (GameAdapter.phaseToken); pha đã đổi (vd vừa tự hết giờ) thì server bỏ qua, tránh bỏ qua liền 2 pha.
  | { type: "skip_phase"; token: number | null }
  | { type: "ping" };

export interface LobbyPlayer {
  playerId: string;
  name: string;
  connected: boolean;
  waiting: boolean; // vào giữa ván → chờ ván sau (D-43.3)
}

export type ServerMessage =
  | { type: "joined"; playerId: string }
  | { type: "join_rejected"; reason: string }
  | {
      type: "lobby";
      players: LobbyPlayer[];
      ownerId: string | null;
      config: unknown;
      configError: string | null; // validateConfig của game, null = hợp lệ
      testRoles: Record<string, string> | null; // phòng test: playerId → vai chủ phòng gán (null = chia ngẫu nhiên)
      devTools: boolean; // bản thử nghiệm (beta) — client hiện công cụ thử như "Bỏ qua pha"
      inGame: boolean; // ván đang chơi (ván đã kết thúc tính là KHÔNG — phòng chờ dùng được ngay)
    }
  | { type: "state"; view: unknown; serverNow: number }
  | { type: "error"; message: string };
