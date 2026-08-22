import json, os, sys
import cairosvg

# Chạy KHÔNG tham số  -> sinh lại TẤT CẢ (lá bài + nhân vật + sự kiện + mặt lưng + viên đạn).
# Chạy `python _generate-sprites.py events` -> CHỈ sinh lại thư mục events/.
# (Dùng lúc chỉ đổi icon 1 nhóm, khỏi ghi đè hàng trăm file không đổi nội dung
#  — bản cairosvg khác nhau có thể cho ra byte khác nhau, làm git diff bẩn.)
ONLY = sys.argv[1] if len(sys.argv) > 1 else None

# Thư mục chứa chính script này (public/sprites) — ảnh sinh ra ghi thẳng vào đây.
OUT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(OUT))  # public/sprites -> public -> gốc dự án

# Cần cài gói npm @iconify-json/game-icons trước (KHÔNG phải dependency của dự
# án — chỉ dùng lúc chạy script này, xem README.md). Ví dụ:
#   npm install --no-save @iconify-json/game-icons
# chạy ở gốc dự án sẽ đặt icons.json vào node_modules như mặc định bên dưới.
# Nếu cài ở chỗ khác thì trỏ qua biến môi trường ICONIFY_GAME_ICONS_JSON.
ICONS_JSON_PATH = os.environ.get(
    'ICONIFY_GAME_ICONS_JSON',
    os.path.join(PROJECT_ROOT, 'node_modules', '@iconify-json', 'game-icons', 'icons.json'),
)
ICONS = json.load(open(ICONS_JSON_PATH, encoding='utf-8'))
SET_W = ICONS.get('width', 512); SET_H = ICONS.get('height', 512)

os.makedirs(OUT, exist_ok=True)
os.makedirs(OUT + '/characters', exist_ok=True)
os.makedirs(OUT + '/events', exist_ok=True)
os.makedirs(OUT + '/marks', exist_ok=True)

PARCH   = '#f0e3c8'   # nền giấy da
PARCH2  = '#e2d0ac'
BORDER  = '#b99b6b'
INK     = '#4a3728'   # màu nét chính
INK_CH  = '#3d3a52'   # màu nét cho lá nhân vật (tím than, phân biệt với lá bài)
PARCH_CH  = '#dfe3ee'
PARCH_CH2 = '#c8cfe2'
BORDER_CH = '#8d94ad'
# Lá sự kiện — tông TÍM, cố tình khớp `.card-box--event` trong public/style.css
# (border-color: #7d4fb3). Nhìn 1 phát biết ngay "không phải lá cầm trên tay".
INK_EV    = '#4a2a6b'
PARCH_EV  = '#ece2f6'
PARCH_EV2 = '#d6c4ea'
BORDER_EV = '#7d4fb3'

# ================= ICON TỰ VẼ (không có trên game-icons.net) =================
# Hai kiểu, dùng chung một bộ hình cơ bản bên dưới:
#
#   1. CUSTOM_ICONS ("custom:...") — VẼ HẲN từ đầu. Dành cho NHÂN VẬT: khả năng
#      của họ không có icon nào tả gọn, mà cái tên cũng chẳng gợi ra hình gì.
#   2. CUSTOM_MIX  ("mix:...")     — GIỮ hình gốc của game-icons làm chủ ngữ rồi
#      gắn thêm DẢI KÝ HIỆU chức năng ở đáy. Dành cho LÁ BÀI / LÁ SỰ KIỆN.
#
# Vẽ theo đúng ngôn ngữ hình của game-icons: khối đặc, không nét mảnh, chi tiết
# tạo ra bằng cách KHOÉT LỖ (fill-rule evenodd). Riêng DẢI KÝ HIỆU thì CÓ MÀU —
# xem ghi chú màu ở phần "DẢI KÝ HIỆU CHỨC NĂNG" bên dưới.
#
# Tiền tố `custom:` / `mix:` để không bao giờ đụng tên thật của game-icons —
# icon_svg() nhìn tiền tố này mà tra bảng tương ứng thay vì icons.json.

import math

# ------------------------------------------------------------------ hình cơ bản

def rr(x, y, w, h, r):
    """Path chữ nhật bo góc."""
    return (f"M{x + r},{y} h{w - 2 * r} a{r},{r} 0 0 1 {r},{r} v{h - 2 * r} "
            f"a{r},{r} 0 0 1 {-r},{r} h{-(w - 2 * r)} a{r},{r} 0 0 1 {-r},{-r} "
            f"v{-(h - 2 * r)} a{r},{r} 0 0 1 {r},{-r} Z")


def heart_d(cx, cy, s):
    """Path trái tim, `s` = nửa chiều rộng."""
    return (f"M{cx},{cy + s * 0.92} "
            f"C{cx - s * 1.32},{cy + s * 0.02} {cx - s * 0.98},{cy - s * 0.98} {cx},{cy - s * 0.34} "
            f"C{cx + s * 0.98},{cy - s * 0.98} {cx + s * 1.32},{cy + s * 0.02} {cx},{cy + s * 0.92} Z")


def heart(cx, cy, s, sign=None):
    """Trái tim đặc; `sign` = 'minus' / 'plus' thì khoét dấu vào giữa."""
    d = heart_d(cx, cy, s)
    if sign:
        aw, al = s * 0.27, s * 0.88
        y = cy - s * 0.05
        d += f" M{cx - al / 2},{y - aw / 2} h{al} v{aw} h{-al} Z"
        if sign == "plus":
            d += f" M{cx - aw / 2},{y - al / 2} h{aw} v{al} h{-aw} Z"
    return f'<path fill-rule="evenodd" d="{d}"/>'


def heart_ring(cx, cy, s, t=0.30):
    """Trái tim rỗng ruột — dùng cho ý 'máu đang thiếu'."""
    d = heart_d(cx, cy, s) + " " + heart_d(cx, cy + s * 0.06, s * (1 - t))
    return f'<path fill-rule="evenodd" d="{d}"/>'


def drop(cx, cy, s):
    """Giọt máu."""
    return (f'<path d="M{cx},{cy - s} C{cx + s * 0.95},{cy + s * 0.05} {cx + s * 0.75},{cy + s} '
            f'{cx},{cy + s} C{cx - s * 0.75},{cy + s} {cx - s * 0.95},{cy + s * 0.05} {cx},{cy - s} Z"/>')


def card(cx, cy, w=150, h=210, r=22, t=31, angle=0, pip="dot"):
    """Lá bài nhìn nghiêng: viền dày (khoét ruột) + ký hiệu ở giữa."""
    x, y = cx - w / 2, cy - h / 2
    d = rr(x, y, w, h, r) + rr(x + t, y + t, w - 2 * t, h - 2 * t, max(r - t / 2, 4))
    body = f'<path fill-rule="evenodd" d="{d}"/>'
    if pip == "dot":
        body += f'<circle cx="{cx}" cy="{cy}" r="{max(w * 0.17, 16)}"/>'
    elif pip == "heart":
        body += heart(cx, cy, w * 0.25)
    if angle:
        body = f'<g transform="rotate({angle} {cx} {cy})">{body}</g>'
    return body


def shield(cx, cy, w, h, angle=0):
    """Khiên kiểu heater: vai vuông bo nhẹ, hai sườn thẳng rồi thu về mũi dưới."""
    x0, y0 = cx - w / 2, cy - h / 2
    r = w * 0.10
    d = (f"M{x0},{y0 + r} a{r},{r} 0 0 1 {r},{-r} h{w - 2 * r} a{r},{r} 0 0 1 {r},{r} "
         f"v{h * 0.44} "
         f"Q{x0 + w},{y0 + h * 0.62} {cx + w * 0.30},{y0 + h * 0.84} "
         f"L{cx},{y0 + h} "
         f"L{cx - w * 0.30},{y0 + h * 0.84} "
         f"Q{x0},{y0 + h * 0.62} {x0},{y0 + h * 0.44 + r} Z")
    body = f'<path d="{d}"/>'
    if angle:
        body = f'<g transform="rotate({angle} {cx} {cy})">{body}</g>'
    return body


