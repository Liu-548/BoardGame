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

**Đang ở:** Giai đoạn 3 — mạng (Giai đoạn 1 + 2 đã HOÀN THÀNH TOÀN BỘ). **XONG việc 3.1 → 3.5** (+ bonus chat công khai/riêng tư):

- 3.1: `src/server/index.ts` là Worker entry, đã deploy thật lên Cloudflare (tài khoản `nguyenngoctuan548@gmail.com`) — link: **https://bang-boardgame.nguyenngoctuan548.workers.dev** (⚠️ link này đang chạy CODE CŨ, chưa deploy lại từ sau việc 3.2 — chỉ mới `wrangler dev` local cho 3.3/3.4/3.5, nói trước khi deploy lại nếu cần).
- 3.2: `src/server/room.ts` — Durable Object `Room`, đếm lượt truy cập bằng `ctx.storage`. `wrangler.jsonc` có `durable_objects.bindings` + `migrations` (`new_sqlite_classes`).
- 3.3: WebSocket + Hibernation — bắt buộc `ctx.acceptWebSocket()`, không `server.accept()` (quy tắc 7). `webSocketClose()` bọc `try/catch` vì mã đóng "dự phòng" (1005/1006) từ trình duyệt có thể khiến `ws.close()` tự ném lỗi (phát hiện qua log lúc kiểm thử).
- 3.4: `index.ts` định tuyến `/room/<mã phòng>` — `env.ROOM.idFromName(roomCode)` tự đảm bảo "cùng mã → cùng Room".
- 3.5 + bonus: `src/protocol.ts` (**mới, lệch cấu trúc gốc** — xem mục "Cấu trúc thư mục" ở trên) định nghĩa `ClientMessage`/`ServerMessage`. Đã NỐI THẬT phần chat vào `room.ts` (không chờ view.ts việc 3.6 vì chat không đụng state ván đấu): gửi `{type:"join", playerId}` để server nhớ danh tính socket (`ws.serializeAttachment()` — sống sót qua hibernate, khác biến JS thường); gửi `{type:"chat", text, to?}` — không có `to` thì phát cho CẢ PHÒNG, có `to` thì **server chỉ gửi cho đúng người gửi + người nhận đó, không ai khác trong phòng nhận được gói tin** (không phải kiểu ẩn ở giao diện). Phần `{type:"action"}` (đánh bài thật) CHƯA xử lý — để dành việc 3.6 trở đi khi có `viewFor()`.
- Đã tự kiểm bằng 3 tab trình duyệt thật (An/Bình/Chi tự `join`): nhắn cả phòng cả 3 đều thấy; An nhắn riêng cho Bình và Bình trả lời riêng — cả 2 chiều đúng người nhận, Chi hoàn toàn không thấy nội dung tin riêng (kiểm tra mảng tin nhận được ở tab Chi, không chỉ nhìn giao diện). Không lỗi console, không lỗi log server.

153 test đều pass (không đổi gì ở `src/core/`).

**Việc tiếp theo:** 3.6 — lọc view theo người chơi (`core/view.ts`, `viewFor()`) — cần xong trước khi nối phần `action`/state thật vào giao thức 3.5.

## Chưa làm tới, đừng đụng vào

Nhân vật (16 skill), expansion, house rules, đồ hoạ đẹp, âm thanh, tài khoản/đăng nhập, bảng xếp hạng.

Bản đầu tiên **cố tình bỏ nhân vật** — mọi người 4 máu, không skill — để tránh 16 ngoại lệ luật khi engine chưa vững.
