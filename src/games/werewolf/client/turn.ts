// Quyết định "người này đang làm được gì" từ view — hàm thuần, không đụng DOM (dễ test).
import type { Action, Phase, Role } from "../core/types";
import type { WerewolfView } from "../core/view";

export const ROLE_LABEL: Record<Role, string> = {
  wolf: "🐺 Sói",
  villager: "🧑‍🌾 Dân làng",
  seer: "🔮 Tiên tri",
  witch: "🧪 Phù thủy",
  guard: "🛡️ Bảo vệ",
};

const STEP_TEXT = {
  guard: "🛡️ Bảo vệ đang thức dậy",
  wolves: "🐺 Sói đang thức dậy",
  seer: "🔮 Tiên tri đang thức dậy",
  witch: "🧪 Phù thủy đang thức dậy",
} as const;

// R-80: chỉ nêu tên vai, KHÔNG nêu tên người (trừ pha biện hộ/phán quyết là thông tin công khai của ngày).
export function phaseTitle(phase: Phase, nameOf: (id: string) => string): string {
  switch (phase.kind) {
    case "night":
      return `🌙 Đêm ${phase.night} — ${STEP_TEXT[phase.step]}`;
    case "discussion":
      return `☀️ Ngày ${phase.day} — Thảo luận`;
    case "vote":
      return `🗳️ Ngày ${phase.day} — Bỏ phiếu`;
    case "defense":
      return `🎤 ${nameOf(phase.accusedId)} biện hộ`;
    case "verdict":
      return `⚖️ Phán quyết ${nameOf(phase.accusedId)}`;
    case "ended":
      return phase.winner === "draw" ? "🏁 Hoà" : phase.winner === "village" ? "🏁 Phe Dân thắng" : "🏁 Phe Sói thắng";
  }
}

export interface ButtonSpec {
  key: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  action: Action | null; // gửi khi bấm (now do server gán, ở đây để 0)
}

export interface TurnInfo {
  hint: string;
  buttons: ButtonSpec[];
  // Chạm thẻ người `id` → action cần gửi, hoặc null nếu không làm được gì.
  cardAction(id: string): Action | null;
  // Thẻ nào đang được MÌNH chọn (tô nổi) — lấy hoàn toàn từ view server (D-68).
  myPicks: string[];
}

const now = 0;

