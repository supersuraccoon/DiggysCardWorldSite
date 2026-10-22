// 我的关卡 → 自有域名 diggy_levels（PHP api.php，测试阶段无鉴权）
// 与 githubMyLevels.js 并存；两通道列表不自动互通。

export const HOST_API = 'https://supersuraccoon-cocos2d.com/diggy_levels/api.php';
export const HOST_BASE = 'https://supersuraccoon-cocos2d.com/diggy_levels';
export const HOST_MY_LEVELS = `${HOST_BASE}/my-levels`;

export const CLOUD_TARGET_LS_KEY = 'diggy.editor.cloud.target'; // 'github' | 'host'

function bust(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Date.now()}`;
}

async function parseJsonRes(res, label) {
  let text = '';
  try { text = await res.text(); } catch { text = ''; }
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* not json */ }
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || text.slice(0, 160) || res.statusText;
    // 主机未部署 api.php 时常返回 HTML 错误页
    if (!data && /<!DOCTYPE|<html/i.test(text)) {
      throw new Error(`${label}：服务器还没就绪（${res.status}）。请确认已上传 api.php 到 diggy_levels/`);
    }
    throw new Error(`${label}失败（${res.status}）：${msg}`);
  }
  if (data === null) {
    throw new Error(`${label}：响应不是 JSON（可能 api.php 未上传）`);
  }
  return data;
}

/** 探活；失败抛错 */
export async function hostPing() {
  const res = await fetch(bust(HOST_API), { method: 'GET', headers: { Accept: 'application/json' } });
  const data = await parseJsonRes(res, '探活');
  if (!data.ok) throw new Error(data.error || '探活未返回 ok');
  return data;
}

/**
 * 保存整关。body = 关卡对象（须含合法 id）。
 * @param {object|string} levelObjOrText
 */
export async function hostPutLevel(levelObjOrText) {
  const body = typeof levelObjOrText === 'string' ? levelObjOrText : JSON.stringify(levelObjOrText);
  let parsed;
  try { parsed = typeof levelObjOrText === 'string' ? JSON.parse(levelObjOrText) : levelObjOrText; }
  catch { throw new Error('关卡 JSON 无效'); }
  if (!parsed?.id) throw new Error('关卡缺少 id');

  const res = await fetch(HOST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  const data = await parseJsonRes(res, '保存到服务器');
  if (!data.ok) throw new Error(data.error || '保存失败');
  return data;
}

/** 删除：POST { action:"delete", id } */
export async function hostDeleteLevel(id) {
  if (!id) throw new Error('缺少 id');
  const res = await fetch(HOST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  });
  const data = await parseJsonRes(res, '从服务器删除');
  if (!data.ok) throw new Error(data.error || '删除失败');
  return data;
}

/** 拉列表：优先静态 index.json，失败再试 API ?action=list */
export async function hostPullIndex() {
  try {
    const res = await fetch(bust(`${HOST_MY_LEVELS}/index.json`), { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.levels)) return data;
    }
  } catch { /* fall through */ }
  const res = await fetch(bust(`${HOST_API}?action=list`), { headers: { Accept: 'application/json' } });
  return parseJsonRes(res, '拉取服务器列表');
}

export async function hostPullLevel(id) {
  const res = await fetch(bust(`${HOST_MY_LEVELS}/${encodeURIComponent(id)}.json`), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`拉取 ${id} 失败（${res.status}）`);
  return res.json();
}

/** 并发拉齐服务器上的关卡 */
export async function pullAllLevelsFromHost({ concurrency = 4 } = {}) {
  const idx = await hostPullIndex();
  const metas = Array.isArray(idx?.levels) ? idx.levels : [];
  const ids = metas.map((m) => m.id).filter(Boolean);
  const out = [];
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        out.push(await hostPullLevel(id));
      } catch (e) {
        console.warn('[hostMyLevels] skip', id, e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, ids.length)) }, () => worker()));
  const order = new Map(ids.map((id, n) => [id, n]));
  out.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return { index: idx, levels: out };
}

export function hostWaitHint() {
  return `已写到自家服务器（可立刻刷新）。LEVEL_BASE=${HOST_BASE}`;
}

export function getCloudTarget() {
  try {
    const v = localStorage.getItem(CLOUD_TARGET_LS_KEY);
    if (v === 'github' || v === 'host') return v;
  } catch { /* ignore */ }
  return null;
}

export function setCloudTarget(target) {
  try {
    if (target === 'github' || target === 'host') {
      localStorage.setItem(CLOUD_TARGET_LS_KEY, target);
    }
  } catch { /* ignore */ }
}

/** 无偏好时：有 PAT → github，否则 host（iPad / 小朋友默认） */
export function defaultCloudTarget({ hasPat } = {}) {
  const saved = getCloudTarget();
  if (saved) return saved;
  return hasPat ? 'github' : 'host';
}
