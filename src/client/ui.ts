// Việc 2.2 (vẽ state) + 2.3 (bấm bài → gọi reduce) + 2.4 (hiện đầy đủ stack
// pending, không chỉ đỉnh) + 2.5 (màn hình thiết lập + chơi lại, chế độ
// hotseat). Nhãn tiếng Việt (tên bài, tên vai) chỉ để HIỂN THỊ nên đặt ở đây,
// không đặt trong core/ — core/ không quan tâm chuyện trình bày.

import { cardNameFromId, cardSuitRankFromId, WEAPON_RANGES } from "../core/cards";
import type { CardName } from "../core/cards";
import { getCharacterDefinition } from "../core/characters";
import type { CharacterChoice, GameEvent, GameState, HouseRuleId, PendingAction, PlayerState, Role, Suit, Winner } from "../core/types";
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
  beer: "Tự hồi 1 máu cho chính mình (không vượt quá máu tối đa). Vô tác dụng khi chỉ còn 2 người sống. Máu về 0 mà còn Bia trên tay thì tự động dùng để sống sót.",
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
// `modifierClass`: giống tham số cùng tên ở cardButton() — dùng cho cảnh báo
// riêng Dynamite/Jail trong khu trang bị (mục 5), xem equipmentDangerClass().
function cardChip(cardId: string, modifierClass?: string): HTMLSpanElement {
  const name = cardNameFromId(cardId);
  const el = document.createElement("span");
  el.className = ["card-box", "card-box--inert", cardTypeModifierClass(name), modifierClass].filter(Boolean).join(" ");
  appendCardVisual(el, cardImageUrl(name), cardLabel(cardId), CARD_DESCRIPTIONS[name]);
  return el;
}

// Đợt 4 UI/UX (mục 5) — "Cảnh báo riêng: Dynamite (đang đếm), Jail (bị giam)".
// Cả 2 chỉ nguy hiểm khi đã NẰM TRÊN SÂN (equipment) — trong tay chưa đánh ra
// thì chưa có tác dụng gì, không cần cảnh báo (đúng luật: Dynamite/Jail chỉ
// "kích hoạt" sau khi đánh). Dùng ĐÚNG 1 màu đỏ duy nhất của chrome (mục 1:
// "chỉ cho NGUY HIỂM/KHẨN CẤP") cho cả 2, phân biệt nhau bằng icon khác nhau.
function equipmentDangerClass(cardName: CardName): string | undefined {
  if (cardName === "dynamite") return "card-box--danger card-box--danger-dynamite";
  if (cardName === "jail") return "card-box--danger card-box--danger-jail";
  return undefined;
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
// `armed`: đã bấm CHỌN TẠM lá này, đang chờ bấm nút "Xác nhận" riêng mới thật
// sự gửi đi (xem renderCharacterOption() bên dưới — việc bổ sung sau Giai
// đoạn 5: tránh bấm nhầm lúc chỉ định xem mô tả chức năng, xem ghi chú ở đó).
function characterButton(characterId: string, onClick: () => void, armed: boolean = false): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "card-box card-box--character" + (armed ? " card-box--armed" : "");
  appendCardVisual(el, characterImageUrl(characterId), characterLabel(characterId), CHARACTER_DESCRIPTIONS[characterId]);
  el.addEventListener("click", onClick);
  return el;
}

// Việc bổ sung sau Giai đoạn 5 — 1 trong 2 lá nhân vật đang chờ chọn: card +
// MÔ TẢ HIỆN LUÔN thành chữ ngay bên dưới (không chỉ ẩn trong tooltip hover/
// nhấn giữ — vẫn giữ nguyên cả 2 cách đó, attachDescriptionReveal() gắn sẵn
// trong appendCardVisual() không đổi gì). Lý do: quyết định chọn nhân vật chỉ
// có ĐÚNG 1 LẦN, không tiện phải hover/nhấn giữ từng lá một để so sánh, và
// hover gần như vô dụng trên điện thoại.
function characterOptionCard(characterId: string, armed: boolean, onClick: () => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "character-option";
  wrapper.appendChild(characterButton(characterId, onClick, armed));

  const desc = document.createElement("p");
  desc.className = "character-option__description";
  desc.textContent = CHARACTER_DESCRIPTIONS[characterId] ?? "";
  wrapper.appendChild(desc);

  return wrapper;
}

// Lá nhân vật CHỈ ĐỂ XEM — nhân vật ĐÃ chọn xong (của mình hoặc người khác,
// công khai ngay khi chọn — xem CharacterChoice ở types.ts). Dùng chung kích
// thước `.card-box` chuẩn với mọi lá bài khác (bản thu nhỏ `--mini` trước đây
// khiến khung bị lép — ảnh vẫn rộng 4.5rem như lá thường nhưng chiều cao bị
// ép xuống — bỏ hẳn, để cạnh tên bằng đúng kích thước lá bài bình thường).
function characterChip(characterId: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "card-box card-box--inert card-box--character";
  appendCardVisual(el, characterImageUrl(characterId), characterLabel(characterId), CHARACTER_DESCRIPTIONS[characterId]);
  return el;
}

// Đợt 5 UI/UX (mục 4 ý c) — thanh máu dạng VIÊN ĐẠN (đặc tả gốc gợi ý "tim",
// chủ dự án chốt đổi thành viên đạn cho đúng chủ đề, để dành chỗ dán ảnh chân
// thật sau — CHƯA có ảnh, quy ước đường dẫn TRƯỚC giống mọi sprite khác trong
// dự án). Khác lá bài (ảnh lỗi thì CHỈ ẩn ảnh, còn tên chữ đọc được): viên đạn
// không có "tên chữ" để thay thế, nên .hp-bullet luôn có SẴN 1 hình viên đạn
// vẽ bằng CSS (chỉ thang xám, đúng mục 1) làm nền — ảnh thật sau này chỉ là
// lớp phủ đẹp hơn đặt CHỒNG lên, không phải điều kiện để hiểu được máu bao
// nhiêu.
function bulletImageUrl(full: boolean): string {
  return full ? "/sprites/bullet-full.png" : "/sprites/bullet-empty.png";
}

function renderHpTrack(hp: number, maxHp: number): HTMLSpanElement {
  const track = document.createElement("span");
  track.className = "hp-track";
  track.setAttribute("role", "img");
  track.setAttribute("aria-label", `Máu ${hp}/${maxHp}`);

  for (let i = 0; i < maxHp; i++) {
    const full = i < hp;
    const bullet = document.createElement("span");
    bullet.className = "hp-bullet" + (full ? " hp-bullet--full" : " hp-bullet--empty");
    const img = document.createElement("img");
    img.className = "hp-bullet__image";
    img.alt = "";
    img.src = bulletImageUrl(full);
    img.addEventListener("error", () => {
      img.style.display = "none"; // thiếu ảnh -> chỉ còn hình viên đạn vẽ bằng CSS
    });
    bullet.appendChild(img);
    track.appendChild(bullet);
  }

  const number = document.createElement("span");
  number.className = "hp-track__number";
  number.textContent = ` ${hp}/${maxHp}`;
  track.appendChild(number);

  return track;
}

// Mục 7 UI/UX ("GIỮA BÀN") — bộ bài rút luôn ÚP (không lộ lá nào, đúng luật),
// chưa có ảnh mặt sau thật -> quy ước đường dẫn TRƯỚC giống mọi sprite khác,
// <img> lỗi thì tự ẩn, chỉ còn nền xám + chữ "Bộ bài" (cardBox vẫn đọc được
// bình thường, không vỡ giao diện).
function deckBackImageUrl(): string {
  return "/sprites/card-back.png";
}

function renderDeckPileBox(): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "card-box card-box--inert card-box--deck-back";
  appendCardVisual(el, deckBackImageUrl(), "Bộ bài");
  return el;
}

