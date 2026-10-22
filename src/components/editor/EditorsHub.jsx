import { useEffect, useMemo, useState } from 'react';
import Editor from './Editor.jsx';
import LevelEditor from './LevelEditor.jsx';
import DealEditor from './DealEditor.jsx';
import MyLevelsEditor from './MyLevelsEditor.jsx';

const TABS = [
  { id: 'cards', label: '🃏 卡牌编辑器' },
  { id: 'levels', label: '🗺 冒险关卡' },
  { id: 'deal', label: '🎲 地下城发牌' },
  { id: 'mine', label: '🏠 我的关卡' },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

function buildLookup(roles, palette, base) {
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
}

function readTab(fallback = 'cards') {
  if (typeof window === 'undefined') return fallback;
  const q = new URLSearchParams(window.location.search).get('tab');
  if (TAB_IDS.has(q)) return q;
  // /editor/#roleId → 卡牌编辑器
  if (window.location.hash && window.location.hash.length > 1) return 'cards';
  return fallback;
}

function writeTab(tab) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (tab === 'cards') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  // 离开卡牌页时清掉角色 hash，避免再回来误选
  if (tab !== 'cards') url.hash = '';
  const next = url.pathname + url.search + url.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    history.replaceState(null, '', next);
  }
}

/** 顶栏只留「编辑器」一项；四个工具用页签切换。 */
export default function EditorsHub({
  rolesShipped, refs, images,
  shippedWorlds, roles, palette, deal,
  base = '',
  initialTab = 'cards',
}) {
  const [tab, setTab] = useState(() => readTab(initialTab));
  const lookup = useMemo(() => buildLookup(roles, palette, base), [roles, palette, base]);

  useEffect(() => { writeTab(tab); }, [tab]);

  // 浏览器前进/后退或旧书签带 ?tab=
  useEffect(() => {
    const onPop = () => setTab(readTab(initialTab));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [initialTab]);

  return (
    <div className="le">
      <div className="le-tabs">
        <div className="seg big">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'cards' && <Editor shipped={rolesShipped} refs={refs} images={images} base={base} />}
      {tab === 'levels' && <LevelEditor shippedWorlds={shippedWorlds} roles={roles} palette={palette} base={base} />}
      {tab === 'deal' && <DealEditor shipped={deal} palette={palette} lookup={lookup} base={base} />}
      {tab === 'mine' && <MyLevelsEditor lookup={lookup} palette={palette} base={base} />}
    </div>
  );
}
