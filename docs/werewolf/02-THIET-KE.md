# Ma Sói — Thiết kế kỹ thuật v1 (02-THIET-KE)

> **Dành cho AI đọc.** Luật ở `01-LUAT.md` (mã `R-xx`). File này quy định **cách cài đặt** (mã `D-xx`).
> Mọi quy tắc bất di bất dịch ở `CLAUDE.md` gốc vẫn áp dụng; chỗ nào file này **lệch** khỏi CLAUDE.md
> được ghi ở mục 9 và đã/được chủ dự án duyệt.
> Trạng thái: **ĐÃ DUYỆT (2026-11-05)**, kể cả mục 9 và 10.

## 0. Tổng quan

```
src/
  shared/room/        ← MỚI: khung phòng chơi dùng chung (Ma Sói dùng đầu tiên; Bang! KHÔNG đổi)
    base-room.ts        lớp Durable Object gốc: kết nối, nhận diện, chủ phòng, nhịp tim, alarm, gửi view
    protocol.ts         message chung client↔server (join/lobby/state/error/ping)
    net.ts              client: WebSocket + tự nối lại + nhịp tim (chép ý tưởng từ bang/client/net.ts)
    identity.ts         client: lấy/tạo mã trình duyệt (localStorage)
  games/werewolf/
    core/             ← THUẦN (quy tắc 1, 2, 3 CLAUDE.md)
      types.ts          Role, Phase, GameState, Action, Config
      setup.ts          setupGame()
      reduce.ts         reduce() — toàn bộ luật
      view.ts           viewFor()
      (rng)             import thẳng `nextRandom`/`shuffle` từ src/games/bang/core/rng.ts — đã kiểm: thuần, không phụ thuộc gì
    server/room.ts    ← class WerewolfRoom extends BaseRoom (chỉ nối adapter, mục 5.1)
    client/main.ts, ui.ts, style.css
test/werewolf/        ← test core (xem 04-KIEM-THU)
```

Nối vào dự án hiện có (thay đổi **tối thiểu** ngoài thư mục mới):
- **D-01** `wrangler.jsonc`: thêm binding `WEREWOLF_ROOM` → class `WerewolfRoom`, migration mới `{ "tag": "v2", "new_sqlite_classes": ["WerewolfRoom"] }`, thêm `"/werewolf/*"` vào `run_worker_first`. Khai **cả** ở `env.beta` (wrangler không kế thừa `durable_objects`).
- **D-02** `src/server/index.ts` (Worker entry hiện tại): thêm 1 nhánh định tuyến `/werewolf/room/<mã>` → `env.WEREWOLF_ROOM`, và `export { WerewolfRoom }`. Nhánh `/room/<mã>` của Bang! giữ nguyên.
- **D-03** Sảnh (`src/hub/ui.ts`): thêm thẻ "Ma Sói" (đang chơi được). Sảnh hiện được vẽ từ `bang/client/main.ts`, nên ở đó thêm đúng 1 nhánh: chọn `"werewolf"` → đặt `screen = "external"` (Bang! `render()` gặp giá trị này thì không vẽ gì) rồi gọi `mountWerewolf(root, onExit)` của Ma Sói. `onExit` đưa về Sảnh.

## 1. Kiểu dữ liệu core (`core/types.ts`)

Toàn bộ là JSON thuần (quy tắc 3): không class, Map, Set, hàm.

