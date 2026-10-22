import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WORLDS, GROUNDS, MAX_SIDE, DEFAULT_SIZE, SCHEMA_VERSION,
  cellIndex, resizeLevel, isEmptyLevel, validateLevel, levelStats,
  makeZip, resolveConfigDir, writeText,
  blankMyLevel, normalizeMyLevel, formatMyLevelJson, formatMyIndexJson,
  myLevelMeta, asValidateLevel, MY_LEVEL_DIR,
} from '../../lib/levels.js';
import { STAT_ICONS } from '../../lib/icons.js';
import { Palette } from './Palette.jsx';

const LS_KEY = 'diggy.editor.mylevels.v1';
const clone = (x) => JSON.parse(JSON.stringify(x));
const DRAG_MIME = 'text/x-diggy-piece';

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function themeName(id) {
  return WORLDS.find((w) => w.id === id)?.name || id;
}

export default function MyLevelsEditor({ lookup, palette, base = '' }) {
  const [levels, setLevels] = useState([]);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [editId, setEditId] = useState(null);
  const [tool, setTool] = useState({ kind: 'ground', id: 'wall' });
  const [rectMode, setRectMode] = useState(false);
  const [drag, setDragState] = useState(null);
  const dragRef = useRef(null);
  const setDrag = (v) => { const next = typeof v === 'function' ? v(dragRef.current) : v; dragRef.current = next; setDragState(next); };
  const [hl, setHl] = useState(null);
  const [toast, setToast] = useState(null);
  const [canSaveDir, setCanSaveDir] = useState(false);
  const [dirHandle, setDirHandle] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const fileRef = useRef(null);
  const stroke = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved?.levels)) {
          setLevels(saved.levels.map(normalizeMyLevel));
          setSavedAt(saved.savedAt || null);
          if (saved.editId) setEditId(saved.editId);
        }
      }
    } catch { /* ignore */ }
    setCanSaveDir('showDirectoryPicker' in window);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const now = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: now, editId, levels }));
      setSavedAt(now);
    }, 300);
    return () => clearTimeout(t);
  }, [levels, loaded, editId]);

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200); };

  const commit = useCallback((fn, merge = false) => {
    setLevels((cur) => {
      const next = fn(cur);
      if (next === cur) return cur;
      if (!merge) { setPast((p) => [...p.slice(-99), cur]); setFuture([]); }
      return next;
    });
  }, []);
  const undo = () => { if (!past.length) return; setFuture((f) => [levels, ...f]); setLevels(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, levels]); setLevels(future[0]); setFuture((f) => f.slice(1)); };

  useEffect(() => {
    const onKey = (e) => {
      if (!editId || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const lv = levels.find((l) => l.id === editId) || null;

  const updateLevel = useCallback((fn, merge = false) => {
    if (!editId) return;
    commit((cur) => {
      const i = cur.findIndex((l) => l.id === editId);
      if (i < 0) return cur;
      const next = fn(cur[i]);
      if (next === cur[i]) return cur;
      const arr = cur.slice();
      arr[i] = { ...next, updatedAt: new Date().toISOString() };
      return arr;
    }, merge);
  }, [commit, editId]);

  const applyTool = (l, x, y, t) => {
    const cells = l.cells.slice();
    const i = cellIndex(l, x, y);
    const c = { ...cells[i] };
    if (t.kind === 'ground') {
      if (t.id === 'stairs') {
        for (let k = 0; k < cells.length; k++) if (k !== i && cells[k].ground === 'stairs') cells[k] = { ...cells[k], ground: 'floor' };
      }
      c.ground = t.id;
      if (t.id !== 'floor') { c.catalog = ''; c.mole = false; }
    } else if (t.kind === 'card') {
      c.catalog = t.id; c.mole = false; c.ground = 'floor';
    } else if (t.kind === 'mole') {
      for (let k = 0; k < cells.length; k++) if (cells[k].mole) cells[k] = { ...cells[k], mole: false };
      c.mole = true; c.catalog = ''; c.ground = 'floor';
    } else if (t.kind === 'erase') {
      if (c.catalog || c.mole) { c.catalog = ''; c.mole = false; } else c.ground = 'floor';
    }
    if (JSON.stringify(c) === JSON.stringify(cells[i]) && cells.every((cc, k) => cc === l.cells[k] || k === i)) return l;
    cells[i] = c;
    return { ...l, cells };
  };

  const paint = (x, y, merge) => updateLevel((l) => applyTool(l, x, y, tool), merge);
  const fillRect = (r) => {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    updateLevel((l) => {
      let out = l;
      if (tool.kind === 'mole' || (tool.kind === 'ground' && tool.id === 'stairs')) return applyTool(l, r.x1, r.y1, tool);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out = applyTool(out, x, y, tool);
      return out;
    });
  };
  const onCellDown = (x, y, e) => {
    if (!lv || e.button !== 0) return;
    setHl(null);
    if (rectMode) { setDrag({ x0: x, y0: y, x1: x, y1: y }); stroke.current = 'rect'; return; }
    if (tool.kind === 'card' || tool.kind === 'mole') {
      const c = lv.cells[cellIndex(lv, x, y)];
      if (c.catalog || c.mole) { stroke.current = null; return; }
    }
    stroke.current = 'paint';
    paint(x, y, false);
  };
  const onCellEnter = (x, y) => {
    if (stroke.current === 'rect') setDrag((d) => (d ? { ...d, x1: x, y1: y } : d));
    else if (stroke.current === 'paint' && tool.kind !== 'mole' && !(tool.kind === 'ground' && tool.id === 'stairs')) paint(x, y, true);
  };
  useEffect(() => {
    const up = () => {
      if (stroke.current === 'rect' && dragRef.current) fillRect(dragRef.current);
      stroke.current = null; setDrag(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  });
  const onCellClick = (x, y) => {
    if (!lv || rectMode) return;
    if (tool.kind === 'card' || tool.kind === 'mole') {
      const c = lv.cells[cellIndex(lv, x, y)];
      if (c.catalog || c.mole) paint(x, y, false);
    }
  };
  const onDrop = (x, y, e) => {
    e.preventDefault();
    let p; try { p = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); } catch { return; }
    if (!p) return;
    if (p.move) {
      updateLevel((l) => {
        const from = l.cells[cellIndex(l, p.move.x, p.move.y)];
        if (p.move.x === x && p.move.y === y) return l;
        let out = applyTool(l, p.move.x, p.move.y, { kind: 'erase' });
        out = applyTool(out, x, y, from.mole ? { kind: 'mole' } : { kind: 'card', id: from.catalog });
        return out;
      });
    } else updateLevel((l) => applyTool(l, x, y, p));
  };

  const setSize = (cols, rows) => {
    if (!lv) return;
    cols = Math.max(1, Math.min(MAX_SIDE, cols | 0)); rows = Math.max(1, Math.min(MAX_SIDE, rows | 0));
    if (cols === lv.cols && rows === lv.rows) return;
    const lost = lv.cells.filter((c) => (c.x >= cols || c.y >= rows) && (c.catalog || c.mole || c.ground !== 'floor')).length;
    if (lost && !confirm(`缩小后会去掉 ${lost} 个有内容的格子，继续吗？（可以撤销）`)) return;
    updateLevel((l) => resizeLevel(l, cols, rows));
  };

  const checks = useMemo(() => {
    const m = {};
    for (const l of levels) m[l.id] = validateLevel(asValidateLevel(l), lookup);
    return m;
  }, [levels, lookup]);
  const curChecks = lv ? (checks[lv.id] || []) : [];
  const hlSet = useMemo(() => new Set((hl || []).map(([x, y]) => `${x},${y}`)), [hl]);
  const st = lv ? levelStats(lv, lookup) : null;

  // -------- CRUD
  const createLevel = ({ title, theme, cols, rows }) => {
    const lvNew = blankMyLevel({ title, theme, cols, rows });
    commit((cur) => [...cur, lvNew]);
    setNewOpen(false);
    setEditId(lvNew.id);
    flash(`已新建「${lvNew.title}」（${lvNew.id}）`);
  };
  const duplicateLevel = (id) => {
    const src = levels.find((l) => l.id === id);
    if (!src) return;
    const copy = normalizeMyLevel({
      ...clone(src),
      id: undefined,
      title: `${src.title}（副本）`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // force new id
    const fresh = blankMyLevel({ title: copy.title, theme: copy.theme, cols: copy.cols, rows: copy.rows });
    const out = { ...copy, id: fresh.id, cells: clone(src.cells), note: src.note, shopGoods: clone(src.shopGoods) };
    if (src.author) out.author = src.author;
    commit((cur) => [...cur, out]);
    flash(`已复制为「${out.title}」`);
  };
  const deleteLevel = async (id) => {
    const src = levels.find((l) => l.id === id);
    if (!src) return;
    if (!confirm(`删除「${src.title}」？本机列表会去掉；若已打开文件夹也会尝试删掉 ${id}.json。`)) return;
    commit((cur) => cur.filter((l) => l.id !== id));
    if (editId === id) setEditId(null);
    if (dirHandle) {
      try {
        await dirHandle.removeEntry(`${id}.json`);
        await writeIndex(dirHandle, levels.filter((l) => l.id !== id));
        flash(`已删除 ${id}.json 并更新 index.json`);
      } catch (e) {
        flash(`已从列表移除；磁盘文件未删（${e.message}）。请手动删服务器/磁盘上的 ${id}.json`, 'err');
      }
    } else {
      flash('已从本机列表移除。若磁盘上有文件请手动删除。');
    }
  };
  const renameLevel = (id, title) => {
    const t = (title || '').trim();
    if (!t) return flash('标题不能为空', 'err');
    commit((cur) => cur.map((l) => (l.id === id ? { ...l, title: t, updatedAt: new Date().toISOString() } : l)));
    setRenameId(null);
    flash('已改名');
  };

  const writeIndex = async (dir, list) => {
    await writeText(dir, 'index.json', formatMyIndexJson(list.map(myLevelMeta)));
  };

  const pickFolder = async () => {
    try {
      const picked = await window.showDirectoryPicker({ id: 'diggy-my-levels', mode: 'readwrite' });
      let dir = await resolveConfigDir(picked, [MY_LEVEL_DIR]);
      if (!dir) {
        if (!confirm(`你选的文件夹叫「${picked.name}」，不是 配置表 / json / ${MY_LEVEL_DIR}。\n直接把关卡 JSON 写到这里吗？`)) return;
        dir = picked;
      }
      setDirHandle(dir);
      // load existing files
      const got = [];
      let indexIds = null;
      try {
        const ih = await dir.getFileHandle('index.json');
        const idx = JSON.parse(await (await ih.getFile()).text());
        if (Array.isArray(idx?.levels)) indexIds = new Set(idx.levels.map((m) => m.id));
      } catch { /* no index yet */ }
      for await (const ent of dir.values()) {
        if (ent.kind !== 'file' || !ent.name.endsWith('.json') || ent.name === 'index.json') continue;
        try {
          const d = JSON.parse(await (await ent.getFile()).text());
          if (d.schemaVersion !== SCHEMA_VERSION) continue;
          if (d.table && d.table !== '我的关卡') continue;
          if (!Array.isArray(d.cells)) continue;
          got.push(normalizeMyLevel(d));
        } catch { /* skip bad */ }
      }
      if (got.length) {
        // merge: folder wins on same id
        commit((cur) => {
          const m = new Map(cur.map((l) => [l.id, l]));
          for (const g of got) m.set(g.id, g);
          let arr = [...m.values()];
          if (indexIds) {
            const order = [...indexIds].filter((id) => m.has(id));
            const rest = arr.filter((l) => !indexIds.has(l.id));
            arr = [...order.map((id) => m.get(id)), ...rest];
          }
          return arr;
        });
        flash(`已打开文件夹，读到 ${got.length} 个关卡`);
      } else {
        flash(`已打开「${dir.name}」（还没有关卡文件）`);
      }
    } catch (e) { if (e.name !== 'AbortError') flash('打开失败：' + e.message, 'err'); }
  };

  const refreshIndex = async () => {
    if (!dirHandle) return flash('请先打开我的关卡文件夹', 'err');
    try {
      await writeIndex(dirHandle, levels);
      flash('已重写 index.json');
    } catch (e) { flash('刷新失败：' + e.message, 'err'); }
  };

  const saveOne = async (id) => {
    const src = levels.find((l) => l.id === id);
    if (!src) return;
    const errs = (checks[id] || []).filter((c) => c.sev === 'err');
    if (errs.length && !confirm(`还有 ${errs.length} 个错误（红色）。仍然保存吗？`)) return;
    const text = formatMyLevelJson(src);
    if (dirHandle) {
      try {
        await writeText(dirHandle, `${src.id}.json`, text);
        await writeIndex(dirHandle, levels);
        flash(`已写入 ${src.id}.json + index.json`);
      } catch (e) { flash('保存失败：' + e.message, 'err'); }
    } else {
      download(`${src.id}.json`, text, 'application/json');
      flash('已下载单关 JSON。建议用「打开文件夹」后「保存到文件夹」，以便自动维护 index.json');
    }
  };

  const saveAll = async () => {
    const bad = levels.reduce((n, l) => n + (checks[l.id] || []).filter((c) => c.sev === 'err').length, 0);
    if (bad && !confirm(`还有 ${bad} 个错误。仍然全部保存吗？`)) return;
    if (dirHandle) {
      try {
        for (const l of levels) await writeText(dirHandle, `${l.id}.json`, formatMyLevelJson(l));
        await writeIndex(dirHandle, levels);
        flash(`已写入 ${levels.length} 个关卡 + index.json`);
      } catch (e) { flash('保存失败：' + e.message, 'err'); }
    } else {
      const zip = makeZip([
        { name: 'index.json', text: formatMyIndexJson(levels.map(myLevelMeta)) },
        ...levels.map((l) => ({ name: `${l.id}.json`, text: formatMyLevelJson(l) })),
      ]);
      download('我的关卡.zip', new Blob([zip], { type: 'application/zip' }));
      flash('已下载 zip（含 index.json）');
    }
  };

  const importFiles = async (files) => {
    const got = [];
    try {
      for (const f of files) {
        if (f.name === 'index.json') continue;
        const d = JSON.parse(await f.text());
        if (d.schemaVersion !== SCHEMA_VERSION || !Array.isArray(d.cells)) throw new Error(`${f.name} 不是 schemaVersion ${SCHEMA_VERSION} 的我的关卡 JSON`);
        got.push(normalizeMyLevel(d));
      }
      if (!got.length) return;
      if (!confirm(`导入 ${got.length} 个关卡？同 id 会覆盖本机列表（可以撤销）。`)) return;
      commit((cur) => {
        const m = new Map(cur.map((l) => [l.id, l]));
        for (const g of got) m.set(g.id, g);
        return [...m.values()];
      });
      flash(`已导入 ${got.length} 个关卡`);
    } catch (e) { flash('导入失败：' + e.message, 'err'); }
  };

  const clearBoard = () => updateLevel((l) => ({ ...l, cells: l.cells.map((c) => ({ ...c, ground: 'floor', catalog: '', mole: false })) }));

  const pieceOf = (c) => (c.mole ? { name: '黄鼹鼠', img: `${base}/images/roles/mole.png`, kind: 'mole' } : c.catalog ? lookup.info[c.catalog] || { name: c.catalog, img: null, kind: 'unknown' } : null);
  const toolLabel = tool.kind === 'ground' ? `刷地形：${lookup.ground[tool.id]?.name}` : tool.kind === 'card' ? `放牌：${lookup.info[tool.id]?.name || tool.id}` : tool.kind === 'mole' ? '放黄鼹鼠' : '橡皮';
  const errs = curChecks.filter((c) => c.sev === 'err').length;

  // ================= LIST =================
  if (!lv) {
    return (
      <div className="le">
        <div className="ed-bar sketch le-bar">
          <div className="ed-row">
            <span className="status-pill">{levels.length ? <>🏠 本机 <b>{levels.length}</b> 个关卡</> : <>🏠 还没有关卡</>}</span>
            <span className="muted small">{dirHandle ? `文件夹：${dirHandle.name}` : '未打开文件夹'}{savedAt ? ` · 自动存本机 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            <span className="grow" />
            <button className="btn small yellow" onClick={() => setNewOpen(true)}>＋ 新建关卡</button>
            {canSaveDir && <button className="btn small" onClick={pickFolder} title={`选 notes/配置表（或 json、${MY_LEVEL_DIR}）`}>📂 打开文件夹</button>}
            {dirHandle && <button className="btn small" onClick={refreshIndex}>刷新索引</button>}
            <button className="btn small" onClick={() => fileRef.current?.click()}>导入 JSON</button>
            <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => { const f = [...(e.target.files || [])]; if (f.length) importFiles(f); e.target.value = ''; }} />
            <button className="btn small" onClick={saveAll} disabled={!levels.length}>{dirHandle ? '💾 全部保存' : '⬇ 全部（zip）'}</button>
          </div>
        </div>
        <div className="le-panel sketch" style={{ marginTop: 12 }}>
          <h4>我的关卡 <span className="muted small">一关一个 JSON · 与官方「关卡/」分开 · 游戏直接读 JSON，不经 Prefab</span></h4>
          {!levels.length && (
            <p className="muted">点「新建关卡」开始；或「打开文件夹」读已有的 <code>{MY_LEVEL_DIR}/</code>。保存时会写 <code>{'{id}'}.json</code> 并维护同目录 <code>index.json</code>（不含格子数据）。</p>
          )}
          {levels.length > 0 && (
            <table className="tbl le-sum">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>主题</th>
                  <th>尺寸</th>
                  <th>更新</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => {
                  const c = checks[l.id] || [];
                  const bad = c.filter((x) => x.sev === 'err').length;
                  return (
                    <tr key={l.id}>
                      <td>
                        <b>{l.title}</b>
                        <div className="mono muted small">{l.id}</div>
                      </td>
                      <td>{themeName(l.theme)}</td>
                      <td>{l.cols}×{l.rows}</td>
                      <td className="muted small">{l.updatedAt ? new Date(l.updatedAt).toLocaleString('zh-CN') : '—'}</td>
                      <td>{bad ? <span className="status-pill err">⚠️ {bad}</span> : isEmptyLevel(l) ? <span className="muted">空</span> : <span className="ok">✅</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn small yellow" onClick={() => { setEditId(l.id); setHl(null); }}>编辑</button>{' '}
                        <button className="btn small" onClick={() => setRenameId(l.id)}>改名</button>{' '}
                        <button className="btn small" onClick={() => duplicateLevel(l.id)}>复制</button>{' '}
                        <button className="btn small" onClick={() => saveOne(l.id)}>{dirHandle ? '保存' : '⬇'}</button>{' '}
                        <button className="btn small" onClick={() => deleteLevel(l.id)}>删除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {newOpen && <NewDialog onOk={createLevel} onCancel={() => setNewOpen(false)} />}
        {renameId && (
          <RenameDialog
            title={levels.find((l) => l.id === renameId)?.title || ''}
            onOk={(t) => renameLevel(renameId, t)}
            onCancel={() => setRenameId(null)}
          />
        )}
        {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      </div>
    );
  }

  // ================= EDITOR =================
  return (
    <div className="le">
      <div className="ed-bar sketch le-bar">
        <div className="ed-row">
          <button className="btn small" onClick={() => setEditId(null)}>← 返回列表</button>
          <span className="status-pill">🏠 {lv.title}</span>
          <span className="mono muted small">{lv.id}</span>
          <span className="grow" />
          <button className="btn small" onClick={undo} disabled={!past.length} title="Ctrl+Z">↶ 撤销</button>
          <button className="btn small" onClick={redo} disabled={!future.length}>↷ 重做</button>
          <button className="btn small yellow" onClick={() => saveOne(lv.id)}>{dirHandle ? '💾 保存' : '⬇ 下载 JSON'}</button>
          {canSaveDir && !dirHandle && <button className="btn small" onClick={pickFolder}>📂 打开文件夹</button>}
        </div>
      </div>

      <div className="le-body">
        <aside className="le-worlds sketch">
          <div className="le-world on">
            <div className="le-wbtn" style={{ cursor: 'default' }}>
              <span className="le-wno">★</span>
              <span className="le-wname">我的关卡</span>
              <span className="le-wmeta">{levels.length}</span>
            </div>
            <div className="le-levels" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px 8px' }}>
              {levels.map((l) => {
                const bad = (checks[l.id] || []).some((x) => x.sev === 'err');
                return (
                  <button key={l.id} className={`le-lv ${l.id === editId ? 'on' : ''} ${isEmptyLevel(l) ? 'empty' : ''} ${bad ? 'bad' : ''}`}
                    style={{ width: '100%', textAlign: 'left', padding: '6px 8px' }}
                    onClick={() => { setEditId(l.id); setHl(null); }}
                    title={l.id}>
                    {l.title}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="hint" style={{ padding: '0 10px 8px' }}>主题只借官方世界美术，不占冒险进度。</p>
        </aside>

        <section className="le-center">
          <div className="le-head">
            <h3>{lv.title} <span className="mono muted">{lv.id}.json</span></h3>
            {errs > 0 && <span className="status-pill err">⚠️ {errs} 个错误</span>}
          </div>
          <div className="le-tools sketch">
            <div className="ed-row">
              <span className="flabel">主题</span>
              <select value={lv.theme} onChange={(e) => updateLevel((l) => ({ ...l, theme: e.target.value }))}>
                {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.hidden ? `${w.name}（隐藏）` : w.name}</option>)}
              </select>
              <span className="flabel">地形</span>
              <div className="seg">
                {GROUNDS.map((g) => (
                  <button key={g.id} className={tool.kind === 'ground' && tool.id === g.id ? 'on' : ''} onClick={() => setTool({ kind: 'ground', id: g.id })}>
                    <img className="seg-ico" src={lookup.ground[g.id].src} alt="" />{g.name}
                  </button>
                ))}
              </div>
              <div className="seg">
                <button className={tool.kind === 'mole' ? 'on' : ''} onClick={() => setTool({ kind: 'mole' })}><img className="seg-ico" src={`${base}/images/roles/mole.png`} alt="" />黄鼹鼠</button>
                <button className={tool.kind === 'erase' ? 'on' : ''} onClick={() => setTool({ kind: 'erase' })}>🧽 橡皮</button>
              </div>
              <label className="chk"><input type="checkbox" checked={rectMode} onChange={(e) => setRectMode(e.target.checked)} />▭ 框选填充</label>
            </div>
            <div className="ed-row">
              <span className="flabel">大小</span>
              <label className="sz">列 <input type="number" min={1} max={MAX_SIDE} value={lv.cols} onChange={(e) => setSize(+e.target.value, lv.rows)} /></label>
              <span>×</span>
              <label className="sz">行 <input type="number" min={1} max={MAX_SIDE} value={lv.rows} onChange={(e) => setSize(lv.cols, +e.target.value)} /></label>
              <span className="grow" />
              <span className="tag y">当前：{toolLabel}</span>
              <button className="btn small" onClick={clearBoard}>清空本关</button>
            </div>
          </div>

          <div className="le-board-wrap sketch">
            <div className="le-board" style={{ '--cols': lv.cols }} onMouseLeave={() => { if (stroke.current === 'paint') stroke.current = null; }}>
              <div className="le-axis corner" />
              {Array.from({ length: lv.cols }, (_, x) => <div key={`ax${x}`} className="le-axis top">{x}</div>)}
              {Array.from({ length: lv.rows }, (_, y) => [
                <div key={`ay${y}`} className="le-axis left">{y}</div>,
                ...Array.from({ length: lv.cols }, (_, x) => {
                  const c = lv.cells[cellIndex(lv, x, y)];
                  const p = pieceOf(c);
                  const inRect = drag && x >= Math.min(drag.x0, drag.x1) && x <= Math.max(drag.x0, drag.x1) && y >= Math.min(drag.y0, drag.y1) && y <= Math.max(drag.y0, drag.y1);
                  return (
                    <div key={`${x},${y}`} className={`le-cell g-${c.ground} ${inRect ? 'rect' : ''} ${hlSet.has(`${x},${y}`) ? 'hl' : ''}`}
                      style={{ backgroundImage: `url(${lookup.ground[c.ground]?.src})` }}
                      onMouseDown={(e) => onCellDown(x, y, e)} onMouseEnter={() => onCellEnter(x, y)} onClick={() => onCellClick(x, y)}
                      onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(x, y, e)}
                      title={`(${x}, ${y}) ${lookup.ground[c.ground]?.name}${p ? ' · ' + p.name : ''}`}>
                      {p && (
                        <div className={`le-piece k-${p.kind}`} draggable={!rectMode && (tool.kind === 'card' || tool.kind === 'mole')}
                          onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ move: { x, y } })); e.dataTransfer.effectAllowed = 'move'; }}>
                          {p.img ? <img src={p.img} alt={p.name} draggable={false} /> : <span className="le-unknown">?</span>}
                          {p.kind === 'monster' && <span className="le-mini">{p.r.heart}/{p.r.tooth}</span>}
                        </div>
                      )}
                    </div>
                  );
                }),
              ])}
            </div>
            <p className="hint">与冒险关卡同一套工具。保存产物是 JSON，游戏直接读取，不再转 Prefab。</p>
          </div>

          <div className="le-panels">
            <div className="le-panel sketch">
              <h4>检查</h4>
              {curChecks.length === 0 && <p className="ok">✅ 没问题：1 只黄鼹鼠、1 个楼梯，走得到。</p>}
              <ul className="le-checks">
                {curChecks.map((c, i) => (
                  <li key={i} className={c.sev} onClick={() => c.cells && setHl(c.cells)}>
                    {c.sev === 'err' ? '✖' : c.sev === 'warn' ? '⚠' : 'ℹ'} {c.msg}{c.cells?.length ? <span className="muted small"> （点我看格子）</span> : null}
                  </li>
                ))}
              </ul>
              {st && !isEmptyLevel(lv) && (
                <div className="le-stats">
                  <span><b>{st.monsters}</b> 只怪</span>
                  <span><img src={`${base}${STAT_ICONS.heart}`} alt="" /> 总心 <b>{st.heart}</b></span>
                  <span><img src={`${base}${STAT_ICONS.tooth}`} alt="" /> 总牙 <b>{st.tooth}</b></span>
                  <span>装备 <b>{st.equipment}</b> · 宝箱 <b>{st.chest}</b> · 黄头鸭 <b>{st.duck}</b></span>
                </div>
              )}
            </div>
            <div className="le-panel sketch">
              <h4>本关设置</h4>
              <div className="le-settings">
                <label className="fld">
                  <span className="flabel">标题</span>
                  <input value={lv.title} onChange={(e) => updateLevel((l) => ({ ...l, title: e.target.value }), true)} />
                </label>
                <label className="fld">
                  <span className="flabel">说明 note</span>
                  <textarea rows={2} value={lv.note} placeholder="这一关的设计意图…" onChange={(e) => updateLevel((l) => ({ ...l, note: e.target.value }), true)} />
                </label>
                <div className="fld">
                  <span className="flabel">黄头鸭的货架 shopGoods
                    <label className="chk small"><input type="checkbox" checked={lv.shopGoods === null} onChange={(e) => updateLevel((l) => ({ ...l, shopGoods: e.target.checked ? null : [] }))} />用默认</label>
                  </span>
                  {lv.shopGoods !== null && (
                    <div className="chips">
                      {palette.deal.shop.map((id) => {
                        const on = lv.shopGoods.includes(id);
                        const info = lookup.info[id];
                        return (
                          <label key={id} className={`chip toggle ${on ? 'on' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => updateLevel((l) => ({ ...l, shopGoods: on ? l.shopGoods.filter((g) => g !== id) : [...l.shopGoods, id] }))} />
                            {info?.img && <img className="chip-ico" src={info.img} alt="" />}{info?.name || id}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="le-palette sketch">
          <Palette lookup={lookup} palette={palette} base={base} tool={tool} setTool={setTool} />
        </aside>
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

function NewDialog({ onOk, onCancel }) {
  const [title, setTitle] = useState('未命名关卡');
  const [theme, setTheme] = useState('world1');
  const [cols, setCols] = useState(DEFAULT_SIZE.cols);
  const [rows, setRows] = useState(DEFAULT_SIZE.rows);
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal sketch" onClick={(e) => e.stopPropagation()}>
        <h3>新建关卡</h3>
        <label>标题<input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
        <label>主题（美术）
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.name}{w.hidden ? '（隐藏）' : ''}</option>)}
          </select>
        </label>
        <label>列<input type="number" min={1} max={MAX_SIDE} value={cols} onChange={(e) => setCols(+e.target.value)} /></label>
        <label>行<input type="number" min={1} max={MAX_SIDE} value={rows} onChange={(e) => setRows(+e.target.value)} /></label>
        <p className="hint">会自动生成 id（ml_…），并默认放 1 只黄鼹鼠 + 1 个楼梯。</p>
        <div className="ps-foot">
          <button className="btn small" onClick={onCancel}>取消</button>
          <span className="grow" />
          <button className="btn small yellow" disabled={!title.trim()} onClick={() => onOk({ title: title.trim(), theme, cols, rows })}>创建</button>
        </div>
      </div>
    </div>
  );
}

function RenameDialog({ title: initial, onOk, onCancel }) {
  const [title, setTitle] = useState(initial);
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal sketch" onClick={(e) => e.stopPropagation()}>
        <h3>改名</h3>
        <label>标题<input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
        <div className="ps-foot">
          <button className="btn small" onClick={onCancel}>取消</button>
          <span className="grow" />
          <button className="btn small yellow" disabled={!title.trim()} onClick={() => onOk(title.trim())}>确定</button>
        </div>
      </div>
    </div>
  );
}
