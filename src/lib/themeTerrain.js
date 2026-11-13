// 主题卡背 + 空地 terrain_empty + 30% 主题地形散落（仅预览，不写回关卡 JSON）。
// 规则来自私仓 notes/工程/交接-主题地形卡背与空地散落.md。
//
// 种子：游戏仓 main（至 c27a1cb2）的 Level.ts 尚未接线散列，仍用旧 FLOOR_PREFAB /
// Date.now 发牌 RNG。官网按交接文字实现，并复用游戏 rules.ts 的 mulberry32，
// 以及 deal.ts 的 Fisher–Yates shuffle。
//   seed = fnv1a32(`${worldId}|${level}`)   // worldId + 关卡号或层序号
//   rng  = mulberry32(seed)
// 格子按 (y, x) 升序排好再洗牌，不放回抽 30%（四舍五入），再等概率抽主题 5 张地形（可重复）。
// 程序若在客户端改用另一套散列，需两边对齐后再改此文件。

/** 各主题可随机的 5 张地形（交接文档表格）。不要把 terrain_down 放进池。 */
export const THEME_TERRAIN_IDS = {
  world1: ['meadow_grass', 'clover_ground', 'daisy_ground', 'dandelion_ground', 'pebble_ground'],
  world2: ['maple_ground', 'pine_needle_ground', 'acorn_ground', 'mushroom_ground', 'moss_ground'],
  world3: ['sand_ground', 'cracked_ground', 'dune_pebble', 'cactus_ground', 'dry_grass_ground'],
  world4: ['snow_ground', 'cracked_ice', 'frost_pebble', 'tiny_pine_ground', 'frost_tuft_ground'],
  world5: ['sand_seabed', 'pebble_seabed', 'shell_ground', 'seagrass_ground', 'starfish_ground'],
  world6: ['crystal_ground', 'mica_pebble', 'quartz_scatter', 'glowmoss_ground', 'salt_crust'],
  world7: ['ash_ground', 'basalt_shard', 'sulfur_flake', 'cinder_scatter', 'pahoehoe_ground'],
  world8: ['tiny_star_ground', 'lunar_pebble', 'orbit_chip_ground', 'paper_star_ground', 'glass_lens_ground'],
  dungeon: ['flagstone_chip', 'rubble_shard', 'bone_scatter', 'rust_flake', 'dungeon_moss'],
  arena: ['packed_sand', 'straw_scatter', 'chalk_dust', 'wood_chip_ground', 'gravel_scatter'],
};

export const SCATTER_RATIO = 0.3;
const BLOCKED = new Set(['wall', 'pit', 'tree', 'lock', 'stairs']);

/** 卡牌资源文件夹。不用战斗底板的 grass / autumn / space。城堡暂缺，卡背回退 dungeon。 */
export function cardFolderOf(theme) {
  const t = String(theme || '').trim();
  if (!t || t === 'castle' || t === 'world9') return 'dungeon';
  if (THEME_TERRAIN_IDS[t]) return t;
  return 'dungeon';
}

/** 云雾城堡（castle / world9）散落先不做，空地 100% terrain_empty。 */
export function scatterEnabled(theme) {
  const t = String(theme || '').trim();
  if (t === 'castle' || t === 'world9') return false;
  return !!THEME_TERRAIN_IDS[cardFolderOf(t)];
}

/** FNV-1a 32-bit，把 worldId|level 收成 mulberry32 的种子。 */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function themeSeed(worldId, level) {
  return hash32(`${worldId ?? ''}|${level ?? ''}`);
}

/** 与 assets/scripts/rules.ts mulberry32 / mulberry32At 一致。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const rng = function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = function () { return a >>> 0; };
  return rng;
}

/** 与 deal.ts shuffle 一致。就地洗牌。 */
export function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/**
 * 计算散落：返回 Map("x,y" → 地形 id)。不修改 cells。
 * 只把 ground === "floor" 的格子（上面可以有客人或鼹鼠）放进池；
 * wall / pit / tree / lock / stairs 不进池。
 */
export function scatterFloorIds(cells, theme, worldId, level) {
  const out = new Map();
  if (!scatterEnabled(theme)) return out;
  const folder = cardFolderOf(theme);
  const ids = THEME_TERRAIN_IDS[folder];
  if (!ids || !ids.length) return out;
  const floors = (cells || [])
    .filter((c) => c && c.ground === 'floor')
    .map((c) => ({ x: c.x, y: c.y }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const n = Math.max(0, Math.min(floors.length, Math.round(floors.length * SCATTER_RATIO)));
  if (n === 0) return out;
  const rng = mulberry32(themeSeed(worldId || theme, level));
  const list = floors.map((c) => `${c.x},${c.y}`);
  shuffle(list, rng);
  for (let i = 0; i < n; i++) {
    out.set(list[i], ids[Math.floor(rng() * ids.length)]);
  }
  return out;
}

export function isBlockedGround(ground) {
  return BLOCKED.has(ground);
}

function joinAsset(base, path) {
  if (path == null || path === '') return path;
  const p = String(path);
  if (/^(?:[a-z]+:|\/\/|data:)/i.test(p)) return p;
  if (p.startsWith('./') || p.startsWith('../')) return p;
  const root = String(base ?? '.').replace(/\/+$/, '') || '.';
  const rest = p.replace(/^\//, '');
  if (root === '.' || root === './') return `./${rest}`;
  return `${root}/${rest}`;
}

function preferColor(base, pathNoExt) {
  // 同步脚本会同时写下 name.png（线稿）和 name_color.png（上色）。预览优先上色。
  return joinAsset(base, `${pathNoExt}_color.png`);
}

export function emptyFloorSrc(base) {
  return preferColor(base, 'images/cards/common/terrain_empty');
}

export function themeBackSrc(base, theme) {
  return preferColor(base, `images/cards/${cardFolderOf(theme)}/terrain/terrain_back`);
}

export function themeTerrainSrc(base, theme, terrainId) {
  return preferColor(base, `images/cards/${cardFolderOf(theme)}/terrain/${terrainId}`);
}

/** 预览用的卡背 + 正面路径。不改变 cell.ground。 */
export function cellPreviewArt(cell, { theme, scatter, lookup, base } = {}) {
  const back = themeBackSrc(base, theme);
  if (!cell) return { back, face: emptyFloorSrc(base) };
  if (cell.ground === 'floor') {
    const id = scatter && scatter.get(`${cell.x},${cell.y}`);
    return { back, face: id ? themeTerrainSrc(base, theme, id) : emptyFloorSrc(base) };
  }
  if (cell.ground === 'wall' && theme === 'arena' && lookup?.ground?.arena_wall) {
    return { back, face: lookup.ground.arena_wall.src };
  }
  const g = lookup?.ground?.[cell.ground];
  return { back, face: g?.src || emptyFloorSrc(base) };
}
