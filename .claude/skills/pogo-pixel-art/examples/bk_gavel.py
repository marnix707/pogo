"""Bankrupt auction gavel + sound block (writes bankrupt/auction/gavel.svg and block.svg). The gavel is drawn upright
(head on top, handle below) so the screen can swing it with a CSS rotation around its handle end."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts'))
from pixel import render, write_svg
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../apps/web/src/assets/sprites/bankrupt/auction')
os.makedirs(OUT, exist_ok=True)
WOOD = ('#e9a96b', '#b9733e', '#8a4f2a')
GOLD = ('#fff4b4', '#fdcf51', '#ea9600')
gavel = render([
    '.WWWWWWWWWW.',
    'WWWWWWWWWWWW',
    'WGGWWWWWWGGW',
    'WGGWWWWWWGGW',
    'WWWWWWWWWWWW',
    '.WWWWWWWWWW.',
    '.....HH.....',
    '.....HH.....',
    '.....HH.....',
    '.....HH.....',
    '.....HH.....',
    '.....HH.....',
    '.....HH.....',
    '.....HH.....',
], {'W': WOOD, 'G': GOLD, 'H': WOOD}, shadow=False)
block = render([
    '.BBBBBBBBBBBBBBBBBB.',
    'BBBBBBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBBBBBB',
    '.DDDDDDDDDDDDDDDDDD.',
], {'B': WOOD, 'D': ('#8a4f2a', '#8a4f2a', '#5d3319')}, shadow=False)
write_svg(gavel, os.path.join(OUT, 'gavel.svg'), 'gavel', px=4)
write_svg(block, os.path.join(OUT, 'block.svg'), 'sound block', px=4)
for g in (gavel, block):
    for r in g: print(''.join('#' if v else '.' for v in r))
    print()
