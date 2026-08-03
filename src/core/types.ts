// Kiểu dữ liệu cho state ván đấu, hành động, và lá bài.
// Toàn bộ phải là dữ liệu JSON thuần: không class có method, không Map, không Set, không hàm.

// ----- Lá bài -----

export type Suit = "spades" | "hearts" | "diamonds" | "clubs"; // 4 chất bài Tây
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  id: string; // id duy nhất của từng lá bài vật lý, vd "bang_3" (bộ bài có nhiều lá trùng tên)
  name: string; // tên loại bài, vd "bang", "missed" — danh sách đầy đủ khai báo ở cards.ts (việc 1.2)
  suit: Suit;
  rank: Rank; // cần cho các lá bài kiểm tra chất/số, vd Barrel, Dynamite
}

// ----- Người chơi -----

// 4 phe ẩn danh (luật gốc BANG!, 4-8 người) + 3 vai biến thể 3 người (vòng
// tròn săn đuổi công khai — xem CharacterChoice không liên quan, mà là
// setup.ts's isHuntMode()/win.ts's HUNT_CIRCLE). CỐ TÌNH dùng tên KHÁC hẳn
// "sheriff"/"outlaw"/"renegade" dù ý tưởng gần giống (cảnh sát/tội phạm/kẻ
// phản bội) — chủ dự án CHỐT: đây là "cảnh sát THƯỜNG", KHÔNG PHẢI Sheriff,
// không kế thừa bất kỳ luật phụ nào gắn với 3 vai gốc (không thưởng rút bài,
// không phạt gì) — chỉ đơn giản là 3 nhãn khác cho vòng tròn săn đuổi.
export type Role =
  | "sheriff" | "deputy" | "outlaw" | "renegade"
  | "police" | "criminal" | "traitor";

export interface PlayerState {
  id: string;
  name: string;
  // null = KHÔNG chia vai — biến thể 2 người (xem setup.ts's isDuelMode()),
  // ai sống sót cuối cùng thắng, không phe/vòng tròn nào cả.
  role: Role | null;
  hp: number;
  maxHp: number;
  hand: string[]; // id các lá bài trên tay
  equipment: string[]; // id các lá bài để ngửa trước mặt: súng, Barrel, Scope, Mustang, Jail, Dynamite...
  alive: boolean;
  // Giai đoạn 5 (xem core/characters.ts) — null = chưa/không có nhân vật
  // (đúng bản v1 hiện tại, mọi người 4 máu không skill). Chỉ là 1 CHUỖI tra
  // vào registry CHARACTERS — hàm hook không nằm trong state (quy tắc 3).
  characterId: string | null;
}

// ----- Chọn nhân vật đầu ván (xem setup.ts's RuleOptions.dealCharacterCards) -----
// Khác HẲN cơ chế "pending" bên dưới: pending là NGĂN XẾP, luôn xử lý 1 việc ở
// đỉnh, dùng cho phản ứng nối tiếp nhau (Bang! -> Missed! -> draw!...). Chọn
// nhân vật đầu ván KHÔNG phải phản ứng nối tiếp — MỌI người chơi tự xem 2 lá
// riêng của mình và chọn ĐỘC LẬP, không ai phải chờ ai trước. Nên đây là 1
// MẢNG riêng (không phải ngăn xếp), mỗi người 1 phần tử, xử lý được theo BẤT
// KỲ thứ tự nào — không phải luôn phần tử cuối như `pending`.
export interface CharacterChoice {
  playerId: string;
  options: [string, string]; // 2 lá nhân vật được phát riêng cho người này — ẨN với người khác (xem view.ts)
  chosen: string | null; // null = CHƯA chọn. Đã chọn thì công khai (đặt lá ngửa lên bàn, đúng luật gốc).
}

// ----- Việc đang chờ -----
// Các loại "kind" cụ thể khác (NEED_DRAW_CHECK cho Jail/Dynamite/Barrel...) sẽ
// thêm dần khi cài từng cơ chế mới, từ việc 1.10/1.11 trở đi.

