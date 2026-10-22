// 角色设定：md ⇄ json 转换 + 校验。
// 纯 ESM、无依赖：Node 脚本（scripts/）和网页编辑器共用同一份代码。

export const SCHEMA_VERSION = 1;

/** 追击方式，来自 notes/配置表/追击方式.md「四种」。code = HuntKind 枚举编号 */
export const HUNT_KINDS = [
  { key: 'idle', label: '傻傻不动', code: 0, usesInterval: false },
  { key: 'chase', label: '追击', code: 1, usesInterval: true },
  { key: 'wander', label: '随机走', code: 2, usesInterval: false },
  { key: 'flee', label: '逃跑', code: 3, usesInterval: false },
];

export const GROUPS = [
  { key: 'hero', title: '英雄', heading: '英雄' },
  { key: 'deal', title: '已做成牌的怪物', heading: '已做成牌的怪物' },
  { key: 'catalogOnly', title: '图鉴里有、没做成牌', heading: '图鉴里有、没做成牌' },
];

export const MAX_SKILLS = 3;

const FULL_COLS = ['图鉴 id', '中文', '预制体', '脚本', '心', '牙', '甲', '金', '追击', '间隔', '特性', '状态', '技能', '说明'];
const FULL_SEP = '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- | --- |';
const CAT_COLS = ['图鉴 id', '中文', '心', '牙', '甲', '金', '特性', '说明'];
const CAT_SEP = '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |';

// 现在 origin/main 上 角色设定.md 的说明文字。表格位置用 {{...}} 占位。
export const MD_TEMPLATE = `# 英雄卡 + 怪物卡

> 改这张表后告诉 Grok：「扫描 \`notes/配置表/角色设定.md\`，更新预制体」。  
> 主键是 **图鉴 id**。扫描时写对应预制体 Inspector，并同步 \`CATALOG\`。  
> 心 / 牙 / 甲 / 金 / 追击 / 追击间隔 对应 \`EnemyCard\`（英雄黄鼹鼠出生数值在 \`rules.ts\`：\`BASE_HEART=10\` \`BASE_TOOTH=1\`）。  
> **状态 / 技能** 空 = 保持空数组。现在只有刺球仙人掌挂了技能。  
> 旧短名（clock、eraser）只给存档迁移，新数据一律用图鉴 id。

面板：\`EnemyCard.heart/tooth/armor/gold/hunt/chaseEvery/effects/skills\`。小于 0 用图鉴。\`HeroCard.skills\`。

追击枚举见 [追击方式.md](追击方式.md)。技能名见 [技能卡.md](技能卡.md)。

## 英雄

竞技场里任何怪物也能当英雄，用的是下面怪物表那一行的数值和技能。黄鼹鼠是默认英雄。

{{TABLE:hero}}

## 已做成牌的怪物（{{COUNT:deal}}）

\`DEAL_MONSTERS\` 就是这 {{COUNT:deal}} 个 id，顺序相同。

{{TABLE:deal}}

## 图鉴里有、没做成牌（不发牌、不要拿来选角）

{{TABLE:catalogOnly}}

## 状态 / 技能怎么填

| 列 | 写法 |
| --- | --- |
| 追击 | \`傻傻不动\` / \`追击\` / \`随机走\` / \`逃跑\` |
| 间隔 | 整数，≥1。只对「追击」有用 |
| 状态 | \`中文 value/turns/every\`，多条 \`; \`。增益出生就有，减益打中英雄时施加 |
| 技能 | 中文名或 id，多条 \`; \`。最多 3 条 |

## 加新怪物

新加一行：图鉴 id = 图片 stem，预制体 \`enemy_{stem}_prefab\`。扫描写数值；新牌要人从模板复制。
`;

// ---------- 小工具 ----------
const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
};
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const listSplit = (s) => (s || '').split(/[;；]/).map((x) => x.trim()).filter(Boolean);
const toInt = (s, dflt) => {
  if (s === undefined || s === null || String(s).trim() === '') return dflt;
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
};

function groupOfHeading(h) {
  for (const g of GROUPS) if (h.startsWith(g.heading)) return g.key;
  return null;
}

// refs: { statuses:[{id,name}], skills:[{id,name}] }，用来把中文名和 id 对上
function lookup(list, token) {
  if (!list) return null;
  return list.find((x) => x.name === token || x.id === token) || null;
}

