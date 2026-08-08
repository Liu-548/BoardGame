# Ảnh lá bài & nhân vật & lá sự kiện

## Trạng thái: ĐÃ CÓ ẢNH TẠM cho toàn bộ 44 lá bài + 34 nhân vật + 28 lá sự kiện

Client tự ghép đường dẫn, không cần khai báo gì thêm:

- Lá bài  → `/sprites/<tên lá>.png`            (xem `cardImageUrl()` trong `src/client/ui.ts`)
- Nhân vật → `/sprites/characters/<characterId>.png`  (xem `characterImageUrl()`)
- Lá sự kiện → `/sprites/events/<EventId>.png`       (xem `eventImageUrl()`)
- Mặt lưng → `/sprites/card-back.png`
- Viên đạn → `/sprites/bullet-full.png`, `/sprites/bullet-empty.png`

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

**Lưu ý khi chạy lại toàn bộ:** tới 2026-08-08 mới phát hiện lỗi trong script —
body icon của iconify dùng `fill="currentColor"`, thuộc tính `fill` đặt trên thẻ
`<g>` cha KHÔNG đè được lên nó, nên 78 ảnh lá bài/nhân vật sinh ra trước đó đều
là **nét ĐEN**, 2 hằng `INK`/`INK_CH` coi như vô tác dụng. Script đã sửa (đặt
thêm `color="..."`), nhưng ảnh cũ CHƯA sinh lại — chạy `python
_generate-sprites.py` không tham số sẽ đổi màu nét 78 file đó sang đúng tông
nâu/tím than như bảng trên. Không chạy cũng không sao, đen vẫn đọc tốt.

## Bảng tra: lá bài → tên icon gốc trên game-icons.net

| File | Icon game-icons.net |
|---|---|
| `bang.png` | `gunshot` |
| `missed.png` | `avoidance` |
| `beer.png` | `beer-stein` |
| `saloon.png` | `saloon-doors` |
| `stagecoach.png` | `old-wagon` |
| `wells_fargo.png` | `chest` |
| `panic.png` | `grab` |
| `cat_balou.png` | `card-burn` |
| `general_store.png` | `shop` |
| `indians.png` | `tomahawk` |
| `duel.png` | `duel` |
| `gatling.png` | `machine-gun` |
| `brawl.png` | `brass-knuckles` |
| `dodge.png` | `dodge` |
| `punch.png` | `punch` |
| `rag_time.png` | `banjo` |
| `springfield.png` | `musket` |
| `tequila.png` | `agave` |
| `whisky.png` | `brandy-bottle` |
| `volcanic.png` | `luger` |
| `schofield.png` | `revolver` |
| `remington.png` | `desert-eagle` |
| `rev_carabine.png` | `shotgun` |
| `winchester.png` | `winchester-rifle` |
| `barrel.png` | `barrel` |
| `scope.png` | `crosshair` |
| `mustang.png` | `horse-head` |
| `jail.png` | `imprisoned` |
| `dynamite.png` | `dynamite` |
| `binocular.png` | `binoculars` |
| `hideout.png` | `cave-entrance` |
| `bible.png` | `open-book` |
| `sombrero.png` | `sombrero` |
| `ten_gallon_hat.png` | `western-hat` |
| `iron_plate.png` | `metal-plate` |
| `canteen.png` | `water-flask` |
| `pony_express.png` | `envelope` |
| `derringer.png` | `pistol-gun` |
| `conestoga.png` | `saddle` |
| `can_can.png` | `large-dress` |
| `buffalo_rifle.png` | `rifle` |
| `knife.png` | `bowie-knife` |
| `pepperbox.png` | `crossed-pistols` |
| `howitzer.png` | `field-gun` |

## Bảng tra: nhân vật → tên icon gốc

Icon nhân vật chọn theo **gợi ý khả năng** (dễ nhớ khi chơi) chứ không phải chân
dung — vd Vulture Sam là con kền kền, Lucky Duke là đồng xu đang tung, Jourdonnais
là dãy thùng gỗ. Khung nhân vật dùng tông xanh xám để phân biệt với lá bài (tông
giấy da).

