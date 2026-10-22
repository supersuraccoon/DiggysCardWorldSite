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
def id_list(name):
    m = re.search(r'export const ' + name + r'\s*=\s*\[([^\]]*)\]', deal)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []

save(os.path.join(IMG, 'cards/item/chest.png'), os.path.join(OUT, 'item/chest.png'), 220)
save(os.path.join(IMG, 'ui/shop/duck.png'), os.path.join(OUT, 'item/duck.png'), 220)
terrain_src = {
    'floor': 'cards/terrain/terrain_empty.png', 'wall': 'cards/obstacle/tree_02.png',
    'pit': 'cards/terrain/terrain_hole.png', 'stairs': 'cards/terrain/terrain_down.png',
    'back': 'cards/terrain/terrain_floor_back.png',
}
for k, p in terrain_src.items():
    save(os.path.join(IMG, p), os.path.join(OUT, f'terrain/{k}.png'), 200)

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
    ],
    'store': [
        {'id': 'duck', 'name': '黄头鸭的商店', 'kind': 'store', 'price': 0, 'prefab': 'item_duck_prefab', 'img': 'images/level/item/duck.png', 'desc': '踩到开一次商店，牌消失'},
    ],
    'deal': {
        'monsters': id_list('DEAL_MONSTERS'), 'equipment': id_list('DEAL_EQUIPMENT'),
        'shopEquipment': id_list('DEAL_SHOP_EQUIPMENT'), 'items': id_list('DEAL_ITEMS'),
        'store': id_list('DEAL_STORE'), 'shop': id_list('DEAL_SHOP'),
    },
}
with open(os.path.join(SITE, 'src/data/palette.json'), 'w', encoding='utf8') as f:
    json.dump(palette, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'装备 {len(equipment)} 件，图片写到 {os.path.relpath(OUT, SITE)}/，palette.json 已更新')
