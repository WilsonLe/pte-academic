"""Deterministic antialiased black/white book icon. No external design assets."""
from pathlib import Path
import struct,zlib,math
root=Path(__file__).resolve().parents[1]/'public'
# Open-book lines, kept within maskable safe area. Original vector in icon.svg.
segments=[((50,56),(74,56)),((74,56),(85,59)),((85,59),(94,69)),((94,69),(96,78)),((96,78),(96,144)),((96,144),(87,131)),((87,131),(74,122)),((74,122),(50,122)),((50,122),(50,56)),((142,56),(118,56)),((118,56),(107,59)),((107,59),(98,69)),((98,69),(96,78)),((96,144),(105,131)),((105,131),(118,122)),((118,122),(142,122)),((142,122),(142,56))]
def distance(x,y,a,b):
 dx,dy=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
def chunk(k,v):return struct.pack('!I',len(v))+k+v+struct.pack('!I',zlib.crc32(k+v)&0xffffffff)
for name,n in [('icon-192.png',192),('icon-512.png',512),('icon-maskable.png',512)]:
 data=bytearray()
 for y in range(n):
  data.append(0)
  for x in range(n):
   d=min(distance((x+.5)/n*192,(y+.5)/n*192,a,b) for a,b in segments);v=round(10+245*max(0,min(1,(4.5-d)*n/192+.5)));data.extend((v,v,v))
 (root/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',n,n,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b''))
