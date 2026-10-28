"""Lo-fi pixel fire: soft blobby flames in muted tones, ragged edges, specks; rising noise that loops seamlessly."""
import json, math, os, re, shutil, sys
from PIL import Image, ImageDraw
OUT = sys.argv[1]; PREV = sys.argv[2]; CARD = sys.argv[3]
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)
N = 8
CORE, LIGHT, MID, DARK, DEEP = '#f2dfc0', '#efb16a', '#e07d3e', '#b9472f', '#8c2d27'

def h01(*a):
    v = 0
    for x in a: v = (v * 1103515245 + int(x) * 2654435761 + 12345) & 0xffffffff
    v ^= v >> 13; v = (v * 1274126177) & 0xffffffff
    return (v & 0xffff) / 65536

def vnoise(x, y, px, py, seed):
    """Smooth value noise, periodic with period px (x) and py (y) in grid cells."""
    x0, y0 = math.floor(x), math.floor(y); fx, fy = x - x0, y - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    v = lambda i, j: h01(i % px, j % py, seed)
    a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx
    b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx
    return a + (b - a) * sy

def shade(heat, x, y, t, seed):
    if heat > 0.74: return CORE
    if heat > 0.58: return LIGHT
    if heat > 0.40: return MID
    if heat > 0.24: return DARK
    if heat > 0.12: return DEEP
    if heat > -0.12 and h01(x, y, t, seed) > 0.90: return DARK if heat > 0.05 else DEEP    # loose specks
    return None

