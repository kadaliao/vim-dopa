// A small, deterministic Vim subset. Pure logic, no DOM, so the level tests
// can replay reference solutions in Node. Keys are strings: one character, or
// one of <Esc> <CR> <BS> <Tab> <C-r>.
//
// Supported: counts; h j k l w b e W B E 0 ^ $ gg G f F t T ; , { } % n N * # + -
// operators d c y > < gu gU g~ with motions and text objects
// (iw aw iW aW i" a" i' a' i` a` i( a( ib i[ a[ i{ a{ iB i< a< ip ap);
// x X s S r D C Y J ~ p P i a I A o O u <C-r> . v V / ? :
// Ex: :N  :s  :%s  :'<,'>s  :g/pat/d  :v/pat/d  :d  :w :q (refused politely).
// Options fixed for the game: shiftwidth=4, autoindent on, nowrapscan off.

export const SW = 4;

export function parseKeys(s) {
  return s.match(/<(?:Esc|CR|BS|Tab|C-r)>|[\s\S]/g) || [];
}

const isWordCh = (ch) => /[A-Za-z0-9_À-￿]/.test(ch);
function cls(ch, big) {
  if (ch === undefined || ch === ' ' || ch === '\t') return 0;
  if (big) return 1;
  return isWordCh(ch) ? 2 : 1;
}
const isBlank = (s) => /^\s*$/.test(s);
const OPS = new Set(['d', 'c', 'y', '>', '<']);
const MOTION1 = new Set(['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'G', '{', '}', '%', 'n', 'N', '*', '#', ';', ',', '+', '-', '<CR>', '<BS>', ' ']);
const OBJ = new Set(['w', 'W', '"', "'", '`', '(', ')', 'b', '[', ']', '{', '}', 'B', '<', '>', 'p']);
const BRACKET = { '(': '()', ')': '()', b: '()', '[': '[]', ']': '[]', '{': '{}', '}': '{}', B: '{}', '<': '<>', '>': '<>' };
const PAIR = { '(': ')', '[': ']', '{': '}', ')': '(', ']': '[', '}': '{' };

function readCount(keys, i) {
  let s = '';
  while (i < keys.length && /^[0-9]$/.test(keys[i]) && !(s === '' && keys[i] === '0')) s += keys[i++];
  return [s ? Number(s) : 0, i];
}

// Vim "magic" pattern -> JS RegExp source (the common subset).
export function vimRegex(p) {
  let out = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '\\') {
      const n = p[++i];
      if (n === undefined) { out += '\\\\'; break; }
      if ('(){}|+?'.includes(n)) out += n;
      else if (n === '=') out += '?';
      else if (n === '<' || n === '>') out += '\\b';
      else out += '\\' + n;
    } else if ('(){}|+?'.includes(ch)) out += '\\' + ch;
    else out += ch;
  }
  return out;
}
function vimReplacement(r) {
  let out = '';
  for (let i = 0; i < r.length; i++) {
    const ch = r[i];
    if (ch === '\\') {
      const n = r[++i];
      if (n === undefined) break;
      if (/[0-9]/.test(n)) out += n === '0' ? '$&' : '$' + n;
      else if (n === '&') out += '&';
      else if (n === 't') out += '\t';
      else out += n;
    } else if (ch === '&') out += '$&';
    else if (ch === '$') out += '$$';
    else out += ch;
  }
  return out;
}

export class Vim {
  constructor(text = '', r = 0, c = 0) {
    this.lines = text.split('\n');
    this.r = r; this.c = c; this.want = c;
    this.mode = 'normal'; // normal | insert | visual | vline | cmd
    this.pend = [];
    this.reg = { text: '', line: false };
    this.undos = []; this.redos = [];
    this.lastF = null; this.lastSearch = null;
    this.cmd = null; this.vr = 0; this.vc = 0;
    this.dotKeys = null; this.rec = null; this.replaying = 0; this.insSnap = null;
    this.msg = '';
  }

  get text() { return this.lines.join('\n'); }
  len(r = this.r) { return this.lines[r].length; }
  fnb(r = this.r) { const m = this.lines[r].search(/\S/); return m < 0 ? Math.max(0, this.lines[r].length - 1) : m; }
  snap() { return { lines: this.lines.slice(), r: this.r, c: this.c }; }
  get showcmd() { return this.pend.join(''); }

  clamp() {
    const L = this.lines;
    if (!L.length) L.push('');
    this.r = Math.max(0, Math.min(L.length - 1, this.r));
    const max = this.mode === 'insert' ? L[this.r].length : Math.max(0, L[this.r].length - 1);
    this.c = Math.max(0, Math.min(max, this.c));
  }

  // ------------------------------------------------------------ entry point
  feed(key) {
    if (!this.replaying) this.msg = '';
    if (this.rec && !this.replaying && this.mode === 'insert') this.rec.push(key);
    if (this.mode === 'insert') this.insertKey(key);
    else if (this.mode === 'cmd') this.cmdKey(key);
    else this.normalKey(key);
  }

  feedAll(keys) { for (const k of (typeof keys === 'string' ? parseKeys(keys) : keys)) this.feed(k); }