// Mục 7 UI/UX: khu giữa bàn gồm bộ bài rút (úp, chỉ số lượng) + chồng bài bỏ
// (lá mặt trên ngửa thật, dùng chung cardChip() như mọi nơi khác hiện 1 lá cụ
// thể). Dùng CHUNG cho cả hotseat lẫn qua mạng — tham số chỉ cần deckCount +
// discardPile (2 thứ CÔNG KHAI, PlayerView cũng có sẵn y hệt).
function renderTableCenter(deckCount: number, discardPile: string[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "table-center";

  const deckPile = document.createElement("div");
  deckPile.className = "table-center__pile";
  deckPile.appendChild(renderDeckPileBox());
  const deckCaption = document.createElement("span");
  deckCaption.className = "table-center__caption";
  deckCaption.textContent = `Còn ${deckCount} lá`;
  deckPile.appendChild(deckCaption);
  wrap.appendChild(deckPile);

  const discardPileEl = document.createElement("div");
  discardPileEl.className = "table-center__pile";
  const topDiscard = discardPile[discardPile.length - 1];
  if (topDiscard) {
    discardPileEl.appendChild(cardChip(topDiscard));
  } else {
    const empty = document.createElement("span");
    empty.className = "card-box card-box--inert table-center__empty-pile";
    empty.textContent = "(trống)";
    discardPileEl.appendChild(empty);
  }
  const discardCaption = document.createElement("span");
  discardCaption.className = "table-center__caption";
  discardCaption.textContent = `Đã bỏ ${discardPile.length} lá`;
  discardPileEl.appendChild(discardCaption);
  wrap.appendChild(discardPileEl);

  return wrap;
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
  // Biến thể 3 người (vòng tròn săn đuổi) — "cảnh sát" ở đây CỐ TÌNH khác chữ
  // với "Cảnh sát trưởng" (Sheriff) phía trên, để không gây nhầm 2 khái niệm.
  police: "Cảnh sát",
  criminal: "Tội phạm",
  traitor: "Kẻ phản bội",
};

// Thắng thua theo PHE (sheriff_deputy gộp 2 vai) — dùng cho 4-8 người, tách
// bảng nhãn riêng khỏi ROLE_LABELS (theo từng người) ở trên.
const FACTION_LABELS: Record<"sheriff_deputy" | "outlaw" | "renegade", string> = {
  sheriff_deputy: "Cảnh sát trưởng + Phó cảnh sát trưởng",
  outlaw: "Tội phạm",
  renegade: "Kẻ phản bội",
};

// Giai đoạn "biến thể số người chơi" — Winner giờ là UNION theo `kind`
// (`types.ts`): "faction" (4-8 người, thắng theo phe, dùng FACTION_LABELS ở
// trên) hoặc "player" (2 người, không chia vai — thắng vì là người sống sót
// DUY NHẤT, hiện thẳng TÊN người đó thay vì tên phe).
function describeWinner(winner: Winner, nameOf: (id: string) => string): string {
  return winner.kind === "faction" ? FACTION_LABELS[winner.faction] : nameOf(winner.playerId);
}

// Việc 5.3 (house rules) — nhãn + mô tả ngắn cho MỖI luật bổ sung đã cài
// (xem HouseRuleId ở types.ts). Thứ tự trong mảng HOUSE_RULE_IDS là thứ tự
// hiện checkbox trên màn hình thiết lập ván (hotseat + lobby qua mạng).
const HOUSE_RULE_LABELS: Record<HouseRuleId, string> = {
  extra_distance: "Tăng khoảng cách mặc định +1",
  require_weapon_for_bang: "Bắt buộc có súng mới đánh Bang!",
  no_duplicate_card_names: "Cấm dùng 2 lá trùng tên/lượt",
  beer_below_two: "Bia vẫn có tác dụng dù chỉ còn 2 người sống",
};
const HOUSE_RULE_DESCRIPTIONS: Record<HouseRuleId, string> = {
  extra_distance: "Mọi khoảng cách vòng tròn (tầm bắn Bang!, khoảng cách 1 của Panic!...) đều +1 so với luật gốc.",
  require_weapon_for_bang: "Bỏ 'súng ngầm định tầm 1' — phải trang bị 1 lá súng thật mới đánh Bang! được.",
  no_duplicate_card_names: "Không được đánh chủ động 2 lá NÂU trùng tên trong cùng 1 lượt (lá trang bị không tính).",
  beer_below_two: "Bỏ ngoại lệ luật gốc — Bia vẫn hồi máu/cứu mạng bình thường kể cả khi chỉ còn 2 người sống.",
};
const HOUSE_RULE_IDS: HouseRuleId[] = [
  "extra_distance",
  "require_weapon_for_bang",
  "no_duplicate_card_names",
  "beer_below_two",
];

function renderHouseRuleCheckboxes(
  container: HTMLElement,
  selected: HouseRuleId[],
  onToggle: (id: HouseRuleId) => void
): void {
  const wrapper = document.createElement("div");
  wrapper.className = "panel";

  const heading = document.createElement("p");
  heading.textContent = "Luật bổ sung (tuỳ chọn, chỉ áp dụng cho ván này):";
  wrapper.appendChild(heading);

  for (const id of HOUSE_RULE_IDS) {
    const label = document.createElement("label");
    label.title = HOUSE_RULE_DESCRIPTIONS[id];
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.includes(id);
    checkbox.addEventListener("change", () => onToggle(id));
    label.appendChild(checkbox);
    label.append(" " + HOUSE_RULE_LABELS[id]);
    wrapper.appendChild(label);
    wrapper.appendChild(document.createElement("br"));
  }

  container.appendChild(wrapper);
}

// Hiện đúng 1 dòng tóm tắt trong LÚC ĐANG CHƠI (đầu bàn chơi) nếu ván này có
// BẤT KỲ luật bổ sung nào đang bật — không hiện gì nếu mảng rỗng (đúng luật
// gốc, không cần nhắc).
function renderActiveHouseRules(container: HTMLElement, houseRules: HouseRuleId[]): void {
  if (houseRules.length === 0) return;
  const el = document.createElement("p");
  el.className = "summary";
  el.textContent = "Luật bổ sung đang bật: " + houseRules.map((id) => HOUSE_RULE_LABELS[id]).join(", ");
  container.appendChild(el);
}

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
    case "BEER_SAVED_FROM_DEATH":
      return `${nameOf(event.playerId)} tự động bỏ Bia để hồi sinh, còn 1 máu`;
    case "BEER_INEFFECTIVE":
      return `Bia của ${nameOf(event.playerId)} không có tác dụng — chỉ còn 2 người sống`;
    case "PLAYER_ELIMINATED":
      return event.killedBy
        ? `${nameOf(event.playerId)} bị ${nameOf(event.killedBy)} hạ gục`
        : `${nameOf(event.playerId)} đã chết`;
    case "OUTLAW_BOUNTY_DRAWN":
      return `${nameOf(event.playerId)} được thưởng vì kết liễu Tội phạm, rút ${event.count} lá`;
    case "SHERIFF_KILLED_DEPUTY_PENALTY":
      return `${nameOf(event.playerId)} giết nhầm Phó cảnh sát trưởng, bị phạt mất hết bài`;
    case "GAME_ENDED":
      return `VÁN KẾT THÚC — thắng: ${describeWinner(event.winner, nameOf)}`;
  }
}

