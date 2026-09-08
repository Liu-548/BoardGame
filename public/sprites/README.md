# Ảnh lá bài & nhân vật & lá sự kiện

## Trạng thái: ĐÃ CÓ ẢNH cho toàn bộ 44 lá bài + 42 nhân vật + 28 lá sự kiện

(2026-08-22) Đợt rà soát toàn bộ: thêm 8 nhân vật *ex còn thiếu, đổi 15 icon
chọn chưa khớp, tự vẽ 14 icon nhân vật, gắn dải ký hiệu chức năng cho 43/44 lá
bài và 19/28 lá sự kiện, và sinh lại 78 ảnh lá bài/nhân vật để nét đúng màu nâu/tím
than (trước đó bị đen do lỗi script, xem cuối file). Danh sách thay đổi ở mục
"Nhật ký đổi icon" cuối file.

Client tự ghép đường dẫn, không cần khai báo gì thêm:

- Lá bài  → `/sprites/<tên lá>.png`            (xem `cardImageUrl()` trong `src/games/bang/client/ui.ts`)
- Nhân vật → `/sprites/characters/<characterId>.png`  (xem `characterImageUrl()`)
- Lá sự kiện → `/sprites/events/<EventId>.png`       (xem `eventImageUrl()`)
- Mặt lưng → `/sprites/card-back.png`
- Viên đạn → `/sprites/bullet-full.png`, `/sprites/bullet-empty.png`
- Ký hiệu chức năng rời → `/sprites/marks/<tên ký hiệu>.png` (nền trong suốt,
  dùng cho bảng chú giải trong giao diện — xem mục "Bộ ký hiệu chức năng")

Lá sự kiện để THƯ MỤC RIÊNG `events/` chứ không nằm chung gốc `sprites/`:
`EventId` và `CardName` là 2 không gian tên tách biệt, để chung thì lúc nào đó
trùng tên nhau là ghi đè nhau mà không ai biết.

Ảnh 256×256 PNG nền trong suốt, phần minh hoạ nằm trong một ô "giấy da" bo góc.
KHÔNG vẽ tên lá/số/chất trong ảnh — client đã đè chữ lên sẵn.

3 nhóm khác nhau ở TÔNG MÀU khung, liếc 1 cái là biết đang nhìn loại gì:

| Nhóm | Nền | Viền | Nét vẽ |
|---|---|---|---|
| Lá bài | giấy da `#f0e3c8` | `#b99b6b` | nâu `#4a3728` |
| Nhân vật | xanh xám `#dfe3ee` | `#8d94ad` | tím than `#3d3a52` |
| Lá sự kiện | tím nhạt `#ece2f6` | `#7d4fb3` | tím `#4a2a6b` |

Màu viền lá sự kiện CỐ TÌNH trùng `.card-box--event` trong `public/style.css` —
sửa 1 chỗ thì nhớ sửa chỗ kia.

Thiếu ảnh nào thì lá đó vẫn hiển thị bình thường bằng chữ (không vỡ giao diện).

## Giấy phép / ghi công — BẮT BUỘC GIỮ

ĐỌC KỸ: mục này nói về **RIÊNG BỘ ẢNH trong thư mục này**, KHÔNG nói gì về
BANG! hay về việc dự án có được phát hành hay không. Hai chuyện tách rời nhau —
xem mục "Bản quyền BANG!" bên dưới.

