// Việc 2.2 (vẽ state) + 2.3 (bấm bài → gọi reduce) + 2.4 (hiện đầy đủ stack
// pending, không chỉ đỉnh) + 2.5 (màn hình thiết lập + chơi lại, chế độ
// hotseat). Nhãn tiếng Việt (tên bài, tên vai) chỉ để HIỂN THỊ nên đặt ở đây,
// không đặt trong core/ — core/ không quan tâm chuyện trình bày.

import { cardNameFromId, cardSuitRankFromId, WEAPON_RANGES } from "../core/cards";
import type { CardName } from "../core/cards";
import { getCharacterDefinition } from "../core/characters";
import type { CharacterChoice, GameEvent, GameState, PendingAction, PlayerState, Role, Suit } from "../core/types";
import type { CharacterChoiceView, PendingActionView, PlayerHandView, PlayerView } from "../core/view";
import type { DeadlineInfo } from "../protocol";

// Tầm bắn súng lấy THẲNG từ WEAPON_RANGES (core/cards.ts, cũng là nguồn
// core/distance.ts dùng để tính luật thật) — không tự chép số ra đây, tránh
// lệch nếu core đổi tầm súng sau này. Số +1/-1 của Ống nhắm/Ngựa Mustang thì
// HARDCODE vì bản thân core/distance.ts cũng viết cứng 2 số này (không có
// hằng số export sẵn) — chỉ để HIỂN THỊ, không ảnh hưởng luật thật.
const CARD_LABELS: Record<CardName, string> = {
  bang: "Bang!",
  missed: "Missed!",
  beer: "Bia",
  saloon: "Saloon",
  stagecoach: "Xe ngựa",
  wells_fargo: "Wells Fargo",
  panic: "Panic!",
  cat_balou: "Cat Balou",
  general_store: "Cửa hàng tổng hợp",
  indians: "Người da đỏ!",
  duel: "Đấu tay đôi",
  gatling: "Súng máy Gatling",
  volcanic: `Súng Volcanic (${WEAPON_RANGES.volcanic})`,
  schofield: `Súng Schofield (${WEAPON_RANGES.schofield})`,
  remington: `Súng Remington (${WEAPON_RANGES.remington})`,
  rev_carabine: `Súng Rev. Carabine (${WEAPON_RANGES.rev_carabine})`,
  winchester: `Súng Winchester (${WEAPON_RANGES.winchester})`,
  barrel: "Thùng rượu",
  scope: "Ống nhắm (-1)",
  mustang: "Ngựa Mustang (+1)",
  jail: "Nhà tù",
  dynamite: "Thuốc nổ",
};

// Việc 4.6: mô tả ngắn chức năng từng lá — soạn theo ĐÚNG luật đã cài trong
// reduce.ts (bản tự chỉnh của dự án này, có vài chỗ lệch luật gốc BANG!, vd
// Cat Balou không giới hạn khoảng cách, Beer hiện CHƯA có ngoại lệ "vô tác
// dụng khi chỉ còn 2 người sống"), không phải chép lại luật gốc từ trí nhớ.
// Hiện ở 2 chỗ: thuộc tính `title` (tooltip rê chuột/giữ lâu) trên lá bài lúc
// đang chơi, VÀ đầy đủ ở màn hình "Chú giải lá bài" (renderCardReferenceScreen).
const CARD_DESCRIPTIONS: Record<CardName, string> = {
  bang: "Bắn 1 người trong tầm súng — họ phải đỡ bằng Missed! hoặc mất 1 máu.",
  missed: "Không tự đánh được — chỉ dùng để đỡ khi bị Bang!/Gatling.",
  beer: "Tự hồi 1 máu cho chính mình (không vượt quá máu tối đa).",
  saloon: "Mọi người còn sống hồi 1 máu, kể cả người đánh.",
  stagecoach: "Rút thêm 2 lá từ bộ bài.",
  wells_fargo: "Rút thêm 3 lá từ bộ bài.",
  panic:
    "Cướp 1 lá của người ở khoảng cách 1 — ưu tiên bài úp trên tay (bốc ngẫu nhiên), tay hết bài mới được cướp trang bị trên sân.",
  cat_balou:
    "Bắt 1 người bất kỳ (không giới hạn khoảng cách) bỏ 1 lá — họ tự chọn lá nào trong tay hoặc trên sân, không được từ chối.",
  general_store:
    "Lật số lá bằng số người còn sống, rồi lần lượt từng người (bắt đầu từ người đánh) chọn 1 lá cho tới hết.",
  indians: "Mọi người khác phải bỏ 1 lá Bang! hoặc mất 1 máu.",
  duel: "Thách 1 người đấu tay đôi — lần lượt bỏ Bang!, ai hết bài Bang! trước sẽ mất 1 máu.",
  gatling: "Bắn TẤT CẢ người khác cùng lúc, bất kể khoảng cách — mỗi người đỡ Missed! hoặc mất 1 máu.",
  volcanic: "Trang bị súng, tầm bắn 1. Đánh súng mới sẽ gỡ súng cũ — chỉ giữ được 1 khẩu.",
  schofield: "Trang bị súng, tầm bắn 2. Đánh súng mới sẽ gỡ súng cũ — chỉ giữ được 1 khẩu.",
  remington: "Trang bị súng, tầm bắn 3. Đánh súng mới sẽ gỡ súng cũ — chỉ giữ được 1 khẩu.",
  rev_carabine: "Trang bị súng, tầm bắn 4. Đánh súng mới sẽ gỡ súng cũ — chỉ giữ được 1 khẩu.",
  winchester: "Trang bị súng, tầm bắn 5. Đánh súng mới sẽ gỡ súng cũ — chỉ giữ được 1 khẩu.",
  barrel: "Khi bị Bang! bắn trúng, tự lật 1 lá — ra Cơ thì né hoàn toàn, không tốn Missed!.",
  scope: "Nhìn người khác gần hơn 1 khi mình đánh Bang! — giúp bắn trúng xa hơn.",
  mustang: "Người khác nhìn mình xa hơn 1 — khó bị Bang! của họ bắn trúng hơn.",
  jail: "Gắn lên sân người khác (trừ Cảnh sát trưởng) — đầu lượt họ lật 1 lá: ra Cơ thì thoát, chơi bình thường; không thì mất luôn cả lượt.",
  dynamite:
    "Ai đang cầm, đầu lượt phải lật 1 lá: ra Bích 2-9 thì nổ mất 3 máu rồi bỏ đi; không thì tự chuyển sang người kế tiếp.",
};

// Nhóm lá nâu/xanh CHỈ để trình bày (viền màu + màn hình Chú giải) — chép lại
// thủ công từ BrownCardName/BlueCardName ở core/cards.ts (2 type đó chỉ tồn
// tại lúc biên dịch, không có mảng thật lúc chạy) — sửa core/cards.ts thì nhớ
// sửa cả đây.
const BROWN_CARD_NAMES: readonly CardName[] = [
  "bang", "missed", "beer", "saloon", "stagecoach", "wells_fargo",
  "panic", "cat_balou", "general_store", "indians", "duel", "gatling",
];
const BLUE_CARD_NAMES: readonly CardName[] = [
  "volcanic", "schofield", "remington", "rev_carabine", "winchester",
  "barrel", "scope", "mustang", "jail", "dynamite",
];

// Việc bổ sung sau 4.6: viền màu phân biệt loại lá — nâu (đánh từ tay), xanh
// dương (trang bị), xanh lá (nhân vật — xem CHARACTER_PREVIEW bên dưới).
function cardTypeModifierClass(name: CardName): string {
  return BLUE_CARD_NAMES.includes(name) ? "card-box--blue" : "card-box--brown";
}

// Việc 4.6: chưa có ảnh thật nào — quy ước đường dẫn TRƯỚC, ảnh thêm dần vào
// public/sprites/<tên lá>.png sau (đúng tinh thần LO-TRINH.md: "có ảnh tới đâu
// gắn tới đó"). Ảnh thiếu thì <img> bắn sự kiện "error", appendCardVisual() ẩn
// nó đi — quay về hiển thị CHỈ chữ như trước việc 4.6, không vỡ giao diện.
function cardImageUrl(name: CardName): string {
  return `/sprites/${name}.png`;
}

// Việc bổ sung sau 4.6: nhấn giữ 1 lá bài để xem mô tả chức năng.
// - Máy tính: gán `title` — trình duyệt tự hiện tooltip khi rê chuột qua,
//   không cần code gì thêm.
// - Thiết bị cảm ứng KHÔNG có "rê chuột", `title` gần như vô dụng ở đó — phải
//   tự bắt "nhấn giữ" (long-press) bằng touch event: giữ đủ LONG_PRESS_MS hiện
//   1 popup nhỏ cạnh lá, nhả tay hoặc trượt ngón tay thì tắt. `touchend` gọi
//   preventDefault() để CHẶN LUÔN sự kiện "click" giả lập trình duyệt tự sinh
//   ra sau đó — không chặn thì nhả tay sau khi xem xong sẽ vô tình bấm luôn lá
//   (đánh bài/tick chọn bỏ...), không phải điều người dùng muốn.
const LONG_PRESS_MS = 500;