// Đợt 3 UI/UX (mục 9) — dialog dùng CHUNG 1 kiểu cho mọi nơi (nhật ký/cài
// đặt/mã phòng): thẻ `<dialog>` gốc HTML, có sẵn nền mờ phía sau (`::backdrop`,
// xem style.css) + tự chặn tương tác với phần còn lại của trang khi
// `showModal()` — khỏi tự dựng overlay tay. `onClose`: đồng bộ lại biến "đang
// mở" ở main.ts (tránh lệch giữa DOM thật đã đóng và state client tưởng vẫn
// đang mở, giống ghi chú ở expandedSeatIds) — gọi TRỰC TIẾP từ nút "Đóng"
// (không chỉ dựa vào sự kiện `close` của `<dialog>`: đã tự kiểm thấy sự kiện
// này KHÔNG bắn trong môi trường tự kiểm bằng trình duyệt tự động ở đây dù
// `.close()` vẫn chạy đúng — giữ listener lại chỉ để đồng bộ khi đóng bằng
// cách KHÁC nút này, vd phím Esc, phòng khi trình duyệt thật của người chơi
// hoạt động khác môi trường test).
// Ép xoay ngang trên điện thoại (thay mục 10 cũ "danh sách dọc" ở màn hình
// BÀN CHƠI) — web không tự xoay được máy người dùng, chỉ có thể CHẶN thao
// tác bằng lớp phủ toàn màn hình cho tới khi họ tự xoay tay. Phần tử này LUÔN
// được thêm vào DOM mỗi lần vẽ màn hình bàn chơi; ẩn/hiện HOÀN TOÀN bằng CSS
// (`@media (orientation: portrait) and (max-width: 699px)`, xem style.css) —
// không cần JS lắng nghe orientationchange.
function renderOrientationLockOverlay(container: HTMLElement): void {
  const overlay = document.createElement("div");
  overlay.className = "orientation-lock-overlay";
  const msg = document.createElement("p");
  msg.textContent = "📱↻ Xoay ngang điện thoại để chơi";
  overlay.appendChild(msg);
  container.appendChild(overlay);
}

function renderDialog(container: HTMLElement, title: string, onClose: () => void, buildBody: (body: HTMLElement) => void): void {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";

  const heading = document.createElement("h3");
  heading.textContent = title;
  dialog.appendChild(heading);

  const body = document.createElement("div");
  buildBody(body);
  dialog.appendChild(body);

  dialog.appendChild(
    button("Đóng", () => {
      dialog.close();
      onClose();
    })
  );
  dialog.addEventListener("close", onClose);

  container.appendChild(dialog);
  dialog.showModal();
}

// Đợt 3 UI/UX (mục 9) — "Sẵn ở góc, không chiếm chỗ bàn": hàng nút cố định
// góc trên phải màn hình, bấm mới mở dialog tương ứng — thay hẳn khu nhật ký
// cố định luôn hiện trước đây. `onOpenRoomCode`: chỉ truyền vào (khác
// `undefined`) khi đang chơi qua mạng — hotseat không có mã phòng để mời.
function renderGameToolbar(
  container: HTMLElement,
  onOpenLog: () => void,
  onOpenSettings: () => void,
  onOpenRoomCode: (() => void) | undefined
): void {
  const toolbar = document.createElement("div");
  toolbar.className = "game-toolbar";
  toolbar.appendChild(button("Nhật ký ván đấu", onOpenLog));
  toolbar.appendChild(button("Cài đặt", onOpenSettings));
  if (onOpenRoomCode) {
    toolbar.appendChild(button("Mã phòng / Mời", onOpenRoomCode));
  }
  container.appendChild(toolbar);
}