  // ------------------------------------------------------------ normal / visual
  normalKey(key) {
    if (key === '<Esc>') {
      if (this.pend.length) this.pend = [];
      else if (this.mode === 'visual' || this.mode === 'vline') { this.mode = 'normal'; this.clamp(); }
      return;
    }
    this.pend.push(key);
    const visual = this.mode === 'visual' || this.mode === 'vline';
    const res = visual ? this.parseVisual(this.pend) : this.parseNormal(this.pend);
    if (res === 'more') return;
    const keys = this.pend; this.pend = [];
    if (!res) return;
    const before = res.change ? this.snap() : null;
    const t0 = res.change ? this.text : null;
    res.run();
    if (this.mode !== 'insert' && this.mode !== 'cmd') this.clamp();
    if (!res.change) return;
    if (this.mode === 'insert') {
      this.insSnap = before;
      if (!this.replaying) this.rec = keys.slice();
    } else if (this.text !== t0) {
      this.undos.push(before); this.redos = [];
      if (!this.replaying && !visual) this.dotKeys = keys.slice();
    }
  }

  parseMotion(keys, i) {
    const k = keys[i];
    if (k === undefined) return 'more';
    if (MOTION1.has(k)) return { m: k };
    if ('fFtT'.includes(k)) {
      const ch = keys[i + 1];
      if (ch === undefined) return 'more';
      if (ch.length > 1) return null;
      return { m: k, ch };
    }
    if (k === 'g') {
      const k2 = keys[i + 1];
      if (k2 === undefined) return 'more';
      if (k2 === 'g') return { m: 'gg' };
    }
    return null;
  }

  parseObj(keys, i) {
    const ia = keys[i], k = keys[i + 1];
    if (k === undefined) return 'more';
    return OBJ.has(k) ? { ia, k } : null;
  }

  parseNormal(keys) {
    let [n1, i] = readCount(keys, 0);
    const k = keys[i];
    if (k === undefined) return 'more';
    let op = null;
    if (OPS.has(k)) { op = k; i++; } else if (k === 'g') {
      const k2 = keys[i + 1];
      if (k2 === undefined) return 'more';
      if (k2 === 'u' || k2 === 'U' || k2 === '~') { op = 'g' + k2; i += 2; }
    }
    if (op) {
      const [n2, j] = readCount(keys, i); i = j;
      const k3 = keys[i];
      if (k3 === undefined) return 'more';
      const cnt = (n1 || 1) * (n2 || 1), has = !!(n1 || n2);
      const change = op !== 'y';
      const dbl = op.length === 1 ? op : op[1];
      if (k3 === dbl) return { change, run: () => this.opLines(op, cnt) };
      if (k3 === 'i' || k3 === 'a') {
        const ob = this.parseObj(keys, i);
        if (ob === 'more' || !ob) return ob;
        return { change, run: () => { const rg = this.textObj(ob.ia, ob.k, cnt); if (rg) this.applyOp(op, rg); } };
      }
      const mo = this.parseMotion(keys, i);
      if (mo === 'more' || !mo) return mo;
      return { change, run: () => { const rg = this.motionRange(op, mo, cnt, has); if (rg) this.applyOp(op, rg); } };
    }
    const cnt = n1 || 1;
    const ch = (run) => ({ change: true, run });
    const L = this.lines;
    switch (k) {
      case 'x': return ch(() => { if (this.len()) this.applyOp('d', { sr: this.r, sc: this.c, er: this.r, ec: Math.min(this.len(), this.c + cnt) }); });
      case 'X': return ch(() => { if (this.c > 0) this.applyOp('d', { sr: this.r, sc: Math.max(0, this.c - cnt), er: this.r, ec: this.c }); });
      case 's': return ch(() => this.applyOp('c', { sr: this.r, sc: this.c, er: this.r, ec: Math.min(this.len(), this.c + cnt) }));
      case 'S': return ch(() => this.opLines('c', cnt));
      case 'C': case 'D': return ch(() => {
        const er = Math.min(L.length - 1, this.r + cnt - 1);
        this.applyOp(k === 'C' ? 'c' : 'd', { sr: this.r, sc: this.c, er, ec: L[er].length });
      });
      case 'Y': return { change: false, run: () => this.opLines('y', cnt) };
      case 'r': {
        const c2 = keys[i + 1];
        if (c2 === undefined) return 'more';
        if (c2.length > 1) return null;
        return ch(() => {
          const line = L[this.r];
          if (this.c + cnt > line.length) return;
          L[this.r] = line.slice(0, this.c) + c2.repeat(cnt) + line.slice(this.c + cnt);
          this.c += cnt - 1;
        });
      }
      case '~': return ch(() => {
        const line = L[this.r]; const e = Math.min(line.length, this.c + cnt);
        L[this.r] = line.slice(0, this.c) + [...line.slice(this.c, e)].map(swapCase).join('') + line.slice(e);
        this.c = e;
      });
      case 'J': return ch(() => this.join(this.r, Math.max(2, cnt)));
      case 'p': case 'P': return ch(() => this.put(k === 'p', cnt));
      case 'i': case 'a': case 'I': case 'A': case 'o': case 'O': return ch(() => this.startInsert(k));
      case 'u': return { change: false, run: () => { for (let n = 0; n < cnt; n++) this.undo(); } };
      case '<C-r>': return { change: false, run: () => { for (let n = 0; n < cnt; n++) this.redo(); } };
      case '.': return { change: false, run: () => this.repeat(n1) };
      case 'v': case 'V': return { change: false, run: () => { this.mode = k === 'v' ? 'visual' : 'vline'; this.vr = this.r; this.vc = this.c; } };
      case '/': case '?': case ':': return { change: false, run: () => { this.cmd = { type: k, text: '', from: 'normal' }; this.mode = 'cmd'; } };
      default: break;
    }
    const mo = this.parseMotion(keys, i);
    if (mo === 'more' || !mo) return mo;
    return { change: false, run: () => this.moveBy(mo, cnt, !!n1) };
  }

