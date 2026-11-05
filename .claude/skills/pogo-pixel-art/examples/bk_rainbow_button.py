"""Bankrupt Rainbow Road card button: the buy button's shape with seven colour bands and a RAINBOW wordmark (writes SVGs + PNG previews to the current folder)."""
import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bk_rainbow_lib import *
NAVY='#101628'
buy=load('button-buy.svg'); dis=load('button-buy-disabled.svg')
H=len(buy); W=len(buy[0])
G={ 'R':['#','###.#','#...#'] }
FONT={
 'R':['XXXXX.','XX..XX','XX..XX','XXXXX.','XXXX..','XX.XX.','XX..XX','XX..XX'],
 'A':['.XXXX.','XX..XX','XX..XX','XX..XX','XXXXXX','XX..XX','XX..XX','XX..XX'],
 'I':['XXXX','.XX.','.XX.','.XX.','.XX.','.XX.','.XX.','XXXX'],
 'N':['XX...XX','XXX..XX','XXXX.XX','XXXXXXX','XX.XXXX','XX..XXX','XX...XX','XX...XX'],
 'B':['XXXXX.','XX..XX','XX..XX','XXXXX.','XX..XX','XX..XX','XX..XX','XXXXX.'],
 'O':['.XXXX.','XX..XX','XX..XX','XX..XX','XX..XX','XX..XX','XX..XX','.XXXX.'],
 'W':['XX....XX','XX....XX','XX....XX','XX.XX.XX','XX.XX.XX','XXXXXXXX','XXX..XXX','XX....XX'],
}
word='RAINBOW'
def text_cells():
    cells=[];x=0
    for ch in word:
        gl=FONT[ch]
        for r,row in enumerate(gl):
            for c,v in enumerate(row):
                if v=='X': cells.append((x+c,r))
        x+=len(gl[0])+1
    return cells,x-1
cells,tw=text_cells()
print('text width',tw)
BANDS=[('#ff9a80','#eb6b43','#b8402f'),('#ffd078','#f59a0b','#b36f00'),('#fff4b4','#fdcf51','#ea9600'),('#9ee0c0','#56a786','#3d7f63'),('#a8f1fb','#3aaef7','#0061b8'),('#c79bff','#935adc','#6a3fa5'),('#ff9fc8','#e0529a','#a8346f')]
def build(base, rainbow):
    g=[row[:] for row in base]
    # clear the old text: white pixels and the navy shadow inside the body
    for y in range(1,19):
        for x in range(1,W-1):
            if g[y][x] in ('#ffffff',NAVY): g[y][x]=None
    for y in range(1,19):
        for x in range(1,W-1):
            if g[y][x] is None or True:
                if rainbow:
                    b=BANDS[min(len(BANDS)-1,(x-1)*len(BANDS)//(W-2))]
                    g[y][x]=b[0] if y==1 else b[2] if y==18 else b[1]
                else:
                    g[y][x]=base[2][2] if 1<y<18 else (base[1][2] if y==1 else base[18][2])
    ox=(W-tw)//2; oy=5
    for x,y in cells:
        X,Y=ox+x,oy+y
        for dx,dy in ((1,0),(0,1),(1,1)):
            if g[Y+dy][X+dx] not in ('#ffffff',): g[Y+dy][X+dx]=NAVY
    for x,y in cells: g[oy+y][ox+x]='#ffffff' if rainbow else '#e1e8f2'
    return g
def svg(g,title):
    by={}
    for y,row in enumerate(g):
        x=0
        while x<W:
            c=row[x]
            if c is None: x+=1; continue
            x2=x
            while x2<W and row[x2]==c: x2+=1
            by.setdefault(c,[]).append(f'M{x} {y}h{x2-x}v1h-{x2-x}z'); x=x2
    paths=''.join(f'<path fill="{c}" d="{"".join(d)}"/>' for c,d in by.items())
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*4}" height="{H*4}" shape-rendering="crispEdges" role="img"><title>{title}</title>{paths}</svg>'
on=build(buy,True)
# the disabled one keeps buy-disabled's greys
off=build(dis,False)
png(on,'rainbow.png'); png(off,'rainbow-disabled.png')
open('button-rainbow.svg','w').write(svg(on,'rainbow road button'))
open('button-rainbow-disabled.svg','w').write(svg(off,'rainbow road button (disabled)'))
