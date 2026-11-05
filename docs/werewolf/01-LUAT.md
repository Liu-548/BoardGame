# Ma Sói — Luật chơi v1 (01-LUAT)

> **Dành cho AI đọc.** Đây là nguồn sự thật DUY NHẤT về luật Ma Sói v1. Mỗi luật có mã `R-xx`;
> file thiết kế (02), xây dựng (03), kiểm thử (04) dẫn chiếu theo mã này.
> Luật nào không có ở đây → **DỪNG LẠI VÀ HỎI chủ dự án**, không tự đoán (xem CLAUDE.md).
> Trạng thái: **ĐÃ DUYỆT (2026-11-05)**.

## 0. Phạm vi v1

- **R-00a** Vai v1: Sói, Dân làng, Tiên tri, Phù thủy, Bảo vệ. Vai khác = bản mở rộng, chưa làm.
- **R-00b** Server đóng vai quản trò. Không có người chơi nào làm quản trò.
- **R-00c** Chỉ chơi qua mạng, mỗi người 1 máy. Không có chế độ hotseat.
- **R-00d** Không có chat trong app. Người chơi tự nói chuyện qua kênh ngoài (Discord/Messenger...).

## 1. Thiết lập ván

- **R-01a** Số người: 6–12 ở v1. Giới hạn trên là 1 hằng số, phải nâng được khi có bản mở rộng (không viết code/UI giả định tối đa 12).
- **R-01b** Chủ phòng chọn số lượng từng vai ở phòng chờ. Có bộ gợi ý theo số người (bảng R-01e), chủ phòng sửa được.
- **R-01c** Hợp lệ khi: tổng số vai = số người; Sói ≥ 1; Sói < số người không phải Sói; Tiên tri/Phù thủy/Bảo vệ mỗi vai tối đa 1.
- **R-01d** Cấu hình vai (vai nào, bao nhiêu) là **công khai** cho mọi người trong phòng.
- **R-01e** Bộ gợi ý mặc định:

| Người | Sói | Tiên tri | Phù thủy | Bảo vệ | Dân |
|---|---|---|---|---|---|
| 6 | 2 | 1 | 1 | 1 | 1 |
| 7 | 2 | 1 | 1 | 1 | 2 |
| 8 | 2 | 1 | 1 | 1 | 3 |
| 9 | 2 | 1 | 1 | 1 | 4 |
| 10 | 3 | 1 | 1 | 1 | 4 |
| 11 | 3 | 1 | 1 | 1 | 5 |
| 12 | 3 | 1 | 1 | 1 | 6 |

- **R-01f** Chia vai ngẫu nhiên qua RNG có seed (quy tắc 2 CLAUDE.md).
- **R-01g** Đầu ván mỗi người chỉ thấy vai của mình. Sói thấy thêm danh sách đồng đội Sói.

## 2. Vai và phe

| Vai | Phe | Khả năng |
|---|---|---|
| Sói | Sói | Mỗi đêm cùng bầy chọn 1 người để cắn (R-41) |
| Dân làng | Dân | Không có |
| Tiên tri | Dân | Mỗi đêm soi 1 người (R-42) |
| Phù thủy | Dân | 1 bình cứu + 1 bình độc cho cả ván (R-43) |
| Bảo vệ | Dân | Mỗi đêm bảo vệ 1 người khỏi Sói (R-40) |

## 3. Vòng chơi

- **R-30** Ván bắt đầu bằng **Đêm 1**, sau đó Ngày 1, Đêm 2, Ngày 2... cho tới khi có phe thắng.
- **R-31** Đêm: các pha vai lần lượt theo thứ tự **Bảo vệ → Sói → Tiên tri → Phù thủy**, rồi tới Bình minh (R-44).
- **R-32** Thứ tự pha đêm v1 cố định. (Sau này chủ phòng sắp xếp được, xem mục 10. Ràng buộc khi làm: Phù thủy luôn phải sau Sói.)
- **R-33** Ngày: Thảo luận → Bỏ phiếu → (nếu có người bị đưa lên) Biện hộ → Phán quyết → Đêm kế tiếp (mục 5).

## 4. Ban đêm

- **R-40 Bảo vệ**
  - a. Chọn 1 người còn sống (được chọn chính mình).
  - b. Không được chọn **cùng 1 người** ở 2 đêm liên tiếp (kể cả chính mình).
  - c. Được phép không chọn ai. Đêm không chọn thì đêm sau không bị ràng buộc b.
  - d. Bảo vệ **chỉ chặn Sói cắn**. Mọi cách chết khác (bình độc, treo cổ, vai mở rộng sau này) vẫn chết như thường.
- **R-41 Sói**
  - a. Mọi Sói còn sống cùng thức. Mỗi Sói thấy **theo thời gian thực** lựa chọn hiện tại của các Sói khác.
  - b. Mỗi Sói chọn 1 người còn sống, **kể cả Sói khác hoặc chính mình**. Đổi lựa chọn hay bỏ chọn bao nhiêu lần cũng được trước khi hết giờ.
  - c. Hết giờ thì chốt: chỉ đếm Sói **đã chọn**. Người có nhiều phiếu nhất (đa số) bị cắn. Nếu hoà phiếu cao nhất → chọn ngẫu nhiên (RNG seed) 1 trong những người hoà.
  - d. Không Sói nào chọn → đêm đó không ai bị cắn.
