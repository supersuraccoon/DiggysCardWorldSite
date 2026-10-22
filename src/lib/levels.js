// 冒险关卡 JSON（notes/配置表/json/关卡/world{N}.json）的公共逻辑：网页编辑器用。
// 和 tools/sync-levels.mjs 的常量 / 格式保持一致（那边不依赖网站，所以各写一份）。

export const SCHEMA_VERSION = 1;
export const LEVELS_PER_WORLD = 10;
export const DEFAULT_SIZE = { cols: 10, rows: 7 }; // = LevelDungeonPrefab（地下城桌子）
export const MAX_SIDE = 20;
export const WORLDS = [
  { id: 'world1', index: 1, name: '草原', hidden: false },
  { id: 'world2', index: 2, name: '秋林', hidden: false },
  { id: 'world3', index: 3, name: '沙漠', hidden: false },
  { id: 'world4', index: 4, name: '冰原', hidden: false },
  { id: 'world5', index: 5, name: '深海', hidden: false },
  { id: 'world6', index: 6, name: '晶洞', hidden: false },
  { id: 'world7', index: 7, name: '熔岩', hidden: false },
  { id: 'world8', index: 8, name: '星空', hidden: false },
  { id: 'castle', index: 9, name: '云雾城堡', hidden: true },
];
// = deal.ts DealGround。墙和坑挡路，地板和楼梯能走（rules.ts：pit 只有飞的能过）
export const GROUNDS = [
  { id: 'floor', name: '地板', walkable: true },
  { id: 'wall', name: '墙', walkable: false },
  { id: 'pit', name: '坑', walkable: false },
  { id: 'stairs', name: '楼梯', walkable: true },
];
export const walkable = (g) => g === 'floor' || g === 'stairs';
export const prefabNameOf = (w, level) => `World${w.index}Level${level}`;

export const blankCell = (x, y) => ({ x, y, ground: 'floor', catalog: '', mole: false });
export function blankCells(cols, rows) {
  const out = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push(blankCell(x, y));
  return out;
}
export function blankLevel(level, size = DEFAULT_SIZE) {
  return { level, cols: size.cols, rows: size.rows, note: '', shopGoods: null, cells: blankCells(size.cols, size.rows) };
}
export function blankWorld(w) {
  return {
    schemaVersion: SCHEMA_VERSION, table: '关卡',
    world: { ...w, prefabDir: `World${w.index}` },
    updatedAt: new Date().toISOString(),
    defaults: { ...DEFAULT_SIZE },
    levels: Array.from({ length: LEVELS_PER_WORLD }, (_, i) => blankLevel(i + 1)),
  };
}

/** 稠密、按行排好的格子（缺的补地板，多余 / 越界的丢掉） */
export function normalizeCells(lv) {
  const m = new Map();
  for (const c of lv.cells || []) m.set(`${c.x},${c.y}`, c);
  const out = [];
  for (let y = 0; y < lv.rows; y++) {
    for (let x = 0; x < lv.cols; x++) {
      const c = m.get(`${x},${y}`);
      out.push(c ? { x, y, ground: c.ground || 'floor', catalog: c.catalog || '', mole: !!c.mole } : blankCell(x, y));
    }
  }
  return out;
}
export function normalizeWorld(d) {
  return { ...d, levels: (d.levels || []).map((lv) => ({ ...lv, shopGoods: lv.shopGoods ?? null, note: lv.note ?? '', cells: normalizeCells(lv) })) };
}
export const cellIndex = (lv, x, y) => y * lv.cols + x;
export function resizeLevel(lv, cols, rows) {
  const old = new Map(lv.cells.map((c) => [`${c.x},${c.y}`, c]));
  const cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push(old.get(`${x},${y}`) || blankCell(x, y));
  return { ...lv, cols, rows, cells };
}
export const isEmptyLevel = (lv) => !lv.cells.some((c) => c.mole || c.catalog || c.ground !== 'floor');

/** 世界 JSON 的固定格式：2 空格缩进，每个格子一行（和 sync-levels.mjs 一样） */
export function formatWorldJson(data) {
  return JSON.stringify(data, null, 2).replace(/\{\n\s+"x": [^{}[\]]*?\n\s+\}/g, (m) =>
    m.replace(/\n\s+/g, ' ').replace('{ ', '{').replace(' }', '}')) + '\n';
}
export const levelKey = (lv) => JSON.stringify({ c: lv.cols, r: lv.rows, cells: lv.cells, s: lv.shopGoods ?? null, n: lv.note ?? '' });

// ---------------------------------------------------------------- 检查
/**
 * known: { kindOf(id) -> 'monster'|'equipment'|'item'|'store'|null, shop: Set }
 * 返回 [{level, sev: 'err'|'warn'|'info', msg, cells?: [[x,y]]}]
 */
