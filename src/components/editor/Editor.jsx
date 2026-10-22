import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  HUNT_KINDS, GROUPS, MAX_SKILLS, SCHEMA_VERSION,
  validateRole, validateRoles, rolesJsonToMd, parseSkill, parseStatus,
} from '../../lib/roles.js';
import { statusIcon, STAT_ICONS, STAT_LABELS } from '../../lib/icons.js';
import { asset } from '../../lib/site.js';

const LS_KEY = 'diggy.editor.roles.v1';
const STATS = ['heart', 'tooth', 'armor', 'gold'];
const KNOWN_TRAITS = [
  { id: 'fly', label: '飞 fly' },
  { id: 'hard', label: '硬 hard' },
  { id: 'eatIron', label: '吃铁 eatIron' },
];
const FIELD_LABEL = {
  name: '中文名', prefab: '预制体', script: '脚本', heart: '心', tooth: '牙', armor: '甲', gold: '金',
  hunt: '追击', chaseEvery: '间隔', traits: '特性', statuses: '状态', skills: '技能', note: '说明', group: '分组', id: '图鉴 id',
};
const EDIT_FIELDS = ['group', 'name', 'prefab', 'script', ...STATS, 'hunt', 'chaseEvery', 'traits', 'statuses', 'skills', 'note'];
const huntLabel = (k) => HUNT_KINDS.find((h) => h.key === k)?.label ?? '—';
const groupTitle = (k) => GROUPS.find((g) => g.key === k)?.title ?? k;
const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 把一个角色和发布数据比，返回改过的字段 */
function changedFields(role, orig) {
  if (!orig) return ['__new'];
  return EDIT_FIELDS.filter((f) => !same(role[f], orig[f]));
}

