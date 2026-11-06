"""The ground shadow of the Bankrupt frogs: a soft pixel ellipse (darker core, lighter rim) on a 25 x 9 canvas.
It sits under the 19 x 19 frog (see FrogToken.tsx), 3 art px wider on both sides and 3 below, and shrinks while the
frog is high in its hop."""
import sys, math
sys.path.insert(0, '../scripts')
from pixel import write_svg

W, H = 25, 9
cx, cy, a, b = (W - 1) / 2, (H - 1) / 2, 12.3, 4.3
RIM, CORE = '#10162838', '#10162866'  # navy, ~22 % and ~40 %
g = [[None] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        d = ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2
        if d <= 0.62: g[y][x] = CORE
        elif d <= 1.0: g[y][x] = RIM
out = '../../../../apps/web/src/assets/sprites/bankrupt/frog/shadow-ground.svg'
write_svg(g, out, 'frog ground shadow', px=4)
for r in g: print(''.join('#' if v==CORE else '+' if v==RIM else '.' for v in r))  # look at it (no PIL on the host)
print(open(out).read())
