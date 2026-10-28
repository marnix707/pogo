"""Lo-fi pixel arenas, 160x90 (16:9), each with two battle pads (player front-left, opponent back-right)."""
import math
W, H = 160, 90
PAD_PLAYER = (44, 76, 22, 5)      # cx, cy, rx, ry
PAD_ENEMY = (116, 58, 18, 4)

def h01(*a):
    v = 0
    for x in a: v = (v * 1103515245 + int(x) * 2654435761 + 12345) & 0xffffffff
    v ^= v >> 13; v = (v * 1274126177) & 0xffffffff
    return (v & 0xffff) / 65536

def canvas(c): return [[c] * W for _ in range(H)]
def bands(g, y0, y1, cols, seed=1):
    """Vertical gradient in flat bands with a dithered seam between each pair."""
    n = len(cols); span = (y1 - y0) / n
    for y in range(y0, y1):
        k = (y - y0) / span; i = min(n - 1, int(k)); frac = k - i
        for x in range(W):
            c = cols[i]
            if i + 1 < n and frac > 0.7 and (x + y) % 2 == 0: c = cols[i + 1]
            g[y][x] = c
def ridge(g, base, amp, freqs, col, seed, top_col=None, to=H):
    for x in range(W):
        y = base - sum(a * math.sin(x * f + seed * (i + 1)) for i, (a, f) in enumerate(zip(amp, freqs)))
        yi = int(round(y))
        for yy in range(max(0, yi), to): g[yy][x] = col
        if top_col and 0 <= yi < H: g[yi][x] = top_col
def ellipse(g, cx, cy, rx, ry, col, ring=None, shade=None):
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            if not (0 <= x < W and 0 <= y < H): continue
            d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
            if d <= 1:
                g[y][x] = col
                if ring and d > 0.72: g[y][x] = ring
                if shade and y + 0.5 > cy and d > 0.55: g[y][x] = shade
def pads(g, top, ring, shade, under):
    for (cx, cy, rx, ry) in (PAD_PLAYER, PAD_ENEMY):
        ellipse(g, cx, cy + 1.5, rx + 1, ry + 1, under)                 # ground shadow
        ellipse(g, cx, cy, rx, ry, top, ring, shade)
def pine(g, x, base, h, dark, light):
    for j in range(h):
        w = int((j / h) * (h * 0.35)) + 1
        y = base - h + j
        for i in range(-w, w + 1):
            if 0 <= x + i < W and 0 <= y < H: g[y][x + i] = light if i == -w and j % 3 == 0 else dark
    for j in range(2):
        if 0 <= base + j < H: g[base + j][x] = '#5e4a3a'

def forest():
    g = canvas('#7fb4d8'); bands(g, 0, 40, ['#7fb4d8', '#93c3de', '#a9d6e5', '#c8e6e4'])
    for (x, y) in ((22, 8), (23, 8), (24, 8), (21, 9), (22, 9), (23, 9), (24, 9), (25, 9), (96, 12), (97, 12), (98, 12), (95, 13), (96, 13), (97, 13), (98, 13), (99, 13)):
        g[y][x] = '#f2f6f8'                                             # little clouds
    ridge(g, 34, (4, 2), (0.05, 0.13), '#8bb3a4', 1)
    ridge(g, 42, (3, 2), (0.07, 0.19), '#6b9a8f', 2)
    for i, x in enumerate(range(4, W, 11)):
        pine(g, x + int(h01(x, 3) * 5), 50 + int(h01(x, 4) * 4), 14 + int(h01(x, 5) * 8), '#3f6e5a', '#56a786')
    bands(g, 52, H, ['#74a85a', '#6a9c52', '#5f8f4a'])
    for x in range(W):
        for y in range(54, H):
            if h01(x, y, 7) > 0.93: g[y][x] = '#8fc46e'
            elif h01(x, y, 8) > 0.97: g[y][x] = '#4f7a3e'
    for (x, y) in ((12, 62), (140, 80), (70, 86), (150, 64)):          # flowers
        g[y][x] = '#fda0a5'; g[y - 1][x] = '#fdcf51'
    pads(g, '#c9b27c', '#d9c48f', '#a48447', '#4f7a3e')
    return g

