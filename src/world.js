// Zustand auf der Anzeige-Seite: Entitäten mit weicher Bewegung, Kamera, Effekte.
import { viewWidth, ITEMS } from './config.js';

export class World {
  constructor() { this.reset(); }

  reset() {
    this.me = 0; this.opts = null; this.w = 6000; this.h = 6000;
    this.players = new Map();
    this.dots = null;
    this.ents = new Map();
    this.cells = []; this.pellets = []; this.holes = []; this.items = [];
    this.ball = null; this.zone = null; this.worms = []; this.flags = [];
    this.info = null;
    this.alive = false; this.item = 0; this.mergeSecs = 0;
    this.cam = { x: 3000, y: 3000, viewW: 1500, init: false };
    this.lastSnap = 0; this.interval = 40; this.stamp = 0;
    this.particles = []; this.rings = []; this.texts = []; this.ghosts = []; this.sucks = [];
    this.emotes = new Map();
    this.myMass = 0; this.myCells = 0; this.myX = 0; this.myY = 0;
    this.shake = 0;
  }

  setPlayers(table) {
    const seen = new Set();
    for (const [pid, name, skin, hue, team, bot] of table) { this.players.set(pid, { pid, name, skin, hue, team, bot: !!bot }); seen.add(pid); }
    for (const pid of [...this.players.keys()]) if (!seen.has(pid)) this.players.delete(pid);
  }

  applySnapshot(s, now) {
    if (this.lastSnap) { const d = now - this.lastSnap; if (d > 5 && d < 400) this.interval += (d - this.interval) * 0.1; }
    this.lastSnap = now;
    const stamp = ++this.stamp, ents = this.ents;
    const dur = Math.max(45, Math.min(160, this.interval * 1.35));
    const cam = this.cam, half = cam.viewW * 0.75;

    // Sternenstaub
    if (this.dots) for (const [id, x, y] of s.dots) {
      if (id >= this.dots.n) continue;
      const ox = this.dots.x[id], oy = this.dots.y[id];
      this.dots.x[id] = x; this.dots.y[id] = y;
      if (Math.abs(ox - cam.x) < half && Math.abs(oy - cam.y) < half && this.sucks.length < 120) {
        // zum Fresser fliegen lassen
        let best = null, bd = 1e9;
        for (const c of this.cells) { const d = Math.hypot(c.x - ox, c.y - oy) - c.r; if (d < bd) { bd = d; best = c; } }
        if (best && bd < 260) this.sucks.push({ x: ox, y: oy, to: best, t0: now, dur: 130 + Math.max(0, bd) * 0.7, id });
      }
    }

    const upd = (kind, list, src) => {
      list.length = 0;
      for (const e of src) {
        let n = ents.get(e.id);
        if (!n || n.kind !== kind) {
          n = { id: e.id, kind, x: e.x, y: e.y, r: e.r || 0, sx: e.x, sy: e.y, sr: e.r || 0, born: now, seed: Math.random() * 1000 };
          if (kind === 'c') { n.r = n.sr = (e.r || 10) * 0.6; }
          ents.set(e.id, n);
        } else if (Math.abs(e.x - n.x) + Math.abs(e.y - n.y) > 700) { n.x = n.sx = e.x; n.y = n.sy = e.y; n.sr = n.r; }
        else { n.sx = n.x; n.sy = n.y; n.sr = n.r; }
        n.tx = e.x; n.ty = e.y; n.tr = e.r || 0; n.t0 = now; n.dur = dur; n.stamp = stamp;
        if (kind === 'c') { n.pid = e.pid; n.f = e.f; } else if (kind === 'p') n.hue = e.hue; else if (kind === 'i') n.type = e.type;
        list.push(n);
      }
    };
    upd('c', this.cells, s.cells);
    upd('p', this.pellets, s.pellets);
    upd('h', this.holes, s.holes);
    upd('i', this.items, s.items);

    for (const [id, n] of ents) {
      if (n.stamp === stamp) continue;
      ents.delete(id);
      if (Math.abs(n.x - cam.x) > half || Math.abs(n.y - cam.y) > half) continue;
      if (n.kind === 'c') {
        // gefressen: in den Fresser hineinziehen
        let eater = null, bd = 1e9;
        for (const c of this.cells) { if (c.tr <= n.r) continue; const d = Math.hypot(c.tx - n.x, c.ty - n.y) - c.tr; if (d < bd) { bd = d; eater = c; } }
        this.ghosts.push({ n, to: bd < 40 ? eater : null, t0: now, dur: 180 });
      } else if (n.kind === 'h') {
        this.ring(n.x, n.y, n.r, n.r * 4, 280, 500);
        this.burst(n.x, n.y, 26, 280, 420, 5);
      }
    }

    if (s.ball) {
      if (!this.ball) this.ball = { x: s.ball.x, y: s.ball.y, r: s.ball.r, sx: s.ball.x, sy: s.ball.y, rot: 0 };
      const b = this.ball; b.sx = b.x; b.sy = b.y; b.tx = s.ball.x; b.ty = s.ball.y; b.r = s.ball.r; b.t0 = now; b.dur = dur;
      if (Math.hypot(b.tx - b.sx, b.ty - b.sy) > 600) { b.x = b.sx = b.tx; b.y = b.sy = b.ty; }
    } else this.ball = null;
    this.zone = s.zone || null;
    if (s.flags) {
      if (this.flags.length !== 2) this.flags = s.flags.map((f, i) => ({ team: i, x: f.x, y: f.y }));
      s.flags.forEach((f, i) => { const g = this.flags[i]; g.tx = f.x; g.ty = f.y; g.home = f.home; g.carrier = f.carrier; });
    } else if (this.flags.length) this.flags = [];
    this.alive = s.alive; this.item = s.item; this.mergeSecs = s.mergeSecs;
    this.snapCx = s.cx; this.snapCy = s.cy; this.snapViewW = s.viewW;
    if (!cam.init) { cam.x = s.cx; cam.y = s.cy; cam.viewW = s.viewW; cam.init = true; }
  }