def bullet(cx, cy, w, h, angle=0):
    """Viên đạn nằm ngang, mũi hướng sang phải."""
    x0 = cx - w / 2
    nose = w * 0.42
    d = (f"M{x0},{cy - h / 2} h{w - nose} "
         f"C{x0 + w - nose * 0.15},{cy - h / 2} {x0 + w},{cy - h * 0.22} {x0 + w},{cy} "
         f"C{x0 + w},{cy + h * 0.22} {x0 + w - nose * 0.15},{cy + h / 2} {x0 + w - nose},{cy + h / 2} "
         f"h{-(w - nose)} Z")
    rim = rr(x0 + w * 0.24, cy - h / 2 - 2, w * 0.10, h + 4, 2)   # khoét vạch vỏ đạn
    body = f'<path fill-rule="evenodd" d="{d} {rim}"/>'
    if angle:
        body = f'<g transform="rotate({angle} {cx} {cy})">{body}</g>'
    return body


def mug(cx, cy, w, h):
    """Vại bia: thân + quai (khoét lỗ) + lớp bọt."""
    bw = w * 0.68
    x0 = cx - w / 2
    top = cy - h / 2 + h * 0.18
    body_d = rr(x0, top, bw, h - h * 0.18, bw * 0.14)
    # quai = nửa vành khuyên bên phải (cung ngoài đi xuống, cung trong đi ngược lên)
    hx = x0 + bw
    hcy = top + (h - h * 0.18) * 0.46
    ro, ri = w * 0.30, w * 0.175
    handle = (f"M{hx},{hcy - ro} A{ro},{ro} 0 0 1 {hx},{hcy + ro} "
              f"L{hx},{hcy + ri} A{ri},{ri} 0 0 0 {hx},{hcy - ri} Z")
    foam = "".join(
        f'<circle cx="{x0 + bw * f}" cy="{top - bw * 0.09}" r="{bw * 0.22}"/>'
        for f in (0.17, 0.50, 0.83))
    return f'<path d="{body_d}"/><path d="{handle}"/>{foam}'


def arrow_right(x, y, length=86, thick=30, head=54):
    """Mũi tên sang phải: thân chữ nhật + đầu tam giác."""
    hy = thick / 2
    return (f'<path d="M{x},{y - hy} h{length - head} v{-(head / 2 - hy)} '
            f'L{x + length},{y} L{x + length - head},{y + head / 2} '
            f'v{-(head / 2 - hy)} h{-(length - head)} Z"/>')


def arrow_up(cx, bottom, length=110, thick=38, head=70):
    """Mũi tên hướng lên — chính là arrow_right quay -90 độ."""
    return (f'<g transform="translate({cx},{bottom}) rotate(-90)">'
            f'{arrow_right(0, 0, length, thick, head)}</g>')


def burst(cx, cy, r_out=96, r_in=40, points=9, rot=0):
    """Chớp lửa đầu nòng — ngôi sao nhiều cánh không đều cho ra vẻ nổ."""
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        if i % 4 == 0:
            r *= 0.82                      # cánh dài ngắn xen kẽ, đỡ giống bánh răng
        a = math.radians(rot + i * 180.0 / points)
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return f'<path d="M{" L".join(pts)} Z"/>'


def tombstone(cx, top, w=150, h=190):
    """Bia mộ: đầu tròn, khoét hình chữ thập, có bệ."""
    r = w / 2
    d = f"M{cx - r},{top + r} a{r},{r} 0 0 1 {w},0 v{h - r} h{-w} Z"
    # chữ thập khoét lõm — thanh ngang đặt cao (1/3 trên) cho ra chữ thập,
    # để giữa thì nhìn thành dấu cộng của bệnh viện.
    aw = w * 0.15                      # bề dày thanh
    top_y = top + h * 0.20             # đỉnh chữ thập
    bot_y = top + h * 0.80             # chân chữ thập
    bar_y = top + h * 0.36             # mép trên thanh ngang
    half = w * 0.27                    # nửa chiều dài thanh ngang
    cross = (f"M{cx - aw / 2},{top_y} h{aw} v{bar_y - top_y} h{half - aw / 2} v{aw} "
             f"h{-(half - aw / 2)} v{bot_y - bar_y - aw} h{-aw} v{-(bot_y - bar_y - aw)} "
             f"h{-(half - aw / 2)} v{-aw} h{half - aw / 2} Z")
    base = rr(cx - w * 0.60, top + h, w * 1.20, h * 0.15, 10)
    return f'<path fill-rule="evenodd" d="{d} {cross}"/><path d="{base}"/>'


# ------------------------------------------------------------------ các icon
# Mỗi icon là 1 câu tả khả năng bằng hình. Quy ước đọc chung cho cả bộ:
#   lá bài = bài,  trái tim = máu,  bia mộ = có người bị loại,
#   mũi tên = "đổi lấy / dẫn tới",  chớp lửa = phát Bang!,  khiên = lá đỡ.

# "ai bị loại thì rút thêm 2 lá"
HERB_HUNTER = (card(130, 128, w=150, h=204, angle=-24) +
               card(382, 128, w=150, h=204, angle=24) +
               tombstone(256, 232, w=206, h=216))

# "ai bị loại thì hồi tối đa 2 máu" — cặp đôi với herb_hunter, đổi lá thành tim
GREG_DIGGER = (heart(126, 126, 88) +
               heart(386, 126, 88) +
               tombstone(256, 232, w=206, h=216))

# "bỏ 1 lá trang bị xanh dương -> rút 2 lá"
JOSE_DELGADO = (card(96, 256, w=156, h=220) +
                arrow_right(190, 256, length=118, thick=44, head=74) +
                card(378, 152, w=142, h=196, angle=-13) +
                card(406, 356, w=142, h=196, angle=13))

# "bỏ 2 lá bất kỳ -> có hiệu ứng Bang!"
DOC_HOLYDAY = (card(112, 150, w=142, h=196, angle=-15) +
               card(140, 352, w=142, h=196, angle=13) +
               arrow_right(222, 256, length=96, thick=40, head=64) +
               burst(390, 256, r_out=158, r_in=64, points=9, rot=8))

# "bỏ 2 lá trên tay -> hồi 1 máu"
SID_KETCHUM = (card(104, 150, w=138, h=190, angle=-15) +
               card(132, 348, w=138, h=190, angle=13) +
               arrow_right(214, 256, length=96, thick=40, head=64) +
               heart(392, 256, 116))

# "mất 1 máu -> rút 2 lá" (CHỦ ĐỘNG: trái tim có dấu TRỪ)
CHUCK_WENGAM = (heart(106, 256, 100, sign="minus") +
                arrow_right(202, 256, length=102, thick=40, head=66) +
                card(378, 152, w=142, h=196, angle=-13) +
                card(406, 356, w=142, h=196, angle=13))

# "mỗi lần mất máu -> rút bài bù" (BỊ ĐỘNG: trái tim đang RỈ MÁU)
BART_CASSIDY = (heart(118, 212, 106) + drop(118, 378, 48) +
                arrow_right(214, 256, length=100, thick=40, head=66) +
                card(392, 256, w=156, h=216))

# "trả 1 máu -> bắn 1 phát Bang! vào bất kỳ ai"
THE_FAIR_KILLER = (heart(104, 256, 100, sign="minus") +
                   arrow_right(200, 256, length=98, thick=40, head=64) +
                   burst(390, 256, r_out=158, r_in=64, points=9, rot=8))

