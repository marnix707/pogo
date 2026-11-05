"""BANKRUPT! art: board icons, buildings, player tokens, the centre landmark and the game logo.
Run:  python3 bk_art.py <out_dir> <preview_dir>   (from this folder; needs Pillow)"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mm_common import INK, render, place, paste, write_svg
OUT, PREV = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
from pixel import png, preview, trim

GOLD = ('#fff4b4', '#fdcf51', '#ea9600'); CREAM = ('#ffffff', '#f7f1e4', '#c9bfa8')
GREY = ('#e1e8f2', '#9fb0c8', '#6a7a94'); RED = ('#ff9a80', '#eb6b43', '#b8402f')
BLUE = ('#a8f1fb', '#3aaef7', '#0061b8'); GREEN = ('#9ee0c0', '#56a786', '#3d7f63')
BROWN = ('#d9a56c', '#9a6a38', '#6a4423'); PURPLE = ('#c79bff', '#935adc', '#6a3fa5')
PINK = ('#ff9fc8', '#e0529a', '#a8346f'); ORANGE = ('#ffd078', '#f59a0b', '#b36f00')
PAL = dict(g=GOLD, c=CREAM, s=GREY, r=RED, b=BLUE, n=GREEN, w=BROWN, p=PURPLE, k=PINK, o=ORANGE, y='#fdcf51', f='#ff5533', t='#83e9f8')
SAVE = {}
def save(name, rows, pal=PAL, canvas=None, **kw):
    g = render(rows, pal, **kw)
    if canvas: g = place(g, *canvas)
    SAVE[name] = g
    write_svg(g, os.path.join(OUT, name + '.svg'), name, px=4)
    return g

# ---- board icons (about 12-14 px, outline added by the renderer) ----
save('icon-start', [
    '.....nn.......',
    '.....nnn......',
    '.....nnnn.....',
    'nnnnnnnnnn....',
    'nnnnnnnnnnn...',
    'nnnnnnnnnnnn..',
    'nnnnnnnnnnn...',
    'nnnnnnnnnn....',
    '.....nnnn.....',
    '.....nnn......',
    '.....nn.......'])
save('icon-jail', [
    '..cccccccccc..',
    '.cccccccccccc.',
    '.cKcKcKcKcKcc.',
    '.cKcKcKcKcKcc.',
    '.cKcKcKcKcKcc.',
    '.cKcKcKcKcKcc.',
    '.cKcKcKcKcKcc.',
    '.cccccccccccc.',
    '.ssssssssssss.'])
save('icon-auction', [
    '.wwwww.......',
    'wwwwwwww.....',
    'wwwwwwww.....',
    '.wwwww.w.....',
    '.......ww....',
    '........ww...',
    '.........ww..',
    '.yyyyyyyyyyy.',
    '.ggggggggggg.'])
save('icon-cards', [
    'pppppppppppp',
    'pppppppppppp',
    'pppccccppppp',
    'ppcccccccppp',
    'pppccpppccpp',
    'pppppppppccp',
    'ppppppppcppp',
    'pppppppcpppp',
    'pppppppcpppp',
    'pppppppppppp',
    'pppppppcpppp',
    'pppppppppppp'])
save('icon-railway', [
    '....KKKK....',
    '....ssss....',
    '..ffffffff..',
    '.ffffffffff.',
    '.fttffffttf.',
    '.fttffffttf.',
    '.ffffyyffff.',
    '.ffffyyffff.',
    '.KKKKKKKKKK.',
    '..ss....ss..'])
save('icon-harbor', [
    '.....oo.......',
    '.....K........',
    '....bK.cc.....',
    '...bbK.ccc....',
    '..bbbK.cccc...',
    '.bbbbK.ccccc..',
    'bbbbbK.cccccc.',
    '.....K........',
    'wwwwwwwwwwwww.',
    '.wwwwwwwwwww..',
    '..rrrrrrrrr...'])
save('icon-airport', [
    '......g.......',
    '.....ccc......',
    '.....ccc......',
    '.....ccc......',
    'ooooocccooooo.',
    '.ooooocccoooo.',
    '......ccc.....',
    '......ccc.....',
    '....ooccoo....',
    '....ooccoo....'])
save('icon-electricity', [
    '...gggggg...',
    '..gggggggg..',
    '.ggcggggggg.',
    '.gcgggggggg.',
    '.gggggggggg.',
    '..gggggggg..',
    '...gggggg...',
    '....ssss....',
    '....ssss....',
    '.....ss.....'])


# ---- luck card icons (about 16 px): money bag, bill, cake, balloons, suitcase, wrench ----
save('card-gain', [
    '.....KKKK.....',
    '......gg......',
    '.....gggg.....',
    '....gggggg....',
    '...gggyyggg...',
    '..ggggyyyggg..',
    '..gggyKKygggg.',
    '..gggyyKyyggg.',
    '..ggggyKKygg..',
    '..gggggyyygg..',
    '...gggyyyggg..',
    '....gggggg....'])
save('card-pay', [
    'nnnnnnnnnnnnnn',
    'nccccnnnnccccn',
    'nccnnnccnnnccn',
    'nncnncnncnncnn',
    'nnnnnccccnnnnn',
    'nncnncnncnncnn',
    'nccnnnccnnnccn',
    'nccccnnnnccccn',
    'nnnnnnnnnnnnnn',
    '.rrrrrrrrrrrr.',
    '..rrrrrrrrrr..'])
save('card-birthday', [
    '.....o..o.....',
    '.....y..y.....',
    '.....c..c.....',
    '...pppppppp...',
    '..pcpcpcpcpp..',
    '..pppppppppp..',
    '..cccccccccc..',
    '.kkkkkkkkkkkk.',
    '.kcckccckcckk.',
    '.kkkkkkkkkkkk.',
    '.wwwwwwwwwwww.'])
save('card-party', [
    '..rrr....bbb..',
    '.rrrrr..bbbbb.',
    '.rcrrr..bcbbb.',
    '.rrrrr..bbbbb.',
    '..rrr....bbb..',
    '...K......K...',
    '....K....K....',
    '..ooo.KK.nnn..',
    '.ooooo..nnnnn.',
    '.ocooo..ncnnn.',
    '.ooooo..nnnnn.',
    '..ooo....nnn..'])
save('card-travel', [
    '......KK......',
    '....wwwwww....',
    '....w....w....',
    '.rrrrrrrrrrrr.',
    '.rcrrrrrrrrcr.',
    '.rrrrrrrrrrrr.',
    '.yyyyyyyyyyyy.',
    '.rrrrrrrrrrrr.',
    '.rrrrrrrrrrrr.',
    '.rrrrrrrrrrrr.',
    '..ss......ss..'])
save('card-repair', [
    '.....ssss.....',
    '....ssssss....',
    '....ss..ss....',
    '....ss..ss....',
    '.....ssss.....',
    '.....ssss.....',
    '......ww......',
    '......ww......',
    '......ww......',
    '......ww......',
    '......ww......',
    '......ww......'])

# ---- a banknote that flies to the player who gets paid ----
save('cash', [
    'nnnnnnnnnnnn',
    'ncccnnnnccnn',
    'nccnncnnnccn',
    'nncnccnncnnn',
    'nnnncncnnccn',
    'ncccnnnnccnn',
    'nnnnnnnnnnnn'])

# ---- buildings (what you can build on a colour set) ----
save('build-house', [
    '....rr....',
    '...rrrr...',
    '..rrrrrr..',
    '.rrrrrrrr.',
    'rrrrrrrrrr',
    '.cccccccc.',
    '.cctccttc.',
    '.cctccttc.',
    '.ccccwwcc.',
    '.ccccwwcc.'])
save('build-shop', [
    'oocooccooc',
    'oocooccooc',
    'oooooooooo',
    '.cccccccc.',
    '.ctttcctt.',
    '.ctttcctt.',
    '.cccwwccc.',
    '.cccwwccc.',
    '.cccwwccc.'])
save('build-hotel', [
    '....bb....',
    '...bbbb...',
    '..bbbbbb..',
    '.bbbbbbbb.',
    '.bttbbttb.',
    '.bttbbttb.',
    '.bbbbbbbb.',
    '.bttbbttb.',
    '.bttbbttb.',
    '.bbbwwbbb.',
    '.bbbwwbbb.'])

# ---- player tokens: a coin disc with a white rim (six colours) ----
import math
def disc(colour, r=5):
    rows = []
    for y in range(-r, r + 1):
        row = ''
        for x in range(-r, r + 1):
            d = math.hypot(x + 0.5 * 0, y)
            row += ('c' if d > r - 1.2 else 'x') if d <= r + 0.2 else '.'
        rows.append(row)
    return rows
TOKENS = {'green': '#3fbf5f', 'yellow': '#fdcf51', 'blue': '#3aaef7', 'red': '#eb4a3f', 'purple': '#935adc', 'orange': '#f59a0b'}
def lighten(h, f):
    r, g, b = [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(min(255, int(v + (255 - v) * f)) for v in (r, g, b))
def darken(h, f):
    r, g, b = [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(int(v * (1 - f)) for v in (r, g, b))
for name, col in TOKENS.items():
    rows = disc(col)
    pal = {'c': CREAM, 'x': (lighten(col, .45), col, darken(col, .3))}
    save('token-' + name, rows, pal)

# ---- the landmark in the middle of the board: a domed bank ----
def landmark():
    W, H = 40, 34
    g = [['.'] * W for _ in range(H)]
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): g[y][x] = c
    # steps and base
    rect(2, 30, 37, 33, 's'); rect(5, 28, 34, 29, 'c')
    # body
    rect(6, 14, 33, 27, 'c')
    # roof triangle (pediment)
    for i in range(7):
        rect(6 + i, 11 + (6 - i) // 1 - 6 + 0, 33 - i, 13 - 0, 'o') if False else None
    for i in range(6):
        rect(8 + i * 2, 8 + (5 - i), 31 - i * 2, 8 + (5 - i), 'o')
    rect(6, 14, 33, 14, 'w')
    # columns
    for cx in (8, 14, 20, 25, 31):
        rect(cx, 15, cx + 1, 27, 's')
    # windows between the columns
    for cx in (10, 16, 22, 27):
        rect(cx, 18, cx + 2, 23, 't')
    # door
    rect(18, 22, 21, 27, 'w')
    # dome
    for y in range(1, 9):
        half = int(round(math.sqrt(max(0, 1 - ((8 - y) / 8.0) ** 2)) * 6)) + 1
        rect(20 - half, y, 19 + half, y, 'y' if y > 2 else 'g')
    rect(19, 0, 20, 1, 'g')
    return [''.join(r) for r in g]
LM_PAL = dict(PAL); LM_PAL['y'] = GOLD; LM_PAL['t'] = ('#c9f4ff', '#83e9f8', '#3aaef7')
save('landmark', landmark(), LM_PAL)

# ---- logo: BANKRUPT! wordmark with coins and a house ----
FONT = {'B': ['XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.'],
        'A': ['.XXXX.', 'XX..XX', 'XX..XX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
        'N': ['XX...XX', 'XXX..XX', 'XXXX.XX', 'XX.XXXX', 'XX..XXX', 'XX...XX', 'XX...XX'],
        'K': ['XX..XX', 'XX.XX.', 'XXXX..', 'XXX...', 'XXXX..', 'XX.XX.', 'XX..XX'],
        'R': ['XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.', 'XXXX..', 'XX.XX.', 'XX..XX'],
        'U': ['XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', '.XXXX.'],
        'P': ['XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.', 'XX....', 'XX....', 'XX....'],
        'T': ['XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..'],
        '!': ['XX', 'XX', 'XX', 'XX', 'XX', '..', 'XX']}
LETTER = [('#fdcf51', '#fda200'), ('#ff9a80', '#eb6b43'), ('#83e9f8', '#3aaef7'), ('#9ee0c0', '#56a786'), ('#c79bff', '#935adc')]
def wordmark(text):
    H = 7; body = [[] for _ in range(H)]; owner = [[] for _ in range(H)]
    for li, ch in enumerate(text):
        for r in range(H):
            if li: body[r].append('.'); owner[r].append(None)
            body[r] += list(FONT[ch][r]); owner[r] += [li] * len(FONT[ch][r])
    bw = len(body[0]); W, Hh = bw + 2, H + 4
    g = [[None] * W for _ in range(Hh)]; f = [[False] * W for _ in range(Hh)]
    for r in range(H):
        for c in range(bw):
            if body[r][c] == 'X':
                light, base = LETTER[owner[r][c] % len(LETTER)]
                g[r + 1][c + 1] = light if r < 3 else base; f[r + 1][c + 1] = True
    for y in range(Hh):
        for x in range(W):
            if not f[y][x] and any(0 <= y + b < Hh and 0 <= x + a < W and f[y + b][x + a] for a in (-1, 0, 1) for b in (-1, 0, 1)): g[y][x] = INK
    for y in range(Hh - 1, 0, -1):
        for x in range(W):
            if g[y][x] is None and (g[y - 1][x] is not None or (y >= 2 and g[y - 2][x] is not None)): g[y][x] = INK
    return g
wm = wordmark('BANKRUPT')
house, shop, hotel = (trim(SAVE[n]) for n in ('build-house', 'build-shop', 'build-hotel'))
coin = trim(SAVE['token-yellow'])
W = max(len(wm[0]), 60) + 4; Hh = 44
g = [[None] * W for _ in range(Hh)]
row = [house, coin, hotel, shop]; gaps = [4, 5, 4]  # (an even width, so the even-width wordmark sits dead centre)
tw = sum(len(t[0]) for t in row) + sum(gaps); x = (W - tw) // 2
for i, t in enumerate(row):
    paste(g, t, x, 2 + (14 - len(t)) // 1 - 2 if len(t) < 14 else 2); x += len(t[0]) + (gaps[i] if i < len(gaps) else 0)
paste(g, wm, (W - len(wm[0])) // 2, 22)
logo = trim(g)
write_svg(logo, os.path.join(OUT, '..', 'brand', 'logos', 'bankrupt.svg') if os.path.isdir(os.path.join(OUT, '..', 'brand', 'logos')) else os.path.join(OUT, 'logo.svg'), 'BANKRUPT', px=8)

json.dump({'note': 'Bankrupt! art: every sprite is a whole-number-scaled pixel SVG (image-rendering: pixelated). Tokens sit centred on their square; buildings and icons are centred in their tile.',
           'sprites': {k: {'w': len(v[0]), 'h': len(v)} for k, v in SAVE.items()}}, open(os.path.join(OUT, 'bankrupt-sprites.json'), 'w'), indent=1)
icons = [SAVE[k] for k in SAVE if k.startswith(('icon-', 'build-', 'card-'))]
preview(icons, os.path.join(PREV, 'icons.png'), s=8, cols=6)
preview([SAVE[k] for k in SAVE if k.startswith('token-')], os.path.join(PREV, 'tokens.png'), s=10, cols=6)
png(SAVE['landmark'], os.path.join(PREV, 'landmark.png'), s=8, bg=(60, 100, 150, 255))
png(logo, os.path.join(PREV, 'logo.png'), s=8, bg=(39, 79, 143, 255))
print('ok', len(logo[0]), 'x', len(logo))
