# Ma Sói — Kế hoạch kiểm thử v1 (04-KIEM-THU)

> **Dành cho AI đọc.** Mỗi test dẫn mã luật/thiết kế nó bảo vệ. Test **T-xx** = Vitest tự động (`test/werewolf/`).
> Test **M-xx** = kiểm tay bằng trình duyệt thật + `wrangler dev`. Test nào đỏ vì luật có vẻ sai → **hỏi chủ dự án**, không sửa test cho xanh.

## 0. Hạ tầng test (`test/werewolf/helpers.ts`)

```ts
// Tạo ván với vai CỐ ĐỊNH (không phụ thuộc xáo bài) — test đọc dễ hơn.
// Ghế = thứ tự mảng. id = tên viết thường.
makeGame(roles: Role[], opts?: { nightStepMs?: number; seed?: number; now?: number }): GameState
// Gửi action, gán `now` mặc định, ASSERT không có error, trả state mới.
act(state, action): GameState
// Gửi action, ASSERT CÓ error, ASSERT state không đổi, trả câu lỗi.
reject(state, action): string
// Gửi TIME_UP với đúng phaseSeq, now = phaseEndsAt.
timeUp(state): GameState
// timeUp lặp tới khi phase.kind/step bằng đích.
skipTo(state, target: { kind: Phase["kind"]; step?: NightStep }): GameState
```
- `makeGame` gọi `setupGame` thật rồi gán lại `role` cho từng người (state là JSON nên sửa trực tiếp được).
- Mọi test của `reduce` chạy trong 1 wrapper kiểm **không sửa state đầu vào** (deep-freeze bằng `Object.freeze` đệ quy trước khi gọi).
- Bộ vai chuẩn hay dùng: `STD6 = ["wolf","wolf","seer","witch","guard","villager"]` → id `p0..p5` (p0,p1 là Sói, p2 Tiên tri, p3 Phù thủy, p4 Bảo vệ, p5 Dân).

## 1. Test tự động

### T-SET — tạo ván (W1)
| Mã | Kiểm | Luật |
|---|---|---|
| T-SET-01 | `validateConfig` từ chối: tổng ≠ số người; 0 Sói; Sói ≥ số không phải Sói; 2 Tiên tri; số người < 6 hoặc > 12 | R-01a,c |
| T-SET-02 | `suggestedConfig(n)` cho n = 6..12 khớp bảng R-01e **và** qua `validateConfig` | R-01e |
| T-SET-03 | Cùng seed → cùng chia vai; 20 seed khác nhau → không phải lúc nào cũng giống nhau | R-01f |
| T-SET-04 | Pha đầu `night(1, step đầu)`, `phaseSeq = 1`, `phaseEndsAt = now + nightStepMs` | R-30, D-12 |
| T-SET-05 | `nightSteps` đúng thứ tự guard→wolves→seer→witch, bỏ vai không có trong config | R-31, R-82 |
| T-SET-06 | State qua `JSON.parse(JSON.stringify())` vẫn `toEqual` bản gốc | Quy tắc 3 |