def lava():
    g = canvas('#2c1f2b'); bands(g, 0, 50, ['#1f1620', '#2c1f2b', '#3a2733', '#4a2c35'])
    for x in range(W):                                                 # stalactites
        ln = int(4 + 10 * h01(x // 3, 11) ** 2)
        for y in range(ln): g[y][x] = '#161018'
    ridge(g, 40, (5, 3), (0.06, 0.17), '#241a24', 3)
    for y in range(44, 52):                                            # glowing lava river
        for x in range(W):
            wave = math.sin(x * 0.18 + y) * 1.2
            k = (y - 44 + wave) / 8
            g[y][x] = '#f2dfc0' if 0.35 < k < 0.55 else '#efb16a' if 0.2 < k < 0.75 else '#e07d3e' if 0.05 < k < 0.92 else '#b9472f'
    bands(g, 52, H, ['#3a2f36', '#332a31', '#2c242b'])
    for x in range(W):
        for y in range(52, H):
            if h01(x, y, 17) > 0.95: g[y][x] = '#4f4a55'
            if h01(x, y, 18) > 0.985: g[y][x] = '#b9472f'                # cracks glowing
    for i in range(30):                                                # embers in the air
        x, y = int(h01(i, 1) * W), int(h01(i, 2) * 42) + 6
        g[y][x] = '#efb16a' if i % 3 else '#e07d3e'
    pads(g, '#4f4a55', '#6b6470', '#3a3742', '#161018')
    return g

def frost():
    g = canvas('#bcd9ea'); bands(g, 0, 38, ['#9cc3dc', '#bcd9ea', '#d2e7f1', '#e6f2f7'])
    ridge(g, 32, (10, 4), (0.045, 0.11), '#8fa9c4', 5, '#ffffff', to=50)
    for x in range(W):                                                 # snow caps
        for y in range(H):
            if g[y][x] == '#8fa9c4' and y < 26: g[y][x] = '#f2f6f8' if (x + y) % 3 else '#dfe9f0'
    ridge(g, 40, (3, 2), (0.08, 0.2), '#a9c0d6', 6, to=50)
    for y in range(42, 52):                                            # frozen lake
        for x in range(W): g[y][x] = '#b5e8f2' if (y - 42) < 5 else '#9fd6e8'
    for x in range(0, W, 7):
        for j in range(4):
            xx, yy = x + j, 44 + (j + x // 7) % 6
            if xx < W and yy < 52: g[yy][xx] = '#83c3dc'                 # cracks
    bands(g, 52, H, ['#f2f6f8', '#e6eef3', '#dbe6ee'])
    for x in range(W):
        for y in range(52, H):
            if h01(x, y, 27) > 0.94: g[y][x] = '#cfdde6'
    for i in range(40):                                                # falling snow
        x, y = int(h01(i, 5) * W), int(h01(i, 6) * H)
        if g[y][x] not in ('#f2f6f8',): g[y][x] = '#ffffff'
    pads(g, '#d7f9fc', '#ffffff', '#83c3dc', '#bcd0de')
    return g

def stadium():
    g = canvas('#20325a'); bands(g, 0, 30, ['#141d36', '#1a2747', '#20325a'])
    for i in range(18):
        x, y = int(h01(i, 9) * W), int(h01(i, 10) * 14)
        g[y][x] = '#f2f6f8'                                             # stars
    for x0 in (14, 146):                                               # floodlights
        for y in range(6, 34): g[y][x0] = '#4f6367'
        for j in range(4):
            for i in range(-3, 4): g[3 + j][x0 + i] = '#fff4b4' if j % 2 == 0 else '#fdcf51'
    for y in range(26, 48):                                            # the stands, with a crowd
        for x in range(W):
            row = (y - 26) // 3
            g[y][x] = '#334461' if (y - 26) % 3 else '#233049'
            if (y - 26) % 3 == 1 and h01(x, row, 31) > 0.45:
                g[y][x] = ['#fd5f55', '#fdcf51', '#3aaef7', '#56a786', '#ae65ff', '#f7f1e4'][int(h01(x, row, 32) * 6)]
    for x in range(W): g[48][x] = '#f7f1e4'; g[49][x] = '#101628'      # barrier
    for y in range(50, H):                                             # mowed pitch stripes
        for x in range(W): g[y][x] = '#56a786' if ((x + (y - 50) * 2) // 14) % 2 == 0 else '#4c9877'
    for x in range(W): g[69][x] = '#e9f2ec'                             # halfway line
    pads(g, '#f7f1e4', '#ffffff', '#cfcfcf', '#3f7a62')
    return g

ARENAS = [('forest-valley', 'Forest Valley', forest), ('lava-caverns', 'Lava Caverns', lava),
          ('frost-lake', 'Frost Lake', frost), ('stadium', 'Stadium', stadium)]
