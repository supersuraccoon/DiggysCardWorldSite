import { useEffect, useMemo, useState } from 'react';
import Editor from './Editor.jsx';
import LevelEditor from './LevelEditor.jsx';
import DealEditor from './DealEditor.jsx';
import MyLevelsEditor from './MyLevelsEditor.jsx';
import { buildLookup } from '../../lib/lookup.js';

const TABS = [
  { id: 'cards', label: '🃏 卡牌编辑器' },
  { id: 'levels', label: '🗺 冒险关卡' },
  { id: 'deal', label: '🎲 地下城发牌' },
  { id: 'mine', label: '🏠 我的关卡' },
  { id: 'testcases', label: '🧪 机制试玩场' },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

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
      {tab === 'mine' && <MyLevelsEditor key="mine" kind="mine" lookup={lookup} palette={palette} refs={refs} base={base} />}
      {tab === 'testcases' && <MyLevelsEditor key="testcases" kind="testcase" lookup={lookup} palette={palette} refs={refs} base={base} />}
    </div>
  );
}
