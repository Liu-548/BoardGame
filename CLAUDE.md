# CLAUDE.md

Đọc file này trước khi làm bất cứ việc gì trong repo.

## Bối cảnh

Game bài online kiểu Bang! (bản tự cài đặt lại luật, không dùng tài sản gốc), cho một nhóm bạn nhỏ chơi với nhau. Phi thương mại.

Chủ dự án **mới học lập trình, kiến thức web ở mức dưới căn bản**. Mục tiêu song song là học, không chỉ là có sản phẩm chạy được. Điều này quyết định cách bạn làm việc — xem phần "Cách làm việc" bên dưới.

## Ngăn xếp công nghệ — đã chốt, không đề xuất thay đổi

| Hạng mục | Lựa chọn |
|---|---|
| Ngôn ngữ | TypeScript |
| Server | Cloudflare Workers + Durable Objects |
| Framework | **Không dùng framework nào** — không React, Vue, Svelte, boardgame.io, Colyseus, PartyServer, Express, Socket.IO |
| Client | TypeScript + DOM thuần |
| Build | Vite (chỉ để bundle) + Wrangler |
| Test | Vitest |
| Dependencies | Càng ít càng tốt. **Hỏi trước khi thêm bất kỳ package nào.** |

## Cấu trúc thư mục

```
src/
  core/          ← luật chơi. THUẦN. Không biết gì về mạng, DOM, Cloudflare.
    types.ts     ← kiểu dữ liệu state, action, card
    cards.ts     ← dữ liệu bộ bài (dữ liệu, không phải logic)
    rng.ts       ← sinh số ngẫu nhiên có seed
    setup.ts     ← tạo ván mới
    reduce.ts    ← reduce(state, action) => state mới
    pending.ts   ← quản lý stack việc đang chờ
    view.ts      ← viewFor(state, playerId) => state đã lọc
  server/
    index.ts     ← Worker entry, định tuyến theo mã phòng
    room.ts      ← lớp Durable Object, 1 instance = 1 phòng
  client/
    net.ts       ← WebSocket, reconnect
    ui.ts        ← vẽ DOM
    main.ts
  protocol.ts    ← MỚI (việc 3.5, không có trong bản gốc file này): kiểu dữ
                   liệu message client↔server (ClientMessage/ServerMessage).
                   Cả server/ và client/ đều cần đọc kiểu này nên không đặt
                   trong core/ (core/ vẫn không import gì từ đây) hay riêng
                   client/server — coi như "ngôn ngữ chung" 2 bên.
test/
index.html       ← trang gốc, Vite mặc định tìm ở đây (không phải public/,
                   xem ghi chú việc 2.1 bên dưới)
public/          ← tài sản tĩnh copy y nguyên (ảnh lá bài từ việc 4.6...),
                   style.css tạm để đây
wrangler.jsonc
```

> **Lệch 1 chỗ so với bản gốc file này:** dự tính ban đầu là `public/index.html`,
> nhưng Vite mặc định coi `index.html` ở gốc dự án là trang vào, còn `public/`
> chỉ dùng để copy y nguyên tài sản tĩnh (ảnh, v.v.) — đặt `index.html` vào
> `public/` khiến việc import file TypeScript từ `src/client/` bị lỗi đường dẫn
> lúc `vite dev`. Đổi lại cho khớp quy ước của Vite (việc 2.1). Không cần file
> `vite.config.ts`/`vitest.config.ts` nào — mặc định của Vite đã đủ cho cả 2.

## Quy tắc bất di bất dịch