// Danh sách các dòng nhật ký đã dịch sẵn (mới nhất ở ĐẦU mảng — xem main.ts) —
// nội dung BÊN TRONG dialog nhật ký, không tự tính lại từ GameEvent mỗi lần
// vẽ, chỉ vẽ chuỗi có sẵn.
function renderLogDialogBody(body: HTMLElement, log: string[]): void {
  if (log.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Chưa có gì trong nhật ký.";
    body.appendChild(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "log-list";
  for (const line of log) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
  body.appendChild(list);
}

// Nội dung dialog Cài đặt — dùng CHUNG hotseat/qua mạng, chỉ khác nhãn nút
// rời. CHỈ có đúng 1 hành động THẬT trong đợt này (rời ván) — âm thanh/giao
// diện sáng-tối/cỡ chữ đều CHƯA làm (xem "Chưa làm tới" ở CLAUDE.md), cố tình
// KHÔNG vẽ nút/toggle giả cho những thứ chưa có tác dụng thật, chỉ nói rõ.
function renderSettingsDialogBody(body: HTMLElement, leaveLabel: string, onLeave: () => void): void {
  const note = document.createElement("p");
  note.textContent = "Âm thanh, giao diện sáng/tối, cỡ chữ: chưa làm, để dành đợt sau.";
  body.appendChild(note);
  body.appendChild(button(leaveLabel, onLeave));
}

// Nội dung dialog Mã phòng/Mời — CHỈ chơi qua mạng (hotseat không có mã
// phòng). `copyStatus`: thông báo TẠM THỜI sau khi bấm "Chép mã" (thành công
// hay lỗi — trình duyệt/thiết bị có thể chặn Clipboard API), null = chưa bấm
// lần nào trong lượt mở dialog này.
function renderRoomCodeDialogBody(body: HTMLElement, roomCode: string, copyStatus: string | null, onCopy: () => void): void {
  const codeEl = document.createElement("p");
  codeEl.className = "summary";
  codeEl.textContent = `Mã phòng: ${roomCode}`;
  body.appendChild(codeEl);
  body.appendChild(button("Chép mã", onCopy));
  if (copyStatus) {
    const statusEl = document.createElement("p");
    statusEl.textContent = copyStatus;
    body.appendChild(statusEl);
  }
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
  // Giai đoạn 5, việc bổ sung — 3 nhân vật (Pedro Ramirez/Jesse Jones/Kit
  // Carlson) cần lựa chọn riêng ngoài các handler ở trên. "Không chọn"/mặc
  // định của cả 3 đều tái dùng onRespondTakeConsequence có sẵn.
  onPickDrawSource(cardId: string): void;
  onPickDrawTarget(targetId: string, letTargetChoose: boolean): void;
  onPickKeptCard(cardId: string): void;
  // Đợt 2 UI/UX (mục 4) — bấm "nở"/"thu gọn" khu trang bị của 1 seat khi bàn
  // >6 người. Client-only, không phải hành động ván đấu, không gửi lên server.
  onToggleSeatExpanded(playerId: string): void;
  // Đợt 3 UI/UX (mục 9) — mở/đóng 2 dialog góc màn hình (nhật ký/cài đặt).
  // Client-only, y hệt onToggleSeatExpanded — không liên quan GameState.
  onOpenLogDialog(): void;
  onCloseLogDialog(): void;
  onOpenSettingsDialog(): void;
  onCloseSettingsDialog(): void;
  // Nút "Về màn hình chính" BÊN TRONG dialog Cài đặt.
  onLeaveGame(): void;
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
  // Jesse Jones (đợt 5) — nạn nhân tự chọn 1 lá BẤT KỲ của mình để đưa, không
  // giới hạn tên lá như respondableCardName (chỉ dùng cho Missed!/Bang!).
  const isGivingCardToJesse = isResponding && top.kind === "NEED_GIVE_CARD_TO_PLAYER";

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      wrapper.appendChild(
        cardButton(cardId, () => handlers.onToggleDiscardCard(cardId), selected ? "card-box--checked" : undefined)
      );
      continue;
    }

    if (isDiscardFromHand || isGivingCardToJesse) {
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
    const name = cardNameFromId(cardId);
    const isDynamite = name === "dynamite";
    const dangerClass = equipmentDangerClass(name);

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    wrapper.appendChild(cardChip(cardId, dangerClass));
  }

  container.appendChild(wrapper);
}

// Đợt 2 UI/UX (mục 4, "QUY TẮC ĐÔNG NGƯỜI") — dùng CHUNG cho hotseat và qua
// mạng: TỪ 6 người trở xuống luôn hiện đầy đủ khu trang bị; HƠN 6 người mặc
// định thu gọn (chỉ hiện SỐ lá), bấm nút mới "nở" ra xem/thu lại — trạng thái
// nở là CLIENT-ONLY (expandedSeatIds, xem main.ts), không phải GameState.
// `forceShowFull`: đang có hành động THẬT SỰ cần bấm vào khu trang bị của
// đúng người này — LUÔN hiện đầy đủ bất kể đang thu gọn hay không (rõ ràng
// quan trọng hơn gọn gàng, CLAUDE.md).
function renderPlayerEquipmentArea(
  container: HTMLElement,
  totalPlayers: number,
  playerId: string,
  equipmentCount: number,
  expandedSeatIds: string[],
  onToggle: () => void,
  forceShowFull: boolean,
  renderFullEquipment: () => void
): void {
  const isCompactSeat = totalPlayers > 6;
  const isExpanded = expandedSeatIds.includes(playerId);
  const showFull = !isCompactSeat || isExpanded || forceShowFull;

  if (showFull) {
    const label = document.createElement("p");
    label.textContent = "Trang bị:";
    container.appendChild(label);
    renderFullEquipment();
    if (isCompactSeat && !forceShowFull) {
      container.appendChild(button("▾ Thu gọn trang bị", onToggle));
    }
    return;
  }

  const summary = document.createElement("p");
  summary.textContent = `Trang bị: ${equipmentCount} lá`;
  container.appendChild(summary);
  container.appendChild(button(`▸ Xem trang bị (${equipmentCount})`, onToggle));
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
  // Đợt 1 UI/UX (mục 1+8): 1 seat chỉ mang ĐÚNG 1 trong 4 trạng thái, ưu tiên
  // từ trên xuống — đã chết luôn thắng mọi thứ khác; đang có ai phải phản hồi
  // (đỉnh stack pending) thì KHÔNG seat nào còn được coi là "đang tới lượt"
  // nữa (kể cả người vừa đánh bài gốc — họ cũng đang CHỜ như mọi người khác).
  const topPending = state.pending[state.pending.length - 1];
  const isTargeted = player.alive && topPending !== undefined && topPending.player === player.id;
  const isCurrentTurn = player.alive && state.pending.length === 0 && index === state.currentPlayerIndex;
  if (!player.alive) el.classList.add("player--dead");
  else if (isTargeted) el.classList.add("player--targeted");
  else if (isCurrentTurn) el.classList.add("player--current");
  else el.classList.add("player--waiting");

  const headingRow = document.createElement("div");
  headingRow.className = "player__heading-row";
  // Đợt 5 UI/UX (mục 4 ý a) — lá nhân vật (đã chọn xong, công khai) sát cạnh
  // tên, chỉ hiện khi ván có bật cơ chế chọn nhân vật VÀ người này đã chọn.
  if (player.characterId) {
    headingRow.appendChild(characterChip(player.characterId));
  }
  const heading = document.createElement("h3");
  heading.textContent = player.name + (isCurrentTurn ? " ← đang tới lượt" : "");
  headingRow.appendChild(heading);
  el.appendChild(headingRow);

  if (isTargeted) {
    const targetedLabel = document.createElement("p");
    targetedLabel.className = "player--targeted-label";
    targetedLabel.textContent = "⚠ cần phản hồi";
    el.appendChild(targetedLabel);
  }

  const roleText = player.role ? ROLE_LABELS[player.role] : "(chưa chia vai)";
  const roleAndHp = document.createElement("p");
  roleAndHp.appendChild(document.createTextNode(`${roleText} · Máu: `));
  roleAndHp.appendChild(renderHpTrack(player.hp, player.maxHp));
  roleAndHp.appendChild(
    document.createTextNode(` · ${player.alive ? "Còn sống" : "Đã chết"}`)
  );
  el.appendChild(roleAndHp);

  const handLabel = document.createElement("p");
  handLabel.textContent = `Bài trên tay (${player.hand.length}):`;
  el.appendChild(handLabel);
  renderHandSection(el, state, player, options, handlers);

  // Đợt 2 UI/UX (mục 4) — đang có hành động THẬT SỰ cần bấm vào khu trang bị
  // của người này (Cat Balou bắt bỏ / Panic! chọn mục tiêu) → LUÔN hiện đầy
  // đủ, bất kể đang thu gọn — cùng điều kiện renderEquipmentSection() tự
  // kiểm tra bên trong nó, viết lại ở đây chỉ để QUYẾT ĐỊNH thu/nở.
  const forceShowEquipment =
    (topPending !== undefined &&
      topPending.player === player.id &&
      topPending.kind === "NEED_DISCARD_FROM_ZONE" &&
      topPending.zone === "equipment") ||
    (selection.step === "picking-panic-equipment" && selection.targetId === player.id);
  renderPlayerEquipmentArea(
    el,
    state.players.length,
    player.id,
    player.equipment.length,
    options.expandedSeatIds,
    () => handlers.onToggleSeatExpanded(player.id),
    forceShowEquipment,
    () => renderEquipmentSection(el, state, player, selection, handlers)
  );

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

  // Mục 8 UI/UX — "băng thông báo đầu bàn": luôn hiện ĐỈNH stack làm dòng
  // chính (⚠ + in đậm), các mục còn lại (nếu có) chỉ liệt kê phụ bên dưới —
  // cập nhật tự động theo đỉnh mỗi lần stack thay đổi (Gatling→Barrel→draw!...).
  const top = state.pending[state.pending.length - 1];

  const panel = document.createElement("div");
  panel.className = "reaction-banner";

  const head = document.createElement("p");
  head.className = "reaction-banner__head";
  head.textContent = `⚠ Đang chờ: ${pendingDescription(state, top)}`;
  panel.appendChild(head);

  if (state.pending.length > 1) {
    const note = document.createElement("p");
    note.className = "reaction-banner__note";
    note.textContent = `+${state.pending.length - 1} việc khác đang chờ (xử lý sau khi xong việc trên):`;
    panel.appendChild(note);

    const list = document.createElement("ol");
    list.className = "pending-list";
    // Duyệt từ NGAY DƯỚI đỉnh xuống đáy — đúng thứ tự sẽ được xử lý sau đó.
    for (let i = state.pending.length - 2; i >= 0; i--) {
      const item = state.pending[i];
      const li = document.createElement("li");
      li.className = "pending-item";
      li.textContent = `Sắp tới: ${pendingDescription(state, item)}`;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }

  // Nút phản hồi CHỈ áp dụng cho đỉnh stack — các mục "sắp tới" không có nút,
  // vì chưa tới lượt xử lý (phải giải quyết xong đỉnh trước).
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
  } else if (top.kind === "NEED_PICK_DRAW_SOURCE") {
    const topOfDiscard = state.discardPile[state.discardPile.length - 1];
    if (topOfDiscard) {
      const wrapper = document.createElement("div");
      wrapper.className = "cards";
      wrapper.appendChild(cardButton(topOfDiscard, () => handlers.onPickDrawSource(topOfDiscard)));
      panel.appendChild(wrapper);
    }
    panel.appendChild(button("Rút từ bộ bài", () => handlers.onRespondTakeConsequence()));
  } else if (top.kind === "NEED_PICK_DRAW_TARGET") {
    panel.appendChild(button("Rút từ bộ bài", () => handlers.onRespondTakeConsequence()));
    for (const p of state.players) {
      if (!p.alive || p.id === top.player) continue;
      panel.appendChild(button(`${p.name}: để họ tự chọn lá đưa`, () => handlers.onPickDrawTarget(p.id, true)));
      panel.appendChild(button(`${p.name}: cướp ngẫu nhiên`, () => handlers.onPickDrawTarget(p.id, false)));
    }
  } else if (top.kind === "NEED_GIVE_CARD_TO_PLAYER") {
    panel.appendChild(button("Không chọn — rút ngẫu nhiên thay tôi", () => handlers.onRespondTakeConsequence()));
  } else if (top.kind === "NEED_PICK_KEPT_CARDS") {
    const wrapper = document.createElement("div");
    wrapper.className = "cards";
    for (const cardId of top.cards) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onPickKeptCard(cardId)));
    }
    panel.appendChild(wrapper);
    panel.appendChild(button("Giữ 2 lá đầu (bỏ lá thứ 3)", () => handlers.onRespondTakeConsequence()));
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
  // Bấm 1 trong 2 lá — CHỈ đánh dấu "đang cân nhắc" (armed), CHƯA gửi đi thật.
  // Bấm lá KIA thì tự đổi armed sang lá đó — không cần huỷ trước.
  onArmCharacterChoice(playerId: string, characterId: string): void;
  // Bấm nút "Xác nhận" riêng mới thật sự gửi CHOOSE_CHARACTER — tách hẳn khỏi
  // bấm lá (xem ghi chú characterButton()/characterOptionCard() ở trên: tránh
  // bấm nhầm lúc chỉ định xem mô tả chức năng, đặc biệt trên điện thoại).
  onConfirmCharacterChoice(playerId: string): void;
}

