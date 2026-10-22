// 我的关卡 → 公开仓 diggy_levels/my-levels（GitHub Contents API）
// Token 只存浏览器本地，永不写入仓库 / URL。

export const GH_OWNER = 'supersuraccoon';
export const GH_REPO = 'DiggysCardWorldSite';
export const GH_BRANCH = 'main';
export const MY_LEVELS_PATH = 'diggy_levels/my-levels';

export const PAT_LS_KEY = 'diggy.editor.gh.pat';
export const LOGIN_LS_KEY = 'diggy.editor.gh.login';

/** 游戏建造刷新推荐（fetch 请加 ?t=时间戳）；jsDelivr 仅 CORS/回退 */
export const LEVEL_BASE_PAGES = `https://${GH_OWNER}.github.io/${GH_REPO}/diggy_levels`;
export const LEVEL_BASE_JSDELIVR = `https://cdn.jsdelivr.net/gh/${GH_OWNER}/${GH_REPO}@${GH_BRANCH}/diggy_levels`;

const API = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents`;
const RAW = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;

const utf8 = new TextEncoder();
const b64encode = (text) => {
  const bytes = utf8.encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export function getToken() {
  try { return localStorage.getItem(PAT_LS_KEY) || ''; } catch { return ''; }
}
export function setToken(token) {
  const t = (token || '').trim();
  if (!t) { clearToken(); return; }
  localStorage.setItem(PAT_LS_KEY, t);
}
export function clearToken() {
  try {
    localStorage.removeItem(PAT_LS_KEY);
    localStorage.removeItem(LOGIN_LS_KEY);
  } catch { /* ignore */ }
}
export function hasToken() { return !!getToken(); }
export function getCachedLogin() {
  try { return localStorage.getItem(LOGIN_LS_KEY) || ''; } catch { return ''; }
}
function setCachedLogin(login) {
  try {
    if (login) localStorage.setItem(LOGIN_LS_KEY, login);
    else localStorage.removeItem(LOGIN_LS_KEY);
  } catch { /* ignore */ }
}

function authHeaders(token = getToken()) {
  if (!token) throw new Error('未连接 GitHub：请先填入 Token');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function parseError(res) {
  let detail = '';
  try {
    const j = await res.json();
    detail = j.message || JSON.stringify(j);
  } catch {
    try { detail = await res.text(); } catch { detail = res.statusText; }
  }
  if (res.status === 401) return new Error('Token 无效或已过期（401）');
  if (res.status === 403) return new Error(`无写权限或被限流（403）：${detail}`);
  if (res.status === 404) return new Error(`找不到资源（404）：${detail}`);
  return new Error(`GitHub API ${res.status}：${detail}`);
}

/** 校验 token，成功返回 login 并缓存 */
export async function verifyToken(token = getToken()) {
  const t = (token || '').trim();
  if (!t) throw new Error('请先填入 Token');
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw await parseError(res);
  const u = await res.json();
  setToken(t);
  setCachedLogin(u.login || '');
  return u.login || '';
}

/**
 * GET 文件元数据。404 → null；其它错误抛出。
 * @returns {{ sha: string, content?: string, encoding?: string } | null}
 */
export async function getFile(path, { token = getToken() } = {}) {
  const url = `${API}/${path.replace(/^\/+/, '')}?ref=${encodeURIComponent(GH_BRANCH)}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** PUT 创建或更新。409 时自动重取 sha 再试一次。 */
export async function putFile(path, text, message, { token = getToken(), sha } = {}) {
  const clean = path.replace(/^\/+/, '');
  const body = {
    message,
    content: b64encode(text),
    branch: GH_BRANCH,
  };
  let useSha = sha;
  if (useSha === undefined) {
    const cur = await getFile(clean, { token });
    if (cur?.sha) useSha = cur.sha;
  }
  if (useSha) body.sha = useSha;

  const doPut = async (payload) => {
    const res = await fetch(`${API}/${clean}`, {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  };

  let res = await doPut(body);
  if (res.status === 409 || res.status === 422) {
    const cur = await getFile(clean, { token });
    if (cur?.sha) {
      body.sha = cur.sha;
      res = await doPut(body);
    }
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** DELETE。文件不存在（404）返回 { missing: true }。 */
export async function deleteFile(path, message, { token = getToken() } = {}) {
  const clean = path.replace(/^\/+/, '');
  const cur = await getFile(clean, { token });
  if (!cur?.sha) return { missing: true };
  const res = await fetch(`${API}/${clean}`, {
    method: 'DELETE',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha: cur.sha, branch: GH_BRANCH }),
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export function levelPath(id) {
  return `${MY_LEVELS_PATH}/${id}.json`;
}
export function indexPath() {
  return `${MY_LEVELS_PATH}/index.json`;
}

/** 先写单关，再写 index（避免 index 指向尚不存在的文件） */
export async function cloudPutLevel(id, levelText, indexText, { token } = {}) {
  await putFile(levelPath(id), levelText, `chore(levels): save ${id}`, { token });
  await putFile(indexPath(), indexText, `chore(levels): update index after save ${id}`, { token });
}

export async function cloudPutIndex(indexText, { token, message = 'chore(levels): update index' } = {}) {
  await putFile(indexPath(), indexText, message, { token });
}

/** 删单关文件后写新 index；文件本就不存在仍更新 index */
export async function cloudDeleteLevel(id, indexText, { token } = {}) {
  const del = await deleteFile(levelPath(id), `chore(levels): delete ${id}`, { token });
  await putFile(indexPath(), indexText, `chore(levels): update index after delete ${id}`, { token });
  return del;
}

/** 只读：拉 index（无需 token） */
export async function fetchIndexRaw() {
  const url = `${RAW}/${indexPath()}?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拉取 index 失败（${res.status}）`);
  return res.json();
}

/** 只读：拉单关（无需 token） */
export async function fetchLevelRaw(id) {
  const url = `${RAW}/${levelPath(id)}?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拉取 ${id} 失败（${res.status}）`);
  return res.json();
}

/** 并发限制拉齐列表里的关卡；返回 normalize 前的原始对象数组 */
export async function pullAllLevels({ concurrency = 4 } = {}) {
  const idx = await fetchIndexRaw();
  const metas = Array.isArray(idx?.levels) ? idx.levels : [];
  const ids = metas.map((m) => m.id).filter(Boolean);
  const out = [];
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const d = await fetchLevelRaw(id);
        out.push(d);
      } catch (e) {
        console.warn('[githubMyLevels] skip', id, e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, ids.length)) }, () => worker()));
  // 按 index 顺序排
  const order = new Map(ids.map((id, n) => [id, n]));
  out.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return { index: idx, levels: out };
}

export function pagesWaitHint() {
  return `已推到 GitHub，请约 1 分钟后在游戏内刷新（LEVEL_BASE=${LEVEL_BASE_PAGES}，fetch 加 ?t=）`;
}
