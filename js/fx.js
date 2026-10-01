// Background canvas: drifting Vim commands, beat rings, light rays and confetti.
// Everything scales with the stage (0-6) and the motion setting (0-2).
const GLYPHS = ['hjkl', 'dd', 'ciw', ':wq', '.', 'w', 'yy', '%', 'gg', 'u', '>>', 'x', 'p', '*', '/', 'di(', 'A;', 'gU', 'ZZ', 'v', 'G', '$', '^', 'cc'];
const COLORS = ['#ff5fa2', '#ffd447', '#46e6c3', '#6aa8ff', '#b07cff', '#ff9b5f'];

export class FX {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.stage = 0; this.motion = 2; this.floaters = []; this.bits = []; this.rings = [];
    this.flash = 0; this.t = 0; this.rot = 0;
    this.resize(); addEventListener('resize', () => this.resize());
    const loop = (ts) => { this.frame(ts); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  get scale() { return [0, 0.45, 1][this.motion] ?? 1; }
  setStage(s) { this.stage = s; }

  spawnFloater(y) {
    const s = this.stage;
    return {
      x: Math.random() * this.w, y: y ?? this.h + 20,
      v: 12 + Math.random() * 18 + s * 9, txt: GLYPHS[(Math.random() * GLYPHS.length) | 0],
      size: 12 + Math.random() * 14 + s * 2, a: 0.06 + Math.random() * 0.1 + s * 0.025,
      col: COLORS[(Math.random() * COLORS.length) | 0], wob: Math.random() * 6.28,
    };
  }

  burst(x, y, n = 60, power = 1) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (180 + Math.random() * 420) * power;
      this.bits.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260 * power, life: 1.2 + Math.random() * 0.9,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
        col: COLORS[(Math.random() * COLORS.length) | 0], sq: Math.random() < 0.25,
      });
    }
  }

  beat(i) {
    if (this.stage < 2 || !this.scale) return;
    this.rings.push({ r: 20, a: 0.25 + this.stage * 0.04, col: COLORS[(i + this.stage) % COLORS.length] });
    if (this.stage >= 5 && i === 0) this.flash = 0.12 * this.scale;
  }

  frame(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000); this.last = ts;
    this.t += dt;
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    const s = this.stage, k = this.scale;

    if (s >= 3 && k) {
      this.rot += dt * (0.05 + s * 0.03);
      g.save(); g.translate(w / 2, h * 0.42); g.rotate(this.rot);
      const rays = 12, alpha = 0.025 + (s - 3) * 0.018;
      for (let i = 0; i < rays; i++) {
        g.rotate((Math.PI * 2) / rays);
        g.fillStyle = i % 2 ? `rgba(255,95,162,${alpha})` : `rgba(106,168,255,${alpha})`;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, Math.max(w, h)); g.lineTo(60, Math.max(w, h)); g.closePath(); g.fill();
      }
      g.restore();
    }

    const want = Math.round((6 + s * 9) * (k || 0.2));
    while (this.floaters.length < want) this.floaters.push(this.spawnFloater(Math.random() * h));
    if (this.floaters.length > want) this.floaters.length = want;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const f of this.floaters) {
      f.y -= f.v * dt * (k ? 1 : 0.3); f.wob += dt;
      if (f.y < -30) Object.assign(f, this.spawnFloater());
      g.globalAlpha = Math.min(0.5, f.a);
      g.fillStyle = s >= 6 ? `hsl(${(this.t * 80 + f.x) % 360} 90% 70%)` : f.col;
      g.font = `600 ${f.size}px "JetBrains Mono", ui-monospace, monospace`;
      g.fillText(f.txt, f.x + Math.sin(f.wob) * 8, f.y);
    }
    g.globalAlpha = 1;

    for (const r of this.rings) {
      r.r += dt * (500 + s * 80); r.a -= dt * 0.5;
      if (r.a <= 0) continue;
      g.strokeStyle = r.col; g.globalAlpha = r.a; g.lineWidth = 2 + s * 0.4;
      g.beginPath(); g.arc(w / 2, h * 0.42, r.r, 0, Math.PI * 2); g.stroke();
    }
    this.rings = this.rings.filter((r) => r.a > 0);
    g.globalAlpha = 1;

    for (const b of this.bits) {
      b.vy += 900 * dt; b.vx *= 0.985; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt; b.life -= dt;
      g.save(); g.globalAlpha = Math.max(0, Math.min(1, b.life)); g.translate(b.x, b.y); g.rotate(b.rot);
      g.fillStyle = b.col;
      if (b.sq) g.fillRect(-b.w / 2, -b.w / 2, b.w, b.w); else g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 2)) + 1);
      g.restore();
    }
    this.bits = this.bits.filter((b) => b.life > 0 && b.y < h + 40);

    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${this.flash})`; g.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 0.8);
    }
  }
}
