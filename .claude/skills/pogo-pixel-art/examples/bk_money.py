"""Bankrupt money pile: bundles of bills (writes bankrupt/money/bundle-*.svg and pile.json).
The pile is simulated here with a fixed seed (bundles are dropped one by one and roll down to rest), so the screen only
draws the first N bundles of the list: more cash = more bundles on top, the same pile every time.
  python bk_money.py            -> sprites + pile.json
  python bk_money.py preview X  -> preview PNG at several cash amounts into X (a folder)"""
import sys, os, json, random
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
from pixel import render, write_svg, png

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../apps/web/src/assets/sprites/bankrupt/money')
W = 290          # the screen's width in art px
MAX_H = 330      # tallest pile we ever draw (art px)

# top face, front face, end face, paper band
PAL = {
    'T': '#9ee0c0', 't': '#7fcaa6', 'F': '#56a786', 'f': '#459373', 'S': '#3d7f63',
    'B': '#fff4b4', 'b': '#fdcf51', 'P': '#c9bfa8',
}


def slab(L, slope, tone=0):
    """A bundle lying down seen from the front-above: top face (3 rows), front face (2 rows), a band round the middle.
    slope: rows the bundle climbs per column (sheared, never rotated)."""
    cols = L
    off = [round(x * slope) for x in range(cols)]
    lo = min(off)
    off = [o - lo for o in off]
    h = max(off) + 5 + 1
    grid = [['.'] * (cols + 2) for _ in range(h)]
    bx = cols // 2 - 1
    for x in range(cols):
        y0 = off[x]
        band = bx <= x < bx + 2
        for r in range(3):  # top face
            c = 'B' if band else ('t' if (x + r * 2 + tone) % 5 == 0 else 'T')
            grid[y0 + r][x] = c
        for r in range(3, 5):  # front face
            c = 'b' if band else ('P' if r == 3 and (x + tone) % 4 == 0 else 'F')
            grid[y0 + r][x] = c
    for e in range(2):  # the end of the bundle: the pages
        x = cols + e
        y0 = off[cols - 1] - e + (1 if slope > 0 else 0)
        y0 = max(0, y0)
        for r in range(0, 5):
            if y0 + r + 1 < h:
                grid[y0 + r + 1][x] = 'S' if e == 1 else 'f'
    return [''.join(r) for r in grid]


def standing(tone=0):
    """A bundle on its edge: the narrow front, band across."""
    rows = []
    for r in range(10):
        row = ''
        for x in range(6):
            if r < 2:
                c = 'T'
            elif r in (5, 6):
                c = 'b' if r == 6 else 'B'
            else:
                c = 'P' if (r + x + tone) % 6 == 0 else 'F'
            row += c
        row += 'S'
        rows.append(row)
    return rows


SPRITES = {
    'flat-a': slab(13, 0, 0),
    'flat-b': slab(11, 0, 2),
    'rise': slab(12, -0.25, 1),
    'fall': slab(12, 0.25, 3),
    'steep-rise': slab(11, -0.5, 0),
    'steep-fall': slab(11, 0.5, 2),
    'stand': standing(1),
}
WEIGHT = {'flat-a': 5, 'flat-b': 4, 'rise': 3, 'fall': 3, 'steep-rise': 1, 'steep-fall': 1, 'stand': 1}


def make():
    return {k: render(v, PAL, shadow=False) for k, v in SPRITES.items()}


def profile(g):
    """Per column: the empty rows under the bundle (from its bottom) and its height above the floor."""
    h, w = len(g), len(g[0])
    low, high = [], []
    for x in range(w):
        ys = [y for y in range(h) if g[y][x]]
        low.append(h - 1 - max(ys) if ys else 99)
        high.append(h - min(ys) if ys else 0)
    return low, high


