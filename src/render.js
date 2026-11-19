// Canvas-Renderer: Weltraum-Hintergrund, Sternenstaub, Blobs mit Skins, Schwarze Löcher, Effekte, Minimap.
import { skinTexture } from './skins.js';
import { ITEMS, TEAM_COLORS, GOAL_HALF, EMOTES, CTF_BASE, isTeamMode, F_HIDDEN, F_SHIELD, F_FROZEN, F_GHOST, F_PROT, F_TURBO, F_MAGNET } from './config.js';

const TAU = Math.PI * 2;
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rnd(seed) { let s = seed; return () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647; }; }

function makeNebula(T, seed, hues) {
  const cv = mkCanvas(T), c = cv.getContext('2d'), r = rnd(seed);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const x = r() * T, y = r() * T, rad = T * (0.16 + r() * 0.3), h = hues[(r() * hues.length) | 0] + (r() - 0.5) * 30, a = 0.05 + r() * 0.1;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const cx = x + ox * T, cy = y + oy * T;
      if (cx + rad < 0 || cx - rad > T || cy + rad < 0 || cy - rad > T) continue;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, hsl(h, 80, 45, a)); g.addColorStop(0.5, hsl(h + 20, 80, 30, a * 0.45)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  }
  return cv;
}
function makeStars(T, seed, count, big) {
  const cv = mkCanvas(T), c = cv.getContext('2d'), r = rnd(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * T, y = r() * T, s = big ? 0.8 + r() * 1.6 : 0.4 + r() * 0.9, a = 0.35 + r() * 0.65;
    c.fillStyle = hsl(200 + r() * 80, 60, 88, a); c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    if (big && r() < 0.12) { c.strokeStyle = hsl(210, 80, 90, 0.5); c.lineWidth = 0.6; c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke(); }
  }
  return cv;
}
function makeDot(h, gold) {
  const S = 40, cv = mkCanvas(S), c = cv.getContext('2d'), R = S / 2;
  const g = c.createRadialGradient(R, R, 0, R, R, R);
  if (gold) { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.3, '#ffd84a'); g.addColorStop(0.45, 'rgba(255,190,40,0.5)'); g.addColorStop(1, 'rgba(255,170,0,0)'); } else { g.addColorStop(0, hsl(h, 100, 88)); g.addColorStop(0.28, hsl(h, 95, 62)); g.addColorStop(0.42, hsl(h, 95, 55, 0.45)); g.addColorStop(1, hsl(h, 95, 50, 0)); }
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return cv;
}
function makeHole() {
  const S = 320, cv = mkCanvas(S), c = cv.getContext('2d'), R = S / 2;
  c.translate(R, R);
  let g = c.createRadialGradient(0, 0, R * 0.5, 0, 0, R);
  g.addColorStop(0, 'rgba(150,70,255,0.55)'); g.addColorStop(0.5, 'rgba(90,40,200,0.2)'); g.addColorStop(1, 'rgba(60,20,160,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.globalCompositeOperation = 'lighter';
  const r = rnd(42);
  for (let i = 0; i < 46; i++) {
    const t = r(), rad = R * (0.6 + t * 0.2), a0 = r() * TAU, len = 0.6 + r() * 1.6;
    c.strokeStyle = hsl(275 - t * 250 + 360, 95, 62, 0.34); c.lineWidth = 1.5 + r() * 4; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, rad, a0, a0 + len); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  g = c.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 0.64);
  g.addColorStop(0, '#000'); g.addColorStop(0.86, '#02010a'); g.addColorStop(1, 'rgba(10,0,30,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 0.64, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,225,170,0.9)'; c.lineWidth = 2.2; c.beginPath(); c.arc(0, 0, R * 0.585, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(255,150,90,0.35)'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, R * 0.6, 0, TAU); c.stroke();
  return cv;
}
function makeItem(it) {
  const S = 112, cv = mkCanvas(S), c = cv.getContext('2d'), R = S / 2;
  let g = c.createRadialGradient(R, R, R * 0.3, R, R, R);
  g.addColorStop(0, hsl(it.hue, 95, 60, 0.75)); g.addColorStop(1, hsl(it.hue, 95, 55, 0));
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  g = c.createRadialGradient(R - 8, R - 10, 2, R, R, R * 0.56);
  g.addColorStop(0, '#2c3350'); g.addColorStop(1, '#0d1020');
  c.fillStyle = g; c.beginPath(); c.arc(R, R, R * 0.56, 0, TAU); c.fill();
  c.strokeStyle = hsl(it.hue, 95, 68); c.lineWidth = 3.5; c.stroke();
  c.font = `${R * 0.6}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(it.icon, R, R + 2);
  return cv;
}
function makeBall() {
  const S = 256, cv = mkCanvas(S), c = cv.getContext('2d'), R = S / 2;
  c.translate(R, R); c.beginPath(); c.arc(0, 0, R - 3, 0, TAU); c.clip();
  const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#dfe4f2'); g.addColorStop(1, '#8a93b4');
  c.fillStyle = g; c.fillRect(-R, -R, S, S);
  c.fillStyle = '#1c2036';
  const poly = (x, y, rad, rot) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.fill(); };
  poly(0, 0, R * 0.27, 0.3);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; poly(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82, R * 0.24, a); }
  c.strokeStyle = 'rgba(28,32,54,0.55)'; c.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.27, Math.sin(a) * R * 0.27); c.lineTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6); c.stroke(); }
  return cv;
}
function makeDeep(T) {
  const cv = mkCanvas(T), c = cv.getContext('2d'), r = rnd(77);
  // ferne Galaxien
  for (let i = 0; i < 3; i++) {
    const x = T * (0.15 + r() * 0.7), y = T * (0.15 + r() * 0.7), rad = 70 + r() * 70, h = [200, 290, 30][i];
    c.save(); c.translate(x, y); c.rotate(r() * 3); c.scale(1, 0.38);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, hsl(h, 70, 85, 0.5)); g.addColorStop(0.2, hsl(h, 80, 60, 0.22)); g.addColorStop(1, hsl(h, 80, 50, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.fill(); c.restore();
  }
  // Planeten
  const planets = [[0.22, 0.3, 46, 28], [0.72, 0.62, 70, 195], [0.5, 0.12, 22, 330], [0.86, 0.2, 30, 120]];
  for (const [fx, fy, rad, h] of planets) {
    const x = T * fx, y = T * fy;
    let g = c.createRadialGradient(x, y, rad * 0.8, x, y, rad * 1.5);
    g.addColorStop(0, hsl(h, 80, 60, 0.2)); g.addColorStop(1, hsl(h, 80, 60, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad * 1.5, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(x, y, rad, 0, TAU); c.clip();
    g = c.createRadialGradient(x - rad * 0.45, y - rad * 0.45, rad * 0.1, x, y, rad * 1.25);
    g.addColorStop(0, hsl(h, 55, 62)); g.addColorStop(0.55, hsl(h + 15, 55, 30)); g.addColorStop(1, hsl(h + 30, 60, 6));
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    for (let i = 0; i < 6; i++) { c.fillStyle = hsl(h + (r() - 0.5) * 50, 50, 20 + r() * 40, 0.22); c.fillRect(x - rad, y - rad + r() * rad * 2, rad * 2, 2 + r() * rad * 0.16); }
    c.restore();
    if (rad > 60) { c.save(); c.translate(x, y); c.rotate(-0.45); c.strokeStyle = hsl(h + 30, 60, 75, 0.45); c.lineWidth = 7; c.beginPath(); c.ellipse(0, 0, rad * 1.75, rad * 0.4, 0, 0.15, Math.PI - 0.15); c.stroke(); c.restore(); }
  }
  return cv;
}
function makeWorm() {
  const S = 256, cv = mkCanvas(S), c = cv.getContext('2d'), R = S / 2;
  c.translate(R, R);
  let g = c.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, 'rgba(230,255,255,0.95)'); g.addColorStop(0.16, 'rgba(90,255,230,0.75)'); g.addColorStop(0.5, 'rgba(30,150,255,0.25)'); g.addColorStop(1, 'rgba(30,120,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    c.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = arm * (TAU / 4) + t * 4.2, rr = 8 + t * R * 0.82; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.strokeStyle = 'rgba(120,255,235,0.5)'; c.lineWidth = 5; c.stroke();
  }
  return cv;
}
function makeVignette() {
  const S = 256, cv = mkCanvas(S), c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
  g.addColorStop(0, 'rgba(0,0,8,0)'); g.addColorStop(1, 'rgba(0,0,8,0.6)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return cv;
}
function makeGlow() {
  const S = 128, cv = mkCanvas(S), c = cv.getContext('2d'), R = S / 2;
  const g = c.createRadialGradient(R, R, R * 0.55, R, R, R);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return cv;
}

export class Renderer {
  constructor(canvas, world, settings) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.world = world; this.settings = settings;
    this.W = 0; this.H = 0; this.dpr = 1; this.scale = 1;
    this.nebula = makeNebula(768, 17, [265, 215, 320, 190]);
    this.nebula2 = makeNebula(768, 91, [200, 340, 280]);
    this.stars1 = makeStars(512, 5, 110, false);
    this.stars2 = makeStars(640, 9, 60, true);
    this.dotSprites = []; for (let i = 0; i < 12; i++) this.dotSprites.push(makeDot(i * 30 + 10, false));
    this.goldDot = makeDot(0, true);
    this.holeSprite = makeHole();
    this.itemSprites = ITEMS.map((it) => (it ? makeItem(it) : null));
    this.ballSprite = makeBall();
    this.glow = makeGlow();
    this.deep = makeDeep(1500); this.wormSprite = makeWorm(); this.vignette = makeVignette();
    this.shoot = null; this.aim = null;
    this.drawList = [];
    this.resize();
  }

  resize() {
    const q = this.settings.quality;
    this.dpr = Math.min(window.devicePixelRatio || 1, q === 'hoch' ? 2 : q === 'mittel' ? 1.5 : 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
  }

  tile(img, ox, oy, alpha) {
    const c = this.ctx, T = img.width;
    let x0 = ((-ox % T) + T) % T - T, y0 = ((-oy % T) + T) % T - T;
    c.globalAlpha = alpha;
    for (let y = y0; y < this.H; y += T) for (let x = x0; x < this.W; x += T) c.drawImage(img, x, y);
    c.globalAlpha = 1;
  }

  draw(now, joy, aim) {
    this.aim = aim || null;
    const c = this.ctx, w = this.world, W = this.W, H = this.H, st = this.settings;
    const cam = w.cam;
    const scale = this.scale = Math.max(W, H) / cam.viewW;
    let shx = 0, shy = 0;
    if (w.shake > 0.2) { shx = (Math.random() - 0.5) * w.shake; shy = (Math.random() - 0.5) * w.shake; }
    const ox = W / 2 - cam.x * scale + shx, oy = H / 2 - cam.y * scale + shy;
    const hiq = st.quality !== 'niedrig';
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Hintergrund
    c.fillStyle = st.theme === 'raster' ? '#0b0d16' : '#04050d';
    c.fillRect(0, 0, W, H);
    if (st.theme !== 'raster') {
      const px = cam.x * scale, py = cam.y * scale;
      if (hiq) { this.tile(this.nebula, px * 0.12, py * 0.12, 0.9); this.tile(this.nebula2, px * 0.22 + 300, py * 0.22 + 120, 0.55); }
      this.tile(this.stars1, px * 0.3, py * 0.3, 0.8);
      if (hiq) this.tile(this.deep, px * 0.4 + 200, py * 0.4 + 500, 0.85);
      // Sternschnuppen
      if (!this.shoot && Math.random() < 0.004) { const a = 0.5 + Math.random() * 0.6; this.shoot = { x: Math.random() * W, y: Math.random() * H * 0.5, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, t0: now }; }
      if (this.shoot) {
        const sh = this.shoot, t = (now - sh.t0) / 1000;
        if (t > 0.7) this.shoot = null; else {
          const x = sh.x + sh.vx * t, y = sh.y + sh.vy * t, g = c.createLinearGradient(x, y, x - sh.vx * 0.12, y - sh.vy * 0.12);
          g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - t / 0.7)})`); g.addColorStop(1, 'rgba(160,200,255,0)');
          c.strokeStyle = g; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - sh.vx * 0.12, y - sh.vy * 0.12); c.stroke();
        }
      }
      this.tile(this.stars2, px * 0.55, py * 0.55, 0.9);
    }

    const vx0 = cam.x - (W / 2 + 40) / scale, vx1 = cam.x + (W / 2 + 40) / scale;
    const vy0 = cam.y - (H / 2 + 40) / scale, vy1 = cam.y + (H / 2 + 40) / scale;

    // Raster und Spielfeldrand
    const gs = 250;
    if (scale > 0.12) {
      c.strokeStyle = st.theme === 'raster' ? 'rgba(120,140,220,0.16)' : 'rgba(120,140,255,0.07)'; c.lineWidth = 1;
      c.beginPath();
      for (let x = Math.max(0, Math.ceil(vx0 / gs) * gs); x <= Math.min(w.w, vx1); x += gs) { const sx = Math.round(x * scale + ox) + 0.5; c.moveTo(sx, Math.max(0, oy)); c.lineTo(sx, Math.min(H, w.h * scale + oy)); }
      for (let y = Math.max(0, Math.ceil(vy0 / gs) * gs); y <= Math.min(w.h, vy1); y += gs) { const sy = Math.round(y * scale + oy) + 0.5; c.moveTo(Math.max(0, ox), sy); c.lineTo(Math.min(W, w.w * scale + ox), sy); }
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.55)';
    if (ox > 0) c.fillRect(0, 0, ox, H);
    if (oy > 0) c.fillRect(0, 0, W, oy);
    const ex = w.w * scale + ox, ey = w.h * scale + oy;
    if (ex < W) c.fillRect(ex, 0, W - ex, H);
    if (ey < H) c.fillRect(0, ey, W, H - ey);
    c.strokeStyle = `rgba(120,170,255,${0.22 + 0.12 * Math.sin(now * 0.003)})`; c.lineWidth = 14; c.strokeRect(ox, oy, w.w * scale, w.h * scale);
    c.strokeStyle = '#8fd0ff'; c.lineWidth = 2.5; c.strokeRect(ox, oy, w.w * scale, w.h * scale);

    const soccer = w.opts && w.opts.mode === 'soccer';
    if (soccer) this.drawPitch(c, scale, ox, oy);
    if (w.opts && w.opts.mode === 'ctf') {
      for (const side of [0, 1]) {
        const hue = TEAM_COLORS[side].hue, bx = (side === 0 ? CTF_BASE : w.w - CTF_BASE) * scale + ox, by = (w.h / 2) * scale + oy, br = 230 * scale;
        c.fillStyle = hsl(hue, 85, 55, 0.14); c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
        c.strokeStyle = hsl(hue, 90, 68, 0.8); c.lineWidth = Math.max(2, 6 * scale); c.setLineDash([16 * scale + 4, 12 * scale + 3]); c.lineDashOffset = now * 0.02 * (side ? 1 : -1); c.stroke(); c.setLineDash([]);
      }
      c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = Math.max(1.5, 5 * scale); c.beginPath(); c.moveTo((w.w / 2) * scale + ox, oy); c.lineTo((w.w / 2) * scale + ox, w.h * scale + oy); c.stroke();
    }
    // Wurmlöcher
    for (let i = 0; i < w.worms.length; i++) {
      const [wx, wy] = w.worms[i];
      if (wx < vx0 - 120 || wx > vx1 + 120 || wy < vy0 - 120 || wy > vy1 + 120) continue;
      const s2 = 210 * scale * (1 + 0.06 * Math.sin(now * 0.004 + i));
      c.save(); c.translate(wx * scale + ox, wy * scale + oy); c.rotate(-now * 0.0022 + i); c.drawImage(this.wormSprite, -s2 / 2, -s2 / 2, s2, s2); c.restore();
    }

    // Zone (Battle Royale)
    if (w.zone) {
      const z = w.zone, zx = z.x * scale + ox, zy = z.y * scale + oy, zr = z.r * scale;
      c.fillStyle = 'rgba(255,40,70,0.16)';
      c.beginPath(); c.rect(0, 0, W, H); c.arc(zx, zy, zr, 0, TAU, true); c.fill('evenodd');
      c.strokeStyle = 'rgba(255,90,110,0.35)'; c.lineWidth = 9; c.beginPath(); c.arc(zx, zy, zr, 0, TAU); c.stroke();
      c.strokeStyle = '#ff7088'; c.lineWidth = 2.5; c.setLineDash([14, 10]); c.lineDashOffset = -now * 0.03; c.beginPath(); c.arc(zx, zy, zr, 0, TAU); c.stroke(); c.setLineDash([]);
    }

    // Sternenstaub
    const dots = w.dots;
    if (dots) {
      const dx = dots.x, dy = dots.y, n = dots.n;
      const ds = Math.max(3.2, 24 * scale), gsz = Math.max(5, 40 * scale);
      const tw = hiq ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const x = dx[i]; if (x < vx0 || x > vx1) continue;
        const y = dy[i]; if (y < vy0 || y > vy1) continue;
        if (i % 23 === 0) { const s = gsz * (1 + 0.12 * Math.sin(now * 0.006 + i)); c.drawImage(this.goldDot, x * scale + ox - s / 2, y * scale + oy - s / 2, s, s); } else {
          const s = tw ? ds * (1 + 0.1 * Math.sin(now * 0.004 + i * 1.7)) : ds;
          c.drawImage(this.dotSprites[i % 12], x * scale + ox - s / 2, y * scale + oy - s / 2, s, s);
        }
      }
      for (const s of w.sucks) {
        const a = Math.max(0, Math.min(1, (now - s.t0) / s.dur)), e = a * a;
        const x = s.x + (s.to.x - s.x) * e, y = s.y + (s.to.y - s.y) * e, sz = ds * (1 - e * 0.6);
        c.drawImage(s.id % 23 === 0 ? this.goldDot : this.dotSprites[s.id % 12], x * scale + ox - sz / 2, y * scale + oy - sz / 2, sz, sz);
      }
    }

    // Ausgeworfene Masse
    const pr = Math.max(2, 17 * scale);
    for (const q of w.pellets) {
      if (q.x < vx0 || q.x > vx1 || q.y < vy0 || q.y > vy1) continue;
      const x = q.x * scale + ox, y = q.y * scale + oy;
      c.fillStyle = hsl(q.hue, 85, 58); c.beginPath(); c.arc(x, y, pr, 0, TAU); c.fill();
      if (pr > 4) { c.strokeStyle = hsl(q.hue, 90, 78); c.lineWidth = Math.max(1, pr * 0.2); c.stroke(); }
    }

    // Gegenstände
    for (const it of w.items) {
      if (it.x < vx0 || it.x > vx1 || it.y < vy0 || it.y > vy1) continue;
      const sp = this.itemSprites[it.type]; if (!sp) continue;
      const s = Math.max(16, 120 * scale) * (1 + 0.07 * Math.sin(now * 0.005 + it.seed));
      const bob = Math.sin(now * 0.003 + it.seed) * 5 * scale;
      c.drawImage(sp, it.x * scale + ox - s / 2, it.y * scale + oy - s / 2 + bob, s, s);
    }

    // Zellen, Löcher und Ball nach Größe sortiert
    const list = this.drawList; list.length = 0;
    for (const n of w.cells) if (!(n.x + n.r < vx0 || n.x - n.r > vx1 || n.y + n.r < vy0 || n.y - n.r > vy1)) list.push(n);
    for (const n of w.holes) if (!(n.x + n.r * 1.6 < vx0 || n.x - n.r * 1.6 > vx1 || n.y + n.r * 1.6 < vy0 || n.y - n.r * 1.6 > vy1)) list.push(n);
    list.sort((a, b) => a.r - b.r);
    const leader = w.info && w.info.lb && w.info.lb[0] ? w.info.lb[0][0] : 0;
    const teamMode = w.opts && isTeamMode(w.opts.mode);
    const myTeam = w.players.get(w.me) ? w.players.get(w.me).team : -1;
    let crownCell = 0;
    if (leader && !teamMode) { let br = 0; for (const n of list) if (n.kind === 'c' && n.pid === leader && n.r > br) { br = n.r; crownCell = n.id; } }
    this.crownCell = crownCell;
    let ballDrawn = !w.ball;
    for (const n of list) {
      if (!ballDrawn && n.r > w.ball.r) { this.drawBall(c, scale, ox, oy); ballDrawn = true; }
      if (n.kind === 'h') {
        const s = n.r * 2 * 1.56 * scale * (1 + 0.03 * Math.sin(now * 0.003 + n.seed));
        const x = n.x * scale + ox, y = n.y * scale + oy;
        c.save(); c.translate(x, y); c.rotate(now * 0.0007 + n.seed); c.drawImage(this.holeSprite, -s / 2, -s / 2, s, s); c.restore();
        continue;
      }
      this.drawCell(c, n, now, scale, ox, oy, hiq, leader, teamMode, myTeam);
    }
    if (!ballDrawn) this.drawBall(c, scale, ox, oy);

    // Gefressene Zellen
    for (const g of w.ghosts) {
      const a = Math.max(0, Math.min(1, (now - g.t0) / g.dur)), n = g.n, p = w.players.get(n.pid);
      const tx = g.to ? g.to.x : n.x, ty = g.to ? g.to.y : n.y;
      const x = (n.x + (tx - n.x) * a) * scale + ox, y = (n.y + (ty - n.y) * a) * scale + oy, r = n.r * (1 - a) * scale;
      if (r < 1 || !p) continue;
      c.globalAlpha = 1 - a * 0.5; c.drawImage(skinTexture(p.skin, p.hue), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1;
    }

    // Flaggen
    for (const f of w.flags) {
      const hue = TEAM_COLORS[f.team].hue, fx = f.x * scale + ox, sz = Math.max(20, 80 * scale);
      let fy = f.y * scale + oy;
      if (f.carrier) { let cr = 0; for (const n of w.cells) if (n.pid === f.carrier && n.r > cr) cr = n.r; fy -= cr * scale * 0.9; } else fy += Math.sin(now * 0.004 + f.team) * 3;
      if (fx < -60 || fx > W + 60 || fy < -60 || fy > H + 60) { this.arrow(c, fx, fy, hsl(hue, 90, 68), '🚩'); continue; }
      c.strokeStyle = '#f2f4ff'; c.lineWidth = Math.max(2, sz * 0.07); c.lineCap = 'round'; c.beginPath(); c.moveTo(fx, fy + sz * 0.5); c.lineTo(fx, fy - sz * 0.6); c.stroke();
      const wv = Math.sin(now * 0.008 + f.team * 2) * sz * 0.07;
      c.fillStyle = hsl(hue, 90, 58); c.strokeStyle = hsl(hue, 95, 80); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(fx, fy - sz * 0.6); c.quadraticCurveTo(fx + sz * 0.35, fy - sz * 0.62 + wv, fx + sz * 0.7, fy - sz * 0.36 + wv); c.quadraticCurveTo(fx + sz * 0.35, fy - sz * 0.2 - wv, fx, fy - sz * 0.12); c.closePath(); c.fill(); c.stroke();
      if (!f.home && !f.carrier) { c.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(now * 0.01)})`; c.lineWidth = 2; c.beginPath(); c.arc(fx, fy, sz * 0.8, 0, TAU); c.stroke(); }
    }

    // Effekte
    if (w.particles.length) {
      c.globalCompositeOperation = 'lighter';
      for (const p of w.particles) {
        const a = Math.max(0, p.life / p.max), s = Math.max(1, p.size * scale * (0.4 + a));
        c.fillStyle = hsl(p.hue, 95, 65, a); c.beginPath(); c.arc(p.x * scale + ox, p.y * scale + oy, s, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    for (const r of w.rings) {
      const a = Math.max(0, Math.min(1, (now - r.t0) / r.dur)), e = 1 - (1 - a) * (1 - a);
      c.strokeStyle = hsl(r.hue, 95, 70, (1 - a) * 0.9); c.lineWidth = Math.max(1.5, 14 * (1 - a) * scale + 1);
      c.beginPath(); c.arc(r.x * scale + ox, r.y * scale + oy, (r.r0 + (r.r1 - r.r0) * e) * scale, 0, TAU); c.stroke();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of w.texts) {
      const a = Math.max(0, Math.min(1, (now - t.t0) / t.dur));
      c.globalAlpha = 1 - a * a; c.font = `800 ${t.size}px Rajdhani, system-ui, sans-serif`;
      const x = t.x * scale + ox, y = t.y * scale + oy - a * 50;
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,10,0.7)'; c.strokeText(t.str, x, y);
      c.fillStyle = hsl(t.hue, 95, 72); c.fillText(t.str, x, y);
    }
    c.globalAlpha = 1;

    // Pfeil zum Ball
    if (w.ball) {
      const bx = w.ball.x * scale + ox, by = w.ball.y * scale + oy;
      if (bx < 0 || bx > W || by < 0 || by > H) this.arrow(c, bx, by, '#ffffff', '⚽');
    }

    if (hiq) c.drawImage(this.vignette, 0, 0, W, H);

    // Steuerknüppel
    if (joy && joy.active) {
      c.globalAlpha = 0.5; c.strokeStyle = '#cfe2ff'; c.lineWidth = 2; c.beginPath(); c.arc(joy.ox, joy.oy, joy.rad, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(160,200,255,0.12)'; c.fill();
      c.globalAlpha = 0.85; const g = c.createRadialGradient(joy.x - 6, joy.y - 6, 2, joy.x, joy.y, 26); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#7fb2ff');
      c.fillStyle = g; c.beginPath(); c.arc(joy.x, joy.y, 24, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
  }

  arrow(c, tx, ty, color, label) {
    const W = this.W, H = this.H, cx = W / 2, cy = H / 2, m = 46;
    const dx = tx - cx, dy = ty - cy;
    const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = color; c.globalAlpha = 0.9; c.beginPath(); c.moveTo(20, 0); c.lineTo(4, -11); c.lineTo(4, 11); c.closePath(); c.fill();
    c.rotate(-a); c.globalAlpha = 1; c.font = '20px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, -Math.cos(a) * 12, -Math.sin(a) * 12);
    c.restore();
  }

  drawPitch(c, scale, ox, oy) {
    const w = this.world, mx = w.w / 2, my = w.h / 2;
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = Math.max(1.5, 6 * scale);
    c.beginPath(); c.moveTo(mx * scale + ox, oy); c.lineTo(mx * scale + ox, w.h * scale + oy); c.stroke();
    c.beginPath(); c.arc(mx * scale + ox, my * scale + oy, 380 * scale, 0, TAU); c.stroke();
    for (const side of [0, 1]) {
      const hue = TEAM_COLORS[side].hue;
      const gx = side === 0 ? -170 : w.w, gy = my - GOAL_HALF;
      const x = gx * scale + ox, y = gy * scale + oy, gw = 170 * scale, gh = GOAL_HALF * 2 * scale;
      c.fillStyle = hsl(hue, 80, 50, 0.22); c.fillRect(x, y, gw, gh);
      c.strokeStyle = hsl(hue, 85, 70, 0.35); c.lineWidth = 1; c.beginPath();
      const stp = Math.max(8, 42 * scale);
      for (let i = stp; i < gw; i += stp) { c.moveTo(x + i, y); c.lineTo(x + i, y + gh); }
      for (let i = stp; i < gh; i += stp) { c.moveTo(x, y + i); c.lineTo(x + gw, y + i); }
      c.stroke();
      c.strokeStyle = hsl(hue, 90, 68); c.lineWidth = Math.max(2, 9 * scale); c.strokeRect(x, y, gw, gh);
      const bx = (side === 0 ? 0 : w.w - 520) * scale + ox;
      c.strokeStyle = hsl(hue, 85, 70, 0.3); c.lineWidth = Math.max(1.5, 6 * scale); c.strokeRect(bx, (my - GOAL_HALF - 220) * scale + oy, 520 * scale, (GOAL_HALF * 2 + 440) * scale);
    }
  }

  drawBall(c, scale, ox, oy) {
    const b = this.world.ball, x = b.x * scale + ox, y = b.y * scale + oy, r = b.r * scale;
    c.drawImage(this.glow, x - r * 1.5, y - r * 1.5, r * 3, r * 3);
    c.save(); c.translate(x, y); c.rotate(b.rot); c.drawImage(this.ballSprite, -r, -r, r * 2, r * 2); c.restore();
  }

  drawCell(c, n, now, scale, ox, oy, hiq, leader, teamMode, myTeam) {
    const w = this.world, p = w.players.get(n.pid) || { name: '', skin: 0, hue: 200, team: 0 };
    const x = n.x * scale + ox, y = n.y * scale + oy, r = n.r * scale;
    if (r < 1.2) return;
    const f = n.f, mine = n.pid === w.me;
    const tex = skinTexture(p.skin, p.hue);
    let alpha = 1;
    if (f & F_GHOST) alpha = 0.38; else if (f & F_HIDDEN) alpha = 0.8;
    if (hiq && r > 14 && alpha === 1) { c.globalAlpha = mine ? 0.5 : 0.28; c.drawImage(this.glow, x - r * 1.32, y - r * 1.32, r * 2.64, r * 2.64); }
    c.globalAlpha = alpha;
    const wob = hiq ? 1 + 0.018 * Math.sin(now * 0.0045 + n.seed) : 1;
    const vx = ((n.tx - n.sx) / n.dur) * 1000, vy = ((n.ty - n.sy) / n.dur) * 1000, sq = Math.min(0.17, Math.hypot(vx, vy) / 8000);
    if (hiq && sq > 0.025 && r > 6) {
      const a = Math.atan2(vy, vx);
      c.save(); c.translate(x, y); c.rotate(a); c.scale(1 + sq, 1 - sq * 0.75); c.rotate(-a); c.drawImage(tex, -r, -r, r * 2, r * 2); c.restore();
    } else c.drawImage(tex, x - r * wob, y - r / wob, r * 2 * wob, (r * 2) / wob);
    if (mine && this.aim && r > 8) {
      const am = Math.hypot(this.aim.ax, this.aim.ay);
      if (am > 0.1) {
        const a = Math.atan2(this.aim.ay, this.aim.ax), d = r + Math.max(7, r * 0.16), sz = Math.max(6, Math.min(16, r * 0.2));
        c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); c.rotate(a);
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.moveTo(sz, 0); c.lineTo(-sz * 0.5, -sz * 0.7); c.lineTo(-sz * 0.15, 0); c.lineTo(-sz * 0.5, sz * 0.7); c.closePath(); c.fill(); c.restore();
      }
    }
    c.globalAlpha = 1;
    if (teamMode && r > 6) { c.strokeStyle = hsl(TEAM_COLORS[p.team].hue, 95, p.team === myTeam ? 78 : 60); c.lineWidth = Math.max(1.5, r * 0.07); c.beginPath(); c.arc(x, y, r * 0.97, 0, TAU); c.stroke(); }
    if (f & F_FROZEN) { c.fillStyle = 'rgba(170,225,255,0.5)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = '#e6f7ff'; c.lineWidth = 2; c.stroke(); }
    if (f & F_SHIELD) { c.strokeStyle = 'rgba(110,220,255,0.35)'; c.lineWidth = Math.max(4, r * 0.2); c.beginPath(); c.arc(x, y, r * 1.1, 0, TAU); c.stroke(); c.strokeStyle = '#bdf1ff'; c.lineWidth = 2; c.stroke(); }
    if (f & F_PROT) { c.strokeStyle = `rgba(255,255,255,${0.45 + 0.35 * Math.sin(now * 0.012)})`; c.lineWidth = 2; c.setLineDash([6, 6]); c.lineDashOffset = now * 0.02; c.beginPath(); c.arc(x, y, r + 5, 0, TAU); c.stroke(); c.setLineDash([]); }
    if (f & F_TURBO) { c.strokeStyle = 'rgba(255,225,80,0.85)'; c.lineWidth = Math.max(2, r * 0.08); const a = now * 0.012; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x, y, r * 1.08, a + i * 2.094, a + i * 2.094 + 0.9); c.stroke(); } }
    if (f & F_MAGNET) { c.strokeStyle = 'rgba(90,255,220,0.3)'; c.lineWidth = 1.5; c.setLineDash([4, 8]); c.lineDashOffset = now * 0.04; c.beginPath(); c.arc(x, y, (n.r + 230) * scale, 0, TAU); c.stroke(); c.setLineDash([]); }

    if (r > 15) {
      let fs = Math.max(11, Math.min(46, r * 0.36));
      if (p.name) { const tw = this.nameWidth(c, p.name) * fs; if (tw > r * 1.86) fs = Math.max(9, (fs * r * 1.86) / tw); }
      c.font = `700 ${fs}px Rajdhani, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const showMass = this.settings.showMass && r > 24;
      const ny = showMass ? y - fs * 0.32 : y;
      if (this.settings.showNames && p.name) {
        c.lineWidth = Math.max(2.5, fs * 0.16); c.strokeStyle = 'rgba(0,0,12,0.75)'; c.lineJoin = 'round';
        c.strokeText(p.name, x, ny); c.fillStyle = '#fff'; c.fillText(p.name, x, ny);
      }
      if (showMass) {
        const ms = fs * 0.66; c.font = `600 ${ms}px Rajdhani, system-ui, sans-serif`;
        const txt = String(Math.round((n.r * n.r) / 25));
        c.lineWidth = Math.max(2, ms * 0.16); c.strokeStyle = 'rgba(0,0,12,0.7)'; c.strokeText(txt, x, ny + fs * 0.78);
        c.fillStyle = 'rgba(255,255,255,0.88)'; c.fillText(txt, x, ny + fs * 0.78);
      }
    }
    if (n.id === this.crownCell && r > 12) { const cs = Math.max(14, r * 0.55); c.font = `${cs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('👑', x, y - r * 0.9); }
    const em = w.emotes.get(n.pid);
    if (em && em.cell === n.id) {
      const a = Math.max(0.01, Math.min(1, (now - em.t0) / 150)), s = Math.max(26, r * 0.7) * a, by = y - r - s * 0.75;
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(x, by, s * 0.72, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(x - s * 0.2, by + s * 0.6); c.lineTo(x, by + s * 1.0); c.lineTo(x + s * 0.2, by + s * 0.6); c.fill();
      c.font = `${s * 0.85}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(EMOTES[em.n] || '😀', x, by + s * 0.05);
    }
  }

  nameWidth(c, name) {
    if (!this.nw) this.nw = new Map();
    let v = this.nw.get(name);
    if (v === undefined) { c.font = '700 100px Rajdhani, system-ui, sans-serif'; v = c.measureText(name).width / 100; this.nw.set(name, v); if (this.nw.size > 300) this.nw.clear(); }
    return v;
  }

  drawMinimap(mc, size) {
    const w = this.world, c = mc.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ar = w.w / w.h, mw = ar >= 1 ? size : size * ar, mh = ar >= 1 ? size / ar : size;
    if (mc.width !== Math.round(mw * dpr) || mc.height !== Math.round(mh * dpr)) { mc.width = Math.round(mw * dpr); mc.height = Math.round(mh * dpr); mc.style.width = mw + 'px'; mc.style.height = mh + 'px'; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, mw, mh);
    c.fillStyle = 'rgba(8,10,26,0.72)'; c.fillRect(0, 0, mw, mh);
    const k = mw / w.w;
    if (w.zone) { c.strokeStyle = '#ff7088'; c.lineWidth = 1.5; c.beginPath(); c.arc(w.zone.x * k, w.zone.y * k, w.zone.r * k, 0, TAU); c.stroke(); }
    const me = w.players.get(w.me), teamMode = w.opts && isTeamMode(w.opts.mode);
    if (w.info && w.info.mm) {
      const leader = w.info.lb && w.info.lb[0] ? w.info.lb[0][0] : 0;
      for (const [pid, x, y, s] of w.info.mm) {
        if (pid === w.me) continue;
        const p = w.players.get(pid); if (!p) continue;
        const mate = teamMode && me && p.team === me.team;
        if (!mate && pid !== leader && !teamMode) continue;
        c.fillStyle = teamMode ? hsl(TEAM_COLORS[p.team].hue, 90, 62, mate ? 1 : 0.55) : '#ffd23a';
        c.beginPath(); c.arc(x * k, y * k, Math.max(2, Math.min(7, s * 0.09)), 0, TAU); c.fill();
      }
    }
    if (w.ball) { c.fillStyle = '#fff'; c.beginPath(); c.arc(w.ball.x * k, w.ball.y * k, 3.5, 0, TAU); c.fill(); }
    for (const [wx, wy] of w.worms) { c.strokeStyle = '#6fffe6'; c.lineWidth = 1.5; c.beginPath(); c.arc(wx * k, wy * k, 2.6, 0, TAU); c.stroke(); }
    for (const f of w.flags) { c.fillStyle = hsl(TEAM_COLORS[f.team].hue, 95, 65); c.fillRect(f.x * k - 3, f.y * k - 3, 6, 6); c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(f.x * k - 3, f.y * k - 3, 6, 6); }
    const cam = w.cam, vw = cam.viewW * k, vh = vw * (Math.min(this.W, this.H) / Math.max(this.W, this.H));
    c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1;
    const rw = this.W >= this.H ? vw : vh, rh = this.W >= this.H ? vh : vw;
    c.strokeRect(cam.x * k - rw / 2, cam.y * k - rh / 2, rw, rh);
    if (w.myCells) { c.fillStyle = '#fff'; c.beginPath(); c.arc(w.myX * k, w.myY * k, 3.2, 0, TAU); c.fill(); c.strokeStyle = me ? hsl(me.hue, 90, 60) : '#8fd0ff'; c.lineWidth = 2; c.stroke(); }
    c.strokeStyle = 'rgba(143,208,255,0.7)'; c.lineWidth = 1.5; c.strokeRect(0.75, 0.75, mw - 1.5, mh - 1.5);
  }
}
