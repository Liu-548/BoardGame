// Phòng Câu cá = khung phòng chung + adapter (giống Ma Sói). Không chứa luật.
import { BaseRoom } from "../../../shared/room/base-room";
import type { GameAdapter } from "../../../shared/room/base-room";
import { reduce } from "../core/reduce";
import { setupGame } from "../core/setup";
import type { Action, GameState } from "../core/types";
import { MAX_PLAYERS, MIN_PLAYERS } from "../core/types";
import { viewFor } from "../core/view";
import type { CauCaView } from "../core/view";

// Câu cá không có cấu hình gì để chỉnh — luật nhà đã chốt cứng.
type Config = Record<string, never>;

const adapter: GameAdapter<GameState, Action, CauCaView, Config> = {
  defaultConfig: () => ({}),
  validateConfig: (_config, playerCount) =>
    playerCount === 3 || playerCount === 4 ? null : "Câu cá chỉ chơi 3 hoặc 4 người",
  sanitizeConfig: () => ({}),
  setup: (players, seed) => setupGame(players, seed)!, // số người đã qua validateConfig
  reduce,
  viewFor,
  deadline: (state) => state.pending[state.pending.length - 1]?.endsAt ?? null,
  timeUpAction: (_state, now) => ({ type: "TIME_UP", now }),
  isOver: (state) => state.over,
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
};

export class CauCaRoom extends BaseRoom<GameState, Action, CauCaView, Config> {
  constructor(ctx: DurableObjectState, env: { DEV_TOOLS?: string }) {
    super(ctx, adapter, env.DEV_TOOLS === "1");
  }
}
