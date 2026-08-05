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
    types.ts       ← kiểu dữ liệu state, action, card
    cards.ts       ← dữ liệu bộ bài (dữ liệu, không phải logic)
    rng.ts         ← sinh số ngẫu nhiên có seed
    setup.ts       ← tạo ván mới
    reduce.ts      ← reduce(state, action) => state mới (KHÔNG có pending.ts
                      riêng như dự tính ban đầu — stack pending quản lý ngay
                      trong reduce.ts, không tách file)
    view.ts        ← viewFor(state, playerId) => state đã lọc
    distance.ts    ← MỚI (việc 1.12): khoảng cách & tầm bắn
    equipment.ts   ← MỚI (việc 1.11): gắn/chuyển lá trang bị (Dynamite...)
    win.ts         ← MỚI (việc 1.13): điều kiện thắng theo phe
    deck.ts        ← MỚI (việc 5.2): drawTopCard() — tách khỏi reduce.ts để
                      characters.ts dùng được mà không vòng lặp import
    characters.ts  ← MỚI (việc 5.1/5.2): hệ thống hook + registry nhân vật
                      (CHARACTERS — ĐỦ 16/16 nhân vật, xem trạng thái bên dưới)
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

**Đang ở:** Giai đoạn 4 xong (4.1-4.6 khung, còn thiếu ảnh thật). Giai đoạn 5 — đủ 16/16 nhân vật (`core/characters.ts`), cơ chế "phát 2 lá nhân vật, chọn giữ 1" ĐÃ BẬT thật cho cả hotseat lẫn qua mạng (kèm đồng hồ 30 giây thật). Bia (Beer) đã hoàn thiện (ngoại lệ 2 người + hồi sinh tự động). **Cả 3 biến thể số người chơi (2/3/8 người) đều đã xong** — xem 3 mục changelog "Biến thể số người chơi" trong CHANGELOG.md. Xem `NHAN-VAT-BANG-CO-BAN.txt` (đặc tả đủ 16 nhân vật + 9 loại hook, chủ dự án viết). **Đang làm lại giao diện theo `GIAO-DIEN-UI-UX.txt`** (đặc tả 12 mục, chủ dự án viết) — đợt 1 (màu chrome, bàn tròn qua mạng, trạng thái seat, chọn nhân vật 2 bước), đợt 2 (mục 4: seat thu nhỏ khi >6 người), đợt 3 (mục 9: dialog nhật ký/cài đặt/mã phòng), đợt 4 (mục 5: cảnh báo riêng Dynamite/Jail), đợt 5 (mục 4: viên đạn thay tim máu + lá nhân vật inline — **mục 4 coi như xong đủ 3 ý**), đợt 6 (mục 8: băng thông báo phản ứng đầu bàn), và đợt 7 (mục 7: khu giữa bàn — bộ bài rút/chồng bỏ) đã xong, xem changelog "Giao diện UI/UX — đợt 1" tới "đợt 7" trong CHANGELOG.md; còn mục 6/9 (phần còn lại) để dành các đợt sau. Việc 5.3 (house rules) có 4/6 luật nháp ban đầu (kèm UI chọn thật). **Việc 5.4 (mở rộng Dodge City) đang làm — đã ĐỦ 40/40 lá bài trong `core/`** (mục A + B + E, xem changelog "Mở rộng Dodge City — đợt 1"/"đợt 2" trong CHANGELOG.md), luật riêng biến thể 3 người (mục D — thưởng 3 lá khi tự tay hạ bất kỳ ai, event `HUNT_KILL_BOUNTY_DRAWN` mới), và UI hiển thị chất bài (mục F — rà lại code phát hiện ĐÃ có sẵn từ đợt 1, badge "8♥"/"K♦" trên mọi lá tay/trang bị, ghi chú cũ chỉ bị lỗi thời) đều đã xong. **Mục C (15/15 nhân vật) HOÀN TẤT** — nhóm A (7 người), nhóm B (4 người), nhóm C (3 người) VÀ Vera Custer (nhân vật cuối cùng, cơ chế uỷ quyền toàn hệ thống hook) đều đã xong (core + test, UI CHƯA có nút bấm thật). Chỉ còn UI thật cho toàn bộ 40 lá/trang bị trì hoãn/mục D/15 nhân vật — xem "Ghi chú cho 5.4" trong `LO-TRINH.md` để biết chi tiết đầy đủ.

> **Lịch sử đầy đủ từng đợt làm việc** (rất dài — chi tiết từng quyết định, từng lần tự kiểm, từng đợt code) đã chuyển sang `CHANGELOG.md`. Đọc file đó khi cần biết TẠI SAO/THẾ NÀO một tính năng cụ thể đã được cài, hoặc còn thiếu gì ở 1 đợt cũ.

## Chưa làm tới, đừng đụng vào

Cả 3 biến thể số người chơi (2/3/8 người) đã HOÀN TẤT (xem 3 mục changelog "Biến thể số người chơi" trong CHANGELOG.md) — không còn biến thể nào đang dang dở.

