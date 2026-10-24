#!/usr/bin/env node
/**
 * 把仓库根 play/ 拷进 public/，供 Astro 打进 dist，Pages 访问 /play/。
 * 根目录 play/ 保留给程序 bot rsync 构建产物；勿在官网导航加入口。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'play');
const dest = path.join(root, 'public', 'play');

if (!fs.existsSync(src)) {
  console.warn('[copy-play] skip: play/ not found at repo root');
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[copy-play] copied play/ → public/play/');