def field(W, H, heat_fn, t, seed, xper):
    g = [[None] * W for _ in range(H)]
    rise = 8 * t / N                                            # noise scrolls up one full period per loop
    for yy in range(H):
        y = H - 1 - yy                                          # y = height above the base
        for x in range(W):
            n = (vnoise(x / 4, (y - rise * 4) / 4, max(1, W // 4), 8, seed) * 0.65
                 + vnoise(x / 2, (y - rise * 4) / 2, max(1, W // 2), 16, seed + 1) * 0.35)
            g[yy][x] = shade(heat_fn(x + 0.5, y + 0.5, t) + (n - 0.5) * 0.62, x, y, t, seed)
    return g

def teardrop(x, y, cx, R, Ht):
    """Heat of a rounded, flat-bottomed teardrop: full round body of radius R, soft dome tip at height Ht."""
    yc = R * 0.85
    if y <= yc: d = abs(x - cx) / R
    else:
        v = min(1.0, (y - yc) / (Ht - yc)); wy = R * max(0.0, 1 - v) ** 0.6
        d = 9.0 if wy <= 0.05 else math.hypot(abs(x - cx) / wy, v * 0.9)
    return 1.05 - d * 1.0 - (y / (Ht * 3.2))

# ---------- single flame: 18 x 24, flat base ----------
FW, FH = 18, 24
def flame_heat(x, y, t):
    a = 2 * math.pi * t / N
    sway = 1.2 * math.sin(a + y * 0.3) * (y / FH)
    main = teardrop(x, y, FW / 2 + sway, 8.0, 22.5 + 1.2 * math.sin(a))
    lick_l = teardrop(x, y, FW / 2 - 4.5 + sway * 0.6, 3.2, 16.0 + 1.8 * math.sin(a + 2))     # side tongues
    lick_r = teardrop(x, y, FW / 2 + 4.0 + sway * 0.6, 3.0, 18.0 + 1.8 * math.sin(a + 4))
    return max(main, lick_l - 0.08, lick_r - 0.08)

# ---------- long strip: 32 x 14, tiles left-to-right, flat base ----------
SW, SH = 32, 14
def strip_heat(x, y, t):
    a = 2 * math.pi * t / N
    best = 0.95 - y / 2.6                                       # low glowing band along the base
    for i, (c0, h0, k, ph) in enumerate(TONGUES):
        c = c0 + 0.8 * math.sin(k * a + ph)
        dx = (x - c + SW / 2) % SW - SW / 2                     # wrap so the strip tiles
        hh = h0 * (1 + 0.14 * math.sin(k * a + ph + 1.3))
        best = max(best, teardrop(dx, y, 0, 3.6 + 0.4 * (h0 > 9.5), hh))
    return best
TONGUES = [(3, 10.5, 1, 0.0), (9.5, 7.5, 2, 1.7), (15.5, 11.5, 1, 3.1), (22, 8.0, 3, 0.6), (27.5, 10.0, 2, 2.4)]

def write_svg(g, path, title, px=4):
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
    out += [f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in paths.items()] + ['</svg>']
    open(path, 'w').write(''.join(out))

def flatten_base(g, W, H, heat_fn, t):
    for x in range(W):                                          # solid bottom row where the fire touches the base
        if heat_fn(x + 0.5, 0.5, t) > 0.3 and g[H - 1][x] is None: g[H - 1][x] = DEEP
    return g

F = [flatten_base(field(FW, FH, flame_heat, t, 11, FW), FW, FH, flame_heat, t) for t in range(N)]
ST = [flatten_base(field(SW, SH, strip_heat, t, 23, SW), SW, SH, strip_heat, t) for t in range(N)]
for t in range(N):
    write_svg(F[t], os.path.join(OUT, f'fire-lofi-flame-{t:02d}.svg'), f'Lo-fi fire flame frame {t}')
    write_svg(ST[t], os.path.join(OUT, f'fire-lofi-strip-{t:02d}.svg'), f'Lo-fi fire strip frame {t}')
json.dump({'ms_per_frame': 100, 'loop': True, 'frames': N,
           'flame': {'w': FW, 'h': FH, 'files': [f'fire-lofi-flame-{t:02d}.svg' for t in range(N)]},
           'strip': {'w': SW, 'h': SH, 'files': [f'fire-lofi-strip-{t:02d}.svg' for t in range(N)],
                     'tiling': 'Seamless left-to-right: repeat side by side for any length.'},
           'palette': [CORE, LIGHT, MID, DARK, DEEP], 'anchor': 'bottom edge = flat base'},
          open(os.path.join(OUT, 'fire-lofi.json'), 'w'), indent=1)

# ---------- previews ----------
def load(path):
    t = open(path).read(); w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', t).groups())
    g = [[None] * w for _ in range(h)]
    for c, d in re.findall(r'<path fill="(#\w+)" d="([^"]+)"', t):
        for x, y, n in re.findall(r'M(\d+) (\d+)h(\d+)', d):
            for k in range(int(n)): g[int(y)][int(x) + k] = c
    return g
rot = lambda g: [list(r) for r in zip(*g[::-1])]
tiled = lambda g, L: [[r[x % len(r)] for x in range(L)] for r in g]
card = load(CARD); CW, CH = len(card[0]), len(card)
S = 5; M = SH
def scene(t):
    W = CW + 2 * M + 3 * (FW + 4) + 4; H = CH + 2 * M + 4
    im = Image.new('RGB', (W * S, H * S), '#141823'); d = ImageDraw.Draw(im)
    def blit(g, ox, oy):
        for y, r in enumerate(g):
            for x, v in enumerate(r):
                if v: d.rectangle([(ox+x)*S, (oy+y)*S, (ox+x)*S+S-1, (oy+y)*S+S-1], fill=v)
    ox, oy = 2, 2
    blit(tiled(ST[t], CW), ox + M, oy); blit(rot(rot(tiled(ST[(t + 3) % N], CW))), ox + M, oy + M + CH)
    blit(rot(tiled(ST[(t + 5) % N], CH)), ox + M + CW, oy + M); blit(rot(rot(rot(tiled(ST[(t + 2) % N], CH)))), ox, oy + M)
    blit(card, ox + M, oy + M)
    for i in range(3):
        blit(F[(t + i * 3) % N], ox + CW + 2 * M + 4 + i * (FW + 4), oy + M + CH - FH)
    return im
fr = [scene(t) for t in range(N)] * 3
fr[0].save(PREV, save_all=True, append_images=fr[1:], duration=100, loop=0)
LONG = 96
ls = []
for t in range(N):
    im = Image.new('RGB', ((LONG + 4) * S, (SH + 4) * S), '#141823'); d = ImageDraw.Draw(im)
    for y, r in enumerate(tiled(ST[t], LONG)):
        for x, v in enumerate(r):
            if v: d.rectangle([(2+x)*S, (2+y)*S, (2+x)*S+S-1, (2+y)*S+S-1], fill=v)
    ls.append(im)
(ls * 3)[0].save(PREV.replace('.gif', '-strip.gif'), save_all=True, append_images=(ls * 3)[1:], duration=100, loop=0)
print('flame', FW, 'x', FH, '| strip', SW, 'x', SH)
