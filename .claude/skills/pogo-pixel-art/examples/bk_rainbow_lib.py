import re, zlib, struct
D='/home/marni/repos/pogo/apps/web/src/assets/sprites/bankrupt/city/card/'
def load(name):
    s=open(D+name).read()
    W,H=map(int,re.search(r'viewBox="0 0 (\d+) (\d+)"',s).groups())
    g=[[None]*W for _ in range(H)]
    for fill,d in re.findall(r'<path fill="(#[0-9a-fA-F]+)" d="([^"]+)"',s):
        for x,y,w in re.findall(r'M(\d+) (\d+)h(\d+)v1',d):
            for i in range(int(w)): g[int(y)][int(x)+i]=fill
    return g
def png(g,path,k=8,bg=(39,79,143)):
    H=len(g);W=len(g[0]);raw=b''
    for y in range(H):
        row=b''
        for x in range(W):
            c=g[y][x]
            rgb=bg if c is None else tuple(int(c[i:i+2],16) for i in (1,3,5))
            row+=bytes(rgb)*k
        raw+=(b'\x00'+row)*k
    def ch(t,d): 
        c=struct.pack('>I',len(d))+t+d
        return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',W*k,H*k,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b''))