export function parseStatus(token, refs) {
  // 「中毒 1/3/1」，也接受「poison 1/3/1」
  const m = token.match(/^(.+?)\s+(-?\d+)\s*\/\s*(-?\d+)\s*\/\s*(-?\d+)$/);
  if (!m) throw new Error(`状态写法不对：「${token}」，应为「中文 value/turns/every」`);
  const ref = lookup(refs?.statuses, m[1].trim());
  return { id: ref ? ref.id : null, name: ref ? ref.name : m[1].trim(), value: +m[2], turns: +m[3], every: +m[4] };
}
export function parseSkill(token, refs) {
  const m = token.match(/^([^(（]+?)\s*(?:[(（](.*)[)）])?$/);
  const key = (m ? m[1] : token).trim();
  const ref = lookup(refs?.skills, key);
  const sk = { id: ref ? ref.id : null, name: ref ? ref.name : key };
  if (m && m[2]) sk.override = m[2].trim();
  return sk;
}

// ---------- md → json ----------
export function rolesMdToJson(md, refs = null, meta = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const roles = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) { heading = line.slice(3).trim(); continue; }
    const group = groupOfHeading(heading);
    if (!group || !line.trim().startsWith('|')) continue;
    // 表头
    const header = splitRow(line);
    if (!header.includes('图鉴 id')) continue;
    i += 2; // 跳过分隔行
    for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
      const cells = splitRow(lines[i]);
      const row = Object.fromEntries(header.map((h, k) => [h, cells[k] ?? '']));
      if (!row['图鉴 id']) continue;
      roles.push(rowToRole(row, group, refs));
    }
    i--;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    table: '角色设定',
    source: 'notes/配置表/角色设定.md',
    updatedAt: meta.updatedAt || new Date().toISOString(),
    enums: { hunt: HUNT_KINDS.map(({ key, label, code }) => ({ key, label, code })) },
    groups: GROUPS.map(({ key, title }) => ({ key, title })),
    roles,
  };
}

function rowToRole(row, group, refs) {
  const full = group !== 'catalogOnly';
  const huntLabel = (row['追击'] || '').trim();
  let hunt = null;
  if (full) {
    const h = HUNT_KINDS.find((k) => k.label === huntLabel || k.key === huntLabel);
    if (!h && huntLabel) throw new Error(`${row['图鉴 id']}：未知追击方式「${huntLabel}」`);
    hunt = h ? h.key : 'chase';
  }
  return {
    id: row['图鉴 id'].trim(),
    group,
    name: (row['中文'] || '').trim(),
    prefab: full ? (row['预制体'] || '').trim() || null : null,
    script: full ? (row['脚本'] || '').trim() || null : null,
    heart: toInt(row['心'], -1),
    tooth: toInt(row['牙'], -1),
    armor: toInt(row['甲'], -1),
    gold: toInt(row['金'], -1),
    hunt,
    chaseEvery: full ? Math.max(1, toInt(row['间隔'], 1)) : null,
    traits: listSplit(row['特性']),
    statuses: full ? listSplit(row['状态']).map((t) => parseStatus(t, refs)) : [],
    skills: full ? listSplit(row['技能']).map((t) => parseSkill(t, refs)) : [],
    note: (row['说明'] || '').trim(),
  };
}

// ---------- json → md ----------
const huntLabelOf = (key) => (HUNT_KINDS.find((k) => k.key === key) || {}).label || '';
const statusText = (s) => `${s.name || s.id} ${s.value}/${s.turns}/${s.every}`;
const skillText = (s) => `${s.name || s.id}${s.override ? `(${s.override})` : ''}`;

export function tableFor(roles, group) {
  const rows = roles.filter((r) => r.group === group);
  const out = [];
  if (group === 'catalogOnly') {
    out.push(`| ${CAT_COLS.join(' | ')} |`, CAT_SEP);
    for (const r of rows)
      out.push('| ' + [r.id, r.name, r.heart, r.tooth, r.armor, r.gold, (r.traits || []).join('; '), r.note].map(esc).join(' | ') + ' |');
  } else {
    out.push(`| ${FULL_COLS.join(' | ')} |`, FULL_SEP);
    for (const r of rows)
      out.push('| ' + [
        r.id, r.name, r.prefab, r.script, r.heart, r.tooth, r.armor, r.gold,
        huntLabelOf(r.hunt), r.chaseEvery ?? 1, (r.traits || []).join('; '),
        (r.statuses || []).map(statusText).join('; '), (r.skills || []).map(skillText).join('; '), r.note,
      ].map(esc).join(' | ') + ' |');
  }
  // 空格子输出成「|  |」，和原表一致
  return out.map((l) => l.replace(/\|\s{2,}\|/g, '|  |').replace(/\|\s{2,}\|/g, '|  |')).join('\n');
}

