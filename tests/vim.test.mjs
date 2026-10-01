import test from 'node:test';
import assert from 'node:assert/strict';
import { Vim } from '../js/vim.js';

const run = (text, keys, r = 0, c = 0) => { const v = new Vim(text, r, c); v.feedAll(keys); return v; };

test('dw at line end does not join lines', () => assert.equal(run('foo bar\nbaz', 'wdw').text, 'foo \nbaz'));
test('cw behaves like ce', () => assert.equal(run('foo bar', 'cwX<Esc>').text, 'X bar'));
test('d} from paragraph start is linewise', () => assert.equal(run('a\nb\n\nc', 'd}').text, '\nc'));
test('undo and redo', () => {
  const v = run('abc', 'xx');
  assert.equal(v.text, 'c'); v.feed('u'); assert.equal(v.text, 'bc'); v.feed('u'); assert.equal(v.text, 'abc');
  v.feed('<C-r>'); assert.equal(v.text, 'bc');
});
test('insert is one undo step', () => { const v = run('a', 'Abcd<Esc>u'); assert.equal(v.text, 'a'); });
test('dot repeats insert', () => assert.equal(run('a\nb', 'A!<Esc>j.').text, 'a!\nb!'));
test('dot with count', () => assert.equal(run('abcdef', 'x3.').text, 'ef'));
test('J joins with a space', () => assert.equal(run('foo\n    bar', 'J').text, 'foo bar'));
test('di( with nesting', () => assert.equal(run('f(a, g(b), c)', 'fbdi(').text, 'f(a, g(), c)'));
test('2di( goes outward', () => assert.equal(run('f(a, g(b), c)', 'fb2di(').text, 'f()'));
test('ci" from before the quotes', () => assert.equal(run('x = "a b"', 'ci"z<Esc>').text, 'x = "z"'));
test('da" eats trailing space', () => assert.equal(run('say "hi" now', 'fhda"').text, 'say now'));
test('% jumps between brackets', () => { const v = run('a[b(c)d]', '%'); assert.equal(v.c, 7); v.feed('%'); assert.equal(v.c, 1); });
test('search wraps', () => { const v = run('x foo\nfoo y', 'j$/foo<CR>'); assert.deepEqual([v.r, v.c], [0, 2]); });
test('star uses whole words', () => { const v = run('ab abc ab', '*'); assert.equal(v.c, 7); });
test('p after yw', () => assert.equal(run('ab cd', 'ywwP').text, 'ab ab cd'));
test('linewise visual yank + P', () => assert.equal(run('a\nb', 'VyjP').text, 'a\na\nb'));
test(':s with capture group', () => assert.equal(run('foo(1)', ':s/\\(\\w\\+\\)(\\(\\d\\))/\\2:\\1<CR>').text, '1:foo'));
test(':v deletes non-matching', () => assert.equal(run('a1\nb\na2', ':v/a/d<CR>').text, 'a1\na2'));
test('o keeps indent, Esc on blank removes it', () => assert.equal(run('  x', 'o<Esc>').text, '  x\n'));
test('t with ; does not get stuck', () => { const v = run('a,b,c,d', 't,;'); assert.equal(v.c, 2); });
test('j keeps desired column', () => { const v = run('abcdef\nab\nabcdef', '$jj'); assert.equal(v.c, 5); });
test(':q is refused', () => { const v = run('a', ':q<CR>'); assert.match(v.msg, /逃不掉/); });
test('ciw on whitespace changes spaces', () => assert.equal(run('a   b', 'lciw-<Esc>').text, 'a-b'));
test('gUiw', () => assert.equal(run('one two', 'wgUiw').text, 'one TWO'));
test('backspace in insert joins lines', () => assert.equal(run('ab\ncd', 'jI<BS><Esc>').text, 'abcd'));