# "uống Bia hồi 2 máu thay vì 1"
TEQUILA_JOE = (mug(150, 280, w=254, h=296) +
               heart(400, 158, 92) + heart(400, 372, 92))

# "đánh bao nhiêu lá Bang! mỗi lượt cũng được" — nhiều phát liên tiếp
WILLY_THE_KID = (burst(122, 390, r_out=116, r_in=46, points=9, rot=12) +
                 burst(256, 256, r_out=134, r_in=54, points=9, rot=0) +
                 burst(390, 122, r_out=116, r_in=46, points=9, rot=12))

# "đầu lượt rút 3 lá thay vì 2"
PIXIE_PETE = (card(110, 328, w=142, h=196, angle=-20) +
              card(256, 344, w=142, h=196) +
              card(402, 328, w=142, h=196, angle=20) +
              arrow_up(256, 196, length=152, thick=54, head=94))

# "trúng Bang! của hắn thì phải đủ 2 lá Missed! mới né"
SLAB_THE_KILLER = (bullet(110, 256, w=186, h=100) +
                   shield(316, 152, w=166, h=176) +
                   shield(374, 362, w=166, h=176))

# "rút bài đầu lượt: lá thứ 2 lật NGỬA, ra đỏ thì rút thêm lá thứ 3"
BLACK_JACK = (card(102, 276, w=134, h=190, angle=-9) +
              card(256, 240, w=140, h=198, pip="heart") +
              card(410, 276, w=134, h=190, angle=9))

# "rút 1 lá + đúng số máu đang THIẾU" (tim rỗng ruột = phần máu bị mất)
BILL_NOFACE = (heart_ring(112, 256, 110) +
               arrow_right(216, 256, length=98, thick=40, head=66) +
               card(372, 172, w=132, h=182, angle=-14) +
               card(406, 352, w=132, h=182, angle=12))

CUSTOM_ICONS = {
    "custom:herb-hunter": HERB_HUNTER,
    "custom:greg-digger": GREG_DIGGER,
    "custom:jose-delgado": JOSE_DELGADO,
    "custom:doc-holyday": DOC_HOLYDAY,
    "custom:sid-ketchum": SID_KETCHUM,
    "custom:chuck-wengam": CHUCK_WENGAM,
    "custom:bart-cassidy": BART_CASSIDY,
    "custom:the-fair-killer": THE_FAIR_KILLER,
    "custom:tequila-joe": TEQUILA_JOE,
    "custom:willy-the-kid": WILLY_THE_KID,
    "custom:pixie-pete": PIXIE_PETE,
    "custom:slab-the-killer": SLAB_THE_KILLER,
    "custom:black-jack": BLACK_JACK,
    "custom:bill-noface": BILL_NOFACE,
}


# ================= DẢI KÝ HIỆU CHỨC NĂNG (lá bài + lá sự kiện) ==============
# Nhân vật thì VẼ HẲN (mục trên). Lá bài đi hướng khác: cái tên đã nói lên vật
# thể rồi (Whisky là chai rượu), thứ còn thiếu là "lá này LÀM GÌ" — nên giữ hình
# gốc game-icons làm chủ ngữ và gắn thêm một DẢI KÝ HIỆU cố định ở đáy.
#
# BỘ KÝ HIỆU LÀ TÀI SẢN DÙNG LẠI: mỗi ký hiệu có 1 hàm vẽ riêng + 1 dòng khai
# trong MARK_DOC (tên, nghĩa, màu). Script xuất luôn từng ký hiệu ra file rời
# trong `marks/` để tra nhanh và để nhúng vào giao diện sau này. Thêm lá mới thì
# TRA BẢNG NÀY TRƯỚC, đừng nghĩ ra ký hiệu mới — trùng nghĩa mà khác hình là hỏng
# cả bộ.
#
# ---- KHUNG HIỂN THỊ THẬT (đo từ public/style.css) --------------------------
# .card-box__image-wrap = 4.5rem x 3.6rem (~72x58 px) + object-fit: cover, tức
# ảnh vuông bị CẮT ~6% trên và dưới. Vì vậy: dải ký hiệu đặt ở 65%-88% chiều cao
# (an toàn), tối đa 4 ký hiệu 1 hàng, và ưu tiên MÀU — ở cỡ 14-18px màu đọc
# nhanh hơn hình.

# Màu theo NHÓM NGHĨA (không phải theo lá) — nhớ màu là đoán được nửa nghĩa.
C_DMG   = "#b5342b"   # đỏ   — sát thương / Bang! / cấm
C_DEF   = "#2d6ea3"   # xanh dương — phòng thủ, đỡ đòn
C_HEAL  = "#2e7d4f"   # xanh lá — hồi máu
C_THEIR = "#6a4a9e"   # tím  — động vào BÀI CỦA NGƯỜI KHÁC
C_MINE  = "#b0731c"   # cam  — bài của MÌNH / bộ bài rút
C_INFO  = None        # None = ăn theo màu nét của nhóm (nâu/tím than/tím):
                      #        thông tin nhắm ai & khoảng cách, không phải hiệu ứng

MARK_H = 118          # chiều cao chuẩn 1 ký hiệu (khung 512)
STRIP_Y = 392         # tâm dải ký hiệu
STRIP_MAX_W = 470     # quá rộng thì thu nhỏ cả dải cho vừa
BASE_CY = 152         # tâm hình gốc khi có >=2 ký hiệu
BASE_BOX = 236
BASE_CY_1 = 172       # khi chỉ có 0-1 ký hiệu thì cho hình gốc to lên
BASE_BOX_1 = 286


def _fill(color):
    return "" if color is None else f' fill="{color}"'


# ---------------------------------------------------------------- chữ số
# Tự vẽ chữ số kiểu 7 vạch thay vì dùng <text>: script phải chạy ra ẢNH GIỐNG
# NHAU trên máy bất kỳ, mà <text> thì phụ thuộc font cài trên máy đó.
def _seg(x, y, w, h):
    return f"M{x},{y} h{w} v{h} h{-w} Z"