function attachDescriptionReveal(el: HTMLElement, description: string | undefined): void {
  if (!description) return;
  el.title = description;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let popup: HTMLElement | null = null;
  let triggered = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const hidePopup = () => {
    popup?.remove();
    popup = null;
  };
  const showPopup = () => {
    triggered = true;
    popup = document.createElement("div");
    popup.className = "card-description-popup";
    popup.textContent = description;
    document.body.appendChild(popup);
    const rect = el.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;
  };

  el.addEventListener(
    "touchstart",
    () => {
      triggered = false;
      clearTimer();
      timer = setTimeout(showPopup, LONG_PRESS_MS);
    },
    { passive: true }
  );
  el.addEventListener("touchmove", () => {
    clearTimer();
    hidePopup();
  });
  el.addEventListener(
    "touchend",
    (event) => {
      clearTimer();
      if (triggered) {
        event.preventDefault();
        hidePopup();
      }
    },
    { passive: false }
  );
  el.addEventListener("touchcancel", () => {
    clearTimer();
    hidePopup();
  });
}

// Dựng phần "thân" dùng chung cho mọi ô lá bài/nhân vật: ảnh ở trên, tên chữ
// RIÊNG bên dưới (không đè lên ảnh — dễ đọc trên mọi màu nền ảnh, và ảnh thiếu
// thì tên vẫn luôn hiện đúng chỗ, không lệch). Dùng được cho cả <button> (bấm
// được) lẫn <span>/<div> (chỉ để xem). `description` bỏ trống thì không gắn
// tooltip/nhấn-giữ gì cả (dùng ở màn hình Chú giải, nơi mô tả đã hiện thành
// chữ riêng ngay bên dưới, gắn thêm sẽ thừa).
function appendCardVisual(el: HTMLElement, imageUrl: string, label: string, description?: string): void {
  const imageWrap = document.createElement("span");
  imageWrap.className = "card-box__image-wrap";
  const img = document.createElement("img");
  img.className = "card-box__image";
  img.alt = "";
  img.src = imageUrl;
  img.addEventListener("error", () => {
    img.style.display = "none"; // thiếu ảnh -> ẩn đi, chỉ còn nền xám + tên chữ
  });
  imageWrap.appendChild(img);
  el.appendChild(imageWrap);

  const nameEl = document.createElement("span");
  nameEl.className = "card-box__name";
  nameEl.textContent = label;
  el.appendChild(nameEl);

  attachDescriptionReveal(el, description);
}

// Lá BẤM ĐƯỢC (đánh ra, chọn để bỏ, chọn ở Cửa hàng tổng hợp...). `modifierClass`
// tuỳ ngữ cảnh: "card-box--armed" (đang cầm lên chờ chọn mục tiêu) hoặc
// "card-box--checked" (đã tick chọn để bỏ bài thừa cuối lượt).
function cardButton(cardId: string, onClick: () => void, modifierClass?: string): HTMLButtonElement {
  const name = cardNameFromId(cardId);
  const el = document.createElement("button");
  el.type = "button";
  el.className = ["card-box", cardTypeModifierClass(name), modifierClass].filter(Boolean).join(" ");
  appendCardVisual(el, cardImageUrl(name), cardLabel(cardId), CARD_DESCRIPTIONS[name]);
  el.addEventListener("click", onClick);
  return el;
}

// Lá CHỈ ĐỂ XEM (không bấm được — không tới lượt, không phải lá cần phản hồi...).
function cardChip(cardId: string): HTMLSpanElement {
  const name = cardNameFromId(cardId);
  const el = document.createElement("span");
  el.className = `card-box card-box--inert ${cardTypeModifierClass(name)}`;
  appendCardVisual(el, cardImageUrl(name), cardLabel(cardId), CARD_DESCRIPTIONS[name]);
  return el;
}

// Giai đoạn 5, cơ chế "phát 2 lá nhân vật, chọn giữ 1" — mô tả ngắn chức năng
// từng nhân vật, soạn theo ĐÚNG hook đã cài trong core/characters.ts (đọc lại
// file đó trước khi viết, không chép nguyên văn NHAN-VAT-BANG-CO-BAN.txt vì
// vài chỗ mô tả gốc là house rule/quyết định lúc code, vd Kit Carlson bỏ lá
// thứ 3 vào chồng bỏ thay vì trả lại đỉnh bộ bài). Dùng chung `title`/nhấn giữ
// giống CARD_DESCRIPTIONS (attachDescriptionReveal() trong appendCardVisual()).
const CHARACTER_DESCRIPTIONS: Record<string, string> = {
  bart_cassidy: "Mỗi lần mất máu (bất kỳ nguồn nào), rút thêm số lá bằng đúng số máu vừa mất.",
  el_gringo: "Mỗi lần mất máu DO lá bài người khác đánh (không tính Thuốc nổ), cướp ngẫu nhiên từng lá trên tay người đó.",
  jourdonnais: "Luôn coi như có sẵn 1 Thùng rượu (né Bang! nếu lật ra Cơ) — cộng dồn được với Thùng rượu thật nếu có.",
  black_jack: "Rút bài đầu lượt: lật ngửa lá thứ 2 cho mọi người xem — ra Cơ/Rô thì rút thêm lá thứ 3.",
  paul_regret: "Luôn coi như có sẵn 1 Ngựa Mustang — người khác nhìn mình xa hơn 1.",
  rose_doolan: "Luôn coi như có sẵn 1 Ống nhắm — mình nhìn người khác gần hơn 1.",
  vulture_sam: "Mỗi khi có người bị loại, nhận hết bài của họ (tay + trang bị) về tay mình.",
  willy_the_kid: "Đánh bao nhiêu lá Bang! mỗi lượt cũng được, không cần súng Volcanic.",
  slab_the_killer: "Người bị Bang!/Gatling của mình bắn cần đủ 2 lá Missed! mới né được.",
  suzy_lafayette: "Ngay khi tay hết sạch bài, tự động rút bù 1 lá.",
  pedro_ramirez: "Đầu lượt được chọn: lấy lá đầu tiên từ đỉnh chồng bài bỏ, hoặc rút bộ bài như thường.",
  lucky_duke: "Mọi lần lật bài kiểm tra (draw!) đều lật thêm 1 lá, lấy kết quả có lợi hơn.",
  jesse_jones: "Đầu lượt được chọn: lấy lá đầu tiên từ tay 1 người khác, hoặc rút bộ bài như thường.",
  kit_carlson: "Đầu lượt xem riêng 3 lá trên cùng bộ bài, chọn giữ 2 bỏ 1 (lá bỏ vào chồng bài bỏ).",
  calamity_janet: "Lá Bang! và Missed! trên tay dùng thay thế cho nhau được (tự chọn lúc cần).",
  sid_ketchum: "Bất cứ lúc nào, bỏ 2 lá trên tay để hồi 1 máu — dùng được nhiều lần.",
};

function characterImageUrl(characterId: string): string {
  return `/sprites/characters/${characterId}.png`;
}

function characterLabel(characterId: string): string {
  return getCharacterDefinition(characterId)?.name ?? characterId;
}

// Lá nhân vật BẤM ĐƯỢC — dùng lúc đang chọn giữ 1 trong 2 lá được phát.
function characterButton(characterId: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "card-box card-box--character";
  appendCardVisual(el, characterImageUrl(characterId), characterLabel(characterId), CHARACTER_DESCRIPTIONS[characterId]);
  el.addEventListener("click", onClick);
  return el;
}

// Lá nhân vật CHỈ ĐỂ XEM — nhân vật ĐÃ chọn xong (của mình hoặc người khác,
// công khai ngay khi chọn — xem CharacterChoice ở types.ts).
function characterChip(characterId: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "card-box card-box--inert card-box--character";
  appendCardVisual(el, characterImageUrl(characterId), characterLabel(characterId), CHARACTER_DESCRIPTIONS[characterId]);
  return el;
}

const SUIT_LABELS: Record<Suit, string> = {
  spades: "Bích",
  hearts: "Cơ",
  diamonds: "Rô",
  clubs: "Chuồn",
};

const ROLE_LABELS: Record<Role, string> = {
  sheriff: "Cảnh sát trưởng",
  deputy: "Phó cảnh sát trưởng",
  outlaw: "Tội phạm",
  renegade: "Kẻ phản bội",
};

// Thắng thua theo PHE (sheriff_deputy gộp 2 vai), nên tách bảng nhãn riêng
// khỏi ROLE_LABELS (theo từng người) ở trên.
const WINNER_LABELS: Record<NonNullable<GameState["winner"]>, string> = {
  sheriff_deputy: "Cảnh sát trưởng + Phó cảnh sát trưởng",
  outlaw: "Tội phạm",
  renegade: "Kẻ phản bội",
};

const TURN_PHASE_LABELS: Record<GameState["turnPhase"], string> = {
  draw: "rút bài",
  play: "đánh bài",
  discard: "bỏ bài thừa",
};

function cardLabel(cardId: string): string {
  return CARD_LABELS[cardNameFromId(cardId)];
}

