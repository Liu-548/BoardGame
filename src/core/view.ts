// Việc 3.6: viewFor(state, playerId) — lọc state CHỈ để gửi ra ngoài. Server
// LUÔN gọi hàm này thay vì gửi state đầy đủ (quy tắc 6 CLAUDE.md: "Client
// không bao giờ nhận state đầy đủ... Không có ngoại lệ, kể cả khi debug").
// KHÔNG đổi gì trong reduce()/state thật — chỉ tạo 1 bản rút gọn riêng cho
// TỪNG người xem.
//
// Ẩn với người KHÔNG PHẢI viewer:
// - Bài trên tay: chỉ biết SỐ LƯỢNG (handCount), không biết là lá gì.
// - Vai (role): ẩn, TRỪ 3 trường hợp luôn công khai đúng luật gốc — chính
//   người xem, Cảnh sát trưởng (lộ từ đầu ván), và người ĐÃ CHẾT (lật vai
//   công khai khi bị loại).
// - Bộ bài rút (deck): chỉ biết SỐ LƯỢNG, không biết thứ tự/nội dung — biết
//   trước sẽ phá luôn yếu tố may rủi của draw!.
//
// LUÔN công khai (không cần ẩn, đúng luật gốc): máu/máu tối đa, trang bị trên
// sân (súng, Barrel, Scope, Mustang, Jail, Dynamite đều để ngửa), còn sống/đã
// chết, chồng bỏ, stack pending (không chứa lá bài ẩn nào — chỉ có id/kind
// việc đang chờ, xem PendingAction ở types.ts), ai đang tới lượt, turnPhase,
// kết quả ván.

import type { GameState, PlayerState, Role } from "./types";

export interface PlayerHandView {
  id: string;
  name: string;
  role: Role | null; // null = vai đang bị ẩn với người xem này
  hp: number;
  maxHp: number;
  handCount: number; // luôn đúng, kể cả khi hand (bên dưới) bị ẩn
  hand: string[] | null; // chỉ có giá trị thật nếu id === viewerId, còn lại null
  equipment: string[];
  alive: boolean;
}

export interface PlayerView {
  viewerId: string;
  players: PlayerHandView[];
  deckCount: number;
  discardPile: string[];
  pending: GameState["pending"];
  currentPlayerIndex: number;
  turnPhase: GameState["turnPhase"];
  winner: GameState["winner"];
}

function viewRole(player: PlayerState, viewerId: string): Role | null {
  if (player.id === viewerId) return player.role;
  if (player.role === "sheriff") return player.role;
  if (!player.alive) return player.role; // lật vai công khai khi bị loại
  return null;
}

export function viewFor(state: GameState, viewerId: string): PlayerView {
  const players: PlayerHandView[] = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    role: viewRole(player, viewerId),
    hp: player.hp,
    maxHp: player.maxHp,
    handCount: player.hand.length,
    hand: player.id === viewerId ? [...player.hand] : null,
    equipment: [...player.equipment],
    alive: player.alive,
  }));

  return {
    viewerId,
    players,
    deckCount: state.deck.length,
    discardPile: [...state.discardPile],
    pending: state.pending,
    currentPlayerIndex: state.currentPlayerIndex,
    turnPhase: state.turnPhase,
    winner: state.winner,
  };
}