export function renderCharacterSelectionScreen(
  container: HTMLElement,
  players: PlayerState[],
  characterSelection: CharacterChoice[],
  // playerId -> characterId đang được người đó "cầm lên" chờ xác nhận, chưa
  // gửi đi — trạng thái TẠM THỜI chỉ có ở client (main.ts), không phải
  // GameState (giống hệt `selection` dùng cho chọn mục tiêu Bang!/Panic!...).
  armedChoices: Record<string, string>,
  handlers: CharacterSelectionHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chọn nhân vật";
  container.appendChild(heading);

  const rule = document.createElement("p");
  rule.textContent =
    "Mỗi người xem 2 lá nhân vật riêng của mình rồi chọn giữ 1 lá — bấm được theo bất kỳ thứ tự nào, không cần chờ ai. " +
    "Bấm 1 lá để xem kỹ, rồi bấm \"Xác nhận\" mới thật sự chọn.";
  container.appendChild(rule);

  for (const choice of characterSelection) {
    const player = players.find((p) => p.id === choice.playerId);
    const playerName = player?.name ?? choice.playerId;
    const section = document.createElement("div");
    section.className = "panel";

    const nameEl = document.createElement("h3");
    section.appendChild(nameEl);

    // Bổ sung theo phản hồi thật: hiện luôn vai mỗi người ngay từ lúc chọn
    // nhân vật — hotseat vốn không giấu gì (dùng thẳng GameState đầy đủ, xem
    // ghi chú CharacterSelectionHandlers ở trên), nên hiện được vai THẬT của
    // TẤT CẢ mọi người, không chỉ chính mình/Sheriff.
    const roleEl = document.createElement("p");
    roleEl.textContent = `Vai: ${player?.role ? ROLE_LABELS[player.role] : "(chưa chia vai)"}`;
    section.appendChild(roleEl);

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    if (choice.chosen) {
      nameEl.textContent = `${playerName} — đã chọn`;
      cardsEl.appendChild(characterChip(choice.chosen));
      section.appendChild(cardsEl);
    } else {
      const armedId = armedChoices[choice.playerId];
      nameEl.textContent = `${playerName} — chọn 1 trong 2 lá`;
      for (const characterId of choice.options) {
        cardsEl.appendChild(
          characterOptionCard(characterId, characterId === armedId, () =>
            handlers.onArmCharacterChoice(choice.playerId, characterId)
          )
        );
      }
      section.appendChild(cardsEl);

      if (armedId) {
        section.appendChild(
          button(`Xác nhận chọn ${characterLabel(armedId)}`, () => handlers.onConfirmCharacterChoice(choice.playerId))
        );
      }
    }

    container.appendChild(section);
  }
}

export interface RenderOptions {
  selection: Selection;
  error: string | null;
  discardSelection: string[]; // các cardId đã chọn để bỏ, chỉ có ý nghĩa khi turnPhase === "discard"
  lastDrawCheck: DrawCheckNotice;
  log: string[]; // việc 4.2: nhật ký ván đấu, mới nhất ở đầu mảng
  expandedSeatIds: string[]; // Đợt 2 UI/UX (mục 4) — playerId nào đang "nở" khu trang bị khi bàn >6 người
  logDialogOpen: boolean; // Đợt 3 UI/UX (mục 9)
  settingsDialogOpen: boolean;
}

export function renderApp(
  container: HTMLElement,
  state: GameState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  container.replaceChildren();

  renderOrientationLockOverlay(container);
  // Phản hồi thật: thanh nút góc trên (`.game-toolbar`) trước đây `position:
  // fixed` NỔI ĐÈ lên nội dung — seat trên cùng của bàn tròn hay bị che
  // khuất. Vẽ toolbar NGAY ĐẦU (trước mọi nội dung khác) + CSS đổi sang
  // `position: sticky` (xem style.css): giờ nó CHIẾM 1 hàng thật ở đầu
  // trang, nội dung phía dưới luôn bắt đầu SAU nó, không bao giờ bị che.
  renderGameToolbar(container, handlers.onOpenLogDialog, handlers.onOpenSettingsDialog, undefined);

  if (options.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = options.error;
    container.appendChild(errorEl);
  }

  const summary = document.createElement("p");
  summary.className = "summary";
  const nameOfPlayer = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  summary.textContent =
    `Giai đoạn lượt: ${TURN_PHASE_LABELS[state.turnPhase]}` +
    (state.winner ? ` · VÁN KẾT THÚC — thắng: ${describeWinner(state.winner, nameOfPlayer)}` : "");
  container.appendChild(summary);

  container.appendChild(renderTableCenter(state.deck.length, state.discardPile));

  renderActiveHouseRules(container, state.houseRules);

  renderDrawCheckNotice(container, options.lastDrawCheck);

  if (state.winner) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.appendChild(button("Chơi ván mới", () => handlers.onPlayAgain()));
    container.appendChild(panel);
  }

  if (options.selection.step !== "idle") {
    const hint = document.createElement("div");
    hint.className = "panel";
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

  if (options.logDialogOpen) {
    renderDialog(container, "Nhật ký ván đấu", handlers.onCloseLogDialog, (body) => renderLogDialogBody(body, options.log));
  }
  if (options.settingsDialogOpen) {
    renderDialog(container, "Cài đặt", handlers.onCloseSettingsDialog, (body) =>
      renderSettingsDialogBody(body, "Về màn hình chính", handlers.onLeaveGame)
    );
  }
}

// ----- Việc 2.5: màn hình thiết lập ván mới (chế độ hotseat — 2-8 người
// chia nhau gõ tên rồi ngồi chung 1 máy chơi hết ván; 2/3 người là biến thể
// riêng của dự án, 4-8 người theo luật gốc BANG!, xem LO-TRINH.md). Đây là
// màn hình HIỆN RA TRƯỚC khi có GameState (chưa gọi setupGame()), nên không
// nhận GameState làm tham số như renderApp() — chỉ nhận danh sách tên đang
// gõ dở.

export interface SetupHandlers {
  onNameChange(index: number, value: string): void;
  onAddPlayer(): void;
  onRemovePlayer(): void;
  onToggleHouseRule(id: HouseRuleId): void;
  onStartGame(): void;
}

const MIN_PLAYERS = 2; // biến thể 2 người (xem LO-TRINH.md) — setup.ts's isDuelMode()
const MAX_PLAYERS = 8; // biến thể 8 người (xem LO-TRINH.md) — setup.ts's ROLE_SETS đã hỗ trợ

export function renderSetupScreen(
  container: HTMLElement,
  names: string[],
  error: string | null,
  selectedHouseRules: HouseRuleId[],
  handlers: SetupHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Thiết lập ván mới (chơi chung 1 máy)";
  container.appendChild(heading);

  const hint = document.createElement("p");
  hint.textContent = `Cần 2-8 người chơi — đang có ${names.length}. Mỗi người tự gõ tên của mình.`;
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

  renderHouseRuleCheckboxes(container, selectedHouseRules, handlers.onToggleHouseRule);

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
  onToggleHouseRule(id: HouseRuleId): void;
  onStartGame(): void;
}

