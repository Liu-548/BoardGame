// Quyết định "người này đang làm được gì" từ view — hàm thuần, không đụng DOM (dễ test).
import type { Action, Phase, Role, Winner } from "../core/types";
import { isWolfRole, NIGHT_STEP_ORDER, NIGHT_STEP_ROLES } from "../core/types";
import type { WerewolfView } from "../core/view";

export const ROLE_LABEL: Record<Role, string> = {
  wolf: "🐺 Sói",
  villager: "🧑‍🌾 Dân làng",
  seer: "🔮 Tiên tri",
  witch: "🧪 Phù thủy",
  guard: "🛡️ Bảo vệ",
  wolf_cub: "🐾 Sói con",
  cursed_wolf: "🩸 Sói nguyền",
  hunter: "🏹 Thợ săn",
  elder: "👴 Già làng",
  idiot: "🤪 Kẻ ngốc",
  knight: "🗡️ Kỵ sĩ",
  cupid: "💘 Cupid",
  tanner: "😩 Kẻ chán đời",
};

export type Team = "wolves" | "village" | "solo";
export const TEAM_LABEL: Record<Team, string> = { wolves: "Phe Sói", village: "Phe Dân", solo: "Phe riêng" };

// Thư viện vai (giống "Thư viện bài" của Bang!). Viết theo đúng luật đã cài — docs/werewolf/01-LUAT.md mục 2, 4, 12.
// Thêm vai mở rộng: thêm 1 dòng ở đây (test library.test.ts bắt thiếu).
export const ROLE_INFO: Record<Role, { team: Team; maxOne: boolean; ability: string }> = {
  wolf: {
    team: "wolves",
    maxOne: false,
    ability:
      "Mỗi đêm cùng bầy chọn 1 người còn sống để cắn (được chọn cả Sói khác hay chính mình). Các Sói thấy lựa chọn của nhau ngay lúc chọn. Hết giờ: người nhiều phiếu nhất bị cắn, hoà thì bốc ngẫu nhiên; không Sói nào chọn thì đêm đó không ai bị cắn.",
  },
  villager: {
    team: "village",
    maxOne: false,
    ability: "Không có khả năng ban đêm. Dùng thảo luận và lá phiếu ban ngày để tìm ra Sói.",
  },
  seer: {
    team: "village",
    maxOne: true,
    ability:
      "Mỗi đêm soi 1 người còn sống (không soi chính mình). Chỉ biết người đó \"Là Sói\" hay \"Không phải Sói\" (Sói con, Sói nguyền cũng là Sói), không biết vai cụ thể. Chọn xong không đổi được, kết quả chỉ mình thấy.",
  },
  witch: {
    team: "village",
    maxOne: true,
    ability:
      "Được báo ai bị Sói cắn đêm nay. Có 1 bình cứu (chỉ cứu người bị cắn đêm nay, kể cả chính mình; đêm Sói cắn 2 thì cứu được 1 trong 2) và 1 bình độc (giết 1 người còn sống bất kỳ) cho cả ván. Dùng cả 2 bình trong 1 đêm được, không dùng cũng được.",
  },
  guard: {
    team: "village",
    maxOne: true,
    ability:
      "Mỗi đêm bảo vệ 1 người khỏi Sói cắn (được chọn chính mình), nhưng không được chọn cùng 1 người 2 đêm liền. Được bỏ qua. Không chặn được bình độc hay treo cổ.",
  },
  wolf_cub: {
    team: "wolves",
    maxOne: true,
    ability: "Thức và cắn cùng bầy Sói. Khi Sói con chết (kiểu gì cũng vậy), đêm kế tiếp bầy Sói được cắn 2 người. Phù thủy thấy cả 2 nhưng chỉ cứu được 1.",
  },
  cursed_wolf: {
    team: "wolves",
    maxOne: true,
    ability:
      "Thức và cắn cùng bầy Sói. Một lần mỗi ván: ban ngày bấm \"Kích hoạt nguyền\", đêm đó ở pha 2 được chọn biến người vừa bị cắn thành Sói thay vì chết. Nếu người đó được Bảo vệ/Phù thủy cứu thì nguyền không có tác dụng và chưa bị tính là đã dùng.",
  },
  hunter: {
    team: "village",
    maxOne: true,
    ability:
      "Khi chết (bị cắn, trúng độc, bị treo, chết theo người yêu…) được bắn 1 người còn sống trong 30 giây. Chết ban đêm thì bắn sau khi công bố Bình minh; bị treo thì bắn ngay sau phán quyết. Hết giờ không chọn = không bắn.",
  },
  elder: {
    team: "village",
    maxOne: true,
    ability: "Chịu được 1 lần Sói cắn (lần đầu không chết, không ai được báo). Bình độc, treo cổ vẫn chết ngay.",
  },
  idiot: {
    team: "village",
    maxOne: true,
    ability: "Lần đầu bị làng treo cổ thì không chết: vai bị lật công khai và mất quyền bỏ phiếu/phán quyết đến hết ván. Lần sau bị treo thì chết như thường.",
  },
  knight: {
    team: "village",
    maxOne: true,
    ability:
      "Nếu bị Sói cắn chết, Sói còn sống gần nhất đi về phía ghế số nhỏ hơn (vòng tròn: 4, 3, 2, 1, rồi ghế cuối…) sẽ chết vào Bình minh hôm sau.",
  },
  cupid: {
    team: "village",
    maxOne: true,
    ability:
      "Đêm 1 chọn 2 người làm cặp đôi (được chọn chính mình). Cặp đôi thấy vai của nhau ngay; Cupid ghép người khác thì không biết vai họ. Một người chết thì người kia chết theo ngay. Cặp đôi khác phe thành phe riêng, thắng khi chỉ còn 2 người họ.",
  },
  tanner: {
    team: "solo",
    maxOne: true,
    ability: "Phe riêng: thắng một mình (ván kết thúc ngay) nếu bị làng treo cổ. Chết kiểu khác thì thua.",
  },
};

