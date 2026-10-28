"""PET MATCH game logo: three pets on a row of element candies, element-coloured wordmark."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from mm_common import INK, paste, write_svg
from mm_tiles import tile
from mm_monsters import monster
OUT, PREV = sys.argv[1], sys.argv[2]

FONT = {'P': ['XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.', 'XX....', 'XX....', 'XX....'],
        'E': ['XXXXXX', 'XX....', 'XX....', 'XXXXX.', 'XX....', 'XX....', 'XXXXXX'],
        'T': ['XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..'],
        'M': ['XX...XX', 'XXX.XXX', 'XXXXXXX', 'XX.X.XX', 'XX...XX', 'XX...XX', 'XX...XX'],
        'A': ['.XXXX.', 'XX..XX', 'XX..XX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
        'C': ['.XXXX.', 'XX..XX', 'XX....', 'XX....', 'XX....', 'XX..XX', '.XXXX.'],
        'H': ['XX..XX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
        ' ': ['...'] * 7}
ELEM = [('#fd7957', '#eb6b43'), ('#83e9f8', '#3aaef7'), ('#74cca8', '#56a786'), ('#fff1a8', '#fdcf51'), ('#ae65ff', '#935adc')]

def wordmark(text):
    H = 7; body = [[] for _ in range(H)]; owner = [[] for _ in range(H)]; k = 0
    for li, ch in enumerate(text):
        for r in range(H):
            if li: body[r].append('.'); owner[r].append(None)
            body[r] += list(FONT[ch][r]); owner[r] += [k] * len(FONT[ch][r])
        if ch != ' ': k += 1
    bw = len(body[0]); W, Hh = bw + 2, H + 4
    g = [[None] * W for _ in range(Hh)]; f = [[False] * W for _ in range(Hh)]
    for r in range(H):
        for c in range(bw):
            if body[r][c] == 'X':
                light, base = ELEM[owner[r][c] % len(ELEM)]
                g[r + 1][c + 1] = light if r < 3 else base; f[r + 1][c + 1] = True
    for y in range(Hh):
        for x in range(W):
            if not f[y][x] and any(0 <= y+b < Hh and 0 <= x+a < W and f[y+b][x+a] for a in (-1, 0, 1) for b in (-1, 0, 1)): g[y][x] = INK
    for y in range(Hh - 1, 0, -1):
        for x in range(W):
            if g[y][x] is None and (g[y-1][x] is not None or (y >= 2 and g[y-2][x] is not None)): g[y][x] = INK
    return g

def trim(g):
    ys = [y for y, r in enumerate(g) if any(r)]; xs = [x for x in range(len(g[0])) if any(r[x] for r in g)]
    return [r[min(xs):max(xs) + 1] for r in g[min(ys):max(ys) + 1]]

wm = wordmark('PET MATCH')
tiles = [trim(tile(n)) for n in ('fire', 'water', 'earth', 'electric', 'psychic')]
TW = sum(len(t[0]) for t in tiles) + 2 * 4
W = max(len(wm[0]), TW) + 4; H = 80
g = [[None] * W for _ in range(H)]
ty = 42                                                            # candy row
pets = [(trim(monster('water', 1)), -27, 2), (trim(monster('electric', 1)), 27, 2), (trim(monster('fire', 2)), 0, -3)]
for m, dx, dy in pets:                                            # the pets stand just behind the candy row
    paste(g, m, W // 2 + dx - len(m[0]) // 2, ty + 4 - len(m) + dy)
x = (W - TW) // 2
for t in tiles:                                                    # candies in front, fully visible
    paste(g, t, x, ty + (16 - len(t)) // 2 + 1); x += len(t[0]) + 2
paste(g, wm, (W - len(wm[0])) // 2, ty + 22)
logo = trim(g)
os.makedirs(OUT, exist_ok=True)
write_svg(logo, os.path.join(OUT, 'pet-match.svg'), 'PET MATCH', px=8)
s = 6; im = Image.new('RGB', ((len(logo[0]) + 16) * s, (len(logo) + 16) * s), '#274f8f'); d = ImageDraw.Draw(im)
for y, row in enumerate(logo):
    for x, v in enumerate(row):
        if v: d.rectangle([(8 + x) * s, (8 + y) * s, (8 + x) * s + s - 1, (8 + y) * s + s - 1], fill=v)
im.save(PREV); print(len(logo[0]), 'x', len(logo), im.size)
