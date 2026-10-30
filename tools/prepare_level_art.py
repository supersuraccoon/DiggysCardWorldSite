#!/usr/bin/env python3
"""关卡编辑器用的素材：从游戏仓库复制一份（缩小）到网站，并生成 src/data/palette.json。

  python3 tools/prepare_level_art.py <游戏仓库路径>

读（只读）：
  assets/resources/images/cards/equipment/{id}.png   装备图
  assets/resources/images/cards/item/chest.png       宝箱
  assets/resources/images/ui/shop/duck.png           黄头鸭
  assets/resources/images/cards/terrain/*.png、cards/obstacle/tree_02.png   地形（和 terrain_*_prefab 用的同一张）
  notes/配置表/装备设定.md                             装备的中文名 / 数值 / 售价 / 出现
  assets/scripts/deal.ts                               DEAL_SHOP（商店默认货架）
写：
  public/images/level/equip/{id}.png、item/{chest,duck}.png、terrain/{floor,wall,pit,stairs,back}.png
  src/data/palette.json
需要 Pillow。
"""
import json, os, re, sys
from PIL import Image

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo = sys.argv[1] if len(sys.argv) > 1 else None
if not repo or not os.path.isdir(repo):
    sys.exit(__doc__)
IMG = os.path.join(repo, 'assets/resources/images')
OUT = os.path.join(SITE, 'public/images/level')


def save(src, dst, box):
    im = Image.open(src).convert('RGBA')
    im.thumbnail((box, box), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, optimize=True)


# ---- 装备表
md = open(os.path.join(repo, 'notes/配置表/装备设定.md'), encoding='utf8').read()
equipment = []
for line in md.splitlines():
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if len(cells) < 12 or not re.match(r'^[a-z_]+$', cells[0]) or cells[0] == 'id':
        continue
    eid, name, prefab, hp, atk, df, price, dur, where = cells[:9]
    num = lambda s: int(s) if re.match(r'^-?\d+$', s or '') else -1
    equipment.append({
        'id': eid, 'name': name, 'prefab': prefab,
        'heart': num(hp), 'tooth': num(atk), 'armor': num(df), 'price': num(price),
        'where': where, 'shopOnly': '仅商店' in where,
        'img': f'images/level/equip/{eid}.png',
    })
    save(os.path.join(IMG, f'cards/equipment/{eid}.png'), os.path.join(OUT, f'equip/{eid}.png'), 220)

deal = open(os.path.join(repo, 'assets/scripts/deal.ts'), encoding='utf8').read()
def id_list(name, depth=0):
    # 支持 `= [..]`、`= [..].concat(OTHER)`、`= OTHER.slice()` 这几种写法
    m = re.search(r'export const ' + name + r'\s*=\s*([^;]*);', deal, re.S)
    if not m:
        return []
    expr = m.group(1)
    out = []
    lit = re.match(r'\s*\[([^\]]*)\]', expr)
    if lit:
        out += re.findall(r'"([^"]+)"', lit.group(1))
    else:
        ref = re.match(r'\s*([A-Z_]+)', expr)
        if ref and depth < 5:
            out += id_list(ref.group(1), depth + 1)
    if depth < 5:
        for other in re.findall(r'\.concat\(\s*([A-Z_]+)\s*\)', expr):
            out += id_list(other, depth + 1)
    return out

save(os.path.join(IMG, 'cards/item/chest.png'), os.path.join(OUT, 'item/chest.png'), 220)
save(os.path.join(IMG, 'ui/shop/duck.png'), os.path.join(OUT, 'item/duck.png'), 220)
terrain_src = {
    'floor': 'cards/terrain/terrain_empty.png', 'wall': 'cards/obstacle/tree_02.png',
    'pit': 'cards/terrain/terrain_hole.png', 'stairs': 'cards/terrain/terrain_down.png',
    'back': 'cards/terrain/terrain_floor_back.png',
}
for k, p in terrain_src.items():
    save(os.path.join(IMG, p), os.path.join(OUT, f'terrain/{k}.png'), 200)

# ---- 道具卡（json/道具卡.json）、事件卡（json/事件卡.json）、换装卡（images/cards/costume）
JSON_DIR = os.path.join(repo, 'notes/配置表/json')
def load_json(name):
    f = os.path.join(JSON_DIR, name)
    return json.load(open(f, encoding='utf8')) if os.path.exists(f) else {}