  parseVisual(keys) {
    const [n, i] = readCount(keys, 0);
    const k = keys[i];
    if (k === undefined) return 'more';
    const cnt = n || 1;
    const ch = (run) => ({ change: true, run });
    const lineMode = this.mode === 'vline';
    switch (k) {
      case 'v': case 'V': return { change: false, run: () => { const want = k === 'v' ? 'visual' : 'vline'; this.mode = this.mode === want ? 'normal' : want; } };
      case 'o': return { change: false, run: () => { [this.r, this.vr] = [this.vr, this.r]; [this.c, this.vc] = [this.vc, this.c]; this.want = this.c; } };
      case 'd': case 'x': case 'X': case 'D': return ch(() => this.visualOp('d', k === 'X' || k === 'D'));
      case 'y': case 'Y': return { change: false, run: () => this.visualOp('y', k === 'Y') };
      case 'c': case 's': return ch(() => this.visualOp('c', false));
      case 'C': case 'S': case 'R': return ch(() => this.visualOp('c', true));
      case '>': case '<': return ch(() => { for (let n = 0; n < cnt; n++) this.visualOp(k, true, n < cnt - 1); });
      case '~': return ch(() => this.visualOp('g~', false));
      case 'u': return ch(() => this.visualOp('gu', false));
      case 'U': return ch(() => this.visualOp('gU', false));
      case 'J': return ch(() => { const [s, e] = [Math.min(this.r, this.vr), Math.max(this.r, this.vr)]; this.mode = 'normal'; this.join(s, Math.max(2, e - s + 1)); });
      case 'p': case 'P': return ch(() => {
        const reg = { ...this.reg };
        const L = this.lines;
        const atEnd = lineMode && Math.max(this.r, this.vr) === L.length - 1 && Math.min(this.r, this.vr) > 0;
        this.visualOp('d', false);
        this.reg = reg;
        if (lineMode && !reg.line) { L.splice(this.r + (atEnd ? 1 : 0), 0, ...reg.text.split('\n')); this.r += atEnd ? 1 : 0; this.c = this.fnb(); }
        else if (lineMode) { if (atEnd) this.put(true, 1); else this.put(false, 1); }
        else this.put(false, 1);
        this.reg = reg;
      });
      case ':': return { change: false, run: () => {
        const s = Math.min(this.r, this.vr), e = Math.max(this.r, this.vr);
        this.mode = 'cmd'; this.cmd = { type: ':', text: "'<,'>", from: 'normal', vis: [s, e] };
      } };
      case '/': case '?': return { change: false, run: () => { this.cmd = { type: k, text: '', from: this.mode }; this.mode = 'cmd'; } };
      case 'i': case 'a': {
        const ob = this.parseObj(keys, i);
        if (ob === 'more' || !ob) return ob;
        return { change: false, run: () => {
          const rg = this.textObj(ob.ia, ob.k, cnt);
          if (!rg) return;
          if (rg.line) { this.mode = 'vline'; this.vr = rg.sr; this.vc = 0; this.r = rg.er; this.c = 0; }
          else { this.vr = rg.sr; this.vc = rg.sc; this.r = rg.er; this.c = Math.max(rg.sc, rg.ec - 1); if (rg.er > rg.sr && rg.ec === 0) { this.r = rg.er - 1; this.c = this.len(); } }
        } };
      }
      default: break;
    }
    const mo = this.parseMotion(keys, i);
    if (mo === 'more' || !mo) return mo;
    return { change: false, run: () => this.moveBy(mo, cnt, !!n) };
  }

  visualOp(op, forceLine, keep = false) {
    const lineMode = this.mode === 'vline' || forceLine;
    let s = { r: this.vr, c: this.vc }, e = { r: this.r, c: this.c };
    if (e.r < s.r || (e.r === s.r && e.c < s.c)) [s, e] = [e, s];
    if (!keep) this.mode = 'normal';
    if (lineMode) { this.applyOp(op, { sr: s.r, er: e.r, line: true }); return; }
    this.applyOp(op, { sr: s.r, sc: s.c, er: e.r, ec: Math.min(this.lines[e.r].length, e.c + 1) });
  }

  moveBy(mo, cnt, has) {
    const m = this.evalMotion(mo, cnt, has, false);
    if (!m) return;
    this.r = m.r; this.c = m.c;
    if (m.want !== undefined) this.want = m.want;
    else if (!m.keepWant) this.want = m.c;
  }

