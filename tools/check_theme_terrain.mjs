#!/usr/bin/env node
// 抽查主题散落：同一种子两次一致、约 30%、城堡不散落、不改 cell.ground。
import { blankCells } from '../src/lib/levels.js';
import {
  scatterFloorIds, themeSeed, cardFolderOf, scatterEnabled, SCATTER_RATIO, THEME_TERRAIN_IDS,
} from '../src/lib/themeTerrain.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cells = blankCells(10, 7); // 70 floor
const a = scatterFloorIds(cells, 'world1', 'world1', 1);
const b = scatterFloorIds(cells, 'world1', 'world1', 1);
assert(a.size === b.size, 'same size');
for (const [k, v] of a) assert(b.get(k) === v, `mismatch at ${k}`);
const expect = Math.round(70 * SCATTER_RATIO);
assert(a.size === expect, `world1 10x7 expect ${expect} got ${a.size}`);
const ids = new Set(THEME_TERRAIN_IDS.world1);
for (const v of a.values()) assert(ids.has(v), `bad id ${v}`);

const c2 = scatterFloorIds(cells, 'world1', 'world1', 2);
let same = c2.size === a.size;
if (same) same = [...a.keys()].every((k) => a.get(k) === c2.get(k));
assert(!same, 'level 1 and 2 should differ (very likely)');

const castle = scatterFloorIds(cells, 'castle', 'castle', 1);
assert(castle.size === 0, 'castle must not scatter');
assert(cardFolderOf('castle') === 'dungeon', 'castle back folder');
assert(cardFolderOf('world9') === 'dungeon', 'world9 back folder');
assert(!scatterEnabled('castle') && !scatterEnabled('world9'), 'castle scatter off');
assert(cardFolderOf('') === 'dungeon', 'no theme fallback');
assert(cardFolderOf('grass') === 'dungeon', 'do not use battle theme grass');

// mixed grounds: only floor enters pool
const mixed = [
  { x: 0, y: 0, ground: 'wall' },
  { x: 1, y: 0, ground: 'floor' },
  { x: 2, y: 0, ground: 'pit' },
  { x: 3, y: 0, ground: 'floor' },
  { x: 4, y: 0, ground: 'stairs' },
  { x: 5, y: 0, ground: 'floor' },
  { x: 6, y: 0, ground: 'tree' },
  { x: 7, y: 0, ground: 'floor' },
  { x: 8, y: 0, ground: 'lock' },
  { x: 9, y: 0, ground: 'floor' },
];
const sm = scatterFloorIds(mixed, 'dungeon', 'dungeon', 1);
const nFloor = mixed.filter((c) => c.ground === 'floor').length;
assert(sm.size === Math.round(nFloor * 0.3), `mixed size ${sm.size} vs ${Math.round(nFloor * 0.3)}`);
for (const k of sm.keys()) {
  const [x, y] = k.split(',').map(Number);
  const c = mixed.find((z) => z.x === x && z.y === y);
  assert(c.ground === 'floor', `scattered non-floor ${k}`);
}
for (const c of mixed) assert(c.ground !== undefined, 'cells intact');
assert(mixed.filter((c) => c.ground === 'floor').length === nFloor, 'did not write ground');

// export JSON must still be floor
const exported = JSON.parse(JSON.stringify(cells));
assert(exported.every((c) => c.ground === 'floor' && !c.scatter && !c.terrainId), 'export still floor');

console.log('ok', {
  seed: themeSeed('world1', 1),
  world1_10x7: a.size,
  samples: [...a.entries()].slice(0, 8),
  dungeon_fallback: cardFolderOf(''),
});
