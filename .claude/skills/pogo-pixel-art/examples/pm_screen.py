"""PET MATCH battle screen (portrait, spaced like the reference): portrait arenas with 4 pads, HUD parts,
7x5 board panel, match-glow animations, and a full phone mock-up."""
import json, math, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from mm_common import INK, render, paste, write_svg
from mm_tiles import tile, CELL
from mm_monsters import INFO, monster
import mm_arenas as A

OUT, PREV = sys.argv[1], sys.argv[2]
AVDIR = '/home/claude/pogo-kit/svg/avatars'

# ---------------- screen layout (art px; show at 3x on a ~420pt-wide phone) ----------------
SW, SH = 140, 304
ARENA_Y, AW, AH = 16, 140, 258                  # arena sits under the status bar and runs to the chat bar
COLS, ROWS = 7, 5
BX, BY = (SW - COLS * CELL) // 2, 170           # first cell, top-left
PANEL = (BX - 2, BY - 2, COLS * CELL + 4, ROWS * CELL + 4)
# pet slots: feet position (screen px); back row higher, front row lower, like the reference
SLOTS = {'player_back': (40, 98), 'player_front': (36, 154), 'opponent_back': (102, 98), 'opponent_front': (106, 154)}

def tr(g):
    ys = [y for y, r in enumerate(g) if any(r)]; xs = [x for x in range(len(g[0])) if any(r[x] for r in g)]
    return [r[min(xs):max(xs) + 1] for r in g[min(ys):max(ys) + 1]]

def blend(under, over):
    """over may be '#rrggbb@aa' (alpha 0-255)."""
    if '@' not in over: return over
    c, a = over.split('@'); a = int(a, 16) / 255
    u = [int(under[i:i + 2], 16) for i in (1, 3, 5)]; o = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(uu * (1 - a) + oo * a):02x}' for uu, oo in zip(u, o))

def paste_a(dst, src, x, y):
    for j, r in enumerate(src):
        for i, v in enumerate(r):
            if v and 0 <= y + j < len(dst) and 0 <= x + i < len(dst[0]): dst[y + j][x + i] = blend(dst[y + j][x + i] or '#000000', v)

def write_svg_a(g, path, title, px=4):
    """Like write_svg, but understands '#rrggbb@aa' colours (written as fill-opacity)."""
    h, w = len(g), len(g[0]); paths = {}
    for y, row in enumerate(g):
        x = 0
        while x < w:
            v = row[x]
            if v is None: x += 1; continue
            n = 1
            while x + n < w and row[x + n] == v: n += 1
            paths.setdefault(v, []).append(f'M{x} {y}h{n}v1h-{n}z'); x += n
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*px}" height="{h*px}" shape-rendering="crispEdges" role="img"><title>{title}</title>']
    for c, d in paths.items():
        if '@' in c: col, a = c.split('@'); out.append(f'<path fill="{col}" fill-opacity="{int(a, 16)/255:.2f}" d="{"".join(d)}"/>')
        else: out.append(f'<path fill="{c}" d="{"".join(d)}"/>')
    open(path, 'w').write(''.join(out) + '</svg>')

def svg_grid(path):
    """Read one of our own pixel SVGs back into a grid."""
    s = open(path).read(); w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', s).groups())
    g = [[None] * w for _ in range(h)]
    for col, d in re.findall(r'<path fill="([^"]+)" d="([^"]+)"', s):
        for x, y, n in re.findall(r'M(\d+) (\d+)h(\d+)', d):
            for i in range(int(n)): g[int(y)][int(x) + i] = col
    return g

# ---------------- portrait arenas ----------------
A.W, A.H = AW, AH                                    # the arena helpers read these module globals
def ay(sy): return sy - ARENA_Y
PADS = {k: (x, ay(y) - 1, 15 if 'back' in k else 17, 3.5 if 'back' in k else 4.5) for k, (x, y) in SLOTS.items()}
def pads4(g, top, ring, shade, under):
    for (cx, cy, rx, ry) in PADS.values():
        A.ellipse(g, cx, cy + 1.5, rx + 1, ry + 1, under); A.ellipse(g, cx, cy, rx, ry, top, ring, shade)
