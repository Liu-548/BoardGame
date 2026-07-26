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

**Đang ở:** Giai đoạn 4 — Hoàn thiện. Giai đoạn 3 (việc 3.1 → 3.10 + 2 việc bổ sung) đã xong hẳn — xem lịch sử bên dưới. **Vừa xong việc 4.4** (giao diện dễ nhìn hơn, responsive).

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

**Việc tiếp theo:** việc 4.5 — kiểm tra hạn mức Cloudflare (xem `LO-TRINH.md`).

## Chưa làm tới, đừng đụng vào

Nhân vật (16 skill), expansion, house rules, đồ hoạ đẹp, âm thanh, tài khoản/đăng nhập, bảng xếp hạng.

Bản đầu tiên **cố tình bỏ nhân vật** — mọi người 4 máu, không skill — để tránh 16 ngoại lệ luật khi engine chưa vững.
