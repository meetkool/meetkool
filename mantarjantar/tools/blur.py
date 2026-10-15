import sys
from PIL import Image, ImageFilter
def blur(src,dst,boxes):
    im=Image.open(src).convert('RGB')
    for b in boxes:
        r=im.crop(b).filter(ImageFilter.GaussianBlur(9)); im.paste(r,b)
    im.save(dst,'WEBP',quality=76)
d=sys.argv[1]; o=sys.argv[2]
blur(d+'/live-protester.png',o+'/live-protester.webp',[(1058,12,1270,188),(8,684,262,752),(225,76,345,104)])
blur(d+'/live-police.png',o+'/live-police.webp',[(1058,12,1270,188),(8,702,264,752),(718,352,802,380)])
im=Image.open(d+'/phone.png').convert('RGB'); im.thumbnail((540,1100)); im.save(o+'/phone.webp','WEBP',quality=78)
