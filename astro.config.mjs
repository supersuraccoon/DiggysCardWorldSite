import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// 纯静态输出：npm run build → dist/，再经 scripts/relativize-dist.mjs 把资源改成相对路径。
//
// 默认 base 是 '/'（构建期用根路径），打包后的 HTML/CSS 会被改成 ./ 与 ../，所以：
//   1) 线上放到 http://supersuraccoon-cocos2d.com/diggy_site/ 也能用（相对路径跟着页面走）
//   2) 把 diggy_site_dist 改成任意名字，在文件夹里起静态服务打开 index.html，CSS/图也不会丢
//
// 若真的需要带绝对前缀的旧行为（一般不用）：
//   SITE_BASE=/diggy_site RELATIVE_ASSETS=0 npx astro build
// 代码里站内地址走 src/lib/site.js 的 u() / pageRoot()（或 React 的 base 属性）。
const RAW = (process.env.SITE_BASE ?? '/').trim() || '/';
const SITE_BASE = RAW === './' || RAW === '.' ? './' : (RAW.replace(/\/+$/, '') || '/');
const BASE_PREFIX = (SITE_BASE === '/' || SITE_BASE === './') ? '' : SITE_BASE;

// 给 Markdown 中以 '/' 开头的站内链接/图片加上 base 前缀（'//' 开头的协议相对地址不动）。
function remarkBaseLinks() {
  const walk = (node) => {
    if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') &&
        typeof node.url === 'string' && node.url.startsWith('/') && !node.url.startsWith('//') &&
        !(BASE_PREFIX && (node.url === BASE_PREFIX || node.url.startsWith(BASE_PREFIX + '/')))) {
      node.url = BASE_PREFIX + node.url;
    }
    if (node.children) node.children.forEach(walk);
  };
  return (tree) => walk(tree);
}

export default defineConfig({
  output: 'static',
  base: SITE_BASE,
  trailingSlash: 'ignore',
  integrations: [react()],
  markdown: { remarkPlugins: [remarkBaseLinks] },
  build: { format: 'directory' },
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
});
