// Host-autoritative Spielsimulation. Läuft ohne DOM (auch in Node für Tests).
import {
  DT, MAPS, SOCCER_MAP, GOAL_HALF, CTF_MAP, CTF_BASE, CTF_WIN, DEFAULT_OPTS, START_MASS, MIN_SPLIT_MASS, MIN_EJECT_MASS, EJECT_COST,
  EJECT_MASS, MAX_CELL_MASS, EAT_RATIO, MAX_PLAYERS, massToRadius, radiusToMass, baseSpeed, viewWidth,
  TEAM_COLORS, ITEMS, BOT_NAMES,
} from './config.js';
import { botThink } from './bots.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOOST_K = 4.2;
const GRID = 128;
const MAX_PELLETS = 500;

export function normalizeOpts(o) {
  const opts = { ...DEFAULT_OPTS, ...(o || {}) };
  if (!MAPS[opts.map]) opts.map = 'mittel';
  if (!['ffa', 'teams', 'royale', 'soccer', 'ctf'].includes(opts.mode)) opts.mode = 'ffa';
  opts.bots = Math.max(0, Math.min(28, opts.bots | 0));
  opts.botLevel = Math.max(1, Math.min(3, opts.botLevel | 0));
  opts.maxCells = [8, 16, 32].includes(opts.maxCells) ? opts.maxCells : 16;
  opts.teams = Math.max(2, Math.min(4, opts.teams | 0));
  opts.roundTime = Math.max(0, Math.min(30, +opts.roundTime || 0));
  if (opts.mode === 'soccer' || opts.mode === 'ctf') { opts.teams = 2; if (!opts.roundTime) opts.roundTime = 5; }
  if (opts.mode === 'royale') opts.roundTime = 0;
  opts.mayhem = !!opts.mayhem; opts.items = !!opts.items;
  return opts;
}

export class Sim {
  constructor(opts, seed = (Date.now() & 0x7fffffff)) {
    this.opts = normalizeOpts(opts);
    const o = this.opts;
    const map = o.mode === 'soccer' ? SOCCER_MAP : o.mode === 'ctf' ? CTF_MAP : MAPS[o.map];
    this.w = map.w; this.h = map.h;
    this.rng = mulberry32(seed);
    this.tick = 0; this.time = 0;
    this.players = new Map();
    this.cells = []; this.pellets = []; this.holes = []; this.items = [];
    this.ball = null;
    this.used = new Set(); this.nextId = 1;
    this.events = []; this.dotEvents = [];
    this.teamGoals = [0, 0];
    this.teamScores = [0, 0, 0, 0];
    this.zone = null;
    this.results = null;
    this.botSeq = 0;
    this.flags = null;
    if (o.mode === 'ctf') {
      this.flags = [0, 1].map((team) => {
        const hx = team === 0 ? CTF_BASE : this.w - CTF_BASE, hy = this.h / 2;
        return { team, hx, hy, x: hx, y: hy, carrier: 0, home: true, dropAt: 0 };
      });
    }
    // Wurmlöcher: Paare, Index i gehört zu i ^ 1
    this.worms = [];
    const pairs = o.mode === 'soccer' || o.mode === 'ctf' ? 0 : Math.max(1, Math.round((2 * this.w * this.h) / 36e6));
    for (let i = 0; i < pairs * 2; i++) {
      let x = 0, y = 0;
      for (let t = 0; t < 30; t++) {
        x = this.rand(450, this.w - 450); y = this.rand(450, this.h - 450);
        if (!this.worms.some((q) => Math.hypot(q.x - x, q.y - y) < 1100)) break;
      }
      this.worms.push({ x, y });
    }

    // Sternenstaub
    const density = o.mode === 'soccer' ? 105 : o.map === 'gross' ? 100 : 90;
    this.nDots = Math.min(9000, Math.round((this.w * this.h) / (density * density)));
    this.dotX = new Float32Array(this.nDots); this.dotY = new Float32Array(this.nDots);
    this.gw = Math.ceil(this.w / GRID); this.gh = Math.ceil(this.h / GRID);
    this.grid = new Array(this.gw * this.gh);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    for (let i = 0; i < this.nDots; i++) this.placeDot(i, false);

    const area = (this.w * this.h) / 36e6;
    this.holeTarget = o.mode === 'soccer' ? 4 : Math.round(16 * area);
    this.itemTarget = !o.items ? 0 : Math.round((o.mayhem ? 45 : 16) * Math.max(area, 0.35));
    for (let i = 0; i < this.holeTarget; i++) this.spawnHole();
    for (let i = 0; i < this.itemTarget; i++) this.spawnItem();
    this.holeTimer = 0; this.itemTimer = 0;

    if (o.mode === 'soccer') {
      this.ball = { id: this.newId(), x: this.w / 2, y: this.h / 2, vx: 0, vy: 0, r: 95, last: 0, hold: 0 };
    }
    this.phase = o.mode === 'royale' ? 'warmup' : 'play';
    this.phaseEnd = o.mode === 'royale' ? 15 : 0;
    this.roundEnd = o.roundTime > 0 ? o.roundTime * 60 : 0;
    this.royaleStartCount = 0;
    for (let i = 0; i < o.bots; i++) this.addBot();
  }

  // ---------- Hilfen ----------
  newId() {
    let id = this.nextId;
    while (this.used.has(id) || id === 0) id = (id + 1) & 0xffff;
    this.nextId = (id + 1) & 0xffff;
    this.used.add(id);
    return id;
  }
  freeId(id) { this.used.delete(id); }
  rand(a, b) { return a + this.rng() * (b - a); }
  dotValue(i) { return (i % 23 === 0 ? 5 : 1) * (this.opts.mayhem ? 2 : 1); }

