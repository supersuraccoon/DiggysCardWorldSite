#!/usr/bin/env node
/**
 * 批量生成机制试玩 JSON。
 * 写到 diggy_levels/testcases/ 与 server_hosting/diggy_levels/testcases/（404.json 不动）。
 * 不写游戏仓 assets/resources/levels/testcases/。
 *
 * 用法：node scripts/gen_testcases.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME = path.resolve(ROOT, "../DiggysCardWorld");
const OUT_A = path.join(ROOT, "diggy_levels", "testcases");
const OUT_B = path.join(ROOT, "server_hosting", "diggy_levels", "testcases");
const KEEP = new Set(["testcase_mechanic_hunt_hidden", "testcase_composite_snake"]);
const STAMP = "2026-11-04T12:00:00.000Z";
const COLS = 10;
const ROWS = 5;

const STATUSES = [
  { id: "shield", name: "护盾", gear: "lid", effects: [{ id: "shield", value: 5, turns: 0, every: 1 }], tooth: 3, hunt: "idle", title: "状态·护盾", goal: "捡锅盖，站着挨打，看护盾是否生效" },
  { id: "dodge", name: "闪避", gear: "lid", effects: [{ id: "dodge", value: 1, turns: 0, every: 1 }], tooth: 3, hunt: "idle", title: "状态·闪避", goal: "捡锅盖，站着挨打，看闪避是否生效" },
  { id: "lifesteal", name: "吸血", gear: "sword", effects: [{ id: "lifesteal", value: 50, turns: 0, every: 1 }], tooth: 0, hunt: "idle", title: "状态·吸血", goal: "捡剑普攻怪，看吸血" },
  { id: "crit", name: "暴击", gear: "sword", effects: [{ id: "crit", value: 1, turns: 0, every: 1 }], tooth: 0, hunt: "idle", title: "状态·暴击", goal: "捡剑普攻怪，看暴击" },
  { id: "thorns", name: "荆棘", gear: "lid", effects: [{ id: "thorns", value: 2, turns: 0, every: 1 }], tooth: 3, hunt: "idle", title: "状态·荆棘", goal: "捡锅盖，站着挨打，看荆棘是否生效" },
  { id: "immune", name: "免疫", gear: "lid", effects: [{ id: "immune", value: 1, turns: 0, every: 1 }], tooth: 3, hunt: "idle", title: "状态·免疫", goal: "捡锅盖，站着挨打，看免疫是否生效" },
  { id: "revive", name: "复活", gear: "lid", effects: [{ id: "revive", value: 5, turns: 0, every: 1 }], tooth: 3, hunt: "idle", title: "状态·复活", goal: "捡锅盖，站着挨打，看复活是否生效" },
  { id: "regen", name: "回血", gear: "lid", effects: [{ id: "regen", value: 2, turns: 0, every: 1 }], tooth: 1, hunt: "idle", title: "状态·回血", goal: "捡锅盖，观察自身回血" },
  { id: "atk", name: "加攻", gear: "sword", effects: [{ id: "atk", value: 3, turns: 0, every: 1 }], tooth: 0, hunt: "idle", title: "状态·加攻", goal: "捡剑普攻怪，看加攻" },
  { id: "hp", name: "加血", gear: "lid", effects: [{ id: "hp", value: 10, turns: 0, every: 1 }], tooth: 1, hunt: "idle", title: "状态·加血", goal: "捡锅盖，观察自身加血" },
  { id: "reflect", name: "反弹", gear: "lid", effects: [{ id: "reflect", value: 1, turns: 0, every: 1 }], tooth: 3, hunt: "idle", title: "状态·反弹", goal: "捡锅盖，站着挨打，看反弹是否生效" },
  { id: "combo", name: "连击", gear: "sword", effects: [{ id: "combo", value: 2, turns: 0, every: 1 }], tooth: 0, hunt: "idle", title: "状态·连击", goal: "捡剑普攻怪，看连击" },
  { id: "poison", name: "中毒", gear: "sword", effects: [{ id: "poison", value: 2, turns: 3, every: 1 }], tooth: 0, hunt: "idle", title: "状态·中毒", goal: "捡剑普攻怪，看怪身上出现中毒" },
  { id: "weak", name: "虚弱", gear: "sword", effects: [{ id: "weak", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "idle", title: "状态·虚弱", goal: "捡剑普攻怪，看怪身上出现虚弱" },
  { id: "sunder", name: "破甲", gear: "sword", effects: [{ id: "sunder", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "idle", title: "状态·破甲", goal: "捡剑普攻怪，看怪身上出现破甲" },
  { id: "silence", name: "沉默", gear: "sword", effects: [{ id: "silence", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "idle", title: "状态·沉默", goal: "捡剑普攻怪，看怪身上出现沉默" },
  { id: "confuse", name: "混乱", gear: "sword", effects: [{ id: "confuse", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "idle", title: "状态·混乱", goal: "捡剑普攻怪，看怪身上出现混乱" },
  { id: "bleed", name: "流血", gear: "sword", effects: [{ id: "bleed", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "idle", title: "状态·流血", goal: "捡剑普攻怪，看怪身上出现流血" },
  { id: "stun", name: "眩晕", gear: "sword", effects: [{ id: "stun", value: 1, turns: 1, every: 1 }], tooth: 0, hunt: "chase", title: "状态·眩晕", goal: "捡剑普攻怪，看怪身上出现眩晕" },
  { id: "knockback", name: "击退", gear: "sword", effects: [{ id: "knockback", value: 2, turns: 0, every: 1 }], tooth: 0, hunt: "idle", extras: true, title: "状态·击退", goal: "捡剑普攻怪，看击退" },
  { id: "range", name: "射程", gear: "sword", effects: [{ id: "range", value: 3, turns: 0, every: 1, shape: 0 }], tooth: 0, hunt: "idle", extras: true, title: "状态·射程", goal: "捡剑普攻怪，看射程" },
  { id: "splash", name: "溅射", gear: "sword", effects: [{ id: "splash", value: 1, turns: 0, every: 1, damageScale: 0.5 }], tooth: 0, hunt: "idle", extras: true, title: "状态·溅射", goal: "捡剑普攻怪，看溅射" },
  { id: "bounce", name: "弹射", gear: "sword", effects: [{ id: "bounce", value: 1, turns: 0, every: 1 }], tooth: 0, hunt: "idle", extras: true, title: "状态·弹射", goal: "捡剑普攻怪，看弹射" },
  { id: "stuck", name: "黏住", gear: "sword", effects: [{ id: "stuck", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "chase", title: "状态·黏住", goal: "捡剑普攻怪，看怪身上出现黏住" },
  { id: "stealth", name: "隐身", gear: "lid", effects: [{ id: "stealth", value: 1, turns: 0, every: 1 }], tooth: 1, hunt: "chase", title: "状态·隐身", goal: "捡锅盖，观察自身隐身" },
  { id: "fly", name: "飞行", gear: "lid", effects: [{ id: "fly", value: 1, turns: 0, every: 1 }], tooth: 1, hunt: "idle", pit: true, title: "状态·飞行", goal: "捡锅盖后试着走过洞" },
  { id: "freeze", name: "冰冻", gear: "sword", effects: [{ id: "freeze", value: 1, turns: 3, every: 1 }], tooth: 0, hunt: "chase", title: "状态·冰冻", goal: "捡剑普攻怪，看怪身上出现冰冻" },
];

const HERO_SKILLS = [
  { id: "venom_lick", name: "毒液舔舔" },
  { id: "venom_bite", name: "毒液咬咬" },
  { id: "venom_bomb", name: "毒液炸弹" },
  { id: "venom_fang", name: "毒牙牙" },
  { id: "pot_lid_up", name: "锅盖举举" },
  { id: "frying_pan", name: "平底锅咚" },
  { id: "dong_drum", name: "咚咚鼓" },
  { id: "pat_head", name: "摸摸头" },
  { id: "mole_claw", name: "爪爪爪" },
  { id: "mole_spike", name: "地刺" },
  { id: "mole_top", name: "鼹鼠陀螺" },
];

const MONSTER_SKILLS = [
  { id: "venom_lick", name: "毒液舔舔", trigger: "active", side: "foe" },
  { id: "venom_bite", name: "毒液咬咬", trigger: "active", side: "foe" },
  { id: "venom_bomb", name: "毒液炸弹", trigger: "active", side: "foe" },
  { id: "venom_fang", name: "毒牙牙", trigger: "on_hit", side: "foe" },
  { id: "pot_lid_up", name: "锅盖举举", trigger: "active", side: "ally" },
  { id: "frying_pan", name: "平底锅咚", trigger: "active", side: "foe" },
  { id: "dong_drum", name: "咚咚鼓", trigger: "active", side: "foe" },
  { id: "pat_head", name: "摸摸头", trigger: "active", side: "ally" },
  { id: "mole_claw", name: "爪爪爪", trigger: "active", side: "foe" },
  { id: "mole_spike", name: "地刺", trigger: "active", side: "foe" },
  { id: "mole_top", name: "鼹鼠陀螺", trigger: "active", side: "foe" },
  { id: "tiny_flame", name: "小火苗", trigger: "active", side: "foe" },
  { id: "hot_spatula", name: "烫烫锅铲", trigger: "active", side: "foe" },
  { id: "fire_ball", name: "大火球", trigger: "active", side: "foe" },
  { id: "water_gun", name: "呲呲水枪", trigger: "active", side: "foe" },
  { id: "water_bucket", name: "哗啦水桶", trigger: "active", side: "foe" },
  { id: "flood_wave", name: "大浪浪", trigger: "active", side: "foe" },
  { id: "ice_cube", name: "小冰块", trigger: "active", side: "foe" },
  { id: "popsicle", name: "冰棒棒", trigger: "active", side: "foe" },
  { id: "blizzard", name: "呼呼暴风雪", trigger: "active", side: "foe" },
  { id: "ice_spike", name: "冰锥", trigger: "active", side: "foe" },
  { id: "freeze_cast", name: "冰冻", trigger: "on_hit", side: "foe" },
  { id: "lightning", name: "落雷", trigger: "active", side: "foe" },
  { id: "meteor", name: "陨石", trigger: "active", side: "foe" },
  { id: "laser", name: "激光", trigger: "active", side: "foe" },
  { id: "quake", name: "地震", trigger: "active", side: "foe" },
  { id: "whirlwind", name: "旋风", trigger: "active", side: "foe" },
  { id: "stardust", name: "星光", trigger: "active", side: "foe" },
  { id: "blackhole", name: "黑洞", trigger: "active", side: "foe" },
  { id: "swap", name: "换位", trigger: "active", side: "foe" },
  { id: "burrow", name: "挖洞", trigger: "active", side: "ally" },
  { id: "steal_coin", name: "偷金币", trigger: "active", side: "foe" },
  { id: "bubble", name: "泡泡", trigger: "active", side: "foe" },
  { id: "sandstorm", name: "沙暴", trigger: "active", side: "foe" },
  { id: "split", name: "分裂", trigger: "active", side: "ally" },
  { id: "summon", name: "出小蜘蛛", trigger: "on_hit", side: "ally" },
  { id: "sacrifice", name: "献祭", trigger: "active", side: "foe" },
  { id: "mirror_copy", name: "镜像", trigger: "active", side: "foe" },
  { id: "sleep", name: "睡眠", trigger: "active", side: "foe" },
  { id: "entangle", name: "缠绕", trigger: "active", side: "foe" },
  { id: "honey", name: "蜜糖", trigger: "active", side: "foe" },
  { id: "blind", name: "致盲", trigger: "active", side: "foe" },
  { id: "slow", name: "减速", trigger: "active", side: "foe" },
  { id: "haste", name: "加速", trigger: "active", side: "ally" },
  { id: "shrink", name: "变小", trigger: "active", side: "foe" },
  { id: "charm", name: "魅惑", trigger: "active", side: "foe" },
  { id: "taunt", name: "嘲讽", trigger: "active", side: "ally" },
  { id: "curse", name: "诅咒", trigger: "active", side: "foe" },
  { id: "charge", name: "蓄力", trigger: "active", side: "ally" },
  { id: "luck", name: "幸运", trigger: "active", side: "ally" },
  { id: "pillow_block", name: "枕头挡挡", trigger: "active", side: "ally" },
  { id: "blanket_fort", name: "被窝城堡", trigger: "active", side: "ally" },
  { id: "shell_tuck", name: "缩缩壳", trigger: "on_hurt", side: "ally" },
  { id: "big_bonk", name: "超级大咚", trigger: "active", side: "foe" },
  { id: "bubble_wrap", name: "泡泡飘飘", trigger: "active", side: "ally" },
  { id: "bedsheet_ghost", name: "床单隐身", trigger: "active", side: "ally" },
  { id: "soap_slide", name: "肥皂溜溜", trigger: "active", side: "ally" },
  { id: "straw_sip", name: "吸管吸吸", trigger: "active", side: "ally" },
  { id: "juice_slurp", name: "果汁咕嘟", trigger: "active", side: "ally" },
  { id: "big_slurp", name: "大口吸溜", trigger: "active", side: "ally" },
  { id: "pencil_sharpen", name: "削削铅笔", trigger: "active", side: "ally" },
  { id: "sharp_sharp", name: "尖尖尖", trigger: "active", side: "ally" },
  { id: "cactus_hug", name: "仙人掌抱抱", trigger: "active", side: "ally" },
  { id: "prickly_sweater", name: "刺刺毛衣", trigger: "active", side: "ally" },
  { id: "hedgehog_bag", name: "刺猬睡袋", trigger: "active", side: "ally" },
  { id: "face_mask", name: "戴戴口罩", trigger: "active", side: "ally" },
  { id: "bubble_bath", name: "泡泡浴", trigger: "active", side: "ally" },
  { id: "nine_lives", name: "九条命", trigger: "active", side: "ally" },
  { id: "hug_patch", name: "抱抱贴", trigger: "active", side: "ally" },
  { id: "warm_milk", name: "热牛奶", trigger: "active", side: "ally" },
  { id: "cozy_quilt", name: "暖暖被子", trigger: "active", side: "ally" },
  { id: "extra_bowl", name: "再来一碗", trigger: "active", side: "ally" },
  { id: "big_tummy", name: "圆滚滚", trigger: "active", side: "ally" },
  { id: "heal", name: "治疗", trigger: "active", side: "ally" },
  { id: "regen_sprout", name: "再生", trigger: "active", side: "ally" },
  { id: "grind_teeth", name: "磨磨牙", trigger: "active", side: "ally" },
  { id: "angry_puff", name: "气鼓鼓", trigger: "active", side: "ally" },
  { id: "super_angry", name: "超级生气", trigger: "active", side: "ally" },
  { id: "mirror_peek", name: "照照镜子", trigger: "active", side: "ally" },
  { id: "mirror_wall", name: "镜子墙", trigger: "active", side: "ally" },
  { id: "pat_pat", name: "啪啪", trigger: "active", side: "ally" },
  { id: "drum_roll", name: "啪啪啪", trigger: "active", side: "ally" },
  { id: "tickle", name: "挠痒痒", trigger: "active", side: "foe" },
  { id: "big_yawn", name: "打哈欠", trigger: "active", side: "foe" },
  { id: "lullaby", name: "摇篮曲", trigger: "active", side: "foe" },
  { id: "shush", name: "嘘安静", trigger: "active", side: "foe" },
  { id: "tape_mouth", name: "胶带封嘴", trigger: "active", side: "foe" },
  { id: "spin_spin", name: "转圈圈", trigger: "active", side: "foe" },
  { id: "dizzy_top", name: "晕晕陀螺", trigger: "active", side: "foe" },
  { id: "prick", name: "小刺刺", trigger: "active", side: "foe" },
  { id: "snip_snip", name: "剪刀咔嚓", trigger: "active", side: "foe" },
  { id: "thorn_storm", name: "刺刺雨", trigger: "active", side: "foe" },
  { id: "nudge", name: "推推", trigger: "active", side: "foe" },
  { id: "bouncy_ball", name: "弹弹球", trigger: "active", side: "foe" },
  { id: "hair_dryer", name: "吹风机", trigger: "active", side: "foe" },
  { id: "snore_suck", name: "呼噜吸", trigger: "active", side: "foe" },
  { id: "sonic", name: "音波", trigger: "active", side: "foe" },
  { id: "bedtime_story", name: "讲故事", trigger: "active", side: "ally" },
  { id: "cheer_buddy", name: "点个赞", trigger: "active", side: "ally" },
  { id: "group_hug", name: "抱成一团", trigger: "active", side: "ally" },
  { id: "wipe_clean", name: "擦擦干净", trigger: "active", side: "ally" },
  { id: "wake_up", name: "起床啦", trigger: "on_reveal", side: "ally" },
  { id: "purify", name: "净化", trigger: "active", side: "ally" },
  { id: "smelly_cloud", name: "臭臭云", trigger: "active", side: "foe" },
  { id: "sticky_web", name: "黏黏蛛网", trigger: "on_hit", side: "foe" },
  { id: "hug_and_bite", name: "抱住咬", trigger: "active", side: "foe" },
  { id: "iron_turtle", name: "铁乌龟", trigger: "active", side: "ally" },
  { id: "ring_ring", name: "叮铃铃", trigger: "on_reveal", side: "foe" },
  { id: "cheer_up", name: "加油加油", trigger: "active", side: "ally" },
  { id: "pop_goodbye", name: "啪嗒散开", trigger: "on_death", side: "foe" },
  { id: "glare_light", name: "刺眼光", trigger: "active", side: "foe" },
  { id: "wet", name: "湿漉漉", trigger: "on_hit", side: "foe" },
  { id: "ignite", name: "着火", trigger: "on_hit", side: "foe" },
  { id: "teleport", name: "传送", trigger: "active", side: "ally" },
];

const EVENTS = [
  { id: "chest", name: "黑色宝箱", goal: "踩邻格黑色宝箱，看开箱" },
  { id: "duck", name: "黄头鸭的商店", chest: true, goal: "先开邻格宝箱拿钱，再进黄头鸭商店" },
  { id: "cottage", name: "爱心小屋", boo: true, goal: "可先挨一下打，再进爱心小屋" },
  { id: "hotspring", name: "咕嘟温泉", boo: true, goal: "可先挨一下打，再进咕嘟温泉" },
  { id: "spinner", name: "怪兽转盘", goal: "踩邻格怪兽转盘，看转出来的怪" },
  { id: "cabin", name: "怪物小屋", goal: "踩邻格小屋进怪物小屋，打完回来" },
  { id: "crow", name: "乌鸦的卷轴商店", chest: true, goal: "先开邻格宝箱拿钱，再进乌鸦卷轴店" },
  { id: "raccoon", name: "创可贴浣熊的补给站", chest: true, goal: "先开邻格宝箱拿钱，再进浣熊补给站" },
  { id: "capybara", name: "卡皮巴拉的银行", chest: true, goal: "先开邻格宝箱拿钱，再进卡皮巴拉银行" },
  { id: "owl", name: "咕咕猫头鹰的换装屋", chest: true, goal: "先开邻格宝箱拿钱，再进猫头鹰换装屋" },
  { id: "event_teleport", name: "传送阵", goal: "踩上去随机传到空地" },
  { id: "falltrap", name: "落下陷阱", goal: "踩上去观察触发即可（单层没有下一层）" },
];

const COSTUMES = [
  { id: "diving", name: "潜水服", goal: "捡潜水服换上，看 HUD 心上限" },
  { id: "space", name: "宇航服", pits: [[4, 1], [4, 2]], goal: "捡宇航服换上，试着站到洞上" },
  { id: "penguin", name: "企鹅服", boo: { hunt: "chase" }, goal: "捡企鹅服换上，普攻看是否打晕" },
  { id: "ninja", name: "忍者服", boo: { tooth: 3 }, goal: "捡忍者服换上，站着挨打看闪避" },
  { id: "halloween", name: "万圣节", boo: { heart: 10 }, goal: "捡万圣节换上，把怪打到半血看是否询问加入" },
  { id: "christmas", name: "圣诞服", extras: true, heart: 3, goal: "捡圣诞服换上，击败怪物看是否掉补给" },
  { id: "miner", name: "矿工服", walls: [[4, 1], [4, 2], [4, 3]], goal: "捡矿工服换上，试着破开挡路的墙" },
  { id: "cat", name: "猫猫服", boo: {}, goal: "捡猫猫服换上，普攻看是否多打一下" },
  { id: "frog", name: "青蛙服", boo: { hunt: "chase" }, goal: "捡青蛙服换上，看是否再动一次" },
  { id: "zombie", name: "僵尸服", boo: {}, goal: "捡僵尸服换上，看心上限和牙" },
];

function blankCell(x, y) {
  const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
  return { x, y, ground: edge ? "wall" : "floor", catalog: "", mole: false };
}

function arenaCells() {
  const cells = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      cells.push(blankCell(x, y));
    }
  }
  put(cells, 1, 1, { mole: true });
  put(cells, 8, 3, { ground: "stairs" });
  return cells;
}

function put(cells, x, y, patch) {
  const i = y * COLS + x;
  const cur = cells[i];
  if (!cur) {
    throw new Error("oob " + x + "," + y);
  }
  Object.assign(cur, patch);
}

function booAt(x, y, extra) {
  const o = extra || {};
  const cell = {
    catalog: "boo",
    heart: o.heart != null ? o.heart : 20,
    tooth: o.tooth != null ? o.tooth : 0,
    armor: 0,
    hunt: o.hunt || "idle",
  };
  if (o.hidden) {
    cell.hidden = true;
  }
  if (o.skills) {
    cell.skills = o.skills;
  }
  return { x, y, ...cell };
}

function apply(cells, patches) {
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    const { x, y, ...rest } = p;
    put(cells, x, y, rest);
  }
}

function layer(id, title, category, goal, arena, patches) {
  const cells = arenaCells();
  apply(cells, patches);
  return {
    schemaVersion: 1,
    table: "机制试玩",
    id,
    theme: "arena",
    cols: COLS,
    rows: ROWS,
    arena,
    cells,
    title,
    category,
    goal,
    updatedAt: STAMP,
  };
}

function indexRow(file) {
  return {
    id: file.id,
    title: file.title,
    category: file.category,
    goal: file.goal,
    theme: file.theme,
    cols: file.cols,
    rows: file.rows,
    updatedAt: file.updatedAt,
  };
}

function extraBoos(heart) {
  const h = heart != null ? heart : 20;
  return [booAt(5, 1, { heart: h }), booAt(3, 2, { heart: h }), booAt(4, 1, { heart: h })];
}

function makeAll() {
  const files = [];
  const order = { status: [], skill_hero: [], skill_monster: [], event: [], costume: [] };

  for (let i = 0; i < STATUSES.length; i++) {
    const s = STATUSES[i];
    const id = "testcase_status_" + s.id;
    const patches = [
      { x: 2, y: 1, catalog: s.gear, effects: s.effects },
    ];
    if (s.pit) {
      patches.push({ x: 4, y: 1, ground: "pit", catalog: "", mole: false });
      patches.push(booAt(3, 1, { tooth: s.tooth, hunt: s.hunt }));
    } else {
      patches.push(booAt(3, 1, { tooth: s.tooth, hunt: s.hunt }));
      if (s.extras) {
        patches.push(...extraBoos());
      }
    }
    files.push(layer(id, s.title, "status", s.goal, true, patches));
    order.status.push(id);
  }

  for (let i = 0; i < HERO_SKILLS.length; i++) {
    const s = HERO_SKILLS[i];
    const id = "testcase_skill_hero_" + s.id;
    files.push(layer(id, "技能·英雄" + s.name, "skill", "捡邻格技能卡启用，再对怪放" + s.name, true, [
      { x: 2, y: 1, catalog: s.id },
      booAt(3, 1, { tooth: 0 }),
    ]));
    order.skill_hero.push(id);
  }

  for (let i = 0; i < MONSTER_SKILLS.length; i++) {
    const s = MONSTER_SKILLS[i];
    const id = "testcase_skill_monster_" + s.id;
    const skill = { id: s.id, cooldown: 2, firstCd: 0, chance: 100, uses: -1 };
    const heart = s.trigger === "on_death" ? 3 : 20;
    const hidden = s.trigger === "on_reveal";
    const patches = [
      booAt(3, 1, { tooth: 1, heart, hidden, skills: [skill] }),
    ];
    if (s.trigger === "active" && s.side === "ally" && s.id !== "summon") {
      patches.push(booAt(4, 1, { heart: 10, tooth: 0 }));
    }
    if (s.trigger === "on_hurt") {
      patches.push({ x: 2, y: 2, catalog: "sword" });
    }
    if (s.id === "steal_coin") {
      patches.push({ x: 2, y: 2, catalog: "chest" });
    }
    let goal = "邻格怪会放" + s.name;
    if (s.trigger === "on_reveal") {
      goal = "翻开隐藏怪，看" + s.name;
    } else if (s.trigger === "on_death") {
      goal = "打死邻格怪，看" + s.name;
    } else if (s.trigger === "on_hit" || s.trigger === "on_hurt") {
      goal = "普攻邻格怪，看" + s.name;
    }
    if (s.id === "steal_coin") {
      goal = "先捡金币，再让邻格怪放偷金币";
    }
    files.push(layer(id, "技能·怪" + s.name, "skill", goal, true, patches));
    order.skill_monster.push(id);
  }

  for (let i = 0; i < EVENTS.length; i++) {
    const s = EVENTS[i];
    const id = "testcase_event_" + s.id;
    const patches = [{ x: 2, y: 1, catalog: s.id }];
    if (s.chest) {
      patches.push({ x: 2, y: 2, catalog: "chest" });
    }
    if (s.boo) {
      patches.push(booAt(3, 2, { tooth: 1, heart: 20 }));
    }
    files.push(layer(id, "事件·" + s.name, "event", s.goal, false, patches));
    order.event.push(id);
  }

  for (let i = 0; i < COSTUMES.length; i++) {
    const s = COSTUMES[i];
    const id = "testcase_costume_" + s.id;
    const patches = [{ x: 2, y: 1, catalog: s.id }];
    if (s.pits) {
      for (let j = 0; j < s.pits.length; j++) {
        patches.push({ x: s.pits[j][0], y: s.pits[j][1], ground: "pit", catalog: "", mole: false });
      }
    }
    if (s.walls) {
      for (let j = 0; j < s.walls.length; j++) {
        patches.push({ x: s.walls[j][0], y: s.walls[j][1], ground: "wall", catalog: "", mole: false });
      }
    }
    if (s.boo) {
      patches.push(booAt(3, 1, s.boo));
    }
    if (s.extras) {
      patches.push(booAt(3, 1, { heart: s.heart, tooth: 0 }));
      patches.push(booAt(5, 1, { heart: s.heart, tooth: 0 }));
      patches.push(booAt(3, 2, { heart: s.heart, tooth: 0 }));
    }
    files.push(layer(id, "服装·" + s.name, "item", s.goal, false, patches));
    order.costume.push(id);
  }

  return { files, order };
}

function writeJson(dir, name, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n");
}

function mergeIndex(oldIndex, generated) {
  const byId = {};
  const keepOrder = [];
  const oldLevels = oldIndex && Array.isArray(oldIndex.levels) ? oldIndex.levels : [];
  for (let i = 0; i < oldLevels.length; i++) {
    const row = oldLevels[i];
    if (!row || !row.id) {
      continue;
    }
    keepOrder.push(row.id);
    byId[row.id] = row;
  }
  const genById = {};
  for (let i = 0; i < generated.files.length; i++) {
    const file = generated.files[i];
    genById[file.id] = indexRow(file);
    byId[file.id] = genById[file.id];
  }
  const seen = {};
  const levels = [];
  for (let i = 0; i < keepOrder.length; i++) {
    const id = keepOrder[i];
    if (seen[id]) {
      continue;
    }
    seen[id] = true;
    levels.push(byId[id]);
  }
  const appendGroups = ["status", "skill_hero", "skill_monster", "event", "costume"];
  for (let g = 0; g < appendGroups.length; g++) {
    const ids = generated.order[appendGroups[g]];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (seen[id]) {
        continue;
      }
      seen[id] = true;
      levels.push(byId[id]);
    }
  }
  return { schemaVersion: 1, updatedAt: STAMP, levels };
}

function copyKeep(fromDir, toDir) {
  KEEP.forEach(function (id) {
    const name = id + ".json";
    const src = path.join(fromDir, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(toDir, name));
    }
  });
}

function main() {
  if (MONSTER_SKILLS.length !== 114) {
    throw new Error("monster skills " + MONSTER_SKILLS.length + " != 114");
  }
  if (STATUSES.length !== 27 || HERO_SKILLS.length !== 11 || EVENTS.length !== 12 || COSTUMES.length !== 10) {
    throw new Error("batch counts off");
  }
  const generated = makeAll();
  if (generated.files.length !== 174) {
    throw new Error("generated " + generated.files.length + " != 174");
  }
  const oldA = JSON.parse(fs.readFileSync(path.join(OUT_A, "index.json"), "utf8"));
  const index = mergeIndex(oldA, generated);
  if (index.levels.length !== 176) {
    throw new Error("index " + index.levels.length + " != 176");
  }

  fs.mkdirSync(OUT_A, { recursive: true });
  fs.mkdirSync(OUT_B, { recursive: true });
  copyKeep(OUT_A, OUT_A);
  for (let i = 0; i < generated.files.length; i++) {
    const file = generated.files[i];
    writeJson(OUT_A, file.id + ".json", file);
  }
  writeJson(OUT_A, "index.json", index);

  const names = fs.readdirSync(OUT_A).filter((n) => n.endsWith(".json") && n !== "404.json");
  for (let i = 0; i < names.length; i++) {
    fs.copyFileSync(path.join(OUT_A, names[i]), path.join(OUT_B, names[i]));
  }
  if (fs.existsSync(path.join(OUT_B, "404.json")) === false && fs.existsSync(path.join(OUT_A, "404.json"))) {
    fs.copyFileSync(path.join(OUT_A, "404.json"), path.join(OUT_B, "404.json"));
  }

  const validator = path.join(GAME, "tools", "validate-testcases.mts");
  const run = spawnSync(process.execPath, ["--experimental-strip-types", validator, OUT_A, OUT_B], {
    encoding: "utf8",
    cwd: GAME,
  });
  if (run.stdout) {
    process.stdout.write(run.stdout);
  }
  if (run.stderr) {
    process.stderr.write(run.stderr);
  }
  if (run.status !== 0) {
    throw new Error("validate failed");
  }
  console.log("wrote", generated.files.length, "testcases + index", index.levels.length, "rows");
}

main();
