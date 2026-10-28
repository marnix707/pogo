"""PET MATCH attack effects: element spirit (flies in, circles the matched tiles), charged spirit, trail sparks,
impact burst, damage digits. Writes SVG frames + PNG sprite sheets + the pieces the HTML demo needs."""
import base64, io, json, math, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT, DEMO = sys.argv[1], sys.argv[2]
tmp = os.path.join(DEMO, '_screen'); sys.argv = [sys.argv[0], tmp, os.path.join(DEMO, '_pm')]
import pm_screen as S                                   # rebuilds the screen kit into a temp dir; gives us its pieces
from PIL import Image
from mm_common import INK, render, paste, write_svg

GLOW = S.GLOW
def disc(size): return size / 2

def spirit(el, f, big=False):
    """Element spirit: bright orb + 3 satellites that spin (4-frame loop). No outline, lo-fi like the glow."""
    core, light, base, deep = GLOW[el]; k = 1.45 if big else 1.0
    N = 21 if big else 15; c = N / 2
    g = [[None] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if d < 2.2 * k: g[y][x] = core
            elif d < 3.6 * k: g[y][x] = light
            elif d < 4.8 * k: g[y][x] = base
            elif d < 5.6 * k and (x + y + f) % 2 == 0: g[y][x] = deep
    if el == 'water':                                   # bubble highlight
        g[int(c - 2.5 * k)][int(c - 2 * k)] = '#ffffff'
    for s in range(3):
        a = math.radians(f * 30 + s * 120 + (15 if el == 'psychic' else 0))
        r = 6.3 * k if el != 'psychic' else (5.2 + s * 0.7) * k
        x, y = int(round(c - 0.5 + r * math.cos(a))), int(round(c - 0.5 + r * math.sin(a)))
        tx, ty = int(round(c - 0.5 + r * math.cos(a - 0.45))), int(round(c - 0.5 + r * math.sin(a - 0.45)))
        for (px, py, col) in ((tx, ty, deep), (x, y, light)):
            if 0 <= px < N and 0 <= py < N: g[py][px] = col
        if el == 'electric' and 0 <= x + 1 < N and 0 <= y - 1 < N: g[y - 1][x + 1] = core      # spark kink
        if el == 'earth' and 0 <= x + 1 < N: g[y][x + 1] = base                               # leaf = 2px
        if el == 'fire' and 0 <= y - 1 < N: g[y - 1][x] = core if f % 2 else light            # flicker
    if el == 'fire':                                    # flame tuft on top, flickers
        for i, h in enumerate((1, 3, 2) if f % 2 else (2, 2, 3)):
            for j in range(h):
                yy = int(c - 4.8 * k) - j; xx = int(c - 1.5) + i
                if 0 <= yy < N: g[yy][xx] = light if j < h - 1 else base
    return g

def trail(el, i):
    core, light, base, deep = GLOW[el]
    if i == 0: return [[None, light, None], [light, core, light], [None, light, None]]
    if i == 1: return [[base, base], [base, base]]
    return [[deep]]

def impact(el, f):
    """6-frame hit on the target pet."""
    core, light, base, deep = GLOW[el]; N = 30; c = N / 2
    g = [[None] * N for _ in range(N)]
    rays = [(0, 1.0), (45, 0.7), (90, 1.0), (135, 0.7), (180, 1.0), (225, 0.7), (270, 1.0), (315, 0.7)]
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - c, y + 0.5 - c; d = math.hypot(dx, dy)
            if f == 0 and d < 5: g[y][x] = core if d < 3.5 else light
            if f == 1 and d < 4: g[y][x] = core
            if f in (2, 3):
                r0 = 5.5 + (f - 2) * 3
                if r0 <= d < r0 + (2 if f == 2 else 1.2): g[y][x] = base if f == 2 else deep if (x + y) % 2 else None
            if f == 2 and d < 3: g[y][x] = light
    if f in (1, 2, 3):
        L = [8, 12, 13][f - 1]; s = [4, 6, 10][f - 1]
        for ang, m in rays:
            for t in range(int(s * m), int(L * m) + 1):
                x = int(round(c - 0.5 + t * math.cos(math.radians(ang)))); y = int(round(c - 0.5 + t * math.sin(math.radians(ang))))
                if 0 <= x < N and 0 <= y < N: g[y][x] = core if t < (s + L) / 2 * m else light if f < 3 else base
    if f >= 4:
        for i in range(10):
            a = math.radians(i * 36 + f * 9); r = 10 + (f - 4) * 2.5
            x, y = int(c + r * math.cos(a)), int(c + r * math.sin(a))
            if 0 <= x < N and 0 <= y < N: g[y][x] = light if f == 4 else deep
    return g

DIG = dict(S.FONT); DIG['-'] = ['...', '...', 'XXX', '...', '...']; DIG['+'] = ['...', '.X.', 'XXX', '.X.', '...']
def dmg_glyph(ch, col=('#ff9690', '#fd5f55', '#c14139')):
    rows = [''.join(c * 2 for c in r) for r in DIG[ch] for _ in range(2)]      # 2x chunky (6x10) for punch
    return render(rows, {'X': col})

# ---------- write SVG kit ----------
if os.path.exists(OUT): shutil.rmtree(OUT)
SP_MS, IMP_MS = 70, [40, 50, 60, 60, 70, 80]
meta = {'elements': list(GLOW), 'spirit': {}, 'notes': {}}
for el in GLOW:
    d = os.path.join(OUT, 'attack', el); os.makedirs(d)
    sp = [spirit(el, f) for f in range(4)]; bg = [spirit(el, f, True) for f in range(4)]; im = [impact(el, f) for f in range(6)]
    for f, g in enumerate(sp): write_svg(g, os.path.join(d, f'spirit-{f:02d}.svg'), f'{el} spirit {f}')
    for f, g in enumerate(bg): write_svg(g, os.path.join(d, f'spirit-charged-{f:02d}.svg'), f'{el} charged spirit {f}')
    for f, g in enumerate(im): write_svg(g, os.path.join(d, f'impact-{f:02d}.svg'), f'{el} impact {f}')
    for i in range(3): write_svg(trail(el, i), os.path.join(d, f'trail-{i}.svg'), f'{el} trail spark {i}')
    S.animated_svg(sp, os.path.join(d, 'spirit-animated.svg'), f'{el} spirit (loop)', [SP_MS] * 4)
    S.animated_svg(im, os.path.join(d, 'impact-animated.svg'), f'{el} impact (loop preview)', IMP_MS[:-1] + [600])
dd = os.path.join(OUT, 'damage-digits'); os.makedirs(dd)
for ch, name in [(str(i), str(i)) for i in range(10)] + [('-', 'minus'), ('+', 'plus')]:
    write_svg(dmg_glyph(ch), os.path.join(dd, f'dmg-{name}.svg'), f'damage digit {ch}')
    write_svg(dmg_glyph(ch, ('#e2f7c4', '#a8e063', '#56a786')), os.path.join(dd, f'heal-{name}.svg'), f'heal digit {ch}')

# ---------- demo pieces (PNG data URIs) ----------
def uri(g, s=1):
    h, w = len(g), len(g[0]); im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = im.load()
    for y in range(h):
        for x in range(w):
            v = g[y][x]
            if v: px[x, y] = tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
MATCH = [(2, 1), (2, 2), (2, 3)]
board = [r[:] for r in S.BOARD]
for (r, c) in MATCH: board[r][c] = None
S.BOARD = board
orig_tile = S.tile; S.tile = lambda n: [[None]] if n is None else orig_tile(n)
enemy_el, enemy_st, frac, lab = S.PETS.pop('opponent_front')
bgs = {}
for k in ('forest-valley', 'lava-caverns', 'frost-lake', 'stadium'): bgs[k] = uri(S.mock(k))
ex, ey = S.SLOTS['opponent_front']; em = S.tr(S.monster(enemy_el, enemy_st)); em = [list(reversed(r)) for r in em]
white = [[('#ffffff' if v else None) for v in r] for r in em]
ebar, _ = S.charge_bar(enemy_el, frac, lab)
px, py = S.SLOTS['player_front']
data = {
 'W': S.SW, 'H': S.SH, 'cell': S.CELL, 'bx': S.BX, 'by': S.BY, 'match': MATCH, 'bgs': bgs,
 'enemy': {'img': uri(em), 'white': uri(white), 'x': ex - len(em[0]) // 2, 'y': ey - len(em) + 2, 'w': len(em[0]), 'h': len(em)},
 'ebar': {'img': uri(ebar), 'x': ex - 16, 'y': ey - 4},
 'from': [px + 6, py - 14], 'to': [ex, ey - 12],
 'tiles': {el: uri(orig_tile(el)) for el in ['fire', 'water', 'earth', 'electric', 'psychic']},
 'refill': [uri(orig_tile(e)) for e in ('psychic', 'earth', 'fire')],
 'fx': {el: {'spirit': [uri(spirit(el, f)) for f in range(4)], 'big': [uri(spirit(el, f, True)) for f in range(4)],
             'impact': [uri(impact(el, f)) for f in range(6)], 'trail': [uri(trail(el, i)) for i in range(3)],
             'pulse': [uri(S.pulse(el, t)) for t in range(6)], 'burst': [uri(S.burst(el, t)) for t in range(8)]} for el in ['fire', 'water', 'earth', 'electric', 'psychic']},
 'dmg': {ch: uri(dmg_glyph(ch)) for ch in '-0123456789'},
}
json.dump(data, open(os.path.join(DEMO, 'demo-data.json'), 'w'))
# preview sheet
from mm_common import preview
items = []
for el in ['fire', 'water', 'earth', 'electric', 'psychic', 'gold']:
    items += [spirit(el, f) for f in range(4)] + [spirit(el, 0, True)] + [impact(el, f) for f in range(6)]
preview(items, os.path.join(DEMO, 'attack-sheet.png'), s=5, cols=11, gap=2, bg='#233049')
print('ok')
