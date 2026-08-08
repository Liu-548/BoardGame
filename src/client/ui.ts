// Việc 2.2 (vẽ state) + 2.3 (bấm bài → gọi reduce) + 2.4 (hiện đầy đủ stack
// pending, không chỉ đỉnh) + 2.5 (màn hình thiết lập + chơi lại, chế độ
// hotseat). Nhãn tiếng Việt (tên bài, tên vai) chỉ để HIỂN THỊ nên đặt ở đây,
// không đặt trong core/ — core/ không quan tâm chuyện trình bày.

import { cardNameFromId, cardSuitRankFromId, isDelayedEquipmentCardName, isSelfEquipBlueCardName, yellowCardActsAsMissed, WEAPON_RANGES } from "../core/cards";
import type { CardName } from "../core/cards";
import { CHARACTERS, computeStartingHp, getCharacterDefinition } from "../core/characters";
import { EVENT_CARDS, EXPANSION_EVENT_IDS } from "../core/events";
import type { EventId } from "../core/events";
import type { CharacterChoice, ExpansionId, GameEvent, GameState, HouseRuleId, PendingAction, PlayerState, Rank, Role, Suit, Winner } from "../core/types";
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
  // Mở rộng Dodge City (đợt 1/40 lá — xem Luat_Bang_Mo_Rong_DodgeCity.txt).
  bible: "Kinh Thánh",
  sombrero: "Mũ Sombrero",
  ten_gallon_hat: "Mũ 10 Gallon",
  iron_plate: "Áo giáp sắt",
  canteen: "Bi đông nước",
  pony_express: "Trạm ngựa Pony Express",
  // Mở rộng Dodge City đợt 2 (34/40 lá còn lại).
  binocular: "Ống nhòm (-1)",
  hideout: "Hầm trú ẩn (+1)",
  brawl: "Ẩu đả",
  dodge: "Né đòn",
  punch: "Đấm",
  rag_time: "Rag Time",
  springfield: "Súng Springfield",
  tequila: "Rượu Tequila",
  whisky: "Rượu Whisky",
  derringer: "Súng Derringer",
  conestoga: "Xe Conestoga",
  can_can: "Can Can",
  buffalo_rifle: "Súng trường Buffalo",
  knife: "Dao găm",
  pepperbox: "Súng Pepperbox",
  howitzer: "Đại bác Howitzer",
};

// Việc 4.6: mô tả ngắn chức năng từng lá — soạn theo ĐÚNG luật đã cài trong
// reduce.ts (bản tự chỉnh của dự án này, có vài chỗ lệch luật gốc BANG!, vd
// Cat Balou không giới hạn khoảng cách, Beer hiện CHƯA có ngoại lệ "vô tác
// dụng khi chỉ còn 2 người sống"), không phải chép lại luật gốc từ trí nhớ.
// Hiện ở 2 chỗ: thuộc tính `title` (tooltip rê chuột/giữ lâu) trên lá bài lúc
// đang chơi, VÀ đầy đủ ở màn hình "Thư viện bài" (renderCardReferenceScreen).
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
  // Mở rộng Dodge City (đợt 1/40 lá) — trang bị "trì hoãn": bày ra trước mặt
  // như trang bị thường, nhưng phải chờ ít nhất 1 lượt mới được bỏ ra dùng.
  bible: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra dùng NHƯ Missed!, kèm rút thêm 1 lá nếu đỡ thành công.",
  sombrero: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra dùng NHƯ Missed! để đỡ Bang!/Gatling.",
  ten_gallon_hat: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra dùng NHƯ Missed! để đỡ Bang!/Gatling.",
  iron_plate: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra dùng NHƯ Missed! để đỡ Bang!/Gatling.",
  canteen: "Trang bị trì hoãn — chờ tới lượt sau của chính mình mới bỏ ra dùng, tự hồi 1 máu.",
  pony_express: "Trang bị trì hoãn — chờ tới lượt sau của chính mình mới bỏ ra dùng, rút thêm 3 lá từ bộ bài.",
  // Mở rộng Dodge City đợt 2 (34/40 lá còn lại) — mô tả theo ĐÚNG luật đã cài
  // trong reduce.ts (xem Luat_Bang_Mo_Rong_DodgeCity.txt).
  binocular: "Nhìn người khác gần hơn 1 khi mình đánh Bang! — cộng dồn được với Ống nhắm.",
  hideout: "Người khác nhìn mình xa hơn 1 — cộng dồn được với Ngựa Mustang.",
  brawl: "Bỏ kèm 1 lá phụ để bắt TẤT CẢ người khác bỏ 1 lá — tự chọn tay hay sân cho từng người.",
  dodge: "Không tự đánh được — chỉ dùng để đỡ khi bị Bang!/Gatling, đỡ thành công thì rút thêm 1 lá.",
  punch: "Có hiệu ứng như Bang! nhắm người ở khoảng cách 1, bất kể súng đang cầm.",
  rag_time: "Bỏ kèm 1 lá phụ để cướp 1 lá của người bất kỳ, không giới hạn khoảng cách.",
  springfield: "Bỏ kèm 1 lá phụ để có hiệu ứng Bang! nhắm người bất kỳ, bất kể khoảng cách/tầm súng.",
  tequila: "Bỏ kèm 1 lá phụ để hồi 1 máu cho người bất kỳ (kể cả chính mình).",
  whisky: "Bỏ kèm 1 lá phụ để tự hồi 2 máu — chỉ dùng được trong lượt của chính mình.",
  derringer: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để có hiệu ứng Bang! khoảng cách 1, luôn rút thêm 1 lá.",
  conestoga: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để cướp 1 lá của người bất kỳ, không giới hạn khoảng cách.",
  can_can: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để bắt 1 người bất kỳ bỏ 1 lá (tay hoặc sân).",
  buffalo_rifle: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để có hiệu ứng Bang! nhắm người bất kỳ, bất kể khoảng cách.",
  knife: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để có hiệu ứng Bang! ở khoảng cách 1.",
  pepperbox: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để có hiệu ứng Bang! đúng tầm súng đang cầm.",
  howitzer: "Trang bị trì hoãn — chờ 1 lượt rồi bỏ ra để bắn TẤT CẢ người khác cùng lúc, bất kể khoảng cách.",
};

// Mở rộng High Noon + A Fistful of Cards (bổ sung 2026-08-08, thư viện bài
// từng bỏ sót hoàn toàn nhóm này) — mô tả theo ĐÚNG luật đã cài (xem
// CHANGELOG.md "Mở rộng High Noon"/"Mở rộng A Fistful of Cards" để đối chiếu
// chi tiết từng lá), KHÔNG chép nguyên văn luật gốc BANG! vì dự án có vài chỗ
// lệch luật gốc (đúng tinh thần CARD_DESCRIPTIONS ở trên). CHỈ soạn cho lá
// THẬT SỰ nằm trong EXPANSION_EVENT_IDS (đã tự loại Ghost Town/Dead Man/Law
// of the West/Peyote — core chưa cài) — không soạn trước cho lá chưa cài,
// tránh mô tả sai luật chưa chốt xong.
const EVENT_CARD_DESCRIPTIONS: Record<string, string> = {
  // ----- High Noon -----
  blessing: "Mọi lá bài đều được coi là chất Cơ (♥) — kể cả lúc lật bài kiểm tra (draw!).",
  curse: "Mọi lá bài đều được coi là chất Bích (♠) — kể cả lúc lật bài kiểm tra (draw!).",
  hangover: "Mọi người tạm mất khả năng đặc biệt của nhân vật (giữ nguyên máu tối đa) trong lúc lá này còn hiệu lực.",
  shootout: "Mỗi người được đánh tối đa 2 lá Bang!/lượt thay vì 1 (Volcanic/Willy the Kid vẫn không giới hạn).",
  the_reverend: "Cấm dùng Bia hoàn toàn — kể cả tự đánh chủ động lẫn tự động cứu mạng khi máu về 0.",
  the_sermon: "Cấm CHƠI lá Bang! chủ động trong lượt của mình (vẫn được BỎ Bang! để đỡ Missed!/Đấu tay đôi bình thường).",
  thirst: "Mọi người rút ÍT HƠN 1 lá ở bước rút bài đầu lượt, kể cả nhân vật có công thức rút bài riêng.",
  train_arrival: "Mọi người rút NHIỀU HƠN 1 lá ở bước rút bài đầu lượt, kể cả nhân vật có công thức rút bài riêng.",
  gold_rush: "Đảo NGƯỢC chiều đi của lượt chơi — hiệu ứng các lá bài (Gatling, Người da đỏ!...) vẫn theo đúng chiều gốc, không bị đảo.",
  the_daltons: "Mỗi người đang có ít nhất 1 lá trang bị (kể cả Nhà tù/Thuốc nổ) phải tự chọn bỏ đúng 1 lá.",
  the_doctor: "Người ít máu nhất được +1 máu — bằng nhau thì MỖI người đều +1 (chỉ tính người còn sống).",
  high_noon: "Lá cuối, hiệu lực tới hết ván — đầu mỗi lượt, người tới lượt mất 1 máu vô điều kiện.",
  // ----- A Fistful of Cards -----
  ambush: "Khoảng cách vòng tròn giữa mọi người tạm tính là 1 — vẫn cộng/trừ theo Ống nhắm/Ngựa Mustang/kỹ năng nhân vật như bình thường.",
  lasso: "Vô hiệu hoàn toàn MỌI trang bị của MỌI người (kể cả Nhà tù/Thuốc nổ) — không ai được đặt trang bị mới xuống sân.",
  the_judge: "Cấm ĐẶT trang bị/Nhà tù mới xuống sân (trang bị đã bày từ trước vẫn dùng bình thường).",
  hard_liquor: "Đầu lượt, có thể chọn bỏ qua pha rút bài để hồi 1 máu thay vào đó (không được cả hai).",
  ranch: "Ngay sau khi rút bài, được đổi bất kỳ số lá nào trên tay lấy lại đúng bấy nhiêu lá mới — chỉ 1 lần/lượt.",
  russian_roulette:
    "Rút 1 lá để đếm vòng quanh bàn (chiều theo màu, bước theo số) — người bị trúng phải bỏ Missed! liên tiếp, ai không bỏ được thì mất 2 máu.",
  blood_brothers: "Trước khi lượt bắt đầu, có thể tặng đúng 1 máu (không phải giọt cuối) cho 1 người bất kỳ.",
  vendetta: "Sau khi kết thúc lượt, rút 1 lá — ra Cơ thì được chơi thêm đúng 1 lượt nữa như bình thường.",
  sniper: "Bỏ cùng lúc 2 lá Bang! để bắn 1 người trong tầm — họ cần đỡ đủ 2 Missed!, dùng được nhiều lần/lượt.",
  ricochet: "Bỏ 1 lá Bang! để bắn rụng 1 lá trang bị của người khác, bất kể khoảng cách — họ đỡ được bằng Missed!.",
  a_fistful_of_cards:
    "Lá cuối, hiệu lực tới hết ván — đầu mỗi lượt (trước cả kiểm tra Nhà tù/Thuốc nổ), người tới lượt bị bắn số phát Bang! bằng đúng số lá đang cầm trên tay.",
};

// Nhóm lá nâu/xanh CHỈ để trình bày (viền màu + màn hình Thư viện bài) — chép lại
// thủ công từ BrownCardName/BlueCardName ở core/cards.ts (2 type đó chỉ tồn
// tại lúc biên dịch, không có mảng thật lúc chạy) — sửa core/cards.ts thì nhớ
// sửa cả đây.
const BROWN_CARD_NAMES: readonly CardName[] = [
  "bang", "missed", "beer", "saloon", "stagecoach", "wells_fargo",
  "panic", "cat_balou", "general_store", "indians", "duel", "gatling",
  // Mở rộng Dodge City đợt 2.
  "brawl", "dodge", "punch", "rag_time", "springfield", "tequila", "whisky",
];
const BLUE_CARD_NAMES: readonly CardName[] = [
  "volcanic", "schofield", "remington", "rev_carabine", "winchester",
  "barrel", "scope", "mustang", "jail", "dynamite",
  // Mở rộng Dodge City đợt 2.
  "binocular", "hideout",
];
// Mở rộng Dodge City — trang bị "trì hoãn" (xem cards.ts's YellowCardName).
// ĐỔI MÀU so với sách luật gốc (gọi là "green-bordered") — xem ghi chú màu ở
// đầu Luat_Bang_Mo_Rong_DodgeCity.txt: xanh lá ĐÃ dành riêng cho khung nhân
// vật trong dự án này, nên nhóm bài này dùng màu vàng thay thế.
const YELLOW_CARD_NAMES: readonly CardName[] = [
  "bible", "sombrero", "ten_gallon_hat", "iron_plate", "canteen", "pony_express",
  // Đợt 2.
  "derringer", "conestoga", "can_can", "buffalo_rifle", "knife", "pepperbox", "howitzer",
];