```ts
type Role = "wolf" | "villager" | "seer" | "witch" | "guard";
type NightStep = "first" | "second";  // R-31 (sửa 2026-11-05): pha 1 = Sói+Bảo vệ+Tiên tri cùng lúc, pha 2 = Phù thủy
type Winner = "village" | "wolves" | "draw";                    // R-60

interface Config {
  roleCounts: Record<Role, number>;   // R-01b..d — công khai
  nightStepMs: number;                // R-09, mặc định 30_000
}

type Phase =
  | { kind: "reveal" }                                   // R-30a: Xem vai 6 giây trước Đêm 1
  | { kind: "night"; night: number; step: NightStep }
  | { kind: "discussion"; day: number }
  | { kind: "vote"; day: number }
  | { kind: "defense"; day: number; accusedId: string }
  | { kind: "verdict"; day: number; accusedId: string }
  | { kind: "ended"; winner: Winner };
// "Bình minh" (R-44) KHÔNG phải 1 pha có thời gian: reduce giải quyết ngay khi pha Phù thủy
// (hoặc pha đêm cuối) hết giờ, rồi chuyển thẳng sang discussion hoặc ended.

interface PlayerState { id: string; name: string; seat: number; role: Role; alive: boolean }

interface GameState {
  rngState: number;
  config: Config;
  players: PlayerState[];             // xếp theo seat
  phase: Phase;
  phaseSeq: number;                   // +1 mỗi lần đổi pha (chống TIME_UP trễ, D-21)
  phaseEndsAt: number | null;         // epoch ms, null khi ended (D-20)
  nightSteps: NightStep[];            // tính 1 lần lúc setup từ config (R-82)
  // --- ban đêm (reset đầu mỗi đêm) ---
  guardTarget: string | null;
  lastGuardTarget: string | null;     // R-40b — null nếu đêm trước không chọn
  wolfPicks: Record<string, string>;  // wolfId → targetId; Sói chưa chọn thì không có key
  bittenId: string | null;            // chốt khi pha wolves kết thúc (R-41c) — Phù thủy đọc
  seerPick: string | null;            // R-42c: đã có thì không đổi
  witchSave: boolean;                 // định dùng bình cứu đêm nay (đổi được tới hết pha)
  witchPoisonTarget: string | null;
  // --- cả ván ---
  potions: { save: boolean; poison: boolean };  // true = còn
  seerResults: { night: number; targetId: string; isWolf: boolean }[];
  lastNightDeaths: string[];          // R-50, xếp theo seat
  // --- ban ngày (reset đầu mỗi ngày) ---
  extendUsed: boolean;                // R-51a
  endEarly: Record<string, true>;     // R-51b — có key = đang bật
  votes: Record<string, string>;      // voterId → targetId | "blank" (R-52)
  verdicts: Record<string, "kill" | "spare">;   // R-54
  log: PublicLogEntry[];              // CHỈ thông tin công khai (D-31)
}
```

**Action** (mọi action người chơi có `playerId`; mọi action có `now` do **server** gán, client gửi gì cũng bị ghi đè — D-22):

```ts
type Action =
  | { type: "GUARD_PICK"; playerId: string; targetId: string | null; now: number }
  | { type: "WOLF_PICK"; playerId: string; targetId: string | null; now: number }
  | { type: "SEER_PICK"; playerId: string; targetId: string; now: number }
  | { type: "WITCH_SET"; playerId: string; save: boolean; poisonTarget: string | null; now: number }
  | { type: "EXTEND_DISCUSSION"; playerId: string; now: number }
  | { type: "TOGGLE_END_EARLY"; playerId: string; now: number }
  | { type: "CAST_VOTE"; playerId: string; targetId: string | "blank" | null; now: number }  // null = rút phiếu
  | { type: "CAST_VERDICT"; playerId: string; choice: "kill" | "spare" | null; now: number }
  | { type: "TIME_UP"; phaseSeq: number; now: number };   // chỉ server gửi (alarm)
```

## 2. Chữ ký hàm core

```ts
function setupGame(players: { id: string; name: string }[], seed: number, config: Config, now: number): GameState;
function reduce(state: GameState, action: Action): { state: GameState; error?: string };
function viewFor(state: GameState, playerId: string): WerewolfView;
function validateConfig(config: Config, playerCount: number): string | null;   // R-01c, null = hợp lệ
function suggestedConfig(playerCount: number): Config;                         // R-01e
```

- **D-10** `reduce` thuần, không sửa `state` đầu vào (quy tắc CLAUDE.md). Action không hợp lệ → trả `state` cũ + `error`. **Câu báo lỗi không được lộ vai** (D-33).
- **D-11** Không có stack `pending` (khác Bang!): Ma Sói không có phản ứng lồng nhau. "Việc đang chờ" chính là `phase` + `phaseEndsAt`. Quy tắc 4 (không await) vẫn giữ nguyên.

## 3. Máy trạng thái pha

```
setup ──► night(1, nightSteps[0]) ──TIME_UP──► night(1, step kế) ... ──TIME_UP pha đêm cuối──►
   [Bình minh R-44: áp chết, R-60 kiểm thắng] ──► discussion(day) | ended
discussion ──TIME_UP | quá nửa endEarly (R-51b)──► vote
vote ──TIME_UP | mọi người sống đã có phiếu (R-52c)──► [R-52d,e] ──► defense(accused) | night(day+1, step 0)
defense ──TIME_UP──► verdict
verdict ──TIME_UP | mọi người có quyền đã chọn (R-54b)──► [R-54c, R-60] ──► night(day+1) | ended
```

