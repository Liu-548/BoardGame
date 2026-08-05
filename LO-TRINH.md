# Lộ trình dự án game bài online

**Kiến trúc chốt:** Cloudflare Workers + Durable Objects, không dùng framework, TypeScript thuần.

**Cách dùng file này:** làm từ trên xuống, không nhảy cóc. Mỗi dòng chỉ được tick khi đạt đúng "Xong khi nào" — không phải khi "code chạy được".

---

## Giai đoạn 0 — Chuẩn bị

| # | Việc | Xong khi nào | Cần học |
|---|---|---|---|
| 0.1 | Cài Node.js (bản LTS), VS Code, Git | Gõ `node -v` và `git -v` ra số phiên bản | — |
| 0.2 | Tạo tài khoản GitHub + Cloudflare (đều miễn phí) | Đăng nhập được cả hai | — |
| 0.3 | Học Git ở mức tối thiểu | Tự tạo repo, commit, xem lịch sử, quay lại commit cũ | `init` `add` `commit` `log` `checkout` |
| 0.4 | Tạo repo dự án, đẩy lên GitHub | Thấy code trên github.com | — |
| 0.5 | Đặt file `CLAUDE.md` vào gốc repo | File có mặt, đã commit | — |

> **Đừng bỏ qua 0.3.** Claude Code sửa nhiều file một lúc. Không có Git thì không có đường lùi.

---

## Giai đoạn 1 — Engine luật chơi (KHÔNG web, KHÔNG mạng)

Đây là ~70% khối lượng dự án. Chạy hoàn toàn trong terminal.

| # | Việc | Xong khi nào | Ghi chú |
|---|---|---|---|
| 1.1 | Định nghĩa kiểu dữ liệu state ván đấu | Có `types.ts`, state là JSON thuần | Không class có method, chỉ dữ liệu |
| 1.2 | Bảng dữ liệu bộ bài cơ bản | Đủ 80 lá, khai báo dạng dữ liệu | Không hardcode logic vào đây |
| 1.3 | Bộ sinh số ngẫu nhiên có seed | Cùng seed → cùng thứ tự bài, 100% lần | Cấm `Math.random()` trong core |
| 1.4 | Xáo bài + chia bài + chia vai | Setup được ván 4–7 người, Sheriff +1 máu | Bỏ qua nhân vật ở giai đoạn này |
| 1.5 | Vòng lượt: rút 2 → đánh → bỏ bài thừa | Chuyển lượt đúng, bỏ qua người đã chết | |
| 1.6 | Hàm `reduce(state, action)` | Trả về state mới, không sửa state cũ | Xương sống của cả dự án |
| 1.7 | **Stack `pending`** | Đánh Bang! → có mục chờ Missed! | Xem "Nguyên tắc" bên dưới |
| 1.8 | Bài nâu cơ bản | Bang!, Missed!, Beer, Saloon, Stagecoach, Wells Fargo | |
| 1.9 | Bài nâu tấn công | Indians, Duel, Gatling, General Store, Panic, Cat Balou | Nhiều mục pending cùng lúc |
| 1.10 | Cơ chế "draw!" (lật bài kiểm tra) | Lật được, đẩy đúng lên đỉnh stack | Chỗ dễ sai nhất |
| 1.11 | Bài xanh / trang bị | Barrel, Scope, Mustang, Jail, Dynamite, các loại súng | |
| 1.12 | Khoảng cách & tầm bắn | Tính đúng khi có người chết giữa ván | Ghế ngồi co lại khi chết |
| 1.13 | Chết, thưởng/phạt, điều kiện thắng | 3 phe thắng đúng luật | Sheriff giết Deputy → mất hết bài |
| 1.14 | 4 bot đánh ngẫu nhiên | Chạy 1000 ván liên tiếp, 0 crash, 0 ván treo | **Đây là cột mốc thật sự** |

> **Không sang giai đoạn 2 trước khi 1.14 xanh.** Sửa lỗi luật khi đã có giao diện và mạng khó gấp mười lần.

---

## Giai đoạn 2 — Giao diện tối giản (vẫn CHƯA có mạng)

| # | Việc | Xong khi nào |
|---|---|---|
| 2.1 | HTML/CSS/DOM cơ bản | Tự tạo được trang có nút bấm và đổi nội dung |
| 2.2 | Vẽ state ra màn hình | Nhìn màn hình biết được ai còn mấy máu, có bài gì (hiển thị bằng chữ/tên, vd "Bang!" — **chưa cần hình ảnh**, ảnh gắn dần ở việc 4.6) |
| 2.3 | Bấm lá bài → gọi `reduce` | Chơi được ván hoàn chỉnh trên 1 máy |
| 2.4 | Hiện stack `pending` cho người dùng | Người chơi biết "đang chờ B trả lời" |
| 2.5 | Chế độ hotseat | 4 người ngồi chung 1 máy chơi hết ván |

---

## Giai đoạn 3 — Mạng (Durable Objects thuần)

| # | Việc | Xong khi nào | Bẫy |
|---|---|---|---|
| 3.1 | Worker "hello world" + `wrangler deploy` | Mở link `.workers.dev` thấy chữ | |
| 3.2 | Durable Object đầu tiên | Đếm số lần truy cập, số không mất khi reload | |
| 3.3 | WebSocket + **Hibernation API** | 2 tab chat được với nhau | Phải `ctx.acceptWebSocket()`, **không** `ws.accept()` |
| 3.4 | Routing theo mã phòng | Cùng mã → cùng DO instance | 1 phòng = 1 DO |
| 3.5 | Giao thức tin nhắn | Định nghĩa xong các loại message, viết ra giấy trước | |
| 3.6 | Lọc view theo người chơi | Mở DevTools của A không thấy được bài của B | **Bắt buộc, không được bỏ** |
| 3.7 | Lưu state vào DO storage | Deploy lại giữa ván, ván vẫn còn | |
| 3.8 | Reconnect | Tắt wifi 30 giây rồi bật, vào lại đúng ván | |
| 3.9 | Lobby: tạo phòng / vào phòng | Bạn bè nhập mã 6 ký tự là vào được | |
| 3.10 | Chơi thử thật với bạn bè | 1 ván hoàn chỉnh, 4 người, 4 nơi khác nhau | 🎉 |

---

## Giai đoạn 4 — Hoàn thiện

| # | Việc | Xong khi nào |
|---|---|---|
| 4.1 | Đồng hồ đếm ngược lượt | Dùng DO Alarm, **không** dùng `setInterval` |
| 4.2 | Nhật ký ván đấu hiện trên màn hình | Đọc log biết chuyện gì đã xảy ra |
| 4.3 | Xử lý người bỏ ván giữa chừng | Ván không bị treo |
| 4.4 | Giao diện dễ nhìn hơn, responsive | Chơi được trên điện thoại |
| 4.5 | Kiểm tra hạn mức Cloudflare | Xem dashboard, duration/ngày gần 0 |
| 4.6 | Hình ảnh lá bài | Ảnh để trong `public/sprites/`, bổ sung dần và gắn vào từng lá tương ứng trong game — **không vội**, có ảnh tới đâu gắn tới đó, thiếu ảnh vẫn hiển thị bằng chữ như cũ — ✅ **phần khung đã xong** (component `.card-box`, mô tả lá bài, màn hình "Chú giải lá bài"), **còn thiếu ảnh thật** (chưa có file nào trong `public/sprites/`), xem chi tiết ở CLAUDE.md |

---

## Giai đoạn 5 — Mở rộng