| # | Quy tắc | Lý do |
|---|---|---|
| 1 | `core/` **không được import** bất cứ thứ gì từ `server/`, `client/`, thư viện mạng, DOM, hay Cloudflare | Để test được, để sau này thêm board game khác dùng chung `server/` |
| 2 | Trong `core/` cấm `Math.random()`, `Date.now()`, `crypto.randomUUID()` | Ngẫu nhiên phải đi qua RNG có seed truyền vào. Cùng seed + cùng action log phải cho ra cùng kết quả, luôn luôn |
| 3 | State phải là dữ liệu JSON thuần | Phải serialize được để lưu, gửi, replay. Không class có method, không `Map`, không `Set`, không hàm trong state |
| 4 | **Không bao giờ `await` để chờ người chơi trả lời** | Xem "Mô hình chờ" bên dưới. Đây là quy tắc quan trọng nhất trong file này |
| 5 | Việc đang chờ lưu trong `state.pending`, là **mảng dùng như stack**, luôn xử lý phần tử **cuối cùng** | Reaction của Bang! lồng nhau nhiều tầng |
| 6 | Client **không bao giờ** nhận state đầy đủ. Server chỉ gửi `viewFor(state, playerId)` | Chống gian lận bằng DevTools. Không có ngoại lệ, kể cả khi debug |
| 7 | Trong Durable Object phải dùng `ctx.acceptWebSocket(ws)` và các handler `webSocketMessage` / `webSocketClose` / `webSocketError` | Dùng `ws.accept()` sẽ bị tính duration toàn bộ thời gian kết nối → 1 phòng sống 24h ≈ 10.800 GB-s/ngày, hạn mức miễn phí chỉ 13.000 |
| 8 | Cấm `setInterval` và `setTimeout` trong Durable Object. Cần hẹn giờ thì dùng `ctx.storage.setAlarm()` | Timer đang chờ sẽ chặn hibernate vĩnh viễn |
| 9 | Không để `fetch()` đang await treo lơ lửng trong DO | Cũng chặn hibernate |
| 10 | Mọi thay đổi trong `core/` phải kèm test | Chủ dự án chưa đủ kinh nghiệm để nhìn code mà phát hiện luật sai |

## Mô hình chờ (quy tắc 4 và 5)

**SAI:**

```ts
async function playBang(state, attacker, target) {
  const reply = await askPlayer(target, "Missed?");  // ❌ TUYỆT ĐỐI KHÔNG
  if (!reply) target.hp -= 1;
}
```

**ĐÚNG:** ghi việc đang chờ vào state rồi kết thúc hàm ngay.

```ts
// reduce trả về state mới, hàm kết thúc, server rảnh và có thể hibernate
state.pending.push({
  kind: "NEED_MISSED",
  player: "B",
  source: { card: "bang", from: "A" }
});
```

Khi B gửi hành động lên, nó đi qua `reduce` như mọi action khác: đọc `pending[pending.length - 1]`, kiểm tra hợp lệ, `pop()`, áp dụng hậu quả, và có thể `push()` thêm mục mới.

**Tại sao phải là stack:** A đánh Gatling → push yêu cầu Missed! cho B, C, D → C dùng Barrel → Barrel cần lật bài kiểm tra → push "draw check" lên **đỉnh** → giải quyết xong mới quay lại C → rồi mới tới D. Cái phát sinh sau phải xử lý trước.

## Chữ ký hàm cốt lõi — giữ nguyên hình dạng này

```ts
type Result = { state: GameState; events: GameEvent[] };

function reduce(state: GameState, action: Action): Result;
function viewFor(state: GameState, playerId: string): PlayerView;
function setupGame(playerIds: string[], seed: number, options: RuleOptions): GameState;
```

`reduce` phải thuần: cùng đầu vào → cùng đầu ra, không side effect, không sửa `state` truyền vào.

## Cách làm việc — quan trọng

| Loại việc | Bạn làm thế nào |
|---|---|
| Hạ tầng: wrangler config, WebSocket, build, CSS, HTML, boilerplate | Cứ viết. Giải thích ngắn gọn kết quả là đủ |
| `core/` — luật chơi | **Giải thích cách tiếp cận TRƯỚC, chờ đồng ý, rồi mới viết.** Đây là phần chủ dự án cần tự hiểu |
| Thêm dependency mới | Hỏi trước, kèm lý do tại sao không tự viết được |
| Đổi kiến trúc, đổi kiểu dữ liệu state | Hỏi trước |
| Luật Bang! không rõ ràng | **Dừng lại và hỏi.** Không tự đoán rồi cài đặt |