export function describeTurn(view: WerewolfView): TurnInfo {
  const me = view.viewerId;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  const isAlive = (id: string) => view.players.find((p) => p.id === id)?.alive === true;
  const none = (hint: string, buttons: ButtonSpec[] = []): TurnInfo => ({ hint, buttons, cardAction: () => null, myPicks: [] });
  const ph = view.phase;

  if (ph.kind === "ended") return none("Ván đã kết thúc — vai của mọi người đã được lật.");
  if (!view.amAlive) return none("💀 Bạn đã chết — bạn xem được vai của mọi người.");

  if (ph.kind === "night") {
    if (ph.step === "guard" && view.myRole === "guard" && view.guard) {
      const g = view.guard;
      const last = g.lastTarget ? ` Không được chọn lại ${nameOf(g.lastTarget)}.` : "";
      return {
        hint: `Chạm một người để bảo vệ (chạm lại để bỏ chọn).${last}`,
        buttons: [],
        myPicks: g.target ? [g.target] : [],
        cardAction: (id) => {
          if (!isAlive(id) || id === g.lastTarget) return null;
          return { type: "GUARD_PICK", playerId: me, targetId: id === g.target ? null : id, now };
        },
      };
    }
    if (ph.step === "wolves" && view.myRole === "wolf") {
      const mine = view.wolfPicks?.[me] ?? null;
      return {
        hint: "Chạm một người để cắn. Đồng đội thấy lựa chọn của bạn.",
        buttons: [],
        myPicks: mine ? [mine] : [],
        cardAction: (id) => (isAlive(id) ? { type: "WOLF_PICK", playerId: me, targetId: id === mine ? null : id, now } : null),
      };
    }
    if (ph.step === "seer" && view.myRole === "seer" && view.seer) {
      const s = view.seer;
      const lines = s.results.map((r) => `${nameOf(r.targetId)}: ${r.isWolf ? "Là Sói" : "Không phải Sói"}`);
      const done = s.pick !== null;
      return {
        hint: (done ? "Bạn đã soi đêm nay. " : "Chạm một người để soi (không đổi được). ") + (lines.length ? `Kết quả: ${lines.join("; ")}` : ""),
        buttons: [],
        myPicks: s.pick ? [s.pick] : [],
        cardAction: (id) => (!done && isAlive(id) && id !== me ? { type: "SEER_PICK", playerId: me, targetId: id, now } : null),
      };
    }
    if (ph.step === "witch" && view.myRole === "witch" && view.witch) {
      const w = view.witch;
      const bitten = w.bittenId ? `Đêm nay ${nameOf(w.bittenId)} bị Sói cắn.` : "Đêm nay không ai bị cắn.";
      const set = (save: boolean, poison: string | null): Action => ({ type: "WITCH_SET", playerId: me, save, poisonTarget: poison, now });
      return {
        hint: `${bitten} ${w.potions.poison ? "Chạm một người để dùng bình độc ☠️." : "Bạn đã hết bình độc."}`,
        buttons: [
          {
            key: "save",
            label: `🧪 Cứu (${w.potions.save ? 1 : 0})`,
            pressed: w.save,
            disabled: !w.potions.save || !w.bittenId,
            action: set(!w.save, w.poisonTarget),
          },
        ],
        myPicks: w.poisonTarget ? [w.poisonTarget] : [],
        cardAction: (id) => (w.potions.poison && isAlive(id) ? set(w.save, id === w.poisonTarget ? null : id) : null),
      };
    }
    // R-83: mọi người còn sống không có việc thấy đúng một dòng giống nhau.
    return none("🌙 Trời tối — hãy nhắm mắt và chờ trời sáng.");
  }

  if (ph.kind === "discussion") {
    const aliveCount = view.players.filter((p) => p.alive).length;
    const need = Math.floor(aliveCount / 2) + 1;
    const on = Object.keys(view.endEarly).length;
    return none("Thảo luận (nói chuyện qua kênh ngoài).", [
      { key: "extend", label: "+60 giây", disabled: view.extendUsed, action: { type: "EXTEND_DISCUSSION", playerId: me, now } },
      { key: "early", label: `Kết thúc sớm (${on}/${need})`, pressed: view.endEarly[me] === true, action: { type: "TOGGLE_END_EARLY", playerId: me, now } },
    ]);
  }

  if (ph.kind === "vote") {
    const mine = view.votes[me];
    return {
      hint: "Chạm vào người bạn muốn đưa lên (chạm lại để rút phiếu).",
      buttons: [{ key: "blank", label: "Phiếu trắng", pressed: mine === "blank", action: { type: "CAST_VOTE", playerId: me, targetId: mine === "blank" ? null : "blank", now } }],
      myPicks: mine && mine !== "blank" ? [mine] : [],
      cardAction: (id) => (isAlive(id) ? { type: "CAST_VOTE", playerId: me, targetId: id === mine ? null : id, now } : null),
    };
  }

  if (ph.kind === "defense") return none(ph.accusedId === me ? "Bạn đang biện hộ — hãy nói qua kênh ngoài." : `${nameOf(ph.accusedId)} đang biện hộ.`);

  // verdict
  if (ph.accusedId === me) return none("Mọi người đang phán quyết bạn.");
  const mine = view.verdicts[me];
  const pick = (choice: "kill" | "spare"): Action => ({ type: "CAST_VERDICT", playerId: me, choice: mine === choice ? null : choice, now });
  return none(`Giết hay Tha ${nameOf(ph.accusedId)}?`, [
    { key: "kill", label: "⚔️ Giết", pressed: mine === "kill", action: pick("kill") },
    { key: "spare", label: "🕊️ Tha", pressed: mine === "spare", action: pick("spare") },
  ]);
}

// Câu chữ nhật ký công khai (state chỉ chứa dữ liệu, client tự dịch — W1).
export function describeLog(view: WerewolfView): string[] {
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  return view.log.map((e) => {
    switch (e.kind) {
      case "deaths":
        return e.ids.length ? `Đêm ${e.night}: ${e.ids.map(nameOf).join(", ")} đã chết` : `Đêm ${e.night}: không ai chết`;
      case "vote_result":
        return e.accusedId ? `Ngày ${e.day}: ${nameOf(e.accusedId)} bị đưa lên` : `Ngày ${e.day}: không ai bị đưa lên`;
      case "verdict_result":
        return `Ngày ${e.day}: ${nameOf(e.accusedId)} ${e.killed ? "bị treo cổ" : "được tha"}`;
      case "ended":
        return e.winner === "draw" ? "Ván kết thúc: Hoà" : e.winner === "village" ? "Ván kết thúc: Phe Dân thắng" : "Ván kết thúc: Phe Sói thắng";
    }
  });
}