  // Jeden Frame: Positionen interpolieren, Kamera nachführen, Effekte altern
  update(now, dt) {
    const lerp = (n) => {
      let a = (now - n.t0) / n.dur; if (a > 1) a = 1; else if (a < 0) a = 0;
      n.x = n.sx + (n.tx - n.sx) * a; n.y = n.sy + (n.ty - n.sy) * a; n.r = n.sr + (n.tr - n.sr) * a;
    };
    for (const n of this.cells) lerp(n);
    for (const n of this.pellets) lerp(n);
    for (const n of this.holes) lerp(n);
    for (const n of this.items) lerp(n);
    if (this.ball) {
      const b = this.ball; let a = (now - b.t0) / b.dur; if (a > 1) a = 1;
      const ox = b.x; b.x = b.sx + (b.tx - b.sx) * a; b.y = b.sy + (b.ty - b.sy) * a; b.rot += (b.x - ox) / b.r;
    }
    let sx = 0, sy = 0, sm = 0, sr = 0, n = 0;
    for (const c of this.cells) if (c.pid === this.me) { const m = c.r * c.r; sx += c.x * m; sy += c.y * m; sm += m; sr += c.r; n++; }
    const cam = this.cam;
    let tx, ty, tv;
    if (n) {
      tx = sx / sm; ty = sy / sm; this.myMass = sm / 25; this.myCells = n; this.myX = tx; this.myY = ty;
      let spread = 0;
      for (const c of this.cells) if (c.pid === this.me) { const d = Math.hypot(c.x - tx, c.y - ty) + c.r; if (d > spread) spread = d; }
      tv = Math.max(viewWidth(sr), spread * 2.6);
    } else { tx = this.snapCx ?? cam.x; ty = this.snapCy ?? cam.y; tv = this.snapViewW || 1700; this.myCells = 0; }
    if (Math.abs(tx - cam.x) + Math.abs(ty - cam.y) > 1600 && n) { cam.x = tx; cam.y = ty; }
    for (const f of this.flags) { const kf = Math.abs(f.tx - f.x) + Math.abs(f.ty - f.y) > 700 ? 1 : 1 - Math.exp(-dt * 14); f.x += (f.tx - f.x) * kf; f.y += (f.ty - f.y) * kf; }
    // Schweif hinter schnellen Zellen
    if (this.particles.length < 260) for (const c of this.cells) {
      const v = (Math.abs(c.tx - c.sx) + Math.abs(c.ty - c.sy)) / c.dur * 1000;
      if (v > 800 && Math.random() < 0.5) {
        const pl = this.players.get(c.pid), a = Math.random() * 6.283, rr = c.r * 0.7 * Math.random();
        this.particles.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, vx: 0, vy: 0, life: 380, max: 380, hue: pl ? pl.hue : 200, size: Math.max(4, c.r * 0.22) });
      }
    }
    const k = 1 - Math.exp(-dt * (n ? 9 : 4)), kz = 1 - Math.exp(-dt * 2.2);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.viewW += (tv - cam.viewW) * kz;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);

    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life -= dt * 1000;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2.5; p.vy *= 1 - dt * 2.5;
    }
    const filt = (arr, f) => { for (let i = arr.length - 1; i >= 0; i--) if (!f(arr[i])) { arr[i] = arr[arr.length - 1]; arr.pop(); } };
    filt(this.rings, (r) => now - r.t0 < r.dur);
    filt(this.texts, (r) => now - r.t0 < r.dur);
    filt(this.ghosts, (r) => now - r.t0 < r.dur);
    filt(this.sucks, (r) => now - r.t0 < r.dur);
    for (const [pid, e] of this.emotes) if (now - e.t0 > 2600) this.emotes.delete(pid);
  }

  burst(x, y, count, hue, speed, size) {
    if (this.particles.length > 400) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, v = speed * (0.3 + Math.random() * 0.9), life = 350 + Math.random() * 450;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, hue: hue + (Math.random() - 0.5) * 40, size: size * (0.5 + Math.random()) });
    }
  }
  ring(x, y, r0, r1, hue, dur) { this.rings.push({ x, y, r0, r1, hue, t0: performance.now(), dur }); }
  text(x, y, str, hue, size = 26) { if (this.texts.length < 20) this.texts.push({ x, y, str, hue, size, t0: performance.now(), dur: 1100 }); }

  itemFx(e) {
    const hue = ITEMS[e.type] ? ITEMS[e.type].hue : 0;
    const big = e.type === 8 || e.type === 5;
    this.ring(e.x, e.y, e.r || 40, big ? 760 + (e.r || 0) : (e.r || 40) + 180, hue, big ? 600 : 450);
    this.burst(e.x, e.y, big ? 40 : 16, hue, big ? 700 : 300, 5);
    if (e.type === 8) this.shake = Math.max(this.shake, 10);
  }

  playerName(pid) { const p = this.players.get(pid); return p ? p.name : '???'; }
}