| # | Việc | Ghi chú |
|---|---|---|
| 5.1 | Hệ thống hook cho nhân vật | `onLoseLife`, `onLoseLifeFromCard`, `onDrawPhase`, `onDrawCheck`, `modifyDistance`, `onOutgoingBang`, `onHandEmpty`, `onAnyDeath`, `cardAlias`, `activatedAbility` (xem `NHAN-VAT-BANG-CO-BAN.txt`) — ✅ **xong khung**: 4/9 hook đã nối dây thật (`modifyDistance`/`onLoseLife`/`onLoseLifeFromCard`/`onAnyDeath`) + `core/characters.ts` (registry rỗng), 5 hook còn lại để dành cho 5.2. Xem chi tiết ở CLAUDE.md |
| 5.2 | 16 nhân vật bản cơ bản | Mỗi nhân vật là dữ liệu + hook, **không** phải `if/else` — ✅ **HOÀN TẤT**: ĐỦ 16/16 nhân vật (7 đợt) + cơ chế "phát 2 lá chọn 1" (core + UI hotseat/qua mạng + đồng hồ 30 giây thật, tự chốt ngẫu nhiên khi hết giờ) **ĐÃ BẬT THẬT** ở `room.ts`/`main.ts` — chơi được qua giao diện thật hoàn chỉnh. Xem chi tiết ở CLAUDE.md |
| 5.3 | Bật/tắt house rules | Cấu hình theo phòng — ✅ **4/6 ý tưởng nháp xong** (core + UI hotseat/qua mạng): tăng khoảng cách +1, bắt buộc súng mới đánh Bang!, cấm dùng 2 lá trùng tên/lượt, Bia vẫn có tác dụng khi còn 2 người. Còn lại "gộp 2 lá Beer hồi máu người khác" (cần cơ chế chọn mục tiêu mới) để dành đợt sau. Xem chi tiết ở CLAUDE.md |
| 5.4 | Expansion (Dodge City) | Ước lượng ban đầu "chỉ là thêm file dữ liệu + hook" **SAI** — thực tế cần ≥4 hook mới + 1 cơ chế uỷ quyền toàn hệ thống (Vera Custer). 🔶 **CORE HOÀN TẤT (A-F đều XONG, kể cả 15/15 nhân vật mục C) — CHỈ CÒN UI**. Mục A/B/D/E/F + mục C (15/15 nhân vật, Vera Custer là người cuối cùng) đều đã XONG. Còn ĐÚNG UI thật cho toàn bộ Dodge City (40 lá/trang bị trì hoãn/mục D/15 nhân vật). Xem "Ghi chú cho 5.4" bên dưới |
| 5.5 | Board game thứ hai | Chung `server/`, khác `core/` |

### Ghi chú cho 5.3 — ý tưởng luật bổ sung (house rules)

Chưa thiết kế chi tiết, chỉ ghi lại để không quên. Nguyên tắc chung:

- Luật gốc = luật chuẩn BANG! (những gì đang cài trong giai đoạn 1).
- Chủ phòng chọn **0 hoặc nhiều** luật bổ sung cho **một ván cụ thể** — các luật này ghi đè lên luật gốc chỉ trong ván đó, không đổi luật gốc, không ảnh hưởng ván khác.
- Có thể bật nhiều luật bổ sung cùng lúc.

Vài ý tưởng đã nghĩ ra (mỗi luật khi thiết kế thật sẽ nói rõ chi tiết hơn, đây chỉ là danh sách nháp, chưa chốt):

- ✅ Tăng khoảng cách mặc định giữa 2 người chơi (vd từ 1 lên 2) — `houseRules: ["extra_distance"]`
- ✅ Yêu cầu phải có trang bị súng mới được đánh Bang! (bỏ súng ngầm định) — `"require_weapon_for_bang"`
- ~~Cho phép đánh Bang! nhiều lần trong 1 lượt, nhưng không được dùng 2 lá trùng tên~~ / ~~Cho phép dùng nhiều lá trùng tên trong 1 lượt~~ — **làm rõ lúc code (2 ý này viết ra nghe mâu thuẫn nhau)**: luật gốc vốn ĐÃ giới hạn 1 Bang!/lượt (từ Giai đoạn 1) và ĐÃ cho phép dùng nhiều lá trùng tên khác — house rule thật sự cần thêm chỉ có 1: ✅ **cấm** dùng 2 lá NÂU trùng tên/lượt (trừ lá trang bị) — `"no_duplicate_card_names"`
- ✅ Cho phép dùng Beer kể cả khi chỉ còn 2 người sống (bỏ ngoại lệ luật gốc) — `"beer_below_two"`
- ⬜ Cho phép gộp 2 lá Beer để hồi máu cho 1 người chơi khác (thay vì chỉ hồi cho chính mình) — CHƯA làm, cần cơ chế chọn mục tiêu mới, để dành đợt sau

### Ghi chú cho 5.4 — mở rộng Dodge City: ✅ ĐÃ CHỐT kiến trúc + toàn bộ luật mơ hồ, CHƯA VIẾT DÒNG CODE NÀO

Đặc tả gốc: `Luat_Bang_Mo_Rong_DodgeCity.txt` (chủ dự án cung cấp, đọc kỹ TRỪ phần
High Noon — mở rộng KHÁC trong cùng hộp vật lý, ngoài phạm vi). File đó đã tự liệt
kê rất nhiều điểm `[CẦN KIỂM CHỨNG]`/`[CẦN HOOK MỚI]`/`[ĐỔI STATE]` — đã bàn hết với
chủ dự án (đúng quy tắc CLAUDE.md "luật Bang! không rõ ràng → dừng lại và hỏi"), chốt
lại dưới đây làm cơ sở khi bắt đầu code thật. Dòng "5.4 | Expansion | Chỉ là thêm
file dữ liệu + hook nếu 5.1 làm đúng" ở bảng Giai đoạn 5 phía trên **ước lượng SAI**
— thực tế cần thêm ít nhất 4 hook mới + 1 cơ chế uỷ quyền toàn hệ thống, không đơn
giản như dự tính ban đầu.

**A. Kiến trúc "trang bị trì hoãn" (màu vàng — đổi tên từ "green-bordered" gốc, xem
ghi chú màu ở đầu file .txt, KHÔNG dùng `card-box--character` đã dành cho khung nhân
vật):**
- `PlayerState.equipment` **GIỮ NGUYÊN** `string[]` — không đổi kiểu phần tử (tránh rà
  lại ~90 chỗ đang đọc `equipment` như mảng string thuần).
- Thêm field MỚI `equipmentPlayedTurn: Record<string, number>` (cardId → lượt được
  chơi ra) — CHỈ ghi entry cho lá "delayed", lá "instant" (xanh dương thường) không
  cần gì.
- `delayKind` ("instant"/"delayed") **không lưu trong state** — tra tĩnh theo TÊN LÁ
  trong `cards.ts` (giống cách `WEAPON_RANGES` đã tra theo tên), vì đây là thuộc tính
  cố định của từng loại lá, không đổi theo từng lượt chơi.

**B. Nguyên văn lá bài — 9 lá ban đầu đánh dấu `[CẦN KIỂM CHỨNG]`, đã chốt hết:**
- 7 lá đã có sẵn câu trả lời qua ghi chú "*dev" ngay trong file gốc (không cần hỏi
  lại): Rag Time (Panic! không giới hạn khoảng cách, kèm bỏ 1 lá phụ), Conestoga
  (Panic! bản "delayed", không giới hạn khoảng cách), Can Can (Cat Balou bản
  "delayed"), Buffalo Rifle (Bang! bất kỳ ai, bỏ qua khoảng cách hoàn toàn), Knife
  (Bang! khoảng cách 1, **không** kèm rút bài — khác Derringer), Howitzer (bắn TẤT CẢ
  người chơi khác như Gatling), José Delgado (lá vàng "delayed" **không** tính là
  "xanh dương" cho kỹ năng nhân vật này).
