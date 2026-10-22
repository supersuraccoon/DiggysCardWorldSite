#!/usr/bin/env node
// 从游戏仓库把最新的角色数据和怪物图「复制一份」到网站。网站运行时永远不读游戏仓库。
//
//   npm run sync -- <游戏仓库路径> [--ref origin/main] [--monster-images <目录>] [--dry]
//
//   --ref             从某个 git 分支 / 提交读（git show），不碰工作区。不写就读工作区里的文件。
//   --monster-images  额外的怪物图目录，同名文件优先（比如统一成 500×500 底部对齐的新图）。
//
// 读：
//   notes/配置表/json/角色设定.json（有就用；旧位置 配置表/角色设定.json 也认；都没有就把 角色设定.md 转成 json）
//   notes/配置表/json/关卡/*.json、json/地下城发牌.json（世界/关卡编辑器）
//   notes/配置表/技能卡.md、状态效果.md（编辑器的技能 / 状态下拉表）
//   assets/resources/images/cards/enemy/*.png、cards/hero/mole.png
// 写：
//   src/data/角色设定.json   网站用的正本副本
//   src/data/refs.json       技能 / 状态 / 追击参考表
//   src/data/images.json     哪些角色有图
//   public/images/roles/*.png
//   ./角色设定.json           网站根目录再放一份，方便拿去用
//   src/data/levels/*.json、src/data/地下城发牌.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rolesMdToJson, validateRoles, parseRefs, parseSkill, parseStatus } from '../src/lib/roles.js';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const ref = opt('--ref');
const extraImages = opt('--monster-images');
const dry = flag('--dry');
const repo = args[0] ? path.resolve(args[0]) : null;
if (!repo || !fs.existsSync(repo)) {
  console.error('用法：npm run sync -- <游戏仓库路径> [--ref origin/main] [--monster-images <目录>]');
  process.exit(1);
}

// ---- 读游戏仓库（工作区 或 git ref） ----
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const readBuf = (p) => {
  if (ref) { try { return git('show', `${ref}:${p}`); } catch { return null; } }
  const f = path.join(repo, p); return fs.existsSync(f) ? fs.readFileSync(f) : null;
};
const readText = (p) => { const b = readBuf(p); return b ? b.toString('utf8') : null; };
const listDir = (p) => {
  if (ref) { try { return git('ls-tree', '--name-only', `${ref}:${p}`).toString().split('\n').filter(Boolean); } catch { return []; } }
  const f = path.join(repo, p); return fs.existsSync(f) ? fs.readdirSync(f) : [];
};

const write = (p, data) => {
  const f = path.join(SITE, p);
  if (dry) { console.log('  (dry) ' + p); return; }
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data);
};

const CFG = 'notes/配置表';
console.log(`游戏仓库：${repo}${ref ? `  @ ${ref}` : '（工作区）'}`);

// 1) 参考表
const skillMd = readText(`${CFG}/技能卡.md`), statusMd = readText(`${CFG}/状态效果.md`);
if (!skillMd || !statusMd) {
  console.error(`找不到 ${CFG}/技能卡.md 或 状态效果.md。`);
  if (!ref) console.error('游戏仓库现在的分支可能还是旧的 notes 结构。试试加 --ref origin/main（先 git fetch），只读那个分支，不碰工作区。');
  process.exit(1);
}
const refs = parseRefs({ skillMd, statusMd });
write('src/data/refs.json', JSON.stringify(refs, null, 2) + '\n');
console.log(`参考表：技能 ${refs.skills.length} 个，状态 ${refs.statuses.length} 个`);

// 2) 角色设定
let data; const jsonText = readText(`${CFG}/json/角色设定.json`) || readText(`${CFG}/角色设定.json`);
if (jsonText) {
  data = JSON.parse(jsonText);
  // 用最新参考表补齐技能 / 状态的 id 和中文名
  for (const r of data.roles) {
    r.skills = (r.skills || []).map((s) => ({ ...parseSkill(s.id || s.name, refs), ...(s.override ? { override: s.override } : {}) }));
    r.statuses = (r.statuses || []).map((s) => ({ ...parseStatus(`${s.id || s.name} ${s.value}/${s.turns}/${s.every}`, refs) }));
  }
  console.log('角色设定：读 json/角色设定.json');
} else {
  const md = readText(`${CFG}/角色设定.md`);
  if (!md) { console.error('找不到 角色设定.md / .json'); process.exit(1); }
  data = rolesMdToJson(md, refs);
  console.log('角色设定：仓库里还没有 json，已从 角色设定.md 转换');
}
const errs = validateRoles(data, refs);
errs.forEach((e) => console.warn(`  ⚠️  ${e.id} ${e.field}: ${e.msg}`));
const text = JSON.stringify(data, null, 2) + '\n';
write('src/data/角色设定.json', text);
write('角色设定.json', text);
console.log(`  ${data.roles.length} 行：` + ['hero', 'deal', 'catalogOnly'].map((g) => `${g} ${data.roles.filter((r) => r.group === g).length}`).join('，'));

// 3) 图片：图鉴 id = 图片 stem
const ENEMY = 'assets/resources/images/cards/enemy', HERO = 'assets/resources/images/cards/hero';
const extra = extraImages && fs.existsSync(extraImages) ? new Set(fs.readdirSync(extraImages)) : new Set();
const have = {};
for (const r of data.roles) {
  const file = `${r.id}.png`;
  let buf = null, from = '';
  if (extra.has(file)) { buf = fs.readFileSync(path.join(extraImages, file)); from = '额外目录'; }
  else if (r.group === 'hero') { buf = readBuf(`${HERO}/${file}`); from = 'hero'; }
  else if (listDir(ENEMY).includes(file)) { buf = readBuf(`${ENEMY}/${file}`); from = 'enemy'; }
  if (buf) { write(`public/images/roles/${file}`, buf); have[r.id] = `images/roles/${file}`; }
  else console.log(`  没有图：${r.id}（${r.name}）→ 网站显示占位`);
}
write('src/data/images.json', JSON.stringify(have, null, 2) + '\n');
console.log(`图片：${Object.keys(have).length} 张 → public/images/roles/`);

// 4) 冒险关卡 + 地下城发牌（世界/关卡编辑器用）
const LV = `${CFG}/json/关卡`;
const worldFiles = listDir(LV).filter((f) => f.endsWith('.json'));
for (const f of worldFiles) write(`src/data/levels/${f}`, readBuf(`${LV}/${f}`));
console.log(`关卡：${worldFiles.length} 个世界 → src/data/levels/${worldFiles.length ? '' : '（仓库里还没有 json/关卡/，网站保留原来的）'}`);
const dealBuf = readBuf(`${CFG}/json/地下城发牌.json`);
if (dealBuf) { write('src/data/地下城发牌.json', dealBuf); console.log('地下城发牌：json/地下城发牌.json'); }
console.log('装备 / 道具 / 地形图和 palette.json 用 python3 tools/prepare_level_art.py <游戏仓库> 更新。');
console.log('完成。');
