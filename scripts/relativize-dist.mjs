#!/usr/bin/env node
/**
 * 把 dist/ 里以 / 开头的站内资源改成相对路径，这样：
 * - 文件夹叫什么都能在目录内起服务打开
 * - 放到线上 /diggy_site/ 子路径也照样能加载 CSS/JS/图
 *
 * RELATIVE_ASSETS=0 时跳过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.RELATIVE_ASSETS === '0') {
  console.log('[relativize] skipped (RELATIVE_ASSETS=0)');
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function depthOf(file) {
  const rel = path.relative(DIST, path.dirname(file));
  if (!rel || rel === '.') return 0;
  return rel.split(path.sep).filter(Boolean).length;
}

function prefixFor(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

/** 去掉 SITE_BASE（默认 /diggy_site）或 /./ 前缀，返回不带前导斜杠的相对剩余路径 */
const ENV_BASE = (() => {
  const raw = (process.env.SITE_BASE ?? '/diggy_site').trim() || '/diggy_site';
  if (raw === './' || raw === '.' || raw === '/') return '/diggy_site';
  return raw.replace(/\/+$/, '') || '/diggy_site';
})();

function stripSiteRoot(absPath) {
  let rest = absPath;
  const bases = [...new Set([ENV_BASE, '/diggy_site', '/DiggysCardWorldSite'])];
  for (const b of bases) {
    if (rest === b) return '';
    if (rest.startsWith(b + '/')) return rest.slice(b.length + 1);
  }
  if (rest.startsWith('/./')) rest = rest.slice(3);
  else if (rest.startsWith('/')) rest = rest.slice(1);
  return rest;
}

function rewriteAbs(content, prefix) {
  const replacer = (_full, lead, absPath) => lead + prefix + stripSiteRoot(absPath);

  let out = content;
  // href="/..." src="/..." poster="/..."（跳过 //）
  out = out.replace(/(\b(?:href|src|poster)=["'])(\/(?!\/)[^"']*)/g, replacer);
  // CSS url(/...)（跳过 //、data:、#）
  out = out.replace(/(url\(\s*['"]?)(\/(?!\/)[^'")\s]*)/g, replacer);
  // React 序列化的 base 属性：绝对前缀改成该页的相对根
  const root = prefix.replace(/\/+$/, '') || '.';
  out = out.replace(/("base"\s*:\s*\[\s*0\s*,\s*")(\/DiggysCardWorldSite|\/diggy_site|\/\.\/?|\/)?("\s*\])/g, `$1${root}$3`);
  return out;
}

function rewriteJs(content) {
  // _astro 下的 JS：SITE_BASE/X → ../X；"/images|fonts|_astro/ → "../$1/
  let out = content;
  for (const b of [...new Set([ENV_BASE, '/diggy_site', '/DiggysCardWorldSite'])]) {
    out = out.replaceAll(b + '/', '../');
  }
  out = out.replace(/(["'`])\/(images|fonts|_astro)\//g, '$1../$2/');
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('[relativize] dist/ not found:', DIST);
  process.exit(1);
}

const files = walk(DIST);
let nHtml = 0;
let nCss = 0;
let nJs = 0;

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') {
    const prefix = prefixFor(depthOf(file));
    const before = fs.readFileSync(file, 'utf8');
    const after = rewriteAbs(before, prefix);
    if (after !== before) {
      fs.writeFileSync(file, after);
      nHtml++;
    }
  } else if (ext === '.css') {
    // CSS 在 _astro/ 下，回退一级到站点根
    const before = fs.readFileSync(file, 'utf8');
    const after = rewriteAbs(before, '../');
    if (after !== before) {
      fs.writeFileSync(file, after);
      nCss++;
    }
  } else if (ext === '.js') {
    const before = fs.readFileSync(file, 'utf8');
    const after = rewriteJs(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      nJs++;
    }
  }
}

console.log(`[relativize] html=${nHtml} css=${nCss} js=${nJs} → relative assets`);