Nguyên tắc chung:

- **Mỗi lần một việc.** Không tự động làm thêm những thứ chưa được yêu cầu.
- **Không refactor toàn dự án** trừ khi được yêu cầu rõ ràng.
- Ưu tiên code dễ đọc hơn code ngắn. Chủ dự án phải đọc hiểu được.
- Đặt tên biến bằng tiếng Anh, comment bằng tiếng Việt.
- Khi giải thích, giả định người đọc **chưa biết** thuật ngữ web. Gặp từ mới thì giải thích ngắn ngay tại chỗ.
- Nếu thấy chủ dự án đang yêu cầu một thứ vi phạm quy tắc ở trên, **nói ra**, đừng lặng lẽ làm theo.

## Trạng thái hiện tại

> Cập nhật dòng này mỗi khi xong một giai đoạn. Xem `LO-TRINH.md`.

**Đang ở:** Giai đoạn 4 xong (4.1-4.6 khung, còn thiếu ảnh thật). Giai đoạn 5 — việc 5.1 (hệ thống hook) xong. **Vừa xong việc 5.2 đợt 1**: 6/16 nhân vật (Bart Cassidy, El Gringo, Paul Regret, Rose Doolan, Vulture Sam, Willy the Kid) — 10 người còn lại (cần pending/luồng action mới) để dành đợt sau. Xem `NHAN-VAT-BANG-CO-BAN.txt` (đặc tả đủ 16 nhân vật + 9 loại hook, chủ dự án viết).

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
- `CARD_DESCRIPTIONS` (`ui.ts`) — mô tả ngắn cho đủ 22 lá, soạn theo ĐÚNG luật đã cài trong `reduce.ts` (đọc kỹ lại toàn bộ file trước khi viết, không chép luật gốc BANG! từ trí nhớ) — vài chỗ bản này CỐ Ý lệch luật gốc, mô tả phải khớp đúng cái đang chạy: Cat Balou không giới hạn khoảng cách (luật gốc có), Beer HIỆN CHƯA có ngoại lệ "vô tác dụng khi chỉ còn 2 người sống" (comment trong `reduce.ts` xác nhận đây là lỗ hổng CHƯA cài, không phải cố ý).
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

**Việc tiếp theo:** việc 5.2 đợt 2 — nhóm nhân vật kế tiếp (Jourdonnais/Black Jack trước, ít phức tạp hơn nhóm cần `PendingAction` mới), hoặc làm cơ chế "phát 2 lá nhân vật, chọn giữ 1" thật nếu chủ dự án muốn ưu tiên trước — xem `NHAN-VAT-BANG-CO-BAN.txt` + `LO-TRINH.md`.

## Chưa làm tới, đừng đụng vào

10/16 nhân vật còn lại (Jourdonnais, Black Jack, Jesse Jones, Kit Carlson, Pedro Ramirez, Lucky Duke, Slab the Killer, Calamity Janet, Sid Ketchum, Suzy Lafayette — xem `NHAN-VAT-BANG-CO-BAN.txt`), cơ chế "phát 2 lá nhân vật thật/chọn giữ 1" (hiện chỉ gán tạm qua `RuleOptions.characterAssignments`, KHÔNG có màn hình chọn nhân vật nào trên giao diện), expansion, house rules, đồ hoạ đẹp, âm thanh, tài khoản/đăng nhập, bảng xếp hạng.

6 nhân vật đầu (Bart Cassidy, El Gringo, Paul Regret, Rose Doolan, Vulture Sam, Willy the Kid) đã có THẬT trong `core/characters.ts` (việc 5.2 đợt 1) nhưng CHỈ dùng được qua code/test — chưa ai chơi được qua giao diện thật vì chưa có cơ chế chọn nhân vật.
