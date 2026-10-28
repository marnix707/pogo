"""Candy tiles: 5 elements + berry + specials. Each tile is an 18x18 cell."""
from mm_common import render, place
CELL = 18
FIRE = ['......R.......', '.....RR.......', '.....RRR......', '....RRRR..R...', '....RRRRR.RR..', '...RRRRRRRRR..',
        '..RRRRYRRRRRR.', '..RRRYYYRRRRR.', '.RRRYYYYYRRRR.', '.RRRYYWYYYRRR.', '.RRRYYWWYYRRR.', '..RRRYYYYRRR..',
        '...RRRRRRRR...', '.....RRRR.....']
WATER = ['......BB......', '......BB......', '.....BBBB.....', '.....BBBB.....', '....BBBBBB....', '...BBBBBBBB...',
         '...BWBBBBBB...', '..BBWBBBBBBB..', '..BWWBBBBBBB..', '..BWBBBBBBBB..', '..BBBBBBBBBB..', '...BBBBBBBB...',
         '....BBBBBB....', '.....BBBB.....']
EARTH = ['..........GG..', '........GGGG..', '......GGGGGG..', '.....GGGGGGG..', '....GGGGGVGG..', '...GGGGGVGGG..',
         '...GGGGVGGGG..', '..GGGGVGGGGG..', '..GGGVGGGGG...', '..GGVGGGGG....', '..GVGGGGG.....', '..VGGGG.......',
         '.V............', 'V.............']
ELEC = ['.......YYYY...', '......YYYY....', '.....YYYY.....', '....YYYY......', '...YYYY.......', '..YYYYYYYYY...',
        '.YYYYYYYYYY...', '.......YYYY...', '......YYYY....', '.....YYYY.....', '....YYYY......', '...YYY........',
        '..YY..........', '.Y............']
PSY = ['....PPPPPP....', '..PPPPPPPPPP..', '.PPWWPPPPPPPP.', '.PWWPPPPPPPPP.', 'PPWPPPLLLPPPPP', 'PPPPPLPPPLPPPP',
       'PPPPLPPLPPLPPP', 'PPPPLPLLPPLPPP', 'PPPPLPPPPLPPPP', 'PPPPPLLLLPPPPP', '.PPPPPPPPPPPP.', '.PPPPPPPPPPPP.',
       '..PPPPPPPPPP..', '....PPPPPP....']
BERRY = ['.....GG.GG....', '......GGG.....', '....RRRRRR....', '..RRRRRRRRRR..', '.RRWRRSRRSRRR.', '.RWRRRRRRRRSR.',
         'RRRRSRRSRRRRRR', 'RRSRRRRRRRSRRR', 'RRRRRSRRSRRRRR', '.RRSRRRRRRRSR.', '.RRRRRSRRRRRR.', '..RRRRRRRRRR..',
         '....RRRRRR....']
BOMB = ['.........FY...', '........F.....', '.......NN.....', '......NNNN....', '....BBBBBBB...', '...BBBBBBBBB..',
        '..BBWBBBBBBBB.', '..BWBBBBBBBBB.', '..BBBBTTTBBBB.', '..BBBBBBTBBBB.', '..BBBBBTBBBBB.', '...BBBBTBBBB..',
        '....BBBBBBB...']
MYST = ['QQQQQQQQQQQQ', 'QQQQWWWWQQQQ', 'QQQWWQQWWQQQ', 'QQQQQQQWWQQQ', 'QQQQQQWWQQQQ', 'QQQQQWWQQQQQ', 'QQQQQWWQQQQQ',
        'QQQQQQQQQQQQ', 'QQQQQWWQQQQQ', 'QQQQQWWQQQQQ', 'QQQQQQQQQQQQ', 'QQQQQQQQQQQQ']

TILES = {
 'fire':     (FIRE,  {'R': ('#fd7957', '#eb6b43', '#c14139'), 'Y': '#fdcf51', 'W': '#fff4b4'}),
 'water':    (WATER, {'B': ('#83e9f8', '#3aaef7', '#0061b8'), 'W': '#ffffff'}),
 'earth':    (EARTH, {'G': ('#74cca8', '#56a786', '#459373'), 'V': '#2f6d55'}),
 'electric': (ELEC,  {'Y': ('#fff1a8', '#fdcf51', '#ea9600')}),
 'psychic':  (PSY,   {'P': ('#ae65ff', '#935adc', '#7d51ae'), 'L': '#d7b6ff', 'W': '#ffffff'}),
 'berry':    (BERRY, {'R': ('#ff9690', '#e8475f', '#a61a1f'), 'S': '#a61a1f', 'G': '#56a786', 'W': '#ffffff'}),
 'bomb':     (BOMB,  {'B': ('#4f6367', '#334461', '#233049'), 'N': '#796e9e', 'F': '#b88828', 'Y': '#fdcf51', 'W': '#bcbcbc', 'T': '#fd5f55'}),
 'mystery':  (MYST,  {'Q': ('#ae65ff', '#7d51ae', '#4e3381'), 'W': '#ffffff'}),
}
DIG3 = {'3': ['TTT', '..T', '.TT', '..T', 'TTT'], '2': ['TTT', '..T', 'TTT', 'T..', 'TTT'], '1': ['.T.', 'TT.', '.T.', '.T.', 'TTT']}
BOMB_BODY = BOMB[:7] + ['..BBBBBBBBBBB.'] * 5 + ['....BBBBBBB...']
def bomb(n):
    rows = [list(r) for r in BOMB_BODY]
    for j, r in enumerate(DIG3[str(n)]):
        for i, c in enumerate(r):
            if c == 'T': rows[7 + j][6 + i] = 'T'
    rows[6] = list('..BBWBBBBBBBB.'); rows[7][3] = 'W'
    return [''.join(r) for r in rows]
def tile(name):
    if name.startswith('bomb-'):
        rows = bomb(name[-1]); pal = TILES['bomb'][1]
    else: rows, pal = TILES[name]
    return place(render(rows, pal), CELL, CELL)

def ice_overlay():
    """Frozen-tile overlay: an ice frame with frost corners; the tile underneath shows through the middle."""
    g = [[None] * CELL for _ in range(CELL)]
    for i in range(CELL):
        for (x, y) in ((i, 0), (i, CELL - 1), (0, i), (CELL - 1, i)): g[y][x] = '#83e9f8'
        for (x, y) in ((i, 1), (1, i)): g[y][x] = '#d7f9fc' if 1 <= i < CELL - 1 else g[y][x]
        for (x, y) in ((i, CELL - 2), (CELL - 2, i)): g[y][x] = '#3aaef7' if 1 <= i < CELL - 1 else g[y][x]
    for (x, y) in ((3, 3), (4, 3), (3, 4), (13, 13), (14, 13), (13, 14), (14, 3), (3, 14), (2, 5), (5, 2)): g[y][x] = '#ffffff'
    return g

def board_bg(n_cols=8, n_rows=7):
    """Checkered board backing for the candy grid."""
    A, B = '#233049', '#2b3a58'
    W, H = n_cols * CELL, n_rows * CELL
    return [[A if ((x // CELL) + (y // CELL)) % 2 == 0 else B for x in range(W)] for y in range(H)]