- **D-12** Mỗi lần đổi pha: `phaseSeq++`, `phaseEndsAt = now + thời lượng pha` (R-09). Pha đêm **chỉ** kết thúc bằng `TIME_UP` (R-81).
- **D-13** Hết pha `wolves` → tính `bittenId` (R-41c, hoà dùng `rngState`). Hết pha `witch` (hoặc pha đêm cuối nếu không có Phù thủy) → Bình minh.
- **D-14** Bình minh (thứ tự tính, áp cùng lúc): `dies = {}`; nếu `bittenId` và không (`guardTarget === bittenId` hoặc `witchSave`) → thêm `bittenId`; nếu `witchPoisonTarget` → thêm. Trừ bình ứng với lựa chọn đêm đó (`witchSave` → `potions.save=false`; poison tương tự). `lastGuardTarget = guardTarget`. Kiểm thắng: c (hoà) → a → b (R-60).
- **D-15** Kiểm tra hợp lệ theo từng action (đúng pha, đúng vai, người gửi còn sống, mục tiêu còn sống, ràng buộc R-40b/R-42a/R-43b,c). Ví dụ `WITCH_SET.save=true` khi `bittenId === null` hoặc `potions.save === false` → lỗi.

- **D-16 (vai mới, 01 mục 12)** Mọi cái chết đi qua `applyDeaths(ids, cause)`: kéo người yêu chết theo, đẩy Thợ săn/Trưởng làng vào `deathQueue`, bật `cubRevenge` (Sói con), đặt `knightCurse` (Kỵ sĩ bị cắn). Sau mỗi đợt chết gọi `continueAfterDeaths`: pha `hunter` (30s) trước → kiểm thắng → pha `successor` (30s) → quay về `resume` (`{day}` → `election` nếu bật Trưởng làng và chưa bầu, rồi `discussion`; `{night}` → đêm mới). Kẻ chán đời bị treo → `ended(tanner)` ngay; Kẻ ngốc → `idiotRevealed`.
- **D-17** `checkWinner(state)`: cặp đôi khác phe tách riêng; hết người → hoà; chỉ còn cặp đôi → `lovers`; hết Sói và không còn cặp đôi khác phe → `village`; Sói ≥ phần còn lại (tính cả cặp đôi) → `wolves`.

## 4. Đồng hồ (bài học từ Bang!: "reset time")

Ở Bang!, hạn giờ nằm **ngoài** state, server tự đoán lại mỗi lần có hành động (`scheduleDeadline()` so sánh "decision") → dễ cấp lại giờ mới khi không nên. Ma Sói làm ngược lại:

- **D-20** Hạn giờ là **dữ liệu trong state** (`phaseEndsAt`), **chỉ** `reduce` thay đổi nó, và chỉ ở 2 chỗ: đổi pha (D-12) và `+60s` (R-51a). Không có code nào khác được tính lại hạn giờ. Đọc state ra là biết giờ, kể cả sau hibernate/nối lại.
- **D-21** Server: sau mỗi lần lưu state → `ctx.storage.setAlarm(state.phaseEndsAt)` (null → `deleteAlarm`). `alarm()`: đọc state; nếu `now < phaseEndsAt` (alarm sớm) → đặt lại alarm, thoát; ngược lại `reduce({type:"TIME_UP", phaseSeq: state.phaseSeq, now})`. `reduce` **bỏ qua** TIME_UP có `phaseSeq` lệch (pha đã đổi vì kết thúc sớm) → không bao giờ nhảy 2 pha.
- **D-22** `now` do server gán (`Date.now()` ở server, **ngoài** core — quy tắc 2 vẫn giữ: core chỉ đọc `action.now`).
- **D-23** Client đếm ngược bằng `phaseEndsAt` + độ lệch đồng hồ: mỗi message server gửi kèm `serverNow`; client lưu `offset = serverNow - Date.now()`; còn lại = `phaseEndsAt - (Date.now() + offset)`. Máy người chơi chỉnh giờ sai cũng không ảnh hưởng.

## 5. Khung phòng chung (`src/shared/room/`)

### 5.1 Adapter mỗi game cung cấp