export type PendingAction =
  // Giai đoạn 5 (Slab the Killer, xem core/characters.ts) — `missesNeeded` chỉ
  // xuất hiện khi CẦN NHIỀU HƠN 1 Missed! để né trọn vẹn (Slab luôn là 2). Bỏ
  // qua (undefined) nghĩa là mặc định 1, y hệt trước khi có nhân vật. Mỗi lần
  // bỏ đúng 1 Missed!/1 lượt draw! Barrel khớp Cơ chỉ tính là 1, chưa đủ thì
  // pending này được đẩy lại với số còn thiếu giảm 1 (xem respondToMissed()/
  // resolveDrawCheck() trong reduce.ts).
  | { kind: "NEED_MISSED"; player: string; source: { card: string; from: string }; missesNeeded?: number }
  // Indians!: người chơi phải bỏ 1 lá Bang! hoặc mất 1 máu. Có thể chọn KHÔNG bỏ
  // dù có Bang! trong tay (RESPOND không kèm cardId) — chịu mất máu là lựa chọn hợp lệ.
  | { kind: "NEED_DISCARD_BANG"; player: string; source: { card: string; from: string } }
  // Duel: hai người luân phiên bỏ Bang!. `player` là người đang phải trả lời,
  // `opponent` là người còn lại. Khi `player` bỏ được Bang!, pending mới được đẩy
  // lên với `player`/`opponent` đổi chỗ cho nhau — không tạo 2 mục riêng.
  | { kind: "NEED_DUEL_RESPONSE"; player: string; opponent: string; source: { card: string; from: string } }
  // General Store: `options` là các id bài đã lật, vơi dần khi từng người chọn.
  | { kind: "NEED_PICK_STORE_CARD"; player: string; options: string[] }
  // Cat Balou: `player` (mục tiêu bị bắt bỏ bài) tự chọn đúng 1 lá trong `zone`
  // (tay hoặc sân) do người đánh Cat Balou chỉ định trước — không phải người
  // đánh chọn lá cụ thể, cũng không có lựa chọn "từ chối" (bị ép buộc).
  | { kind: "NEED_DISCARD_FROM_ZONE"; player: string; zone: "hand" | "equipment"; source: { card: string; from: string } }
  // draw! (lật bài kiểm tra) — cơ chế DÙNG CHUNG cho Barrel/Jail/Dynamite (việc
  // 1.11) và sau này là kỹ năng nhân vật (Giai đoạn 5). Chỉ lật ĐÚNG 1 lá, báo
  // "khớp" hay không — không tự suy ra hậu quả (nổ/thoát tù/né đạn...), vì mỗi
  // lá bài hiểu "khớp" theo nghĩa khác nhau. `matchSuits` là các chất tính là
  // khớp; `matchRanks` không có nghĩa là mọi giá trị đều tính, chỉ cần đúng chất
  // (vd Barrel/Jail: chỉ cần Cơ, mọi giá trị). Muốn lật thêm lần nữa (nhiều
  // Barrel, kỹ năng nhân vật...) thì đẩy thêm 1 mục NEED_DRAW_CHECK mới sau khi
  // mục này bị pop, không phải việc của kind này.
  | {
      kind: "NEED_DRAW_CHECK";
      player: string;
      source: { card: string };
      matchSuits: Suit[];
      matchRanks?: Rank[];
    }
  // Giai đoạn 5 (Pedro Ramirez, đợt 4, xem core/characters.ts) — đẩy đầu lượt
  // THAY VÌ rút bài ngay, hỏi: lấy lá 1 từ đỉnh chồng bỏ, hay rút thẳng từ bộ
  // bài như bình thường? Không cần lưu thêm dữ liệu gì — đỉnh chồng bỏ vốn đã
  // công khai (state.discardPile), không lộ thông tin ẩn nào. RESPOND kèm
  // đúng cardId của lá trên cùng chồng bỏ = lấy lá đó; không kèm cardId = rút
  // bộ bài như thường (xem respondToPickDrawSource() trong reduce.ts).
  | { kind: "NEED_PICK_DRAW_SOURCE"; player: string }
  // Giai đoạn 5 (Jesse Jones, đợt 5, xem core/characters.ts) — đẩy đầu lượt
  // THAY VÌ rút bài ngay: `player` (Jesse) tự quyết lá 1 lấy từ bộ bài hay từ
  // tay 1 người khác. RESPOND không kèm targetId = rút bộ bài như thường (mặc
  // định/timeout). Kèm targetId hợp lệ (còn sống, khác chính mình) — nếu tay
  // người đó có bài, đọc thêm letTargetChoose (xem RESPOND bên dưới): true =
  // đẩy tiếp NEED_GIVE_CARD_TO_PLAYER hỏi CHÍNH người đó; false/bỏ trống = cướp
  // ngẫu nhiên NGAY (tái dùng RNG y hệt Panic!). Tay rỗng thì coi như không có
  // gì để lấy, rút bộ bài cho lá 1. Xem respondToPickDrawTarget() trong reduce.ts.
  | { kind: "NEED_PICK_DRAW_TARGET"; player: string }
  // Giai đoạn 5 (Jesse Jones, đợt 5) — CHỈ đẩy khi Jesse chọn letTargetChoose:
  // true ở trên. `player` = người bị lấy (nạn nhân, tự chọn lá của CHÍNH mình
  // để đưa — không lộ gì mới, họ vốn đã biết tay mình). `giveTo` = Jesse. Nạn
  // nhân RESPOND kèm cardId (lá họ tự chọn) hoặc không kèm gì (hết giờ/không
  // muốn chọn -> rút ngẫu nhiên thay họ, xem respondToGiveCardToPlayer()).
  | { kind: "NEED_GIVE_CARD_TO_PLAYER"; player: string; giveTo: string }
  // Giai đoạn 5 (Kit Carlson, đợt 6, xem core/characters.ts) — đẩy đầu lượt
  // THAY VÌ rút bài ngay: `cards` là 3 lá vừa rút từ đỉnh bộ bài (ĐÚNG thứ tự
  // đã rút — cards[2] là lá rút SAU CÙNG). ĐÂY LÀ PENDING DUY NHẤT CHỨA THÔNG
  // TIN ẨN (khác mọi kind khác — xem ghi chú "LUÔN công khai" ở view.ts) —
  // viewFor() (quy tắc 6) PHẢI thay `cards` bằng null với người xem KHÔNG PHẢI
  // `player`. RESPOND kèm cardId = 1 trong 3 lá -> lá đó bị bỏ, 2 lá còn lại
  // vào tay; không kèm cardId (mặc định/timeout) -> bỏ đúng cards[2] (giữ 2 lá
  // ĐẦU) — ĐÂY LÀ HOUSE RULE, khác bản gốc BANG! (bản gốc đặt lá thứ 3 TRỞ LẠI
  // lên đỉnh bộ bài, bản này bỏ vào chồng bài bỏ) — xem respondToPickKeptCards()
  // trong reduce.ts.
  | { kind: "NEED_PICK_KEPT_CARDS"; player: string; cards: string[] };