def digit(ch, cx, cy, h):
    """Chữ số 1-5 / '+' / '-' / '∞' / '?' dựng bằng vạch, cao `h`, căn giữa (cx,cy)."""
    w = h * 0.60
    t = h * 0.22                                   # bề dày vạch
    x0, y0 = cx - w / 2, cy - h / 2
    mid = y0 + (h - t) / 2
    A = _seg(x0, y0, w, t)                          # ngang trên
    G = _seg(x0, mid, w, t)                         # ngang giữa
    D = _seg(x0, y0 + h - t, w, t)                  # ngang dưới
    F = _seg(x0, y0, t, (h + t) / 2)                # dọc trái trên
    B = _seg(x0 + w - t, y0, t, (h + t) / 2)        # dọc phải trên
    E = _seg(x0, mid, t, (h + t) / 2)               # dọc trái dưới
    C = _seg(x0 + w - t, mid, t, (h + t) / 2)       # dọc phải dưới
    table = {
        "2": [A, B, G, E, D],
        "3": [A, B, G, C, D],
        "4": [F, B, G, C],
        "5": [A, F, G, C, D],
    }
    if ch == "1":
        # KHÔNG dùng 7 vạch cho số 1: 2 vạch dọc trơ trọi dễ đọc nhầm thành chữ
        # I hay dấu ngoặc. Vẽ có chân đế + mũi hất cho ra dáng số.
        bx = cx - t / 2
        return ("<path d=\"" + _seg(bx, y0, t, h)
                + _seg(cx - w * 0.46, y0 + h - t, w * 0.92, t)
                + f"M{cx - w * 0.42},{y0 + t * 1.1} l{w * 0.42},{-t * 1.1} v{t} "
                  f"l{-w * 0.22},{t * 0.6} Z" + "\"/>")
    if ch == "+":
        return ("<path d=\"" + _seg(x0, mid, w, t) + _seg(cx - t / 2, y0 + h * 0.14, t, h * 0.72) + "\"/>")
    if ch == "-":
        return "<path d=\"" + _seg(x0, mid, w, t) + "\"/>"
    if ch == "?":
        return ("<path d=\"" + _seg(x0, y0, w, t) + _seg(x0 + w - t, y0, t, (h + t) / 2)
                + _seg(cx - t / 2, mid, t, h * 0.18)
                + _seg(cx - t / 2, y0 + h - t, t, t) + "\"/>")
    if ch == "∞":
        # Vẽ bằng NÉT (stroke) chứ không phải khối đặc: 2 vòng tròn rỗng đặt cạnh
        # nhau nhìn ra chữ "oo", phải là đường số 8 nằm ngang mới ra vô cực.
        # 2 vòng phải CẮT NHAU ở giữa mới ra vô cực; nối đuôi nhau là thành "oo".
        r = h * 0.34
        d = (f"M{cx},{cy} "
             f"C{cx - r * 0.45},{cy - r * 1.45} {cx - r * 1.90},{cy - r * 1.15} {cx - r * 1.90},{cy} "
             f"C{cx - r * 1.90},{cy + r * 1.15} {cx - r * 0.45},{cy + r * 1.45} {cx},{cy} "
             f"C{cx + r * 0.45},{cy - r * 1.45} {cx + r * 1.90},{cy - r * 1.15} {cx + r * 1.90},{cy} "
             f"C{cx + r * 1.90},{cy + r * 1.15} {cx + r * 0.45},{cy + r * 1.45} {cx},{cy} Z")
        return (f'<path d="{d}" fill="none" stroke="currentColor" '
                f'stroke-width="{t * 0.90}" stroke-linejoin="round"/>')
    return "<path d=\"" + "".join(table[ch]) + "\"/>"


def digits(text, cx, cy, h):
    """Nhiều ký tự cạnh nhau, căn giữa."""
    # Có ∞ thì nới rộng khoảng hở: "1∞" sát nhau đọc nhầm thành "100".
    gap = h * 0.42 if "∞" in text else h * 0.16
    ws = [h * 1.45 if c == "∞" else h * 0.60 for c in text]
    total = sum(ws) + gap * (len(ws) - 1)
    x = cx - total / 2
    out = []
    for c, w in zip(text, ws):
        out.append(digit(c, x + w / 2, cy, h))
        x += w + gap
    return "".join(out)


# ---------------------------------------------------------------- hình người
def person(cx, cy, h):
    """Bóng người: đầu tròn + thân bo — dùng cho ký hiệu 'nhắm ai'."""
    hr = h * 0.21
    hy = cy - h / 2 + hr
    bw, bh = h * 0.56, h * 0.50
    bx, by = cx - bw / 2, cy - h / 2 + hr * 2.25
    body = (f"M{bx},{by + bh} v{-bh * 0.52} a{bw / 2},{bw / 2} 0 0 1 {bw},0 v{bh * 0.52} Z")
    return f'<circle cx="{cx}" cy="{hy}" r="{hr}"/><path d="{body}"/>'


def broken_heart(cx, cy, s):
    """Trái tim nứt = mất máu (khác trái tim lành = hồi máu)."""
    d = heart_d(cx, cy, s)
    zig = (f"M{cx - s * 0.13},{cy - s * 0.62} l{s * 0.30},{s * 0.34} l{-s * 0.26},{s * 0.30} "
           f"l{s * 0.26},{s * 0.62} l{-s * 0.20},0 l{-s * 0.24},{-s * 0.66} "
           f"l{s * 0.26},{-s * 0.30} l{-s * 0.26},{-s * 0.30} Z")
    return f'<path fill-rule="evenodd" d="{d} {zig}"/>'


def pistol(cx, cy, h):
    """Súng lục tí hon (nòng chĩa phải) — ký hiệu 'tầm tính theo súng đang cầm'."""
    w = h * 1.34
    x0, y0 = cx - w / 2, cy - h / 2
    barrel = _seg(x0 + w * 0.20, y0 + h * 0.16, w * 0.78, h * 0.22)
    frame = _seg(x0 + w * 0.16, y0 + h * 0.10, w * 0.38, h * 0.40)
    cyl = _seg(x0 + w * 0.30, y0 + h * 0.06, w * 0.20, h * 0.46)
    grip = (f"M{x0 + w * 0.20},{y0 + h * 0.44} l{w * 0.28},0 l{-w * 0.10},{h * 0.56} "
            f"l{-w * 0.26},0 Z")
    return f'<path d="{barrel}{frame}{cyl}"/><path d="{grip}"/>'


def dist_arrow(cx, cy, w, t):
    """Mũi tên 2 đầu ↔ — ký hiệu chung cho MỌI thứ liên quan khoảng cách."""
    # head phải NHỎ so với w, không thì 2 đầu mũi tên ăn hết thân -> ra hình thoi
    hw, head, hh = w / 2, t * 1.15, t * 1.15
    return (f'<path d="M{cx - hw},{cy} L{cx - hw + head},{cy - hh} '
            f'L{cx - hw + head},{cy - t / 2} L{cx + hw - head},{cy - t / 2} '
            f'L{cx + hw - head},{cy - hh} L{cx + hw},{cy} '
            f'L{cx + hw - head},{cy + hh} L{cx + hw - head},{cy + t / 2} '
            f'L{cx - hw + head},{cy + t / 2} L{cx - hw + head},{cy + hh} Z"/>')


# ---------------------------------------------------------------- ký hiệu
# Mỗi hàm trả (chiều rộng, hàm vẽ(x_tâm)). Tên khoá dùng trong CUSTOM_MIX.

def _k_bang():
    return MARK_H, (lambda x: f'<g{_fill(C_DMG)}>'
                    + burst(x, STRIP_Y, r_out=MARK_H * 0.50, r_in=MARK_H * 0.20, points=9)
                    + "</g>")


def _k_missed():
    w = MARK_H * 0.88
    return w, (lambda x: f'<g{_fill(C_DEF)}>' + shield(x, STRIP_Y, w=w, h=MARK_H) + "</g>")


def _k_heal(n=1):
    s = MARK_H * 0.44
    gap = MARK_H * 0.10
    w = n * s * 2 + (n - 1) * gap
    def draw(x):
        out = []
        cx = x - w / 2 + s
        for _ in range(n):
            out.append(heart(cx, STRIP_Y, s))
            cx += s * 2 + gap
        return f'<g{_fill(C_HEAL)}>' + "".join(out) + "</g>"
    return w, draw


def _k_dmg(n=1):
    s = MARK_H * 0.44
    if n <= 2:
        gap = MARK_H * 0.10
        w = n * s * 2 + (n - 1) * gap
        def draw(x):
            out, cx = [], x - w / 2 + s
            for _ in range(n):
                out.append(broken_heart(cx, STRIP_Y, s))
                cx += s * 2 + gap
            return f'<g{_fill(C_DMG)}>' + "".join(out) + "</g>"
        return w, draw
    w = s * 2 + MARK_H * 0.52                      # nhiều hơn 2 thì ghi số
    def draw(x):
        return (f'<g{_fill(C_DMG)}>' + broken_heart(x - w / 2 + s, STRIP_Y, s)
                + digits(str(n), x + w / 2 - MARK_H * 0.24, STRIP_Y, MARK_H * 0.62) + "</g>")
    return w, draw