// Nhãn ĐẦY ĐỦ kèm chất/số (vd "Bang! (Cơ 5)") — dùng cho lá bài vừa lật khi
// draw! (Barrel/Jail/Dynamite...), vì lúc đó chất/số mới là thứ quyết định
// khớp hay không, không chỉ tên bài. Bài trên tay/sân dùng cardLabel() (chỉ
// tên) là đủ, không cần chất/số ở đó.
function cardFaceLabel(cardId: string): string {
  const { suit, rank } = cardSuitRankFromId(cardId);
  return `${cardLabel(cardId)} (${SUIT_LABELS[suit]} ${rank})`;
}

// Thông báo TẠM THỜI báo cho TẤT CẢ mọi người biết lá vừa lật khi draw!
// (Barrel/Jail/Dynamite...) — yêu cầu thiết kế: check bài phải công khai, ai
// cũng phải thấy đúng lá vừa lật, không chỉ suy ra được từ đỉnh chồng bỏ.
// null = chưa có lần lật nào gần đây (hoặc hành động vừa rồi không phải lật
// bài kiểm tra) — main.ts tính lại giá trị này sau MỖI lần dispatch.
export type DrawCheckNotice = { playerName: string; cardId: string; matched: boolean } | null;

function renderDrawCheckNotice(container: HTMLElement, notice: DrawCheckNotice): void {
  if (!notice) return;
  const el = document.createElement("p");
  el.className = "draw-check-notice";
  el.textContent =
    `${notice.playerName} vừa lật bài kiểm tra: ${cardFaceLabel(notice.cardId)} — ` +
    (notice.matched ? "KHỚP" : "không khớp");
  container.appendChild(el);
}

// Việc 4.2: nhật ký ván đấu. Mỗi GameEvent do reduce() trả về được dịch
// thành 1 dòng tiếng Việt ngay lúc nhận (main.ts gọi hàm này rồi LƯU CHUỖI
// KẾT QUẢ, không lưu lại GameEvent thô) — vì nameOf() cần state/view TẠI THỜI
// ĐIỂM đó, không tiện tính lại mỗi lần vẽ màn hình.
export function describeEvent(event: GameEvent, nameOf: (id: string) => string): string {
  switch (event.type) {
    case "CARDS_DRAWN":
      return `${nameOf(event.playerId)} rút ${event.count} lá`;
    case "TURN_ENDED":
      return `${nameOf(event.playerId)} kết thúc lượt`;
    case "CARDS_DISCARDED":
      return `${nameOf(event.playerId)} bỏ ${event.cardIds.length} lá thừa`;
    case "CARD_PLAYED":
      return (
        `${nameOf(event.playerId)} đánh ${cardLabel(event.cardId)}` +
        (event.targetId ? ` nhắm vào ${nameOf(event.targetId)}` : "")
      );
    case "MISSED_PLAYED":
      return `${nameOf(event.playerId)} đỡ bằng Missed!`;
    case "BANG_DISCARDED":
      return `${nameOf(event.playerId)} bỏ 1 lá Bang! để đỡ`;
    case "DAMAGE_DEALT":
      return `${nameOf(event.playerId)} mất ${event.amount} máu`;
    case "HP_RESTORED":
      return `${nameOf(event.playerId)} hồi ${event.amount} máu`;
    case "STORE_REVEALED":
      return `Cửa hàng tổng hợp lật ${event.cardIds.length} lá`;
    case "STORE_CARD_TAKEN":
      return `${nameOf(event.playerId)} lấy ${cardLabel(event.cardId)} từ Cửa hàng tổng hợp`;
    case "CARD_STOLEN":
      return `${nameOf(event.playerId)} cướp ${cardLabel(event.cardId)} của ${nameOf(event.fromPlayerId)}`;
    case "CARD_FORCE_DISCARDED":
      return `${nameOf(event.byPlayerId)} bắt ${nameOf(event.playerId)} bỏ ${cardLabel(event.cardId)}`;
    case "DRAW_CHECK_RESOLVED":
      return (
        `${nameOf(event.playerId)} lật bài kiểm tra: ${cardFaceLabel(event.cardId)} — ` +
        (event.matched ? "KHỚP" : "không khớp")
      );
    case "WEAPON_REPLACED":
      return `${nameOf(event.playerId)} đổi súng, bỏ ${cardLabel(event.oldCardId)}`;
    case "BARREL_DODGED":
      return `${nameOf(event.playerId)} né đòn nhờ Thùng rượu`;
    case "DYNAMITE_EXPLODED":
      return `Thuốc nổ phát nổ ở ${nameOf(event.playerId)}, mất ${event.amount} máu`;
    case "DYNAMITE_PASSED":
      return `Thuốc nổ không nổ ở ${nameOf(event.playerId)}, chuyền sang người kế tiếp`;
    case "JAIL_ESCAPED":
      return `${nameOf(event.playerId)} thoát khỏi Nhà tù`;
    case "JAIL_SKIPPED_TURN":
      return `${nameOf(event.playerId)} bị giam trong Nhà tù, mất lượt`;
    case "BLACK_JACK_REVEALED":
      return `${nameOf(event.playerId)} (Black Jack) lật ngửa lá thứ 2 lúc rút bài: ${cardFaceLabel(event.cardId)}`;
    case "LUCKY_DUKE_EXTRA_DRAW":
      return `${nameOf(event.playerId)} (Lucky Duke) lật thêm 1 lá khi draw!: ${cardFaceLabel(event.cardId)}`;
    case "KIT_CARLSON_DISCARDED":
      return `${nameOf(event.playerId)} (Kit Carlson) bỏ ${cardFaceLabel(event.cardId)} trong 3 lá vừa xem`;
    case "SID_KETCHUM_HEALED":
      return `${nameOf(event.playerId)} (Sid Ketchum) bỏ 2 lá để hồi ${event.amount} máu`;
    case "CHARACTER_CHOSEN":
      return `${nameOf(event.playerId)} chọn nhân vật`;
    case "PLAYER_ELIMINATED":
      return event.killedBy
        ? `${nameOf(event.playerId)} bị ${nameOf(event.killedBy)} hạ gục`
        : `${nameOf(event.playerId)} đã chết`;
    case "OUTLAW_BOUNTY_DRAWN":
      return `${nameOf(event.playerId)} được thưởng vì kết liễu Tội phạm, rút ${event.count} lá`;
    case "SHERIFF_KILLED_DEPUTY_PENALTY":
      return `${nameOf(event.playerId)} giết nhầm Phó cảnh sát trưởng, bị phạt mất hết bài`;
    case "GAME_ENDED":
      return `VÁN KẾT THÚC — phe thắng: ${WINNER_LABELS[event.winner]}`;
  }
}

// Danh sách các dòng nhật ký đã dịch sẵn (mới nhất ở ĐẦU mảng — xem main.ts).
// Không tự tính lại từ GameEvent mỗi lần vẽ, chỉ vẽ chuỗi có sẵn.
function renderLog(container: HTMLElement, log: string[]): void {
  if (log.length === 0) return;
  const panel = document.createElement("div");
  panel.className = "panel log";
  const heading = document.createElement("p");
  heading.className = "pending-heading";
  heading.textContent = "Nhật ký ván đấu";
  panel.appendChild(heading);
  const list = document.createElement("ul");
  list.className = "log-list";
  for (const line of log) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
  panel.appendChild(list);
  container.appendChild(panel);
}

// Việc 4.1: đồng hồ đếm ngược lượt (chỉ chơi qua mạng — xem room.ts). Số giây
// còn lại tính THẲNG từ `expiresAt` (mốc thời gian server gửi) trừ đi
// `Date.now()` lúc VẼ — main.ts tự vẽ lại mỗi giây bằng setInterval của
// chính client (không phải Durable Object) để số này tự chạy lùi.
const DEADLINE_KIND_LABELS: Record<DeadlineInfo["kind"], string> = {
  play: "đang đánh bài",
  reactive: "cần phản hồi",
  discard: "đang bỏ bài thừa",
  // Giai đoạn 5, chọn nhân vật — không dùng tới nhãn này thật sự (renderCountdown()
  // rẽ nhánh riêng theo playerId === null, xem bên dưới), chỉ khai báo cho đủ
  // key để qua kiểm tra kiểu Record<DeadlineInfo["kind"], string>.
  character_selection: "đang chọn nhân vật",
};

function renderCountdown(
  container: HTMLElement,
  deadline: DeadlineInfo | null,
  players: { id: string; name: string }[]
): void {
  if (!deadline) return;
  const secondsLeft = Math.max(0, Math.ceil((deadline.expiresAt - Date.now()) / 1000));

  const el = document.createElement("p");
  el.className = "countdown" + (secondsLeft <= 10 ? " countdown--urgent" : "");
  // Giai đoạn 5, chọn nhân vật — đồng hồ CHUNG cho cả bàn, không gắn 1 người
  // cụ thể (playerId luôn null ở kind "character_selection", xem protocol.ts).
  el.textContent =
    deadline.playerId === null
      ? `⏱ Còn ${secondsLeft}s để mọi người chọn nhân vật`
      : `⏱ Còn ${secondsLeft}s — ${players.find((p) => p.id === deadline.playerId)?.name ?? "?"} ${DEADLINE_KIND_LABELS[deadline.kind]}`;
  container.appendChild(el);
}

