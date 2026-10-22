// 站内地址统一入口。
// 默认打包后是相对路径（见 scripts/relativize-dist.mjs），不依赖文件夹叫 diggy_site。
// 构建期 Astro base 一般为 '/'；页面里用 pageRoot(pathname) 得到 '.' / '..' / '../..'，
// 再交给 u(path, root)。React 编辑器拿同一个 root 当 base 属性。

export const BASE_URL = import.meta.env.BASE_URL || '/';
/** @deprecated 兼容旧用法：绝对 base 时等于 '/diggy_site'；相对模式下请用 pageRoot() */
export const BASE = BASE_URL.replace(/\/+$/, '') === '.' ? '.' : BASE_URL.replace(/\/+$/, '');

/** 从当前页面路径算到站点根的相对前缀：'' 深度 → '.'，一层 → '..'，两层 → '../..' */
export function pageRoot(pathname = '/') {
  let p = String(pathname || '/');
  const abs = BASE_URL;
  if (abs && abs !== '/' && !abs.startsWith('.')) {
    const b = abs.replace(/\/+$/, '');
    if (b && (p === b || p.startsWith(b + '/'))) p = p.slice(b.length) || '/';
  }
  p = p.replace(/\/index\.html?$/i, '/');
  if (!p.endsWith('/')) {
    const i = p.lastIndexOf('/');
    p = i <= 0 ? '/' : p.slice(0, i + 1);
  }
  const depth = p.split('/').filter(Boolean).length;
  if (depth === 0) return '.';
  return Array(depth).fill('..').join('/');
}

/** 拼站内地址。root 缺省为 '.'（仅适合站点根页）；子页请传 pageRoot(...) */
export const u = (p, root = '.') => {
  if (!p && p !== '') return p;
  if (/^([a-z]+:|\/\/|#|data:)/i.test(String(p))) return p;

  const abs = BASE;
  // 绝对子路径部署（SITE_BASE=/diggy_site 且未 relativize）时走旧逻辑
  if (abs && abs !== '/' && abs !== '.' && abs !== './' && abs.startsWith('/')) {
    const path = String(p).startsWith('/') ? p : '/' + p;
    if (path === abs || path.startsWith(abs + '/')) return path;
    return `${abs}${path}`;
  }

  const path = String(p).replace(/^\//, '');
  if (p === '/' || p === '') return root === '.' ? './' : root + '/';
  if (root === '.' || root === './') return './' + path;
  return `${root}/${path}`;
};

export const NAV = [
  { href: '/', label: '鼹鼠小窝', key: 'home' },
  { href: '/world/', label: '卡牌世界', key: 'world' },
  { href: '/systems/', label: '卡牌系统', key: 'systems' },
  { href: '/editor/', label: '编辑器', key: 'editor' },
  { href: '/devlog/', label: '开发日志', key: 'devlog' },
  { href: '/follow/', label: '关注我们', key: 'follow' },
];
export const SITE_NAME = '黄鼹鼠的卡牌世界';
export const PITCH = '一只黄鼹鼠被龙卷风卷进了黑白的卡牌世界。翻开每一张牌，把被偷走的颜色找回来！';