def _mini_card(cx, w=None):
    w = w or MARK_H * 0.46
    return card(cx, STRIP_Y, w=w, h=MARK_H * 0.80, r=8, t=12, pip=None)


def _k_deck(n=1):
    """Rút bài TỪ BỘ BÀI — mũi tên lên + n lá."""
    cw = MARK_H * 0.46
    aw = MARK_H * 0.42
    gap = MARK_H * 0.09
    w = aw + gap + n * cw + (n - 1) * gap
    def draw(x):
        cx = x - w / 2
        out = [arrow_up(cx + aw / 2, STRIP_Y + MARK_H * 0.40,
                        length=MARK_H * 0.80, thick=MARK_H * 0.26, head=MARK_H * 0.42)]
        cx += aw + gap
        for _ in range(n):
            out.append(_mini_card(cx + cw / 2))
            cx += cw + gap
        return f'<g{_fill(C_MINE)}>' + "".join(out) + "</g>"
    return w, draw


def _k_cost(n=1):
    """Phải BỎ THÊM n lá của mình để kích hoạt — mũi tên xuống + n lá."""
    cw = MARK_H * 0.46
    aw = MARK_H * 0.42
    gap = MARK_H * 0.09
    w = aw + gap + n * cw + (n - 1) * gap
    def draw(x):
        cx = x - w / 2
        a = arrow_up(0, 0, length=MARK_H * 0.80, thick=MARK_H * 0.26, head=MARK_H * 0.42)
        out = [f'<g transform="translate({cx + aw / 2},{STRIP_Y - MARK_H * 0.40}) rotate(180)">{a}</g>']
        cx += aw + gap
        for _ in range(n):
            out.append(_mini_card(cx + cw / 2))
            cx += cw + gap
        return f'<g{_fill(C_MINE)}>' + "".join(out) + "</g>"
    return w, draw


def _k_steal():
    """Bốc bài TỪ TAY người khác — lá bị kéo về phía mình."""
    cw = MARK_H * 0.46
    w = cw + MARK_H * 0.62
    def draw(x):
        a = arrow_right(0, 0, length=MARK_H * 0.54, thick=MARK_H * 0.24, head=MARK_H * 0.38)
        a = f'<g transform="translate({x - w / 2 + MARK_H * 0.54},{STRIP_Y}) rotate(180)">{a}</g>'
        return f'<g{_fill(C_THEIR)}>' + a + _mini_card(x + w / 2 - cw / 2) + "</g>"
    return w, draw


def _k_discard():
    """Bắt NGƯỜI KHÁC bỏ bài — lá bị gạch chéo."""
    cw = MARK_H * 0.46
    w = cw * 1.5
    def draw(x):
        a, b = MARK_H * 0.26, MARK_H * 0.095
        d = (f"M{x - a},{STRIP_Y - a + b} l{b},{-b} l{a},{a} l{a},{-a} l{b},{b} "
             f"l{-a},{a} l{a},{a} l{-b},{b} l{-a},{-a} l{-a},{a} l{-b},{-b} l{a},{-a} Z")
        return f'<g{_fill(C_THEIR)}>' + _mini_card(x) + f'<path d="{d}"/>' + "</g>"
    return w, draw


def _k_ban():
    w = MARK_H * 0.92
    def draw(x):
        R, t = MARK_H * 0.46, MARK_H * 0.13
        ring = (f"M{x},{STRIP_Y - R} a{R},{R} 0 1 0 0.01,0 Z "
                f"M{x},{STRIP_Y - R + t} a{R - t},{R - t} 0 1 1 -0.01,0 Z")
        bar = (f"M{x - R * 0.72},{STRIP_Y - R * 0.52} l{t * 0.75},{-t * 0.75} "
               f"l{R * 1.44},{R * 1.44} l{-t * 0.75},{t * 0.75} Z")
        return (f'<g{_fill(C_DMG)}><path fill-rule="evenodd" d="{ring}"/>'
                f'<path d="{bar}"/></g>')
    return w, draw


def _k_one():
    """Nhắm ĐÚNG 1 người."""
    w = MARK_H * 0.62
    return w, (lambda x: f'<g{_fill(C_INFO)}>' + person(x, STRIP_Y, MARK_H * 0.92) + "</g>")


def _k_all():
    """Nhắm NHIỀU người (mọi người / mọi người khác)."""
    ph = MARK_H * 0.72
    pw = ph * 0.56
    gap = MARK_H * 0.07
    w = 3 * pw + 2 * gap
    def draw(x):
        cx = x - w / 2 + pw / 2
        out = []
        for _ in range(3):
            out.append(person(cx, STRIP_Y, ph))
            cx += pw + gap
        return f'<g{_fill(C_INFO)}>' + "".join(out) + "</g>"
    return w, draw


def _k_wr(txt=""):
    """Tầm bắn tính theo SÚNG. txt rỗng = 'theo khẩu đang cầm'."""
    gw = MARK_H * 0.95
    dh = MARK_H * 0.62
    dw = sum(dh * 1.45 if c == "∞" else dh * 0.60 for c in txt) + dh * 0.16 * max(len(txt) - 1, 0)
    gap = MARK_H * 0.10 if txt else 0
    w = gw + gap + dw
    def draw(x):
        out = [pistol(x - w / 2 + gw / 2, STRIP_Y, MARK_H * 0.66)]
        if txt:
            out.append(digits(txt, x + w / 2 - dw / 2, STRIP_Y, dh))
        return f'<g{_fill(C_INFO)}>' + "".join(out) + "</g>"
    return w, draw


def _k_dist(txt="1"):
    """Khoảng cách CỐ ĐỊNH của lá, hoặc chỉnh khoảng cách (+1 / -1)."""
    aw = MARK_H * 1.00
    dh = MARK_H * 0.62
    dw = sum(dh * 0.60 for c in txt) + dh * 0.16 * max(len(txt) - 1, 0)
    gap = MARK_H * 0.10
    w = aw + gap + dw
    def draw(x):
        return (f'<g{_fill(C_INFO)}>'
                + dist_arrow(x - w / 2 + aw / 2, STRIP_Y, aw, MARK_H * 0.20)
                + digits(txt, x + w / 2 - dw / 2, STRIP_Y, dh) + "</g>")
    return w, draw


# key -> (hàm dựng, nhãn ngắn, giải thích) — MARK_DOC dùng để xuất file rời và
# để in ra bảng tra trong README, đừng thêm ký hiệu mà quên khai ở đây.
MARK_BUILDERS = {
    "bang": _k_bang, "missed": _k_missed, "ban": _k_ban,
    "heal": _k_heal, "heal2": lambda: _k_heal(2),
    "dmg": _k_dmg, "dmg2": lambda: _k_dmg(2), "dmg3": lambda: _k_dmg(3),
    "deck": _k_deck, "deck2": lambda: _k_deck(2), "deck3": lambda: _k_deck(3),
    "cost": _k_cost,
    "steal": _k_steal, "discard": _k_discard,
    "one": _k_one, "all": _k_all,
    "wr": _k_wr,
    "wr1inf": lambda: _k_wr("1∞"), "wr2": lambda: _k_wr("2"), "wr3": lambda: _k_wr("3"),
    "wr4": lambda: _k_wr("4"), "wr5": lambda: _k_wr("5"),
    "d1": lambda: _k_dist("1"),
    "dp1": lambda: _k_dist("+1"), "dm1": lambda: _k_dist("-1"),
}

