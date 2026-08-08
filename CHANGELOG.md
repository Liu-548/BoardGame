# Lịch sử chi tiết từng đợt làm việc (BoardGame)

> Tách ra từ `CLAUDE.md` (2026-08-05, theo đề xuất `claude doctor`) để giảm dung lượng
> luôn tải vào ngữ cảnh mỗi phiên làm việc — nội dung giữ NGUYÊN VẸN, không cắt/tóm tắt gì.
> Đọc file này khi cần biết CHI TIẾT một đợt/quyết định cụ thể đã làm trước đó.
> `CLAUDE.md` vẫn giữ nguyên phần luật/quy tắc luôn cần và dòng "Đang ở:" tóm tắt hiện trạng.

---

- 3.1-3.4 (gọn lại): `src/server/index.ts` + `src/server/room.ts` (Durable Object `Room`) — deploy thật ở **https://bang-boardgame.nguyenngoctuan548.workers.dev**. WebSocket dùng Hibernation API đúng cách (`ctx.acceptWebSocket()`, không `server.accept()` — quy tắc 7). Định tuyến `/room/<mã phòng>`.
- **Quan trọng (phát hiện sau việc 3.10):** deploy trước đó CHỈ đưa lên phần server (Worker) — mở link công khai chỉ thấy dòng "Thiếu mã phòng...", KHÔNG thấy giao diện chơi, vì client (`index.html`/`main.ts`/`ui.ts`) chưa từng được build+phục vụ. Đã sửa: `wrangler.jsonc` thêm `assets: { directory: "./dist", run_worker_first: ["/room/*"] }` — phục vụ file client đã build (`npm run build`, ra `dist/`) CHUNG domain với Worker; `/room/*` vẫn luôn chạy Worker trước (API/WebSocket), còn lại phục vụ thẳng file tĩnh. `npm run deploy` giờ tự `vite build` trước khi `wrangler deploy` (script trong `package.json`), tránh quên build. Đã deploy lại + kiểm bằng trình duyệt thật trên chính link công khai: mở `/` thấy đúng giao diện, tạo phòng qua `wss://` thật hoạt động đúng.
- 3.5 + bonus: `src/protocol.ts` (**mới, lệch cấu trúc gốc**) định nghĩa `ClientMessage`/`ServerMessage`. Chat công khai/riêng tư hoạt động thật.
- 3.6: `core/view.ts` — `viewFor()` ẩn bài tay + vai trò người khác (trừ chính mình/Sheriff/người đã chết).
- 3.7: `room.ts` lưu `GameState` thật vào `ctx.storage`. `{type:"action"}` xử lý thật qua `reduce()`.
- 3.8: `src/client/net.ts` — `RoomConnection` tự động kết nối lại sau khi mất kết nối, tự `join` lại, tự nhận lại đúng ván nhờ state đã lưu ở 3.7.
- 3.9: Lobby thật (tạo phòng / vào phòng bằng mã 6 ký tự) — `protocol.ts` có `{type:"lobby", players}`, `room.ts` tự lấy danh sách người đang kết nối qua `ctx.getWebSockets()`, `main.ts`/`ui.ts` có màn hình chọn chế độ + form lobby.
- **3.10 (mới)**: bàn chơi qua mạng giờ TƯƠNG TÁC THẬT — `ui.ts` có `renderNetworkGame()` (thay hẳn `renderNetworkGameReadOnly()` tạm bợ của 3.9), gần như song song với `renderApp()` (hotseat) nhưng có 2 khác biệt cố ý: (1) đọc `PlayerView` (bài người khác `null`+`handCount`) thay vì `GameState` đầy đủ; (2) CHỈ chính người xem (`view.viewerId`) được bấm bài của mình, người khác luôn chỉ xem — khác hotseat (ai cũng bấm được vì tin tưởng cùng ngồi 1 máy). Panic!/Cat Balou dùng `handCount` (luôn đúng) thay vì `hand.length` (ẩn với người khác) để quyết định có cần hỏi thêm bước hay không. `main.ts` có `networkDispatch()` gửi action qua `net.ts` rồi CHỜ phản hồi bất đồng bộ (`state` hoặc `action_error`) thay vì biết kết quả ngay như hotseat.
- Đã tự kiểm bằng 4 tab trình duyệt thật (An/Bình/Chi/Dũng, qua `net.ts` thật, không giả lập gì): tạo phòng bằng mã 6 ký tự, cả 4 vào cùng phòng, bắt đầu ván, rồi chơi thật several lượt — rút bài, đánh Bang! có chọn mục tiêu qua mạng (pending hiện đúng ở TẤT CẢ các tab), người bị nhắm chịu mất máu (hp giảm đúng), bỏ bài thừa cuối lượt, chuyển lượt đúng người kế tiếp, tự trang bị súng — tất cả qua các tab RIÊNG BIỆT, mỗi tab luôn chỉ thấy đúng bài/vai trò của chính mình. Không lỗi console/server.
- **Chủ dự án đã tự chơi thật với bạn bè** (nhiều nơi khác nhau, qua link deploy công khai) — kết nối thành công, xác nhận đúng nghĩa "Xong khi nào" gốc của việc 3.10.
- **2 việc bổ sung sau khi chơi thử thật** (phát sinh từ phản hồi thực tế, không nằm trong LO-TRINH.md gốc):
  - **Công khai lá bài khi draw!** (Barrel/Jail/Dynamite...): `ui.ts` giờ hiện mặt lá trên cùng chồng bỏ (`cardFaceLabel()`, kèm chất/số) trong dòng tóm tắt, cộng thêm 1 dòng thông báo tạm thời "`<Tên>` vừa lật bài kiểm tra: `<lá>` — KHỚP/không khớp" lấy từ event `DRAW_CHECK_RESOLVED` (event này server vốn đã gửi cho CẢ phòng, chỉ là client trước giờ bỏ qua). Không đổi gì trong `core/`.
  - **Chỉ chủ phòng được bắt đầu ván**: `room.ts` thêm khái niệm chủ phòng (người đầu tiên join vào phòng trống, nhớ theo `playerId` trong `ctx.storage` khoá `"ownerId"`, sống sót qua reconnect). `handleStartGame` kiểm tra đúng người mới cho qua; `protocol.ts`'s `{type:"lobby"}` thêm field `ownerId`; lobby UI chỉ hiện nút "Bắt đầu ván" cho đúng chủ phòng. Chủ phòng mất kết nối thì tự chuyển quyền cho người đang có mặt kế tiếp (chuyển NGAY khi mất socket, không có thời gian chờ — nếu chủ phòng chỉ mất mạng chớp nhoáng lúc còn người khác trong phòng, quyền đổi chủ ngay, không tự trả lại khi họ nối lại; làm đúng "chỉ chuyển khi rời hẳn" cần `ctx.storage.setAlarm()`, để sau nếu thực tế thấy phiền). "Phòng tự đóng khi hết người" thì KHÔNG cần code gì — đã tự nhiên đúng nhờ Durable Object tự ngủ khi hết socket, dữ liệu ván vẫn còn nguyên trong storage để không phá tính năng reconnect (3.8).
  - Đã tự kiểm lại bằng 4 tab trình duyệt thật trên chính link deploy: đúng người tạo phòng mới thấy nút bắt đầu; thử giả mạo gửi thẳng `start_game` qua WebSocket với vai người khác thì server từ chối đúng lỗi; đánh Nhà tù thật, lật bài kiểm tra thật ra "Bang! (Cơ 9) — KHỚP" và dòng này hiện giống hệt trên CẢ 4 tab. Không lỗi console.
  - Đã deploy live: **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

162 test đều pass (không đổi core/ ở 2 việc bổ sung trên nên không cần thêm test).

**Giai đoạn 4 — việc 4.1 (đồng hồ đếm ngược lượt):**

- **Chỉ áp dụng khi chơi qua mạng** — dùng `ctx.storage.setAlarm()` ở `room.ts` (KHÔNG `setInterval` trong Durable Object — quy tắc 8). Hotseat giữ nguyên không giới hạn giờ. Không đụng gì `core/` — hạn chót phụ thuộc `Date.now()` (thời gian thực), mà quy tắc 2 cấm điều đó trong `core/`, nên sống ở `protocol.ts` (`DeadlineInfo`, field mới trong `{type:"state"}`) + `room.ts`, không phải trong `GameState`.
- Rút bài đầu lượt và "lật bài kiểm tra" (draw! — Barrel/Jail/Dynamite) giờ **hoàn toàn tự động**, server tự làm ngay, không cần bấm nút, không cần đồng hồ (không phải quyết định thật).
- Lượt đánh bài: **60 giây**. Nếu đánh 1 lá khiến người khác phải phản hồi (đỡ Missed!/Đấu tay đôi/Người da đỏ), đồng hồ 60s này **tạm dừng** (giữ nguyên số giây còn lại, lưu ở khoá storage `"pausedPlay"`), chờ xong quay lại tiếp tục đếm — KHÔNG cấp lại nguyên 60s mới.
- Người khác phải phản hồi (đỡ Missed!/Đấu tay đôi/Người da đỏ/Cat Balou bắt bỏ bài/chọn bài Cửa hàng tổng hợp...): **10 giây** mỗi lần.
- Bỏ bài thừa cuối lượt (chỉ khi cần): **15 giây**.
- Hết giờ tự làm thay: lượt đánh → tự kết thúc lượt (không tự đánh gì); bỏ bài thừa → tự bỏ ngẫu nhiên đủ số; phản hồi có lựa chọn "không làm gì" (Missed!/Đấu tay đôi/Người da đỏ) → tự chịu hậu quả; phản hồi bắt buộc chọn đúng 1 lá (Cat Balou/Cửa hàng tổng hợp) → tự chọn lá đầu tiên hợp lệ.
- `room.ts` có 1 chỗ DUY NHẤT xử lý mọi thay đổi state (`afterStateChange()`) — action thật của người chơi, `start_game`, HAY hành động tự động lúc hết giờ ở `alarm()` đều đi qua đây, để không bao giờ quên lên lịch lại đồng hồ.
- Client (`main.ts`) tự đếm lùi mỗi giây bằng `setInterval` CỦA RIÊNG TRÌNH DUYỆT (không phải Durable Object — không vi phạm quy tắc 8, quy tắc đó chỉ cấm trong Durable Object) để vẽ lại số giây còn lại, hiện dòng "⏱ Còn Xs — ai đang làm gì" (`ui.ts`).
- Bonus nhỏ đi kèm: đổi nhãn vai "Ngoài vòng pháp luật" thành "Tội phạm" (`ROLE_LABELS`/`WINNER_LABELS` trong `ui.ts`) cho rõ nghĩa hơn.
- Đã tự kiểm bằng `wrangler dev` cục bộ + 4 tab trình duyệt thật: rút bài/lật bài kiểm tra tự động ngay khi vào lượt, đồng hồ tạm dừng đúng lúc Bình cần đỡ Bang! rồi tiếp tục đúng số giây cho An sau khi Bình phản hồi, hết giờ tự động làm đúng ở cả 3 loại đồng hồ (kể cả qua NHIỀU vòng hết giờ thật liên tiếp — phản hồi hết giờ → lượt đánh cũng hết giờ luôn → bỏ bài thừa hết giờ → chuyển đúng người kế tiếp), không lỗi console/server trong suốt quá trình. Hotseat kiểm lại vẫn y nguyên, không tự động gì.
- Đã deploy live: **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

162 test đều pass (không đổi `core/` ở việc 4.1 nên không cần thêm test).

**Giai đoạn 4 — việc 4.2 (nhật ký ván đấu hiện trên màn hình):**

- Không đụng gì `core/` — `GameEvent` (kết quả phụ của `reduce()`, xem `types.ts`) đã sẵn có đủ thông tin cho mọi việc từng xảy ra trong ván, chỉ cần client dịch ra chữ và hiện lên.
- `ui.ts` có `describeEvent(event, nameOf)` — dịch 1 `GameEvent` thành 1 dòng tiếng Việt (vd "Bình đánh Bang! nhắm vào An", "An mất 1 máu"), và `renderLog()` vẽ danh sách các dòng đó thành 1 khung cuộn riêng ở cuối màn hình chơi (cả hotseat `renderApp()` lẫn qua mạng `renderNetworkGame()`).
- `main.ts` giữ 2 mảng tách riêng theo đúng kiểu tách hotseat/mạng đã có sẵn: `gameLog` (hotseat, đắp thêm dòng mới sau MỖI `dispatch()` thành công) và `networkGameLog` (mạng, đắp thêm dòng mới mỗi khi nhận `{type:"state"}` từ server, dùng đúng `message.events` server đã gửi kèm — không cần thêm gì ở `protocol.ts`/`room.ts`). Dòng mới nhất chèn vào ĐẦU mảng (mới nhất lên trên cùng), không cần tự cuộn xuống cuối. Reset về rỗng khi bắt đầu ván mới (`onStartGame` cho hotseat, `onJoinRoom` cho mạng).
- Đã tự kiểm bằng `vite dev` + trình duyệt thật: rút bài, đánh Bang! có mục tiêu, chịu mất máu — cả 3 hành động đều hiện đúng dòng log tương ứng, đúng thứ tự mới nhất lên trên.

162 test đều pass (không đổi `core/` ở việc 4.2 nên không cần thêm test).

**Việc nhỏ bổ sung (trước 4.3): tầm bắn súng + hiệu ứng khoảng cách trong nhãn lá bài** — `ui.ts`'s `CARD_LABELS` giờ hiện kèm số ngay sau tên: `Súng Volcanic (1)`, `Súng Schofield (2)`... (lấy THẲNG từ `WEAPON_RANGES` export sẵn ở `core/cards.ts` — cùng nguồn `core/distance.ts` dùng để tính luật thật, không tự chép số ra tránh lệch), và `Ống nhắm (-1)`/`Ngựa Mustang (+1)` (2 lá xanh duy nhất đổi khoảng cách — số này HARDCODE vì bản thân `core/distance.ts` cũng viết cứng, không có hằng số export sẵn; chỉ ảnh hưởng hiển thị, không đụng luật thật).

**Giai đoạn 4 — việc 4.3 (xử lý người bỏ ván giữa chừng):**

- **Bối cảnh quan trọng phát hiện lúc làm:** cơ chế đồng hồ ở việc 4.1 (hết giờ tự kết thúc lượt/tự bỏ bài/tự chịu hậu quả) ĐÃ khiến ván không bao giờ treo về mặt kỹ thuật — hết giờ tự xử lý dù người đó có mất kết nối hay không. Bàn với chủ dự án, chốt phạm vi việc 4.3 còn lại là 2 việc: (1) hiện rõ ai đang mất kết nối, (2) tự huỷ ván nếu còn quá ít người kết nối — không cần thêm gì về mặt "chống treo" nữa, nó đã đúng từ 4.1.
- **Hiện ai đang mất kết nối:** `protocol.ts`'s `{type:"state"}` thêm field `connectedPlayerIds: string[]` (giống `DeadlineInfo` — sống ở "ngôn ngữ chung" protocol.ts, KHÔNG phải `GameState`/`PlayerView`, vì đây là khái niệm mạng, `core/` không biết gì tới). `room.ts` tính bằng cách so `state.players` với `ctx.getWebSockets()` đang mở (`connectedPlayerIdsInGame()`). `ui.ts`'s `networkRenderPlayer()` hiện thêm "⚠ đã mất kết nối" cạnh tên nếu không nằm trong danh sách đó (bỏ qua chính mình — hiển nhiên luôn kết nối). Cập nhật ở CẢ 2 chỗ: mỗi lần state đổi (như mọi khi) VÀ **ngay lúc `webSocketClose()`** (thêm mới) — nếu không, người còn lại phải chờ tới hành động kế tiếp mới thấy ai vừa rời, sai với ý "hiện rõ NGAY".
- **Tự huỷ ván khi còn ≤1 người kết nối:** `webSocketClose()` đếm số người CỦA VÁN ĐANG CHƠI còn kết nối (loại trừ đúng socket vừa đóng); nếu ≤1, gọi `abandonGame()` — xoá `GameState`/đồng hồ/alarm khỏi storage (KHÔNG đụng `winner` — đây là "huỷ", khác "kết thúc đúng luật" nên không thể đi qua `reduce()`), gửi `{type:"game_abandoned"}` (thêm mới trong `protocol.ts`) cho người còn lại. Phòng quay lại đúng trạng thái lobby, `handleStartGame()` lại nhận ván mới khi đủ người quay lại.
- **Lỗi phát hiện lúc tự kiểm (đã sửa):** `abandonGame()` lúc đầu lặp `ctx.getWebSockets()` gọi `send()` mà QUÊN loại trừ socket VỪA đóng (dù đã `ws.close()`) — `send()` trên socket đã đóng ném lỗi `TypeError`, làm HỎNG NGANG vòng lặp, khiến người còn lại (đáng lẽ phải nhận `game_abandoned`) không nhận được gì, kẹt màn hình ván cũ (đồng hồ đứng ở 0s). Sửa bằng cách truyền tường minh socket cần loại trừ vào `abandonGame(excludeSocket)`, không dựa vào try/catch (dễ nuốt lỗi thật khác).
- Đã tự kiểm bằng `wrangler dev` cục bộ + 4 tab trình duyệt thật: đóng lần lượt từng tab giữa ván — còn 2/4 người kết nối thì CHỈ hiện chú thích "đã mất kết nối" (không huỷ), còn 1/4 thì tự huỷ NGAY, người cuối cùng tự động thấy dòng thông báo và quay lại đúng màn hình lobby, không lỗi console. Cũng bắt được lỗi `send()` sau `close()` ở trên nhờ chính bước tự kiểm này (log server báo `Uncaught TypeError`) — sửa xong kiểm lại sạch lỗi.
- Đã deploy live: **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

162 test đều pass (không đổi `core/` ở việc 4.3 nên không cần thêm test).

**Giai đoạn 4 — việc 4.4 (giao diện dễ nhìn hơn, responsive):**

- Việc thuần CSS/HTML (`public/style.css`) — không đụng `core/`, không đổi `ui.ts`/logic gì.
- `*, *::before, *::after { box-sizing: border-box }` — reset chuẩn, để padding/border của input/button KHÔNG cộng dồn ra ngoài width khai báo (nguyên nhân phổ biến nhất gây tràn ngang trên điện thoại mà khó nhìn ra).
- Thêm style chung cho `input[type="text"]` (trước đây CHỈ ô nhập tên hotseat có style qua `.setup-list input`, ô nhập tên/mã phòng ở màn hình chơi qua mạng hoàn toàn không có class, hiện thị mặc định của trình duyệt — giờ đồng bộ, full-width, có padding).
- Thêm `@media (max-width: 480px)`: thu gọn margin/padding `body`, giảm cỡ chữ `h1/h2/h3` (đỡ chiếm chỗ trên màn hình nhỏ), tăng vùng bấm `button`/`.cards button` (~44px cao, khuyến nghị chung cho ngón tay), và mỗi `.player` chiếm trọn 1 hàng thay vì chen 2 cột chật (14rem × 2 gần khít 480px, dễ lệch dòng nếu vẫn để tự do).
- **Giới hạn lúc tự kiểm:** cửa sổ Chrome trong môi trường này có bề rộng tối thiểu ~500px (do `resize_window` không hạ được xuống dưới, có vẻ là giới hạn của chính Chrome/hệ điều hành, không phải lỗi code) — không dựng được đúng khung hình điện thoại thật (~375px) để bấm thử. Đã kiểm 2 cách thay thế: (1) ở 502px (băng qua ngưỡng 480px) xác nhận layout gốc không tràn ngang (`scrollWidth === clientWidth`) trên cả 4 màn hình (chọn cách chơi, thiết lập hotseat, đang chơi, lobby mạng); (2) tạm chèn 1 `<style>` ép TOÀN BỘ giá trị trong khối `@media` có hiệu lực bất kể bề rộng thật, chụp lại — xác nhận `.player` xếp đúng 1 cột/hàng, nút to hơn rõ rệt, không vỡ layout — rồi gỡ `<style>` tạm đó đi. **Chưa bấm thử bằng điện thoại thật** — nên làm thêm khi có dịp, đặc biệt kiểm lại vùng bấm bài (`.cards button`) có đủ to để bấm chính xác không.
- Đã deploy live: **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

162 test đều pass (không đổi `core/` ở việc 4.4 nên không cần thêm test).

**Giai đoạn 4 — việc 4.5 (kiểm tra hạn mức Cloudflare):**

- Việc XEM DASHBOARD thuần — không có gì để code/commit/deploy (không sửa file nào trong repo trừ cập nhật trạng thái này).
- Vào **dash.cloudflare.com → Durable Objects → `bang-boardgame_Room` → Metrics**, kiểm tra đúng chỉ số quy tắc 7 CLAUDE.md lo ngại (Hibernation API dùng đúng thì duration phải GẦN 0, không phải chạy suốt 24h):
  - **Billable duration: 1.23 GB-sec** — cả ở khung "Last 24 hours" LẪN "Last 30 days" (2 số giống hệt nhau, nghĩa là TOÀN BỘ lịch sử dùng thử của namespace này gói gọn trong hôm nay) — so với hạn mức miễn phí **13.000 GB-sec/ngày**, tức mới dùng ~0,01% hạn mức. Xác nhận `ctx.acceptWebSocket()` (không `ws.accept()`) đang hoạt động đúng như thiết kế — phòng KHÔNG bị tính duration suốt lúc kết nối mở, chỉ tính lúc DO thật sự thức xử lý.
  - Đối chiếu thêm: mục "WebSocket messages" ghi `Inbound, hibernatable: 185` và `Inbound, non-hibernatable: 0` — xác nhận 100% tin nhắn đi qua đúng đường hibernate, không có kết nối nào lỡ dùng `ws.accept()`.
  - 212 requests / 18 "Errors" trong 24h qua — đào sâu thấy `Errors by invocation status` ghi toàn bộ 18 lỗi là **"Client disconnected"** — đây là cách Cloudflare phân loại lúc 1 kết nối WebSocket đóng lại (đóng tab, mất mạng, chuyển màn hình...), KHÔNG phải lỗi code — khớp đúng số lần chủ dự án tự đóng/mở tab lúc chơi thử với bạn bè trước đó. Không có lỗi "Exceeded CPU limits" hay loại lỗi thật nào khác.
  - Storage: 86.02 kB (SQLite, theo `ctx.storage`) — không đáng kể.
- **Kết luận:** hạn mức Cloudflare hoàn toàn an toàn ở quy mô hiện tại (vài người bạn chơi thử). Không cần đổi gì trong code.

162 test đều pass (không đổi `core/` ở việc 4.5 nên không cần thêm test — bản thân việc này cũng không đổi code gì).

**Giai đoạn 4 — việc 4.6 (hình ảnh lá bài) — KHUNG CƠ BẢN, chưa có ảnh thật:**

- Bàn với chủ dự án trước khi làm: cần vẽ RIÊNG minh hoạ từng TÊN lá (22 tên, không phải nguyên lá bài — không vẽ khung/chữ tên/số-chất, những thứ đó đã có sẵn bằng HTML/CSS) — chốt hiện mô tả chức năng ở CẢ 2 chỗ: tooltip (rê chuột/giữ lâu) lúc đang chơi + màn hình "Chú giải lá bài" riêng xem được bất cứ lúc nào. (Quyết định ban đầu "tên lá ĐÈ LÊN ảnh" ở đây đã bị **đổi lại** ngay sau đó — xem việc bổ sung bên dưới, tên giờ nằm RIÊNG bên dưới ảnh.)
- `public/sprites/<tên lá>.png` — quy ước đường dẫn (README.md ngay trong thư mục đó liệt kê đủ 22 tên file cần). `cardImageUrl()` (`ui.ts`) ghép sẵn, CHƯA có file ảnh nào — `<img>` bắn sự kiện `error` thì tự ẩn, quay về hiện đúng y hệt giao diện chữ suông như trước việc 4.6 (đúng yêu cầu gốc LO-TRINH.md: "thiếu ảnh vẫn hiển thị bằng chữ").
- Component dùng chung `.card-box` (`appendCardVisual()`/`cardButton()`/`cardChip()` trong `ui.ts`) thay hẳn kiểu nút/span chữ suông cũ — dùng ở MỌI nơi hiện 1 lá cụ thể: bài trên tay, trang bị trên sân, tuỳ chọn Cửa hàng tổng hợp (cả hotseat lẫn qua mạng). Trạng thái "đang cầm lên chờ chọn mục tiêu" → viền xanh (`card-box--armed`); "đã tick chọn để bỏ bài thừa" → viền xanh + dấu ✓ góc (`card-box--checked`); "không bấm được" → mờ đi (`card-box--inert`).
- `CARD_DESCRIPTIONS` (`ui.ts`) — mô tả ngắn cho đủ 22 lá, soạn theo ĐÚNG luật đã cài trong `reduce.ts` (đọc kỹ lại toàn bộ file trước khi viết, không chép luật gốc BANG! từ trí nhớ) — vài chỗ bản này CỐ Ý lệch luật gốc, mô tả phải khớp đúng cái đang chạy: Cat Balou không giới hạn khoảng cách (luật gốc có). Beer **ĐÃ SỬA** — ngoại lệ "vô tác dụng khi chỉ còn 2 người sống" + cơ chế "hồi sinh tự động khi máu về 0" (xem mục riêng bên dưới, làm SAU việc chọn nhân vật).
- Màn hình mới **"Chú giải lá bài"** (`renderCardReferenceScreen()`) — vào được từ home, liệt kê đủ 22 lá (khung to hơn, kèm mô tả đầy đủ ngay dưới ảnh, không cần hover) chia 2 nhóm nâu/xanh đúng thứ tự khai báo ở `core/cards.ts`. Không gắn với ván nào, không cần đăng nhập/vào phòng.
- Không đụng `core/` — mọi thứ ở `ui.ts`/`main.ts`/CSS/`public/sprites/`.
- Đã tự kiểm bằng `vite dev` + trình duyệt thật: màn hình Chú giải hiện đủ 22 lá đúng mô tả; trong ván thật (hotseat) — bài trên tay/trang bị hiện đúng khung ảnh (rỗng, xám — đúng vì chưa có ảnh) + tên đè lên; bấm 1 lá cần mục tiêu (Bang!) thấy đúng viền xanh "đang cầm lên"; bài người khác (không tới lượt) mờ đi đúng như thiết kế. Không lỗi console.
- **Việc TIẾP THEO thật sự (ngoài lộ trình, do chủ dự án tự làm)**: tự vẽ/tìm 22 ảnh PNG bỏ vào `public/sprites/` theo đúng tên file trong README.md ở đó — bỏ được bao nhiêu, hiện bấy nhiêu, không cần làm hết 1 lần.
- Đã deploy live: **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

162 test đều pass (không đổi `core/` ở việc 4.6 nên không cần thêm test).

**Việc bổ sung sau 4.6 (theo yêu cầu thêm của chủ dự án):**

- **Viền màu theo loại lá**: nâu (`card-box--brown`) cho lá nâu, xanh dương (`card-box--blue`) cho lá trang bị, xanh lá (`card-box--character`) dành riêng cho khung nhân vật (xem mục dưới). Khai báo 3 class này TRƯỚC `--armed`/`--checked` trong CSS để trạng thái "đang chọn" (viền xanh lá cây accent `#2a7`, khác 3 màu loại lá) luôn thắng khi cả 2 cùng áp dụng.
- **Tên lá tách khỏi ảnh**: đổi hẳn cấu trúc `.card-box` — ảnh nằm trong `.card-box__image-wrap` riêng, tên nằm ở `.card-box__name` NGAY BÊN DƯỚI (flow bình thường, không `position:absolute` đè lên ảnh nữa như quyết định ban đầu của việc 4.6).
- **Khung nhân vật xem trước**: `renderCharacterPreviewSection()` trong `ui.ts` — thêm mục ví dụ (viền xanh lá) ở cuối màn hình "Chú giải lá bài", để sau này Giai đoạn 5 (16 nhân vật, xem `LO-TRINH.md`) cắm dữ liệu thật vào là dùng được ngay khung này — **CHƯA có nhân vật thật nào** (đúng quy tắc "Chưa làm tới, đừng đụng vào: Nhân vật"), chỉ demo cho biết khung trông ra sao. Tên nhân vật (vd sau này "Willy the Kid") là khái niệm KHÁC với tên hiển thị người chơi tự gõ lúc vào phòng (An, Bình...).
  - **Sửa lại ngay sau đó (hiểu lầm ban đầu):** bản đầu chỉ làm 1 ô — SAI so với luật gốc. Đúng luật: mỗi người chơi được PHÁT 2 LÁ NHÂN VẬT úp, tự xem rồi CHỌN GIỮ 1 lá làm nhân vật thật, bỏ lá còn lại. Đã sửa thành **2 ô cạnh nhau** ("Nhân vật A/B (ví dụ)") kèm 1 dòng chữ giải thích đúng luật "phát 2 chọn 1" ngay phía trên — vẫn chỉ là khung xem trước, chưa có dữ liệu/cơ chế chọn thật (đó là việc của 5.2).
- **Nhấn giữ/hover xem mô tả chức năng**: máy tính dùng thẳng thuộc tính `title` có sẵn (trình duyệt tự hiện khi rê chuột, không cần code thêm); thiết bị cảm ứng không có "rê chuột" nên tự bắt sự kiện `touchstart`/`touchend`/`touchmove` (hàm `attachDescriptionReveal()` trong `ui.ts`) — giữ đủ 500ms hiện 1 popup nhỏ cạnh lá (`.card-description-popup`, CSS `position:fixed`), nhả tay hoặc trượt ngón tay thì tắt. `touchend` gọi `event.preventDefault()` để CHẶN sự kiện "click" giả lập trình duyệt tự sinh sau đó — không chặn thì nhả tay sau khi xem mô tả xong sẽ vô tình bấm luôn lá (đánh bài/tick chọn bỏ...).
- Đã tự kiểm bằng `vite dev` + trình duyệt thật: viền nâu/xanh dương hiện đúng theo loại lá ở cả màn hình Chú giải lẫn trong ván; khung nhân vật xem trước hiện đúng viền xanh lá; tên lá giờ nằm tách hẳn dưới ảnh, không đè lên nữa; `title` gắn đúng mô tả (kiểm qua JS, không chỉ nhìn — tooltip gốc trình duyệt khó chụp màn hình); giả lập sự kiện `touchstart` xác nhận popup nhấn-giữ hiện đúng nội dung mô tả sau ~500ms, chụp màn hình thấy rõ popup. Không lỗi console.
- Không đụng `core/` — mọi thứ ở `ui.ts`/CSS.
- Đã deploy live: **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

162 test đều pass (không đụng `core/` nên không cần thêm test).

**Giai đoạn 5 — việc 5.1 (hệ thống hook cho nhân vật):**

- Chủ dự án viết sẵn **`NHAN-VAT-BANG-CO-BAN.txt`** (đặc tả đủ 16 nhân vật + 9 loại hook: `onLoseLife`, `onLoseLifeFromCard`, `onDrawPhase`, `onDrawCheck`, `modifyDistance`, `onOutgoingBang`, `onHandEmpty`, `onAnyDeath`, `cardAlias`, `activatedAbility`) — đọc kỹ TRƯỚC khi code, bàn cách tiếp cận, chờ đồng ý (đúng quy tắc core/ trong file này).
- **Phát hiện lúc đọc — lỗ hổng luật riêng, sửa TRƯỚC 5.1 (không phải hook):** luật gốc "chỉ 1 Bang!/lượt, trừ khi cầm Volcanic" mà file nhân vật coi là nền tảng (Willy the Kid/Calamity Janet dựa vào nó) **chưa từng được cài** từ Giai đoạn 1 — `playBang()` không đếm/giới hạn gì cả, kể cả bản đã deploy cho bạn bè chơi. Đã sửa: `GameState` thêm `bangUsedThisTurn: boolean`, `playBang()` chặn lá Bang! thứ 2 trong lượt nếu không cầm Volcanic, `advanceTurn()` reset lại mỗi lượt mới. 4 test mới (`test/pending.test.ts`).
- **Vì sao nhân vật không nằm trong GameState:** quy tắc 3 — state phải là JSON thuần, không được chứa hàm. `PlayerState` chỉ thêm `characterId: string | null` (1 chuỗi, luôn `null` cho tới việc 5.2) — hàm hook thật nằm ở registry riêng, tra theo id.
- File mới **`core/characters.ts`** — `CharacterHooks` interface (chỉ 4 hook có chữ ký thật) + registry `CHARACTERS` **RỖNG** (5.2 mới điền 16 nhân vật — đúng ranh giới "hệ thống" vs "nhân vật thật" trong `LO-TRINH.md`). Hook ở đây KHÔNG "thuần" theo nghĩa không side-effect — hầu hết nhận thẳng `next: GameState` (bản sao cục bộ reduce() đang giữ) và được phép mutate trực tiếp, giống mọi hàm nội bộ khác trong `reduce.ts`. Ngoại lệ: `modifyDistance` — hàm THUẦN thực sự, vì `distance.ts` gọi nó ở nhiều chỗ chỉ để ĐỌC.
- **Chỉ nối dây 4/9 hook** — 4 hook này không cần thêm loại `PendingAction` mới hay đổi luồng action:
  - `modifyDistance` → `distance.ts`'s `computeDistance()`, ngay sau Ống nhắm/Ngựa Mustang thật (Paul Regret/Rose Doolan).
  - `onLoseLife` + `onLoseLifeFromCard` → hàm dùng chung mới `triggerLoseLifeHooks()` trong `reduce.ts`, gọi từ CẢ `applyDamage()` (Bang!/Gatling/Duel/Indians!) LẪN nhánh Thuốc nổ tự trừ máu trong `resolveDrawCheck()` — Thuốc nổ chỉ chạy `onLoseLife` (Bart Cassidy), KHÔNG chạy `onLoseLifeFromCard` (El Gringo, cần "người gây" mà Thuốc nổ không có), đúng như file nhân vật ghi rõ.
  - `onAnyDeath` → `eliminatePlayer()`, hỏi TRƯỚC khi bỏ bài người chết vào chồng bỏ, cho MỌI người còn sống có hook (không chỉ killer) — hook muốn "nhận" bài (Vulture Sam) phải tự dọn `hand`/`equipment` của người chết, dòng bỏ-vào-chồng-bỏ mặc định chỉ đẩy phần CÒN LẠI nên không mất/nhân đôi.
  - **5 hook còn lại** (`onDrawPhase`, `onDrawCheck`, `onOutgoingBang`, `cardAlias`, `activatedAbility`) CHỈ ghi tên + mô tả 1 dòng trong comment — CỐ TÌNH không đoán chữ ký hàm, để dành xây cùng lúc với đúng nhân vật cần nó ở việc 5.2 (đoán sai bây giờ tốn công sửa lại hơn chờ ví dụ thật). Riêng **Sid Ketchum** (`activatedAbility`, dùng được bất cứ lúc nào kể cả ngoài lượt/đang bị tấn công) được ghi chú rõ: không khớp mô hình lượt/pending hiện có, cần thiết kế riêng hẳn 1 luồng action mới, không phải chỉ 1 hook.
- Test mới **`test/characters.test.ts`** — cắm 1 "nhân vật giả" thẳng vào registry `CHARACTERS` thật (dọn lại ở `afterEach`) để kiểm tra đúng đường dây thật, không cần tham số/đường vòng riêng cho test: `modifyDistance` (cả vai attacker/target, cộng dồn được với Scope/Mustang thật), `onLoseLife`/`onLoseLifeFromCard` (đúng amount/byPlayerId, Thuốc nổ chỉ chạy 1 trong 2), `onAnyDeath` (hook nhận hết bài thì không bị trùng vào chồng bỏ; không có hook thì về chồng bỏ như cũ).
- **Lỗi phát hiện lúc viết test (đã sửa — TEST, không phải core/):** state test dùng `deck: []` và để vai mặc định `"outlaw"` cho người sắp chết, vô tình kích hoạt luật có sẵn "hạ Outlaw thưởng rút 3 lá" — `drawTopCard()` thấy deck rỗng liền XÁO LẠI chính chồng bỏ đang muốn kiểm tra thành deck mới, làm chồng bỏ về `[]` bất ngờ. Không phải bug ở hook — đổi vai người chết trong test thành `"renegade"` là hết.
- 175 test đều pass (162 cũ + 4 test giới hạn Bang!/lượt + 9 test hook).

**Giai đoạn 5 — việc 5.2, đợt 1 (6/16 nhân vật — nhóm dùng ngay được hook đã nối dây ở 5.1):**

- Trước khi làm, rà lại `NHAN-VAT-BANG-CO-BAN.txt` thấy khối lượng thật lớn hơn "chỉ điền registry rỗng" — 16 nhân vật độ khó rất khác nhau (có người cần cả 1 loại `PendingAction`/luồng action mới). Đã bàn với chủ dự án, chốt chia nhỏ: **đợt này chỉ 6 nhân vật KHÔNG cần thêm cơ chế gì** (Bart Cassidy, El Gringo, Paul Regret, Rose Doolan, Vulture Sam, Willy the Kid) — 10 người còn lại (Jourdonnais, Black Jack, Jesse Jones, Kit Carlson, Pedro Ramirez, Lucky Duke, Slab the Killer, Calamity Janet, Sid Ketchum, Suzy Lafayette) để dành các đợt sau.
- **CHƯA làm cơ chế "phát 2 lá nhân vật úp, chọn giữ 1"** (đúng luật gốc, xem ghi chú sửa khung xem trước ở trên) — đó là 1 việc RIÊNG. Đợt này gán `characterId` TẠM THỜI qua `RuleOptions.characterAssignments` (map playerId -> characterId) khi gọi `setupGame()`, chỉ để có nhân vật thật mà thử/test — không phải cơ chế chọn thật trong ván.
- **Tách `drawTopCard()` ra file mới `core/deck.ts`** (trước là hàm private trong `reduce.ts`) — Bart Cassidy/El Gringo cần rút bài, để nguyên trong `reduce.ts` sẽ tạo VÒNG LẶP IMPORT (`reduce.ts` đã import từ `characters.ts`). Hành vi giữ nguyên y hệt, chỉ đổi chỗ ở.
- **Sửa 1 lỗ hổng trong chính thiết kế hook của 5.1** phát hiện lúc dùng thật: `onAnyDeath` lúc đó KHÔNG nhận tham số "chính mình" (người sở hữu nhân vật) — chỉ có `next` và `deadPlayer`, khiến Vulture Sam không có cách nào biết "chuyển bài vào tay AI" ngoài tự hardcode id (dở, dễ sai). Đã thêm tham số `self: PlayerState` vào giữa: `onAnyDeath(next, self, deadPlayer)` — cập nhật cả chỗ gọi trong `eliminatePlayer()` (`reduce.ts`) lẫn test cũ ở `test/characters.test.ts`.
- `CharacterDefinition` thêm `bullets: number` (máu tối đa CHƯA cộng Sheriff) và `bypassBangLimit?: boolean` (Willy the Kid — dữ liệu tĩnh, không phải hook). `setupGame()` (`setup.ts`) dùng `bullets` của nhân vật thay `BASE_HP=4` khi có gán qua `characterAssignments`; Sheriff vẫn luôn +1 dù có nhân vật hay không; gán nhân vật không tồn tại trong registry thì báo lỗi rõ ràng thay vì âm thầm sai.
- 6 nhân vật, đúng dữ liệu từ file đặc tả:
  - **Bart Cassidy** (4 máu) — `onLoseLife`: rút đúng số lá bằng số máu mất, MỌI nguồn kể cả Thuốc nổ.
  - **El Gringo** (3 máu) — `onLoseLifeFromCard`: cướp ngẫu nhiên 1 lá tay người gây, lặp theo từng điểm máu — KHÔNG kích hoạt với Thuốc nổ.
  - **Paul Regret** (3 máu) — `modifyDistance` vai target +1 (như có sẵn Ngựa Mustang).
  - **Rose Doolan** (4 máu) — `modifyDistance` vai attacker -1 (như có sẵn Ống nhắm).
  - **Vulture Sam** (4 máu) — `onAnyDeath`: gom hết bài người chết (tay + sân, kể cả Thuốc nổ chưa nổ) về tay mình.
  - **Willy the Kid** (4 máu) — `bypassBangLimit: true`, không cần hook nào — `playBang()` (`reduce.ts`) giờ kiểm tra CẢ Volcanic LẪN field này.
- Test mới **`test/characters-basic.test.ts`** (14 test) — dùng THẲNG id thật (khác `test/characters.test.ts` dùng nhân vật giả để kiểm dây nối): `setupGame()` gán đúng máu/số lá khởi đầu theo `bullets`, Sheriff vẫn +1, báo lỗi khi gán nhân vật không tồn tại; hành vi từng người trong 6 người qua `reduce()` thật.
- **Lỗi tự phát hiện lúc viết test (đã sửa — TEST, không phải core/):** test Bart Cassidy dùng deck chỉ vừa đủ 1 lá cho draw!, để Bart rút thêm 3 lá thưởng thì deck cạn giữa chừng, `drawTopCard()` tự xáo lại chồng bỏ (phụ thuộc RNG) làm bài rút được không đoán trước được — sửa bằng cách cho deck đủ hẳn 4 lá (1 cho draw! + 3 cho Bart), không chạm nhánh xáo lại.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 189 test đều pass (175 cũ + 14 test mới).
- Không sửa `ui.ts`/`main.ts` — 6 nhân vật này CHƯA hiện được trên giao diện (chưa có màn hình chọn nhân vật, `characterAssignments` chỉ gọi được qua code/test).

189 test đều pass.

**Giai đoạn 5 — việc 5.2, đợt 2 (thêm Jourdonnais + Black Jack, 8/16 nhân vật):**

- Cả 2 vẫn KHÔNG cần `PendingAction`/luồng action mới — đúng tiêu chí chọn nhóm "làm trước" đã bàn ở đợt 1.
- **Jourdonnais** hoá ra KHÔNG cần hook riêng nào cả, chỉ cần 1 field tĩnh mới `virtualBarrel?: boolean` trên `CharacterDefinition` (cùng kiểu với `bypassBangLimit` của Willy the Kid). Sửa `pushMissedReaction()` (`reduce.ts`) để đếm SỐ NGUỒN Barrel (Barrel thật trên sân + `virtualBarrel`) rồi đẩy đúng từng ấy `NEED_DRAW_CHECK` lên trên `NEED_MISSED` — có cả 2 nguồn (Jourdonnais + Barrel thật) thì có 2 lượt draw! chờ sẵn, chỉ cần 1 lần ra Cơ ở BẤT KỲ lượt nào là né hết. Phải tổng quát hoá luôn đoạn "Barrel khớp Cơ thì tự bỏ `NEED_MISSED`" trong `resolveDrawCheck()` — cũ chỉ pop đúng 1 phần tử ngay dưới, giờ phải LẶP dọn hết các `NEED_DRAW_CHECK` nguồn Barrel còn lại (của cùng người) trước khi mới pop `NEED_MISSED`, vì giờ có thể có 2 phần tử đó chồng nhau thay vì 1.
- **Black Jack** dùng hook `onDrawPhase?(next, player): GameEvent[]` — hook MỚI, thay HẲN pha rút 2 lá mặc định trong `handleDrawCards()` (`reduce.ts`) khi nhân vật có định nghĩa nó. Rút lá 1 (úp), lá 2 công khai (event mới `BLACK_JACK_REVEALED` trong `types.ts` — tiền lệ giống `DRAW_CHECK_RESOLVED` đã công khai 1 lá vốn bị ẩn), đỏ (Cơ/Rô) thì rút thêm lá 3. Black Jack dùng được `onDrawPhase` ngay vì KHÔNG có lựa chọn nào (hoàn toàn tự động theo lá lật ra) — 3 người còn lại cần hook này (Jesse Jones/Kit Carlson/Pedro Ramirez) đều CÓ lựa chọn nên vẫn phải để dành đợt sau (cần `PendingAction` mới).
- `src/client/ui.ts`'s `describeEvent()` (dịch `GameEvent` ra tiếng Việt cho nhật ký ván đấu, việc 4.2) là hàm switch xét đủ mọi nhánh `GameEvent` — TypeScript tự báo lỗi biên dịch thiếu nhánh khi thêm `BLACK_JACK_REVEALED` vào `types.ts`, nên phải thêm đúng 1 dòng dịch ở đó (việc UI thuần, không phải core, giống các case khác đã có sẵn) mới qua được `tsc --noEmit`.
- Test mới trong **`test/characters-basic.test.ts`** (6 test): Jourdonnais — không có Barrel thật (1 lượt draw!, khớp Cơ thì né/không khớp thì vẫn phải đỡ Missed! bình thường), có thêm Barrel thật (2 lượt draw! cộng dồn, khớp ngay lượt đầu thì dọn sạch cả 2 lượt cộng `NEED_MISSED` trong 1 lần RESPOND); Black Jack — lá 2 đen (rút đúng 2), lá 2 đỏ (rút thêm lá 3), người không phải Black Jack vẫn rút 2 lá như cũ không có event lật ngửa.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 195 test đều pass (189 cũ + 6 test mới).
- Không sửa gì khác ở `ui.ts`/`main.ts` ngoài dòng dịch event bắt buộc ở trên — Jourdonnais/Black Jack cũng CHƯA hiện được trên giao diện, giống 6 người đợt 1 (chưa có màn hình chọn nhân vật).

195 test đều pass.

**Giai đoạn 5 — việc 5.2, đợt 3 (thêm Slab the Killer + Suzy Lafayette, 10/16 nhân vật):**

- Cả 2 vẫn KHÔNG cần `PendingAction`/luồng action mới — đúng tiêu chí chọn nhóm "làm trước". 6 người còn lại (Jesse Jones, Kit Carlson, Pedro Ramirez, Lucky Duke, Calamity Janet, Sid Ketchum) đều cần thật sự để dành đợt sau.
- **Slab the Killer** — cần 2 Missed! mới né trọn vẹn Bang!/Gatling do chính mình đánh ra:
  - `NEED_MISSED` (`types.ts`) thêm field tuỳ chọn `missesNeeded?: number` — không có nghĩa là mặc định 1 y hệt trước Giai đoạn 5, KHÔNG phá bất kỳ test cũ nào đang so khớp chính xác shape này.
  - Hook mới `onOutgoingBang?(): number` (`characters.ts`) — Slab trả về 2. `pushMissedReaction()` (`reduce.ts`) tra hook này qua NHÂN VẬT CỦA NGƯỜI ĐÁNH (không phải người bị nhắm) để gắn `missesNeeded`.
  - Tách hẳn `respondToMissed()` khỏi `respondDiscardOrDamage()` dùng chung cũ (giờ chỉ còn phục vụ `NEED_DISCARD_BANG`/Indians!) — bỏ đúng 1 Missed! mà còn thiếu thì đẩy lại `NEED_MISSED` với số còn lại giảm 1, CHỜ TIẾP; đủ (hoặc mặc định 1) thì mới thực sự né. Chọn chịu máu luôn kết thúc ngay, mất đúng 1 máu như bình thường, không liên quan `missesNeeded`.
  - **Sửa lại cách hiểu Barrel/Jourdonnais khi có Slab (phát hiện lúc bàn với chủ dự án, SAU khi đã đề xuất "khớp Cơ thì né hết" ban đầu — SAI):** Barrel/Jourdonnais khớp Cơ **chỉ tính là 1 trong số Missed! cần**, không tự động né hết nếu `missesNeeded` > 1. `resolveDrawCheck()` giờ tìm đúng `NEED_MISSED` (không nhất thiết ngay dưới nữa — có thể còn `NEED_DRAW_CHECK` Barrel khác của cùng người chưa xử lý ở giữa), giảm `missesNeeded` đi 1: về 0 mới thật sự né trọn vẹn (dọn nốt các lượt draw! Barrel còn lại, không cần lật thêm); còn thiếu thì giữ nguyên `NEED_MISSED` (số liệu mới) chờ tiếp Barrel khác/Missed! thật.
- **Suzy Lafayette** — tay CHUYỂN từ còn bài sang hết bài (0 lá) thì rút bù ngay 1 lá:
  - Hook mới `onHandEmpty?(next, player): GameEvent[]` + helper `triggerHandEmptyHook()` (cả hai ở `characters.ts`, export helper để `reduce.ts` gọi mà không tạo vòng lặp import). Helper tự đảm bảo chỉ gọi hook đúng 1 lần ngay sau 1 lần rời tay làm tay CHUYỂN sang 0 — không tự lặp lại nếu tay đã trống sẵn từ trước (đúng lưu ý "dễ kích hoạt liên tục" trong file đặc tả).
  - Gắn ở MỌI nơi trong `reduce.ts` có 1 lá THẬT SỰ vừa rời khỏi 1 bàn tay đang có bài: `handlePlayCard` (đánh bài — refactor gom `switch` về 1 điểm return duy nhất, kiểm tra NGAY sau khi lá rời tay, TRƯỚC KHI card đó giải quyết xong hiệu ứng riêng, vì Stagecoach/Wells Fargo tự rút lại ngay sau đó có thể che mất khoảnh khắc tay về 0), `handleDiscardCards` (bỏ bài thừa cuối lượt, kể cả bỏ NHIỀU hơn bắt buộc), nhánh cướp-từ-tay của `playPanic`, nhánh "hand" của `respondToDiscardFromZone` (Cat Balou), `respondToMissed`/`respondDiscardOrDamage` (tự bỏ Missed!/Bang! khi đỡ), `respondToDuel`. Cũng gắn NGAY trong El Gringo's hook (`characters.ts`) — nếu El Gringo cướp đúng lá cuối cùng của 1 người khác vốn là Suzy, Suzy vẫn phải được rút bù (2 hook nối tiếp nhau, có test riêng).
  - **KHÔNG** gắn ở 2 chỗ hand bị xoá sạch vì chết/bị phạt (`eliminatePlayer()`/hình phạt Cảnh sát trưởng giết nhầm Phó cảnh sát trưởng) — 2 ca đó không nằm trong các tình huống file đặc tả liệt kê.
  - Ca hiếm ghi chú lại (không coi là bug): nếu lá Suzy "rút bù" lại là Dynamite, `giveCardToPlayer()` tự xuống thẳng trang bị (không vào tay) — tay Suzy có thể vẫn 0 lá sau khi "rút 1 lá", KHÔNG tự rút bù thêm lần nữa.
- Test mới trong **`test/characters-basic.test.ts`** (9 test): Slab — không Barrel (chưa đủ 2 Missed! thì vẫn đang chờ, đủ 2 thì né hết), chỉ có 1 Missed! (chịu đúng 1 máu như bình thường), Barrel+Missed! cộng dồn đủ 2, áp dụng cho cả Gatling; Suzy — đánh hết lá cuối, bỏ bài thừa cuối lượt xuống hết tay, bị Panic!/Cat Balou cướp/bắt bỏ lá cuối, và ca El Gringo cướp lá cuối của Suzy (2 hook nối tiếp).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 204 test đều pass (195 cũ + 9 test mới).
- Không sửa `ui.ts`/`main.ts` — Slab/Suzy cũng CHƯA hiện được trên giao diện, giống 8 người trước.

204 test đều pass.

**Giai đoạn 5 — việc 5.2, đợt 4 (thêm Pedro Ramirez + Lucky Duke, 12/16 nhân vật):**

- **Đổi hướng giữa chừng (quan trọng):** đề xuất BAN ĐẦU cho Pedro Ramirez là nhét lựa chọn thẳng vào action `DRAW_CARDS` (như `targetZone` của Cat Balou) — chủ dự án YÊU CẦU SỬA LẠI thành **hỏi thật** (đẩy `PendingAction`, chờ `RESPOND`), giống mọi lựa chọn khác trong ván. Đã làm lại đúng hướng này — bài học: các lựa chọn "biết trước khi hành động" (Cat Balou chọn vùng, Panic chỉ định lá trang bị) mới nên nhét vào action; lựa chọn có thể muốn CÂN NHẮC/lưỡng lự (dù không cần thêm thông tin) vẫn nên là 1 bước hỏi riêng cho nhất quán.
- **Pedro Ramirez** — đầu lượt được hỏi: lấy lá 1 từ đỉnh chồng bỏ, hay rút thẳng bộ bài?
  - `PendingAction` mới `NEED_PICK_DRAW_SOURCE { player }` (`types.ts`) — không lưu thêm dữ liệu vì đỉnh chồng bỏ vốn đã công khai (`state.discardPile`), không lộ gì ẩn.
  - `handleDrawCards()` (`reduce.ts`): nếu nhân vật có field tĩnh mới `canDrawFromDiscardPile` (`characters.ts`, kiểu như `virtualBarrel`) VÀ chồng bỏ còn bài → đẩy pending này, KHÔNG rút gì, `turnPhase` vẫn `"draw"`. Chồng bỏ rỗng thì rút thẳng bộ bài như bình thường, khỏi hỏi.
  - Hàm mới `respondToPickDrawSource()` xử lý `RESPOND`: kèm đúng `cardId` = lá trên cùng chồng bỏ → lấy lá đó làm lá 1 (sai lá thì báo lỗi rõ ràng); không kèm `cardId` → rút bộ bài như thường. Lá 2 luôn từ bộ bài. Xong mới chuyển `turnPhase` sang `"play"`.
- **Lucky Duke** — mọi lần draw! (Barrel/Jail/Dynamite...) đều lật thêm 1 lá thứ 2, chọn kết quả có lợi, cả 2 vào chồng bỏ:
  - KHÔNG phải hook có hàm riêng dù file đặc tả gọi là "hook" (`onDrawCheck`) — chỉ 1 field tĩnh mới `hasLuckyDraw` (`characters.ts`). "Có lợi" đã được CHỐT theo NGỮ CẢNH ngay trong file đặc tả (Barrel/Jail: có lợi = khớp Cơ; Dynamite: có lợi = KHÔNG khớp, tức không nổ) — không phải quyết định của người chơi nên không cần hỏi gì, logic dùng chung nằm thẳng trong `resolveDrawCheck()`.
  - `resolveDrawCheck()` (`reduce.ts`): nếu người draw! có `hasLuckyDraw`, lật thêm 1 lá; Barrel/Jail dùng "hoặc" (chỉ cần 1 lá khớp là đủ né/thoát), Dynamite dùng "và" (cả 2 phải khớp mới thật sự nổ). Event mới `LUCKY_DUKE_EXTRA_DRAW` (`types.ts`) báo lá KHÔNG được chọn làm kết quả chính, để không mất thông tin so với việc đã lật 2 lá thật.
- **Bắt buộc phải sửa thêm 3 chỗ ngoài `core/`** (không phải làm UI thật cho 2 người này — TypeScript tự báo lỗi biên dịch vì các nơi đó exhaustive-check theo `PendingAction`/`GameEvent`, giống tiền lệ `BLACK_JACK_REVEALED` ở đợt 2):
  - `src/server/room.ts`'s `buildReactiveTimeoutAction()` — thêm nhánh hết giờ cho `NEED_PICK_DRAW_SOURCE`: tự rút bộ bài (đúng "Timeout → rút cả 2 từ bộ bài" trong file luật). Không cần đổi gì về phân loại 10s/60s — pending mới này tự động rơi vào nhóm "reactive" (10s) có sẵn, dù người phải trả lời chính là người đang tới lượt.
  - `src/client/ui.ts` có ĐÚNG 2 hàm mô tả pending trùng nhau (hotseat/mạng, xem ghi chú việc 3.10) — thêm 1 dòng mô tả `NEED_PICK_DRAW_SOURCE` ở CẢ 2 hàm, cộng 1 dòng dịch `LUCKY_DUKE_EXTRA_DRAW` trong `describeEvent()`.
  - `test/bot-simulation.test.ts`'s bot ngẫu nhiên cũng exhaustive-check theo `PendingAction` — thêm 1 nhánh an toàn (rút bộ bài) cho `NEED_PICK_DRAW_SOURCE`.
- Test mới trong **`test/characters-basic.test.ts`** (6 test): Pedro Ramirez — lấy lá chồng bỏ, chọn rút bộ bài thường, chồng bỏ rỗng khỏi hỏi, gửi sai lá báo lỗi; Lucky Duke — Barrel né nhờ 1 trong 2 lá khớp Cơ, Dynamite không nổ nhờ 1 trong 2 lá an toàn.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 210 test đều pass (204 cũ + 6 test mới).

210 test đều pass.

**Giai đoạn 5 — việc 5.2, đợt 5 (thêm Jesse Jones, 13/16 nhân vật):**

- Còn 3 người (Kit Carlson, Calamity Janet, Sid Ketchum) — độ khó khác hẳn nhau, không ghép cặp được nữa, hỏi chủ dự án chọn 1 người làm trước mỗi lần từ đợt này trở đi thay vì tự ghép nhóm.
- **Luật KHÔNG RÕ RÀNG, đã dừng lại hỏi trước khi code** (đúng quy tắc CLAUDE.md): phần "Bonus" của Jesse Jones trong `NHAN-VAT-BANG-CO-BAN.txt` ("HỎI xem có cho người bị lấy tự chọn lá đưa hay rút ngẫu nhiên") là house rule của chủ dự án, không có trong luật gốc BANG!, và không rõ AI là người được hỏi. Đã chốt: **chính Jesse** được hỏi (không phải nạn nhân) — nạn nhân CHỈ được hỏi tiếp (chọn đúng lá của mình) khi Jesse chọn "để tự chọn". Hết giờ ở bước nạn nhân chọn lá → rút ngẫu nhiên thay họ (chủ dự án nhấn mạnh lại điểm này).
- **Jesse Jones** — đầu lượt được hỏi: lá 1 từ bộ bài hay từ tay 1 người khác?
  - `Action`'s `RESPOND` thêm 2 field tuỳ chọn mới: `targetId?: string` (ai bị lấy) và `letTargetChoose?: boolean` (có để họ tự chọn lá đưa không) — dùng chung khuôn với `targetCardId`/`targetZone` đã có sẵn trên `PLAY_CARD`.
  - `PendingAction` thêm 2 kind (`types.ts`): `NEED_PICK_DRAW_TARGET { player }` (Jesse tự quyết đầu lượt — không kèm `targetId` = rút bộ bài như thường/timeout; kèm `targetId` hợp lệ mà tay người đó có bài thì đọc tiếp `letTargetChoose`; tay rỗng thì coi như không có gì để lấy, rút bộ bài cho lá 1) và `NEED_GIVE_CARD_TO_PLAYER { player (nạn nhân), giveTo (Jesse) }` (CHỈ đẩy khi `letTargetChoose: true` — nạn nhân tự chọn `cardId` của chính mình để đưa, không chọn/hết giờ thì rút ngẫu nhiên thay họ).
  - Field tĩnh mới `canStealFirstDrawCard` (`characters.ts`, kiểu như `canDrawFromDiscardPile` của Pedro Ramirez).
  - 2 hàm mới trong `reduce.ts`: `respondToPickDrawTarget()` (xử lý cả 2 nhánh: cướp ngẫu nhiên ngay, HOẶC đẩy tiếp pending hỏi nạn nhân) và `respondToGiveCardToPlayer()` (nạn nhân trả lời xong mới thật sự HOÀN TẤT lượt rút — tự rút nốt lá 2 từ bộ bài cho Jesse). Có gọi `triggerHandEmptyHook()` cho nạn nhân ở CẢ 2 đường cướp bài (Suzy Lafayette).
- **Bắt buộc sửa thêm 3 chỗ ngoài `core/`** (chỉ để qua exhaustive-check của TypeScript, không phải làm UI thật — giống tiền lệ đợt 4): `room.ts`'s `buildReactiveTimeoutAction()` thêm 2 nhánh timeout (`NEED_PICK_DRAW_TARGET` → rút bộ bài; `NEED_GIVE_CARD_TO_PLAYER` → rút ngẫu nhiên); `ui.ts` thêm 1 dòng mô tả mỗi kind mới ở CẢ 2 hàm mô tả pending; `test/bot-simulation.test.ts` thêm 2 nhánh an toàn cho bot.
- Test mới trong **`test/characters-basic.test.ts`** (7 test): không chọn ai, cướp ngẫu nhiên ngay, cho nạn nhân tự chọn, nạn nhân không chọn (rút ngẫu nhiên thay), mục tiêu tay rỗng, báo lỗi tự chọn chính mình, và ca cướp đúng lá cuối của Suzy Lafayette (Suzy vẫn rút bù).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 217 test đều pass (210 cũ + 7 test mới).
- Không sửa `main.ts` — Jesse Jones cũng CHƯA hiện được trên giao diện, giống 12 người trước.

217 test đều pass.

**Giai đoạn 5 — việc 5.2, đợt 6 (thêm Kit Carlson, 14/16 nhân vật):**

- **Bàn lại 2 điểm với chủ dự án trước khi code (đúng quy tắc CLAUDE.md):**
  - "Nếu chồng bài không đủ thì xào lại bài bỏ để bốc tiếp bù vào" — hoá ra KHÔNG cần thêm gì: `drawTopCard()` (`core/deck.ts`) đã tự làm việc này từ việc 1.6, gọi 3 lần liên tiếp trong vòng lặp là tự động đủ, có test riêng xác nhận (`test/characters-basic.test.ts`).
  - Chủ dự án hỏi có muốn làm luôn UI thật cho Kit Carlson (màn hình hiện 3 lá + nút chọn bỏ) không — **chốt KHÔNG**, vẫn giữ đúng nếp cũ: chỉ `core/` + test, giống 13 người trước.
- **Kit Carlson** — xem riêng 3 lá trên cùng bộ bài, chọn giữ 2 bỏ 1:
  - `PendingAction` mới `NEED_PICK_KEPT_CARDS { player, cards: [3 lá, ĐÚNG thứ tự đã rút] }` (`types.ts`). `handleDrawCards()` (`reduce.ts`): field tĩnh mới `canPeekTopThree` (`characters.ts`) → rút 3 lá (gọi `drawTopCard()` 3 lần, tự xào chồng bỏ nếu cần), đẩy pending này, `turnPhase` vẫn `"draw"`. Không đủ 3 lá (deck + chồng bỏ CÙNG cạn — cực hiếm) → giữ hết những gì rút được, khỏi hỏi.
  - `respondToPickKeptCards()`: `RESPOND` kèm `cardId` = 1 trong 3 lá → lá đó bị bỏ, 2 lá còn lại vào tay; không kèm gì (mặc định/timeout) → bỏ đúng lá THỨ 3 (`cards[2]`), giữ 2 lá ĐẦU — **house rule, khác bản gốc BANG!** (bản gốc đặt lá thứ 3 TRỞ LẠI đỉnh bộ bài, bản này bỏ thẳng vào chồng bài bỏ, không quay lại bộ bài gốc — đúng yêu cầu của chủ dự án, đã ghi rõ trong comment để sau này không bị "sửa lại cho đúng bản gốc").
  - Event mới `KIT_CARLSON_DISCARDED` (KHÔNG tái dùng `CARDS_DISCARDED` — event đó đã gắn nghĩa "bỏ bài thừa cuối lượt" trong nhật ký ván đấu).
- **Lần ĐẦU TIÊN đụng tới `view.ts` (quy tắc 6) kể từ khi hệ thống pending ra đời** — `NEED_PICK_KEPT_CARDS` là pending DUY NHẤT chứa thông tin ẩn (3 lá vừa lật riêng, mọi kind khác trước giờ đều công khai). Thêm kiểu `PendingActionView` (giống hệt `PendingAction`, CHỈ khác đúng 1 chỗ: `cards` là `string[] | null` thay vì `string[]`, cùng quy ước với `PlayerHandView.hand`), `PlayerView.pending` đổi kiểu sang `PendingActionView[]`, `viewPendingItem()` trả `cards: null` cho bất kỳ ai KHÔNG PHẢI chính Kit Carlson. Đã rà kỹ tác động trước khi sửa: chỉ đúng 1 hàm trong `ui.ts` (mô tả pending phía MẠNG) cần đổi kiểu tham số theo, không có chỗ nào khác trong `ui.ts`/`main.ts` bị ảnh hưởng.
- **Bắt buộc sửa thêm 3 chỗ ngoài `core/`** (chỉ để qua exhaustive-check của TypeScript, không phải làm UI thật — giống các đợt trước): `room.ts`'s `buildReactiveTimeoutAction()` thêm 1 nhánh timeout (giữ 2 lá đầu, bỏ `cards[2]` — hàm này nhận `PendingAction` THẬT từ `GameState`, không phải bản đã ẩn qua `viewFor()`, nên đọc `top.cards` bình thường); `ui.ts` thêm 1 dòng mô tả pending mới ở CẢ 2 hàm + 1 dòng dịch event mới; `test/bot-simulation.test.ts` thêm 1 nhánh an toàn cho bot.
- Test mới: **`test/characters-basic.test.ts`** (5 test) — chọn 1 trong 3 để bỏ, mặc định/timeout giữ 2 lá đầu, báo lỗi khi gửi lá không thuộc 3 lá đã xem, không đủ 3 lá thì giữ hết, và xác nhận tự xào chồng bỏ khi bộ bài cạn giữa chừng. **`test/view.test.ts`** (2 test, phần quan trọng nhất đợt này) — chính Kit Carlson thấy đúng 3 lá thật; người khác thấy `cards: null`.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 224 test đều pass (217 cũ + 7 test mới).
- Không sửa `main.ts` — Kit Carlson cũng CHƯA hiện được trên giao diện (đã hỏi và chốt không làm ở đợt này), giống 13 người trước.

224 test đều pass.

**Giai đoạn 5 — việc 5.2, đợt 7 (thêm Calamity Janet + Sid Ketchum, ĐỦ 16/16 nhân vật):**

- **Calamity Janet** — Bang! và Missed! hoán đổi được cho nhau ở MỌI chỗ kiểm tra:
  - 2 hàm dùng chung mới trong `reduce.ts`: `actsAsBang(cardId, player)` / `actsAsMissed(cardId, player)` — đúng tên lá thật, HOẶC (nếu là Janet) tên lá kia. Field tĩnh mới `hasBangMissedAlias` (`characters.ts`) — KHÔNG đặt trong `CharacterHooks` dù file đặc tả gọi là "hook" (cardAlias), vì không có gì riêng để tính.
  - Sửa đúng 4 chỗ đang so khớp cứng tên lá: `handlePlayCard()` (Janet đánh chủ động lá "missed" → định tuyến vào `playBang()` thay vì báo lỗi), `respondToMissed()` (chấp nhận lá "bang" của Janet), `respondToDuel()` (chấp nhận lá "missed" của Janet), `respondDiscardOrDamage()` dùng cho Indians! (chấp nhận lá "missed" của Janet). File đặc tả không nêu rõ Indians! nhưng câu "MỌI hàm kiểm tra người này có lá Bang!/Missed! trên tay" đủ bao quát nên áp dụng luôn, không hỏi lại. Không đổi gì bên trong `playBang()` — dispatch đã định tuyến đúng trước khi vào đó, nên giới hạn 1 Bang!/lượt vẫn áp dụng đúng dù dùng Missed! làm Bang!.
- **Sid Ketchum** — bỏ 2 lá trên tay để hồi 1 máu, dùng được BẤT CỨ LÚC NÀO:
  - Action mới `USE_ABILITY { playerId, cardIds: [string, string] }` (`types.ts`) — hàm xử lý `handleUseAbility()` KHÔNG gọi `assertCurrentPlayer()`/kiểm tra `pending.length`, đúng yêu cầu dùng được cả ngoài lượt, kể cả đang bị tấn công. Field tĩnh mới `canSelfHeal` (`characters.ts`). Event mới `SID_KETCHUM_HEALED` (gộp 1 event thay vì tách `CARDS_DISCARDED`/`HP_RESTORED` — lý do giống `KIT_CARLSON_DISCARDED` ở đợt 6, tránh hiểu nhầm log).
  - **Phát hiện + sửa 1 vấn đề kiến trúc khi rà `room.ts` trước khi code (chủ dự án xác nhận: dùng kỹ năng lúc KHÔNG PHẢI lượt/phản ứng của mình thì CHỈ đổi hand/discardPile/hp của chính Sid, KHÔNG được can thiệp vào cơ chế tính giờ của bất kỳ ai):** `scheduleDeadline()` trước đây cứ sau MỌI action là cấp lại nguyên thời gian mới cho "quyết định đang tính giờ" — đúng ý khi CHÍNH người đó hành động (được 60s/10s mới mỗi lần), nhưng nếu Sid dùng kỹ năng lúc đang là lượt/phản ứng của NGƯỜI KHÁC, hành động đó vẫn vô tình cấp lại đồng hồ mới cho họ (có thể bị lợi dụng "câu giờ" vô hạn). Sửa: `handleAction()`/`alarm()` giờ truyền kèm "ai vừa hành động" qua `afterStateChange()` xuống `scheduleDeadline()`; nếu "ai cần làm gì" không đổi VÀ người vừa hành động KHÁC người đang được tính giờ → giữ nguyên đồng hồ cũ, không cấp lại. Thay đổi này ở `room.ts` (server/), **chưa có test tự động** (đúng tiền lệ — `room.ts` từ trước giờ luôn kiểm bằng `wrangler dev` + nhiều tab trình duyệt thật, chưa từng có test Vitest riêng; nên làm vậy nếu muốn xác nhận chắc chắn trước khi deploy).
- **Bắt buộc sửa thêm 1 chỗ ngoài `core/`**: `ui.ts`'s `describeEvent()` thêm 1 dòng dịch `SID_KETCHUM_HEALED` (chỉ để qua exhaustive-check, không phải làm UI thật). `USE_ABILITY` không phải `PendingAction` nên KHÔNG cần đụng `room.ts`'s `buildReactiveTimeoutAction()`/2 hàm mô tả pending trong `ui.ts` (nó không bao giờ là 1 pending đang chờ — dùng xong là xong ngay).
- Test mới trong **`test/characters-basic.test.ts`** (13 test): Janet — đánh chủ động Missed! như Bang!, người khác không được, vẫn tính giới hạn 1 Bang!/lượt, đỡ Bang! bằng Bang!, đỡ Duel/Indians! bằng Missed!, người khác không dùng thế được; Sid Ketchum — dùng trong lượt mình, dùng ngoài lượt/khi có pending người khác (không đụng gì tới pending đó), đã đầy máu vẫn dùng được (amount=0), báo lỗi 2 lá giống nhau/lá không có trong tay/không phải Sid Ketchum.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 237 test đều pass (224 cũ + 13 test mới).
- Không sửa `main.ts` — 2 người này cũng CHƯA hiện được trên giao diện, giống 14 người trước.

237 test đều pass. **ĐỦ 16/16 nhân vật trong `core/characters.ts`** — việc 5.2 (Giai đoạn 5) coi như xong phần "nhân vật", CHỈ dùng được qua code/test.

**Giai đoạn 5 — cơ chế "phát 2 lá nhân vật, chọn giữ 1" (core + UI — ĐÃ bật cho ván thật):**

- Bàn trước với chủ dự án (đúng quy tắc CLAUDE.md — đổi kiểu dữ liệu state phải hỏi trước): điểm mấu chốt là máu tối đa (`hp`) VÀ số lá bài tay đầu ván đều phụ thuộc nhân vật được chọn — nên KHÔNG chia bài tay được ngay lúc `setupGame()` như trước nữa, phải đợi ai cũng chọn xong.
- **Không tái dùng ngăn xếp `pending`** (dù Gatling cũng "hỏi lần lượt nhiều người" bằng đúng cơ chế đó) — chủ dự án YÊU CẦU rõ: đây phải là **1 khoảng thời gian CHUNG cho cả bàn**, MỌI người tương tác với 2 lá riêng của mình **độc lập, không ai chờ ai**, hết giờ mới chốt hết. Ngăn xếp bắt buộc xử lý đúng 1 người ở đỉnh trước — không hợp với yêu cầu "song song" này. Nên tạo hẳn 1 field MỚI, riêng biệt: `GameState.characterSelection: CharacterChoice[] | null` (`types.ts`) — 1 MẢNG (không phải ngăn xếp), mỗi người 1 phần tử `{ playerId, options: [2 lá được phát], chosen }`, xử lý được theo BẤT KỲ thứ tự nào.
- 2 action mới (`types.ts`): `CHOOSE_CHARACTER { playerId, characterId }` (từng người tự chọn, ĐỘC LẬP — không cần "đúng lượt") và `FINALIZE_CHARACTER_SELECTION` (không có `playerId` — action HỆ THỐNG DUY NHẤT trong dự án không gắn với 1 người chơi cụ thể, dùng lúc HẾT GIỜ TỔNG: chốt NGẪU NHIÊN 1 trong 2 lá cho MỌI người CHƯA tự chọn — chủ dự án CHỐT rõ phải ngẫu nhiên, KHÁC quy ước "mặc định lá đầu tiên" ở các chỗ hết giờ khác trong dự án — giữ nguyên ai đã chọn). Đồng hồ thật (giờ chung cho cả bàn, dự tính **30 giây** theo yêu cầu chủ dự án) sẽ sống ở `room.ts`/`protocol.ts` ở việc RIÊNG sau này (quy tắc 2 cấm `Date.now()` trong `core/`) — `core/` chỉ cần CUNG CẤP action để chốt khi được gọi, **CHƯA nối dây đồng hồ thật** (xem mục "Chưa làm tới" bên dưới).
- `reduce()` thêm 1 chốt chặn Ở ĐẦU: `state.characterSelection` khác `null` thì MỌI action khác ngoài 2 action trên đều bị từ chối (ván coi như "chưa thật sự bắt đầu").
- Người CUỐI CÙNG chọn xong (dù tự chọn hay bị chốt mặc định) → `finishCharacterSelection()` (`reduce.ts`) tự động chạy NGAY trong cùng lần `reduce()` đó: tính máu theo `bullets` của nhân vật (+1 nếu Sheriff, ÁP DỤNG DÙ nhân vật là ai — công thức này tách thành `computeStartingHp()` dùng CHUNG ở `characters.ts`, để `setup.ts` (đường `characterAssignments` cũ) và `reduce.ts` (đường chọn thật mới) không lặp lại 2 nơi), chia bài tay theo đúng số máu (y hệt logic cũ ở `setupGame()`, chỉ chuyển chỗ), rồi `characterSelection = null` + chạy Bước 0 đầu lượt (`applyTurnStartChecks`) cho Cảnh sát trưởng — không cần `room.ts` can thiệp gì thêm, đúng quy tắc 4 (không `await` chờ người chơi).
- `setup.ts` thêm `RuleOptions.dealCharacterCards?: boolean` — bật thì `setupGame()` xáo TOÀN BỘ 16 lá trong registry `CHARACTERS`, phát 2 lá liên tiếp cho mỗi người theo thứ tự ghế ngồi, gán `characterSelection`, để `hp`/`hand` tạm `0`/rỗng. `characterAssignments` (cách gán tay cũ, đa số test hiện có đang dùng) được ƯU TIÊN hơn — có cả 2 thì `dealCharacterCards` bị bỏ qua, giữ nguyên hành vi cũ 100%.
- `view.ts` thêm `PlayerView.characterSelection` — ẩn `options` (2 lá riêng) với bất kỳ ai KHÔNG PHẢI chính chủ, y hệt cách Kit Carlson đã làm với `NEED_PICK_KEPT_CARDS.cards`; `chosen` LUÔN công khai (kể cả `null` = "chưa chọn") vì không lộ nội dung gì.
- **Sửa nhỏ ở `room.ts`** (hạ tầng, không cần hỏi trước): `handleAction()` trước đây giả định MỌI `Action` đều có `playerId` (dùng để truyền vào `scheduleDeadline()`, xem việc 5.2 đợt 7/Sid Ketchum) — `FINALIZE_CHARACTER_SELECTION` là action ĐẦU TIÊN không có field này, sửa thành `"playerId" in action ? action.playerId : undefined`.
- Test mới: **`test/character-selection.test.ts`** (11 test, dựng thẳng `state.characterSelection` để kiểm luồng `reduce()`: chọn từng người, người cuối tự tính máu/chia bài đúng, các lỗi hợp lệ, action khác bị chặn, `FINALIZE_CHARACTER_SELECTION` chốt ngẫu nhiên đúng người + không đụng rngState khi ai cũng đã tự chọn hết). **`test/setup.test.ts`** (+4 test: phát đủ 2 lá/người không trùng nhau lấy từ `CHARACTERS`, hp/hand tạm đúng lúc chưa chọn xong, `characterAssignments` ưu tiên hơn, cùng seed ra cùng kết quả). **`test/view.test.ts`** (+3 test: ẩn `options` người khác, `chosen` luôn công khai). 14 file test cũ (dùng `GameState` literal trực tiếp, không qua `setupGame()`) phải thêm đúng 1 dòng `characterSelection: null,` mỗi file để qua kiểm tra kiểu — KHÔNG đổi hành vi test nào.
- Đã tự kiểm core: `npx tsc --noEmit` sạch, 255 test đều pass (237 cũ + 18 test mới).

**Bật thật cho UI + ván thật (cùng việc, làm ngay sau core — chủ dự án chốt "giai đoạn này cứ làm theo ý bạn cho dễ test/code"):**

- `ui.ts`: `CHARACTER_DESCRIPTIONS` (mô tả ngắn 16 nhân vật, soạn theo ĐÚNG hook đã cài trong `characters.ts`, không chép nguyên văn `NHAN-VAT-BANG-CO-BAN.txt`) + `characterButton()`/`characterChip()` (dùng chung `appendCardVisual()`/viền `card-box--character` có sẵn từ việc bổ sung sau 4.6, ảnh quy ước `/sprites/characters/<id>.png` — CHƯA có file thật, tự ẩn về ô xám giống lá bài). 2 màn hình mới: `renderCharacterSelectionScreen()` (hotseat — hiện LUÔN cả 2 lá của MỌI người cùng lúc, đúng mô hình tin tưởng sẵn có của hotseat, không ẩn gì) và `renderNetworkCharacterSelectionScreen()` (qua mạng — CHỈ CHÍNH MÌNH thấy 2 lá riêng qua `view.characterSelection`, người khác chỉ thấy "đang chọn..."/"đã chọn: `<tên>`").
- `main.ts`: `render()` rẽ nhánh — `state.characterSelection`/`networkView.characterSelection` khác `null` thì vẽ màn hình chọn nhân vật THAY VÌ `renderApp()`/`renderNetworkGame()`. 2 handler mới `onChooseCharacter(playerId, characterId)` (hotseat, playerId lấy trực tiếp từ người vừa bấm — KHÔNG dùng `currentPlayerId()` như các handler khác, vì chọn nhân vật không phải hành động "đúng lượt") và `onNetworkChooseCharacter(characterId)` (qua mạng, luôn là `myPlayerId`). `onStartGame()` (hotseat) giờ gọi `setupGame(ids, Date.now(), { dealCharacterCards: true })`.
- **`room.ts` bật thật**: `handleStartGame()` gọi `setupGame(playerIds, seed, { dealCharacterCards: true })` — mọi ván qua mạng từ giờ đều bắt đầu bằng bước chọn nhân vật. Phải sửa thêm `afterStateChange()`'s vòng lặp "cuốn" tự động (rút bài đầu lượt) — thêm điều kiện `!finalState.characterSelection` trước khi tự gọi `DRAW_CARDS`, nếu không sẽ gọi action bị `reduce()` chặn (ném lỗi không ai bắt, crash Durable Object) ngay lúc `characterSelection` còn đang chờ.
- Đã tự kiểm bằng trình duyệt thật: **hotseat** (`vite dev`) — 4 người hiện đủ 2 lá/người không trùng nhau, chọn xong từng người theo BẤT KỲ thứ tự nào, người cuối chọn xong tự chuyển thẳng sang bàn chơi thật (Cảnh sát trưởng đúng +1 máu theo nhân vật chọn, log ghi đủ "X chọn nhân vật"), không lỗi console. **Qua mạng** (`wrangler dev` + 4 tab) — xác nhận ĐÚNG quy tắc 6: mỗi tab CHỈ thấy 2 lá riêng của chính mình, người khác chỉ hiện "đang chọn..."; nhân vật đã chọn hiện công khai đúng cho MỌI tab; người cuối chọn xong cả 4 tab tự chuyển sang bàn chơi thật cùng lúc, đồng hồ lượt (việc 4.1) hoạt động lại bình thường ngay sau đó; server (`wrangler dev` log) không có lỗi nào trong suốt quá trình — xác nhận fix ở `afterStateChange()` hoạt động đúng (không crash Durable Object).

**Đồng hồ 30 giây THẬT cho "hết giờ tổng" (làm ngay sau, cùng phiên) — ĐÃ XONG:**

- `protocol.ts`'s `DeadlineInfo` đổi từ 1 interface phẳng sang UNION theo `kind`: nhánh `"play"|"reactive"|"discard"` giữ `playerId: string` như cũ, nhánh MỚI `"character_selection"` có `playerId: null` — đồng hồ CHUNG cho cả bàn, KHÔNG gắn 1 người cụ thể. Union giúp TypeScript tự chặn nếu lỡ đọc `deadline.playerId` như `string` ở nhánh chung.
- `room.ts`: thêm hằng `CHARACTER_SELECTION_MS = 30_000`. `determineActiveDecision()` kiểm `state.characterSelection` NGAY ĐẦU (trước cả `pending`/`turnPhase`) — trả `{ kind: "character_selection", playerId: null }`. `buildTimeoutAction()` thêm nhánh: hết giờ kind này → trả thẳng `{ type: "FINALIZE_CHARACTER_SELECTION" }` (không cần biết ai, vì action này tự chốt hết những người CHƯA chọn — xem `reduce.ts`).
- **Cơ chế "không reset đồng hồ khi có người chọn" tận dụng ĐÚNG cơ chế dedup có sẵn từ Sid Ketchum (việc 5.2 đợt 7)**, không cần code thêm gì: `scheduleDeadline()` đã có sẵn logic "nếu người vừa hành động KHÁC người đang được tính giờ (`actingPlayerId !== decision.playerId`) VÀ decision không đổi thì GIỮ NGUYÊN đồng hồ cũ". Vì `decision.playerId` của kind `character_selection` LUÔN là `null`, còn `actingPlayerId` (ai vừa gửi `CHOOSE_CHARACTER`) LUÔN là 1 playerId thật → 2 giá trị này không bao giờ bằng nhau → mỗi lần có người tự chọn, đồng hồ CHUNG tự động được GIỮ NGUYÊN, không cấp lại 30s mới. Tự nhiên đúng luôn mà không cần thêm nhánh đặc biệt nào.
- `alarm()` (2 chỗ gọi `scheduleDeadline`/`afterStateChange` bằng `deadline.playerId`) đổi `null` → `undefined` (`deadline.playerId ?? undefined`) — 2 hàm đó nhận `actingPlayerId?: string`, không nhận `null`.
- `ui.ts`: `renderCountdown()` rẽ nhánh theo `deadline.playerId === null` — hiện `"⏱ Còn Xs để mọi người chọn nhân vật"` (không tra tên người chơi) thay vì mẫu `"⏱ Còn Xs — <tên> ..."` thường dùng. Gọi hàm này ngay trong `renderNetworkCharacterSelectionScreen()` (hotseat không có đồng hồ, không cần gọi — đúng luật cũ "hotseat không giới hạn giờ").
- Đã tự kiểm bằng trình duyệt thật (`wrangler dev` + 4 tab, KHÔNG giả lập gì): bấm "Bắt đầu ván" thấy đúng ngay `"⏱ Còn 30s để mọi người chọn nhân vật"`; 3 người (An, Bình rồi tiếp) tự chọn lần lượt — đồng hồ vẫn tiếp tục đếm lùi bình thường (22s → 13s → 5s), KHÔNG reset về 30 sau mỗi lần; CỐ TÌNH để 2 người (Chi, Dũng) không bấm gì — hết giờ tự động chốt NGẪU NHIÊN cho cả 2 (log ghi "Chi chọn nhân vật"/"Dung chọn nhân vật" dù họ không bấm), ván tự chuyển sang bàn chơi thật ngay sau đó, đồng hồ lượt bình thường (60s, việc 4.1) hoạt động lại đúng; server không có lỗi nào trong suốt quá trình (kể cả lúc Alarm tự thức dậy xử lý hết giờ).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 255 test vẫn pass (không đổi `core/` ở việc này — toàn bộ nằm ở `protocol.ts`/`room.ts`/`ui.ts`, đúng ngoại lệ "hạ tầng không cần test Vitest" áp dụng cho mọi thay đổi timer từ việc 4.1 tới giờ, luôn kiểm bằng `wrangler dev` + trình duyệt thật).

**Hoàn thiện Bia (Beer) — sửa lỗ hổng đã biết + thêm "hồi sinh" (theo yêu cầu chủ dự án):**

- **Phát hiện quan trọng lúc đọc lại code (bàn với chủ dự án trước khi sửa, đúng quy tắc CLAUDE.md)**: chức năng "hồi sinh" của Bia (cứu người chơi khi máu về 0) **CHƯA từng tồn tại trong code** — trước đây hễ máu về 0 là chết ngay lập tức trong CÙNG lần `reduce()`, không có đường nào cho người chơi dùng Bia để sống sót, dù đang cầm sẵn trên tay. Đây không chỉ là 1 chỗ vá nhỏ (thêm ngoại lệ 2 người) mà phải cài THÊM cả cơ chế hồi sinh trước.
- Chủ dự án CHỐT: cơ chế hồi sinh là **TỰ ĐỘNG hoàn toàn** — không hỏi người chơi, không có `PendingAction`/timeout mới, không có tuỳ chọn "không dùng, chấp nhận chết". Khớp đúng ghi chú có sẵn trong `NHAN-VAT-BANG-CO-BAN.txt` (mục Sid Ketchum): *"Lúc máu chạm 0, chỉ có Beer (**tự động**) mới kéo lên"*.
- 2 chỗ sửa trong `reduce.ts`:
  - `playBeer()` (uống Bia chủ động trong lượt mình): thêm điều kiện `còn hơn 2 người sống` mới thật sự hồi máu — đúng 2 người thì lá vẫn bị bỏ vào chồng bỏ như bình thường (đã làm sẵn ở `handlePlayCard()` TRƯỚC KHI gọi `playBeer()`), chỉ riêng hiệu ứng hồi máu không xảy ra.
  - `eliminateIfDead()`: máu về ≤0 → TRƯỚC KHI gọi `eliminatePlayer()`, kiểm còn ≥1 lá Bia trên tay VÀ tổng số người còn sống (tính cả người sắp chết, vì `alive` vẫn đang `true` tới tận `eliminatePlayer()`) > 2 → tự bỏ 1 lá Bia, kéo THẲNG về 1 máu (không phải +1 từ số âm nếu bị dư sát thương), KHÔNG chết, gọi `triggerHandEmptyHook()` (Suzy Lafayette) nếu lá Bia đó là lá cuối. Vì `eliminateIfDead()` dùng CHUNG cho MỌI nguồn sát thương (Bang!/Gatling/Duel/Indians! qua `applyDamage()`, LẪN Dynamite tự nổ gọi trực tiếp) nên chỉ cần sửa đúng 1 chỗ là áp dụng đủ cho tất cả — không cần sửa từng nơi.
- Event mới `BEER_SAVED_FROM_DEATH { playerId, cardId }` (`types.ts`) — bắn THAY VÌ `PLAYER_ELIMINATED` khi hồi sinh xảy ra; `ui.ts` thêm 1 dòng dịch cho nhật ký ván đấu ("X tự động bỏ Bia để hồi sinh, còn 1 máu").
- **Sửa 2 test cũ vô tình bị ảnh hưởng** (không phải lỗi code, lỗi ở chính test): `test/characters-basic.test.ts` và `test/characters.test.ts` có bài test Vulture Sam/`onAnyDeath` dùng `"beer_1"` làm 1 trong các lá trên tay người SẮP CHẾT (chỉ để kiểm tra hook nhận bài) — giờ Bia đó tự động cứu sống họ, phá luôn tiền đề "người này phải chết" của bài test. Đổi sang dùng lá khác (`"missed_1"`, `"bang_2"`) không liên quan gì tới Bia, giữ nguyên ý nghĩa test.
- **Việc bổ sung ngay sau đó (theo yêu cầu chủ dự án)**: thêm event `BEER_INEFFECTIVE { playerId }` (`types.ts`) — báo RÕ cho người chơi biết mỗi khi Bia không có tác dụng gì (khác im lặng như trước, dễ hiểu nhầm là bug), bắn ở CẢ 2 tình huống: (1) `playBeer()` — tự đánh Bia chủ động mà không hồi được máu vì chỉ còn 2 người; (2) `eliminateIfDead()` — đang cầm Bia lúc máu về 0 nhưng KHÔNG cứu được vì cùng lý do (bắn NGAY TRƯỚC `PLAYER_ELIMINATED`). Chỉ bắn khi THẬT SỰ đang cầm Bia — không có Bia thì im lặng như bình thường (không phải ca "vô tác dụng", chỉ đơn giản là không có). `ui.ts` thêm 1 dòng dịch ("Bia của X không có tác dụng — chỉ còn 2 người sống"). **Xác nhận rõ**: ngoại lệ "còn 2 người sống" CHỈ áp dụng riêng cho Bia — mọi lá/kỹ năng hồi máu khác (Saloon, Sid Ketchum...) không đổi gì, vẫn hoạt động bình thường (có test riêng xác nhận Saloon).
- Test mới: **`test/brown-cards.test.ts`** (+2 test: chỉ còn 2 người sống thì Bia vô tác dụng kèm đúng event `BEER_INEFFECTIVE`; Saloon vẫn hồi máu bình thường trong cùng tình huống, không giống Bia). **`test/death.test.ts`** (+4 test: hồi sinh tự động kéo về đúng 1 máu + ván chưa kết thúc; chỉ còn 2 người thì vẫn chết dù có Bia, kèm đúng event `BEER_INEFFECTIVE` trước `PLAYER_ELIMINATED`; hồi sinh áp dụng cả cho Thuốc nổ tự nổ — xác nhận dùng chung `eliminateIfDead()`; Bia vừa tự động bỏ là lá cuối thì Suzy Lafayette vẫn được rút bù ngay).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 261 test đều pass (255 cũ + 6 test mới).

**Biến thể số người chơi — đợt 1: 8 người (dễ nhất trong 3 biến thể, xong ngay):**

- Bàn với chủ dự án trước: chốt thứ tự làm 3 biến thể (2/3/8 người, ý tưởng nháp sẵn có trong `LO-TRINH.md`) là **8 → 2 → 3**, tăng dần độ khó — 8 người không cần bàn gì thêm (không có luật mới, chỉ thêm 1 tổ hợp vai), làm luôn; 2 người cần đổi kiểu dữ liệu `GameState.winner` (hiện chỉ biết "phe nào thắng", chưa có khái niệm "1 người cụ thể thắng") nên để dành bàn kỹ riêng; 3 người (vòng tròn săn đuổi) khó nhất, nhiều điểm luật chưa rõ, để sau cùng.
- `setup.ts`'s `ROLE_SETS` thêm `8: ["sheriff", "renegade", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"]` (đúng ý "giống 7 người mặc định, cộng thêm 1 Kẻ phản bội nữa" — `LO-TRINH.md`) — **`win.ts` KHÔNG cần sửa gì cả**, đã sẵn sàng cho nhiều Renegade cùng lúc từ trước (có tiền lệ hẳn hoi: test `"Sheriff chết, còn 2 Renegade sống (biến thể 8 người): vẫn tính Outlaw thắng"` trong `test/death.test.ts` đã viết TRƯỚC cả khi biến thể này thật sự tồn tại, giờ mới thật sự cần tới).
- Đổi thông báo lỗi + giới hạn UI từ "4-7" thành "4-8": `setup.ts` (thông báo lỗi số người chơi), `ui.ts`'s `MAX_PLAYERS` (7→8, dùng chung cho nút "+ Thêm người chơi" và dòng "Cần 4-8 người chơi"), `main.ts`'s `onAddPlayer()` (7→8). Không đụng gì `room.ts` — lobby qua mạng vốn không giới hạn số tối đa nào riêng (chỉ giới hạn tối thiểu 4), tự động nhận 8 người ngay khi `setupGame()` hỗ trợ.
- Test mới: **`test/setup.test.ts`** (sửa lại test biên 4-8 thay vì 4-7, thêm 8 vào bảng `it.each` kiểm số vai — tách riêng bảng renegade theo số người vì 8 người có 2, còn 4-7 luôn chỉ 1). **`test/bot-simulation.test.ts`** (thêm 8 vào `it.each` chạy 300 ván ngẫu nhiên — xác nhận Gatling/Indians!/General Store/khoảng cách... đều ổn với 8 người, 0 crash).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 263 test đều pass (261 cũ + 2 test mới, cộng 300 ván random 8 người không crash). Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat): thêm đủ 8 tên, nút "+ Thêm người chơi" tự vô hiệu hoá đúng lúc 8, màn hình chọn nhân vật hiện đủ 8 người, người cuối chọn xong tự vào bàn chơi thật với ĐÚNG phân bổ vai (1 Cảnh sát trưởng, 2 Phó cảnh sát trưởng, 3 Tội phạm, 2 Kẻ phản bội = 8), không lỗi console.
**Biến thể số người chơi — đợt 2: 2 người (xong):**

- Đồng ý hướng đã đề xuất: đổi `GameState.winner` từ 1 union chuỗi phẳng (`"sheriff_deputy" | "outlaw" | "renegade" | null`) sang **union theo `kind`** — `types.ts` có type `Winner` mới:
  ```ts
  export type Winner =
    | { kind: "faction"; faction: "sheriff_deputy" | "outlaw" | "renegade" } // 4-8 người, thắng theo phe (như cũ)
    | { kind: "player"; playerId: string }; // 2 người, thắng vì là người sống sót DUY NHẤT
  ```
  `GameState.winner: Winner | null`, `GameEvent`'s `GAME_ENDED.winner: Winner` (đổi theo). Dùng `playerId` (không phải tên hiển thị) vì tên có thể trùng nhau — đúng tiền lệ `CharacterChoice`/`onAnyDeath` đã dùng.
- `setup.ts` thêm `isDuelMode(playerIds)` (đúng 2 người) — KHÔNG chia vai (`role: null` cho cả 2, kiểu dữ liệu đã tính trước từ Giai đoạn 1). Không có Sheriff nên không có "ai đi trước theo luật" — CHỐT đơn giản: người đầu tiên trong danh sách (ghế đầu) đi trước. Máu tính bình thường qua `computeStartingHp()` (đã nhận `Role | null` sẵn từ trước — không ai được +1 vì không ai là `"sheriff"`).
- `win.ts`'s `checkWinCondition()` thêm nhánh KIỂM TRƯỚC HẾT: `players.every(p => p.role === null)` (dùng `role === null` làm "cờ hiệu" nhận biết chế độ không chia vai, đúng ý định gốc của kiểu dữ liệu này từ Giai đoạn 1) → thắng khi là người sống sót DUY NHẤT (`{kind:"player", playerId}`), không theo phe nào. Không đụng gì logic 4-8 người cũ.
- `ui.ts`: `WINNER_LABELS` (cũ, phẳng) đổi thành `FACTION_LABELS` + hàm `describeWinner(winner, nameOf)` rẽ nhánh theo `kind` — "faction" tra `FACTION_LABELS`, "player" hiện thẳng TÊN người thắng qua `nameOf()`. Cả 3 chỗ hiển thị kết quả ván (log, tóm tắt hotseat, tóm tắt qua mạng) đều đổi sang gọi hàm này. Fallback hiện có sẵn từ trước (`player.role ? ROLE_LABELS[...] : "(chưa chia vai)"`/`"(ẩn)"`) đã đủ dùng cho `role: null` — không cần sửa gì thêm, tự nhiên hiện đúng.
- **Nới giới hạn UI để chơi thử được thật**: hotseat's `MIN_PLAYERS` (4→2, `ui.ts`) + `main.ts`'s `onAddPlayer()`/`onRemovePlayer()` tự NHẢY QUA số 3 theo cả 2 chiều (3 người để dành đợt sau, `setupGame()` báo lỗi nếu lỡ tới đúng 3). Network lobby's `MIN_NETWORK_PLAYERS` (4→2) — không thêm gì để chặn "đúng 3 người trong phòng" vì đó là danh sách vào ĐỘNG (không phải bộ đếm +/-), cứ để `handleStartGame()` tự báo lỗi rõ ràng qua `action_error` như đã có sẵn.
- Test mới: **`test/death.test.ts`** (+2 test trong `describe("checkWinCondition")`: người sống sót duy nhất thắng, cả 2 còn sống thì ván tiếp tục; sửa 6 test cũ dùng `winner`/`GAME_ENDED` sang shape mới). **`test/view.test.ts`** (sửa 1 test dùng `winner` sang shape mới — `viewFor()` không cần sửa gì, chỉ truyền `Winner` nguyên vẹn). **`test/setup.test.ts`** (+5 test: `role: null` cho cả 2, không ai +1 máu, người ghế đầu đi trước, vẫn chia bài đúng, cùng seed cùng kết quả). **`test/bot-simulation.test.ts`** (+1 test: 500 ván 2 người ngẫu nhiên, 0 crash).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 271 test đều pass (263 cũ + 8 test mới, cộng 500 ván random 2 người không crash). Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat, chơi tới khi có người thắng — KHÔNG dừng giữa chừng): 2 người → 2 (bỏ qua 3) đúng 1 lần bấm; hiện đúng `"(chưa chia vai)"` cho cả 2 (không crash/không hiện `"undefined"`); **phát hiện thú vị lúc tự chơi** — chọn Paul Regret cho 1 người, xác nhận khả năng "Ngựa Mustang ảo" của nhân vật này hoạt động ĐÚNG cả trong chế độ 2 người (đối thủ bị báo "Mục tiêu ngoài tầm bắn" khi dùng súng mặc định, phải đợi vũ khí tầm xa hơn); Bia tự kiểm chứng "vô tác dụng khi chỉ còn 2 người" hoạt động đúng ngay trong ván thật (log hiện "Bia của X không có tác dụng"); ván kết thúc hiện ĐÚNG **`"VÁN KẾT THÚC — thắng: <tên người chơi>"`** (không phải tên phe) — xác nhận toàn bộ luồng `Winner.kind: "player"` từ core tới UI hoạt động đúng. Không lỗi console trong suốt ván.

**Biến thể số người chơi — đợt 3: 3 người, vòng tròn săn đuổi (xong — ĐỦ CẢ 3 BIẾN THỂ):**

- Luật khó nhất trong 3 biến thể, nhiều điểm chưa rõ — hỏi chủ dự án trước khi code (đúng quy tắc CLAUDE.md). Chốt: **cả 3 vai lộ công khai ngay từ đầu ván** (khác Sheriff/Outlaw/Renegade thường — những vai đó chỉ Sheriff công khai, còn lại ẩn); và **"cảnh sát" ở đây là 1 vai HOÀN TOÀN MỚI, không kế thừa bất kỳ hành vi đặc thù nào của Sheriff** (không +1 máu, không thưởng/phạt gì khi bị giết, không có khái niệm "giết nhầm Phó cảnh sát trưởng").
- Vì lý do "không kế thừa hành vi Sheriff" ở trên, **KHÔNG tái dùng `"sheriff"|"outlaw"|"renegade"`** — `types.ts`'s `Role` thêm hẳn 3 giá trị mới, tách biệt hoàn toàn: `"police" | "criminal" | "traitor"`, kèm comment giải thích rõ lý do không dùng chung.
- Luật "vòng tròn săn đuổi": mỗi vai chỉ thắng khi **chính mình** hạ đúng người ở vai kế tiếp trong vòng — police → criminal → traitor → police (quay lại). Hạ nhầm vai (vd police giết traitor) thì KHÔNG thắng ngay, ván tiếp tục bình thường tới khi chỉ còn 1 người sống sót (áp dụng y hệt luật "người sống sót cuối cùng luôn thắng" đã có từ biến thể 2 người).
- `win.ts`'s `checkWinCondition()` thêm tham số thứ 2 `killerId: string | null = null` (mặc định `null` — không phá bất kỳ lời gọi cũ nào không cần biết ai giết) và nhánh kiểm tra MỚI đặt TRƯỚC nhánh phe 4-8 người: nếu có bất kỳ ai mang 1 trong 3 vai săn đuổi → còn đúng 1 người sống thì người đó thắng (`{kind:"player", playerId}`, giống 2 người); còn đúng 2 người sống VÀ có `killerId` → tra `HUNT_CIRCLE[killer.role] === deadPlayer.role` (map hằng số mới, 3 cặp police→criminal, criminal→traitor, traitor→police) — khớp thì killer thắng NGAY, không khớp thì trả `null` (ván tiếp tục, không kết thúc).
- `eliminatePlayer()` (`reduce.ts`) — nơi DUY NHẤT gọi `checkWinCondition()` — sửa lại truyền thêm `killerId` (vốn đã có sẵn tham số này ở `eliminatePlayer()` từ trước, chỉ là chưa từng truyền tiếp xuống `checkWinCondition()`).
- `setup.ts` thêm `isHuntMode(playerIds)` (đúng 3 người) + hằng `HUNT_ROLES: Role[] = ["police","criminal","traitor"]`. Giống hệt cách làm với 2 người: không ai +1 máu (không có Sheriff), người ghế đầu đi trước (không có Sheriff để xác định lượt đầu theo luật gốc).
- `view.ts`'s `viewRole()` thêm 1 nhánh: vai là 1 trong 3 vai săn đuổi → LUÔN trả về đúng vai thật (bỏ qua mọi luật ẩn/hiện thông thường) — đúng yêu cầu "công khai từ đầu" đã chốt với chủ dự án.
- `ui.ts`: `ROLE_LABELS` thêm `police: "Cảnh sát"`, `criminal: "Tội phạm"`, `traitor: "Kẻ phản bội"`. Không cần đụng gì `describeWinner()`/`FACTION_LABELS` — biến thể 3 người dùng CHUNG nhánh `{kind:"player", playerId}` đã có sẵn từ 2 người (chỉ khác ở CÁCH đạt được: đúng vòng tròn săn đuổi HOẶC người sống sót cuối cùng).
- **Nới giới hạn UI**: hotseat's `MIN_PLAYERS` (`ui.ts`) và `main.ts`'s `onAddPlayer()`/`onRemovePlayer()` bỏ hẳn logic "nhảy qua số 3" đã thêm tạm ở đợt 2 người (giờ 3 người hợp lệ, không cần nhảy qua nữa) — tăng/giảm đơn giản lại như trước Giai đoạn 5. `MIN_NETWORK_PLAYERS` không đổi (đã là 2 từ đợt trước, 3 nằm sẵn trong khoảng hợp lệ).
- Test mới: **`test/death.test.ts`** (thêm `describe` riêng cho 3 người: giết đúng vòng tròn thắng ngay cho cả 3 cặp vai, giết sai vòng tròn ván tiếp tục, tự sát/Thuốc nổ không tính "giết đúng", còn 3 người sống chưa ai thắng; cộng 2 test tích hợp mức `reduce()` — giết đúng thắng ngay không có thưởng/phạt kiểu Sheriff, giết sai ván tiếp tục không có `GAME_ENDED`). **`test/setup.test.ts`** (+5 test: đúng đủ 3 vai police/criminal/traitor mỗi vai 1 người, không ai +máu, người ghế đầu đi trước, vẫn chia bài đúng, cùng seed cùng kết quả; bỏ luôn assertion cũ "setupGame(3 người) phải báo lỗi" vì giờ hợp lệ). **`test/bot-simulation.test.ts`** (+1 test: 500 ván 3 người ngẫu nhiên, 0 crash).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 286 test đều pass (271 cũ + 15 test mới, cộng 500 ván random 3 người không crash).
- Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat, chơi tới khi có người thắng — KHÔNG dừng giữa chừng): 3 người chọn được ngay (không còn bị nhảy qua); cả 3 vai (Cảnh sát/Tội phạm/Kẻ phản bội) hiện công khai NGAY từ đầu ván cho MỌI người, không ai bị ẩn; **xác nhận lại khoảng cách/hook nhân vật hoạt động đúng trong bàn tròn 3 ghế** — Paul Regret (+1 khoảng cách khi bị nhắm) khiến người khác cần súng tầm xa hơn mới bắn trúng được, dù người đó ngồi ở BẤT KỲ ghế nào trong 3 ghế (không riêng gì trường hợp 2 người); chơi trọn 1 ván tới khi Kẻ phản bội hạ đúng Cảnh sát (đúng vòng tròn traitor→police) — hiện đúng `"VÁN KẾT THÚC — thắng: <tên>"` ngay lập tức dù vẫn còn người thứ 3 sống sót (khác hẳn 4-8 người, nơi ván luôn kéo dài tới khi hết 1 phe). Không lỗi console trong suốt ván.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm bằng `vite dev` cục bộ (hotseat). Cần `npm run deploy` khi chủ dự án xác nhận muốn đưa lên bản công khai.

286 test đều pass. **ĐỦ CẢ 3 BIẾN THỂ SỐ NGƯỜI CHƠI (2/3/8 người)**.

**Bật nốt UI thật cho 3 nhân vật còn thiếu nút bấm (Pedro Ramirez, Jesse Jones, Kit Carlson) + vài lỗi phát hiện dọc đường:**

- Rà lại thấy 3/16 nhân vật (Pedro Ramirez — đợt 4, Jesse Jones — đợt 5, Kit Carlson — đợt 6) vẫn CHƯA có nút bấm thật trên giao diện dù `core/` đã xong từ trước — 3 `PendingAction` mới của họ (`NEED_PICK_DRAW_SOURCE`, `NEED_PICK_DRAW_TARGET`/`NEED_GIVE_CARD_TO_PLAYER`, `NEED_PICK_KEPT_CARDS`) chỉ dùng được qua test/gửi thẳng action, chưa vẽ được trên `ui.ts`. Làm nốt phần UI này (không phải core mới — đúng hạ tầng, không cần hỏi trước).
- `ui.ts`: `UiHandlers`/`NetworkGameHandlers` thêm 3 handler mới (`onPickDrawSource`, `onPickDrawTarget`, `onPickKeptCard`); `renderPendingPanel()`/`networkRenderPendingPanel()` (CẢ 2, hotseat lẫn mạng) thêm 3 nhánh vẽ nút tương ứng — Pedro Ramirez hiện nút lá trên cùng chồng bỏ + nút "Rút từ bộ bài"; Jesse Jones hiện nút "Rút từ bộ bài" + 2 nút mỗi người khác ("để họ tự chọn" / "cướp ngẫu nhiên"); Kit Carlson hiện 3 lá vừa xem để bấm bỏ + nút "Giữ 2 lá đầu". `renderHandSection()`/`networkRenderHandSection()` thêm điều kiện `isGivingCardToJesse` để nạn nhân Jesse Jones bấm được lá BẤT KỲ trong tay mình (khác `respondableCardName` chỉ nhận đúng tên Missed!/Bang!). `main.ts` nối `onPickDrawSource`/`onPickDrawTarget`/`onPickKeptCard` (cả hotseat và `onNetworkPick...`) — đều chỉ là `dispatch({type:"RESPOND", playerId, ...})` với field tương ứng, tái dùng đúng luồng RESPOND có sẵn.
- **2 lỗi core phát hiện lúc lắp UI thật (đã sửa, có test), cả 2 đều là ca hiếm chỉ lộ ra khi 2 nhân vật tương tác nhau:**
  - Nạn nhân của Jesse Jones là Sid Ketchum, tự dùng kỹ năng (`USE_ABILITY`, dùng được bất cứ lúc nào — việc 5.2 đợt 7) bỏ sạch tay NGAY TRONG LÚC đang chờ họ trả lời `NEED_GIVE_CARD_TO_PLAYER` → tay rỗng giữa chừng làm `givenCardId` thành `undefined` rồi lọt thẳng vào tay Jesse. Sửa `respondToGiveCardToPlayer()` (`reduce.ts`): tay rỗng thì coi như không còn gì để lấy (giống cách `respondToPickDrawTarget()` đã xử lý tay rỗng ngay từ đầu), không tạo lá `undefined`.
  - Sheriff giết nhầm Deputy bằng đúng lá cuối cùng trên tay (Suzy Lafayette): `handlePlayCard()` đã rút bù NGAY khi đánh lá đó (tay về 0), nhưng hình phạt "Sheriff giết nhầm Deputy" (bỏ sạch tay+sân) chạy SAU, trong `eliminatePlayer()`, lại không kiểm tra tay CÓ ĐANG rỗng từ trước hay không trước khi tính đó là "vừa rời tay" — sửa: chỉ gọi `triggerHandEmptyHook()` cho hình phạt này nếu `killer.hand.length > 0` NGAY TRƯỚC lúc bị tịch thu (tránh đếm 2 lần khi tay vốn đã rỗng sẵn).
  - Tiện thể sửa thứ tự event trong `handlePlayCard()`: `handEmptyEvents` (Suzy rút bù, xảy ra NGAY lúc lá rời tay) giờ xếp TRƯỚC `result.events` (hiệu ứng riêng của lá, có thể tự rút lại bài như Stagecoach) — đúng thứ tự thời gian thật, tránh nhật ký ván đấu hiện ngược.
- **3 lỗi/thiếu sót ở `room.ts` phát hiện lúc rà lại trước khi bật UI thật (không phải core, hạ tầng mạng):**
  - **Giả mạo `playerId`**: `handleAction()` trước đây tin thẳng `action.playerId` client tự gửi lên — 1 client có thể gửi `RESPOND` với `playerId` của người khác (vd tự chọn hộ nạn nhân của Jesse Jones cho lá nào bị lấy). Sửa: so khớp `action.playerId` với danh tính thật lưu trong `ws.deserializeAttachment()` của chính socket đang gửi, sai thì từ chối — cùng nguyên tắc `handleStartGame()` đã áp dụng với `ownerId` từ việc bổ sung sau 3.10.
  - **Không chơi lại được sau khi ván đã có người thắng**: `handleStartGame()` chặn MỌI ván mới nếu phòng đã có `GameState` lưu sẵn, kể cả ván ĐÃ KẾT THÚC (`winner` khác `null`) — sửa điều kiện thành `existing && !existing.winner`.
  - **`webSocketError()` chưa từng tồn tại**: tài liệu Hibernatable WebSockets của Cloudflare quy định mất kết nối "lỗi" (khác đóng sạch) gọi `webSocketError()` thay vì `webSocketClose()`, CHỈ ĐÚNG 1 TRONG 2 hàm chạy cho mỗi lần mất kết nối. File này trước giờ CHỈ có `webSocketClose()` — nếu runtime chọn nhánh lỗi, toàn bộ dọn dẹp (chuyển chủ phòng, huỷ ván khi hết người, báo "mất kết nối") bị bỏ sót hoàn toàn. Tách logic dọn dẹp dùng chung thành `handleSocketGone(ws)`, gọi từ CẢ 2 hàm. Tiện thể sửa `joinedPlayers()` nhận thêm `excludeSocket?: WebSocket` loại theo ĐÚNG THAM CHIẾU socket (không phải theo `playerId` như trước) — tránh ca hiếm socket cũ sắp đóng chồng lấn với socket mới đã reconnect xong (cùng `playerId`), loại theo `playerId` sẽ xoá nhầm cả socket mới còn sống.
- Test mới: **`test/characters-basic.test.ts`** (+2 test: ca Jesse Jones + Sid Ketchum tự bỏ sạch tay giữa chừng; thứ tự event Suzy Lafayette + Stagecoach đúng thời gian thật). **`test/death.test.ts`** (+2 test: Sheriff Suzy Lafayette giết nhầm Deputy bằng lá cuối rút bù 2 lần liên tiếp đúng lý do khác nhau; Sheriff thường không phải Suzy thì không rút bù gì khi phạt). `room.ts` (giả mạo `playerId`/`webSocketError`/chơi lại) vẫn theo đúng tiền lệ "hạ tầng mạng không có test Vitest, kiểm bằng `wrangler dev` + trình duyệt thật".
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 290 test đều pass (286 cũ + 4 test mới). Đã tự kiểm bằng trình duyệt thật:
  - **Hotseat** (`vite dev`, 4 người): gán được Kit Carlson + Jesse Jones qua màn hình chọn nhân vật, chơi thật tới lượt của cả 2 — Kit Carlson hiện đúng 3 lá vừa xem để bấm bỏ 1, Jesse Jones hiện đúng danh sách nút theo từng người ("để họ tự chọn"/"cướp ngẫu nhiên"), bấm "cướp ngẫu nhiên" lấy đúng 1 lá ngẫu nhiên + tự rút lá 2 từ bộ bài, nhật ký ghi đúng. Không lỗi console.
  - **Qua mạng** (`wrangler dev` cục bộ + 2 tab, sau khi `npm run build`): tạo phòng/vào phòng bằng mã 6 ký tự hoạt động đúng, màn hình chọn nhân vật qua mạng hiện đúng (kèm đồng hồ 30s đếm lùi), ván tự chuyển sang bàn chơi thật kể cả khi hết giờ tự chốt ngẫu nhiên (xác nhận lại đúng cơ chế đã có từ trước), đồng hồ lượt chơi (60s) hoạt động lại đúng ngay sau đó. Không lỗi console ở tab nào trong suốt quá trình. **Chưa ép được đúng tình huống Pedro Ramirez/Jesse Jones/Kit Carlson xuất hiện qua mạng trong lần kiểm này** (nhân vật gán ngẫu nhiên theo seed thật, không cố định) — nhưng code vẽ UI mạng dùng chung gần như 100% logic với hotseat (đã xác nhận qua đọc lại diff), rủi ro thấp.
  - **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận muốn đưa lên bản công khai.

290 test đều pass.

**Giai đoạn 5 — việc 5.3, đợt 1 (house rules — 4/6 ý tưởng nháp, KHÔNG cần cơ chế mới):**

- Bàn kỹ với chủ dự án trước khi code (đúng quy tắc CLAUDE.md — đổi kiểu dữ liệu `GameState` phải hỏi trước): rà lại 6 ý tưởng nháp trong `LO-TRINH.md` mục "Ghi chú cho 5.3", thấy 2 ý (mục 3 "Bang! nhiều lần/lượt không trùng tên" và mục 4 "cho phép dùng nhiều lá trùng tên") viết ra nghe như MÂU THUẪN nhau — hỏi lại thì chủ dự án CHỐT: luật gốc vốn ĐÃ giới hạn 1 Bang!/lượt từ Giai đoạn 1 (`bangUsedThisTurn`) rồi, không cần thêm gì; và luật gốc vốn ĐÃ cho phép dùng nhiều lá trùng tên trong 1 lượt (vd 2 Panic!) — nên house rule THẬT SỰ cần thêm chỉ có 1: **cấm** dùng 2 lá NÂU trùng tên/lượt (trừ lá trang bị). Ý số 6 ("gộp 2 lá Beer hồi máu người khác") cần cơ chế MỚI (chọn mục tiêu là người khác) — chủ dự án CHỐT để dành đợt sau, đợt này chỉ làm 4 luật không cần pending/action mới.
- Kiến trúc: `GameState` thêm `houseRules: HouseRuleId[]` (mảng id luật BẬT cho RIÊNG ván này, `types.ts`'s `HouseRuleId` union) + `cardNamesPlayedThisTurn: string[]` (chỉ có ý nghĩa khi bật luật cấm trùng tên, reset mỗi lượt ở `advanceTurn()` — giống hệt cách `bangUsedThisTurn` đã làm). `setup.ts`'s `RuleOptions.houseRules?: HouseRuleId[]`, mặc định `[]` = đúng luật gốc, không đổi gì ván cũ/test cũ nào.
- 4 luật, mỗi luật là 1 điều kiện rẽ nhánh riêng tại ĐÚNG chỗ luật gốc áp dụng (KHÔNG có cơ chế/hook chung chung):
  - **`extra_distance`** (tăng khoảng cách mặc định +1) — `distance.ts`'s `computeDistance()` thêm tham số `extraBaseDistance` (số thuần, không đọc thẳng `GameState` để hàm này không phải import gì thêm từ `types.ts`), cộng vào khoảng cách vòng tròn THÔ trước Scope/Mustang/hook nhân vật. 2 chỗ gọi trong `reduce.ts` (`playBang()`, `playPanic()`) tự tra `houseRules` rồi truyền `1` hoặc `0` vào — áp dụng ĐỒNG NHẤT cho mọi lá phụ thuộc khoảng cách, không riêng Bang!.
  - **`require_weapon_for_bang`** (bắt buộc có súng mới đánh Bang!) — `playBang()` thêm 1 kiểm tra TRƯỚC bước tính tầm bắn: không có lá súng nào trong `equipment` (tra `isWeaponCardName`) thì throw lỗi rõ ràng, bỏ hẳn "súng ngầm định tầm 1" của luật gốc khi luật này bật.
  - **`no_duplicate_card_names`** (cấm dùng 2 lá trùng tên/lượt) — CHỈ áp dụng ở nhánh lá NÂU trong `handlePlayCard()` (nhánh trang bị/Jail ở trên không đi qua), kiểm `cardNamesPlayedThisTurn.includes(cardName)` TRƯỚC khi đánh, ghi nhận lại nếu qua được. Dùng đúng `cardName` (tên lá thật) chứ không phải `dispatchCardName` — Calamity Janet đánh Missed! làm Bang! vẫn tính là đã đánh "missed", không phải "bang".
  - **`beer_below_two`** (Bia vẫn có tác dụng dù còn 2 người) — bỏ điều kiện `aliveCount > 2` ở CẢ 2 chỗ đã cài ngoại lệ này trước đó (`playBeer()` VÀ `eliminateIfDead()`'s cơ chế hồi sinh tự động) — dùng chung 1 biến `beerWorksBelowTwo`, không sửa sót chỗ nào.
- `view.ts`'s `PlayerView` thêm `houseRules: HouseRuleId[]` — KHÔNG bí mật gì (chủ phòng chọn công khai trước khi bắt đầu ván), truyền nguyên vẹn, không cần lọc/ẩn.
- **UI (hotseat + qua mạng) bật thật CÙNG đợt** (không tách riêng, chủ dự án đồng ý làm luôn theo đúng kiến trúc đã thống nhất):
  - `ui.ts`: `HOUSE_RULE_LABELS`/`HOUSE_RULE_DESCRIPTIONS` (nhãn + mô tả ngắn từng luật, mô tả gắn qua `title` — giống pattern nhấn giữ xem mô tả đã có từ việc 4.6) + `renderHouseRuleCheckboxes()` (hàm DÙNG CHUNG cho cả 2 màn hình dưới, tránh viết 2 lần). `renderSetupScreen()` (hotseat) thêm tham số `selectedHouseRules` + handler `onToggleHouseRule` — checkbox hiện cho CHỦ VÁN (chính là người duy nhất ở hotseat) TRƯỚC nút "Bắt đầu ván". `renderNetworkLobby()` (qua mạng) thêm tương tự nhưng CHỈ CHỦ PHÒNG thấy — người khác vẫn chỉ thấy dòng chờ như trước (không broadcast lựa chọn đang gõ dở qua lobby, giống cách `seed` cũng không broadcast — chỉ gửi kèm 1 lần lúc bấm "Bắt đầu ván" thật). `renderApp()`/`renderNetworkGame()` (màn hình đang chơi) thêm `renderActiveHouseRules()` — hiện 1 dòng "Luật bổ sung đang bật: ..." NGAY ĐẦU bàn chơi nếu có bật gì, im lặng nếu mảng rỗng.
  - `main.ts`: `selectedHouseRules`/`networkSelectedHouseRules` (biến tạm client, KHÔNG phải trong `GameState`) — reset về `[]` mỗi khi bắt đầu phiên thiết lập mới (`onPlayAgain` cho hotseat, `onJoinRoom` cho mạng), tránh quên đang bật gì từ ván trước. `onStartGame()`/`onNetworkStartGame()` truyền `houseRules` vào `setupGame()`/message `start_game`.
  - `protocol.ts`'s `{type:"start_game"}` thêm `houseRules?: HouseRuleId[]`. `room.ts`'s `handleStartGame()` nhận thêm tham số, truyền tiếp vào `setupGame()`.
- Test mới **`test/house-rules.test.ts`** (15 test, tự viết `makeState()` riêng — không tái dùng file khác vì cần tham số `houseRules` ở vị trí rõ ràng): mỗi luật đều có cặp test "TẮT (mặc định) vẫn như luật gốc" + "BẬT thì khác đi đúng như mô tả", cộng test riêng cho `no_duplicate_card_names`: 2 lá khác tên không bị chặn, lá trang bị không tính vào giới hạn, và reset đúng khi sang lượt mới (dùng `END_TURN` thật, không giả lập).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 305 test đều pass (290 cũ + 15 test mới).
- Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat): tick "Cấm dùng 2 lá trùng tên/lượt" ở màn hình thiết lập, bắt đầu ván thấy đúng dòng "Luật bổ sung đang bật: Cấm dùng 2 lá trùng tên/lượt" ở đầu bàn chơi; đánh Bang! lần 1 thành công, đánh lá Bang! THỨ 2 trong CÙNG lượt bị chặn đúng với thông báo lỗi `Luật bổ sung "cấm dùng 2 lá trùng tên/lượt" đang bật — đã đánh "bang" trong lượt này rồi` hiện rõ trên giao diện. Không lỗi console.
- **Chưa kiểm được màn hình lobby qua mạng bằng trình duyệt thật trong đợt này** — gặp lỗi hiển thị/click chập chờn của chính công cụ trình duyệt tự động (không phải lỗi code, đã từng gặp y hệt ở phiên làm việc trước khi chưa đụng gì tới house rules) — đã dừng lại thay vì cố lặp lại thao tác đang lỗi. Phần code lobby qua mạng dùng CHUNG 100% hàm `renderHouseRuleCheckboxes()`/kiến trúc tham số với màn hình thiết lập hotseat đã kiểm thành công, cộng `tsc`/build/test đều sạch — rủi ro thấp nhưng NÊN tự kiểm lại bằng `wrangler dev` + trình duyệt thật khi có dịp trước khi coi là chắc chắn xong.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.
- **Còn lại của 5.3**: ý tưởng số 6 ("gộp 2 lá Beer hồi máu người khác", cần cơ chế chọn mục tiêu mới) để dành đợt sau — không nằm trong đợt này.

305 test đều pass.

**Giao diện UI/UX — đợt 1 (chrome màu xám+đỏ, bàn tròn qua mạng, chọn nhân vật 2 bước):**

- Chủ dự án viết sẵn **`GIAO-DIEN-UI-UX.txt`** (đặc tả UI/UX đầy đủ, 12 mục — nguồn sự thật cho các đợt làm giao diện, xem file để biết toàn bộ phạm vi còn lại). Đợt này làm 4/12 mục: mục 1 (nguyên tắc màu), mục 3 (bố cục bàn tròn — chỉ qua mạng), mục 8 (một phần — trạng thái "bị nhắm"), mục 10 (responsive fallback). Việc UI/CSS thuần, không đụng `core/`.
- **Mục 1 — màu chrome**: gom biến CSS `--color-border`/`--color-border-strong`/`--color-text-muted`/`--color-danger`/`--color-danger-bg` (`style.css`) — chrome (khung/nền/viền chung) chỉ dùng thang xám + đúng 1 màu đỏ cho nguy hiểm/khẩn cấp, bỏ hẳn `panel--pending`/`panel--selection` từng mượn cam/xanh lá làm màu trạng thái (vi phạm nguyên tắc "7 màu lá bài để riêng cho lá"). Lá đang chọn đổi từ `border-color` sang `outline` (không đè màu phân loại lá nâu/xanh dương/xanh lá của chính lá).
- **Mỗi seat chỉ mang ĐÚNG 1 trong 4 trạng thái** (`renderPlayer()`/`networkRenderPlayer()` ở `ui.ts`, dùng chung logic ưu tiên), thứ tự ưu tiên trên xuống: đã chết (`player--dead`, mờ nặng + gạch tên) > bị nhắm/cần phản hồi (`player--targeted`, viền đỏ dày nhấp nháy + nhãn "⚠ cần phản hồi", tra theo đỉnh `state.pending`) > đang tới lượt (`player--current`, viền xám dày — CHỈ đúng khi `pending` rỗng, vì có ai đang chờ phản hồi thì không còn ai được coi là "đang tới lượt" nữa, kể cả người vừa đánh bài gốc) > đang chờ (`player--waiting`, mờ nhẹ). Áp dụng cả hotseat lẫn qua mạng.
- **Bố cục bàn tròn (mục 3) — CHỈ ván qua mạng** (đã hỏi và chốt với chủ dự án: hotseat không có 1 "BẠN" duy nhất nên không áp dụng, giữ nguyên `.players` cũ). 1 công thức góc/ellipse DUY NHẤT cho 2-8 người (`seatAngleDeg()`/`seatPositionPercent()` trong `ui.ts`, không hardcode từng N) — `buildSeatOrder()` xoay `view.players` để BẠN luôn là phần tử CUỐI, dùng chung làm thứ tự DOM (danh sách dọc, màn hẹp) VÀ input tính góc (bàn tròn, `@media (min-width: 700px)` trở lên trong `style.css`) — "cùng dữ liệu, khác cách xếp" đúng mục 10, không cần đổi gì khi chuyển responsive.
- **Màn hình chọn nhân vật — tách "cầm lên xem" khỏi "xác nhận thật"** (`characterOptionCard()`, `CharacterSelectionHandlers`/`NetworkCharacterSelectionHandlers` ở `ui.ts`, `characterArmedChoices`/`networkArmedCharacterId` ở `main.ts`): bấm 1 lá chỉ đánh dấu "đang cân nhắc" (viền xám đậm outline) + hiện mô tả chức năng LUÔN thành chữ ngay dưới ảnh (không chỉ ẩn trong tooltip hover/nhấn giữ như trước) + hiện nút "Xác nhận chọn `<tên>`" riêng — bấm nút đó mới thật sự gửi `CHOOSE_CHARACTER`. Lý do: quyết định chỉ có ĐÚNG 1 LẦN, tránh bấm nhầm lúc chỉ định xem mô tả (đặc biệt trên điện thoại, không có "hover thử" như máy tính).
- **Lỗi phát hiện lúc tự kiểm bằng trình duyệt thật (đã sửa)**: `seatAngleDeg()` bản đầu dùng góc gốc 270° cho BẠN — nhưng chính comment của hàm đã ghi rõ quy ước "0°=phải, 90°=dưới" (do trục y màn hình hướng xuống), nên góc "đáy bàn" đúng phải là 90°, không phải 270° (270° theo đúng quy ước đó lại là ĐỈNH bàn) — bug làm BẠN luôn hiện ở đỉnh bàn thay vì đáy bàn như đặc tả yêu cầu ("'Bạn' cố định ở giữa ĐÁY"). Phát hiện bằng cách dựng phòng thật 3 người qua `wrangler dev` + 3 tab trình duyệt, đọc thẳng `--seat-x`/`--seat-y` từng seat qua JS thay vì chỉ nhìn ảnh chụp màn hình (màn hình test tự động ở môi trường này bị giới hạn độ rộng cửa sổ, không tự bật được layout bàn tròn thật — phải tạm chèn `<style>` ép `@media (min-width: 700px)` có hiệu lực để xem trực quan, đúng thủ thuật đã dùng ở việc 4.4, rồi gỡ đi). Sửa `seatAngleDeg()` dùng gốc 90°, kiểm lại đúng: BẠN ở x=50%/y=88% (đáy), 2 người còn lại ở góc trên trái/phải — khớp đúng gợi ý cảm quan "3 người: bạn–trên trái/phải" trong đặc tả.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 305 test vẫn pass (không đổi `core/`, không cần test Vitest mới — đúng tiền lệ mọi thay đổi UI/CSS thuần từ trước tới giờ).
- Đã tự kiểm bằng trình duyệt thật (`wrangler dev` cục bộ + 3 tab, tạo phòng/vào phòng bằng mã, KHÔNG giả lập gì): 3 người chọn nhân vật (bấm 1 lá → viền đậm + mô tả hiện dưới ảnh + nút "Xác nhận" xuất hiện; hết giờ 30s tự chốt ngẫu nhiên cho người chưa chọn — xác nhận lại cơ chế đã có từ trước vẫn hoạt động đúng với UI mới), vào bàn chơi thật — xác nhận đúng BẠN luôn ở đáy bàn, 2 người còn lại rải đều phía trên (sau khi sửa lỗi góc). Không lỗi console trong suốt quá trình.
- **CHƯA làm hết `GIAO-DIEN-UI-UX.txt`** — còn mục 4 (seat thu nhỏ khi >6 người + bấm-để-nở xem trang bị), mục 5 (khu trang bị dạng thẻ co giãn — có thể đã đạt sẵn một phần, chưa rà lại theo đúng đặc tả mới), mục 6 (thanh hành động theo ngữ cảnh — có thể đã đạt sẵn một phần), mục 7 (giữa bàn: bộ bài rút/chồng bỏ — có thể đã đạt sẵn một phần), mục 8 (phần còn lại: băng thông báo đầu bàn cho chuỗi phản ứng lồng nhau), mục 9 (dialog cho nhật ký ván đấu/cài đặt/mã phòng — hiện vẫn là khu vực cố định, chưa phải dialog bấm-mới-hiện). Để dành đợt sau.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

305 test đều pass.

**Giao diện UI/UX — đợt 2 (mục 4: seat thu nhỏ khi >6 người):**

- Chủ dự án chọn làm mục 4 tiếp theo (trong 8 mục còn lại của `GIAO-DIEN-UI-UX.txt`) — quy tắc đã chốt rõ trong đặc tả: ≤6 người mỗi seat hiện đầy đủ; >6 người mặc định thu gọn, chỉ hiện SỐ lá trang bị, bấm nút mới "nở" ra xem/thu lại. Rà lại mục 4 kỹ hơn thấy phần "thông tin cơ bản luôn hiện" (tên, máu, số bài tay, role, nhãn trạng thái) đã có sẵn từ trước — phần THỰC SỰ chưa làm chỉ có khu TRANG BỊ (mục 5 nói rõ: "Ở ô đầy đủ thì hiện luôn các lá; ở ô thu nhỏ chỉ hiện số"), nên đợt này giới hạn đúng phạm vi đó (lá nhân vật hiện inline cạnh tên và thanh tim máu trực quan — 2 ý còn lại trong "thông tin cơ bản" của mục 4 — để dành đợt khác, không lẫn vào đây).
- Hàm dùng CHUNG `renderPlayerEquipmentArea()` (`ui.ts`) cho cả hotseat và qua mạng — thu gọn/nở là trạng thái CLIENT-ONLY (`expandedSeatIds`/`networkExpandedSeatIds` ở `main.ts`, giống `characterArmedChoices`), KHÔNG phải `GameState`, không gửi action gì lên server khi bấm. Có tham số `forceShowFull`: đang có hành động THẬT SỰ cần bấm vào khu trang bị của đúng người này (Cat Balou bắt bỏ / Panic! chọn mục tiêu) → LUÔN hiện đầy đủ bất kể đang thu gọn hay >6 người, vì gameplay phải rõ ràng hơn gọn gàng (nguyên tắc CLAUDE.md).
- **Qua mạng có thêm 1 ngoại lệ hotseat không có**: seat của CHÍNH MÌNH luôn hiện đầy đủ bất kể tổng số người, đúng câu "Seat của BẠN (đáy): luôn hiện đầy đủ" trong mục 4 — chỉ người KHÁC mới áp quy tắc >6 thu gọn.
- Reset `expandedSeatIds`/`networkExpandedSeatIds` về `[]` mỗi khi bắt đầu ván mới (`onStartGame`, `onJoinRoom`, và lúc ván bị huỷ giữa chừng — `game_abandoned`), đúng tiền lệ các trạng thái client-only khác.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 305 test vẫn pass (thuần UI/CSS, không đụng `core/`).
- Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat, lái qua JS thay vì click chuột mô phỏng vì công cụ trình duyệt tự động trong môi trường này hay bị chập chờn — xem ghi chú đợt 1): ván 7 người — mọi seat mặc định hiện đúng "▸ Xem trang bị (0)", bấm nút "nở" ra thành "▾ Thu gọn trang bị" + hiện khu `.cards`, bấm lại thu gọn về đúng như cũ (round-trip đúng cả 2 chiều); ván 4 người (đối chứng, không hồi quy) — không seat nào có nút thu/nở, luôn hiện đầy đủ như trước đợt này. Không lỗi console.
- **Nhánh qua mạng (ngoại lệ "seat của mình luôn đầy đủ") CHƯA kiểm lại bằng trình duyệt thật trong đợt này** — dùng CHUNG 100% hàm `renderPlayerEquipmentArea()` đã kiểm kỹ ở hotseat, phần khác biệt chỉ có đúng 1 điều kiện `player.id === view.viewerId` đã qua `tsc`, rủi ro thấp nhưng nên tự kiểm lại bằng `wrangler dev` + nhiều tab khi có dịp (đặc biệt ván >6 người qua mạng) trước khi coi là chắc chắn xong.
- **Còn lại của mục 4**: lá nhân vật hiện inline cạnh tên (mục 4 ý a) và thanh tim máu trực quan thay vì chỉ text "4/4" (mục 4 ý c) — để dành đợt khác, không nằm trong phạm vi đợt này.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

305 test đều pass.

**Giao diện UI/UX — đợt 3 (mục 9: dialog nhật ký/cài đặt/mã phòng):**

- Chủ dự án chọn làm mục 9 tiếp theo. **Bàn phạm vi dialog Cài đặt trước khi code**: đặc tả liệt kê 4 mục (âm thanh, sáng/tối, cỡ chữ, rời phòng) nhưng CẢ 4 đều CHƯA có thật trong code — hỏi lại thì chủ dự án chốt: đợt này CHỈ làm đúng 1 hành động thật ("Rời phòng"/"Về màn hình chính", tận dụng `RoomConnection.close()` đã có sẵn từ trước — comment gốc trong `net.ts` việc 3.8 đã dự trù đúng ca này: `"trừ khi chính người dùng gọi close() (vd rời phòng chủ động)"`, chỉ là chưa từng nối dây UI). Âm thanh/sáng-tối/cỡ chữ CỐ TÌNH không vẽ nút/toggle giả — dialog chỉ ghi rõ "chưa làm, để dành đợt sau" thay vì lừa người chơi bằng control không có tác dụng.
- `renderDialog()` (`ui.ts`) — dùng THẲNG thẻ `<dialog>` gốc HTML (không tự dựng overlay tay): có sẵn nền mờ `::backdrop` + tự chặn tương tác phần còn lại của trang khi `showModal()`, đúng "Dialog dùng chung một kiểu: nền mờ sau, hộp giữa, nút đóng rõ" trong đặc tả. Dùng CHUNG cho cả 3 dialog (nhật ký/cài đặt/mã phòng) ở CẢ hotseat lẫn qua mạng.
- `renderGameToolbar()` — hàng nút cố định góc trên phải (`position: fixed`, `style.css`), thay HẲN khu nhật ký cố định luôn hiện trước đây (`renderLog()` cũ bị xoá, tách nội dung ra `renderLogDialogBody()` dùng bên trong dialog). Hotseat có 2 nút (Nhật ký/Cài đặt); qua mạng có thêm nút thứ 3 (Mã phòng/Mời — hotseat không có mã phòng).
- Trạng thái "dialog nào đang mở" là CLIENT-ONLY (`logDialogOpen`/`settingsDialogOpen`/`networkRoomCodeDialogOpen`... ở `main.ts`), giống hệt `expandedSeatIds` — reset về đóng hết mỗi khi bắt đầu ván mới/rời phòng/ván bị huỷ.
- **Lỗi phát hiện lúc tự kiểm bằng trình duyệt tự động (đã sửa)**: dựng 1 thử nghiệm cô lập (`<dialog>` trần, không liên quan code của dự án) xác nhận sự kiện `close` của `<dialog>` KHÔNG bắn trong môi trường trình duyệt tự động ở đây dù gọi `.close()` vẫn chạy đúng (thuộc tính `open` về `false` ngay, nhưng sự kiện `close` không bao giờ tới, kể cả chờ 1.5 giây) — khiến nút "Đóng" (chỉ gọi `dialog.close()` rồi dựa vào sự kiện để đồng bộ state) để lại 1 `<dialog>` "xác" còn nguyên trong DOM (`open=false` nhưng chưa bị `render()` dọn), và bấm mở dialog KHÁC ngay sau đó xếp CHỒNG 2 `<dialog>` cùng mở. Sửa: nút "Đóng" giờ gọi TRỰC TIẾP `onClose()` NGAY sau `dialog.close()` (không chờ sự kiện), giữ lại `dialog.addEventListener("close", onClose)` chỉ để đồng bộ khi đóng bằng cách KHÁC (vd phím Esc) — gọi `onClose()` 2 lần (nếu trình duyệt thật của người chơi CÓ bắn sự kiện) vô hại vì chỉ là `set false + render()`, idempotent.
- Test riêng: `onNetworkCopyRoomCode()` dùng `navigator.clipboard.writeText()` (API bất đồng bộ CỦA TRÌNH DUYỆT, không phải chờ người chơi khác — không vi phạm quy tắc 4 CLAUDE.md, quy tắc đó chỉ áp dụng trong `core/`), có nhánh lỗi rõ ràng nếu trình duyệt/thiết bị chặn Clipboard API (vd không phải HTTPS) thay vì im lặng thất bại.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 305 test vẫn pass (thuần UI/CSS, không đụng `core/`).
- Đã tự kiểm bằng trình duyệt thật: **hotseat** (`vite dev`) — toolbar đúng 2 nút, dialog Nhật ký hiện đúng log thật, dialog Cài đặt hiện đúng ghi chú "chưa làm" + nút "Về màn hình chính" đưa đúng về trang chủ; đóng/mở lại dialog KHÔNG còn xếp chồng (xác nhận lỗi trên đã sửa đúng, dialog count về 0 sau khi đóng). **Qua mạng** (`wrangler dev` cục bộ + 2 tab thật, tạo phòng bằng mã, chơi 2 người tới bàn thật) — toolbar đúng 3 nút, dialog Mã phòng hiện đúng mã phòng thật; bấm "Rời phòng" ở 1 tab: tab đó quay về trang chủ NGAY, KHÔNG tự nối lại (đợi 2 giây xác nhận vẫn ở trang chủ, đúng ý `closedByUser`); tab còn lại tự nhận đúng thông báo "Ván vừa bị huỷ vì không đủ người chơi còn kết nối" (đúng cơ chế có sẵn từ việc 4.3, xác nhận nút Rời phòng mới không phá vỡ luồng cũ). Log server (`wrangler dev`) sạch, không lỗi/crash trong suốt quá trình (chỉ có 404 ảnh sprite quen thuộc, không liên quan).
- **Còn lại của mục 9**: nút tra luật nhanh (tuỳ chọn theo đặc tả, chưa làm). Âm thanh/sáng-tối/cỡ chữ trong dialog Cài đặt để dành đợt khác (cần xây tính năng thật trước, không phải việc UI thuần).
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

305 test đều pass.

**Giao diện UI/UX — đợt 4 (mục 5: cảnh báo riêng Dynamite/Jail):**

- Rà lại mục 5 (khu trang bị) thấy 2/3 ý đã đạt sẵn từ trước (không phải việc mới): "phải chứa nhiều lá, bố cục không vỡ" — `renderEquipmentSection()`/`networkRenderEquipmentSection()` đã dùng class `.cards` có `flex-wrap: wrap` sẵn từ Giai đoạn 4; "súng đang cầm có dấu hiệu + tầm bắn" — đã làm ở việc nhỏ bổ sung trước 4.3 (`Súng Volcanic (1)`...). Đợt này chỉ còn đúng ý cuối: "Cảnh báo riêng: Dynamite (đang đếm), Jail (bị giam)".
- `cardChip()`/`cardButton()` (`ui.ts`) đã có sẵn tham số `modifierClass` dùng chung — thêm hàm `equipmentDangerClass(cardName)` trả về class CSS mới `card-box--danger` + 1 trong 2 class con `card-box--danger-dynamite`/`card-box--danger-jail` (khác biệt icon). Chỉ tính "nguy hiểm" khi lá đã NẰM TRÊN SÂN (`player.equipment`) — trong tay chưa đánh ra thì chưa kích hoạt gì nên không cảnh báo, đúng luật.
- CSS (`style.css`): `.card-box--danger` dùng `outline` màu đỏ duy nhất của chrome (biến `--color-danger`, đúng mục 1 — không thêm màu mới) + 1 badge tròn góc trên phải chứa icon (`::after`, `content: "💣"` cho Dynamite / `"🔒"` cho Jail) — khai báo SAU `--checked`/`--armed` để badge nguy hiểm luôn thắng nếu trùng (hiếm khi xảy ra).
- Áp dụng ở CẢ `renderEquipmentSection()` (hotseat) lẫn `networkRenderEquipmentSection()` (qua mạng) — 2 hàm luôn đi cặp với nhau từ trước tới giờ (xem tiền lệ mọi đợt UI khác).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 305 test vẫn pass (thuần UI/CSS, không đụng `core/`).
- Đã tự kiểm bằng trình duyệt thật (`vite dev`): dựng trực tiếp 2 khối `.card-box` mang đủ 2 class cảnh báo để xem cận cảnh (không ép chơi thật nhiều lượt chỉ để chờ rút được đúng Dynamite/Jail — logic gắn class đã qua `tsc`, phần cần mắt kiểm chỉ là CSS/icon hiển thị đúng) — xác nhận viền đỏ + badge góc hiện đúng, icon 💣/🔒 hiện rõ ràng, phân biệt được 2 loại cảnh báo. Không lỗi console.
- **Còn lại của `GIAO-DIEN-UI-UX.txt`**: mục 4 (2 ý nhỏ còn thiếu: lá nhân vật hiện inline cạnh tên, thanh tim máu trực quan), mục 6 (thanh hành động theo ngữ cảnh — có thể đã đạt sẵn một phần, chưa rà lại), mục 7 (giữa bàn — có thể đã đạt sẵn một phần), mục 8 (phần còn lại: băng thông báo đầu bàn cho chuỗi phản ứng lồng nhau), mục 9 (còn lại: nút tra luật nhanh, toggle âm thanh/sáng-tối/cỡ chữ thật). Để dành đợt sau.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

305 test đều pass.

**Giao diện UI/UX — đợt 5 (mục 4: viên đạn thay tim máu + lá nhân vật inline cạnh tên):**

- Chủ dự án chọn làm mục 4 tiếp theo, kèm 1 thay đổi so với đặc tả gốc: đặc tả gợi ý "dãy tim (đầy/rỗng)" cho máu, chủ dự án CHỐT đổi thành **viên đạn** cho đúng chủ đề game — chưa có ảnh chân thật thì làm placeholder trước, bổ sung ảnh sau (đúng tinh thần `LO-TRINH.md`/việc 4.6: "có ảnh tới đâu gắn tới đó").
- **Phát hiện lúc rà mục 4 ý a (lá nhân vật cạnh tên)**: hotseat có thể làm ngay (`PlayerState.characterId` đã có sẵn), nhưng bản MẠNG thì KHÔNG — `PlayerHandView` (`core/view.ts`) trước giờ chưa từng có field `characterId`, dù đây là thông tin CÔNG KHAI hoàn toàn (đặt ngửa lên bàn ngay khi chọn xong, xem comment sẵn có ở `CHARACTER_CHOSEN` trong `types.ts`). Đã hỏi chủ dự án trước khi sửa `core/view.ts` (đúng quy tắc CLAUDE.md) — được đồng ý. Thêm `PlayerHandView.characterId: string | null`, gán thẳng từ `player.characterId` trong `viewFor()`, không lọc/ẩn gì (khác `hand`).
- `ui.ts`: `renderHpTrack(hp, maxHp)` — vẽ hàng `.hp-bullet` (đầy/rỗng) + số "3/4" đi kèm. Khác lá bài (ảnh lỗi thì CHỈ ẩn ảnh, còn tên chữ đọc được thay thế) — viên đạn không có "chữ" để thay, nên mỗi `.hp-bullet` LUÔN có sẵn 1 hình viên đạn vẽ bằng CSS thuần (chỉ thang xám, đúng mục 1 — không phải màu lá bài) làm nền; `<img>` trỏ `/sprites/bullet-full.png`/`/sprites/bullet-empty.png` (quy ước đường dẫn TRƯỚC, CHƯA có file, giống mọi sprite khác) chỉ là lớp phủ đẹp hơn CHỒNG lên khi có ảnh thật, không phải điều kiện để đọc được máu bao nhiêu.
- `characterChip()` thêm tham số `mini` (class CSS mới `card-box--mini`, thu nhỏ `.card-box` chuẩn) — dùng cho lá nhân vật dán sát cạnh tên trong ô người chơi, khác bản cỡ thường ở màn hình Chú giải/kết thúc ván.
- `renderPlayer()` (hotseat) và `networkRenderPlayer()` (mạng): heading cũ (chỉ `<h3>` tên) đổi thành `.player__heading-row` (flex) chứa `characterChip(characterId, true)` (nếu có) + `<h3>` tên; dòng "Vai · Máu · Còn sống" (`roleAndHp`) đổi từ `textContent` phẳng sang ghép `appendChild` xen `renderHpTrack()` vào giữa (TypeScript báo lỗi khi thử `Element.append(...)` trộn chuỗi + Node do overload giới hạn của `lib.dom` bản đang dùng — sửa bằng `appendChild(document.createTextNode(...))` từng phần thay vì đổi cấu hình biên dịch).
- Test mới: `test/view.test.ts` (+1 test: `characterId` công khai với MỌI người xem, không riêng chính mình).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 306 test đều pass (305 cũ + 1 test mới).
- **CHƯA tự kiểm bằng trình duyệt thật trong đợt này** — extension trình duyệt tự động không kết nối được ở phiên làm việc này (khác mọi đợt UI trước, luôn kiểm bằng `vite dev`/`wrangler dev` + trình duyệt thật). Chỉ dựa trên `tsc`/test/build sạch. **NÊN tự kiểm lại bằng mắt** (cả hotseat lẫn qua mạng) khi có dịp trước khi coi là chắc chắn đúng — đặc biệt xem thử hàng viên đạn có xếp gọn không tràn dòng, và lá nhân vật mini có canh đúng cạnh tên không.
- **Còn lại của mục 4**: không còn ý nào — cả 3 ý (lá nhân vật, tim/viên đạn, khu trang bị theo mức hiển thị) đã đủ.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

306 test đều pass.

**Giao diện UI/UX — đợt 6 (mục 8: băng thông báo phản ứng đầu bàn):**

- Chủ dự án chọn làm mục 8 tiếp theo. Rà lại thấy phần "seat phải phản ứng: viền đỏ nhấp nháy, seat khác mờ" đã xong từ đợt 1 (`player--targeted`) — đợt này chỉ còn đúng phần "băng thông báo": trước đây `renderPendingPanel()`/`networkRenderPendingPanel()` chỉ là 1 `.panel` xám thường, tiêu đề chung chung ("Đang chờ xử lý:") rồi LẶP LẠI mô tả đỉnh stack lần nữa trong danh sách ("Đang chờ: ...") — không nổi bật, không có đồng hồ đi kèm dù qua mạng đã sẵn `DeadlineInfo`.
- Viết lại CẢ 2 hàm (hotseat + qua mạng) theo cùng 1 cấu trúc: dòng ĐẦU (`.reaction-banner__head`, in đậm, icon "⚠") hiện THẲNG mô tả đỉnh stack — không còn tiêu đề chung chung + lặp lại nữa; các mục còn lại trong stack (nếu có) gộp thành 1 dòng phụ mờ ("+N việc khác đang chờ...") kèm danh sách "Sắp tới: ..." bên dưới. Đỉnh stack đổi tới đâu (Gatling→Barrel→draw!...) banner tự cập nhật tới đó vì vẫn đọc `pending[pending.length-1]` mỗi lần vẽ, không đổi gì logic đó.
- **Gộp đồng hồ vào thẳng băng thông báo (chỉ qua mạng, hotseat không giới hạn giờ)**: `networkRenderPendingPanel()` nhận thêm tham số `deadline: DeadlineInfo | null`. Tận dụng đúng bất biến sẵn có ở `room.ts`'s `determineActiveDecision()` — `pending` khác rỗng ⟺ deadline (nếu có) LUÔN đúng kind `"reactive"` khớp đúng `top.player` — nên không cần so khớp lại `playerId`, chỉ cần kiểm `pending.length > 0` ở nơi gọi (`renderNetworkGame()`) rồi truyền thẳng `options.deadline` hay `null`. `renderCountdown()` (đồng hồ LƯỢT/bỏ bài thừa đứng riêng như cũ) giờ CHỈ gọi khi `pending.length === 0` — tránh hiện 2 đồng hồ cùng lúc cho 2 khái niệm khác nhau.
- **Thêm dòng nhắc rõ đồng hồ nào đang chạy** (đúng câu chữ mục 8: "thể hiện rõ đồng hồ nào đang chạy"): khi có phản hồi đang chờ VÀ `turnPhase === "play"`, banner thêm 1 dòng phụ "(Đồng hồ lượt của `<tên người đang tới lượt>` đang tạm dừng, chờ xong việc trên sẽ tiếp tục.)" — đúng luật đã cài từ việc 4.1 (đồng hồ lượt tạm dừng khi có ai phải phản hồi), giờ NÓI RÕ ra thay vì để người chơi tự suy luận.
- CSS: `.reaction-banner` (viền trái dày `--color-border-strong`, chuyển sang `--color-danger` khi còn ≤10s qua modifier `--urgent`) thay hẳn `.panel` cho riêng loại thông báo này — CỐ TÌNH KHÔNG dùng animation nhấp nháy ở banner (khác `.player--targeted`) vì nội dung banner đổi liên tục theo từng lần RESPOND, nhấp nháy dễ giật hình; nhấp nháy thật vẫn chỉ ở viền seat (ổn định hơn giữa các lần vẽ). Xoá `.pending-heading`/`.pending-item--current` (không còn dùng — logic đỉnh giờ nằm hẳn trong `__head`, không phải 1 `<li>` trong list nữa).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 306 test vẫn pass (thuần UI/CSS, không đụng `core/`, không cần test Vitest mới).
- Đã tự kiểm bằng trình duyệt thật (extension kết nối lại được sau khi thử lại — khác lúc đầu phiên báo lỗi): **hotseat** (`vite dev`, 4 người) — dựng An đánh Bang! vào Bình, xác nhận banner hiện đúng "⚠ Đang chờ: Bình đỡ Bang! bằng Missed! (hoặc chịu mất máu)" viền trái xám dày, kèm seat Bình viền đỏ "⚠ cần phản hồi" đúng như đợt 1. **Qua mạng** (`wrangler dev` cục bộ + 2 tab thật, tạo phòng mã `TEST01`) — Bình đánh Bang! vào An, xác nhận banner hiện ĐÚNG CẢ 3 PHẦN gộp chung: `"⚠ Đang chờ: An đỡ Bang! bằng Missed! (hoặc chịu mất máu)"` + `"⏱ Còn Xs"` (đếm lùi thật, không phải giả lập) + `"(Đồng hồ lượt của Binh đang tạm dừng, chờ xong việc trên sẽ tiếp tục.)"` — cả 3 dòng đúng như thiết kế; để An timeout không phản hồi (không đỡ Missed!) — hết giờ tự động trừ đúng 1 máu (4→3), banner tự biến mất, đồng hồ lượt của Bình TIẾP TỤC đếm từ số giây còn lại (không cấp lại 60s mới) — xác nhận đúng luôn cả phần "đồng hồ lượt tạm dừng rồi tiếp tục" chứ không chỉ hiện chữ suông. Không lỗi console ở cả 2 tab trong suốt quá trình.
- **Chưa dựng được tình huống chuỗi lồng nhau thật (Gatling→Barrel→draw!) trong lần kiểm này** — chỉ kiểm 1 tầng Bang!→Missed!. Logic "banner luôn đọc đỉnh stack" không đổi gì so với code cũ đã chạy đúng nhiều đợt trước, rủi ro thấp nhưng nên thử lại khi gặp đúng tình huống trong ván thật.
- **Còn lại của `GIAO-DIEN-UI-UX.txt`**: mục 6 (thanh hành động theo ngữ cảnh — có thể đã đạt sẵn một phần, chưa rà lại theo đúng đặc tả), mục 7 (giữa bàn — có thể đã đạt sẵn một phần), mục 9 (còn lại: nút tra luật nhanh, toggle âm thanh/sáng-tối/cỡ chữ thật). Để dành đợt sau.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

306 test đều pass.

**Giao diện UI/UX — đợt 7 (mục 7: khu giữa bàn — bộ bài rút/chồng bỏ):**

- Chủ dự án chọn làm mục 7 tiếp theo. Trước đây bộ bài rút + chồng bỏ chỉ là 1 dòng CHỮ trong `summary` ("Bộ bài còn N lá · Chồng bỏ N lá (mặt trên: ...)") — không có hình ảnh gì, khác hẳn cách mọi lá bài khác trong dự án đã hiện bằng `.card-box` từ việc 4.6.
- Hàm mới `renderTableCenter(deckCount, discardPile)` (`ui.ts`) — DÙNG CHUNG cho cả hotseat (`renderApp`, đọc `state.deck.length`/`state.discardPile`) lẫn qua mạng (`renderNetworkGame`, đọc `view.deckCount`/`view.discardPile` — cả 2 field này vốn đã CÔNG KHAI sẵn trong `PlayerView`, không cần sửa `core/view.ts`). Vẽ 2 cụm cạnh nhau:
  - **Bộ bài rút**: LUÔN úp (đúng luật — không lộ lá nào, kể cả hotseat dù `state.deck` là mảng đầy đủ). Chưa có ảnh mặt sau thật → `renderDeckPileBox()` dùng `appendCardVisual()` với `deckBackImageUrl()` (quy ước đường dẫn `/sprites/card-back.png` TRƯỚC, giống mọi sprite khác) + nền hoa văn gạch chéo vẽ bằng CSS (`.card-box--deck-back`, chỉ thang xám đúng mục 1) LUÔN hiện sẵn — ảnh thật sau này chỉ là lớp phủ chồng lên, giống cách `.hp-bullet`/`.hp-track__image` đã làm ở đợt 5.
  - **Chồng bài bỏ**: lá mặt trên NGỬA thật, dùng lại `cardChip()` có sẵn (đúng lá cụ thể, viền màu theo loại lá như mọi nơi khác) — không cần thêm gì mới. Chồng trống (đầu ván) hiện 1 ô "(trống)" thay vì gọi `cardChip()` với `undefined`.
  - Mỗi cụm có dòng chú thích số lượng riêng (`Còn N lá` / `Đã bỏ N lá`) — thay cho chữ nhồi chung 1 dòng như trước.
- `summary` (dòng đầu bàn chơi) rút gọn lại CHỈ còn "Giai đoạn lượt: ..." + "VÁN KẾT THÚC — thắng: ..." (nếu có) — phần bộ bài/chồng bỏ đã chuyển hẳn sang khu vực trực quan mới, không còn lặp lại 2 nơi.
- CSS mới (`style.css`): `.table-center` (flex hàng ngang) + `.table-center__pile`/`.table-center__caption`/`.table-center__empty-pile` + `.card-box--deck-back` (gạch chéo `repeating-linear-gradient` 2 màu xám của chrome).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 306 test vẫn pass (thuần UI/CSS, không đụng `core/`, `cardFaceLabel()` vẫn còn dùng ở nơi khác nên không xoá).
- Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat 4 người, chơi thật không giả lập): đầu ván hiện đúng "Bộ bài" (gạch chéo xám) + "Còn 63 lá", "(trống)" + "Đã bỏ 0 lá"; Chi chọn nhân vật Lucky Duke, bị Thuốc nổ tự kiểm tra đầu lượt (đúng hook `hasLuckyDraw` — lật 2 lá, cả 2 vào chồng bỏ) — sau khi bấm "Lật bài", khu giữa bàn cập nhật ĐÚNG NGAY: bộ bài "Còn 61 lá" (giảm đúng 2), chồng bỏ hiện thật lá ngửa cuối cùng ("Bang!") + "Đã bỏ 2 lá" — xác nhận `discardPile[length-1]` (không phải lá kiểm tra chính) hiện đúng làm lá mặt trên, khớp đúng thứ tự Lucky Duke đẩy cả 2 lá vào chồng bỏ. Không lỗi console trong suốt phần đã kiểm.
- **Chưa kiểm tiếp được các bước sau (rút bài, đánh bài tiếp) trong cùng lần này** — công cụ trình duyệt tự động bị chập chờn giữa chừng (viewport co nhỏ bất thường còn 458×139px, screenshot timeout lặp lại — đúng kiểu sự cố đã ghi nhận ở các đợt UI/UX trước), đã dừng lại thay vì cố lặp lại thao tác đang lỗi. Phần đã kiểm được (hiện đúng cả 2 cụm, cập nhật đúng sau 1 lần đổi state thật) đủ để xác nhận logic chính đúng; nên tự kiểm lại việc bấm "Rút bài"/đánh 1 lá NÂU (để chồng bỏ đổi lá mặt trên lần 2) khi có dịp.
- **Còn lại của `GIAO-DIEN-UI-UX.txt`**: mục 6 (thanh hành động theo ngữ cảnh), mục 9 phần còn lại (nút tra luật nhanh, toggle âm thanh/sáng-tối/cỡ chữ thật). Để dành đợt sau.
- **CHƯA deploy lên link công khai** — chỉ mới kiểm cục bộ. Cần `npm run deploy` khi chủ dự án xác nhận.

306 test đều pass.

**Sửa lỗi bổ sung sau đợt 7 — lá nhân vật cạnh tên bị lép (phát hiện khi chủ dự án hỏi tại sao "link công khai" chưa thấy bàn tròn — hoá ra đang test bản CŨ, chưa deploy 7 đợt UI/UX; tiện thể rà thêm phát hiện lỗi này):**

- `characterChip(characterId, mini)` (đợt 5, mục 4 ý a) dùng class `card-box--mini` để thu nhỏ khung nhân vật dán cạnh tên — nhưng `.card-box--mini { width: 2.2rem }` (khai báo ở dòng ~207) và `.card-box { width: 4.5rem }` (khai báo SAU, dòng ~293) CÙNG độ ưu tiên CSS (1 class), nên rule khai báo SAU trong file (`.card-box`) THẮNG — width thực tế vẫn 4.5rem (72px, đo được qua DOM thật), chỉ có `.card-box__image-wrap`/`.card-box__name` (selector 2 class, ưu tiên cao hơn) là thật sự bị ép nhỏ theo `--mini` → kết quả: khung rộng bằng lá thường (72px) nhưng bị ép LÉP xuống chỉ 44px cao (thay vì 78-89px như lá thường) — không phải "thu nhỏ đều" như ý định ban đầu.
- Chủ dự án yêu cầu thẳng: cho kích thước lá nhân vật BẰNG với các lá khác — thay vì sửa lại bug thu nhỏ cho đúng tỉ lệ, bỏ hẳn khái niệm "mini": `characterChip()` bỏ tham số `mini`, luôn dùng đúng kích thước `.card-box` chuẩn (72×78/89, y hệt mọi lá bài khác). Xoá hẳn CSS `.card-box--mini` (không còn nơi nào dùng).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass, `npm run build` qua.
- Đã tự kiểm bằng trình duyệt thật (`vite dev`, hotseat 4 người, đo qua DOM `getBoundingClientRect()` thật chứ không chỉ nhìn ảnh chụp): trước khi sửa, lá nhân vật cạnh tên đo được 72×44px; sau khi sửa, đo đúng 72×78/89px — bằng CHÍNH XÁC với lá bài thường cạnh đó trong cùng khung hình. Đánh 1 lá Bang! thật (tình huống lồng: chồng bỏ đổi lá mặt trên, băng thông báo phản ứng đợt 6 hiện đúng, seat viền đỏ đúng) — xác nhận không có hồi quy gì ở các đợt UI/UX trước.
- **Xác nhận qua hỏi trực tiếp: chủ dự án đang test trên LINK CÔNG KHAI** (`bang-boardgame.nguyenngoctuan548.workers.dev`), bản đó còn CŨ hơn cả đợt 1 UI/UX (bàn tròn, màu chrome... đều chưa lên) — đây là lý do "cơ chế ngồi theo vòng chưa có" khi tự test, KHÔNG PHẢI bug code (`seatAngleDeg()`/`.seats`/`@media (min-width: 700px)` đã cài đúng từ đợt 1, đã tự kiểm qua `wrangler dev` nhiều lần).
- **ĐÃ DEPLOY** (`npm run deploy`, chủ dự án xác nhận trực tiếp) — bản công khai giờ có ĐỦ cả 7 đợt UI/UX (đợt 1-7) + fix lá nhân vật ở trên. Tự kiểm lại NGAY TRÊN link công khai thật (không phải cục bộ): script bundle đúng hash bản vừa build (`index-DTkM7rlo.js`), chơi thử hotseat trên chính link live — lá nhân vật cạnh tên đo qua DOM đúng 72×78/90px (bằng lá bài khác, không còn lép). Bàn tròn qua mạng CHƯA kiểm lại trên link live trong lần deploy này (chỉ kiểm hotseat) — nên tự chơi thử qua mạng thật với bạn bè để xác nhận nốt.

306 test đều pass.

**Sửa theo phản hồi thật từ chủ dự án sau khi tự chơi bàn tròn qua mạng trên link công khai (gửi kèm 2 ảnh chụp màn hình):**

- **Bài trên tay/trang bị bị vỡ thành lưới 2 cột** — `.player--seat` (bàn tròn, đợt 1) trước đó có `width: 14rem` CỐ ĐỊNH, không đủ chỗ cho nhiều lá nên `.cards` (flex-wrap: wrap) buộc phải xuống dòng. Sửa: `.player--seat` đổi sang `min-width: 14rem; width: max-content; max-width: 36rem` (tự nới theo nội dung, chỉ seat CỦA MÌNH thật sự nới nhiều vì seat người khác chỉ hiện số lá ẩn, không cần rộng); `.player--seat .cards` thêm `flex-wrap: nowrap; overflow-x: auto` làm lưới đỡ (cực hiếm khi tay quá nhiều lá vượt 36rem mới cần cuộn ngang, không bao giờ vỡ dòng nữa). KHÔNG đụng gì `.cards` ở hotseat/danh sách dọc (2 nơi đó không lồng trong `.player--seat`).
- **Bỏ mờ (opacity) cho seat "đang chờ"** — đặc tả gốc mục 1 ghi "chưa tới lượt thì MỜ đi" (`​.player--waiting { opacity: 0.6 }`), nhưng chủ dự án phản hồi trực tiếp: mờ khiến người chưa tới lượt trông như đã bị loại/chết rồi (dễ nhầm với `.player--dead`, mờ nặng hơn — 0.4). Bỏ hẳn opacity ở `.player--waiting`, giữ nguyên `.player--dead` (đã chết THẬT SỰ nên vẫn cần mờ + gạch tên).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass (thuần CSS, không đụng `core/`/`ui.ts`).
- Đã tự kiểm bằng `wrangler dev` cục bộ + 4 tab thật (An/Bình/Chi/Dũng, qua đúng luồng lobby→chọn nhân vật→bàn chơi thật, không giả lập gì) — đo qua DOM thật (`getBoundingClientRect()`/`scrollWidth`/`getComputedStyle()`, không chỉ nhìn ảnh chụp): seat của An (7 lá trên tay: Missed!, Súng Schofield, Panic!, Bia, Cat Balou, Missed!, Panic!) tự nới rộng đúng 575px, khu `.cards` bên trong 538px = `scrollWidth` — khớp hệt `clientWidth`, nghĩa là ĐỦ 7 lá nằm 1 hàng ngang, KHÔNG cần cuộn; 3 seat còn lại (Bình/Chi/Dũng, tay ẩn) vẫn gọn 264px như cũ, không bị ảnh hưởng. Cả 3 seat "waiting" đo `getComputedStyle().opacity === "1"` (hết mờ), seat An (`--current`) cũng `opacity: 1` như trước.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.

306 test đều pass.

**Sửa/bổ sung theo phản hồi thật lần 2 từ chủ dự án (sau khi chơi thử bàn tròn qua mạng đã sửa lần 1):**

- **Fix: thanh nút góc trên (`.game-toolbar`) đè lên seat trên cùng** — trước `position: fixed` (nổi, không chiếm chỗ trong luồng tài liệu) khiến seat ở đỉnh hình elip dễ bị 3 nút (Nhật ký/Cài đặt/Mã phòng) che khuất. Đổi sang `position: sticky` + chuyển lời gọi `renderGameToolbar()` lên NGAY ĐẦU `renderApp()`/`renderNetworkGame()` (ngay sau `renderOrientationLockOverlay()`, trước mọi nội dung khác) — giờ nó chiếm 1 hàng thật ở đầu trang, mọi nội dung sau luôn bắt đầu bên dưới, không bao giờ đè nhau; vẫn dính lại ở top khi cuộn trang (đúng tinh thần "luôn thấy được" ban đầu).
- **Bổ sung: hiện vai (role) ngay từ màn hình chọn nhân vật** — dữ liệu `role` vốn đã có sẵn từ `setupGame()` (gán ngay cả khi đang chờ chọn nhân vật, chỉ `hp`/`hand` mới tạm 0), chỉ là UI chưa hiện. Thêm 1 dòng "Vai: ..." vào cả `renderCharacterSelectionScreen()` (hotseat — hiện vai THẬT của MỌI người, đúng mô hình "không giấu gì" đã có của hotseat) và `renderNetworkCharacterSelectionScreen()` (qua mạng — dùng thẳng `view.players[].role` đã qua `viewRole()` lọc đúng quy tắc 6: chỉ chính mình + Sheriff công khai, người khác vẫn "(ẩn)", không lộ thêm gì so với lúc vào bàn chơi thật).
- **Fix: seat nhân vật khác thỉnh thoảng giãn ra đè lên seat cạnh bên** — nguyên nhân: bản sửa "dàn hàng ngang" trước đó (đợt phản hồi lần 1) cho MỌI seat cùng `width: max-content` (tự nới theo nội dung) để tránh vỡ lưới 2 cột, nhưng seat NGƯỜI KHÁC (không phải mình) hiện trang bị công khai — nếu ai đó có vài lá trang bị, seat họ cũng nới ra và có thể chồng lên seat kế bên (định vị `position: absolute` quanh hình elip, không seat nào "biết" né seat khác). Sửa: chỉ seat CỦA CHÍNH MÌNH (class mới `player--seat-self`, gán ở `networkRenderPlayer()` khi `player.id === view.viewerId`) mới được `width: max-content` (tối đa 36rem); seat người khác quay lại `width: 14rem` CỐ ĐỊNH an toàn — lá trang bị/tay ẩn của họ tràn thì tự cuộn ngang (`.player--seat .cards { flex-wrap: nowrap; overflow-x: auto }`, áp dụng chung mọi seat) thay vì nới box.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass (thuần UI/CSS, không đụng `core/`).
- Đã tự kiểm bằng `wrangler dev` cục bộ + 4 tab thật (An/Bình/Chi/Dũng, đúng luồng lobby→chọn nhân vật→bàn chơi, không giả lập) — đo qua DOM thật: màn chọn nhân vật, tab An thấy đúng "Dung — Vai: Cảnh sát trưởng" (Sheriff công khai), "Chi — Vai: (ẩn)" (người khác), "An (bạn) — Vai: Tội phạm" (vai chính mình); sau khi cả 4 chọn xong vào bàn chơi thật, đo `getBoundingClientRect()`: toolbar nằm y 90-129px, CẢ 4 seat đều bắt đầu từ y ≥ 259px (`overlapsToolbar: false` cho tất cả); seat An (chính mình) rộng 339px (đã nới), 3 seat còn lại (Dung/Chi/Binh) đều đúng 224px (14rem) cố định, không seat nào chồng lấn seat khác. Không lỗi console.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.
- **Chủ dự án nêu thêm 2 điểm, CHỐT để dành bàn sau (chưa sửa gì)**: (1) trên điện thoại web, bàn tràn ra ngoài màn hình mà không kéo/cuộn/co giãn được; (2) các mốc thời gian đếm ngược (`pending`) trong ván có vẻ chưa đúng. Cả 2 đợi bàn kỹ hơn ở lượt sau, KHÔNG tự đoán rồi sửa.

306 test đều pass.

**Sửa mốc thời gian timeout theo phản hồi thật lần 3 từ chủ dự án (chốt lại toàn bộ quy tắc timeout, thay cho bộ số cũ đoán chưa đúng):**

- Chủ dự án CHỐT rõ quy tắc: **lượt đánh bài 60s** + **bỏ bài thừa cuối lượt +15s** (2 mốc này giữ nguyên, đã đúng từ việc 4.1) — còn **MỌI hành động khác đều 15s như nhau**: đỡ Missed!/Đấu tay đôi/Người da đỏ, Cat Balou/Cửa hàng tổng hợp chọn lá, hạ Bang! ngoài lượt (Duel/Indians!/Calamity Janet), Pedro Ramirez/Jesse Jones/Kit Carlson tự quyết đầu lượt, VÀ chọn nhân vật đầu ván — tất cả trước đó đang SAI (10s cho nhóm "reactive", 30s riêng cho chọn nhân vật), giờ gộp về đúng 1 mốc 15s.
- `src/server/room.ts`: đổi `REACTIVE_MS` từ `10_000` → `15_000`, `CHARACTER_SELECTION_MS` từ `30_000` → `15_000`. Không đổi `PLAY_PHASE_MS` (60_000)/`DISCARD_PHASE_MS` (15_000) — đã đúng sẵn. Sửa nốt vài dòng comment ở `room.ts`/`protocol.ts` còn nhắc số cũ (10 giây/30 giây) cho khỏi lạc hậu.
- **Cơ chế "đồng hồ lượt tạm dừng khi chờ người khác phản hồi"** (chủ dự án nhắc lại trong cùng phản hồi) — đã đúng sẵn từ việc 4.1/`scheduleDeadline()`, không cần sửa gì, chỉ tự kiểm lại cho chắc.
- Đây là thay đổi HẠ TẦNG (`room.ts`, không phải `core/`) — theo đúng tiền lệ mọi thay đổi timer trong dự án, KHÔNG có test Vitest, chỉ kiểm bằng `wrangler dev` + trình duyệt thật.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass (không đổi `core/`).
- Đã tự kiểm bằng `wrangler dev` cục bộ + 2 tab thật (An/Bình, ván 2 người): màn chọn nhân vật hiện "⏱ Còn 13s" ngay sau khi bắt đầu (khớp mốc mới 15s, KHÔNG còn gần 30s như trước); Bình đánh Bang! nhắm An, tab An hiện "⏱ Còn 9s" cho việc đỡ Missed! (khớp mốc mới 15s, KHÔNG còn tối đa 10s như trước) — cả 2 đo được sau vài giây độ trễ thao tác thật, nhất quán với mốc 15s; dòng "Đồng hồ lượt của Binh đang tạm dừng..." vẫn hiện đúng, xác nhận cơ chế tạm dừng không bị ảnh hưởng.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.

306 test đều pass.

**Fix: bàn tràn ngang trên điện thoại web, không kéo/cuộn/co giãn được (bàn kỹ theo yêu cầu chủ dự án):**

- **Tìm ra nguyên nhân gốc** (không phải lỗi thao tác, không phải thiếu `overflow-x`/`touch-action` gì — đã rà kỹ CSS, không có gì chặn cuộn/zoom): công thức bàn tròn từ đợt 1 UI/UX tính vị trí seat bằng **bán kính THEO PHẦN TRĂM** của container (`x = 50 + 42*cos(góc)`), nhưng seat lại có **độ rộng CỐ ĐỊNH THEO PIXEL** (14rem = 224px, tự nới thêm nữa nếu là seat của mình — xem đợt sửa "dàn hàng ngang" trước). Ở container hẹp hơn khoảng 1400px (tức HẦU HẾT màn hình thật, kể cả desktop bình thường — đã đo được `left: -34px` cho 1 seat ngay ở độ rộng cửa sổ 819px trong lần tự kiểm trước đó, lúc đó tưởng là chuyện nhỏ), `translate(-50%)` đẩy nửa seat sang toạ độ **ÂM** (âm hơn 0% của trang) — trình duyệt **KHÔNG cho cuộn sang trái để lộ toạ độ âm** (giới hạn cố hữu của cơ chế cuộn tài liệu, không phải lỗi thiết bị/thao tác của người chơi) → đúng triệu chứng "tràn ra mà không kéo/cuộn được".
- **Sửa tận gốc**: đổi hẳn cách tính vị trí — `seatCosSin()` (`ui.ts`, thay `seatPositionPercent()` cũ) chỉ trả `cos`/`sin` THÔ (không nhân bán kính), gán vào 2 biến CSS `--seat-cos`/`--seat-sin`. CSS (`style.css`) tính vị trí bằng `calc(50% + var(--seat-cos) * (50% - 7.5rem))` — bán kính giờ là "50% CONTAINER trừ ĐI 7.5rem cố định" (7rem = nửa độ rộng seat 14rem, cộng 0.5rem đệm an toàn) thay vì tỷ lệ phần trăm mù mờ — đảm bảo TOÁN HỌC không bao giờ ra toạ độ âm, bất kể container rộng bao nhiêu (đã kiểm chứng bằng số, xem bên dưới). Seat CỦA MÌNH (`.player--seat-self`, có thể nới rộng) luôn ở góc 90° (đáy bàn) nên `cos = 0` LUÔN — tự động nằm giữa theo chiều ngang bất kể rộng bao nhiêu, chỉ cần chặn `max-width: min(36rem, calc(100% - 1rem))` để không vượt quá chính độ rộng màn hình.
- Đây là thay đổi CSS/UI thuần (đổi công thức toạ độ), KHÔNG đụng `core/` — không cần test Vitest mới.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass, `npm run build` qua.
- **Sự cố môi trường phát hiện lúc tự kiểm (đã giải quyết, KHÔNG phải lỗi code):** `wrangler dev` trong phiên làm việc này tích tụ RẤT NHIỀU tiến trình "zombie" từ những lần khởi động/tắt trước đó trong cùng phiên — hoá ra lệnh `pkill -f wrangler` (Git Bash trên Windows) KHÔNG thật sự diệt được các tiến trình `node.exe` gốc Windows sinh ra từ `wrangler dev`, khiến hàng chục tiến trình treo lại tranh nhau cổng 8788, có cái phục vụ file build CŨ (hash JS khác đợt build mới nhất) → gây lỗi 404 khó hiểu khi tải bundle JS lúc tự kiểm. Xác nhận qua `wmic process where "name='node.exe'" get ProcessId,CommandLine` thấy hơn chục dòng `wrangler dev --port 8788` còn sống. Sửa bằng `taskkill //F //PID <pid>` cho ĐÚNG các PID đó (không đụng tiến trình node khác) — từ nay nên dùng `taskkill` thay `pkill` để tắt wrangler dev trên Windows.
- Đã tự kiểm bằng `wrangler dev` cục bộ (sau khi dọn sạch tiến trình cũ) + 3 tab thật (An/Bình/Chi, biến thể 3 người) — vì công cụ trình duyệt tự động trong môi trường này resize cửa sổ ra số pixel CSS không đúng (báo `innerWidth: 2276` dù đã yêu cầu resize 700px — lỗi hiển thị của chính công cụ, không phải trang), chuyển sang cách đo CHẮC CHẮN hơn: ép thẳng `.seats` về đúng độ rộng mong muốn qua `style.width` rồi đo `getBoundingClientRect()` thật của từng seat. Kết quả ở độ rộng **375px** (điện thoại thường): Chi 17-241px, Bình 134-358px, An/seat-self (đã nới 339px) 18-357px — TẤT CẢ đều dương, không seat nào âm. Ở độ rộng **320px** (điện thoại hẹp nhất còn phổ biến): Chi 13-237px, Bình 83-307px, An 8-312px — vẫn TẤT CẢ dương. Xác nhận fix đúng cả ở 2 mốc độ rộng phổ biến của điện thoại thật.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.
- **Lưu ý cho lần sau**: nếu `wrangler dev` cục bộ báo lỗi 404 khó hiểu cho file JS đã build (dù file có thật trên đĩa, `dist/index.html` cũng trỏ đúng tên) — kiểm tra `wmic process where "name='node.exe'" get ProcessId,CommandLine | grep wrangler` xem có tiến trình cũ nào còn sống trước khi debug xa hơn.

306 test đều pass.

**Fix lần 2: seat của mình vẫn tràn (cả laptop lẫn điện thoại) — tách hẳn seat của mình ra khỏi bàn tròn:**

- Chủ dự án báo lại: dù đã sửa công thức toạ độ elip (calc() an toàn ở trên), seat CỦA MÌNH vẫn tràn — cả laptop lẫn điện thoại. Đúng vậy: bản sửa trước chỉ đảm bảo TOẠ ĐỘ không âm, nhưng seat của mình vẫn phải "nhét" vào ĐÚNG 1 ĐIỂM cố định trên elip (`position: absolute`) rồi tự nới rộng (`width: max-content`) quanh điểm đó — bài trên tay có thể dài tuỳ ý (5-8 lá), không có giới hạn an toàn tuyệt đối nào cho cách làm này, đặc biệt khi elip bị bóp hẹp (điện thoại) hoặc có nhiều người khác chiếm chỗ xung quanh (laptop nhiều người chơi).
- **Sửa tận gốc theo đúng yêu cầu**: TÁCH HẲN seat của mình RA KHỎI hình elip, cho vào **1 hàng riêng nằm trong luồng tài liệu bình thường** (không `position: absolute`, không bị ép vào điểm/kích thước cố định nào) — ngay dưới bàn tròn, vẫn giữ đúng cấu trúc "người khác ngồi bàn tròn, bạn ở dưới cùng" (đúng ý gốc `GIAO-DIEN-UI-UX.txt`: "Bạn cố định ở giữa đáy", giờ rõ ràng hơn vì là 1 khối riêng hẳn).
- `ui.ts`: `networkRenderPlayer()` nhận `seatIndex: number | null` — `null` nghĩa là "hàng riêng, không phải seat trong elip": bỏ qua tính `--seat-cos`/`--seat-sin`, dùng class mới `player--own-row` thay vì `player--seat`. `renderNetworkGame()`: vòng lặp đổ vào `.seats` (elip) giờ SKIP hẳn viewer (`if (player.id === view.viewerId) return`), rồi render viewer RIÊNG bằng `networkRenderPlayer(..., seatIndex: null, ...)`, append NGAY SAU `.table` (không phải bên trong). `seatOrder`/góc của những người CÒN LẠI giữ NGUYÊN không đổi (chỗ của mình bỏ trống trong elip, không dồn lại) — vị trí người khác không xê dịch so với trước.
- CSS: xoá hẳn `.player--seat-self` (không còn dùng — `.player--seat` giờ CHỈ dành cho người khác, LUÔN đúng 14rem cố định, không cần nới rộng nữa nên không còn nguy cơ chồng lấn). Thêm `.player--own-row` (dùng chung `.player` base — không `width`/`position` gì đặc biệt, tự nhiên full độ rộng container như MỌI khối thường khác, viền đậm hơn 1 chút để phân biệt "chỗ của bạn").
- Đây là thay đổi cấu trúc UI thuần (đổi cách nhóm seat vào DOM), KHÔNG đụng `core/` — không cần test Vitest mới.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass, `npm run build` qua.
- Đã tự kiểm bằng `wrangler dev` cục bộ + 3 tab thật (An/Bình/Chi, biến thể 3 người) — đo qua DOM thật: elip (`.player--seat`) giờ CHỈ còn "Chi"/"Binh", không còn "An"; "An (bạn)" xuất hiện đúng 1 lần dưới dạng `.player--own-row` NGOÀI elip. Ép `document.body.style.maxWidth = '360px'` (mô phỏng điện thoại rất hẹp) rồi đo `scrollWidth` vs `clientWidth`: **BẰNG NHAU TUYỆT ĐỐI (360 = 360)** — xác nhận KHÔNG CÒN TRÀN NGANG chút nào, kể cả ở độ rộng cực hẹp. Không lỗi console.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.

306 test đều pass.

**Đợt bổ sung theo phản hồi thật lần 4 — cho phép thu nhỏ trên điện thoại, đổi tiêu đề, làm nốt Cài đặt, đổi "Chú giải lá bài" thành "Thư viện bài" (đủ 16 nhân vật thật):**

- **Cho phép thu nhỏ màn hình trên điện thoại**: `index.html`'s viewport meta thêm `minimum-scale=0.4` (trước chỉ có `width=device-width, initial-scale=1.0`, không giới hạn zoom nhưng cũng không NÓI RÕ cho phép zoom ra xa tới đâu) — không đụng `user-scalable`/`maximum-scale` nên vẫn zoom vào bình thường, chỉ thêm rõ ràng khả năng zoom RA để nhìn được cả bàn trên màn hình nhỏ.
- **Đổi tiêu đề web**: `<title>`/`<h1>` trong `index.html` từ "Bang! (bản tự cài lại)" còn lại đúng "Bang!".
- **Đổi "Chú giải lá bài" → "Thư viện bài" + hoàn thiện đủ 16 nhân vật thật**: tên nút ở màn hình chính + tiêu đề màn hình (`ui.ts`) đổi thành "Thư viện bài". `renderCharacterPreviewSection()` (khung xem trước 2 ô ví dụ giả, sống sót từ hồi CHƯA có nhân vật thật — việc bổ sung sau 4.6) — XOÁ HẲN, thay bằng `renderCharacterReferenceGroup()` liệt kê ĐỦ 16 nhân vật THẬT lấy trực tiếp từ `CHARACTERS` (registry thật trong `core/characters.ts`, xong từ Giai đoạn 5) — dùng lại `CHARACTER_DESCRIPTIONS` đã soạn sẵn cho màn hình chọn nhân vật (không soạn lại lần 2), kèm số máu (`bullets`) mỗi người.
- **Làm nốt dialog Cài đặt** (trước chỉ có đúng nút rời ván + dòng "chưa làm"): thêm ĐỦ 3 mục theo đặc tả gốc `GIAO-DIEN-UI-UX.txt` mục 9:
  - **Giao diện Sáng/Tối**: `applyTheme()` set `data-theme` trên `<html>`, CSS thêm bộ biến `--color-bg`/`--color-bg-alt`/`--color-bg-panel`/`--color-text`/`--color-card-border` ở `:root`, override lại dưới `html[data-theme="dark"]` — chỉ đổi biến "chrome" trung tính (nền/viền/chữ xám), KHÔNG đụng 7 màu lá bài (đúng mục 1: màu lá bài không phải màu trạng thái giao diện). Áp dụng cho `body`, `.card-box`, `.card-box__image-wrap`, `.card-box__name`, `.card-ref-item`, `.panel`, `.draw-check-notice`, `dialog.app-dialog` (native `<dialog>` UA mặc định LUÔN trắng/đen bất kể theme trang — phải set tường minh mới đổi được), `.character-option__description`.
  - **Cỡ chữ Nhỏ/Vừa/Lớn**: `applyFontSize()` gắn class `font-size-small`/`font-size-large` lên `<html>` (mặc định "vừa" không cần class) — chỉ đổi `font-size` GỐC (87.5%/118.75%), mọi đơn vị `rem` trong CSS (kể cả `.card-box` 4.5rem cố định) tự co giãn theo, không cần sửa lại từng nơi.
  - **Âm thanh**: checkbox bật/tắt + hàm `playSound(name)` (quy ước đường dẫn `/sounds/<name>.mp3` TRƯỚC, giống mọi sprite ảnh khác trong dự án — CHƯA có file thật) — `audio.play().catch(()=>{})` tự im lặng nếu thiếu file HOẶC bị trình duyệt chặn autoplay, không phân biệt 2 lý do vì cả 2 đều nên im lặng. Bật checkbox thì thử phát `ui_toggle` ngay (im lặng vì chưa có file — đúng dự kiến).
  - CẢ 3 mục là **sở thích TOÀN CỤC của trình duyệt** (không thuộc 1 ván cụ thể) — lưu thẳng `localStorage` (`bang_theme`/`bang_font_size`/`bang_sound_enabled`), state + logic áp dụng đặt LUÔN trong `ui.ts` (không cần đi qua `GameState`/`PlayerView`/`main.ts`'s render() — bấm chọn là áp dụng NGAY, không cần vẽ lại màn hình). `applyStoredSettings()` (export từ `ui.ts`) gọi 1 LẦN DUY NHẤT lúc khởi động (`main.ts`, TRƯỚC lần vẽ đầu tiên) để tránh nháy sáng/cỡ chữ mặc định rồi đổi lại ngay.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass (thuần UI/CSS/localStorage, không đụng `core/`).
- Đã tự kiểm bằng `vite dev` + trình duyệt thật: "Thư viện bài" liệt kê ĐÚNG ĐỦ 16 tên nhân vật thật (đo qua DOM, không chỉ nhìn); mở dialog Cài đặt, bấm "Tối" — đo `getComputedStyle(document.body).backgroundColor` đổi đúng thành `rgb(30,30,30)`, lưu đúng `localStorage`; bấm "Lớn" — đo `getComputedStyle(document.documentElement).fontSize` đổi đúng 16px→19px; TẢI LẠI TRANG — xác nhận giao diện Tối vẫn giữ nguyên (đọc đúng từ localStorage lúc khởi động, không cần đăng nhập/ván nào). Chụp ảnh xác nhận trực quan: nền tối, chữ sáng, viền lá bài (nâu/xanh dương/xanh lá) vẫn giữ đúng màu gốc không đổi theo theme, dễ đọc. Không lỗi console.
- **Việc TIẾP THEO thật sự (ngoài lộ trình, do chủ dự án tự làm, giống ảnh lá bài/nhân vật)**: thêm file âm thanh thật vào `public/sounds/` theo tên đã quy ước, bỏ được bao nhiêu hiện bấy nhiêu — hiện `playSound()` đã gọi ĐÚNG 1 chỗ (bấm bật checkbox âm thanh) để demo, CHƯA gắn vào các sự kiện ván đấu thật (đánh bài, mất máu, thắng/thua...) — để dành đợt sau khi có file thật, tránh code chờ tài nguyên chưa tồn tại.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.

306 test đều pass.

**Đổi hẳn layout bàn qua mạng — bỏ bàn tròn, dùng 2 hàng ngang + hàng lẻ (theo phản hồi thật lần 5, đã hỏi kỹ + xác nhận ví dụ cụ thể trước khi làm):**

- Bàn tròn (`position: absolute` quanh hình elip, đợt 1 UI/UX) đã qua 2 lần sửa công thức toạ độ nhưng vẫn tràn (lần 1: bán kính %, lần 2: seat của mình nới rộng) — chủ dự án yêu cầu bỏ HẲN cách định vị tuyệt đối, đổi sang bố cục dùng LUỒNG TÀI LIỆU bình thường (2 hàng liên tiếp trong luồng KHÔNG THỂ đè lên nhau — khác định vị tuyệt đối).
- **Đã hỏi kỹ 2 điểm còn mơ hồ trước khi code** (đúng yêu cầu "không rõ thì hỏi"), có ví dụ cụ thể kèm theo, chủ dự án xác nhận:
  1. Cách "gấp" thứ tự lượt (coi đối thủ + bản thân là 1 VÒNG KHÉP KÍN — khái niệm để tính toán, KHÔNG vẽ ra hình tròn nữa) thành 2 hàng: kiểu "gấp rắn" (boustrophedon) — nửa ĐẦU thứ tự lượt → hàng XA (trên, trái→phải); nửa SAU → hàng GẦN (dưới, sát hàng của bạn), ĐẢO NGƯỢC (phải→trái) để giữ đúng tính liền kề khi đọc nối tiếp từ hàng xa xuống hàng gần.
  2. Khi tổng số người CHẴN (đối thủ lẻ, không chia đều 2 hàng được): người dư ra tách lên 1 hàng CĂN GIỮA riêng ở trên cùng là người ở GIỮA thứ tự lượt (xa bản thân nhất trong vòng khép kín — giống vị trí 12 giờ ở bàn tròn cũ), KHÔNG PHẢI người đầu/cuối thứ tự lượt.
- `ui.ts`: xoá hẳn `seatAngleDeg()`/`seatCosSin()` (toán góc/elip không còn cần). Hàm mới `buildOpponentRows(opponents)` nhận mảng đối thủ đã xoay theo thứ tự lượt (từ `buildSeatOrder()`, không đổi) — trả về `{oddRow, farRow, nearRow}`: đối thủ CHẴN → `farRow` = nửa đầu, `nearRow` = nửa sau ĐẢO NGƯỢC, `oddRow` rỗng; đối thủ LẺ → tách phần tử GIỮA (`Math.floor(n/2)`) vào `oddRow`, phần còn lại (chẵn) chia farRow/nearRow như trên. `networkRenderPlayer()` bỏ hẳn tham số `seatIndex`/`seatTotal`, thay bằng 1 boolean `isOwnRow` (chỉ còn phân biệt "hàng riêng của mình" hay "1 trong các đối thủ", không cần tính góc gì nữa). `renderNetworkGame()` dựng 3 hàng đối thủ (`.opponent-row`, chỉ vẽ hàng nào có người) rồi mới tới hàng riêng của mình — tất cả nối tiếp nhau trong luồng tài liệu.
- CSS: xoá hẳn `.seats`/`.player--seat`/toàn bộ media query bàn tròn — thay bằng `.opponent-row` (`display:flex; flex-wrap:wrap; justify-content:center`, KHÔNG cần media query riêng cho điện thoại nữa vì flex-wrap tự lo mọi kích thước màn hình). `.player--own-row` giữ nguyên như đợt trước.
- Đây là thay đổi cấu trúc UI thuần, KHÔNG đụng `core/` — không cần test Vitest mới.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass, `npm run build` qua.
- Đã tự kiểm bằng `wrangler dev` cục bộ + 6 tab thật (P1-P6, đúng luồng lobby→chọn nhân vật→bàn chơi thật, không giả lập) — đo qua DOM: đúng 3 hàng đối thủ dựng ra (`oddRow=[P4]` 1 người căn giữa trên cùng, `farRow=[P6,P5]`, `nearRow=[P2,P3]`) + hàng riêng của P1, khớp CHÍNH XÁC thuật toán đã thống nhất; đo `getBoundingClientRect()` cả 4 hàng — `bottom` hàng trước LUÔN nhỏ hơn `top` hàng sau, KHÔNG hàng nào đè lên hàng nào; ép `document.body.style.maxWidth='360px'` (mô phỏng điện thoại) — `scrollWidth === clientWidth` (360=360), không tràn ngang dù có tới 6 người chơi. Chụp ảnh xác nhận trực quan bố cục đúng như ví dụ đã chốt. Không lỗi console.
- **Lưu ý riêng, CHƯA làm (ngoài phạm vi yêu cầu lần này)**: lớp phủ ép xoay ngang trên điện thoại (`orientation-lock-overlay`, ra đời TỪ trước để né bàn tròn cũ bị hẹp) giờ có thể không còn cần thiết nữa (layout hàng mới hoạt động tốt ở MỌI chiều màn hình, đã tự kiểm qua ép độ rộng hẹp phía trên) — nhưng đây là quyết định NGOÀI yêu cầu lần này (chỉ nói về bố cục hàng), nên CHƯA đụng vào, để chủ dự án xác nhận có muốn bỏ luôn lớp phủ đó không ở đợt sau.
- Đã deploy lại (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** sau khi sửa.

306 test đều pass.

**Fix: dùng lại 1 mã phòng đã trống hẳn từ vài ngày trước thì không ai được công nhận chủ phòng (theo báo lỗi thật từ chủ dự án):**

- **Nguyên nhân gốc**: chủ phòng trước đây lưu trực tiếp 1 giá trị `ownerId` (khoá `OWNER_KEY`) trong `ctx.storage`, chỉ được CẬP NHẬT thủ công đúng lúc `webSocketClose()`/`webSocketError()` chạy cho ĐÚNG socket của chủ phòng. Nếu vì bất kỳ lý do gì (rớt mạng đột ngột không đóng socket "sạch", hay bất kỳ ca hiếm nào khác) mà 2 hàm đó không kịp chạy trước khi phòng bị bỏ trống hẳn, `ownerId` cũ bị KẸT LẠI trong storage, trỏ tới 1 playerId không còn ai kết nối. Vài ngày sau dùng lại đúng mã phòng đó, `handleJoin()` thấy `ownerId` đã có sẵn (giá trị cũ) nên KHÔNG gán chủ phòng mới cho người vừa join — kết quả: `ownerId` gửi kèm lobby trỏ tới 1 người không tồn tại, không ai được công nhận chủ phòng.
- **Sửa tận gốc theo yêu cầu chủ dự án**: bỏ hẳn việc lưu 1 giá trị `ownerId` rời rạc cần tự tay giữ đồng bộ. Thay bằng `JOIN_ORDER_KEY` (`ctx.storage`) — 1 mảng CHỈ THÊM (không bao giờ xoá) ghi lại đúng 1 lần thứ tự "vào phòng lần đầu" của từng `playerId` (`handleJoin()` đẩy vào cuối mảng nếu chưa có). Chủ phòng giờ LUÔN được TÍNH LẠI (không đọc giá trị đã lưu): `getOwnerId()` duyệt mảng theo đúng thứ tự, trả về `playerId` ĐẦU TIÊN đang THẬT SỰ CÒN KẾT NỐI (tra qua `joinedPlayers()`, vốn đã đọc trực tiếp từ `ctx.getWebSockets()` — nguồn sự thật duy nhất, không lệ thuộc gì vào việc handler đóng socket có chạy kịp hay không).
- `handleSocketGone()` (dùng chung cho cả `webSocketClose()`/`webSocketError()`) bỏ hẳn khối code "chuyển quyền chủ phòng thủ công" — không còn cần thiết, vì `getOwnerId()` tự tính đúng ngay lần gọi tiếp theo (broadcast lobby cuối hàm). Thêm tham số `excludeSocket` cho `getOwnerId()` (giống `joinedPlayers()` đã có sẵn) — dùng đúng lúc socket vừa đóng có thể vẫn còn bị `ctx.getWebSockets()` liệt kê, tránh tính nhầm người vừa rời làm chủ phòng ở đúng broadcast cuối cùng đó.
- Đây là thay đổi hạ tầng mạng (`room.ts`), không đụng `core/` — theo đúng tiền lệ cả dự án, không có test Vitest riêng.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 306 test vẫn pass.
- Đã tự kiểm bằng `wrangler dev` cục bộ + script Node mô phỏng WebSocket thật (không phải trình duyệt tự động, để tránh chập chờn đã gặp nhiều lần trước đó) — đúng kịch bản lỗi thật: An join (thành chủ) → Bình join (An vẫn chủ) → An rời (Bình tự thành chủ, đúng hành vi cũ vẫn giữ nguyên) → Bình cũng rời (phòng trống hẳn) → chờ 1 giây rồi Chi join lại ĐÚNG mã phòng đó (mô phỏng "dùng lại phòng cũ vài ngày sau") → **Chi được công nhận chủ phòng ngay lập tức** (trước đây sẽ bị kẹt `ownerId` cũ, không ai được công nhận).
- Đã deploy (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

306 test đều pass.

**Fix: Calamity Janet không đánh được Missed! làm Bang! (theo báo lỗi thật từ chủ dự án — kể cả trường hợp có Volcanic cho phép bắn nhiều lần/lượt):**

- **Nguyên nhân gốc — BUG Ở CLIENT (`ui.ts`/`main.ts`), KHÔNG PHẢI `core/`**: `core/reduce.ts` (`actsAsBang()`/`actsAsMissed()`, xong từ việc 5.2 đợt 7) đã cho phép đúng — xác nhận qua test mới (xem dưới) core cho Janet đánh Bang! thật rồi đánh tiếp Missed! làm Bang! lần 2 khi có Volcanic, không lỗi gì. Bug NẰM Ở GIAO DIỆN: cả `renderHandSection()` (hotseat) lẫn `networkRenderHandSection()` (qua mạng) trong `ui.ts` có 2 chỗ so khớp TÊN LÁ THẬT một cách "mù" (không biết gì về Janet):
  1. Điều kiện vẽ nút bấm khi đang tới lượt: `isCurrentTurnToPlay && name !== "missed"` — loại bỏ MỌI lá tên "missed" khỏi danh sách bấm được, kể cả của Janet — lá chỉ hiện dạng `cardChip()` (không có `onClick`), nên KHÔNG BẤM ĐƯỢC GÌ CẢ, không phải do core từ chối.
  2. Điều kiện vẽ nút bấm khi đang phản hồi (đỡ Missed!/Duel/Indians!): `if (name === respondableName)` — so khớp CHUỖI trực tiếp, không biết Janet có thể dùng Bang! thay Missed! (hoặc Missed! thay Bang!) — cùng 1 lỗi kiến trúc, ảnh hưởng CẢ 2 CHIỀU (không chỉ chiều chủ động đánh Bang! chủ dự án báo, mà cả chiều đỡ đòn cũng bị chặn nhầm, phát hiện lúc rà lại toàn bộ chỗ so khớp tên lá liên quan Janet).
- **Sửa**: thêm 2 hàm `cardActsAsBang()`/`cardActsAsMissed()` trong `ui.ts` — MIRROR chính xác `actsAsBang()`/`actsAsMissed()` của `core/reduce.ts` (2 hàm đó không export, nên phải chép lại logic ở lớp UI — chỉ dùng để quyết định vẽ nút, KHÔNG thay cho việc `reduce()` tự kiểm tra lại). Hàm `cardMatchesRespondable()` dùng 2 hàm trên thay vì so chuỗi trực tiếp — áp dụng cho CẢ 4 chỗ: 2 hàm render (hotseat + mạng) × 2 điều kiện (đang tới lượt + đang phản hồi).
- `main.ts`: `NEEDS_TARGET` (tập lá cần chọn mục tiêu trước khi `PLAY_CARD`) không có "missed" (Missed! thường không đánh chủ động được nên không cần) — thêm hàm `cardNeedsTarget(cardId, characterId)` dùng `cardActsAsBang()` (export từ `ui.ts`) để nhận ra Missed! của Janet cũng cần hỏi mục tiêu như Bang! thật. Sửa cả `onHandCardClick()` (hotseat, lấy `characterId` từ `state.players[state.currentPlayerIndex]`) và `onNetworkHandCardClick()` (mạng, lấy từ `networkView.players.find(p => p.id === myPlayerId)`).
- Test mới trong **`test/characters-basic.test.ts`** (+1 test, ở mức `core/` — xác nhận lại core KHÔNG có bug, đúng kịch bản chủ dự án báo): Janet có Volcanic, đánh Bang! thật thành công, đối phương chịu mất máu, rồi đánh TIẾP Missed! làm Bang! lần 2 trong CÙNG lượt — thành công, đúng `NEED_MISSED` mới được đẩy lên.
- Đây là thay đổi UI thuần (`ui.ts`/`main.ts`), KHÔNG đụng `core/` — theo tiền lệ cả dự án; test mới thêm dù vậy vẫn ở mức `core/` (chỉ để xác nhận lại core đúng, không phải vì core bị sửa).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 307 test đều pass (306 cũ + 1 test mới).

307 test đều pass.

**Fix: người chơi rời phòng rồi kết nối lại (đúng tên, đúng mã phòng) bị coi là người chơi mới, mất luôn nhân vật/bài đang chơi dở (theo báo lỗi thật từ chủ dự án — chốt phạm vi: BẤT KỲ hành động nào dẫn tới mất kết nối, không chỉ 1 kiểu):**

- **Nguyên nhân gốc — Ở CLIENT (`main.ts`), KHÔNG PHẢI `core/`/`room.ts`**: `onJoinRoom()` LUÔN sinh `myPlayerId` NGẪU NHIÊN MỚI mỗi lần chạy, không lưu ở đâu cả. `RoomConnection` (`net.ts`) tự nối lại đúng người sau khi mất mạng NGẮN vì nó giữ `playerId` trong bộ nhớ suốt vòng đời chính nó — nhưng bất kỳ đường nào khiến `onJoinRoom()` chạy LẠI (bấm "Rời phòng" rồi vào lại, đóng hẳn tab/app rồi mở lại, tải lại trang...) đều vứt bỏ định danh cũ, server ghi nhận thành 1 người hoàn toàn khác — không nằm trong `state.players` của ván đang chạy, không nhận lại được nhân vật/bài.
- **Sửa**: `myPlayerId` giờ lấy qua `getOrCreatePlayerId(roomCode, name)` — đọc/ghi `localStorage`, khoá theo **ĐÚNG CẶP (mã phòng, tên)** chứ không chỉ mã phòng, để 1 trình duyệt dùng chung cho NHIỀU người (đúng cách chủ dự án tự test nhiều tab — An/Bình/Chi/Dũng, mỗi tab 1 tên khác nhau) không vô tình "cướp" nhầm danh tính của người gõ tên khác trong cùng phòng — mỗi tab vẫn tự có khoá `localStorage` riêng theo tên mình gõ, không đụng nhau. `localStorage` bị chặn (chế độ ẩn danh nghiêm ngặt) thì tự lùi về ID ngẫu nhiên như cũ (bắt lỗi, không crash), chỉ mất khả năng tự nhận lại danh tính sau khi đóng hẳn tab.
- Không đụng gì `room.ts`/`core/` — server vốn đã xử lý ĐÚNG việc 1 `playerId` khớp sẵn trong `state.players` join lại (đây chính là cơ chế reconnect tự động đã có từ việc 3.8), chỉ là trước giờ client không bao giờ tận dụng được nó ngoài phạm vi 1 lần `RoomConnection` còn sống. Còn có 1 hiệu ứng phụ TỐT ăn theo: nhờ giữ đúng `playerId` cũ, thứ tự "vào phòng lần đầu" (fix chủ phòng ở lần trước) cũng tự động đúng lại theo — người rời rồi quay lại đúng tên/mã phòng sẽ lấy lại đúng vị trí ưu tiên chủ phòng cũ của họ, không bị đẩy xuống cuối hàng.
- Đây là thay đổi UI/client thuần (`main.ts`), KHÔNG đụng `core/` — theo tiền lệ cả dự án, không có test Vitest riêng cho phần này (logic phụ thuộc `localStorage`, thuộc nhóm hạ tầng mạng luôn kiểm bằng trình duyệt thật).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 307 test vẫn pass (không đổi `core/`).
- Đã tự kiểm bằng `wrangler dev` cục bộ + 3 tab thật (TestA/TestB/TestC, đúng luồng lobby→chọn nhân vật→bàn chơi thật qua JS thao tác DOM thay vì click chuột mô phỏng — công cụ trình duyệt tự động bị lỗi toạ độ/timeout ngay từ đầu phiên, chuyển hẳn sang cách này cho ổn định): ván 3 người chạy thật (Cảnh sát/Tội phạm/Kẻ phản bội), TestA đang là El Gringo/Kẻ phản bội/3-3 máu với đúng 5 lá cụ thể trên tay — bấm "Rời phòng" (qua dialog Cài đặt) → 2 người còn lại (TestB/TestC) thấy ĐÚNG "⚠ đã mất kết nối" cạnh tên TestA, ván VẪN TIẾP TỤC (không huỷ, đúng vì còn ≥2 người — khác ca 2 người sẽ tự huỷ theo việc 4.3, đã kiểm riêng ở bước đầu) → TestA vào lại ĐÚNG mã phòng + ĐÚNG tên "TestA" → **vào THẲNG vào ván đang chạy** (không phải màn hình lobby chờ), đúng lại y hệt El Gringo/Kẻ phản bội/3-3 máu/đúng 5 lá cũ, `localStorage` xác nhận cùng 1 `playerId` trước và sau. Cũng xác nhận hiệu ứng phụ: TestA rời rồi vào lại tự động lấy lại đúng quyền chủ phòng (thứ tự vào phòng lần đầu không đổi). Không lỗi console.
- **Còn 1 giới hạn đã biết, KHÔNG che giấu**: nếu người chơi đổi TÊN khi vào lại (gõ tên khác lúc trước), sẽ bị coi là người chơi mới — đúng như thiết kế (khoá theo cặp mã phòng + tên), không phải bug.

307 test đều pass.

**Fix: bố cục bàn qua mạng xếp SAI khi ít đối thủ — 4 người chơi (3 đối thủ) bị xếp thành 1 hàng DỌC thay vì hàng ngang (theo báo lỗi thật từ chủ dự án):**

- **Nguyên nhân gốc**: `buildOpponentRows()` (`ui.ts`, đổi từ đợt layout "bỏ bàn tròn, dùng 2 hàng ngang + hàng lẻ" trước đó) áp dụng công thức chia 2 hàng ("gấp rắn") KHÔNG ĐIỀU KIỆN với MỌI số đối thủ — số đối thủ ÍT (2 hoặc 3, tức 3-4 người chơi) khiến công thức chia ra CÁC HÀNG CHỈ 1 NGƯỜI (vd 3 đối thủ → hàng lẻ 1 người + hàng xa 1 người + hàng gần 1 người = 3 hàng riêng biệt, MỖI HÀNG ĐÚNG 1 NGƯỜI). `.opponent-row` không có gì phân biệt trực quan "hàng xa"/"hàng gần" (chỉ khác `margin-bottom`), nên 3 hàng-1-người xếp liên tiếp trong luồng tài liệu NHÌN Y HỆT 1 cột dọc — đúng triệu chứng đã báo. Thuật toán này chỉ thật sự ĐÚNG Ý ĐỊNH (mỗi hàng ≥2 người, nhìn rõ là "hàng ngang") khi đủ đông đối thủ — đã tự kiểm ở đợt trước với 5-6 đối thủ, chưa từng kiểm số ít.
- **Sửa**: thêm ngưỡng `MIN_OPPONENTS_TO_SPLIT_ROWS = 5` — dưới 5 đối thủ (2-8 người chơi trừ 3-4 người chơi tương ứng, thực tế là 3-4 người chơi cho tới hết mọi ca có ≤4 đối thủ) thì gộp CHUNG ĐÚNG 1 hàng ngang duy nhất (đặt ở `nearRow`, ngay sát hàng của bản thân — giống 1 hàng đối thủ bình thường quây quanh bàn), KHÔNG chia gì cả. Từ 5 đối thủ trở lên mới áp dụng đúng công thức "gấp rắn" cũ (giữ nguyên 100% logic đã kiểm ở đợt trước, không đổi gì).
- Không đụng gì `core/` — thuần thay đổi cách nhóm vào `.opponent-row`, không đổi thứ tự lượt/tính liền kề.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 307 test vẫn pass (thuần UI, không đổi `core/`).
- Đã tự kiểm bằng `wrangler dev` cục bộ + 4 tab thật (P1-P4, đúng luồng lobby→chọn nhân vật→bàn chơi thật qua JS thao tác DOM) — đo qua DOM (`document.querySelectorAll('.opponent-row')`): ĐÚNG 1 `.opponent-row` DUY NHẤT chứa cả 3 đối thủ (P4, P3, P2) cạnh nhau, không còn 3 hàng riêng biệt như trước khi sửa. Không lỗi console. Nhánh ≥5 đối thủ giữ nguyên logic đã kiểm ở đợt trước (6 tab, oddRow/farRow/nearRow đúng), không sửa gì nên không kiểm lại.

307 test đều pass.

**Bổ sung theo yêu cầu chủ dự án: dialog "Thư viện bài" mở giữa ván, nút "Bắt đầu ván mới" trong Cài đặt (có confirm nếu ván dở), tăng đồng hồ chọn nhân vật 15s → 30s:**

- **Thư viện bài mở giữa ván (không văng khỏi ván)**: tách `renderCardReferenceBody()` (chỉ nội dung — 2 nhóm bài + nhóm nhân vật) ra khỏi `renderCardReferenceScreen()` (màn hình đầy đủ, vào từ home, vẫn dùng hàm con này). `renderGameToolbar()` thêm nút thứ 4 "Thư viện bài" — mở bằng ĐÚNG cơ chế `renderDialog()` có sẵn (như Nhật ký/Cài đặt, dùng `<dialog>` gốc), KHÔNG đổi `screen` — đóng lại là chơi tiếp ngay, `state`/`networkView` không hề bị đụng tới. Áp dụng cả hotseat (`renderApp`) lẫn qua mạng (`renderNetworkGame`).
- **Nút "Bắt đầu ván mới" trong dialog Cài đặt**: `renderSettingsDialogBody()` thêm tham số `NewGameSettingsOptions` (`visible`, `confirmingNewGame`, 3 handler request/confirm/cancel). Bấm lần đầu gọi `onRequestNewGame()` — logic quyết định (ván đã kết thúc hay chưa) nằm ở `main.ts` (đọc `state.winner`/`networkView.winner`), không phải ở `ui.ts`:
  - **Đã kết thúc** → bắt đầu ngay, không hỏi gì (hotseat: gọi thẳng `onPlayAgain()` có sẵn — quay lại màn hình thiết lập, đúng hành vi nút "Chơi ván mới" cuối ván đã có từ trước; qua mạng: gửi `start_game` bình thường, server vốn đã cho qua vì `existing.winner` khác null).
  - **Chưa kết thúc** → chuyển dialog sang bước xác nhận (`confirmingNewGame = true`, KHÔNG mở dialog thứ 2 chồng lên — tránh đúng lỗi "2 dialog cùng mở" đã gặp và sửa ở đợt UI/UX trước) — hiện dòng cảnh báo + 2 nút "Huỷ ván, bắt đầu mới"/"Không, tiếp tục ván này". Xác nhận thật thì hotseat gọi `onPlayAgain()` (giống ca đã kết thúc); qua mạng gửi `start_game` kèm `force: true` (field mới trong `ClientMessage`, `protocol.ts`).
  - `confirmingNewGame` reset về `false` mỗi khi đóng dialog Cài đặt (đóng dở dang không giữ lại bước xác nhận cho lần mở sau) và mỗi khi thật sự bắt đầu ván mới.
  - **Qua mạng — CHỈ CHỦ PHÒNG thấy nút này** (`NetworkGameOptions.isRoomOwner`, tính từ `myPlayerId === lobbyOwnerId` — biến `lobbyOwnerId` vốn đã cập nhật đúng xuyên suốt ván nhờ `room.ts` luôn broadcast `{type:"lobby"}` mỗi khi có người join/rời, kể cả giữa ván đang chạy). Server (`room.ts`'s `handleStartGame()`) cũng tự kiểm tra lại đúng `ownerId` — nút ẩn ở client chỉ để đỡ bấm nhầm, không phải chốt chặn duy nhất, đúng nguyên tắc "quy tắc 6" (không tin client).
  - **`room.ts`/`protocol.ts`**: `start_game` thêm field `force?: boolean` — `handleStartGame()` chỉ bỏ qua kiểm tra "đang có ván dở" (`existing && !existing.winner`) khi `force === true` VÀ người gửi đúng là chủ phòng (đã kiểm ở nhánh trên). Không cần tự dọn `DEADLINE_KEY`/`PAUSED_PLAY_KEY`/alarm thủ công trước khi ghi đè — `afterStateChange()`'s `scheduleDeadline()` đã tự ghi đè đúng theo state MỚI (bước chọn nhân vật) ngay sau đó, đúng cơ chế đã có sẵn.
- **Tăng đồng hồ chọn nhân vật 15s → 30s** (`room.ts`'s `CHARACTER_SELECTION_MS`): theo phản hồi thật chủ dự án — 15s (mốc chung "mọi hành động khác" chốt ở đợt sửa timeout trước) hơi gấp riêng cho việc đọc kỹ mô tả CẢ 2 lá nhân vật rồi mới chọn, khác các phản hồi 1 lựa chọn đơn giản (đỡ Missed!, chọn 1 lá...). Không đụng gì `REACTIVE_MS`/`PLAY_PHASE_MS`/`DISCARD_PHASE_MS` — 3 mốc đó vẫn đúng 15s/60s/15s như đã chốt.
- Không đụng gì `core/` (dialog + nút UI thuần, `force` chỉ là 1 field điều khiển tại `room.ts`) — theo tiền lệ cả dự án, không có test Vitest riêng cho hạ tầng mạng/UI, chỉ kiểm bằng `wrangler dev` + trình duyệt thật.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 307 test vẫn pass.
- Đã tự kiểm bằng `wrangler dev` cục bộ + trình duyệt thật (thao tác qua JS thay vì click chuột mô phỏng, ổn định hơn theo kinh nghiệm các đợt trước):
  - **Hotseat** (1 tab, 4 người, chơi thật tới giữa lượt đầu — bộ bài "Còn 63 lá"): mở "Thư viện bài" giữa ván — dialog hiện đúng 38 mục (22 lá + 16 nhân vật), đóng lại — bộ bài VẪN "Còn 63 lá" y hệt, xác nhận không đụng gì `state`. Mở Cài đặt, bấm "Bắt đầu ván mới" (ván đang giữa lượt, chưa kết thúc) — hiện đúng dòng cảnh báo + 2 nút; bấm "Không, tiếp tục ván này" — quay lại dialog Cài đặt bình thường (không mất ván); mở lại, bấm "Bắt đầu ván mới" rồi "Huỷ ván, bắt đầu mới" — chuyển đúng về màn hình thiết lập, ván cũ mất hẳn (đúng ý "huỷ ván").
  - **Qua mạng** (2 tab thật, Owner/Guest, chơi thật tới bàn chơi — Owner Kit Carlson, Guest Jesse Jones/Calamity Janet): xác nhận đồng hồ chọn nhân vật hiện đúng "⏱ Còn 30s" (khác 15s trước đó). Vào bàn chơi thật — mở Cài đặt ở tab Owner: THẤY nút "Bắt đầu ván mới"; mở Cài đặt ở tab Guest: KHÔNG thấy nút này (đúng chỉ chủ phòng). Owner bấm "Bắt đầu ván mới" → xác nhận → **CẢ 2 TAB đồng thời tự chuyển sang màn hình chọn nhân vật MỚI** (đúng 30s, nhân vật random lại) — xác nhận `force: true` broadcast đúng cho toàn phòng, không cần Guest làm gì. Không lỗi console ở cả 2 tab trong suốt quá trình.
  - **Chưa tự dựng được kịch bản "ván ĐÃ kết thúc → bắt đầu ngay không hỏi"** trong lần kiểm này (cần chơi trọn 1 ván tới khi có người thắng, tốn thời gian) — nhánh này tái dùng 100% logic đã có sẵn từ trước (hotseat: `onPlayAgain()` — chính là hàm nút "Chơi ván mới" cuối ván đã dùng nhiều lần qua các đợt trước; qua mạng: gửi `start_game` không kèm `force`, đúng luồng bình thường server vốn đã cho qua khi `existing.winner` khác null) — rủi ro thấp nhưng nên tự chơi thử 1 ván trọn vẹn để xác nhận nốt khi có dịp.
- Đã deploy (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev**.

307 test đều pass.

**Fix: bố cục bàn qua mạng vẫn SAI với 5 người chơi (đợt trước chỉ sửa được ca ÍT đối thủ, chưa sửa hết) — 4 đối thủ bị tách 3+1 thành 2 hàng thay vì đúng 1 hàng (theo báo lỗi thật từ chủ dự án):**

- **Bối cảnh**: đợt sửa layout ngay trước (`MIN_OPPONENTS_TO_SPLIT_ROWS = 5`) chỉ gộp 1 hàng khi đối thủ ÍT hơn 5 — từ 5 đối thủ trở lên (6 người chơi trở lên) vẫn dùng công thức "gấp rắn" cũ chia far/near/hàng-lẻ. Chủ dự án test đúng ca 5 người chơi (4 đối thủ — dưới ngưỡng 5, đáng lẽ đã gộp 1 hàng theo đợt sửa trước) nhưng vẫn thấy tách 3+1 — cho thấy vấn đề THẬT SỰ không phải "ngưỡng bao nhiêu đối thủ mới chia", mà là bản chất yêu cầu: **KHÔNG BAO GIỜ được chia nhiều hàng nữa, bất kể bao nhiêu đối thủ**. `.opponent-row` trước đó dùng `flex-wrap: wrap` — với 4 đối thủ (mỗi khung tối thiểu 14rem/224px, cộng khoảng cách) dễ VƯỢT bề rộng màn hình thật, khiến trình duyệt TỰ ĐỘNG xuống dòng ngay trong CÙNG 1 `.opponent-row` — đây mới là nguyên nhân "tách 3+1": không phải lỗi thuật toán chia hàng JS (đã đúng, luôn trả về 1 mảng `nearRow` duy nhất khi < 5 đối thủ), mà là chính CSS `flex-wrap: wrap` của hàng đó tự ngắt dòng khi không đủ chỗ.
- **Sửa tận gốc theo đúng yêu cầu chủ dự án** ("tất cả người chơi khác trừ bản thân đều nằm trên 1 hàng ngang"): bỏ HẲN khái niệm chia hàng (`buildOpponentRows()`, ngưỡng `MIN_OPPONENTS_TO_SPLIT_ROWS`, thuật toán "gấp rắn") — `renderNetworkGame()` giờ LUÔN dựng ĐÚNG 1 `.opponent-row` chứa TẤT CẢ đối thủ, bất kể bao nhiêu người. CSS đổi `.opponent-row` từ `flex-wrap: wrap` sang `flex-wrap: nowrap; overflow-x: auto;` — hàng không bao giờ tự xuống dòng nữa, đông người hơn bề rộng màn hình thì CUỘN NGANG bên trong đúng hàng đó (không tràn ra ngoài trang — đã kiểm `document.body.scrollWidth` không đổi dù hàng bên trong rộng hơn nhiều).
- **`justify-content: center` cũ đổi thành `safe center`** (CSS Box Alignment cấp 3) — phát hiện lúc rà lại: `center` thường + `overflow-x: auto` là 1 lỗi CSS quen thuộc (một số trình duyệt clip mất phần ĐẦU nội dung tràn, không cuộn tới được) khi nội dung được canh giữa mà rộng hơn khung chứa; `safe center` tự lùi về canh trái khi tràn, tránh đúng lỗi đó — đã kiểm `getComputedStyle().justifyContent` trả đúng `"safe center"` (Chrome trong môi trường test hỗ trợ tốt).
- **Tính liền kề theo thứ tự lượt vẫn ĐÚNG mà không cần logic đảo/gấp gì** — `buildSeatOrder()` (không đổi) đã xoay mảng để bắt đầu từ người NGAY SAU bản thân, kết thúc ở người NGAY TRƯỚC bản thân; xếp thẳng theo đúng thứ tự đó vào 1 hàng thì 2 ĐẦU HÀNG (trái/phải) tự động luôn là 2 người liền kề bản thân trong vòng lượt — đúng yêu cầu "người nằm ngoài cùng ở cả 2 đầu đều gần mình nhất", không phụ thuộc số lượng đối thủ.
- Không đụng gì `core/` — thuần bỏ bớt code JS (đơn giản hoá) + đổi 2 dòng CSS.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 307 test vẫn pass.
- Đã tự kiểm bằng `wrangler dev` cục bộ + 5 tab thật (P1-P5, đúng luồng lobby→chọn nhân vật→bàn chơi thật) — đo qua DOM ở P1: ĐÚNG 1 `.opponent-row` chứa CẢ 4 đối thủ (P5, P4, P3, P2) nằm cạnh nhau — người đang tới lượt (P5, liền kề ngay sau P1 trong vòng lượt) nằm Ở ĐẦU HÀNG, đúng thiết kế. Ép `document.body.style.maxWidth = '375px'` (mô phỏng điện thoại) — hàng đối thủ VẪN CHỈ 1 HÀNG (`rows: 1`, chiều cao không đổi), nội dung bên trong rộng hơn khung (944px > 343px) nhưng `document.body.scrollWidth === document.body.clientWidth` (375 = 375) — xác nhận cuộn ngang ĐÚNG BÊN TRONG hàng, trang KHÔNG tràn ngang. Không lỗi console.

307 test đều pass.

**Thêm house rule mới "extra_cards" — CHỈ LÀ CỜ/CHECKBOX, CHƯA CÓ LÁ BÀI THẬT (chuẩn bị trước khi làm tiếp Dodge City):**

- Theo yêu cầu chủ dự án: trước khi code tiếp `Luat_Bang_Mo_Rong_DodgeCity.txt` (việc 5.4, xem `LO-TRINH.md` — đã chốt kiến trúc, chưa viết dòng code nào), thêm sẵn 1 house rule cho phép BẬT dùng thêm bài đặc biệt (Dodge City hoặc bộ mở rộng khác sau này) — có thể chơi CHUNG với các bộ mở rộng khác khi hoàn thiện. Đợt này CHỈ làm nút bấm (checkbox) — bản thân các lá bài đặc biệt để dành làm sau, đúng yêu cầu.
- `types.ts`'s `HouseRuleId` thêm giá trị `"extra_cards"` — comment ghi rõ đây CHỈ LÀ CỜ, hiện KHÔNG đổi hành vi ván nào (bộ bài vẫn y hệt luật gốc). `setup.ts`'s `RuleOptions.cardCounts` (đã có sẵn từ trước, ghi chú "để dành cho house rules sau này") chính là chỗ sẽ nối dây khi có dữ liệu bài thật — `buildDeck(options.cardCounts)` đã sẵn sàng cộng thêm bài, không cần đổi gì `setup.ts`/`reduce.ts` ở đợt này.
- `ui.ts`: thêm `extra_cards` vào `HOUSE_RULE_LABELS`/`HOUSE_RULE_DESCRIPTIONS`/`HOUSE_RULE_IDS` — checkbox tự động xuất hiện ở CẢ màn hình thiết lập hotseat lẫn lobby qua mạng (2 nơi đều gọi chung `renderHouseRuleCheckboxes()`, lặp theo `HOUSE_RULE_IDS`, không cần sửa gì thêm ở 2 hàm đó). Mô tả (hiện qua `title`) nói rõ "CHƯA CÓ LÁ NÀO — bật lúc này chưa đổi gì" để không ai hiểu nhầm là đã có bài thật. `main.ts` không cần sửa gì — `selectedHouseRules`/`networkSelectedHouseRules` đã là `HouseRuleId[]` tổng quát từ trước.
- Test mới trong `test/house-rules.test.ts` (+1 test): bật `extra_cards` xác nhận Bang! vẫn hoạt động bình thường y hệt lúc tắt (đúng ý "chưa có hiệu ứng gì").
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 309 test đều pass (+1 test mới so với trước — số nền trước đó đã lệch nhẹ so với dòng "307" ghi ở changelog ngay phía trên, do có thay đổi chưa commit sẵn có từ trước trong `test/characters-basic.test.ts`, không liên quan việc này). Đã kiểm nhãn checkbox mới có mặt trong bundle đã build (`grep` trực tiếp file JS) — không tự kiểm được bằng trình duyệt thật trong đợt này (extension Chrome không kết nối được ở phiên làm việc này), nhưng rủi ro thấp vì dùng lại 100% cơ chế checkbox generic đã kiểm kỹ ở 4 luật trước.
- **CHƯA deploy** — chờ chủ dự án xác nhận trước khi `npm run deploy`.

309 test đều pass.

**Mở rộng Dodge City — đợt 1 (mục A "kiến trúc trang bị trì hoãn" + 6/40 lá vàng không cần hook nhân vật mới):**

- Chủ dự án yêu cầu tiếp tục Dodge City. Vì khối lượng RẤT lớn (kiến trúc mới + 40 lá bài + 15 nhân vật + nhiều hook), đã hỏi lại phạm vi đợt này trước khi code — chốt: **mục A (kiến trúc) + nhóm lá vàng KHÔNG cần hook mới** (Bible, Sombrero, Ten Gallon Hat, Iron Plate, Canteen, Pony Express — 6/40 lá), đúng thứ tự đã bàn ở "Ghi chú cho 5.4" (`LO-TRINH.md`).
- **Tra lại suit/rank thật của 6 lá này** (`Luat_Bang_Mo_Rong_DodgeCity.txt` chỉ cho số lượng, không cho suit/rank) — 2 nguồn tra trực tiếp (đọc ảnh lá + tổng hợp tìm kiếm) cho kết quả MÂU THUẪN nhau ở nhiều lá (Sombrero/Canteen/Bible/Pony Express/Whisky). Đã tự HIỆU CHỈNH bằng cách tra markup HTML thô (mã icon tiếng Ý `i_p`/`i_f`/`i_c`/`i_q`) từ trang danh sách bài chính thức dV Giochi, đối chiếu với 4 lá bộ CƠ BẢN đã biết chắc chắn đúng suit (Volcanic 10♠/10♦, Scope A♠, Mustang 8♣/9♣, Indians! K♥/A♥, khớp đúng dữ liệu có sẵn trong `cards.ts`) để suy ra đúng mã: `i_p`=bích, `i_f`=rô, `i_c`=chuồn, `i_q`=cơ. Áp mã đã hiệu chỉnh cho 2 lần tra độc lập cùng 1 nguồn (khớp nhau tuyệt đối) ra kết quả cuối: Bible 10♣, Sombrero 7♦, Ten Gallon Hat J♥, Iron Plate A♥+Q♠, Canteen 7♣, Pony Express Q♥.
- **`core/cards.ts`**: `YellowCardName` (type mới, 6 giá trị đợt này, sẽ thêm dần) + `CardName = BrownCardName | BlueCardName | YellowCardName`. `isDelayedEquipmentCardName()` (tra tĩnh theo tên, KHÔNG lưu `delayKind` trong state — đúng đề xuất gốc ở "Ghi chú cho 5.4" mục A) + `yellowCardActsAsMissed()` (phân biệt nhóm Missed!: Bible/Sombrero/Ten Gallon Hat/Iron Plate — với nhóm chủ động: Canteen/Pony Express). `DEFAULT_CARD_COUNTS` thêm 6 entry = 0 (KHÔNG lọt vào bộ bài mặc định — đúng ý "chưa có lá nào" của house rule "extra_cards" lúc trước). `DODGE_CITY_CARD_COUNTS` (export mới, Partial — payload thật cho house rule "extra_cards", các đợt sau chỉ cần thêm entry vào ĐÚNG object này, không tạo hằng số song song).
- **`core/types.ts`**: `GameState` thêm `turnNumber: number` (đếm lượt từ đầu ván, tăng ở `advanceTurn()` — dự án TRƯỚC ĐÓ không có khái niệm "lượt số mấy", chỉ có "lượt NÀY" reset mỗi lượt như `bangUsedThisTurn`, không đủ cho nhu cầu "đã qua ít nhất 1 lượt kể từ lúc X" của trang bị trì hoãn) + `equipmentPlayedTurn: Record<string, number>` (cardId lá "delayed" -> turnNumber lúc chơi ra). `GameEvent` thêm `DELAYED_EQUIPMENT_ACTIVATED` (bỏ lá trang bị trì hoãn ĐÃ BÀY SẴN để dùng — tách khỏi `CARD_PLAYED` vì lá không "đánh ra" từ tay, nó đã nằm trên sân từ trước).
- **`core/reduce.ts`** (thay đổi chính):
  - `handlePlayCard()`: nếu `cardId` KHÔNG có trong tay NHƯNG là lá "delayed" ĐANG NẰM trong equipment của chính người chơi → định tuyến sang `activateDelayedEquipment()` (hàm mới) thay vì báo lỗi "không có bài" như trước. Nếu CÓ trong tay và là lá tự trang bị (blue self-equip HOẶC yellow delayed) → `playEquipment()` (mở rộng nhận cả 2 loại, giống hệt luật "không 2 lá cùng tên" đã áp cho lá xanh dương) — ghi `equipmentPlayedTurn[cardId] = turnNumber` nếu là lá "delayed".
  - `activateDelayedEquipment()` (hàm mới) — chặn kích hoạt lá nhóm Missed! (báo lỗi rõ ràng, nhóm đó chỉ dùng qua RESPOND) và chặn kích hoạt NGAY lượt vừa chơi ra (`equipmentPlayedTurn[cardId] === turnNumber`). Qua được thì bỏ khỏi equipment, vào chồng bỏ, xoá khỏi `equipmentPlayedTurn`, rồi chạy hiệu ứng riêng: Canteen tự hồi 1 máu (công thức y hệt Beer, không vượt trần); Pony Express rút 3 lá (dùng lại `drawCardsForPlayer()`, hàm helper mới tách từ `drawCardsAsCardEffect()` — Stagecoach/Wells Fargo vẫn dùng chung, không đổi hành vi).
  - `respondToMissed()` — viết lại phần tìm nguồn Missed!: giờ chấp nhận CẢ lá trên tay (như cũ, kể cả alias Calamity Janet) LẪN lá "delayed" nhóm Missed! đang bày trên equipment (miễn đã qua ít nhất 1 lượt) — 2 hàm mới `isUsableDelayedMissedEquipment()`/`countEligibleMissedSources()` dùng chung cho cả việc XÁC ĐỊNH nguồn hợp lệ lẫn ĐẾM đủ số lượng cần (Slab the Killer, `missesNeeded`). Bible đỡ thành công thì rút thêm 1 lá (`cardName === "bible"`, sau khi đã né).
  - **Lỗi phát hiện lúc viết (đã sửa, KHÔNG liên quan Dodge City nhưng cùng lớp lỗi với field mới)**: `cloneState()` dùng spread nông (`{...state}`) — 2 field không phải mảng con của `players`/`deck`/`discardPile`/`pending` (đã clone riêng) bị BỎ SÓT: `cardNamesPlayedThisTurn` (mảng, bị `.push()` mutate TRỰC TIẾP ở `handlePlayCard()` từ việc 5.3 — lỗi CÓ SẴN TỪ TRƯỚC, không phải do đợt này) và `equipmentPlayedTurn` (object mới của đợt này, cũng bị mutate trực tiếp qua gán/xoá key). Cả 2 đều vi phạm quy tắc 3 CLAUDE.md ("không sửa state gốc truyền vào") — `next.equipmentPlayedTurn`/`next.cardNamesPlayedThisTurn` trước khi sửa là CÙNG THAM CHIẾU với `state.` tương ứng. Sửa `cloneState()` clone nông cả 2 field này luôn (`[...state.cardNamesPlayedThisTurn]`, `{...state.equipmentPlayedTurn}`).
- Test mới: **`test/dodge-city-yellow-cards.test.ts`** (13 test) — chơi lá vàng lần đầu (gắn equipment, ghi nhớ lượt, chặn 2 lá Iron Plate trùng tên, không mutate state gốc), kích hoạt chủ động (chặn cùng lượt, Canteen hồi máu ở lượt sau, Canteen đầy máu vẫn bỏ lá không hồi, Pony Express rút 3, chặn PLAY_CARD trực tiếp nhóm Missed!), dùng như Missed! qua RESPOND (đỡ được từ lượt trước, chặn cùng lượt, Bible rút thêm 1, kết hợp Missed! tay + Sombrero sân đủ 2 cho Slab the Killer, báo lỗi thiếu). **`test/setup.test.ts`** (+2 test) — house rule "extra_cards" TẮT thì không có lá Dodge City nào, BẬT thì cộng đúng 7 lá (tổng 87 lá kể cả bộ cơ bản). 15 file test cũ (dùng `GameState` literal trực tiếp) thêm đúng 2 dòng `turnNumber: 0,`/`equipmentPlayedTurn: {},` mỗi file (làm hàng loạt bằng `sed`, đối chiếu lại bằng `tsc`) — KHÔNG đổi hành vi test nào.
- **UI (`ui.ts`) — chỉ sửa đủ để QUA COMPILE, CHƯA làm nút bấm thật** (đúng tiền lệ 16 nhân vật lúc mới cài core — "core + test trước, UI để dành đợt sau"): `CARD_LABELS`/`CARD_DESCRIPTIONS` (2 bảng `Record<CardName,...>`, TypeScript bắt buộc đủ entry) thêm nhãn + mô tả cho 6 lá mới; `describeEvent()` thêm dòng dịch `DELAYED_EQUIPMENT_ACTIVATED`; `cardTypeModifierClass()` thêm nhánh màu VÀNG mới (`card-box--yellow`, CSS `style.css`) — ĐÚNG ghi chú đổi màu trong `Luat_Bang_Mo_Rong_DodgeCity.txt` (sách luật gốc gọi nhóm này "green-bordered" nhưng xanh lá đã dành riêng cho khung nhân vật trong dự án này). Rà kỹ `main.ts`/`onEquipmentClick()` xác nhận: **CHƯA có đường dây** cho người chơi bấm vào lá trang bị CỦA CHÍNH MÌNH để (1) kích hoạt lá "delayed" đã đủ 1 lượt, hay (2) đáp lại `NEED_MISSED` bằng lá đó — 2 việc này để dành 1 đợt UI riêng sau, giống cách 16 nhân vật đợt đầu cũng chưa có nút bấm ngay.
- **Cập nhật mô tả house rule "extra_cards"** (đã có checkbox từ trước, lúc đó chưa có tác dụng thật) — đổi từ "CHƯA CÓ LÁ NÀO" (không còn đúng) thành mô tả rõ: đã có 7 lá thật (đợt 1), core xong, NHƯNG giao diện chưa hỗ trợ — khuyến cáo CHỈ bật để thử qua mã nguồn/test, CHƯA bật khi chơi thật.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 324 test đều pass (309 cũ + 15 test mới). Do bản chất "core trước, UI sau" của đợt này, KHÔNG tự kiểm bằng trình duyệt thật (giống tiền lệ 16 nhân vật đợt 1 — "không sửa `ui.ts`/`main.ts`, nhân vật CHƯA hiện được trên giao diện").
- **CHƯA deploy** — theo đúng khuyến cáo ở trên, đợi làm UI xong (hoặc ít nhất tới khi cần thử qua `wrangler dev`) mới đưa lên, kể cả bản beta.

324 test đều pass.

**Xác nhận + củng cố: lá vàng tồn tại trên sân bao lâu tuỳ thích (theo yêu cầu chủ dự án xác nhận lại)**

- Chủ dự án hỏi xác nhận: lá vàng sau khi đủ 1 lượt để dùng, KHÔNG bắt buộc dùng ngay — được phép nằm trên sân bao lâu tuỳ thích (bất kỳ lượt nào sau đó), chỉ biến mất khi dùng hoặc bị bỏ bài. Rà lại code xác nhận ĐÚNG NHƯ VẬY theo thiết kế sẵn có: `equipmentPlayedTurn[cardId] !== turnNumber` chỉ chặn ĐÚNG lượt vừa chơi ra — `turnNumber` chỉ tăng dần vĩnh viễn nên điều kiện này đúng (dùng được) ở MỌI lượt sau đó, không có gì tự "hết hạn". Không có logic nào ép buộc dùng hay tự động dọn theo thời gian.
- **Phát hiện lúc rà kỹ (không phải bug ảnh hưởng luật, chỉ là rác dữ liệu)**: các đường khiến 1 lá "delayed" rời sân theo cách KHÁC (không phải tự dùng qua `activateDelayedEquipment()`/`respondToMissed()`) — bị Cat Balou bắt bỏ (`respondToDiscardFromZone()`), bị Panic! cướp sang tay người khác (`playPanic()`), hoặc chủ nó chết/bị phạt giết nhầm Phó cảnh sát trưởng (`eliminatePlayer()`, 2 chỗ `equipment = []`) — đều KHÔNG dọn `equipmentPlayedTurn[cardId]`, để lại rác (không ai đọc tới vì mọi nơi đều kiểm tra lá có ĐANG trong equipment không trước, nhưng vi phạm tinh thần quy tắc 3 "state JSON thuần, không rác"). Đã sửa cả 4 chỗ, tự dọn key tương ứng ngay khi lá rời equipment qua đường đó — lá bị cướp vào tay thì tự ghi lại đúng ở lần chơi ra sau (không cần copy sang, `playEquipment()` tự set lại).
- Test mới trong `test/dodge-city-yellow-cards.test.ts` (+6 test, describe "lá vàng tồn tại trên sân bao lâu tuỳ thích"): Canteen/Sombrero vẫn dùng được ở lượt CÁCH RẤT XA lúc chơi ra (turnNumber 3 → 50); trải qua 3 lượt `END_TURN`/`DRAW_CARDS` liên tiếp không đụng gì tới lá đang bày, xác nhận KHÔNG tự mất/tự dùng; biến mất đúng khi bị Cat Balou bắt bỏ, bị Panic! cướp, và khi chủ chết — cả 3 ca đều dọn sạch `equipmentPlayedTurn`.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 330 test đều pass (324 cũ + 6 test mới).
- Vẫn **CHƯA deploy** — không đổi gì về khuyến cáo UI ở mục trên.

330 test đều pass.

**Mở rộng Dodge City — đợt 2 (34/40 lá còn lại — ĐỦ 40/40 LÁ):**

- Theo đúng thứ tự đã chốt trong "Ghi chú cho 5.4" (`LO-TRINH.md`): mục E (cơ chế đơn giản) + mục B (nốt các lá bài) trong 1 đợt — không cần hỏi lại gì thêm, mọi điểm mơ hồ của mục B đã được bàn và CHỐT từ trước lúc chuẩn bị (kể cả 9 lá từng đánh dấu `[CẦN KIỂM CHỨNG]`).
- **Tra suit/rank thật cho 34 lá còn lại** — dùng đúng phương pháp đã hiệu chỉnh ở đợt 1 (mã icon `i_p`=bích, `i_f`=rô, `i_c`=chuồn, `i_q`=cơ, hiệu chỉnh qua 4 lá bộ cơ bản đã biết chắc: Volcanic 10♠/10♦, Scope A♠, Mustang 8♣/9♣, Indians! K♥/A♥) — lần này tự tay `WebFetch` trực tiếp trang danh sách bài chính thức dV Giochi (`bang.dvgiochi.com/cardslist.php?id=1` cho bộ cơ bản để LẤY LẠI đúng mã icon calibrate, `id=3` cho Dodge City) thay vì dựa trí nhớ. **Phát hiện quan trọng lúc tra**: lần fetch đầu tiên model tóm tắt tự "dịch" mã icon sang tên suit SAI (đoán theo liên tưởng tiếng Ý `fiori`/`cuori`/`quadri` thay vì áp đúng bảng đã hiệu chỉnh) — không tin ngay, tự fetch lại trang bộ CƠ BẢN (4 lá đã biết chắc suit) để đối chiếu ngược, xác nhận mã icon giữ NGUYÊN như đợt 1 (`i_p`=bích, `i_f`=rô, `i_c`=chuồn, `i_q`=cơ), rồi mới áp cho 34 lá đợt 2. Kèm 6 lá thêm SỐ LƯỢNG bản sao thứ 2 (Barrel/Dynamite/Remington/Rev. Carabine) và 7 lá NÂU trùng bộ cơ bản (Bang!/Beer/Missed!/Cat Balou/General Store/Indians!/Panic!) — phải NỐI THÊM đúng suit/rank thật vào CUỐI mảng `CARD_SUIT_RANKS` sẵn có của tên đó (không chỉ tăng số lượng ở `DODGE_CITY_CARD_COUNTS`) — nếu không, `buildDeck()`'s công thức `table[i % table.length]` sẽ LẶP LẠI suit/rank cũ cho các lá vật lý mới, sai với thực tế (quan trọng cho Apache Kid — mục C, miễn nhiễm chất Rô — dù chưa cài đợt này).
- **Mục E (cơ chế đơn giản) — làm trước, dùng lại cho cả mục B**: `Action`'s `PLAY_CARD` thêm 2 field mới — `extraDiscardCardId?: string` (Brawl/Rag Time/Springfield/Tequila/Whisky, mục 1.2 — bỏ CÙNG LÚC 1 lá phụ bất kỳ từ tay mới có hiệu ứng) và `brawlZones?: Record<string, "hand"|"equipment">` (chỉ Brawl — người đánh chỉ định VÙNG bỏ bài riêng cho TỪNG nạn nhân). Hàm mới `discardExtraCard()` (`reduce.ts`) validate + bỏ lá phụ, gọi TRƯỚC khi áp hiệu ứng chính (đúng thứ tự "cả 2 lá rời tay trước khi áp hiệu ứng" — quan trọng với Suzy Lafayette, hook `onHandEmpty` phải thấy đúng lúc tay THẬT SỰ về 0, không phải giữa chừng).
- **Không cần `PendingAction`/`GameEvent` mới nào cả** — khác các đợt nhân vật trước (thường cần 2-3 kind mới), đợt Dodge City này TÁI DÙNG HOÀN TOÀN các cơ chế sẵn có: `NEED_MISSED`/`pushMissedReaction()` cho MỌI lá "Bang!-like" mới (Punch, Springfield, Buffalo Rifle, Derringer, Knife, Pepperbox — đơn 1 mục tiêu; Howitzer — bắn tất cả như Gatling); `NEED_DISCARD_FROM_ZONE` cho Brawl (đẩy nhiều lần, 1 lần/nạn nhân, thứ tự giống Gatling) và Can Can (bản "delayed" của Cat Balou); cướp bài kiểu Panic! cho Rag Time/Conestoga. Vì không có kind mới nên **KHÔNG cần sửa `room.ts`/`protocol.ts`** (khác mọi đợt nhân vật trước luôn cần thêm nhánh timeout) — đợt này thuần `core/` + UI compile-safety.
- **Refactor để dùng lại logic, không code trùng**: tách `applyPanicEffect()` (thân hiệu ứng cướp bài thật của Panic!, không kèm kiểm tra khoảng cách) ra khỏi `playPanic()` — dùng lại cho Rag Time (brown, bỏ kèm 1 lá phụ) và Conestoga (delayed) — cả 2 đều "y hệt Panic! nhưng KHÔNG giới hạn khoảng cách" (đã chốt trong `LO-TRINH.md`). Tương tự tách `pushDiscardFromZoneReaction()` khỏi `playCatBalou()` — dùng cho Brawl (nhiều lần, 1/nạn nhân) và Can Can (delayed).
- **Dodge** (brown, x2) — hoạt động Y HỆT Missed! (`actsAsMissed()` thêm nhánh `name === "dodge"`, TÁCH BIỆT hoàn toàn với alias Calamity Janet — không gắn nhân vật nào), chỉ khác: đỡ thành công thì rút thêm 1 lá (`respondToMissed()` mở rộng điều kiện đã có sẵn cho Bible sang `cardName === "bible" || cardName === "dodge"`). Không tự đánh chủ động được (giống "missed" — thêm 1 case throw lỗi rõ ràng trong switch của `handlePlayCard()`).
- **`activateDelayedEquipment()`** đổi nhận cả `action` (không chỉ `cardId` như trước) — 7 lá vàng đợt 2 cần đọc `targetId`/`targetCardId`/`targetZone`, cùng khuôn field đã có sẵn trên `PLAY_CARD`, không cần kiểu dữ liệu mới. Derringer LUÔN rút thêm 1 lá NGAY lúc kích hoạt (trước khi push `NEED_MISSED`) — bất kể mục tiêu có đỡ được hay không (đã chốt: rút là phần thưởng cho hành động DÙNG lá, không phụ thuộc kết quả). Pepperbox dùng ĐÚNG tầm súng đang cầm (`getWeaponRange()`) — điểm phân biệt DUY NHẤT với Buffalo Rifle (bỏ qua tầm hoàn toàn).
- **Mục 1.4 (không tính vào giới hạn 1 Bang!/lượt)** — Punch/Springfield/Buffalo Rifle/Derringer/Knife/Pepperbox/Howitzer đều KHÔNG đụng `next.bangUsedThisTurn` — có test riêng xác nhận đánh Bang! thật rồi vẫn đánh được Punch trong CÙNG lượt.
- Test mới **`test/dodge-city-batch2.test.ts`** (27 test) — Binocular/Hideout cộng dồn với Scope/Mustang thật; Brawl (thiếu lá phụ/thiếu vùng cho 1 nạn nhân báo lỗi, đẩy đúng thứ tự pending cho từng nạn nhân, Dynamite miễn nhiễm); Dodge (không đánh chủ động được, đỡ + rút thêm bài); Punch (khoảng cách 1, không tính giới hạn Bang!); Rag Time (thiếu lá phụ báo lỗi, cướp được mục tiêu XA — khác Panic! giới hạn khoảng cách 1); Springfield (bắn XA, không tính giới hạn); Tequila (hồi máu người khác VÀ chính mình); Whisky (tự hồi 2 máu, báo lỗi nếu không phải lượt mình); 7 lá vàng còn lại (Derringer rút bài + giới hạn khoảng cách 1, Knife không rút bài, Pepperbox đúng tầm súng, Buffalo Rifle bất kỳ khoảng cách, Howitzer bắn tất cả, Conestoga/Can Can không giới hạn khoảng cách, và xác nhận CẢ 7 lá đều bị chặn kích hoạt ngay lượt vừa chơi ra giống Canteen/Pony Express). `test/setup.test.ts` (sửa lại test đếm tổng bài `extra_cards` từ 87→119, thêm assertion đủ 40/40 tên lá). `test/bot-simulation.test.ts` (thêm nhánh sinh ứng viên cho 7 tên brown mới — chỉ để qua compile an toàn, mặc định house rule tắt nên bot không thực sự rút được các lá này).
- **UI (`ui.ts`) — vẫn CHỈ sửa đủ để QUA COMPILE, CHƯA làm nút bấm thật** (giữ đúng tiền lệ đợt 1: core + test trước, UI để dành đợt sau) — `CARD_LABELS`/`CARD_DESCRIPTIONS`/`BROWN_CARD_NAMES`/`BLUE_CARD_NAMES`/`YELLOW_CARD_NAMES` thêm đủ 16 tên mới. Cập nhật lại mô tả house rule `extra_cards` (đã lỗi thời, chỉ nhắc đợt 1) thành liệt kê đủ 40/40 lá + khuyến cáo vẫn CHƯA nên bật khi chơi thật (chưa có nút bấm cho lá vàng/lá cần bỏ kèm).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 357 test đều pass (330 cũ + 27 test mới). Do bản chất "core trước, UI sau", KHÔNG tự kiểm bằng trình duyệt thật — giống tiền lệ đợt 1.
- **CHƯA deploy** — giống khuyến cáo đợt 1, đợi làm UI xong (nút bấm kích hoạt lá vàng/đỡ Missed! bằng trang bị/bỏ kèm lá phụ) mới đưa lên, kể cả bản beta.

357 test đều pass. **ĐỦ 40/40 LÁ BÀI DODGE CITY trong `core/`** (mục A + mục B + mục E của "Ghi chú cho 5.4" coi như xong) — còn lại mục C (15 nhân vật mới) + mục D (luật riêng biến thể 3 người) + mục F (UI hiển thị chất bài) + UI thật cho toàn bộ 40 lá.

**Fix: đã đầy máu vẫn đánh Bia thành công (theo báo lỗi thật từ chủ dự án trên bản chính thức — không liên quan Dodge City):**

- Trước đây `playBeer()` (`reduce.ts`) cho phép đánh Bia ngay cả khi đã đầy máu — action thành công, lá vẫn bị bỏ vào chồng bỏ, chỉ ÂM THẦM không hồi máu gì (không có event nào báo, khác hẳn ca "chỉ còn 2 người sống" đã có `BEER_INEFFECTIVE`). Chủ dự án xác nhận: đã đầy máu thì về lý thuyết Bia KHÔNG THỂ có tác dụng gì trong MỌI trường hợp — khác ngoại lệ "chỉ còn 2 người sống" (có thể TẮT qua house rule `beer_below_two`), "đã đầy máu" không có điều kiện đặc biệt nào bù lại được.
- **Đã hỏi lại cách sửa** (theo đúng quy tắc CLAUDE.md): chốt **từ chối hẳn action** (throw lỗi rõ ràng, giống cách `playBang()` từ chối đánh Bang! thứ 2/lượt) thay vì chỉ thêm event thông báo — không cho đánh ra rồi lãng phí trong im lặng nữa.
- **Lưu ý quan trọng chủ dự án nhắc**: mở rộng Dodge City (`extraDiscardCardId`, mục 1.2) đôi khi cần bỏ Bia làm **lá phụ** cho Brawl/Rag Time/Springfield/Tequila/Whisky — KHÔNG được khoá luôn việc bỏ Bia trong MỌI ngữ cảnh. Đã kiểm tra kiến trúc sẵn có: 2 đường này tách biệt hoàn toàn — `discardExtraCard()` (lá phụ) chỉ `splice`+`push` thẳng vào chồng bỏ, không gọi `playBeer()` — nên chỉ cần thêm điều kiện NGAY ĐẦU `playBeer()` (hàm mới `assertBeerCanHeal()`, throw nếu `player.hp >= player.maxHp`) là đủ, không đụng gì tới `discardExtraCard()`/Cat Balou/Sid Ketchum hay bất kỳ chỗ nào khác chỉ cần bỏ 1 lá bất kỳ khỏi tay.
- **Không cần sửa UI** — đúng tiền lệ giới hạn "1 Bang!/lượt" (`bangUsedThisTurn`) cũng KHÔNG có logic disable nút riêng trong `ui.ts`/`main.ts`, chỉ dựa vào cơ chế báo lỗi chung sẵn có (hotseat: try/catch quanh `dispatch()`; qua mạng: `{type:"action_error"}`) — Bia giờ theo đúng khuôn đó, nhất quán với cách dự án đã xử lý mọi luật từ chối khác.
- Sửa 1 test cũ trong `test/brown-cards.test.ts` (test "đã đầy máu thì không hồi thêm" — đổi kỳ vọng từ "thành công, không có `HP_RESTORED`" sang "reduce() từ chối, không đổi state gốc"). Test mới trong `test/dodge-city-batch2.test.ts` (+1 test): dùng Bia làm lá phụ bỏ kèm cho Whisky vẫn hoạt động bình thường dù người đánh đang đầy máu — xác nhận đúng phạm vi fix, không lan sang cơ chế Dodge City.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 358 test đều pass (357 cũ + 1 test mới, 1 test cũ sửa lại).

358 test đều pass.


**Fix: 3 lỗi giao diện thật trên bản chính thức (dialog kéo về đầu/kéo xuống cuối liên tục, popup mô tả trên mobile biến mất sớm/kẹt vĩnh viễn):**

- **Nguyên nhân gốc chung cho cả 2 lỗi dialog**: `render()` (`main.ts`) vẽ lại TOÀN BỘ cây DOM mỗi lần gọi (kể cả mỗi giây, do `countdownTickId`, dù không có gì thật sự đổi) — trước đây `renderDialog()` (`ui.ts`) TẠO MỚI hẳn thẻ `<dialog>` + gọi lại `showModal()` MỖI LẦN, dù dialog đang mở y hệt nội dung. Mỗi lần `showModal()` chạy, trình duyệt tự động focus phần tử bấm được ĐẦU TIÊN trong dialog để hỗ trợ bàn phím, RỒI tự cuộn nó vào tầm nhìn: Nhật ký ván đấu/Thư viện bài không có gì bấm được trong thân (chỉ chữ/ảnh xem), nên phần tử đó luôn là nút "Đóng" nằm CUỐI dialog → cuộn xuống ĐÁY (đúng triệu chứng Thư viện bài — thân dài, tràn màn hình); Cài đặt có vài nút Sáng/Tối nằm GẦN ĐẦU nên tự cuộn lên ĐẦU thay vì đáy (đúng triệu chứng còn lại, gộp cùng Nhật ký).
- **Sửa tận gốc**: `renderDialog()` giờ GIỮ NGUYÊN đúng 1 thẻ `<dialog>` sống xuyên suốt trong lúc còn mở (biến module-level `openDialog` mới, khoá bằng `title` — mỗi loại dialog có tiêu đề cố định, không trùng nhau) — mỗi lần `render()` gọi lại chỉ vẽ lại NỘI DUNG bên trong (`body.replaceChildren()` rồi dựng lại), KHÔNG tạo thẻ `<dialog>` mới, KHÔNG gọi lại `showModal()` nữa — trình duyệt không còn lý do gì để tự focus/cuộn lại. Gắn thẳng vào `document.body` (không phải `container` như trước) vì `container` (`#game-root`) bị `replaceChildren()` xoá sạch mỗi lần render — dù giữ được biến JS, phần tử vẫn bị dọn khỏi DOM theo nếu còn là con của nó (`<dialog>` dùng `showModal()` vốn hiện ở lớp riêng "top layer" của trình duyệt nên vị trí trong cây DOM không ảnh hưởng gì tới việc hiện đúng màn hình).
- Vẫn còn 1 lần focus/cuộn KHÔNG MONG MUỐN xảy ra lúc `showModal()` chạy LẦN ĐẦU (khi thật sự mới mở, không phải mỗi lần render nữa — đã giảm từ "liên tục" xuống "đúng 1 lần lúc mở") — chủ động gọi `dialog.focus({ preventScroll: true })` NGAY SAU `showModal()` để đổi focus sang chính thẻ `<dialog>`. **Phát hiện lúc tự kiểm bằng trình duyệt thật (quan trọng)**: `preventScroll` CHỈ chặn cuộn phát sinh từ chính lần gọi `.focus()` đó — KHÔNG lùi lại được cuộn đã xảy ra TRƯỚC ĐÓ do `showModal()` tự làm (đo được `dialogScrollTop` vẫn ở gần cuối dù `document.activeElement` đã đúng là thẻ `<dialog>`). Phải tự tay đặt thêm `dialog.scrollTop = 0` mới hết hẳn.
- 7 chỗ gọi `renderDialog()` (`renderApp()`/`renderNetworkGame()`, đủ cả Nhật ký/Thư viện bài/Cài đặt/Mã phòng-Mời) bớt tham số `container` (không cần nữa, gắn thẳng `document.body`). Thêm `reconcileOpenDialog()` gọi ở CUỐI `renderApp()`/`renderNetworkGame()` — lưới an toàn dọn dialog cũ nếu nó không còn nằm trong danh sách "lẽ ra phải mở" của lần render đó (đóng qua nút "Đóng"/phím Esc đã tự dọn qua sự kiện `close` rồi, hàm này chỉ phòng các đường khác).
- `main.ts`'s `captureScrollPositions()`/`restoreScrollPositions()` (cơ chế lưu/gắn lại vị trí cuộn CHO `.opponent-row`/`.log-list`, có từ trước — dùng cho thanh cuộn NGANG hàng đối thủ và thanh cuộn DỌC bên trong danh sách nhật ký, độc lập với lỗi ở trên) đổi từ `root.querySelector()` sang `document.querySelector()` — `.log-list` giờ nằm trong dialog đã chuyển ra `document.body`, không còn là con cháu của `root` (`#game-root`) nữa nên `root.querySelector()` sẽ không bao giờ tìm thấy nó.
- **Lỗi #3 (popup mô tả nhấn giữ trên mobile) — 2 nguyên nhân riêng biệt trong `attachDescriptionReveal()`**:
  - *"Biến mất ngay dù vẫn đang giữ"*: `touchmove` cũ huỷ popup ngay khi có BẤT KỲ chuyển động nào, dù chỉ 1-2px — ngón tay người thật KHÔNG BAO GIỜ đứng yên tuyệt đối lúc giữ (luôn rung nhẹ), nên hầu như lần giữ nào cũng dính. Sửa: chỉ huỷ khi di chuyển QUÁ `MOVE_CANCEL_THRESHOLD_PX = 10` tính từ điểm chạm ban đầu (lưu toạ độ lúc `touchstart`, so khoảng cách Euclid ở mỗi `touchmove`).
  - *"Hiện vĩnh viễn, không biến mất kể cả khi đã bỏ tay ra"*: cùng nguyên nhân gốc với lỗi dialog — nếu `render()` (mỗi ~1 giây) xảy ra NGAY GIỮA lúc đang giữ (đã qua 500ms, popup đang hiện), phần tử `el` đang gắn listener bị gỡ khỏi trang và thay bằng phần tử MỚI (closure/state riêng, không biết gì về popup cũ) — sự kiện `touchend` thật lúc bỏ tay ra không còn nơi nào để bắt nữa, popup (gắn thẳng `document.body`, không bị `replaceChildren()` đụng tới) bị "mồ côi" mãi mãi. Sửa: `showPopup()` giờ LUÔN tự đặt hẹn giờ tự ẩn sau `AUTO_HIDE_MS = 4000` — không phụ thuộc gì vào việc có bắt được `touchend` thật hay không, đảm bảo KHÔNG BAO GIỜ kẹt vĩnh viễn dù mất dấu sự kiện.
- Không đụng gì `core/` — thuần UI/DOM (`ui.ts`/`main.ts`), theo đúng tiền lệ cả dự án cho các lỗi UI: không cần test Vitest mới, kiểm bằng trình duyệt thật.
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 358 test vẫn pass (không đổi `core/`). Đã tự kiểm bằng `vite dev` + trình duyệt thật (hotseat, 4 người, đúng luồng lobby→chọn nhân vật→bàn chơi thật):
  - Mở "Cài đặt", đo `document.activeElement` đúng là thẻ `<dialog>` (không phải nút "Sáng"/"Tối" như trước); bấm "Bắt đầu ván mới" (đổi `confirmingNewGame` — kích hoạt render() lại) rồi đo lại: **CÙNG một tham chiếu DOM `<dialog>`** (gắn thử 1 thuộc tính đánh dấu, xác nhận còn nguyên sau khi render lại) — xác nhận đúng dialog KHÔNG bị tạo mới, chỉ nội dung bên trong đổi.
  - Mở "Thư viện bài" (38 mục, tràn màn hình) — đo `dialogScrollTop` đúng bằng 0 ngay lúc vừa mở (trước khi sửa nốt `scrollTop = 0`, đo được vẫn ở gần cuối dù `activeElement` đã đúng — xác nhận đúng phát hiện `preventScroll` không đủ, đã sửa thêm).
  - Mở "Nhật ký ván đấu" — hiện đúng nội dung, không lỗi console.
  - Mô phỏng đúng chuỗi sự kiện `touchstart`/`touchmove`/`touchend` thật (dùng `Touch`/`TouchEvent` dựng tay, không phải mô phỏng chuột) trên 1 lá bài thật trong tay: giữ hết 500ms + rung nhẹ 3.6px → popup **VẪN CÒN** (trước đây sẽ mất ngay); giữ hết 500ms + trượt thật 30px → popup **mất ngay** (đúng hành vi mong muốn, không đổi); giữ hết 500ms rồi **KHÔNG BAO GIỜ gửi `touchend`** (mô phỏng đúng ca `el` bị gỡ khỏi DOM giữa chừng) → popup **tự biến mất đúng sau ~4 giây** nhờ hẹn giờ an toàn, không kẹt vĩnh viễn.
- **Chưa tự kiểm riêng qua mạng (`wrangler dev`)** — cơ chế sửa dùng CHUNG 100% code (`renderDialog()`/`attachDescriptionReveal()`) giữa hotseat và qua mạng, không có nhánh riêng nào, nên rủi ro thấp; nhưng đáng chú ý là bug ban đầu "liên tục" rõ nhất khi có đồng hồ đếm ngược (`countdownTickId`, chỉ chạy qua mạng) — nên tự chơi thử qua mạng khi có dịp để xác nhận nốt cảm giác thực tế.
- Đã deploy live (`npm run deploy`) lên **https://bang-boardgame.nguyenngoctuan548.workers.dev** — kèm cả fix "đã đầy máu vẫn đánh Bia thành công" (đợt trước, đã commit nhưng chưa deploy) trong cùng lần này.

358 test đều pass.

**Mở rộng Dodge City — đợt 3 (mục D "luật riêng biến thể 3 người" — thưởng 3 lá khi tự tay hạ bất kỳ ai):**

- Theo đúng thứ tự đã chốt trong "Ghi chú cho 5.4" (`LO-TRINH.md`): A → E → B → **D** (nhỏ, làm trước mục C phức tạp nhất) → C → F.
- **Phát hiện lúc rà lại trước khi code**: biến thể 3 người (`role` là `police`/`criminal`/`traitor`) trước đó KHÔNG có thưởng gì khi hạ gục ai cả — `eliminatePlayer()` (`reduce.ts`) chỉ thưởng 3 lá khi `target.role === "outlaw"` (4-8 người), không có nhánh nào áp dụng cho 3 vai riêng của biến thể 3 người. 2 test cũ trong `test/death.test.ts` thậm chí còn CHỦ ĐỘNG khẳng định "không có thưởng gì" — đúng với code cũ nhưng SAI với luật Dodge City thật (đã chốt sẵn từ trước, xem "Ghi chú cho 5.4" mục D).
- **`core/reduce.ts`**: `eliminatePlayer()` thêm nhánh `else if (target.role === "police" || target.role === "criminal" || target.role === "traitor")` — song song với nhánh `outlaw`/`sheriff giết nhầm deputy` sẵn có, cùng trong khối `if (killer)`. Rút 3 lá đưa cho killer (dùng lại đúng vòng lặp `drawTopCard()`/`giveCardToPlayer()` như nhánh Outlaw, có thể ít hơn 3 nếu deck+chồng bỏ cạn). Không đụng gì nhánh `outlaw` cũ — 2 nhóm `role` không giao nhau (`"outlaw"` chỉ có ở 4-8 người, `"police"/"criminal"/"traitor"` chỉ có ở 3 người) nên không có rủi ro cộng dồn 2 lần.
- **Không phân biệt đúng/sai vòng tròn săn đuổi** — thưởng áp dụng cho MỌI lần hạ gục có `killerId` (kể cả giết sai mục tiêu, khi ván vẫn tiếp tục), đúng nguyên văn đã chốt. Vẫn đặt SAU đoạn tính thưởng nhưng TRƯỚC `checkWinCondition()` — nếu giết ĐÚNG mục tiêu và thắng luôn, thưởng vẫn được cộng vào tay trước khi trả `GAME_ENDED` (không ảnh hưởng gì vì ván đã kết thúc, chỉ để nhất quán logic, không có nhánh đặc cách bỏ qua thưởng khi thắng ngay).
- **`core/types.ts`**: `GameEvent` thêm `HUNT_KILL_BOUNTY_DRAWN` (`playerId`, `count`) — event RIÊNG, không tái dùng `OUTLAW_BOUNTY_DRAWN` dù cùng hình dạng dữ liệu, để log hiển thị đúng ngữ cảnh khác nhau ("kết liễu Tội phạm" vs "hạ gục đối thủ").
- **`src/client/ui.ts`**: `describeEvent()` thêm case dịch `HUNT_KILL_BOUNTY_DRAWN` — dòng "`<tên>` được thưởng vì hạ gục đối thủ, rút N lá". Chỉ 1 dòng, không đụng gì khác (biến thể 3 người hiện tại chưa có nút bấm riêng nào ngoài luồng hotseat sẵn có).
- Sửa lại 2 test cũ trong `test/death.test.ts` (đổi kỳ vọng "không thưởng" thành "có `HUNT_KILL_BOUNTY_DRAWN`, rút đúng 3 lá theo thứ tự deck") — cả ca giết ĐÚNG mục tiêu (thắng ngay) lẫn giết SAI mục tiêu (ván tiếp tục). Không thêm test mới ngoài việc sửa 2 test này (đã đủ phủ cả 2 nhánh chính, hàm dùng lại 100% logic đã kiểm kỹ ở nhánh Outlaw).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 358 test đều pass (không đổi số lượng — 2 test cũ sửa lại, không thêm/bớt).
- **Không đổi gì cần deploy riêng** — vẫn nằm trong batch "CHƯA deploy, kể cả bản beta" chung với mục A/B/E, đợi tới khi mục C + F xong và có UI thật cho toàn bộ Dodge City.

358 test đều pass. **Mục A, B, D, E của "Ghi chú cho 5.4" coi như xong** — còn lại mục C (15 nhân vật mới, Vera Custer phức tạp nhất) + mục F (UI hiển thị chất bài) + UI thật cho toàn bộ 40 lá/trang bị trì hoãn.

**Mục F (UI hiển thị chất bài) — phát hiện đã XONG TỪ TRƯỚC, không cần code gì thêm:**

- Chủ dự án yêu cầu làm mục F trước, tới mục C sau. Trước khi viết code, rà lại `ui.ts` để lên kế hoạch thêm badge chất/số — phát hiện `cardButton()`/`cardChip()` (2 hàm dựng MỌI ô lá bài thật trên tay/trang bị/chồng bỏ/Cửa hàng tổng hợp, dùng CHUNG cho cả hotseat lẫn qua mạng) **ĐÃ gọi** `appendCardVisual(el, cardImageUrl(name), cardLabel(cardId), CARD_DESCRIPTIONS[name], cardSuitRankFromId(cardId))` — tham số `suitRank` cuối cùng render 1 badge góc ảnh lá bài (`.card-box__suit-badge`, CSS đỏ cho Cơ/Rô — `#c0392b`, đen cho Bích/Chuồn — `#1a1a1a`).
- Truy ngược lịch sử: tính năng này được thêm NGAY TRONG commit "Dodge City đợt 1" (`4c1d83c`, 2026-08-03) — đúng lúc `appendCardVisual()` được sửa để nhận thêm tham số `suitRank` tuỳ chọn (dùng cho lá vàng mới). Commit đó chỉ mô tả dưới góc "kiến trúc trang bị trì hoãn", KHÔNG đối chiếu lại với ghi chú mục F trong "Ghi chú cho 5.4" (viết CÙNG lúc, cũng trong đúng commit đó) — nên "CHƯA làm" bị để sai suốt 2 đợt sau, không ai phát hiện vì không có lý do gì để mở lại `ui.ts` kiểm tra mục F riêng.
- **Đã tự kiểm bằng `vite dev` + trình duyệt thật** (hotseat 4 người: An/Bình/Chi/Dũng, chọn xong nhân vật, vào bàn chơi thật) — zoom cận cảnh xác nhận: bài trên tay hiện đúng "8♥"/"K♦" (đỏ)/"J♣" (đen)/"7♥" (đỏ); trang bị "Ngựa Mustang (+1)" hiện kèm "9♦"; MỌI người chơi (không chỉ người tới lượt) đều thấy đúng badge trên bài của mình. Đọc lại code xác nhận qua mạng (`renderNetworkGame()`) dùng CHUNG 100% `cardButton()`/`cardChip()`, không có nhánh riêng nào bỏ sót badge.
- **Không cần sửa gì cả** — mục F coi như đã đáp ứng đủ yêu cầu gốc (Apache Kid biết lá Rô, Doc Holyday cần ít nhất 1 lá không phải Rô) từ trước khi 2 nhân vật đó được cài (mục C, chưa làm). Chỉ cập nhật lại `LO-TRINH.md`/`CLAUDE.md` cho đúng thực tế (bỏ "CHƯA làm", ghi rõ đã có sẵn).
- 358 test vẫn pass (không đổi code nào, không cần test mới).

358 test đều pass. **Mục A, B, D, E, F của "Ghi chú cho 5.4" coi như xong** — chỉ còn ĐÚNG mục C (15 nhân vật mới, Vera Custer phức tạp nhất) + UI thật cho toàn bộ 40 lá/trang bị trì hoãn/mục D.

**Mục C (15 nhân vật) — nhóm A (7 người, dùng lại cơ chế có sẵn) — XONG:**

- Chủ dự án yêu cầu làm mục C, chốt thứ tự 4 nhóm theo độ khó trước khi code
  (đúng quy tắc CLAUDE.md "core/ luật chơi → giải thích trước, chờ đồng ý"):
  **nhóm A** (7 người, dùng lại cơ chế có sẵn — `onDrawPhase`/`onAnyDeath`/
  `USE_ABILITY`) → nhóm B (4 người, hook mới nhưng độc lập) → nhóm C (3 người,
  phụ thuộc nhân vật khác) → Vera Custer (làm sau cùng, phụ thuộc TOÀN BỘ hook
  khác đã ổn định). Đã trình bày chi tiết kỹ thuật nhóm A (đặc biệt 3 người
  đụng tới kiểu dữ liệu `Action`/`PendingAction`) và được xác nhận trước khi viết.
- **Pixie Pete** (`core/characters.ts`) — `onDrawPhase`: rút 3 lá thay 2, y
  hệt khuôn Black Jack (vòng lặp đơn giản, không cần hỏi gì).
- **Bill Noface** — `onDrawPhase`: rút `1 + (maxHp - currentHp)` lá.
- **Greg Digger** — `onAnyDeath`: hồi 2 máu (không vượt trần) khi người KHÁC
  chết. Dùng lại đúng vòng lặp gọi hook đã có sẵn trong `eliminatePlayer()`
  (`reduce.ts`, từ Vulture Sam) — caller đã tự loại trừ chính người vừa chết
  khỏi danh sách được gọi, không cần tự kiểm tra `deadPlayer !== self`.
- **Herb Hunter** — `onAnyDeath`: rút thêm 2 lá khi người khác chết. Cộng dồn
  TỰ NHIÊN với thưởng "hạ Outlaw"/`HUNT_KILL_BOUNTY_DRAWN` sẵn có (2 nguồn đều
  đi qua đường "rút thêm bài" độc lập, không loại trừ nhau) — có test riêng
  xác nhận tự tay hạ 1 Outlaw thì nhận đủ 3+2=5 lá.
- **Pat Brennan** — CẦN `PendingAction` MỚI `NEED_PICK_DRAW_OR_EQUIPMENT`
  (`types.ts`), đúng khuôn Pedro Ramirez/Jesse Jones: đầu lượt hỏi TRƯỚC khi
  rút gì cả — rút 2 lá như thường, hay lấy đúng 1 lá trang bị (kể cả "delayed"
  — mở rộng Dodge City) đang bày trước mặt người khác vào tay mình?
  `respondToPickDrawOrEquipment()` (`reduce.ts`) — kèm `targetId`+`cardId` =
  lấy lá đó (dùng lại `giveCardToPlayer()` nên Dynamite tự động gắn xuống sân
  thay vì vào tay, đúng luật); không kèm `targetId` = rút bộ bài như thường
  (mặc định/timeout, đã thêm case ở `room.ts`'s `buildReactiveTimeoutAction()`
  và bot ở `test/bot-simulation.test.ts`). Không cần đổi `view.ts` — pending
  này không chứa thông tin ẩn nào (trang bị vốn công khai).
- **Chuck Wengam** + **José Delgado** — dùng CHUNG action `USE_ABILITY` với
  Sid Ketchum (đổi `cardIds` từ tuple `[string, string]` sang `string[]` linh
  hoạt độ dài — đã hỏi trước vì đụng kiểu dữ liệu `Action`) nhưng KHÁC Sid
  Ketchum ở chỗ CHỈ dùng được TRONG lượt của chính mình (`assertCurrentPlayer`/
  `assertPhase("play")`/kiểm tra `pending` rỗng, giống mọi action bình thường
  khác — không "dùng được bất cứ lúc nào" như Sid). `handleUseAbility()` viết
  lại thành dispatcher mỏng, nhánh theo field tĩnh nào có mặt trên nhân vật
  (`canSelfHeal`/`canPayLifeToDraw`/`canDiscardEquipmentToDraw`) rồi gọi 3 hàm
  con riêng (`useSidKetchumHeal`/`useChuckWengamTrade`/`useJoseDelgadoTrade`).
  - Chuck Wengam (`canPayLifeToDraw`): mất 1 máu (chặn nếu chỉ còn đúng 1) để
    rút 2 lá, KHÔNG bỏ lá nào (`cardIds` phải rỗng), lặp lại được nhiều lần
    trong CÙNG 1 lượt. Event mới `CHUCK_WENGAM_TRADED_LIFE` — KHÔNG tái dùng
    `DAMAGE_DEALT` (gắn nghĩa "bị tấn công", dùng cho mất máu TỰ NGUYỆN dễ
    hiểu nhầm).
  - José Delgado (`canDiscardEquipmentToDraw`): bỏ ĐÚNG 1 lá xanh dương
    (`isSelfEquipBlueCardName()`, KHÔNG tính lá vàng "delayed" — đã chốt sẵn ở
    "Ghi chú cho 5.4" mục C.8 từ trước) từ tay để rút 2 lá, tối đa 2 LẦN/lượt.
    Field mới `GameState.joseDelgadoUsesThisTurn` (reset ở `advanceTurn()`,
    giống `bangUsedThisTurn`) — CHỈ cần 1 biến đếm chung (không theo
    playerId) vì `assertCurrentPlayer()` đã đảm bảo chỉ đúng người đang tới
    lượt mới dùng được. Event mới `JOSE_DELGADO_TRADED_EQUIPMENT` — KHÔNG tái
    dùng `CARDS_DISCARDED` (đã gắn nghĩa "bỏ bài thừa cuối lượt", giống lý do
    tách `KIT_CARLSON_DISCARDED` trước đó).
- **`GameState` thêm field mới** `joseDelgadoUsesThisTurn: number` — mọi nơi
  dựng `GameState` literal trực tiếp (`setup.ts` + 18 file test) đều cần thêm
  dòng này, làm hàng loạt bằng `sed` (đối chiếu lại bằng `tsc`), giống tiền lệ
  `turnNumber`/`equipmentPlayedTurn` ở Dodge City đợt 1.
- **`ui.ts`** — chỉ thêm dòng dịch cho 2 event mới + 1 dòng mô tả pending mới
  (2 chỗ, hotseat lẫn qua mạng) để qua compile (exhaustive switch) — **CHƯA có
  nút bấm thật** cho Pat Brennan/Chuck Wengam/José Delgado, đúng tiền lệ "core
  trước, UI sau" của 16 nhân vật bản gốc.
- **LƯU Ý QUAN TRỌNG phát hiện lúc rà code**: `room.ts` đã HARDCODE
  `dealCharacterCards: true` — cơ chế "phát 2 lá nhân vật, chọn giữ 1" random
  hoá TOÀN BỘ registry `CHARACTERS` (`setup.ts` dùng `Object.keys(CHARACTERS)`)
  cho MỌI ván thật (hotseat lẫn qua mạng), và màn hình "Thư viện bài" cũng tự
  động liệt kê theo registry này — nghĩa là ngay khi đợt này được DEPLOY (kể cả
  bản beta), 7 nhân vật mới có thể bị phát ngẫu nhiên cho người chơi thật.
  Pixie Pete/Bill Noface/Greg Digger/Herb Hunter hoạt động ĐÚNG hoàn toàn dù
  chưa có UI riêng (hiệu ứng hoàn toàn tự động). Pat Brennan hết giờ tự về rút
  bài thường sau 10 giây (không treo, chỉ không dùng được kỹ năng). Chuck
  Wengam/José Delgado đơn giản không có cách kích hoạt kỹ năng qua UI, chơi
  như nhân vật 4 máu bình thường cho tới khi có UI. Vẫn giữ đúng khuyến cáo cũ
  — **CHƯA deploy, kể cả bản beta**.
- **Việc bổ sung chủ dự án yêu cầu (2026-08-05), CHƯA làm, để dành đợt sau**:
  màn hình "chọn nhân vật" (phát 2 lá, chọn giữ 1) nên hiện thêm LƯỢNG MÁU
  (bullets) của mỗi nhân vật, không chỉ tên + mô tả kỹ năng.
- Test mới **`test/dodge-city-characters-batch1.test.ts`** (28 test) — đủ cả
  7 nhân vật: rút đúng số lá (Pixie Pete/Bill Noface theo số máu đã mất), hồi
  đúng máu không vượt trần + không tự hồi cho chính mình (Greg Digger), rút
  đúng lá + không tự rút cho chính mình + cộng dồn với thưởng Outlaw (Herb
  Hunter), chọn lấy trang bị người khác/lá "delayed"/Dynamite (tự gắn sân,
  không vào tay)/mặc định rút bài/báo lỗi tự lấy của mình hoặc lá sai chủ (Pat
  Brennan), mất máu rút bài lặp lại được/chặn máu cuối/chỉ trong lượt
  mình/không kèm lá (Chuck Wengam), bỏ lá xanh dương rút bài tối đa 2
  lần/lượt/chặn lá nâu-vàng/reset đúng lượt mới (José Delgado).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 386 test đều pass
  (358 cũ + 28 test mới).
- **Không đổi gì cần deploy riêng** — vẫn nằm trong batch "CHƯA deploy" chung
  với phần còn lại của Dodge City.

386 test đều pass. **Mục C nhóm A (7/15 nhân vật) coi như xong** — còn nhóm B
(4 người) + nhóm C (3 người) + Vera Custer + UI thật cho toàn bộ Dodge City.

**Mục C (15 nhân vật) — nhóm B (4 người, hook mới nhưng độc lập) — XONG:**

- Trước khi code, trình bày kỹ thuật chi tiết cho cả 4 người + đặt câu hỏi rõ
  ràng cho 2 điểm mơ hồ của Apache Kid (đúng quy tắc CLAUDE.md "luật không rõ
  ràng → dừng lại và hỏi"): (1) Indians! có tính "tương đương Bang!" cho miễn
  nhiễm không — chủ dự án CHỐT: KHÔNG (cấu trúc phản hồi khác hẳn Missed!);
  (2) Jail chất Rô có bị chặn gắn lên Apache Kid không — chủ dự án CHỐT: CÓ,
  chặn NGAY LÚC ĐÁNH (mặc định không thể gắn).
- **Sean Mallory** — hook mới `modifyHandLimit(defaultLimit): number` (PURE,
  giống `modifyDistance`). Hàm mới **export** `getHandLimit(player)` ở
  `characters.ts` (không phải `reduce.ts`) vì CẦN DÙNG CHUNG cho CẢ
  `reduce.ts` (`handleEndTurn()`/`handleDiscardCards()`, thay `player.hp` trực
  tiếp) LẪN `room.ts` (tự động bỏ bài thừa khi hết giờ — **phát hiện lúc rà
  code**: chỗ này cũng hardcode `player.hp`, nếu bỏ sót thì Sean Mallory bị bỏ
  bài SAI khi hết giờ dù đánh tay đúng).
- **Tequila Joe** — hook mới `modifyHealAmount(cardName, defaultAmount): number`
  (PURE), CHỈ gọi ở `playBeer()` (đúng lời chốt "chỉ Beer hồi 2, Saloon/
  Tequila/Canteen vẫn 1" — không đụng các hàm hồi máu khác). Field tĩnh RIÊNG
  `doubleRevivalHp` cho cơ chế "hồi sinh tự động" (`eliminateIfDead()`) — CHỦ
  ĐỘNG không tái dùng `modifyHealAmount` ở đây (đã chốt: hồi sinh kéo thẳng về
  1 máu không phải "lượng hồi" theo nghĩa của 1 lá bài) — cộng thêm riêng +1
  sau khi kéo về 1, tổng 2. Event `BEER_SAVED_FROM_DEATH` (`types.ts`) thêm
  field `hp` (máu sau hồi sinh) để log hiện đúng số — trước đây hardcode "còn 1
  máu", giờ đọc động; sửa lại 3 test cũ tham chiếu event này (thêm `hp: 1`).
- **Elena Fuente** — field tĩnh `hasAnyCardMissedAlias` mở rộng `actsAsMissed()`
  (đã có sẵn từ Calamity Janet) sang MỌI tên lá thay vì chỉ "bang". Bonus (đã
  hỏi lại và xác nhận từ trước, ghi trong file đặc tả): field tĩnh RIÊNG
  `canUseOwnEquipmentAsMissed` — dùng ĐƯỢC cả trang bị của chính mình làm
  Missed!, KHÔNG cần chờ 1 lượt như nhóm "delayed" (Bible/Sombrero...), TRỪ
  Dynamite. Đổi tên hàm `isUsableDelayedMissedEquipment()` →
  `isEquipmentUsableAsMissed()` (đúng nghĩa mới, không còn CHỈ về lá "delayed"
  nữa) — gộp logic Elena vào ĐÚNG 1 hàm này nên MỌI nơi gọi nó
  (`respondToMissed()`, `countEligibleMissedSources()`) tự động đúng, không
  cần sửa thêm chỗ nào khác. Ca đặc biệt "dùng Jail đang giam CHÍNH MÌNH làm
  Missed!" hoá ra KHÔNG CẦN CODE RIÊNG — cơ chế xoá-khỏi-equipment sẵn có của
  `respondToMissed()` tự động khiến Jail biến mất trước khi draw!-check đầu
  lượt kịp chạy, đúng nghĩa "thoát giam sớm" mà không cần đụng gì tới luồng
  Jail. Thêm nhánh báo lỗi riêng cho Dynamite (rõ ràng hơn thay vì lẫn với
  thông báo "phải chờ 1 lượt" chung).
- **Apache Kid** — hook mới `isImmuneToCard(cardId): boolean` (PURE, chỉ tra
  `cardSuitRankFromId(cardId).suit === "diamonds"`). **Phát hiện quan trọng
  lúc rà code TRƯỚC khi viết**: nhờ Dodge City đợt 2 đã CENTRALIZE hoá
  `pushMissedReaction()`/`applyPanicEffect()`/`pushDiscardFromZoneReaction()`
  làm choke-point DUY NHẤT cho hầu hết lá "Bang!-like"/"Panic!-like"/"Cat
  Balou-like" (kể cả 11 lá mới của Dodge City), immunity chỉ cần thêm ĐÚNG 3
  chỗ + 1 chỗ riêng ở `playJail()` — KHÔNG "nhiều điểm gọi khác nhau" như lo
  ngại ban đầu trong `Luat_Bang_Mo_Rong_DodgeCity.txt`. Cả 3 hàm centralized
  đổi kiểu trả về từ `void` sang `GameEvent[]` (bắn `APACHE_KID_IMMUNE` khi
  chặn) + thêm tham số `attackCardId` — kéo theo sửa lại **9 điểm gọi**
  `pushMissedReaction()`, **3 điểm gọi** `applyPanicEffect()`, **3 điểm gọi**
  `pushDiscardFromZoneReaction()` (đều đã có sẵn `action.cardId`/`cardId` cục
  bộ, không cần truyền thêm gì mới qua các lớp gọi). `playJail()` thêm guard
  RIÊNG (giống hệt khuôn guard "không đánh Jail lên Cảnh sát trưởng" có sẵn) —
  từ chối HẲN action nếu Jail chất Rô nhắm Apache Kid, khác 3 điểm kia (lá vẫn
  "dùng" được nhưng vô hiệu). Duel tự động loại trừ (không đi qua 3 hàm centralized).
  Indians! CỐ TÌNH không thêm check gì (đúng lời chốt).
- **Phát hiện lúc viết test (đáng chú ý)**: rà lại `CARD_SUIT_RANKS` (`cards.ts`)
  phát hiện chỉ 4/16 loại lá đi qua 3 hàm centralized có bản sao chất Rô THẬT
  trong bộ bài (Bang!, Cat Balou, Can Can, Buffalo Rifle) — Panic!/Rag
  Time/Conestoga/Gatling/Howitzer/Punch/Springfield/Derringer/Knife/Pepperbox/
  Brawl/Jail đều KHÔNG có bản sao chất Rô nào (kể cả sau khi tính hết 40 lá mở
  rộng). Nghĩa là nhánh miễn nhiễm cho các lá đó (và guard riêng ở `playJail()`)
  đúng về mặt CHÍNH SÁCH nhưng hiện KHÔNG THỂ kích hoạt được với dữ liệu bài
  thật — giữ nguyên code (đúng quyết định đã chốt, phòng khi bộ bài đổi sau
  này), chỉ ghi chú lại thay vì cố ép test giả.
- Test mới **`test/dodge-city-characters-batch2.test.ts`** (20 test) — Sean
  Mallory (giữ được 8 lá/3 máu không cần bỏ, bỏ đúng 1/11 lá xuống 10, người
  thường vẫn theo giới hạn cũ); Tequila Joe (Beer hồi 2 có/không đủ chỗ trống,
  Saloon vẫn 1, hồi sinh tự động lên đúng 2 máu); Elena Fuente (lá bất kỳ trên
  tay, trang bị chính mình không cần chờ lượt, Jail tự giam thoát sớm, chặn
  Dynamite, người khác không dùng được); Apache Kid (Bang! Rô miễn nhiễm +
  không Rô vẫn bình thường, Cat Balou Rô miễn nhiễm dù tay rỗng, Duel Rô KHÔNG
  miễn nhiễm, Buffalo Rifle Rô miễn nhiễm qua trang bị trì hoãn, Jail không Rô
  vẫn gắn được, Indians! không miễn nhiễm, Gatling không Rô ảnh hưởng bình
  thường).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 406 test đều pass
  (386 cũ + 20 test mới, không sửa test cũ nào ngoài 3 test `BEER_SAVED_FROM_DEATH`
  đã nêu ở trên).
- **Không đổi gì cần deploy riêng** — vẫn nằm trong batch "CHƯA deploy" chung
  với phần còn lại của Dodge City.

406 test đều pass. **Mục C nhóm A + nhóm B (11/15 nhân vật) coi như xong** —
còn nhóm C (3 người, phụ thuộc lẫn nhau) + Vera Custer (làm sau cùng) + UI
thật cho toàn bộ Dodge City.

**Mục C (15 nhân vật) — nhóm C (3 người, phụ thuộc lẫn nhau) — XONG (14/15):**

- Trước khi code, trình bày kỹ thuật đầy đủ cho cả 3 người (đúng quy tắc
  CLAUDE.md) — Belle Star đặc biệt cần rà TOÀN BỘ 18 điểm đọc `.equipment`
  trong `core/` trước khi viết, để xác định CHÍNH XÁC bao nhiêu điểm thật sự
  cần đổi (không đoán). Chủ dự án xác nhận "oke" sau khi xem bản rà soát.
- **Molly Stark** — hook mới `onVoluntaryPlayOutOfTurn(next, self, cardName,
  context)` với 2 `context`: "immediate" (rút ngay) và "duel" (dồn lại, xem
  dưới). Hàm mới `triggerVoluntaryOutOfTurnHook()` (**export ở `characters.ts`**,
  không phải `reduce.ts`, giống `triggerHandEmptyHook()`) tự kiểm "ngoài lượt
  mình" bằng cách so `player.id` với `next.currentPlayerIndex` — **quan trọng**:
  cần đúng vì người CHỦ ĐỘNG có thể tự chết ngay TRONG lượt chính mình (tự nổ
  Dynamite) và rơi vào nhánh hồi sinh tự động (Beer) — ca đó KHÔNG được tính
  "ngoài lượt", có test riêng xác nhận.
  - Gọi ở 3 điểm "immediate": `respondToMissed()` (dùng Missed!, LUÔN ngoài
    lượt vì NEED_MISSED không bao giờ nhắm người đang tới lượt), `respondDiscardOrDamage()`
    (bỏ Bang! đỡ Indians!, hàm này CHỈ dùng cho Indians! nên an toàn), `eliminateIfDead()`
    (hồi sinh tự động bỏ Beer — **PHÁT HIỆN QUAN TRỌNG lúc rà code**: đây là
    đường DUY NHẤT "chơi Beer ngoài lượt" thật sự tồn tại, vì `playBeer()`
    bình thường LUÔN bắt buộc đúng lượt mình qua `assertCurrentPlayer()`).
  - Duel: field mới `GameState.duelBangDrawPending: { playerId, count } | null`
    — **CỐ TÌNH không so khớp cứng characterId** để biết ai được credit, mà để
    CHÍNH hook tự ghi `playerId` khi accumulate (đúng quy ước "tra qua
    hook/field, không so khớp tên nhân vật" xuyên suốt dự án). Reset về `null`
    ở `playDuel()` (Duel MỚI bắt đầu). Hàm mới `drainDuelBangDrawPending()` —
    rút hết khi Duel THẬT SỰ kết thúc (nhánh thua ở `respondToDuel()`), bất kể
    Molly Stark thắng hay thua ván Duel đó — cô vẫn được tính công vì ĐÃ chủ
    động bỏ Bang!.
- **Doc Holyday** — field tĩnh mới `canDiscardTwoForBang`, dùng CHUNG action
  `USE_ABILITY` (biến thể thứ 3 sau Sid Ketchum/Chuck Wengam/José Delgado) —
  thêm `targetId?: string` vào action (đã hỏi trước vì đụng kiểu dữ liệu
  `Action`). `GameState.docHolydayUsedThisTurn` (reset ở `advanceTurn()`,
  giống `bangUsedThisTurn`) giới hạn 1 lần/lượt. **KHÔNG đụng
  `next.bangUsedThisTurn`** (đúng lời chốt "không tính vào giới hạn 1
  Bang!/lượt" — có test xác nhận vẫn đánh được Bang! thật sau khi dùng kỹ năng).
  - Miễn nhiễm Apache Kid: đã hỏi lại và CHỐT khác luật chung của
    `isImmuneToCard`/`pushMissedReaction()` ("1 lá Rô là đủ") — Doc Holyday
    CHỈ miễn nhiễm khi **CẢ 2** lá bỏ ra đều chất Rô. Vì luật khác nhau, KHÔNG
    tái dùng nguyên `pushMissedReaction()` được — tách hàm đó thành 2:
    `pushMissedReaction()` (kiểm miễn nhiễm 1-lá, giữ nguyên hành vi cũ cho 9
    điểm gọi hiện có) + `pushMissedReactionUnconditional()` (mới, chỉ phần đẩy
    pending, KHÔNG kiểm miễn nhiễm) — `useDocHolydayShot()` tự tính miễn nhiễm
    2-lá rồi gọi thẳng hàm không điều kiện.
- **Belle Star** — field tĩnh mới `disablesOthersEquipment`. Hàm trung tâm MỚI
  **`getEffectiveEquipment(players, currentPlayerIndex, player)`** (export ở
  `characters.ts`) — trả `[]` nếu đang là lượt của nhân vật này VÀ không phải
  chính họ, ngược lại trả `player.equipment` thật.
  - **Kết quả rà soát 18 điểm đọc `.equipment`**: chỉ **3 điểm** thật sự cần
    đổi — `distance.ts`'s `computeDistance()` (CHỈ Mustang/Hideout của MỤC
    TIÊU — Scope/Binocular của người bắn luôn tự đọc vì "attacker" trong MỌI
    lời gọi thật luôn CHÍNH LÀ người đang tới lượt, không bao giờ bị chính
    mình vô hiệu hoá — thêm tham số `currentPlayerIndex`, kéo theo sửa cả 6
    điểm gọi có sẵn trong `reduce.ts` + `useDocHolydayShot()` mới = 7); `pushMissedReactionUnconditional()`
    (Barrel THẬT của mục tiêu — Barrel ẢO Jourdonnais là khả năng nhân vật,
    không phải "lá bày trước mặt", không đụng); `isEquipmentUsableAsMissed()`
    (đổi tên từ đợt nhóm B, trang bị của người ĐANG PHẢN ỨNG — luôn là người
    khác, không bao giờ là ai đang tới lượt).
  - **CỐ TÌNH KHÔNG đổi**: `applyPanicEffect()`/`pushDiscardFromZoneReaction()`
    (cướp/bắt bỏ bài — Panic!/Cat Balou vẫn thấy và lấy được trang bị "vô hiệu
    hoá" bình thường, vì lá VẪN TỒN TẠI VẬT LÝ trên sân, chỉ HIỆU ỨNG của nó
    tắt tạm thời, không phải "biến mất"); mọi chỗ CHỈ tự đọc equipment của
    CHÍNH người đang hành động (`getWeaponRange()`, `require_weapon_for_bang`,
    `hasVolcanic`, đổi súng...) — LUÔN là lượt của chính họ nên không bao giờ
    bị chính mình vô hiệu hoá, wrap thêm chỉ là ceremony không đổi hành vi.
  - Bonus: thêm thông báo lỗi RIÊNG ở `respondToMissed()` ("đang bị Belle Star
    vô hiệu hoá tạm thời") — phân biệt với thông báo cũ "chưa đủ 1 lượt" (2 lý
    do khác hẳn nhau, dễ gây hiểu nhầm là bug nếu dùng chung 1 câu).
- Test mới **`test/dodge-city-characters-batch3.test.ts`** (19 test) — Molly
  Stark (Missed!/Indians!-Bang!/hồi sinh rút ngay, Duel dồn rồi rút đủ khi kết
  thúc dù thắng hay thua, tự nổ Dynamite trong lượt mình KHÔNG tính ngoài
  lượt); Doc Holyday (dùng kỹ năng đẩy NEED_MISSED, không tính giới hạn
  Bang!/lượt, giới hạn 1 lần/lượt + reset đúng lượt mới, ngoài tầm bắn, không
  phải lượt mình, miễn nhiễm Apache Kid khi cả 2 lá Rô, vẫn có tác dụng khi
  chỉ 1 lá Rô); Belle Star (Mustang/Barrel/trang bị vàng "delayed" của mục
  tiêu vô hiệu hoá đúng lúc, vẫn hoạt động bình thường ngoài lượt cô ta hoặc
  với chính trang bị của cô ta, Panic! vẫn cướp được trang bị "vô hiệu hoá").
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 425 test đều pass
  (406 cũ + 19 test mới, không sửa test cũ nào — chỉ thêm tham số
  `currentPlayerIndex` vào các lời gọi `computeDistance()` có sẵn trong
  `test/distance.test.ts`/`test/characters.test.ts`/`test/characters-basic.test.ts`,
  hành vi giữ nguyên).
- **Không đổi gì cần deploy riêng** — vẫn nằm trong batch "CHƯA deploy" chung
  với phần còn lại của Dodge City.

425 test đều pass. **Mục C nhóm A + B + C (14/15 nhân vật) coi như xong** —
chỉ còn ĐÚNG **Vera Custer** (làm sau cùng, phức tạp nhất — cơ chế uỷ quyền
toàn hệ thống hook) + UI thật cho toàn bộ Dodge City.

**Mục C (15 nhân vật) — Vera Custer (nhân vật CUỐI CÙNG, 15/15) — XONG:**

- Trước khi code, trình bày kiến trúc đề xuất (đúng quy tắc CLAUDE.md — nhân
  vật này được chính đặc tả gốc đánh dấu "phức tạp nhất, cần bàn kỹ nhất") rồi
  đặt 2 câu hỏi rõ ràng: (1) hết giờ chọn mượn xử lý thế nào — chủ dự án CHỐT:
  tự chọn ngẫu nhiên (khớp đúng constant `REACTIVE_MS = 15_000` sẵn có trong
  `room.ts`, không cần hằng số riêng — ban đầu tưởng nhầm là 10 giây, hoá ra
  đã là 15); (2) mượn được cả nhân vật cần "hỏi riêng" đầu lượt (Jesse
  Jones/Pedro Ramirez/Kit Carlson/Pat Brennan/Doc Holyday/Chuck Wengam/José
  Delgado) không — chủ dự án CHỐT: được, VÀ hành động chọn mượn phải diễn ra
  **TRƯỚC CẢ Dynamite/Jail đầu lượt** (điểm quan trọng chưa lường tới trong
  bản đề xuất ban đầu — ảnh hưởng trực tiếp tới thiết kế, xem dưới).
- **Kiến trúc uỷ quyền — 3 hàm TRUNG TÂM mới** ở `characters.ts`:
  `getEffectiveCharacterId(state, player)` (trả characterId đang MƯỢN nếu
  nhân vật thật của `player` có field tĩnh mới `canBorrowCharacterAbilities`
  — chỉ Vera Custer — VÀ đang có mượn ai; ngược lại trả characterId thật),
  `getEffectiveCharacterHooks()`/`getEffectiveCharacterDefinition()` (gọi qua
  hàm trên rồi tra registry CHARACTERS như bình thường). **Trước khi viết,
  rà soát TOÀN BỘ `core/` đếm được ~30 điểm gọi trực tiếp
  `getCharacterHooks(x.characterId)`/`getCharacterDefinition(x.characterId)`**
  rải rác trong `reduce.ts`/`characters.ts`/`distance.ts` — tất cả đổi sang
  gọi qua 3 hàm trên. Nhờ kiến trúc "1 điểm truy cập duy nhất" này, MỌI nhân
  vật khác (kể cả Apache Kid/Belle Star, xác nhận không có ngoại lệ nào bị
  chặn) tự động "mượn được" mà KHÔNG cần code riêng thêm cho từng nhân vật —
  chỉ cần đổi NGUỒN tra characterId, không đụng logic bên trong từng hook.
- **CHỈ mượn hook/field tĩnh, KHÔNG mượn bullets/maxHp** — đúng lời chốt sẵn
  có trong đặc tả gốc (`LO-TRINH.md`), `computeStartingHp()` (đầu file
  `characters.ts`) giữ nguyên dùng characterId THẬT, không đổi gì.
- **Kéo theo đổi chữ ký 1 loạt hàm** để nhận `state`/`next: GameState` thay vì
  đọc thẳng `characterId` hoặc nhận slice rời rạc (đã dùng ở nhóm B/C trước
  đó — giờ hợp nhất về 1 kiểu tham số CHUNG cho gọn, tránh thêm tham số rời
  rạc lần thứ 3 liên tiếp): `actsAsBang()`/`actsAsMissed()` (reduce.ts, thêm
  `state`), `getHandLimit()` (đổi từ `(player)` sang `(state, player)`),
  `getEffectiveEquipment()` (đổi từ `(players, currentPlayerIndex, player)`
  sang `(state, player)`), `computeDistance()` (distance.ts, đổi từ
  `(players, currentPlayerIndex, fromId, toId, extra?)` sang `(state, fromId,
  toId, extra?)`) — kéo theo sửa lại **7 điểm gọi** `computeDistance()` trong
  `reduce.ts` + nhiều test cũ (`distance.test.ts`/`characters.test.ts`/
  `characters-basic.test.ts`) dùng `sed` hàng loạt, đối chiếu lại bằng `tsc`.
- **Cơ chế "chọn mượn đầu lượt"** — `PendingAction` mới
  `NEED_PICK_BORROWED_CHARACTER` (đúng khuôn Pedro Ramirez/Jesse Jones/Kit
  Carlson/Pat Brennan). **Phát hiện quan trọng lúc thiết kế lại theo yêu cầu
  "trước cả Dynamite/Jail"**: `applyTurnStartChecks()` (hàm export sẵn có,
  gọi từ `advanceTurn()` VÀ `setup.ts` cho lượt đầu ván) TÁCH THÀNH 2 — hàm
  MỚI `applyDynamiteAndJailChecks()` giữ nguyên logic Dynamite/Jail cũ (đổi
  tên từ `applyTurnStartChecks()` gốc), còn `applyTurnStartChecks()` giờ CHỈ
  kiểm Vera Custer trước (đẩy `NEED_PICK_BORROWED_CHARACTER` nếu có người để
  mượn, rồi TRẢ VỀ NGAY) — `respondToPickBorrowedCharacter()` (hàm mới, trả
  lời pending này) sau khi ghi nhận xong lựa chọn thì gọi THẲNG
  `applyDynamiteAndJailChecks()` (KHÔNG gọi lại `applyTurnStartChecks()` — sẽ
  hỏi lại vô hạn vì Vera Custer vẫn còn `canBorrowCharacterAbilities`).
- **Field mới** `GameState.veraCusterBorrowedCharacterId: string | null` —
  characterId đang mượn (không theo playerId, chỉ 1 người có thể là Vera
  Custer). Chỉ bị GHI ĐÈ mỗi khi cô thực sự chọn lại (trong
  `respondToPickBorrowedCharacter()`) — KHÔNG tự hết hạn giữa chừng, đúng
  "hiệu lực tới lượt kế tiếp của chính mình" (không phải "chỉ trong lượt này"
  như Belle Star).
- **`RESPOND` đáp lại `NEED_PICK_BORROWED_CHARACTER`**: kèm `targetId` (người
  muốn mượn) — validate đủ 3 lớp: không tự mượn chính mình, mục tiêu còn
  sống, mục tiêu ĐÃ có nhân vật (không có gì để mượn nếu `characterId: null`).
  **BẮT BUỘC chọn — không có lựa chọn "không mượn ai"** (đúng luật gốc, khác
  đa số pending khác trong dự án vốn luôn cho phép "không làm gì"). Hết giờ
  (room.ts's `buildReactiveTimeoutAction()`, case mới) tự chọn NGẪU NHIÊN 1
  ứng viên hợp lệ, dùng `Math.random()` thường (không cần seed, không thuộc
  `core/`, giống cách bỏ bài ngẫu nhiên ở nhánh "discard" có sẵn).
- Test mới **`test/dodge-city-vera-custer.test.ts`** (15 test) — đầy đủ lượt
  đầu tiên (đẩy pending qua `advanceTurn()` thật, giống Dynamite/Jail — KHÔNG
  dựng tay pending như test thường, để kiểm đúng luồng thật), không có ai để
  mượn thì bỏ qua, xảy ra TRƯỚC Dynamite (kiểm bằng cách gắn sẵn Dynamite cho
  Vera Custer, xác nhận pending Dynamite chỉ xuất hiện SAU khi trả lời xong
  lựa chọn mượn), báo lỗi thiếu targetId/tự mượn mình/mượn người chưa có nhân
  vật; mượn khả năng thuần tuý động (Pixie Pete's `onDrawPhase`, Rose
  Doolan's `modifyDistance` — kèm test xác nhận KHÔNG áp dụng cho người KHÁC
  dù field vẫn còn giá trị, chỉ áp dụng khi CHÍNH Vera Custer là người liên
  quan); mượn nhân vật cần hỏi riêng (Pedro Ramirez); mượn kỹ năng chủ động
  USE_ABILITY (Sid Ketchum) + xác nhận KHÔNG mượn maxHp; mượn TẤT CẢ không
  ngoại lệ (Apache Kid's `isImmuneToCard`, Belle Star's `disablesOthersEquipment`).
- Đã tự kiểm: `npx tsc --noEmit` sạch, `npm run build` qua, 440 test đều pass
  (425 cũ + 15 test mới, KHÔNG sửa hành vi test cũ nào — chỉ đổi chữ ký lời
  gọi `computeDistance()`/`getHandLimit()` cho khớp API mới, không đổi kỳ
  vọng kết quả).
- **Không đổi gì cần deploy riêng** — vẫn nằm trong batch "CHƯA deploy" chung
  với phần còn lại của Dodge City.

440 test đều pass. **Mục C (15/15 nhân vật) HOÀN TẤT** — mục A-F của "Ghi chú
cho 5.4" đều xong. Chỉ còn ĐÚNG UI thật cho toàn bộ Dodge City (40 lá/trang bị
trì hoãn/mục D/15 nhân vật) — đây là việc DUY NHẤT còn lại trước khi có thể
deploy, kể cả bản beta.

**SỬA LẠI luật miễn nhiễm Apache Kid (2026-08-07)** — đảo ngược 2 quyết định cũ
(ghi ở mục "nhóm B" phía trên: "Indians! CỐ TÌNH không thêm check gì" và
`Luat_Bang_Mo_Rong_DodgeCity.txt`: "Trong Duel, khả năng này KHÔNG có tác
dụng"). Chủ dự án chốt lại: cả Đấu tay đôi (Duel) LẪN Indians! đều phải áp
dụng miễn nhiễm chất Rô của Apache Kid, kể cả khi bộ bài hiện tại không có
bản Indians! chất Rô nào để kích hoạt được (vẫn cần code đúng chính sách,
phòng khi đổi bộ bài sau này — cùng logic đã áp dụng cho Gatling/Punch/Jail/
Panic! ở trên).

- **`playIndians()`** (`reduce.ts`) — trước khi đẩy `NEED_DISCARD_BANG` cho
  từng mục tiêu, kiểm `isImmuneToCard(action.cardId)` y hệt `playGatling()`.
  Miễn nhiễm thì bắn `APACHE_KID_IMMUNE` thay vì đẩy pending, không đụng thứ
  tự đẩy pending của các mục tiêu còn lại.
- **`playDuel()`** — thêm nhánh miễn nhiễm MỚI, đặt TRƯỚC đoạn reset
  `duelBangDrawPending`/đẩy `NEED_DUEL_RESPONSE`: chỉ tra chất của ĐÚNG lá
  Duel khởi xướng (`action.cardId`) — Rô thì miễn nhiễm HẲN, huỷ ván đấu ngay
  từ đầu (không đẩy pending gì, y hệt Bang! Rô bắn vào Apache Kid: lá vẫn rời
  tay/vào chồng bỏ nhưng vô hiệu). Nếu lá Duel KHÔNG phải Rô, ván đấu diễn ra
  đúng luồng cũ — **cố tình KHÔNG tra chất của từng lá Bang! hai bên trao đổi
  trong lúc đấu** (đúng lời chốt của chủ dự án: "lá Bang! có phải Rô hay
  không hoàn toàn không quan trọng" một khi ván đấu đã bắt đầu) — miễn nhiễm
  Apache Kid CHỈ áp dụng cho lá bài THẬT do người khác trực tiếp đánh nhắm vào
  mình (ở đây là lá Duel), không áp dụng cho hiệu ứng trao đổi bên trong.
- Cập nhật lại 3 chỗ comment cũ trong `reduce.ts` từng viện dẫn "Duel/Indians!
  không áp dụng miễn nhiễm" làm ví dụ/lý do (ở `pushMissedReaction()` và ở
  `pushMaryRoseReflection()`) — đòn "bang trả" của Mary Rose vẫn là ngoại lệ
  DUY NHẤT còn lại (không gắn với lá bài thật nào để tra chất), không còn
  dùng Duel/Indians! làm ví dụ đồng dạng nữa. Đồng bộ lại
  `Luat_Bang_Mo_Rong_DodgeCity.txt` (mục 3, Apache Kid) và `House_Rule.txt`
  (ghi chú đòn bang trả của Mary Rose).
- Sửa lại 2 test cũ trong `test/dodge-city-characters-batch2.test.ts` từng
  khẳng định hành vi ngược lại ("Đấu tay đôi (Duel) chất Rô: KHÔNG miễn
  nhiễm" / "Indians! — KHÔNG tính là miễn nhiễm") — đổi thành đúng hành vi
  mới, thêm 1 test mới xác nhận Duel KHÔNG phải Rô vẫn diễn ra bình thường
  (tách riêng khỏi test miễn nhiễm). Test Indians! chỉ kiểm được nhánh KHÔNG
  miễn nhiễm bằng dữ liệu bài thật (không có bản Indians! chất Rô nào trong
  bộ bài để dựng test cho nhánh miễn nhiễm) — cùng tình trạng đã ghi chú cho
  Gatling/Jail/Panic! ở trên, không phải thiếu sót.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 483 test đều pass (tách 1 test Duel cũ
  thành 2 — miễn nhiễm/không miễn nhiễm — nên +1 so với trước khi sửa; không
  test nào khác bị ảnh hưởng).
- **Không đổi gì cần deploy riêng** — vẫn nằm trong batch "CHƯA deploy" chung
  với phần còn lại của Dodge City.

**Mở rộng High Noon — đợt 1 (hạ tầng chồng sự kiện + 3 lá đầu tiên):**

- `core/events.ts` (MỚI): `EventId`, `EVENT_CARDS` (dữ liệu tĩnh, khuôn
  `CHARACTERS`), `EXPANSION_EVENT_IDS` (đóng góp lá sự kiện theo từng bộ mở
  rộng — rỗng cho `dodge_city`/`custom_characters`), `isEventActive()` (hàm
  trung tâm DUY NHẤT để hỏi "lá X có đang chạy không").
- `ExpansionId` (types.ts) thêm `"high_noon"` + `"a_fistful_of_cards"`.
  `GameState` thêm `eventDeck`/`activeEventId`/`eventDiscard` — tráo ở
  `setup.ts` (trộn cả High Noon lẫn A Fistful of Cards nếu bật cả 2, chọn
  ngẫu nhiên 1 trong 2 lá cuối làm lá thật, lá còn lại không dùng ván đó).
- `applyTurnStartChecks()` (reduce.ts) lật lá sự kiện ĐÚNG thời điểm/thứ tự
  đã chốt với chủ dự án: đầu lượt CHỦ TRÒ (có Sheriff thì là Sheriff, không
  thì `players[0]`), từ lượt thứ 2 trở đi, TRƯỚC CẢ Marcel companion/Vera
  Custer/Dynamite/Jail. `viewFor()` chỉ lộ lá đang chạy + lá kế tiếp, giấu
  hoàn toàn phần còn lại của `eventDeck` (đúng luật gốc + quy tắc 6).
- 3 lá đầu tiên xong core+test: **Hangover** (mọi người mất khả năng đặc biệt
  nhân vật — tận dụng 3 hàm trung tâm `getEffectiveCharacterHooks()`/
  `getEffectiveCharacterDefinition()` đã có sẵn từ Vera Custer), **The
  Doctor** (người ít máu nhất +1, bằng nhau thì mỗi người +1, chỉ tính người
  còn sống), **The Daltons** (mỗi người có ít nhất 1 lá xanh dương — kể cả
  Jail/Dynamite, KHÔNG tính lá vàng Dodge City — tự chọn 1 lá bỏ, tái dùng
  nguyên `NEED_DISCARD_FROM_ZONE` đã có cho Cat Balou).
- `PendingAction.source` đổi `from: string` thành `from: string | null` (quy
  ước dùng chung cho MỌI hiệu ứng không có "người gây" — The Daltons, High
  Noon, A Fistful of Cards, Russian Roulette).
- Đã tự kiểm: `npx tsc --noEmit` sạch, test đều pass. UI checkbox bật bộ mở
  rộng "high_noon" CHƯA có — 3 lá này chỉ chạy được qua code/test, không bật
  được thật ở ván chơi cho tới khi có UI (đợt sau).

**Mở rộng High Noon — đợt 2 (9 lá còn lại, ĐỦ 12/13 — chỉ còn Ghost Town):**

- **High Noon** (lá cuối, hiệu lực tới hết ván): người TỚI LƯỢT mất 1 máu vô
  điều kiện, cắm ngay đầu `applyTurnStartChecks()` (TRƯỚC CẢ Marcel
  companion/Vera Custer/Dynamite/Jail — nhờ vậy người bị Jail/Marcel bỏ qua
  lượt vẫn ăn đủ sát thương mà không cần code riêng). Chết ngay đầu lượt thì
  tự chuyển lượt qua cascade `eliminatePlayer()`→`advanceTurn()` sẵn có (khuôn
  Elena Noir).
- **Gold Rush** (chỉ đảo chiều LƯỢT, KHÔNG đảo hiệu ứng lá bài): tách
  `nextAlivePlayerIndex()` cũ thành 2 hàm — `nextSeatIndex()` (chiều gốc
  KHÔNG BAO GIỜ đảo, dùng cho `otherAlivePlayersInOrder()` — Gatling/Indians!/
  Brawl — và General Store) và `nextTurnPlayerIndex()` (đảo khi Gold Rush
  đang chạy, CHỈ dùng cho `advanceTurn()`). Dynamite chuyền qua hàm riêng ở
  `equipment.ts`, không đụng gì.
- **Shootout** (2 lá Bang!/lượt thay vì 1): đổi `bangUsedThisTurn: boolean`
  thành `bangCountThisTurn: number` (đổi tên xuyên suốt `core/`+test),
  Volcanic/Willy the Kid vẫn bỏ giới hạn hoàn toàn.
- **The Reverend** (cấm đánh Beer CẢ trong lẫn ngoài lượt): chặn ngay đầu
  `playBeer()`; *dev đã chốt CÓ chặn luôn cơ chế "Bia hồi sinh tự động" ở
  `eliminateIfDead()` — theo đúng nguyên văn "players cannot play Beer".
- **The Sermon** (cấm CHƠI lá Bang! trong lượt mình): chặn ngay đầu
  `playBang()` — vì Calamity Janet đánh Missed! làm Bang! cũng đi qua đúng
  hàm này (`dispatchCardName` remap có sẵn) nên tự động đúng luôn "Calamity
  Janet không được bắn bằng Missed!" theo bản dịch, KHÔNG cần động tới
  `actsAsBang()`. Không cấm bỏ Bang! để đỡ (đi qua RESPOND, không qua
  `playBang()`), không cấm 7 lá tương đương Bang! của Dodge City hay Doc
  Holyday (hàm riêng `useDocHolydayShot()`).
- **Thirst/Train Arrival** (số lá rút đầu lượt ±1 — chủ dự án chốt theo FAQ,
  KHÔNG phải ép cứng 1 lá): `getDrawCount()`/`getDrawCountAdjustment()` mới,
  áp dụng cho pha rút thường + Pixie Pete + Bill Noface (đủ ví dụ FAQ Q13
  Dodge City dẫn chứng) + Kit Carlson (FAQ Q6 Davinci: vẫn xem đủ 3 lá, chỉ
  đổi SỐ LÁ GIỮ — 1/3 thay vì luôn 2). **CỐ TÌNH CHƯA áp dụng cho Black
  Jack/Pedro Ramirez/Jesse Jones** (không có ví dụ FAQ, tự suy diễn công
  thức là vi phạm quy tắc "luật không rõ ràng thì hỏi" — để dành hỏi sau nếu
  cần). Kit Carlson đổi kiểu dữ liệu: `NEED_PICK_KEPT_CARDS` thêm
  `keepCount`, `RESPOND` đổi từ `cardId` (lá muốn BỎ) sang `cardIds[]` (các
  lá muốn GIỮ) — đã hỏi chủ dự án trước khi đổi. `KIT_CARLSON_DISCARDED`
  event đổi `cardId` thành `cardIds: string[]` (có thể bỏ 2 lá cùng lúc).
- **Blessing/Curse** (chất mọi lá bài đều là Cơ/Bích): hàm trung tâm MỚI
  `getEffectiveSuit(state, cardId)` ở `cards.ts` — thay TOÀN BỘ chỗ đọc chất
  cho mục đích LUẬT (không phải chỗ chỉ cần rank): draw! (`resolveDrawCheck()`
  — ảnh hưởng Barrel/Jail/Dynamite), Black Jack (lật lá thứ 3), và Apache Kid
  (miễn nhiễm Rô — *dev đã chốt xét theo CHẤT ĐÃ ĐỔI, nên dưới Blessing/Curse
  anh ta KHÔNG miễn nhiễm gì cả vì không còn lá nào là Rô). Đổi chữ ký hook
  `isImmuneToCard` thêm tham số `state` (6+1 chỗ gọi trong `reduce.ts`).
  **CHƯA đụng UI** (badge chất lá trên `ui.ts` vẫn hiện chất THẬT, chưa hiện
  chất đã đổi theo *dev đề xuất) — cần thêm 1 đợt riêng vì phải xuyên tham số
  state qua nhiều hàm vẽ lá dùng chung (`cardButton()`/`cardChip()`), để dành
  đợt sau, không ảnh hưởng tính đúng luật.
- Ghost Town (lá khó nhất bộ) CỐ TÌNH chưa cài — dùng chung cơ chế "người
  chết vẫn vào vòng lượt" với Dead Man bên A Fistful of Cards, làm riêng rẽ
  sẽ phải sửa lại, để dành làm chung 1 lần.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 557 test đều pass (tăng từ 520 —
  9 file test mới, mỗi lá 1 file riêng). CHƯA tự kiểm bằng trình duyệt thật
  (chỉ code+test, đúng như đợt 1 — UI bật bộ mở rộng vẫn chưa có).

**Mở rộng A Fistful of Cards — đợt 1 (9/13 lá "dễ" — bỏ qua Abandoned Mine đã
chốt loại; còn lại A Fistful of Cards (lá cuối)/Russian Roulette/Peyote để dành
đợt sau, Law of the West/Dead Man để cuối cùng):**

- **Lasso** (vô hiệu 100% mọi trang bị mọi người, kể cả Dynamite/Jail):
  `getEffectiveEquipment()` (characters.ts) trả `[]` khi active — ÁP DỤNG CHO
  CẢ người đang tới lượt (khác Belle Star, chỉ tắt của người khác). Sửa
  `getWeaponRange()` (distance.ts) nhận thêm `state`, đọc qua
  `getEffectiveEquipment()` — phát hiện hàm này TRƯỚC ĐÓ không hề tôn trọng
  Belle Star (không ảnh hưởng gì hành vi cũ vì `player` luôn là người đang tới
  lượt, tự vệ không bao giờ tự vô hiệu chính mình). `applyDynamiteAndJailChecks()`
  chặn thẳng bằng `isEventActive` (không đi qua `getEffectiveEquipment` — tránh
  đổi hành vi Belle Star đã cài). `activateDelayedEquipment()` chặn kích hoạt lá
  vàng khi Lasso đang chạy.
- **Sniper** (bỏ CÙNG LÚC 2 lá Bang! bắn 1 người, cần 2 Missed!, không giới hạn
  số lần, không tính bangCountThisTurn): `playSniperShot()` mới, kích hoạt qua
  `action.extraDiscardCardId` kèm cardName "bang" (Bang! thường không bao giờ
  có field này). `pushMissedReactionUnconditional()` thêm tham số
  `missesMultiplier` (mặc định 1, không đổi mọi chỗ gọi cũ) — Sniper truyền 2,
  Slab the Killer đánh Sniper thành 4 (2×2, *dev đã chốt). Apache Kid miễn nhiễm
  CHỈ khi CẢ 2 lá đều Rô (khuôn Doc Holyday). Luật Barrel riêng (draw! 1 lần) tự
  đúng nhờ cơ chế `missesNeeded` có sẵn.
- **Ambush** (khoảng cách vòng tròn cơ bản = 1): **mâu thuẫn *dev cũ (ép cứng
  =1) vs FAQ Q17 chính thức (cơ bản=1 rồi vẫn cộng/trừ trang bị/hook) — đã hỏi
  lại chủ dự án, CHỐT theo FAQ**. `computeDistance()` (distance.ts) đặt khoảng
  cách vòng tròn = 1 khi active rồi CHẠY TIẾP nguyên phần Scope/Mustang/
  Binocular/Hideout/modifyDistance. House rule `extra_distance` bị ghi đè, mất
  tác dụng cùng lúc.
- **The Judge** (cấm ĐẶT trang bị/Jail mới xuống sân, không cấm DÙNG lá đã bày
  sẵn): chặn đầu `playEquipment()`/`playJail()`. Khác Lasso ở đúng điểm này —
  Barrel vẫn draw!, lá vàng vẫn kích hoạt được qua `activateDelayedEquipment()`.
- **Blood Brothers** (tặng ĐÚNG 1 máu, không được giọt cuối, cho 1 người bất kỳ
  TRƯỚC KHI lượt bắt đầu): `NEED_BLOOD_BROTHERS_GIFT` mới. Refactor
  `applyTurnStartChecks()`: tách `continueTurnStartAfterVeraCuster()` (Blood
  Brothers rồi mới Dynamite/Jail) để cả nhánh Vera Custer VÀ nhánh thường đều đi
  qua đúng 1 chỗ, không bỏ sót Blood Brothers khi Vera Custer đang mượn khả
  năng. Người nhận đã đầy máu bị chặn chọn (đề xuất trong đặc tả). Event riêng
  `BLOOD_BROTHERS_GIFT` (không tái dùng DAMAGE_DEALT/HP_RESTORED) — Bart Cassidy
  vẫn rút bài, El Gringo không kích hoạt (*dev đã chốt).
- **Vendetta** (draw! SAU KHI kết thúc lượt, ra Cơ chơi thêm ĐÚNG 1 lượt nữa
  cho CHÍNH mình): `finishTurn()` mới thay `advanceTurn()` trực tiếp ở
  `handleEndTurn()`/`handleDiscardCards()`. `applyTurnStartChecks()` thêm tham
  số `skipEventReveal` (Vendetta gọi lại chính hàm này cho lượt thêm nhưng
  KHÔNG lật lại lá sự kiện — currentPlayerIndex giữ nguyên nên chủ trò không bị
  lật nhầm 2 lần). `vendettaUsedThisTurn` (GameState field mới, bulk-thêm vào
  41 file test) chặn dây chuyền dù Blessing (mọi lá là Cơ) đang chạy cùng lúc.
  *dev đã chốt: vẫn xét Dynamite/Jail của chính mình ở lượt thêm.
- **Hard Liquor** (bỏ qua pha rút để hồi 1 máu, KHÔNG được cả hai): tách
  `continueDrawCardsAfterHardLiquor()` khỏi `handleDrawCards()` để dùng lại
  được từ `respondToPickHardLiquor()`. `NEED_PICK_HARD_LIQUOR` hỏi TRƯỚC mọi
  nhân vật override `onDrawPhase` (*dev đã chốt thứ tự) — chọn hồi máu thì các
  hook đó không chạy; chọn rút thì được hỏi tiếp ngay sau. RESPOND thêm
  `skipDrawForHardLiquor?: boolean`. Đã đầy máu vẫn cho chọn (hồi 0).
- **Ricochet** (bỏ 1 Bang! bắn 1 lá TRANG BỊ cụ thể, bất kể khoảng cách, không
  giới hạn số lần): kích hoạt qua `action.targetCardId` kèm cardName "bang".
  `NEED_MISSED_FOR_EQUIPMENT` mới (KHÔNG tái dùng NEED_MISSED — hậu quả mất LÁ,
  không mất máu). Đọc `target.equipment` THẬT (không qua
  `getEffectiveEquipment()`) — lá đang bị Lasso/Belle Star vô hiệu vẫn bắn
  được, nhưng CHỦ lá cũng KHÔNG tự cứu được bằng chính lá đó (đã kiểm bằng
  test riêng Belle Star). Apache Kid miễn nhiễm theo luật chung "1 lá Rô là
  đủ" (khác Sniper/Doc Holyday — chỉ 1 lá Bang! bỏ ra ở đây, không phải 2).
- **Ranch** (*dev đã đổi hẳn cơ chế so với bản dịch gốc "sau bước đánh bài":
  NGAY SAU bước rút bài, 20s chọn đổi bất kỳ số lá nào lấy lại đúng bấy nhiêu lá
  mới, CHỈ 1 LẦN): thêm hàm trung tâm `completeDrawPhase()` — TẤT CẢ 12 điểm
  "vừa rút xong, chuyển turnPhase sang play" trong `reduce.ts` (rút thường,
  Pedro Ramirez/Jesse Jones/Kit Carlson/Pat Brennan/Elena Noir, Marcel bonus
  draw, Hard Liquor hồi máu) đều đổi sang gọi hàm này thay vì tự set
  `turnPhase` — tránh rải kiểm tra Ranch ở từng nơi, dễ sót. `NEED_RANCH_EXCHANGE`
  mới, RESPOND tái dùng `cardIds?: string[]` đã có sẵn (Kit Carlson). Event
  riêng `RANCH_EXCHANGED` (không tái dùng CARDS_DISCARDED — event đó gắn nghĩa
  "bỏ bài THỪA cuối lượt"). Suzy Lafayette: `triggerHandEmptyHook()` gọi SAU
  KHI đã rút bù xong (đặc tả đã chốt) — tự nhiên tránh được combo "đổi bài ăn
  thêm 1 lá miễn phí giữa chừng" vì tay hiếm khi thật sự về 0 sau khi rút lại
  đủ số đã đổi.
- Mọi lá trên đều thêm case xử lý ở CẢ 4 chỗ "exhaustive switch" bắt buộc theo
  TypeScript khi thêm `PendingAction`/`GameEvent` mới: `ui.ts` (2 bản mô tả
  pending — trạng thái đầy đủ server-side lẫn `PlayerView`, cộng 1 bản mô tả
  event cho nhật ký), `room.ts` (hành động mặc định khi hết giờ), và
  `test/bot-simulation.test.ts` (bot phải biết phản hồi để không treo mô
  phỏng 1000 ván) — tất cả đều chọn lựa chọn AN TOÀN NHẤT (bỏ qua/không làm gì)
  khi hết giờ hoặc bot gặp phải, không tự ý hành động thay người chơi.
- Đã tự kiểm: `npx tsc --noEmit` sạch, 633 test đều pass (tăng từ 557 — 9 file
  test mới `test/fistful-*.test.ts`, mỗi lá 1 file riêng, cộng vài test sửa lại
  ở `distance.test.ts` do đổi chữ ký `getWeaponRange()`). CHƯA tự kiểm bằng
  trình duyệt thật (chỉ code+test — UI bật bộ mở rộng "a_fistful_of_cards" qua
  checkbox vẫn CHƯA có, giống nếp High Noon đợt 1/2 ở trên; nút bấm riêng cho
  từng nước đi mới — Sniper/Ricochet/Hard Liquor/Ranch/Blood Brothers — cũng
  chưa có, để dành đợt UI sau khi đủ cả bộ). **Còn lại của bộ A Fistful of
  Cards**: A Fistful of Cards (lá cuối, bắn theo số bài trên tay), Russian
  Roulette (đếm vòng theo chất/giá trị), Peyote (còn 1 câu hỏi chưa chốt: va
  chạm với nhân vật rút khác 2 lá — Pixie Pete/Bill Noface/Kit Carlson/Pat
  Brennan/Jesse Jones/Pedro Ramirez) — để dành đợt sau. Law of the West/Dead
  Man (2 lá khó nhất, cố tình để cuối) chưa động tới.

**Mở rộng A Fistful of Cards — đợt 2 (2026-08-08, "A Fistful of Cards" + "Russian
Roulette" — 11/13 lá, chỉ còn Dead Man/Law of the West):**

- **"A Fistful of Cards" (lá cuối, hiệu lực tới hết ván)**: đầu lượt (SAU Vera
  Custer, TRƯỚC Dynamite/Jail — chung nhánh với Blood Brothers ở
  `continueTurnStartAfterVeraCuster()`, 2 lá KHÔNG BAO GIỜ active cùng lúc vì
  chỉ 1 `activeEventId` chung cho cả High Noon lẫn Fistful), người tới lượt bị
  bắn bấy nhiêu phát Bang! bằng đúng số lá trên tay lúc đó (0 lá = không có gì
  xảy ra). Vướng điểm thiết kế: Gatling bắn N NGƯỜI KHÁC nên đẩy N pending
  `NEED_MISSED` cùng lúc là an toàn, nhưng lá này bắn CÙNG 1 người N LẦN — đẩy
  cả N pending cùng lúc cho 1 người sẽ phá vỡ giả định "1 người chỉ có 1
  `NEED_MISSED` tại 1 thời điểm" của đoạn code Barrel-decrement sẵn có
  (`findIndex` tìm nhầm phát khác). Giải quyết bằng field MỚI `shotsRemaining?:
  number` trên `NEED_MISSED` (giống hệt khuôn `missesNeeded` đã có) — chỉ đẩy
  ĐÚNG 1 phát 1 lúc, phát kế tiếp chỉ được đẩy SAU KHI phát hiện tại resolve
  xong (hàm mới `continueAfterMissedResolved()`, gọi ở cả 2 nhánh
  `respondToMissed()` — đỡ được/mất máu — LẪN nhánh Barrel-tự-dodge trong
  `resolveDrawCheck()`). Tác dụng phụ hay: cách này TỰ ĐỘNG giải quyết luôn vấn
  đề "dọn pending thừa khi chết giữa chừng" nêu trong file luật — không bao giờ
  có quá 1 pending của lá này tồn tại cùng lúc, nên chết giữa chừng thì
  `eliminatePlayer()` advance lượt bình thường, không còn gì để dọn. Không có
  "người bắn" (`source.from: null`, field đã có sẵn từ trước) → El Gringo không
  kích hoạt (tự nhiên, `byPlayerId` null), Mary Rose không bắn trả (tự nhiên,
  check `top.source.card === "bang"` không khớp `"a_fistful_of_cards"`), Apache
  Kid không tự miễn nhiễm (không có chất bài thật để tra). Đổi chữ ký
  `pushMissedReactionUnconditional()`: `source.from` giờ `string | null`, thêm
  tham số `shotsRemaining` (mặc định 0, mọi lời gọi cũ không đổi hành vi). Đổi
  `continueTurnStartAfterVeraCuster()` từ `void` sang trả `GameEvent[]` (bắn
  `A_FISTFUL_OF_CARDS_TRIGGERED` — event MỚI chỉ để giải thích trong nhật ký vì
  sao `NEED_MISSED` xuất hiện mà không có `CARD_PLAYED` đi trước, khác Bang!
  thường) — cả 2 nơi gọi hàm này (`applyTurnStartChecks()`/
  `respondToPickBorrowedCharacter()`) đều cập nhật theo.
- **"Russian Roulette" (nhóm A, chạy 1 lần lúc lật)**: rút 1 lá (KHÔNG áp dụng
  Lucky Duke — đây là draw! của lá sự kiện cho cả bàn, không phải của riêng
  ai), đếm từ "chủ trò" (dealer) theo GIÁ TRỊ lá vừa rút (A=1...K=13), CHIỀU do
  MÀU CHẤT quyết định (đỏ = kim đồng hồ, đen = ngược lại — đọc qua
  `getEffectiveSuit()` nên Blessing/Curse đổi chất là tự đổi luôn chiều đếm),
  CHỈ đếm người CÒN SỐNG. Người bị đếm trúng phải bỏ 1 Missed!, người KẾ TIẾP
  (đúng chiều) cũng vậy — ai KHÔNG bỏ được (không có/không muốn, đều hợp lệ,
  đúng tiền lệ `NEED_DISCARD_BANG` của Indians!) thì mất 2 máu (sàn 0), chuỗi
  DỪNG hẳn tại đó. `Rank` là kiểu chuỗi ("A".."K") trong dự án này — thêm bảng
  tra `RANK_NUMERIC_VALUE` cục bộ trong `reduce.ts` để tính bước đếm. PendingAction
  MỚI `NEED_DISCARD_MISSED_OR_DAMAGE` (không tái dùng `NEED_DISCARD_BANG` — hậu
  quả không bỏ được khác hẳn: mất 2 máu, không phải Bang!), mang `direction: 1 |
  -1` NGAY TRONG pending (đúng khuyến nghị "pending được phép mang dữ liệu
  riêng" đã ghi sẵn trong file luật, không phải field `GameState` mới). Barrel/
  Jourdonnais dùng được y hệt Missed! thật — đoạn code Barrel-decrement dùng
  chung với `NEED_MISSED` (`resolveDrawCheck()`) được sửa để nhận diện CẢ 2
  kind, và khi né trọn vẹn qua Barrel thì tự đẩy tiếp pending cho người kế tiếp
  (dễ quên nhất của lá này, đúng cảnh báo trong file luật). 2 helper MỚI
  `prevSeatIndex()`/`seatIndexInDirection()` (độc lập hoàn toàn với
  `nextTurnPlayerIndex()`/Gold Rush — 2 khái niệm "chiều" khác nhau, không dùng
  chung). Sự kiện MỚI `RUSSIAN_ROULETTE_STARTED`/`RUSSIAN_ROULETTE_FIRED`.
- Refactor đi kèm: tách phần validate+rút 1 lá Missed! (equipment vàng/Lasso/
  Belle Star/Dynamite/Slab the Killer...) khỏi `respondToMissed()` thành hàm
  dùng chung `resolveMissedCardChoice()` — cả `respondToMissed()` (Bang!/
  Gatling/Sniper/A Fistful of Cards) LẪN `respondToRussianRouletteChain()` đều
  gọi, tránh lặp ~50 dòng logic validate giống hệt nhau.
- Cả 2 lá đều thêm case xử lý ở đủ 4 chỗ "exhaustive switch" bắt buộc khi thêm
  `PendingAction`/`GameEvent` mới: `ui.ts` (2 bản mô tả pending + 1 bản mô tả
  event cho nhật ký, cộng các chỗ gate nút "Chịu mất máu"/lá vàng trên sân dùng
  như Missed!), `room.ts` (mặc định hết giờ — cả 2 lá đều dùng "chịu hậu quả",
  giống `NEED_MISSED`), `test/bot-simulation.test.ts` (bot thử dùng Missed! nếu
  có, không thì chịu hậu quả).
- Test mới: `test/fistful-a-fistful-of-cards.test.ts` (12 test — đẩy pending
  đúng số phát, đỡ/mất máu từng phát, phát cuối chuyển tiếp Dynamite/Jail, chết
  giữa chừng không sót pending, Bart Cassidy/El Gringo/Mary Rose, Barrel tự
  dodge vẫn tiếp tục chuỗi) và `test/fistful-russian-roulette.test.ts` (12 test
  — đếm chiều đỏ/đen, chỉ đếm người sống, không áp dụng Lucky Duke, chuỗi bỏ
  Missed! cả 2 chiều, mất máu/sàn 0, El Gringo/Bart Cassidy, Barrel tự dodge,
  chọn không bỏ dù có Missed!).
- Đã tự kiểm: `npx tsc --noEmit` sạch, 657 test đều pass (tăng từ 633). CHƯA tự
  kiểm bằng trình duyệt thật — chỉ code+test, giống nếp đợt 1. UI bật bộ mở
  rộng qua checkbox vẫn để dành đợt sau.
- **Peyote TẠM DỪNG theo yêu cầu chủ dự án** (giữa phiên làm việc) — thiết kế
  ĐÃ CHỐT ĐỦ (lưu trong `Luat_Bang_Mo_Rong_FistfulOfCards.txt` mục Peyote, ghi
  chú `*dev (2026-08-08, TẠM DỪNG)`): hết giờ tự đoán "đỏ" (không phải từ chối/
  rút thường); va chạm 8 nhân vật override bước rút bài (Pedro Ramirez/Jesse
  Jones/Kit Carlson/Pat Brennan/Elena Noir/Black Jack/Pixie Pete/Bill Noface)
  giải quyết bằng ĐÚNG 1 cổng `NEED_GUESS_CARD_COLOR` chèn đầu
  `continueDrawCardsAfterHardLiquor()` (trước cả Pedro Ramirez) — vì chỉ 1
  `activeEventId` chung, Peyote không bao giờ active cùng Hard Liquor/Thirst/
  Train Arrival/Blessing/Curse nên không cần xử lý tổ hợp riêng cho từng người.
  CHƯA VIẾT CODE — làm tiếp khi chủ dự án quay lại.
- **Còn lại của bộ A Fistful of Cards**: Peyote (thiết kế xong, tạm dừng), Dead
  Man (CỐ TÌNH làm CHUNG với Ghost Town bên High Noon — 2 lá cùng cần cơ chế
  "người chết vẫn vào vòng lượt"), Law of the West (khó nhất, cần kiến trúc
  "nước đi bắt buộc" hoàn toàn mới — `canPlayCard()` trung tâm chưa có). Cả 3
  để dành phiên sau, cần bàn kỹ nhiều điểm luật trước khi code (quy tắc 5
  CLAUDE.md).

**UI cho High Noon + A Fistful of Cards — gộp chung thành 1 nút (2026-08-08):**

- Chủ dự án yêu cầu: vì mỗi bộ RIÊNG LẺ vẫn còn thiếu vài lá (Ghost Town/Dead
  Man/Law of the West/Peyote chưa cài), tạm gộp 2 bộ thành 1 (mặc định bật cùng
  lúc) thay vì để 2 checkbox riêng biệt mỏng lá, vẫn giữ nguyên luật "random 1
  trong 2 lá cuối khi cả 2 bộ cùng bật" đã có sẵn (`setup.ts`, không đổi gì),
  và thêm nút bấm thật ở màn hình thiết lập ván.
- `core/events.ts` — loại tạm 4 lá CHƯA CÀI (`ghost_town`/`dead_man`/
  `law_of_the_west`/`peyote`) khỏi `EXPANSION_EVENT_IDS`, ĐÚNG cơ chế đã dùng
  cho `abandoned_mine` trước đó: `EventDefinition` vẫn khai báo đủ ở
  `EVENT_CARDS`, chỉ không đưa vào bộ bốc thật — lý do: nếu không loại, bật bộ
  mở rộng cho ván thật có thể lật trúng 1 trong 4 lá này, `activeEventId` đổi,
  tên lá hiện trong nhật ký, NHƯNG không có hiệu ứng gì (chưa có nhánh xử lý ở
  bất kỳ đâu) — trông như bug dù không phải. Cập nhật lại 2 test đếm số lá
  trong `test/events.test.ts` (High Noon riêng: 13→12 lá; A Fistful of Cards
  riêng: 14→11 lá — test "bật CẢ HAI bộ" không đổi vì vẫn bị cắt bởi
  `eventDeckSize` mặc định 12, tổng pool 21 lá vẫn dư).
- `src/client/ui.ts` — `renderExpansionCheckboxes()` (dùng chung cho CẢ hotseat
  lẫn qua mạng, không cần sửa 2 nơi) thêm 1 checkbox riêng "Lá sự kiện — High
  Noon + A Fistful of Cards (mở rộng, gộp chung)" — KHÔNG đưa 2 id
  `"high_noon"`/`"a_fistful_of_cards"` vào mảng `EXPANSION_IDS` (vòng lặp
  checkbox độc lập thường), mà render RIÊNG 1 checkbox gọi `onToggle("high_noon")`
  làm đại diện, `checked` = cả 2 id cùng có mặt trong mảng `expansions`.
- `src/client/main.ts` — hàm mới `toggleExpansionId()`: nhận diện id
  `"high_noon"`/`"a_fistful_of_cards"` thì bật/tắt CẢ 2 CÙNG LÚC (bộ khác vẫn
  bật/tắt độc lập như cũ) — dùng chung cho cả `onToggleExpansion()` (hotseat)
  lẫn `onNetworkToggleExpansion()` (qua mạng), tránh lặp code.
- Đã tự kiểm bằng trình duyệt thật (`npm run dev`, hotseat 4 người): tick nút
  "Lá sự kiện...", bắt đầu ván, chơi qua nhiều lượt — nhật ký ghi đúng "Lá sự
  kiện mới: The Reverend" (lá High Noon) xuất hiện ĐÚNG lúc chủ trò vào lượt
  thứ 2, xác nhận 2 bộ đã gộp/xáo chung đúng thiết kế. Không lỗi console trong
  suốt quá trình.
- **Hạn chế đã biết, để dành đợt sau**: `ui.ts` CHƯA có khu vực hiển thị RIÊNG
  lá sự kiện đang chạy/lá kế tiếp ngay trên bàn (mục 1.2 file luật dự tính) —
  `viewFor()` đã lộ `activeEventId`/`nextEventId` qua `PlayerView` từ lâu, chỉ
  là chưa có chỗ vẽ ra; hiện người chơi chỉ biết qua dòng nhật ký lúc lật lá
  mới. Nút bấm riêng cho từng nước đi mới của A Fistful of Cards (Sniper/
  Ricochet/Hard Liquor/Ranch/Blood Brothers/A Fistful of Cards/Russian
  Roulette) vẫn CHƯA có, giống nếp High Noon.
- `npx tsc --noEmit` sạch, 657 test đều pass (không đổi count vì chỉ sửa lại 2
  giá trị mong đợi trong test cũ, không thêm/bớt test nào).
