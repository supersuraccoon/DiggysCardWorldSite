import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  WORLDS, GROUNDS, LEVELS_PER_WORLD, MAX_SIDE, SCHEMA_VERSION, DEFAULT_SIZE,
  normalizeWorld, blankWorld, resizeLevel, cellIndex, isEmptyLevel, formatWorldJson, levelKey,
  validateLevel, levelStats, makeZip, resolveConfigDir, writeText,
} from '../../lib/levels.js';
import { STAT_ICONS } from '../../lib/icons.js';
import { asset } from '../../lib/site.js';
import { Palette } from './Palette.jsx';

const LS_KEY = 'diggy.editor.levels.v1';
const clone = (x) => JSON.parse(JSON.stringify(x));
const DRAG_MIME = 'text/x-diggy-piece';

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function LevelEditor({ shippedWorlds, roles, palette, base = '' }) {
  // ---------------- 素材表
  const lookup = useMemo(() => {
    const monsters = roles.roles.filter((r) => r.group === 'deal');
    const byRole = Object.fromEntries(roles.roles.map((r) => [r.id, r]));
    const kind = {};
    for (const r of monsters) kind[r.id] = 'monster';
    for (const e of palette.equipment) kind[e.id] = 'equipment';
    for (const i of palette.items) kind[i.id] = 'item';
    for (const s of palette.store) kind[s.id] = 'store';
    const info = {};
    for (const r of monsters) info[r.id] = { id: r.id, name: r.name, img: `${base}/images/roles/${r.id}.png`, kind: 'monster', r };
    for (const e of palette.equipment) info[e.id] = { id: e.id, name: e.name, img: `${base}/${e.img}`, kind: 'equipment', e };
    for (const i of [...palette.items, ...palette.store]) info[i.id] = { id: i.id, name: i.name, img: `${base}/${i.img}`, kind: kind[i.id], e: i };
    return {
      monsters, info,
      kindOf: (id) => kind[id] || null,
      role: (id) => byRole[id],
      shop: new Set(palette.deal.shop),
      ground: Object.fromEntries(palette.terrain.map((t) => [t.id, { ...t, src: `${base}/${t.img}` }])),
    };
  }, [roles, palette, base]);

  const shipped = useMemo(() => {
    const m = {};
    for (const w of WORLDS) m[w.id] = normalizeWorld(shippedWorlds[w.id] || blankWorld(w));
    return m;
  }, [shippedWorlds]);

  // ---------------- 状态 + 撤销
  const [worlds, setWorlds] = useState(() => clone(shipped));
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [wid, setWid] = useState('world1');
  const [lvNo, setLvNo] = useState(1);
  const [tool, setTool] = useState({ kind: 'ground', id: 'wall' }); // ground | card | mole | erase
  const [rectMode, setRectMode] = useState(false);
  const [drag, setDragState] = useState(null); // {x0,y0,x1,y1} 框选中
  const dragRef = useRef(null); // 同步副本：松手时不用等 React 重新渲染
  const setDrag = (v) => { const next = typeof v === 'function' ? v(dragRef.current) : v; dragRef.current = next; setDragState(next); };
  const [hl, setHl] = useState(null); // 检查面板点中的格子
  const [toast, setToast] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [canSaveDir, setCanSaveDir] = useState(false);
  const fileRef = useRef(null);
  const stroke = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.worlds && Object.values(saved.worlds).every((d) => d.schemaVersion === SCHEMA_VERSION)) {
          const m = clone(shipped);
          for (const [k, d] of Object.entries(saved.worlds)) if (m[k]) m[k] = normalizeWorld(d);
          setWorlds(m); setSavedAt(saved.savedAt);
          if (saved.wid && m[saved.wid]) setWid(saved.wid);
          if (saved.lvNo) setLvNo(saved.lvNo);
        }
      }
    } catch { /* 坏数据忽略 */ }
    setCanSaveDir('showDirectoryPicker' in window);
    setLoaded(true);
  }, [shipped]);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const now = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: now, wid, lvNo, worlds }));
      setSavedAt(now);
    }, 300);
    return () => clearTimeout(t);
  }, [worlds, loaded, wid, lvNo]);

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200); };

  /** 改数据。merge=true 时并进上一步（一笔拖着画算一步撤销） */
  const commit = useCallback((fn, merge = false) => {
    setWorlds((cur) => {
      const next = fn(cur);
      if (next === cur) return cur;
      if (!merge) { setPast((p) => [...p.slice(-99), cur]); setFuture([]); }
      return next;
    });
  }, []);
  const undo = () => { if (!past.length) return; setFuture((f) => [worlds, ...f]); setWorlds(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, worlds]); setWorlds(future[0]); setFuture((f) => f.slice(1)); };
  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const world = worlds[wid];
  const wmeta = WORLDS.find((w) => w.id === wid);
  const lv = world.levels.find((l) => l.level === lvNo) || world.levels[0];
  const shippedLv = shipped[wid].levels.find((l) => l.level === lv.level);

  const updateLevel = useCallback((fn, merge = false) => {
    commit((cur) => {
      const w = cur[wid];
      const levels = w.levels.map((l) => (l.level === lvNo ? fn(l) : l));
      if (levels.every((l, i) => l === w.levels[i])) return cur;
      return { ...cur, [wid]: { ...w, levels } };
    }, merge);
  }, [commit, wid, lvNo]);

  // ---------------- 改格子
  const applyTool = (l, x, y, t) => {
    const cells = l.cells.slice();
    const i = cellIndex(l, x, y);
    const c = { ...cells[i] };
    if (t.kind === 'ground') {
      if (t.id === 'stairs') {
        // 楼梯只能有一个：新放的顶掉旧的
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
    if (e.button !== 0) return;
    setHl(null);
    if (rectMode) { setDrag({ x0: x, y0: y, x1: x, y1: y }); stroke.current = 'rect'; return; }
    if (tool.kind === 'card' || tool.kind === 'mole') {
      // 已经有牌的格子：留给拖拽移动；空格子：直接放
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
    if (rectMode) return;
    if (tool.kind === 'card' || tool.kind === 'mole') {
      const c = lv.cells[cellIndex(lv, x, y)];
      if (c.catalog || c.mole) paint(x, y, false); // 点已有牌的格子 = 换成当前的牌
    }
  };
  // 拖拽：素材栏 → 格子；格子 → 格子（移动）
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
    cols = Math.max(1, Math.min(MAX_SIDE, cols | 0)); rows = Math.max(1, Math.min(MAX_SIDE, rows | 0));
    if (cols === lv.cols && rows === lv.rows) return;
    const lost = lv.cells.filter((c) => (c.x >= cols || c.y >= rows) && (c.catalog || c.mole || c.ground !== 'floor')).length;
    if (lost && !confirm(`缩小后会去掉 ${lost} 个有内容的格子，继续吗？（可以撤销）`)) return;
    updateLevel((l) => resizeLevel(l, cols, rows));
  };

  // ---------------- 检查 / 统计
  const checks = useMemo(() => {
    const m = {};
    for (const w of WORLDS) for (const l of worlds[w.id].levels) m[`${w.id}:${l.level}`] = validateLevel(l, lookup);
    return m;
  }, [worlds, lookup]);
  const curChecks = checks[`${wid}:${lv.level}`] || [];
  const worldStats = useMemo(() => world.levels.map((l) => ({ level: l.level, empty: isEmptyLevel(l), ...levelStats(l, lookup) })), [world, lookup]);
  const changedLv = (w, l) => {
    const s = shipped[w].levels.find((x) => x.level === l.level);
    return !s || levelKey(s) !== levelKey(l);
  };
  const changedCount = useMemo(() => {
    let n = 0; for (const w of WORLDS) for (const l of worlds[w.id].levels) if (changedLv(w.id, l)) n++; return n;
  }, [worlds, shipped]);
  const hlSet = useMemo(() => new Set((hl || []).map(([x, y]) => `${x},${y}`)), [hl]);

  // ---------------- 还原 / 复制
  const resetLevel = () => { if (!shippedLv) return; updateLevel(() => clone(shippedLv)); flash(`已还原 第 ${lv.level} 层`); };
  const resetWorld = () => { if (!confirm(`把「${wmeta.name}」10 层都还原成网站数据？`)) return; commit((cur) => ({ ...cur, [wid]: clone(shipped[wid]) })); flash(`已还原 ${wmeta.name}`); };
  const resetAll = () => { if (!confirm('把所有世界都还原成网站数据？（本地改动会丢掉，可以撤销）')) return; commit(() => clone(shipped)); flash('已全部还原'); };
  const clearLevel = () => updateLevel((l) => ({ ...l, cells: l.cells.map((c) => ({ ...c, ground: 'floor', catalog: '', mole: false })) }));
  const copyTo = (toW, toL) => {
    commit((cur) => {
      const w = cur[toW];
      const src = clone(lv);
      const levels = w.levels.map((l) => (l.level === toL ? { ...src, level: toL, note: src.note ? `${src.note}（复制自 ${wmeta.name} 第 ${lv.level} 层）` : `复制自 ${wmeta.name} 第 ${lv.level} 层` } : l));
      return { ...cur, [toW]: { ...w, levels } };
    });
    setCopyOpen(false); setWid(toW); setLvNo(toL);
    flash(`已复制到 ${WORLDS.find((w) => w.id === toW).name} 第 ${toL} 层`);
  };

  // ---------------- 导出 / 导入 / 保存
  const exportWorld = (id) => {
    const changed = worlds[id].levels.some((l) => changedLv(id, l));
    return { ...worlds[id], schemaVersion: SCHEMA_VERSION, updatedAt: changed ? new Date().toISOString() : worlds[id].updatedAt };
  };
  const errCount = (id) => worlds[id].levels.reduce((n, l) => n + (checks[`${id}:${l.level}`] || []).filter((c) => c.sev === 'err').length, 0);
  const guard = (ids) => {
    const n = ids.reduce((a, id) => a + errCount(id), 0);
    return !n || confirm(`还有 ${n} 个错误（红色）。仍然导出吗？`);
  };
  const exportOne = () => { if (!guard([wid])) return; download(`${wid}.json`, formatWorldJson(exportWorld(wid)), 'application/json'); };
  const exportZip = () => {
    if (!guard(WORLDS.map((w) => w.id))) return;
    const zip = makeZip(WORLDS.map((w) => ({ name: `关卡/${w.id}.json`, text: formatWorldJson(exportWorld(w.id)) })));
    download('关卡.zip', new Blob([zip], { type: 'application/zip' }));
  };
  const importFiles = async (files) => {
    const got = [];
    try {
      for (const f of files) {
        const d = JSON.parse(await f.text());
        if (d.schemaVersion !== SCHEMA_VERSION || !d.world?.id || !Array.isArray(d.levels)) throw new Error(`${f.name} 不是 schemaVersion ${SCHEMA_VERSION} 的关卡 JSON`);
        if (!WORLDS.some((w) => w.id === d.world.id)) throw new Error(`${f.name}：不认识的世界 ${d.world.id}`);
        got.push(normalizeWorld(d));
      }
      if (!got.length) return;
      if (!confirm(`导入 ${got.map((d) => d.world.name || d.world.id).join('、')}？会替换编辑器里这些世界的数据（可以撤销）。`)) return;
      commit((cur) => { const m = { ...cur }; for (const d of got) m[d.world.id] = d; return m; });
      setWid(got[0].world.id); flash(`已导入 ${got.length} 个世界`);
    } catch (e) { flash('导入失败：' + e.message, 'err'); }
  };
  const saveToDir = async () => {
    if (!guard(WORLDS.map((w) => w.id))) return;
    try {
      const picked = await window.showDirectoryPicker({ id: 'diggy-config', mode: 'readwrite' });
      let dir = await resolveConfigDir(picked, ['关卡']);
      if (!dir) {
        if (!confirm(`你选的文件夹叫「${picked.name}」，不是 配置表 / json / 关卡。\n直接把 9 个世界的 JSON 写到这里吗？`)) return;
        dir = picked;
      }
      for (const w of WORLDS) await writeText(dir, `${w.id}.json`, formatWorldJson(exportWorld(w.id)));
      flash(`已写入 ${picked.name === dir.name ? dir.name : picked.name + '/…/' + dir.name}/ 里 9 个 JSON`);
    } catch (e) { if (e.name !== 'AbortError') flash('保存失败：' + e.message, 'err'); }
  };

  // ---------------- 画面
  const pieceOf = (c) => (c.mole ? { name: '黄鼹鼠', img: `${base}/images/roles/mole.png`, kind: 'mole' } : c.catalog ? lookup.info[c.catalog] || { name: c.catalog, img: null, kind: 'unknown' } : null);
  const toolLabel = tool.kind === 'ground' ? `刷地形：${lookup.ground[tool.id]?.name}` : tool.kind === 'card' ? `放牌：${lookup.info[tool.id]?.name || tool.id}` : tool.kind === 'mole' ? '放黄鼹鼠' : '橡皮';
  const errs = curChecks.filter((c) => c.sev === 'err').length;
  const st = worldStats.find((s) => s.level === lv.level);

  return (
    <div className="le-levels-root">
      <div className="ed-bar sketch le-bar">
        <div className="ed-row">
          <span className={`status-pill ${changedCount ? 'dirty' : ''}`}>{changedCount ? <>✏️ 和网站数据相比改了 <b>{changedCount}</b> 层</> : <>✅ 和网站数据一样</>}</span>
          <span className="muted small">{savedAt ? `已自动存在本机 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          <span className="grow" />
          <button className="btn small" onClick={undo} disabled={!past.length} title="Ctrl+Z">↶ 撤销</button>
          <button className="btn small" onClick={redo} disabled={!future.length} title="Ctrl+Shift+Z / Ctrl+Y">↷ 重做</button>
          <button className="btn small" onClick={resetAll} disabled={!changedCount}>↺ 全部还原</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => { const f = [...(e.target.files || [])]; if (f.length) importFiles(f); e.target.value = ''; }} />
          <button className="btn small yellow" onClick={exportOne}>⬇ {wid}.json</button>
          <button className="btn small" onClick={exportZip} title="9 个世界打成一个 zip">⬇ 全部（zip）</button>
          {canSaveDir && <button className="btn small" onClick={saveToDir} title="选 notes/配置表（或 json、关卡）文件夹，写入 json/关卡/*.json">💾 保存到文件夹</button>}
        </div>
      </div>

      <div className="le-body">
        {/* ---------- 左：世界 / 层 ---------- */}
        <aside className="le-worlds sketch">
          {WORLDS.map((w) => {
            const ch = worlds[w.id].levels.filter((l) => changedLv(w.id, l)).length;
            const er = errCount(w.id);
            const filled = worlds[w.id].levels.filter((l) => !isEmptyLevel(l)).length;
            return (
              <div key={w.id} className={`le-world ${w.id === wid ? 'on' : ''}`}>
                <button className="le-wbtn" onClick={() => { setWid(w.id); setHl(null); }}>
                  <span className="le-wno">{w.hidden ? '?' : w.index}</span>
                  <span className="le-wname">{w.name}{w.hidden && <small>（隐藏）</small>}</span>
                  <span className="le-wmeta">{filled}/10{ch ? <i className="dot y" title={`${ch} 层改过`} /> : null}{er ? <i className="dot r" title={`${er} 个错误`} /> : null}</span>
                </button>
                {w.id === wid && (
                  <div className="le-levels">
                    {worlds[w.id].levels.map((l) => {
                      const c = checks[`${w.id}:${l.level}`] || [];
                      const bad = c.some((x) => x.sev === 'err');
                      return (
                        <button key={l.level} className={`le-lv ${l.level === lvNo ? 'on' : ''} ${isEmptyLevel(l) ? 'empty' : ''} ${bad ? 'bad' : ''}`}
                          onClick={() => { setLvNo(l.level); setHl(null); }} title={`第 ${l.level} 层 · ${l.cols}×${l.rows}${l.note ? ' · ' + l.note : ''}`}>
                          {l.level}{changedLv(w.id, l) && <i className="dot y" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <p className="hint" style={{ padding: '0 10px 8px' }}>灰色 = 空层（全是地板）。红点 = 有错误，黄点 = 改过。</p>
        </aside>

        {/* ---------- 中：牌桌 ---------- */}
        <section className="le-center">
          <div className="le-head">
            <h3>{wmeta.name} · 第 {lv.level} 层 <span className="mono muted">{wid} · 第 {lv.level} 层</span></h3>
            {changedLv(wid, lv) && <span className="was">改过</span>}
            {errs > 0 && <span className="status-pill err">⚠️ {errs} 个错误</span>}
          </div>
          <div className="le-tools sketch">
            <div className="ed-row">
              <span className="flabel">地形</span>
              <div className="seg">
                {GROUNDS.map((g) => (
                  <button key={g.id} className={tool.kind === 'ground' && tool.id === g.id ? 'on' : ''} onClick={() => setTool({ kind: 'ground', id: g.id })} title={g.walkable ? '能走' : '挡路'}>
                    <img className="seg-ico" src={lookup.ground[g.id].src} alt="" />{g.name}
                  </button>
                ))}
              </div>
              <div className="seg">
                <button className={tool.kind === 'mole' ? 'on' : ''} onClick={() => setTool({ kind: 'mole' })}><img className="seg-ico" src={`${base}/images/roles/mole.png`} alt="" />黄鼹鼠</button>
                <button className={tool.kind === 'erase' ? 'on' : ''} onClick={() => setTool({ kind: 'erase' })}>🧽 橡皮</button>
              </div>
              <label className="chk" title="按住拖出一个方框，松手后整块填上当前工具"><input type="checkbox" checked={rectMode} onChange={(e) => setRectMode(e.target.checked)} />▭ 框选填充</label>
            </div>
            <div className="ed-row">
              <span className="flabel">大小</span>
              <label className="sz">列 <input type="number" min={1} max={MAX_SIDE} value={lv.cols} onChange={(e) => setSize(+e.target.value, lv.rows)} /></label>
              <span>×</span>
              <label className="sz">行 <input type="number" min={1} max={MAX_SIDE} value={lv.rows} onChange={(e) => setSize(lv.cols, +e.target.value)} /></label>
              <span className="muted small">（每层可以不一样，n×m）</span>
              <span className="grow" />
              <span className="tag y">当前：{toolLabel}</span>
              <button className="btn small" onClick={() => setCopyOpen(true)}>⧉ 复制到…</button>
              <button className="btn small" onClick={clearLevel}>清空本层</button>
              <button className="btn small" onClick={resetLevel} disabled={!changedLv(wid, lv)}>↺ 还原本层</button>
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
                  const orig = shippedLv && shippedLv.cols === lv.cols && shippedLv.rows === lv.rows ? shippedLv.cells[cellIndex(lv, x, y)] : null;
                  const diff = !shippedLv || !orig || orig.ground !== c.ground || orig.catalog !== c.catalog || orig.mole !== c.mole;
                  return (
                    <div key={`${x},${y}`} data-xy={`${x},${y}`} className={`le-cell g-${c.ground} ${inRect ? 'rect' : ''} ${hlSet.has(`${x},${y}`) ? 'hl' : ''} ${diff && changedLv(wid, lv) ? 'diff' : ''}`}
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
            <p className="hint">点一下或按住拖着刷；从右边拖牌进格子，或者先点选再点格子；格子里的牌可以直接拖到别的格子。楼梯和黄鼹鼠一层只有一个，新放的会顶掉旧的。Ctrl+Z 撤销。</p>
          </div>

          <div className="le-panels">
            <div className="le-panel sketch">
              <h4>检查 <span className="muted small">第 {lv.level} 层</span></h4>
              {curChecks.length === 0 && <p className="ok">✅ 没问题：1 只黄鼹鼠、1 个楼梯，走得到。</p>}
              <ul className="le-checks">
                {curChecks.map((c, i) => (
                  <li key={i} className={c.sev} onClick={() => c.cells && setHl(c.cells)}>
                    {c.sev === 'err' ? '✖' : c.sev === 'warn' ? '⚠' : 'ℹ'} {c.msg}{c.cells?.length ? <span className="muted small"> （点我看格子）</span> : null}
                  </li>
                ))}
              </ul>
              {st && !st.empty && (
                <div className="le-stats">
                  <span><b>{st.monsters}</b> 只怪</span>
                  <span><img src={`${asset(base, STAT_ICONS.heart)}`} alt="" /> 总心 <b>{st.heart}</b></span>
                  <span><img src={`${asset(base, STAT_ICONS.tooth)}`} alt="" /> 总牙 <b>{st.tooth}</b></span>
                  <span><img src={`${asset(base, STAT_ICONS.armor)}`} alt="" /> 总甲 <b>{st.armor}</b></span>
                  <span><img src={`${asset(base, STAT_ICONS.gold)}`} alt="" /> 掉金 <b>{st.gold}</b></span>
                  <span>装备 <b>{st.equipment}</b> · 宝箱 <b>{st.chest}</b> · 黄头鸭 <b>{st.duck}</b></span>
                  <span>墙 <b>{st.walls}</b> · 坑 <b>{st.pits}</b></span>
                  {st.catalogStats && <span className="muted small">有怪数值是 -1（用图鉴），没算进去</span>}
                </div>
              )}
            </div>
            <div className="le-panel sketch">
              <h4>难度曲线 <span className="muted small">{wmeta.name} 1–10 层</span></h4>
              <Curve stats={worldStats} cur={lv.level} onPick={setLvNo} />
            </div>
          </div>

          <div className="le-panel sketch">
            <h4>本层设置</h4>
            <div className="le-settings">
              <label className="fld">
                <span className="flabel">说明 note</span>
                <textarea rows={2} value={lv.note} placeholder="这一层的设计意图、要教玩家什么…" onChange={(e) => updateLevel((l) => ({ ...l, note: e.target.value }), true)} />
              </label>
              <div className="fld">
                <span className="flabel">黄头鸭的货架 shopGoods
                  <label className="chk small"><input type="checkbox" checked={lv.shopGoods === null} onChange={(e) => updateLevel((l) => ({ ...l, shopGoods: e.target.checked ? null : [] }))} />用默认（DEAL_SHOP 全部）</label>
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
                <div className="hint">货架每次抽 3 件。只有这一层放了黄头鸭才有用。{!st?.duck ? '（这一层还没有黄头鸭）' : ''}</div>
              </div>
            </div>
          </div>

          <WorldSummary world={world} wmeta={wmeta} stats={worldStats} lookup={lookup} onPick={setLvNo} />
        </section>

        {/* ---------- 右：素材栏 ---------- */}
        <aside className="le-palette sketch">
          <Palette lookup={lookup} palette={palette} base={base} tool={tool} setTool={setTool} />
        </aside>
      </div>

      {copyOpen && <CopyDialog from={{ wid, level: lv.level }} worlds={worlds} onCopy={copyTo} onCancel={() => setCopyOpen(false)} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

// ================= 难度曲线 =================
function Curve({ stats, cur, onPick }) {
  const W = 420, H = 190, pl = 30, pr = 12, pt = 16, pb = 30;
  const xs = (i) => pl + (i * (W - pl - pr)) / (stats.length - 1 || 1);
  const series = [
    { key: 'heart', label: '总心', cls: 'c-heart' },
    { key: 'tooth', label: '总牙', cls: 'c-tooth' },
    { key: 'score', label: '难度分', cls: 'c-score' },
  ];
  const maxM = Math.max(1, ...stats.map((s) => s.monsters));
  const all = stats.every((s) => s.empty);
  return (
    <div className="curve">
      {all ? <p className="muted center" style={{ padding: '40px 0' }}>这个世界还没摆关卡。</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="难度曲线">
          {[0, 0.5, 1].map((f) => <line key={f} x1={pl} x2={W - pr} y1={pt + (1 - f) * (H - pt - pb)} y2={pt + (1 - f) * (H - pt - pb)} className="grid" />)}
          {stats.map((s, i) => {
            const bh = (s.monsters / maxM) * (H - pt - pb) * 0.55;
            return <rect key={i} className={`bar ${s.level === cur ? 'on' : ''}`} x={xs(i) - 9} width={18} y={H - pb - bh} height={bh} onClick={() => onPick(s.level)}><title>{`第 ${s.level} 层：${s.monsters} 只怪`}</title></rect>;
          })}
          {series.map((se) => {
            const max = Math.max(1, ...stats.map((s) => s[se.key]));
            const pts = stats.map((s, i) => [xs(i), pt + (1 - s[se.key] / max) * (H - pt - pb)]);
            return (
              <g key={se.key} className={se.cls}>
                <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" />
                {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={stats[i].level === cur ? 4.5 : 3} onClick={() => onPick(stats[i].level)}><title>{`第 ${stats[i].level} 层 ${se.label} ${stats[i][se.key]}`}</title></circle>)}
              </g>
            );
          })}
          {stats.map((s, i) => <text key={i} x={xs(i)} y={H - 10} className={`lbl ${s.level === cur ? 'on' : ''}`} textAnchor="middle" onClick={() => onPick(s.level)}>{s.level}</text>)}
        </svg>
      )}
      <div className="legend">
        <span><i className="sw bar" />怪数（柱）</span>
        <span><i className="sw c-heart" />总心</span>
        <span><i className="sw c-tooth" />总牙</span>
        <span><i className="sw c-score" />难度分 = Σ√(心×牙)</span>
        <span className="muted small">每条线按自己的最大值缩放</span>
      </div>
    </div>
  );
}

// ================= 世界汇总 =================
function WorldSummary({ world, wmeta, stats, lookup, onPick }) {
  const used = {};
  for (const l of world.levels) for (const c of l.cells) if (c.catalog) {
    const u = (used[c.catalog] ||= { n: 0, levels: new Set() }); u.n++; u.levels.add(l.level);
  }
  const groups = [
    { title: '怪物', ids: Object.keys(used).filter((id) => lookup.kindOf(id) === 'monster') },
    { title: '装备', ids: Object.keys(used).filter((id) => lookup.kindOf(id) === 'equipment') },
    { title: '道具 / 事件', ids: Object.keys(used).filter((id) => ['item', 'store'].includes(lookup.kindOf(id))) },
    { title: '不认识的', ids: Object.keys(used).filter((id) => !lookup.kindOf(id)) },
  ];
  const total = stats.reduce((a, s) => ({ m: a.m + s.monsters, h: a.h + s.heart, t: a.t + s.tooth, g: a.g + s.gold }), { m: 0, h: 0, t: 0, g: 0 });
  return (
    <div className="le-panel sketch">
      <h4>{wmeta.name} 汇总 <span className="muted small">{stats.filter((s) => !s.empty).length}/10 层有内容 · 共 {total.m} 只怪 · 总心 {total.h} · 总牙 {total.t} · 掉金 {total.g}</span></h4>
      <table className="tbl le-sum">
        <thead><tr><th>层</th>{stats.map((s) => <th key={s.level} className={`clickable ${s.empty ? 'muted' : ''}`} onClick={() => onPick(s.level)}>{s.level}</th>)}</tr></thead>
        <tbody>
          <tr><td>大小</td>{world.levels.map((l) => <td key={l.level}>{l.cols}×{l.rows}</td>)}</tr>
          <tr><td>怪</td>{stats.map((s) => <td key={s.level}>{s.monsters || ''}</td>)}</tr>
          <tr><td>总心/牙</td>{stats.map((s) => <td key={s.level}>{s.monsters ? `${s.heart}/${s.tooth}` : ''}</td>)}</tr>
          <tr><td>装备</td>{stats.map((s) => <td key={s.level}>{s.equipment || ''}</td>)}</tr>
          <tr><td>宝箱/鸭</td>{stats.map((s) => <td key={s.level}>{s.chest || s.duck ? `${s.chest}/${s.duck}` : ''}</td>)}</tr>
        </tbody>
      </table>
      <div className="le-used">
        {groups.map((g) => g.ids.length > 0 && (
          <div key={g.title}>
            <div className="flabel">{g.title} <span className="muted small">{g.ids.length} 种</span></div>
            <div className="chips">
              {g.ids.map((id) => (
                <span key={id} className={`chip ${lookup.kindOf(id) ? '' : 'unknown'}`} title={`第 ${[...used[id].levels].join('、')} 层`}>
                  {lookup.info[id]?.img && <img className="chip-ico" src={lookup.info[id].img} alt="" />}
                  {lookup.info[id]?.name || id} ×{used[id].n} <small className="muted">（{[...used[id].levels].join(',')}）</small>
                </span>
              ))}
            </div>
          </div>
        ))}
        {!Object.keys(used).length && <p className="muted">还没有用到任何牌。</p>}
      </div>
    </div>
  );
}

// ================= 复制到… =================
function CopyDialog({ from, worlds, onCopy, onCancel }) {
  const [w, setW] = useState(from.wid);
  const [l, setL] = useState(from.level === LEVELS_PER_WORLD ? 1 : from.level + 1);
  const target = worlds[w].levels.find((x) => x.level === l);
  const same = w === from.wid && l === from.level;
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal sketch" onClick={(e) => e.stopPropagation()}>
        <h3>复制这一层到…</h3>
        <label>世界<select value={w} onChange={(e) => setW(e.target.value)}>{WORLDS.map((x) => <option key={x.id} value={x.id}>{x.index}. {x.name}</option>)}</select></label>
        <label>第几层<select value={l} onChange={(e) => setL(+e.target.value)}>{Array.from({ length: LEVELS_PER_WORLD }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 层{isEmptyLevel(worlds[w].levels[i]) ? '（空）' : ''}</option>)}</select></label>
        {target && !isEmptyLevel(target) && !same && <div className="ferr">目标层已经有内容，会被覆盖（可以撤销）。</div>}
        <div className="ps-foot">
          <button className="btn small" onClick={onCancel}>取消</button>
          <span className="grow" />
          <button className="btn small yellow" disabled={same} onClick={() => onCopy(w, l)}>复制</button>
        </div>
      </div>
    </div>
  );
}