// ----- Trạng thái "đang chọn" tạm thời, CHỈ tồn tại ở client (không phải
// GameState) — vd đã bấm 1 lá Bang!, đang chờ bấm chọn mục tiêu. main.ts giữ
// biến này, ui.ts chỉ đọc để biết vẽ gì.

export type Selection =
  | { step: "idle" }
  | { step: "picking-target"; cardId: string; cardName: CardName }
  | { step: "picking-panic-equipment"; cardId: string; targetId: string }
  | { step: "picking-cat-balou-zone"; cardId: string; targetId: string };

export interface UiHandlers {
  onDrawCards(): void;
  onEndTurn(): void;
  onToggleDiscardCard(cardId: string): void;
  onConfirmDiscard(): void;
  onHandCardClick(cardId: string): void;
  onEquipmentClick(ownerId: string, cardId: string): void;
  onPlayerClick(targetId: string): void;
  onStoreOptionClick(cardId: string): void;
  onZoneClick(zone: "hand" | "equipment"): void;
  onRespondTakeConsequence(): void;
  onCancelSelection(): void;
  onPlayAgain(): void;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

// Danh sách tên bài mà người ĐANG PHẢN HỒI (đứng đầu pending) có thể bấm để
// đáp lại — mỗi kind chỉ chấp nhận đúng 1 loại bài (xem PendingAction ở
// types.ts). Chỉ để quyết định bấm được lá nào, KHÔNG thay cho việc reduce()
// tự kiểm tra lại — bấm sai/không hợp lệ vẫn báo lỗi bình thường.
function respondableCardName(pendingKind: string): CardName | null {
  switch (pendingKind) {
    case "NEED_MISSED":
      return "missed";
    case "NEED_DISCARD_BANG":
    case "NEED_DUEL_RESPONSE":
      return "bang";
    default:
      return null;
  }
}

function renderHandSection(
  container: HTMLElement,
  state: GameState,
  player: PlayerState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  const { selection, discardSelection } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "cards";

  const top = state.pending[state.pending.length - 1];
  const isCurrentTurnToPlay =
    state.pending.length === 0 &&
    state.turnPhase === "play" &&
    state.players[state.currentPlayerIndex].id === player.id;
  const isDiscarding =
    state.pending.length === 0 &&
    state.turnPhase === "discard" &&
    state.players[state.currentPlayerIndex].id === player.id;
  const isResponding = top !== undefined && top.player === player.id;
  const respondableName = isResponding ? respondableCardName(top.kind) : null;
  const isDiscardFromHand = isResponding && top.kind === "NEED_DISCARD_FROM_ZONE" && top.zone === "hand";

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      wrapper.appendChild(
        cardButton(cardId, () => handlers.onToggleDiscardCard(cardId), selected ? "card-box--checked" : undefined)
      );
      continue;
    }

    if (isDiscardFromHand) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      continue;
    }

    if (respondableName !== null) {
      if (name === respondableName) {
        wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      } else {
        wrapper.appendChild(cardChip(cardId));
      }
      continue;
    }

    if (isCurrentTurnToPlay && name !== "missed") {
      const armed = selection.step === "picking-target" && selection.cardId === cardId;
      wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId), armed ? "card-box--armed" : undefined));
      continue;
    }

    wrapper.appendChild(cardChip(cardId));
  }

  container.appendChild(wrapper);
}

function renderEquipmentSection(
  container: HTMLElement,
  state: GameState,
  player: PlayerState,
  selection: Selection,
  handlers: UiHandlers
): void {
  const wrapper = document.createElement("div");
  wrapper.className = "cards";

  const top = state.pending[state.pending.length - 1];
  const isDiscardFromEquipment =
    top !== undefined && top.player === player.id && top.kind === "NEED_DISCARD_FROM_ZONE" && top.zone === "equipment";
  const isPickingPanicTarget = selection.step === "picking-panic-equipment" && selection.targetId === player.id;

  for (const cardId of player.equipment) {
    const isDynamite = cardNameFromId(cardId) === "dynamite";

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId)));
      continue;
    }

    wrapper.appendChild(cardChip(cardId));
  }

  container.appendChild(wrapper);
}

function renderPlayer(
  state: GameState,
  player: PlayerState,
  index: number,
  options: RenderOptions,
  handlers: UiHandlers
): HTMLElement {
  const { selection } = options;
  const el = document.createElement("article");
  el.className = "player";
  if (index === state.currentPlayerIndex) el.classList.add("player--current");
  if (!player.alive) el.classList.add("player--dead");

  const heading = document.createElement("h3");
  heading.textContent = player.name + (index === state.currentPlayerIndex ? " ← đang tới lượt" : "");
  el.appendChild(heading);

  const roleText = player.role ? ROLE_LABELS[player.role] : "(chưa chia vai)";
  const roleAndHp = document.createElement("p");
  roleAndHp.textContent =
    `${roleText} · Máu: ${player.hp}/${player.maxHp} · ${player.alive ? "Còn sống" : "Đã chết"}`;
  el.appendChild(roleAndHp);

  const handLabel = document.createElement("p");
  handLabel.textContent = `Bài trên tay (${player.hand.length}):`;
  el.appendChild(handLabel);
  renderHandSection(el, state, player, options, handlers);

  const equipmentLabel = document.createElement("p");
  equipmentLabel.textContent = "Trang bị:";
  el.appendChild(equipmentLabel);
  renderEquipmentSection(el, state, player, selection, handlers);

  // Chọn mục tiêu: chỉ hiện nút này cho người KHÁC người đang cầm bài, và chỉ
  // khi đang ở bước "picking-target".
  if (selection.step === "picking-target" && player.alive) {
    const acting = state.players[state.currentPlayerIndex];
    if (player.id !== acting.id) {
      el.appendChild(button("Chọn làm mục tiêu", () => handlers.onPlayerClick(player.id)));
    }
  }

  // Cat Balou: sau khi chọn xong mục tiêu, hỏi bỏ tay hay bỏ sân — chỉ hỏi
  // cho ĐÚNG người vừa được chọn, và chỉ hiện lựa chọn nào còn bài để bỏ.
  if (selection.step === "picking-cat-balou-zone" && selection.targetId === player.id) {
    const zoneWrapper = document.createElement("div");
    zoneWrapper.className = "cards";
    if (player.hand.length > 0) {
      zoneWrapper.appendChild(button("Bắt bỏ bài trên tay", () => handlers.onZoneClick("hand")));
    }
    if (player.equipment.some((id) => cardNameFromId(id) !== "dynamite")) {
      zoneWrapper.appendChild(button("Bắt bỏ bài trên sân", () => handlers.onZoneClick("equipment")));
    }
    el.appendChild(zoneWrapper);
  }

  return el;
}

// Mô tả ngắn gọn 1 mục pending BẤT KỲ trong stack (không chỉ đỉnh) — dùng để
// vẽ cả stack ở renderPendingPanel(), không nhắc "đang chờ" (chữ đó tuỳ vị trí
// trong stack: đỉnh thì đang chờ THẬT, phía dưới thì "sắp tới" — thêm ở nơi gọi).
function pendingDescription(state: GameState, item: PendingAction): string {
  const player = state.players.find((p) => p.id === item.player)!.name;

  switch (item.kind) {
    case "NEED_MISSED":
      return `${player} đỡ Bang! bằng Missed! (hoặc chịu mất máu)`;
    case "NEED_DISCARD_BANG":
      return `${player} bỏ 1 lá Bang! (hoặc chịu mất máu)`;
    case "NEED_DUEL_RESPONSE":
      return `${player} bỏ 1 lá Bang! trong Đấu tay đôi (hoặc chịu mất máu)`;
    case "NEED_PICK_STORE_CARD":
      return `${player} chọn 1 lá từ Cửa hàng tổng hợp`;
    case "NEED_DISCARD_FROM_ZONE":
      return `${player} chọn 1 lá để bỏ (${item.zone === "hand" ? "trên tay" : "trên sân"})`;
    case "NEED_DRAW_CHECK":
      return `${player} lật bài kiểm tra (draw!)`;
    case "NEED_PICK_DRAW_SOURCE":
      return `${player} chọn lấy lá trên cùng chồng bỏ hay rút bộ bài`;
    case "NEED_PICK_DRAW_TARGET":
      return `${player} chọn rút bộ bài hay lấy 1 lá từ tay người khác`;
    case "NEED_GIVE_CARD_TO_PLAYER":
      return `${player} chọn 1 lá của mình để đưa`;
    case "NEED_PICK_KEPT_CARDS":
      return `${player} xem 3 lá đầu bộ bài, chọn giữ 2 bỏ 1`;
    default: {
      const neverKind: never = item;
      throw new Error(`Chưa biết mô tả cho pending: ${JSON.stringify(neverKind)}`);
    }
  }
}