MARK_DOC = [
    ("bang",   "Bang!",              C_DMG,   "gây hiệu ứng Bang! (đỡ được bằng Missed!)"),
    ("missed", "Missed!",            C_DEF,   "lá này đỡ được đòn, hoặc dùng thay Missed!"),
    ("heal",   "Hồi máu",            C_HEAL,  "hồi 1 máu — 2 quả tim là 2 máu"),
    ("dmg",    "Mất máu",            C_DMG,   "mất máu KHÔNG qua Bang! (tim nứt) — kèm số nếu >2"),
    ("deck",   "Rút từ bộ bài",      C_MINE,  "rút bài từ BỘ BÀI — mấy lá là mấy lá"),
    ("cost",   "Chi phí bỏ bài",     C_MINE,  "phải bỏ thêm lá của MÌNH mới kích hoạt được"),
    ("steal",  "Bốc từ tay người",   C_THEIR, "lấy bài từ TAY/sân người khác về mình"),
    ("discard","Bắt người bỏ bài",   C_THEIR, "bắt người khác bỏ 1 lá (không về tay mình)"),
    ("ban",    "Cấm / vô hiệu",      C_DMG,   "cấm một hành động, hoặc vô hiệu hoá trang bị"),
    ("one",    "Nhắm 1 người",       C_INFO,  "chọn đúng 1 mục tiêu"),
    ("all",    "Nhắm nhiều người",   C_INFO,  "trúng mọi người (hoặc mọi người khác)"),
    ("wr",     "Theo tầm súng",      C_INFO,  "tầm dùng lá tính theo KHẨU SÚNG đang cầm"),
    ("wr3",    "Tầm súng = N",       C_INFO,  "riêng lá súng: con số là tầm bắn của khẩu đó"),
    ("wr1inf", "Tầm 1, vô hạn Bang!",C_INFO,  "Volcanic: tầm 1 nhưng đánh Bang! không giới hạn"),
    ("d1",     "Khoảng cách cố định",C_INFO,  "lá CHỈ dùng được trong khoảng cách ghi trên logo"),
    ("dp1",    "Khoảng cách +1",     C_INFO,  "người khác nhìn mình XA thêm 1"),
    ("dm1",    "Khoảng cách -1",     C_INFO,  "mình nhìn người khác GẦN hơn 1"),
]


def strip(spec):
    """Dựng dải ký hiệu, căn giữa; quá rộng thì thu nhỏ cả dải cho vừa khung."""
    if not spec:
        return ""
    items = [MARK_BUILDERS[k]() for k in spec.split()]
    gap = MARK_H * 0.15
    total = sum(w for w, _ in items) + gap * (len(items) - 1)
    x = -total / 2
    out = []
    for w, draw in items:
        out.append(draw(x + w / 2))
        x += w + gap
    body = "".join(out)
    sc = min(1.0, STRIP_MAX_W / total)
    if sc < 1.0:
        return (f'<g transform="translate(256,{STRIP_Y}) scale({sc:.4f}) '
                f'translate(0,{-STRIP_Y})">{body}</g>')
    return f'<g transform="translate(256,0)">{body}</g>'


# name -> (icon nền của game-icons, dải ký hiệu, ghi chú không dùng tới)
# Đọc dải theo thứ tự: LÀM GÌ -> NHẮM AI -> TẦM/KHOẢNG CÁCH.
CUSTOM_MIX = {
    # ---------------- lá NÂU (bài chức năng) ----------------
    "mix:bang":          ("gunshot", "bang one wr"),
    "mix:missed":        ("dodging", "missed"),
    "mix:beer":          ("beer-stein", "heal"),
    "mix:saloon":        ("saloon-doors", "heal all"),
    "mix:stagecoach":    ("old-wagon", "deck2"),
    "mix:wells_fargo":   ("chest", "deck3"),
    "mix:panic":         ("grab", "steal one d1"),
    "mix:cat_balou":     ("card-burn", "discard one"),
    "mix:general_store": ("shop", "deck all"),
    "mix:indians":       ("tomahawk", "dmg all"),
    "mix:duel":          ("duel", "dmg one"),
    "mix:gatling":       ("machine-gun", "bang all"),
    "mix:brawl":         ("brass-knuckles", "cost discard all"),
    "mix:dodge":         ("avoidance", "missed deck"),
    "mix:punch":         ("punch", "bang one d1"),
    "mix:rag_time":      ("banjo", "cost steal one"),
    "mix:springfield":   ("musket", "cost bang one"),
    "mix:tequila":       ("agave", "cost heal one"),
    "mix:whisky":        ("brandy-bottle", "cost heal2"),
    # ---------------- lá XANH DƯƠNG (trang bị) ----------------
    "mix:volcanic":      ("luger", "wr1inf"),
    "mix:schofield":     ("revolver", "wr2"),
    "mix:remington":     ("blunderbuss", "wr3"),
    "mix:rev_carabine":  ("sawed-off-shotgun", "wr4"),
    "mix:winchester":    ("winchester-rifle", "wr5"),
    "mix:barrel":        ("barrel", "missed"),
    "mix:scope":         ("crosshair", "dm1"),
    "mix:binocular":     ("binoculars", "dm1"),
    "mix:mustang":       ("horse-head", "dp1"),
    "mix:hideout":       ("cave-entrance", "dp1"),
    "mix:jail":          ("imprisoned", "ban one"),
    "mix:dynamite":      ("dynamite", "dmg3"),
    # ---------------- lá VÀNG (trang bị trì hoãn) ----------------
    "mix:bible":          ("open-book", "missed deck"),   # đỡ thành công thì rút thêm 1 lá
    "mix:sombrero":       ("sombrero", "missed"),
    "mix:ten_gallon_hat": ("western-hat", "missed"),
    "mix:iron_plate":     ("metal-plate", "missed"),
    "mix:canteen":        ("water-flask", "heal"),
    "mix:pony_express":   ("envelope", "deck3"),
    "mix:derringer":      ("pistol-gun", "bang one d1 deck"),
    "mix:conestoga":      ("saddle", "steal one"),
    "mix:can_can":        ("large-dress", "discard one"),
    "mix:buffalo_rifle":  ("lee-enfield", "bang one"),
    "mix:knife":          ("bowie-knife", "bang one d1"),
    "mix:pepperbox":      ("crossed-pistols", "bang one wr"),  # theo TẦM SÚNG, không phải kc 1
    "mix:howitzer":       ("field-gun", "bang all"),
    # ---------------- lá SỰ KIỆN ----------------
    # the_reverend/the_sermon cố tình vẽ ĐÚNG thứ bị cấm rồi gắn ký hiệu cấm,
    # thay cho hình nhà thờ / người cầu nguyện của bản đầu — hình cũ đúng chữ
    # nhưng không nói được lá đó cấm cái gì.
    "mix:the_reverend":  ("beer-stein", "ban"),
    "mix:the_sermon":    ("gunshot", "ban"),
    "mix:hangover":      ("knocked-out-stars", "ban"),
    "mix:shootout":      ("bullet-impacts", "bang bang"),
    "mix:thirst":        ("desert", "deck"),
    "mix:train_arrival": ("steam-locomotive", "deck3"),
    "mix:the_daltons":   ("bandit", "discard all"),
    "mix:the_doctor":    ("stethoscope", "heal"),
    "mix:high_noon":     ("sunbeams", "dmg all"),
    "mix:ambush":        ("wolf-trap", "d1 all"),
    "mix:lasso":         ("lasso", "ban"),
    "mix:the_judge":     ("gavel", "ban"),
    "mix:hard_liquor":   ("glass-shot", "heal"),
    "mix:ranch":         ("ranch-gate", "cost deck"),
    "mix:russian_roulette": ("reload-gun-barrel", "dmg all"),
    "mix:blood_brothers": ("shaking-hands", "heal one"),
    "mix:sniper":        ("dead-eye", "bang missed missed"),
    "mix:ricochet":      ("ricochet", "bang discard"),
    "mix:a_fistful_of_cards": ("card-random", "bang"),
}

