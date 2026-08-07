# Ảnh lá bài & nhân vật

## Trạng thái: ĐÃ CÓ ẢNH TẠM cho toàn bộ 44 lá bài + 34 nhân vật

Client tự ghép đường dẫn, không cần khai báo gì thêm:

- Lá bài  → `/sprites/<tên lá>.png`            (xem `cardImageUrl()` trong `src/client/ui.ts`)
- Nhân vật → `/sprites/characters/<characterId>.png`  (xem `characterImageUrl()`)
- Mặt lưng → `/sprites/card-back.png`
- Viên đạn → `/sprites/bullet-full.png`, `/sprites/bullet-empty.png`

Ảnh 256×256 PNG nền trong suốt, phần minh hoạ nằm trong một ô "giấy da" bo góc.
KHÔNG vẽ tên lá/số/chất trong ảnh — client đã đè chữ lên sẵn.

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
gói npm `@iconify-json/game-icons`). Sửa bảng `CARDS`/`CHARS` trong đó rồi chạy
lại nếu muốn đổi icon cho một lá cụ thể.

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

