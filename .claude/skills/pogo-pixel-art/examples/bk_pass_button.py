"""Bankrupt buy-card buttons PASS (red) and AUCTION (gold): the buy button's shape with another colour and word
(writes button-pass.svg and button-auction.svg into the city/card folder + PNG previews to the current folder)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bk_rainbow_lib import load, png, D
NAVY = '#101628'
buy = load('button-buy.svg')
H = len(buy); W = len(buy[0])
FONT = {
 'P': ['XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.', 'XX....', 'XX....', 'XX....', 'XX....'],
 'A': ['.XXXX.', 'XX..XX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
 'S': ['.XXXXX', 'XX....', 'XX....', '.XXXX.', '.....XX', '.....XX', '.....XX', 'XXXXX.'],
 'U': ['XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', '.XXXX.'],
 'C': ['.XXXX.', 'XX..XX', 'XX....', 'XX....', 'XX....', 'XX....', 'XX..XX', '.XXXX.'],
 'T': ['XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..'],
 'I': ['XXXX', '.XX.', '.XX.', '.XX.', '.XX.', '.XX.', '.XX.', 'XXXX'],
 'O': ['.XXXX.', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', '.XXXX.'],
 'N': ['XX...XX', 'XXX..XX', 'XXXX.XX', 'XXXXXXX', 'XX.XXXX', 'XX..XXX', 'XX...XX', 'XX...XX'],
}
FONT['S'] = ['.XXXX.', 'XX..XX', 'XX....', '.XXXX.', '....XX', '....XX', 'XX..XX', '.XXXX.']


def cells(word):
    out = []; x = 0
    for ch in word:
        gl = FONT[ch]
        for r, row in enumerate(gl):
            for c, v in enumerate(row):
                if v == 'X': out.append((x + c, r))
        x += len(gl[0]) + 1
    return out, x - 1


def build(word, palette, ink, shadow):
    light, base, dark = palette
    g = [row[:] for row in buy]
    for y in range(1, 19):
        for x in range(1, W - 1):
            g[y][x] = light if y == 1 else dark if y == 18 else base
    cs, tw = cells(word)
    ox = (W - tw) // 2; oy = 5
    if shadow:
        for x, y in cs:
            for dx, dy in ((1, 0), (0, 1), (1, 1)):
                g[oy + y + dy][ox + x + dx] = shadow
    for x, y in cs: g[oy + y][ox + x] = ink
    return g


def svg(g, title):
    by = {}
    for y, row in enumerate(g):
        x = 0
        while x < W:
            c = row[x]
            if c is None: x += 1; continue
            x2 = x
            while x2 < W and row[x2] == c: x2 += 1
            by.setdefault(c, []).append(f'M{x} {y}h{x2 - x}v1h-{x2 - x}z'); x = x2
    paths = ''.join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in by.items())
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W * 4}" height="{H * 4}" shape-rendering="crispEdges" role="img"><title>{title}</title>{paths}</svg>'


if __name__ == '__main__':
    for name, word, pal, ink, sh in (
        ('pass', 'PASS', ('#ff9f8e', '#e8554a', '#a8322c'), '#ffffff', NAVY),
        ('auction', 'AUCTION', ('#fff4b4', '#fdcf51', '#ea9600'), NAVY, '#fff4b4'),
    ):
        g = build(word, pal, ink, sh)
        png(g, f'{name}.png')
        open(D + f'button-{name}.svg', 'w').write(svg(g, f'{name} button'))
    print('ok')