items = []
fallback_scroll = os.path.join(IMG, 'cards/item/badge_scroll.png')
for it in load_json('道具卡.json').get('items', []):
    iid = it['id']
    src = os.path.join(repo, 'assets/resources', (it.get('art') or f'images/cards/item/{iid}') + '.png')
    if not os.path.exists(src):
        src = fallback_scroll if iid.startswith('scroll_') and os.path.exists(fallback_scroll) else None
    if src:
        save(src, os.path.join(OUT, f'item/{iid}.png'), 220)
    items.append({
        'id': iid, 'name': it.get('nameZh') or iid,
        'kind': 'scroll' if iid.startswith('scroll_') else 'item',
        'price': it.get('price') if isinstance(it.get('price'), int) else -1,
        'prefab': os.path.basename(it.get('prefab') or ''),
        'img': f'images/level/item/{iid}.png' if src else 'images/level/item/chest.png',
        'desc': it.get('fuzzyDesc') or '',
    })

STORE_IDS = {'duck', 'crow', 'raccoon', 'capybara', 'owl'}
events, stores = [], []
for ev in load_json('事件卡.json').get('events', []):
    eid = ev['id']
    if eid == 'chest':
        continue
    if eid == 'duck':
        src = os.path.join(IMG, 'ui/shop/duck.png')
    else:
        src = os.path.join(IMG, f'cards/event/{eid}.png')
    if not os.path.exists(src):
        continue
    save(src, os.path.join(OUT, f'item/{eid}.png'), 220)
    row = {
        'id': eid, 'name': ev.get('name') or eid, 'kind': 'store' if eid in STORE_IDS else 'event',
        'price': 0, 'prefab': f'event_{eid}_prefab', 'img': f'images/level/item/{eid}.png',
        'desc': (ev.get('blurb') or '').strip(),
    }
    (stores if eid in STORE_IDS else events).append(row)
if not any(s['id'] == 'duck' for s in stores):
    stores.insert(0, {'id': 'duck', 'name': '黄头鸭的商店', 'kind': 'store', 'price': 0, 'prefab': 'item_duck_prefab', 'img': 'images/level/item/duck.png', 'desc': '踩到开一次商店，牌消失'})

COSTUME_NAMES = {'diving': '潜水服', 'space': '宇航服', 'penguin': '企鹅服', 'ninja': '忍者服', 'halloween': '万圣节',
                 'christmas': '圣诞服', 'miner': '矿工服', 'cat': '猫猫服', 'frog': '青蛙服', 'zombie': '僵尸服'}
costumes = []
COSTUME_DIR = os.path.join(IMG, 'cards/costume')
if os.path.isdir(COSTUME_DIR):
    for fn in sorted(os.listdir(COSTUME_DIR)):
        if fn.endswith('.png'):
            cid = fn[:-4]
            save(os.path.join(COSTUME_DIR, fn), os.path.join(OUT, f'costume/{cid}.png'), 160)
            costumes.append({'id': cid, 'name': COSTUME_NAMES.get(cid, cid), 'img': f'images/level/costume/{cid}.png'})

palette = {
    'source': 'tools/prepare_level_art.py',
    'terrain': [
        {'id': 'floor', 'name': '地板', 'prefab': 'terrain_floor_prefab', 'walkable': True, 'img': 'images/level/terrain/floor.png'},
        {'id': 'wall', 'name': '墙', 'prefab': 'terrain_wall_prefab', 'walkable': False, 'img': 'images/level/terrain/wall.png'},
        {'id': 'pit', 'name': '坑', 'prefab': 'terrain_hole_prefab', 'walkable': False, 'img': 'images/level/terrain/pit.png'},
        {'id': 'stairs', 'name': '下楼楼梯', 'prefab': 'terrain_down_prefab', 'walkable': True, 'img': 'images/level/terrain/stairs.png'},
    ],
    'equipment': equipment,
    'items': [
        {'id': 'chest', 'name': '黑色宝箱', 'kind': 'chest', 'price': 4, 'prefab': 'item_chest_prefab', 'img': 'images/level/item/chest.png', 'desc': '踩到弹出四选一'},
    ] + events + items,
    'store': stores,
    'costumes': costumes,
    'deal': {
        'monsters': id_list('DEAL_MONSTERS'), 'equipment': id_list('DEAL_EQUIPMENT'),
        'shopEquipment': id_list('DEAL_SHOP_EQUIPMENT'), 'items': id_list('DEAL_ITEMS'),
        'store': id_list('DEAL_STORE'), 'shop': id_list('DEAL_SHOP'),
        'events': id_list('DEAL_EVENTS'), 'shopEvents': id_list('DEAL_SHOP_EVENTS'),
        'costumes': id_list('DEAL_COSTUMES'), 'skillScrolls': id_list('DEAL_SKILL_SCROLLS'),
        'supplyItems': id_list('DEAL_SUPPLY_ITEMS'),
    },
}
with open(os.path.join(SITE, 'src/data/palette.json'), 'w', encoding='utf8') as f:
    json.dump(palette, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'装备 {len(equipment)} 件，图片写到 {os.path.relpath(OUT, SITE)}/，palette.json 已更新')
