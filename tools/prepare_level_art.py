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

# ---- 道具卡（json/道具卡.json）、事件卡（json/事件卡.json）、换装卡（images/cards/costume）、技能卡（images/cards/skill，桌上捡起学会）
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
                 'christmas': '圣诞服', 'miner': '矿工服', 'cat': '猫猫服', 'frog': '青蛙服', 'zombie': '僵尸服',
                 'king': '国王服', 'mech': '机甲服', 'firefighter': '消防员服', 'vampire': '吸血鬼服',
                 'detective': '侦查服', 'matador': '斗牛士服', 'magician': '魔术师服', 'snowman': '雪人服', 'pirate': '海盗服'}
costumes = []
COSTUME_DIR = os.path.join(IMG, 'cards/costume')
if os.path.isdir(COSTUME_DIR):
    for fn in sorted(os.listdir(COSTUME_DIR)):
        if fn.endswith('.png'):
            cid = fn[:-4]
            save(os.path.join(COSTUME_DIR, fn), os.path.join(OUT, f'costume/{cid}.png'), 160)
            costumes.append({'id': cid, 'name': COSTUME_NAMES.get(cid, cid), 'img': f'images/level/costume/{cid}.png'})

# 技能卡（编辑器检查认这些 id；含已实现与设计中的全部技能图；副标题「捡起学会」）
SKILL_IDS = [
    ('mole_claw', '爪爪爪'), ('mole_spike', '地刺'), ('mole_top', '鼹鼠陀螺'),
    ('venom_lick', '毒液舔舔'), ('venom_bite', '毒液咬咬'), ('venom_bomb', '毒液炸弹'),
    ('venom_fang', '毒牙牙'), ('pot_lid_up', '锅盖举举'), ('frying_pan', '平底锅咚'),
    ('dong_drum', '咚咚鼓'), ('pat_head', '摸摸头'), ('angry_puff', '气鼓鼓'),
    ('bedsheet_ghost', '床单隐身'), ('bedtime_story', '讲故事'), ('big_bonk', '超级大咚'),
    ('big_slurp', '大口吸溜'), ('big_tummy', '圆滚滚'), ('big_yawn', '打哈欠'),
    ('blackhole', '黑洞'), ('blanket_fort', '被窝城堡'), ('blind', '致盲'),
    ('blizzard', '呼呼暴风雪'), ('bouncy_ball', '弹弹球'), ('bubble', '泡泡'),
    ('bubble_bath', '泡泡浴'), ('bubble_wrap', '泡泡飘飘'), ('burrow', '挖洞'),
    ('cactus_hug', '仙人掌抱抱'), ('charge', '蓄力'), ('charm', '魅惑'),
    ('cheer_buddy', '点个赞'), ('cheer_up', '加油加油'), ('cozy_quilt', '暖暖被子'),
    ('curse', '诅咒'), ('dizzy_top', '晕晕陀螺'), ('drum_roll', '啪啪啪'),
    ('entangle', '缠绕'), ('extra_bowl', '再来一碗'), ('face_mask', '戴戴口罩'),
    ('fire_ball', '大火球'), ('flood_wave', '大浪浪'), ('freeze_cast', '冰冻'),
    ('glare_light', '刺眼光'), ('grind_teeth', '磨磨牙'), ('group_hug', '抱成一团'),
    ('hair_dryer', '吹风机'), ('haste', '加速'), ('heal', '治疗'),
    ('hedgehog_bag', '刺猬睡袋'), ('honey', '蜜糖'), ('hot_spatula', '烫烫锅铲'),
    ('hug_and_bite', '抱住咬'), ('hug_patch', '抱抱贴'), ('ice_cube', '小冰块'),
    ('ice_spike', '冰锥'), ('ignite', '着火'), ('iron_turtle', '铁乌龟'),
    ('juice_slurp', '果汁咕嘟'), ('laser', '激光'), ('lightning', '落雷'),
    ('luck', '幸运'), ('lullaby', '摇篮曲'), ('meteor', '陨石'),
    ('mirror_copy', '镜像'), ('mirror_peek', '照照镜子'), ('mirror_wall', '镜子墙'),
    ('nine_lives', '九条命'), ('nudge', '推推'), ('pat_pat', '啪啪'),
    ('pencil_sharpen', '削削铅笔'), ('pillow_block', '枕头挡挡'), ('pop_goodbye', '啪嗒散开'),
    ('popsicle', '冰棒棒'), ('prick', '小刺刺'), ('prickly_sweater', '刺刺毛衣'),
    ('purify', '净化'), ('quake', '地震'), ('regen_sprout', '再生'),
    ('ring_ring', '叮铃铃'), ('sacrifice', '献祭'), ('sandstorm', '沙暴'),
    ('sharp_sharp', '尖尖尖'), ('shell_tuck', '缩缩壳'), ('shrink', '变小'),
    ('shush', '嘘安静'), ('sleep', '睡眠'), ('slow', '减速'),
    ('smelly_cloud', '臭臭云'), ('snip_snip', '剪刀咔嚓'), ('snore_suck', '呼噜吸'),
    ('soap_slide', '肥皂溜溜'), ('sonic', '音波'), ('spin_spin', '转圈圈'),
    ('split', '分裂'), ('stardust', '星光'), ('steal_coin', '偷金币'),
    ('sticky_web', '黏黏蛛网'), ('straw_sip', '吸管吸吸'), ('summon', '召唤'),
    ('super_angry', '超级生气'), ('swap', '换位'), ('tape_mouth', '胶带封嘴'),
    ('taunt', '嘲讽'), ('teleport', '传送'), ('thorn_storm', '刺刺雨'),
    ('tickle', '挠痒痒'), ('tiny_flame', '小火苗'), ('wake_up', '起床啦'),
    ('warm_milk', '热牛奶'), ('water_bucket', '哗啦水桶'), ('water_gun', '呲呲水枪'),
    ('wet', '湿漉漉'), ('whirlwind', '旋风'), ('wipe_clean', '擦擦干净'),
]
skills = []
SKILL_DIR = os.path.join(IMG, 'cards/skill')
for sid, sname in SKILL_IDS:
    src = os.path.join(SKILL_DIR, f'{sid}.png')
    dst = os.path.join(OUT, f'skill/{sid}.png')
    if os.path.exists(src):
        save(src, dst, 160)
    skills.append({'id': sid, 'name': sname, 'img': f'images/level/skill/{sid}.png'})

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
    'skills': skills,
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
