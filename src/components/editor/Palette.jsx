import { useState } from 'react';

const DRAG_MIME = 'text/x-diggy-piece';

// ================= 素材栏 =================
export function PItem({ id, name, img, sub, active, onPick, drag }) {
  return (
    <button className={`pitem ${active ? 'on' : ''}`} onClick={onPick} draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(drag)); e.dataTransfer.effectAllowed = 'copy'; }}
      title={`${name}（${id}）`}>
      <span className="pimg">{img ? <img src={img} alt="" draggable={false} /> : null}</span>
      <span className="pname">{name}</span>
      {sub && <span className="psub">{sub}</span>}
    </button>
  );
}
export function Palette({ lookup, palette, base, tool, setTool }) {
  const [q, setQ] = useState('');
  const hit = (x) => !q || `${x.id} ${x.name}`.toLowerCase().includes(q.toLowerCase());
  const pick = (id) => setTool({ kind: 'card', id });
  const is = (id) => tool.kind === 'card' && tool.id === id;
  const statLine = (h, t, a) => `心${h} 牙${t} 甲${a}`;
  return (
    <div className="pal">
      <input className="search" placeholder="搜索素材…" value={q} onChange={(e) => setQ(e.target.value)} />
      <h4>特殊</h4>
      <div className="pgrid">
        <PItem id="mole" name="黄鼹鼠" img={`${base}/images/roles/mole.png`} sub="起点" active={tool.kind === 'mole'} onPick={() => setTool({ kind: 'mole' })} drag={{ kind: 'mole' }} />
        {palette.terrain.filter(hit).map((t) => (
          <PItem key={t.id} id={t.id} name={t.name} img={lookup.ground[t.id].src} sub={t.walkable ? '能走' : '挡路'}
            active={tool.kind === 'ground' && tool.id === t.id} onPick={() => setTool({ kind: 'ground', id: t.id })} drag={{ kind: 'ground', id: t.id }} />
        ))}
      </div>
      <h4>怪物 <span className="muted small">{lookup.monsters.length}</span></h4>
      <div className="pgrid">
        {lookup.monsters.filter(hit).map((r) => (
          <PItem key={r.id} id={r.id} name={r.name} img={lookup.info[r.id].img} sub={statLine(r.heart, r.tooth, r.armor)} active={is(r.id)} onPick={() => pick(r.id)} drag={{ kind: 'card', id: r.id }} />
        ))}
      </div>
      <h4>装备 <span className="muted small">{palette.equipment.length}</span></h4>
      <div className="pgrid">
        {palette.equipment.filter(hit).map((e) => (
          <PItem key={e.id} id={e.id} name={e.name + (e.shopOnly ? '·店' : '')} img={lookup.info[e.id].img} sub={`+${statLine(e.heart, e.tooth, e.armor)}`} active={is(e.id)} onPick={() => pick(e.id)} drag={{ kind: 'card', id: e.id }} />
        ))}
      </div>
      <h4>道具 / 事件</h4>
      <div className="pgrid">
        {[...palette.items, ...palette.store].filter(hit).map((i) => (
          <PItem key={i.id} id={i.id} name={i.name} img={lookup.info[i.id].img} sub={i.desc} active={is(i.id)} onPick={() => pick(i.id)} drag={{ kind: 'card', id: i.id }} />
        ))}
      </div>
      <p className="hint">怪物数值来自卡牌编辑器那份 角色设定.json。装备数值来自 装备设定.md。「·店」= 只在商店卖，也可以摆在桌上。</p>
    </div>
  );
}