- 2 lá còn lại mới chốt trong phiên bàn luật này:
  - **Pepperbox**: Bang! dùng ĐÚNG TẦM SÚNG đang cầm (khác Buffalo Rifle bỏ qua tầm
    hoàn toàn) — đây chính là điểm PHÂN BIỆT 2 lá súng "delayed" này với nhau, tránh
    trùng công dụng.
  - **Derringer**: LUÔN rút thêm 1 lá khi dùng, bất kể mục tiêu có đỡ được (Missed!)
    hay không — rút bài là phần thưởng cho hành động DÙNG lá, không phụ thuộc kết quả
    trúng/né.

**C. 15 nhân vật mới — chia 4 nhóm theo độ khó (bàn với chủ dự án 2026-08-05):**
Nhóm A (7 người, dùng lại cơ chế có sẵn) → Nhóm B (4 người, hook mới nhưng độc
lập) → Nhóm C (3 người, phụ thuộc nhân vật khác) → Vera Custer (làm sau cùng).

**Nhóm A — ✅ XONG** (core + test, UI CHƯA có — xem changelog "Dodge City nhóm
A" trong CHANGELOG.md để biết chi tiết đầy đủ): Pixie Pete/Bill Noface
(`onDrawPhase`), Greg Digger/Herb Hunter (`onAnyDeath`), Pat Brennan (hook mới
`canTakeEquipmentInsteadOfDraw` + PendingAction mới `NEED_PICK_DRAW_OR_EQUIPMENT`,
cùng khuôn Pedro Ramirez/Jesse Jones), Chuck Wengam (`canPayLifeToDraw`) + José
Delgado (`canDiscardEquipmentToDraw`, cần thêm `GameState.joseDelgadoUsesThisTurn`)
— cả 2 dùng CHUNG action `USE_ABILITY` với Sid Ketchum nhưng CHỈ trong lượt
chính mình.

**Nhóm B — ✅ XONG** (core + test, UI CHƯA có — xem changelog "Dodge City nhóm
B" trong CHANGELOG.md): Sean Mallory (hook mới `modifyHandLimit`, đọc qua hàm
`getHandLimit()` MỚI export ở `characters.ts` — dùng CHUNG cho `reduce.ts` LẪN
`room.ts`, vì cả 2 nơi đều có công thức "giới hạn cuối lượt = số máu"); Tequila
Joe (hook mới `modifyHealAmount`, CHỈ áp dụng ở `playBeer()` — Saloon/Tequila/
Canteen/Whisky không đụng gì, + field tĩnh `doubleRevivalHp` RIÊNG cho cơ chế
hồi sinh tự động, không qua `modifyHealAmount`); Elena Fuente (field tĩnh
`hasAnyCardMissedAlias` mở rộng `actsAsMissed()` sang MỌI lá trên tay, + field
tĩnh `canUseOwnEquipmentAsMissed` cho phép dùng CẢ trang bị của chính mình —
kể cả Jail đang giam chính mình — làm Missed! ngay lập tức, TRỪ Dynamite; hàm
`isUsableDelayedMissedEquipment()` đổi tên thành `isEquipmentUsableAsMissed()`
cho đúng nghĩa mới); Apache Kid (hook mới `isImmuneToCard`, CHỈ tra chất lá —
gọi tại 3 điểm `pushMissedReaction()`/`applyPanicEffect()`/
`pushDiscardFromZoneReaction()` (đều đã CENTRALIZED sẵn từ Dodge City đợt 2,
nên KHÔNG "nhiều điểm gọi" như lo ngại ban đầu trong file đặc tả) + 1 điểm
riêng ở `playJail()` — chặn HẲN việc gắn Jail chất Rô lên Apache Kid, khác 3
điểm kia (lá vẫn "dùng" được nhưng vô hiệu). **2 điểm đã hỏi lại và CHỐT**:
Indians! KHÔNG tính là "tương đương Bang!" (cấu trúc khác hẳn Missed!, Apache
Kid vẫn phải bỏ Bang!/mất máu bình thường); Duel KHÔNG áp dụng miễn nhiễm (tự
động đúng vì `playDuel()` không đi qua 3 hàm trên). **Phát hiện lúc viết
test**: trong dữ liệu bài THẬT của dự án, chỉ 4 loại lá có bản sao chất Rô
(Bang!, Cat Balou, Can Can, Buffalo Rifle) — Panic!/Rag Time/Conestoga/Gatling/
Howitzer/Punch/Springfield/Derringer/Knife/Pepperbox/Brawl/Jail đều KHÔNG có
bản sao chất Rô nào trong bộ bài hiện tại, nên nhánh miễn nhiễm cho các lá đó
(và nhánh chặn Jail ở `playJail()`) tồn tại đúng nhưng KHÔNG THỂ kiểm bằng test
thật (không dựng được cardId hợp lệ có chất Rô cho các lá này) — vẫn giữ code
vì đúng chính sách đã chốt, phòng khi bộ bài đổi sau này.

**Việc bổ sung do chủ dự án yêu cầu (2026-08-05), CHƯA làm, để dành đợt sau**:
màn hình "chọn nhân vật" (phát 2 lá, chọn giữ 1) nên hiện thêm LƯỢNG MÁU
(bullets) của mỗi nhân vật, không chỉ tên + mô tả kỹ năng như hiện tại — giúp
người chơi cân nhắc rõ hơn lúc chọn.

**Nhóm C — ✅ XONG** (core + test, UI CHƯA có — xem changelog "Dodge City nhóm
C" trong CHANGELOG.md): Molly Stark (hook mới `onVoluntaryPlayOutOfTurn`, 2
ngữ cảnh "immediate"/"duel" — bắt đúng 4 điểm: dùng Missed!, bỏ Bang! đỡ
Indians!, bỏ Bang! trong Duel — dồn qua `GameState.duelBangDrawPending`, chỉ
rút khi Duel THẬT SỰ kết thúc — và hồi sinh tự động bỏ Beer); Doc Holyday
(field tĩnh `canDiscardTwoForBang`, dùng CHUNG action `USE_ABILITY` — biến thể
thứ 3 sau Sid Ketchum/Chuck Wengam/José Delgado — cần thêm `targetId?` vào
action, `GameState.docHolydayUsedThisTurn` giới hạn 1 lần/lượt; miễn nhiễm
Apache Kid CHỈ khi CẢ 2 lá bỏ ra đều chất Rô, khác luật chung "1 lá Rô là đủ"
— tách `pushMissedReaction()` thành phần kiểm miễn nhiễm + phần đẩy pending
không điều kiện `pushMissedReactionUnconditional()` để tái dùng đúng cách);
Belle Star (field tĩnh `disablesOthersEquipment`, hàm trung tâm MỚI
`getEffectiveEquipment()` ở `characters.ts` — CHỈ 3 điểm đọc equipment thật sự
cần đổi trong toàn bộ `core/`: Mustang/Hideout của MỤC TIÊU trong
`computeDistance()`, Barrel thật của mục tiêu trong `pushMissedReaction()`,
trang bị của người ĐANG PHẢN ỨNG trong `isEquipmentUsableAsMissed()` — KHÔNG
áp dụng cho cướp/bắt bỏ bài (Panic!/Cat Balou vẫn lấy được equipment "vô hiệu
hoá" bình thường, chỉ HIỆU ỨNG tắt chứ lá không biến mất) hay bất kỳ chỗ nào
chỉ tự đọc equipment của chính người đang hành động (luôn miễn nhiễm với
chính mình).

**LƯU Ý QUAN TRỌNG (áp dụng cho CẢ 3 nhóm A/B/C)**: `dealCharacterCards: true`
đã HARDCODE bật thật trong `room.ts` — nghĩa là ngay khi code này được DEPLOY
(kể cả bản beta), cả 14 nhân vật (nhóm A+B+C) có thể bị phát ngẫu nhiên cho
người chơi THẬT. Đa số hoạt động ĐÚNG hoàn toàn dù chưa có UI riêng (hiệu ứng
tự động hoặc chỉ cần nút RESPOND/PLAY_CARD sẵn có — Pixie Pete/Bill Noface/
Greg Digger/Herb Hunter/Sean Mallory/Tequila Joe/Elena Fuente/Apache Kid/Molly
Stark/Belle Star) — nhưng Pat Brennan/Chuck Wengam/José Delgado/Doc Holyday sẽ
bị "vô hiệu" tạm thời (không có nút để dùng kỹ năng đặc biệt — Pat Brennan tự
hết giờ về rút bài thường sau 10 giây, không bị treo; 3 người còn lại chỉ đơn
giản không dùng được kỹ năng, chơi như nhân vật bình thường) cho tới khi có
UI. Đúng tiền lệ "core trước, UI sau" của 16 nhân vật bản gốc — **vẫn CHƯA
deploy, kể cả bản beta**, cho tới khi có UI.

**Vera Custer — ✅ XONG (nhân vật CUỐI CÙNG, 15/15) — xem changelog "Dodge City
Vera Custer" trong CHANGELOG.md để biết chi tiết đầy đủ.** Tóm tắt kiến trúc:
field tĩnh mới `canBorrowCharacterAbilities` (chỉ cô có) + 3 hàm TRUNG TÂM mới
ở `characters.ts` — `getEffectiveCharacterId(state, player)` /
`getEffectiveCharacterHooks(state, player)` / `getEffectiveCharacterDefinition(state, player)`
— MỌI lời gọi `getCharacterHooks()`/`getCharacterDefinition()` rải rác trong
`reduce.ts`/`distance.ts`/`characters.ts` (rà soát trước khi code, đúng quy
tắc CLAUDE.md, đếm được ~30 điểm) đều đổi sang tra qua 3 hàm này thay vì đọc
thẳng `characterId`. Kéo theo đổi chữ ký 1 loạt hàm để nhận `state`/`next`
thay vì slice rời rạc: `getHandLimit(state, player)`,
`getEffectiveEquipment(state, player)`, `computeDistance(state, fromId, toId, extraBaseDistance?)`,
`actsAsBang(state, cardId, player)`, `actsAsMissed(state, cardId, player)`.
Field mới `GameState.veraCusterBorrowedCharacterId` (characterId đang mượn,
hiệu lực tới lượt kế tiếp của chính cô, KHÔNG tự hết hạn giữa chừng). Cơ chế
"chọn mượn đầu lượt" — `PendingAction` mới `NEED_PICK_BORROWED_CHARACTER`, đẩy
Ở BƯỚC ĐẦU TIÊN của lượt cô ta, **TRƯỚC CẢ draw!-check Dynamite/Jail** (đã hỏi
lại và chốt — ảnh hưởng tới chính draw!-check đó, vd mượn Lucky Duke) —
`applyTurnStartChecks()` tách thành 2: kiểm Vera Custer trước, rồi mới gọi
`applyDynamiteAndJailChecks()` (đổi tên từ `applyTurnStartChecks()` cũ). Hết
giờ (15 giây, đúng `REACTIVE_MS` sẵn có) tự chọn NGẪU NHIÊN 1 người còn sống
có nhân vật (bắt buộc chọn, không có lựa chọn "không mượn ai"). Mượn được TẤT
CẢ nhân vật, không ngoại lệ (kể cả Apache Kid/Belle Star) — CHỈ mượn hook/
field tĩnh, KHÔNG mượn bullets/maxHp (`computeStartingHp()` luôn dùng
characterId THẬT).

_(Ghi chú cũ, để tham khảo lịch sử — mục 9 theo file đặc tả gốc)_:

1. **Apache Kid** (miễn nhiễm chất Rô từ người khác đánh nhắm vào mình, trừ Duel):
   thống nhất 1 cách xử lý cho MỌI trường hợp (đơn lẻ lẫn diện rộng) — lá vẫn được
   đánh/rời tay/vào chồng bỏ BÌNH THƯỜNG, chỉ riêng HIỆU ỨNG không áp dụng lên Apache
   Kid (người khác trong lá diện rộng như Gatling/Indians! vẫn bị ảnh hưởng đúng như
   thường) — cần event riêng báo "miễn nhiễm" để khỏi hiểu nhầm là bug. **Trong Đấu
   tay đôi (Duel): miễn nhiễm KHÔNG áp dụng** — thua thì mất máu bình thường như mọi
   người, đúng nguyên văn file gốc. Hook mới: `isImmuneToCard` (tên gợi ý).

2. **Belle Star** (trong lượt cô ta, trang bị người khác mất tác dụng): phạm vi
   **RỘNG NHẤT có thể** — chủ dự án xác nhận KHÔNG chỉ 3 loại đã liệt kê ban đầu
   (khoảng cách/Barrel/Missed! trì hoãn) mà **BẤT KỲ lá nào đang bày trước mặt người
   khác đều bị vô hiệu hóa tạm thời**, không ngoại lệ. Kiến trúc đề xuất: 1 hàm trung
   gian DUY NHẤT `getEffectiveEquipment(state, player)` — MỌI chỗ cần đọc trang bị của
   1 người để tính hiệu ứng (khoảng cách, Barrel, tầm súng, lá vàng dùng như Missed!...)
   gọi qua hàm này thay vì đọc thẳng `player.equipment`; hàm tự trả mảng rỗng nếu đang
   là lượt Belle Star VÀ người đó không phải chính cô — giảm rủi ro bỏ sót so với rà
   từng điểm đọc equipment riêng lẻ.

3. **Elena Fuente** (dùng bất kỳ lá nào trên tay như Missed!): base giữ nguyên (mở
   rộng khái niệm `cardAlias`/`coiNhuMissed` đã có cho Calamity Janet sang "mọi lá,
   không riêng 1 cặp tên"). Bonus (*dev note của chủ dự án, đã hỏi lại và xác nhận):
   **CŨNG được dùng lá đang bày trước mặt CHÍNH MÌNH (equipment) làm Missed!, kể cả
   Jail đang giam chính mình** (dùng xong thì Jail mất, coi như "thoát giam sớm",
   không cần đợi tới đầu lượt để draw! như bình thường) — **TRỪ Dynamite**.

4. **Molly Stark** (rút thêm bài khi chủ động chơi/bỏ Missed!/Beer/Bang! ngoài lượt
   mình): hook mới `onVoluntaryPlayOutOfTurn` (tên gợi ý) — bắt lúc CHÍNH CHỦ chủ
   động chơi/bỏ 1 trong 3 loại lá này ngoài lượt mình, KHÔNG tính nếu bị ép bởi Cat
   Balou/Brawl/Can Can (người khác chọn giúp).
   - Missed! (đỡ Bang!/Gatling) → rút ngay 1 lá.
   - Bang! bỏ ra tự vệ trước Indians! (chọn "bỏ Bang! hoặc chịu mất máu") → **tính là
     chủ động**, rút ngay 1 lá — đã hỏi lại và chủ dự án xác nhận đây vẫn là LỰA CHỌN
     của người chơi, không phải bị ép chọn đúng 1 lá cụ thể như Cat Balou.
   - Bang! trong Duel → **KHÔNG rút ngay từng lần**, dồn lại, rút đủ số lần đã dùng
     khi Duel THẬT SỰ kết thúc (mốc: khi 1 bên tại `NEED_DUEL_RESPONSE` không đưa
     được `cardId`, thua và mất máu — xem `respondToDuel()` trong `reduce.ts`). Cần
     1 field ĐẾM DỒN mới (vd `duelBangDrawPending` gắn với ván, không phải theo lượt —
     vì Duel có thể kéo dài qua lại nhiều vòng trước khi 1 bên thua).
   - Beer → **PHÁT HIỆN QUAN TRỌNG lúc rà code**: hiện tại `handlePlayCard()` LUÔN
     bắt buộc đúng lượt mình (`assertCurrentPlayer()`, không có ngoại lệ nào cho
     Beer) — "chơi Beer ngoài lượt" duy nhất có thể xảy ra trong engine hiện tại là
     cơ chế **hồi sinh tự động** (máu về 0 tự bỏ Beer, KHÔNG đi qua action `PLAY_CARD`
     thật). Đã hỏi lại và chủ dự án CHỐT: Molly Stark's "Beer" trigger CHỈ bắt đúng
     lúc cơ chế hồi sinh tự động này kích hoạt — **KHÔNG nới lỏng luật Beer nói
     chung** (giữ nguyên `assertCurrentPlayer()` cho `playBeer()` bình thường, không
     ảnh hưởng gì tới cách chơi Beer hiện có của MỌI nhân vật khác).

5. **Sean Mallory** (giữ tối đa 10 lá cuối lượt, không theo số máu): hook mới
   `modifyHandLimit` — trả 10 nếu giới hạn mặc định (= `currentHp`) nhỏ hơn 10, ngược
   lại giữ nguyên. Không có gì mơ hồ, không cần bàn thêm.

6. **Tequila Joe** (Beer hồi 2 máu thay vì 1, các lá hồi máu khác vẫn 1): hook mới
   `modifyHealAmount` — nhân đôi lượng hồi CHỈ khi `cardName === "beer"` (Saloon/
   Tequila/Canteen vẫn hồi đúng 1 như bình thường). Ca hồi sinh tự động (máu về 0, tự
   bỏ Beer): **GIỮ NGUYÊN** cơ chế kéo thẳng về 1 máu như hiện có (không phải "lượng
   hồi" theo đúng nghĩa để nhân đôi) — Tequila Joe được cộng thêm RIÊNG +1 máu nữa
   (không qua "lượng hồi" của lá, không cần nhân đôi công thức cũ) → tổng lên **2
   máu** sau khi hồi sinh, đúng ý muốn nhưng không đụng gì cơ chế hồi sinh chung.

7. **Doc Holyday** (bỏ 2 lá bất kỳ để bắn Bang! trong tầm súng, 1 lần/lượt, không
   tính giới hạn 1 Bang!/lượt): dùng `activatedAbility` có sẵn (giống Sid Ketchum)
   nhưng giới hạn 1 lần/lượt — cần biến đếm riêng theo lượt (kiểu
   `docHolydayUsedThisTurn`, reset ở `advanceTurn()`, giống `bangUsedThisTurn`).
   Phần "để bắn trúng Apache Kid cần ít nhất 1 trong 2 lá KHÔNG phải chất Rô" phụ
   thuộc thiết kế Apache Kid ở mục C.1 — làm SAU khi Apache Kid đã có hook miễn nhiễm.

8. **José Delgado** (bỏ 1 lá xanh dương từ tay để rút 2, tối đa 2 lần/lượt): dùng
   `activatedAbility` có sẵn, cần biến đếm riêng theo lượt (giống Doc Holyday). Điều
   kiện lá bỏ ra PHẢI là trang bị "instant" thật (đã chốt ở mục B — lá vàng "delayed"
   KHÔNG tính là "xanh dương" cho kỹ năng này).

9. **Vera Custer** (đầu lượt chọn 1 nhân vật khác còn sống, mượn khả năng đặc biệt
   của họ tới lượt kế tiếp của chính mình) — **phức tạp nhất, cần bàn kỹ nhất**:
   - Kiến trúc: 1 hàm trung tâm tính "characterId hiệu lực" (`effectiveCharacterId`)
     — MỌI nơi đang tra `getCharacterHooks(player.characterId)` hoặc field tĩnh
     (`bypassBangLimit`, `virtualBarrel`, `hasBangMissedAlias`...) đều đổi sang gọi
     qua hàm này thay vì đọc thẳng `player.characterId`. Nhờ vậy MỌI hook/field tĩnh
     tự động "mượn" đúng theo, không cần sửa từng điểm gọi hook riêng lẻ.
   - **CHỈ mượn hiệu ứng/hook — KHÔNG mượn máu tối đa** (`bullets`/`maxHp` của Vera
     giữ nguyên dù mượn ai có máu cao/thấp hơn) — đã hỏi lại và chốt rõ, tránh nhầm
     "khả năng đặc biệt" với "chỉ số nhân vật".
   - **Mượn được TẤT CẢ nhân vật, không có ngoại lệ nào bị chặn** (kể cả Apache
     Kid/Belle Star nếu 2 nhân vật đó cũng đã cài xong) — chủ dự án CHỐT giữ đúng
     luật gốc, không tự thêm giới hạn "quá mạnh/dễ lạm dụng".
   - Cần **ĐỔI STATE**: 1 field mới theo dõi "đang mượn ai, hiệu lực tới lượt nào".

**D. Luật theo số người chơi — ✅ XONG:**
- **8 người**: đã **RÀ LẠI VÀ XÁC NHẬN — DỰ ÁN ĐÃ CÀI ĐÚNG SẴN**, không cần làm gì
  thêm. `setup.ts`'s `ROLE_SETS[8]` hiện là
  `["sheriff", "renegade", "renegade", "outlaw", "outlaw", "outlaw", "deputy",
  "deputy"]` — đúng khớp 1 Sheriff/2 Deputy/3 Outlaw/2 Renegade theo luật Dodge
  City (đã cài từ đợt "Biến thể số người chơi" trước đó, không liên quan gì tới lần
  chuẩn bị Dodge City này).
- **3 người** (vòng tròn săn đuổi) — ✅ **ĐÃ THÊM**: `eliminatePlayer()`
  (`reduce.ts`) giờ có nhánh riêng cho `target.role` là `police`/`criminal`/
  `traitor` — hạ BẤT KỲ ai (bất kể vai, kể cả sai vòng tròn săn đuổi) đều được
  thưởng ngay rút 3 lá, bắn event `HUNT_KILL_BOUNTY_DRAWN` mới (`types.ts`),
  tách biệt hoàn toàn với `OUTLAW_BOUNTY_DRAWN` (2 nguồn không đụng nhau vì
  role của biến thể 3 người không trùng `"outlaw"`). Có log riêng ở `ui.ts`.
  Test: `test/death.test.ts` (2 test cũ cập nhật lại kỳ vọng + không có test mới
  thêm ngoài việc sửa 2 test đó). `tsc --noEmit`/`vitest run` (358 test)/`vite
  build` đều sạch.

**E. Cơ chế nhỏ khác (không mơ hồ, chỉ ghi lại theo đúng khuôn mẫu sẵn có, không cần
hỏi gì thêm):**
- Brawl (bắt MỌI người khác bỏ 1 lá do mình chọn): đẩy pending riêng cho từng nạn
  nhân theo thứ tự (giống cách Gatling đẩy nhiều `NEED_MISSED` liên tiếp).
- Nhóm "bỏ kèm 1 lá phụ" (Brawl, Rag Time, Springfield, Tequila, Whisky): thêm field
  mới `extraDiscardCardId` vào action `PLAY_CARD` — chi tiết triển khai, không phải
  luật mơ hồ.

**F. Phát hiện thêm ngoài phạm vi Dodge City (nhưng cần trước khi chơi thật với các
nhân vật phụ thuộc chất bài) — ✅ HOÁ RA ĐÃ XONG TỪ TRƯỚC, chỉ là ghi chú này bị lỗi
thời:** rà lại code trước khi bắt tay code mới (2026-08-05) phát hiện `ui.ts`'s
`cardButton()`/`cardChip()` (2 hàm dựng MỌI ô lá bài thật trên tay/trang bị/chồng bỏ,
dùng chung cho cả hotseat lẫn qua mạng) **ĐÃ gọi `appendCardVisual(..., cardSuitRankFromId(cardId))`
từ chính đợt "Dodge City đợt 1"** (`4c1d83c`) — hiện 1 badge góc ảnh lá bài dạng
"8♥"/"K♦" (đỏ cho Cơ/Rô, đen cho Bích/Chuồn, CSS `.card-box__suit-badge`). Đợt đó
chỉ ghi nhận trong changelog dưới góc độ khác ("kien truc trang bi tri hoan"),
KHÔNG đối chiếu lại với ghi chú mục F này nên bị bỏ sót, để "CHƯA làm" tồn tại sai
suốt từ đó. Đã tự kiểm lại bằng `vite dev` + trình duyệt thật (hotseat 4 người,
`localhost:5173`): mọi lá trên tay MỌI người chơi đều hiện đúng chất/số kèm màu
(vd "8♥"/"K♦" đỏ, "J♣" đen), kể cả lá trang bị ("Ngựa Mustang (+1)" hiện kèm "9♦").
Không cần code gì thêm cho mục F — Apache Kid (biết lá Rô) và Doc Holyday (cần lá
không phải Rô) đã có đủ thông tin hiển thị để người chơi tự quyết định ngay khi
cài xong hook nhân vật (mục C).

**Trạng thái**: mục A-F đã bàn kỹ và chốt xong hướng làm. Thứ tự code đã chốt:
A (kiến trúc trang bị trì hoãn, ảnh hưởng nhiều lá nhất) → E (cơ chế đơn giản) → B
(các lá bài, phần lớn dùng lại effect handler có sẵn) → D (luật số người chơi, nhỏ) →
C (nhân vật, phức tạp nhất, Vera Custer nên làm SAU CÙNG vì phụ thuộc toàn bộ hook
khác đã ổn định) → F (UI hiển thị chất bài, làm song song/trước phần C).
**TẤT CẢ A-F đã XONG — mục C (15/15 nhân vật) HOÀN TẤT**, kể cả Vera Custer (nhân
vật cuối cùng, phức tạp nhất — cơ chế uỷ quyền toàn hệ thống hook). Chỉ còn UI thật
cho toàn bộ Dodge City (40 lá/trang bị trì hoãn/mục D/15 nhân vật).

**Đợt 1 (mục A + 6/40 lá vàng không cần hook mới) — XONG, xem CLAUDE.md để biết chi
tiết đầy đủ:**
- Mục A (kiến trúc trang bị trì hoãn): `GameState` thêm `turnNumber`
  (đếm lượt, tăng ở `advanceTurn()`) + `equipmentPlayedTurn` (cardId -> lượt được
  chơi ra, CHỈ có entry cho lá "delayed"). `delayKind` tra TĨNH theo tên lá
  (`cards.ts`'s `isDelayedEquipmentCardName()`), không lưu trong state — đúng đề
  xuất gốc, chỉ đổi tên field so với gợi ý ban đầu.
- 6 lá vàng đợt 1 (nhóm KHÔNG cần hook nhân vật mới): Bible, Sombrero, Ten Gallon
  Hat, Iron Plate (dùng NHƯ Missed! qua RESPOND) + Canteen, Pony Express (hiệu ứng
  chủ động, kích hoạt qua PLAY_CARD nhưng nguồn bài là equipment thay vì tay).
  House rule "extra_cards" (đã có checkbox từ trước, lúc đó chưa có tác dụng) giờ
  THẬT SỰ cộng thêm 7 lá này vào bộ bài khi bật (`DODGE_CITY_CARD_COUNTS`,
  cards.ts).
- **UI CHƯA xong** — chưa có nút bấm kích hoạt lá đã bày sẵn, chưa có đường dây
  đáp lại NEED_MISSED bằng trang bị (chỉ dùng được qua code/test, giống tiền lệ
  16 nhân vật lúc mới cài core). **CHƯA deploy** — đợi UI xong hoặc ít nhất tới
  khi có nhu cầu thử qua `wrangler dev`/beta, không đưa lên bản chính lúc này.
- Còn lại đợt 1: 34/40 lá bài (mục B, phần lớn dùng lại effect handler có sẵn) +
  15 nhân vật (mục C) + luật số người chơi Dodge City (mục D — thưởng 3 lá khi
  tự tay hạ bất kỳ ai ở biến thể 3 người) + UI hiển thị chất bài (mục F).

**Đợt 2 (mục E + nốt 34/40 lá bài — ĐỦ 40/40 LÁ) — XONG, xem CLAUDE.md để biết
chi tiết đầy đủ:**
- Mục E (cơ chế đơn giản, làm trước vì nhiều lá mục B cần tới): `PLAY_CARD` thêm
  `extraDiscardCardId`/`brawlZones`. Không cần `PendingAction`/`GameEvent` mới nào
  — tái dùng hoàn toàn `NEED_MISSED`/`pushMissedReaction()` (Punch/Springfield/
  Buffalo Rifle/Derringer/Knife/Pepperbox/Howitzer) và `NEED_DISCARD_FROM_ZONE`
  (Brawl/Can Can) — nên KHÔNG cần sửa `room.ts`/`protocol.ts` (khác mọi đợt nhân
  vật trước).
- Mục B nốt 34/40 lá: 6 lá xanh (Barrel/Dynamite/Remington/Rev. Carabine thêm
  bản sao thứ 2, Binocular/Hideout mới — dùng chung công thức `modifyDistance`
  của Scope/Mustang), 14 lá nâu (7 tên trùng bộ cơ bản + Brawl/Dodge/Punch/Rag
  Time/Springfield/Tequila/Whisky), 7 lá vàng còn lại (Derringer/Conestoga/Can
  Can/Buffalo Rifle/Knife/Pepperbox/Howitzer). Dodge hoạt động y hệt Missed!
  (rút thêm 1 lá khi đỡ thành công, giống Bible).
- Tra suit/rank thật cho 34 lá bằng đúng phương pháp hiệu chỉnh icon đã dùng ở
  đợt 1 (`WebFetch` trực tiếp `bang.dvgiochi.com/cardslist.php`, đối chiếu lại
  qua 4 lá bộ cơ bản đã biết chắc suit trước khi tin).
- **UI vẫn CHƯA xong** — chỉ sửa đủ để qua compile (nhãn/mô tả), CHƯA có nút bấm
  thật. **CHƯA deploy**, giống đợt 1.
- Còn lại: 15 nhân vật (mục C) + luật số người chơi (mục D) + UI hiển thị chất
  bài (mục F) + UI thật cho toàn bộ 40 lá.

**Đợt 3 (mục D — luật riêng biến thể 3 người) — XONG, thuần `core/`, không đụng UI:**
- `eliminatePlayer()` (`reduce.ts`) thêm nhánh `else if` cho `target.role` là
  `police`/`criminal`/`traitor` (biến thể 3 người) — thưởng ngay 3 lá rút cho
  killer, bất kể có đúng vòng tròn săn đuổi hay không, kể cả khi ván kết thúc
  ngay lượt đó (thưởng vẫn cộng trước khi trả `GAME_ENDED`). Event mới
  `HUNT_KILL_BOUNTY_DRAWN` (`types.ts`) — tách hẳn khỏi `OUTLAW_BOUNTY_DRAWN`,
  2 nguồn không đụng nhau vì `role` biến thể 3 người không trùng `"outlaw"`.
  Có log riêng ở `ui.ts`'s `describeEvent()`.
- Test: sửa lại 2 test cũ trong `test/death.test.ts` (trước đó khẳng định
  "không có thưởng gì" cho biến thể 3 người — nay đổi kỳ vọng sang có
  `HUNT_KILL_BOUNTY_DRAWN`, cả ca giết đúng lẫn giết sai mục tiêu).
  `tsc --noEmit`/`vitest run` (358 test)/`vite build` đều sạch.
- **Không có gì để deploy riêng** (chỉ core + 1 dòng log UI) — vẫn nằm chung
  batch "CHƯA deploy" với A/B/E, đợi tới khi mục C+F xong và có UI thật cho
  Dodge City mới deploy đồng loạt lên beta.
- Còn lại: 15 nhân vật (mục C) + UI hiển thị chất bài (mục F) + UI thật cho
  toàn bộ 40 lá + trang bị trì hoãn.

### Ghi chú: bản Beta song song — ✅ ĐÃ XONG (core/config, chỉ còn thiếu bước tự tay `npm run deploy:beta` lần đầu)

Chủ dự án đang chơi bản chính (`https://bang-boardgame.nguyenngoctuan548.workers.dev`)
thật với bạn bè, nhưng vẫn muốn tiếp tục phát triển mà không làm gián đoạn ván đang
chơi. Đã bàn và CHỐT hướng làm, đúng theo dự tính ban đầu, không đổi gì:

- `wrangler.jsonc` thêm `env.beta` → Worker riêng tên `bang-boardgame-beta`, ra URL
  riêng (`https://bang-boardgame-beta.nguyenngoctuan548.workers.dev`). **Phát hiện
  lúc code**: `durable_objects` KHÔNG tự kế thừa vào environment con (khác đa số
  field khác như `assets`/`migrations`) — wrangler tự cảnh báo rõ ràng lúc
  `--dry-run`, đã khai lại y hệt gốc trong `env.beta`. Tên Worker khác nhau → Durable
  Object (dữ liệu phòng/ván) tách biệt hoàn toàn với bản chính.
- `package.json` thêm script `deploy:beta` (= `vite build && wrangler deploy --env
  beta`). Script `deploy` gốc **giữ nguyên hành vi y hệt** — bạn bè vẫn ở đúng URL
  cũ — chỉ thêm `--env=""` tường minh (wrangler cảnh báo mơ hồ "environment nào"
  ngay khi thấy có `env.beta` trong file, dù vẫn tự chọn đúng bản chính; thêm cờ này
  chỉ để hết cảnh báo, không đổi Worker nào được deploy — đã tự kiểm bằng `--dry-run`
  cả 2 script, xác nhận đúng bản chính/beta không lẫn nhau).
- Trong game: nút "Bản Beta (thử nghiệm)" ở màn hình chính (`ui.ts`'s
  `renderHomeScreen()`, thẻ `<a>` thật — không phải button+handler, chỉ mở URL khác ở
  TAB MỚI) — `main.ts`'s `betaLinkInfo()` đọc `location.hostname` để tự đổi thành
  "Về bản chính" khi đang ở domain beta, đối xứng đúng ý ban đầu mà không cần 2 nút
  khác nhau tuỳ domain.
- Quy trình từ giờ: code/commit như bình thường, chạy `npm run deploy:beta` cho tới
  khi tính năng mới ổn — lúc đó mới `npm run deploy` để "chốt" vào bản chính.

Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 308 test vẫn pass (thuần
hạ tầng deploy + UI, không đụng `core/`). Đã tự kiểm bằng `wrangler dev` cục bộ +
trình duyệt thật: nút "Bản Beta (thử nghiệm)" hiện đúng ở màn hình chính, `href` trỏ
đúng URL beta, `target="_blank"` mở tab mới, không phá layout panel các nút khác.

**Còn thiếu đúng 1 bước**: chưa từng chạy `npm run deploy:beta` thật — Worker
`bang-boardgame-beta` CHƯA tồn tại trên Cloudflare, chỉ mới xác nhận qua
`--dry-run`. Tự tay chạy lệnh đó (hoặc nhờ assistant chạy, có xác nhận trước — tạo 1
Worker mới công khai trên tài khoản Cloudflare) khi sẵn sàng dùng bản beta lần đầu.

---

### Biến thể theo số người chơi (2 / 3 / 8) — ngoài phạm vi 4–7 người mặc định

Thứ tự làm đã chốt: **8 → 2 → 3 người**, tăng dần độ khó (xem CLAUDE.md).

- **8 người — ✅ ĐÃ XONG** (core + UI hotseat, đã tự kiểm bằng trình duyệt thật): giống 7 người mặc định, cộng thêm 1 kẻ phản bội (renegade) nữa (`ROLE_SETS[8]` trong `setup.ts`). `win.ts` không cần sửa gì — đã hỗ trợ nhiều Renegade cùng lúc từ trước.
- **2 người — ✅ ĐÃ XONG** (core + UI hotseat/qua mạng, đã tự kiểm bằng trình duyệt thật chơi trọn 1 ván tới khi có người thắng): không chia vai (`role: null`). Giết người kia là thắng. `GameState.winner` đổi thành union `Winner` theo `kind` (`"faction"` cho 4-8 người, `"player"` cho 2 người — xem CLAUDE.md).
- **3 người — ✅ ĐÃ XONG** (core + UI hotseat, đã tự kiểm bằng trình duyệt thật chơi trọn 1 ván tới khi có người thắng): chia ngẫu nhiên 3 vai **cảnh sát / tội phạm / kẻ phản bội** (`Role` mới, KHÔNG kế thừa hành vi Sheriff/Outlaw/Renegade), công khai từ đầu ván cho mọi người (`view.ts`). Vòng tròn săn đuổi:
  cảnh sát → giết tội phạm, tội phạm → giết kẻ phản bội, kẻ phản bội → giết cảnh sát.
  Ai giết đúng mục tiêu của mình thì thắng ngay lập tức.
  Nếu mục tiêu chết nhưng **không phải do đúng người săn nó giết** (vd giết nhầm, chết vì Dynamite...),
  ván tiếp tục bình thường tới khi chỉ còn 1 người sống — ai sống đến cuối thì thắng (dùng chung `Winner.kind: "player"` với biến thể 2 người).
  Chi tiết cài đặt xem CLAUDE.md ("Biến thể số người chơi — đợt 3: 3 người").

---

## Nguyên tắc không được vi phạm

| Nguyên tắc | Vi phạm sẽ dẫn tới |
|---|---|
| `core/` không import framework, mạng, DOM, `Date.now()`, `Math.random()` | Không test được, không thêm game khác được |
| Không bao giờ `await` để chờ người chơi trả lời | DO không ngủ được → cháy quota; không lưu/khôi phục được ván |
| Việc đang chờ là **mảng dùng như stack** trong state, xử lý phần tử cuối | Reaction lồng nhau (Gatling → Barrel → draw!) sẽ sai |
| Client không bao giờ nhận state đầy đủ, chỉ nhận view đã lọc | Ai cũng gian lận được bằng DevTools |
| Dùng `ctx.acceptWebSocket()` + `webSocketMessage/Close/Error` | 1 phòng sống 24h ≈ 10.800 GB-s/ngày, gần hết hạn mức 13.000 |
| Không `setInterval` / `setTimeout` trong DO — dùng Alarm | Chặn hibernate vĩnh viễn |
| Mỗi thay đổi trong `core/` phải kèm test | Sửa luật này vỡ luật kia, không biết lúc nào |

---

## Ước lượng thời gian (người mới, làm buổi tối)

| Giai đoạn | Thời gian |
|---|---|
| 0 | ~1 tuần |
| 1 | 5–8 tuần ← lâu nhất, đừng nản |
| 2 | 2–3 tuần |
| 3 | 3–4 tuần |
| 4 | ~2 tuần |
| **Tới lúc chơi thật với bạn bè** | **~3–5 tháng** |
| 5 | không giới hạn |

---

## Cần chủ dự án tự kiểm chứng (Claude Code chưa/không kiểm được)

> Cập nhật mục này mỗi khi có việc mới thuộc loại này (gom lại từ ghi chú rải rác
> trong CLAUDE.md — xem changelog gốc ở đó để biết chi tiết đầy đủ). Xoá dòng nào
> khỏi bảng khi đã tự kiểm xong và thấy ổn; nếu phát hiện lỗi thì báo lại thay vì
> tự xoá.

Lý do các việc này chưa được Claude Code tự kiểm bằng trình duyệt thật: (1) công cụ
trình duyệt tự động trong môi trường code đôi khi mất kết nối hoặc chập chờn, (2)
không hạ được cửa sổ xuống đúng khung điện thoại thật, (3) nhân vật/tình huống cần
kiểm chỉ xuất hiện NGẪU NHIÊN trong ván qua mạng nên chưa ép ra đúng lúc, hoặc (4)
thay đổi nằm ở `room.ts` (hạ tầng mạng) — theo tiền lệ cả dự án, phần này luôn kiểm
bằng `wrangler dev` + trình duyệt thật, không có test Vitest tự động.

| # | Việc cần kiểm | Cách kiểm | Vì sao chưa kiểm được |
|---|---|---|---|
| 1 | Layout responsive trên điện thoại thật (việc 4.4, ngưỡng `@media (max-width: 480px)`) | Mở link trên điện thoại thật, xem có tràn ngang không; đặc biệt bấm thử vùng nút bài (`.cards button`) xem đủ to/chính xác cho ngón tay không | Không hạ được cửa sổ trình duyệt tự động xuống dưới ~500px (giới hạn của Chrome/hệ điều hành) |
| 2 | Checkbox chọn luật bổ sung (house rules) ở LOBBY QUA MẠNG (`renderNetworkLobby`, việc 5.3 đợt 1) | `wrangler dev` + 2+ tab: xác nhận CHỈ chủ phòng thấy checkbox, chọn luật, bắt đầu ván, vào bàn thật thấy đúng luật đã chọn đang bật | Trình duyệt tự động chập chờn lúc thao tác màn lobby qua mạng đợt đó, đã dừng thay vì cố lặp lại |
| 3 | Seat "của mình luôn hiện đầy đủ" khi phòng >6 người (UI/UX đợt 2, mục 4) qua mạng | `wrangler dev` + ≥7 tab (hoặc giả seed để ép >6 người): xác nhận seat CHÍNH MÌNH luôn đầy đủ trang bị, seat người khác vẫn thu gọn | Đợt đó chỉ kiểm được ở hotseat; nhánh mạng chỉ khác đúng 1 điều kiện đã qua `tsc`, chưa mắt thấy |
| 4 | Nút bấm thật của Pedro Ramirez / Jesse Jones / Kit Carlson khi chơi QUA MẠNG (nhân vật gán ngẫu nhiên theo seed) | Chơi vài ván qua mạng tới khi 1 trong 3 người này xuất hiện, tự bấm thử nút của họ (chọn nguồn rút bài / chọn nạn nhân / giữ 2 bỏ 1) | Nhân vật gán ngẫu nhiên, lần kiểm trước không ra đúng 3 người này qua mạng — chỉ xác nhận được ở hotseat |
| 5 | Sid Ketchum dùng kỹ năng NGOÀI lượt mình không được làm reset đồng hồ của người khác (`room.ts`, việc 5.2 đợt 7) | Dựng tình huống: A đang bị hỏi Missed! (đồng hồ 10s đang chạy), để Sid Ketchum (không phải A) bấm dùng kỹ năng hồi máu — xác nhận đồng hồ của A KHÔNG bị cấp lại về đủ 10s | Thay đổi ở `room.ts` (hạ tầng mạng), theo tiền lệ không có test Vitest, chỉ có `wrangler dev` + trình duyệt thật — chưa dựng đúng tình huống 2 người này cùng lúc |
| 6 | Cảnh báo viền đỏ + icon 💣/🔒 cho Dynamite/Jail hiện đúng TRONG 1 VÁN THẬT (UI/UX đợt 4, mục 5) | Chơi vài ván tới khi có Dynamite/Jail nằm trên sân ai đó, xem viền đỏ + icon có hiện đúng không | Lần kiểm trước chỉ dựng thủ công 2 khối HTML rời để nhìn cận cảnh, chưa thấy trong ngữ cảnh ván thật (rút đúng lá, gắn lên sân) |
| 7 | Toàn bộ UI/UX đợt 5 (mục 4: hàng viên đạn thay số máu, lá nhân vật thu nhỏ cạnh tên) — CẢ hotseat lẫn qua mạng | Mở `npm run dev` (hotseat) và `wrangler dev` (qua mạng), chơi vài lượt để máu giảm — xem hàng viên đạn có xếp gọn, không tràn dòng khi máu tối đa cao (vd 5 máu Sheriff); lá nhân vật mini có canh đúng cạnh tên không, đọc được tên nhân vật khi hover/nhấn giữ không | Extension trình duyệt tự động mất kết nối hoàn toàn ở phiên làm việc đó — CHƯA có bất kỳ lần mắt-thấy nào, chỉ dựa vào `tsc`/test/build sạch |
| 8 | UI/UX đợt 6 (mục 8: băng thông báo phản ứng) — riêng CHUỖI PHẢN ỨNG LỒNG NHAU thật (Gatling→Barrel→draw!, hoặc Slab the Killer cần 2 Missed!) | Dựng đúng tình huống 1 người có 2+ pending chồng nhau, xem banner có đổi đúng theo ĐỈNH stack mỗi lần 1 việc được giải quyết, dòng "+N việc khác đang chờ" có đúng số không | Lần kiểm đợt 6 chỉ dựng được 1 tầng Bang!→Missed! (đã xác nhận banner + đồng hồ gộp + dòng "đồng hồ lượt tạm dừng" đều đúng); logic đọc đỉnh stack không đổi so với code cũ nên rủi ro thấp, nhưng chưa mắt-thấy đúng ca lồng nhiều tầng |

**Lưu ý deploy:** ĐÃ `npm run deploy` — link công khai (`https://bang-boardgame.nguyenngoctuan548.workers.dev`)
giờ có đủ cả 7 đợt "Giao diện UI/UX" + fix kích thước lá nhân vật, đã tự kiểm lại
hotseat NGAY trên link live (đúng bundle vừa build, lá nhân vật đo đúng kích thước).
Còn thiếu: tự kiểm lại BÀN TRÒN QUA MẠNG thật trên chính link công khai (chỉ mới kiểm
hotseat lúc deploy) — nên chơi thử với bạn bè để xác nhận nốt trước khi rủ chơi rộng
rãi hơn.

Đừng hứa với bạn bè một ngày cụ thể.
