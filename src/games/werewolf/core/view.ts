// viewFor: những gì MỘT người chơi được phép thấy (02 mục 6). Khai báo tường minh từng trường,
// KHÔNG spread state rồi xoá bớt — để trường mới thêm vào state không vô tình rò ra.
import type { Config, GameState, NightStep, Phase, PublicLogEntry, Role } from "./types";
import { isWolfRole } from "./types";

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
  mayorId: string | null; // công khai
  idiotRevealed: string | null; // Kẻ ngốc đã lộ (công khai, mất quyền bỏ phiếu)
  lovers: string[]; // chỉ cặp đôi, Cupid, người chết/hết ván mới thấy; còn lại []
  // --- cá nhân: chỉ xuất hiện đúng người/đúng lúc ---
  guard?: { target: string | null; lastTarget: string | null };
  wolfPicks?: Record<string, string>; // Sói sống, trong pha 1 (R-41a)
  wolfPicks2?: Record<string, string>; // chỉ khi đêm nay cắn 2 (Sói con chết)
  doubleBite?: boolean;
  cupid?: { picks: string[] }; // Cupid, đêm 1 pha 1
  curse?: { armed: boolean; used: boolean; target: string | null; bitten: string[] }; // Sói nguyền
  seer?: { pick: string | null; results: { night: number; targetId: string; isWolf: boolean }[] };
  witch?: {
    potions: { save: boolean; poison: boolean };
    bittenId: string | null;
    bittenId2: string | null;
    save: boolean;
    save2: boolean;
    poisonTarget: string | null;
  };
}

export function viewFor(state: GameState, playerId: string): WerewolfView {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error("viewFor: người chơi không tồn tại");

  const ended = state.phase.kind === "ended";
  const seeAll = ended || !me.alive; // R-61, R-70
  const meWolf = isWolfRole(me.role);
  // Cặp đôi thấy vai nhau ngay (chỉ người trong cặp; Cupid ghép người khác thì không biết vai).
  const partner = state.lovers.includes(me.id) ? state.lovers.find((id) => id !== me.id) ?? null : null;
  const seeLovers = seeAll || partner !== null || me.role === "cupid";
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
      const showRole = seeAll || p.id === me.id || (meWolf && isWolfRole(p.role)) || p.id === partner || p.id === state.idiotRevealed;
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
    mayorId: state.mayorId,
    idiotRevealed: state.idiotRevealed,
    lovers: seeLovers ? state.lovers : [],
  };

  if (active && night) {
    if (me.role === "guard") view.guard = { target: state.guardTarget, lastTarget: state.lastGuardTarget };
    if (meWolf && step === "first") {
      view.wolfPicks = state.wolfPicks; // R-41a: chỉ trong pha Sói thức
      view.doubleBite = state.doubleBite;
      if (state.doubleBite) view.wolfPicks2 = state.wolfPicks2;
    }
    if (me.role === "cupid" && step === "first" && night!.night === 1) view.cupid = { picks: state.cupidPicks };
    if (me.role === "cursed_wolf") {
      const bitten = step === "second" ? [state.bittenId, state.bittenId2].filter((x): x is string => x !== null) : [];
      view.curse = { armed: state.curse.armed, used: state.curse.used, target: state.curseTarget, bitten };
    }
    if (me.role === "seer") view.seer = { pick: state.seerPick, results: state.seerResults };
    if (me.role === "witch") {
      view.witch = {
        potions: state.potions,
        bittenId: step === "second" ? state.bittenId : null, // R-43a: chỉ từ pha 2 (đã chốt ai bị cắn)
        bittenId2: step === "second" ? state.bittenId2 : null,
        save: state.witchSave,
        save2: state.witchSave2,
        poisonTarget: state.witchPoisonTarget,
      };
    }
  } else if (active) {
    // Ban ngày: Tiên tri vẫn xem lại kết quả cũ; Phù thủy xem số bình còn lại (R-43f); Bảo vệ cần lastTarget cho UI đêm sau.
    if (me.role === "seer") view.seer = { pick: null, results: state.seerResults };
    if (me.role === "witch") view.witch = { potions: state.potions, bittenId: null, bittenId2: null, save: false, save2: false, poisonTarget: null };
    if (me.role === "guard") view.guard = { target: null, lastTarget: state.lastGuardTarget };
    if (me.role === "cursed_wolf") view.curse = { armed: state.curse.armed, used: state.curse.used, target: null, bitten: [] };
  }
  return view;
}