  // ------------------------------------------------------------ motions
  evalMotion(mo, cnt, has, op) {
    const L = this.lines, last = L.length - 1;
    const r = this.r, c = this.c;
    const maxC = (rr) => (op ? L[rr].length : Math.max(0, L[rr].length - 1));
    switch (mo.m) {
      case 'h': case '<BS>':
        if (c === 0) return null;
        return { r, c: Math.max(0, c - cnt), type: 'ex' };
      case 'l': case ' ': {
        const m = maxC(r);
        if (c >= m) return null;
        return { r, c: Math.min(m, c + cnt), type: 'ex' };
      }
      case 'j': case 'k': case '+': case '-': case '<CR>': {
        const d = mo.m === 'k' || mo.m === '-' ? -1 : 1;
        if ((d > 0 && r >= last) || (d < 0 && r <= 0)) return null;
        const rr = Math.max(0, Math.min(last, r + d * cnt));
        if (mo.m === 'j' || mo.m === 'k') return { r: rr, c: Math.min(this.want, Math.max(0, L[rr].length - 1)), type: 'line', keepWant: true };
        return { r: rr, c: this.fnb(rr), type: 'line' };
      }
      case '0': return { r, c: 0, type: 'ex' };
      case '^': return { r, c: this.fnb(r), type: 'ex' };
      case '$': {
        const rr = Math.min(last, r + cnt - 1);
        return { r: rr, c: Math.max(0, L[rr].length - 1), type: 'in', want: Infinity };
      }
      case 'gg': case 'G': {
        const rr = has ? Math.min(last, Math.max(0, cnt - 1)) : (mo.m === 'gg' ? 0 : last);
        return { r: rr, c: this.fnb(rr), type: 'line' };
      }
      case 'w': case 'W': {
        const big = mo.m === 'W';
        let p = { r, c };
        for (let n = 0; n < cnt; n++) {
          const q = this.wordFwd(p.r, p.c, big);
          if (!q) {
            const end = { r: last, c: op ? L[last].length : Math.max(0, L[last].length - 1) };
            if (end.r === p.r && end.c === p.c) return n === 0 ? null : { ...p, type: 'ex' };
            p = end; break;
          }
          if (op && n === cnt - 1 && q.r > p.r) p = { r: p.r, c: L[p.r].length };
          else p = q;
        }
        return { ...p, type: 'ex' };
      }
      case 'e': case 'E': {
        let p = { r, c };
        for (let n = 0; n < cnt; n++) { const q = this.wordEnd(p.r, p.c, mo.m === 'E'); if (!q) break; p = q; }
        if (p.r === r && p.c === c) return null;
        return { ...p, type: 'in' };
      }
      case 'b': case 'B': {
        let p = { r, c };
        for (let n = 0; n < cnt; n++) { const q = this.wordBack(p.r, p.c, mo.m === 'B'); if (!q) break; p = q; }
        if (p.r === r && p.c === c) return null;
        return { ...p, type: 'ex' };
      }
      case 'f': case 'F': case 't': case 'T': {
        this.lastF = { m: mo.m, ch: mo.ch };
        return this.findChar(mo.m, mo.ch, cnt, false);
      }
      case ';': case ',': {
        if (!this.lastF) return null;
        const flip = { f: 'F', F: 'f', t: 'T', T: 't' };
        const m = mo.m === ';' ? this.lastF.m : flip[this.lastF.m];
        return this.findChar(m, this.lastF.ch, cnt, true);
      }
      case '}': case '{': {
        let rr = r;
        for (let n = 0; n < cnt; n++) {
          let i = rr;
          if (mo.m === '}') { while (i < last && L[i] === '') i++; while (i < last && L[i] !== '') i++; }
          else { while (i > 0 && L[i] === '') i--; while (i > 0 && L[i] !== '') i--; }
          rr = i;
        }
        let cc = 0;
        if (mo.m === '}' && rr === last && L[rr] !== '') cc = op ? L[rr].length : Math.max(0, L[rr].length - 1);
        if (rr === r && cc === c) return null;
        return { r: rr, c: cc, type: 'ex' };
      }
      case '%': return this.matchPair();
      case 'n': case 'N': {
        if (!this.lastSearch) { this.msg = 'E35: 还没有搜索过'; return null; }
        const dir = this.lastSearch.dir * (mo.m === 'N' ? -1 : 1);
        const p = this.search(this.lastSearch.pat, dir, this.lastSearch.whole, cnt);
        return p ? { ...p, type: 'ex' } : null;
      }
      case '*': case '#': {
        const line = L[r];
        let i = c;
        while (i < line.length && !isWordCh(line[i])) i++;
        if (i >= line.length) return null;
        let s = i, e = i;
        while (s > 0 && isWordCh(line[s - 1])) s--;
        while (e + 1 < line.length && isWordCh(line[e + 1])) e++;
        const dir = mo.m === '*' ? 1 : -1;
        this.lastSearch = { pat: line.slice(s, e + 1), dir, whole: true };
        // Start from the word start so "#" skips the word under the cursor.
        const saved = this.c; this.c = s;
        const p = this.search(this.lastSearch.pat, dir, true, cnt);
        this.c = saved;
        return p ? { ...p, type: 'ex' } : null;
      }
      default: return null;
    }
  }

  wordFwd(r, c, big) {
    const L = this.lines;
    let line = L[r], i = c;
    const k = cls(line[c], big);
    if (k !== 0) while (i < line.length && cls(line[i], big) === k) i++;
    for (;;) {
      while (i < line.length && cls(line[i], big) === 0) i++;
      if (i < line.length) return { r, c: i };
      if (r >= L.length - 1) return null;
      r++; line = L[r]; i = 0;
      if (line.length === 0) return { r, c: 0 };
    }
  }

  wordEnd(r, c, big) {
    const L = this.lines;
    let line = L[r], i = c + 1;
    for (;;) {
      if (i >= line.length) { if (r >= L.length - 1) return null; r++; line = L[r]; i = 0; continue; }
      if (cls(line[i], big) === 0) { i++; continue; }
      break;
    }
    const k = cls(line[i], big);
    while (i + 1 < line.length && cls(line[i + 1], big) === k) i++;
    return { r, c: i };
  }

  wordBack(r, c, big) {
    const L = this.lines;
    const r0 = r, c0 = c;
    let i = c - 1;
    for (;;) {
      if (i < 0) {
        if (r === 0) return r0 === 0 && c0 === 0 ? null : { r: 0, c: 0 };
        r--; i = L[r].length - 1;
        if (L[r].length === 0) return { r, c: 0 };
        continue;
      }
      if (cls(L[r][i], big) === 0) { i--; continue; }
      break;
    }
    const k = cls(L[r][i], big);
    while (i > 0 && cls(L[r][i - 1], big) === k) i--;
    return { r, c: i };
  }