- **R-42 Tiên tri**
  - a. Chọn 1 người còn sống khác mình. Có soi ngay từ Đêm 1.
  - b. Kết quả chỉ là **"Là Sói"** hoặc **"Không phải Sói"**, không biết vai cụ thể.
  - c. Kết quả chỉ Tiên tri thấy, hiện ngay khi chọn. Mỗi đêm chỉ soi 1 người, chọn xong không đổi được.
- **R-43 Phù thủy**
  - a. Được báo người bị Sói cắn đêm nay (theo R-41c), **dù còn bình cứu hay không**, và **dù người đó có được Bảo vệ hay không**. Không ai bị cắn → báo "Đêm nay không ai bị cắn".
  - b. Bình cứu (1 lần cả ván): chỉ dùng lên người bị cắn đêm nay, kể cả khi đó là chính Phù thủy. Đêm nào cũng dùng được, kể cả Đêm 1.
  - c. Bình độc (1 lần cả ván): dùng lên 1 người còn sống bất kỳ.
  - d. Được dùng **cả 2 bình trong cùng 1 đêm**.
  - e. Được không dùng gì.
  - f. Mọi người thấy số bình còn lại của **chính mình** (chỉ Phù thủy có bình).
- **R-44 Bình minh** (các hiệu ứng đêm áp dụng **cùng lúc** ở đây, không áp dụng ngay khi chọn)
  - a. Người bị cắn **chết**, trừ khi được Bảo vệ (R-40) **hoặc** được bình cứu (R-43b).
  - b. Được cả Bảo vệ lẫn bình cứu → **vẫn sống** (không có luật "cứu chồng thì chết").
  - c. Người bị bình độc **chết**, Bảo vệ không chặn được.
  - d. Vai bị nhắm trong đêm vẫn thực hiện đủ pha của mình đêm đó (vd Phù thủy bị cắn vẫn được cứu/độc), vì hiệu ứng chỉ áp dụng ở Bình minh.
  - e. Kiểm tra thắng (R-60) ngay sau khi áp dụng.

## 5. Ban ngày

- **R-50 Thông báo**: Đầu ngày công bố danh sách người chết đêm qua (hoặc "Đêm qua không ai chết"), xếp theo số ghế. **Không** nói nguyên nhân chết, **không** lật vai.
- **R-51 Thảo luận** — 3 phút.
  - a. Nút **"+60 giây"**: mọi người còn sống đều bấm được, nhưng **cả ngày chỉ dùng được 1 lần**, chỉ trong pha Thảo luận. Ai bấm trước thì dùng mất lượt đó.
  - b. Nút **"Kết thúc sớm"**: mỗi người còn sống bật/tắt được. Khi **quá nửa** người còn sống đang bật → kết thúc Thảo luận ngay.
- **R-52 Bỏ phiếu** — 30 giây.
  - a. Mỗi người còn sống bầu 1 người còn sống hoặc **phiếu trắng**. Đổi phiếu được trước khi hết giờ.
  - b. Phiếu **công khai theo thời gian thực**: mọi người thấy ngay ai đang bầu ai.
  - c. Kết thúc khi hết giờ, **hoặc** khi mọi người còn sống đều đã bỏ phiếu (kể cả phiếu trắng).
  - d. Phiếu trắng **không phải ứng viên**, không "thắng" được ai: chỉ đếm phiếu bầu cho người. Ví dụ 1 người bầu An, 9 người phiếu trắng → An bị đưa lên.
  - e. Người có số phiếu cao nhất (> 0) và **duy nhất** bị đưa lên. Hoà phiếu cao nhất, hoặc không ai có phiếu → không ai bị đưa lên, chuyển sang Đêm kế tiếp. (v1 chỉ làm phương án này, phương án "bầu lại giữa những người hoà" để sau.)
- **R-53 Biện hộ** — 30 giây. Người bị đưa lên tự nói qua kênh ngoài. Không có nút kết thúc sớm.
- **R-54 Phán quyết** — 30 giây.
  - a. Mọi người còn sống **trừ người bị đưa lên** chọn **Giết** hoặc **Tha**. Đổi được trước khi hết giờ. Công khai theo thời gian thực.
  - b. Kết thúc khi hết giờ hoặc khi mọi người có quyền đều đã chọn.
  - c. Số Giết **>** số Tha → người đó chết (không lật vai). Hoà hoặc Tha nhiều hơn → tha. Không chọn thì không tính.
  - d. Kiểm tra thắng (R-60), rồi sang Đêm kế tiếp.

## 6. Điều kiện thắng

