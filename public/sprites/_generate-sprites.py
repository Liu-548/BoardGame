import json, os, subprocess, sys
import cairosvg

ICONS = json.load(open('/tmp/icons/node_modules/@iconify-json/game-icons/icons.json'))
SET_W = ICONS.get('width', 512); SET_H = ICONS.get('height', 512)

OUT = '/sessions/determined-stoic-cori/mnt/BoardGame/public/sprites'
os.makedirs(OUT, exist_ok=True)
os.makedirs(OUT + '/characters', exist_ok=True)

PARCH   = '#f0e3c8'   # nền giấy da
PARCH2  = '#e2d0ac'
BORDER  = '#b99b6b'
INK     = '#4a3728'   # màu nét chính
INK_CH  = '#3d3a52'   # màu nét cho lá nhân vật (tím than, phân biệt với lá bài)
PARCH_CH  = '#dfe3ee'
PARCH_CH2 = '#c8cfe2'
BORDER_CH = '#8d94ad'

def icon_svg(name):
    ic = ICONS['icons'].get(name)
    if ic is None: raise KeyError(name)
    w = ic.get('width', SET_W); h = ic.get('height', SET_H)
    return ic['body'], w, h

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
<g transform="translate({tx:.2f},{ty:.2f}) scale({scale:.5f})" fill="{ink}">{body}</g>
</svg>'''
    cairosvg.svg2png(bytestring=svg.encode(), write_to=out_path,
                     output_width=size, output_height=size)

# ---------- 44 lá bài ----------
CARDS = {
  # nâu (19)
  'bang':'gunshot', 'missed':'avoidance', 'beer':'beer-stein', 'saloon':'saloon-doors',
  'stagecoach':'old-wagon', 'wells_fargo':'chest', 'panic':'grab', 'cat_balou':'card-burn',
  'general_store':'shop', 'indians':'tomahawk', 'duel':'duel', 'gatling':'machine-gun',
  'brawl':'brass-knuckles', 'dodge':'dodge', 'punch':'punch', 'rag_time':'banjo',
  'springfield':'musket', 'tequila':'agave', 'whisky':'brandy-bottle',
  # xanh dương (12)
  'volcanic':'luger', 'schofield':'revolver', 'remington':'desert-eagle',
  'rev_carabine':'shotgun', 'winchester':'winchester-rifle', 'barrel':'barrel',
  'scope':'crosshair', 'mustang':'horse-head', 'jail':'imprisoned', 'dynamite':'dynamite',
  'binocular':'binoculars', 'hideout':'cave-entrance',
  # vàng (13)
  'bible':'open-book', 'sombrero':'sombrero', 'ten_gallon_hat':'western-hat',
  'iron_plate':'metal-plate', 'canteen':'water-flask', 'pony_express':'envelope',
  'derringer':'pistol-gun', 'conestoga':'saddle', 'can_can':'large-dress',
  'buffalo_rifle':'rifle', 'knife':'bowie-knife', 'pepperbox':'crossed-pistols',
  'howitzer':'field-gun',
}

# ---------- 34 nhân vật (icon gợi ý KHẢ NĂNG, dễ nhớ hơn chân dung) ----------
CHARS = {
  # 16 gốc
  'jourdonnais':'cellar-barrels', 'black_jack':'card-jack-spades', 'bart_cassidy':'bleeding-heart',
  'el_gringo':'robber-hand', 'paul_regret':'cloaked-figure-on-horseback', 'rose_doolan':'hunter-eyes',
  'vulture_sam':'vulture', 'willy_the_kid':'crossed-pistols', 'slab_the_killer':'heavy-bullets',
  'suzy_lafayette':'open-palm', 'pedro_ramirez':'card-pickup', 'lucky_duke':'coinflip',
  'jesse_jones':'robber', 'kit_carlson':'poker-hand', 'calamity_janet':'body-swapping',
  'sid_ketchum':'healing',
  # 15 Dodge City
  'pixie_pete':'card-pick', 'bill_noface':'domino-mask', 'greg_digger':'hasty-grave',
  'herb_hunter':'target-arrows', 'pat_brennan':'grasping-claws', 'chuck_wengam':'heart-bottle',
  'jose_delgado':'leather-vest', 'sean_mallory':'hand-bag', 'tequila_joe':'beer-bottle',
  'elena_fuente':'ample-dress', 'apache_kid':'feather-necklace', 'doc_holyday':'top-hat',
  'molly_stark':'flower-hat', 'belle_star':'jester-hat', 'vera_custer':'carnival-mask',
  # 3 tự chế (*ex)
  'elena_noir':'hooded-figure', 'marcel_marcelo':'manacles', 'mary_rose':'gun-rose',
}

def fallback(name, alts):
    for a in [name] + alts:
        if a in ICONS['icons']: return a
    return None

missing = []
for card, icon in CARDS.items():
    if icon not in ICONS['icons']: missing.append(('card', card, icon)); continue
    make_png(icon, f'{OUT}/{card}.png')

for cid, icon in CHARS.items():
    if icon not in ICONS['icons']: missing.append(('char', cid, icon)); continue
    make_png(icon, f'{OUT}/characters/{cid}.png',
             ink=INK_CH, bg=PARCH_CH, bg2=PARCH_CH2, border=BORDER_CH)

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
print('cards:', len(CARDS), 'chars:', len(CHARS))