export function validateLevel(lv, known) {
  const out = [];
  const E = (msg, cells) => out.push({ level: lv.level, sev: 'err', msg, cells });
  const W = (msg, cells) => out.push({ level: lv.level, sev: 'warn', msg, cells });
  const I = (msg) => out.push({ level: lv.level, sev: 'info', msg });
  if (isEmptyLevel(lv)) {
    I('空层：全是地板（未摆鼹鼠/楼梯/牌）');
    return out;
  }
  const moles = lv.cells.filter((c) => c.mole);
  const stairs = lv.cells.filter((c) => c.ground === 'stairs');
  if (moles.length !== 1) E(moles.length ? `有 ${moles.length} 只黄鼹鼠，只能有 1 只` : '没有黄鼹鼠（游戏会无视这张桌子，改成随机发牌）', moles.map((c) => [c.x, c.y]));
  if (stairs.length !== 1) E(stairs.length ? `有 ${stairs.length} 个楼梯，只能有 1 个` : '没有下楼楼梯', stairs.map((c) => [c.x, c.y]));
  for (const c of lv.cells) {
    if (c.catalog && !known.kindOf(c.catalog)) E(`不认识的牌 id「${c.catalog}」`, [[c.x, c.y]]);
    if (c.catalog && c.ground !== 'floor') E(`${c.catalog} 放在${GROUNDS.find((g) => g.id === c.ground)?.name}上`, [[c.x, c.y]]);
    if (c.mole && c.ground !== 'floor') E('黄鼹鼠要站在地板上', [[c.x, c.y]]);
  }
  const ducks = lv.cells.filter((c) => c.catalog === 'duck');
  if (ducks.length > 1) W(`有 ${ducks.length} 只黄头鸭（一层一般一只）`, ducks.map((c) => [c.x, c.y]));
  if (lv.shopGoods && !ducks.length) W('写了商店货架，但这一层没有黄头鸭');
  for (const g of lv.shopGoods || []) if (!known.shop.has(g)) E(`货架里有不认识的 id「${g}」`);
  if (moles.length === 1) {
    const seen = reach(lv, moles[0]);
    const lost = stairs.filter((c) => !seen.has(`${c.x},${c.y}`));
    if (stairs.length && lost.length === stairs.length) E('黄鼹鼠走不到楼梯（墙和坑挡住了）', lost.map((c) => [c.x, c.y]));
    const stuck = lv.cells.filter((c) => c.catalog && !seen.has(`${c.x},${c.y}`));
    if (stuck.length) W(`${stuck.length} 张牌鼹鼠走不到（deal.ts 随机发牌时要求都走得到）`, stuck.map((c) => [c.x, c.y]));
  }
  return out;
}
/** BFS：从鼹鼠出发，上下左右，地板 / 楼梯能走（牌不挡路：走上去就是打怪 / 捡东西） */
export function reach(lv, from) {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= lv.cols || ny >= lv.rows) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      const n = lv.cells[cellIndex(lv, nx, ny)];
      if (!walkable(n.ground)) continue;
      seen.add(k); q.push(n);
    }
  }
  return seen;
}

// ---------------------------------------------------------------- 统计
const n0 = (v) => (typeof v === 'number' && v > 0 ? v : 0);
export function levelStats(lv, lookup) {
  const s = { monsters: 0, heart: 0, tooth: 0, armor: 0, gold: 0, equipment: 0, chest: 0, duck: 0, walls: 0, pits: 0, catalogStats: false, byId: {} };
  for (const c of lv.cells) {
    if (c.ground === 'wall') s.walls++;
    if (c.ground === 'pit') s.pits++;
    if (!c.catalog) continue;
    s.byId[c.catalog] = (s.byId[c.catalog] || 0) + 1;
    const k = lookup.kindOf(c.catalog);
    if (k === 'monster') {
      const r = lookup.role(c.catalog) || {};
      s.monsters++;
      if ([r.heart, r.tooth].some((v) => v === -1)) s.catalogStats = true;
      s.heart += n0(r.heart); s.tooth += n0(r.tooth); s.armor += n0(r.armor); s.gold += n0(r.gold);
    } else if (k === 'equipment') s.equipment++;
    else if (c.catalog === 'chest') s.chest++;
    else if (c.catalog === 'duck') s.duck++;
  }
  // 粗略难度：每只怪「心 × 牙」开根号再加起来（只是给曲线看个走势）
  s.score = Math.round(lv.cells.reduce((acc, c) => {
    if (!c.catalog || lookup.kindOf(c.catalog) !== 'monster') return acc;
    const r = lookup.role(c.catalog) || {};
    return acc + Math.sqrt(n0(r.heart) * Math.max(1, n0(r.tooth)));
  }, 0) * 10) / 10;
  return s;
}

// ---------------------------------------------------------------- 打 zip（只存不压，不需要库）
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** files: [{name, text}] → Uint8Array (zip, UTF-8 文件名) */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

