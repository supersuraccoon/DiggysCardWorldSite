import { useState } from 'react';
import { WORLDS } from '../../lib/levels.js';

const DRAG_MIME = 'text/x-diggy-piece';

// ================= 素材栏 =================
export function PItem({ id, name, img, sub, active, onPick, drag }) {
  return (
    <button className={`pitem ${active ? 'on' : ''}`} onClick={onPick} draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(drag)); e.dataTransfer.effectAllowed = 'copy'; }}
      title={`${name}（${id}）`}>
      <span className="pimg">{img ? <img src={img} alt="" draggable={false} loading="lazy" /> : null}</span>
      <span className="pname">{name}</span>
      {sub && <span className="psub">{sub}</span>}
    </button>
  );
}

const worldName = (w) => {
  const x = WORLDS.find((t) => t.index === w);
  return `世界${w}${x ? `·${x.name}` : ''}`;
};

// 按 world 字段分组：世界1…世界N，最后「其他」（无 world 的卡）
function groupByWorld(list) {
  const m = new Map();
  for (const x of list) {
    const k = Number.isInteger(x.world) ? x.world : 0;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  const keys = [...m.keys()].filter((k) => k > 0).sort((a, b) => a - b);
  const out = keys.map((k) => ({ key: `w${k}`, title: worldName(k), items: m.get(k) }));
  if (m.has(0)) out.push({ key: 'other', title: '其他', items: m.get(0) });
  return out;
}

// 可折叠分组；搜索时自动展开有命中的组
function WorldFold({ section, list, render, open, toggle, searching }) {
  return groupByWorld(list).map((g) => {
    const k = `${section}:${g.key}`;
    const isOpen = searching || !!open[k];
    return (
      <div key={k} className="pfold">
        <button type="button" className="pfold-h" onClick={() => toggle(k)} aria-expanded={isOpen}>
          {isOpen ? '▾' : '▸'} {g.title} <span className="muted small">{g.items.length}</span>
        </button>
        {isOpen && <div className="pgrid">{g.items.map(render)}</div>}
      </div>
    );
  });
}

export function Palette({ lookup, palette, base, tool, setTool }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({ 'monster:other': true, 'equipment:other': true, 'item:other': true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const hit = (x) => !q || `${x.id} ${x.name}`.toLowerCase().includes(q.toLowerCase());
  const pick = (id) => setTool({ kind: 'card', id });
  const is = (id) => tool.kind === 'card' && tool.id === id;
  const statLine = (h, t, a) => `心${h} 牙${t} 甲${a}`;
  const searching = !!q;
  const monsters = lookup.monsters.filter(hit);
  const equipment = palette.equipment.filter(hit);
  const items = palette.items.filter((i) => lookup.kindOf(i.id) === 'item').filter(hit);
  const events = [...palette.items.filter((i) => lookup.kindOf(i.id) === 'event'), ...palette.store].filter(hit);
  const card = (x, sub, name = x.name) => (
    <PItem key={x.id} id={x.id} name={name} img={lookup.info[x.id]?.img} sub={sub} active={is(x.id)} onPick={() => pick(x.id)} drag={{ kind: 'card', id: x.id }} />
  );
  return (
    <div className="pal">
      <input className="search" placeholder="搜索素材…" value={q} onChange={(e) => setQ(e.target.value)} />
      <h4>地形</h4>
      <div className="pgrid">
        <PItem id="mole" name="黄鼹鼠" img={`${base}/images/roles/mole.png`} sub="起点" active={tool.kind === 'mole'} onPick={() => setTool({ kind: 'mole' })} drag={{ kind: 'mole' }} />
        {palette.terrain.filter((t) => !t.displayOnly).filter(hit).map((t) => (
          <PItem key={t.id} id={t.id} name={t.name} img={lookup.ground[t.id].src} sub={t.walkable ? '能走' : '挡路'}
            active={tool.kind === 'ground' && tool.id === t.id} onPick={() => setTool({ kind: 'ground', id: t.id })} drag={{ kind: 'ground', id: t.id }} />
        ))}
      </div>
      <h4>怪物 <span className="muted small">{monsters.length}</span></h4>
      <WorldFold section="monster" list={monsters} open={open} toggle={toggle} searching={searching}
        render={(r) => card(r, statLine(r.heart, r.tooth, r.armor))} />
      <h4>装备 <span className="muted small">{equipment.length}</span></h4>
      <WorldFold section="equipment" list={equipment} open={open} toggle={toggle} searching={searching}
        render={(e) => card(e, `+${statLine(e.heart, e.tooth, e.armor)}`, e.name + (e.shopOnly ? '·店' : ''))} />
      <h4>道具 <span className="muted small">{items.length}</span></h4>
      <WorldFold section="item" list={items} open={open} toggle={toggle} searching={searching} render={(i) => card(i, i.desc)} />
      <h4>事件 <span className="muted small">{events.length}</span></h4>
      <div className="pgrid">{events.map((i) => card(i, i.desc))}</div>
      <h4>服装 <span className="muted small">{(palette.costumes || []).length}</span></h4>
      <div className="pgrid">
        {(palette.costumes || []).filter(hit).map((c) => card(c, '捡起换上'))}
      </div>
      <p className="hint">点「世界N」「其他」展开/收起；搜索时自动展开命中的组。世界批次卡来自游戏仓 prefabs/cards/*/worldN（tools/sync_world_cards.py 同步）。「·店」= 只在商店卖。</p>
    </div>
  );
}
