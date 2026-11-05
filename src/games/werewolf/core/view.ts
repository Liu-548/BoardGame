// viewFor: những gì MỘT người chơi được phép thấy (02 mục 6). Khai báo tường minh từng trường,
// KHÔNG spread state rồi xoá bớt — để trường mới thêm vào state không vô tình rò ra.
import type { Config, GameState, NightStep, Phase, PublicLogEntry, Role } from "./types";

export interface ViewPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  role?: Role; // chỉ có khi viewer được phép biết (chính mình, đồng đội Sói, người chết/hết ván xem tất cả)
}

export interface WerewolfView {
  viewerId: string;
  myRole: Role;
  amAlive: boolean;
  config: Config;
  players: ViewPlayer[];
  phase: Phase;
  phaseSeq: number;
  phaseEndsAt: number | null;
  lastNightDeaths: string[];
  log: PublicLogEntry[];
  extendUsed: boolean;
  endEarly: Record<string, true>;
  votes: Record<string, string>;
  verdicts: Record<string, "kill" | "spare">;
  // --- cá nhân: chỉ xuất hiện đúng người/đúng lúc ---
  guard?: { target: string | null; lastTarget: string | null };
  wolfPicks?: Record<string, string>; // Sói sống, trong pha wolves (R-41a)
  seer?: { pick: string | null; results: { night: number; targetId: string; isWolf: boolean }[] };
  witch?: { potions: { save: boolean; poison: boolean }; bittenId: string | null; save: boolean; poisonTarget: string | null };
}

export function viewFor(state: GameState, playerId: string): WerewolfView {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error("viewFor: người chơi không tồn tại");

  const ended = state.phase.kind === "ended";
  const seeAll = ended || !me.alive; // R-61, R-70
  const meWolf = me.role === "wolf";
  const night = state.phase.kind === "night" ? state.phase : null;
  const step: NightStep | null = night ? night.step : null;
  // Người chết chỉ được xem vai, không xem hành động đêm (D-34).
  const active = me.alive && !ended;

  const view: WerewolfView = {
    viewerId: me.id,
    myRole: me.role,
    amAlive: me.alive,
    config: state.config,
    players: state.players.map((p) => {
      const showRole = seeAll || p.id === me.id || (meWolf && p.role === "wolf");
      const vp: ViewPlayer = { id: p.id, name: p.name, seat: p.seat, alive: p.alive };
      if (showRole) vp.role = p.role;
      return vp;
    }),
    phase: state.phase,
    phaseSeq: state.phaseSeq,
    phaseEndsAt: state.phaseEndsAt,
    lastNightDeaths: state.lastNightDeaths,
    log: state.log,
    extendUsed: state.extendUsed,
    endEarly: state.endEarly,
    votes: state.votes,
    verdicts: state.verdicts,
  };

  if (active && night) {
    if (me.role === "guard") view.guard = { target: state.guardTarget, lastTarget: state.lastGuardTarget };
    if (meWolf && step === "wolves") view.wolfPicks = state.wolfPicks;
    if (me.role === "seer") view.seer = { pick: state.seerPick, results: state.seerResults };
    if (me.role === "witch") {
      view.witch = {
        potions: state.potions,
        bittenId: step === "witch" ? state.bittenId : null, // R-43a: chỉ từ pha witch
        save: state.witchSave,
        poisonTarget: state.witchPoisonTarget,
      };
    }
  } else if (active) {
    // Ban ngày: Tiên tri vẫn xem lại kết quả cũ; Phù thủy xem số bình còn lại (R-43f); Bảo vệ cần lastTarget cho UI đêm sau.
    if (me.role === "seer") view.seer = { pick: null, results: state.seerResults };
    if (me.role === "witch") view.witch = { potions: state.potions, bittenId: null, save: false, poisonTarget: null };
    if (me.role === "guard") view.guard = { target: null, lastTarget: state.lastGuardTarget };
  }
  return view;
}