// Vẽ TOÀN BỘ stack pending (việc 2.4), không chỉ đỉnh — mục 5 file luật: "Việc
// đang chờ là mảng dùng như stack, luôn xử lý phần tử CUỐI cùng". Đỉnh (phần
// tử cuối mảng) là việc đang chờ THẬT SỰ, có nút bấm phản hồi; các mục còn lại
// chỉ để NGƯỜI CHƠI BIẾT trước việc gì sẽ tới, không bấm được (bấm sai thứ tự
// stack là sai luật — xem mục 5 CLAUDE.md).
function renderPendingPanel(container: HTMLElement, state: GameState, handlers: UiHandlers): void {
  if (state.pending.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "panel panel--pending";

  const heading = document.createElement("p");
  heading.className = "pending-heading";
  heading.textContent =
    state.pending.length > 1
      ? `Đang có ${state.pending.length} việc chờ xử lý (việc mới phát sinh luôn xử lý trước):`
      : "Đang chờ xử lý:";
  panel.appendChild(heading);

  const list = document.createElement("ol");
  list.className = "pending-list";
  // Duyệt từ ĐỈNH (phần tử cuối mảng) xuống ĐÁY — đúng thứ tự sẽ được xử lý.
  for (let i = state.pending.length - 1; i >= 0; i--) {
    const item = state.pending[i];
    const isTop = i === state.pending.length - 1;
    const li = document.createElement("li");
    li.className = isTop ? "pending-item pending-item--current" : "pending-item";
    li.textContent = isTop
      ? `Đang chờ: ${pendingDescription(state, item)}`
      : `Sắp tới: ${pendingDescription(state, item)}`;
    list.appendChild(li);
  }
  panel.appendChild(list);

  // Nút phản hồi CHỈ áp dụng cho đỉnh stack — các mục "sắp tới" không có nút,
  // vì chưa tới lượt xử lý (phải giải quyết xong đỉnh trước).
  const top = state.pending[state.pending.length - 1];
  if (top.kind === "NEED_PICK_STORE_CARD") {
    const wrapper = document.createElement("div");
    wrapper.className = "cards";
    for (const cardId of top.options) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onStoreOptionClick(cardId)));
    }
    panel.appendChild(wrapper);
  } else if (top.kind === "NEED_DRAW_CHECK") {
    panel.appendChild(button("Lật bài", () => handlers.onRespondTakeConsequence()));
  } else if (top.kind === "NEED_MISSED" || top.kind === "NEED_DISCARD_BANG" || top.kind === "NEED_DUEL_RESPONSE") {
    panel.appendChild(button("Chịu mất máu (không đỡ)", () => handlers.onRespondTakeConsequence()));
  }

  container.appendChild(panel);
}

function renderPhaseActions(
  container: HTMLElement,
  state: GameState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  if (state.pending.length > 0 || state.winner) return;

  const panel = document.createElement("div");
  panel.className = "panel";

  if (state.turnPhase === "draw") {
    panel.appendChild(button("Rút bài", () => handlers.onDrawCards()));
  } else if (state.turnPhase === "discard") {
    const player = state.players[state.currentPlayerIndex];
    const excess = player.hand.length - player.hp;
    const selectedCount = options.discardSelection.length;
    const info = document.createElement("p");
    info.textContent = `Cần bỏ ${excess} lá — đã chọn ${selectedCount}`;
    panel.appendChild(info);
    const confirmBtn = button("Xác nhận bỏ bài", () => handlers.onConfirmDiscard());
    confirmBtn.disabled = selectedCount !== excess;
    panel.appendChild(confirmBtn);
  } else {
    panel.appendChild(button("Kết thúc lượt", () => handlers.onEndTurn()));
  }

  container.appendChild(panel);
}

// Giai đoạn 5, cơ chế "phát 2 lá nhân vật, chọn giữ 1" (hotseat) — hiện ra
// TRƯỚC renderApp() khi state.characterSelection còn khác null (xem main.ts).
// Hotseat vốn KHÔNG có khái niệm "ẩn thông tin với người khác" (dùng thẳng
// GameState đầy đủ, tin tưởng mọi người cùng ngồi 1 máy — xem ghi chú việc
// 3.10) nên hiện LUÔN cả 2 lá của MỌI người cùng lúc, ai xong trước bấm
// trước, không cần đúng thứ tự (đúng khớp characterSelection là 1 MẢNG độc
// lập, không phải ngăn xếp — xem CharacterChoice ở types.ts).
export interface CharacterSelectionHandlers {
  onChooseCharacter(playerId: string, characterId: string): void;
}

export function renderCharacterSelectionScreen(
  container: HTMLElement,
  players: PlayerState[],
  characterSelection: CharacterChoice[],
  handlers: CharacterSelectionHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chọn nhân vật";
  container.appendChild(heading);

  const rule = document.createElement("p");
  rule.textContent =
    "Mỗi người xem 2 lá nhân vật riêng của mình rồi chọn giữ 1 lá — bấm được theo bất kỳ thứ tự nào, không cần chờ ai.";
  container.appendChild(rule);

  for (const choice of characterSelection) {
    const playerName = players.find((p) => p.id === choice.playerId)?.name ?? choice.playerId;
    const section = document.createElement("div");
    section.className = "panel";

    const nameEl = document.createElement("h3");
    section.appendChild(nameEl);

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    if (choice.chosen) {
      nameEl.textContent = `${playerName} — đã chọn`;
      cardsEl.appendChild(characterChip(choice.chosen));
    } else {
      nameEl.textContent = `${playerName} — chọn 1 trong 2 lá`;
      for (const characterId of choice.options) {
        cardsEl.appendChild(characterButton(characterId, () => handlers.onChooseCharacter(choice.playerId, characterId)));
      }
    }
    section.appendChild(cardsEl);

    container.appendChild(section);
  }
}

export interface RenderOptions {
  selection: Selection;
  error: string | null;
  discardSelection: string[]; // các cardId đã chọn để bỏ, chỉ có ý nghĩa khi turnPhase === "discard"
  lastDrawCheck: DrawCheckNotice;
  log: string[]; // việc 4.2: nhật ký ván đấu, mới nhất ở đầu mảng
}

export function renderApp(
  container: HTMLElement,
  state: GameState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  container.replaceChildren();

  if (options.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = options.error;
    container.appendChild(errorEl);
  }

  const summary = document.createElement("p");
  summary.className = "summary";
  const discardTop = state.discardPile[state.discardPile.length - 1];
  summary.textContent =
    `Giai đoạn lượt: ${TURN_PHASE_LABELS[state.turnPhase]} · ` +
    `Bộ bài còn ${state.deck.length} lá · Chồng bỏ ${state.discardPile.length} lá` +
    (discardTop ? ` (mặt trên: ${cardFaceLabel(discardTop)})` : "") +
    (state.winner ? ` · VÁN KẾT THÚC — phe thắng: ${WINNER_LABELS[state.winner]}` : "");
  container.appendChild(summary);

  renderDrawCheckNotice(container, options.lastDrawCheck);

  if (state.winner) {
    const panel = document.createElement("div");
    panel.className = "panel panel--selection";
    panel.appendChild(button("Chơi ván mới", () => handlers.onPlayAgain()));
    container.appendChild(panel);
  }

  if (options.selection.step !== "idle") {
    const hint = document.createElement("div");
    hint.className = "panel panel--selection";
    hint.appendChild(document.createTextNode("Đang chọn mục tiêu... "));
    hint.appendChild(button("Huỷ", () => handlers.onCancelSelection()));
    container.appendChild(hint);
  }

  renderPendingPanel(container, state, handlers);
  renderPhaseActions(container, state, options, handlers);

  const playersEl = document.createElement("div");
  playersEl.className = "players";
  for (const [index, player] of state.players.entries()) {
    playersEl.appendChild(renderPlayer(state, player, index, options, handlers));
  }
  container.appendChild(playersEl);

  renderLog(container, options.log);
}

// ----- Việc 2.5: màn hình thiết lập ván mới (chế độ hotseat — 4-7 người chia
// nhau gõ tên rồi ngồi chung 1 máy chơi hết ván). Đây là màn hình HIỆN RA
// TRƯỚC khi có GameState (chưa gọi setupGame()), nên không nhận GameState làm
// tham số như renderApp() — chỉ nhận danh sách tên đang gõ dở.

export interface SetupHandlers {
  onNameChange(index: number, value: string): void;
  onAddPlayer(): void;
  onRemovePlayer(): void;
  onStartGame(): void;
}

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 7;

export function renderSetupScreen(
  container: HTMLElement,
  names: string[],
  error: string | null,
  handlers: SetupHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Thiết lập ván mới (chơi chung 1 máy)";
  container.appendChild(heading);

  const hint = document.createElement("p");
  hint.textContent = `Cần 4-7 người chơi — đang có ${names.length}. Mỗi người tự gõ tên của mình.`;
  container.appendChild(hint);

  if (error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = error;
    container.appendChild(errorEl);
  }

  const list = document.createElement("div");
  list.className = "setup-list";
  names.forEach((name, index) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.placeholder = `Người chơi ${index + 1}`;
    // CHỈ cập nhật biến ở main.ts, KHÔNG render lại ở đây — render lại giữa
    // lúc đang gõ sẽ xoá và tạo lại input mới, làm mất luôn con trỏ đang gõ.
    input.addEventListener("input", () => handlers.onNameChange(index, input.value));
    list.appendChild(input);
  });
  container.appendChild(list);

  const controls = document.createElement("div");
  controls.className = "panel";
  const addBtn = button("+ Thêm người chơi", () => handlers.onAddPlayer());
  addBtn.disabled = names.length >= MAX_PLAYERS;
  controls.appendChild(addBtn);
  const removeBtn = button("- Bớt người chơi", () => handlers.onRemovePlayer());
  removeBtn.disabled = names.length <= MIN_PLAYERS;
  controls.appendChild(removeBtn);
  container.appendChild(controls);

  container.appendChild(button("Bắt đầu ván", () => handlers.onStartGame()));
}