Cơ chế "phát 2 lá nhân vật, chọn giữ 1" coi như HOÀN TẤT — core, UI (hotseat + qua mạng), và đồng hồ thật (15 giây, xem changelog sửa mốc thời gian trong CHANGELOG.md — ban đầu 30s, đã chỉnh lại) đều đã xong và ĐANG BẬT cho ván thật. Bia (Beer) cũng đã HOÀN THIỆN — cả ngoại lệ "vô tác dụng khi còn 2 người" lẫn cơ chế "hồi sinh tự động khi máu về 0". Việc 5.3 (house rules) đã có 4/6 luật nháp ban đầu, KÈM UI chọn thật (hotseat + qua mạng) — còn lại "gộp 2 lá Beer hồi máu người khác" (cần cơ chế chọn mục tiêu mới) để dành đợt sau. Còn lại ngoài ra: đồ hoạ đẹp (ảnh nhân vật thật trong `public/sprites/characters/`, giống ảnh lá bài — hiện vẫn ô xám vì chưa có file), tài khoản/đăng nhập, bảng xếp hạng. **Âm thanh**: khung Cài đặt (toggle bật/tắt + `playSound()`) đã xong, nhưng CHƯA có file `.mp3` thật trong `public/sounds/` VÀ CHƯA gắn vào sự kiện ván đấu nào (đánh bài, mất máu...) — để dành đợt sau, giống nếp "ảnh tới đâu gắn tới đó".

**5.4 (Dodge City) — CORE HOÀN TẤT (mục A-F đều xong, kể cả 15/15 nhân vật mục C), UI ĐANG LÀM DẦN** (xem changelog "Mở rộng Dodge City — đợt 1"/"đợt 2"/"đợt 3"/"Vera Custer" trong CHANGELOG.md): kiến trúc trang bị trì hoãn (mục A) + toàn bộ 40 lá bài mới (mục B) + luật riêng biến thể 3 người (mục D — `eliminatePlayer()` thưởng 3 lá khi tự tay hạ BẤT KỲ ai, event `HUNT_KILL_BOUNTY_DRAWN` mới, tách biệt `OUTLAW_BOUNTY_DRAWN`) + cơ chế "bỏ kèm 1 lá phụ"/Brawl (mục E) + UI hiển thị chất bài (mục F — rà lại code phát hiện `cardButton()`/`cardChip()` ĐÃ hiện badge chất/số từ đợt 1, tự kiểm lại bằng trình duyệt thật xác nhận đúng) đều xong core+test. **UI lá vàng "trì hoãn" — 2 việc ĐẦU đã xong (đã tự kiểm bằng trình duyệt thật)**: (1) kích hoạt lá vàng đã bày sẵn qua ≥1 lượt (Derringer/Knife/Pepperbox/Buffalo Rifle/Conestoga/Can Can cần chọn mục tiêu — tái dùng ĐÚNG luồng "picking-target"/"picking-panic-equipment"/"picking-cat-balou-zone" đã có sẵn cho Bang!/Panic!/Cat Balou, không viết luồng mới; Canteen/Pony Express/Howitzer không cần mục tiêu, bấm là kích hoạt ngay) — bấm vào lá trên sân giờ gửi `PLAY_CARD`, `reduce()` tự nhận biết đây là kích hoạt (cardId không còn trong tay) qua `activateDelayedEquipment()` có sẵn; (2) đáp lại NEED_MISSED bằng lá vàng trên sân (Bible/Sombrero/Ten Gallon Hat/Iron Plate, đã qua ≥1 lượt) — bấm vào lá đó lúc đang chờ đỡ Bang! giờ gửi `RESPOND` kèm `cardId`, y hệt Missed! trên tay. Phải lộ thêm `equipmentPlayedTurn`/`turnNumber` qua `PlayerView` (`view.ts`) để client qua mạng biết lá nào đủ 1 lượt — không phải bí mật gì (lá bày ngửa công khai). **Còn lại chưa làm**: UI cho lá cần bỏ kèm 1 lá phụ (Brawl/Rag Time/Springfield/Tequila/Whisky — 2 trong 5 lá này, Rag Time/Springfield/Tequila, còn thiếu CẢ bước chọn mục tiêu nên bấm vào là lỗi ngay, chưa chỉ riêng "thiếu bước bỏ kèm"), và UI cho `USE_ABILITY` (xem LƯU Ý dưới) — **CHƯA deploy, kể cả bản beta**, đợi xong nốt 2 việc này hoặc tới khi cần thử qua `wrangler dev`. Bộ mở rộng "dodge_city" (bổ sung theo yêu cầu chủ dự án — TÁCH RIÊNG khỏi house rules cũ, xem `ExpansionId` ở `types.ts`) khi bật cộng đủ 40/40 lá vào bộ bài VÀ đưa 15 nhân vật Dodge City vào bộ bốc "phát 2 lá, chọn giữ 1" — kiến trúc đã sẵn cho nhiều bộ mở rộng cùng lúc (mảng `expansions`, mỗi bộ đóng góp `EXPANSION_CARD_COUNTS`/`EXPANSION_CHARACTER_IDS` riêng), dù hiện chỉ có 1 bộ.