/** json → md。默认用内置模板；传 baseMd 时只替换里面的三张表，保留其余文字。 */
export function rolesJsonToMd(data, { baseMd = null } = {}) {
  const roles = data.roles || [];
  const count = (g) => roles.filter((r) => r.group === g).length;
  if (!baseMd) {
    return MD_TEMPLATE
      .replace(/\{\{TABLE:(\w+)\}\}/g, (_, g) => tableFor(roles, g))
      .replace(/\{\{COUNT:(\w+)\}\}/g, (_, g) => String(count(g)));
  }
  const lines = baseMd.replace(/\r\n/g, '\n').split('\n');
  const out = []; let heading = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith('## ')) {
      heading = line.slice(3).trim();
      if (heading.startsWith('已做成牌的怪物')) line = line.replace(/（\d+）/, `（${count('deal')}）`);
      out.push(line); continue;
    }
    const g = groupOfHeading(heading);
    if (g && line.trim().startsWith('|') && splitRow(line).includes('图鉴 id')) {
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) i++;
      out.push(tableFor(roles, g)); continue;
    }
    if (g === 'deal') line = line.replace(/就是这 \d+ 个 id/, `就是这 ${count('deal')} 个 id`);
    out.push(line);
  }
  return out.join('\n');
}

// ---------- 校验 ----------
/** 返回 [{id, field, msg}]，空数组 = 没问题 */
export function validateRole(r, refs = null) {
  const errs = [];
  const e = (field, msg) => errs.push({ id: r.id, field, msg });
  if (!r.id || !/^[a-z0-9_]+$/.test(r.id)) e('id', '图鉴 id 只能是小写字母、数字、下划线');
  if (!r.name) e('name', '中文名不能为空');
  if (!GROUPS.some((g) => g.key === r.group)) e('group', '分组不对');
  for (const f of ['heart', 'tooth', 'armor', 'gold']) {
    const v = r[f];
    if (!Number.isInteger(v)) e(f, '必须是整数');
    else if (v < -1) e(f, '最小是 -1（-1 = 用图鉴）');
    else if (v > 999) e(f, '太大了（>999）');
  }
  if (r.group !== 'catalogOnly') {
    if (!HUNT_KINDS.some((k) => k.key === r.hunt)) e('hunt', '追击方式不对');
    if (!Number.isInteger(r.chaseEvery) || r.chaseEvery < 1) e('chaseEvery', '间隔是 ≥1 的整数');
    if ((r.skills || []).length > MAX_SKILLS) e('skills', `技能最多 ${MAX_SKILLS} 个`);
    if (refs?.skills) for (const s of r.skills || []) if (!s.id) e('skills', `技能「${s.name}」不在技能卡.md 里`);
    if (refs?.statuses) for (const s of r.statuses || []) if (!s.id) e('statuses', `状态「${s.name}」不在状态效果.md 里`);
    for (const s of r.statuses || [])
      for (const k of ['value', 'turns', 'every'])
        if (!Number.isInteger(s[k]) || (k === 'every' ? s[k] < 1 : s[k] < 0)) e('statuses', `状态「${s.name}」的 ${k} 不对`);
  }
  return errs;
}

export function validateRoles(data, refs = null) {
  const errs = [];
  if (data.schemaVersion !== SCHEMA_VERSION) errs.push({ id: '*', field: 'schemaVersion', msg: `schemaVersion 应为 ${SCHEMA_VERSION}` });
  const seen = new Set();
  for (const r of data.roles || []) {
    if (seen.has(r.id)) errs.push({ id: r.id, field: 'id', msg: '图鉴 id 重复' });
    seen.add(r.id);
    errs.push(...validateRole(r, refs));
  }
  return errs;
}

// ---------- 参考表（技能 / 状态）从 md 里读 ----------
function tableAfter(md, headingStartsWith) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => l.startsWith('## ') && l.slice(3).trim().startsWith(headingStartsWith));
  if (i < 0) return [];
  let j = i + 1; while (j < lines.length && !lines[j].trim().startsWith('|')) j++;
  const header = splitRow(lines[j]); const rows = [];
  for (j += 2; j < lines.length && lines[j].trim().startsWith('|'); j++) {
    const c = splitRow(lines[j]); rows.push(Object.fromEntries(header.map((h, k) => [h, c[k] ?? ''])));
  }
  return rows;
}
/** 技能卡.md「kind 编号」+「已实现」，状态效果.md「kind 编号」 */
export function parseRefs({ skillMd, statusMd }) {
  const impl = Object.fromEntries(tableAfter(skillMd, '已实现').map((r) => [r.id, r]));
  const skills = tableAfter(skillMd, 'kind 编号')
    .filter((r) => r.id && r.id !== '—')
    .map((r) => ({ kind: +r.kind, id: r.id, name: r['中文'], desc: impl[r.id]?.['描述'] || '', side: impl[r.id]?.['敌我'] || '', cooldown: impl[r.id] ? +impl[r.id]['冷却'] : null }));
  const statuses = tableAfter(statusMd, 'kind 编号')
    .filter((r) => r.id && r.id !== '—')
    .map((r) => ({ kind: +r.kind, id: r.id, name: r['中文'], polarity: r['增减'] === '减益' ? 'debuff' : 'buff', implemented: r['已实现'] === '是' }));
  return { skills, statuses, hunts: HUNT_KINDS };
}
