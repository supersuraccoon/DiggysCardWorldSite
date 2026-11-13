import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveConfigDir, writeText, DEFAULT_SIZE } from '../../lib/levels.js';
import { scatterFloorIds, cellPreviewArt } from '../../lib/themeTerrain.js';
import BoardCellArt from './BoardCell.jsx';

// 地下城（随机发牌）每一层的怪池 / 数量 / 商店。只导出 notes/配置表/json/地下城发牌.json，
// 不同步任何代码（deal.ts 的 FLOOR_DEAL / DEAL_MONSTERS 先不动）。
// 2026-10-30 起 JSON 是 100 层模式对照文档：每层 cols/rows、事件池、换装池，shop 为店种（或 null = 无店），
// 各店货架字段见 SHOPS；21～100 层由 deepFloors 规则延伸（只读展示）。
const LS_KEY = 'diggy.editor.deal.v2';
const clone = (x) => JSON.parse(JSON.stringify(x));
const POOLS = [
  { key: 'monsters', count: 'monsterCount', label: '怪池', countLabel: '怪数', all: 'monsters' },
  { key: 'equipment', count: 'equipmentCount', label: '装备池', countLabel: '装备数', all: 'equipment' },
  { key: 'items', count: 'itemCount', label: '道具池', countLabel: '道具数', all: 'items' },
  { key: 'events', count: 'eventCount', label: '事件池', countLabel: '事件数', all: 'events' },
  { key: 'costumes', count: 'costumeCount', label: '换装池', countLabel: '换装数', all: 'costumes' },
];
// shop 店种 → 标记字段 + 货架字段（与 deal.ts FloorDealSpec 对齐）
const SHOPS = [
  { id: 'duck_equipment', label: '🦆 鸭子装备店', flag: 'hasEquipShop', goods: 'shop_equipments', all: 'shopGoods' },
  { id: 'crow_skill', label: '🐦 乌鸦技能店', flag: 'hasSkillShop', goods: 'shop_item_skill_scrolls', all: 'skillScrolls' },
  { id: 'raccoon_supply', label: '🦝 浣熊杂货店', flag: 'hasSupplyShop', goods: 'shop_item_supplies', all: 'supplyItems' },
  { id: 'bank', label: '🏦 银行', flag: 'hasBank', goods: null, all: null },
];
const SHOP_BY_ID = Object.fromEntries(SHOPS.map((s) => [s.id, s]));
const shopLabel = (id) => SHOP_BY_ID[id]?.label || id;
const blankFloor = (n, prev) => ({ floor: n, cols: prev?.cols ?? null, rows: prev?.rows ?? null, monsters: null, monsterCount: null, equipment: null, equipmentCount: null, items: null, itemCount: null, events: null, eventCount: null, costumes: null, costumeCount: null, shop: null });
// 换店种：清掉旧店的标记/货架，写上新店的标记和空货架
function switchShop(f, next) {
  const out = { ...f };
  for (const s of SHOPS) { delete out[s.flag]; if (s.goods) delete out[s.goods]; }
  delete out.shopGoods;
  if (next === true || next === false) { out.shop = next; return out; }
  out.shop = next || null;
  const s = SHOP_BY_ID[next];
  if (s) { out[s.flag] = true; if (s.goods) out[s.goods] = f[s.goods] || []; }
  return out;
}

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
  const [previewFloor, setPreviewFloor] = useState(1);
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
    events: palette.deal.events || [],
    costumes: palette.deal.costumes || [],
    shopGoods: palette.deal.shop,
    skillScrolls: palette.deal.skillScrolls || [],
    supplyItems: palette.deal.supplyItems || [],
  }), [lookup, palette]);
  const costume = useMemo(() => Object.fromEntries((palette.costumes || []).map((c) => [c.id, c])), [palette]);
  const name = (id) => lookup.info[id]?.name || costume[id]?.name || id;
  const img = (id) => lookup.info[id]?.img || (costume[id] ? `${base}/${costume[id].img}` : null);
  const changed = JSON.stringify(data.floors) !== JSON.stringify(shipped.floors) || JSON.stringify(data.defaults) !== JSON.stringify(shipped.defaults);
  const preview = useMemo(() => {
    const f = data.floors.find((x) => x.floor === previewFloor) || data.floors[0];
    if (!f) return null;
    const cols = f.cols || data.defaults?.cols || DEFAULT_SIZE.cols;
    const rows = f.rows || data.defaults?.rows || DEFAULT_SIZE.rows;
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ x, y, ground: 'floor', catalog: '', mole: false });
    const theme = 'dungeon';
    const scatter = scatterFloorIds(cells, theme, 'dungeon', f.floor);
    return { f, cols, rows, cells, scatter, theme };
  }, [data, previewFloor]);
  const newSchema = data.floors.some((f) => typeof f.shop === 'string' || 'cols' in f) || !!data.shopCycle;
  const setFloor = (i, patch) => setData((d) => ({ ...d, floors: d.floors.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
  const setDefaults = (patch) => setData((d) => ({ ...d, defaults: { ...d.defaults, ...patch } }));
  const known = new Set(Object.values(options).flat());
  const problems = [];
  data.floors.forEach((f) => {
    const lists = [...POOLS.map((x) => x.key), 'shopGoods', ...SHOPS.map((s) => s.goods).filter(Boolean)];
    for (const p of lists) for (const id of f[p] || []) if (!known.has(id)) problems.push(`第 ${f.floor} 层 ${p}：不认识的 id ${id}`);
    for (const p of POOLS) if (f[p.count] != null && (!Number.isInteger(f[p.count]) || f[p.count] < 0)) problems.push(`第 ${f.floor} 层 ${p.countLabel} 要是 ≥0 的整数`);
    for (const k of ['cols', 'rows']) if (f[k] != null && (!Number.isInteger(f[k]) || f[k] < 1 || f[k] > 20)) problems.push(`第 ${f.floor} 层 ${k === 'cols' ? '列数' : '行数'} 要在 1～20`);
    if (typeof f.shop === 'string' && !SHOP_BY_ID[f.shop]) problems.push(`第 ${f.floor} 层 商店：不认识的店种 ${f.shop}`);
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

  const pool = ({ value = null, all, onChange, def }) => (
    <div className="dl-pool">
      <label className="chk small"><input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : [...(def || all || [])])} />默认</label>
      {value === null
        ? <span className="muted small">{def ? `全部 ${def.length} 种` : all ? `全部 ${all.length} 种` : '—'}</span>
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
  const count = ({ value = null, onChange, def }) => (
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
          <button className="btn small" onClick={() => setData((d) => ({ ...d, floors: [...d.floors, blankFloor(d.floors.length + 1, d.floors[d.floors.length - 1])] }))}>＋ 加一层</button>
          <button className="btn small" disabled={!changed} onClick={() => { if (confirm('还原成网站数据？')) setData(clone(shipped)); }}>↺ 还原</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <button className="btn small yellow" onClick={() => download('地下城发牌.json', text())}>⬇ 地下城发牌.json</button>
          {canSaveDir && <button className="btn small" onClick={save} title="选 notes/配置表 或 json 文件夹">💾 保存到文件夹</button>}
        </div>
      </div>
      <p className="hint" style={{ margin: '12px 0' }}>
        对应 <code>deal.ts</code> 的 <code>FLOOR_DEAL</code>：地下城模式（随机桌子）每一层的桌子大小，从「池」里抽几只怪、几件装备、几个道具/事件/换装，以及这一层开哪家店。
        「默认」= 这一项不写，用最下面的默认值（池 = 全表）。池里写 0 个、或者数量填 0 = 这一层不放这种牌。
        {newSchema && <> 商店一层最多一家；「无店」= 这层不开店。</>}
      </p>
      {(data.shopCycle || data.deepFloors) && (
        <p className="hint" style={{ margin: '0 0 12px' }}>
          {data.shopCycle && <>🔁 商店轮换：从第 {data.shopCycle.from} 层起按 {(data.shopCycle.order || []).map(shopLabel).join(' → ')} 循环。 </>}
          {data.deepFloors && <>⛏ 第 {data.deepFloors.from}～{data.deepFloors.to} 层照第 {data.deepFloors.copyOf} 层延伸：怪数 <code>{data.deepFloors.monsterCount}</code>，商店 <code>{data.deepFloors.shop}</code>（只读，改规则请改 deal.ts）。</>}
        </p>
      )}
      {preview && (
        <div className="dl-preview sketch">
          <div className="dl-preview-head">
            <h4>空地预览</h4>
            <label className="small">层
              <select value={preview.f.floor} onChange={(e) => setPreviewFloor(+e.target.value)}>
                {data.floors.map((f) => <option key={f.floor} value={f.floor}>{f.floor}（{f.cols || data.defaults?.cols || DEFAULT_SIZE.cols}×{f.rows || data.defaults?.rows || DEFAULT_SIZE.rows}）</option>)}
              </select>
            </label>
            <span className="muted small">空桌先铺空白地板，再按地下城主题散落 30% 地形；卡背用地下城 terrain_back。不模拟发牌后的墙/坑，也不写回 JSON。</span>
          </div>
          <div className="le-board-wrap" style={{ boxShadow: 'none', padding: 8 }}>
            <div className="le-board" style={{ '--cols': preview.cols }}>
              <div className="le-axis corner" />
              {Array.from({ length: preview.cols }, (_, x) => <div key={`ax${x}`} className="le-axis top">{x}</div>)}
              {Array.from({ length: preview.rows }, (_, y) => [
                <div key={`ay${y}`} className="le-axis left">{y}</div>,
                ...Array.from({ length: preview.cols }, (_, x) => {
                  const c = preview.cells[y * preview.cols + x];
                  return (
                    <div key={`${x},${y}`} className={`le-cell g-floor`}>
                      <BoardCellArt {...cellPreviewArt(c, { theme: preview.theme, scatter: preview.scatter, lookup, base })} />
                    </div>
                  );
                }),
              ])}
            </div>
          </div>
        </div>
      )}
      <div className="tbl-wrap sketch">
        <table className="tbl dl-tbl">
          <thead><tr><th>层</th><th>桌子</th>{POOLS.map((p) => [<th key={p.key}>{p.label}</th>, <th key={p.count}>{p.countLabel}</th>])}<th>商店</th><th>货架</th><th></th></tr></thead>
          <tbody>
            {data.floors.map((f, i) => (
              <tr key={i}>
                <td className="mono">{f.floor}</td>
                <td className="nowrap">
                  <input className="num tiny" type="number" min={1} max={20} placeholder="列" title="列数 cols" value={f.cols ?? ''} onChange={(e) => setFloor(i, { cols: e.target.value === '' ? null : Math.max(1, Math.min(20, Math.round(+e.target.value))) })} />
                  ×
                  <input className="num tiny" type="number" min={1} max={20} placeholder="行" title="行数 rows" value={f.rows ?? ''} onChange={(e) => setFloor(i, { rows: e.target.value === '' ? null : Math.max(1, Math.min(20, Math.round(+e.target.value))) })} />
                </td>
                {POOLS.map((p) => [
                  <td key={p.key}>{pool({ value: f[p.key], all: options[p.key], def: data.defaults[p.key], onChange: (v) => setFloor(i, { [p.key]: v }) })}</td>,
                  <td key={p.count}>{count({ value: f[p.count], def: data.defaults[p.count], onChange: (v) => setFloor(i, { [p.count]: v }) })}</td>,
                ])}
                <td>
                  {newSchema ? (
                    <select value={typeof f.shop === 'string' ? f.shop : f.shop === true ? 'legacy_yes' : 'none'}
                      onChange={(e) => setData((d) => ({ ...d, floors: d.floors.map((x, k) => (k === i ? switchShop(x, e.target.value === 'none' ? null : e.target.value === 'legacy_yes' ? true : e.target.value) : x)) }))}>
                      <option value="none">无店</option>
                      {SHOPS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      {f.shop === true && <option value="legacy_yes">（旧）有黄头鸭</option>}
                    </select>
                  ) : (
                    <select value={f.shop == null ? 'def' : f.shop ? 'yes' : 'no'} onChange={(e) => setFloor(i, { shop: e.target.value === 'def' ? null : e.target.value === 'yes' })}>
                      <option value="def">默认（有）</option><option value="yes">有黄头鸭</option><option value="no">不出商店</option>
                    </select>
                  )}
                </td>
                <td>{(() => {
                  const s = SHOP_BY_ID[f.shop];
                  if (s) return s.goods
                    ? pool({ value: f[s.goods] ?? null, all: options[s.all], def: s.id === 'duck_equipment' ? data.defaults.shopGoods : undefined, onChange: (v) => setFloor(i, { [s.goods]: v }) })
                    : <span className="muted small">银行没有货架</span>;
                  if (newSchema && f.shop == null) return <span className="muted small">—</span>;
                  return pool({ value: f.shopGoods ?? null, all: options.shopGoods, def: data.defaults.shopGoods, onChange: (v) => setFloor(i, { shopGoods: v }) });
                })()}</td>
                <td><button className="x small" title="删掉这一层" onClick={() => setData((d) => ({ ...d, floors: d.floors.filter((_, k) => k !== i).map((x, k) => ({ ...x, floor: k + 1 })) }))}>✕</button></td>
              </tr>
            ))}
            <tr className="ghead"><td colSpan={POOLS.length * 2 + 5}>默认值（DEAL_MONSTERS / DEAL_EQUIPMENT / DEAL_ITEMS / DEAL_EVENTS / DEAL_COSTUMES / DEAL_SHOP 和各个 *_COUNT）</td></tr>
            <tr>
              <td className="muted">默认</td>
              <td />
              {POOLS.map((p) => [
                <td key={p.key}><div className="chips">{(data.defaults[p.key] || options[p.all] || []).map((id) => <span key={id} className="chip">{img(id) && <img className="chip-ico" src={img(id)} alt="" />}{name(id)}</span>)}</div></td>,
                <td key={p.count}><input className="num" type="number" min={0} placeholder="—" value={data.defaults[p.count] ?? ''} onChange={(e) => setDefaults({ [p.count]: e.target.value === '' ? undefined : Math.max(0, Math.round(+e.target.value)) })} /></td>,
              ])}
              <td>{newSchema ? '按层' : data.defaults.shop ? '有' : '没有'}</td>
              <td><div className="chips">{(data.defaults.shopGoods || []).map((id) => <span key={id} className="chip">{name(id)}</span>)}</div></td>
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
