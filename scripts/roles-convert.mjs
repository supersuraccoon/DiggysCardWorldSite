#!/usr/bin/env node
// 角色设定 md ⇄ json
//   node scripts/roles-convert.mjs md2json <角色设定.md> [out.json] [--refs src/data/refs.json]
//   node scripts/roles-convert.mjs json2md <角色设定.json> [out.md] [--into 旧的角色设定.md]
//   node scripts/roles-convert.mjs check   <角色设定.md>      # md→json→md 往返，检查是否一字不差
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolesMdToJson, rolesJsonToMd, validateRoles } from '../src/lib/roles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const refsPath = opt('--refs') || path.join(here, '../src/data/refs.json');
const into = opt('--into');
const [cmd, input, output] = args;
const refs = fs.existsSync(refsPath) ? JSON.parse(fs.readFileSync(refsPath, 'utf8')) : null;

if (!cmd || !input) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 5).join('\n'));
  process.exit(1);
}
if (cmd === 'md2json') {
  const data = rolesMdToJson(fs.readFileSync(input, 'utf8'), refs);
  const errs = validateRoles(data, refs);
  errs.forEach((e) => console.warn(`⚠️  ${e.id} ${e.field}: ${e.msg}`));
  const text = JSON.stringify(data, null, 2) + '\n';
  if (output) { fs.writeFileSync(output, text); console.log(`写出 ${output}（${data.roles.length} 行）`); } else process.stdout.write(text);
} else if (cmd === 'json2md') {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const errs = validateRoles(data, refs);
  errs.forEach((e) => console.warn(`⚠️  ${e.id} ${e.field}: ${e.msg}`));
  const md = rolesJsonToMd(data, { baseMd: into ? fs.readFileSync(into, 'utf8') : null });
  if (output) { fs.writeFileSync(output, md); console.log(`写出 ${output}`); } else process.stdout.write(md);
} else if (cmd === 'check') {
  const md = fs.readFileSync(input, 'utf8');
  const data = rolesMdToJson(md, refs);
  const back = rolesJsonToMd(data);
  const backInto = rolesJsonToMd(data, { baseMd: md });
  const ok1 = back === md, ok2 = backInto === md;
  console.log(`内置模板往返：${ok1 ? '一致 ✅' : '不一致 ❌'}；保留原文往返：${ok2 ? '一致 ✅' : '不一致 ❌'}`);
  if (!ok1) {
    const a = md.split('\n'), b = back.split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.log(`第 ${i + 1} 行\n原：${a[i]}\n新：${b[i]}`); break; }
  }
  process.exit(ok1 && ok2 ? 0 : 2);
} else {
  console.error('未知命令：' + cmd); process.exit(1);
}
