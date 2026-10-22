// 开场漫画 17 格（/workspace/story_comic_fix_v2），配一句话说明
export const PANELS = [
  '暴风雨的夜晚，鼹鼠的地洞小屋',
  '雷声轰隆，鼹鼠缩进了被子',
  '狂风大作，站都站不稳',
  '龙卷风把一切都卷上了天',
  '天旋地转……',
  '醒来时，身下是一张张卡牌',
  '“这……这是哪里？！”',
  '一个黑白的卡牌世界',
  '高高的卡牌石碑立在小路两旁',
  '遇见了一只哭泣的小刺猬',
  '花、小鸟、兔子和青蛙，都没有了颜色',
  '小刺猬指向远方',
  '一团影子抱着所有的颜色逃走了',
  '鼹鼠被撞晕，地上滚落一支试管',
  '试管里，还剩下一点点绿',
  '“我去把颜色找回来！”',
  '出发！八个世界藏在云雾后面',
].map((caption, i) => ({ n: i + 1, src: `/images/comic/panel_${String(i + 1).padStart(2, '0')}.jpg`, caption }));

export const WORLDS = [
  { no: 1, key: '01_grassland', name: '草原', line: '风吹过起伏的草坡，冒险从这里开始。' },
  { no: 2, key: '02_autumn', name: '秋林', line: '落叶铺满小路，枫树把天边染成金红。' },
  { no: 3, key: '03_desert', name: '沙漠', line: '烈日、沙丘和孤零零的石柱。' },
  { no: 4, key: '04_ice', name: '冰原', line: '冰峰连着冰峰，脚下咯吱咯吱响。' },
  { no: 5, key: '05_deepsea', name: '深海', line: '水下的光柱里，鱼群和珊瑚安静漂浮。' },
  { no: 6, key: '06_crystalcave', name: '晶洞', line: '钟乳石和水晶壁，洞里闪着细碎的光。' },
  { no: 7, key: '07_lava', name: '熔岩', line: '火山在冒烟，地上的裂缝发着红光。' },
  { no: 8, key: '08_space', name: '星空', line: '星河铺开，远处有一个吞掉光的黑洞。' },
];