// ----- Hành động -----
// Các hành động cho vòng lượt (việc 1.5) và đánh bài (việc 1.7/1.8, hiện chỉ hỗ
// trợ Bang!/Missed!). Các lá khác sẽ mở rộng PLAY_CARD/RESPOND dần, không cần
// thêm type hành động mới cho từng lá.

export type Action =
  | { type: "DRAW_CARDS"; playerId: string }
  | { type: "END_TURN"; playerId: string }
  | { type: "DISCARD_CARDS"; playerId: string; cardIds: string[] }
  | {
      type: "PLAY_CARD";
      playerId: string;
      cardId: string;
      targetId?: string;
      // Panic!: chỉ dùng khi tay mục tiêu đã hết bài — chỉ định đúng lá trang bị
      // cụ thể muốn cướp trên sân (trang bị để ngửa, nhìn thấy tên nên chọn được).
      targetCardId?: string;
      // Cat Balou: người đánh chọn VÙNG bắt mục tiêu bỏ bài (tay hay sân) — lá cụ
      // thể trong vùng đó do chính mục tiêu chọn, trả lời qua RESPOND.
      targetZone?: "hand" | "equipment";
    }
  | {
      type: "RESPOND";
      playerId: string;
      cardId?: string;
      // Jesse Jones (đợt 5) — trả lời NEED_PICK_DRAW_TARGET: người muốn lấy bài
      // (bỏ trống = rút bộ bài như thường).
      targetId?: string;
      // Jesse Jones (đợt 5) — đi kèm targetId ở trên: có để người đó tự chọn
      // lá đưa hay không (bỏ trống/false = cướp ngẫu nhiên ngay).
      letTargetChoose?: boolean;
    }
  // Giai đoạn 5 (Sid Ketchum, đợt 7, xem core/characters.ts) — kỹ năng CHỦ
  // ĐỘNG, dùng được BẤT CỨ LÚC NÀO: bỏ đúng 2 lá (KHÁC NHAU) trên tay CHÍNH
  // MÌNH để hồi 1 máu. KHÔNG đi qua assertCurrentPlayer/kiểm tra pending như
  // mọi action khác — cố tình để dùng được cả ngoài lượt mình, kể cả đang bị
  // tấn công (xem handleUseAbility() trong reduce.ts). Không làm gì tới lượt/
  // pending của bất kỳ ai — chỉ đổi hand/discardPile/hp của CHÍNH player này.
  | { type: "USE_ABILITY"; playerId: string; cardIds: [string, string] }
  // Chọn nhân vật đầu ván (xem CharacterChoice ở trên + setup.ts's
  // RuleOptions.dealCharacterCards) — CHỈ hợp lệ khi state.characterSelection
  // đang có giá trị (khác null). `characterId` PHẢI là 1 trong 2 lá đã phát
  // riêng cho playerId đó (options), không phải lá bất kỳ trong registry.
  | { type: "CHOOSE_CHARACTER"; playerId: string; characterId: string }
  // Hết giờ CHUNG cho cả bàn lúc đang chọn nhân vật (đồng hồ thật sống ở
  // room.ts/protocol.ts — quy tắc 2 cấm Date.now() trong core/, nên "hết giờ"
  // ở ĐÂY chỉ là 1 action bình thường được server GỌI đúng lúc, không phải
  // core/ tự biết thời gian). Không có playerId vì đây KHÔNG phải quyết định
  // của 1 người — chốt THAY cho MỌI người còn chưa chọn: rút NGẪU NHIÊN 1
  // trong 2 lá được phát (chủ dự án CHỐT rõ phải ngẫu nhiên, KHÁC quy ước
  // "mặc định lá đầu tiên" ở các chỗ hết giờ khác trong dự án), rồi bắt đầu
  // ván như bình thường. Ai đã tự chọn trước đó thì giữ nguyên, không ghi đè.
  | { type: "FINALIZE_CHARACTER_SELECTION" };