- **R-60** Kiểm tra sau **mỗi** lần có người chết (Bình minh, Phán quyết):
  - a. Không còn Sói sống → **phe Dân thắng**.
  - b. Số Sói sống ≥ số người sống không phải Sói → **phe Sói thắng**.
  - c. **Hoà**: nếu cùng lúc không còn Sói sống **và** không còn người sống không phải Sói (vd chết sạch, hoặc Sói cuối + Dân cuối chết cùng đêm) → hoà, không phe nào thắng. Kiểm tra c **trước** a và b.
  - d. Bản mở rộng có thể có 3–4 người chết cùng lúc; luật c vẫn áp dụng.
- **R-61** Hết ván: lật vai của mọi người cho cả phòng.

## 7. Người chết, hết giờ, mất kết nối

- **R-70** Người chết thấy vai của tất cả mọi người (làm khán giả). Không thao tác, không bỏ phiếu, không tính vào "quá nửa" (R-51b) hay "mọi người đã chọn" (R-52c, R-54b).
- **R-71** Hết giờ mà chưa thao tác → coi như bỏ qua (Bảo vệ không bảo vệ, Tiên tri không soi, Phù thủy không dùng bình, phiếu chưa bầu không tính).
- **R-72** Mất kết nối (KHÔNG có 60 giây chờ như Bang!):
  - a. Ghế của người chơi giữ nguyên tới **hết ván**, dù mất kết nối bao lâu. Ván không bao giờ bị huỷ vì mất kết nối.
  - b. Trong lúc mất kết nối: vai vẫn còn, chỉ không thao tác được (R-71). Vào lại thì nhận lại đúng ghế/vai, chơi tiếp.
  - c. Hết ván → danh sách người trong phòng chờ = những người **đang kết nối** lúc đó.
  - d. Nhận diện người vào lại: **tên + mã lưu trên trình duyệt** (không dùng IP). Tên không được trùng trong phòng. Đổi máy: gõ đúng tên thì nhận lại ghế, **chỉ khi** ghế đó đang mất kết nối. Chi tiết ở 02-THIET-KE.

## 8. Chống lộ thông tin (bắt buộc)

- **R-80** Thông báo pha chỉ nêu **tên vai** ("🔮 Tiên tri đang thức dậy"), **không bao giờ** nêu tên người.
- **R-81** Mỗi pha đêm có thời gian **cố định**: chạy đủ giờ **kể cả khi** người giữ vai đã chết, đã thao tác xong, hoặc mất kết nối. Không có nút kết thúc sớm ban đêm, kể cả cho Sói.
- **R-82** Pha của vai **không có trong cấu hình ván** (R-01d công khai) thì bỏ qua hẳn. Vai **có** trong cấu hình thì luôn chạy, dù vai đó còn sống hay không. (Thiết kế dữ liệu phải chừa chỗ cho "bể role", mục 10.)
- **R-83** Ban đêm, màn hình của người không phải vai đang thức phải giống hệt nhau giữa mọi máy.
- **R-84** Dữ liệu mạng cũng không được lộ (vd chỉ gửi gói tin cho đúng người có màn hình thay đổi). Chi tiết kỹ thuật ở 02-THIET-KE.

## 9. Mốc thời gian mặc định

| Pha | Mặc định | Chủ phòng chỉnh được ở v1? |
|---|---|---|
| Mỗi pha vai ban đêm | 30 giây | **Có** (cài đặt phòng chờ, áp dụng chung mọi pha đêm) |
| Thảo luận | 3 phút (+60s, R-51a) | Không |
| Bỏ phiếu | 30 giây | Không |
| Biện hộ | 30 giây | Không |
| Phán quyết | 30 giây | Không |

## 10. Để sau (KHÔNG làm ở v1)

- Chủ phòng tự sắp xếp thứ tự pha đêm (R-32).
- Phương án hoà phiếu "bầu lại giữa những người hoà" (R-52e).
- Vai mở rộng, số người > 12.
- Chỉnh các mốc thời gian ban ngày.
- **Bể role**: cố định số Sói và số Dân (hoặc vài chức năng), các lá còn lại bốc ngẫu nhiên từ "bể" cho đủ số người. Ban đêm, mọi vai **có trong bể** đều có lượt dù thực tế không ai giữ vai đó ("lượt chết", chạy đủ giờ theo R-81) → Sói dễ giả vai hơn. Khi đó R-82 đổi thành "vai có trong bể thì luôn chạy".

## 11. Các chỗ đã chốt khi duyệt (2026-11-05)

- Bảng gợi ý R-01e, tối đa 1 Tiên tri/Phù thủy/Bảo vệ (R-01c), cấu hình vai công khai (R-01d), Bảo vệ được bỏ qua (R-40c), Tiên tri không soi mình và không đổi (R-42), bình cứu chỉ cho người bị cắn (R-43b), bình độc dùng lên mình được (R-43c), "Kết thúc sớm" là công tắc bật/tắt (R-51b): giữ như đề xuất.
- Phiếu trắng không phải ứng viên (R-52d) — chủ dự án bổ sung.
- Cùng lúc hết Sói và hết Dân → **Hoà** (R-60c) — chủ dự án sửa.
- Mất kết nối: bỏ 60s chờ, giữ ghế tới hết ván, nhận diện bằng tên + mã trình duyệt (R-72) — chủ dự án sửa.