```ts
interface GameAdapter<S, A, V, C> {
  defaultConfig(playerCount: number): C;
  validateConfig(config: C, playerCount: number): string | null;
  setup(players: { id: string; name: string }[], seed: number, config: C, now: number): S;
  reduce(state: S, action: A): { state: S; error?: string };
  viewFor(state: S, playerId: string): V;
  deadline(state: S): number | null;             // Ma Sói: state.phaseEndsAt
  timeUpAction(state: S, now: number): A;        // Ma Sói: TIME_UP
  isOver(state: S): boolean;
  minPlayers: number; maxPlayers: number;        // Ma Sói: 6 / 20 (R-01a, hằng số)
}
```
`BaseRoom` không biết gì về luật. Chỉ dùng `ctx.acceptWebSocket` + `webSocketMessage/Close/Error` (quy tắc 7), không `setTimeout/setInterval` (quy tắc 8), không `fetch` treo (quy tắc 9).

### 5.2 Nhận diện người chơi (R-72d)

- **D-40** Client: `identity.ts` tạo **mã trình duyệt** ngẫu nhiên (`crypto.randomUUID()` — client được dùng), lưu `localStorage` khoá theo `(mã phòng, tên)` như Bang! (`getOrCreatePlayerId`). `localStorage` lỗi → mã tạm trong bộ nhớ.
- **D-41** Server lưu `seats: { name, token, playerId }[]` trong storage. `playerId` là id **công khai** (server tự sinh), `token` là **bí mật**, không bao giờ xuất hiện trong view/lobby/log.
- **D-42** So khớp tên: `trim()` + chuẩn hoá NFC + không phân biệt hoa thường. Tên rỗng hoặc > 20 ký tự → từ chối.
- **D-43** `join(name, token)`:
  1. Có ghế cùng tên **và** cùng token → nhận lại ghế đó.
  2. Có ghế cùng tên, **khác** token: ghế đó **đang kết nối** → từ chối "Tên đã có người dùng"; **đang mất kết nối** → nhận ghế, cập nhật token mới (đổi máy).
  3. Chưa có tên: đang ở phòng chờ → tạo ghế mới (nếu chưa đủ `maxPlayers`); đang có ván → vào danh sách "chờ ván sau", chỉ thấy màn hình chờ, **không** nhận view ván đang chơi.
- **D-44** "Đang kết nối" = có socket nhận message trong 90 giây gần nhất (client ping mỗi 20 giây — cùng cơ chế chống "socket ma" của Bang!). **Không** có 60 giây chờ, ván **không bao giờ** huỷ vì mất kết nối (R-72a).
- **D-45** Hết ván (`isOver`) → chủ phòng bấm "Về phòng chờ" → danh sách phòng chờ = người **đang kết nối** (R-72c); ghế mất kết nối bị xoá.
- **D-46** Chủ phòng = người vào sớm nhất **còn kết nối** (giống Bang! `joinOrder`). Chỉ chủ phòng sửa config/bắt đầu ván. Config là công khai (R-01d): mỗi lần sửa → phát lobby cho cả phòng.

### 5.3 Gửi dữ liệu — chống lộ (R-84)

- **D-30** Sau mỗi `reduce` thành công: với **từng** người chơi tính `viewFor`, băm thành chuỗi ngắn (FNV-1a của `JSON.stringify`), so với băm lần gửi trước lưu trong **attachment của socket** (`serializeAttachment` — sống qua hibernate). **Chỉ gửi khi khác.** Ví dụ: Bảo vệ đổi lựa chọn → chỉ máy Bảo vệ nhận gói tin; Sói đổi lựa chọn → chỉ các Sói nhận.
  - Mất băm (socket mới) → gửi cho **đúng socket đó**, không phát cho cả phòng.
  - Đồng hồ (`phaseEndsAt`) nằm trong view → đổi pha thì mọi người cùng nhận, đúng ý.
- **D-31** **Không có `events` gửi chung** như Bang! (bẫy Nomad Norman). Mọi thứ người chơi thấy, kể cả nhật ký, đều đi qua `viewFor`. `state.log` chỉ chứa thông tin công khai (ai chết, kết quả phiếu, ai bị đưa lên).
- **D-32** Lỗi action → gửi `error` cho **đúng socket gửi**.
- **D-33** Câu lỗi dạng chung, không lộ vai: người không phải Bảo vệ gửi `GUARD_PICK` → "Bạn không thể làm việc này lúc này" (giống hệt khi Bảo vệ thật gửi sai pha).

## 6. `viewFor` — ai thấy gì