// ----- Thắng/thua -----
// "faction": thắng theo PHE (4-8 người, có chia vai — luật gốc BANG!).
// "player": thắng vì là NGƯỜI SỐNG SÓT DUY NHẤT, không theo phe nào cả — biến
// thể 2 người (xem setup.ts's isDuelMode(), PlayerState.role = null cho cả
// 2). Dùng playerId (không phải tên hiển thị) vì tên có thể trùng nhau.
export type Winner =
  | { kind: "faction"; faction: "sheriff_deputy" | "outlaw" | "renegade" }
  | { kind: "player"; playerId: string };

// ----- Sự kiện -----
// Kết quả phụ của reduce(), để client hiển thị log — không ảnh hưởng đến state.

export type GameEvent =
  | { type: "CARDS_DRAWN"; playerId: string; count: number }
  | { type: "TURN_ENDED"; playerId: string }
  | { type: "CARDS_DISCARDED"; playerId: string; cardIds: string[] }
  | { type: "CARD_PLAYED"; playerId: string; cardId: string; targetId?: string }
  | { type: "MISSED_PLAYED"; playerId: string }
  | { type: "BANG_DISCARDED"; playerId: string } // đỡ Indians!/Duel bằng cách bỏ 1 lá Bang!
  | { type: "DAMAGE_DEALT"; playerId: string; amount: number }
  | { type: "HP_RESTORED"; playerId: string; amount: number }
  | { type: "STORE_REVEALED"; cardIds: string[] } // General Store lật bài
  | { type: "STORE_CARD_TAKEN"; playerId: string; cardId: string }
  | { type: "CARD_STOLEN"; playerId: string; fromPlayerId: string; cardId: string } // Panic
  | { type: "CARD_FORCE_DISCARDED"; playerId: string; byPlayerId: string; cardId: string } // Cat Balou
  | { type: "DRAW_CHECK_RESOLVED"; playerId: string; cardId: string; matched: boolean } // draw!
  | { type: "WEAPON_REPLACED"; playerId: string; oldCardId: string } // đánh súng mới, bỏ súng cũ
  | { type: "BARREL_DODGED"; playerId: string } // Barrel draw! khớp Cơ, né miễn phí không tốn Missed!
  | { type: "DYNAMITE_EXPLODED"; playerId: string; amount: number } // draw! khớp Bích 2-9 đầu lượt
  | { type: "DYNAMITE_PASSED"; playerId: string } // draw! không khớp, chuyển cho người kế tiếp
  | { type: "JAIL_ESCAPED"; playerId: string } // draw! khớp Cơ đầu lượt, thoát tù chơi bình thường
  | { type: "JAIL_SKIPPED_TURN"; playerId: string } // draw! không khớp, bỏ qua cả lượt
  // Giai đoạn 5 (Black Jack) — lá thứ 2 lúc rút bài đầu lượt lật NGỬA cho mọi
  // người xem (dù vẫn nằm trong tay, bình thường bị ẩn — xem view.ts). Tiền lệ
  // giống DRAW_CHECK_RESOLVED đã công khai 1 lá vốn bị ẩn.
  | { type: "BLACK_JACK_REVEALED"; playerId: string; cardId: string }
  // Giai đoạn 5 (Lucky Duke, đợt 4) — mọi lần draw! đều lật thêm 1 lá thứ 2,
  // dùng để chọn kết quả có lợi hơn (xem resolveDrawCheck() trong reduce.ts).
  // `cardId` ở đây là lá KHÔNG được chọn làm kết quả chính — lá chính vẫn báo
  // qua DRAW_CHECK_RESOLVED như bình thường, sự kiện này chỉ bổ sung thông tin
  // lá thứ 2 (để không mất thông tin so với thực tế đã lật 2 lá).
  | { type: "LUCKY_DUKE_EXTRA_DRAW"; playerId: string; cardId: string }
  // Giai đoạn 5 (Kit Carlson, đợt 6) — lá KHÔNG được giữ trong 3 lá vừa xem
  // riêng, bỏ vào chồng bài bỏ. KHÔNG tái dùng CARDS_DISCARDED — event đó đã
  // gắn nghĩa "bỏ bài thừa cuối lượt" trong nhật ký ván đấu (ui.ts), dùng lại
  // ở đây sẽ gây hiểu nhầm.
  | { type: "KIT_CARLSON_DISCARDED"; playerId: string; cardId: string }
  // Giai đoạn 5 (Sid Ketchum, đợt 7) — dùng kỹ năng chủ động: bỏ đúng 2 lá
  // (cardIds), hồi `amount` máu (có thể là 0 nếu đã đầy máu — vẫn cho dùng,
  // không chặn). Gộp 1 event thay vì tách CARDS_DISCARDED + HP_RESTORED —
  // CARDS_DISCARDED đã gắn nghĩa "bỏ bài thừa cuối lượt", tách riêng dễ hiểu
  // nhầm giống lý do của KIT_CARLSON_DISCARDED ở trên.
  | { type: "SID_KETCHUM_HEALED"; playerId: string; cardIds: [string, string]; amount: number }
  // Mở rộng Dodge City, mục 1.1 — bỏ 1 lá trang bị "trì hoãn" ĐÃ BÀY SẴN từ
  // lượt trước để kích hoạt hiệu ứng CHỦ ĐỘNG của nó (Canteen tự hồi máu, Pony
  // Express rút 3 lá...). KHÔNG dùng cho nhóm CÓ ký hiệu Missed! (Bible/
  // Sombrero/Ten Gallon Hat/Iron Plate) — nhóm đó dùng để PHẢN ỨNG, vẫn bắn
  // MISSED_PLAYED như Missed! thường (xem respondToMissed() trong reduce.ts).
  // Tách riêng khỏi CARD_PLAYED vì lá này không "đánh ra" từ tay — nó đã nằm
  // trên sân từ trước, giờ mới bị bỏ đi để DÙNG.
  | { type: "DELAYED_EQUIPMENT_ACTIVATED"; playerId: string; cardId: string }
  // Chọn nhân vật đầu ván (xem CharacterChoice/CHOOSE_CHARACTER/
  // FINALIZE_CHARACTER_SELECTION ở trên) — `characterId` CÔNG KHAI ngay khi
  // chọn xong (đặt lá ngửa lên bàn, đúng luật gốc), dù là người TỰ chọn hay
  // bị chốt mặc định lúc hết giờ (cả 2 trường hợp đều bắn event này).
  | { type: "CHARACTER_CHOSEN"; playerId: string; characterId: string }
  // ----- Việc 1.13: chết, thưởng/phạt, điều kiện thắng -----
  // Bia "hồi sinh" — máu về 0 (hoặc thấp hơn) nhưng còn ít nhất 1 lá Bia trên
  // tay VÀ còn hơn 2 người sống (đúng luật gốc: Bia vô tác dụng khi chỉ còn 2
  // người, xem playBeer()) -> TỰ ĐỘNG bỏ lá Bia đó, kéo thẳng về 1 máu, KHÔNG
  // chết. Bắn event này THAY VÌ PLAYER_ELIMINATED — xem eliminateIfDead()
  // trong reduce.ts (dùng chung cho MỌI nguồn sát thương: Bang!/Gatling/Duel/
  // Indians!/Dynamite, vì tất cả đều gọi qua đúng 1 hàm này).
  | { type: "BEER_SAVED_FROM_DEATH"; playerId: string; cardId: string }
  // Chỉ còn 2 người sống — Bia KHÔNG có tác dụng (luật gốc, xem playBeer()/
  // eliminateIfDead()). Bắn ở CẢ 2 tình huống: (1) tự đánh Bia chủ động trong
  // lượt mình mà không hồi được máu gì, (2) máu về 0 mà đang cầm Bia trên tay
  // nhưng không cứu được (event này bắn TRƯỚC PLAYER_ELIMINATED trong ca đó).
  // CHỈ RIÊNG Bia bị ảnh hưởng — mọi lá/kỹ năng hồi máu khác (Saloon, Sid
  // Ketchum...) vẫn hoạt động bình thường dù chỉ còn 2 người, không đổi gì.
  | { type: "BEER_INEFFECTIVE"; playerId: string }
  // killedBy = người trực tiếp gây đòn đánh khiến hp về 0 (Bang!/Gatling/
  // Indians!/Duel). null nếu tự chết (Dynamite) — không có ai "giết" cả.
  | { type: "PLAYER_ELIMINATED"; playerId: string; killedBy: string | null }
  // playerId = người kết liễu (được thưởng), count = số lá rút được (có thể
  // ít hơn 3 nếu deck+chồng bỏ cạn giữa chừng).
  | { type: "OUTLAW_BOUNTY_DRAWN"; playerId: string; count: number }
  // playerId = Cảnh sát trưởng bị phạt (chính là người kết liễu Phó cảnh sát trưởng).
  | { type: "SHERIFF_KILLED_DEPUTY_PENALTY"; playerId: string }
  | { type: "GAME_ENDED"; winner: Winner };