// Trưởng làng không phải vai: là danh hiệu bật trong cài đặt phòng.
export const MAYOR_INFO =
  "👑 Trưởng làng (bật trong cài đặt): đầu Ngày 1 cả làng bầu 1 người (60 giây, hoà thì bốc ngẫu nhiên). Phiếu của Trưởng làng tính x2 khi bỏ phiếu và phán quyết. Khi chết, Trưởng làng chọn người kế nhiệm trong 30 giây; hết giờ thì làng mất Trưởng làng.";

export const WINNER_TEXT: Record<Winner, string> = {
  village: "Phe Dân thắng",
  wolves: "Phe Sói thắng",
  draw: "Hoà",
  tanner: "Kẻ chán đời thắng",
  lovers: "Cặp đôi thắng",
};

// Thứ tự thức dậy ban đêm (1 = đầu tiên), null nếu vai không thức. Lấy từ core để không lệch luật.
export function wakeOrder(role: Role): number | null {
  const i = NIGHT_STEP_ORDER.findIndex((step) => NIGHT_STEP_ROLES[step].includes(role));
  return i < 0 ? null : i + 1;
}

// R-80: tiêu đề pha đêm không nêu tên người. Pha 1 nhiều vai thức cùng lúc nên chỉ ghi chung.
const STEP_TEXT = {
  first: "Các vai đang thức dậy",
  second: "Lượt cuối của đêm",
} as const;