// Việc bổ sung sau 4.6: viền màu phân biệt loại lá — nâu (đánh từ tay), xanh
// dương (trang bị), vàng (trang bị trì hoãn, Dodge City), xanh lá (nhân vật —
// xem CHARACTER_PREVIEW bên dưới).
function cardTypeModifierClass(name: CardName): string {
  if (YELLOW_CARD_NAMES.includes(name)) return "card-box--yellow";
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
// Fix lỗi thật #1 (báo từ chủ dự án): popup "đôi khi biến mất ngay lập tức dù
// vẫn đang giữ tay" — trước đây CHỈ CẦN 1 sự kiện "touchmove" (bất kể di
// chuyển bao xa) là huỷ/ẩn popup ngay. Ngón tay người thật KHÔNG BAO GIỜ đứng
// yên tuyệt đối lúc giữ — luôn có rung nhẹ vài pixel, nên gần như lần giữ nào
// cũng dính "touchmove" ngay cả khi người dùng không hề có ý định trượt tay.
// Sửa: chỉ coi là "trượt tay thật" (huỷ popup) khi di chuyển QUÁ 1 ngưỡng nhỏ
// tính từ điểm chạm ban đầu — dưới ngưỡng đó coi là rung tay bình thường,
// KHÔNG huỷ.
const MOVE_CANCEL_THRESHOLD_PX = 10;
// Fix lỗi thật #2: popup "hiện vĩnh viễn, không biến mất kể cả khi đã bỏ tay
// ra". Nguyên nhân: `render()` (main.ts) vẽ lại TOÀN BỘ cây DOM mỗi ~1 giây —
// nếu đúng lúc đó xảy ra NGAY GIỮA 1 lần đang giữ (đã qua LONG_PRESS_MS, popup
// đang hiện), phần tử `el` đang gắn các listener touchmove/touchend NÀY bị gỡ
// khỏi trang và thay bằng phần tử MỚI (có closure/state RIÊNG, không biết gì
// về popup cũ) — sự kiện `touchend` thật của ngón tay khi bỏ ra sẽ không còn
// nơi nào để bắt nữa (el cũ đã biến mất khỏi DOM), popup (gắn thẳng vào
// `document.body`, không bị `replaceChildren()` đụng tới) bị "mồ côi" mãi
// mãi. Sửa: cứ hiện popup lên là tự đặt hẹn giờ TỰ ẩn sau
// AUTO_HIDE_MS — không phụ thuộc gì vào việc có bắt được touchend hay không,
// đảm bảo popup KHÔNG BAO GIỜ bị kẹt vĩnh viễn dù mất dấu sự kiện thật.
const AUTO_HIDE_MS = 4000;

function attachDescriptionReveal(el: HTMLElement, description: string | undefined): void {
  if (!description) return;
  el.title = description;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  let popup: HTMLElement | null = null;
  let triggered = false;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const hidePopup = () => {
    if (autoHideTimer !== null) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
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
    autoHideTimer = setTimeout(hidePopup, AUTO_HIDE_MS);
  };

  el.addEventListener(
    "touchstart",
    (event) => {
      triggered = false;
      clearTimer();
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(showPopup, LONG_PRESS_MS);
    },
    { passive: true }
  );
  el.addEventListener("touchmove", (event) => {
    const touch = event.touches[0];
    const movedPx = Math.hypot(touch.clientX - startX, touch.clientY - startY);
    if (movedPx > MOVE_CANCEL_THRESHOLD_PX) {
      clearTimer();
      hidePopup();
    }
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
// tooltip/nhấn-giữ gì cả (dùng ở màn hình Thư viện bài, nơi mô tả đã hiện thành
// chữ riêng ngay bên dưới, gắn thêm sẽ thừa).
// `suitRank`: CHỈ truyền cho lá bài THẬT (có chất/số) — lá nhân vật (không có
// khái niệm chất) gọi hàm này KHÔNG kèm tham số này, tự động bỏ qua badge,
// đúng yêu cầu "lá không có chất thì bỏ qua phần này".
function appendCardVisual(
  el: HTMLElement,
  imageUrl: string,
  label: string,
  description?: string,
  suitRank?: { suit: Suit; rank: Rank }
): void {
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

  if (suitRank) {
    const badge = document.createElement("span");
    badge.className = "card-box__suit-badge " + (isRedSuit(suitRank.suit) ? "card-box__suit-badge--red" : "card-box__suit-badge--black");
    badge.textContent = `${suitRank.rank}${SUIT_ICONS[suitRank.suit]}`;
    imageWrap.appendChild(badge);
  }

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
  appendCardVisual(el, cardImageUrl(name), cardLabel(cardId), CARD_DESCRIPTIONS[name], cardSuitRankFromId(cardId));
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
  appendCardVisual(el, cardImageUrl(name), cardLabel(cardId), CARD_DESCRIPTIONS[name], cardSuitRankFromId(cardId));
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
  // Mở rộng Dodge City, mục C — soạn theo ĐÚNG hook đã cài trong
  // core/characters.ts (đọc lại trước khi viết, giống ghi chú ở trên).
  pixie_pete: "Đầu lượt rút 3 lá thay vì 2.",
  bill_noface: "Đầu lượt rút 1 lá, cộng thêm đúng số máu đang thiếu (máu tối đa trừ máu hiện tại).",
  greg_digger: "Mỗi khi có người bị loại (kể cả không phải do mình), tự hồi tối đa 2 máu.",
  herb_hunter: "Mỗi khi có người bị loại (kể cả không phải do mình), rút thêm 2 lá.",
  pat_brennan:
    "Đầu lượt được chọn: rút bài như thường, hoặc lấy 1 lá trang bị bất kỳ (kể cả trì hoãn) của 1 người khác vào tay mình.",
  chuck_wengam:
    "Trong lượt của mình, bất cứ lúc nào cũng có thể mất 1 máu để rút 2 lá — dùng được nhiều lần, không tự sát được bằng cách này.",
  jose_delgado: "Trong lượt của mình, bỏ 1 lá trang bị xanh dương từ tay để rút 2 lá — tối đa 2 lần/lượt.",
  sean_mallory: "Giới hạn số lá giữ lại cuối lượt luôn ít nhất 10, dù máu ít hơn.",
  tequila_joe: "Uống Bia hồi 2 máu thay vì 1 (kể cả lúc hồi sinh tự động khi máu về 0).",
  elena_fuente:
    "Bất kỳ lá nào trên tay cũng dùng được như Missed!; trang bị của chính mình (trừ Thuốc nổ) dùng được như Missed! ngay lập tức, không cần chờ 1 lượt.",
  apache_kid:
    "Miễn nhiễm với lá chất Rô người khác đánh nhắm thẳng vào mình (Bang!, Cat Balou, Buffalo Rifle...) — KHÔNG áp dụng cho Đấu tay đôi/Indians!.",
  doc_holyday: "Trong lượt của mình, bỏ 2 lá bất kỳ để có hiệu ứng Bang! trong tầm súng đang cầm — tối đa 1 lần/lượt.",
  molly_stark:
    "Mỗi lần chủ động dùng Missed!/Bia/Bang! ngoài lượt của mình (đỡ Bang!/Indians!, hoặc trong Đấu tay đôi), rút thêm 1 lá.",
  belle_star: "Trong lượt của mình, trang bị của TẤT CẢ người khác tạm mất tác dụng (khoảng cách, Thùng rượu, súng...).",
  vera_custer:
    "Đầu lượt bắt buộc chọn 1 người chơi khác còn sống để mượn khả năng nhân vật của họ tới hết lượt sau — không mượn số máu.",
  // Bộ mở rộng "custom_characters" (xem House_Rule.txt mục I) — nhân vật TỰ
  // CHẾ, soạn theo ĐÚNG logic đã cài trong core/reduce.ts/characters.ts.
  elena_noir:
    "Đòn lẽ ra giết mình (Bia không cứu được) sẽ kích hoạt Miễn Tử 2 lượt: không thể bị nhắm bởi bất kỳ lá nào (trừ Thuốc nổ vẫn nổ nhưng không giết được) và không thể bị Jail — chết chắc chắn khi hết 2 lượt. Đầu mỗi lượt (khi không Miễn Tử) được chọn vũ trang trước (rút 1 lá) hoặc rút 2 lá bình thường (không vũ trang thì không kích hoạt Miễn Tử nếu chết trong lượt đó).",
  marcel_marcelo:
    "Bị nhốt tù thì lập tức chỉ định 1 người khác 'cùng vào tù' (ăn theo kết quả, không tự rút). Đầu lượt được rút tối đa 2 lá để tìm Cơ thoát tù; thoát thành công thì lượt đó rút 3 lá thay vì 2.",
  mary_rose:
    "Thật sự mất máu vì trúng Bang! đơn lẻ (không đỡ được) thì bắn trả MIỄN PHÍ vào người đó, bỏ qua khoảng cách, cần 2 Missed! mới né được — không tính Gatling/Duel/Indians!. Đổi lại, đánh Bang! chủ động phải bỏ đủ 2 lá Bang! thay vì 1.",
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
//
// Bổ sung theo yêu cầu chủ dự án (LO-TRINH.md, 2026-08-05) — hiện thêm LƯỢNG
// MÁU (bullets) của nhân vật ngay tại đây, để cân nhắc lúc chọn (trước đó chỉ
// có tên + mô tả kỹ năng). `role` là vai THẬT của người đang chọn — cần để
// tính đúng máu (computeStartingHp() cộng thêm 1 nếu là Sheriff, xem
// characters.ts) khớp với máu họ sẽ CÓ THẬT nếu chọn lá này, không phải máu
// gốc của nhân vật (`bullets`) một mình.
function characterOptionCard(characterId: string, role: Role | null, armed: boolean, onClick: () => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "character-option";
  wrapper.appendChild(characterButton(characterId, onClick, armed));

  const hp = computeStartingHp(role, characterId);
  wrapper.appendChild(renderHpTrack(hp, hp));

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

// Mở rộng High Noon/A Fistful of Cards — khung nhỏ hiện TÊN lá sự kiện, dùng
// CHUNG cho cả "đang chạy" lẫn "kế tiếp" (chỉ khác nhãn/kiểu chữ). Không có
// ảnh thật riêng cho lá sự kiện (khác hẳn 40 lá bài thường) — chỉ hiện chữ,
// đơn giản hơn cardChip()/cardBox() vì lá sự kiện không có suit/rank/id thật
// (EventId là chuỗi tĩnh, không phải cardId gắn với 1 lá vật lý trong deck).
function renderEventPileBox(eventId: string, modifierClass: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `table-center__event-box ${modifierClass}`;
  el.textContent = EVENT_CARDS[eventId as EventId]?.name ?? eventId;
  return el;
}

// Mục 7 UI/UX: khu giữa bàn gồm bộ bài rút (úp, chỉ số lượng) + chồng bài bỏ
// (lá mặt trên ngửa thật, dùng chung cardChip() như mọi nơi khác hiện 1 lá cụ
// thể). Dùng CHUNG cho cả hotseat lẫn qua mạng — tham số chỉ cần deckCount +
// discardPile (2 thứ CÔNG KHAI, PlayerView cũng có sẵn y hệt).
//
// Mở rộng High Noon/A Fistful of Cards (bổ sung 2026-08-08) — thêm
// activeEventId/nextEventId (cả 2 ĐỀU công khai qua PlayerView từ trước, xem
// view.ts, chỉ là ui.ts chưa từng vẽ ra) — CHỈ hiện khối này khi ít nhất 1
// trong 2 khác null (ván không bật bộ mở rộng sự kiện thì không có gì để
// hiện, giống renderActiveExpansions()).
function renderTableCenter(
  deckCount: number,
  discardPile: string[],
  activeEventId: string | null,
  nextEventId: string | null
): HTMLElement {
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

  if (activeEventId !== null || nextEventId !== null) {
    const eventPile = document.createElement("div");
    eventPile.className = "table-center__pile";
    if (activeEventId !== null) {
      eventPile.appendChild(renderEventPileBox(activeEventId, "table-center__event-box--active"));
    } else {
      const empty = document.createElement("span");
      empty.className = "card-box card-box--inert table-center__empty-pile";
      empty.textContent = "(chưa lật)";
      eventPile.appendChild(empty);
    }
    const eventCaption = document.createElement("span");
    eventCaption.className = "table-center__caption";
    eventCaption.textContent = "Sự kiện đang diễn ra";
    eventPile.appendChild(eventCaption);
    if (nextEventId !== null) {
      eventPile.appendChild(renderEventPileBox(nextEventId, "table-center__event-box--next"));
      const nextCaption = document.createElement("span");
      nextCaption.className = "table-center__caption";
      nextCaption.textContent = "Sự kiện kế tiếp";
      eventPile.appendChild(nextCaption);
    }
    wrap.appendChild(eventPile);
  }

  return wrap;
}

const SUIT_LABELS: Record<Suit, string> = {
  spades: "Bích",
  hearts: "Cơ",
  diamonds: "Rô",
  clubs: "Chuồn",
};

// Badge chất/số ở góc dưới-phải mỗi lá bài THẬT (tay/trang bị) — icon Unicode
// sẵn có của trình duyệt, không cần ảnh riêng, luôn hiển thị đúng dù chưa có
// sprite thật. Đỏ/đen theo đúng quy ước bài Tây thật — dùng 2 biến CSS RIÊNG
// (--color-suit-red/--color-suit-black), KHÔNG tái dùng --color-danger (đã
// mang nghĩa "nguy hiểm/khẩn cấp" ở Dynamite/Jail/đồng hồ sắp hết giờ, dùng lại
// ở đây dễ hiểu lầm ý nghĩa).
const SUIT_ICONS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

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

// Mở rộng Dodge City — TÁCH RIÊNG khỏi house rules ở trên (xem ExpansionId ở
// types.ts): đây là "thêm nội dung" (lá bài + nhân vật), không phải "chỉnh
// luật chơi". Có thể tick NHIỀU bộ mở rộng cùng lúc (chơi kết hợp) — hiện chỉ
// có 1 bộ (Dodge City), nhưng danh sách này đã sẵn chỗ để thêm bộ khác sau
// này mà không lẫn vào khối "Luật bổ sung".
const EXPANSION_LABELS: Record<ExpansionId, string> = {
  dodge_city: "Dodge City (mở rộng)",
  custom_characters: "Nhân vật tự chế (*ex)",
  high_noon: "High Noon (mở rộng)",
  a_fistful_of_cards: "A Fistful of Cards (mở rộng)",
};
const EXPANSION_DESCRIPTIONS: Record<ExpansionId, string> = {
  dodge_city:
    "Thêm ĐỦ 40/40 lá Dodge City vào bộ (súng/Barrel/Dynamite thêm bản sao thứ 2, Bang!/Beer/Missed!/Cat Balou/" +
    "General Store/Indians!/Panic! thêm số lượng, cộng 16 lá hoàn toàn mới: Binocular, Hideout, Brawl, Dodge, Punch, " +
    "Rag Time, Springfield, Tequila, Whisky, Bible, Sombrero, Ten Gallon Hat, Iron Plate x2, Canteen, Pony Express, " +
    "Derringer, Conestoga, Can Can, Buffalo Rifle, Knife, Pepperbox, Howitzer) VÀ 15 nhân vật Dodge City vào bộ nhân " +
    "vật (chỉ phát khi bật cơ chế chọn nhân vật). " +
    "Luật đã cài đủ core, NHƯNG giao diện CHƯA có nút bấm cho lá vàng 'trì hoãn' (kích hoạt lá đã bày sẵn/đỡ Missed! " +
    "bằng trang bị) hay lá nâu cần bỏ kèm 1 lá phụ (Brawl/Rag Time/Springfield/Tequila/Whisky) — chỉ nên bật để thử " +
    "qua mã nguồn/test, CHƯA nên bật khi chơi thật với bạn bè.",
  // Nhân vật TỰ CHẾ (không thuộc bản gốc/Dodge City, xem House_Rule.txt) —
  // KHÔNG thêm lá bài nào, chỉ thêm nhân vật vào bộ bốc "phát 2 lá chọn giữ
  // 1". Tên hiển thị trong ván luôn có đuôi "*ex".
  custom_characters:
    "Thêm 3 nhân vật tự chế Elena Noir/Marcel Marcelo/Mary Rose *ex vào bộ bốc nhân vật (chỉ phát khi bật cơ chế chọn nhân vật) — không thêm lá bài nào.",
  // 11/13 lá High Noon + 11/14 lá A Fistful of Cards đã hoạt động được
  // (2026-08-08) — CÒN THIẾU Ghost Town/Dead Man/Law of the West/Peyote,
  // core CHƯA cài nên bị loại tạm khỏi bộ bốc (xem EXPANSION_EVENT_IDS ở
  // events.ts). Cố tình KHÔNG đưa 2 id này riêng lẻ vào EXPANSION_IDS bên
  // dưới — gộp chung thành 1 nút duy nhất (xem EVENT_CARDS_EXPANSION_LABEL/
  // renderExpansionCheckboxes()) vì tách riêng từng bộ sẽ để lộ bộ bài quá ít
  // lá (12-13 lá thường mỗi bộ) so với gộp chung (21 lá thường).
  high_noon: "Bộ lá sự kiện High Noon — 11/13 lá đã hoạt động (thiếu Ghost Town).",
  a_fistful_of_cards: "Bộ lá sự kiện A Fistful of Cards — 11/14 lá đã hoạt động (thiếu Dead Man/Law of the West/Peyote/Abandoned Mine).",
};
const EXPANSION_IDS: ExpansionId[] = ["dodge_city", "custom_characters"];

// Mở rộng High Noon + A Fistful of Cards — TẠM GỘP thành 1 nút duy nhất (thay
// vì 2 checkbox riêng như EXPANSION_IDS ở trên) vì mỗi bộ RIÊNG LẺ còn thiếu
// khá nhiều lá (Ghost Town/Dead Man/Law of the West/Peyote CHƯA cài, xem
// EXPANSION_EVENT_IDS ở events.ts) — gộp chung cho bộ bài đủ dày (21 lá
// thường) để chơi thật thay vì để riêng từng bộ mỏng. Bật nút này = bật CẢ 2
// id "high_noon" VÀ "a_fistful_of_cards" cùng lúc trong `expansions` — luật
// "random 1 trong 2 lá cuối khi cả 2 bộ cùng bật" đã có sẵn từ trước
// (setup.ts) không đổi gì. Xem toggleEventCardExpansions() ở main.ts.
const EVENT_CARDS_EXPANSION_LABEL = "Lá sự kiện — High Noon + A Fistful of Cards (mở rộng, gộp chung)";
const EVENT_CARDS_EXPANSION_DESCRIPTION =
  "Gộp chung 2 bộ lá sự kiện thành 1 (tạm thời, vì mỗi bộ riêng còn thiếu vài lá): High Noon (11/13 lá, thiếu Ghost " +
  "Town) + A Fistful of Cards (11/14 lá, thiếu Dead Man/Law of the West/Peyote/Abandoned Mine). Vẫn giữ đúng luật " +
  "gốc khi chơi kết hợp 2 bộ: 26 lá thường gộp chung, xáo, cắt còn 12 lá (mặc định), rồi CHỌN NGẪU NHIÊN 1 trong 2 lá " +
  "cuối 'High Noon'/'A Fistful of Cards' để dùng — lá còn lại không xuất hiện trong ván đó.";

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

// Cùng khuôn với renderHouseRuleCheckboxes() ở trên, nhưng cho bộ mở rộng —
// khối riêng trên màn hình thiết lập ván để không lẫn với "Luật bổ sung".
function renderExpansionCheckboxes(
  container: HTMLElement,
  selected: ExpansionId[],
  onToggle: (id: ExpansionId) => void
): void {
  const wrapper = document.createElement("div");
  wrapper.className = "panel";

  const heading = document.createElement("p");
  heading.textContent = "Bộ mở rộng (tuỳ chọn, có thể chọn nhiều bộ cùng lúc):";
  wrapper.appendChild(heading);

  for (const id of EXPANSION_IDS) {
    const label = document.createElement("label");
    label.title = EXPANSION_DESCRIPTIONS[id];
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.includes(id);
    checkbox.addEventListener("change", () => onToggle(id));
    label.appendChild(checkbox);
    label.append(" " + EXPANSION_LABELS[id]);
    wrapper.appendChild(label);
    wrapper.appendChild(document.createElement("br"));
  }

  // Nút GỘP High Noon + A Fistful of Cards — xem ghi chú ở
  // EVENT_CARDS_EXPANSION_LABEL. Gọi onToggle("high_noon") làm đại diện — hàm
  // toggleEventCardExpansions() ở main.ts đã tự bật/tắt CẢ 2 id cùng lúc.
  const eventLabel = document.createElement("label");
  eventLabel.title = EVENT_CARDS_EXPANSION_DESCRIPTION;
  const eventCheckbox = document.createElement("input");
  eventCheckbox.type = "checkbox";
  eventCheckbox.checked = selected.includes("high_noon") && selected.includes("a_fistful_of_cards");
  eventCheckbox.addEventListener("change", () => onToggle("high_noon"));
  eventLabel.appendChild(eventCheckbox);
  eventLabel.append(" " + EVENT_CARDS_EXPANSION_LABEL);
  wrapper.appendChild(eventLabel);
  wrapper.appendChild(document.createElement("br"));

  container.appendChild(wrapper);
}

// Cùng khuôn với renderActiveHouseRules() ở trên, nhưng cho bộ mở rộng.
function renderActiveExpansions(container: HTMLElement, expansions: ExpansionId[]): void {
  if (expansions.length === 0) return;
  const el = document.createElement("p");
  el.className = "summary";
  el.textContent = "Bộ mở rộng đang bật: " + expansions.map((id) => EXPANSION_LABELS[id]).join(", ");
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
      return event.byPlayerId
        ? `${nameOf(event.byPlayerId)} bắt ${nameOf(event.playerId)} bỏ ${cardLabel(event.cardId)}`
        : `${nameOf(event.playerId)} phải bỏ ${cardLabel(event.cardId)} (lá sự kiện)`;
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
      return `${nameOf(event.playerId)} (Kit Carlson) bỏ ${event.cardIds.map(cardFaceLabel).join(", ")} trong 3 lá vừa xem`;
    case "SID_KETCHUM_HEALED":
      return `${nameOf(event.playerId)} (Sid Ketchum) bỏ 2 lá để hồi ${event.amount} máu`;
    case "CHARACTER_CHOSEN":
      return `${nameOf(event.playerId)} chọn nhân vật`;
    case "BEER_SAVED_FROM_DEATH":
      return `${nameOf(event.playerId)} tự động bỏ Bia để hồi sinh, còn ${event.hp} máu`;
    case "BEER_INEFFECTIVE":
      return `Bia của ${nameOf(event.playerId)} không có tác dụng — chỉ còn 2 người sống`;
    case "PLAYER_ELIMINATED":
      return event.killedBy
        ? `${nameOf(event.playerId)} bị ${nameOf(event.killedBy)} hạ gục`
        : `${nameOf(event.playerId)} đã chết`;
    case "OUTLAW_BOUNTY_DRAWN":
      return `${nameOf(event.playerId)} được thưởng vì kết liễu Tội phạm, rút ${event.count} lá`;
    case "HUNT_KILL_BOUNTY_DRAWN":
      return `${nameOf(event.playerId)} được thưởng vì hạ gục đối thủ, rút ${event.count} lá`;
    case "SHERIFF_KILLED_DEPUTY_PENALTY":
      return `${nameOf(event.playerId)} giết nhầm Phó cảnh sát trưởng, bị phạt mất hết bài`;
    case "GAME_ENDED":
      return `VÁN KẾT THÚC — thắng: ${describeWinner(event.winner, nameOf)}`;
    case "DELAYED_EQUIPMENT_ACTIVATED":
      return `${nameOf(event.playerId)} dùng ${cardLabel(event.cardId)} (trang bị trì hoãn)`;
    case "CHUCK_WENGAM_TRADED_LIFE":
      return `${nameOf(event.playerId)} (Chuck Wengam) mất 1 máu để rút ${event.count} lá`;
    case "JOSE_DELGADO_TRADED_EQUIPMENT":
      return `${nameOf(event.playerId)} (José Delgado) bỏ ${cardLabel(event.cardId)} để rút ${event.count} lá`;
    case "APACHE_KID_IMMUNE":
      return `${nameOf(event.playerId)} (Apache Kid) miễn nhiễm với ${cardLabel(event.cardId)} chất Rô của ${nameOf(event.fromPlayerId)}`;
    case "DOC_HOLYDAY_SHOT":
      return `${nameOf(event.playerId)} (Doc Holyday) bỏ 2 lá để bắn ${nameOf(event.targetId)}`;
    case "VERA_CUSTER_BORROWED":
      return `${nameOf(event.playerId)} (Vera Custer) mượn khả năng của ${nameOf(event.borrowedFromPlayerId)}`;
    case "ELENA_NOIR_IMMORTAL_TRIGGERED":
      return `${nameOf(event.playerId)} (Elena Noir) "dạt ra cho mẹ bắn" — Miễn Tử ${event.turnsLeft} lượt`;
    case "MARCEL_COMPANION_PICKED":
      return `${nameOf(event.playerId)} (Marcel Marcelo) chỉ định ${nameOf(event.companionId)} cùng vào tù`;
    case "MARCEL_JAIL_SECOND_DRAW":
      return `${nameOf(event.playerId)} (Marcel Marcelo) rút thêm lá thứ 2 để thoát tù: ${cardFaceLabel(event.cardId)} — ${event.matched ? "KHỚP" : "không khớp"}`;
    case "MARCEL_COMPANION_FREED":
      return `${nameOf(event.playerId)} được tự do — Marcel Marcelo đã thoát tù`;
    case "MARCEL_COMPANION_JAILED":
      return `${nameOf(event.playerId)} sẽ mất lượt kế tiếp — Marcel Marcelo kẹt tù`;
    case "MARCEL_COMPANION_TURN_SKIPPED":
      return `${nameOf(event.playerId)} bị bỏ qua lượt (cùng vào tù với Marcel Marcelo)`;
    case "MARY_ROSE_EXTRA_BANG_DISCARDED":
      return `${nameOf(event.playerId)} (Mary Rose) bỏ thêm 1 lá Bang! (giá của kỹ năng)`;
    case "MARY_ROSE_REFLECTED":
      return `${nameOf(event.playerId)} (Mary Rose) bắn trả miễn phí vào ${nameOf(event.targetId)}, cần 2 Missed! mới né được`;
    case "EVENT_REVEALED":
      return `Lá sự kiện mới: ${EVENT_CARDS[event.eventId as EventId]?.name ?? event.eventId}`;
    case "BLOOD_BROTHERS_GIFT":
      return `${nameOf(event.playerId)} tặng 1 máu cho ${nameOf(event.targetId)} (Blood Brothers)`;
    case "RICOCHET_EQUIPMENT_DESTROYED":
      return `${nameOf(event.playerId)} mất ${cardLabel(event.cardId)} vì đòn Ricochet`;
    case "RANCH_EXCHANGED":
      return `${nameOf(event.playerId)} đổi ${event.cardIds.length} lá (Ranch), rút lại ${event.count} lá mới`;
    case "A_FISTFUL_OF_CARDS_TRIGGERED":
      return `${nameOf(event.playerId)} bị bắn ${event.shotCount} phát Bang! (A Fistful of Cards)`;
    case "RUSSIAN_ROULETTE_STARTED":
      return `Russian Roulette: ${cardFaceLabel(event.cardId)} — ${nameOf(event.startPlayerId)} phải bỏ Missed! đầu tiên (chiều ${event.direction === 1 ? "kim đồng hồ" : "ngược kim đồng hồ"})`;
    case "RUSSIAN_ROULETTE_FIRED":
      return `${nameOf(event.playerId)} không né được Russian Roulette, mất ${event.amount} máu`;
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
// Fix lỗi thật (báo từ chủ dự án): thanh cuộn của dialog (Nhật ký/Cài đặt bị
// kéo về TRÊN CÙNG, Thư viện bài bị kéo xuống DƯỚI CÙNG) liên tục, dù người
// chơi không đụng vào. Nguyên nhân: render() (main.ts) vẽ lại TOÀN BỘ cây DOM
// mỗi ~1 giây (đồng hồ đếm ngược) — trước đây renderDialog() TẠO MỚI hẳn thẻ
// `<dialog>` + gọi lại `showModal()` mỗi lần, dù dialog đang mở, đang y hệt
// nội dung. Mỗi lần showModal() lại, trình duyệt tự focus phần tử BẤM ĐƯỢC
// đầu tiên trong dialog để hỗ trợ bàn phím — Nhật ký/Thư viện bài không có gì
// bấm được TRONG THÂN dialog (chỉ toàn chữ/ảnh xem), nên phần tử đó luôn là
// nút "Đóng" nằm CUỐI dialog → trình duyệt tự cuộn nó vào tầm nhìn, tức cuộn
// xuống ĐÁY — đúng triệu chứng Thư viện bài. Cài đặt có vài nút Sáng/Tối nằm
// GẦN ĐẦU nên focus lại kéo lên ĐẦU thay vì đáy — đúng triệu chứng còn lại.
// Sửa tận gốc: GIỮ NGUYÊN đúng 1 thẻ `<dialog>` sống xuyên suốt trong lúc còn
// mở (biến module-level `openDialog` bên dưới) — mỗi lần render() gọi lại chỉ
// vẽ lại NỘI DUNG bên trong (`body.replaceChildren()` rồi `buildBody()` lại),
// KHÔNG tạo thẻ `<dialog>` mới, KHÔNG gọi lại `showModal()` — nên trình duyệt
// không có lý do gì để tự focus/cuộn lại nữa. `title` dùng làm khoá nhận diện
// "cùng 1 dialog hay khác" (mỗi loại dialog có tiêu đề cố định, không trùng
// nhau — Nhật ký ván đấu/Thư viện bài/Cài đặt/Mã phòng/Mời).
//
// Gắn thẳng vào `document.body` (không phải `container` như trước) vì
// `container` (khung `#game-root`) bị `replaceChildren()` xoá sạch mỗi lần
// render() — nếu dialog vẫn là con của nó thì dù có "giữ nguyên biến JS"
// cũng bị dọn khỏi DOM theo. `<dialog>` dùng `showModal()` vốn hiện ở lớp
// riêng (top layer) của trình duyệt nên vị trí trong cây DOM không ảnh hưởng
// gì tới việc nó có che đúng màn hình hay không.
let openDialog: { title: string; element: HTMLDialogElement; body: HTMLElement } | null = null;

function renderDialog(title: string, onClose: () => void, buildBody: (body: HTMLElement) => void): void {
  if (openDialog && openDialog.title === title) {
    // Cùng dialog đang mở sẵn — chỉ vẽ lại nội dung, không đụng gì tới
    // <dialog>/focus/cuộn đã có.
    openDialog.body.replaceChildren();
    buildBody(openDialog.body);
    return;
  }

  // Đang mở dialog KHÁC (hiếm khi xảy ra — toolbar chỉ mở được 1 dialog/lần) —
  // dọn nó đi TRƯỚC, không gọi lại onClose() của dialog cũ (trạng thái "đang
  // mở" phía state đã đổi từ nơi khác rồi, gọi lại dễ set sai state).
  closeOpenDialog();

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
  dialog.addEventListener("close", () => {
    onClose();
    if (openDialog?.element === dialog) openDialog = null;
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  // showModal() VỪA XONG đã tự focus phần tử bấm được đầu tiên (thường là nút
  // "Đóng" vì thân dialog không có gì bấm được) rồi tự cuộn nó vào tầm nhìn —
  // đã THẬT SỰ xảy ra rồi, `dialogScrollTop` lúc này đã bị đẩy xuống đáy. Chỉ
  // gọi `dialog.focus({ preventScroll: true })` (đổi focus sang chính thẻ
  // `<dialog>`) KHÔNG đủ — cờ `preventScroll` chỉ chặn cuộn PHÁT SINH TỪ chính
  // lần gọi `.focus()` này, không lùi lại cuộn đã xảy ra TRƯỚC ĐÓ (tự kiểm
  // bằng trình duyệt thật phát hiện ra — dialogScrollTop vẫn ở gần cuối dù
  // activeElement đã đúng là `<dialog>`). Phải TỰ TAY đặt lại `scrollTop = 0`
  // luôn mới hết hẳn — chỉ cần làm 1 lần lúc mới mở, không phải mỗi render()
  // nữa (đó chính là điểm đã sửa ở trên).
  dialog.focus({ preventScroll: true });
  dialog.scrollTop = 0;

  openDialog = { title, element: dialog, body };
}

function closeOpenDialog(): void {
  if (openDialog) {
    openDialog.element.remove();
    openDialog = null;
  }
}

// Gọi ở CUỐI renderApp()/renderNetworkGame() — nếu dialog đang mở (biến
// module-level ở trên) không còn nằm trong danh sách "lẽ ra phải mở" của lần
// render() này (vd người chơi vừa bấm Đóng, state đã cập nhật), dọn nó đi.
// Trường hợp bình thường (đóng qua nút "Đóng"/phím Esc) đã tự dọn qua sự kiện
// "close" ở trên rồi — hàm này chỉ là lưới an toàn cho các đường khác (vd
// server tự đổi trạng thái, chuyển hẳn màn hình...).
function reconcileOpenDialog(desiredTitles: readonly string[]): void {
  if (openDialog && !desiredTitles.includes(openDialog.title)) {
    closeOpenDialog();
  }
}

// Đợt 3 UI/UX (mục 9) — "Sẵn ở góc, không chiếm chỗ bàn": hàng nút cố định
// góc trên phải màn hình, bấm mới mở dialog tương ứng — thay hẳn khu nhật ký
// cố định luôn hiện trước đây. `onOpenRoomCode`: chỉ truyền vào (khác
// `undefined`) khi đang chơi qua mạng — hotseat không có mã phòng để mời.
// `onOpenCardReference` (bổ sung sau UI/UX): mở "Thư viện bài" bằng DIALOG
// (giống Nhật ký/Cài đặt) — KHÔNG chuyển `screen` như bấm từ màn hình chính,
// nên đóng lại là chơi tiếp ngay, không văng khỏi ván.
function renderGameToolbar(
  container: HTMLElement,
  onOpenLog: () => void,
  onOpenSettings: () => void,
  onOpenCardReference: () => void,
  onOpenRoomCode: (() => void) | undefined
): void {
  const toolbar = document.createElement("div");
  toolbar.className = "game-toolbar";
  toolbar.appendChild(button("Nhật ký ván đấu", onOpenLog));
  toolbar.appendChild(button("Thư viện bài", onOpenCardReference));
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

// Hoàn thiện dialog Cài đặt — âm thanh/giao diện sáng-tối/cỡ chữ là SỞ THÍCH
// TOÀN CỤC của trình duyệt (không thuộc về 1 ván cụ thể nào) — lưu thẳng
// localStorage, áp dụng NGAY vào <html> (data-theme/class cỡ chữ), không cần
// đi vòng qua GameState/PlayerView hay main.ts's render() gì cả. Vì lý do đó,
// state + logic áp dụng đặt LUÔN ở đây (ui.ts), không cần main.ts biết tới.
type ThemePreference = "light" | "dark";
type FontSizePreference = "small" | "medium" | "large";

const THEME_STORAGE_KEY = "bang_theme";
const FONT_SIZE_STORAGE_KEY = "bang_font_size";
const SOUND_STORAGE_KEY = "bang_sound_enabled";

function getThemePreference(): ThemePreference {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function getFontSizePreference(): FontSizePreference {
  const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  return stored === "small" || stored === "large" ? stored : "medium";
}

function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_STORAGE_KEY) !== "off"; // mặc định BẬT
}

function applyTheme(theme: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", theme);
}

function applyFontSize(size: FontSizePreference): void {
  document.documentElement.classList.remove("font-size-small", "font-size-large");
  if (size !== "medium") document.documentElement.classList.add(`font-size-${size}`);
}

// Gọi 1 LẦN DUY NHẤT lúc khởi động app (main.ts, TRƯỚC khi vẽ màn hình đầu
// tiên) — áp dụng sở thích đã lưu từ lần trước, tránh nháy sáng/cỡ chữ mặc
// định rồi mới đổi lại ngay sau đó.
export function applyStoredSettings(): void {
  applyTheme(getThemePreference());
  applyFontSize(getFontSizePreference());
}

// Phát âm thanh theo sự kiện ván đấu — CHƯA có file thật (quy ước đường dẫn
// TRƯỚC, giống mọi sprite ảnh khác trong dự án — xem cardImageUrl()), gọi
// hàm này ở đâu cũng an toàn: tắt trong Cài đặt hoặc thiếu file đều tự im
// lặng, không phải lỗi. `.catch()` bắt cả lỗi thiếu file LẪN lỗi trình duyệt
// chặn autoplay (cần tương tác người dùng trước) — 2 lý do phổ biến nhất
// khiến audio.play() thất bại, không phân biệt vì cả 2 đều nên im lặng.
function playSound(name: string): void {
  if (!isSoundEnabled()) return;
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.play().catch(() => {});
}

// Tham số cho phần "Bắt đầu ván mới" trong dialog Cài đặt (bổ sung) — dùng
// CHUNG hotseat/qua mạng. `onRequestNewGame` (main.ts) TỰ QUYẾT theo
// `state.winner`/`view.winner`: ván ĐÃ kết thúc thì bắt đầu NGAY, không cần
// hỏi; ván CHƯA kết thúc thì chuyển dialog sang bước xác nhận
// (`confirmingNewGame`), bấm "Huỷ ván, bắt đầu mới" mới thật sự gọi
// onConfirmNewGame(). Đặt CHUNG 1 dialog (đổi nội dung theo `confirmingNewGame`)
// thay vì mở dialog THỨ 2 chồng lên — tránh đúng lỗi "2 dialog cùng mở" đã
// gặp và sửa ở đợt UI/UX trước (xem ghi chú renderDialog()).
interface NewGameSettingsOptions {
  // Hotseat: LUÔN true (không có khái niệm chủ phòng). Qua mạng: chỉ true
  // với đúng chủ phòng — người khác không thấy nút này (server cũng tự chặn
  // lại nếu lỡ gửi, giống nút "Bắt đầu ván" ở lobby).
  visible: boolean;
  confirmingNewGame: boolean;
  onRequestNewGame(): void;
  onConfirmNewGame(): void;
  onCancelNewGameConfirm(): void;
}

// Nội dung dialog Cài đặt — dùng CHUNG hotseat/qua mạng, chỉ khác nhãn nút
// rời. Đọc sở thích TRỰC TIẾP từ localStorage mỗi lần mở dialog (không cần
// tham số/state đi qua RenderOptions) — bấm chọn là áp dụng NGAY (đổi
// data-theme/class) + lưu lại, không cần vẽ lại cả màn hình.
function renderSettingsDialogBody(
  body: HTMLElement,
  leaveLabel: string,
  onLeave: () => void,
  newGame: NewGameSettingsOptions
): void {
  const themeLabel = document.createElement("p");
  themeLabel.textContent = "Giao diện:";
  body.appendChild(themeLabel);
  const themeRow = document.createElement("div");
  themeRow.className = "settings-row";
  for (const [value, label] of [
    ["light", "Sáng"],
    ["dark", "Tối"],
  ] as const) {
    const id = `settings-theme-${value}`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "settings-theme";
    input.id = id;
    input.checked = getThemePreference() === value;
    input.addEventListener("change", () => {
      localStorage.setItem(THEME_STORAGE_KEY, value);
      applyTheme(value);
    });
    const labelEl = document.createElement("label");
    labelEl.htmlFor = id;
    labelEl.appendChild(input);
    labelEl.append(` ${label}`);
    themeRow.appendChild(labelEl);
  }
  body.appendChild(themeRow);

  const fontLabel = document.createElement("p");
  fontLabel.textContent = "Cỡ chữ:";
  body.appendChild(fontLabel);
  const fontRow = document.createElement("div");
  fontRow.className = "settings-row";
  for (const [value, label] of [
    ["small", "Nhỏ"],
    ["medium", "Vừa"],
    ["large", "Lớn"],
  ] as const) {
    const id = `settings-font-${value}`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "settings-font-size";
    input.id = id;
    input.checked = getFontSizePreference() === value;
    input.addEventListener("change", () => {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, value);
      applyFontSize(value);
    });
    const labelEl = document.createElement("label");
    labelEl.htmlFor = id;
    labelEl.appendChild(input);
    labelEl.append(` ${label}`);
    fontRow.appendChild(labelEl);
  }
  body.appendChild(fontRow);

  const soundLabel = document.createElement("label");
  const soundInput = document.createElement("input");
  soundInput.type = "checkbox";
  soundInput.checked = isSoundEnabled();
  soundInput.addEventListener("change", () => {
    localStorage.setItem(SOUND_STORAGE_KEY, soundInput.checked ? "on" : "off");
    if (soundInput.checked) playSound("ui_toggle"); // xác nhận nghe thử ngay (im lặng nếu chưa có file)
  });
  soundLabel.appendChild(soundInput);
  soundLabel.append(" Âm thanh (chưa có file thật — bật sẵn để dùng ngay khi có)");
  const soundRow = document.createElement("p");
  soundRow.appendChild(soundLabel);
  body.appendChild(soundRow);

  if (newGame.visible) {
    if (newGame.confirmingNewGame) {
      const warning = document.createElement("p");
      warning.className = "error";
      warning.textContent = "Ván hiện tại CHƯA kết thúc. Huỷ ván này để bắt đầu ván mới?";
      body.appendChild(warning);
      const confirmRow = document.createElement("div");
      confirmRow.className = "settings-row";
      confirmRow.appendChild(button("Huỷ ván, bắt đầu mới", () => newGame.onConfirmNewGame()));
      confirmRow.appendChild(button("Không, tiếp tục ván này", () => newGame.onCancelNewGameConfirm()));
      body.appendChild(confirmRow);
    } else {
      body.appendChild(button("Bắt đầu ván mới", () => newGame.onRequestNewGame()));
    }
  }

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

// Mở rộng Dodge City, mục 1.2 — 3 tên nhân vật dùng chung action USE_ABILITY
// VÀ cần bước "chọn lá trên tay" ở client trước khi gửi đi (Chuck Wengam
// không cần lá nào — cardIds: [] — nên KHÔNG cần bước chọn, gửi thẳng).
export type UseAbilityCharacter = "sid_ketchum" | "jose_delgado" | "doc_holyday";

export type Selection =
  | { step: "idle" }
  | { step: "picking-target"; cardId: string; cardName: CardName }
  | { step: "picking-panic-equipment"; cardId: string; targetId: string }
  | { step: "picking-cat-balou-zone"; cardId: string; targetId: string }
  // Mở rộng Dodge City, mục 1.2 (Brawl) — người đánh chọn VÙNG bỏ bài riêng
  // cho TỪNG người khác còn sống trước khi gửi đi (khác Cat Balou — nạn nhân
  // tự chọn SAU, đây là người đánh chọn TRƯỚC).
  | { step: "picking-brawl-zones"; cardId: string; zones: Record<string, "hand" | "equipment"> }
  // Mở rộng Dodge City, mục 1.2 (Brawl/Rag Time/Springfield/Tequila/Whisky) —
  // bước CUỐI CÙNG trước khi gửi PLAY_CARD: chọn 1 lá phụ bất kỳ khác từ tay
  // để bỏ kèm. Đã gom đủ mọi field khác (targetId/targetCardId/brawlZones) từ
  // các bước trước đó, chỉ còn thiếu extraDiscardCardId.
  | {
      step: "picking-extra-discard";
      cardId: string;
      targetId?: string;
      targetCardId?: string;
      brawlZones?: Record<string, "hand" | "equipment">;
    }
  // Mở rộng Dodge City, mục 1.2 — USE_ABILITY (Sid Ketchum/José Delgado/Doc
  // Holyday) cần chọn ĐỦ `needed` lá trên tay TRƯỚC khi gửi đi. `playerId`:
  // chủ nhân kỹ năng — KHÔNG chắc là người đang tới lượt (Sid Ketchum dùng
  // được bất cứ lúc nào, kể cả không phải lượt/phản ứng của chính mình).
  | { step: "picking-ability-cards"; playerId: string; ability: UseAbilityCharacter; needed: number; selectedCardIds: string[] }
  // Mở rộng Dodge City, mục C nhóm C (Doc Holyday) — đã chọn đủ 2 lá, giờ chọn
  // mục tiêu để bắn.
  | { step: "picking-ability-target"; playerId: string; cardIds: string[] };

// Dòng gợi ý trong băng "Đang chọn... Huỷ" — trước đây LUÔN là "mục tiêu" (chỉ
// có 1 loại bước chọn), giờ có thêm bước chọn lá/vùng nên cần đúng chữ hơn.
function selectionHintText(selection: Selection): string {
  switch (selection.step) {
    case "picking-brawl-zones":
      return "Đang chọn vùng bỏ bài cho từng người...";
    case "picking-extra-discard":
      return "Đang chọn lá phụ để bỏ kèm...";
    case "picking-ability-cards":
      return "Đang chọn lá để dùng kỹ năng...";
    case "picking-ability-target":
      return "Đang chọn mục tiêu cho kỹ năng...";
    default:
      return "Đang chọn mục tiêu...";
  }
}

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
  // Mở rộng Dodge City, mục 1.2 — bấm 1 lá đang ở bước "picking-brawl-zones"
  // (Brawl) hoặc "picking-extra-discard" (Brawl/Rag Time/Springfield/Tequila/
  // Whisky) đều KHÔNG dùng hàm này — xem onBrawlZonePick()/onExtraDiscardCardClick()
  // riêng bên dưới, vì 2 bước đó cần thêm dữ liệu ngoài cardId.
  onBrawlZonePick(targetId: string, zone: "hand" | "equipment"): void;
  onBrawlZonesConfirmed(): void;
  onExtraDiscardCardClick(cardId: string): void;
  // Mở rộng Dodge City, mục 1.2 — USE_ABILITY. `onArmAbility`: bấm nút "Dùng
  // kỹ năng" của Sid Ketchum/José Delgado/Doc Holyday (Chuck Wengam không cần
  // chọn lá gì nên dùng thẳng `onUseChuckWengamAbility`, gửi đi ngay).
  onArmAbility(playerId: string, ability: UseAbilityCharacter): void;
  onUseChuckWengamAbility(playerId: string): void;
  onToggleAbilityCard(cardId: string): void;
  onConfirmAbilityCards(): void;
  onAbilityTargetClick(targetId: string): void;
  // Giai đoạn 5, việc bổ sung — 3 nhân vật (Pedro Ramirez/Jesse Jones/Kit
  // Carlson) cần lựa chọn riêng ngoài các handler ở trên. "Không chọn"/mặc
  // định của cả 3 đều tái dùng onRespondTakeConsequence có sẵn.
  onPickDrawSource(cardId: string): void;
  onPickDrawTarget(targetId: string, letTargetChoose: boolean): void;
  onPickKeptCard(cardId: string): void;
  // Mở rộng Dodge City, mục C nhóm A (Pat Brennan) — chọn lấy đúng 1 lá trang
  // bị `cardId` của người chơi `targetId` vào tay mình, thay vì rút bài.
  onPickEquipmentFromPlayer(targetId: string, cardId: string): void;
  // Mở rộng Dodge City, mục C nhóm C (Vera Custer) — chọn mượn khả năng của
  // người chơi `targetId` (bắt buộc chọn, không có lựa chọn "không mượn ai").
  onPickBorrowedCharacter(targetId: string): void;
  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // trả lời NEED_PICK_ARMED. true = vũ trang (rút 1 lá lượt này); false =
  // không vũ trang (rút 2 lá bình thường, dùng cho nút "Không vũ trang" —
  // KHÔNG tái dùng onRespondTakeConsequence dù kết quả cuối tương đương, để
  // nút bấm rõ nghĩa hơn là "chọn không" thay vì "mặc định/hết giờ").
  onPickArmed(armed: boolean): void;
  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
  // — trả lời NEED_PICK_MARCEL_COMPANION: chọn `targetId` làm người "cùng vào
  // tù" (bắt buộc chọn, không có lựa chọn "không chọn ai").
  onPickMarcelCompanion(targetId: string): void;
  // Đợt 2 UI/UX (mục 4) — bấm "nở"/"thu gọn" khu trang bị của 1 seat khi bàn
  // >6 người. Client-only, không phải hành động ván đấu, không gửi lên server.
  onToggleSeatExpanded(playerId: string): void;
  // Đợt 3 UI/UX (mục 9) — mở/đóng 2 dialog góc màn hình (nhật ký/cài đặt).
  // Client-only, y hệt onToggleSeatExpanded — không liên quan GameState.
  onOpenLogDialog(): void;
  onCloseLogDialog(): void;
  onOpenSettingsDialog(): void;
  onCloseSettingsDialog(): void;
  // Bổ sung — dialog "Thư viện bài" mở giữa ván, không văng khỏi ván (xem
  // renderGameToolbar()). Client-only, y hệt 2 dialog trên.
  onOpenCardReferenceDialog(): void;
  onCloseCardReferenceDialog(): void;
  // Bổ sung 2026-08-08 — ô tìm kiếm ĐẦU dialog Thư viện bài (xem
  // renderCardReferenceSearchBox()). Cập nhật `cardReferenceSearchQuery` ở
  // options tương ứng RỒI render() lại NGAY (khác mọi input khác trong dự án
  // — lọc kết quả theo từng phím gõ bắt buộc phải vẽ lại danh sách).
  onCardReferenceSearchChange(value: string): void;
  // Nút "Về màn hình chính" BÊN TRONG dialog Cài đặt.
  onLeaveGame(): void;
  // Bổ sung — nút "Bắt đầu ván mới" BÊN TRONG dialog Cài đặt. Bấm lần đầu gọi
  // onRequestNewGame() — ván ĐÃ kết thúc thì main.ts tự bắt đầu ngay (không
  // cần hỏi); ván CHƯA kết thúc thì main.ts chuyển dialog sang bước xác nhận
  // (renderSettingsDialogBody() đọc `confirmingNewGame` để đổi nội dung dialog
  // — KHÔNG mở thêm 1 dialog mới, tránh lỗi chồng dialog đã gặp ở đợt trước).
  // onConfirmNewGame(): xác nhận huỷ ván cũ, thật sự bắt đầu ván mới.
  // onCancelNewGameConfirm(): huỷ bước xác nhận, quay lại dialog Cài đặt bình thường.
  onRequestNewGame(): void;
  onConfirmNewGame(): void;
  onCancelNewGameConfirm(): void;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

// Bản Beta song song (LO-TRINH.md) — chỉ mở URL khác ở TAB MỚI, không có
// logic chuyển đổi runtime nào cả, nên là 1 thẻ `<a>` thường (trông giống
// button qua class `.link-button`, xem style.css), không phải button+handler.
function linkButton(label: string, href: string): HTMLAnchorElement {
  const el = document.createElement("a");
  el.textContent = label;
  el.href = href;
  el.target = "_blank";
  el.rel = "noopener noreferrer";
  el.className = "link-button";
  return el;
}

// Giai đoạn 5 (Calamity Janet) — lá `cardId` có ĐÓNG VAI Bang!/Missed! được
// không, mirror ĐÚNG logic actsAsBang()/actsAsMissed() (core/reduce.ts, không
// export) — chỉ để UI biết vẽ nút bấm được ở đâu, KHÔNG thay cho việc reduce()
// tự kiểm tra lại. Sửa 1 bên thì nhớ sửa bên kia.
export function cardActsAsBang(cardId: string, characterId: string | null): boolean {
  const name = cardNameFromId(cardId);
  if (name === "bang") return true;
  return name === "missed" && getCharacterDefinition(characterId)?.hasBangMissedAlias === true;
}

function cardActsAsMissed(cardId: string, characterId: string | null): boolean {
  const name = cardNameFromId(cardId);
  if (name === "missed" || name === "dodge") return true;
  // Mở rộng Dodge City, mục C nhóm B (Elena Fuente) — MỌI lá trên tay đều
  // dùng được như Missed!, không riêng "bang" như Calamity Janet.
  if (getCharacterDefinition(characterId)?.hasAnyCardMissedAlias === true) return true;
  return name === "bang" && getCharacterDefinition(characterId)?.hasBangMissedAlias === true;
}

// So khớp 1 lá trên tay với `respondableName` (kết quả của respondableCardName
// bên dưới) — dùng cardActsAsBang/cardActsAsMissed thay vì so tên chuỗi trực
// tiếp, để Janet bấm được Bang! khi cần đỡ (respondableName "missed") và
// Missed! khi cần đánh trả (respondableName "bang").
function cardMatchesRespondable(cardId: string, characterId: string | null, respondableName: CardName): boolean {
  if (respondableName === "missed") return cardActsAsMissed(cardId, characterId);
  if (respondableName === "bang") return cardActsAsBang(cardId, characterId);
  return cardNameFromId(cardId) === respondableName;
}

// Danh sách tên bài mà người ĐANG PHẢN HỒI (đứng đầu pending) có thể bấm để
// đáp lại — mỗi kind chỉ chấp nhận đúng 1 loại bài (xem PendingAction ở
// types.ts). Chỉ để quyết định bấm được lá nào, KHÔNG thay cho việc reduce()
// tự kiểm tra lại — bấm sai/không hợp lệ vẫn báo lỗi bình thường.
function respondableCardName(pendingKind: string): CardName | null {
  switch (pendingKind) {
    case "NEED_MISSED":
    case "NEED_DISCARD_MISSED_OR_DAMAGE":
      return "missed";
    case "NEED_DISCARD_BANG":
    case "NEED_DUEL_RESPONSE":
      return "bang";
    default:
      return null;
  }
}

// Mở rộng Dodge City, mục 1.1 — lá vàng "trì hoãn" `cardId` ĐANG BÀY trên sân
// dùng được NGAY để đỡ Missed! không — mirror isEquipmentUsableAsMissed()
// (core/reduce.ts, không export). 2 đường: (1) nhóm yellowCardActsAsMissed()
// (Bible/Sombrero/Ten Gallon Hat/Iron Plate) VÀ đã qua ít nhất 1 lượt kể từ
// lúc chơi ra; (2) Elena Fuente (canUseOwnEquipmentAsMissed) — BẤT KỲ lá nào
// trên sân, không cần chờ, TRỪ Dynamite. CHỈ để quyết định vẽ nút bấm ở đâu —
// KHÔNG mô phỏng ảnh hưởng Belle Star (disablesOthersEquipment, hiếm gặp,
// core vẫn tự chặn lại nếu bấm nhầm lúc đó).
function equipmentActsAsMissed(
  cardId: string,
  characterId: string | null,
  equipmentPlayedTurn: Record<string, number>,
  turnNumber: number
): boolean {
  const name = cardNameFromId(cardId);
  if (getCharacterDefinition(characterId)?.canUseOwnEquipmentAsMissed === true) {
    return name !== "dynamite";
  }
  return yellowCardActsAsMissed(name) && equipmentPlayedTurn[cardId] !== turnNumber;
}

// Mở rộng Dodge City, mục 1.1 — lá vàng "trì hoãn" `cardId` ĐANG BÀY trên sân
// kích hoạt được NGAY không (activateDelayedEquipment() ở core/reduce.ts) —
// mọi lá vàng TRỪ nhóm chỉ dùng để đỡ Missed! (Bible/Sombrero/Ten Gallon Hat/
// Iron Plate — core từ chối tự đánh ra nhóm này), và phải đã qua ít nhất 1
// lượt kể từ lúc chơi ra.
function canActivateDelayedEquipment(
  cardId: string,
  equipmentPlayedTurn: Record<string, number>,
  turnNumber: number
): boolean {
  const name = cardNameFromId(cardId);
  if (!isDelayedEquipmentCardName(name) || yellowCardActsAsMissed(name)) return false;
  return equipmentPlayedTurn[cardId] !== turnNumber;
}

// Slab the Killer (missesNeeded > 1, xem reduce.ts's respondToMissed) — luật
// gốc "if able": chỉ được bỏ Missed! khi ĐANG CÓ ĐỦ số lá cần ngay từ đầu
// (tay CỘNG lá vàng trên sân đã dùng được, mở rộng Dodge City), không được bỏ
// dở dang rồi hết giữa chừng (mất lá mà vẫn không né được). Không đủ thì ẨN
// nút bấm Missed! (chỉ còn "Chịu mất máu" khả dụng) — core (respondToMissed)
// cũng tự chặn lại, đây chỉ để khỏi bấm vào rồi mới báo lỗi.
function hasEnoughMissedToRespond(
  top: { kind: string; missesNeeded?: number },
  hand: readonly string[],
  equipment: readonly string[],
  characterId: string | null,
  equipmentPlayedTurn: Record<string, number>,
  turnNumber: number
): boolean {
  if (top.kind !== "NEED_MISSED" && top.kind !== "NEED_DISCARD_MISSED_OR_DAMAGE") return true;
  const needed = top.missesNeeded ?? 1;
  const eligibleFromHand = hand.filter((id) => cardActsAsMissed(id, characterId)).length;
  const eligibleFromEquipment = equipment.filter((id) =>
    equipmentActsAsMissed(id, characterId, equipmentPlayedTurn, turnNumber)
  ).length;
  return eligibleFromHand + eligibleFromEquipment >= needed;
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
  // Mở rộng Dodge City, mục 1.2 — bước cuối của Brawl/Rag Time/Springfield/
  // Tequila/Whisky: chọn 1 lá phụ bất kỳ KHÁC lá chính đang đánh (lá đó vẫn
  // còn TRONG tay lúc này — chưa dispatch — nên phải tự loại trừ ở đây).
  const isPickingExtraDiscard =
    selection.step === "picking-extra-discard" && player.id === state.players[state.currentPlayerIndex].id;
  // Mở rộng Dodge City, mục C — USE_ABILITY (Sid Ketchum/José Delgado/Doc
  // Holyday) chọn ĐỦ số lá cần trước khi gửi đi. José Delgado CHỈ được chọn
  // lá xanh dương (equipment "instant") — lá khác hiện dạng chip, không bấm được.
  const isPickingAbilityCards = selection.step === "picking-ability-cards" && selection.playerId === player.id;

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      wrapper.appendChild(
        cardButton(cardId, () => handlers.onToggleDiscardCard(cardId), selected ? "card-box--checked" : undefined)
      );
      continue;
    }

    if (isPickingExtraDiscard) {
      if (cardId === selection.cardId) {
        wrapper.appendChild(cardChip(cardId));
      } else {
        wrapper.appendChild(cardButton(cardId, () => handlers.onExtraDiscardCardClick(cardId)));
      }
      continue;
    }

    if (isPickingAbilityCards) {
      if (selection.ability === "jose_delgado" && !isSelfEquipBlueCardName(name)) {
        wrapper.appendChild(cardChip(cardId));
      } else {
        const checked = selection.selectedCardIds.includes(cardId);
        wrapper.appendChild(
          cardButton(cardId, () => handlers.onToggleAbilityCard(cardId), checked ? "card-box--checked" : undefined)
        );
      }
      continue;
    }

    if (isDiscardFromHand || isGivingCardToJesse) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      continue;
    }

    if (respondableName !== null) {
      if (
        cardMatchesRespondable(cardId, player.characterId, respondableName) &&
        hasEnoughMissedToRespond(top, player.hand, player.equipment, player.characterId, state.equipmentPlayedTurn, state.turnNumber)
      ) {
        wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      } else {
        wrapper.appendChild(cardChip(cardId));
      }
      continue;
    }

    // Giai đoạn 5 (Calamity Janet) — Missed! của Janet ĐÓNG VAI Bang! nên vẫn
    // bấm được chủ động trong lượt mình, khác Missed! thường (không bao giờ
    // đánh chủ động được).
    if (isCurrentTurnToPlay && (name !== "missed" || cardActsAsBang(cardId, player.characterId))) {
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
  // Mở rộng Dodge City, mục 1.1 — đang chờ ĐÚNG người này đỡ Bang!/Gatling
  // (NEED_MISSED): lá vàng trên sân dùng được như Missed! bấm được luôn, y
  // hệt lá trên tay (xem respondableCardName()/hasEnoughMissedToRespond() ở trên).
  const isRespondingWithMissed =
    top !== undefined &&
    top.player === player.id &&
    (top.kind === "NEED_MISSED" || top.kind === "NEED_DISCARD_MISSED_OR_DAMAGE");
  // Mở rộng Dodge City, mục 1.1 — đang chính lượt CHƠI của người này, không có
  // pending/selection nào khác đang dở dang -> lá vàng "trì hoãn" đã qua đủ 1
  // lượt bấm được để KÍCH HOẠT (activateDelayedEquipment() ở reduce.ts).
  const isMyTurnToActivate =
    state.pending.length === 0 &&
    state.turnPhase === "play" &&
    state.players[state.currentPlayerIndex].id === player.id &&
    selection.step === "idle";

  for (const cardId of player.equipment) {
    const name = cardNameFromId(cardId);
    const isDynamite = name === "dynamite";
    const dangerClass = equipmentDangerClass(name);

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    if (
      isRespondingWithMissed &&
      equipmentActsAsMissed(cardId, player.characterId, state.equipmentPlayedTurn, state.turnNumber)
    ) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    if (isMyTurnToActivate && canActivateDelayedEquipment(cardId, state.equipmentPlayedTurn, state.turnNumber)) {
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

  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // đọc THẲNG player.characterId (không qua getEffectiveCharacterDefinition/
  // getEffectiveCharacterId, 2 hàm đó cần GameState đầy đủ, phía network chỉ
  // có PlayerView không đủ dữ liệu) — CÙNG giới hạn có sẵn với MỌI nút bấm
  // khả năng "mượn" khác của Vera Custer trong file này (vd renderAbilitySection,
  // đều đọc player.characterId thật, chưa có hàm "effective" phía client),
  // không phải giới hạn MỚI riêng của Elena Noir. Dữ liệu cốt lõi (reduce.ts)
  // đã tách theo playerId, đúng cho cả trường hợp Vera Custer mượn — chỉ badge
  // hiển thị này chưa vẽ ra cho ca đó.
  if (player.characterId === "elena_noir" && state.elenaNoirImmortalTurnsLeft[player.id] !== undefined) {
    const immortalLabel = document.createElement("p");
    immortalLabel.className = "player--targeted-label";
    immortalLabel.textContent = `☠ Miễn Tử — còn ${state.elenaNoirImmortalTurnsLeft[player.id]} lượt`;
    el.appendChild(immortalLabel);
  }
  // Bộ mở rộng "custom_characters" (Marcel Marcelo) — 2 hướng khác nhau: badge
  // trên CHÍNH Marcel (player.id là khoá) cho biết đã chỉ định ai; badge trên
  // NGƯỜI ĐƯỢC CHỌN (player.id là giá trị) cho biết đang chờ ăn theo kết quả.
  // Không loại trừ 2 badge còn lại (sắp mất lượt) — dùng state trực tiếp,
  // không lọc theo characterId cụ thể vì đây là trạng thái của người liên quan.
  const marcelCompanionId = state.marcelJailCompanion[player.id];
  if (marcelCompanionId) {
    const label = document.createElement("p");
    label.className = "player--targeted-label";
    label.textContent = `Đã chỉ định ${state.players.find((p) => p.id === marcelCompanionId)?.name ?? marcelCompanionId} cùng vào tù`;
    el.appendChild(label);
  }
  if (Object.values(state.marcelJailCompanion).includes(player.id)) {
    const label = document.createElement("p");
    label.className = "player--targeted-label";
    label.textContent = `Đang chờ ăn theo kết quả thoát tù của Marcel Marcelo`;
    el.appendChild(label);
  }
  if (state.marcelCompanionSkipNextTurn[player.id]) {
    const label = document.createElement("p");
    label.className = "player--targeted-label";
    label.textContent = `Sẽ mất lượt kế tiếp (cùng vào tù với Marcel Marcelo)`;
    el.appendChild(label);
  }

  const handLabel = document.createElement("p");
  handLabel.textContent = `Bài trên tay (${player.hand.length}):`;
  el.appendChild(handLabel);
  renderHandSection(el, state, player, options, handlers);
  renderAbilitySection(el, state, player, selection, handlers);

  // Đợt 2 UI/UX (mục 4) — đang có hành động THẬT SỰ cần bấm vào khu trang bị
  // của người này (Cat Balou bắt bỏ / Panic! chọn mục tiêu / mở rộng Dodge
  // City: đỡ Bang! bằng lá vàng) → LUÔN hiện đầy đủ, bất kể đang thu gọn —
  // cùng điều kiện renderEquipmentSection() tự kiểm tra bên trong nó, viết lại
  // ở đây chỉ để QUYẾT ĐỊNH thu/nở.
  const forceShowEquipment =
    (topPending !== undefined &&
      topPending.player === player.id &&
      ((topPending.kind === "NEED_DISCARD_FROM_ZONE" && topPending.zone === "equipment") ||
        topPending.kind === "NEED_MISSED" ||
        topPending.kind === "NEED_DISCARD_MISSED_OR_DAMAGE")) ||
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
  // khi đang ở bước "picking-target". NGOẠI LỆ: Tequila (mở rộng Dodge City)
  // cho phép tự chọn CHÍNH MÌNH làm mục tiêu (tự hồi máu) — khác mọi lá khác
  // dùng bước này.
  if (selection.step === "picking-target" && player.alive) {
    const acting = state.players[state.currentPlayerIndex];
    // Jail KHÔNG BAO GIỜ được đánh lên Cảnh sát trưởng (reduce.ts's playJail()
    // từ chối hẳn) — ẩn nút luôn ở đây thay vì để người chơi bấm rồi bị dội lỗi,
    // giống cách room.ts đã lọc sẵn ứng viên cho các trường hợp "chắc chắn bị
    // từ chối" khác (vd Dynamite miễn nhiễm Cat Balou).
    const jailOnSheriff = selection.cardName === "jail" && player.role === "sheriff";
    if ((player.id !== acting.id || selection.cardName === "tequila") && !jailOnSheriff) {
      el.appendChild(button("Chọn làm mục tiêu", () => handlers.onPlayerClick(player.id)));
    }
  }

  // Mở rộng Dodge City, mục C nhóm C (Doc Holyday) — đã chọn đủ 2 lá bỏ, giờ
  // chọn mục tiêu để bắn (không cho tự chọn chính mình, xem useDocHolydayShot()).
  if (selection.step === "picking-ability-target" && player.alive && player.id !== selection.playerId) {
    el.appendChild(button("Chọn làm mục tiêu", () => handlers.onAbilityTargetClick(player.id)));
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

  // Brawl (mở rộng Dodge City) — người đánh chọn VÙNG bỏ bài riêng cho TỪNG
  // người khác còn sống (khác Cat Balou ở trên: đây là người ĐÁNH chọn
  // TRƯỚC, không phải nạn nhân tự chọn SAU) — hiện cho MỌI người khác, không
  // chỉ 1 người, đánh dấu ✓ vào vùng đã chọn để biết đã bấm hay chưa.
  if (selection.step === "picking-brawl-zones" && player.alive && player.id !== state.players[state.currentPlayerIndex].id) {
    const chosenZone = selection.zones[player.id];
    const zoneWrapper = document.createElement("div");
    zoneWrapper.className = "cards";
    zoneWrapper.appendChild(
      button(chosenZone === "hand" ? "✓ Bỏ kèm: tay" : "Bỏ kèm: tay", () => handlers.onBrawlZonePick(player.id, "hand"))
    );
    zoneWrapper.appendChild(
      button(chosenZone === "equipment" ? "✓ Bỏ kèm: sân" : "Bỏ kèm: sân", () =>
        handlers.onBrawlZonePick(player.id, "equipment")
      )
    );
    el.appendChild(zoneWrapper);
  }

  return el;
}

// Mở rộng Dodge City, mục 1.2 + mục C — nút "Dùng kỹ năng" cho 4 nhân vật
// dùng chung USE_ABILITY (Sid Ketchum/Chuck Wengam/José Delgado/Doc Holyday).
// Gọi cho MỌI seat (không chỉ người đang tới lượt) — Sid Ketchum dùng được
// BẤT CỨ LÚC NÀO, kể cả không phải lượt/phản ứng của chính mình.
function renderAbilitySection(
  container: HTMLElement,
  state: GameState,
  player: PlayerState,
  selection: Selection,
  handlers: UiHandlers
): void {
  if (!player.alive || !player.characterId) return;
  const def = getCharacterDefinition(player.characterId);
  if (!def) return;

  const isMyTurnNoPending =
    state.pending.length === 0 &&
    state.turnPhase === "play" &&
    state.players[state.currentPlayerIndex].id === player.id;

  if (selection.step === "idle") {
    if (def.canSelfHeal && player.hand.length >= 2) {
      container.appendChild(
        button("Dùng kỹ năng: bỏ 2 lá hồi 1 máu", () => handlers.onArmAbility(player.id, "sid_ketchum"))
      );
    } else if (def.canPayLifeToDraw && isMyTurnNoPending && player.hp > 1) {
      container.appendChild(
        button("Dùng kỹ năng: mất 1 máu rút 2 lá", () => handlers.onUseChuckWengamAbility(player.id))
      );
    } else if (
      def.canDiscardEquipmentToDraw &&
      isMyTurnNoPending &&
      state.joseDelgadoUsesThisTurn < 2 &&
      player.hand.some((id) => isSelfEquipBlueCardName(cardNameFromId(id)))
    ) {
      container.appendChild(
        button("Dùng kỹ năng: bỏ 1 lá xanh dương rút 2 lá", () => handlers.onArmAbility(player.id, "jose_delgado"))
      );
    } else if (
      def.canDiscardTwoForBang &&
      isMyTurnNoPending &&
      !state.docHolydayUsedThisTurn &&
      player.hand.length >= 2
    ) {
      container.appendChild(
        button("Dùng kỹ năng: bỏ 2 lá bắn Bang!", () => handlers.onArmAbility(player.id, "doc_holyday"))
      );
    }
  }

  if (selection.step === "picking-ability-cards" && selection.playerId === player.id) {
    const info = document.createElement("p");
    info.textContent = `Đã chọn ${selection.selectedCardIds.length}/${selection.needed} lá cho kỹ năng`;
    container.appendChild(info);
    const confirmBtn = button("Xác nhận", () => handlers.onConfirmAbilityCards());
    confirmBtn.disabled = selection.selectedCardIds.length !== selection.needed;
    container.appendChild(confirmBtn);
  }
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
    case "NEED_PICK_DRAW_OR_EQUIPMENT":
      return `${player} chọn rút bộ bài hay lấy 1 lá trang bị của người khác`;
    case "NEED_PICK_BORROWED_CHARACTER":
      return `${player} chọn mượn khả năng của 1 người chơi khác`;
    case "NEED_PICK_ARMED":
      return `${player} (Elena Noir) chọn vũ trang khả năng Miễn Tử cho lượt này hay không`;
    case "NEED_PICK_MARCEL_COMPANION":
      return `${player} (Marcel Marcelo) chọn 1 người cùng vào tù`;
    case "NEED_BLOOD_BROTHERS_GIFT":
      return `${player} chọn tặng 1 máu cho ai đó (hoặc bỏ qua)`;
    case "NEED_PICK_HARD_LIQUOR":
      return `${player} chọn bỏ qua pha rút để hồi 1 máu, hay rút bài như thường`;
    case "NEED_MISSED_FOR_EQUIPMENT":
      return `${player} đỡ đòn Ricochet bằng Missed! (hoặc mất lá trang bị)`;
    case "NEED_RANCH_EXCHANGE":
      return `${player} chọn đổi bài (hoặc bỏ qua)`;
    case "NEED_DISCARD_MISSED_OR_DAMAGE":
      return `${player} bỏ 1 lá Missed! (Russian Roulette, hoặc chịu mất 2 máu)`;
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
  } else if (
    top.kind === "NEED_MISSED" ||
    top.kind === "NEED_DISCARD_BANG" ||
    top.kind === "NEED_DUEL_RESPONSE" ||
    top.kind === "NEED_DISCARD_MISSED_OR_DAMAGE"
  ) {
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
  } else if (top.kind === "NEED_PICK_DRAW_OR_EQUIPMENT") {
    panel.appendChild(button("Rút bộ bài", () => handlers.onRespondTakeConsequence()));
    for (const p of state.players) {
      if (!p.alive || p.id === top.player || p.equipment.length === 0) continue;
      const label = document.createElement("p");
      label.textContent = `Lấy trang bị của ${p.name}:`;
      panel.appendChild(label);
      const wrapper = document.createElement("div");
      wrapper.className = "cards";
      for (const cardId of p.equipment) {
        wrapper.appendChild(cardButton(cardId, () => handlers.onPickEquipmentFromPlayer(p.id, cardId)));
      }
      panel.appendChild(wrapper);
    }
  } else if (top.kind === "NEED_PICK_BORROWED_CHARACTER") {
    for (const p of state.players) {
      if (!p.alive || p.id === top.player || !p.characterId) continue;
      panel.appendChild(
        button(`Mượn khả năng của ${p.name} (${characterLabel(p.characterId)})`, () =>
          handlers.onPickBorrowedCharacter(p.id)
        )
      );
    }
  } else if (top.kind === "NEED_PICK_ARMED") {
    panel.appendChild(button("Vũ trang (rút 1 lá)", () => handlers.onPickArmed(true)));
    panel.appendChild(button("Không vũ trang (rút 2 lá)", () => handlers.onPickArmed(false)));
  } else if (top.kind === "NEED_PICK_MARCEL_COMPANION") {
    for (const p of state.players) {
      if (!p.alive || p.id === top.player) continue;
      panel.appendChild(button(`Chỉ định ${p.name} cùng vào tù`, () => handlers.onPickMarcelCompanion(p.id)));
    }
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
          characterOptionCard(characterId, player?.role ?? null, characterId === armedId, () =>
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
  // Bổ sung — dialog "Thư viện bài" mở giữa ván (xem renderGameToolbar()).
  cardReferenceDialogOpen: boolean;
  // Bổ sung 2026-08-08 — nội dung đang gõ trong ô tìm kiếm của dialog trên.
  cardReferenceSearchQuery: string;
  // Bổ sung — đang ở bước xác nhận "huỷ ván hiện tại để bắt đầu ván mới"
  // BÊN TRONG dialog Cài đặt (chỉ có ý nghĩa khi settingsDialogOpen === true).
  confirmingNewGame: boolean;
}

export function renderApp(
  container: HTMLElement,
  state: GameState,
  options: RenderOptions,
  handlers: UiHandlers
): void {
  container.replaceChildren();

  // Phản hồi thật: thanh nút góc trên (`.game-toolbar`) trước đây `position:
  // fixed` NỔI ĐÈ lên nội dung — seat trên cùng của bàn tròn hay bị che
  // khuất. Vẽ toolbar NGAY ĐẦU (trước mọi nội dung khác) + CSS đổi sang
  // `position: sticky` (xem style.css): giờ nó CHIẾM 1 hàng thật ở đầu
  // trang, nội dung phía dưới luôn bắt đầu SAU nó, không bao giờ bị che.
  renderGameToolbar(
    container,
    handlers.onOpenLogDialog,
    handlers.onOpenSettingsDialog,
    handlers.onOpenCardReferenceDialog,
    undefined
  );

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

  container.appendChild(
    renderTableCenter(
      state.deck.length,
      state.discardPile,
      state.activeEventId,
      state.eventDeck.length > 0 ? state.eventDeck[state.eventDeck.length - 1] : null
    )
  );

  renderActiveHouseRules(container, state.houseRules);
  renderActiveExpansions(container, state.expansions);

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
    hint.appendChild(document.createTextNode(selectionHintText(options.selection) + " "));
    // Brawl (mở rộng Dodge City) — chỉ hiện nút "Tiếp tục" khi ĐÃ chọn đủ vùng
    // cho MỌI người khác còn sống (khác chính người đánh).
    if (options.selection.step === "picking-brawl-zones") {
      const sel = options.selection;
      const others = state.players.filter((p) => p.alive && p.id !== state.players[state.currentPlayerIndex].id);
      if (others.length > 0 && others.every((p) => sel.zones[p.id] !== undefined)) {
        hint.appendChild(button("Tiếp tục — chọn lá phụ", () => handlers.onBrawlZonesConfirmed()));
      }
    }
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
    renderDialog("Nhật ký ván đấu", handlers.onCloseLogDialog, (body) => renderLogDialogBody(body, options.log));
  }
  if (options.cardReferenceDialogOpen) {
    renderDialog("Thư viện bài", handlers.onCloseCardReferenceDialog, (body) => {
      renderCardReferenceSearchBox(body, options.cardReferenceSearchQuery, handlers.onCardReferenceSearchChange);
      renderCardReferenceBody(body, options.cardReferenceSearchQuery);
    });
  }
  if (options.settingsDialogOpen) {
    renderDialog("Cài đặt", handlers.onCloseSettingsDialog, (body) =>
      renderSettingsDialogBody(body, "Về màn hình chính", handlers.onLeaveGame, {
        visible: true,
        confirmingNewGame: options.confirmingNewGame,
        onRequestNewGame: handlers.onRequestNewGame,
        onConfirmNewGame: handlers.onConfirmNewGame,
        onCancelNewGameConfirm: handlers.onCancelNewGameConfirm,
      })
    );
  }
  reconcileOpenDialog(
    [
      options.logDialogOpen && "Nhật ký ván đấu",
      options.cardReferenceDialogOpen && "Thư viện bài",
      options.settingsDialogOpen && "Cài đặt",
    ].filter((v): v is string => v !== false)
  );
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
  onToggleExpansion(id: ExpansionId): void;
  onStartGame(): void;
}

const MIN_PLAYERS = 2; // biến thể 2 người (xem LO-TRINH.md) — setup.ts's isDuelMode()
const MAX_PLAYERS = 8; // biến thể 8 người (xem LO-TRINH.md) — setup.ts's ROLE_SETS đã hỗ trợ

export function renderSetupScreen(
  container: HTMLElement,
  names: string[],
  error: string | null,
  selectedHouseRules: HouseRuleId[],
  selectedExpansions: ExpansionId[],
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
  renderExpansionCheckboxes(container, selectedExpansions, handlers.onToggleExpansion);

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

// Bản Beta song song (LO-TRINH.md) — label + href tính sẵn ở main.ts (đọc
// `location.hostname` để biết đang ở bản chính hay bản beta), KHÔNG PHẢI
// handler vì chỉ mở tab mới, không dispatch action nào cả.
export interface BetaLinkInfo {
  label: string;
  href: string;
}

export function renderHomeScreen(container: HTMLElement, betaLink: BetaLinkInfo, handlers: HomeHandlers): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Chọn cách chơi";
  container.appendChild(heading);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.appendChild(button("Chơi chung 1 máy (hotseat)", () => handlers.onPlayLocal()));
  panel.appendChild(button("Chơi qua mạng", () => handlers.onPlayNetwork()));
  panel.appendChild(button("Thư viện bài", () => handlers.onShowCardReference()));
  panel.appendChild(linkButton(betaLink.label, betaLink.href));
  container.appendChild(panel);
}

// Việc 4.6: màn hình tra cứu — liệt kê đủ lá nâu/xanh/vàng + nhân vật + lá sự
// kiện, mỗi lá 1 dòng ảnh nhỏ+tên+mô tả (dùng chung appendCardVisual() với lá
// trong ván). Không cần cardId thật (không gắn với ván nào) — CardName suông
// là đủ cho appendCardVisual()/CARD_DESCRIPTIONS, không phải suy ngược qua
// cardNameFromId() như cardButton()/cardChip() (2 hàm đó phục vụ lá THẬT trong
// ván, luôn có cardId).
//
// Bổ sung 2026-08-08 (yêu cầu chủ dự án): thêm ô tìm kiếm ở ĐẦU thư viện (cả
// màn hình đầy đủ LẪN dialog mở giữa ván — dùng chung renderCardReferenceBody()
// nên chỉ cần sửa 1 chỗ), đổi hẳn layout GRID sang LIST (dễ đọc hơn, đặc biệt
// trên điện thoại chiều dọc — xem CSS .card-ref-list/.card-ref-item), và bổ
// sung 2 nhóm trước đây bị BỎ SÓT hoàn toàn: 13 lá VÀNG "trì hoãn" (Dodge
// City) và lá SỰ KIỆN (High Noon + A Fistful of Cards) — CHỈ liệt kê đúng
// những lá THẬT SỰ có trong bộ bốc (EXPANSION_EVENT_IDS ở events.ts đã tự loại
// Ghost Town/Dead Man/Law of the West/Peyote — core chưa cài, xem events.ts),
// tự động cập nhật khi sau này cài thêm lá mới, không cần sửa danh sách ở đây.
export interface CardReferenceHandlers {
  onBack(): void;
}

// Bỏ dấu tiếng Việt + thường hoá — cho phép gõ không dấu ("ngua") vẫn khớp
// tên có dấu ("Ngựa"). Không cần thư viện ngoài, Unicode NFD + xoá dải combining
// diacritics (U+0300-036F) là đủ cho toàn bộ nguyên âm có dấu tiếng Việt.
function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function matchesSearch(query: string, ...texts: string[]): boolean {
  if (query.trim() === "") return true;
  const q = normalizeForSearch(query);
  return texts.some((t) => normalizeForSearch(t).includes(q));
}

// 1 dòng trong danh sách — ảnh nhỏ bên trái, tên (đậm) + mô tả bên phải. Dùng
// chung cho cả 3 nhóm (lá bài/nhân vật/sự kiện), chỉ khác nguồn ảnh + class
// viền màu.
function renderCardRefListItem(
  container: HTMLElement,
  imageUrl: string,
  boxModifierClass: string,
  name: string,
  description: string
): void {
  const item = document.createElement("div");
  item.className = "card-ref-item";

  const box = document.createElement("div");
  box.className = `card-box ${boxModifierClass}`;
  // Không truyền tên/mô tả cho appendCardVisual() — tên hiện riêng ở khối chữ
  // bên cạnh (xem CSS ẩn .card-box__name trong ngữ cảnh list), tránh lặp 2 lần.
  appendCardVisual(box, imageUrl, "");
  item.appendChild(box);

  const textBlock = document.createElement("div");
  textBlock.className = "card-ref-item__text";
  const nameEl = document.createElement("strong");
  nameEl.textContent = name;
  textBlock.appendChild(nameEl);
  const desc = document.createElement("p");
  desc.className = "card-ref-item__desc";
  desc.textContent = description;
  textBlock.appendChild(desc);
  item.appendChild(textBlock);

  container.appendChild(item);
}

// Trả về true nếu có vẽ ít nhất 1 dòng (để renderCardReferenceBody() biết có
// nên hiện "không tìm thấy" hay không).
function renderCardReferenceGroup(
  container: HTMLElement,
  heading: string,
  names: readonly CardName[],
  query: string
): boolean {
  const matched = names.filter((name) => matchesSearch(query, CARD_LABELS[name], CARD_DESCRIPTIONS[name]));
  if (matched.length === 0) return false;

  const headingEl = document.createElement("h3");
  headingEl.className = "card-ref-group-heading";
  headingEl.textContent = heading;
  container.appendChild(headingEl);

  const list = document.createElement("div");
  list.className = "card-ref-list";
  for (const name of matched) {
    renderCardRefListItem(list, cardImageUrl(name), cardTypeModifierClass(name), CARD_LABELS[name], CARD_DESCRIPTIONS[name]);
  }
  container.appendChild(list);
  return true;
}

// Hoàn thiện màn hình "Thư viện bài" (trước gọi "Chú giải lá bài", đổi tên
// theo yêu cầu chủ dự án — bao quát hơn vì có cả lá bài LẪN nhân vật): danh
// sách ĐỦ nhân vật THẬT lấy từ `CHARACTERS` (đăng ký thật trong
// core/characters.ts — 16 gốc + 15 Dodge City + 3 tự chế "*ex", ĐẾM ĐỘNG thay
// vì ghi cứng "16" như bản đầu — số này đã tăng nhiều lần) — dùng chung
// CHARACTER_DESCRIPTIONS đã soạn sẵn cho màn hình chọn nhân vật, không soạn
// lại lần 2. Hiện kèm số máu (`bullets`, CHƯA cộng +1 nếu là Cảnh sát trưởng
// — đúng số liệu tĩnh của nhân vật, giống cách NHAN-VAT-BANG-CO-BAN.txt ghi).
function renderCharacterReferenceGroup(container: HTMLElement, query: string): boolean {
  const characterIds = Object.keys(CHARACTERS);
  const matched = characterIds.filter((id) =>
    matchesSearch(query, CHARACTERS[id].name, CHARACTER_DESCRIPTIONS[id] ?? "")
  );
  if (matched.length === 0) return false;

  const headingEl = document.createElement("h3");
  headingEl.className = "card-ref-group-heading";
  headingEl.textContent = `${characterIds.length} nhân vật`;
  container.appendChild(headingEl);

  if (query.trim() === "") {
    const rule = document.createElement("p");
    rule.textContent =
      "Đầu ván, mỗi người được phát 2 lá nhân vật úp, tự xem rồi chọn giữ 1 lá làm nhân vật thật " +
      "của mình, bỏ lá còn lại. Tên nhân vật khác với tên hiển thị bạn tự gõ lúc vào phòng.";
    container.appendChild(rule);
  }

  const list = document.createElement("div");
  list.className = "card-ref-list";
  for (const characterId of matched) {
    const definition = CHARACTERS[characterId];
    renderCardRefListItem(
      list,
      characterImageUrl(characterId),
      "card-box--character",
      definition.name,
      `Máu: ${definition.bullets}. ${CHARACTER_DESCRIPTIONS[characterId] ?? ""}`
    );
  }
  container.appendChild(list);
  return true;
}

// Mở rộng High Noon + A Fistful of Cards (bổ sung 2026-08-08) — TRƯỚC ĐÂY bị
// bỏ sót HOÀN TOÀN khỏi thư viện dù đã chơi được thật. Đọc thẳng
// EXPANSION_EVENT_IDS (events.ts) thay vì tự chép danh sách riêng — CHỈ liệt
// kê lá THẬT SỰ nằm trong bộ bốc (đã tự loại Ghost Town/Dead Man/Law of the
// West/Peyote, xem ghi chú ở events.ts), tự động khớp lại khi sau này cài
// thêm lá mới, không cần sửa ở đây. Không có ảnh riêng cho lá sự kiện (khác
// hẳn 40 lá bài thường, xem renderEventPileBox() ở khu giữa bàn) nên dùng
// card-box--event (chỉ hiện tên, không có <img>).
function renderEventReferenceGroup(container: HTMLElement, query: string): boolean {
  const eventIds = [...EXPANSION_EVENT_IDS.high_noon, ...EXPANSION_EVENT_IDS.a_fistful_of_cards];
  const matched = eventIds.filter((id) =>
    matchesSearch(query, EVENT_CARDS[id].name, EVENT_CARD_DESCRIPTIONS[id] ?? "")
  );
  if (matched.length === 0) return false;

  const headingEl = document.createElement("h3");
  headingEl.className = "card-ref-group-heading";
  headingEl.textContent = "Lá sự kiện (High Noon + A Fistful of Cards)";
  container.appendChild(headingEl);

  const list = document.createElement("div");
  list.className = "card-ref-list";
  for (const id of matched) {
    // Chưa có ảnh riêng cho lá sự kiện — quy ước đường dẫn TRƯỚC (giống mọi
    // sprite khác trong dự án), <img> lỗi tự ẩn, chỉ còn nền xám + tên chữ.
    renderCardRefListItem(list, `/sprites/events/${id}.png`, "card-box--event", EVENT_CARDS[id].name, EVENT_CARD_DESCRIPTIONS[id] ?? "");
  }
  container.appendChild(list);
  return true;
}

// Tách riêng phần NỘI DUNG (không có tiêu đề/nút quay lại) — dùng chung cho
// CẢ 2 nơi: màn hình đầy đủ (renderCardReferenceScreen, vào từ home) LẪN
// dialog mở giữa ván (renderApp()/renderNetworkGame() — nút mới ở toolbar,
// xem GIAO-DIEN-UI-UX.txt/yêu cầu bổ sung "xem thư viện bài mà không văng ra
// khỏi ván"). Dialog tự có sẵn tiêu đề + nút "Đóng" riêng (renderDialog()),
// không cần lặp lại ở đây. `query` rỗng = hiện đủ mọi thứ (hành vi cũ).
function renderCardReferenceBody(container: HTMLElement, query: string): void {
  const groupsFound = [
    renderCardReferenceGroup(container, "Bài nâu (đánh từ tay, chơi xong vào chồng bỏ)", BROWN_CARD_NAMES, query),
    renderCardReferenceGroup(container, "Bài xanh (trang bị, để ngửa trước mặt tới khi mất)", BLUE_CARD_NAMES, query),
    renderCardReferenceGroup(
      container,
      "Bài vàng (trang bị TRÌ HOÃN, Dodge City — chờ 1 lượt mới dùng được)",
      YELLOW_CARD_NAMES,
      query
    ),
    renderCharacterReferenceGroup(container, query),
    renderEventReferenceGroup(container, query),
  ];
  if (query.trim() !== "" && !groupsFound.some(Boolean)) {
    const empty = document.createElement("p");
    empty.textContent = `Không tìm thấy lá/nhân vật nào khớp với "${query}".`;
    container.appendChild(empty);
  }
}

// Ô tìm kiếm ở ĐẦU thư viện — dùng CHUNG cho cả màn hình đầy đủ lẫn dialog mở
// giữa ván. Class `.card-ref-search-input` được main.ts's captureFocusState()/
// restoreFocusState() dò theo để giữ NGUYÊN con trỏ đang gõ qua mỗi lần
// render() (render() luôn xoá-vẽ-lại TOÀN BỘ DOM, xem ghi chú ở
// captureScrollPositions() cùng file — lọc kết quả theo từng phím gõ BẮT BUỘC
// phải render lại ngay, khác các input khác trong dự án chỉ cập nhật biến mà
// không vẽ lại).
function renderCardReferenceSearchBox(container: HTMLElement, query: string, onSearchChange: (value: string) => void): void {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "card-ref-search-input";
  input.placeholder = "Tìm tên lá bài/nhân vật/sự kiện...";
  input.value = query;
  input.addEventListener("input", () => onSearchChange(input.value));
  container.appendChild(input);
}

export function renderCardReferenceScreen(
  container: HTMLElement,
  query: string,
  handlers: CardReferenceHandlers & { onSearchChange(value: string): void }
): void {
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Thư viện bài";
  container.appendChild(heading);

  container.appendChild(button("← Quay lại", () => handlers.onBack()));
  renderCardReferenceSearchBox(container, query, handlers.onSearchChange);

  renderCardReferenceBody(container, query);
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
  onToggleExpansion(id: ExpansionId): void;
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
  // Mở rộng Dodge City — cùng quy tắc hiển thị/gửi như selectedHouseRules ở trên.
  selectedExpansions: ExpansionId[],
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
    renderExpansionCheckboxes(container, selectedExpansions, handlers.onToggleExpansion);

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
  // Mở rộng Dodge City — giống hệt UiHandlers (hotseat), xem ghi chú ở đó.
  onPickEquipmentFromPlayer(targetId: string, cardId: string): void;
  onPickBorrowedCharacter(targetId: string): void;
  // Bộ mở rộng "custom_characters" (Elena Noir/Marcel Marcelo) — giống hệt
  // UiHandlers (hotseat), xem ghi chú ở đó.
  onPickArmed(armed: boolean): void;
  onPickMarcelCompanion(targetId: string): void;
  onBrawlZonePick(targetId: string, zone: "hand" | "equipment"): void;
  onBrawlZonesConfirmed(): void;
  onExtraDiscardCardClick(cardId: string): void;
  onArmAbility(playerId: string, ability: UseAbilityCharacter): void;
  onUseChuckWengamAbility(playerId: string): void;
  onToggleAbilityCard(cardId: string): void;
  onConfirmAbilityCards(): void;
  onAbilityTargetClick(targetId: string): void;
  // Đợt 2 UI/UX (mục 4) — giống hệt UiHandlers (hotseat), xem ghi chú ở đó.
  onToggleSeatExpanded(playerId: string): void;
  // Đợt 3 UI/UX (mục 9) — giống UiHandlers (hotseat), cộng thêm dialog Mã
  // phòng/Mời (CHỈ qua mạng — hotseat không có mã phòng).
  onOpenLogDialog(): void;
  onCloseLogDialog(): void;
  onOpenSettingsDialog(): void;
  onCloseSettingsDialog(): void;
  // Bổ sung — giống UiHandlers (hotseat), xem ghi chú ở đó.
  onOpenCardReferenceDialog(): void;
  onCloseCardReferenceDialog(): void;
  // Bổ sung 2026-08-08 — ô tìm kiếm ĐẦU dialog Thư viện bài (xem
  // renderCardReferenceSearchBox()). Cập nhật `cardReferenceSearchQuery` ở
  // options tương ứng RỒI render() lại NGAY (khác mọi input khác trong dự án
  // — lọc kết quả theo từng phím gõ bắt buộc phải vẽ lại danh sách).
  onCardReferenceSearchChange(value: string): void;
  onOpenRoomCodeDialog(): void;
  onCloseRoomCodeDialog(): void;
  onCopyRoomCode(): void;
  // "Rời phòng" BÊN TRONG dialog Cài đặt — đóng WebSocket chủ động (khác
  // mất mạng), quay lại màn hình chính.
  onLeaveGame(): void;
  // Bổ sung — nút "Bắt đầu ván mới" BÊN TRONG dialog Cài đặt, xem ghi chú ở
  // UiHandlers (hotseat). Qua mạng: CHỈ CHỦ PHÒNG mới thấy nút này (giống
  // "Bắt đầu ván" ở lobby) — server (room.ts) cũng tự kiểm tra lại đúng
  // ownerId, nút ẩn ở client chỉ để đỡ bấm nhầm, không phải chốt chặn duy nhất.
  onRequestNewGame(): void;
  onConfirmNewGame(): void;
  onCancelNewGameConfirm(): void;
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
  cardReferenceDialogOpen: boolean; // bổ sung — giống RenderOptions (hotseat)
  cardReferenceSearchQuery: string; // bổ sung 2026-08-08 — giống RenderOptions (hotseat)
  confirmingNewGame: boolean; // bổ sung — giống RenderOptions (hotseat)
  isRoomOwner: boolean; // bổ sung — chỉ chủ phòng mới thấy nút "Bắt đầu ván mới"
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
  // Mở rộng Dodge City — xem ghi chú y hệt ở renderHandSection() (hotseat).
  const isPickingExtraDiscard =
    selection.step === "picking-extra-discard" && player.id === view.players[view.currentPlayerIndex]?.id;
  const isPickingAbilityCards = selection.step === "picking-ability-cards" && selection.playerId === player.id;

  for (const cardId of player.hand) {
    const name = cardNameFromId(cardId);

    if (isDiscarding) {
      const selected = discardSelection.includes(cardId);
      wrapper.appendChild(
        cardButton(cardId, () => handlers.onToggleDiscardCard(cardId), selected ? "card-box--checked" : undefined)
      );
      continue;
    }

    if (isPickingExtraDiscard) {
      if (cardId === selection.cardId) {
        wrapper.appendChild(cardChip(cardId));
      } else {
        wrapper.appendChild(cardButton(cardId, () => handlers.onExtraDiscardCardClick(cardId)));
      }
      continue;
    }

    if (isPickingAbilityCards) {
      if (selection.ability === "jose_delgado" && !isSelfEquipBlueCardName(name)) {
        wrapper.appendChild(cardChip(cardId));
      } else {
        const checked = selection.selectedCardIds.includes(cardId);
        wrapper.appendChild(
          cardButton(cardId, () => handlers.onToggleAbilityCard(cardId), checked ? "card-box--checked" : undefined)
        );
      }
      continue;
    }

    if (isDiscardFromHand || isGivingCardToJesse) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      continue;
    }

    if (respondableName !== null) {
      if (
        cardMatchesRespondable(cardId, player.characterId, respondableName) &&
        hasEnoughMissedToRespond(top, player.hand, player.equipment, player.characterId, view.equipmentPlayedTurn, view.turnNumber)
      ) {
        wrapper.appendChild(cardButton(cardId, () => handlers.onHandCardClick(cardId)));
      } else {
        wrapper.appendChild(cardChip(cardId));
      }
      continue;
    }

    // Giai đoạn 5 (Calamity Janet) — xem ghi chú y hệt ở renderHandSection().
    if (isCurrentTurnToPlay && (name !== "missed" || cardActsAsBang(cardId, player.characterId))) {
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
  // Mở rộng Dodge City, mục 1.1 — xem ghi chú y hệt ở renderEquipmentSection()
  // (hotseat). player.id === view.viewerId: chỉ CHÍNH nạn nhân mới bấm được.
  const isRespondingWithMissed =
    top !== undefined &&
    top.player === player.id &&
    player.id === view.viewerId &&
    (top.kind === "NEED_MISSED" || top.kind === "NEED_DISCARD_MISSED_OR_DAMAGE");
  const isMyTurnToActivate =
    player.id === view.viewerId &&
    view.pending.length === 0 &&
    view.turnPhase === "play" &&
    view.players[view.currentPlayerIndex]?.id === player.id &&
    selection.step === "idle";

  for (const cardId of player.equipment) {
    const name = cardNameFromId(cardId);
    const isDynamite = name === "dynamite";
    const dangerClass = equipmentDangerClass(name);

    if (!isDynamite && (isDiscardFromEquipment || isPickingPanicTarget)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    if (
      isRespondingWithMissed &&
      equipmentActsAsMissed(cardId, player.characterId, view.equipmentPlayedTurn, view.turnNumber)
    ) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    if (isMyTurnToActivate && canActivateDelayedEquipment(cardId, view.equipmentPlayedTurn, view.turnNumber)) {
      wrapper.appendChild(cardButton(cardId, () => handlers.onEquipmentClick(player.id, cardId), dangerClass));
      continue;
    }

    wrapper.appendChild(cardChip(cardId, dangerClass));
  }

  container.appendChild(wrapper);
}

// Xoay view.players sao cho bắt đầu từ người NGAY SAU viewer, kết thúc bằng
// CHÍNH viewer (luôn là phần tử CUỐI mảng trả về) — dùng làm "thứ tự lượt"
// (turn order) cho renderNetworkGame() (đặt vào 1 hàng đối thủ) VÀ thứ tự DOM.
function buildSeatOrder(view: PlayerView): { player: PlayerHandView; originalIndex: number }[] {
  const n = view.players.length;
  const viewerIndex = view.players.findIndex((p) => p.id === view.viewerId);
  const startIndex = viewerIndex === -1 ? 0 : (viewerIndex + 1) % n;
  return Array.from({ length: n }, (_, k) => {
    const originalIndex = (startIndex + k) % n;
    return { player: view.players[originalIndex], originalIndex };
  });
}

type SeatEntry = { player: PlayerHandView; originalIndex: number };

// Phản hồi thật — bỏ hẳn bàn tròn (`position: absolute`, từng gây tràn ngang
// nhiều lần dù đã sửa công thức toạ độ mấy lần liền). Đối thủ (không tính
// bản thân — luôn ở 1 hàng riêng dưới cùng, xem `.player--own-row`) giờ dàn
// thành ĐÚNG 1 hàng ngang bình thường (nằm trong luồng tài liệu).
//
// LỊCH SỬ (để hiểu vì sao đơn giản như hiện tại): từng thử "gấp rắn"
// (boustrophedon) chia far/near/hàng-lẻ để mô phỏng vòng bàn, rồi thử ngưỡng
// "ít đối thủ mới gộp 1 hàng, đông thì vẫn chia" — CẢ 2 ĐỀU BỊ BÁO LỖI THẬT
// (ít đối thủ: 3 hàng-1-người nhìn như cột dọc; đủ ngưỡng vẫn chia: 5 người
// chơi bị tách 3+1 thành 2 hàng, sai ý "tất cả đối thủ phải cùng 1 hàng").
// Chốt lại: MỌI đối thủ, bất kể bao nhiêu, LUÔN đúng 1 `.opponent-row` duy
// nhất — CSS đổi `flex-wrap: wrap` → `nowrap` + `overflow-x: auto` (xem
// style.css) để hàng không bao giờ tự xuống dòng, chỉ cuộn ngang nếu màn quá
// hẹp cho hết số đối thủ.
//
// Tính liền kề theo THỨ TỰ LƯỢT vẫn ĐÚNG mà KHÔNG cần đảo/gấp gì — xem
// `buildSeatOrder()`: mảng đã xoay để bắt đầu từ người NGAY SAU bản thân,
// kết thúc ở người NGAY TRƯỚC bản thân — xếp thẳng theo đúng thứ tự đó vào 1
// hàng, 2 ĐẦU HÀNG (trái/phải) LUÔN ĐÚNG LÀ 2 người liền kề bản thân trong
// vòng lượt, không phụ thuộc bao nhiêu đối thủ.

function networkRenderPlayer(
  view: PlayerView,
  player: PlayerHandView,
  originalIndex: number,
  // Đổi layout (bỏ bàn tròn): không còn góc/toạ độ gì để tính — chỉ cần biết
  // đây có phải "hàng riêng của mình" hay không (`.player--own-row`, full độ
  // rộng, luôn dưới cùng) hay là 1 trong các đối thủ nằm trong `.opponent-row`
  // (xem renderNetworkGame()).
  isOwnRow: boolean,
  options: NetworkGameOptions,
  handlers: NetworkGameHandlers
): HTMLElement {
  const { selection } = options;
  const el = document.createElement("article");
  el.className = "player" + (isOwnRow ? " player--own-row" : "");

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

  // Bộ mở rộng "custom_characters" (Elena Noir) — giống hệt renderPlayer()
  // (hotseat), xem ghi chú ở đó (giới hạn Vera Custer).
  if (player.characterId === "elena_noir" && view.elenaNoirImmortalTurnsLeft[player.id] !== undefined) {
    const immortalLabel = document.createElement("p");
    immortalLabel.className = "player--targeted-label";
    immortalLabel.textContent = `☠ Miễn Tử — còn ${view.elenaNoirImmortalTurnsLeft[player.id]} lượt`;
    el.appendChild(immortalLabel);
  }
  // Bộ mở rộng "custom_characters" (Marcel Marcelo) — giống hệt renderPlayer()
  // (hotseat), xem ghi chú ở đó.
  const marcelCompanionId = view.marcelJailCompanion[player.id];
  if (marcelCompanionId) {
    const label = document.createElement("p");
    label.className = "player--targeted-label";
    label.textContent = `Đã chỉ định ${view.players.find((p) => p.id === marcelCompanionId)?.name ?? marcelCompanionId} cùng vào tù`;
    el.appendChild(label);
  }
  if (Object.values(view.marcelJailCompanion).includes(player.id)) {
    const label = document.createElement("p");
    label.className = "player--targeted-label";
    label.textContent = `Đang chờ ăn theo kết quả thoát tù của Marcel Marcelo`;
    el.appendChild(label);
  }
  if (view.marcelCompanionSkipNextTurn[player.id]) {
    const label = document.createElement("p");
    label.className = "player--targeted-label";
    label.textContent = `Sẽ mất lượt kế tiếp (cùng vào tù với Marcel Marcelo)`;
    el.appendChild(label);
  }

  const handLabel = document.createElement("p");
  handLabel.textContent = "Bài trên tay:";
  el.appendChild(handLabel);
  networkRenderHandSection(el, view, player, options, handlers);
  networkRenderAbilitySection(el, view, player, selection, handlers);

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
  // người KHÁC mình. NGOẠI LỆ: Tequila (mở rộng Dodge City) cho tự chọn
  // chính mình — xem ghi chú y hệt ở renderPlayer() (hotseat).
  if (selection.step === "picking-target" && player.alive) {
    // Jail KHÔNG BAO GIỜ được đánh lên Cảnh sát trưởng — giống hệt
    // renderPlayer() (hotseat), xem ghi chú ở đó. player.role luôn lộ đúng
    // nếu là Cảnh sát trưởng (viewFor() công khai vai này ngay từ đầu ván).
    const jailOnSheriff = selection.cardName === "jail" && player.role === "sheriff";
    if ((player.id !== view.viewerId || selection.cardName === "tequila") && !jailOnSheriff) {
      el.appendChild(button("Chọn làm mục tiêu", () => handlers.onPlayerClick(player.id)));
    }
  }

  // Mở rộng Dodge City, mục C nhóm C (Doc Holyday) — xem ghi chú y hệt ở
  // renderPlayer() (hotseat).
  if (selection.step === "picking-ability-target" && player.alive && player.id !== selection.playerId) {
    el.appendChild(button("Chọn làm mục tiêu", () => handlers.onAbilityTargetClick(player.id)));
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

  // Brawl (mở rộng Dodge City) — xem ghi chú y hệt ở renderPlayer() (hotseat).
  if (
    selection.step === "picking-brawl-zones" &&
    player.alive &&
    player.id !== view.players[view.currentPlayerIndex]?.id
  ) {
    const chosenZone = selection.zones[player.id];
    const zoneWrapper = document.createElement("div");
    zoneWrapper.className = "cards";
    zoneWrapper.appendChild(
      button(chosenZone === "hand" ? "✓ Bỏ kèm: tay" : "Bỏ kèm: tay", () => handlers.onBrawlZonePick(player.id, "hand"))
    );
    zoneWrapper.appendChild(
      button(chosenZone === "equipment" ? "✓ Bỏ kèm: sân" : "Bỏ kèm: sân", () =>
        handlers.onBrawlZonePick(player.id, "equipment")
      )
    );
    el.appendChild(zoneWrapper);
  }

  return el;
}

// Mở rộng Dodge City — xem ghi chú y hệt ở renderAbilitySection() (hotseat).
// CHỈ hiện cho CHÍNH MÌNH (player.id === view.viewerId) — người khác không
// bấm hộ được (và cũng không cần biết chi tiết, USE_ABILITY của người khác
// tự thấy qua nhật ký sự kiện).
function networkRenderAbilitySection(
  container: HTMLElement,
  view: PlayerView,
  player: PlayerHandView,
  selection: Selection,
  handlers: NetworkGameHandlers
): void {
  if (!player.alive || !player.characterId || player.id !== view.viewerId || player.hand === null) return;
  const def = getCharacterDefinition(player.characterId);
  if (!def) return;

  const isMyTurnNoPending =
    view.pending.length === 0 && view.turnPhase === "play" && view.players[view.currentPlayerIndex]?.id === player.id;

  if (selection.step === "idle") {
    if (def.canSelfHeal && player.hand.length >= 2) {
      container.appendChild(
        button("Dùng kỹ năng: bỏ 2 lá hồi 1 máu", () => handlers.onArmAbility(player.id, "sid_ketchum"))
      );
    } else if (def.canPayLifeToDraw && isMyTurnNoPending && player.hp > 1) {
      container.appendChild(
        button("Dùng kỹ năng: mất 1 máu rút 2 lá", () => handlers.onUseChuckWengamAbility(player.id))
      );
    } else if (
      def.canDiscardEquipmentToDraw &&
      isMyTurnNoPending &&
      view.joseDelgadoUsesThisTurn < 2 &&
      player.hand.some((id) => isSelfEquipBlueCardName(cardNameFromId(id)))
    ) {
      container.appendChild(
        button("Dùng kỹ năng: bỏ 1 lá xanh dương rút 2 lá", () => handlers.onArmAbility(player.id, "jose_delgado"))
      );
    } else if (
      def.canDiscardTwoForBang &&
      isMyTurnNoPending &&
      !view.docHolydayUsedThisTurn &&
      player.hand.length >= 2
    ) {
      container.appendChild(
        button("Dùng kỹ năng: bỏ 2 lá bắn Bang!", () => handlers.onArmAbility(player.id, "doc_holyday"))
      );
    }
  }

  if (selection.step === "picking-ability-cards" && selection.playerId === player.id) {
    const info = document.createElement("p");
    info.textContent = `Đã chọn ${selection.selectedCardIds.length}/${selection.needed} lá cho kỹ năng`;
    container.appendChild(info);
    const confirmBtn = button("Xác nhận", () => handlers.onConfirmAbilityCards());
    confirmBtn.disabled = selection.selectedCardIds.length !== selection.needed;
    container.appendChild(confirmBtn);
  }
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
      case "NEED_PICK_DRAW_OR_EQUIPMENT":
        return `${name} chọn rút bộ bài hay lấy 1 lá trang bị của người khác`;
      case "NEED_PICK_BORROWED_CHARACTER":
        return `${name} chọn mượn khả năng của 1 người chơi khác`;
      case "NEED_PICK_ARMED":
        return `${name} (Elena Noir) chọn vũ trang khả năng Miễn Tử cho lượt này hay không`;
      case "NEED_PICK_MARCEL_COMPANION":
        return `${name} (Marcel Marcelo) chọn 1 người cùng vào tù`;
      case "NEED_BLOOD_BROTHERS_GIFT":
        return `${name} chọn tặng 1 máu cho ai đó (hoặc bỏ qua)`;
      case "NEED_PICK_HARD_LIQUOR":
        return `${name} chọn bỏ qua pha rút để hồi 1 máu, hay rút bài như thường`;
      case "NEED_MISSED_FOR_EQUIPMENT":
        return `${name} đỡ đòn Ricochet bằng Missed! (hoặc mất lá trang bị)`;
      case "NEED_RANCH_EXCHANGE":
        return `${name} chọn đổi bài (hoặc bỏ qua)`;
      case "NEED_DISCARD_MISSED_OR_DAMAGE":
        return `${name} bỏ 1 lá Missed! (Russian Roulette, hoặc chịu mất 2 máu)`;
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
    } else if (top.kind === "NEED_PICK_DRAW_OR_EQUIPMENT") {
      panel.appendChild(button("Rút bộ bài", () => handlers.onRespondTakeConsequence()));
      for (const p of view.players) {
        if (!p.alive || p.id === top.player || p.equipment.length === 0) continue;
        const label = document.createElement("p");
        label.textContent = `Lấy trang bị của ${p.name}:`;
        panel.appendChild(label);
        const wrapper = document.createElement("div");
        wrapper.className = "cards";
        for (const cardId of p.equipment) {
          wrapper.appendChild(cardButton(cardId, () => handlers.onPickEquipmentFromPlayer(p.id, cardId)));
        }
        panel.appendChild(wrapper);
      }
    } else if (top.kind === "NEED_PICK_BORROWED_CHARACTER") {
      for (const p of view.players) {
        if (!p.alive || p.id === top.player || !p.characterId) continue;
        panel.appendChild(
          button(`Mượn khả năng của ${p.name} (${characterLabel(p.characterId)})`, () =>
            handlers.onPickBorrowedCharacter(p.id)
          )
        );
      }
    } else if (top.kind === "NEED_PICK_ARMED") {
      panel.appendChild(button("Vũ trang (rút 1 lá)", () => handlers.onPickArmed(true)));
      panel.appendChild(button("Không vũ trang (rút 2 lá)", () => handlers.onPickArmed(false)));
    } else if (top.kind === "NEED_PICK_MARCEL_COMPANION") {
      for (const p of view.players) {
        if (!p.alive || p.id === top.player) continue;
        panel.appendChild(button(`Chỉ định ${p.name} cùng vào tù`, () => handlers.onPickMarcelCompanion(p.id)));
      }
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
          characterOptionCard(characterId, player?.role ?? null, characterId === armedCharacterId, () =>
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

  // Phản hồi thật: xem ghi chú y hệt ở renderApp() — vẽ toolbar NGAY ĐẦU +
  // CSS `position: sticky` để nó chiếm chỗ thật, không đè lên seat trên
  // cùng của bàn tròn nữa.
  renderGameToolbar(
    container,
    handlers.onOpenLogDialog,
    handlers.onOpenSettingsDialog,
    handlers.onOpenCardReferenceDialog,
    handlers.onOpenRoomCodeDialog
  );

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

  container.appendChild(renderTableCenter(view.deckCount, view.discardPile, view.activeEventId, view.nextEventId));

  renderActiveHouseRules(container, view.houseRules);
  renderActiveExpansions(container, view.expansions);

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
    hint.appendChild(document.createTextNode(selectionHintText(options.selection) + " "));
    if (options.selection.step === "picking-brawl-zones") {
      const sel = options.selection;
      const others = view.players.filter((p) => p.alive && p.id !== view.players[view.currentPlayerIndex]?.id);
      if (others.length > 0 && others.every((p) => sel.zones[p.id] !== undefined)) {
        hint.appendChild(button("Tiếp tục — chọn lá phụ", () => handlers.onBrawlZonesConfirmed()));
      }
    }
    hint.appendChild(button("Huỷ", () => handlers.onCancelSelection()));
    container.appendChild(hint);
  }

  networkRenderPendingPanel(container, view, handlers, view.pending.length > 0 ? options.deadline : null);
  networkRenderPhaseActions(container, view, options, handlers);

  // Bug đã sửa (báo lỗi thật từ chủ dự án — 5 người chơi, 4 đối thủ bị tách
  // 3+1 thành 2 hàng): thuật toán "gấp rắn" chia far/near/odd trước đây CHỈ
  // né được ca ÍT đối thủ (≤4, gộp sẵn 1 hàng — sửa ở đợt trước), nhưng với
  // ≥5 đối thủ vẫn tự chia nhiều hàng — SAI Ý CHỦ DỰ ÁN: MỌI đối thủ (bất kể
  // bao nhiêu), trừ bản thân, phải nằm ĐÚNG 1 HÀNG NGANG DUY NHẤT. Bỏ hẳn
  // buildOpponentRows()/khái niệm "hàng xa/gần/lẻ" — chỉ còn ĐÚNG 1
  // `.opponent-row`, CSS đổi `flex-wrap: wrap` → `nowrap` + `overflow-x:
  // auto` (xem style.css) để hàng không bao giờ tự xuống dòng, chỉ cuộn
  // ngang nếu màn quá hẹp — không còn "hàng trên/hàng dưới" gây hiểu nhầm.
  //
  // Tính liền kề vẫn ĐÚNG mà KHÔNG cần đảo/gấp gì cả: `buildSeatOrder()` đã
  // xoay để mảng bắt đầu từ người NGAY SAU bản thân theo thứ tự lượt, kết
  // thúc ở người NGAY TRƯỚC bản thân (opponents[0] và opponents[n-1]) — xếp
  // thẳng theo đúng thứ tự đó vào 1 hàng, 2 ĐẦU HÀNG (trái/phải) LUÔN ĐÚNG
  // LÀ 2 người liền kề bản thân trong vòng lượt, không phụ thuộc bao nhiêu
  // đối thủ.
  const tableEl = document.createElement("div");
  tableEl.className = "table";
  const seatOrder = buildSeatOrder(view);
  const opponents = seatOrder.slice(0, -1);
  const ownEntry = seatOrder[seatOrder.length - 1] as SeatEntry | undefined;

  if (opponents.length > 0) {
    const rowEl = document.createElement("div");
    rowEl.className = "players opponent-row";
    for (const { player, originalIndex } of opponents) {
      rowEl.appendChild(networkRenderPlayer(view, player, originalIndex, false, options, handlers));
    }
    tableEl.appendChild(rowEl);
  }
  container.appendChild(tableEl);

  if (ownEntry) {
    container.appendChild(networkRenderPlayer(view, ownEntry.player, ownEntry.originalIndex, true, options, handlers));
  }

  if (options.logDialogOpen) {
    renderDialog("Nhật ký ván đấu", handlers.onCloseLogDialog, (body) => renderLogDialogBody(body, options.log));
  }
  if (options.cardReferenceDialogOpen) {
    renderDialog("Thư viện bài", handlers.onCloseCardReferenceDialog, (body) => {
      renderCardReferenceSearchBox(body, options.cardReferenceSearchQuery, handlers.onCardReferenceSearchChange);
      renderCardReferenceBody(body, options.cardReferenceSearchQuery);
    });
  }
  if (options.settingsDialogOpen) {
    renderDialog("Cài đặt", handlers.onCloseSettingsDialog, (body) =>
      renderSettingsDialogBody(body, "Rời phòng", handlers.onLeaveGame, {
        visible: options.isRoomOwner,
        confirmingNewGame: options.confirmingNewGame,
        onRequestNewGame: handlers.onRequestNewGame,
        onConfirmNewGame: handlers.onConfirmNewGame,
        onCancelNewGameConfirm: handlers.onCancelNewGameConfirm,
      })
    );
  }
  if (options.roomCodeDialogOpen) {
    renderDialog("Mã phòng / Mời", handlers.onCloseRoomCodeDialog, (body) =>
      renderRoomCodeDialogBody(body, options.roomCode, options.roomCodeCopyStatus, handlers.onCopyRoomCode)
    );
  }
  reconcileOpenDialog(
    [
      options.logDialogOpen && "Nhật ký ván đấu",
      options.cardReferenceDialogOpen && "Thư viện bài",
      options.settingsDialogOpen && "Cài đặt",
      options.roomCodeDialogOpen && "Mã phòng / Mời",
    ].filter((v): v is string => v !== false)
  );
}