def speckle(g, y0, cols, seed, p):
    for x in range(AW):
        for y in range(y0, AH):
            for i, (c, pp) in enumerate(zip(cols, p)):
                if A.h01(x, y, seed + i) > pp: g[y][x] = c

def forest():
    g = A.canvas('#7fb4d8'); A.bands(g, 0, 52, ['#7fb4d8', '#93c3de', '#a9d6e5', '#c8e6e4'])
    for (cx, cy) in ((24, 30), (104, 38)):
        for i in range(-3, 4): g[cy][cx + i] = '#f2f6f8'
        for i in range(-2, 3): g[cy - 1][cx + i] = '#f2f6f8'
    A.ridge(g, 46, (4, 2), (0.05, 0.13), '#8bb3a4', 1)
    A.ridge(g, 54, (3, 2), (0.07, 0.19), '#6b9a8f', 2)
    for x in range(3, AW, 10):
        A.pine(g, x + int(A.h01(x, 3) * 4), 64 + int(A.h01(x, 4) * 3), 14 + int(A.h01(x, 5) * 9), '#3f6e5a', '#56a786')
    A.bands(g, 66, AH, ['#74a85a', '#6a9c52', '#5f8f4a', '#567f44'])
    speckle(g, 68, ['#8fc46e', '#4f7a3e'], 7, [0.93, 0.97])
    for (x, y) in ((10, 78), (128, 120), (70, 104), (126, 76), (16, 132), (68, 70)): g[y][x] = '#fda0a5'; g[y - 1][x] = '#fdcf51'
    pads4(g, '#c9b27c', '#d9c48f', '#a48447', '#4f7a3e')
    return g

