#!/usr/bin/env python3
"""Generate apps/web/public/topo.svg: a topographic contour map (marching squares over a random
height field). Deterministic: same seed, same map. Run: python3 scripts/gen-topo.py"""
import math
import random

random.seed(11)
W, H, CELL = 900, 1600, 10
NX, NY = W // CELL + 1, H // CELL + 1
LEVELS = 16

blobs = [
    (random.uniform(0, W), random.uniform(0, H), random.uniform(120, 280), random.uniform(-1, 1))
    for _ in range(24)
]


def height(x, y):
    v = sum(a * math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)) for cx, cy, s, a in blobs)
    return v + 0.18 * math.sin(x / 170 + 1.3) * math.cos(y / 210) + 0.07 * math.sin((x + y) / 60)


grid = [[height(i * CELL, j * CELL) for i in range(NX)] for j in range(NY)]
flat = [v for row in grid for v in row]
lo, hi = min(flat), max(flat)
levels = [lo + (hi - lo) * (k + 1) / (LEVELS + 1) for k in range(LEVELS)]

# Edge keys: ('h', i, j) joins grid points (i,j)-(i+1,j); ('v', i, j) joins (i,j)-(i,j+1).
TABLE = {
    1: [("L", "T")], 2: [("T", "R")], 3: [("L", "R")], 4: [("R", "B")],
    6: [("T", "B")], 7: [("L", "B")], 8: [("L", "B")], 9: [("T", "B")],
    11: [("R", "B")], 12: [("L", "R")], 13: [("T", "R")], 14: [("L", "T")],
}


def edge_key(side, i, j):
    return {"T": ("h", i, j), "B": ("h", i, j + 1), "L": ("v", i, j), "R": ("v", i + 1, j)}[side]


def point(key, level):
    kind, i, j = key
    if kind == "h":
        v1, v2 = grid[j][i], grid[j][i + 1]
        t = (level - v1) / (v2 - v1)
        return ((i + t) * CELL, j * CELL)
    v1, v2 = grid[j][i], grid[j + 1][i]
    t = (level - v1) / (v2 - v1)
    return (i * CELL, (j + t) * CELL)


def segments(level):
    segs = []
    for j in range(NY - 1):
        for i in range(NX - 1):
            a, b = grid[j][i] >= level, grid[j][i + 1] >= level
            c, d = grid[j + 1][i + 1] >= level, grid[j + 1][i] >= level
            case = a * 1 + b * 2 + c * 4 + d * 8
            if case in (0, 15):
                continue
            if case in (5, 10):
                centre = (grid[j][i] + grid[j][i + 1] + grid[j + 1][i + 1] + grid[j + 1][i]) / 4
                inside = centre >= level
                if case == 5:
                    pairs = [("T", "R"), ("L", "B")] if inside else [("L", "T"), ("R", "B")]
                else:
                    pairs = [("L", "T"), ("R", "B")] if inside else [("T", "R"), ("L", "B")]
            else:
                pairs = TABLE[case]
            for s1, s2 in pairs:
                segs.append((edge_key(s1, i, j), edge_key(s2, i, j)))
    return segs


def chain(segs):
    by_end = {}
    for n, (p, q) in enumerate(segs):
        by_end.setdefault(p, []).append(n)
        by_end.setdefault(q, []).append(n)
    used = [False] * len(segs)
    lines = []

    def extend(line):
        while True:
            for n in by_end.get(line[-1], []):
                if used[n]:
                    continue
                used[n] = True
                p, q = segs[n]
                line.append(q if p == line[-1] else p)
                break
            else:
                return

    for n, (p, q) in enumerate(segs):
        if used[n]:
            continue
        used[n] = True
        line = [p, q]
        extend(line)
        line.reverse()
        if line[0] != line[-1]:
            extend(line)
        lines.append(line)
    return lines


def chaikin(pts, closed):
    out = []
    n = len(pts)
    rng = range(n) if closed else range(n - 1)
    if not closed:
        out.append(pts[0])
    for i in rng:
        p, q = pts[i], pts[(i + 1) % n]
        out.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
        out.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
    if not closed:
        out.append(pts[-1])
    return out


def path_data(lines, level):
    parts = []
    for line in lines:
        closed = line[0] == line[-1]
        pts = [point(k, level) for k in (line[:-1] if closed else line)]
        if len(pts) < 3:
            continue
        pts = chaikin(pts, closed)
        d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
        parts.append(d + (" Z" if closed else ""))
    return " ".join(parts)


thin, thick = [], []
for k, level in enumerate(levels):
    d = path_data(chain(segments(level)), level)
    (thick if k % 4 == 0 else thin).append(d)

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
    f'<g fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round">'
    f'<path stroke-width="1.3" d="{" ".join(thin)}"/>'
    f'<path stroke-width="2.6" d="{" ".join(thick)}"/></g></svg>\n'
)
open("apps/web/public/topo.svg", "w").write(svg)
print(f"topo.svg: {len(svg) / 1024:.0f} KB")