### T-NIGHT — ban đêm (W2)
| Mã | Kiểm | Luật |
|---|---|---|
| T-N-01 | Bảo vệ chọn chính mình được | R-40a |
| T-N-02 | Bảo vệ chọn lại người đêm trước → lỗi; đêm trước không chọn → đêm này chọn ai cũng được | R-40b,c |
| T-N-03 | Bảo vệ đổi lựa chọn trong pha → giữ lựa chọn cuối | 02 §10.5 |
| T-N-04 | Người không phải Bảo vệ gửi GUARD_PICK → lỗi **cùng câu** với Bảo vệ gửi sai pha | D-33 |
| T-N-05 | 3 Sói: 2 chọn A, 1 chọn B → A bị cắn | R-41c |
| T-N-06 | 2 Sói chọn 2 người khác nhau → bị cắn là 1 trong 2; cùng seed → luôn cùng kết quả | R-41c |
| T-N-07 | 1 Sói chọn, 1 Sói không chọn → người được chọn bị cắn | R-41c |
| T-N-08 | Không Sói nào chọn → `bittenId = null`, sáng không ai chết | R-41d |
| T-N-09 | Sói chọn Sói khác / chọn chính mình → hợp lệ, chết nếu không ai cứu | R-41b |
| T-N-10 | Sói đã chết gửi WOLF_PICK → lỗi | R-70 |
| T-N-11 | Tiên tri soi Sói → `isWolf: true`; soi Dân/Phù thủy → `false` | R-42b |
| T-N-12 | Tiên tri soi chính mình → lỗi; soi lần 2 cùng đêm → lỗi | R-42a,c |
| T-N-13 | Phù thủy thấy `bittenId` **kể cả** khi người đó được Bảo vệ | R-43a |
| T-N-14 | Cứu khi không ai bị cắn → lỗi; cứu khi hết bình → lỗi; vẫn thấy `bittenId` khi hết bình | R-43a,b |
| T-N-15 | Phù thủy tự cứu mình (bị cắn) ở Đêm 1 → sống | R-43b |
| T-N-16 | Độc chính mình hợp lệ; độc người đã chết → lỗi | R-43c |
| T-N-17 | Dùng cả 2 bình 1 đêm → cả 2 có hiệu lực | R-43d |
| T-N-18 | Bình chỉ bị trừ ở Bình minh; đổi ý (bỏ cứu) trước hết pha → bình còn | 02 §10.4 |

### T-DAWN — Bình minh (W2)
| Mã | Kiểm | Luật |
|---|---|---|
| T-DW-01 | Bị cắn, không ai cứu → chết | R-44a |
| T-DW-02 | Bị cắn + được Bảo vệ → sống | R-44a |
| T-DW-03 | Bị cắn + bình cứu → sống | R-44a |
| T-DW-04 | Bị cắn + Bảo vệ + bình cứu → **sống** | R-44b |
| T-DW-05 | Bị độc + được Bảo vệ → **chết** | R-40d, R-44c |
| T-DW-06 | Cắn A + độc B → cả 2 chết, `lastNightDeaths` xếp theo ghế | R-44, R-50 |
| T-DW-07 | Phù thủy bị cắn đêm đó vẫn dùng bình được trong pha của mình | R-44d |
| T-DW-08 | Không ai chết → `lastNightDeaths = []` | R-50 |

### T-TIME — đồng hồ (W2)
| Mã | Kiểm | Luật |
|---|---|---|
| T-T-01 | Mọi action ban đêm **không** đổi `phaseEndsAt` | D-20 |
| T-T-02 | Pha đêm của vai đã chết vẫn có đủ `nightStepMs`, chỉ kết thúc bằng TIME_UP | R-81 |
| T-T-03 | TIME_UP với `phaseSeq` cũ → state không đổi, không lỗi | D-21 |
| T-T-04 | Đổi pha → `phaseSeq + 1`, `phaseEndsAt = now + thời lượng pha mới` | D-12 |
| T-T-05 | Action có `now` khác nhau nhưng không đổi pha → `phaseEndsAt` vẫn y nguyên | D-20 |

### T-DAY — ban ngày (W3)
| Mã | Kiểm | Luật |
|---|---|---|
| T-D-01 | Thảo luận 3 phút; +60s cộng đúng 60 000ms; lần 2 cùng ngày → lỗi (kể cả người khác bấm) | R-51a |
| T-D-02 | +60s trong pha vote → lỗi; ngày hôm sau dùng lại được | R-51a |
| T-D-03 | 5 người sống: 3 bật "Kết thúc sớm" → sang vote; 2 bật → chưa; bật rồi tắt → bớt 1 | R-51b |
| T-D-04 | 6 người sống: đúng 3 bật (= một nửa) → **chưa** kết thúc | R-51b |
| T-D-05 | Người chết bật kết thúc sớm → lỗi; không tính vào mẫu số | R-70 |
| T-D-06 | Bầu, đổi phiếu, rút phiếu (`null`), phiếu trắng | R-52a |
| T-D-07 | Mọi người sống đã có phiếu → kết thúc ngay, không cần TIME_UP | R-52c |
| T-D-08 | 1 phiếu cho A + còn lại phiếu trắng → A bị đưa lên | R-52d |
| T-D-09 | Hoà phiếu cao nhất → không ai bị đưa lên, sang đêm | R-52e |
| T-D-10 | Toàn phiếu trắng / không ai bầu → sang đêm | R-52e |
| T-D-11 | Bầu người đã chết → lỗi; người chết bầu → lỗi | R-52a, R-70 |
| T-D-12 | Biện hộ 30s, mọi action bị từ chối, chỉ kết thúc bằng TIME_UP | R-53 |
| T-D-13 | Người bị đưa lên gửi CAST_VERDICT → lỗi | R-54a |
| T-D-14 | Giết > Tha → chết; Giết = Tha → tha; không ai chọn → tha | R-54c |
| T-D-15 | Mọi người có quyền đã chọn → kết thúc ngay | R-54b |
| T-D-16 | Người bị treo không bị lật vai trong `log` | R-54c |

