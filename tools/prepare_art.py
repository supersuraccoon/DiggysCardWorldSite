"""一次性：把 /workspace 里已有的美术整理、压缩后放进 public/images。
不读游戏仓库的工作区（只读 origin/main 的 worktree /workspace/dcw_main）。
怪物图和角色数据由 scripts/sync-from-game.mjs 负责，这里不处理。"""
import os, shutil
from PIL import Image, ImageFilter, ImageEnhance
W = '/workspace'
G = W + '/dcw_main/assets/resources/images'
P = os.path.dirname(os.path.abspath(__file__)) + '/../public/images'
def mk(d):
    os.makedirs(d, exist_ok=True); return d
def save_png(src, dst, size=None):
    im = Image.open(src).convert('RGBA')
    if size: im.thumbnail((size, size), Image.LANCZOS)
    mk(os.path.dirname(dst)); im.save(dst, optimize=True)
def save_jpg(src, dst, w):
    im = Image.open(src).convert('RGB')
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    mk(os.path.dirname(dst)); im.save(dst, quality=84, optimize=True, progressive=True)

# 漫画
for i in range(1, 18):
    save_jpg(f'{W}/story_comic_fix_v2/panel_{i:02d}.jpg', f'{P}/comic/panel_{i:02d}.jpg', 1280)
save_jpg(f'{W}/depart/第17格_候选A.jpg', f'{P}/comic/banner_depart.jpg', 2200)
# 纸张底纹
save_jpg(f'{G}/ui/menu/bg_base.png', f'{P}/ui/paper.jpg', 1600)
# 属性图标
for a, b in [('heart', 'heart'), ('theeth', 'tooth'), ('defend', 'armor'), ('coin', 'coin')]:
    save_png(f'{G}/icon/{b if False else a}.png', f'{P}/icons/{b}.png', 96)
# 状态图标
for f in os.listdir(f'{G}/buffs'):
    if f.endswith('.png'): save_png(f'{G}/buffs/{f}', f'{P}/status/{f}', 112)
# 英雄 / 表情 / 鸭子 / 系统用图
save_png(f'{G}/cards/hero/mole.png', f'{P}/hero/mole.png', 500)
save_png(f'{G}/cards/hero/jumping_mole.png', f'{P}/hero/jumping_mole.png', 400)
for e in ['happy', 'proud', 'surprised', 'love', 'confused', 'scared', 'smug', 'laughing_tears', 'sleepy', 'dizzy']:
    p = f'{G}/system/emotes/mole_{e}.png'
    if os.path.exists(p): save_png(p, f'{P}/emotes/mole_{e}.png', 220)
picks = {
    'duck': f'{G}/ui/shop/duck.png', 'duck_sign': f'{G}/ui/shop/duck_sign.png',
    'chest': f'{G}/cards/item/chest.png', 'floor_back': f'{G}/cards/terrain/terrain_floor_back.png',
    'stairs': f'{G}/cards/terrain/terrain_down.png', 'hole': f'{G}/cards/terrain/terrain_hole.png',
    'wall': f'{G}/cards/terrain/terrain_wall.png',
    'sword': f'{G}/cards/equipment/sword.png', 'lid': f'{G}/cards/equipment/lid.png',
    'mittens': f'{G}/cards/equipment/armor_mittens.png', 'rolling_pin': f'{G}/cards/equipment/weapon_rolling_pin.png',
    'slingshot': f'{G}/cards/equipment/weapon_slingshot.png', 'bandage': f'{G}/cards/item/bandage_item.png',
    'paw': f'{G}/ui/companion/pet_paw.png', 'pet_frame': f'{G}/ui/companion/pet_portrait_frame.png',
    'recruit_heart': f'{G}/ui/companion/recruit_heart.png',
    'skill_front': f'{G}/cards/frame/card_skill_front.png', 'card_monster': f'{G}/cards/frame/card_monster.png',
    'card_hero': f'{G}/cards/frame/card_hero.png',
    'castle': f'{G}/ui/loading/loading_castle.png', 'lock': f'{G}/ui/modes/icon_lock.png',
    'intent': f'{G}/ui/skill/intent_exclaim.png', 'crosshair': f'{G}/ui/skill/target_crosshair.png',
}
for k, v in picks.items():
    save_png(v, f'{P}/game/{k}.png', 360)