// ----- State tổng -----

export interface GameState {
  players: PlayerState[]; // thứ tự trong mảng = ghế ngồi, dùng để tính khoảng cách
  deck: string[]; // id các lá bài trong chồng rút; phần tử cuối = lá trên cùng
  discardPile: string[]; // id các lá bài đã bỏ; phần tử cuối = lá trên cùng
  pending: PendingAction[]; // stack — luôn xử lý phần tử CUỐI cùng trước
  currentPlayerIndex: number; // chỉ số trong mảng players
  turnPhase: "draw" | "play" | "discard";
  rngState: number; // trạng thái bộ sinh số ngẫu nhiên — hình dạng chính xác chốt ở việc 1.3
  winner: Winner | null;
  // Chuẩn bị cho Giai đoạn 5 (Willy the Kid/Calamity Janet, xem
  // NHAN-VAT-BANG-CO-BAN.txt): luật gốc chỉ cho đánh 1 lá Bang!/lượt, trừ khi
  // đang cầm súng Volcanic — luật này bị THIẾU từ Giai đoạn 1, bổ sung ở đây
  // (không phải hook nhân vật, là luật nền ai cũng áp dụng). Reset về false
  // mỗi khi sang lượt mới (advanceTurn() trong reduce.ts).
  bangUsedThisTurn: boolean;
  // Giai đoạn 5, cơ chế "phát 2 lá nhân vật, chọn giữ 1" (xem CharacterChoice
  // ở trên + setup.ts's RuleOptions.dealCharacterCards) — null nghĩa là
  // KHÔNG (hoặc chưa xong) ở giai đoạn chọn nhân vật: ván bình thường như
  // trước giờ (mọi nơi khác trong reduce.ts chỉ cần coi field này = null là
  // "ván đã bắt đầu thật sự"). Khác null nghĩa là ván CHƯA thật sự bắt đầu —
  // hp/maxHp mọi người đang tạm là 0, hand rỗng, MỌI action khác ngoài
  // CHOOSE_CHARACTER/FINALIZE_CHARACTER_SELECTION đều bị chặn (xem đầu
  // reduce()) — chờ đủ mọi người chọn xong (hoặc hết giờ, chốt mặc định) mới
  // tính máu + chia bài tay + vào lượt đầu tiên thật.
  characterSelection: CharacterChoice[] | null;
  // Giai đoạn 5, việc 5.3 (house rules) — luật bổ sung chủ phòng chọn BẬT cho
  // RIÊNG ván này (ghi đè luật gốc chỉ trong ván đó), xem setup.ts's
  // RuleOptions.houseRules. Mảng RỖNG (mặc định) = chơi đúng luật gốc, không
  // đổi gì so với trước — mọi ván cũ/test cũ không cần quan tâm field này.
  houseRules: HouseRuleId[];
  // Chỉ có ý nghĩa khi houseRules chứa "no_duplicate_card_names" — tên các lá
  // NÂU (không tính trang bị) người đang tới lượt đã đánh CHỦ ĐỘNG trong CHÍNH
  // lượt này. Reset về [] mỗi khi sang lượt mới (advanceTurn() trong
  // reduce.ts), giống bangUsedThisTurn. Vẫn luôn có mặt trong state (không
  // phải optional) để đúng quy tắc 3 (state JSON thuần, không có field tuỳ
  // ý xuất hiện/biến mất) — chỉ đơn giản không ai đọc tới nếu luật này tắt.
  cardNamesPlayedThisTurn: string[];
  // Mở rộng Dodge City (Luat_Bang_Mo_Rong_DodgeCity.txt, mục 1.1 — "kiến trúc
  // trang bị trì hoãn", xem LO-TRINH.md "Ghi chú cho 5.4" mục A) — đếm số
  // LƯỢT đã trôi qua từ đầu ván, tăng +1 mỗi lần advanceTurn() (reduce.ts).
  // Không tồn tại trước Dodge City vì chưa cần: mọi luật reset-mỗi-lượt trước
  // đó (bangUsedThisTurn, cardNamesPlayedThisTurn) chỉ cần biết "lượt NÀY",
  // không cần phân biệt lượt SỐ MẤY. Trang bị "trì hoãn" (delayKind =
  // "delayed", xem cards.ts's isDelayedEquipmentCardName()) cần so sánh lượt
  // ĐÃ chơi ra với lượt HIỆN TẠI để biết đã qua ít nhất 1 lượt hay chưa.
  turnNumber: number;
  // Mở rộng Dodge City, mục 1.1 — cardId (lá trang bị "trì hoãn" đang bày
  // trước mặt 1 người) -> turnNumber lúc nó được chơi ra. CHỈ có entry cho lá
  // "delayed" (Bible, Sombrero, Ten Gallon Hat, Iron Plate, Canteen, Pony
  // Express...) — trang bị "instant" (xanh dương thường: súng, Barrel, Scope,
  // Mustang) không cần gì ở đây, dùng được ngay. Xoá entry khi lá bị bỏ đi
  // (dùng xong, hoặc bị Cat Balou/Panic!/Can Can... lấy/bỏ) — không lo rác
  // tồn đọng vì mọi đường khiến lá rời equipment đều đi qua reduce.ts, nơi
  // đã tự dọn field này (xem activateDelayedEquipment()/respondToMissed()).
  // KHÔNG lưu delayKind ("instant"/"delayed") trong state — tra tĩnh theo TÊN
  // LÁ ở cards.ts (giống cách WEAPON_RANGES tra theo tên), vì đây là thuộc
  // tính cố định của LOẠI lá, không đổi theo từng lượt chơi.
  equipmentPlayedTurn: Record<string, number>;
}

