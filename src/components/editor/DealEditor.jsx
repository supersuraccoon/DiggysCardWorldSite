import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveConfigDir, writeText } from '../../lib/levels.js';

// 地下城（随机发牌）每一层的怪池 / 数量 / 商店。只导出 notes/配置表/json/地下城发牌.json，
// 不同步任何代码（deal.ts 的 FLOOR_DEAL / DEAL_MONSTERS 先不动）。
const LS_KEY = 'diggy.editor.deal.v1';
const clone = (x) => JSON.parse(JSON.stringify(x));
const POOLS = [
  { key: 'monsters', count: 'monsterCount', label: '怪池', countLabel: '怪数', all: 'monsters' },
  { key: 'equipment', count: 'equipmentCount', label: '装备池', countLabel: '装备数', all: 'equipment' },
  { key: 'items', count: 'itemCount', label: '道具池', countLabel: '道具数', all: 'items' },
];
const blankFloor = (n) => ({ floor: n, monsters: null, monsterCount: null, equipment: null, equipmentCount: null, items: null, itemCount: null, shop: null, shopGoods: null });

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function DealEditor({ shipped, palette, lookup, base = '' }) {
  const [data, setData] = useState(() => clone(shipped));
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [canSaveDir, setCanSaveDir] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const s = JSON.parse(raw); if (s?.data?.schemaVersion === 1 && Array.isArray(s.data.floors)) setData(s.data); }
    } catch { /* ignore */ }
    setCanSaveDir('showDirectoryPicker' in window);
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data })); }, [data, loaded]);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200); };

  // 可选的 id：怪池 = 已做成牌的怪；装备池 = 桌上 + 仅商店；道具池 = 道具；货架 = DEAL_SHOP
  const options = useMemo(() => ({
    monsters: lookup.monsters.map((r) => r.id),
    equipment: [...palette.deal.equipment, ...palette.deal.shopEquipment],
    items: palette.deal.items,
    shopGoods: palette.deal.shop,
  }), [lookup, palette]);
  const name = (id) => lookup.info[id]?.name || id;
  const img = (id) => lookup.info[id]?.img;
  const changed = JSON.stringify(data.floors) !== JSON.stringify(shipped.floors) || JSON.stringify(data.defaults) !== JSON.stringify(shipped.defaults);
  const setFloor = (i, patch) => setData((d) => ({ ...d, floors: d.floors.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
  const setDefaults = (patch) => setData((d) => ({ ...d, defaults: { ...d.defaults, ...patch } }));
  const known = new Set([...options.monsters, ...options.equipment, ...options.items, ...options.shopGoods]);
  const problems = [];
  data.floors.forEach((f) => {
    for (const p of [...POOLS.map((x) => x.key), 'shopGoods']) for (const id of f[p] || []) if (!known.has(id)) problems.push(`第 ${f.floor} 层 ${p}：不认识的 id ${id}`);
    for (const p of POOLS) if (f[p.count] !== null && (!Number.isInteger(f[p.count]) || f[p.count] < 0)) problems.push(`第 ${f.floor} 层 ${p.countLabel} 要是 ≥0 的整数`);
  });
  const exportData = () => ({ ...data, updatedAt: changed ? new Date().toISOString() : data.updatedAt });
  const text = () => JSON.stringify(exportData(), null, 2) + '\n';
  const save = async () => {
    try {
      const picked = await window.showDirectoryPicker({ id: 'diggy-config', mode: 'readwrite' });
      let dir = await resolveConfigDir(picked, []);
      if (!dir) { if (!confirm(`你选的是「${picked.name}」，不是 配置表 / json。直接写到这里吗？`)) return; dir = picked; }
      await writeText(dir, '地下城发牌.json', text());
      flash(`已写入 ${dir.name}/地下城发牌.json`);
    } catch (e) { if (e.name !== 'AbortError') flash('保存失败：' + e.message, 'err'); }
  };
  const importJson = async (file) => {
    try {
      const d = JSON.parse(await file.text());
      if (d.schemaVersion !== 1 || !Array.isArray(d.floors)) throw new Error('不是 地下城发牌.json');
      setData(d); flash(`已导入 ${file.name}`);
    } catch (e) { flash('导入失败：' + e.message, 'err'); }
  };

  const pool = ({ value, all, onChange, def }) => (
    <div className="dl-pool">
      <label className="chk small"><input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : [...(def || [])])} />默认</label>
      {value === null
        ? <span className="muted small">{def ? `全部 ${def.length} 种` : '—'}</span>
        : (
          <div className="chips">
            {value.map((id, i) => (
              <span key={i} className={`chip ${known.has(id) ? '' : 'unknown'}`}>{img(id) && <img className="chip-ico" src={img(id)} alt="" />}{name(id)}<button onClick={() => onChange(value.filter((_, k) => k !== i))}>✕</button></span>
            ))}
            <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
              <option value="">＋</option>
              {all.filter((id) => !value.includes(id)).map((id) => <option key={id} value={id}>{name(id)}</option>)}
            </select>
            {value.length === 0 && <span className="muted small">空 = 这一层不放</span>}
          </div>
        )}
    </div>
  );
  const count = ({ value, onChange, def }) => (
    <input className="num" type="number" min={0} placeholder={def === undefined ? '' : `默认 ${def}`} value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)))} />
  );

  return (
    <div className="dl">
      <div className="ed-bar sketch le-bar">
        <div className="ed-row">
          <span className={`status-pill ${changed ? 'dirty' : ''}`}>{changed ? '✏️ 和网站数据不一样' : '✅ 和网站数据一样'}</span>
          {problems.length > 0 && <span className="status-pill err">⚠️ {problems.length} 个问题</span>}
          <span className="muted small">只导出 JSON，不会改 deal.ts。</span>
          <span className="grow" />
          <button className="btn small" onClick={() => setData((d) => ({ ...d, floors: [...d.floors, blankFloor(d.floors.length + 1)] }))}>＋ 加一层</button>
          <button className="btn small" disabled={!changed} onClick={() => { if (confirm('还原成网站数据？')) setData(clone(shipped)); }}>↺ 还原</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <button className="btn small yellow" onClick={() => download('地下城发牌.json', text())}>⬇ 地下城发牌.json</button>
          {canSaveDir && <button className="btn small" onClick={save} title="选 notes/配置表 或 json 文件夹">💾 保存到文件夹</button>}
        </div>
      </div>
      <p className="hint" style={{ margin: '12px 0' }}>
        对应 <code>deal.ts</code> 的 <code>FLOOR_DEAL</code>：地下城模式（随机桌子）每一层从「池」里抽几只怪、几件装备、几个道具，再放一只黄头鸭。
        「默认」= 这一项不写，用最下面的默认值（池 = 全表）。池里写 0 个、或者数量填 0 = 这一层不放这种牌。没写的层全用默认。
      </p>
      <div className="tbl-wrap sketch">
        <table className="tbl dl-tbl">
          <thead><tr><th>层</th>{POOLS.map((p) => [<th key={p.key}>{p.label}</th>, <th key={p.count}>{p.countLabel}</th>])}<th>商店</th><th>货架</th><th></th></tr></thead>
          <tbody>
            {data.floors.map((f, i) => (
              <tr key={i}>
                <td className="mono">{f.floor}</td>
                {POOLS.map((p) => [
                  <td key={p.key}>{pool({ value: f[p.key], all: options[p.key], def: data.defaults[p.key], onChange: (v) => setFloor(i, { [p.key]: v }) })}</td>,
                  <td key={p.count}>{count({ value: f[p.count], def: data.defaults[p.count], onChange: (v) => setFloor(i, { [p.count]: v }) })}</td>,
                ])}
                <td>
                  <select value={f.shop === null ? 'def' : f.shop ? 'yes' : 'no'} onChange={(e) => setFloor(i, { shop: e.target.value === 'def' ? null : e.target.value === 'yes' })}>
                    <option value="def">默认（有）</option><option value="yes">有黄头鸭</option><option value="no">不出商店</option>
                  </select>
                </td>
                <td>{pool({ value: f.shopGoods, all: options.shopGoods, def: data.defaults.shopGoods, onChange: (v) => setFloor(i, { shopGoods: v }) })}</td>
                <td><button className="x small" title="删掉这一层" onClick={() => setData((d) => ({ ...d, floors: d.floors.filter((_, k) => k !== i).map((x, k) => ({ ...x, floor: k + 1 })) }))}>✕</button></td>
              </tr>
            ))}
            <tr className="ghead"><td colSpan={10}>默认值（DEAL_MONSTERS / DEAL_EQUIPMENT / DEAL_ITEMS / DEAL_SHOP 和各个 *_COUNT）</td></tr>
            <tr>
              <td className="muted">默认</td>
              {POOLS.map((p) => [
                <td key={p.key}><div className="chips">{data.defaults[p.key].map((id) => <span key={id} className="chip">{img(id) && <img className="chip-ico" src={img(id)} alt="" />}{name(id)}</span>)}</div></td>,
                <td key={p.count}><input className="num" type="number" min={0} value={data.defaults[p.count]} onChange={(e) => setDefaults({ [p.count]: Math.max(0, Math.round(+e.target.value)) })} /></td>,
              ])}
              <td>{data.defaults.shop ? '有' : '没有'}</td>
              <td><div className="chips">{data.defaults.shopGoods.map((id) => <span key={id} className="chip">{name(id)}</span>)}</div></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {problems.length > 0 && <ul className="le-checks">{problems.map((p, i) => <li key={i} className="err">✖ {p}</li>)}</ul>}
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}