// R-80: chỉ nêu tên vai, KHÔNG nêu tên người (trừ pha biện hộ/phán quyết là thông tin công khai của ngày).
export function phaseTitle(phase: Phase, nameOf: (id: string) => string): string {
  switch (phase.kind) {
    case "reveal":
      return "🃏 Chia vai";
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
    case "election":
      return `👑 Ngày ${phase.day} — Bầu Trưởng làng`;
    case "hunter":
      return `🏹 ${nameOf(phase.hunterId)} — Thợ săn ra tay`;
    case "successor":
      return `👑 ${nameOf(phase.mayorId)} — Chọn Trưởng làng kế nhiệm`;
    case "ended":
      return `🏁 ${WINNER_TEXT[phase.winner]}`;
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

  if (ph.kind === "reveal") return none("Đang chia vai — xem lá bài của bạn. Đêm 1 sắp bắt đầu.");
  if (ph.kind === "ended") return none("Ván đã kết thúc — vai của mọi người đã được lật.");

  // Thợ săn / Trưởng làng vừa chết vẫn được hành động — xét trước khi chặn người chết.
  if (ph.kind === "hunter") {
    if (ph.hunterId !== me) return none(`🏹 ${nameOf(ph.hunterId)} là Thợ săn và đang ngắm bắn…`);
    return {
      hint: "Bạn là Thợ săn — chạm 1 người còn sống để bắn. Hết giờ không chọn = không bắn.",
      buttons: [{ key: "noshoot", label: "Không bắn", action: { type: "HUNTER_SHOOT", playerId: me, targetId: null, now } }],
      myPicks: [],
      cardAction: (id) => (isAlive(id) && id !== me ? { type: "HUNTER_SHOOT", playerId: me, targetId: id, now } : null),
    };
  }
  if (ph.kind === "successor") {
    if (ph.mayorId !== me) return none(`👑 ${nameOf(ph.mayorId)} đang chọn Trưởng làng kế nhiệm…`);
    return {
      hint: "Chạm 1 người còn sống để trao chức Trưởng làng. Hết giờ không chọn = làng mất Trưởng làng.",
      buttons: [],
      myPicks: [],
      cardAction: (id) => (isAlive(id) && id !== me ? { type: "MAYOR_PASS", playerId: me, targetId: id, now } : null),
    };
  }

  if (!view.amAlive) return none("💀 Bạn đã chết — bạn xem được vai của mọi người.");

  if (ph.kind === "night") {
    if (ph.step === "first" && view.myRole === "guard" && view.guard) {
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
    if (ph.step === "first" && isWolfRole(view.myRole) && view.wolfPicks) {
      const mine = view.wolfPicks[me] ?? null;
      const mine2 = view.wolfPicks2?.[me] ?? null;
      const pick = (targetId: string | null, second: boolean): Action => ({ type: "WOLF_PICK", playerId: me, targetId, ...(second ? { second } : {}), now });
      if (!view.doubleBite) {
        return {
          hint: "Chạm một người để cắn. Đồng đội thấy lựa chọn của bạn.",
          buttons: [],
          myPicks: mine ? [mine] : [],
          cardAction: (id) => (isAlive(id) ? pick(id === mine ? null : id, false) : null),
        };
      }
      return {
        hint: "🐾 Sói con đã chết — đêm nay cắn 2 người. Chạm lần lượt 2 mục tiêu (chạm lại để bỏ).",
        buttons: [],
        myPicks: [mine, mine2].filter((x): x is string => x !== null),
        cardAction: (id) => {
          if (id === mine) return pick(null, false);
          if (id === mine2) return pick(null, true);
          if (!isAlive(id)) return null;
          return mine === null ? pick(id, false) : pick(id, true);
        },
      };
    }
    if (ph.step === "first" && view.myRole === "seer" && view.seer) {
      const s = view.seer;
      const lines = s.results.map((r) => `${nameOf(r.targetId)}: ${r.isWolf ? "Là Sói" : "Không phải Sói"}`);
      const picked = s.pick !== null;
      return {
        hint: (picked ? "Bạn đã soi đêm nay. " : "Chạm một người để soi (không đổi được). ") + (lines.length ? `Kết quả: ${lines.join("; ")}` : ""),
        buttons: [],
        myPicks: s.pick ? [s.pick] : [],
        cardAction: (id) => (!picked && isAlive(id) && id !== me ? { type: "SEER_PICK", playerId: me, targetId: id, now } : null),
      };
    }
    if (ph.step === "first" && view.myRole === "cupid" && view.cupid) {
      const picks = view.cupid.picks;
      return {
        hint: `Chạm 2 người để ghép đôi (được chọn chính mình, chạm lại để bỏ). Đã chọn ${picks.length}/2.`,
        buttons: [],
        myPicks: picks,
        cardAction: (id) => (isAlive(id) && (picks.includes(id) || picks.length < 2) ? { type: "CUPID_PICK", playerId: me, targetId: id, now } : null),
      };
    }
    if (ph.step === "second" && view.myRole === "witch" && view.witch) {
      const w = view.witch;
      const bittenIds = [w.bittenId, w.bittenId2].filter((x): x is string => x !== null);
      const bitten = bittenIds.length ? `Đêm nay ${bittenIds.map(nameOf).join(" và ")} bị Sói cắn.` : "Đêm nay không ai bị cắn.";
      const set = (save: boolean, save2: boolean, poison: string | null): Action => ({
        type: "WITCH_SET",
        playerId: me,
        save,
        ...(save2 ? { saveSecond: true } : {}),
        poisonTarget: poison,
        now,
      });
      const buttons: ButtonSpec[] = [
        {
          key: "save",
          label: w.bittenId2 && w.bittenId ? `🧪 Cứu ${nameOf(w.bittenId)}` : `🧪 Cứu (${w.potions.save ? 1 : 0})`,
          pressed: w.save,
          disabled: !w.potions.save || !w.bittenId,
          action: set(!w.save, false, w.poisonTarget),
        },
      ];
      if (w.bittenId2) {
        buttons.push({
          key: "save2",
          label: `🧪 Cứu ${nameOf(w.bittenId2)}`,
          pressed: w.save2,
          disabled: !w.potions.save,
          action: set(false, !w.save2, w.poisonTarget),
        });
      }
      return {
        hint: `${bitten} ${w.potions.poison ? "Chạm một người để dùng bình độc ☠️." : "Bạn đã hết bình độc."}`,
        buttons,
        myPicks: w.poisonTarget ? [w.poisonTarget] : [],
        cardAction: (id) => (w.potions.poison && isAlive(id) ? set(w.save, w.save2, id === w.poisonTarget ? null : id) : null),
      };
    }
    if (ph.step === "second" && view.myRole === "cursed_wolf" && view.curse?.armed && !view.curse.used) {
      const c = view.curse;
      const hint = c.bitten.length
        ? `🩸 Nguyền: chạm người vừa bị cắn (${c.bitten.map(nameOf).join(", ")}) để biến họ thành Sói thay vì chết. Chạm lại để huỷ.`
        : "🩸 Đêm nay không ai bị cắn — nguyền chưa dùng được.";
      return {
        hint,
        buttons: [],
        myPicks: c.target ? [c.target] : [],
        cardAction: (id) => (c.bitten.includes(id) ? { type: "CURSE_SET", playerId: me, targetId: id === c.target ? null : id, now } : null),
      };
    }
    // R-83: mọi người còn sống không có việc thấy đúng một dòng giống nhau.
    return none("🌙 Trời tối — hãy nhắm mắt và chờ trời sáng.");
  }

  // Ban ngày: Sói nguyền có nút kích hoạt riêng ở mọi pha ngày (dùng đêm tới).
  const extra: ButtonSpec[] = [];
  if (view.myRole === "cursed_wolf" && view.curse && !view.curse.used) {
    extra.push({
      key: "curse",
      label: view.curse.armed ? "🩸 Nguyền đã kích hoạt (bấm để huỷ)" : "🩸 Kích hoạt nguyền đêm nay",
      pressed: view.curse.armed,
      action: { type: "ARM_CURSE", playerId: me, now },
    });
  }
  const day = (hint: string, buttons: ButtonSpec[] = []) => none(hint, [...buttons, ...extra]);
  const muted = view.idiotRevealed === me;

  if (ph.kind === "election") {
    const mine = view.votes[me];
    return {
      hint: "Bầu Trưởng làng: chạm người bạn chọn (chạm lại để rút). Hoà thì bốc ngẫu nhiên.",
      buttons: extra,
      myPicks: mine && mine !== "blank" ? [mine] : [],
      cardAction: (id) => (isAlive(id) ? { type: "CAST_VOTE", playerId: me, targetId: id === mine ? null : id, now } : null),
    };
  }

  if (ph.kind === "discussion") {
    const aliveCount = view.players.filter((p) => p.alive).length;
    const need = Math.floor(aliveCount / 2) + 1;
    const on = Object.keys(view.endEarly).length;
    return day("Thảo luận (nói chuyện qua kênh ngoài).", [
      { key: "extend", label: "+60 giây", disabled: view.extendUsed, action: { type: "EXTEND_DISCUSSION", playerId: me, now } },
      { key: "early", label: `Kết thúc sớm (${on}/${need})`, pressed: view.endEarly[me] === true, action: { type: "TOGGLE_END_EARLY", playerId: me, now } },
    ]);
  }

  if (ph.kind === "vote") {
    if (muted) return day("🤪 Bạn đã lộ là Kẻ ngốc — không còn quyền bỏ phiếu.");
    const mine = view.votes[me];
    return {
      hint: "Chạm vào người bạn muốn đưa lên (chạm lại để rút phiếu).",
      buttons: [{ key: "blank", label: "Phiếu trắng", pressed: mine === "blank", action: { type: "CAST_VOTE", playerId: me, targetId: mine === "blank" ? null : "blank", now } }, ...extra],
      myPicks: mine && mine !== "blank" ? [mine] : [],
      cardAction: (id) => (isAlive(id) ? { type: "CAST_VOTE", playerId: me, targetId: id === mine ? null : id, now } : null),
    };
  }

  if (ph.kind === "defense") return day(ph.accusedId === me ? "Bạn đang biện hộ — hãy nói qua kênh ngoài." : `${nameOf(ph.accusedId)} đang biện hộ.`);

  // verdict
  if (ph.accusedId === me) return day("Mọi người đang phán quyết bạn.");
  if (muted) return day("🤪 Bạn đã lộ là Kẻ ngốc — không còn quyền phán quyết.");
  const mine = view.verdicts[me];
  const pick = (choice: "kill" | "spare"): Action => ({ type: "CAST_VERDICT", playerId: me, choice: mine === choice ? null : choice, now });
  return day(`Giết hay Tha ${nameOf(ph.accusedId)}?`, [
    { key: "kill", label: "⚔️ Giết", pressed: mine === "kill", action: pick("kill") },
    { key: "spare", label: "🕊️ Tha", pressed: mine === "spare", action: pick("spare") },
  ]);
}

// Câu chữ nhật ký công khai (state chỉ chứa dữ liệu, client tự dịch — W1).
export function describeLog(view: WerewolfView): string[] {
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  const names = (ids: string[]) => ids.map(nameOf).join(", ");
  return view.log.map((e) => {
    switch (e.kind) {
      case "deaths":
        return e.ids.length ? `Đêm ${e.night}: ${names(e.ids)} đã chết` : `Đêm ${e.night}: không ai chết`;
      case "vote_result":
        return e.accusedId ? `Ngày ${e.day}: ${nameOf(e.accusedId)} bị đưa lên` : `Ngày ${e.day}: không ai bị đưa lên`;
      case "verdict_result": {
        if (e.idiot) return `Ngày ${e.day}: ${nameOf(e.accusedId)} lộ là Kẻ ngốc — không chết nhưng mất quyền bỏ phiếu`;
        const grief = e.grief?.length ? `; ${names(e.grief)} chết theo người yêu` : "";
        return `Ngày ${e.day}: ${nameOf(e.accusedId)} ${e.killed ? "bị treo cổ" : "được tha"}${grief}`;
      }
      case "hunter_shot": {
        if (!e.targetId) return `🏹 ${nameOf(e.hunterId)} (Thợ săn) không bắn`;
        const others = e.ids.filter((id) => id !== e.targetId);
        return `🏹 ${nameOf(e.hunterId)} (Thợ săn) bắn ${nameOf(e.targetId)}${others.length ? `; ${names(others)} chết theo người yêu` : ""}`;
      }
      case "mayor":
        if (e.how === "lost" || !e.mayorId) return "👑 Làng mất Trưởng làng";
        return e.how === "elected" ? `👑 ${nameOf(e.mayorId)} được bầu làm Trưởng làng` : `👑 Chức Trưởng làng trao cho ${nameOf(e.mayorId)}`;
      case "ended":
        return `Ván kết thúc: ${WINNER_TEXT[e.winner]}`;
    }
  });
}
