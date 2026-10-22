#!/usr/bin/env node
/**
 * 把仓库根 diggy_levels/ 拷进 public/，供 Astro 打进 dist，Pages 也能访问。
 * 根目录 diggy_levels/ 保留给 jsDelivr（本地 Cocos 跨域用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'diggy_levels');
const dest = path.join(root, 'public', 'diggy_levels');

if (!fs.existsSync(src)) {
  console.warn('[copy-diggy-levels] skip: diggy_levels/ not found at repo root');
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[copy-diggy-levels] copied diggy_levels/ → public/diggy_levels/');