def simulate(sprites, n_max=9000, seed=7):
    rnd = random.Random(seed)
    names = list(sprites)
    weights = [WEIGHT[n] for n in names]
    prof = {n: profile(sprites[n]) for n in names}
    hm = [0] * W                      # surface height per column (y up)
    out, maxh = [], []
    top = 0
    for _ in range(n_max):
        name = rnd.choices(names, weights)[0]
        g = sprites[name]
        w, h = len(g[0]), len(g)
        low, high = prof[name]

        def rest(x):
            tot = 0
            for i in range(w):
                cx = x + i
                col = hm[cx] if 0 <= cx < W else 0
                tot += col - low[i]
            # sink into the heap: the bundles lie on the average surface and overlap what is under them
            return max(0, tot // w - 2)

        spread = 40 + top * 0.55
        x = int(rnd.gauss(W / 2, spread)) - w // 2
        x = max(-w // 3, min(W - w + w // 3, x))
        for _ in range(60):               # roll downhill
            here = rest(x)
            l = rest(x - 2) if x - 2 > -w // 3 else 10 ** 9
            r = rest(x + 2) if x + 2 < W - w + w // 3 else 10 ** 9
            if min(l, r) < here - 2:
                x += -2 if l < r else 2
            else:
                break
        y = rest(x)
        for i in range(w):
            cx = x + i
            if 0 <= cx < W:
                hm[cx] = max(hm[cx], y + high[i])
        top = max(top, y + h)
        out.append([names.index(name), x, y])   # y: the bundle's bottom, up from the floor
        maxh.append(top)
        if top > MAX_H:
            break
    return names, out, maxh


def draw_pile(sprites, names, bundles, count, height, bg='#274f8f'):
    """A preview of the first `count` bundles: floor-up pixel grid, W wide, `height` tall."""
    grid = [[None] * W for _ in range(height)]
    for k in range(count):
        s, x, y = bundles[k]
        g = sprites[names[s]]
        top = height - y - len(g)
        for j, row in enumerate(g):
            for i, v in enumerate(row):
                xx, yy = x + i, top + j
                if v and 0 <= xx < W and 0 <= yy < height:
                    grid[yy][xx] = v
    return grid


if __name__ == '__main__':
    sp = make()
    names, bundles, maxh = simulate(sp)
    if len(sys.argv) > 2 and sys.argv[1] == 'preview':
        d = sys.argv[2]
        os.makedirs(d, exist_ok=True)
        # the sprites, big
        from pixel import preview
        preview([sp[n] for n in names], os.path.join(d, 'sprites.png'), s=10, cols=len(names))
        # the pile at a few cash amounts; 2000 = the button, 116 art px from the bottom
        BTN = 116
        from PIL import Image, ImageDraw
        sheets = []
        for cash in (500, 1000, 1500, 2000, 3000, 5000):
            hgt = cash / 2000 * BTN
            n = next((k for k, m in enumerate(maxh) if m >= hgt), len(maxh))
            g = draw_pile(sp, names, bundles, n, 260)
            im = Image.new('RGB', (W * 3, 260 * 3), '#274f8f')
            dr = ImageDraw.Draw(im)
            for y, row in enumerate(g):
                for x, v in enumerate(row):
                    if v:
                        dr.rectangle([x * 3, y * 3, x * 3 + 2, y * 3 + 2], fill=v)
            ybtn = (260 - BTN) * 3
            dr.line([(0, ybtn), (W * 3, ybtn)], fill='#fda200', width=2)
            dr.text((6, 6), f'${cash}  bundles {n}  h {int(hgt)}', fill='#ffffff')
            sheets.append(im)
        total = Image.new('RGB', (W * 3 * 3 + 20, 260 * 3 * 2 + 10), '#101628')
        for i, im in enumerate(sheets):
            total.paste(im, ((i % 3) * (W * 3 + 10), (i // 3) * (260 * 3 + 10)))
        total.save(os.path.join(d, 'pile.png'))
        print(len(bundles), 'bundles up to', maxh[-1])
    else:
        os.makedirs(OUT, exist_ok=True)
        for n in names:
            write_svg(sp[n], os.path.join(OUT, f'bundle-{n}.svg'), f'cash bundle {n}')
        meta = {
            'width': W,
            'maxHeight': MAX_H,
            'sprites': [{'name': n, 'w': len(sp[n][0]), 'h': len(sp[n]), 'high': profile(sp[n])[1]} for n in names],
            'note': 'bundles: [sprite index, x, y]: x from the left, y up from the bottom edge to the bundle bottom, in art px. '
                    'heights[k] = the height of the pile after k+1 bundles.',
            'bundles': bundles,
            'heights': maxh,
        }
        json.dump(meta, open(os.path.join(OUT, 'pile.json'), 'w'), separators=(',', ':'))
        print(len(bundles), 'bundles', os.path.getsize(os.path.join(OUT, 'pile.json')), 'bytes')