| Thông tin | Người sống thường | Sói (sống) | Tiên tri | Phù thủy | Người chết | Hết ván |
|---|---|---|---|---|---|---|
| Danh sách tên, ghế, sống/chết, đang kết nối | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Config vai (R-01d), pha, `phaseEndsAt` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Vai của chính mình | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Vai người khác | ✗ | chỉ Sói khác (R-01g) | ✗ | ✗ | ✔ tất cả (R-70) | ✔ tất cả (R-61) |
| `wolfPicks` (trong pha wolves) | ✗ | ✔ (R-41a) | ✗ | ✗ | ✗ | ✗ |
| Lựa chọn của chính mình đêm nay | ✔ | ✔ | ✔ | ✔ | — | — |
| `bittenId` | ✗ | ✗ | ✗ | ✔ từ pha witch (R-43a) | ✗ | ✗ |
| Bình còn lại | ✗ | ✗ | ✗ | ✔ (R-43f) | ✗ | ✗ |
| `seerResults` | ✗ | ✗ | ✔ (chỉ của mình) | ✗ | ✗ | ✗ |
| `votes`, `verdicts`, `endEarly`, `extendUsed` | ✔ (R-52b, R-54a) | ✔ | ✔ | ✔ | ✔ | ✔ |
| `lastNightDeaths`, `log` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

- **D-34** Người chết: chỉ thêm "vai mọi người". **Không** thấy hành động ban đêm theo thời gian thực (để họ không nhận gói tin trong pha đêm → đơn giản hơn).
- **D-35** View **không** chứa: `rngState`, `token`, `bittenId`/`guardTarget`/`witch*` của người khác.
- **D-36** Trong pha đêm, view của mọi người **không phải vai đang thức** phải **giống hệt nhau** ngoại trừ các trường cá nhân luôn có (vai mình, Sói khác...) — test bằng cách so view của 2 Dân (R-83).

## 7. Message (`shared/room/protocol.ts` + kiểu riêng Ma Sói)

```ts
type ClientMessage =
  | { type: "join"; name: string; token: string }
  | { type: "set_config"; config: unknown }        // chỉ chủ phòng; server validate bằng adapter
  | { type: "start_game"; force?: boolean }       // chỉ chủ phòng; seed do server sinh; force = bắt đầu lại giữa ván
  | { type: "action"; action: unknown }            // server gán playerId? KHÔNG — kiểm playerId khớp socket, gán now
  | { type: "return_to_lobby" }                    // chỉ chủ phòng: hủy ván (kể cả đang chơi), cả phòng về phòng chờ
  | { type: "skip_phase"; token: number | null }   // chỉ chủ phòng, CHỈ bản beta (biến DEV_TOOLS): kết thúc pha ngay = TIME_UP sớm; token = GameAdapter.phaseToken (Ma Sói: phaseSeq), pha đã đổi thì bỏ qua
  | { type: "set_test_roles"; roles: Record<string, string> | null } // chỉ chủ phòng, CHỈ bản beta: phòng test tự gán vai (null = tắt)
  | { type: "ping" };
type ServerMessage =
  | { type: "joined"; playerId: string }
  | { type: "join_rejected"; reason: string }
  | { type: "lobby"; players: { playerId: string; name: string; connected: boolean }[]; ownerId: string; config: unknown; inGame: boolean }
  | { type: "state"; view: unknown; serverNow: number }
  | { type: "error"; message: string };
```
- **D-50** Action từ client: server kiểm `action.playerId === playerId của socket` (chống giả mạo, như Bang!), ghi đè `action.now`, từ chối `TIME_UP` từ client.

## 8. Giao diện (R-18 thảo luận: kiểu Among Us, ít thao tác; tối ưu cả màn dọc lẫn ngang)

### 8.1 Bố cục
- **Thanh trên**: tên pha ("🌙 Đêm 2 — 🔮 Tiên tri đang thức dậy" — chỉ tên vai, R-80), đồng hồ, nút "Vai của tôi" (bấm giữ/bấm để hiện, mặc định ẩn để người bên cạnh không nhìn thấy).
- **Lưới thẻ tên**: mỗi người 1 thẻ — tên, số ghế, 💀 + mờ nếu chết, biểu tượng mất kết nối, viền nổi bật cho **chính mình**. Không avatar (chủ dự án chốt "hiện thẻ tên là được"). Dưới thẻ: các **thẻ tên nhỏ** của người đang bầu cho thẻ đó (phiếu thời gian thực R-52b; Sói thấy đồng đội đang chọn ai theo cùng kiểu R-41a).
- **Khu thao tác**: chỉ hiện khi mình có việc. Chạm thẻ để chọn, chạm lại để bỏ chọn. Nút riêng khi cần: Phù thủy "🧪 Cứu (1)" / "☠️ Độc (1)"; ban ngày "+60 giây", "Kết thúc sớm (3/5)", "Phiếu trắng", "Giết"/"Tha".
- **Người không có việc ban đêm**: màn hình đêm chung (R-83), giống hệt nhau mọi máy.

