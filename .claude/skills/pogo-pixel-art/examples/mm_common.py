"""Shared renderer for the monster-match set: char sprites -> shaded, navy-outlined pixel grids."""
INK = '#101628'

def render(rows, pal, shadow=True, outline=True):
    """rows: strings ('.' = empty, 'K' = navy feature). pal: char -> colour or (light, base, dark) for edge shading."""
    w = max(len(r) for r in rows); rows = [r.ljust(w, '.') for r in rows]; h = len(rows)
    pad = 1 if outline else 0
    W, H = w + 2 * pad, h + 2 * pad + (1 if shadow else 0)
    ch = [['.'] * W for _ in range(H)]
    for y, r in enumerate(rows):
        for x, c in enumerate(r): ch[y + pad][x + pad] = c
    inside = lambda x, y: 0 <= x < W and 0 <= y < H and ch[y][x] != '.'
    g = [[None] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            c = ch[y][x]
            if c == '.': continue
            if c == 'K': g[y][x] = INK; continue
            v = pal[c]
            if isinstance(v, tuple):
                same = lambda xx, yy: 0 <= xx < W and 0 <= yy < H and ch[yy][xx] == c
                light, base, dark = v
                g[y][x] = light if (not same(x, y - 1) or not same(x - 1, y)) and inside(x, y + 1) else \
                          dark if (not same(x, y + 1) or not same(x + 1, y)) else base
            else: g[y][x] = v
    if outline:
        for y in range(H):
            for x in range(W):
                if ch[y][x] == '.' and any(inside(x + a, y + b) for a in (-1, 0, 1) for b in (-1, 0, 1)): g[y][x] = INK
    if shadow:
        for y in range(H - 1, 0, -1):
            for x in range(W):
                if g[y][x] is None and g[y - 1][x] is not None: g[y][x] = INK
    return g

def place(g, size_w, size_h):
    """Centre a sprite in a fixed-size transparent canvas (bottom-aligned if taller content)."""
    out = [[None] * size_w for _ in range(size_h)]
    ox = (size_w - len(g[0])) // 2; oy = (size_h - len(g)) // 2
    for y, r in enumerate(g):
        for x, v in enumerate(r):
            if v and 0 <= oy + y < size_h and 0 <= ox + x < size_w: out[oy + y][ox + x] = v
    return out

def paste(dst, src, x, y):
    for j, r in enumerate(src):
        for i, v in enumerate(r):
            if v is not None and 0 <= y + j < len(dst) and 0 <= x + i < len(dst[0]): dst[y + j][x + i] = v

def write_svg(g, path, title, px=4, bg=None):
    h, w = len(g), len(g[0]); paths = {}
    for y, row in enumerate(g):
        x = 0
        while x < w:
            v = row[x]
            if v is None or v == bg: x += 1; continue
            n = 1
            while x + n < w and row[x + n] == v: n += 1
            paths.setdefault(v, []).append(f'M{x} {y}h{n}v1h-{n}z'); x += n
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*px}" height="{h*px}" shape-rendering="crispEdges" role="img"><title>{title}</title>']
    if bg: out.append(f'<rect width="{w}" height="{h}" fill="{bg}"/>')
    out += [f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in paths.items()] + ['</svg>']
    open(path, 'w').write(''.join(out))

def preview(items, path, s=5, bg='#233049', gap=3, cols=None):
    from PIL import Image, ImageDraw
    cols = cols or len(items); rows = (len(items) + cols - 1) // cols
    cw = max(len(g[0]) for g in items); chh = max(len(g) for g in items)
    W = cols * (cw + gap) + gap; H = rows * (chh + gap) + gap
    im = Image.new('RGB', (W * s, H * s), bg); d = ImageDraw.Draw(im)
    for i, g in enumerate(items):
        ox = gap + (i % cols) * (cw + gap) + (cw - len(g[0])) // 2; oy = gap + (i // cols) * (chh + gap) + (chh - len(g))
        for y, r in enumerate(g):
            for x, v in enumerate(r):
                if v: d.rectangle([(ox+x)*s, (oy+y)*s, (ox+x)*s+s-1, (oy+y)*s+s-1], fill=v)
    im.save(path)
