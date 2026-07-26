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
| 5.2 | 16 nhân vật bản cơ bản | Mỗi nhân vật là dữ liệu + hook, **không** phải `if/else` — 🚧 **đợt 1: 6/16 xong** (Bart Cassidy, El Gringo, Paul Regret, Rose Doolan, Vulture Sam, Willy the Kid — nhóm dùng ngay được 4 hook đã nối dây ở 5.1, không cần thêm cơ chế). 10 người còn lại cần thêm (`PendingAction` mới, luồng action mới cho Sid Ketchum...) để dành đợt sau. CHƯA có cơ chế "phát 2 lá chọn 1" thật, CHƯA có màn hình chọn nhân vật. Xem chi tiết ở CLAUDE.md |
| 5.3 | Bật/tắt house rules | Cấu hình theo phòng |
| 5.4 | Expansion | Chỉ là thêm file dữ liệu + hook nếu 5.1 làm đúng |
| 5.5 | Board game thứ hai | Chung `server/`, khác `core/` |

### Ghi chú cho 5.3 — ý tưởng luật bổ sung (house rules)

Chưa thiết kế chi tiết, chỉ ghi lại để không quên. Nguyên tắc chung:

- Luật gốc = luật chuẩn BANG! (những gì đang cài trong giai đoạn 1).
- Chủ phòng chọn **0 hoặc nhiều** luật bổ sung cho **một ván cụ thể** — các luật này ghi đè lên luật gốc chỉ trong ván đó, không đổi luật gốc, không ảnh hưởng ván khác.
- Có thể bật nhiều luật bổ sung cùng lúc.

Vài ý tưởng đã nghĩ ra (mỗi luật khi thiết kế thật sẽ nói rõ chi tiết hơn, đây chỉ là danh sách nháp, chưa chốt):

- Tăng khoảng cách mặc định giữa 2 người chơi (vd từ 1 lên 2)
- Yêu cầu phải có trang bị súng mới được đánh Bang! (bỏ súng ngầm định)
- Cho phép đánh Bang! nhiều lần trong 1 lượt, nhưng không được dùng 2 lá trùng tên
- Cho phép dùng nhiều lá trùng tên trong 1 lượt
- Cho phép dùng Beer kể cả khi chỉ còn 2 người sống (bỏ ngoại lệ luật gốc)
- Cho phép gộp 2 lá Beer để hồi máu cho 1 người chơi khác (thay vì chỉ hồi cho chính mình)

### Biến thể theo số người chơi (2 / 3 / 8) — ngoài phạm vi 4–7 người mặc định

Cũng là ý tưởng nháp cho 5.3, chưa thiết kế chi tiết:

- **2 người:** không chia vai. Giết người kia là thắng.
- **3 người:** chia ngẫu nhiên 3 vai **cảnh sát / tội phạm / kẻ phản bội**, mục tiêu xếp vòng tròn:
  cảnh sát → giết tội phạm, tội phạm → giết kẻ phản bội, kẻ phản bội → giết cảnh sát.
  Ai giết đúng mục tiêu của mình thì thắng ngay lập tức.
  Nếu mục tiêu chết nhưng **không phải do đúng người săn nó giết** (vd giết nhầm, chết vì Dynamite...),
  ván quay về luật 2 người ở trên với 2 người còn sống — ai sống đến cuối thì thắng.
  > Chưa rõ cách engine xác định "ai là người giết" (ai đánh lá khiến máu về 0) — cần làm rõ khi thiết kế 5.3.
- **8 người:** giống 7 người mặc định, cộng thêm 1 kẻ phản bội (renegade) nữa.

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

Đừng hứa với bạn bè một ngày cụ thể.