// Giai đoạn 5, việc 5.3 — danh sách id luật bổ sung đã cài (xem LO-TRINH.md
// mục "Ghi chú cho 5.3" để biết ý tưởng gốc, và CLAUDE.md để biết chi tiết
// từng luật). Thêm luật mới thì thêm 1 giá trị vào union này + xử lý ở đúng
// chỗ luật gốc tương ứng trong reduce.ts/distance.ts, KHÔNG tạo cơ chế chung
// chung — mỗi luật là 1 điều kiện rẽ nhánh riêng, đơn giản, dễ đọc.
export type HouseRuleId =
  | "extra_distance" // khoảng cách vòng tròn mặc định +1 (distance.ts)
  | "require_weapon_for_bang" // phải có súng trang bị mới đánh Bang! được, bỏ súng ngầm định tầm 1 (playBang())
  | "no_duplicate_card_names" // cấm đánh 2 lá NÂU trùng tên trong 1 lượt (trừ lá trang bị, handlePlayCard())
  | "beer_below_two" // Bia vẫn có tác dụng dù chỉ còn 2 người sống, bỏ ngoại lệ luật gốc (playBeer()/eliminateIfDead())
  | "extra_cards"; // CHỈ LÀ CỜ, CHƯA CÓ HIỆU ỨNG: dự định thêm các lá bài đặc biệt (vd bộ mở rộng
  // Dodge City, xem Luat_Bang_Mo_Rong_DodgeCity.txt) vào bộ bài khi bật. setupGame()
  // (setup.ts) đã sẵn RuleOptions.cardCounts để buildDeck() cộng thêm bài — chỉ cần nối
  // dây khi có dữ liệu bài thật, KHÔNG đổi gì reduce.ts. Bật cờ này lúc này không thay
  // đổi hành vi ván (bộ bài vẫn y hệt luật gốc), chỉ để chuẩn bị sẵn UI cho việc sau.
