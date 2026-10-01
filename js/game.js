import { Vim } from './vim.js';
import { CHAPTERS, CH, prep, solved, allPuzzles } from './levels.js';
import { Sound } from './audio.js';
import { FX } from './fx.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const ALL = allPuzzles();
const pid = (ch, i) => `${ch}.${i + 1}`;

// ------------------------------------------------------------ storage
const STORE = 'vimdopa:v1';
function defaults() {
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no media queries */ }
  return { v: 1, puz: {}, bestL: 0, days: [], sound: true, motion: reduce ? 0 : 2, runs: 0 };
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d && d.v === 1) return { ...defaults(), ...d }; } catch { /* storage blocked */ }
  return defaults();
}
let save = load();
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* storage blocked */ } };

const chDone = (id) => CH[id].puzzles.every((_, i) => save.puz[pid(id, i)]);
const chStars = (id) => CH[id].puzzles.reduce((s, _, i) => s + (save.puz[pid(id, i)]?.s || 0), 0);
const chUnlocked = (id) => CH[id].need.every(chDone);
const totalStars = () => Object.values(save.puz).reduce((s, r) => s + (r.s || 0), 0);
const nextChapter = () => CHAPTERS.find((c) => chUnlocked(c.id) && !chDone(c.id));
const doneChapters = () => CHAPTERS.filter((c) => chDone(c.id));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function streak() {
  const set = new Set(save.days);
  const d = new Date();
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function fmtDopa(L) {
  const v = 10 ** L;
  if (v < 1e4) return Math.round(v).toLocaleString('en-US');
  const [u, name] = v >= 1e8 ? [1e8, '亿'] : [1e4, '万'];
  const x = v / u;
  return (x < 10 ? x.toFixed(1) : Math.floor(x)) + name;
}
const STAGE_AT = [0.35, 0.9, 1.6, 2.4, 3.3, 4.4];
const stageOf = (L) => STAGE_AT.filter((t) => L >= t).length;

// ------------------------------------------------------------ audio / fx / mascots
const sound = new Sound();
sound.setMuted(!save.sound);
const fx = new FX($('#bg'));
fx.motion = save.motion;
sound.onBeat = (i) => { fx.beat(i); if (screen === 'play' && run && run.stage >= 1) poke(playMascot, 'bop'); };

const tpl = $('#tpl-mascot');
const hosts = document.querySelectorAll('.mascot-host');
const [titleMascot, playMascot] = [...hosts].map((h) => { const m = tpl.content.firstElementChild.cloneNode(true); h.appendChild(m); return m; });
function poke(el, cls) {
  if (!el || save.motion === 0) return;
  if (cls === 'bop' && (el.classList.contains('jump') || el.classList.contains('spin'))) return;
  el.classList.remove('bop', 'jump', 'spin');
  void el.getBoundingClientRect();
  el.classList.add(cls);
}
document.addEventListener('animationend', (e) => { if (e.target.classList?.contains('mascot')) e.target.classList.remove('bop', 'jump', 'spin'); });

function toast(msg, cls = '') {
  const t = document.createElement('div');
  t.className = `toast ${cls}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), cls === 'ms' ? 1800 : 2600);
}
function floaty(text, el) {
  if (save.motion === 0) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'floaty'; f.textContent = text;
  f.style.left = `${r.left + r.width / 2 - 40}px`; f.style.top = `${r.top + r.height / 2 - 20}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

// ------------------------------------------------------------ editor rendering
const MODE_COLOR = { normal: 'var(--pink)', insert: 'var(--sky)', visual: 'var(--grape)', vline: 'var(--grape)', cmd: 'var(--sun)' };
const MODE_NAME = { normal: 'NORMAL', insert: 'INSERT', visual: 'VISUAL', vline: 'V-LINE', cmd: 'COMMAND' };

function bufHTML(lines, { vim = null, tgt = null, want = null, okAgainst = null } = {}) {
  let vis = null;
  if (vim && (vim.mode === 'visual' || vim.mode === 'vline')) {
    let s = { r: vim.vr, c: vim.vc }, e = { r: vim.r, c: vim.c };
    if (e.r < s.r || (e.r === s.r && e.c < s.c)) [s, e] = [e, s];
    vis = { s, e, line: vim.mode === 'vline' };
  }
  const inVis = (r, i) => vis && !vis.line && (r > vis.s.r || (r === vis.s.r && i >= vis.s.c)) && (r < vis.e.r || (r === vis.e.r && i <= vis.e.c));
  let html = '';
  lines.forEach((line, r) => {
    const n = line.length;
    let slots = n;
    if (vim && r === vim.r) slots = Math.max(slots, vim.c + 1);
    if (tgt && tgt.r === r) slots = Math.max(slots, tgt.c + 1);
    let row = '';
    for (let i = 0; i < slots; i++) {
      const ch = i < n ? line[i] : ' ';
      let cl = '';
      if (vim && r === vim.r && i === vim.c) cl += vim.mode === 'insert' ? ' ci' : vim.mode === 'cmd' ? ' cc' : ' cn';
      if (tgt && tgt.r === r && tgt.c === i) cl += ' tg';
      if (inVis(r, i)) cl += ' sel';
      row += cl ? `<span class="${cl.trim()}">${esc(ch)}</span>` : esc(ch);
    }
    let lc = 'ln';
    if (vim && r === vim.r) lc += ' cur-ln';
    if (want && want[r] !== line) lc += ' df';
    if (okAgainst && okAgainst[r] === line) lc += ' ok';
    if (vis && vis.line && r >= vis.s.r && r <= vis.e.r) lc += ' vl';
    html += `<div class="${lc}"><span class="no">${r + 1}</span><span class="tx">${row}</span></div>`;
  });
  return html;
}

const KEYLABEL = { '<Esc>': 'Esc', '<CR>': '↵', '<BS>': '⌫', '<Tab>': '⇥', '<C-r>': '^R', ' ': '␣' };
const keyChip = (k) => `<span class="k${k === '<Esc>' ? ' esc' : ''}">${esc(KEYLABEL[k] ?? k)}</span>`;
const stars = (n, max = 3) => '★'.repeat(n) + `<span class="off">${'★'.repeat(max - n)}</span>`;

// ------------------------------------------------------------ screens
let screen = 'title';
function show(name) {
  screen = name;
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `s-${name}`;
  if (name !== 'play') { sound.stop(); fx.setStage(name === 'title' ? 1 : 0); }
  if (name === 'title') renderTitle();
  if (name === 'map') renderMap();
  scrollTo(0, 0);
}

// ---------------- title
function renderTitle() {
  const nx = nextChapter();
  const idx = nx ? CHAPTERS.indexOf(nx) + 1 : 0;
  $('#b-continue').textContent = nx ? (Object.keys(save.puz).length ? `继续：第 ${idx} 章 ${nx.name}` : '开始闯关') : '全部通关！再来一轮混合挑战';
  const mixOk = doneChapters().length >= 2;
  $('#b-mix').disabled = !mixOk;
  $('#b-mix').title = mixOk ? '从已通关章节随机抽 8 关' : '通关 2 章后解锁';
  $('#stats').innerHTML = [
    [`${totalStars()}`, `/ ${ALL.length * 3} 星`],
    [`${doneChapters().length}`, `/ ${CHAPTERS.length} 章通关`],
    [`${streak()}`, '天连续'],
    [fmtDopa(save.bestL), '最高多巴值'],
  ].map(([b, s]) => `<span><b>${b}</b>${s}</span>`).join('');
  $('#b-sound').textContent = save.sound ? '声音：开' : '声音：关';
  $('#b-motion').textContent = `动效：${['关闭', '柔和', '全开'][save.motion]}`;
  document.body.classList.toggle('calm', save.motion === 0);
}

const DEMOS = [
  { buf: 'const ▮foo = 1;', keys: 'ciwbar<Esc>', label: 'ciw 改掉一个词' },
  { buf: '▮let a = 1\nlet b = 2\nlet c = 3', keys: 'A;<Esc>j.j.', label: '. 重复上一次修改' },
  { buf: 'print(some, ▮args, here)', keys: 'di(', label: 'di( 清空括号' },
  { buf: '▮second\nfirst', keys: 'ddp', label: 'ddp 交换两行' },
];
let demo = { i: 0, k: 0, vim: null, keys: [], trail: [], timer: 0 };
function demoTick() {
  if (screen !== 'title') { demo.timer = setTimeout(demoTick, 500); return; }
  if (!demo.vim || demo.k > demo.keys.length) {
    const d = DEMOS[demo.i++ % DEMOS.length];
    const info = prep({ buf: d.buf, sol: d.keys });
    demo.vim = new Vim(info.text, info.cur.r, info.cur.c); demo.keys = info.keys; demo.k = -1; demo.trail = [];
    $('#demo-label').textContent = d.label;
  } else if (demo.k < demo.keys.length) {
    const key = demo.keys[demo.k];
    demo.vim.feed(key); demo.trail.push(key);
    poke(titleMascot, 'bop');
  }
  demo.k++;
  const v = demo.vim;
  $('#demo-ed').innerHTML = bufHTML(v.lines, { vim: v });
  $('#demo-ed').style.setProperty('--mode', MODE_COLOR[v.mode]);
  titleMascot.style.setProperty('--mode', MODE_COLOR[v.mode]);
  $('#demo-trail').innerHTML = demo.trail.map(keyChip).join('');
  const done = demo.k > demo.keys.length;
  if (done) poke(titleMascot, 'jump');
  demo.timer = setTimeout(demoTick, done ? 1800 : demo.k === 0 ? 900 : 430);
}

// ---------------- map
function renderMap() {
  const tier = {};
  const tierOf = (id) => tier[id] ?? (tier[id] = CH[id].need.length ? Math.max(...CH[id].need.map(tierOf)) + 1 : 0);
  CHAPTERS.forEach((c) => tierOf(c.id));
  const rows = [];
  CHAPTERS.forEach((c) => (rows[tier[c.id]] ||= []).push(c));
  const nx = nextChapter();
  const tree = $('#tree');
  tree.innerHTML = '<svg id="tree-svg"></svg>';
  rows.forEach((row) => row.forEach((c) => {
    const i = CHAPTERS.indexOf(c);
    const unlocked = chUnlocked(c.id), done = chDone(c.id), st = chStars(c.id), max = c.puzzles.length * 3;
    const b = document.createElement('button');
    b.className = `node${row.length === 1 ? ' solo' : ''}${unlocked ? '' : ' locked'}${done ? ' done' : ''}${c === nx ? ' next' : ''}`;
    b.dataset.id = c.id;
    b.innerHTML = `${done ? '<span class="badge">通关</span>' : c === nx ? '<span class="badge">下一站</span>' : ''}
      <span class="num">第 ${i + 1} 章 · ${c.puzzles.length} 关</span>
      <span class="nm">${esc(c.name)}</span>
      <span class="ks">${c.keys.map((k) => `<span class="k">${esc(k)}</span>`).join('')}</span>
      <span class="meter"><i style="width:${(st / max) * 100}%"></i></span>
      <span class="meta"><span>${unlocked ? `★ ${st} / ${max}` : `需要：${c.need.map((n) => CH[n].name).join('、')}`}</span><span>${unlocked ? (done ? '再玩' : '开始') : '未解锁'}</span></span>`;
    b.addEventListener('click', () => {
      if (!unlocked) { toast(`先通关：${c.need.filter((n) => !chDone(n)).map((n) => CH[n].name).join('、')}`); return; }
      startRun('chapter', c.id);
    });
    tree.appendChild(b);
  }));
  $('#map-sum').textContent = `★ ${totalStars()} / ${ALL.length * 3} · 通关 ${doneChapters().length} / ${CHAPTERS.length}`;
  requestAnimationFrame(drawEdges);
}
function drawEdges() {
  const tree = $('#tree'), svg = $('#tree-svg');
  if (!svg) return;
  const base = tree.getBoundingClientRect();
  const pos = {};
  for (const n of tree.querySelectorAll('.node')) {
    const r = n.getBoundingClientRect();
    pos[n.dataset.id] = { x: r.left - base.left + r.width / 2, top: r.top - base.top, bot: r.bottom - base.top };
  }
  let html = '';
  for (const c of CHAPTERS) for (const n of c.need) {
    const a = pos[n], b = pos[c.id];
    if (!a || !b) continue;
    const my = (a.bot + b.top) / 2;
    const col = chDone(n) ? 'var(--mint)' : 'var(--line)';
    html += `<path d="M${a.x} ${a.bot} C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.top}" stroke="${col}" stroke-width="3" fill="none" stroke-dasharray="${chDone(n) ? '0' : '6 6'}"/>`;
  }
  svg.innerHTML = html;
}
addEventListener('resize', () => { if (screen === 'map') drawEdges(); });

// ------------------------------------------------------------ a run
let run = null;
let P = null;

function startRun(kind, chId) {
  let list;
  if (kind === 'mix') {
    const pool = ALL.filter((p) => chDone(p.ch));
    list = pool.sort(() => Math.random() - 0.5).slice(0, 8);
  } else list = ALL.filter((p) => p.ch === chId);
  run = { kind, chId, list, i: 0, L: 0, combo: 0, stage: 0, results: [], t0: 0, unlockedBefore: CHAPTERS.filter((c) => chUnlocked(c.id)).map((c) => c.id) };
  sound.init();
  showIntro();
}

function showIntro() {
  const ov = $('#overlay');
  const c = run.kind === 'chapter' ? CH[run.chId] : null;
  const num = c ? `第 ${CHAPTERS.indexOf(c) + 1} 章 · ${c.puzzles.length} 关` : `混合挑战 · ${run.list.length} 关`;
  ov.innerHTML = `<div class="card" role="dialog" aria-modal="true">
    <div class="num">${num}</div>
    <h2>${esc(c ? c.name : '混合挑战')}</h2>
    <p>${esc(c ? c.intro : '从你通关过的章节里随机抽题，检验一下肌肉记忆。')}</p>
    ${c ? `<div class="ks">${c.keys.map((k) => `<span class="k">${esc(k)}</span>`).join('')}</div>` : ''}
    <div class="foot">所有按键都会直接送进编辑器（Esc 就是 Vim 的 Esc）。<kbd>Alt+R</kbd> 重来，<kbd>Alt+H</kbd> 提示。请切到英文输入法。</div>
    <div class="cta" style="margin-top:4px"><button class="btn primary" id="b-go">开始 ↵</button><button class="btn" id="b-back">返回</button></div>
  </div>`;
  ov.hidden = false;
  $('#b-go').focus();
  $('#b-go').onclick = () => { ov.hidden = true; beginRun(); };
  $('#b-back').onclick = () => { ov.hidden = true; run = null; show('map'); };
}

function beginRun() {
  show('play');
  run.t0 = performance.now();
  sound.init(); sound.setStage(0); sound.start();
  fx.setStage(0);
  loadPuzzle();
}

function loadPuzzle() {
  const p = run.list[run.i];
  const info = prep(p);
  P = { p, info, vim: new Vim(info.text, info.cur.r, info.cur.c), keys: 0, hint: false, locked: false, trail: [], t0: performance.now() };
  $('#p-hint').hidden = true;
  $('#solve').hidden = true;
  $('#b-hint').classList.remove('glow');
  renderTask();
  renderPlay();
  focusKbd();
}

function renderTask() {
  const { p, info } = P;
  const c = CH[p.ch];
  $('#hud-where').innerHTML = `<small>${run.kind === 'mix' ? `混合挑战 · ${esc(c.name)}` : `第 ${CHAPTERS.indexOf(c) + 1} 章`}</small>${esc(run.kind === 'mix' ? '混合挑战' : c.name)}`;
  $('#p-title').textContent = p.t;
  $('#p-goal').innerHTML = info.want != null
    ? '把左边的文本改成右边<b>目标</b>的样子，最后回到普通模式。'
    : '把光标移到闪烁的<b>金色格子</b>上。';
  $('#p-keys').innerHTML = `本章按键 ${c.keys.map((k) => `<span class="k">${esc(k)}</span>`).join('')}`;
}

function renderPlay() {
  const { vim, info } = P;
  const play = $('#s-play');
  play.style.setProperty('--mode', MODE_COLOR[vim.mode]);
  playMascot.style.setProperty('--mode', MODE_COLOR[vim.mode]);
  const wantLines = info.want != null ? info.want.split('\n') : null;
  $('#ed').innerHTML = bufHTML(vim.lines, { vim, tgt: info.tgt, want: wantLines });

  const gc = $('#goalcard');
  if (wantLines) gc.innerHTML = `<h3>目标</h3><div class="editor">${bufHTML(wantLines, { okAgainst: vim.lines })}</div>`;
  else gc.innerHTML = `<h3>目标</h3><div class="where">第 <b>${info.tgt.r + 1}</b> 行，第 <b>${info.tgt.c + 1}</b> 列<br>现在：第 ${vim.r + 1} 行，第 ${vim.c + 1} 列</div>`;

  let msg = '', mcls = 'msg';
  if (vim.mode === 'cmd') { msg = vim.cmd.type + vim.cmd.text; mcls += ' cmdl'; }
  else if (vim.msg) msg = vim.msg;
  else if (wantLines && vim.mode === 'insert' && vim.text === info.want) { msg = '文本对了！按 Esc 收工'; mcls += ' good'; }
  const over = P.keys > info.par;
  $('#status').innerHTML = `<span class="modepill">${MODE_NAME[vim.mode]}</span><span class="${mcls}">${esc(msg)}</span><span class="pend">${esc(vim.showcmd)}</span><span class="cnt">按键 <b class="${over ? 'over' : ''}">${P.keys}</b> · 参考 ${info.par}</span>`;
  $('#trail').innerHTML = P.trail.slice(-24).map(keyChip).join('');
  playMascot.classList.toggle('worried', P.keys > info.par * 2 + 2);
  if (P.keys >= info.par * 2 + 3 && !P.hint) $('#b-hint').classList.add('glow');
  renderHud();
}

function renderHud() {
  $('#hud-dots').innerHTML = run.list.map((_, i) => {
    const r = run.results[i];
    return `<i class="${r ? `s${r.stars}` : i === run.i ? 'now' : ''}"></i>`;
  }).join('');
  $('#hud-dopa').textContent = fmtDopa(run.shownL ?? run.L);
  $('#hud-hype').innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < run.stage ? 'on' : ''}"></i>`).join('');
  $('#hud-combo').textContent = run.combo >= 2 ? `连击 ×${run.combo}` : '';
  $('#b-mute').textContent = save.sound ? '♪ 开' : '♪ 关';
}

function feed(k) {
  if (screen !== 'play' || !P || P.locked || !$('#overlay').hidden) return;
  P.vim.feed(k);
  P.keys++;
  P.trail.push(k);
  sound.key(P.keys - 1);
  renderPlay();
  if (solved(P.vim, P.info)) onSolve();
}

function judge(keys, par, hint) {
  let s = keys <= par ? 3 : keys <= par + Math.max(2, Math.ceil(par * 0.5)) ? 2 : 1;
  if (hint) s = Math.min(s, 2);
  const kind = keys < par && !hint ? 'beat' : s === 3 ? 'par' : 'ok';
  return { stars: s, kind };
}

function onSolve() {
  P.locked = true;
  const { p, info } = P;
  const { stars: st, kind } = judge(P.keys, info.par, P.hint);
  run.combo = st === 3 ? run.combo + 1 : 0;
  const N = run.list.length, q = run.i;
  const B = (f) => 4.3 * f ** 1.15;
  let inc = Math.max(0.03, B((q + 1) / N) - B(q / N));
  inc *= (1 + Math.min(0.6, run.combo / 6)) * [0, 0.6, 0.8, 1][st] * (kind === 'beat' ? 1.25 : 1);
  const prevL = run.L;
  run.L = Math.min(9, run.L + inc);
  run.results[run.i] = { id: p.id, t: p.t, stars: st, keys: P.keys, par: info.par, kind };

  const rec = save.puz[p.id];
  if (!rec || st > rec.s || (st === rec.s && P.keys < rec.k)) save.puz[p.id] = { s: Math.max(st, rec?.s || 0), k: Math.min(P.keys, rec?.k ?? Infinity) };
  persist();

  const newStage = stageOf(run.L);
  if (newStage > run.stage) { run.stage = newStage; sound.setStage(newStage); fx.setStage(newStage); }
  sound.solve(kind);
  const ed = $('#ed'), r = ed.getBoundingClientRect();
  fx.burst(r.left + r.width / 2, r.top + r.height / 2, kind === 'beat' ? 140 : st === 3 ? 90 : 45, kind === 'beat' ? 1.3 : 1);
  poke(playMascot, kind === 'beat' ? 'spin' : 'jump');
  if (save.motion === 2) { ed.classList.remove('shake'); void ed.offsetWidth; ed.classList.add('shake'); }

  for (const m of [2, 3, 4, 5, 6, 7, 8]) if (prevL < m && run.L >= m) { toast(`多巴值突破 ${fmtDopa(m)}！`, 'ms'); setTimeout(() => sound.milestone(), 350); }
  if (run.combo >= 3 && st === 3) $('#hud-combo').classList.add('big');
  animateDopa(prevL, run.L);
  floaty(`+${fmtDopa(run.L - prevL > 0 ? Math.log10(10 ** run.L - 10 ** prevL) : 0)}`, $('#hud-dopa'));

  const jd = kind === 'beat' ? '超越参考解！' : st === 3 ? '完美！' : st === 2 ? '漂亮' : '过关';
  const extra = kind === 'beat' ? `你用了 ${P.keys} 键，参考解要 ${info.par} 键` : `参考解：${info.keys.map((k) => KEYLABEL[k] ?? k).join(' ')}`;
  $('#solve').innerHTML = `<div class="card"><div class="jd ${kind === 'beat' ? 'beat' : ''}">${jd}</div><div class="st">${stars(st)}</div><div class="tip">${esc(extra)}</div><div class="tip">${esc(p.tip)}</div></div>`;
  $('#solve').hidden = false;
  renderPlay();
  setTimeout(next, kind === 'ok' ? 2300 : 1900);
}

function animateDopa(from, to) {
  const t0 = performance.now(), el = $('#hud-dopa');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    run.shownL = from + (to - from) * (1 - (1 - k) ** 3);
    el.textContent = fmtDopa(run.shownL);
    if (k < 1) requestAnimationFrame(step); else run.shownL = null;
  };
  requestAnimationFrame(step);
}