### 8.2 Màn dọc và màn ngang
- **D-60** Lưới: `grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr))` → tự 2–3 cột khi dọc, 4–6 cột khi ngang, chứa > 12 người không cần sửa (R-01a).
- **D-61** Dọc: thanh trên dính đầu, khu thao tác **dính đáy** (`position: sticky; bottom: 0`), lưới ở giữa cuộn được.
- **D-62** Ngang (`@media (orientation: landscape)`): 2 cột — lưới bên trái, khu thao tác + nhật ký thu gọn bên phải. Điện thoại ngang thấp (`max-height: 30rem`): thanh trên co còn 1 dòng.
- **D-63** Vùng chạm ≥ 2.75rem; nút nhỏ cố ý (công tắc, nút đóng) phải `min-height: 0` (bài học Bang! 2026-09-09).
- **D-64** Không ép xoay màn hình. Xoay giữa chừng không mất trạng thái (chỉ là CSS).

### 8.3 Vẽ giao diện (bài học từ Bang!: "tự refresh trang")
Ở Bang!, `render()` dựng lại **toàn bộ** cây DOM, kể cả mỗi giây do đồng hồ → mất dialog, mất trạng thái nhấn giữ, nhảy cuộn. Ma Sói:
- **D-65** Đồng hồ: `setInterval` 250ms ở client **chỉ** sửa `textContent` của 1 phần tử đồng hồ. Không bao giờ gọi vẽ lại toàn bộ.
- **D-66** Vẽ lại **chỉ** khi nhận message từ server. Khung trang (thanh trên, lưới, khu thao tác) dựng **1 lần** khi vào màn; mỗi lần vẽ lại chỉ **cập nhật** thẻ tên theo `playerId` (giữ nguyên phần tử DOM, đổi chữ/class) → không nhảy cuộn, không mất focus.
- **D-67** Cấm `location.reload()` và đổi `location.href` trong luồng chơi. Mất mạng → `net.ts` tự nối lại, gửi lại `join` → server gửi view hiện tại → giao diện tiếp tục, đồng hồ đúng nhờ D-20/D-23.
- **D-68** Không có trạng thái "đang chọn dở" chỉ sống ở client: mọi lựa chọn gửi lên ngay, hiển thị theo view server trả về. Nối lại là thấy đúng lựa chọn cũ.

## 9. Điểm lệch so với CLAUDE.md — ĐÃ DUYỆT

| # | CLAUDE.md nói | Ma Sói làm | Lý do |
|---|---|---|---|
| 1 | `reduce` trả `{ state, events }` | Trả `{ state, error? }`, không có `events` | `events` gửi chung cho mọi máy là nguồn lộ thông tin (D-31) |
| 2 | Stack `state.pending` (quy tắc 5) | Dùng `phase` + `phaseEndsAt` | Không có phản ứng lồng nhau (D-11) |
| 3 | `setupGame(playerIds, seed, options)` | Thêm tham số `now`, nhận cả tên | Cần đặt hạn giờ pha đầu (D-12) |
| 4 | Chỉ sửa trong thư mục game | Sửa nhỏ `wrangler.jsonc`, `server/index.ts` (trước 2026-11-06: `bang/server/index.ts`), `bang/client/main.ts`, `hub/ui.ts` | Sảnh + Worker entry hiện nằm trong Bang! (D-01..03) |
| 5 | Mất kết nối 60s rồi huỷ ván (Bang!) | Giữ ghế tới hết ván | R-72 chủ dự án chốt |

## 10. Chỗ AI tự quyết — ĐÃ DUYỆT

| # | Mã | Đã chọn tạm |
|---|---|---|
| 1 | D-34 | Người chết chỉ thấy vai mọi người, không xem hành động đêm trực tiếp |
| 2 | D-42 | Tên tối đa 20 ký tự, so khớp không phân biệt hoa thường |
| 3 | D-43.3 | Người vào giữa ván chỉ thấy màn hình chờ |
| 4 | WITCH_SET | Lựa chọn Phù thủy đổi được tới hết pha (khác Tiên tri), bình chỉ bị trừ ở Bình minh |
| 5 | GUARD_PICK | Lựa chọn Bảo vệ đổi được tới hết pha |
| 6 | D-45 | Sau khi hết ván, chủ phòng bấm "Về phòng chờ" (không tự động) |