  findChar(m, ch, cnt, repeat) {
    const line = this.lines[this.r];
    let i = this.c;
    for (let n = 0; n < cnt; n++) {
      const skip = repeat && n === 0 ? 1 : 0;
      if (m === 'f' || m === 't') {
        const j = line.indexOf(ch, i + 1 + (m === 't' ? skip : 0));
        if (j < 0) return null; i = j;
      } else {
        const from = i - 1 - (m === 'T' ? skip : 0);
        if (from < 0) return null;
        const j = line.lastIndexOf(ch, from);
        if (j < 0) return null; i = j;
      }
    }
    if (m === 't') i -= 1;
    if (m === 'T') i += 1;
    if (i === this.c) return null;
    return { r: this.r, c: i, type: m === 'f' || m === 't' ? 'in' : 'ex' };
  }

  matchPair() {
    const L = this.lines;
    const line = L[this.r];
    let i = this.c;
    while (i < line.length && !'()[]{}'.includes(line[i])) i++;
    if (i >= line.length) return null;
    const open = line[i], close = PAIR[open], fwd = '([{'.includes(open);
    let r = this.r, c = i, depth = 0;
    for (;;) {
      c += fwd ? 1 : -1;
      while (c < 0 || c >= L[r].length) {
        if (fwd) { if (r >= L.length - 1) return null; r++; c = 0; if (L[r].length) break; }
        else { if (r <= 0) return null; r--; c = L[r].length - 1; if (c >= 0) break; }
      }
      const x = L[r][c];
      if (x === open) depth++;
      else if (x === close) { if (depth === 0) return { r, c, type: 'in' }; depth--; }
    }
  }