function next() {
  if (!run || screen !== 'play') return;
  $('#hud-combo').classList.remove('big');
  run.i++;
  if (run.i >= run.list.length) finishRun();
  else loadPuzzle();
}

function retry() {
  if (!P || P.locked) return;
  const hint = P.hint;
  loadPuzzle();
  P.hint = hint;
  if (hint) showHint();
  sound.ui();
}

function showHint() {
  if (!P) return;
  P.hint = true;
  $('#b-hint').classList.remove('glow');
  const box = $('#p-hint');
  box.innerHTML = `<div class="seq">参考解 ${P.info.keys.map(keyChip).join('')}</div><div class="muted">${esc(P.p.tip)}（看过提示最多 2 星，重玩可以拿回 3 星）</div>`;
  box.hidden = false;
}

function skip() {
  if (!P || P.locked) return;
  P.locked = true;
  run.combo = 0;
  run.results[run.i] = { id: P.p.id, t: P.p.t, stars: 0, keys: P.keys, par: P.info.par, kind: 'skip' };
  next();
}

function finishRun() {
  sound.stop();
  const d = today();
  if (!save.days.includes(d)) save.days.push(d);
  save.days = save.days.slice(-400);
  save.runs++;
  const newBest = run.L > save.bestL;
  save.bestL = Math.max(save.bestL, run.L);
  persist();
  const got = run.results.reduce((s, r) => s + r.stars, 0);
  const keys = run.results.reduce((s, r) => s + (r.kind === 'skip' ? 0 : r.keys), 0);
  const par = run.results.reduce((s, r) => s + (r.kind === 'skip' ? 0 : r.par), 0);
  const secs = Math.round((performance.now() - run.t0) / 1000);
  const c = run.kind === 'chapter' ? CH[run.chId] : null;
  const fresh = CHAPTERS.filter((x) => chUnlocked(x.id) && !run.unlockedBefore.includes(x.id));
  const skipped = run.results.filter((r) => r.kind === 'skip').length;
  const head = skipped ? `完成！还有 ${skipped} 关跳过了` : c ? `${c.name} 通关！` : '混合挑战完成！';
  const nx = nextChapter();
  const el = $('#s-result');
  el.innerHTML = `<div class="resultcard">
    <div class="muted">${c ? `第 ${CHAPTERS.indexOf(c) + 1} 章` : '混合挑战'}</div>
    <div class="big">${esc(head)}</div>
    <div class="nums">
      <div><b>${got} / ${run.list.length * 3}</b><span>星星</span></div>
      <div><b>${fmtDopa(run.L)}</b><span>${newBest ? '多巴值 · 新纪录！' : '多巴值'}</span></div>
      <div><b>${keys} / ${par}</b><span>按键 / 参考</span></div>
      <div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>用时</span></div>
      <div><b>${streak()}</b><span>天连续</span></div>
    </div>
    ${fresh.length ? `<div class="unlock">新章节解锁：${fresh.map((x) => `<b>${esc(x.name)}</b>`).join('、')}</div>` : ''}
    <div class="rlist">${run.results.map((r, i) => `<span class="muted">${i + 1}</span><span>${esc(r.t)}</span><span class="s">${r.kind === 'skip' ? '<span class="muted">跳过</span>' : stars(r.stars)}</span><span class="kk ${r.kind === 'beat' ? 'beat' : ''}">${r.kind === 'skip' ? '' : `${r.keys} / ${r.par} 键`}</span>`).join('')}</div>
    <div class="cta">
      ${nx && nx.id !== run.chId ? `<button class="btn primary" id="r-next">下一章：${esc(nx.name)} ↵</button>` : ''}
      <button class="btn ${nx && nx.id !== run.chId ? '' : 'primary'}" id="r-again">再玩一次</button>
      <button class="btn" id="r-map">关卡地图</button>
    </div>
  </div>`;
  const kind = run.kind, chId = run.chId;
  run = null; P = null;
  show('result');
  fx.setStage(3);
  const rect = el.getBoundingClientRect();
  fx.burst(rect.left + rect.width / 2, rect.top + 80, 160, 1.4);
  poke(playMascot, 'spin');
  $('#r-next')?.addEventListener('click', () => startRun('chapter', nx.id));
  $('#r-again').addEventListener('click', () => startRun(kind, chId));
  $('#r-map').addEventListener('click', () => show('map'));
  ($('#r-next') || $('#r-again')).focus();
}

