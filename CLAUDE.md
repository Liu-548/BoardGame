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

**Đang ở:** Giai đoạn 3 — mạng (Giai đoạn 1 + 2 đã HOÀN THÀNH TOÀN BỘ). **XONG việc 3.1 → 3.9** (+ bonus chat công khai/riêng tư):

- 3.1-3.4 (gọn lại): `src/server/index.ts` + `src/server/room.ts` (Durable Object `Room`) — deploy thật ở **https://bang-boardgame.nguyenngoctuan548.workers.dev** (⚠️ chưa deploy lại kể từ việc 3.7, link công khai đang chạy code cũ hơn — chỉ mới test bằng `wrangler dev` local cho 3.7-3.9). WebSocket dùng Hibernation API đúng cách (`ctx.acceptWebSocket()`, không `server.accept()` — quy tắc 7). Định tuyến `/room/<mã phòng>`.
- 3.5 + bonus: `src/protocol.ts` (**mới, lệch cấu trúc gốc**) định nghĩa `ClientMessage`/`ServerMessage`. Chat công khai/riêng tư hoạt động thật.
- 3.6: `core/view.ts` — `viewFor()` ẩn bài tay + vai trò người khác (trừ chính mình/Sheriff/người đã chết).
- 3.7: `room.ts` lưu `GameState` thật vào `ctx.storage`. `{type:"action"}` xử lý thật qua `reduce()`.
- 3.8: `src/client/net.ts` — `RoomConnection` tự động kết nối lại (1 giây cố định) sau khi mất kết nối, tự `join` lại, tự nhận lại đúng ván nhờ state đã lưu ở 3.7.
- **3.9 (mới)**: Lobby thật — `protocol.ts`: `join` giờ có thêm `name`; `start_game` bỏ tham số `playerIds` (server TỰ lấy danh sách người đang kết nối qua `ctx.getWebSockets()` + `deserializeAttachment()` — không lưu riêng ở đâu, luôn đúng theo thời gian thực); thêm `ServerMessage` mới `{type:"lobby", players}` phát mỗi khi có người vào/rời phòng. `room.ts`: `joinedPlayers()` đọc trực tiếp từ socket đang mở; `webSocketClose()` cũng phát lại "lobby" khi có người rời. `main.ts`/`ui.ts` thêm màn hình MỚI: chọn "chơi chung 1 máy" hay "chơi qua mạng" → form nhập tên + mã phòng (nút "Tạo mã ngẫu nhiên" sinh mã 6 ký tự, bỏ ký tự dễ nhầm 0/O/1/I/L) → phòng chờ hiện mã + danh sách người đã vào (tự cập nhật realtime) + nút "Bắt đầu ván" (cần ≥4 người) → màn hình bàn chơi qua mạng CHỈ HIỂN THỊ TỐI GIẢN (đọc `PlayerView`, CHƯA bấm bài được qua mạng — nối tương tác thật để dành việc 3.10, không dùng lại `renderApp()` vì hình dạng dữ liệu GameState đầy đủ khác PlayerView đã lọc).
- Đã tự kiểm bằng 4 tab trình duyệt thật (An/Bình/Chi/Dũng), qua `net.ts` thật (không giả lập): mỗi tab tự tạo/vào đúng 1 phòng bằng mã 6 ký tự, danh sách lobby tự đồng bộ real-time giữa các tab không cần thao tác gì thêm, bấm "Bắt đầu ván" ở 1 tab thì CẢ 4 tab đều chuyển màn hình và mỗi tab chỉ thấy ĐÚNG bài + vai trò của chính mình (người khác ẩn) — đúng cả việc 3.6 lẫn 3.9 cùng lúc. Không lỗi console/server.

162 test đều pass.

**Việc tiếp theo:** 3.10 — chơi thử thật với bạn bè (1 ván hoàn chỉnh, 4 người, 4 nơi khác nhau) — cần nối tương tác bấm bài thật qua mạng trước (thay `renderNetworkGameReadOnly()` tạm thời).

## Chưa làm tới, đừng đụng vào

Nhân vật (16 skill), expansion, house rules, đồ hoạ đẹp, âm thanh, tài khoản/đăng nhập, bảng xếp hạng.

Bản đầu tiên **cố tình bỏ nhân vật** — mọi người 4 máu, không skill — để tránh 16 ngoại lệ luật khi engine chưa vững.
