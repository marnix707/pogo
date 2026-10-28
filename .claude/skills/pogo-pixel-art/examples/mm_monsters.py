"""Original monsters: one per element, base form + evolved form, built on a shared round body so they read as one family."""
from mm_common import render, place
INFO = {
 'fire':     ('Embit',  'Blazemaw',  ('#fd7957', '#eb6b43', '#c14139'), '#fdcf51'),
 'water':    ('Puddlo', 'Tidalurk',  ('#83e9f8', '#3aaef7', '#0061b8'), '#d7f9fc'),
 'earth':    ('Sprigg', 'Thornback', ('#74cca8', '#56a786', '#459373'), '#d9b672'),
 'electric': ('Zappip', 'Voltusk',   ('#fff1a8', '#fdcf51', '#ea9600'), '#f7f1e4'),
 'psychic':  ('Mindle', 'Oracull',   ('#ae65ff', '#935adc', '#7d51ae'), '#d7b6ff'),
}
EXTRA = {'F': '#fda200', 'f': '#fdcf51', 'W': '#ffffff', 'p': '#ff9690', 'D': '#0061b8', 'L': ('#a8e063', '#74cca8', '#459373'),
         'S': '#459373', 'r': ('#dcdcdc', '#a6a6a6', '#796e9e'), 'o': '#ff9690', 'g': '#83e9f8', 'h': '#f7f1e4', 'y': '#fff4b4',
         'R': '#fd5f55', 'Y': ('#fff1a8', '#fdcf51', '#ea9600'), 'Z': ('#d7f9fc', '#3aaef7', '#0061b8')}

