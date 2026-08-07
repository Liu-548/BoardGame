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
  // Mở rộng High Noon/A Fistful of Cards — `source.from` giờ CHO PHÉP `null`
  // ("do lá sự kiện gây ra, không phải người chơi nào bắn" — xem mục 1.3
  // Luat_Bang_Mo_Rong_HighNoon.txt, ví dụ lá "A Fistful of Cards"). MỌI nguồn
  // cũ (Bang!/Gatling/Punch/...) vẫn luôn truyền `from` là 1 playerId THẬT —
  // chỉ các hàm push MỚI (chưa cài) mới thật sự dùng `null`.
  | { kind: "NEED_MISSED"; player: string; source: { card: string; from: string | null }; missesNeeded?: number }
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
  // Cùng lý do NEED_MISSED ở trên — `source.from: null` dùng cho The Daltons
  // (High Noon, mọi người TỰ bỏ 1 lá xanh dương, không ai "bắt" ai cả).
  | { kind: "NEED_DISCARD_FROM_ZONE"; player: string; zone: "hand" | "equipment"; source: { card: string; from: string | null } }
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
  | { kind: "NEED_PICK_KEPT_CARDS"; player: string; cards: string[] }
  // Mở rộng Dodge City, mục C nhóm A (Pat Brennan, xem core/characters.ts) —
  // đẩy đầu lượt THAY VÌ rút bài ngay, y hệt khuôn Pedro Ramirez/Jesse Jones:
  // rút 2 lá như bình thường, HAY lấy đúng 1 lá trang bị bất kỳ (kể cả "delayed"
  // — mở rộng Dodge City) đang bày trước mặt 1 người chơi khác vào tay mình?
  // Không cần lưu thêm dữ liệu gì — trang bị của mọi người vốn đã công khai
  // (PlayerState.equipment không bị viewFor() ẩn). RESPOND kèm targetId (chủ
  // lá) + cardId (đúng lá muốn lấy) = lấy lá đó; không kèm targetId = rút bộ
  // bài như thường (mặc định/timeout). Xem respondToPickDrawOrEquipment()
  // trong reduce.ts.
  | { kind: "NEED_PICK_DRAW_OR_EQUIPMENT"; player: string }
  // Mở rộng Dodge City, mục C nhóm C (Vera Custer) — đẩy Ở BƯỚC ĐẦU TIÊN của
  // lượt cô ta, TRƯỚC CẢ draw!-check Dynamite/Jail (đã hỏi lại và chốt — lựa
  // chọn này có thể ảnh hưởng tới chính draw!-check đó, vd mượn Lucky Duke).
  // Chỉ đẩy khi có ít nhất 1 người chơi khác còn sống VÀ đã có nhân vật (bỏ
  // qua nếu không ai để mượn). RESPOND kèm targetId = mượn ĐÚNG characterId
  // hiện tại của người đó; hết giờ tự chọn NGẪU NHIÊN 1 trong các ứng viên
  // (bắt buộc chọn, không có lựa chọn "không mượn ai" — xem room.ts).
  | { kind: "NEED_PICK_BORROWED_CHARACTER"; player: string }
  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // đẩy đầu lượt CỦA CHÍNH người có khả năng này (thường là Elena Noir, có
  // thể là Vera Custer đang mượn — xem GameState.elenaNoirImmortalTurnsLeft),
  // CHỈ khi KHÔNG đang trong trạng thái Miễn Tử — đang Miễn Tử thì bỏ qua
  // bước này, rút thẳng 3 lá (xem handleDrawCards()). RESPOND kèm
  // `armed: true` -> chỉ rút 1 lá lượt này, đặt elenaNoirArmed[playerId] =
  // true (bảo vệ tới đầu lượt kế tiếp của CHÍNH người này); không kèm/
  // `armed: false` (mặc định/hết giờ) -> rút 2 lá bình thường,
  // elenaNoirArmed[playerId] = false. Xem respondToPickArmed() trong
  // reduce.ts.
  | { kind: "NEED_PICK_ARMED"; player: string }
  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
  // — đẩy NGAY khi Jail vừa được gắn lên người có khả năng này (playJail()
  // trong reduce.ts), TRƯỚC CẢ khi trả về — bắt buộc chọn đúng 1 người chơi
  // khác còn sống bất kỳ (không giới hạn khoảng cách, được phép trùng người
  // vừa đánh Jail) để "cùng vào tù": người này sẽ ăn theo ĐÚNG kết quả thoát
  // tù của chính Marcel sau này, không tự rút bài riêng (xem
  // GameState.marcelJailCompanion, resolveDrawCheck() trong reduce.ts).
  | { kind: "NEED_PICK_MARCEL_COMPANION"; player: string };

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
      // Cat Balou (VÀ Can Can — bản "delayed" của nó, mở rộng Dodge City): người
      // đánh chọn VÙNG bắt mục tiêu bỏ bài (tay hay sân) — lá cụ thể trong vùng
      // đó do chính mục tiêu chọn, trả lời qua RESPOND.
      targetZone?: "hand" | "equipment";
      // Mở rộng Dodge City, mục 1.2 (Brawl/Rag Time/Springfield/Tequila/Whisky)
      // — id 1 lá phụ BẤT KỲ khác từ tay, bỏ CÙNG LÚC với lá chính (bắt buộc,
      // reduce() từ chối nếu thiếu/không hợp lệ — xem discardExtraCard() trong
      // reduce.ts).
      extraDiscardCardId?: string;
      // Mở rộng Dodge City (Brawl) — TẤT CẢ người chơi khác phải bỏ 1 lá, người
      // đánh chọn VÙNG (tay/sân) riêng cho TỪNG nạn nhân (khoá bằng playerId của
      // nạn nhân) — lá cụ thể trong vùng đó do chính nạn nhân chọn, trả lời qua
      // RESPOND y hệt Cat Balou (xem playBrawl() trong reduce.ts).
      brawlZones?: Record<string, "hand" | "equipment">;
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
      // Bộ mở rộng "custom_characters" (Elena Noir) — trả lời NEED_PICK_ARMED:
      // true = vũ trang (rút 1 lá lượt này); bỏ trống/false = không vũ trang
      // (rút 2 lá bình thường). Xem respondToPickArmed() trong reduce.ts.
      armed?: boolean;
    }
  // Kỹ năng CHỦ ĐỘNG dùng chung cho 3 nhân vật khác nhau — `cardIds` đổi ý
  // nghĩa/độ dài tuỳ nhân vật đang dùng (xem handleUseAbility() trong
  // reduce.ts, tự nhánh theo field tĩnh nào có mặt trên CharacterDefinition):
  // - Sid Ketchum (canSelfHeal, đợt 7): ĐÚNG 2 lá KHÁC NHAU trên tay để hồi 1
  //   máu. Dùng được BẤT CỨ LÚC NÀO — KHÔNG đi qua assertCurrentPlayer/kiểm
  //   tra pending như mọi action khác, kể cả đang bị tấn công. Không làm gì
  //   tới lượt/pending của bất kỳ ai — chỉ đổi hand/discardPile/hp của CHÍNH
  //   player này.
  // - Chuck Wengam (canPayLifeToDraw, mở rộng Dodge City mục C nhóm A): mảng
  //   RỖNG (không bỏ lá nào) — mất 1 máu để rút 2 lá, lặp lại được nhiều lần
  //   TRONG lượt của chính mình, chặn nếu chỉ còn đúng 1 máu.
  // - José Delgado (canDiscardEquipmentToDraw, mở rộng Dodge City mục C nhóm
  //   A): ĐÚNG 1 lá xanh dương (equipment "instant", không tính lá vàng
  //   "delayed") trên tay để rút 2 lá, tối đa 2 LẦN/lượt, CHỈ trong lượt của
  //   chính mình (xem GameState.joseDelgadoUsesThisTurn).
  // - Doc Holyday (canDiscardTwoForBang, mở rộng Dodge City mục C nhóm C):
  //   ĐÚNG 2 lá bất kỳ (không cần cùng tên) trên tay để bắn hiệu ứng Bang!
  //   nhắm `targetId` (bắt buộc, trong tầm súng đang cầm), tối đa 1 LẦN/lượt,
  //   CHỈ trong lượt của chính mình, KHÔNG tính vào giới hạn 1 Bang!/lượt.
  | { type: "USE_ABILITY"; playerId: string; cardIds: string[]; targetId?: string }
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
  // Cat Balou/Brawl/Can Can (byPlayerId luôn là 1 người thật) — hoặc The
  // Daltons (High Noon, byPlayerId: null — TỰ bỏ vì lá sự kiện, không ai bắt).
  | { type: "CARD_FORCE_DISCARDED"; playerId: string; byPlayerId: string | null; cardId: string }
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
  // `hp` = máu SAU KHI hồi sinh (thường là 1, nhưng Tequila Joe — mở rộng
  // Dodge City, mục C nhóm B — được cộng thêm riêng +1 nữa, thành 2).
  | { type: "BEER_SAVED_FROM_DEATH"; playerId: string; cardId: string; hp: number }
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
  // Mở rộng Dodge City, mục D — biến thể 3 người (vòng tròn săn đuổi): hạ BẤT
  // KỲ ai (bất kể vai, kể cả sai vòng tròn săn đuổi) đều được thưởng rút 3 lá,
  // khác nguồn thưởng OUTLAW_BOUNTY_DRAWN (chỉ áp dụng 4-8 người). count = số
  // lá rút được (có thể ít hơn 3 nếu deck+chồng bỏ cạn giữa chừng).
  | { type: "HUNT_KILL_BOUNTY_DRAWN"; playerId: string; count: number }
  // Mở rộng Dodge City, mục C nhóm A — Chuck Wengam dùng kỹ năng chủ động:
  // mất 1 máu để rút thêm bài. `count` = số lá rút được (có thể ít hơn 2 nếu
  // deck+chồng bỏ cạn). KHÔNG tái dùng DAMAGE_DEALT — event đó gắn nghĩa "bị
  // tấn công" trong nhật ký, dùng lại ở đây (mất máu TỰ NGUYỆN) dễ hiểu nhầm.
  | { type: "CHUCK_WENGAM_TRADED_LIFE"; playerId: string; count: number }
  // Mở rộng Dodge City, mục C nhóm A — José Delgado dùng kỹ năng chủ động: bỏ
  // đúng 1 lá xanh dương (`cardId`) từ tay để rút thêm bài (`count`, có thể ít
  // hơn 2 nếu deck+chồng bỏ cạn). KHÔNG tái dùng CARDS_DISCARDED — event đó đã
  // gắn nghĩa "bỏ bài thừa cuối lượt" trong nhật ký (giống lý do
  // KIT_CARLSON_DISCARDED tách riêng khỏi CARDS_DISCARDED).
  | { type: "JOSE_DELGADO_TRADED_EQUIPMENT"; playerId: string; cardId: string; count: number }
  // Mở rộng Dodge City, mục C nhóm B — Apache Kid miễn nhiễm với lá chất Rô
  // (`cardId`) do `fromPlayerId` đánh nhắm vào mình (`playerId` = Apache Kid).
  // Lá vẫn bị đánh/rời tay/vào chồng bỏ bình thường — chỉ HIỆU ỨNG không áp
  // dụng, event này để tránh hiểu nhầm "không có gì xảy ra" là bug.
  | { type: "APACHE_KID_IMMUNE"; playerId: string; fromPlayerId: string; cardId: string }
  // Mở rộng Dodge City, mục C nhóm C — Doc Holyday dùng kỹ năng chủ động: bỏ
  // 2 lá (`cardIds`) để bắn hiệu ứng Bang! nhắm `targetId`. Hậu quả THẬT (né/
  // mất máu/miễn nhiễm Apache Kid) báo qua các event khác như Bang! thường
  // (MISSED_PLAYED/DAMAGE_DEALT/APACHE_KID_IMMUNE) — event này chỉ ghi nhận
  // hành động DÙNG kỹ năng, giống CARD_PLAYED cho lá thật.
  | { type: "DOC_HOLYDAY_SHOT"; playerId: string; cardIds: [string, string]; targetId: string }
  // Mở rộng Dodge City, mục C nhóm C — Vera Custer chọn mượn khả năng của
  // `borrowedFromPlayerId` (hiệu lực tới lượt kế tiếp của chính cô).
  | { type: "VERA_CUSTER_BORROWED"; playerId: string; borrowedFromPlayerId: string; characterId: string }
  // Bộ mở rộng "custom_characters" (Elena Noir) — đòn lẽ ra giết cô (Bia
  // không cứu được/không có Bia) nhưng cô ĐANG vũ trang -> thay vì
  // PLAYER_ELIMINATED, vào trạng thái Miễn Tử `turnsLeft` lượt (luôn là 2 lúc
  // mới kích hoạt — xem eliminateIfDead() trong reduce.ts). Bắn event này
  // THAY VÌ PLAYER_ELIMINATED, giống cách BEER_SAVED_FROM_DEATH thay thế.
  | { type: "ELENA_NOIR_IMMORTAL_TRIGGERED"; playerId: string; turnsLeft: number }
  // Bộ mở rộng "custom_characters" (Marcel Marcelo) — vừa bị nhốt tù xong,
  // chọn xong `companionId` để "cùng vào tù" (xem NEED_PICK_MARCEL_COMPANION).
  | { type: "MARCEL_COMPANION_PICKED"; playerId: string; companionId: string }
  // Lá đầu (đã báo qua DRAW_CHECK_RESOLVED) không phải Cơ -> rút thêm lá thứ 2
  // (tối đa 2 lá/lượt để tìm Cơ thoát tù) — `cardId`/`matched` ở đây là của lá
  // THỨ 2 này; DRAW_CHECK_RESOLVED bắn SAU đó sẽ phản ánh đúng lá thứ 2 làm
  // kết quả cuối cùng (xem resolveDrawCheck() trong reduce.ts).
  | { type: "MARCEL_JAIL_SECOND_DRAW"; playerId: string; cardId: string; matched: boolean }
  // Marcel vừa thoát tù thành công -> người "cùng vào tù" (`playerId` ở đây)
  // được tự do, không có gì khác xảy ra.
  | { type: "MARCEL_COMPANION_FREED"; playerId: string }
  // Marcel vừa kẹt tù -> người "cùng vào tù" (`playerId` ở đây) cũng bị đánh
  // dấu mất LƯỢT KẾ TIẾP của chính họ (xem GameState.marcelCompanionSkipNextTurn).
  | { type: "MARCEL_COMPANION_JAILED"; playerId: string }
  // Tới đúng lượt của người "cùng vào tù" — lượt đó bị bỏ qua hoàn toàn (không
  // rút, không đánh), y hệt JAIL_SKIPPED_TURN nhưng không tự rút bài kiểm tra
  // gì (kết quả đã định đoạt từ trước, xem applyTurnStartChecks() trong reduce.ts).
  | { type: "MARCEL_COMPANION_TURN_SKIPPED"; playerId: string }
  // Bộ mở rộng "custom_characters" (Mary Rose, xem House_Rule.txt mục I) —
  // đánh Bang! chủ động phải bỏ ĐỦ 2 lá Bang! (không phải 1). `cardId` = lá
  // Bang! THỨ 2 (ngoài lá chính đã báo qua CARD_PLAYED như bình thường).
  | { type: "MARY_ROSE_EXTRA_BANG_DISCARDED"; playerId: string; cardId: string }
  // Mary Rose THẬT SỰ mất máu vì trúng Bang! ĐƠN LẺ (không đỡ được) -> bắn trả
  // MIỄN PHÍ vào `targetId` (người vừa bang cô), bỏ qua khoảng cách, cần 2
  // Missed! mới né được (xem pushMaryRoseReflection() trong reduce.ts).
  | { type: "MARY_ROSE_REFLECTED"; playerId: string; targetId: string }
  // Mở rộng High Noon/A Fistful of Cards — lá sự kiện `eventId` (kiểu string,
  // cùng lý do GameState.eventDeck ở trên) vừa được lật lên, đè lên lá cũ (nếu
  // có). Hiệu ứng THẬT của lá (nếu thuộc nhóm A — chạy 1 lần lúc lật, xem mục
  // 1.4) báo qua các event khác ngay sau event này trong cùng mảng events[].
  | { type: "EVENT_REVEALED"; eventId: string }
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
  // Mở rộng Dodge City — bộ mở rộng chủ phòng chọn BẬT cho RIÊNG ván này (xem
  // ExpansionId ở trên + setup.ts's RuleOptions.expansions). Mảng RỖNG (mặc
  // định) = đúng luật gốc, không có lá/nhân vật bộ mở rộng nào trong ván. Lưu
  // lại trong state (dù chỉ setup.ts đọc lúc tạo ván, không đọc lại lúc chơi)
  // để UI hiển thị "Bộ mở rộng đang bật" giống cách houseRules đang làm.
  expansions: ExpansionId[];
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
  // Mở rộng Dodge City, mục C nhóm A — José Delgado dùng được kỹ năng chủ động
  // (bỏ 1 lá xanh dương từ tay, rút 2 lá) tối đa 2 LẦN/lượt, CHỈ trong lượt
  // của chính mình. Reset về 0 mỗi khi sang lượt mới (advanceTurn(), giống
  // bangUsedThisTurn) — không cần theo playerId vì chỉ người ĐANG tới lượt mới
  // dùng được (assertCurrentPlayer() chặn mọi trường hợp khác).
  joseDelgadoUsesThisTurn: number;
  // Mở rộng Dodge City, mục C nhóm C — Doc Holyday dùng được kỹ năng chủ động
  // (bỏ 2 lá bất kỳ, bắn Bang! trong tầm súng) tối đa 1 LẦN/lượt, CHỈ trong
  // lượt của chính mình. Reset về false mỗi khi sang lượt mới (advanceTurn(),
  // giống bangUsedThisTurn).
  docHolydayUsedThisTurn: boolean;
  // Mở rộng Dodge City, mục C nhóm C — Molly Stark: dồn số lần bỏ Bang! TỰ
  // NGUYỆN trong 1 ván Đấu tay đôi (Duel) ĐANG diễn ra, CHỈ rút bài khi Duel
  // THẬT SỰ kết thúc (xem onVoluntaryPlayOutOfTurn ở characters.ts +
  // respondToDuel()/playDuel() trong reduce.ts). null = không ai đang dồn
  // (reset mỗi khi Duel MỚI bắt đầu). `playerId` do CHÍNH hook ghi lại — cố
  // tình KHÔNG so khớp cứng characterId ở nơi tiêu thụ (drainDuelBangDrawPending()),
  // để không phá vỡ quy ước "tra qua hook/field, không so khớp tên nhân vật".
  duelBangDrawPending: { playerId: string; count: number } | null;
  // Mở rộng Dodge City, mục C nhóm C — Vera Custer: characterId đang MƯỢN
  // (hoặc null nếu chưa mượn/chưa tới lượt cô lần nào) — hiệu lực từ lúc chọn
  // tới tận lượt KẾ TIẾP của chính cô (không tự hết hạn giữa chừng, chỉ bị GHI
  // ĐÈ khi cô chọn lại đầu lượt sau). Không theo playerId vì chỉ 1 người có
  // thể là Vera Custer. Xem getEffectiveCharacterId() ở characters.ts — hàm
  // TRUNG TÂM DUY NHẤT mọi nơi cần biết "characterId hiệu lực" của 1 người
  // phải gọi qua, thay vì đọc thẳng player.characterId.
  veraCusterBorrowedCharacterId: string | null;
  // Bộ mở rộng "custom_characters" (Elena Noir, xem House_Rule.txt mục I) —
  // playerId -> đang "vũ trang" khả năng Miễn Tử cho chu kỳ hiện tại hay
  // không. THEO PLAYERID (khác các field "...UsedThisTurn" khác) vì Vera
  // Custer (Dodge City, canBorrowCharacterAbilities) có thể MƯỢN khả năng
  // này qua getEffectiveCharacterDefinition() — nếu 1 ván có CẢ Elena Noir
  // thật LẪN Vera Custer đang mượn đúng cô ta, mỗi người cần trạng thái vũ
  // trang RIÊNG, không dùng chung 1 field đơn (đã từng là field đơn, ĐÃ SỬA
  // triệt để sau khi phát hiện xung đột này). Không có entry (`undefined`)
  // coi như false — dùng `?? false` khi đọc, XOÁ KEY (không set false) khi
  // "dùng xong" để Record không phình to vô ích qua nhiều lượt.
  //
  // Chỉ được set lại mỗi khi ĐẾN LƯỢT CỦA CHÍNH người đó (ở handleDrawCards(),
  // lúc trả lời NEED_PICK_ARMED) — KHÔNG reset vô điều kiện ở advanceTurn()
  // như bangUsedThisTurn/docHolydayUsedThisTurn (2 field đó reset mỗi lượt
  // CỦA BẤT KỲ AI; field này phải sống sót qua hết lượt của những người chơi
  // khác xen giữa 2 lượt liên tiếp của chính người sở hữu).
  elenaNoirArmed: Record<string, boolean>;
  // Bộ mở rộng "custom_characters" (Elena Noir) — playerId -> còn bấy nhiêu
  // LƯỢT CỦA CHÍNH NGƯỜI ĐÓ trong trạng thái Miễn Tử (luôn bắt đầu ở 2 lúc
  // mới kích hoạt, xem ELENA_NOIR_IMMORTAL_TRIGGERED) — giảm dần mỗi khi 1
  // lượt TRONG Miễn Tử kết thúc; về 0 thì XOÁ KEY này (thay vì giữ 0) VÀ chết
  // chắc chắn (xem advanceTurn() trong reduce.ts). KHÔNG có entry = không
  // trong Miễn Tử (tương đương "null" của field đơn cũ) — THEO PLAYERID cùng
  // lý do với elenaNoirArmed ở trên (xung đột Vera Custer). Máu (hp) giữ
  // nguyên ở 0 suốt trạng thái này — không dùng field riêng đánh dấu "đang
  // Miễn Tử", chỉ cần có entry trong Record này là đủ.
  elenaNoirImmortalTurnsLeft: Record<string, number>;
  // Bộ mở rộng "custom_characters" (Marcel Marcelo, xem House_Rule.txt mục I)
  // — playerId của người ĐANG BỊ JAIL có khả năng này (thường là Marcel, có
  // thể là Vera Custer đang mượn) -> playerId của người được chỉ định "cùng
  // vào tù". Chỉ tồn tại từ lúc Jail vừa gắn (NEED_PICK_MARCEL_COMPANION) tới
  // lúc chính draw!-check Jail đó của người bị nhốt được giải quyết xong (xem
  // resolveDrawCheck() trong reduce.ts) — XOÁ KEY ngay sau đó, dù thoát hay
  // kẹt tù. THEO PLAYERID (khoá = người bị nhốt, không hardcode "marcel") vì
  // Vera Custer có thể mượn khả năng này — cùng lý do với elenaNoirArmed ở trên.
  marcelJailCompanion: Record<string, string>;
  // Bộ mở rộng "custom_characters" (Marcel Marcelo) — playerId (của người
  // "cùng vào tù", KHÔNG phải Marcel) -> đánh dấu sẽ mất LƯỢT KẾ TIẾP của
  // chính họ (bất kể xa gần), vì Marcel vừa kẹt tù. Tiêu thụ (xoá key) đúng 1
  // lần ở applyTurnStartChecks() (reduce.ts) khi tới lượt người đó — bỏ qua cả
  // lượt, không rút bài kiểm tra gì thêm. Không có entry = không bị ảnh hưởng.
  marcelCompanionSkipNextTurn: Record<string, boolean>;
  // Bộ mở rộng "custom_characters" (Marcel Marcelo) — playerId -> vừa thoát tù
  // thành công lượt này, lượt rút bài SẮP TỚI (handleDrawCards() trong
  // reduce.ts) phải rút 3 lá thay vì 2 (Phương án C, xem House_Rule.txt mục
  // I). Tiêu thụ (xoá key) đúng 1 lần ngay khi handleDrawCards() đọc thấy.
  marcelJailBonusDrawThisTurn: Record<string, boolean>;
  // Mở rộng High Noon/A Fistful of Cards (xem core/events.ts + mục 1.2
  // Luat_Bang_Mo_Rong_HighNoon.txt) — chồng lá sự kiện chưa lật. Kiểu
  // `string[]` (không phải `EventId[]`) để giữ đúng quy ước "types.ts không
  // import từ file khác trong core/" (giống deck/discardPile ở trên dùng
  // string[] thay vì CardName[]) — ép kiểu EventId khi đọc ở reduce.ts/
  // events.ts. QUY ƯỚC: phần tử CUỐI = lá lật KẾ TIẾP (ĐỒNG BỘ với deck/
  // discardPile — "phần tử cuối = lá trên cùng", đừng đảo ngược). Lá cuối
  // (isFinalCard, "high_noon"/"a_fistful_of_cards") luôn là PHẦN TỬ ĐẦU (lật
  // sau cùng — lật ngược cả chồng lúc chuẩn bị, xem setup.ts). LUÔN có mặt
  // (mảng rỗng nếu không bật bộ mở rộng nào có lá sự kiện) — đúng quy tắc 3.
  eventDeck: string[];
  // Lá ĐANG có hiệu lực (null = chưa lật lá nào, kể cả khi eventDeck có sẵn
  // nội dung chờ lật). Đã lật lá cuối (isFinalCard) thì field này giữ nguyên
  // tới hết ván, eventDeck rỗng, không lật thêm gì nữa.
  activeEventId: string | null;
  // Các lá đã bị đè, giữ lại để hiển thị lịch sử — KHÔNG bí mật gì (mọi lá đã
  // từng lật đều công khai), khác phần CÒN LẠI của eventDeck (bị viewFor() ẩn,
  // xem view.ts + mục 1.2 "chỉ lộ lá đang chạy + lá kế tiếp").
  eventDiscard: string[];
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
  | "beer_below_two"; // Bia vẫn có tác dụng dù chỉ còn 2 người sống, bỏ ngoại lệ luật gốc (playBeer()/eliminateIfDead())