### T-WIN — thắng (W3)
| Mã | Kiểm | Luật |
|---|---|---|
| T-W-01 | Treo Sói cuối → `ended`, winner `village` | R-60a |
| T-W-02 | Sáng ra Sói sống = số còn lại → `wolves` | R-60b |
| T-W-03 | Đêm cuối: độc Sói cuối + cắn Dân cuối → `draw` | R-60c |
| T-W-04 | `ended` → `phaseEndsAt = null`, mọi action (kể cả TIME_UP) bị từ chối/không đổi | R-61, D-21 |

### T-PURE / T-SIM (W2, W3)
| Mã | Kiểm |
|---|---|
| T-P-01 | `reduce` không sửa state đầu vào (deep-freeze) — áp cho **mọi** test ở trên qua helper |
| T-P-02 | Cùng seed + cùng action log → state cuối giống hệt (chạy 2 lần, `toEqual`) |
| T-P-03 | `grep` không có `Math.random`, `Date.now`, `crypto` trong `src/games/werewolf/core/` (test đọc file) |
| T-SIM-01 | Ván STD6 hoàn chỉnh theo log cố định → Dân thắng ở Ngày 2 |
| T-SIM-02 | Ván STD6 hoàn chỉnh → Sói thắng |

### T-VIEW — ai thấy gì (W4) — **nhóm test quan trọng nhất**
| Mã | Kiểm | Luật |
|---|---|---|
| T-V-01 | Dân không thấy vai người khác (trường `role` của người khác là `undefined`/không có) | R-01g |
| T-V-02 | Sói thấy vai của các Sói khác, không thấy vai Dân/chức năng | R-01g |
| T-V-03 | Trong pha wolves: Sói thấy `wolfPicks`; Dân, Tiên tri, Phù thủy, Bảo vệ, người chết **không** thấy | R-41a, D-34 |
| T-V-04 | `bittenId` chỉ có trong view Phù thủy, chỉ từ pha witch | R-43a |
| T-V-05 | `seerResults` chỉ có trong view Tiên tri | R-42c |
| T-V-06 | Số bình chỉ có trong view Phù thủy | R-43f |
| T-V-07 | Người chết thấy vai mọi người | R-70 |
| T-V-08 | Hết ván: ai cũng thấy vai mọi người | R-61 |
| T-V-09 | `JSON.stringify(view)` của mọi người **không** chứa `rngState`, `token`, `guardTarget` (trừ Bảo vệ), `witchPoisonTarget` (trừ Phù thủy) | D-35 |
| T-V-10 | **Mọi pha đêm**: view của p5 (Dân) và view của 1 Dân khác giống hệt nhau sau khi bỏ trường "của tôi" (id, vai mình) | R-83, D-36 |
| T-V-11 | Bảo vệ đổi lựa chọn → view của mọi người **trừ** Bảo vệ không đổi (so `JSON.stringify` trước/sau) | R-84, D-30 |
| T-V-12 | Tương tự T-V-11 cho Tiên tri, Phù thủy; Sói đổi lựa chọn → chỉ view các Sói đổi | R-84, D-30 |
| T-V-13 | Ban ngày: `votes`, `verdicts`, `endEarly` có trong view mọi người | R-52b, R-54a |