export default function Editor({ shipped, refs, images, base = '' }) {
  const shippedById = useMemo(() => Object.fromEntries(shipped.roles.map((r) => [r.id, r])), [shipped]);
  const [data, setData] = useState(() => clone(shipped));
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [view, setView] = useState('cards');
  const [q, setQ] = useState('');
  const [fGroup, setFGroup] = useState('all');
  const [fHunt, setFHunt] = useState('all');
  const [fSkill, setFSkill] = useState('all');
  const [fChanged, setFChanged] = useState(false);
  const [selId, setSelId] = useState(null);
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);
  const [canSaveDir, setCanSaveDir] = useState(false);

  // ---- localStorage：读一次，之后每次改动都写 ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data?.schemaVersion === SCHEMA_VERSION && Array.isArray(saved.data.roles)) {
          setData(saved.data); setSavedAt(saved.savedAt);
        }
      }
    } catch { /* 坏数据就忽略 */ }
    setCanSaveDir('showDirectoryPicker' in window);
    setLoaded(true);
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (fromHash) setSelId(fromHash);
    const onHash = () => setSelId(decodeURIComponent(location.hash.slice(1)) || null);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const now = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: now, data }));
      setSavedAt(now);
    }, 250);
    return () => clearTimeout(t);
  }, [data, loaded]);

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200); };

  // ---- 改动统计 ----
  const changes = useMemo(() => {
    const m = {};
    for (const r of data.roles) { const c = changedFields(r, shippedById[r.id]); if (c.length) m[r.id] = c; }
    const ids = new Set(data.roles.map((r) => r.id));
    const removed = shipped.roles.filter((r) => !ids.has(r.id)).map((r) => r.id);
    const orderChanged = !removed.length && !same(data.roles.map((r) => r.id), shipped.roles.filter((r) => ids.has(r.id)).map((r) => r.id)) && !Object.values(m).some((c) => c[0] === '__new');
    const fieldCount = Object.values(m).reduce((n, c) => n + (c[0] === '__new' ? 1 : c.length), 0);
    return { byId: m, removed, fieldCount, orderChanged, total: fieldCount + removed.length };
  }, [data, shipped, shippedById]);

  const errors = useMemo(() => validateRoles(data, refs), [data, refs]);
  const errorsById = useMemo(() => {
    const m = {}; for (const e of errors) (m[e.id] ||= []).push(e); return m;
  }, [errors]);

  // ---- 修改 ----
  const updateRole = useCallback((id, patch) => {
    setData((d) => ({ ...d, roles: d.roles.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }, []);
  const resetRole = (id) => {
    const o = shippedById[id]; if (!o) return;
    setData((d) => ({ ...d, roles: d.roles.map((r) => (r.id === id ? clone(o) : r)) }));
    flash(`已还原「${o.name}」`);
  };
  const resetAll = () => {
    if (!confirm('把所有改动都还原成网站自带的数据？（本地保存的改动会丢掉）')) return;
    setData(clone(shipped)); flash('已全部还原');
  };
  const deleteRole = (id) => {
    const r = data.roles.find((x) => x.id === id);
    if (!confirm(`删除「${r?.name || id}」这一行？`)) return;
    setData((d) => ({ ...d, roles: d.roles.filter((x) => x.id !== id) })); setSelId(null);
  };
  const addRole = (role) => {
    setData((d) => {
      const roles = [...d.roles];
      // 插到同组最后
      let at = roles.map((r) => r.group).lastIndexOf(role.group);
      if (at < 0) at = roles.length - 1;
      roles.splice(at + 1, 0, role);
      return { ...d, roles };
    });
    setAdding(false); setSelId(role.id); flash(`已新增「${role.name}」`);
  };

  // ---- 导出 / 导入 / 存到文件夹 ----
  const exportData = () => ({ ...data, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() });
  const guardErrors = () => {
    if (!errors.length) return true;
    return confirm(`还有 ${errors.length} 个错误（比如 ${errors[0].id} 的「${FIELD_LABEL[errors[0].field] || errors[0].field}」：${errors[0].msg}）。\n仍然导出吗？`);
  };
  const exportJson = () => { if (!guardErrors()) return; download('角色设定.json', JSON.stringify(exportData(), null, 2) + '\n', 'application/json'); };
  const exportMd = () => { if (!guardErrors()) return; download('角色设定.md', rolesJsonToMd(exportData()), 'text/markdown'); };
  const importJson = async (file) => {
    try {
      const d = JSON.parse(await file.text());
      if (d.schemaVersion !== SCHEMA_VERSION || !Array.isArray(d.roles)) throw new Error(`不是 schemaVersion ${SCHEMA_VERSION} 的 角色设定.json`);
      // 用网站的技能 / 状态表补齐 id
      d.roles = d.roles.map((r) => ({
        ...r,
        skills: (r.skills || []).map((s) => ({ ...parseSkill(s.id || s.name, refs), ...(s.override ? { override: s.override } : {}) })),
        statuses: (r.statuses || []).map((s) => parseStatus(`${s.id || s.name} ${s.value}/${s.turns}/${s.every}`, refs)),
      }));
      const errs = validateRoles(d, refs);
      if (!confirm(`导入 ${d.roles.length} 行${errs.length ? `（有 ${errs.length} 个错误，导入后会标红）` : ''}？会替换现在编辑器里的数据。`)) return;
      setData(d); setSelId(null); flash(`已导入 ${file.name}`);
    } catch (e) { flash('导入失败：' + e.message, 'err'); }
  };
  const saveToDir = async () => {
    if (!guardErrors()) return;
    try {
      const dir = await window.showDirectoryPicker({ id: 'diggy-config', mode: 'readwrite' });
      // 选 配置表：md 写在 配置表/，json 写在 配置表/json/。选 json：只写 json。
      let mdDir = dir, jsonDir = dir;
      if (dir.name === '配置表') jsonDir = await dir.getDirectoryHandle('json', { create: true });
      else if (dir.name === 'json') mdDir = null;
      else if (!confirm(`你选的文件夹叫「${dir.name}」，不是「配置表」。\n还是把 角色设定.json 和 角色设定.md 都写到这里吗？`)) return;
      const d = exportData();
      const put = async (folder, name, text) => {
        const fh = await folder.getFileHandle(name, { create: true });
        const w = await fh.createWritable(); await w.write(text); await w.close();
      };
      // 只写，不读
      await put(jsonDir, '角色设定.json', JSON.stringify(d, null, 2) + '\n');
      if (mdDir) await put(mdDir, '角色设定.md', rolesJsonToMd(d));
      const where = dir.name === '配置表' ? '配置表/json/角色设定.json 和 配置表/角色设定.md' : mdDir ? `${dir.name}/角色设定.json 和 角色设定.md` : `${dir.name}/角色设定.json（md 没写：选 配置表 文件夹才会写 md）`;
      flash(`已写入 ${where}`);
    } catch (e) { if (e.name !== 'AbortError') flash('保存失败：' + e.message, 'err'); }
  };

  // ---- 筛选 ----
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.roles.filter((r) => {
      if (fGroup !== 'all' && r.group !== fGroup) return false;
      if (fHunt !== 'all' && r.hunt !== fHunt) return false;
      if (fSkill === 'has' && !(r.skills || []).length) return false;
      if (fSkill === 'none' && (r.skills || []).length) return false;
      if (fChanged && !changes.byId[r.id]) return false;
      if (s && !`${r.id} ${r.name} ${r.note} ${r.prefab || ''} ${(r.traits || []).join(' ')}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [data, q, fGroup, fHunt, fSkill, fChanged, changes]);

  const sel = data.roles.find((r) => r.id === selId) || null;
  const img = (id) => (images[id] ? `${base}/${images[id]}` : null);
  const open = (id) => { setSelId(id); history.replaceState(null, '', `#${id}`); };
  const close = () => { setSelId(null); history.replaceState(null, '', location.pathname); };

  return (
    <div className={`ed ${sel ? 'with-panel' : ''}`}>
      <div className="ed-bar sketch">
        <div className="ed-row">
          <div className="seg">
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>🃏 卡牌墙</button>
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>📋 表格</button>
          </div>
          <input className="search" placeholder="搜索：名字 / id / 说明…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={fGroup} onChange={(e) => setFGroup(e.target.value)} aria-label="分组">
            <option value="all">全部分组</option>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}
          </select>
          <select value={fHunt} onChange={(e) => setFHunt(e.target.value)} aria-label="追击方式">
            <option value="all">全部追击方式</option>
            {HUNT_KINDS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
          </select>
          <select value={fSkill} onChange={(e) => setFSkill(e.target.value)} aria-label="技能">
            <option value="all">有没有技能</option>
            <option value="has">有技能</option>
            <option value="none">没技能</option>
          </select>
          <label className="chk"><input type="checkbox" checked={fChanged} onChange={(e) => setFChanged(e.target.checked)} />只看改过的</label>
        </div>
        <div className="ed-row">
          <span className={`status-pill ${changes.total ? 'dirty' : ''}`}>
            {changes.total
              ? <>✏️ 和网站数据相比：<b>{Object.keys(changes.byId).length}</b> 个角色、<b>{changes.fieldCount}</b> 处改动{changes.removed.length ? `，删了 ${changes.removed.length} 个` : ''}</>
              : <>✅ 和网站数据一样</>}
          </span>
          {errors.length > 0 && <span className="status-pill err">⚠️ {errors.length} 个错误</span>}
          <span className="muted small">{savedAt ? `已自动存在本机 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          <span className="grow" />
          <button className="btn small" onClick={() => setAdding(true)}>＋ 新增</button>
          <button className="btn small" onClick={resetAll} disabled={!changes.total}>↺ 全部还原</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <button className="btn small yellow" onClick={exportJson}>⬇ 角色设定.json</button>
          <button className="btn small" onClick={exportMd}>⬇ 角色设定.md</button>
          {canSaveDir && <button className="btn small" onClick={saveToDir} title="选 notes/配置表 文件夹：json 写进 配置表/json/，md 写进 配置表/">💾 保存到文件夹</button>}
        </div>
      </div>

      <div className="ed-body">
        <div className="ed-main">
          {list.length === 0 && <p className="muted center" style={{ padding: 40 }}>没有符合条件的角色。</p>}
          {view === 'cards'
            ? GROUPS.map((g) => {
                const rows = list.filter((r) => r.group === g.key);
                if (!rows.length) return null;
                return (
                  <section key={g.key} className="ed-group">
                    <h3 className="ed-gtitle">{g.title} <span className="muted small">{rows.length}</span></h3>
                    <div className="wall">
                      {rows.map((r) => (
                        <RoleCard key={r.id} r={r} img={img(r.id)} base={base} refs={refs}
                          changed={changes.byId[r.id]} errs={errorsById[r.id]} active={r.id === selId} onClick={() => open(r.id)} />
                      ))}
                    </div>
                  </section>
                );
              })
            : <RoleTable rows={list} base={base} img={img} changes={changes.byId} errorsById={errorsById} shippedById={shippedById}
                selId={selId} onOpen={open} onUpdate={updateRole} />}
        </div>
        {sel && (
          <EditPanel key={sel.id} r={sel} orig={shippedById[sel.id]} img={img(sel.id)} refs={refs} base={base}
            errs={errorsById[sel.id] || []} changed={changes.byId[sel.id] || []}
            onChange={(patch) => updateRole(sel.id, patch)} onReset={() => resetRole(sel.id)}
            onDelete={() => deleteRole(sel.id)} onClose={close} />
        )}
      </div>
      {adding && <AddDialog existing={new Set(data.roles.map((r) => r.id))} onAdd={addRole} onCancel={() => setAdding(false)} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

// ================= 卡牌 =================
function StatRow({ r, base, size = 'md' }) {
  return (
    <div className={`stats ${size}`}>
      {STATS.map((s) => (
        <span key={s} className="stat" title={STAT_LABELS[s]}>
          <img src={`${asset(base, STAT_ICONS[s])}`} alt={STAT_LABELS[s]} />
          <b>{r[s] === -1 ? '图' : r[s]}</b>
        </span>
      ))}
    </div>
  );
}

function RoleCard({ r, img, base, refs, changed, errs, active, onClick }) {
  return (
    <button className={`gcard ${active ? 'active' : ''} ${errs ? 'has-err' : ''} ${r.group}`} onClick={onClick} id={`card-${r.id}`}>
      <div className="gframe" style={{ backgroundImage: `url(${base}/images/game/card_monster.png)` }}>
        <div className="gart">
          {img ? <img src={img} alt={r.name} loading="lazy" /> : <div className="noimg hatch-dense"><span>还没有图</span></div>}
        </div>
        <div className="gname">{r.name || '（没名字）'}</div>
        <StatRow r={r} base={base} />
        {changed && <span className="sticker">{changed[0] === '__new' ? '新' : '改'}</span>}
        {errs && <span className="sticker err">!</span>}
        {r.group === 'hero' && <span className="ribbon">英雄</span>}
      </div>
      <div className="gmeta">
        <span className="gid">{r.id}</span>
        {r.hunt && <span className="tag">{huntLabel(r.hunt)}{r.hunt === 'chase' && r.chaseEvery > 1 ? ` /${r.chaseEvery}` : ''}</span>}
        {(r.traits || []).map((t) => <span key={t} className="tag dash">{t}</span>)}
        {(r.statuses || []).map((s, i) => statusIcon(s.id) && <img key={i} className="mini" src={`${asset(base, statusIcon(s.id))}`} title={`${s.name} ${s.value}/${s.turns}/${s.every}`} alt={s.name} />)}
        {(r.skills || []).map((s) => <span key={s.id || s.name} className="tag y">{s.name}</span>)}
      </div>
    </button>
  );
}

// ================= 表格 =================
function NumCell({ v, onChange, changed, orig, err, min = -1 }) {
  return (
    <input className={`num ${changed ? 'chg' : ''} ${err ? 'bad' : ''}`} type="number" min={min} step="1" value={v ?? ''}
      title={changed ? `原来是 ${orig}` : ''}
      onChange={(e) => { const t = e.target.value; onChange(t === '' ? '' : Number.isInteger(+t) ? +t : t); }} />
  );
}

function RoleTable({ rows, base, img, changes, errorsById, shippedById, selId, onOpen, onUpdate }) {
  return (
    <div className="tbl-wrap sketch">
      <table className="tbl">
        <thead>
          <tr>
            <th></th><th>图鉴 id</th><th>中文</th>
            {STATS.map((f) => <th key={f}><img className="th-ico" src={`${asset(base, STAT_ICONS[f])}`} alt="" />{STAT_LABELS[f]}</th>)}
            <th>追击</th><th>间隔</th><th>特性</th><th>状态</th><th>技能</th><th>说明</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const head = idx === 0 || rows[idx - 1].group !== r.group;
            const o = shippedById[r.id] || {};
            const ch = new Set(changes[r.id] || []);
            const errF = new Set((errorsById[r.id] || []).map((e) => e.field));
            const full = r.group !== 'catalogOnly';
            return [
              head && <tr key={`g-${r.group}`} className="ghead"><td colSpan={14}>{groupTitle(r.group)}</td></tr>,
              <tr key={r.id} className={`${r.id === selId ? 'sel' : ''} ${ch.size ? 'row-chg' : ''}`}>
                <td>{img(r.id) ? <img className="thumb" src={img(r.id)} alt="" loading="lazy" /> : <span className="thumb none" />}</td>
                <td className="mono">{r.id}{ch.has('__new') && <span className="tag y" style={{ marginLeft: 4 }}>新</span>}</td>
                <td><input className={`txt ${ch.has('name') ? 'chg' : ''} ${errF.has('name') ? 'bad' : ''}`} value={r.name} title={ch.has('name') ? `原来是 ${o.name}` : ''} onChange={(e) => onUpdate(r.id, { name: e.target.value })} /></td>
                {STATS.map((s) => (
                  <td key={s}><NumCell v={r[s]} changed={ch.has(s)} orig={o[s]} err={errF.has(s)} onChange={(v) => onUpdate(r.id, { [s]: v })} /></td>
                ))}
                <td>{full
                  ? <select className={ch.has('hunt') ? 'chg' : ''} value={r.hunt || 'chase'} title={ch.has('hunt') ? `原来是 ${huntLabel(o.hunt)}` : ''} onChange={(e) => onUpdate(r.id, { hunt: e.target.value })}>
                      {HUNT_KINDS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                    </select>
                  : <span className="muted">—</span>}</td>
                <td>{full
                  ? <NumCell v={r.chaseEvery} min={1} changed={ch.has('chaseEvery')} orig={o.chaseEvery} err={errF.has('chaseEvery')} onChange={(v) => onUpdate(r.id, { chaseEvery: v })} />
                  : <span className="muted">—</span>}</td>
                <td><input className={`txt short ${ch.has('traits') ? 'chg' : ''}`} value={(r.traits || []).join('; ')} placeholder="—"
                  onChange={(e) => onUpdate(r.id, { traits: e.target.value.split(/[;；,，]/).map((x) => x.trim()).filter(Boolean) })} /></td>
                <td className={`small ${ch.has('statuses') ? 'chg' : ''} ${errF.has('statuses') ? 'bad' : ''}`}>{full ? ((r.statuses || []).map((s) => `${s.name} ${s.value}/${s.turns}/${s.every}`).join('; ') || '—') : '—'}</td>
                <td className={`small ${ch.has('skills') ? 'chg' : ''} ${errF.has('skills') ? 'bad' : ''}`}>{full ? ((r.skills || []).map((s) => s.name).join('; ') || '—') : '—'}</td>
                <td><input className={`txt wide ${ch.has('note') ? 'chg' : ''}`} value={r.note} onChange={(e) => onUpdate(r.id, { note: e.target.value })} /></td>
                <td><button className="btn small" onClick={() => onOpen(r.id)}>编辑</button></td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ================= 编辑面板 =================
function Field({ label, changed, orig, errs, children, hint, compact }) {
  return (
    <div className={`fld ${changed ? 'chg' : ''} ${errs?.length ? 'bad' : ''}`}>
      <div className="flabel">
        {label}
        {changed && <span className="was" title={`和网站数据不一样，原来是 ${orig}`}>{compact ? `原${orig}` : `改过 · 原：${orig}`}</span>}
      </div>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {errs?.map((e, i) => <div key={i} className="ferr">{e.msg}</div>)}
    </div>
  );
}

function EditPanel({ r, orig, img, refs, base, errs, changed, onChange, onReset, onDelete, onClose }) {
  const ch = new Set(changed);
  const isNew = ch.has('__new');
  const errOf = (f) => errs.filter((e) => e.field === f);
  const full = r.group !== 'catalogOnly';
  const o = orig || {};
  const num = (f, min = -1) => (
    <input type="number" step="1" min={min} value={r[f] ?? ''}
      onChange={(e) => { const t = e.target.value; onChange({ [f]: t === '' ? '' : Number.isInteger(+t) ? +t : t }); }} />
  );
  const skills = r.skills || [];
  const statuses = r.statuses || [];
  const unknownTraits = (r.traits || []).filter((t) => !KNOWN_TRAITS.some((k) => k.id === t));
  const toggleTrait = (id) => onChange({ traits: (r.traits || []).includes(id) ? r.traits.filter((t) => t !== id) : [...(r.traits || []), id] });
  const setStatus = (i, patch) => onChange({ statuses: statuses.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const fmtStatuses = (l) => (l || []).map((s) => `${s.name} ${s.value}/${s.turns}/${s.every}`).join('; ') || '空';

  return (
    <aside className="panel-side sketch">
      <div className="ps-head">
        <div className="ps-img">{img ? <img src={img} alt="" /> : <div className="noimg hatch-dense" />}</div>
        <div>
          <div className="mono muted">{r.id}</div>
          <h3>{r.name || '（没名字）'}</h3>
          <div className="small muted">{groupTitle(r.group)}{isNew ? ' · 新增的' : ''}</div>
        </div>
        <button className="x" onClick={onClose} aria-label="关闭">✕</button>
      </div>
      <div className="ps-body">
        <Field label="中文名" changed={ch.has('name')} orig={o.name} errs={errOf('name')}>
          <input value={r.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>

        <div className="stat-grid">
          {STATS.map((f) => (
            <Field key={f} label={<><img className="ico" src={`${asset(base, STAT_ICONS[f])}`} alt="" />{STAT_LABELS[f]}</>} changed={ch.has(f)} orig={o[f]} errs={errOf(f)} compact>
              {num(f)}
            </Field>
          ))}
        </div>
        <div className="hint">-1 = 用图鉴（rules.ts 的 CATALOG）里的数值。</div>

        {full ? (
          <>
            <div className="two">
              <Field label="追击" changed={ch.has('hunt')} orig={huntLabel(o.hunt)} errs={errOf('hunt')}>
                <select value={r.hunt || 'chase'} onChange={(e) => onChange({ hunt: e.target.value })}>
                  {HUNT_KINDS.map((h) => <option key={h.key} value={h.key}>{h.label}（{h.key}）</option>)}
                </select>
              </Field>
              <Field label="间隔" changed={ch.has('chaseEvery')} orig={o.chaseEvery} errs={errOf('chaseEvery')}
                hint={r.hunt === 'chase' ? '每几回合走一步，≥1' : '只对「追击」有用'}>
                {num('chaseEvery', 1)}
              </Field>
            </div>

            <Field label={`技能（${skills.length}/${MAX_SKILLS}）`} changed={ch.has('skills')} orig={(o.skills || []).map((s) => s.name).join('、') || '空'} errs={errOf('skills')}>
              <div className="chips">
                {skills.map((s, i) => (
                  <span key={i} className={`chip ${s.id ? '' : 'unknown'}`} title={refs.skills.find((k) => k.id === s.id)?.desc || ''}>
                    {s.name}{s.override ? <small>（{s.override}）</small> : null}
                    <button onClick={() => onChange({ skills: skills.filter((_, k) => k !== i) })} aria-label="去掉">✕</button>
                  </span>
                ))}
                {skills.length < MAX_SKILLS && (
                  <select value="" onChange={(e) => { const s = refs.skills.find((k) => k.id === e.target.value); if (s) onChange({ skills: [...skills, { id: s.id, name: s.name }] }); }}>
                    <option value="">＋ 加技能…</option>
                    {refs.skills.filter((s) => !skills.some((k) => k.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}（{s.id}）</option>)}
                  </select>
                )}
              </div>
            </Field>

            <Field label="状态" changed={ch.has('statuses')} orig={fmtStatuses(o.statuses)} errs={errOf('statuses')}
              hint="value / turns / every。增益出生就有，减益打中英雄时施加。turns=0 表示一直有效。">
              <div className="st-list">
                {statuses.map((s, i) => (
                  <div key={i} className="st-row">
                    {statusIcon(s.id) ? <img src={`${asset(base, statusIcon(s.id))}`} alt="" /> : <span className="st-ph" />}
                    <select value={s.id || ''} onChange={(e) => { const k = refs.statuses.find((x) => x.id === e.target.value); setStatus(i, { id: k.id, name: k.name }); }}>
                      {!s.id && <option value="">{s.name}（未知）</option>}
                      {refs.statuses.map((k) => <option key={k.id} value={k.id} disabled={!k.implemented}>{k.name}{k.polarity === 'debuff' ? '（减益）' : ''}{k.implemented ? '' : '（停着）'}</option>)}
                    </select>
                    {['value', 'turns', 'every'].map((k) => (
                      <input key={k} type="number" step="1" min={k === 'every' ? 1 : 0} title={k} placeholder={k} value={s[k] ?? ''}
                        onChange={(e) => setStatus(i, { [k]: e.target.value === '' ? '' : +e.target.value })} />
                    ))}
                    <button className="x small" onClick={() => onChange({ statuses: statuses.filter((_, k) => k !== i) })} aria-label="删">✕</button>
                  </div>
                ))}
                <button className="btn small" onClick={() => onChange({ statuses: [...statuses, { id: 'shield', name: '护盾', value: 1, turns: 0, every: 1 }] })}>＋ 加状态</button>
              </div>
            </Field>
          </>
        ) : (
          <p className="hint boxed">这一组只有基础数值和特性（md 表里没有预制体、追击、状态、技能这几列）。</p>
        )}

        <Field label="特性" changed={ch.has('traits')} orig={(o.traits || []).join('; ') || '空'}>
          <div className="chips">
            {KNOWN_TRAITS.map((t) => (
              <label key={t.id} className={`chip toggle ${(r.traits || []).includes(t.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={(r.traits || []).includes(t.id)} onChange={() => toggleTrait(t.id)} />{t.label}
              </label>
            ))}
            {unknownTraits.map((t) => <span key={t} className="chip">{t}<button onClick={() => onChange({ traits: r.traits.filter((x) => x !== t) })}>✕</button></span>)}
          </div>
        </Field>

        <Field label="说明" changed={ch.has('note')} orig={o.note || '空'}>
          <textarea rows={2} value={r.note} onChange={(e) => onChange({ note: e.target.value })} />
        </Field>

        {full && (
          <details className="adv">
            <summary>预制体 / 脚本</summary>
            <Field label="预制体" changed={ch.has('prefab')} orig={o.prefab}>
              <input className="mono" value={r.prefab || ''} onChange={(e) => onChange({ prefab: e.target.value || null })} />
            </Field>
            <Field label="脚本" changed={ch.has('script')} orig={o.script}>
              <input className="mono" value={r.script || ''} onChange={(e) => onChange({ script: e.target.value || null })} />
            </Field>
          </details>
        )}
      </div>
      <div className="ps-foot">
        {orig && <button className="btn small" onClick={onReset} disabled={!changed.length}>↺ 还原这张</button>}
        <button className="btn small danger" onClick={onDelete}>删除</button>
        <span className="grow" />
        <button className="btn small yellow" onClick={onClose}>完成</button>
      </div>
    </aside>
  );
}

// ================= 新增 =================
function AddDialog({ existing, onAdd, onCancel }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState('deal');
  const role = {
    id: id.trim(), group, name: name.trim(),
    prefab: group === 'catalogOnly' ? null : `enemy_${id.trim()}_prefab`,
    script: group === 'catalogOnly' ? null : '',
    heart: 5, tooth: 1, armor: 0, gold: 5,
    hunt: group === 'catalogOnly' ? null : 'chase', chaseEvery: group === 'catalogOnly' ? null : 1,
    traits: [], statuses: [], skills: [], note: '',
  };
  const errs = validateRole(role).filter((e) => ['id', 'name'].includes(e.field));
  if (existing.has(role.id)) errs.push({ field: 'id', msg: '这个 id 已经有了' });
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal sketch" onClick={(e) => e.stopPropagation()}>
        <h3>新增角色</h3>
        <p className="hint">图鉴 id = 图片文件名去掉 .png，比如 <code>bug</code>。新预制体还要在 Cocos 里从模板复制。</p>
        <label>图鉴 id<input className="mono" value={id} onChange={(e) => setId(e.target.value)} placeholder="比如 kettle_steamer" /></label>
        <label>中文名<input value={name} onChange={(e) => setName(e.target.value)} placeholder="比如 喷气水壶" /></label>
        <label>分组<select value={group} onChange={(e) => setGroup(e.target.value)}>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}</select></label>
        {(id || name) && errs.map((e, i) => <div key={i} className="ferr">{e.msg}</div>)}
        <div className="ps-foot">
          <button className="btn small" onClick={onCancel}>取消</button>
          <span className="grow" />
          <button className="btn small yellow" disabled={errs.length > 0} onClick={() => onAdd(role)}>新增</button>
        </div>
      </div>
    </div>
  );
}