// ----- Việc 3.9: chọn chế độ chơi + lobby qua mạng (tạo phòng / vào phòng
// bằng mã 6 ký tự). Màn hình bàn chơi qua mạng ở đây CHỈ hiển thị tối giản
// (đọc PlayerView, KHÔNG bấm bài được) — nối tương tác thật để dành việc 3.10.

export interface HomeHandlers {
  onPlayLocal(): void;
  onPlayNetwork(): void;
  onShowCardReference(): void;
}

export function renderHomeScreen(container: HTMLElement, handlers: HomeHandlers): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chọn cách chơi";
  container.appendChild(heading);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.appendChild(button("Chơi chung 1 máy (hotseat)", () => handlers.onPlayLocal()));
  panel.appendChild(button("Chơi qua mạng", () => handlers.onPlayNetwork()));
  panel.appendChild(button("Chú giải lá bài", () => handlers.onShowCardReference()));
  container.appendChild(panel);
}

// Việc 4.6: màn hình tra cứu — liệt kê đủ 22 lá (12 nâu + 10 xanh), mỗi lá 1
// khung ảnh+tên (dùng chung appendCardVisual() với lá trong ván) kèm mô tả đầy
// đủ bên dưới. Không cần cardId thật (không gắn với ván nào) — CardName suông
// là đủ cho appendCardVisual()/CARD_DESCRIPTIONS, không phải suy ngược qua
// cardNameFromId() như cardButton()/cardChip() (2 hàm đó phục vụ lá THẬT trong
// ván, luôn có cardId).
export interface CardReferenceHandlers {
  onBack(): void;
}

function renderCardReferenceGroup(container: HTMLElement, heading: string, names: readonly CardName[]): void {
  const headingEl = document.createElement("h3");
  headingEl.className = "card-ref-group-heading";
  headingEl.textContent = heading;
  container.appendChild(headingEl);

  const grid = document.createElement("div");
  grid.className = "card-ref-grid";
  for (const name of names) {
    const item = document.createElement("div");
    item.className = "card-ref-item";

    const box = document.createElement("div");
    box.className = `card-box ${cardTypeModifierClass(name)}`;
    // Không truyền description — mô tả đã hiện thành chữ riêng ngay bên dưới
    // (xem appendCardVisual()), gắn thêm tooltip/nhấn-giữ ở đây là thừa.
    appendCardVisual(box, cardImageUrl(name), CARD_LABELS[name]);
    item.appendChild(box);

    const desc = document.createElement("p");
    desc.className = "card-ref-item__desc";
    desc.textContent = CARD_DESCRIPTIONS[name];
    item.appendChild(desc);

    grid.appendChild(item);
  }
  container.appendChild(grid);
}

// Việc bổ sung sau 4.6: DỰNG SẴN khung nhân vật (viền xanh lá, ảnh + tên riêng
// y hệt lá bài) để Giai đoạn 5 (16 nhân vật, xem LO-TRINH.md) chỉ cần cắm dữ
// liệu thật vào — CHƯA có nhân vật nào thật sự tồn tại trong core/ (đúng quy
// tắc "Chưa làm tới, đừng đụng vào: Nhân vật"), đây CHỈ là khung xem trước
// cho biết khung trông thế nào, không phải danh sách nhân vật thật.
//
// Đúng luật gốc BANG! (chủ dự án đã chỉnh lại sau khi hiểu lầm ban đầu — bản
// v1 chỉ làm 1 ô ví dụ, không đúng luật): mỗi người chơi được PHÁT 2 LÁ NHÂN
// VẬT úp, tự xem rồi CHỌN GIỮ 1 lá làm nhân vật thật của mình trong ván, bỏ lá
// còn lại — nên khung ví dụ ở đây vẽ 2 ô cạnh nhau (đại diện 2 lá được phát),
// không phải 1. Tên nhân vật (vd sau này "Willy the Kid") KHÁC với tên hiển
// thị người chơi tự gõ (An, Bình...) — 2 khái niệm khác nhau.
function renderCharacterPreviewSection(container: HTMLElement): void {
  const headingEl = document.createElement("h3");
  headingEl.className = "card-ref-group-heading";
  headingEl.textContent = "Nhân vật (chưa có trong bản này — xem trước khung)";
  container.appendChild(headingEl);

  const rule = document.createElement("p");
  rule.textContent =
    "Đúng luật gốc: mỗi người chơi được phát 2 lá nhân vật úp, tự xem rồi chọn giữ 1 lá làm " +
    "nhân vật thật của mình, bỏ lá còn lại — 2 ô dưới đây là ví dụ cho 2 lá được phát đó.";
  container.appendChild(rule);

  const grid = document.createElement("div");
  grid.className = "card-ref-grid";

  for (const label of ["Nhân vật A (ví dụ)", "Nhân vật B (ví dụ)"]) {
    const item = document.createElement("div");
    item.className = "card-ref-item";

    const box = document.createElement("div");
    box.className = "card-box card-box--character";
    appendCardVisual(box, "/sprites/characters/_preview.png", label);
    item.appendChild(box);

    const desc = document.createElement("p");
    desc.className = "card-ref-item__desc";
    desc.textContent = "Khung ví dụ — Giai đoạn 5 mới thật sự thêm 16 nhân vật (mỗi người 1 kỹ năng riêng).";
    item.appendChild(desc);

    grid.appendChild(item);
  }
  container.appendChild(grid);
}

export function renderCardReferenceScreen(container: HTMLElement, handlers: CardReferenceHandlers): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chú giải lá bài";
  container.appendChild(heading);

  container.appendChild(button("← Quay lại", () => handlers.onBack()));

  renderCardReferenceGroup(container, "Bài nâu (đánh từ tay, chơi xong vào chồng bỏ)", BROWN_CARD_NAMES);
  renderCardReferenceGroup(container, "Bài xanh (trang bị, để ngửa trước mặt tới khi mất)", BLUE_CARD_NAMES);
  renderCharacterPreviewSection(container);
}

export interface NetworkLobbyFormHandlers {
  onNameChange(value: string): void;
  onCodeChange(value: string): void;
  onGenerateCode(): void;
  onJoinRoom(): void;
}

export function renderNetworkLobbyForm(
  container: HTMLElement,
  name: string,
  code: string,
  error: string | null,
  handlers: NetworkLobbyFormHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chơi qua mạng";
  container.appendChild(heading);

  if (error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = error;
    container.appendChild(errorEl);
  }

  const nameLabel = document.createElement("p");
  nameLabel.textContent = "Tên của bạn:";
  container.appendChild(nameLabel);
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = name;
  nameInput.placeholder = "Tên hiển thị";
  nameInput.addEventListener("input", () => handlers.onNameChange(nameInput.value));
  container.appendChild(nameInput);

  const codeLabel = document.createElement("p");
  codeLabel.textContent = "Mã phòng (6 ký tự) — tạo mới hoặc nhập mã bạn bè gửi:";
  container.appendChild(codeLabel);
  const codeInput = document.createElement("input");
  codeInput.type = "text";
  codeInput.value = code;
  codeInput.placeholder = "VD: AB12CD";
  codeInput.addEventListener("input", () => handlers.onCodeChange(codeInput.value.toUpperCase()));
  container.appendChild(codeInput);

  const controls = document.createElement("div");
  controls.className = "panel";
  controls.appendChild(button("Tạo mã ngẫu nhiên", () => handlers.onGenerateCode()));
  controls.appendChild(button("Vào phòng", () => handlers.onJoinRoom()));
  container.appendChild(controls);
}

export interface LobbyPlayer {
  id: string;
  name: string;
}

export interface NetworkLobbyHandlers {
  onStartGame(): void;
}

const MIN_NETWORK_PLAYERS = 4;