  // All literal (or whole-word) matches, ordered; the next one after/before the cursor, wrapping.
  search(pat, dir, whole, cnt = 1) {
    if (!pat) return null;
    const L = this.lines, hits = [];
    let re;
    try { re = new RegExp(whole ? `\\b${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : vimRegex(pat), 'g'); } catch { this.msg = 'E486: 搜索表达式有误'; return null; }
    L.forEach((line, r) => { re.lastIndex = 0; let m; while ((m = re.exec(line))) { hits.push({ r, c: m.index }); if (!m[0].length) re.lastIndex++; } });
    if (!hits.length) { this.msg = `E486: 找不到 ${pat}`; return null; }
    let r = this.r, c = this.c, p = null;
    for (let n = 0; n < cnt; n++) {
      if (dir > 0) p = hits.find((h) => h.r > r || (h.r === r && h.c > c)) || hits[0];
      else p = [...hits].reverse().find((h) => h.r < r || (h.r === r && h.c < c)) || hits[hits.length - 1];
      r = p.r; c = p.c;
    }
    return p;
  }

  // ------------------------------------------------------------ text objects
  textObj(ia, k, cnt) {
    const L = this.lines, r = this.r, c = this.c;
    if (k === 'w' || k === 'W') {
      const big = k === 'W', line = L[r];
      if (!line.length) return null;
      const kk = cls(line[c], big);
      let s = c, e = c;
      while (s > 0 && cls(line[s - 1], big) === kk) s--;
      while (e + 1 < line.length && cls(line[e + 1], big) === kk) e++;
      if (ia === 'a') {
        if (kk !== 0) {
          let e2 = e;
          while (e2 + 1 < line.length && cls(line[e2 + 1], big) === 0) e2++;
          if (e2 > e) e = e2; else while (s > 0 && cls(line[s - 1], big) === 0) s--;
        } else if (e + 1 < line.length) {
          const k2 = cls(line[e + 1], big); e++;
          while (e + 1 < line.length && cls(line[e + 1], big) === k2) e++;
        }
      }
      return { sr: r, sc: s, er: r, ec: e + 1 };
    }
    if (k === '"' || k === "'" || k === '`') {
      const line = L[r], idx = [];
      for (let i = 0; i < line.length; i++) if (line[i] === k && line[i - 1] !== '\\') idx.push(i);
      let pair = null;
      for (let j = 0; j + 1 < idx.length; j += 2) if (c >= idx[j] && c <= idx[j + 1]) { pair = [idx[j], idx[j + 1]]; break; }
      if (!pair) for (let j = 0; j + 1 < idx.length; j += 2) if (idx[j] > c) { pair = [idx[j], idx[j + 1]]; break; }
      if (!pair) return null;
      let [a, b] = pair;
      if (ia === 'i') return { sr: r, sc: a + 1, er: r, ec: b };
      let e = b + 1;
      if (e < line.length && /\s/.test(line[e])) { while (e < line.length && /\s/.test(line[e])) e++; }
      else while (a > 0 && /\s/.test(line[a - 1])) a--;
      return { sr: r, sc: a, er: r, ec: e };
    }
    if (k === 'p') {
      const last = L.length - 1;
      const b = isBlank(L[r]);
      let s = r, e = r;
      while (s > 0 && isBlank(L[s - 1]) === b) s--;
      while (e < last && isBlank(L[e + 1]) === b) e++;
      if (ia === 'a') {
        if (!b) {
          let e2 = e;
          while (e2 < last && isBlank(L[e2 + 1])) e2++;
          if (e2 > e) e = e2; else while (s > 0 && isBlank(L[s - 1])) s--;
        } else while (e < last && !isBlank(L[e + 1])) e++;
      }
      return { sr: s, er: e, line: true };
    }
    const pair = BRACKET[k];
    if (!pair) return null;
    const [open, close] = pair;
    let pos = { r, c }, o = null;
    for (let n = 0; n < cnt; n++) {
      o = this.scanOpen(pos, open, close, n === 0);
      if (!o) return null;
      pos = { r: o.r, c: o.c - 1 };
      if (pos.c < 0) { if (pos.r === 0 && n < cnt - 1) return null; }
    }
    const cl = this.scanClose(o, open, close);
    if (!cl) return null;
    if (ia === 'a') return { sr: o.r, sc: o.c, er: cl.r, ec: cl.c + 1 };
    if (o.c === L[o.r].length - 1 && cl.r > o.r && /^\s*$/.test(L[cl.r].slice(0, cl.c))) {
      if (cl.r - o.r < 2) return { sr: o.r, sc: o.c + 1, er: o.r, ec: o.c + 1 };
      return { sr: o.r + 1, er: cl.r - 1, line: true };
    }
    return { sr: o.r, sc: o.c + 1, er: cl.r, ec: cl.c };
  }

  scanOpen(pos, open, close, first) {
    const L = this.lines;
    let { r, c } = pos, depth = 0;
    if (c < 0) { if (r === 0) return null; r--; c = L[r].length - 1; }
    if (first) {
      const x = L[r][c];
      if (x === open) return { r, c };
      if (x === close) c--;
    }
    for (;;) {
      while (c < 0) { if (r === 0) return null; r--; c = L[r].length - 1; }
      const x = L[r][c];
      if (x === close) depth++;
      else if (x === open) { if (depth === 0) return { r, c }; depth--; }
      c--;
    }
  }

  scanClose(o, open, close) {
    const L = this.lines;
    let r = o.r, c = o.c + 1, depth = 0;
    for (;;) {
      while (c >= L[r].length) { if (r >= L.length - 1) return null; r++; c = 0; if (L[r].length) break; }
      const x = L[r][c];
      if (x === open) depth++;
      else if (x === close) { if (depth === 0) return { r, c }; depth--; }
      c++;
    }
  }

  // ------------------------------------------------------------ operators
  motionRange(op, mo, cnt, has) {
    const L = this.lines, r = this.r, c = this.c;
    if (op === 'c' && (mo.m === 'w' || mo.m === 'W') && cls(L[r][c], mo.m === 'W') !== 0) {
      const big = mo.m === 'W', line = L[r], k = cls(line[c], big);
      let p = { r, c };
      let e = c; while (e + 1 < line.length && cls(line[e + 1], big) === k) e++;
      p = { r, c: e };
      for (let n = 1; n < cnt; n++) { const q = this.wordEnd(p.r, p.c, big); if (!q) break; p = q; }
      return { sr: r, sc: c, er: p.r, ec: p.c + 1 };
    }
    const m = this.evalMotion(mo, cnt, has, true);
    if (!m) return null;
    if (m.type === 'line') return { sr: Math.min(r, m.r), er: Math.max(r, m.r), line: true };
    let s = { r, c }, e = { r: m.r, c: m.c };
    if (e.r < s.r || (e.r === s.r && e.c < s.c)) [s, e] = [e, s];
    if (m.type === 'in') e.c += 1;
    else if (e.c === 0 && e.r > s.r) {
      const er = e.r - 1;
      const firstNb = L[s.r].search(/\S/);
      if (firstNb < 0 || s.c <= firstNb) return { sr: s.r, er, line: true };
      e = { r: er, c: L[er].length };
    }
    return { sr: s.r, sc: s.c, er: e.r, ec: e.c };
  }

  opLines(op, cnt) {
    const er = Math.min(this.lines.length - 1, this.r + cnt - 1);
    this.applyOp(op, { sr: this.r, er, line: true });
  }

  applyOp(op, rg) {
    const L = this.lines;
    if (rg.line) {
      const { sr, er } = rg;
      const block = L.slice(sr, er + 1);
      if (op === 'y') { this.reg = { text: block.join('\n'), line: true }; this.r = sr; return; }
      if (op === 'd') {
        this.reg = { text: block.join('\n'), line: true };
        L.splice(sr, er - sr + 1);
        if (!L.length) L.push('');
        this.r = Math.min(sr, L.length - 1); this.c = this.fnb(); this.want = this.c;
        return;
      }
      if (op === 'c') {
        this.reg = { text: block.join('\n'), line: true };
        const indent = L[sr].match(/^\s*/)[0];
        L.splice(sr, er - sr + 1, indent);
        this.r = sr; this.c = indent.length; this.mode = 'insert';
        return;
      }
      if (op === '>' || op === '<') {
        for (let i = sr; i <= er; i++) {
          if (!L[i].length) continue;
          L[i] = op === '>' ? ' '.repeat(SW) + L[i] : L[i].replace(new RegExp(`^ {1,${SW}}|^\\t`), '');
        }
        this.r = sr; this.c = this.fnb(); this.want = this.c;
        return;
      }
      for (let i = sr; i <= er; i++) L[i] = caseOp(op, L[i]);
      this.r = sr; this.c = this.fnb();
      return;
    }
    const { sr, sc, er } = rg;
    const ec = Math.min(rg.ec, L[er].length);
    const text = sr === er ? L[sr].slice(sc, ec) : [L[sr].slice(sc), ...L.slice(sr + 1, er), L[er].slice(0, ec)].join('\n');
    if (op === 'y') { this.reg = { text, line: false }; this.r = sr; this.c = sc; this.want = sc; return; }
    if (op === 'd' || op === 'c') {
      this.reg = { text, line: false };
      L[sr] = L[sr].slice(0, sc) + L[er].slice(ec);
      L.splice(sr + 1, er - sr);
      this.r = sr; this.c = sc; this.want = sc;
      if (op === 'c') this.mode = 'insert';
      return;
    }
    if (op === '>' || op === '<') { this.applyOp(op, { sr, er, line: true }); return; }
    if (sr === er) L[sr] = L[sr].slice(0, sc) + caseOp(op, L[sr].slice(sc, ec)) + L[sr].slice(ec);
    else {
      L[sr] = L[sr].slice(0, sc) + caseOp(op, L[sr].slice(sc));
      for (let i = sr + 1; i < er; i++) L[i] = caseOp(op, L[i]);
      L[er] = caseOp(op, L[er].slice(0, ec)) + L[er].slice(ec);
    }
    this.r = sr; this.c = sc; this.want = sc;
  }

  join(r, n) {
    const L = this.lines;
    if (r >= L.length - 1) return;
    const end = Math.min(L.length - 1, r + n - 1);
    let cur = L[r], col = 0;
    for (let i = r + 1; i <= end; i++) {
      const nx = L[i].replace(/^\s+/, '');
      const sep = nx === '' || /\s$/.test(cur) || nx.startsWith(')') || cur === '' ? '' : ' ';
      col = cur.length;
      cur += sep + nx;
    }
    L.splice(r, end - r + 1, cur);
    this.r = r; this.c = col; this.want = col;
  }

  put(after, cnt) {
    const L = this.lines, { text, line } = this.reg;
    if (!text && !line) return;
    if (line) {
      const block = [];
      for (let n = 0; n < cnt; n++) block.push(...text.split('\n'));
      const at = after ? this.r + 1 : this.r;
      L.splice(at, 0, ...block);
      this.r = at; this.c = this.fnb(); this.want = this.c;
      return;
    }
    const cur = L[this.r];
    const pos = after && cur.length ? this.c + 1 : this.c;
    const ins = text.repeat(cnt);
    const parts = ins.split('\n');
    if (parts.length === 1) {
      L[this.r] = cur.slice(0, pos) + ins + cur.slice(pos);
      this.c = pos + ins.length - 1;
    } else {
      const tail = cur.slice(pos);
      const rows = [cur.slice(0, pos) + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + tail];
      L.splice(this.r, 1, ...rows);
      this.c = pos;
    }
    this.want = this.c;
  }

  // ------------------------------------------------------------ insert mode
  startInsert(k) {
    const L = this.lines;
    if (k === 'a') this.c = L[this.r].length ? this.c + 1 : 0;
    else if (k === 'A') this.c = L[this.r].length;
    else if (k === 'I') { const m = L[this.r].search(/\S/); this.c = m < 0 ? L[this.r].length : m; }
    else if (k === 'o' || k === 'O') {
      const indent = L[this.r].match(/^\s*/)[0];
      const at = k === 'o' ? this.r + 1 : this.r;
      L.splice(at, 0, indent);
      this.r = at; this.c = indent.length;
    }
    this.mode = 'insert';
  }

  insertKey(k) {
    const L = this.lines;
    if (k === '<Esc>') {
      this.mode = 'normal';
      // An indent left alone on an empty line is removed, as autoindent does.
      if (/^\s+$/.test(L[this.r])) L[this.r] = '';
      this.c = Math.max(0, this.c - 1); this.want = this.c;
      this.clamp();
      if (this.insSnap) {
        if (this.insSnap.lines.join('\n') !== this.text) { this.undos.push(this.insSnap); this.redos = []; }
        this.insSnap = null;
      }
      if (this.rec) { this.dotKeys = this.rec; this.rec = null; }
      return;
    }
    if (k === '<CR>') {
      const line = L[this.r];
      const before = line.slice(0, this.c), after = line.slice(this.c);
      const indent = before.match(/^\s*/)[0];
      L[this.r] = /^\s+$/.test(before) ? '' : before;
      L.splice(this.r + 1, 0, indent + after);
      this.r += 1; this.c = indent.length;
      return;
    }
    if (k === '<BS>') {
      if (this.c > 0) { L[this.r] = L[this.r].slice(0, this.c - 1) + L[this.r].slice(this.c); this.c--; }
      else if (this.r > 0) { const pl = L[this.r - 1].length; L[this.r - 1] += L[this.r]; L.splice(this.r, 1); this.r--; this.c = pl; }
      return;
    }
    if (k === '<Tab>') { this.insertText(' '.repeat(SW)); return; }
    if (k.length === 1) this.insertText(k);
  }

  insertText(s) {
    const line = this.lines[this.r];
    this.lines[this.r] = line.slice(0, this.c) + s + line.slice(this.c);
    this.c += s.length;
  }

  // ------------------------------------------------------------ command line
  cmdKey(k) {
    const cmd = this.cmd;
    const back = () => {
      this.mode = cmd.from === 'visual' || cmd.from === 'vline' ? cmd.from : 'normal';
      this.cmd = null;
      this.clamp();
    };
    if (k === '<Esc>') { back(); return; }
    if (k === '<BS>') { if (!cmd.text) back(); else cmd.text = cmd.text.slice(0, -1); return; }
    if (k === '<CR>') { back(); this.execCmd(cmd); this.clamp(); return; }
    if (k.length === 1) cmd.text += k;
  }

  execCmd(cmd) {
    if (cmd.type === '/' || cmd.type === '?') {
      const dir = cmd.type === '/' ? 1 : -1;
      const pat = cmd.text || this.lastSearch?.pat;
      if (!pat) return;
      this.lastSearch = { pat, dir, whole: false };
      const p = this.search(pat, dir, false);
      if (p) { this.r = p.r; this.c = p.c; this.want = p.c; }
      return;
    }
    const before = this.snap(), t0 = this.text;
    this.ex(cmd.text.trim(), cmd.vis);
    if (this.text !== t0) { this.undos.push(before); this.redos = []; }
  }

  ex(text, vis) {
    const L = this.lines;
    if (/^\d+$/.test(text)) { this.r = Math.min(L.length - 1, Math.max(0, Number(text) - 1)); this.c = this.fnb(); this.want = this.c; return; }
    if (/^(w|q|wq|x|q!|wq!|qa!?|x!)$/.test(text)) { this.msg = text.startsWith('w') ? '已保存（假装的）。这里没有文件，继续闯关吧' : '想退出 Vim？在这里你永远逃不掉 :)'; return; }
    if (text === 'noh' || text === 'nohlsearch') return;
    let rest = text, sr = this.r, er = this.r;
    let m;
    if (rest.startsWith('%')) { sr = 0; er = L.length - 1; rest = rest.slice(1); }
    else if (rest.startsWith("'<,'>")) { [sr, er] = vis || [this.r, this.r]; rest = rest.slice(5); }
    else if ((m = rest.match(/^(\d+|\.)(?:,(\d+|\$|\.))?/))) {
      const num = (x) => (x === '.' ? this.r : x === '$' ? L.length - 1 : Number(x) - 1);
      sr = num(m[1]); er = m[2] ? num(m[2]) : sr; rest = rest.slice(m[0].length);
    }
    sr = Math.max(0, Math.min(L.length - 1, sr)); er = Math.max(sr, Math.min(L.length - 1, er));
    if (rest === 'd') { this.applyOp('d', { sr, er, line: true }); return; }
    if (rest === '>' || rest === '<') { this.applyOp(rest, { sr, er, line: true }); return; }
    if ((m = rest.match(/^(?:s|substitute)(.)(.*)$/))) {
      const d = m[1];
      const parts = splitDelim(m[2], d);
      const pat = parts[0] || this.lastSearch?.pat || '';
      const rep = parts[1] ?? '';
      const flags = parts[2] ?? '';
      let re;
      try { re = new RegExp(vimRegex(pat), (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : '')); } catch { this.msg = 'E486: 替换表达式有误'; return; }
      const r2 = vimReplacement(rep);
      let lastHit = -1;
      for (let i = sr; i <= er; i++) {
        re.lastIndex = 0;
        const nx = L[i].replace(re, r2);
        if (nx !== L[i] || re.test(L[i])) { L[i] = nx; lastHit = i; }
      }
      if (lastHit < 0) { this.msg = `E486: 找不到 ${pat}`; return; }
      this.lastSearch = { pat, dir: 1, whole: false };
      this.r = lastHit; this.c = this.fnb(); this.want = this.c;
      return;
    }
    if ((m = rest.match(/^(g!?|v)(.)(.*)$/))) {
      const inv = m[1] !== 'g';
      const parts = splitDelim(m[3], m[2]);
      const cmd = (parts[1] ?? '').trim();
      if (cmd !== 'd' && cmd !== 'delete') { this.msg = '这里的 :g 只支持 d'; return; }
      let re;
      try { re = new RegExp(vimRegex(parts[0])); } catch { this.msg = 'E486: 表达式有误'; return; }
      if (!text.startsWith('%') && !/^\d/.test(text) && !text.startsWith("'<")) { sr = 0; er = L.length - 1; }
      const keep = [];
      let first = -1;
      L.forEach((line, i) => { const hit = i >= sr && i <= er && re.test(line) !== inv; if (hit && first < 0) first = keep.length; if (!hit) keep.push(line); });
      if (first < 0) { this.msg = `E486: 找不到 ${parts[0]}`; return; }
      this.lines = keep.length ? keep : [''];
      this.r = Math.min(first, this.lines.length - 1); this.c = this.fnb(); this.want = this.c;
      return;
    }
    this.msg = `E492: 这个游戏还不认识 :${text}`;
  }

  // ------------------------------------------------------------ undo / repeat
  undo() {
    const s = this.undos.pop();
    if (!s) { this.msg = '已经是最早的改动'; return; }
    this.redos.push(this.snap());
    this.lines = s.lines.slice(); this.r = s.r; this.c = s.c; this.want = s.c;
  }

  redo() {
    const s = this.redos.pop();
    if (!s) { this.msg = '已经是最新的改动'; return; }
    this.undos.push(this.snap());
    this.lines = s.lines.slice(); this.r = s.r; this.c = s.c; this.want = s.c;
  }

  repeat(count) {
    if (!this.dotKeys) return;
    let keys = this.dotKeys;
    if (count) { const [, i] = readCount(keys, 0); keys = [...String(count), ...keys.slice(i)]; }
    this.replaying++;
    try { for (const k of keys) this.feed(k); } finally { this.replaying--; }
    if (count) this.dotKeys = keys;
  }
}

function splitDelim(s, d) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === d) { cur += d; i++; continue; }
    if (s[i] === d) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

function swapCase(ch) { const u = ch.toUpperCase(); return u === ch ? ch.toLowerCase() : u; }
function caseOp(op, s) {
  if (op === 'gU') return s.toUpperCase();
  if (op === 'gu') return s.toLowerCase();
  return [...s].map(swapCase).join('');
}