// ------------------------------------------------------------ input
function mapKey(e) {
  if (e.metaKey) return null;
  if (e.ctrlKey) {
    if (e.key === 'r' || e.key === 'R') return '<C-r>';
    if (e.key === '[' || e.key === 'c') return '<Esc>';
    return null;
  }
  if (e.altKey) return null;
  switch (e.key) {
    case 'Escape': return '<Esc>';
    case 'Enter': return '<CR>';
    case 'Backspace': return '<BS>';
    case 'Tab': return '<Tab>';
    default: return e.key.length === 1 ? e.key : null;
  }
}

let imeWarned = 0;
document.addEventListener('keydown', (e) => {
  if (!$('#overlay').hidden) {
    if (e.key === 'Enter' && document.activeElement?.id !== 'b-back') { e.preventDefault(); $('#b-go')?.click(); }
    if (e.key === 'Escape') $('#b-back')?.click();
    return;
  }
  if (screen === 'play') {
    if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
      if (Date.now() - imeWarned > 4000) { toast('检测到中文输入法，请切换到英文输入'); imeWarned = Date.now(); }
      return;
    }
    if (e.altKey && e.code === 'KeyR') { e.preventDefault(); retry(); return; }
    if (e.altKey && e.code === 'KeyH') { e.preventDefault(); showHint(); return; }
    if (e.key.startsWith('Arrow')) { e.preventDefault(); toast('方向键在这里不算数，试试 h j k l'); return; }
    const k = mapKey(e);
    if (k) { e.preventDefault(); feed(k); }
    return;
  }
  if (e.key === 'Escape' && screen !== 'title') show('title');
});

