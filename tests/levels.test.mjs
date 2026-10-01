import test from 'node:test';
import assert from 'node:assert/strict';
import { Vim } from '../js/vim.js';
import { CHAPTERS, CH, allPuzzles, prep, solved } from '../js/levels.js';

for (const p of allPuzzles()) {
  test(`${p.id} ${p.t}`, () => {
    const info = prep(p);
    assert.ok(info.want != null || info.tgt, 'needs a goal');
    const v = new Vim(info.text, info.cur.r, info.cur.c);
    assert.equal(solved(v, info), false, 'already solved at start');
    info.keys.forEach((k, i) => {
      v.feed(k);
      if (i < info.keys.length - 1) assert.equal(solved(v, info), false, `solved early after ${i + 1} keys`);
    });
    assert.equal(v.mode, 'normal');
    if (info.want != null) assert.equal(v.text, info.want);
    else assert.deepEqual({ r: v.r, c: v.c }, info.tgt);
    assert.ok(solved(v, info));
  });
}

test('chapter graph is valid', () => {
  for (const c of CHAPTERS) for (const n of c.need) assert.ok(CH[n] && CHAPTERS.indexOf(CH[n]) < CHAPTERS.indexOf(c), `${c.id} needs ${n}`);
});