// 2-8 người đều hợp lệ (2/3 người là biến thể riêng, xem LO-TRINH.md).
const MIN_NETWORK_PLAYERS = 2;

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
  // Việc 5.3 — chỉ CHỦ PHÒNG chọn (giống seed: không broadcast lựa chọn đang
  // gõ dở cho cả phòng), gửi kèm 1 lần lúc bấm "Bắt đầu ván". Người khác
  // không thấy checkbox này, chỉ thấy dòng chờ như trước.
  selectedHouseRules: HouseRuleId[],
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
    renderHouseRuleCheckboxes(container, selectedHouseRules, handlers.onToggleHouseRule);

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
  onPickDrawSource(cardId: string): void;
  onPickDrawTarget(targetId: string, letTargetChoose: boolean): void;
  onPickKeptCard(cardId: string): void;
  // Đợt 2 UI/UX (mục 4) — giống hệt UiHandlers (hotseat), xem ghi chú ở đó.
  onToggleSeatExpanded(playerId: string): void;
  // Đợt 3 UI/UX (mục 9) — giống UiHandlers (hotseat), cộng thêm dialog Mã
  // phòng/Mời (CHỈ qua mạng — hotseat không có mã phòng).
  onOpenLogDialog(): void;
  onCloseLogDialog(): void;
  onOpenSettingsDialog(): void;
  onCloseSettingsDialog(): void;
  onOpenRoomCodeDialog(): void;
  onCloseRoomCodeDialog(): void;
  onCopyRoomCode(): void;
  // "Rời phòng" BÊN TRONG dialog Cài đặt — đóng WebSocket chủ động (khác
  // mất mạng), quay lại màn hình chính.
  onLeaveGame(): void;
}

export interface NetworkGameOptions {
  selection: Selection;
  error: string | null;
  discardSelection: string[];
  lastDrawCheck: DrawCheckNotice;
  deadline: DeadlineInfo | null;
  log: string[]; // việc 4.2: nhật ký ván đấu, mới nhất ở đầu mảng
  connectedPlayerIds: string[]; // việc 4.3: ai đang có socket mở thật sự
  expandedSeatIds: string[]; // Đợt 2 UI/UX (mục 4) — giống RenderOptions (hotseat)
  logDialogOpen: boolean; // Đợt 3 UI/UX (mục 9)
  settingsDialogOpen: boolean;
  roomCodeDialogOpen: boolean;
  roomCode: string;
  roomCodeCopyStatus: string | null; // thông báo tạm thời sau khi bấm "Chép mã"
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
  // Jesse Jones (đợt 5) — nạn nhân tự chọn 1 lá BẤT KỲ của mình để đưa, không
  // giới hạn tên lá như respondableCardName (chỉ dùng cho Missed!/Bang!).
  const isGivingCardToJesse = isResponding && top.kind === "NEED_GIVE_CARD_TO_PLAYER";

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      wrapper.appendChild(
        cardButton(cardId, () => handlers.onToggleDiscardCard(cardId), selected ? "card-box--checked" : undefined)
      );
      continue;
    }

    if (isDiscardFromHand || isGivingCardToJesse) {
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
  // player.id === view.viewerId: CHỈ đúng nạn nhân (không phải ai khác đang
  // xem) mới thấy nút bấm — y hệt cách networkRenderHandSection() đã làm.
  const isDiscardFromEquipment =
    top !== undefined &&
    top.player === player.id &&
    player.id === view.viewerId &&
    top.kind === "NEED_DISCARD_FROM_ZONE" &&
    top.zone === "equipment";
  const isPickingPanicTarget = selection.step === "picking-panic-equipment" && selection.targetId === player.id;

  for (const cardId of player.equipment) {
    const name = cardNameFromId(cardId);
    const isDynamite = name === "dynamite";
    const dangerClass = equipmentDangerClass(name);

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    wrapper.appendChild(cardChip(cardId, dangerClass));
  }

  container.appendChild(wrapper);
}

// Đợt 1 UI/UX (mục 3+12) — bố cục bàn tròn CHỈ cho ván chơi qua mạng (đã hỏi
// và chốt với chủ dự án: hotseat không có 1 "BẠN" duy nhất nên không áp dụng).
// 1 CÔNG THỨC DUY NHẤT cho mọi N từ 2-8 người, không hardcode từng trường hợp.
//
// `seatIndex` là vị trí (0-indexed) trong MẢNG ĐÃ XOAY `seatOrder` (xem
// buildSeatOrder() bên dưới) — phần tử CUỐI (seatIndex === seatTotal - 1) LUÔN
// là BẠN. Góc 90° = đáy màn hình (quy ước CSS: 0°=phải, 90°=dưới, tăng dần
// THEO CHIỀU KIM ĐỒNG HỒ vì trục y màn hình hướng XUỐNG) — dùng 90 làm gốc để
// BẠN (luôn là seatIndex cuối, seatIndex+1 === seatTotal → trọn 1 vòng 360°
// cộng thêm) rơi đúng vào 90°.
// (Lỗi đã sửa: bản đầu dùng gốc 270° — SAI, cho BẠN lên đỉnh bàn thay vì đáy,
// phát hiện lúc tự kiểm bằng trình duyệt thật, xem CLAUDE.md.)
function seatAngleDeg(seatIndex: number, seatTotal: number): number {
  return (90 + ((seatIndex + 1) * 360) / seatTotal) % 360;
}

// Đổi góc (độ) sang toạ độ % trên ellipse tâm (50%, 50%), bán kính rx/ry theo
// % — dùng cho CSS custom property --seat-x/--seat-y (xem .player--seat ở
// style.css, chỉ có hiệu lực từ @media (min-width: 700px) trở lên).
function seatPositionPercent(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const rx = 42;
  const ry = 38;
  return { x: 50 + rx * Math.cos(rad), y: 50 + ry * Math.sin(rad) };
}

// Xoay view.players sao cho bắt đầu từ người NGAY SAU viewer, kết thúc bằng
// CHÍNH viewer (luôn là phần tử CUỐI mảng trả về) — thứ tự này vừa dùng làm
// thứ tự DOM (danh sách dọc trên điện thoại, mục 10) vừa làm input cho
// seatAngleDeg() (bàn tròn trên màn rộng), KHÔNG cần đổi gì khi chuyển đổi
// giữa 2 cách xếp — chỉ CSS quyết định, xem mục 10: "cùng dữ liệu, khác cách xếp".
function buildSeatOrder(view: PlayerView): { player: PlayerHandView; originalIndex: number }[] {
  const n = view.players.length;
  const viewerIndex = view.players.findIndex((p) => p.id === view.viewerId);
  const startIndex = viewerIndex === -1 ? 0 : (viewerIndex + 1) % n;
  return Array.from({ length: n }, (_, k) => {
    const originalIndex = (startIndex + k) % n;
    return { player: view.players[originalIndex], originalIndex };
  });
}