Ảnh hiện tại là **icon nguồn mở từ [game-icons.net](https://game-icons.net)**,
giấy phép **CC BY 3.0**. Riêng phần ảnh này được dùng, sửa, phát hành lại (kể
cả thương mại) miễn là **ghi công**. Tác giả: Lorc, Delapouite, và cộng đồng
game-icons.net.

Nếu đưa game lên mạng, giữ dòng ghi công này ở đâu đó người chơi đọc được
(màn hình Cài đặt / trang giới thiệu là đủ):

> Icons by [game-icons.net](https://game-icons.net) — CC BY 3.0

## Bản quyền BANG! — phần này KHÔNG được giấy phép trên che cho

Ghi lại đây để sau này không hiểu nhầm "icon CC BY 3.0" = "cả dự án phát hành
thoải mái". Không phải vậy. (Đây là hiểu biết chung, KHÔNG phải tư vấn pháp lý
— cần chắc chắn thì hỏi người có chuyên môn.)

KHÔNG được bản quyền bảo hộ:

- **Luật chơi / cơ chế** (rút 2 lá, tầm bắn theo súng, vòng tròn khoảng cách,
  vai trò ẩn...). Ở hầu hết các nước, ý tưởng và hệ thống trò chơi không thuộc
  phạm vi bản quyền — đây là lý do các bản clone tồn tại công khai được.

CÓ được bảo hộ:

- **Tranh minh hoạ lá bài và chân dung nhân vật gốc** — chính là lý do thư mục
  này dùng icon nguồn mở thay vì ảnh scan từ hộp bài.
- **Nguyên văn câu chữ trong sách luật gốc.**
- **Tên "BANG!"** — nhãn hiệu của dV Giochi.
- **Vùng xám**: bê nguyên cả danh sách 31 tên nhân vật gốc ("Calamity Janet",
  "Slab the Killer"...). Một cái tên lẻ thì không sao, cả bộ sưu tập thì khác.

Thực tế với dự án này: chơi riêng trong nhóm bạn, phi thương mại, không phát
hành → rủi ro gần như bằng không, và `CLAUDE.md` đã tự đặt đúng ranh giới rồi
("không dùng tài sản gốc").

Nếu SAU NÀY muốn đưa lên mạng công khai, hai việc cần làm trước:

1. **Đổi tên game** — đừng gọi nó là BANG!.
2. **Cân nhắc đổi tên nhân vật** sang tên tự đặt.

Luật chơi thì giữ nguyên được, không phải sửa gì.

## Muốn thay bằng ảnh tự vẽ?

Cứ ghi đè đúng tên file, KHÔNG cần sửa dòng code nào. Xoá file thì lá đó tự quay
về hiển thị bằng chữ.

## Sinh lại toàn bộ ảnh

`_generate-sprites.py` là script đã dùng để sinh bộ ảnh này (cần `cairosvg` và
gói npm `@iconify-json/game-icons`). Sửa bảng `CARDS`/`CHARS`/`EVENTS` trong đó
rồi chạy lại nếu muốn đổi icon cho một lá cụ thể.

```
pip install cairosvg
npm install --no-save @iconify-json/game-icons   # chạy ở gốc dự án
python _generate-sprites.py            # sinh lại TẤT CẢ
python _generate-sprites.py events     # CHỈ thư mục events/ (cards | chars | events)
```

**Lỗi màu nét — ĐÃ XỬ LÝ XONG (2026-08-22), giữ lại để khỏi dẫm lại:** body
icon của iconify dùng `fill="currentColor"`, thuộc tính `fill` đặt trên thẻ
`<g>` cha KHÔNG đè được lên nó, nên 78 ảnh lá bài/nhân vật sinh trước
2026-08-08 đều là **nét ĐEN**, 2 hằng `INK`/`INK_CH` coi như vô tác dụng.
Script đã sửa (đặt thêm `color="..."`) từ 2026-08-08 nhưng ảnh cũ để nguyên
tới 2026-08-22 mới sinh lại — giờ toàn bộ đã đúng tông nâu/tím than như bảng
trên. Thêm hằng màu mới thì nhớ đặt CẢ `fill=` lẫn `color=`.

## Bảng tra: lá bài → hình nền + dải ký hiệu

| File | Hình nền | Dải ký hiệu | Chức năng |
|---|---|---|---|
| `bang.png` | `gunshot` | Bang! · 1 người · theo tầm súng | bắn 1 người trong tầm súng |
| `missed.png` | `dodging` | Missed! | chỉ để đỡ Bang!/Gatling |
| `beer.png` | `beer-stein` | ♥1 | tự hồi 1 máu |
| `saloon.png` | `saloon-doors` | ♥1 · nhiều người | mọi người còn sống hồi 1 máu |
| `stagecoach.png` | `old-wagon` | rút 2 | rút thêm 2 lá |
| `wells_fargo.png` | `chest` | rút 3 | rút thêm 3 lá |
| `panic.png` | `grab` | cướp bài · 1 người · kc 1 | cướp 1 lá của người ở khoảng cách 1 |
| `cat_balou.png` | `card-burn` | bắt bỏ bài · 1 người | bắt 1 người bất kỳ bỏ 1 lá |
| `general_store.png` | `shop` | rút 1 · nhiều người | lật N lá, mỗi người chọn 1 |
| `indians.png` | `tomahawk` | ♥−1 · nhiều người | mọi người khác bỏ 1 Bang! hoặc mất 1 máu |
| `duel.png` | `duel` | ♥−1 · 1 người | đấu tay đôi, ai hết Bang! trước mất 1 máu |
| `gatling.png` | `machine-gun` | Bang! · nhiều người | bắn TẤT CẢ người khác, bất kể khoảng cách |
| `brawl.png` | `brass-knuckles` | bỏ kèm 1 · bắt bỏ bài · nhiều người | bỏ kèm 1 lá → TẤT CẢ người khác bỏ 1 lá |
| `dodge.png` | `avoidance` | Missed! · rút 1 | đỡ như Missed!, đỡ được thì rút 1 lá |
| `punch.png` | `punch` | Bang! · 1 người · kc 1 | như Bang! ở khoảng cách 1, bất kể súng |
| `rag_time.png` | `banjo` | bỏ kèm 1 · cướp bài · 1 người | bỏ kèm 1 lá → cướp 1 lá của người bất kỳ |
| `springfield.png` | `musket` | bỏ kèm 1 · Bang! · 1 người | bỏ kèm 1 lá → Bang! người bất kỳ |
| `tequila.png` | `agave` | bỏ kèm 1 · ♥1 · 1 người | bỏ kèm 1 lá → hồi 1 máu cho người bất kỳ |
| `whisky.png` | `brandy-bottle` | bỏ kèm 1 · ♥2 | bỏ kèm 1 lá → tự hồi 2 máu |
| `volcanic.png` | `luger` | tầm 1 + ∞ | súng tầm 1, đánh Bang! không giới hạn |
| `schofield.png` | `revolver` | tầm 2 | súng tầm 2 |
| `remington.png` | `blunderbuss` | tầm 3 | súng tầm 3 |
| `rev_carabine.png` | `sawed-off-shotgun` | tầm 4 | súng tầm 4 |
| `winchester.png` | `winchester-rifle` | tầm 5 | súng tầm 5 |
| `barrel.png` | `barrel` | Missed! | trúng Bang! thì lật bài, ra Cơ là né |
| `scope.png` | `crosshair` | kc −1 | mình nhìn người khác gần hơn 1 |
| `mustang.png` | `horse-head` | kc +1 | người khác nhìn mình xa hơn 1 |
| `jail.png` | `imprisoned` | cấm · 1 người | gắn lên người khác — không thoát thì mất lượt |
| `dynamite.png` | `dynamite` | ♥−3 | nổ thì mất 3 máu |
| `binocular.png` | `binoculars` | kc −1 | như Ống nhắm, cộng dồn được |
| `hideout.png` | `cave-entrance` | kc +1 | như Ngựa Mustang, cộng dồn được |
| `bible.png` | `open-book` | Missed! · rút 1 | dùng như Missed!, đỡ được thì rút 1 lá |
| `sombrero.png` | `sombrero` | Missed! | dùng như Missed! |
| `ten_gallon_hat.png` | `western-hat` | Missed! | dùng như Missed! |
| `iron_plate.png` | `metal-plate` | Missed! | dùng như Missed! |
| `canteen.png` | `water-flask` | ♥1 | tự hồi 1 máu |
| `pony_express.png` | `envelope` | rút 3 | rút thêm 3 lá |
| `derringer.png` | `pistol-gun` | Bang! · 1 người · kc 1 · rút 1 | Bang! khoảng cách 1, luôn rút thêm 1 lá |
| `conestoga.png` | `saddle` | cướp bài · 1 người | cướp 1 lá của người bất kỳ |
| `can_can.png` | `large-dress` | bắt bỏ bài · 1 người | bắt 1 người bất kỳ bỏ 1 lá |
| `buffalo_rifle.png` | `lee-enfield` | Bang! · 1 người | Bang! người bất kỳ, bất kể khoảng cách |
| `knife.png` | `bowie-knife` | Bang! · 1 người · kc 1 | Bang! ở khoảng cách 1 |
| `pepperbox.png` | `crossed-pistols` | Bang! · 1 người · theo tầm súng | Bang! đúng tầm súng đang cầm |
| `howitzer.png` | `field-gun` | Bang! · nhiều người | bắn TẤT CẢ người khác, bất kể khoảng cách |

## Bảng tra: nhân vật → tên icon gốc

Icon nhân vật chọn theo **gợi ý KHẢ NĂNG** (dễ nhớ khi chơi) chứ không phải
chân dung — vd Vulture Sam là con kền kền, Lucky Duke là đồng xu đang tung,
Jourdonnais là dãy thùng gỗ. Khung nhân vật dùng tông xanh xám để phân biệt với
lá bài (tông giấy da).

14/42 nhân vật dùng **icon TỰ VẼ** (tiền tố `custom:`) vì trong 4134 icon của
game-icons không cái nào diễn tả gọn được khả năng của họ. Path SVG nằm ngay
trong `_generate-sprites.py`, mục "ICON TỰ VẼ" — sửa toạ độ ở đó rồi chạy lại
script là ra ảnh mới. Vẽ theo đúng ngôn ngữ hình của game-icons (khối đặc 1
màu, chi tiết KHOÉT LỖ bằng `fill-rule="evenodd"`, không nét mảnh, không màu
thứ 2) nên ăn y nguyên bộ màu nâu/tím than/tím, đứng cạnh icon gốc không lệch
tông.

### Bộ ký hiệu chức năng — MỖI KÝ HIỆU MỘT MỤC

Nhân vật thì vẽ hẳn, nhưng LÁ BÀI đi theo cơ chế khác: giữ hình gốc game-icons
làm chủ ngữ (để phân biệt Whisky với Tequila) rồi gắn thêm **dải ký hiệu cố
định ở đáy** nói lá đó làm gì — khai trong `CUSTOM_MIX` với tiền tố `mix:`,
dựng bằng `strip()`.

**Bộ ký hiệu là TÀI SẢN DÙNG LẠI, không phải phụ kiện của lá bài.** Script xuất
từng ký hiệu ra một file riêng trong `marks/` để (a) tra nhanh khi thêm lá mới,
(b) nhúng thẳng vào bảng chú giải trong giao diện mà không phải cắt ảnh. Thêm lá
mới thì **TRA BẢNG NÀY TRƯỚC** — đừng nghĩ ra ký hiệu mới, trùng nghĩa mà khác
hình là hỏng cả bộ.

| File | Ký hiệu | Màu | Nghĩa |
|---|---|---|---|
| `marks/bang.png` | **Bang!** | #b5342b | gây hiệu ứng Bang! (đỡ được bằng Missed!) |
| `marks/missed.png` | **Missed!** | #2d6ea3 | lá này đỡ được đòn, hoặc dùng thay Missed! |
| `marks/heal.png` | **Hồi máu** | #2e7d4f | hồi 1 máu — 2 quả tim là 2 máu |
| `marks/dmg.png` | **Mất máu** | #b5342b | mất máu KHÔNG qua Bang! (tim nứt) — kèm số nếu >2 |
| `marks/deck.png` | **Rút từ bộ bài** | #b0731c | rút bài từ BỘ BÀI — mấy lá là mấy lá |
| `marks/cost.png` | **Chi phí bỏ bài** | #b0731c | phải bỏ thêm lá của MÌNH mới kích hoạt được |
| `marks/steal.png` | **Bốc từ tay người** | #6a4a9e | lấy bài từ TAY/sân người khác về mình |
| `marks/discard.png` | **Bắt người bỏ bài** | #6a4a9e | bắt người khác bỏ 1 lá (không về tay mình) |
| `marks/ban.png` | **Cấm / vô hiệu** | #b5342b | cấm một hành động, hoặc vô hiệu hoá trang bị |
| `marks/one.png` | **Nhắm 1 người** | theo nét lá | chọn đúng 1 mục tiêu |
| `marks/all.png` | **Nhắm nhiều người** | theo nét lá | trúng mọi người (hoặc mọi người khác) |
| `marks/wr.png` | **Theo tầm súng** | theo nét lá | tầm dùng lá tính theo KHẨU SÚNG đang cầm |
| `marks/wr3.png` | **Tầm súng = N** | theo nét lá | riêng lá súng: con số là tầm bắn của khẩu đó |
| `marks/wr1inf.png` | **Tầm 1, vô hạn Bang!** | theo nét lá | Volcanic: tầm 1 nhưng đánh Bang! không giới hạn |
| `marks/d1.png` | **Khoảng cách cố định** | theo nét lá | lá CHỈ dùng được trong khoảng cách ghi trên logo |
| `marks/dp1.png` | **Khoảng cách +1** | theo nét lá | người khác nhìn mình XA thêm 1 |
| `marks/dm1.png` | **Khoảng cách -1** | theo nét lá | mình nhìn người khác GẦN hơn 1 |

**Màu theo NHÓM NGHĨA**, không phải theo lá — nhớ màu là đoán được nửa nghĩa:

| Màu | Nhóm |
|---|---|
| đỏ `#b5342b` | sát thương / Bang! / cấm |
| xanh dương `#2d6ea3` | phòng thủ, đỡ đòn |
| xanh lá `#2e7d4f` | hồi máu |
| tím `#6a4a9e` | động vào bài của NGƯỜI KHÁC |
| cam `#b0731c` | bài của MÌNH / bộ bài rút |
| theo nét lá | thông tin nhắm ai & khoảng cách (không phải hiệu ứng) |

**Trật tự đọc dải:** LÀM GÌ → NHẮM AI → TẦM/KHOẢNG CÁCH.

**Phân biệt 3 kiểu tầm** — chỗ dễ lẫn nhất khi chơi:

- `wr` (súng, không số) = tầm tính theo KHẨU SÚNG đang cầm — vd Bang!, Pepperbox.
- `wr` + số = chính lá súng đó, số là tầm của nó (Volcanic thêm ∞ vì đánh Bang!
  không giới hạn số lần).
- `d1` (↔ kèm số) = lá CHỈ dùng được trong khoảng cách ghi trên logo — vd Panic!
  chỉ tầm 1. **Không có ký hiệu tầm nào = dùng ở khoảng cách bất kỳ** (Cat Balou,
  Springfield, Buffalo Rifle...).

**Khung hiển thị thật** (đo từ `public/style.css`): `.card-box__image-wrap` là
4.5rem × 3.6rem (~72×58 px) + `object-fit: cover`, tức ảnh vuông bị CẮT ~6% trên
và dưới. Vì vậy dải ký hiệu đặt ở 65–88% chiều cao, tối đa 4 ký hiệu 1 hàng, quá
rộng thì `strip()` tự thu nhỏ cả dải. Sửa 2 con số trong CSS thì xem lại chỗ này.

**Bảng chữ cái của icon tự vẽ** — mọi icon tự vẽ đều ghép từ đúng bộ hình này,
nên nhìn quen 1 lá là đọc được cả nhóm:

| Hình | Nghĩa |
|---|---|
| lá bài | bài trên tay / bài rút |
| trái tim đặc | máu |
| trái tim có dấu TRỪ | CHỦ ĐỘNG trả máu |
| trái tim rỉ giọt | BỊ mất máu |
| trái tim rỗng ruột | phần máu đang thiếu |
| bia mộ | có người bị loại khỏi ván |
| chớp lửa | một phát Bang! |
| khiên | một lá đỡ (Missed!) |
| viên đạn | đòn Bang! bay tới |
| vại bia | lá Bia |
| mũi tên | "đổi lấy / dẫn tới" |

Muốn thêm icon tự vẽ nữa thì GHÉP từ các hàm có sẵn (`card()`, `heart()`,
`shield()`, `burst()`, `tombstone()`, `mug()`, `bullet()`, `arrow_right()`,
`arrow_up()`) rồi khai vào `CUSTOM_ICONS` — đừng vẽ path rời, vẽ rời là cả bộ
mất nhất quán.

| File (trong `characters/`) | Icon game-icons.net | Vì sao |
|---|---|---|
| `jourdonnais.png` | `cellar-barrels` | coi như luôn có Thùng rượu |
| `black_jack.png` | **tự vẽ** `custom:black-jack` | 3 lá, lá GIỮA lật ngửa hiện chất Cơ = lá thứ 2 lật ngửa, ra đỏ thì rút thêm lá thứ 3 |
| `bart_cassidy.png` | **tự vẽ** `custom:bart-cassidy` | tim rỉ máu → 1 lá = bị mất máu thì rút bài bù |
| `el_gringo.png` | `robber-hand` | bị người khác làm mất máu thì cướp lá của họ |
| `paul_regret.png` | `cloaked-figure-on-horseback` | coi như luôn có Ngựa Mustang |
| `rose_doolan.png` | `spyglass` | coi như luôn có Ống nhắm — nhìn người khác gần hơn 1 |
| `vulture_sam.png` | `vulture` | ai chết cũng nhặt hết bài của họ |
| `willy_the_kid.png` | **tự vẽ** `custom:willy-the-kid` | 3 chớp lửa liên tiếp = đánh bao nhiêu lá Bang! cũng được |
| `slab_the_killer.png` | **tự vẽ** `custom:slab-the-killer` | viên đạn + 2 khiên = phải đủ 2 lá Missed! mới né được |
| `suzy_lafayette.png` | `open-palm` | tay trống là rút bù ngay |
| `pedro_ramirez.png` | `card-pickup` | nhặt lá đỉnh chồng bài bỏ thay vì rút |
| `lucky_duke.png` | `coinflip` | draw! lật 2 lá, chọn lá lợi hơn |
| `jesse_jones.png` | `robber` | rút lá đầu lượt từ TAY người khác |
| `kit_carlson.png` | `poker-hand` | xem 3 lá trên cùng, giữ 2 bỏ 1 |
| `calamity_janet.png` | `card-exchange` | Bang! và Missed! đổi vai cho nhau |
| `sid_ketchum.png` | **tự vẽ** `custom:sid-ketchum` | 2 lá → 1 trái tim = bỏ 2 lá hồi 1 máu |
| `pixie_pete.png` | **tự vẽ** `custom:pixie-pete` | 3 lá + mũi tên lên = đầu lượt rút 3 lá thay vì 2 |
| `bill_noface.png` | **tự vẽ** `custom:bill-noface` | tim RỖNG RUỘT → mấy lá = rút theo đúng số máu đang thiếu |
| `greg_digger.png` | **tự vẽ** `custom:greg-digger` | bia mộ + 2 trái tim = ai bị loại thì hồi tối đa 2 máu (cặp với herb_hunter) |
| `herb_hunter.png` | **tự vẽ** `custom:herb-hunter` | bia mộ + 2 lá bài bật lên = ai bị loại thì anh ta rút 2 lá |
| `pat_brennan.png` | `card-pick` | đầu lượt nhặt 1 lá TRANG BỊ của người khác |
| `chuck_wengam.png` | **tự vẽ** `custom:chuck-wengam` | tim dấu TRỪ → 2 lá = chủ động mất 1 máu để rút 2 lá |
| `jose_delgado.png` | **tự vẽ** `custom:jose-delgado` | 1 lá → 2 lá = bỏ 1 lá trang bị xanh dương để rút 2 lá |
| `sean_mallory.png` | `hand-bag` | giữ tới 10 lá cuối lượt — cái túi to |
| `tequila_joe.png` | **tự vẽ** `custom:tequila-joe` | vại bia + 2 trái tim = uống Bia hồi 2 máu thay vì 1 |
| `elena_fuente.png` | `arrows-shield` | lá NÀO trên tay cũng đỡ được như Missed! |
| `apache_kid.png` | `card-ace-diamonds` | miễn nhiễm lá chất RÔ nhắm thẳng vào mình |
| `doc_holyday.png` | **tự vẽ** `custom:doc-holyday` | 2 lá → chớp lửa đầu nòng = bỏ 2 lá bất kỳ lấy hiệu ứng Bang! |
| `molly_stark.png` | `card-play` | đánh lá NGOÀI lượt thì rút bù 1 lá |
| `belle_star.png` | `shield-disabled` | trong lượt cô ta, trang bị người khác tắt hết |
| `vera_custer.png` | `carnival-mask` | mượn khả năng nhân vật khác — đeo mặt nạ người ta |
| `elena_noir.png` | `heart-shield` | Miễn Tử — không thể chết trong 2 lượt |
| `marcel_marcelo.png` | `manacles` | dính tù thì kéo theo 1 người cùng vào |
| `mary_rose.png` | `gun-rose` | đúng tên + bắn trả khi trúng Bang! |
| `the_thief.png` | `bandana` | draw! ra đỏ thì cướp 1 lá của người khác |
| `the_gambler.png` | `rolling-dices` | bỏ 2 lá đánh cược: đỏ rút 3, đen rút 1 |
| `the_fair_killer.png` | **tự vẽ** `custom:the-fair-killer` | tim dấu TRỪ → chớp lửa = trả 1 máu để bắn bất kỳ ai, bỏ qua khoảng cách |
| `the_drunker.png` | `glass-celebration` | NGƯỜI KHÁC uống Bia thì mình cũng hồi 1 máu — nâng ly ăn theo |
| `the_drifter.png` | `temporary-shield` | draw! ngầm đầu lượt: được 1 lá chắn tạm thời |
| `the_dealer.png` | `trade` | đưa 2 lá cho người vừa bắn mình để huỷ đòn |
| `the_sentinel.png` | `hand-of-god` | trả 2 máu tối đa để hồi sinh người khác — 1 lần/ván |
| `the_nobody.png` | `invisible-face` | bị nhắm thì draw!, ra Bích là VÔ HÌNH với lá đó |

## Bảng tra: lá sự kiện → hình nền + dải ký hiệu

Cùng cơ chế với lá bài. 9 lá để trống dải vì hình gốc đã nói đủ
(`blessing`/`curse` là át Cơ/át Bích, `gold_rush` là mũi tên xoay ngược...) hoặc
vì logic chưa cài (`abandoned_mine`, `law_of_the_west`, `peyote`, `dead_man`).

| File | Hình nền | Dải ký hiệu | Chức năng |
|---|---|---|---|
| `events/blessing.png` | `card-ace-hearts` | — | mọi lá tính là chất Cơ |
| `events/curse.png` | `card-ace-spades` | — | mọi lá tính là chất Bích |
| `events/hangover.png` | `knocked-out-stars` | cấm | mất khả năng nhân vật |
| `events/shootout.png` | `bullet-impacts` | Bang! · Bang! | mỗi lượt đánh được 2 lá Bang! |
| `events/the_reverend.png` | `beer-stein` | cấm | CẤM dùng Bia |
| `events/the_sermon.png` | `gunshot` | cấm | CẤM đánh Bang! |
| `events/thirst.png` | `desert` | rút 1 | rút 1 lá thay vì 2 |
| `events/train_arrival.png` | `steam-locomotive` | rút 3 | rút 3 lá thay vì 2 |
| `events/gold_rush.png` | `anticlockwise-rotation` | — | đảo chiều lượt chơi |
| `events/the_daltons.png` | `bandit` | bắt bỏ bài · nhiều người | ai có trang bị phải bỏ 1 lá |
| `events/the_doctor.png` | `stethoscope` | ♥1 | người ít máu nhất hồi 1 máu |
| `events/ghost_town.png` | `ghost` | — | người đã chết sống lại 1 lượt |
| `events/high_noon.png` | `sunbeams` | ♥−1 · nhiều người | đầu lượt mất 1 máu |
| `events/ambush.png` | `wolf-trap` | kc 1 · nhiều người | khoảng cách giữa mọi người tính là 1 |
| `events/lasso.png` | `lasso` | cấm | vô hiệu MỌI trang bị |
| `events/the_judge.png` | `gavel` | cấm | CẤM đặt trang bị mới |
| `events/abandoned_mine.png` | `gold-mine` | — | (chưa cài logic) |
| `events/hard_liquor.png` | `glass-shot` | ♥1 | bỏ pha rút bài để hồi 1 máu |
| `events/law_of_the_west.png` | `law-star` | — | (chưa cài logic) |
| `events/peyote.png` | `magic-swirl` | — | (chưa cài logic) |
| `events/ranch.png` | `ranch-gate` | bỏ kèm 1 · rút 1 | đổi lá trên tay |
| `events/russian_roulette.png` | `reload-gun-barrel` | ♥−1 · nhiều người | lần lượt bỏ Missed! hoặc mất 1 máu |
| `events/dead_man.png` | `tombstone` | — | (chưa cài logic) |
| `events/blood_brothers.png` | `shaking-hands` | ♥1 · 1 người | tặng 1 máu cho người khác |
| `events/vendetta.png` | `extra-time` | — | ra Cơ thì được chơi thêm 1 lượt |
| `events/sniper.png` | `dead-eye` | Bang! · Missed! · Missed! | 2 lá Bang! → cần 2 Missed! mới đỡ |
| `events/ricochet.png` | `ricochet` | Bang! · bắt bỏ bài | bắn rụng trang bị |
| `events/a_fistful_of_cards.png` | `card-random` | Bang! | ăn Bang! bằng số lá trên tay |

## Nhật ký đổi icon

### 2026-08-22 — rà soát 100% (44 lá bài + 42 nhân vật + 28 lá sự kiện)

**Thêm 8 nhân vật *ex trước giờ chưa có ảnh** (có trong `CHARACTERS` của
`src/games/bang/core/characters.ts` nhưng thiếu trong `CHARS` của script, nên đang hiển
thị bằng chữ): `the_thief`, `the_gambler`, `the_fair_killer`, `the_drunker`,
`the_drifter`, `the_dealer`, `the_sentinel`, `the_nobody`.

**Đổi 5 icon lá bài:**

| Lá | Cũ | Mới | Lý do |
|---|---|---|---|
| `missed` | `avoidance` | `dodging` | icon cũ chỉ là 2 mũi tên cong, không đọc ra nghĩa. `dodging` vẽ người né loạt đạn — đúng tinh thần lá Missed! và là lá dùng nhiều nhất ván |
| `dodge` | `dodge` | `avoidance` | icon `dodge` là 1 vệt cong trừu tượng, nhìn không ra gì. Nhận `avoidance` vừa nhả ra ở trên, vẫn khác hẳn `missed` |
| `remington` | `desert-eagle` | `blunderbuss` | súng lục bán tự động hiện đại, lạc thời Viễn Tây |
| `rev_carabine` | `shotgun` | `sawed-off-shotgun` | **BẪY**: `shotgun` của game-icons vẽ VỎ ĐẠN chứ không phải khẩu súng |
| `buffalo_rifle` | `rifle` | `lee-enfield` | **BẪY**: `rifle` của game-icons vẽ VIÊN ĐẠN chứ không phải khẩu súng |

Sau khi đổi, 5 khẩu súng xanh dương nhìn ra thứ tự tầm bắn luôn: `luger` (1)
→ `revolver` (2) → `blunderbuss` (3) → `sawed-off-shotgun` (4) →
`winchester-rifle` (5).

**Đổi 10 icon nhân vật** (đều theo hướng: icon phải nói lên KHẢ NĂNG, và
không được trùng icon lá bài):

| Nhân vật | Cũ | Mới | Lý do |
|---|---|---|---|
| `rose_doolan` | `hunter-eyes` | `spyglass` | icon cũ là mấy hình cánh hoa, không ai đoán ra là "mắt". Ống nhòm dài = nhìn xa |
| `willy_the_kid` | `crossed-pistols` | `cowboy-holster` | TRÙNG icon lá `pepperbox`. Bao súng đầy đạn = bắn bao nhiêu cũng được |
| `calamity_janet` | `body-swapping` | `card-exchange` | 2 người đổi chỗ ≠ 2 LÁ đổi vai. `card-exchange` đúng ý Bang!↔Missed! |
| `pixie_pete` | `card-pick` | `card-draw` | khả năng là RÚT 3 lá, không phải "chọn lá" |
| `pat_brennan` | `grasping-claws` | `card-pick` | vết vuốt thú không liên quan gì; anh ta CHỌN 1 lá trang bị của người khác |
| `molly_stark` | `flower-hat` | `card-play` | mũ hoa không nói gì. Bàn tay đánh lá = đánh bài ngoài lượt |
| `belle_star` | `jester-hat` | `shield-disabled` | mũ hề không nói gì; khiên gạch chéo = tắt trang bị người khác |
| `apache_kid` | `feather-necklace` | `card-ace-diamonds` | vòng cổ chỉ là trang phục; át RÔ nói thẳng "miễn nhiễm chất Rô" |
| `elena_fuente` | `ample-dress` | `arrows-shield` | váy TRÙNG ý với lá `can_can` (`large-dress`); khiên đỡ tên = lá nào cũng đỡ được |
| `elena_noir` | `hooded-figure` | `heart-shield` | người trùm áo choàng quá chung chung; tim trong khiên = Miễn Tử |

**Tự vẽ 14 icon nhân vật.** Đợt đầu định giữ nguyên icon "hao hao" cho những
nhân vật không tìm được icon khớp, nhưng hao hao thì lá nào cũng na ná mà
không lá nào đúng — nên vẽ hẳn. Nguyên tắc: icon phải ĐỌC RA khả năng, không
chỉ gợi tên.

| Nhân vật | Cũ | Hình tự vẽ |
|---|---|---|
| `bart_cassidy` | `bleeding-heart` | tim rỉ máu → 1 lá |
| `black_jack` | `card-jack-spades` | 3 lá, lá giữa lật ngửa hiện chất Cơ |
| `willy_the_kid` | `cowboy-holster` | 3 chớp lửa liên tiếp |
| `slab_the_killer` | `heavy-bullets` | viên đạn + 2 khiên |
| `sid_ketchum` | `healing` | 2 lá → trái tim |
| `pixie_pete` | `card-draw` | 3 lá + mũi tên lên |
| `bill_noface` | `domino-mask` | tim rỗng ruột → mấy lá |
| `greg_digger` | `hasty-grave` | bia mộ + 2 trái tim |
| `herb_hunter` | `target-arrows` | bia mộ + 2 lá bài |
| `chuck_wengam` | `heart-bottle` | tim dấu trừ → 2 lá |
| `jose_delgado` | `leather-vest` | 1 lá → 2 lá |
| `tequila_joe` | `beer-bottle` | vại bia + 2 trái tim |
| `doc_holyday` | `top-hat` | 2 lá → chớp lửa |
| `the_fair_killer` | `human-target` | tim dấu trừ → chớp lửa |

Cặp `greg_digger` / `herb_hunter` cố tình dùng CHUNG hình bia mộ, chỉ khác vế
sau (2 trái tim so với 2 lá bài) — 2 người này kích hoạt cùng điều kiện "có
người bị loại", để giống nhau ở vế đầu là đúng chứ không phải trùng lặp.

Cách hoạt động: hàm `icon_svg()` thấy tên có tiền tố `custom:` thì tra bảng
`CUSTOM_ICONS` trong chính script thay vì `icons.json`, phần còn lại của dây
chuyền (khung, màu, xuất PNG) dùng chung y hệt icon tải về.

**Còn giữ icon game-icons** vì bản thân nó đã nói đúng khả năng rồi:
`jourdonnais`, `paul_regret`, `rose_doolan` (3 lá "coi như luôn có trang bị"),
`vulture_sam`, `suzy_lafayette`, `pedro_ramirez`, `lucky_duke`, `jesse_jones`,
`kit_carlson`, `calamity_janet`, `el_gringo`, `pat_brennan`, `sean_mallory`,
`elena_fuente`, `apache_kid`, `molly_stark`, `belle_star`, `vera_custer`,
`elena_noir`, `marcel_marcelo`, `mary_rose`, và 7/8 nhân vật *ex mới.

**Giữ nguyên có cân nhắc** (đã soi lại, chưa tìm ra phương án tốt hơn):
`conestoga` (`saddle` — `old-wagon` đã thuộc về `stagecoach`),
`rag_time` (`banjo`), `wells_fargo` (`chest`), `ten_gallon_hat`
(`western-hat`, trùng hoạ tiết mặt lưng nhưng 2 thứ không bao giờ đứng cạnh
nhau).

**28 lá sự kiện: giữ nguyên 100%** — soi lại từng lá, bảng icon cũ chọn tốt.

**Sinh lại toàn bộ** để 78 ảnh lá bài/nhân vật hết nét đen (xem mục lỗi màu
nét ở trên).

### 2026-08-22 (đợt 2) — chức năng lên trước hình

Chủ dự án chốt: **thể hiện chức năng của lá là quan trọng nhất**. Nhân vật thì
vẽ hẳn (14 lá, mục trên). Lá bài và lá sự kiện đi hướng khác — tên lá đã nói
vật thể rồi, thứ thiếu là "lá này LÀM GÌ" — nên giữ hình gốc và gắn **dải ký
hiệu chức năng** ở đáy: 43/44 lá bài và 19/28 lá sự kiện.

Được gì:

- **5 khẩu súng đọc ra tầm bắn ngay trên ảnh** (1→5 chấm). Đây là thứ người
  chơi hay quên nhất giữa ván.
- Nhóm lá hồi máu tách bạch theo số trái tim: Bia/Bi đông 1 ♥, Whisky 2 ♥,
  Quán rượu 3 ♥ (mọi người).
- Nhóm rút bài đọc được số lá: Xe ngựa 2 lá, Wells Fargo / Pony Express 3 lá.
- Mọi lá gây hiệu ứng Bang! đều có chớp lửa (Punch, Knife, Pepperbox,
  Derringer, Buffalo Rifle, Springfield); mọi lá đỡ được đều có khiên
  (Missed!, Dodge, Barrel, Bible, Sombrero, Ten Gallon Hat, Iron Plate).
- `the_reverend`/`the_sermon` đổi hẳn hình nền: vẽ ĐÚNG thứ bị cấm (vại bia /
  phát súng) rồi gắn ký hiệu cấm, thay cho nhà thờ / người cầu nguyện.
- `scope`/`binocular` và `mustang`/`hideout` phân biệt được chiều khoảng cách
  bằng 2 mũi tên chụm vào hay tách khỏi vạch giữa.

Chỗ CỐ Ý để trống dải: `cat_balou` (hình lá bị đốt đã đủ rõ), và 9 lá sự kiện
mà hình gốc tự nói hết hoặc logic chưa cài.

**Bẫy đã dính khi làm:** vòng lặp cuối script viết `for card, icon in
CARDS.items()` — trùng tên hàm vẽ `card()` của bộ icon tự vẽ, chạy là hỏng
ngay. Đã đổi thành `card_name`; đặt tên biến lặp trong file này nhớ tránh
trùng bảng chữ cái hình.

### 2026-08-22 (đợt 3) — chuẩn hoá BỘ KÝ HIỆU

Đợt 2 gắn ký hiệu theo cảm tính từng lá nên vẫn còn lẫn: cùng một ý mà mỗi lá
một kiểu. Đợt này rút thành **17 ký hiệu chuẩn**, mỗi ký hiệu 1 hàm vẽ riêng +
1 file rời trong `marks/` (xem mục "Bộ ký hiệu chức năng"). Nguyên tắc: **cùng
chức năng thì phải cùng ký hiệu**, và ký hiệu có MÀU theo nhóm nghĩa.

Cụ thể được gì:

- **Tầm bắn của súng ghi thẳng bằng số** (1→5) thay cho đếm chấm; Volcanic có
  thêm ∞ vì đánh Bang! không giới hạn số lần.
- **Tách bạch 3 kiểu tầm**: theo tầm súng (`wr`) / tầm riêng của khẩu súng
  (`wr`+số) / khoảng cách cố định của lá (`d1` — vd Panic! chỉ tầm 1). Không có
  ký hiệu nào = dùng ở khoảng cách bất kỳ.
- **±1 khoảng cách có logo riêng** (↔ kèm `+1` / `-1`) thay cho 2 mũi tên chụm
  hay tách — trước nhìn dễ lẫn chiều.
- **Lá cần bỏ kèm 1 lá phụ mới kích hoạt được** (Tequila, Whisky, Rag Time,
  Springfield, Brawl) có ký hiệu `cost` riêng, màu cam.
- **Thống nhất**: Bang! (chớp đỏ), Missed! (khiên xanh), Hồi máu (tim xanh lá),
  Bốc bài từ TAY người khác (tím) tách hẳn khỏi Rút bài từ BỘ BÀI (cam), Bắt
  người khác bỏ bài (tím).
- **Nhắm 1 người / nhiều người** có 2 ký hiệu riêng (1 bóng người / 3 bóng
  người).

**Hai lỗi dữ liệu phát hiện khi soi lại `CARD_DESCRIPTIONS` trong `ui.ts`** —
đây là lý do phải đối chiếu MÔ TẢ THẬT chứ không dựa vào trí nhớ luật Bang! gốc:

- `bible` thiếu ký hiệu rút bài — Kinh Thánh đỡ thành công thì RÚT THÊM 1 LÁ
  (chủ dự án bắt được).
- `pepperbox` bị gán nhầm "khoảng cách 1" — thực tế bắn **đúng tầm súng đang
  cầm**.

**Chưa làm, cân nhắc sau:** 13 lá vàng đều có tính chất "trì hoãn — chờ 1 lượt"
nhưng CHƯA có ký hiệu đồng hồ, vì thêm nữa thì Derringer đã 4 ký hiệu sẽ quá
chật. Hiện dựa vào màu viền vàng của `.card-box--yellow` để phân biệt.