def lava():
    g = A.canvas('#2c1f2b'); A.bands(g, 0, 60, ['#1f1620', '#2c1f2b', '#3a2733', '#4a2c35'])
    for x in range(AW):
        for y in range(int(4 + 12 * A.h01(x // 3, 11) ** 2)): g[y][x] = '#161018'
    A.ridge(g, 50, (5, 3), (0.06, 0.17), '#241a24', 3)
    for y in range(54, 64):
        for x in range(AW):
            k = (y - 54 + math.sin(x * 0.18 + y) * 1.2) / 10
            g[y][x] = '#f2dfc0' if 0.35 < k < 0.55 else '#efb16a' if 0.2 < k < 0.75 else '#e07d3e' if 0.05 < k < 0.92 else '#b9472f'
    A.bands(g, 64, AH, ['#3a2f36', '#332a31', '#2c242b', '#271f26'])
    speckle(g, 64, ['#4f4a55', '#b9472f'], 17, [0.95, 0.985])
    for i in range(34):
        x, y = int(A.h01(i, 1) * AW), int(A.h01(i, 2) * 46) + 8
        g[y][x] = '#efb16a' if i % 3 else '#e07d3e'
    pads4(g, '#4f4a55', '#6b6470', '#3a3742', '#161018')
    return g

def frost():
    g = A.canvas('#bcd9ea'); A.bands(g, 0, 48, ['#9cc3dc', '#bcd9ea', '#d2e7f1', '#e6f2f7'])
    A.ridge(g, 42, (10, 4), (0.05, 0.12), '#8fa9c4', 5, '#ffffff', to=62)
    for x in range(AW):
        for y in range(36):
            if g[y][x] == '#8fa9c4': g[y][x] = '#f2f6f8' if (x + y) % 3 else '#dfe9f0'
    A.ridge(g, 52, (3, 2), (0.08, 0.2), '#a9c0d6', 6, to=62)
    for y in range(54, 64):
        for x in range(AW): g[y][x] = '#b5e8f2' if y < 59 else '#9fd6e8'
    for x in range(0, AW, 7):
        for j in range(4):
            xx, yy = x + j, 56 + (j + x // 7) % 6
            if xx < AW and yy < 64: g[yy][xx] = '#83c3dc'
    A.bands(g, 64, AH, ['#f2f6f8', '#e6eef3', '#dbe6ee', '#d2dfe9'])
    speckle(g, 64, ['#cfdde6'], 27, [0.94])
    for i in range(50):
        x, y = int(A.h01(i, 5) * AW), int(A.h01(i, 6) * AH)
        if g[y][x] != '#f2f6f8': g[y][x] = '#ffffff'
    pads4(g, '#d7f9fc', '#ffffff', '#83c3dc', '#bcd0de')
    return g

def stadium():
    g = A.canvas('#20325a'); A.bands(g, 0, 34, ['#141d36', '#1a2747', '#20325a'])
    for i in range(18): g[int(A.h01(i, 10) * 16) + 4][int(A.h01(i, 9) * AW)] = '#f2f6f8'
    for x0 in (12, 128):
        for y in range(10, 38): g[y][x0] = '#4f6367'
        for j in range(4):
            for i in range(-3, 4): g[7 + j][x0 + i] = '#fff4b4' if j % 2 == 0 else '#fdcf51'
    for y in range(32, 60):
        for x in range(AW):
            row = (y - 32) // 3
            g[y][x] = '#334461' if (y - 32) % 3 else '#233049'
            if (y - 32) % 3 == 1 and A.h01(x, row, 31) > 0.45:
                g[y][x] = ['#fd5f55', '#fdcf51', '#3aaef7', '#56a786', '#ae65ff', '#f7f1e4'][int(A.h01(x, row, 32) * 6)]
    for x in range(AW): g[60][x] = '#f7f1e4'; g[61][x] = '#101628'
    for y in range(62, AH):
        for x in range(AW): g[y][x] = '#56a786' if ((y - 62) // 12) % 2 == 0 else '#4c9877'
    for y in range(62, AH): g[y][AW // 2] = '#e9f2ec'; g[y][AW // 2 - 1] = '#e9f2ec'     # halfway line between the teams
    for a in range(360):
        x, y = int(AW / 2 + 16 * math.cos(math.radians(a))), int(126 + 10 * math.sin(math.radians(a)))
        g[y][x] = '#e9f2ec'
    pads4(g, '#f7f1e4', '#ffffff', '#cfcfcf', '#3f7a62')
    return g

ARENAS = [('forest-valley', 'Forest Valley', forest), ('lava-caverns', 'Lava Caverns', lava),
          ('frost-lake', 'Frost Lake', frost), ('stadium', 'Stadium', stadium)]

# ---------------- HUD parts ----------------
FONT = {'0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'], '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
        '3': ['XXX', '..X', '.XX', '..X', 'XXX'], '4': ['X.X', 'X.X', 'XXX', '..X', '..X'], '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
        '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'], '7': ['XXX', '..X', '.X.', '.X.', '.X.'], '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
        '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'], '/': ['..X', '..X', '.X.', 'X..', 'X..'],
        'A': ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'], 'D': ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'], 'E': ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
        'G': ['XXX', 'X..', 'X.X', 'X.X', 'XXX'], 'H': ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'], 'L': ['X..', 'X..', 'X..', 'X..', 'XXX'],
        'O': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], 'P': ['XXX', 'X.X', 'XXX', 'X..', 'X..'], 'T': ['XXX', '.X.', '.X.', '.X.', '.X.'],
        ' ': ['..', '..', '..', '..', '..']}
def text_rows(s):
    return [''.join(('.' if i else '') + FONT[c][r] for i, c in enumerate(s)) for r in range(5)]
def text(s, col='#f7f1e4', outline=True):
    if outline: return render(text_rows(s), {'X': col})
    return [[col if c == 'X' else None for c in r] for r in text_rows(s)]

HEART = render(['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], {'R': ('#ff9690', '#fd5f55', '#c14139'), 'W': '#ffffff'})
BERRY = render(['..G.G..', '...G...', '.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..'],
               {'R': ('#ff9690', '#e8475f', '#a61a1f'), 'G': '#56a786', 'W': '#ffffff'})
HEALP = render(['.GGG.', 'GGWGG', 'GWWWG', 'GGWGG', '.GGG.'], {'G': ('#a8e063', '#56a786', '#459373'), 'W': '#ffffff'})
def round_btn(sym):
    rows = ['...OOOOO...', '..OOOOOOO..', '.OOOOOOOOO.', 'OOOOOOOOOOO', 'OOOOOOOOOOO', 'OOOOOOOOOOO',
            'OOOOOOOOOOO', 'OOOOOOOOOOO', '.OOOOOOOOO.', '..OOOOOOO..', '...OOOOO...']
    rows = [list(r) for r in rows]
    for j, r in enumerate(sym):
        for i, c in enumerate(r):
            if c == 'W': rows[3 + j][(11 - len(sym[0])) // 2 + i] = 'W'
    return render([''.join(r) for r in rows], {'O': ('#334461', '#233049', '#1b2338'), 'W': '#f7f1e4'})
BACK = round_btn(['..W', '.W.', 'W..', '.W.', '..W'])
MENU = round_btn(['.....', '.....', 'W.W.W', '.....', '.....'])

SYM = {'fire': ['..W..', '.WW..', '.WWW.', 'WWWWW', '.WWW.'], 'water': ['..W..', '.WWW.', 'WWWWW', 'WWWWW', '.WWW.'],
       'earth': ['...WW', '..WWW', '.WWW.', 'WWW..', 'W....'], 'electric': ['...WW', '..WW.', '.WWWW', '..WW.', '.WW..'],
       'psychic': ['.WWW.', 'W...W', 'W.W.W', 'W..W.', '.WW..']}
SYMCOL = {'fire': '#fff4b4', 'water': '#ffffff', 'earth': '#ffffff', 'electric': '#b06a00', 'psychic': '#ffffff'}
def badge(el):
    rows = [list(r) for r in ['..OOOOO..', '.OOOOOOO.', 'OOOOOOOOO', 'OOOOOOOOO', 'OOOOOOOOO', 'OOOOOOOOO', 'OOOOOOOOO', '.OOOOOOO.', '..OOOOO..']]
    for j, r in enumerate(SYM[el]):
        for i, c in enumerate(r):
            if c == 'W': rows[2 + j][2 + i] = 'W'
    return render([''.join(r) for r in rows], {'O': INFO[el][2], 'W': SYMCOL[el]})
BAR_W, BAR_H = 30, 7                                  # pill behind the badge
def charge_bar(el, frac=0.0, label=None):
    b = badge(el); W = 6 + BAR_W; H = len(b)
    g = [[None] * W for _ in range(H)]; py = (H - 1 - BAR_H) // 2
    for y in range(BAR_H):
        for x in range(BAR_W):
            corner = (x in (0, BAR_W - 1)) and (y in (0, BAR_H - 1))
            if corner: continue
            edge = y in (0, BAR_H - 1) or x in (0, BAR_W - 1)
            g[py + y][6 + x] = INK if edge else '#1b2338'
    fx0, fx1 = 6 + 5, 6 + BAR_W - 1                  # fill area (right of the badge)
    for x in range(fx0, fx0 + round((fx1 - fx0) * frac)):
        for y in range(py + 1, py + BAR_H - 1): g[y][x] = INFO[el][2][0] if y == py + 1 else INFO[el][2][1]
    if label:
        t = text(label, '#f7f1e4', outline=False)
        sh = [[INK if v else None for v in r] for r in t]
        paste(g, sh, fx0 + 4, py + 2); paste(g, t, fx0 + 3, py + 1)
    paste(g, b, 0, 0)
    return g, {'fill_x': fx0, 'fill_w': fx1 - fx0, 'fill_y': py + 1, 'fill_h': BAR_H - 2}

def board_panel():
    W, H = PANEL[2], PANEL[3]
    g = [[None] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if (x in (0, W - 1)) and (y in (0, H - 1)): continue
            if y in (0, H - 1) or x in (0, W - 1): g[y][x] = INK + '@d9'; continue
            cx, cy = (x - 2) // CELL, (y - 2) // CELL
            g[y][x] = ('#101628@8c' if (cx + cy) % 2 == 0 else '#233049@8c')
    return g

# ---------------- match glow ----------------
GLOW = {'fire': ('#fff4b4', '#fdcf51', '#fd7957', '#eb6b43'), 'water': ('#ffffff', '#d7f9fc', '#83e9f8', '#3aaef7'),
        'earth': ('#ffffff', '#e2f7c4', '#a8e063', '#74cca8'), 'electric': ('#ffffff', '#fff4b4', '#fff1a8', '#fdcf51'),
        'psychic': ('#ffffff', '#e6d4ff', '#d7b6ff', '#ae65ff'), 'gold': ('#ffffff', '#fff4b4', '#fdcf51', '#fda200')}
GS = 32; GOFF = (GS - CELL) // 2                       # glow canvas, centred on the 18px cell
def n4(dx, dy): return (abs(dx) ** 4 + abs(dy) ** 4) ** 0.25
def ring(g, r, w, pal, dither_outer=False):
    for y in range(GS):
        for x in range(GS):
            d = n4(x + 0.5 - GS / 2, y + 0.5 - GS / 2)
            if r <= d < r + w:
                u = (d - r) / w; c = pal[min(len(pal) - 1, int(u * len(pal)))]
                if dither_outer and u > 0.5 and (x + y) % 2: continue
                g[y][x] = c
def spark(g, cx, cy, size, core, arm):
    cx, cy = int(round(cx)), int(round(cy))
    pts = [(0, 0, core)] + [(dx * k, dy * k, arm) for k in range(1, size + 1) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
    for dx, dy, c in pts:
        if 0 <= cx + dx < GS and 0 <= cy + dy < GS: g[cy + dy][cx + dx] = c
def pulse(el, t):
    """Looping 'this is matched' glow: 6 frames hugging the tile."""
    core, light, base, deep = GLOW[el]; k = [0.2, 0.5, 0.85, 1.0, 0.7, 0.4][t]
    g = [[None] * GS for _ in range(GS)]
    ring(g, 9.6 + 0.8 * k + 1.2 * k, 1.0, [deep], dither_outer=False) if k > 0.45 else None   # soft halo
    ring(g, 8.6, 1.0 + 1.6 * k, [core, light, base] if k > 0.6 else [light, base])
    if k >= 0.85:
        for sx, sy in ((-1, -1), (1, 1)) if t == 2 else ((1, -1), (-1, 1)):
            spark(g, GS / 2 + sx * 11.5, GS / 2 + sy * 11.5, 1, core, light)
    return g
def burst(el, t):
    """One-shot pop when a match clears: 8 frames. Hide the candy from frame 2 on."""
    core, light, base, deep = GLOW[el]; pal = [core, light, base, deep]
    g = [[None] * GS for _ in range(GS)]
    if t == 0:
        for y in range(GS):
            for x in range(GS):
                if n4(x + 0.5 - GS / 2, y + 0.5 - GS / 2) < 8.6 and (x + y) % 2 == 0: g[y][x] = core
    if t == 1:
        for y in range(GS):
            for x in range(GS):
                if n4(x + 0.5 - GS / 2, y + 0.5 - GS / 2) < 6.5 and (x + y) % 2 == 0: g[y][x] = light
    r = 8.4 + t * 0.95; w = max(1.0, 3.2 - t * 0.4); off = min(3, t // 2)
    ring(g, r, w, pal[off:off + 3] or [deep], dither_outer=t >= 4)
    if t >= 7:
        for y in range(GS):
            for x in range(GS):
                if g[y][x] and (x * 3 + y) % 4: g[y][x] = None
    for i in range(8):
        if i % 2 == 1 and t == 0: continue
        a = math.radians(45 * i + 22.5 * (i % 2)); dist = 8.5 + t * 1.0 + (1.2 if i % 2 else 0)
        size = 2 if t < 3 else 1 if t < 6 else 0
        if t == 7 and i % 2: continue
        spark(g, GS / 2 - 0.5 + dist * math.cos(a), GS / 2 - 0.5 + dist * math.sin(a), size, core if t < 5 else light, light if t < 4 else base)
    return g

def animated_svg(frames, path, title, durs, px=3):
    w, h = len(frames[0][0]), len(frames[0]); total = sum(durs)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*px}" height="{h*px}" shape-rendering="crispEdges" role="img"><title>{title}</title>']
    kt, acc = [], 0
    for d in durs: kt.append(acc / total); acc += d
    for i, g in enumerate(frames):
        vals = ';'.join('1' if j == i else '0' for j in range(len(frames)))
        body = {}
        for y, row in enumerate(g):
            x = 0
            while x < w:
                v = row[x]
                if v is None: x += 1; continue
                n = 1
                while x + n < w and row[x + n] == v: n += 1
                body.setdefault(v, []).append(f'M{x} {y}h{n}v1h-{n}z'); x += n
        paths = ''.join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in body.items())
        out.append(f'<g opacity="{1 if i == 0 else 0}"><animate attributeName="opacity" values="{vals}" keyTimes="{";".join(f"{k:.4f}" for k in kt)}" '
                   f'dur="{total/1000:.2f}s" repeatCount="indefinite" calcMode="discrete"/>{paths}</g>')
    open(path, 'w').write(''.join(out) + '</svg>')

# ---------------- write everything ----------------
if os.path.exists(OUT): shutil.rmtree(OUT)
for d in ('arenas-portrait', 'hud', 'board', 'glow'): os.makedirs(os.path.join(OUT, d))
arenas = {}
for key, title, fn in ARENAS:
    arenas[key] = fn(); write_svg(arenas[key], os.path.join(OUT, 'arenas-portrait', f'{key}.svg'), f'{title} (portrait)', px=3)
hud = {'heart': HEART, 'berry': BERRY, 'heal-plus': HEALP, 'button-back': BACK, 'button-menu': MENU}
for k, g in hud.items(): write_svg(g, os.path.join(OUT, 'hud', f'{k}.svg'), k.replace('-', ' '))
bar_meta = None
for el in INFO:
    write_svg(badge(el), os.path.join(OUT, 'hud', f'badge-{el}.svg'), f'{el} badge')
    g, bar_meta = charge_bar(el); write_svg(g, os.path.join(OUT, 'hud', f'charge-bar-{el}.svg'), f'{el} charge bar (empty)')
    g, _ = charge_bar(el, 1.0); write_svg(g, os.path.join(OUT, 'hud', f'charge-bar-{el}-full.svg'), f'{el} charge bar (full)')
write_svg_a(board_panel(), os.path.join(OUT, 'board', 'board-7x5.svg'), 'Board panel 7 by 5 (see-through)')
PULSE_MS, BURST_MS = [90] * 6, [50, 50, 60, 60, 70, 70, 80, 300]
glow = {}
for el in GLOW:
    d = os.path.join(OUT, 'glow', el); os.makedirs(d)
    P = [pulse(el, t) for t in range(6)]; B = [burst(el, t) for t in range(8)]; glow[el] = (P, B)
    for t, g in enumerate(P): write_svg(g, os.path.join(d, f'pulse-{t:02d}.svg'), f'{el} match glow pulse {t}')
    for t, g in enumerate(B): write_svg(g, os.path.join(d, f'burst-{t:02d}.svg'), f'{el} match burst {t}')
    animated_svg(P, os.path.join(d, 'pulse-animated.svg'), f'{el} match glow (loop)', PULSE_MS)
    animated_svg(B, os.path.join(d, 'burst-animated.svg'), f'{el} match burst (loop preview)', BURST_MS[:-1] + [700])

# ---------------- mock-up ----------------
PETS = {'player_back': ('earth', 2, 0.0, '0/6'), 'player_front': ('water', 2, 0.5, '4/8'),
        'opponent_back': ('electric', 2, 0.0, '0/4'), 'opponent_front': ('fire', 1, 0.25, '2/8')}
NAMES = ['fire', 'water', 'earth', 'electric', 'psychic']
BOARD = [['fire', 'psychic', 'earth', 'electric', 'berry', 'earth', 'fire'],
         ['water', 'electric', 'water', 'psychic', 'water', 'electric', 'psychic'],
         ['berry', 'fire', 'fire', 'fire', 'earth', 'electric', 'psychic'],
         ['earth', 'water', 'psychic', 'water', 'earth', 'water', 'electric'],
         ['berry', 'electric', 'psychic', 'earth', 'psychic', 'fire', 'fire']]
MATCH = [(2, 1), (2, 2), (2, 3)]                         # row, col of the glowing match in the preview
def mock(arena_key):
    g = [['#0b0f1c'] * SW for _ in range(SH)]
    paste(g, arenas[arena_key], 0, ARENA_Y)
    for y in range(ARENA_Y + AH, SH):
        for x in range(SW): g[y][x] = '#101628'
    for x in range(48, 92): g[SH - 5][x] = '#4f6367'                       # home indicator
    for key, (el, st, frac, lab) in sorted(PETS.items(), key=lambda kv: 'front' in kv[0]):
        fx, fy = SLOTS[key]; m = tr(monster(el, st))
        if key.startswith('opponent'): m = [list(reversed(r)) for r in m]
        paste(g, m, fx - len(m[0]) // 2, fy - len(m) + 2)
        bar, _ = charge_bar(el, frac, lab); paste(g, bar, fx - 16, fy - 4)
    # HUD
    paste(g, BACK, 2, 20); paste(g, MENU, SW - 13, 20)
    av1 = svg_grid(os.path.join(AVDIR, 'avatar-frog.svg')); av2 = svg_grid(os.path.join(AVDIR, 'avatar-fox.svg'))
    paste(g, av1, 40, 18); paste(g, av2, SW - 62, 18)
    for (x, s, icon, right) in ((16, '0/4', BERRY, False), (SW - 16, '0/4', BERRY, True)):
        t = text(s); w = len(t[0]) + len(icon[0])
        x0 = x if not right else x - w
        (paste(g, t, x0, 20), paste(g, icon, x0 + len(t[0]), 18)) if not right else (paste(g, icon, x0, 18), paste(g, t, x0 + len(icon[0]), 20))
    for (x, s, right) in ((16, '85', False), (SW - 16, '80', True)):
        t = text(s, '#ffffff'); w = len(t[0]) + len(HEART[0])
        x0 = x if not right else x - w
        if right: paste(g, HEART, x0, 30); paste(g, t, x0 + len(HEART[0]), 30)
        else: paste(g, t, x0, 30); paste(g, HEART, x0 + len(t[0]), 30)
    paste(g, text('POGO'), 42, 41); paste(g, text('TOAD'), SW - 60, 41)
    h = text('5 HEAL', '#a8e063'); paste(g, h, 3, 50)
    # board
    paste_a(g, board_panel(), PANEL[0], PANEL[1])
    for r in range(ROWS):
        for c in range(COLS): paste(g, tile(BOARD[r][c]), BX + c * CELL, BY + r * CELL)
    return g

def png(g, path, s=3):
    im = Image.new('RGB', (len(g[0]) * s, len(g) * s)); d = ImageDraw.Draw(im)
    for y, row in enumerate(g):
        for x, v in enumerate(row):
            if v: d.rectangle([x * s, y * s, x * s + s - 1, y * s + s - 1], fill=v)
    im.save(path)
mk = mock('forest-valley'); png(mk, PREV + '-mock.png')
mk2 = mock('lava-caverns')
for (r, c) in MATCH: paste(mk2, glow['fire'][1][3], BX + c * CELL - GOFF, BY + r * CELL - GOFF)
png(mk2, PREV + '-mock2.png')
from mm_common import preview
preview([arenas[k] for k, _, _ in ARENAS], PREV + '-arenas.png', s=2, cols=4, gap=4)
rows = []
for el in GLOW:
    P, B = glow[el]
    rows += [p for p in P] + [b for b in B]
preview(rows, PREV + '-glow.png', s=4, cols=14, gap=2, bg='#233049')
hudp = [HEART, BERRY, HEALP, BACK, MENU] + [badge(e) for e in INFO] + [charge_bar(e, 0.5, '3/6')[0] for e in INFO]
preview(hudp, PREV + '-hud.png', s=6, cols=10, gap=3)

meta = {
 'screen': {'size': [SW, SH], 'scale_note': 'Art px. Show at a whole-number scale (3x on a ~420pt-wide phone) with image-rendering: pixelated.',
            'status_bar': [0, ARENA_Y], 'arena': {'x': 0, 'y': ARENA_Y, 'w': AW, 'h': AH}, 'bottom_bar_y': ARENA_Y + AH},
 'arenas': {k: f'arenas-portrait/{k}.svg' for k, _, _ in ARENAS},
 'pets': {k: {'feet_x': x, 'feet_y': y, 'note': 'bottom-centre of the pet sprite sits 2px below this point; opponents are mirrored to face left'} for k, (x, y) in SLOTS.items()},
 'charge_bar': {'files': 'hud/charge-bar-<element>.svg (+ -full)', 'size': [6 + BAR_W, len(badge('fire'))],
                'place': 'top-left at (feet_x - 16, feet_y - 4)', 'fill_rect': bar_meta,
                'fill_colours': {el: {'top_row': INFO[el][2][0], 'rest': INFO[el][2][1]} for el in INFO},
                'text': 'draw the count (e.g. "0/6") inside the pill, starting at fill_x + 3, in #f7f1e4'},
 'board': {'cols': COLS, 'rows': ROWS, 'cell': CELL, 'first_cell': [BX, BY], 'panel': {'file': 'board/board-7x5.svg', 'x': PANEL[0], 'y': PANEL[1]},
           'note': 'Panel is see-through (fill-opacity) so the arena shows behind the board, like the reference.'},
 'hud': {'back_button': [2, 20], 'menu_button': [SW - 13, 20], 'player_avatar': [40, 18], 'opponent_avatar': [SW - 62, 18],
         'player_stats_x': 16, 'opponent_stats_right_x': SW - 16, 'berries_y': 20, 'hp_y': 30, 'names_y': 41, 'heal_label': [3, 50],
         'icons': {k: f'hud/{k}.svg' for k in hud}},
 'glow': {'size': [GS, GS], 'offset_from_cell': [-GOFF, -GOFF],
          'colours': list(GLOW), 'colour_note': 'one set per element; "gold" for berries/specials',
          'pulse': {'frames': 'glow/<colour>/pulse-00..05.svg', 'ms_per_frame': PULSE_MS, 'loop': True,
                    'use': 'while candies are lined up / being matched; draw above the board, around the candy'},
          'burst': {'frames': 'glow/<colour>/burst-00..07.svg', 'ms_per_frame': BURST_MS, 'loop': False,
                    'use': 'when a match clears; hide the candy from frame 2 on, then let new candies fall in'},
          'animated': 'glow/<colour>/pulse-animated.svg and burst-animated.svg loop by themselves (handy for previews)'},
}
json.dump(meta, open(os.path.join(OUT, 'pet-match-screen.json'), 'w'), indent=1)
print('ok')