/** 把一个浏览器文件夹句柄解析到 …/json/关卡（选 配置表 / json / 关卡 都行） */
export async function resolveConfigDir(dir, sub) {
  // sub: [] → json 目录本身；['关卡'] → json/关卡
  if (dir.name === '配置表') dir = await dir.getDirectoryHandle('json', { create: true });
  else if (dir.name !== 'json' && !(sub.length && dir.name === sub[sub.length - 1])) return null;
  if (sub.length && dir.name !== sub[sub.length - 1]) for (const s of sub) dir = await dir.getDirectoryHandle(s, { create: true });
  return dir;
}
export async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(text); await w.close();
}

// ---------------------------------------------------------------- 我的关卡（一关一文件，与官方「关卡/」隔离）
export const MY_LEVEL_TABLE = '我的关卡';
export const MY_LEVEL_DIR = '我的关卡';

/** id = ml_ + 6～8 位小写字母数字 */
export function newMyLevelId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const n = 6 + (Math.random() < 0.5 ? 0 : 2);
  let s = 'ml_';
  for (let i = 0; i < n; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return s;
}

/** 新建一层：默认放 1 鼹鼠 + 1 楼梯，方便通过校验 */
export function blankMyLevel({ title = '未命名关卡', theme = 'world1', cols = DEFAULT_SIZE.cols, rows = DEFAULT_SIZE.rows, author } = {}) {
  const now = new Date().toISOString();
  const cells = blankCells(cols, rows);
  // 鼹鼠靠左上，楼梯靠右下（格子够小时也尽量错开）
  const mx = Math.min(1, cols - 1), my = Math.min(1, rows - 1);
  const sx = Math.max(0, cols - 2), sy = Math.max(0, rows - 2);
  cells[cellIndex({ cols, rows }, mx, my)] = { x: mx, y: my, ground: 'floor', catalog: '', mole: true };
  if (sx !== mx || sy !== my) {
    cells[cellIndex({ cols, rows }, sx, sy)] = { x: sx, y: sy, ground: 'stairs', catalog: '', mole: false };
  } else if (cols * rows > 1) {
    const tx = mx === 0 ? Math.min(1, cols - 1) : 0;
    const ty = my;
    cells[cellIndex({ cols, rows }, tx, ty)] = { x: tx, y: ty, ground: 'stairs', catalog: '', mole: false };
  }
  const out = {
    schemaVersion: SCHEMA_VERSION,
    table: MY_LEVEL_TABLE,
    id: newMyLevelId(),
    title,
    theme,
    cols,
    rows,
    note: '',
    shopGoods: null,
    cells,
    createdAt: now,
    updatedAt: now,
  };
  if (author != null && author !== '') out.author = author;
  return out;
}

export function normalizeMyLevel(d) {
  const cols = Math.max(1, Math.min(MAX_SIDE, d.cols | 0 || DEFAULT_SIZE.cols));
  const rows = Math.max(1, Math.min(MAX_SIDE, d.rows | 0 || DEFAULT_SIZE.rows));
  const theme = WORLDS.some((w) => w.id === d.theme) ? d.theme : 'world1';
  const base = {
    schemaVersion: SCHEMA_VERSION,
    table: MY_LEVEL_TABLE,
    id: typeof d.id === 'string' && d.id.startsWith('ml_') ? d.id : newMyLevelId(),
    title: (d.title || '未命名关卡').toString(),
    theme,
    cols,
    rows,
    note: d.note ?? '',
    shopGoods: d.shopGoods ?? null,
    cells: normalizeCells({ cols, rows, cells: d.cells }),
    createdAt: d.createdAt || new Date().toISOString(),
    updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
  };
  if (d.author != null && d.author !== '') base.author = String(d.author);
  return base;
}

/** 与 formatWorldJson 同风格：格子压成单行 */
export function formatMyLevelJson(data) {
  const d = { ...data, schemaVersion: SCHEMA_VERSION, table: MY_LEVEL_TABLE, updatedAt: data.updatedAt || new Date().toISOString() };
  return JSON.stringify(d, null, 2).replace(/\{\n\s+"x": [^{}[\]]*?\n\s+\}/g, (m) =>
    m.replace(/\n\s+/g, ' ').replace('{ ', '{').replace(' }', '}')) + '\n';
}

export function formatMyIndexJson(levelsMeta) {
  const levels = (levelsMeta || []).map((m) => ({
    id: m.id,
    title: m.title,
    theme: m.theme,
    cols: m.cols,
    rows: m.rows,
    updatedAt: m.updatedAt,
  }));
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), levels }, null, 2) + '\n';
}

export function myLevelMeta(lv) {
  return { id: lv.id, title: lv.title, theme: lv.theme, cols: lv.cols, rows: lv.rows, updatedAt: lv.updatedAt };
}

/** validateLevel 需要 lv.level；我的关卡用 1 占位即可 */
export function asValidateLevel(lv) {
  return { level: 1, cols: lv.cols, rows: lv.rows, note: lv.note, shopGoods: lv.shopGoods, cells: lv.cells };
}
