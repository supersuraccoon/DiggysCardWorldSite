#!/usr/bin/env python3
# 同步后再跑：已含缩略图 160px
"""从游戏仓 prefabs/cards/worldN/{enemy,equipment,item}（出处目录，见私有仓 notes/工程/卡牌出处目录.md）同步世界批次卡到 src/data/palette.json（带 world 字段），
图片拷到 public/images/level/world/。
另外扫 prefabs/cards/{出处}/{种类}/ 全部预制体，把「预制体名 → 出处」写进 palette.json 的 origins，编辑器素材栏按它分组
（世界N/地下城/竞技场/试玩/共用，只是方便找，不做过滤）。用法：python3 tools/sync_world_cards.py [游戏仓路径]"""
import json, os, sys, glob, shutil, re
GAME = sys.argv[1] if len(sys.argv) > 1 else '/workspace/DiggysCardWorld'
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = f'{GAME}/assets/resources/prefabs/cards'
uuid2png = {}
for m in glob.glob(f'{GAME}/assets/**/*.png.meta', recursive=True):
    try: j = json.load(open(m))
    except Exception: continue
    png = m[:-5]
    uuid2png[j.get('uuid')] = png
    for k, s in (j.get('subMetas') or {}).items():
        uuid2png[s.get('uuid')] = png
def parse(path):
    d = json.load(open(path))
    comp = next(o for o in d if 'cardId' in o)
    def label(ref):
        return d[ref['__id__']].get('_string', '') if ref else ''
    # 名字
    name = ''
    tl = comp.get('titleLabel')
    if tl: name = label(tl) if '_string' in d[tl['__id__']] else ''
    if not name:
        name = next((o['_string'] for o in d if o.get('__type__') == 'cc.Label' and o.get('_string') and not re.match(r'^[+\-]?\d+$', o['_string'])), '')
    # 头像：avatar 节点或其子节点上的 Sprite
    img = None
    av = comp.get('avatar')
    aid = av['__id__'] if av else next((i for i, o in enumerate(d) if o.get('__type__') == 'cc.Node' and o.get('_name') == 'Avatar'), None)
    if aid is not None:
        for o in d:
            if o.get('__type__') == 'cc.Sprite' and o.get('_spriteFrame'):
                n = o['node']['__id__']
                if n == aid or (d[n].get('_parent') or {}).get('__id__') == aid:
                    img = uuid2png.get(o['_spriteFrame']['__uuid__']) or uuid2png.get(o['_spriteFrame']['__uuid__'].split('@')[0]); break
    desc = comp.get('desc') or comp.get('description') or ''
    return comp, name, img, desc
pal_path = f'{SITE}/src/data/palette.json'
pal = json.load(open(pal_path))
# 预制体名 → 出处（world1…world9/dungeon/arena/testcase/common）
origins = {}
for p in sorted(glob.glob(f'{CARDS}/*/*/*_prefab.prefab')):
    parts = p.split('/')
    origins[os.path.basename(p)[:-len('.prefab')]] = parts[-3]
out = {'monsters': [], 'equipment': [], 'items': []}
for cat, key, pre in [('enemy', 'monsters', 'enemy_'), ('equipment', 'equipment', 'equipment_'), ('item', 'items', 'item_')]:
    for wdir in sorted(glob.glob(f'{CARDS}/world*/{cat}'), key=lambda p: int(re.sub(r'\D', '', os.path.basename(os.path.dirname(p))) or 0)):
        if not os.path.isdir(wdir): continue
        w = int(re.sub(r'\D', '', os.path.basename(os.path.dirname(wdir))))
        for p in sorted(glob.glob(f'{wdir}/*_prefab.prefab')):
            prefab = os.path.basename(p)[:-len('.prefab')]
            cid = prefab[len(pre):-len('_prefab')]
            comp, name, png, desc = parse(p)
            rel = None
            if png:
                rel = f'images/level/world/{cat}/{cid}.png'
                os.makedirs(os.path.dirname(f'{SITE}/public/{rel}'), exist_ok=True)
                from PIL import Image
                im = Image.open(png); im.thumbnail((160, 160)); im.save(f'{SITE}/public/{rel}', optimize=True)
            e = {'id': cid, 'name': name or cid, 'prefab': prefab, 'world': w, 'origin': f'world{w}',
                 'heart': comp.get('heart', comp.get('addHeart', 0)), 'tooth': comp.get('tooth', comp.get('addTooth', 0)), 'armor': comp.get('armor', comp.get('addArmor', 0)), 'img': rel}
            if key == 'monsters': e['gold'] = comp.get('gold', 0)
            if key == 'items': e['kind'] = 'item'; e['desc'] = desc
            out[key].append(e)
# 替换旧的世界条目，保留非世界条目
pal['worldMonsters'] = out['monsters']
pal['origins'] = origins
for key in ('equipment', 'items'):
    ids = {e['id'] for e in out[key]}
    pal[key] = [e for e in pal[key] if 'world' not in e and e['id'] not in ids] + out[key]
json.dump(pal, open(pal_path, 'w'), ensure_ascii=False, indent=2)
open(pal_path, 'a').write('\n')
from collections import Counter
print({k: len(v) for k, v in out.items()}, 'origins:', len(origins), dict(Counter(origins.values())), 'missing img:', [e['id'] for v in out.values() for e in v if not e['img']])