# ============================================================================

def icon_svg(name):
    if name in CUSTOM_ICONS:            # icon vẽ hẳn, luôn khung 512x512
        return CUSTOM_ICONS[name], 512, 512
    if name in CUSTOM_MIX:              # icon gốc + dải ký hiệu chức năng
        base, marks = CUSTOM_MIX[name]
        ic = ICONS['icons'].get(base)
        if ic is None: raise KeyError(base)
        w = ic.get('width', SET_W); h = ic.get('height', SET_H)
        # ít ký hiệu thì cho hình gốc to lên, đỡ trống trải
        n = len(marks.split()) if marks else 0
        box, cy = (BASE_BOX_1, BASE_CY_1) if n <= 1 else (BASE_BOX, BASE_CY)
        sc = box / max(w, h)
        out = (f'<g transform="translate({256 - w * sc / 2:.2f},{cy - h * sc / 2:.2f}) '
               f'scale({sc:.5f})">{ic["body"]}</g>')
        return out + strip(marks), 512, 512
    ic = ICONS['icons'].get(name)
    if ic is None: raise KeyError(name)
    w = ic.get('width', SET_W); h = ic.get('height', SET_H)
    return ic['body'], w, h


def icon_exists(name):
    return name in CUSTOM_ICONS or name in CUSTOM_MIX or name in ICONS['icons']

# LƯU Ý (sửa 2026-08-08): body icon của iconify dùng `fill="currentColor"` —
# đặt fill="..." trên thẻ <g> cha KHÔNG đè được lên nó (thuộc tính fill của con
# thắng), nên trước đây mọi ảnh sinh ra đều là nét ĐEN, 3 hằng INK/INK_CH/
# INK_EV coi như vô tác dụng. Phải đặt THÊM `color="..."` để currentColor có
# giá trị thật thì màu nét mới ăn.
def make_png(icon_name, out_path, ink=INK, bg=PARCH, bg2=PARCH2, border=BORDER, size=256):
    body, w, h = icon_svg(icon_name)
    scale = 300.0 / max(w, h)          # icon chiếm ~59% khung 512
    tx = (512 - w * scale) / 2.0
    ty = (512 - h * scale) / 2.0
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="{bg}"/><stop offset="1" stop-color="{bg2}"/></linearGradient></defs>
<rect x="18" y="18" width="476" height="476" rx="54" ry="54" fill="url(#g)" stroke="{border}" stroke-width="10"/>
<rect x="42" y="42" width="428" height="428" rx="38" ry="38" fill="none" stroke="{border}" stroke-width="4" opacity="0.55"/>
<g transform="translate({tx:.2f},{ty:.2f}) scale({scale:.5f})" fill="{ink}" color="{ink}">{body}</g>
</svg>'''
    cairosvg.svg2png(bytestring=svg.encode(), write_to=out_path,
                     output_width=size, output_height=size)

# ---------- 44 lá bài ----------
CARDS = {
  # nâu (19)
  'bang':'mix:bang', 'missed':'mix:missed', 'beer':'mix:beer', 'saloon':'mix:saloon',
  'stagecoach':'mix:stagecoach', 'wells_fargo':'mix:wells_fargo', 'panic':'mix:panic', 'cat_balou':'mix:cat_balou',
  'general_store':'mix:general_store', 'indians':'mix:indians', 'duel':'mix:duel', 'gatling':'mix:gatling',
  'brawl':'mix:brawl', 'dodge':'mix:dodge', 'punch':'mix:punch', 'rag_time':'mix:rag_time',
  'springfield':'mix:springfield', 'tequila':'mix:tequila', 'whisky':'mix:whisky',
  # xanh dương (12)
  'volcanic':'mix:volcanic', 'schofield':'mix:schofield', 'remington':'mix:remington',
  'rev_carabine':'mix:rev_carabine', 'winchester':'mix:winchester', 'barrel':'mix:barrel',
  'scope':'mix:scope', 'mustang':'mix:mustang', 'jail':'mix:jail', 'dynamite':'mix:dynamite',
  'binocular':'mix:binocular', 'hideout':'mix:hideout',
  # vàng (13)
  'bible':'mix:bible', 'sombrero':'mix:sombrero', 'ten_gallon_hat':'mix:ten_gallon_hat',
  'iron_plate':'mix:iron_plate', 'canteen':'mix:canteen', 'pony_express':'mix:pony_express',
  'derringer':'mix:derringer', 'conestoga':'mix:conestoga', 'can_can':'mix:can_can',
  'buffalo_rifle':'mix:buffalo_rifle', 'knife':'mix:knife', 'pepperbox':'mix:pepperbox',
  'howitzer':'mix:howitzer',
}

# CẢNH BÁO khi đổi icon SÚNG: trong bộ game-icons, 'rifle' vẽ ra VIÊN ĐẠN và
# 'shotgun' vẽ ra VỎ ĐẠN — KHÔNG phải khẩu súng (đã dính bẫy này 1 lần, xem
# CHANGELOG 2026-08-22). Muốn súng dài thật thì dùng 'lee-enfield', 'musket',
# 'winchester-rifle', 'sawed-off-shotgun' hoặc 'blunderbuss'.

# ---------- 42 nhân vật (icon gợi ý KHẢ NĂNG, dễ nhớ hơn chân dung) ----------
# Danh sách này phải khớp ĐÚNG các id trong CHARACTERS ở src/core/characters.ts
# — thêm nhân vật mới ở đó thì thêm 1 dòng ở đây, không thì lá đó rơi về hiển
# thị bằng chữ.
CHARS = {
  # 16 gốc
  'jourdonnais':'cellar-barrels', 'black_jack':'custom:black-jack', 'bart_cassidy':'custom:bart-cassidy',
  'el_gringo':'robber-hand', 'paul_regret':'cloaked-figure-on-horseback', 'rose_doolan':'spyglass',
  'vulture_sam':'vulture', 'willy_the_kid':'custom:willy-the-kid', 'slab_the_killer':'custom:slab-the-killer',
  'suzy_lafayette':'open-palm', 'pedro_ramirez':'card-pickup', 'lucky_duke':'coinflip',
  'jesse_jones':'robber', 'kit_carlson':'poker-hand', 'calamity_janet':'card-exchange',
  'sid_ketchum':'custom:sid-ketchum',
  # 15 Dodge City
  'pixie_pete':'custom:pixie-pete', 'bill_noface':'custom:bill-noface', 'greg_digger':'custom:greg-digger',
  'herb_hunter':'custom:herb-hunter', 'pat_brennan':'card-pick', 'chuck_wengam':'custom:chuck-wengam',
  'jose_delgado':'custom:jose-delgado', 'sean_mallory':'hand-bag', 'tequila_joe':'custom:tequila-joe',
  'elena_fuente':'arrows-shield', 'apache_kid':'card-ace-diamonds', 'doc_holyday':'custom:doc-holyday',
  'molly_stark':'card-play', 'belle_star':'shield-disabled', 'vera_custer':'carnival-mask',
  # 11 tự chế (*ex)
  'elena_noir':'heart-shield', 'marcel_marcelo':'manacles', 'mary_rose':'gun-rose',
  'the_thief':'bandana', 'the_gambler':'rolling-dices', 'the_fair_killer':'custom:the-fair-killer',
  'the_drunker':'glass-celebration', 'the_drifter':'temporary-shield', 'the_dealer':'trade',
  'the_sentinel':'hand-of-god', 'the_nobody':'invisible-face',
}

# ---------- 28 lá sự kiện (High Noon 13 + A Fistful of Cards 15) ----------
# Icon chọn theo HIỆU ỨNG lúc chơi (giống cách chọn icon nhân vật), không phải
# theo nghĩa đen của cái tên — vd Gold Rush là mũi tên xoay ngược (đảo chiều
# lượt) chứ không phải cục vàng, vì lúc đang chơi cái người ta cần nhớ là
# "đang đi ngược chiều". Xem bảng tra + lý do từng lá trong README.md.
EVENTS = {
  # 13 High Noon
  'blessing':'card-ace-hearts',          # mọi lá thành chất Cơ
  'curse':'card-ace-spades',             # mọi lá thành chất Bích
  'hangover':'mix:hangover',        # mất khả năng nhân vật (choáng váng)
  'shootout':'mix:shootout',           # 2 lá Bang!/lượt (nhiều vết đạn hơn)
  'the_reverend':'mix:the_reverend',               # cấm Bia
  'the_sermon':'mix:the_sermon',                 # cấm chơi Bang!
  'thirst':'mix:thirst',                     # rút ít hơn 1 lá
  'train_arrival':'mix:train_arrival',    # rút nhiều hơn 1 lá
  'gold_rush':'anticlockwise-rotation',  # đảo chiều lượt chơi
  'the_daltons':'mix:the_daltons',                # ai có trang bị phải bỏ 1 lá
  'the_doctor':'mix:the_doctor',            # người ít máu nhất +1 máu
  'ghost_town':'ghost',
  'high_noon':'mix:high_noon',                # lá cuối: đầu lượt mất 1 máu
  # 15 A Fistful of Cards
  'ambush':'mix:ambush',                  # khoảng cách mọi người = 1
  'lasso':'mix:lasso',                       # vô hiệu mọi trang bị
  'the_judge':'mix:the_judge',                   # cấm đặt trang bị mới
  'abandoned_mine':'gold-mine',
  'hard_liquor':'mix:hard_liquor',            # bỏ pha rút bài để hồi 1 máu
  'law_of_the_west':'law-star',
  # CỐ TÌNH không dùng 'cactus' cho Peyote dù đúng nghĩa đen: 'desert' (lá
  # Thirst ngay trên) cũng vẽ cây xương rồng -> 2 lá nhìn na ná nhau giữa bàn.
  'peyote':'magic-swirl',                # đoán màu chất lá (ảo giác)
  'ranch':'mix:ranch',                  # đổi lá trên tay
  'russian_roulette':'mix:russian_roulette',# ổ quay súng lục
  'dead_man':'tombstone',
  'blood_brothers':'mix:blood_brothers',      # tặng 1 máu cho người khác
  'vendetta':'extra-time',               # rút ra Cơ thì được chơi thêm 1 lượt
  'sniper':'mix:sniper',                   # 2 Bang! -> cần đỡ 2 Missed!
  'ricochet':'mix:ricochet',                 # bắn rụng trang bị
  'a_fistful_of_cards':'mix:a_fistful_of_cards',    # lá cuối: ăn Bang! bằng số lá trên tay
}

# Ngoại lệ màu nét: Blessing/Curse là "mọi lá thành chất Cơ/Bích" — vẽ đúng
# màu đỏ/đen của chất thì liếc 1 cái là biết ngay lá nào, tím than trung tính
# làm 2 lá này gần như giống hệt nhau.
EVENT_INK = {
  'blessing': '#b0342c',   # đỏ chất Cơ
  'curse':    '#241d33',   # đen chất Bích
}

def fallback(name, alts):
    for a in [name] + alts:
        if a in ICONS['icons']: return a
    return None

missing = []
if ONLY in (None, 'cards'):
    # LƯU Ý: biến lặp tên `card_name` chứ KHÔNG phải `card` — `card()` là hàm vẽ
    # lá bài của bộ icon tự vẽ ở trên, đặt trùng tên là ghi đè mất nó.
    for card_name, icon in CARDS.items():
        if not icon_exists(icon): missing.append(('card', card_name, icon)); continue
        make_png(icon, f'{OUT}/{card_name}.png')

if ONLY in (None, 'chars'):
    for cid, icon in CHARS.items():
        if not icon_exists(icon): missing.append(('char', cid, icon)); continue
        make_png(icon, f'{OUT}/characters/{cid}.png',
                 ink=INK_CH, bg=PARCH_CH, bg2=PARCH_CH2, border=BORDER_CH)

if ONLY in (None, 'events'):
    for eid, icon in EVENTS.items():
        if not icon_exists(icon): missing.append(('event', eid, icon)); continue
        make_png(icon, f'{OUT}/events/{eid}.png',
                 ink=EVENT_INK.get(eid, INK_EV), bg=PARCH_EV, bg2=PARCH_EV2, border=BORDER_EV)

if ONLY is not None:
    print('THIẾU ICON:', missing if missing else 'không có')
    print('chỉ sinh nhóm:', ONLY)
    sys.exit(0)

# ---------- từng KÝ HIỆU chức năng ra 1 file riêng ----------
# Lý do tách riêng: bộ ký hiệu là tài sản dùng lại, không phải phụ kiện của lá
# bài. Có file rời thì (a) tra nhanh khi thêm lá mới, (b) nhúng thẳng vào bảng
# chú giải / phần mô tả lá trong giao diện mà không phải cắt ảnh.
# Nền trong suốt, nét lấy màu nâu lá bài; ký hiệu nào có màu riêng thì màu đó
# thắng (đã đặt fill ngay trong hàm vẽ).
def make_mark_png(key, out_path, size=128):
    w, draw = MARK_BUILDERS[key]()
    sc = min(1.0, 460.0 / w)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<g transform="translate(256,{256 - STRIP_Y}) scale({sc:.4f})" fill="{INK}" color="{INK}">{draw(0)}</g>
</svg>'''
    cairosvg.svg2png(bytestring=svg.encode(), write_to=out_path,
                     output_width=size, output_height=size)