def monster(el, stage):
    big = stage == 2
    W = H = 30 if big else 24
    g = [['.'] * W for _ in range(H)]
    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H: g[y][x] = c
    def stamp(rows, x0, y0, flip=False):
        for j, r in enumerate(rows):
            for i, c in enumerate(r[::-1] if flip else r):
                if c != '.': put(x0 + i, y0 + j, c)
    cx = W / 2; base_y = H - 2
    rx = 9.6 if big else 7.6; ry = 9.4 if big else 7.4; cy = base_y - ry - 1
    # --- accessories behind the body
    if el == 'fire':
        fl = (['..F...', '..FF..', '.FFF.F', '.FfFFF', 'FFffFF', 'FffffF', '.FffF.'] if not big else
              ['...F.....', '...FF..F.', '..FFF.FF.', '..FFFFFF.', '.FFfFFfFF', '.FFffffFF', 'FFfffffFF', 'FFffyffFF', '.FFfffFF.'])
        stamp(fl, int(cx - len(fl[0]) / 2), int(cy - ry - len(fl) + 3))
        if big:                                                    # flaming tail
            stamp(['..F', '.FF', 'FFf', 'Ffy', 'FFf', '.FF'], int(cx + rx - 1), int(cy + 1))
    if el == 'water':
        fin = ['...D', '..DD', '.DDD', 'DDDD'] if not big else ['....D', '...DD', '..DDD', '.DDDD', 'DDDDD', 'DDDDD']
        stamp(fin, int(cx - 1), int(cy - ry - len(fin) + 2))
        if big:
            stamp(['DD..', 'DDD.', '.DDD'], int(cx - rx - 2), int(cy - 1))
            stamp(['..DD', '.DDD', 'DDD.'], int(cx + rx - 1), int(cy - 1))
    if el == 'earth':
        leaf = ['LL...LL', 'LLL.LLL', '.LLSLL.', '...S...', '...S...'] if not big else \
               ['LLL...LLL', 'LLLL.LLLL', '.LLLSLLL.', '..LLSLL..', '....S....', '....S....']
        stamp(leaf, int(cx - len(leaf[0]) / 2), int(cy - ry - len(leaf) + 2))
        if big:                                                    # rocky back plates
            for k, (dx, dy) in enumerate(((-rx - 1, -2), (rx - 2, -2), (-rx, 3), (rx - 3, 3))):
                stamp(['.rr.', 'rrrr', 'rrrr'], int(cx + dx), int(cy + dy))
    if el == 'electric':                                           # zig-zag lightning crest (+ bolt horns and tail when evolved)
        crest = ['...Z.', '..ZZ.', '.ZZZ.', 'ZZZZZ', '..ZZ.', '.ZZ..'] if not big else \
                ['....Z..', '...ZZ..', '..ZZZ..', '.ZZZZ..', 'ZZZZZZZ', '...ZZZ.', '..ZZZ..', '.ZZ....']
        stamp(crest, int(cx - len(crest[0]) / 2), int(cy - ry - len(crest) + 3))
        if big:
            stamp(['Z.', 'ZZ', '.Z'], int(cx - rx + 1), int(cy - ry + 1))
            stamp(['.Z', 'ZZ', 'Z.'], int(cx + rx - 3), int(cy - ry + 1))
            stamp(['...ZZ', '..ZZ.', '.ZZZZ', '...Z.', '..Z..'], int(cx + rx - 1), int(cy - 2))
    if el == 'psychic':
        stalk_x = int(cx) - (0 if not big else 3)
        for k in range(3): put(stalk_x, int(cy - ry - k), 'K')
        stamp(['.oo.', 'oooo', '.oo.'], stalk_x - 1, int(cy - ry) - 5)
        if big:
            for k in range(3): put(stalk_x + 6, int(cy - ry - k), 'K')
            stamp(['.oo.', 'oooo', '.oo.'], stalk_x + 5, int(cy - ry) - 5)
    # --- body, belly, feet
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1: g[y][x] = 'A'
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / (rx * 0.62)) ** 2 + ((y + 0.5 - (cy + ry * 0.42)) / (ry * 0.5)) ** 2 <= 1 and g[y][x] == 'A': g[y][x] = 'b'
    fw = 3 if not big else 4
    for side in (-1, 1):
        fx = int(cx + side * rx * 0.5 - fw / 2)
        for y in range(int(cy + ry) - 1, base_y + 1):
            for x in range(fx, fx + fw): put(x, y, 'A')
    # --- face
    ew = 3 if not big else 4; ey = int(cy - ry * 0.25)
    for side in (-1, 1):
        ex = int(cx + side * rx * 0.42 - ew / 2)
        for j in range(ew):
            for i in range(ew): put(ex + i, ey + j, 'W')
        px = ex + (ew - 2 if side < 0 else 0)                       # pupils look inward
        for j in range(2):
            for i in range(2): put(px + i, ey + ew - 2 + j, 'K')
        if big:                                                     # determined brows
            for i in range(ew + 1): put(ex - (1 if side < 0 else 0) + i, ey - 1 - ((ew - i) // 2 if side < 0 else i // 2), 'K')
        put(int(cx + side * rx * 0.62), ey + ew, 'p')               # cheeks
        put(int(cx + side * rx * 0.62) - side, ey + ew, 'p')
    my = ey + ew + 1
    mw = 4 if not big else 6
    for i in range(mw): put(int(cx - mw / 2) + i, my, 'K')
    put(int(cx - mw / 2) - 1, my - 1, 'K'); put(int(cx + mw / 2), my - 1, 'K')
    put(int(cx - mw / 2) + 1, my + 1, 'W')                          # little fang
    if big: put(int(cx + mw / 2) - 2, my + 1, 'W')
    if el == 'psychic' and big:                                     # third eye gem
        stamp(['.g.', 'ggg', '.g.'], int(cx) - 1, ey - 3)
    pal = dict(EXTRA); light, base, dark = INFO[el][2]; pal['A'] = (light, base, dark); pal['b'] = INFO[el][3]
    return place(render([''.join(r) for r in g], pal), W + 2, H + 3)
