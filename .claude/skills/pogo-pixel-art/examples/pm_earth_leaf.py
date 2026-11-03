"""Pet Match: the earth badge and charge bars with a real leaf (stem, midrib) instead of a diagonal blob.
Usage: python3 pm_earth_leaf.py <hud dir> [preview.png]. Rewrites only badge-earth / charge-bar-earth(-full)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
from mm_common import INK, render, paste, write_svg
from mm_monsters import INFO
from pixel import png, preview

BAR_W, BAR_H = 30, 7
# 7 x 7 leaf pointing up-right: lime blade with a dark-green edge and a pale midrib, short stem bottom-left
LEAF = ['....DDD',
        '..DDLLD',
        '.DLLWLD',
        '.DLWLLD',
        '.DWLLD.',
        'DDLLD..',
        'D.DD...']

def badge(sym=LEAF, symcol='#ffffff', vein=None):
    el = INFO['earth'][2]
    rows = [list(r) for r in ['..OOOOO..', '.OOOOOOO.', 'OOOOOOOOO', 'OOOOOOOOO', 'OOOOOOOOO', 'OOOOOOOOO', 'OOOOOOOOO', '.OOOOOOO.', '..OOOOO..']]
    for j, r in enumerate(sym):
        for i, c in enumerate(r):
            if c != '.': rows[1 + j][1 + i] = c
    pal = {'O': el, 'W': '#f4ffd6', 'L': '#a8e063', 'D': '#2c5f4a', 'K': INK}
    return render([''.join(r) for r in rows], pal)

def charge_bar(frac=0.0):
    el = INFO['earth'][2]
    b = badge(); W = 6 + BAR_W; H = len(b)
    g = [[None] * W for _ in range(H)]; py = (H - 1 - BAR_H) // 2
    for y in range(BAR_H):
        for x in range(BAR_W):
            if (x in (0, BAR_W - 1)) and (y in (0, BAR_H - 1)): continue
            edge = y in (0, BAR_H - 1) or x in (0, BAR_W - 1)
            g[py + y][6 + x] = INK if edge else '#1b2338'
    fx0, fx1 = 6 + 5, 6 + BAR_W - 1
    for x in range(fx0, fx0 + round((fx1 - fx0) * frac)):
        for y in range(py + 1, py + BAR_H - 1): g[y][x] = el[0] if y == py + 1 else el[1]
    paste(g, b, 0, 0)
    return g

if __name__ == '__main__':
    out = sys.argv[1]
    write_svg(badge(), os.path.join(out, 'badge-earth.svg'), 'earth badge')
    write_svg(charge_bar(), os.path.join(out, 'charge-bar-earth.svg'), 'earth charge bar (empty)')
    write_svg(charge_bar(1.0), os.path.join(out, 'charge-bar-earth-full.svg'), 'earth charge bar (full)')
    if len(sys.argv) > 2: preview([badge(), charge_bar(0.5), charge_bar(1.0)], sys.argv[2], s=12)
