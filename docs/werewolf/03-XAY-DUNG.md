# Ma Sói — Kế hoạch xây dựng v1 (03-XAY-DUNG)

> **Dành cho AI đọc.** Làm **đúng thứ tự**, **mỗi lần 1 việc** (CLAUDE.md). Xong 1 việc → báo chủ dự án, chờ "tiếp" rồi mới sang việc sau.
> Luật: `01-LUAT.md` (R-xx). Thiết kế: `02-THIET-KE.md` (D-xx). Test: `04-KIEM-THU.md` (T-xx, M-xx). Cả 3 đã duyệt.

## Quy ước chung cho mọi việc

1. **Trước khi code `core/`**: luật + thiết kế đã duyệt coi như "cách tiếp cận đã được đồng ý". Chỉ cần nêu 2–3 dòng sẽ làm gì. **Phải dừng và hỏi** nếu: gặp tình huống luật không ghi (01 không có), muốn lệch khỏi 02, hoặc muốn thêm package.
2. **Xong** = `npm run typecheck` + `npm test` đều pass, các test T-xx của việc đó đã viết và pass, test Bang! cũ không đỏ.
3. Comment tiếng Việt, tên biến tiếng Anh, dẫn mã luật trong comment ở chỗ cài luật (vd `// R-41c: hoà thì bốc ngẫu nhiên`).
4. Không sửa code Bang! ngoài đúng 4 chỗ ở 02 mục 9 dòng 4.
5. Cuối mỗi việc: thêm 1 mục vào `CHANGELOG.md` và cập nhật 1 dòng "Ma Sói" trong phần "Trạng thái hiện tại" của `CLAUDE.md`. **Không** tự commit/deploy trừ khi chủ dự án bảo.

## Danh sách việc

| Việc | Nội dung | File | Phụ thuộc | Test phải pass |
|---|---|---|---|---|
| **W1** | Kiểu dữ liệu, `suggestedConfig`, `validateConfig`, `setupGame` | `werewolf/core/types.ts`, `setup.ts` | — | T-SET |
| **W2** | `reduce` ban đêm + Bình minh + `TIME_UP` | `core/reduce.ts` | W1 | T-NIGHT, T-TIME, T-PURE |
| **W3** | `reduce` ban ngày + điều kiện thắng | `core/reduce.ts` | W2 | T-DAY, T-WIN, T-SIM |
| **W4** | `viewFor` | `core/view.ts` | W3 | T-VIEW |
| **W5** | Khung phòng chung: hàm thuần (nhận diện, băm view) + `BaseRoom` + protocol | `src/shared/room/*` | — | T-ROOM |
| **W6** | `WerewolfRoom` + định tuyến + wrangler | `werewolf/server/room.ts`, `server/index.ts` (trước 2026-11-06: `bang/server/index.ts`), `wrangler.jsonc` | W4, W5 | M-01 (phần server, test bằng 2 tab thô) |
| **W7** | Client: nối mạng + phòng chờ (nhập tên, config, bộ gợi ý) | `shared/room/net.ts`, `identity.ts`, `werewolf/client/*` | W6 | M-01, M-04, M-05 |
| **W8** | Client: màn chơi (thanh trên, lưới thẻ tên, khu thao tác, đồng hồ) dọc + ngang | `werewolf/client/ui.ts`, `style.css` | W7 | M-02, M-03, M-06, M-07, M-08 |
| **W9** | Thẻ "Ma Sói" ở Sảnh + `mountWerewolf` + nhánh `screen = "external"` | `hub/ui.ts`, `bang/client/main.ts` | W8 | M-09 |
| **W10** | Chạy đủ kịch bản tay M-01..M-10, sửa lỗi | — | W9 | Tất cả |

## Chi tiết từng việc

### W1 — Kiểu dữ liệu và tạo ván
- Viết đúng kiểu ở 02 mục 1. `PublicLogEntry` tự thiết kế dạng dữ liệu (vd `{ kind: "deaths", night, ids }`), **không** lưu câu chữ tiếng Việt trong state (client tự dịch ra chữ).
- `suggestedConfig(n)` theo bảng R-01e. `validateConfig` theo R-01c, trả câu lỗi tiếng Việt cho chủ phòng đọc.
- `setupGame`: xáo vai bằng `shuffle` (rng Bang!), ghế theo thứ tự `players` truyền vào, `nightSteps` lọc theo config (R-82), pha đầu = `night(1, nightSteps[0])`, `phaseSeq = 1`, `phaseEndsAt = now + nightStepMs`.
- Ca biên: config không có Bảo vệ/Tiên tri/Phù thủy → `nightSteps` chỉ còn `["wolves"]`.