**Mục C (15/15 nhân vật) HOÀN TẤT** — nhóm A (7 người, dùng lại cơ chế có sẵn): Pixie Pete/Bill Noface (`onDrawPhase`), Greg Digger/Herb Hunter (`onAnyDeath`), Pat Brennan (hook mới `canTakeEquipmentInsteadOfDraw` + `PendingAction` mới `NEED_PICK_DRAW_OR_EQUIPMENT`), Chuck Wengam (`canPayLifeToDraw`) + José Delgado (`canDiscardEquipmentToDraw`, thêm `GameState.joseDelgadoUsesThisTurn`) — 2 người sau dùng CHUNG action `USE_ABILITY` với Sid Ketchum nhưng CHỈ trong lượt chính mình. Nhóm B (4 người, hook mới nhưng độc lập): Sean Mallory (`modifyHandLimit`), Tequila Joe (`modifyHealAmount` chỉ ở `playBeer()` + `doubleRevivalHp` riêng cho hồi sinh tự động), Elena Fuente (`hasAnyCardMissedAlias` + `canUseOwnEquipmentAsMissed`), Apache Kid (`isImmuneToCard` — miễn nhiễm lá chất Rô nhắm vào mình, KHÔNG áp dụng Duel/Indians!). Nhóm C (3 người, phụ thuộc lẫn nhau): Molly Stark (`onVoluntaryPlayOutOfTurn`, ngữ cảnh "immediate"/"duel" — `GameState.duelBangDrawPending` dồn Bang! trong Duel, chỉ rút khi Duel thật sự kết thúc), Doc Holyday (`canDiscardTwoForBang`, dùng chung `USE_ABILITY`, thêm `targetId?` vào action + `GameState.docHolydayUsedThisTurn`; miễn nhiễm Apache Kid chỉ khi CẢ 2 lá chất Rô), Belle Star (`disablesOthersEquipment`, hàm trung tâm `getEffectiveEquipment()`). **Vera Custer (nhân vật cuối cùng)** — cơ chế uỷ quyền toàn hệ thống hook: field tĩnh `canBorrowCharacterAbilities` + 3 hàm TRUNG TÂM mới `getEffectiveCharacterId()`/`getEffectiveCharacterHooks()`/`getEffectiveCharacterDefinition()` ở `characters.ts` — MỌI lời gọi `getCharacterHooks()`/`getCharacterDefinition()` rải rác trong `core/` (~30 điểm, đã rà soát trước khi code) đều đổi sang tra qua 3 hàm này. `GameState.veraCusterBorrowedCharacterId` (characterId đang mượn) + `PendingAction` mới `NEED_PICK_BORROWED_CHARACTER` — đẩy Ở BƯỚC ĐẦU TIÊN của lượt cô ta, TRƯỚC CẢ draw!-check Dynamite/Jail (đã hỏi lại và chốt). Mượn được TẤT CẢ nhân vật, không ngoại lệ — CHỈ mượn hook/field tĩnh, KHÔNG mượn bullets/maxHp.

**LƯU Ý (ĐÃ SỬA)**: `dealCharacterCards: true` vẫn hardcode bật thật trong `room.ts`, nhưng 15 nhân vật Dodge City giờ CHỈ vào bộ bốc khi chủ phòng tick bộ mở rộng "dodge_city" (checkbox riêng trên màn hình thiết lập, xem `EXPANSION_CHARACTER_IDS` ở `characters.ts` + lọc ở `setup.ts`) — ván thật KHÔNG tick thì KHÔNG bao giờ phát nhầm 1 trong 15 nhân vật này nữa, dù chưa có UI cho kỹ năng chủ động của Pat Brennan/Chuck Wengam/José Delgado/Doc Holyday/Vera Custer (vẫn tạm "vô hiệu" phần đó nếu ai đó chủ động tick bộ mở rộng lên chơi thử). Còn ĐÚNG UI thật cho toàn bộ 40 lá/trang bị trì hoãn/mục D/15 nhân vật.

Cả 16 nhân vật đã có THẬT trong `core/characters.ts` (việc 5.2, đợt 1-7) và 15/16 đã có nút bấm thật trên giao diện (hotseat lẫn qua mạng, kèm đồng hồ hết giờ tự động).

**LƯU Ý (phát hiện lúc rà UI cho Dodge City, 2026-08-05)**: `USE_ABILITY` (kỹ năng chủ động dùng bất cứ lúc nào — Sid Ketchum tự hồi máu, VÀ 3 nhân vật Dodge City mới dùng chung action này: Chuck Wengam/José Delgado/Doc Holyday) **CHƯA CÓ NÚT BẤM NÀO trong `ui.ts`/`main.ts` — 0 kết quả khi grep "USE_ABILITY"**, kể cả Sid Ketchum (16 nhân vật gốc, tưởng đã xong từ đợt 7). Không lỗi/không treo (chỉ đơn giản không dùng được kỹ năng, chơi như nhân vật thường) nhưng đây là việc cần làm, không chỉ riêng Dodge City. Còn để dành đợt sau.