  placeDot(i, ev = true) {
    if (ev) {
      const old = this.grid[this.gidx(this.dotX[i], this.dotY[i])];
      const k = old.indexOf(i); if (k >= 0) { old[k] = old[old.length - 1]; old.pop(); }
    }
    const x = this.rand(20, this.w - 20), y = this.rand(20, this.h - 20);
    this.dotX[i] = x; this.dotY[i] = y;
    this.grid[this.gidx(x, y)].push(i);
    if (ev) this.dotEvents.push(i);
  }
  gidx(x, y) {
    const gx = Math.max(0, Math.min(this.gw - 1, (x / GRID) | 0));
    const gy = Math.max(0, Math.min(this.gh - 1, (y / GRID) | 0));
    return gy * this.gw + gx;
  }

  spawnHole() {
    for (let t = 0; t < 30; t++) {
      const r = this.rand(68, 96);
      const x = this.rand(250, this.w - 250), y = this.rand(250, this.h - 250);
      let ok = true;
      for (const c of this.cells) { const d = Math.hypot(c.x - x, c.y - y); if (d < c.r + r + 120) { ok = false; break; } }
      if (ok && this.ball && Math.hypot(this.ball.x - x, this.ball.y - y) < 500) ok = false;
      if (ok) for (const h of this.holes) if (Math.hypot(h.x - x, h.y - y) < 420) { ok = false; break; }
      if (ok) for (const q of this.worms) if (Math.hypot(q.x - x, q.y - y) < 320) { ok = false; break; }
      if (ok && this.flags) for (const f of this.flags) if (Math.hypot(f.hx - x, f.hy - y) < 600) { ok = false; break; }
      if (!ok) continue;
      this.holes.push({ id: this.newId(), x, y, vx: 0, vy: 0, r });
      return;
    }
  }
  spawnItem() {
    const type = 1 + ((this.rng() * (ITEMS.length - 1)) | 0);
    this.items.push({ id: this.newId(), x: this.rand(120, this.w - 120), y: this.rand(120, this.h - 120), type });
  }

  // ---------- Spieler ----------
  addPlayer(info = {}) {
    if (this.players.size >= MAX_PLAYERS) {
      // Platz machen: einen Bot entfernen
      let bot = null;
      for (const p of this.players.values()) if (p.bot) { bot = p; break; }
      if (!bot || info.bot) return 0;
      this.removePlayer(bot.pid);
    }
    let pid = 1;
    while (this.players.has(pid)) pid++;
    const o = this.opts;
    let team = 0;
    if (this.teamMode()) {
      const n = o.teams, cnt = new Array(n).fill(0);
      for (const p of this.players.values()) cnt[p.team]++;
      team = 0;
      for (let i = 1; i < n; i++) if (cnt[i] < cnt[team]) team = i;
    }
    const p = {
      pid, name: String(info.name || 'Blob').slice(0, 16), skin: info.skin | 0,
      hue: ((info.hue | 0) % 360 + 360) % 360, team, bot: info.bot || null,
      cells: [], ax: 0, ay: 0, dx: 1, dy: 0, ejectHeld: false, ejectCd: 0, splitQ: 0, item: 0,
      fx: { turbo: 0, shield: 0, magnet: 0, frozen: 0, ghost: 0, double: 0 }, hasFlag: false, prot: 0,
      alive: false, out: false, respawnAt: 0, wantSpawn: false,
      score: 0, best: 0, kills: 0, deaths: 0, goals: 0, place: 0,
      cx: this.w / 2, cy: this.h / 2, totalR: 60, spread: 0, viewW: 2400, lastKiller: 0, mergeSecs: 0,
    };
    if (this.teamMode()) p.hue = TEAM_COLORS[team].hue;
    this.players.set(pid, p);
    if (o.mode === 'royale' && this.phase === 'play') { p.out = true; } else this.spawn(p);
    this.events.push({ k: 'join', pid });
    return pid;
  }

