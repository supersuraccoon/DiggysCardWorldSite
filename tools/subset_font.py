"""把乐米小奶泡体（4.6MB）按网站用到的字裁成小字体。
用法：python3 tools/subset_font.py [字体路径]
收集 src/ 下所有文本 + 常用标点和 ASCII，再加上 3500 常用字里的前若干字，输出 public/fonts/lemi-subset.woff(2)。"""
import os, sys, glob, importlib.util
from fontTools import subset
from fontTools.ttLib import TTFont
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/dcw_main/assets/resources/fonts/LemiXiaoNaiPaoTi-Regular.ttf'
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('，。、！？；：“”‘’（）《》【】…—·～￥0123456789')
for f in glob.glob(SITE + '/src/**/*', recursive=True):
    if os.path.isfile(f) and f.endswith(('.astro', '.js', '.jsx', '.ts', '.md', '.json', '.css', '.mjs')):
        chars |= set(open(f, encoding='utf-8').read())
extra = os.path.join(SITE, 'tools', 'common_chars.txt')
if os.path.exists(extra):
    chars |= set(open(extra, encoding='utf-8').read())
font = TTFont(src)
cmap = font.getBestCmap()
keep = sorted(c for c in chars if ord(c) in cmap)
os.makedirs(SITE + '/public/fonts', exist_ok=True)
for flavor in ['woff'] + (['woff2'] if importlib.util.find_spec('brotli') else []):
    opts = subset.Options(); opts.flavor = flavor; opts.layout_features = ['*']; opts.name_IDs = ['*']
    ft = TTFont(src); s = subset.Subsetter(opts); s.populate(text=''.join(keep)); s.subset(ft)
    out = f'{SITE}/public/fonts/lemi-subset.{flavor}'; ft.save(out)
    print(out, len(keep), 'chars', os.path.getsize(out) // 1024, 'KB')
