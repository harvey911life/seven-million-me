# 打包：將 vite 單檔輸出轉做 Artifact 頁面格式，並嵌入裁剪過嘅 Fusion Pixel 12px 字型
import base64, io, os, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont

FONT_DIR = os.environ.get('FONT_DIR', '')
src = open('dist/index.html', encoding='utf-8').read()
styles = re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)
m = re.search(r'<script type="module"[^>]*>(.*?)</script>', src, re.S)
js = m.group(1)

chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set(ch for ch in src if ord(ch) > 0x7f)
for esc in re.findall(r'\\u([0-9a-fA-F]{4})', js):
    chars.add(chr(int(esc, 16)))
cps = sorted(ord(c) for c in chars)

faces = []
total = 0
for fn in sorted(os.listdir(FONT_DIR)):
    if not fn.endswith('.woff2'):
        continue
    f = TTFont(os.path.join(FONT_DIR, fn))
    have = set(f.getBestCmap().keys())
    need = [c for c in cps if c in have]
    if not need:
        continue
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.hinting = False
    opts.notdef_outline = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=need)
    sub.subset(f)
    buf = io.BytesIO()
    f.flavor = 'woff2'
    f.save(buf)
    data = buf.getvalue()
    total += len(data)
    # unicode-range：連續碼位合併
    ranges, start, prev = [], need[0], need[0]
    for c in need[1:] + [None]:
        if c is not None and c == prev + 1:
            prev = c
            continue
        ranges.append(f'U+{start:X}' if start == prev else f'U+{start:X}-{prev:X}')
        if c is not None:
            start = prev = c
    faces.append("@font-face{font-family:'FusionPixel';src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s;font-display:swap}" % (base64.b64encode(data).decode(), ','.join(ranges)))

page = (
    '<title>七百萬分之我</title>\n'
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    '<style>\n' + '\n'.join(faces) + '\n' + '\n'.join(styles) + '\n</style>\n'
    '<div id="app"></div>\n'
    '<script type="module">' + js + '</script>\n'
)
open('dist/page.html', 'w', encoding='utf-8').write(page)
print(f'字元 {len(cps)}，字型 {len(faces)} 塊 {total/1024:.0f} KB，頁面 {len(page.encode())/1024:.0f} KB')