function networkRenderPlayer(
  view: PlayerView,
  player: PlayerHandView,
  originalIndex: number,
  // Đợt 1 UI/UX (mục 3) — vị trí (0-indexed) VÀ tổng số ghế trong `seatOrder`
  // (mảng đã xoay để BẠN luôn ở cuối, xem renderNetworkGame()) — dùng để tính
  // góc/toạ độ bàn tròn. KHÁC `originalIndex` (vị trí thật trong view.players,
  // dùng để so `currentPlayerIndex` — 2 mảng thứ tự khác nhau).
  seatIndex: number,
  seatTotal: number,
  options: NetworkGameOptions,
  handlers: NetworkGameHandlers
): HTMLElement {
  const { selection } = options;
  const el = document.createElement("article");
  // Phản hồi thật sau đợt sửa "dàn hàng ngang": cho MỌI seat cùng nới rộng
  // theo nội dung (.player--seat, xem CSS) khiến seat của người khác — có
  // thể có vài lá trang bị công khai — thỉnh thoảng nới ra đè lên seat cạnh
  // bên. Chỉ seat CỦA CHÍNH MÌNH mới thật sự cần rộng (tay đầy đủ, có thể
  // 5-8 lá); seat người khác chỉ hiện số lá tay (ẩn) + trang bị thường ít
  // hơn — `.player--seat-self` (CSS riêng) mới được phép nới, seat khác giữ
  // cỡ an toàn cũ + cuộn ngang nếu lỡ có quá nhiều trang bị.
  el.className = "player player--seat" + (player.id === view.viewerId ? " player--seat-self" : "");

  const { x, y } = seatPositionPercent(seatAngleDeg(seatIndex, seatTotal));
  el.style.setProperty("--seat-x", `${x}%`);
  el.style.setProperty("--seat-y", `${y}%`);

  // Đợt 1 UI/UX (mục 1+8) — cùng logic ưu tiên trạng thái với renderPlayer()
  // (hotseat), viết riêng vì đọc PlayerView/PlayerHandView đã lọc, không phải
  // GameState/PlayerState đầy đủ.
  const topPending = view.pending[view.pending.length - 1];
  const isTargeted = player.alive && topPending !== undefined && topPending.player === player.id;
  const isCurrentTurn = player.alive && view.pending.length === 0 && originalIndex === view.currentPlayerIndex;
  if (!player.alive) el.classList.add("player--dead");
  else if (isTargeted) el.classList.add("player--targeted");
  else if (isCurrentTurn) el.classList.add("player--current");
  else el.classList.add("player--waiting");

  const headingRow = document.createElement("div");
  headingRow.className = "player__heading-row";
  // Đợt 5 UI/UX (mục 4 ý a) — giống hotseat, dùng characterId mới thêm vào
  // PlayerHandView (core/view.ts) — công khai, không cần lọc gì thêm ở đây.
  if (player.characterId) {
    headingRow.appendChild(characterChip(player.characterId));
  }
  const heading = document.createElement("h3");
  heading.textContent =
    player.name +
    (isCurrentTurn ? " ← đang tới lượt" : "") +
    (player.id === view.viewerId ? " (bạn)" : "") +
    // Việc 4.3: không tính chính mình — chính socket đang vẽ màn hình này thì
    // chắc chắn đang kết nối, không cần báo lại chuyện hiển nhiên đó.
    (player.id !== view.viewerId && !options.connectedPlayerIds.includes(player.id) ? " ⚠ đã mất kết nối" : "");
  headingRow.appendChild(heading);
  el.appendChild(headingRow);

  if (isTargeted) {
    const targetedLabel = document.createElement("p");
    targetedLabel.className = "player--targeted-label";
    targetedLabel.textContent = "⚠ cần phản hồi";
    el.appendChild(targetedLabel);
  }

  const roleText = player.role ? ROLE_LABELS[player.role] : "(ẩn)";
  const roleAndHp = document.createElement("p");
  roleAndHp.appendChild(document.createTextNode(`${roleText} · Máu: `));
  roleAndHp.appendChild(renderHpTrack(player.hp, player.maxHp));
  roleAndHp.appendChild(
    document.createTextNode(` · ${player.alive ? "Còn sống" : "Đã chết"}`)
  );
  el.appendChild(roleAndHp);

  const handLabel = document.createElement("p");
  handLabel.textContent = "Bài trên tay:";
  el.appendChild(handLabel);
  networkRenderHandSection(el, view, player, options, handlers);

  // Đợt 2 UI/UX (mục 4) — seat của BẠN LUÔN đầy đủ ("Seat của BẠN (đáy): luôn
  // hiện đầy đủ", khác quy tắc >6 người thu gọn áp cho người khác) — vế đầu
  // đã đủ bao quát ca "chính mình đang cần bấm bỏ trang bị" nên không cần lặp
  // lại điều kiện NEED_DISCARD_FROM_ZONE riêng như bên hotseat.
  const forceShowEquipment =
    player.id === view.viewerId || (selection.step === "picking-panic-equipment" && selection.targetId === player.id);
  renderPlayerEquipmentArea(
    el,
    view.players.length,
    player.id,
    player.equipment.length,
    options.expandedSeatIds,
    () => handlers.onToggleSeatExpanded(player.id),
    forceShowEquipment,
    () => networkRenderEquipmentSection(el, view, player, selection, handlers)
  );

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

// Mục 8 UI/UX — "băng thông báo đầu bàn". `deadline` CHỈ truyền vào khi kind
// là "reactive" (xem renderNetworkGame() — room.ts đảm bảo kind này LUÔN đi
// kèm `top.player === deadline.playerId` khi pending không rỗng, xem
// determineActiveDecision() ở room.ts), nên gộp thẳng đồng hồ vào dòng đỉnh
// stack mà không cần so khớp lại playerId ở đây.
function networkRenderPendingPanel(
  container: HTMLElement,
  view: PlayerView,
  handlers: NetworkGameHandlers,
  deadline: DeadlineInfo | null
): void {
  if (view.pending.length === 0) return;

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

  const top = view.pending[view.pending.length - 1];

  const panel = document.createElement("div");
  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline.expiresAt - Date.now()) / 1000)) : null;
  const isUrgent = secondsLeft !== null && secondsLeft <= 10;
  panel.className = "reaction-banner" + (isUrgent ? " reaction-banner--urgent" : "");

  const head = document.createElement("p");
  head.className = "reaction-banner__head";
  const headText = document.createElement("span");
  headText.textContent = `⚠ Đang chờ: ${describe(top)}`;
  head.appendChild(headText);
  if (secondsLeft !== null) {
    const clock = document.createElement("span");
    clock.className = "reaction-banner__countdown" + (isUrgent ? " reaction-banner__countdown--urgent" : "");
    clock.textContent = `⏱ Còn ${secondsLeft}s`;
    head.appendChild(clock);
  }
  panel.appendChild(head);

  // Nhắc rõ đồng hồ LƯỢT (60s, việc 4.1) của người đang tới lượt đang tạm dừng
  // trong lúc chờ phản hồi này — khớp mục 8: "thể hiện rõ đồng hồ nào đang chạy".
  if (view.turnPhase === "play") {
    const currentPlayerName = view.players[view.currentPlayerIndex]?.name ?? "?";
    const note = document.createElement("p");
    note.className = "reaction-banner__note";
    note.textContent = `(Đồng hồ lượt của ${currentPlayerName} đang tạm dừng, chờ xong việc trên sẽ tiếp tục.)`;
    panel.appendChild(note);
  }

  if (view.pending.length > 1) {
    const note = document.createElement("p");
    note.className = "reaction-banner__note";
    note.textContent = `+${view.pending.length - 1} việc khác đang chờ (xử lý sau khi xong việc trên):`;
    panel.appendChild(note);

    const list = document.createElement("ol");
    list.className = "pending-list";
    // Duyệt từ NGAY DƯỚI đỉnh xuống đáy — đúng thứ tự sẽ được xử lý sau đó.
    for (let i = view.pending.length - 2; i >= 0; i--) {
      const item = view.pending[i];
      const li = document.createElement("li");
      li.className = "pending-item";
      li.textContent = `Sắp tới: ${describe(item)}`;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }

  // Nút phản hồi CHỈ hiện khi ĐÚNG là CHÍNH MÌNH đang bị chờ trả lời — người
  // khác cũng đang chờ (vd Gatling bắn cả phòng) thì mỗi người chỉ thấy nút ở
  // đúng lượt phản hồi của họ trên máy của họ.
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
    } else if (top.kind === "NEED_PICK_DRAW_SOURCE") {
      const topOfDiscard = view.discardPile[view.discardPile.length - 1];
      if (topOfDiscard) {
        const wrapper = document.createElement("div");
        wrapper.className = "cards";
        wrapper.appendChild(cardButton(topOfDiscard, () => handlers.onPickDrawSource(topOfDiscard)));
        panel.appendChild(wrapper);
      }
      panel.appendChild(button("Rút từ bộ bài", () => handlers.onRespondTakeConsequence()));
    } else if (top.kind === "NEED_PICK_DRAW_TARGET") {
      panel.appendChild(button("Rút từ bộ bài", () => handlers.onRespondTakeConsequence()));
      for (const p of view.players) {
        if (!p.alive || p.id === top.player) continue;
        panel.appendChild(button(`${p.name}: để họ tự chọn lá đưa`, () => handlers.onPickDrawTarget(p.id, true)));
        panel.appendChild(button(`${p.name}: cướp ngẫu nhiên`, () => handlers.onPickDrawTarget(p.id, false)));
      }
    } else if (top.kind === "NEED_GIVE_CARD_TO_PLAYER") {
      panel.appendChild(button("Không chọn — rút ngẫu nhiên thay tôi", () => handlers.onRespondTakeConsequence()));
    } else if (top.kind === "NEED_PICK_KEPT_CARDS") {
      if (top.cards) {
        const wrapper = document.createElement("div");
        wrapper.className = "cards";
        for (const cardId of top.cards) {
          wrapper.appendChild(cardButton(cardId, () => handlers.onPickKeptCard(cardId)));
        }
        panel.appendChild(wrapper);
      }
      panel.appendChild(button("Giữ 2 lá đầu (bỏ lá thứ 3)", () => handlers.onRespondTakeConsequence()));
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
  // Giống hệt CharacterSelectionHandlers (hotseat) — bấm lá chỉ "cầm lên" chờ
  // xác nhận, KHÔNG gửi ngay (xem ghi chú characterOptionCard() ở trên).
  onArmCharacterChoice(characterId: string): void;
  onConfirmCharacterChoice(): void;
}