  addBot() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    let name = BOT_NAMES[(this.rng() * BOT_NAMES.length) | 0];
    for (let i = 0; i < BOT_NAMES.length && taken.has(name); i++) name = BOT_NAMES[(this.botSeq + i) % BOT_NAMES.length];
    this.botSeq++;
    return this.addPlayer({
      name, skin: (this.rng() * 44) | 0, hue: (this.rng() * 360) | 0,
      bot: { level: this.opts.botLevel, next: this.rng() * 0.5, wx: 0, wy: 0, wt: 0, splitCd: 0, role: this.botSeq % 3 },
    });
  }

  removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    for (const c of p.cells) {
      // Zellen werden zu Futter
      c.dead = true; this.freeId(c.id);
      const n = Math.min(10, Math.floor(c.m / EJECT_MASS));
      for (let i = 0; i < n; i++) this.addPellet(c.x + this.rand(-c.r, c.r) * 0.6, c.y + this.rand(-c.r, c.r) * 0.6, 0, 0, p.hue, 0);
    }
    this.cells = this.cells.filter((c) => !c.dead);
    this.players.delete(pid);
    this.events.push({ k: 'leave', pid, name: p.name });
  }

  spawn(p) {
    const o = this.opts;
    let best = null, bestD = -1;
    for (let t = 0; t < 14; t++) {
      let x = this.rand(150, this.w - 150), y = this.rand(150, this.h - 150);
      if (o.mode === 'soccer' || o.mode === 'ctf') x = p.team === 0 ? this.rand(150, this.w * 0.42) : this.rand(this.w * 0.58, this.w - 150);
      if (this.zone) {
        const a = this.rng() * 6.283, d = Math.sqrt(this.rng()) * this.zone.r * 0.85;
        x = Math.max(60, Math.min(this.w - 60, this.zone.x + Math.cos(a) * d));
        y = Math.max(60, Math.min(this.h - 60, this.zone.y + Math.sin(a) * d));
      }
      let dmin = 1e9;
      for (const c of this.cells) { const d = Math.hypot(c.x - x, c.y - y) - c.r; if (d < dmin) dmin = d; }
      for (const h of this.holes) { const d = Math.hypot(h.x - x, h.y - y) - h.r - 80; if (d < dmin) dmin = d; }
      if (dmin > bestD) { bestD = dmin; best = { x, y }; }
      if (dmin > 700) break;
    }
    const m = START_MASS * (o.mayhem ? 2 : 1);
    const c = this.makeCell(p, best.x, best.y, m);
    c.mergeAt = 0;
    p.alive = true; p.out = false; p.prot = this.time + 3; p.item = 0; p.wantSpawn = false;
    p.fx.turbo = p.fx.shield = p.fx.magnet = p.fx.frozen = p.fx.ghost = p.fx.double = 0; p.hasFlag = false;
    p.cx = c.x; p.cy = c.y; p.totalR = c.r; p.spread = 0; p.score = m; p.best = m; p.lastKiller = 0;
    p.viewW = viewWidth(p.totalR);
    this.events.push({ k: 'spawn', to: p.pid });
  }

  makeCell(p, x, y, m) {
    const c = {
      id: this.newId(), pid: p.pid, p, x, y, m, r: massToRadius(m), vx: 0, vy: 0, mvx: 0, mvy: 0,
      mergeAt: 0, launch: 0, tpAt: 0, hidden: false, dead: false,
    };
    p.cells.push(c); this.cells.push(c);
    return c;
  }

  mergeTime(m) { return this.time + Math.min(45, (this.opts.mayhem ? 6 : 13) + m * 0.012); }

  addPellet(x, y, vx, vy, hue, pid) {
    if (this.pellets.length >= MAX_PELLETS) { const old = this.pellets.shift(); this.freeId(old.id); }
    const q = { id: this.newId(), x, y, vx, vy, hue, pid, born: this.time, dead: false };
    this.pellets.push(q);
    return q;
  }

  // ---------- Eingaben ----------
  setInput(pid, ax, ay, eject) {
    const p = this.players.get(pid); if (!p) return;
    if (!isFinite(ax) || !isFinite(ay)) return;
    const m = Math.hypot(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    p.ax = ax; p.ay = ay;
    if (m > 0.05) { p.dx = ax / m; p.dy = ay / m; }
    p.ejectHeld = !!eject;
  }
  split(pid) { const p = this.players.get(pid); if (p && p.alive && p.splitQ < 3) p.splitQ++; }
  requestSpawn(pid) { const p = this.players.get(pid); if (p && !p.alive) p.wantSpawn = true; }
  emote(pid, n) { if (this.players.has(pid)) this.events.push({ k: 'emote', pid, n: n | 0 }); }

  doSplit(p) {
    if (p.fx.frozen > this.time) return false;
    const list = p.cells.slice().sort((a, b) => b.m - a.m);
    let any = false;
    for (const c of list) {
      if (p.cells.length >= this.opts.maxCells) break;
      if (c.m < MIN_SPLIT_MASS) continue;
      const half = c.m / 2;
      c.m = half; c.r = massToRadius(half);
      const n = this.makeCell(p, c.x + p.dx * 4, c.y + p.dy * 4, half);
      const dist = 300 + n.r * 2.4;
      n.vx = p.dx * dist * BOOST_K; n.vy = p.dy * dist * BOOST_K;
      n.launch = this.time + 0.45;
      c.mergeAt = n.mergeAt = this.mergeTime(half * 2);
      any = true;
    }
    if (any) { p.prot = 0; this.events.push({ k: 'split', pid: p.pid, x: p.cx, y: p.cy }); }
    return any;
  }

  doEject(p) {
    let any = false;
    for (const c of p.cells) {
      if (c.m < MIN_EJECT_MASS) continue;
      c.m -= EJECT_COST; c.r = massToRadius(c.m);
      const a = Math.atan2(p.dy, p.dx) + this.rand(-0.12, 0.12);
      const ux = Math.cos(a), uy = Math.sin(a);
      this.addPellet(c.x + ux * (c.r + 6), c.y + uy * (c.r + 6), ux * 1500, uy * 1500, p.hue, p.pid);
      any = true;
    }
    if (any) p.prot = 0;
    return any;
  }

  useItem(pid) {
    const p = this.players.get(pid);
    if (!p || !p.alive || !p.item) return false;
    const type = p.item, t = this.time; p.item = 0;
    const enemy = (q) => q !== p && q.alive && !(this.teamMode() && q.team === p.team);
    switch (type) {
      case 9: for (const c of p.cells) { c.vx += p.dx * 2700; c.vy += p.dy * 2700; c.launch = t + 0.3; } break;
      case 10: p.fx.double = t + 12; break;
      case 1: p.fx.turbo = t + 6; break;
      case 2: p.fx.shield = t + 5; break;
      case 3: for (const c of p.cells) c.mergeAt = 0; break;
      case 4: p.fx.magnet = t + 8; break;
      case 5:
        for (const q of this.players.values()) {
          if (!enemy(q) || q.fx.shield > t) continue;
          for (const c of q.cells) if (Math.hypot(c.x - p.cx, c.y - p.cy) < 800 + p.totalR) { q.fx.frozen = t + 4; break; }
        }
        break;
      case 6: {
        let total = 0; for (const c of p.cells) total += c.m;
        const f = 1 + Math.min(0.2, 600 / total);
        for (const c of p.cells) { c.m = Math.min(MAX_CELL_MASS, c.m * f); c.r = massToRadius(c.m); }
        break;
      }
      case 7: p.fx.ghost = t + 6; break;
      case 8: {
        const R = 700 + p.totalR;
        for (const q of this.players.values()) {
          if (!enemy(q) || q.fx.shield > t) continue;
          for (const c of q.cells) {
            const dx = c.x - p.cx, dy = c.y - p.cy, d = Math.hypot(dx, dy) || 1;
            if (d > R) continue;
            const f = (1 - d / R) * 1900 + 500;
            c.vx += (dx / d) * f; c.vy += (dy / d) * f;
            if (c.m > 40) {
              const loss = c.m * 0.14; c.m -= loss; c.r = massToRadius(c.m);
              const n = Math.min(4, Math.floor(loss / EJECT_MASS));
              for (let i = 0; i < n; i++) {
                const a = this.rng() * 6.283;
                this.addPellet(c.x, c.y, Math.cos(a) * 700, Math.sin(a) * 700, q.hue, 0);
              }
            }
          }
        }
        if (this.ball) {
          const dx = this.ball.x - p.cx, dy = this.ball.y - p.cy, d = Math.hypot(dx, dy) || 1;
          if (d < R) { this.ball.vx += (dx / d) * 1400; this.ball.vy += (dy / d) * 1400; this.ball.last = p.pid; }
        }
        break;
      }
    }
    this.events.push({ k: 'item', pid: p.pid, type, x: p.cx, y: p.cy, r: p.totalR });
    return true;
  }

  teamMode() { const m = this.opts.mode; return m === 'teams' || m === 'soccer' || m === 'ctf'; }

  // ---------- Hauptschritt ----------
  step() {
    this.time += DT; this.tick++;
    const t = this.time;
    this.updatePhase();
    if (this.phase === 'ended') return;

    for (const p of this.players.values()) {
      if (p.bot) botThink(this, p);
      if (!p.alive) {
        const canSpawn = !(this.opts.mode === 'royale' && this.phase === 'play');
        if (canSpawn && t >= p.respawnAt && (p.wantSpawn || p.bot || p.out)) this.spawn(p);
        continue;
      }
      while (p.splitQ > 0) { p.splitQ--; this.doSplit(p); }
      if (p.ejectHeld) { p.ejectCd -= DT; if (p.ejectCd <= 0) { this.doEject(p); p.ejectCd = 0.115; } } else p.ejectCd = 0;
    }

    this.moveCells();
    this.movePellets();
    this.moveHoles();
    if (this.ball) this.moveBall();
    this.collide();
    this.cleanup();
    this.updatePlayers();
    this.replenish();
    this.modeRules();
  }

  moveCells() {
    const t = this.time, decay = Math.exp(-BOOST_K * DT), mh = this.opts.mayhem ? 1.15 : 1;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const mag = Math.hypot(p.ax, p.ay);
      let mult = mh;
      if (p.fx.turbo > t) mult *= 1.6;
      if (p.fx.frozen > t) mult *= 0.15;
      if (p.hasFlag) mult *= 0.86;
      const reach = p.spread + 320;
      const tx = p.cx + p.ax * reach, ty = p.cy + p.ay * reach;
      const multi = p.cells.length > 1;
      for (const c of p.cells) {
        const ox = c.x, oy = c.y;
        const bs = baseSpeed(c.r) * mult;
        if (mag > 0.05) {
          const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
          const sp = bs * Math.min(1, mag * 1.15) * Math.min(1, d / 30);
          c.x += (dx / d) * sp * DT; c.y += (dy / d) * sp * DT;
        }
        if (multi) {
          // Zusammenhalt: Teile ziehen zur Mitte, stärker sobald sie verschmelzen dürfen
          const dx = p.cx - c.x, dy = p.cy - c.y, d = Math.hypot(dx, dy);
          if (d > 4) { const sp = bs * (t >= c.mergeAt ? 0.45 : 0.1) * Math.min(1, d / 40); c.x += (dx / d) * sp * DT; c.y += (dy / d) * sp * DT; }
        }
        c.x += c.vx * DT; c.y += c.vy * DT;
        c.vx *= decay; c.vy *= decay;
        if (c.x < 0) { c.x = 0; c.vx = Math.abs(c.vx) * 0.5; } else if (c.x > this.w) { c.x = this.w; c.vx = -Math.abs(c.vx) * 0.5; }
        if (c.y < 0) { c.y = 0; c.vy = Math.abs(c.vy) * 0.5; } else if (c.y > this.h) { c.y = this.h; c.vy = -Math.abs(c.vy) * 0.5; }
        c.mvx = (c.x - ox) / DT; c.mvy = (c.y - oy) / DT;
        c.hidden = false;
      }
    }
  }

  movePellets() {
    const decay = Math.exp(-4 * DT);
    for (const q of this.pellets) {
      if (q.vx === 0 && q.vy === 0) continue;
      q.x += q.vx * DT; q.y += q.vy * DT;
      q.vx *= decay; q.vy *= decay;
      if (Math.abs(q.vx) + Math.abs(q.vy) < 8) { q.vx = 0; q.vy = 0; }
      if (q.x < 8) { q.x = 8; q.vx = Math.abs(q.vx); } else if (q.x > this.w - 8) { q.x = this.w - 8; q.vx = -Math.abs(q.vx); }
      if (q.y < 8) { q.y = 8; q.vy = Math.abs(q.vy); } else if (q.y > this.h - 8) { q.y = this.h - 8; q.vy = -Math.abs(q.vy); }
    }
  }

  moveHoles() {
    const decay = Math.exp(-1.6 * DT);
    for (const h of this.holes) {
      if (h.vx === 0 && h.vy === 0) continue;
      h.x += h.vx * DT; h.y += h.vy * DT; h.vx *= decay; h.vy *= decay;
      if (Math.abs(h.vx) + Math.abs(h.vy) < 4) { h.vx = 0; h.vy = 0; }
      if (h.x < h.r) { h.x = h.r; h.vx = Math.abs(h.vx); } else if (h.x > this.w - h.r) { h.x = this.w - h.r; h.vx = -Math.abs(h.vx); }
      if (h.y < h.r) { h.y = h.r; h.vy = Math.abs(h.vy); } else if (h.y > this.h - h.r) { h.y = this.h - h.r; h.vy = -Math.abs(h.vy); }
    }
  }

  moveBall() {
    const b = this.ball, t = this.time;
    if (b.hold > t) return;
    if (b.hold) { b.hold = 0; }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 2000) { b.vx *= 2000 / sp; b.vy *= 2000 / sp; }
    b.x += b.vx * DT; b.y += b.vy * DT;
    const decay = Math.exp(-0.85 * DT);
    b.vx *= decay; b.vy *= decay;
    const inGoalY = Math.abs(b.y - this.h / 2) < GOAL_HALF - b.r * 0.5;
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.8; } else if (b.y > this.h - b.r) { b.y = this.h - b.r; b.vy = -Math.abs(b.vy) * 0.8; }
    if (!inGoalY) {
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; } else if (b.x > this.w - b.r) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
    } else if (b.x < 0 || b.x > this.w) {
      const team = b.x < 0 ? 1 : 0;
      this.teamGoals[team]++;
      const scorer = this.players.get(b.last);
      if (scorer && scorer.team === team) scorer.goals++;
      this.events.push({ k: 'goal', team, pid: scorer ? scorer.pid : 0, own: !!(scorer && scorer.team !== team), x: b.x < 0 ? 0 : this.w, y: b.y });
      b.x = this.w / 2; b.y = this.h / 2; b.vx = b.vy = 0; b.hold = t + 2.5; b.last = 0;
    }
  }

  collide() {
    const t = this.time, teamMode = this.teamMode();
    const cells = this.cells;

    // Schwarze Löcher: verstecken oder zerplatzen
    for (const h of this.holes) {
      const hm = radiusToMass(h.r);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.dead) continue;
        const dx = c.x - h.x, dy = c.y - h.y;
        const lim = c.r + h.r;
        if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
        const d = Math.hypot(dx, dy);
        if (c.m > hm * 1.15) {
          if (d < c.r - h.r * 0.25) { this.burst(c, h); break; }
        } else if (c.r < h.r * 0.95 && d < h.r - c.r * 0.4) c.hidden = true;
      }
    }
    if (this.holes.some((h) => h.dead)) this.holes = this.holes.filter((h) => !h.dead);

    // Wurmlöcher: kleine Zellen springen zum Partner
    for (let wi = 0; wi < this.worms.length; wi++) {
      const wm = this.worms[wi], to = this.worms[wi ^ 1];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.dead || c.r > 105 || c.tpAt > t) continue;
        const dx = c.x - wm.x, dy = c.y - wm.y;
        if (dx * dx + dy * dy > 3025) continue;
        const sp = Math.hypot(c.mvx, c.mvy);
        const ux = sp > 1 ? c.mvx / sp : 1, uy = sp > 1 ? c.mvy / sp : 0;
        c.x = to.x + ux * 75; c.y = to.y + uy * 75; c.tpAt = t + 2.5;
        this.events.push({ k: 'warp', pid: c.pid, x: wm.x, y: wm.y, x2: to.x, y2: to.y });
      }
    }

    // Zellen untereinander
    cells.sort((a, b) => b.m - a.m);
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cells.length; j++) {
        const b = cells[j];
        if (b.dead) continue;
        const dx = b.x - a.x, lim = a.r + b.r;
        if (dx > lim || dx < -lim) continue;
        const dy = b.y - a.y;
        if (dy > lim || dy < -lim) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= lim * lim) continue;
        const d = Math.sqrt(d2);
        if (a.pid === b.pid) {
          if (t >= a.mergeAt && t >= b.mergeAt) {
            if (d < a.r - b.r * 0.3) { a.m = Math.min(MAX_CELL_MASS, a.m + b.m); a.r = massToRadius(a.m); this.killCell(b); }
          } else if (a.launch < t && b.launch < t) {
            const ov = lim - d, sum = a.m + b.m;
            let nx = dx / (d || 1), ny = dy / (d || 1);
            if (d < 0.01) { nx = 1; ny = 0; }
            const k = 0.6;
            a.x -= nx * ov * (b.m / sum) * k; a.y -= ny * ov * (b.m / sum) * k;
            b.x += nx * ov * (a.m / sum) * k; b.y += ny * ov * (a.m / sum) * k;
          }
          continue;
        }
        const pa = a.p, pb = b.p;
        if (teamMode && pa.team === pb.team) continue;
        if (a.m < b.m * EAT_RATIO) continue;
        if (d > a.r - b.r * 0.35) continue;
        if (b.hidden || pb.prot > t || pb.fx.shield > t) continue;
        a.m = Math.min(MAX_CELL_MASS, a.m + b.m); a.r = massToRadius(a.m);
        pa.prot = 0;
        this.killCell(b);
        pb.lastKiller = pa.pid;
        this.events.push({ k: 'eat', to: pa.pid, x: b.x, y: b.y, m: b.m });
        if (pb.cells.every((c) => c.dead)) this.playerDied(pb, pa);
      }
    }

    // Sternenstaub, Auswurf, Gegenstände
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.dead) continue;
      const p = c.p;
      const magnet = p.fx.magnet > t;
      const reach = magnet ? c.r + 230 : c.r;
      const x0 = Math.max(0, ((c.x - reach) / GRID) | 0), x1 = Math.min(this.gw - 1, ((c.x + reach) / GRID) | 0);
      const y0 = Math.max(0, ((c.y - reach) / GRID) | 0), y1 = Math.min(this.gh - 1, ((c.y + reach) / GRID) | 0);
      const r2 = reach * reach;
      let gain = 0;
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const bucket = this.grid[gy * this.gw + gx];
        for (let k = bucket.length - 1; k >= 0; k--) {
          const id = bucket[k];
          const dx = this.dotX[id] - c.x, dy = this.dotY[id] - c.y;
          if (dx * dx + dy * dy < r2) {
            gain += this.dotValue(id);
            bucket[k] = bucket[bucket.length - 1]; bucket.pop();
            const x = this.rand(20, this.w - 20), y = this.rand(20, this.h - 20);
            this.dotX[id] = x; this.dotY[id] = y;
            this.grid[this.gidx(x, y)].push(id);
            this.dotEvents.push(id);
          }
        }
      }
      if (gain) { if (p.fx.double > t) gain *= 2; c.m = Math.min(MAX_CELL_MASS, c.m + gain); c.r = massToRadius(c.m); }
    }
    for (const q of this.pellets) {
      if (q.dead) continue;
      for (const h of this.holes) {
        const dx = q.x - h.x, dy = q.y - h.y;
        if (dx * dx + dy * dy < h.r * h.r) {
          const sp = Math.hypot(q.vx, q.vy);
          if (sp > 60) { h.vx += (q.vx / sp) * 260; h.vy += (q.vy / sp) * 260; }
          h.r = Math.min(135, h.r + 1.2);
          q.dead = true; break;
        }
      }
      if (q.dead) continue;
      if (this.ball) {
        const b = this.ball, dx = q.x - b.x, dy = q.y - b.y;
        if (dx * dx + dy * dy < b.r * b.r) {
          const sp = Math.hypot(q.vx, q.vy);
          if (sp > 60 && b.hold < t) { b.vx += (q.vx / sp) * 300; b.vy += (q.vy / sp) * 300; if (q.pid) b.last = q.pid; }
          q.dead = true; continue;
        }
      }
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.dead) continue;
        const dx = q.x - c.x, dy = q.y - c.y;
        const magnet = c.p.fx.magnet > t;
        if (magnet && q.pid !== c.pid) {
          const R = c.r + 230;
          if (dx * dx + dy * dy < R * R) { const d = Math.hypot(dx, dy) || 1; q.vx = (-dx / d) * 600; q.vy = (-dy / d) * 600; }
        }
        if (dx * dx + dy * dy < c.r * c.r) {
          if (q.pid === c.pid && t - q.born < 0.6) continue;
          c.m = Math.min(MAX_CELL_MASS, c.m + EJECT_MASS); c.r = massToRadius(c.m);
          q.dead = true; break;
        }
      }
    }
    for (const it of this.items) {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.dead || c.p.item) continue;
        const dx = it.x - c.x, dy = it.y - c.y, R = c.r + 30;
        if (dx * dx + dy * dy < R * R) {
          c.p.item = it.type; it.dead = true;
          this.events.push({ k: 'pick', to: c.pid, type: it.type });
          break;
        }
      }
    }

    // Ball
    if (this.ball && this.ball.hold < t) {
      const b = this.ball;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.dead) continue;
        const dx = b.x - c.x, dy = b.y - c.y, lim = b.r + c.r;
        if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= lim) continue;
        const nx = dx / d, ny = dy / d;
        const mf = Math.min(1, 0.35 + c.m / 260);
        b.x += nx * (lim - d) * mf; b.y += ny * (lim - d) * mf;
        const rel = (c.mvx - b.vx) * nx + (c.mvy - b.vy) * ny;
        if (rel > 0) { b.vx += nx * rel * 1.15 * mf; b.vy += ny * rel * 1.15 * mf; }
        b.last = c.pid;
      }
      b.y = Math.max(b.r, Math.min(this.h - b.r, b.y));
    }
  }

  burst(c, h) {
    const p = c.p;
    h.dead = true; this.freeId(h.id);
    c.m = Math.min(MAX_CELL_MASS, c.m + radiusToMass(h.r) * 0.3);
    const free = this.opts.maxCells - p.cells.length;
    if (free <= 0) {
      const shed = c.m * 0.25; c.m -= shed;
      const n = Math.min(12, Math.floor(shed / EJECT_MASS));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + this.rng();
        this.addPellet(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, Math.cos(a) * 900, Math.sin(a) * 900, p.hue, 0);
      }
    } else {
      const out = c.m * 0.62;
      const n = Math.max(1, Math.min(free, 9, Math.floor(out / 14)));
      const each = out / n;
      c.m -= out;
      const a0 = this.rng() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.283 + this.rand(-0.2, 0.2);
        const nc = this.makeCell(p, c.x + Math.cos(a) * 6, c.y + Math.sin(a) * 6, each);
        const dist = 190 + nc.r * 2 + this.rand(0, 120);
        nc.vx = Math.cos(a) * dist * BOOST_K; nc.vy = Math.sin(a) * dist * BOOST_K;
        nc.launch = this.time + 0.5; nc.mergeAt = this.mergeTime(each);
      }
    }
    c.r = massToRadius(c.m); c.mergeAt = this.mergeTime(c.m);
    p.prot = 0;
    this.events.push({ k: 'burst', pid: p.pid, x: h.x, y: h.y });
  }

  killCell(c) { c.dead = true; this.freeId(c.id); }

  playerDied(p, killer) {
    p.alive = false; p.deaths++; p.item = 0;
    p.respawnAt = this.time + (p.bot ? this.rand(2, 5) : 1.2);
    p.wantSpawn = false;
    if (killer) killer.kills++;
    if (this.opts.mode === 'royale' && this.phase === 'play') {
      p.out = true;
      let alive = 0; for (const q of this.players.values()) if (q.alive) alive++;
      p.place = alive + 1;
    }
    this.events.push({ k: 'kill', killer: killer ? killer.pid : 0, victim: p.pid, x: p.cx, y: p.cy, place: p.place });
  }

  cleanup() {
    let dead = false;
    for (const c of this.cells) if (c.dead) { dead = true; break; }
    if (dead) {
      this.cells = this.cells.filter((c) => !c.dead);
      for (const p of this.players.values()) if (p.cells.some((c) => c.dead)) p.cells = p.cells.filter((c) => !c.dead);
    }
    if (this.pellets.some((q) => q.dead)) {
      for (const q of this.pellets) if (q.dead) this.freeId(q.id);
      this.pellets = this.pellets.filter((q) => !q.dead);
    }
    if (this.items.some((q) => q.dead)) {
      for (const q of this.items) if (q.dead) this.freeId(q.id);
      this.items = this.items.filter((q) => !q.dead);
    }
  }

  updatePlayers() {
    const t = this.time;
    this.teamScores.fill(0);
    let leader = null;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      let sx = 0, sy = 0, sm = 0, sr = 0, merge = 0;
      for (const c of p.cells) {
        if (c.m > 60) { c.m -= c.m * 0.002 * DT; c.r = massToRadius(c.m); }
        if (c.x < 0) c.x = 0; else if (c.x > this.w) c.x = this.w;
        if (c.y < 0) c.y = 0; else if (c.y > this.h) c.y = this.h;
        sx += c.x * c.m; sy += c.y * c.m; sm += c.m; sr += c.r;
        if (c.mergeAt > t) merge = Math.max(merge, c.mergeAt - t);
      }
      if (sm <= 0) continue;
      p.cx = sx / sm; p.cy = sy / sm; p.totalR = sr;
      let spread = 0;
      for (const c of p.cells) { const d = Math.hypot(c.x - p.cx, c.y - p.cy) + c.r; if (d > spread) spread = d; }
      p.spread = spread;
      p.score = sm; if (sm > p.best) p.best = sm;
      p.mergeSecs = p.cells.length > 1 ? Math.ceil(merge) : 0;
      p.viewW = Math.max(viewWidth(sr), spread * 2.6);
      this.teamScores[p.team] += sm;
      if (!leader || sm > leader.score) leader = p;
    }
    this.leader = leader;
    // Zuschauer folgen ihrem Bezwinger oder dem Führenden
    for (const p of this.players.values()) {
      if (p.alive) continue;
      const k = this.players.get(p.lastKiller);
      const f = k && k.alive ? k : (t > p.respawnAt + 2 ? leader : null);
      if (f) { p.cx += (f.cx - p.cx) * 0.12; p.cy += (f.cy - p.cy) * 0.12; p.viewW = Math.max(1700, f.viewW * 1.25); } else p.viewW = 1700;
    }
  }

  replenish() {
    this.holeTimer -= DT; this.itemTimer -= DT;
    if (this.holes.length < this.holeTarget && this.holeTimer <= 0) { this.spawnHole(); this.holeTimer = 4; }
    if (this.items.length < this.itemTarget && this.itemTimer <= 0) { this.spawnItem(); this.itemTimer = this.opts.mayhem ? 0.5 : 2.5; }
  }

  // ---------- Modi ----------
  updatePhase() {
    const t = this.time, o = this.opts;
    if (this.phase === 'ended') {
      if (t >= this.phaseEnd) this.resetRound();
      return;
    }
    if (o.mode === 'royale') {
      if (this.phase === 'warmup' && t >= this.phaseEnd) {
        let n = 0; for (const p of this.players.values()) if (p.alive) n++;
        if (n < 2) { this.phaseEnd = t + 5; return; }
        this.phase = 'play'; this.royaleStartCount = n;
        const r0 = Math.hypot(this.w, this.h) / 2 + 100;
        const dur = 110 + this.w / 60;
        this.zone = {
          x: this.w / 2, y: this.h / 2, r: r0, x0: this.w / 2, y0: this.h / 2, r0,
          x1: this.rand(this.w * 0.3, this.w * 0.7), y1: this.rand(this.h * 0.3, this.h * 0.7), r1: 260, t0: t + 8, t1: t + 8 + dur,
        };
        for (const p of this.players.values()) { p.place = 0; p.kills = 0; }
        this.events.push({ k: 'phase', phase: 'play' });
      }
      return;
    }
    if (this.roundEnd && t >= this.roundEnd) this.endRound();
  }

  endRound(winnerPid = 0) {
    const o = this.opts;
    const list = [...this.players.values()];
    let rows, winTeam = -1;
    if (o.mode === 'royale') {
      rows = list.filter((p) => p.place || p.alive).map((p) => ({ pid: p.pid, name: p.name, team: p.team, score: Math.round(p.best), kills: p.kills, place: p.alive ? 1 : p.place }));
      rows.sort((a, b) => a.place - b.place);
    } else {
      rows = list.map((p) => ({ pid: p.pid, name: p.name, team: p.team, score: Math.round(p.alive ? p.score : 0), kills: p.kills, goals: p.goals }));
      rows.sort((a, b) => b.score - a.score);
      rows.forEach((r, i) => (r.place = i + 1));
      if (o.mode === 'soccer' || o.mode === 'ctf') winTeam = this.teamGoals[0] === this.teamGoals[1] ? -1 : (this.teamGoals[0] > this.teamGoals[1] ? 0 : 1);
      else if (o.mode === 'teams') { winTeam = 0; for (let i = 1; i < o.teams; i++) if (this.teamScores[i] > this.teamScores[winTeam]) winTeam = i; }
    }
    this.results = {
      mode: o.mode, rows: rows.slice(0, 12), winTeam, winner: winnerPid || (rows[0] ? rows[0].pid : 0),
      goals: this.teamGoals.slice(), teamScores: this.teamScores.map((s) => Math.round(s)),
    };
    this.phase = 'ended'; this.phaseEnd = this.time + 12;
    this.events.push({ k: 'round', results: this.results });
  }

  resetRound() {
    const o = this.opts;
    for (const c of this.cells) this.freeId(c.id);
    for (const q of this.pellets) this.freeId(q.id);
    this.cells = []; this.pellets = [];
    this.zone = null; this.results = null;
    this.teamGoals = [0, 0];
    if (this.flags) for (const f of this.flags) { f.x = f.hx; f.y = f.hy; f.carrier = 0; f.home = true; }
    if (this.ball) { this.ball.x = this.w / 2; this.ball.y = this.h / 2; this.ball.vx = this.ball.vy = 0; this.ball.hold = this.time + 2; }
    this.phase = o.mode === 'royale' ? 'warmup' : 'play';
    this.phaseEnd = o.mode === 'royale' ? this.time + 15 : 0;
    this.roundEnd = o.roundTime > 0 ? this.time + o.roundTime * 60 : 0;
    for (const p of this.players.values()) {
      p.cells = []; p.alive = false; p.out = false; p.kills = 0; p.deaths = 0; p.goals = 0; p.place = 0; p.best = 0; p.score = 0;
      this.spawn(p);
    }
    this.events.push({ k: 'phase', phase: this.phase });
  }

  modeRules() {
    const t = this.time;
    if (this.flags) return this.ctfRules();
    if (this.opts.mode !== 'royale' || this.phase !== 'play' || !this.zone) return;
    const z = this.zone;
    const f = Math.max(0, Math.min(1, (t - z.t0) / (z.t1 - z.t0)));
    z.r = z.r0 + (z.r1 - z.r0) * f; z.x = z.x0 + (z.x1 - z.x0) * f; z.y = z.y0 + (z.y1 - z.y0) * f;
    let alive = 0, last = null;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const c of p.cells) {
        if (Math.hypot(c.x - z.x, c.y - z.y) > z.r) {
          c.m -= (c.m * 0.09 + 3) * DT; c.r = massToRadius(Math.max(c.m, 1));
          if (c.m < 12) this.killCell(c);
        }
      }
      if (p.cells.every((c) => c.dead)) { this.playerDied(p, null); continue; }
      alive++; last = p;
    }
    this.cleanup();
    if (alive <= 1) {
      if (last) last.place = 1;
      this.endRound(last ? last.pid : 0);
    }
  }

  ctfRules() {
    const t = this.time;
    for (const p of this.players.values()) p.hasFlag = false;
    for (const f of this.flags) {
      if (f.carrier) {
        const p = this.players.get(f.carrier);
        if (!p || !p.alive || p.team === f.team) {
          f.carrier = 0; f.dropAt = t + 12;
          this.events.push({ k: 'flag', a: 'drop', team: f.team, pid: p ? p.pid : 0 });
          continue;
        }
        p.hasFlag = true; f.x = p.cx; f.y = p.cy;
        const own = this.flags[p.team];
        if (own.home && Math.hypot(p.cx - own.hx, p.cy - own.hy) < 230) {
          this.teamGoals[p.team]++; p.goals++;
          f.carrier = 0; f.home = true; f.x = f.hx; f.y = f.hy; p.hasFlag = false;
          this.events.push({ k: 'cap', team: p.team, pid: p.pid, x: own.hx, y: own.hy });
          if (this.teamGoals[p.team] >= CTF_WIN) { this.endRound(); return; }
        }
        continue;
      }
      for (const c of this.cells) {
        if (c.dead) continue;
        const R = c.r + 45, dx = c.x - f.x, dy = c.y - f.y;
        if (dx * dx + dy * dy > R * R) continue;
        if (c.p.team !== f.team) {
          f.carrier = c.pid; f.home = false; c.p.hasFlag = true; c.p.prot = 0;
          this.events.push({ k: 'flag', a: 'take', team: f.team, pid: c.pid });
          break;
        } else if (!f.home) {
          f.home = true; f.x = f.hx; f.y = f.hy;
          this.events.push({ k: 'flag', a: 'ret', team: f.team, pid: c.pid });
          break;
        }
      }
      if (!f.home && !f.carrier && t > f.dropAt) { f.home = true; f.x = f.hx; f.y = f.hy; this.events.push({ k: 'flag', a: 'ret', team: f.team, pid: 0 }); }
    }
  }

  // ---------- Daten für die Oberfläche ----------
  playerTable() {
    return [...this.players.values()].map((p) => [p.pid, p.name, p.skin, p.hue, p.team, p.bot ? 1 : 0]);
  }
  info() {
    const list = [...this.players.values()].filter((p) => p.alive).sort((a, b) => b.score - a.score);
    let alive = list.length;
    const tl = this.phase === 'ended' ? Math.max(0, this.phaseEnd - this.time)
      : this.phase === 'warmup' ? Math.max(0, this.phaseEnd - this.time)
      : this.roundEnd ? Math.max(0, this.roundEnd - this.time) : -1;
    return {
      lb: list.slice(0, 10).map((p) => [p.pid, Math.round(p.score)]),
      mm: list.filter((p) => !(p.fx.ghost > this.time)).map((p) => [p.pid, Math.round(p.cx), Math.round(p.cy), Math.round(Math.sqrt(p.score))]),
      ph: this.phase, tl: Math.round(tl), n: this.players.size, alive,
      goals: this.teamGoals, ts: this.teamScores.map((s) => Math.round(s)),
      zs: this.zone ? Math.max(0, Math.round(this.zone.t0 - this.time)) : 0,
    };
  }
}