export function renderNetworkLobby(
  container: HTMLElement,
  roomCode: string,
  players: LobbyPlayer[],
  ownerId: string | null,
  viewerId: string,
  error: string | null,
  // Việc 4.3: ván trước bị server tự huỷ vì còn quá ít người kết nối — null
  // nếu không có gì để báo.
  abandonedNotice: string | null,
  handlers: NetworkLobbyHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Phòng chờ";
  container.appendChild(heading);

  const codeEl = document.createElement("p");
  codeEl.className = "summary";
  codeEl.textContent = `Mã phòng: ${roomCode} — chia sẻ mã này cho bạn bè để họ vào cùng`;
  container.appendChild(codeEl);

  if (abandonedNotice) {
    const noticeEl = document.createElement("p");
    noticeEl.className = "draw-check-notice";
    noticeEl.textContent = abandonedNotice;
    container.appendChild(noticeEl);
  }

  if (error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = error;
    container.appendChild(errorEl);
  }

  const listLabel = document.createElement("p");
  listLabel.textContent = `Đã vào phòng (${players.length}):`;
  container.appendChild(listLabel);

  const list = document.createElement("ul");
  for (const player of players) {
    const li = document.createElement("li");
    li.textContent = player.name + (player.id === ownerId ? " (chủ phòng)" : "");
    list.appendChild(li);
  }
  container.appendChild(list);

  // Chỉ chủ phòng mới được bắt đầu ván (yêu cầu sau việc 3.10) — người khác
  // chỉ thấy dòng chờ, không có nút. Server (room.ts) cũng tự kiểm tra lại,
  // nút ẩn ở đây chỉ để đỡ bấm nhầm, không phải chốt chặn duy nhất.
  if (viewerId === ownerId) {
    const startBtn = button("Bắt đầu ván", () => handlers.onStartGame());
    startBtn.disabled = players.length < MIN_NETWORK_PLAYERS;
    container.appendChild(startBtn);

    if (players.length < MIN_NETWORK_PLAYERS) {
      const hint = document.createElement("p");
      hint.textContent = `Cần ít nhất ${MIN_NETWORK_PLAYERS} người mới bắt đầu được.`;
      container.appendChild(hint);
    }
  } else {
    const ownerName = players.find((p) => p.id === ownerId)?.name ?? "chủ phòng";
    const hint = document.createElement("p");
    hint.textContent = `Đang chờ ${ownerName} bắt đầu ván.`;
    container.appendChild(hint);
  }
}

// ----- Việc 3.10: bàn chơi TƯƠNG TÁC THẬT qua mạng — thay hẳn
// renderNetworkGameReadOnly() tạm bợ của việc 3.9. Cố tình KHÔNG dùng lại
// renderApp()/renderPlayer() ở trên vì 2 lý do:
// 1. Hình dạng dữ liệu khác: GameState có `hand: string[]` cho MỌI người
//    (hotseat tin tưởng ai cũng thấy hết, cùng ngồi 1 máy); PlayerView chỉ có
//    `hand` thật cho CHÍNH MÌNH (`handCount` cho người khác, xem việc 3.6).
// 2. Ai được bấm khác hẳn: hotseat cho phép bấm bài của "người đang tới lượt"
//    bất kể ai đang cầm chuột (rồi cùng 1 máy); qua mạng CHỈ CHÍNH MÌNH
//    (`view.viewerId`) được bấm bài của mình — người khác tự bấm bên máy của
//    họ, dù có đúng lượt của mình hay không cũng không đụng được bài người ta.

export interface NetworkGameHandlers {
  onDrawCards(): void;
  onEndTurn(): void;
  onToggleDiscardCard(cardId: string): void;
  onConfirmDiscard(): void;
  onHandCardClick(cardId: string): void;
  onEquipmentClick(ownerId: string, cardId: string): void;
  onPlayerClick(targetId: string): void;
  onStoreOptionClick(cardId: string): void;
  onZoneClick(zone: "hand" | "equipment"): void;
  onRespondTakeConsequence(): void;
  onCancelSelection(): void;
}

export interface NetworkGameOptions {
  selection: Selection;
  error: string | null;
  discardSelection: string[];
  lastDrawCheck: DrawCheckNotice;
  deadline: DeadlineInfo | null;
  log: string[]; // việc 4.2: nhật ký ván đấu, mới nhất ở đầu mảng
  connectedPlayerIds: string[]; // việc 4.3: ai đang có socket mở thật sự
}

function networkRenderHandSection(
  container: HTMLElement,
  view: PlayerView,
  player: PlayerHandView,
  options: NetworkGameOptions,
  handlers: NetworkGameHandlers
): void {
  const { selection, discardSelection } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "cards";

  const isMe = player.id === view.viewerId;

  // Không phải mình -> KHÔNG bao giờ có nút bấm, chỉ hiện số lượng (bài thật
  // luôn là null với người khác — xem viewFor()).
  if (!isMe || player.hand === null) {
    if (player.handCount > 0) {
      const span = document.createElement("span");
      span.className = "card card--inert";
      span.textContent = `${player.handCount} lá (ẩn)`;
      wrapper.appendChild(span);
    }
    container.appendChild(wrapper);
    return;
  }

  const top = view.pending[view.pending.length - 1];
  const isCurrentTurnToPlay =
    view.pending.length === 0 && view.turnPhase === "play" && view.players[view.currentPlayerIndex]?.id === player.id;
  const isDiscarding =
    view.pending.length === 0 && view.turnPhase === "discard" && view.players[view.currentPlayerIndex]?.id === player.id;
  const isResponding = top !== undefined && top.player === player.id;
  const respondableName = isResponding ? respondableCardName(top.kind) : null;
  const isDiscardFromHand = isResponding && top.kind === "NEED_DISCARD_FROM_ZONE" && top.zone === "hand";

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      wrapper.appendChild(
        cardButton(cardId, () => handlers.onToggleDiscardCard(cardId), selected ? "card-box--checked" : undefined)
      );
      continue;
    }

    if (isDiscardFromHand) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      continue;
    }

    if (respondableName !== null) {
      if (name === respondableName) {
        wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      } else {
        wrapper.appendChild(cardChip(cardId));
      }
      continue;
    }

    if (isCurrentTurnToPlay && name !== "missed") {
      const armed = selection.step === "picking-target" && selection.cardId === cardId;
      wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId), armed ? "card-box--armed" : undefined));
      continue;
    }

    wrapper.appendChild(cardChip(cardId));
  }

  container.appendChild(wrapper);
}

function networkRenderEquipmentSection(
  container: HTMLElement,
  view: PlayerView,
  player: PlayerHandView,
  selection: Selection,
  handlers: NetworkGameHandlers
): void {
  const wrapper = document.createElement("div");
  wrapper.className = "cards";

  const top = view.pending[view.pending.length - 1];
  const isDiscardFromEquipment =
    top !== undefined && top.player === player.id && top.kind === "NEED_DISCARD_FROM_ZONE" && top.zone === "equipment";
  const isPickingPanicTarget = selection.step === "picking-panic-equipment" && selection.targetId === player.id;

  for (const cardId of player.equipment) {
    const isDynamite = cardNameFromId(cardId) === "dynamite";

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId)));
      continue;
    }

    wrapper.appendChild(cardChip(cardId));
  }

  container.appendChild(wrapper);
}

function networkRenderPlayer(
  view: PlayerView,
  player: PlayerHandView,
  index: number,
  options: NetworkGameOptions,
  handlers: NetworkGameHandlers
): HTMLElement {
  const { selection } = options;
  const el = document.createElement("article");
  el.className = "player";
  if (index === view.currentPlayerIndex) el.classList.add("player--current");
  if (!player.alive) el.classList.add("player--dead");

  const heading = document.createElement("h3");
  heading.textContent =
    player.name +
    (index === view.currentPlayerIndex ? " ← đang tới lượt" : "") +
    (player.id === view.viewerId ? " (bạn)" : "") +
    // Việc 4.3: không tính chính mình — chính socket đang vẽ màn hình này thì
    // chắc chắn đang kết nối, không cần báo lại chuyện hiển nhiên đó.
    (player.id !== view.viewerId && !options.connectedPlayerIds.includes(player.id) ? " ⚠ đã mất kết nối" : "");
  el.appendChild(heading);

  const roleText = player.role ? ROLE_LABELS[player.role] : "(ẩn)";
  const roleAndHp = document.createElement("p");
  roleAndHp.textContent = `${roleText} · Máu: ${player.hp}/${player.maxHp} · ${player.alive ? "Còn sống" : "Đã chết"}`;
  el.appendChild(roleAndHp);

  const handLabel = document.createElement("p");
  handLabel.textContent = "Bài trên tay:";
  el.appendChild(handLabel);
  networkRenderHandSection(el, view, player, options, handlers);

  const equipmentLabel = document.createElement("p");
  equipmentLabel.textContent = "Trang bị:";
  el.appendChild(equipmentLabel);
  networkRenderEquipmentSection(el, view, player, selection, handlers);

  // Chọn mục tiêu: chỉ hiện nút này khi CHÍNH MÌNH đang chọn mục tiêu, cho
  // người KHÁC mình (không tự nhắm vào bản thân).
  if (selection.step === "picking-target" && player.alive && player.id !== view.viewerId) {
    el.appendChild(button("Chọn làm mục tiêu", () => handlers.onPlayerClick(player.id)));
  }

  // Cat Balou: sau khi chọn xong mục tiêu, hỏi bỏ tay hay bỏ sân — chỉ hỏi
  // cho ĐÚNG người vừa được chọn, và chỉ hiện lựa chọn nào còn bài để bỏ.
  // Dùng handCount (LUÔN đúng, không bị ẩn) thay vì hand.length.
  if (selection.step === "picking-cat-balou-zone" && selection.targetId === player.id) {
    const zoneWrapper = document.createElement("div");
    zoneWrapper.className = "cards";
    if (player.handCount > 0) {
      zoneWrapper.appendChild(button("Bắt bỏ bài trên tay", () => handlers.onZoneClick("hand")));
    }
    if (player.equipment.some((id) => cardNameFromId(id) !== "dynamite")) {
      zoneWrapper.appendChild(button("Bắt bỏ bài trên sân", () => handlers.onZoneClick("equipment")));
    }
    el.appendChild(zoneWrapper);
  }

  return el;
}