### T-ROOM — khung phòng, hàm thuần (W5)
| Mã | Kiểm | Thiết kế |
|---|---|---|
| T-R-01 | `normalizeName`: " An " = "an" = "AN"; NFC (gõ dấu kiểu tổ hợp = dựng sẵn); rỗng / > 20 ký tự → lỗi | D-42 |
| T-R-02 | `decideJoin`: cùng tên + cùng token → `reclaim` | D-43.1 |
| T-R-03 | Cùng tên, khác token, ghế **đang kết nối** → `reject` | D-43.2 |
| T-R-04 | Cùng tên, khác token, ghế **mất kết nối** → `takeover` | D-43.2 |
| T-R-05 | Tên mới, phòng chờ, chưa đầy → `new_seat`; đầy → `reject` | D-43.3 |
| T-R-06 | Tên mới, đang có ván → `wait_next_game` | D-43.3 |
| T-R-07 | `viewHash` cùng view → cùng chuỗi; khác 1 trường → khác chuỗi | D-30 |
| T-R-08 | `pickOwner`: người vào đầu mất kết nối → người kế tiếp còn kết nối | D-46 |

## 2. Kiểm tay (M-xx) — W6..W10

Chuẩn bị: `npm run build` rồi `npm run server:dev` (**`wrangler dev` không tự build lại** — bài học Bang!). Mở **6 tab**, mỗi tab 1 tên khác (An, Bình, Chi, Dũng, Em, Phúc) — mã trình duyệt khoá theo (phòng, tên) nên 6 tab cùng 1 trình duyệt vẫn là 6 người. Đặt pha đêm = 10s cho nhanh.

| Mã | Kịch bản | Kết quả đúng |
|---|---|---|
| M-01 | Tạo phòng, 6 tab vào. Chủ phòng sửa số vai | Mọi tab thấy config đổi ngay; config sai → nút Bắt đầu khoá + hiện lý do |
| M-02 | Chơi trọn 1 đêm + 1 ngày | Thanh trên chỉ hiện tên vai (R-80); tab không có việc hiện giống hệt nhau; Sói thấy nhau chọn trực tiếp; phiếu ngày hiện trực tiếp dưới thẻ tên |
| M-03 | Đang giữa pha, F5 (tải lại) 1 tab | Vào lại đúng ghế/vai, đồng hồ **tiếp tục** đúng số giây (không về 30) |
| M-04 | Đóng hẳn 1 tab 2 phút rồi mở lại cùng tên | Nhận lại ghế; trong lúc vắng thẻ tên hiện biểu tượng mất kết nối; ván không bị huỷ |
| M-05 | Tab khác (trình duyệt ẩn danh) gõ tên "An" khi An đang kết nối | Bị từ chối "Tên đã có người dùng". Đóng tab An rồi thử lại sau 90s → nhận ghế An |
| M-06 | Mô phỏng 390×760 (dọc) và 760×390 (ngang) | Dọc: lưới 2–3 cột, khu thao tác dính đáy. Ngang: lưới trái, thao tác phải. Không tràn ngang. (Dùng kỹ thuật iframe cùng nguồn như Bang!; `resize_window` không đổi được kích thước thật trong sandbox) |
| M-07 | Mở DevTools → Network → WS ở tab Dân. Chờ pha Bảo vệ, cho Bảo vệ đổi lựa chọn 3 lần | Tab Dân **không** nhận gói tin nào trong pha đó (chỉ nhận lúc đổi pha) |
| M-08 | Mở 1 dialog / cuộn lưới xuống giữa lúc đồng hồ chạy | Dialog không tự đóng, không nhảy cuộn, không mất chữ đang gõ (D-65, D-66) |
| M-09 | Từ Sảnh vào Ma Sói, chơi, thoát về Sảnh, vào Bang! chơi 1 lượt | Cả 2 game chạy bình thường, không lỗi console |
| M-10 | Chơi tới hết ván, chủ phòng "Về phòng chờ" khi 1 tab đã đóng | Lật vai mọi người; phòng chờ chỉ còn người đang kết nối |

Mỗi M-xx: ghi vào CHANGELOG "đã kiểm / chưa kiểm được vì…". Không lỗi console ở bất kỳ mục nào.