for _key, _label, _color, _desc in MARK_DOC:
    make_mark_png(_key, f'{OUT}/marks/{_key}.png')

# ---------- mặt lưng lá bài ----------
back = '''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
<pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="48" height="48" fill="#7b3f28"/><rect width="24" height="48" fill="#6a3522"/></pattern>
</defs>
<rect x="10" y="10" width="492" height="492" rx="56" ry="56" fill="url(#p)" stroke="#3d2015" stroke-width="14"/>
<circle cx="256" cy="256" r="132" fill="#f0e3c8" stroke="#3d2015" stroke-width="12"/>
<g transform="translate(140,140) scale(0.4531)" fill="#7b3f28">%s</g>
</svg>''' % icon_svg('western-hat')[0]
cairosvg.svg2png(bytestring=back.encode(), write_to=f'{OUT}/card-back.png',
                 output_width=256, output_height=256)

# ---------- viên đạn (máu) ----------
def bullet(path, filled):
    fill   = '#c9a227' if filled else 'none'
    stroke = '#7a5c10' if filled else '#9a9a9a'
    op     = '1' if filled else '0.55'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<g opacity="{op}">
<path d="M64 10 C82 26 90 44 90 62 L90 100 C90 108 84 114 76 114 L52 114 C44 114 38 108 38 100 L38 62 C38 44 46 26 64 10 Z"
      fill="{fill}" stroke="{stroke}" stroke-width="9" stroke-linejoin="round"/>
<path d="M38 66 L90 66" stroke="{stroke}" stroke-width="7"/>
</g></svg>'''
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, output_width=128, output_height=128)

bullet(f'{OUT}/bullet-full.png', True)
bullet(f'{OUT}/bullet-empty.png', False)

print('THIẾU ICON:', missing if missing else 'không có')
print('cards:', len(CARDS), 'chars:', len(CHARS), 'events:', len(EVENTS),
      'marks:', len(MARK_DOC))