# 世界卡：场景 + 卡框（+ 试管），bw / color 各一张
worlds = ['01_grassland', '02_autumn', '03_desert', '04_ice', '05_deepsea', '06_crystalcave', '07_lava', '08_space']
S = W + '/world_select/slices'
for w in worlds:
    for mode in ['bw', 'color']:
        base = Image.new('RGBA', (600, 870), (0, 0, 0, 0))
        sc = Image.open(f'{S}/world_{w}/world_{w}_scene_{mode}.png').convert('RGBA')
        base.alpha_composite(sc, (36, 40))
        fr = Image.open(f'{S}/world_{w}/world_{w}_card_{mode}.png').convert('RGBA')
        base.alpha_composite(fr)
        tube = Image.open(f'{S}/world_{w}/world_{w}_tube_full_{mode}.png').convert('RGBA').rotate(-12, expand=True, resample=Image.BICUBIC)
        base.alpha_composite(tube, (474, 655))
        base = base.resize((360, 522), Image.LANCZOS)
        mk(f'{P}/worlds'); base.save(f'{P}/worlds/world_{w}_{mode}.png', optimize=True)
# 隐藏世界：云雾城堡（锁着、被雾挡住）
base = Image.new('RGBA', (600, 870), (0, 0, 0, 0))
sky = Image.open(f'{S}/world_07_lava/world_07_lava_scene_bw.png').convert('RGBA')
sky = Image.blend(sky.filter(ImageFilter.GaussianBlur(4)), Image.new('RGBA', sky.size, (245,245,242,255)), 0.55)
base.alpha_composite(sky, (36, 40))
castle = Image.open(f'{G}/ui/loading/loading_castle.png').convert('RGBA').resize((480, 458), Image.LANCZOS)
castle = castle.filter(ImageFilter.GaussianBlur(1.6))
a = castle.getchannel('A').point(lambda v: int(v * 0.7)); castle.putalpha(a)
base.alpha_composite(castle, (60, 70))
fogdir = W + '/fog'
for f, pos, sz in [('fog_04_wispy_streak.png', (-20, 150), 520), ('fog_01_wide_bank.png', (-60, 300), 720), ('fog_03_round_puff.png', (300, 330), 340), ('fog_05_double_lump.png', (-40, 470), 700), ('fog_01_wide_bank.png', (0, 560), 640)]:
    fg = Image.open(f'{fogdir}/{f}').convert('RGBA'); fg.thumbnail((sz, sz))
    base.alpha_composite(fg, pos)
mask = Image.new('L', (600, 870), 0)
from PIL import ImageDraw
ImageDraw.Draw(mask).rectangle((36, 40, 564, 720), fill=255)
clip = Image.new('RGBA', (600, 870), (0, 0, 0, 0)); clip.paste(base, (0, 0), mask)
fr = Image.open(f'{S}/shared/card_frame_bw.png').convert('RGBA'); clip.alpha_composite(fr)
lock = Image.open(f'{G}/ui/modes/icon_lock.png').convert('RGBA').resize((147, 174), Image.LANCZOS)
clip.alpha_composite(lock, (226, 470))
clip.resize((360, 522), Image.LANCZOS).save(f'{P}/worlds/world_09_castle_locked.png', optimize=True)
print('ok')
# 世界卡转 webp（带透明，体积小很多）
for f in os.listdir(f'{P}/worlds'):
    if f.endswith('.png'):
        Image.open(f'{P}/worlds/{f}').save(f'{P}/worlds/{f[:-4]}.webp', quality=86, method=6)
        os.remove(f'{P}/worlds/{f}')
# 各栏目 banner（出发整页的落选候选，宽景）
for i in (2, 3, 4):
    save_jpg(f'{W}/depart/出发整页_候选{i}.jpg', f'{P}/comic/banner_wide_{i}.jpg', 1920)
