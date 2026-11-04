import ruleIds from '../../data/ruleIds.json';
import { cellIndex, cleanOverrides, SKILL_DEFAULT } from '../../lib/levels.js';

/** 机制试玩场 §4.3：选中有 catalog 的格子，读写覆盖字段（缺省 = 跟图鉴） */
const HUNTS = [
  { key: 'idle', label: '傻傻不动' }, { key: 'chase', label: '追击' },
  { key: 'wander', label: '随机走' }, { key: 'flee', label: '逃跑' },
];
const STAT_KEYS = [['heart', '心'], ['tooth', '牙'], ['armor', '甲'], ['gold', '金']];
const EQUIP_KEYS = [['addHeart', '+心'], ['addTooth', '+牙'], ['addArmor', '+甲'], ['durability', '耐久']];

function NumField({ label, value, placeholder, onChange, step = 1 }) {
  return (
    <label className="ci-num">
      <span>{label}</span>
      <input type="number" step={step} value={value ?? ''} placeholder={placeholder ?? '图鉴'}
        onChange={(e) => onChange(e.target.value === '' ? undefined : +e.target.value)} />
    </label>
  );
}

export default function CellInspector({ lv, sel, lookup, refs, onChange }) {
  if (!sel || !lv || sel.x >= lv.cols || sel.y >= lv.rows) {
    return <div className="le-panel sketch ci"><h4>格子覆盖</h4><p className="muted small">点「🔍 选择」再点场上的牌（或直接点有牌的格子），可改该格的 effects / skills / 追击 / 装备数值。不填 = 跟图鉴。</p></div>;
  }
  const c = lv.cells[cellIndex(lv, sel.x, sel.y)];
  if (!c.catalog && !c.mole) {
    return <div className="le-panel sketch ci"><h4>格子覆盖 <span className="muted small">({sel.x}, {sel.y})</span></h4><p className="muted small">这一格没有牌，没有可覆盖的字段。</p></div>;
  }
  const info = c.mole ? { name: '黄鼹鼠', kind: 'mole' } : lookup.info[c.catalog] || { name: c.catalog, kind: 'unknown' };
  const kind = info.kind;
  const ov = cleanOverrides(c);
  const set = (patch) => {
    const next = { ...ov, ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
    onChange(next);
  };
  const refStatus = Object.fromEntries((refs?.statuses || []).map((s) => [s.id, s]));
  const refSkill = Object.fromEntries((refs?.skills || []).map((s) => [s.id, s]));
  const statusIds = [...new Set([...(refs?.statuses || []).map((s) => s.id), ...ruleIds.statuses])];
  const skillIds = [...new Set([...(refs?.skills || []).map((s) => s.id), ...ruleIds.skills])];
  const effects = ov.effects || [];
  const skills = ov.skills || [];
  const setEff = (i, patch) => set({ effects: effects.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setSk = (i, patch) => set({ skills: skills.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const isMonster = kind === 'monster' || kind === 'unknown';
  const isEquip = kind === 'equipment' || kind === 'unknown';
  const r = info.r;
  const sName = (id) => (refStatus[id] ? `${refStatus[id].name}（${id}）${refStatus[id].polarity === 'debuff' ? ' −' : ' +'}` : id);
  const kName = (id) => (refSkill[id] ? `${refSkill[id].name}（${id}）` : `${id}（表中未登记）`);

  return (
    <div className="le-panel sketch ci">
      <h4>格子覆盖 <span className="muted small">({sel.x}, {sel.y}) · {info.name}{c.catalog ? ` · ${c.catalog}` : ''}</span>
        {Object.keys(ov).length > 0 && <button className="btn small" style={{ marginLeft: 8 }} onClick={() => onChange({})}>清除覆盖</button>}
      </h4>

      {(isMonster || kind === 'mole') && (
        <div className="ci-row">
          {STAT_KEYS.map(([k, l]) => <NumField key={k} label={l} value={ov[k]} placeholder={r?.[k] != null ? String(r[k]) : '图鉴'} onChange={(v) => set({ [k]: v })} />)}
        </div>
      )}
      {isEquip && (
        <div className="ci-row">
          {EQUIP_KEYS.map(([k, l]) => <NumField key={k} label={l} value={ov[k]} onChange={(v) => set({ [k]: v })} />)}
        </div>
      )}
      {isMonster && (
        <div className="ci-row">
          <label className="ci-num"><span>追击 hunt</span>
            <select value={ov.hunt || ''} onChange={(e) => set({ hunt: e.target.value || undefined })}>
              <option value="">图鉴{r?.hunt ? `（${r.hunt}）` : ''}</option>
              {HUNTS.map((h) => <option key={h.key} value={h.key}>{h.label}（{h.key}）</option>)}
            </select>
          </label>
          <NumField label="间隔 chaseEvery" value={ov.chaseEvery} onChange={(v) => set({ chaseEvery: v })} />
          <label className="chk small"><input type="checkbox" checked={ov.huntHidden === true}
            onChange={(e) => set({ huntHidden: e.target.checked ? true : undefined })} />huntHidden 隐藏追踪</label>
        </div>
      )}

      <div className="ci-sec">
        <span className="flabel">状态 effects <span className="muted small">（不写 = 跟图鉴；写了以格子为准）</span></span>
        {effects.map((e, i) => (
          <div key={i} className="ci-row ci-line">
            <select value={e.id} onChange={(ev) => setEff(i, { id: ev.target.value })}>
              {statusIds.map((id) => <option key={id} value={id}>{sName(id)}</option>)}
            </select>
            <NumField label="value" value={e.value} placeholder="1" onChange={(v) => setEff(i, { value: v ?? 1 })} />
            <NumField label="turns" value={e.turns} placeholder="0" onChange={(v) => setEff(i, { turns: v ?? 0 })} />
            <NumField label="every" value={e.every} placeholder="1" onChange={(v) => setEff(i, { every: v ?? 1 })} />
            {(e.id === 'range' || e.shape != null) && <NumField label="shape" value={e.shape} placeholder="—" onChange={(v) => setEff(i, { shape: v })} />}
            {(e.id === 'splash' || e.damageScale != null) && <NumField label="damageScale" step={0.1} value={e.damageScale} placeholder="—" onChange={(v) => setEff(i, { damageScale: v })} />}
            <button className="btn small" title="删掉这行" onClick={() => set({ effects: effects.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <select value="" onChange={(ev) => ev.target.value && set({ effects: [...effects, { id: ev.target.value, value: 1, turns: 3, every: 1 }] })}>
          <option value="">＋ 加状态…</option>
          {statusIds.map((id) => <option key={id} value={id}>{sName(id)}</option>)}
        </select>
      </div>

      <div className="ci-sec">
        <span className="flabel">技能 skills</span>
        {skills.map((k, i) => (
          <div key={i} className="ci-row ci-line">
            <span className="chip" title={refSkill[k.id]?.desc || ''}>{kName(k.id)}</span>
            <NumField label="cooldown" value={k.cooldown} onChange={(v) => setSk(i, { cooldown: v ?? SKILL_DEFAULT.cooldown })} />
            <NumField label="firstCd" value={k.firstCd} onChange={(v) => setSk(i, { firstCd: v ?? 0 })} />
            <NumField label="chance%" value={k.chance} onChange={(v) => setSk(i, { chance: v ?? 100 })} />
            <NumField label="uses(-1∞)" value={k.uses} onChange={(v) => setSk(i, { uses: v ?? -1 })} />
            <button className="btn small" onClick={() => set({ skills: skills.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <select value="" onChange={(ev) => {
          const id = ev.target.value; if (!id) return;
          set({ skills: [...skills, { id, ...SKILL_DEFAULT, cooldown: refSkill[id]?.cooldown ?? SKILL_DEFAULT.cooldown }] });
        }}>
          <option value="">＋ 加技能…</option>
          {skillIds.filter((id) => !skills.some((k) => k.id === id)).map((id) => <option key={id} value={id}>{kName(id)}</option>)}
        </select>
      </div>
    </div>
  );
}