// Phones: a hidden input brings up the keyboard; keydown reports "Unidentified" there, so read input events.
const kbd = $('#kbd');
kbd.addEventListener('input', () => { for (const ch of kbd.value) feed(ch); kbd.value = ''; });
function focusKbd() { if (matchMedia('(pointer: coarse)').matches) kbd.focus({ preventScroll: true }); }
for (const b of document.querySelectorAll('#mobilebar [data-k]')) {
  b.addEventListener('click', () => { if (b.dataset.k === 'kbd') kbd.focus({ preventScroll: true }); else { feed(b.dataset.k); focusKbd(); } });
}
$('#ed').addEventListener('click', focusKbd);

// ------------------------------------------------------------ buttons
$('#b-continue').addEventListener('click', () => { const nx = nextChapter(); nx ? startRun('chapter', nx.id) : startRun('mix'); });
$('#b-map').addEventListener('click', () => show('map'));
$('#b-mix').addEventListener('click', () => startRun('mix'));
$('#b-map-back').addEventListener('click', () => show('title'));
$('#b-quit').addEventListener('click', (e) => { e.currentTarget.blur(); run = null; P = null; show('map'); });
$('#b-retry').addEventListener('click', (e) => { e.currentTarget.blur(); retry(); });
$('#b-hint').addEventListener('click', (e) => { e.currentTarget.blur(); showHint(); });
$('#b-skip').addEventListener('click', (e) => { e.currentTarget.blur(); skip(); });
const toggleSound = () => { save.sound = !save.sound; sound.setMuted(!save.sound); persist(); renderTitle(); if (run) renderHud(); };
$('#b-sound').addEventListener('click', () => { sound.init(); toggleSound(); sound.ui(); });
$('#b-mute').addEventListener('click', (e) => { e.currentTarget.blur(); toggleSound(); });
$('#b-motion').addEventListener('click', () => { save.motion = (save.motion + 2) % 3; fx.motion = save.motion; persist(); renderTitle(); });
let resetArmed = 0;
$('#b-reset').addEventListener('click', (e) => {
  if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); e.currentTarget.textContent = '再点一次确认清除'; setTimeout(() => renderResetLabel(), 4000); return; }
  const keep = { sound: save.sound, motion: save.motion };
  save = { ...defaults(), ...keep }; persist(); resetArmed = 0; renderResetLabel(); renderTitle(); toast('记录已清除');
});
const renderResetLabel = () => { $('#b-reset').textContent = '清除记录'; };
renderResetLabel();
document.addEventListener('visibilitychange', () => { if (!sound.ctx) return; document.hidden ? sound.ctx.suspend() : sound.ctx.resume(); });

show('title');
demoTick();
