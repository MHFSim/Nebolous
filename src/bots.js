// Computergegner: fliehen, jagen, fressen, Gegenstände nutzen.
import { DT, EAT_RATIO, radiusToMass, GOAL_HALF } from './config.js';

const GRID = 128;

export function botThink(sim, p) {
  const b = p.bot, t = sim.time;
  if (!p.alive) return;
  b.next -= DT; b.splitCd -= DT;
  if (b.next > 0) return;
  const L = b.level;
  b.next = (L === 3 ? 0.16 : L === 2 ? 0.28 : 0.5) + sim.rng() * 0.08;

  let big = p.cells[0], small = p.cells[0];
  for (const c of p.cells) { if (c.m > big.m) big = c; if (c.m < small.m) small = c; }
  if (!big) return;
  const teamMode = sim.teamMode();
  const R = 520 + big.r * 2.2;
  let fx = 0, fy = 0, danger = 0, prey = null, preyScore = 0, preyD = 0;

  for (const c of sim.cells) {
    if (c.pid === p.pid) continue;
    const q = c.p;
    if (teamMode && q.team === p.team) continue;
    if (q.fx.ghost > t) continue;
    const dx = c.x - big.x, dy = c.y - big.y;
    if (dx > R + c.r || dx < -R - c.r || dy > R + c.r || dy < -R - c.r) continue;
    const d = Math.hypot(dx, dy) || 1, edge = d - c.r;
    if (c.m > small.m * EAT_RATIO && !(p.fx.shield > t)) {
      // Bedrohung (auch durch Teilungsangriff)
      const canSplitKill = L >= 2 && c.m / 2 > small.m * EAT_RATIO;
      const reach = canSplitKill ? R : R * 0.65;
      const sense = L === 1 ? reach * 0.6 : reach;
      if (edge < sense) {
        const w = Math.pow(1 - Math.max(0, edge) / sense, 1.5) * (c.m > big.m * EAT_RATIO ? 1 : 0.5);
        fx -= (dx / d) * w; fy -= (dy / d) * w; danger = Math.max(danger, w);
      }
    } else if (big.m > c.m * 1.25 && !c.hidden && !(q.prot > t) && !(q.fx.shield > t)) {
      const s = c.m / (edge + 80);
      if (s > preyScore) { preyScore = s; prey = c; preyD = d; }
    }
  }

  let ax = 0, ay = 0;
  const hm = (h) => radiusToMass(h.r);

  if (danger > 0.08) {
    const m = Math.hypot(fx, fy) || 1;
    ax = fx / m; ay = fy / m;
    // Kleine Bots verstecken sich im Schwarzen Loch
    if (L === 3 && small === big) {
      let best = null, bd = 500;
      for (const h of sim.holes) {
        if (big.r >= h.r * 0.9) continue;
        const d = Math.hypot(h.x - big.x, h.y - big.y);
        if (d < bd && (h.x - big.x) * ax + (h.y - big.y) * ay > -d * 0.3) { bd = d; best = h; }
      }
      if (best) { ax = (best.x - big.x) / (bd || 1); ay = (best.y - big.y) / (bd || 1); }
    }
    if (p.item && danger > 0.35) {
      if (p.item === 2 || p.item === 1 || p.item === 7 || p.item === 8 || p.item === 5 || p.item === 9) { p.dx = ax; p.dy = ay; sim.useItem(p.pid); }
    }
    if (L >= 2 && danger > 0.75 && p.cells.length === 1 && big.m > 80 && b.splitCd <= 0 && sim.rng() < 0.3) { p.dx = ax; p.dy = ay; sim.split(p.pid); b.splitCd = 6; }
  } else if (prey && preyScore > 0.02) {
    const dx = prey.x - big.x, dy = prey.y - big.y;
    ax = dx / preyD; ay = dy / preyD;
    if (L >= 2 && b.splitCd <= 0 && p.cells.length <= (L === 3 ? 4 : 2) && big.m / 2 > prey.m * 1.3 && prey.m > big.m * 0.08) {
      const reach = 300 + big.r * 0.71 * 2.4;
      if (preyD < reach * 0.9 && preyD > big.r * 0.9) { p.dx = ax; p.dy = ay; sim.split(p.pid); b.splitCd = L === 3 ? 2.5 : 5; }
    }
    if (p.item === 5 && preyD < 600) sim.useItem(p.pid);
    if (p.item === 1 && preyD < 500) sim.useItem(p.pid);
  } else {
    // Futter suchen
    let tx = 0, ty = 0, best = 0;
    const gx = (big.x / GRID) | 0, gy = (big.y / GRID) | 0, rad = 3;
    for (let y = gy - rad; y <= gy + rad; y++) for (let x = gx - rad; x <= gx + rad; x++) {
      if (x < 0 || y < 0 || x >= sim.gw || y >= sim.gh) continue;
      const bucket = sim.grid[y * sim.gw + x];
      for (let k = 0; k < bucket.length; k++) {
        const id = bucket[k];
        const dx = sim.dotX[id] - big.x, dy = sim.dotY[id] - big.y;
        const s = sim.dotValue(id) / (dx * dx + dy * dy + 400);
        if (s > best) { best = s; tx = dx; ty = dy; }
      }
    }
    for (const q of sim.pellets) {
      const dx = q.x - big.x, dy = q.y - big.y, d2 = dx * dx + dy * dy;
      if (d2 > 250000) continue;
      const s = 12 / (d2 + 400);
      if (s > best) { best = s; tx = dx; ty = dy; }
    }
    if (!p.item) for (const it of sim.items) {
      const dx = it.x - big.x, dy = it.y - big.y, d2 = dx * dx + dy * dy;
      if (d2 > 360000) continue;
      const s = 30 / (d2 + 400);
      if (s > best) { best = s; tx = dx; ty = dy; }
    }
    if (best > 0) { const m = Math.hypot(tx, ty) || 1; ax = tx / m; ay = ty / m; } else {
      b.wt -= 0.3;
      if (b.wt <= 0) { const a = sim.rng() * 6.283; b.wx = Math.cos(a); b.wy = Math.sin(a); b.wt = 2 + sim.rng() * 3; }
      ax = b.wx; ay = b.wy;
    }
    if (p.item === 6 || p.item === 4 || p.item === 10) sim.useItem(p.pid);
    if (p.item === 3 && p.cells.length > 3) sim.useItem(p.pid);
    if (p.item && sim.rng() < 0.01) sim.useItem(p.pid);
  }

  // Fußball: Ball Richtung gegnerisches Tor schieben
  if (sim.ball && danger < 0.5 && (b.role !== 0 || !prey)) {
    const ball = sim.ball;
    const goalX = p.team === 0 ? sim.w : 0, goalY = sim.h / 2 + (b.role - 1) * GOAL_HALF * 0.4;
    let gx = goalX - ball.x, gy = goalY - ball.y; const gm = Math.hypot(gx, gy) || 1; gx /= gm; gy /= gm;
    const px = ball.x - gx * (ball.r + big.r * 0.8), py = ball.y - gy * (ball.r + big.r * 0.8);
    const dx = px - big.x, dy = py - big.y, d = Math.hypot(dx, dy);
    const dbx = ball.x - big.x, dby = ball.y - big.y, db = Math.hypot(dbx, dby) || 1;
    const behind = dbx * gx + dby * gy > 0;
    if (b.role !== 0 || db < 900) {
      if (d < 60 || (behind && db < ball.r + big.r + 40)) { ax = gx * 0.6 + dbx / db * 0.4; ay = gy * 0.6 + dby / db * 0.4; } else { ax = dx / (d || 1); ay = dy / (d || 1); }
      if (L >= 2 && behind && db < ball.r + big.r + 260 && b.splitCd <= 0 && big.m > 70 && p.cells.length < 3 && (dbx / db) * gx + (dby / db) * gy > 0.85) {
        p.dx = dbx / db; p.dy = dby / db; sim.split(p.pid); b.splitCd = 4;
      }
    }
  }

  // Flaggenjagd
  if (sim.flags && danger < 0.5) {
    const own = sim.flags[p.team], en = sim.flags[1 - p.team];
    let tx = null, ty = 0;
    if (p.hasFlag) { tx = own.hx; ty = own.hy; }
    else if (!own.home && !own.carrier && Math.hypot(own.x - big.x, own.y - big.y) < 1600) { tx = own.x; ty = own.y; }
    else if (own.carrier && (b.role === 0 || Math.hypot(own.x - big.x, own.y - big.y) < 900)) { tx = own.x; ty = own.y; }
    else if (b.role !== 0) { tx = en.x; ty = en.y; }
    if (tx !== null && !(prey && preyScore > 0.5 && !p.hasFlag)) {
      const dx = tx - big.x, dy = ty - big.y, d = Math.hypot(dx, dy);
      if (d > 30) { ax = dx / d; ay = dy / d; }
    }
  }

  // Große Bots meiden Schwarze Löcher
  for (const h of sim.holes) {
    if (big.m <= hm(h) * 1.15) continue;
    const dx = h.x - big.x, dy = h.y - big.y, d = Math.hypot(dx, dy) || 1;
    const lim = big.r + h.r + 70;
    if (d < lim && L >= 2) { const w = (1 - d / lim) * 3 + 0.6; ax -= (dx / d) * w; ay -= (dy / d) * w; }
  }
  // Zone und Ränder
  if (sim.zone) {
    const z = sim.zone, dx = z.x - big.x, dy = z.y - big.y, d = Math.hypot(dx, dy) || 1;
    if (d > z.r - 250 - big.r) { const w = Math.min(3, (d - (z.r - 250 - big.r)) / 150); ax += (dx / d) * w; ay += (dy / d) * w; }
  }
  const mrg = 60 + big.r * 0.5;
  if (big.x < mrg) ax += 0.8; else if (big.x > sim.w - mrg) ax -= 0.8;
  if (big.y < mrg) ay += 0.8; else if (big.y > sim.h - mrg) ay -= 0.8;
  if (L === 1) { ax += (sim.rng() - 0.5) * 0.5; ay += (sim.rng() - 0.5) * 0.5; }

  const m = Math.hypot(ax, ay);
  if (m > 0.01) { p.ax = ax / m; p.ay = ay / m; p.dx = p.ax; p.dy = p.ay; } else { p.ax = 0; p.ay = 0; }
}