function networkRenderPendingPanel(container: HTMLElement, view: PlayerView, handlers: NetworkGameHandlers): void {
  if (view.pending.length === 0) return;

  const panel = document.createElement("div");
  panel.className = "panel panel--pending";

  const heading = document.createElement("p");
  heading.className = "pending-heading";
  heading.textContent =
    view.pending.length > 1
      ? `Đang có ${view.pending.length} việc chờ xử lý (việc mới phát sinh luôn xử lý trước):`
      : "Đang chờ xử lý:";
  panel.appendChild(heading);

  const findName = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const describe = (item: PendingActionView): string => {
    const name = findName(item.player);
    switch (item.kind) {
      case "NEED_MISSED":
        return `${name} đỡ Bang! bằng Missed! (hoặc chịu mất máu)`;
      case "NEED_DISCARD_BANG":
        return `${name} bỏ 1 lá Bang! (hoặc chịu mất máu)`;
      case "NEED_DUEL_RESPONSE":
        return `${name} bỏ 1 lá Bang! trong Đấu tay đôi (hoặc chịu mất máu)`;
      case "NEED_PICK_STORE_CARD":
        return `${name} chọn 1 lá từ Cửa hàng tổng hợp`;
      case "NEED_DISCARD_FROM_ZONE":
        return `${name} chọn 1 lá để bỏ (${item.zone === "hand" ? "trên tay" : "trên sân"})`;
      case "NEED_DRAW_CHECK":
        return `${name} lật bài kiểm tra (draw!)`;
      case "NEED_PICK_DRAW_SOURCE":
        return `${name} chọn lấy lá trên cùng chồng bỏ hay rút bộ bài`;
      case "NEED_PICK_DRAW_TARGET":
        return `${name} chọn rút bộ bài hay lấy 1 lá từ tay người khác`;
      case "NEED_GIVE_CARD_TO_PLAYER":
        return `${name} chọn 1 lá của mình để đưa`;
      case "NEED_PICK_KEPT_CARDS":
        return `${name} xem 3 lá đầu bộ bài, chọn giữ 2 bỏ 1`;
      default: {
        const neverKind: never = item;
        throw new Error(`Chưa biết mô tả cho pending: ${JSON.stringify(neverKind)}`);
      }
    }
  };

  const list = document.createElement("ol");
  list.className = "pending-list";
  for (let i = view.pending.length - 1; i >= 0; i--) {
    const item = view.pending[i];
    const isTop = i === view.pending.length - 1;
    const li = document.createElement("li");
    li.className = isTop ? "pending-item pending-item--current" : "pending-item";
    li.textContent = isTop ? `Đang chờ: ${describe(item)}` : `Sắp tới: ${describe(item)}`;
    list.appendChild(li);
  }
  panel.appendChild(list);

  // Nút phản hồi CHỈ hiện khi ĐÚNG là CHÍNH MÌNH đang bị chờ trả lời — người
  // khác cũng đang chờ (vd Gatling bắn cả phòng) thì mỗi người chỉ thấy nút ở
  // đúng lượt phản hồi của họ trên máy của họ.
  const top = view.pending[view.pending.length - 1];
  if (top.player === view.viewerId) {
    if (top.kind === "NEED_PICK_STORE_CARD") {
      const wrapper = document.createElement("div");
      wrapper.className = "cards";
      for (const cardId of top.options) {
        wrapper.appendChild(cardButton(cardId, () => handlers.onStoreOptionClick(cardId)));
      }
      panel.appendChild(wrapper);
    } else if (top.kind === "NEED_DRAW_CHECK") {
      panel.appendChild(button("Lật bài", () => handlers.onRespondTakeConsequence()));
    } else if (top.kind === "NEED_MISSED" || top.kind === "NEED_DISCARD_BANG" || top.kind === "NEED_DUEL_RESPONSE") {
      panel.appendChild(button("Chịu mất máu (không đỡ)", () => handlers.onRespondTakeConsequence()));
    }
  }

  container.appendChild(panel);
}

function networkRenderPhaseActions(
  container: HTMLElement,
  view: PlayerView,
  options: NetworkGameOptions,
  handlers: NetworkGameHandlers
): void {
  if (view.pending.length > 0 || view.winner) return;

  const me = view.players.find((p) => p.id === view.viewerId);
  const isMyTurn = me && view.players[view.currentPlayerIndex]?.id === view.viewerId;
  if (!isMyTurn) return; // không phải lượt mình -> không có nút hành động nào cả

  const panel = document.createElement("div");
  panel.className = "panel";

  if (view.turnPhase === "draw") {
    panel.appendChild(button("Rút bài", () => handlers.onDrawCards()));
  } else if (view.turnPhase === "discard") {
    const excess = me.handCount - me.hp;
    const selectedCount = options.discardSelection.length;
    const info = document.createElement("p");
    info.textContent = `Cần bỏ ${excess} lá — đã chọn ${selectedCount}`;
    panel.appendChild(info);
    const confirmBtn = button("Xác nhận bỏ bài", () => handlers.onConfirmDiscard());
    confirmBtn.disabled = selectedCount !== excess;
    panel.appendChild(confirmBtn);
  } else {
    panel.appendChild(button("Kết thúc lượt", () => handlers.onEndTurn()));
  }

  container.appendChild(panel);
}

// Giai đoạn 5, cơ chế "phát 2 lá nhân vật, chọn giữ 1" (qua mạng) — hiện ra
// TRƯỚC renderNetworkGame() khi view.characterSelection còn khác null (xem
// main.ts). Khác hotseat: CHỈ CHÍNH MÌNH (view.viewerId) thấy được 2 lá riêng
// của mình (`options`) — server đã lọc `options` của người khác thành `null`
// qua viewFor() (quy tắc 6 CLAUDE.md, xem view.ts), nên với người khác chỉ
// hiện được trạng thái "đã chọn xong (lộ tên)" hay "đang chọn..." (không lộ 2
// lá họ đang cân nhắc).
export interface NetworkCharacterSelectionHandlers {
  onChooseCharacter(characterId: string): void;
}

export function renderNetworkCharacterSelectionScreen(
  container: HTMLElement,
  view: PlayerView,
  deadline: DeadlineInfo | null,
  handlers: NetworkCharacterSelectionHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chọn nhân vật";
  container.appendChild(heading);

  const rule = document.createElement("p");
  rule.textContent = "Xem 2 lá nhân vật riêng của bạn rồi chọn giữ 1 lá — không cần chờ người khác chọn xong.";
  container.appendChild(rule);

  renderCountdown(container, deadline, view.players);

  const choices: CharacterChoiceView[] = view.characterSelection ?? [];
  for (const choice of choices) {
    const playerName = view.players.find((p) => p.id === choice.playerId)?.name ?? choice.playerId;
    const isMe = choice.playerId === view.viewerId;
    const section = document.createElement("div");
    section.className = "panel";

    const nameEl = document.createElement("h3");
    section.appendChild(nameEl);

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    if (choice.chosen) {
      nameEl.textContent = `${playerName}${isMe ? " (bạn)" : ""} — đã chọn`;
      cardsEl.appendChild(characterChip(choice.chosen));
    } else if (isMe && choice.options) {
      nameEl.textContent = `${playerName} (bạn) — chọn 1 trong 2 lá`;
      for (const characterId of choice.options) {
        cardsEl.appendChild(characterButton(characterId, () => handlers.onChooseCharacter(characterId)));
      }
    } else {
      nameEl.textContent = `${playerName} — đang chọn...`;
    }
    section.appendChild(cardsEl);

    container.appendChild(section);
  }
}

export function renderNetworkGame(
  container: HTMLElement,
  view: PlayerView,
  options: NetworkGameOptions,
  handlers: NetworkGameHandlers
): void {
  container.replaceChildren();

  if (options.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = options.error;
    container.appendChild(errorEl);
  }

  const summary = document.createElement("p");
  summary.className = "summary";
  const discardTop = view.discardPile[view.discardPile.length - 1];
  summary.textContent =
    `Giai đoạn lượt: ${TURN_PHASE_LABELS[view.turnPhase]} · Bộ bài còn ${view.deckCount} lá · ` +
    `Chồng bỏ ${view.discardPile.length} lá` +
    (discardTop ? ` (mặt trên: ${cardFaceLabel(discardTop)})` : "") +
    (view.winner ? ` · VÁN KẾT THÚC — phe thắng: ${WINNER_LABELS[view.winner]}` : "");
  container.appendChild(summary);

  renderCountdown(container, options.deadline, view.players);
  renderDrawCheckNotice(container, options.lastDrawCheck);

  if (options.selection.step !== "idle") {
    const hint = document.createElement("div");
    hint.className = "panel panel--selection";
    hint.appendChild(document.createTextNode("Đang chọn mục tiêu... "));
    hint.appendChild(button("Huỷ", () => handlers.onCancelSelection()));
    container.appendChild(hint);
  }

  networkRenderPendingPanel(container, view, handlers);
  networkRenderPhaseActions(container, view, options, handlers);

  const playersEl = document.createElement("div");
  playersEl.className = "players";
  view.players.forEach((player, index) => {
    playersEl.appendChild(networkRenderPlayer(view, player, index, options, handlers));
  });
  container.appendChild(playersEl);

  renderLog(container, options.log);
}