| File (trong `characters/`) | Icon game-icons.net |
|---|---|
| `jourdonnais.png` | `cellar-barrels` |
| `black_jack.png` | `card-jack-spades` |
| `bart_cassidy.png` | `bleeding-heart` |
| `el_gringo.png` | `robber-hand` |
| `paul_regret.png` | `cloaked-figure-on-horseback` |
| `rose_doolan.png` | `hunter-eyes` |
| `vulture_sam.png` | `vulture` |
| `willy_the_kid.png` | `crossed-pistols` |
| `slab_the_killer.png` | `heavy-bullets` |
| `suzy_lafayette.png` | `open-palm` |
| `pedro_ramirez.png` | `card-pickup` |
| `lucky_duke.png` | `coinflip` |
| `jesse_jones.png` | `robber` |
| `kit_carlson.png` | `poker-hand` |
| `calamity_janet.png` | `body-swapping` |
| `sid_ketchum.png` | `healing` |
| `pixie_pete.png` | `card-pick` |
| `bill_noface.png` | `domino-mask` |
| `greg_digger.png` | `hasty-grave` |
| `herb_hunter.png` | `target-arrows` |
| `pat_brennan.png` | `grasping-claws` |
| `chuck_wengam.png` | `heart-bottle` |
| `jose_delgado.png` | `leather-vest` |
| `sean_mallory.png` | `hand-bag` |
| `tequila_joe.png` | `beer-bottle` |
| `elena_fuente.png` | `ample-dress` |
| `apache_kid.png` | `feather-necklace` |
| `doc_holyday.png` | `top-hat` |
| `molly_stark.png` | `flower-hat` |
| `belle_star.png` | `jester-hat` |
| `vera_custer.png` | `carnival-mask` |
| `elena_noir.png` | `hooded-figure` |
| `marcel_marcelo.png` | `manacles` |
| `mary_rose.png` | `gun-rose` |

## Bảng tra: lá sự kiện → tên icon gốc

Giống icon nhân vật, chọn theo **HIỆU ỨNG lúc chơi** chứ không phải nghĩa đen
của cái tên — vd Gold Rush là mũi tên xoay ngược (đảo chiều lượt) chứ không
phải cục vàng, vì giữa ván cái người ta cần nhớ là "đang đi ngược chiều".
Cột cuối ghi lý do những lá chọn không hiển nhiên.

| File (trong `events/`) | Icon game-icons.net | Vì sao |
|---|---|---|
| `blessing.png` | `card-ace-hearts` | mọi lá thành chất Cơ — vẽ nét ĐỎ (ngoại lệ, xem `EVENT_INK`) |
| `curse.png` | `card-ace-spades` | mọi lá thành chất Bích — vẽ nét ĐEN |
| `hangover.png` | `knocked-out-stars` | choáng váng = mất khả năng nhân vật |
| `shootout.png` | `bullet-impacts` | 2 lá Bang!/lượt — nhiều vết đạn hơn |
| `the_reverend.png` | `church` | cấm Bia |
| `the_sermon.png` | `prayer` | cấm chơi Bang! |
| `thirst.png` | `desert` | rút ít hơn 1 lá |
| `train_arrival.png` | `steam-locomotive` | rút nhiều hơn 1 lá |
| `gold_rush.png` | `anticlockwise-rotation` | đảo chiều lượt chơi |
| `the_daltons.png` | `bandit` | ai có trang bị phải bỏ 1 lá |
| `the_doctor.png` | `stethoscope` | người ít máu nhất +1 máu |
| `ghost_town.png` | `ghost` | |
| `high_noon.png` | `sunbeams` | lá cuối: đầu lượt mất 1 máu |
| `ambush.png` | `wolf-trap` | khoảng cách mọi người tạm tính là 1 |
| `lasso.png` | `lasso` | vô hiệu mọi trang bị |
| `the_judge.png` | `gavel` | cấm đặt trang bị mới |
| `abandoned_mine.png` | `gold-mine` | |
| `hard_liquor.png` | `glass-shot` | bỏ pha rút bài để hồi 1 máu |
| `law_of_the_west.png` | `law-star` | |
| `peyote.png` | `magic-swirl` | ảo giác — KHÔNG dùng `cactus` vì `desert` (Thirst) cũng vẽ xương rồng, 2 lá nhìn na ná nhau |
| `ranch.png` | `ranch-gate` | đổi lá trên tay |
| `russian_roulette.png` | `reload-gun-barrel` | ổ quay súng lục |
| `dead_man.png` | `tombstone` | |
| `blood_brothers.png` | `shaking-hands` | tặng 1 máu cho người khác |
| `vendetta.png` | `extra-time` | ra Cơ thì được chơi thêm 1 lượt |
| `sniper.png` | `dead-eye` | 2 Bang! → phải đỡ 2 Missed! |
| `ricochet.png` | `ricochet` | bắn rụng trang bị |
| `a_fistful_of_cards.png` | `card-random` | lá cuối: ăn Bang! bằng số lá trên tay |

Có ảnh cho ĐỦ 28 lá, kể cả 5 lá đang tạm loại khỏi bộ bốc (`ghost_town`,
`law_of_the_west`, `peyote`, `dead_man`, `abandoned_mine` — xem
`EXPANSION_EVENT_IDS` trong `src/core/events.ts`): cài xong logic là hiện được
ngay, khỏi phải quay lại chạy script.