// Mở rộng Dodge City — danh sách id BỘ MỞ RỘNG đã cài, TÁCH RIÊNG khỏi
// HouseRuleId ở trên: house rule là chỉnh SỬA luật chơi gốc, còn bộ mở rộng là
// THÊM NỘI DUNG (lá bài + nhân vật mới). Trước đây gộp chung 1 cờ "extra_cards"
// trong HouseRuleId — đổi sang mảng riêng vì: (1) nhiều bộ mở rộng có thể cùng
// tồn tại sau này, mỗi bộ đóng góp cardCounts/characterIds riêng (xem
// EXPANSION_CARD_COUNTS ở cards.ts, EXPANSION_CHARACTER_IDS ở characters.ts);
// (2) đây vốn là 1 MẢNG (giống houseRules) nên nhiều bộ mở rộng TỰ NHIÊN chơi
// kết hợp được với nhau — bật đồng thời nhiều id trong mảng, setup.ts gộp dữ
// liệu của tất cả bộ đang bật qua 1 đường code chung, không rẽ nhánh riêng
// từng bộ. Thêm bộ mở rộng mới thì thêm 1 giá trị vào union này.
// "custom_characters" — nhân vật TỰ CHẾ, không thuộc bản gốc/Dodge City (xem
// House_Rule.txt), tên hiển thị luôn có đuôi "*ex". Không thêm lá bài mới
// (EXPANSION_CARD_COUNTS.custom_characters là object rỗng, xem cards.ts).
// "high_noon"/"a_fistful_of_cards" — bộ mở rộng "lá sự kiện" (xem
// Luat_Bang_Mo_Rong_HighNoon.txt/Luat_Bang_Mo_Rong_FistfulOfCards.txt +
// core/events.ts). KHÔNG thêm lá bài chơi/nhân vật mới nào (EXPANSION_CARD_COUNTS
// và EXPANSION_CHARACTER_IDS của 2 id này đều rỗng) — chỉ đóng góp
// EXPANSION_EVENT_IDS (events.ts).
export type ExpansionId = "dodge_city" | "custom_characters" | "high_noon" | "a_fistful_of_cards";
