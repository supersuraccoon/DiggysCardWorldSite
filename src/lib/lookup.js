// 编辑器素材表：怪物（角色设定 deal 组 + 世界批次）/ 装备 / 道具 / 事件 / 服装
export function buildLookup(roles, palette, base) {
  const worldMonsters = (palette.worldMonsters || []).filter((m) => !roles.roles.some((r) => r.id === m.id));
  const monsters = [...roles.roles.filter((r) => r.group === 'deal'), ...worldMonsters];
  const byRole = Object.fromEntries(roles.roles.map((r) => [r.id, r]));
  const kind = {};
  for (const r of monsters) kind[r.id] = 'monster';
  for (const e of palette.equipment) kind[e.id] = 'equipment';
  for (const i of palette.items) kind[i.id] = i.kind === 'event' || i.kind === 'chest' ? 'event' : 'item';
  for (const s of palette.store) kind[s.id] = 'store';
  for (const c of palette.costumes || []) kind[c.id] = 'costume';
  const info = {};
  for (const r of monsters) info[r.id] = { id: r.id, name: r.name, img: r.img ? `${base}/${r.img}` : `${base}/images/roles/${r.id}.png`, kind: 'monster', r };
  for (const e of palette.equipment) info[e.id] = { id: e.id, name: e.name, img: `${base}/${e.img}`, kind: 'equipment', e };
  for (const i of [...palette.items, ...palette.store]) info[i.id] = { id: i.id, name: i.name, img: `${base}/${i.img}`, kind: kind[i.id], e: i };
  for (const c of palette.costumes || []) info[c.id] = { id: c.id, name: c.name, img: `${base}/${c.img}`, kind: 'costume', e: c };
  return {
    monsters, info,
    kindOf: (id) => kind[id] || null,
    role: (id) => byRole[id],
    shop: new Set(palette.deal.shop),
    ground: Object.fromEntries(palette.terrain.map((t) => [t.id, { ...t, src: `${base}/${t.img}` }])),
  };
}