### W2 — Ban đêm
- Mỗi action: kiểm đúng pha → đúng vai → còn sống → mục tiêu hợp lệ (D-15). Lỗi dùng **1 câu chung** cho mọi trường hợp "không được làm lúc này" (D-33).
- `TIME_UP`: `phaseSeq` lệch → trả nguyên state, **không** báo lỗi. Đúng → sang step kế; hết step → Bình minh (D-14) → `discussion` hoặc `ended`.
- Hết step `wolves` tính `bittenId` (D-13). Hoà dùng `nextRandom(rngState)`, lưu `rngState` mới.
- Đầu mỗi đêm reset các trường "ban đêm" (02 mục 1).
- **Không** đổi `phaseEndsAt` ở bất kỳ action ban đêm nào (D-20).

### W3 — Ban ngày + thắng
- Đầu ngày reset các trường "ban ngày". `extendUsed` → `phaseEndsAt += 60_000` (chỉ trong discussion).
- "Quá nửa" = `count * 2 > aliveCount` (R-51b). "Mọi người đã chọn" chỉ đếm người có quyền (R-52c, R-54b, R-70).
- Thắng theo D-14 thứ tự c → a → b. `ended` → `phaseEndsAt = null`, mọi action bị từ chối.
- T-SIM: viết 2 ván hoàn chỉnh bằng action log cố định (1 ván Dân thắng, 1 ván Sói thắng) — đây là "bằng chứng" luật chạy đúng từ đầu tới cuối.

### W4 — viewFor
- Cài đúng bảng 02 mục 6. Kiểu `WerewolfView` khai báo **tường minh từng trường** (không spread `state` rồi xoá bớt — dễ sót trường mới).
- `isWolf` trong `seerResults` chỉ có ở view Tiên tri.

### W5 — Khung phòng chung
- Tách phần quyết định thành **hàm thuần** để test bằng Vitest mà không cần Cloudflare: `normalizeName`, `decideJoin(seats, connectedIds, inGame, name, token)` → `{ kind: "reclaim" | "takeover" | "new_seat" | "wait_next_game" | "reject", ... }` (D-42, D-43), `viewHash(view)` (FNV-1a, D-30), `pickOwner(joinOrder, connectedIds)` (D-46).
- `BaseRoom`: đọc kỹ `bang/server/room.ts` để học cách dùng `acceptWebSocket`, attachment, alarm, nhịp tim — **viết mới**, không import từ đó.
- Attachment socket: `{ playerId, lastSeenAt, lastViewHash }`. Không lưu token trong attachment nếu không cần.
- Mọi đường đổi state đều đi qua 1 hàm `commit(newState)`: lưu storage → đặt alarm theo `adapter.deadline` (D-21) → gửi view có lọc (D-30).

### W6 — Server Ma Sói
- `WerewolfRoom extends BaseRoom` chỉ truyền adapter (02 mục 5.1).
- `wrangler.jsonc` + `index.ts` theo D-01, D-02. Kiểm `wrangler dev` chạy, mở `ws://localhost:8787/werewolf/room/TEST` được.
- Kiểm bản Bang! vẫn vào phòng bình thường (không hỏng route cũ).

### W7 — Phòng chờ
- Màn nhập tên + mã phòng (hoặc tạo mã). Danh sách người trong phòng, ai mất kết nối.
- Chủ phòng: số lượng từng vai (bấm +/−), nút "Dùng gợi ý", thời gian pha đêm, nút "Bắt đầu" (khoá khi `validateConfig` lỗi, hiện câu lỗi). Người khác thấy config **chỉ đọc**, cập nhật trực tiếp.
- Bị từ chối tên → hiện lý do, cho nhập lại.

### W8 — Màn chơi
- Theo 02 mục 8. Tuân thủ tuyệt đối D-65..D-68 (đồng hồ chỉ sửa 1 node; dựng khung 1 lần; cập nhật thẻ theo `playerId`; cấm reload).
- Chữ hiển thị cho từng pha, ví dụ: `🛡️ Bảo vệ đang thức dậy`, `🐺 Sói đang thức dậy`, `🔮 Tiên tri đang thức dậy`, `🧪 Phù thủy đang thức dậy`, `☀️ Ngày 2 — Thảo luận`, `🗳️ Bỏ phiếu`, `🎤 <tên> biện hộ`, `⚖️ Phán quyết <tên>`.
- Màn hết ván: phe thắng (hoặc Hoà), lật vai mọi người, nút "Về phòng chờ" cho chủ phòng.

### W9 — Sảnh
- Theo D-03. Rời Ma Sói → về Sảnh, Bang! hoạt động lại bình thường (kiểm vào 1 ván Bang! sau đó).

### W10 — Kiểm thử tay tổng
- Chạy đủ M-01..M-10 ở `04-KIEM-THU.md`, ghi kết quả từng mục vào CHANGELOG.