export function renderNetworkCharacterSelectionScreen(
  container: HTMLElement,
  view: PlayerView,
  deadline: DeadlineInfo | null,
  // characterId đang được CHÍNH MÌNH "cầm lên" chờ xác nhận — chỉ cần 1 giá
  // trị (không phải map theo playerId như hotseat), vì qua mạng chỉ CHÍNH
  // MÌNH mới bấm chọn được cho chính mình.
  armedCharacterId: string | null,
  handlers: NetworkCharacterSelectionHandlers
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chọn nhân vật";
  container.appendChild(heading);

  const rule = document.createElement("p");
  rule.textContent =
    "Xem 2 lá nhân vật riêng của bạn rồi chọn giữ 1 lá — không cần chờ người khác chọn xong. " +
    "Bấm 1 lá để xem kỹ, rồi bấm \"Xác nhận\" mới thật sự chọn.";
  container.appendChild(rule);

  renderCountdown(container, deadline, view.players);

  const choices: CharacterChoiceView[] = view.characterSelection ?? [];
  for (const choice of choices) {
    const player = view.players.find((p) => p.id === choice.playerId);
    const playerName = player?.name ?? choice.playerId;
    const isMe = choice.playerId === view.viewerId;
    const section = document.createElement("div");
    section.className = "panel";

    const nameEl = document.createElement("h3");
    section.appendChild(nameEl);

    // Bổ sung theo phản hồi thật: hiện vai ngay từ lúc chọn nhân vật —
    // `player.role` ở đây đã qua viewFor()/viewRole() lọc đúng (quy tắc 6):
    // chỉ CHÍNH MÌNH + Sheriff công khai, người khác vẫn "(ẩn)" như mọi lúc
    // khác trong ván, không lộ gì thêm so với sau khi vào bàn chơi thật.
    const roleEl = document.createElement("p");
    roleEl.textContent = `Vai: ${player?.role ? ROLE_LABELS[player.role] : "(ẩn)"}`;
    section.appendChild(roleEl);

    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";

    if (choice.chosen) {
      nameEl.textContent = `${playerName}${isMe ? " (bạn)" : ""} — đã chọn`;
      cardsEl.appendChild(characterChip(choice.chosen));
      section.appendChild(cardsEl);
    } else if (isMe && choice.options) {
      nameEl.textContent = `${playerName} (bạn) — chọn 1 trong 2 lá`;
      for (const characterId of choice.options) {
        cardsEl.appendChild(
          characterOptionCard(characterId, characterId === armedCharacterId, () =>
            handlers.onArmCharacterChoice(characterId)
          )
        );
      }
      section.appendChild(cardsEl);

      if (armedCharacterId) {
        section.appendChild(
          button(`Xác nhận chọn ${characterLabel(armedCharacterId)}`, () => handlers.onConfirmCharacterChoice())
        );
      }
    } else {
      nameEl.textContent = `${playerName} — đang chọn...`;
    }

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

  renderOrientationLockOverlay(container);
  // Phản hồi thật: xem ghi chú y hệt ở renderApp() — vẽ toolbar NGAY ĐẦU +
  // CSS `position: sticky` để nó chiếm chỗ thật, không đè lên seat trên
  // cùng của bàn tròn nữa.
  renderGameToolbar(container, handlers.onOpenLogDialog, handlers.onOpenSettingsDialog, handlers.onOpenRoomCodeDialog);

  if (options.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.textContent = options.error;
    container.appendChild(errorEl);
  }

  const summary = document.createElement("p");
  summary.className = "summary";
  const nameOfPlayer = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  summary.textContent =
    `Giai đoạn lượt: ${TURN_PHASE_LABELS[view.turnPhase]}` +
    (view.winner ? ` · VÁN KẾT THÚC — thắng: ${describeWinner(view.winner, nameOfPlayer)}` : "");
  container.appendChild(summary);

  container.appendChild(renderTableCenter(view.deckCount, view.discardPile));

  renderActiveHouseRules(container, view.houseRules);

  // Mục 8 UI/UX: khi có việc đang chờ phản hồi (pending không rỗng), đồng hồ
  // (nếu có) LUÔN thuộc kind "reactive" của ĐÚNG việc đó (xem room.ts) — gộp
  // thẳng vào băng thông báo bên dưới thay vì hiện đứng riêng, để đọc thành 1
  // câu duy nhất "đang chờ ai làm gì, còn bao nhiêu giây". Không có gì đang
  // chờ thì đây là đồng hồ LƯỢT/bỏ bài thừa bình thường, vẫn đứng riêng.
  if (view.pending.length === 0) {
    renderCountdown(container, options.deadline, view.players);
  }
  renderDrawCheckNotice(container, options.lastDrawCheck);

  if (options.selection.step !== "idle") {
    const hint = document.createElement("div");
    hint.className = "panel";
    hint.appendChild(document.createTextNode("Đang chọn mục tiêu... "));
    hint.appendChild(button("Huỷ", () => handlers.onCancelSelection()));
    container.appendChild(hint);
  }

  networkRenderPendingPanel(container, view, handlers, view.pending.length > 0 ? options.deadline : null);
  networkRenderPhaseActions(container, view, options, handlers);

  // Đợt 1 UI/UX (mục 3+10) — .table bọc ngoài chỉ cho ván qua mạng (hotseat
  // không có, xem renderApp()/renderPlayer() ở trên: giữ nguyên .players cũ).
  // seatOrder xoay để BẠN luôn là phần tử CUỐI — vừa là thứ tự DOM (danh sách
  // dọc, màn hẹp) vừa là input tính góc bàn tròn (màn rộng, xem CSS).
  const tableEl = document.createElement("div");
  tableEl.className = "table";
  const seatsEl = document.createElement("div");
  seatsEl.className = "players seats";
  const seatOrder = buildSeatOrder(view);
  seatOrder.forEach(({ player, originalIndex }, seatIndex) => {
    seatsEl.appendChild(networkRenderPlayer(view, player, originalIndex, seatIndex, seatOrder.length, options, handlers));
  });
  tableEl.appendChild(seatsEl);
  container.appendChild(tableEl);

  if (options.logDialogOpen) {
    renderDialog(container, "Nhật ký ván đấu", handlers.onCloseLogDialog, (body) => renderLogDialogBody(body, options.log));
  }
  if (options.settingsDialogOpen) {
    renderDialog(container, "Cài đặt", handlers.onCloseSettingsDialog, (body) =>
      renderSettingsDialogBody(body, "Rời phòng", handlers.onLeaveGame)
    );
  }
  if (options.roomCodeDialogOpen) {
    renderDialog(container, "Mã phòng / Mời", handlers.onCloseRoomCodeDialog, (body) =>
      renderRoomCodeDialogBody(body, options.roomCode, options.roomCodeCopyStatus, handlers.onCopyRoomCode)
    );
  }
}
