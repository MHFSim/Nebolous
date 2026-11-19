// Binärprotokoll: Sternenstaub-Liste und Snapshots mit Sichtbereich pro Spieler.
import { POS_SCALE, RAD_SCALE, F_HIDDEN, F_SHIELD, F_FROZEN, F_GHOST, F_PROT, F_TURBO, F_MAGNET } from './config.js';

export const MSG_INPUT = 1, MSG_DOTS = 2, MSG_SNAP = 3;

const buf = new ArrayBuffer(1 << 17);
const dv = new DataView(buf);
const P = (v) => Math.max(0, Math.min(65535, Math.round(v * POS_SCALE)));
const Rr = (v) => Math.max(0, Math.min(65535, Math.round(v * RAD_SCALE)));

export function encodeDots(sim) {
  const out = new ArrayBuffer(3 + sim.nDots * 4), d = new DataView(out);
  d.setUint8(0, MSG_DOTS); d.setUint16(1, sim.nDots);
  for (let i = 0; i < sim.nDots; i++) { d.setUint16(3 + i * 4, P(sim.dotX[i])); d.setUint16(5 + i * 4, P(sim.dotY[i])); }
  return out;
}
export function decodeDots(ab) {
  const d = new DataView(ab), n = d.getUint16(1);
  const x = new Float32Array(n), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = d.getUint16(3 + i * 4) / POS_SCALE; y[i] = d.getUint16(5 + i * 4) / POS_SCALE; }
  return { n, x, y };
}

export function encodeInput(ax, ay, eject) {
  const out = new ArrayBuffer(4), d = new DataView(out);
  d.setUint8(0, MSG_INPUT); d.setInt8(1, Math.round(ax * 127)); d.setInt8(2, Math.round(ay * 127)); d.setUint8(3, eject ? 1 : 0);
  return out;
}
export function decodeInput(ab) {
  const d = new DataView(ab);
  if (d.byteLength < 4) return null;
  return { ax: d.getInt8(1) / 127, ay: d.getInt8(2) / 127, eject: !!(d.getUint8(3) & 1) };
}

export function encodeSnapshot(sim, p) {
  const t = sim.time, teamMode = sim.teamMode();
  const half = p.viewW / 2 + 160;
  const x0 = p.cx - half, x1 = p.cx + half, y0 = p.cy - half, y1 = p.cy + half;
  let o = 0;
  dv.setUint8(o, MSG_SNAP); o += 1;
  dv.setUint32(o, sim.tick); o += 4;
  dv.setUint8(o, (sim.ball ? 1 : 0) | (sim.zone ? 2 : 0) | (p.alive ? 4 : 0)); o += 1;
  dv.setUint8(o, p.item); o += 1;
  dv.setUint8(o, Math.min(255, p.mergeSecs)); o += 1;
  dv.setUint16(o, P(p.cx)); o += 2; dv.setUint16(o, P(p.cy)); o += 2;
  dv.setUint16(o, Math.min(65535, Math.round(p.viewW))); o += 2;

  const de = sim.dotEvents, nd = Math.min(de.length, 2000);
  dv.setUint16(o, nd); o += 2;
  for (let i = 0; i < nd; i++) { const id = de[i]; dv.setUint16(o, id); dv.setUint16(o + 2, P(sim.dotX[id])); dv.setUint16(o + 4, P(sim.dotY[id])); o += 6; }

  let cnt = 0; const cntAt = o; o += 2;
  for (const c of sim.cells) {
    if (c.x + c.r < x0 || c.x - c.r > x1 || c.y + c.r < y0 || c.y - c.r > y1) continue;
    const q = c.p;
    const ghost = q.fx.ghost > t;
    if (ghost && q !== p && !(teamMode && q.team === p.team)) continue;
    let f = 0;
    if (c.hidden) f |= F_HIDDEN;
    if (q.fx.shield > t) f |= F_SHIELD;
    if (q.fx.frozen > t) f |= F_FROZEN;
    if (ghost) f |= F_GHOST;
    if (q.prot > t) f |= F_PROT;
    if (q.fx.turbo > t) f |= F_TURBO;
    if (q.fx.magnet > t) f |= F_MAGNET;
    dv.setUint16(o, c.id); dv.setUint8(o + 2, c.pid); dv.setUint16(o + 3, P(c.x)); dv.setUint16(o + 5, P(c.y));
    dv.setUint16(o + 7, Rr(c.r)); dv.setUint8(o + 9, f); o += 10; cnt++;
    if (cnt >= 2000) break;
  }
  dv.setUint16(cntAt, cnt);

  cnt = 0; const pAt = o; o += 2;
  for (const q of sim.pellets) {
    if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
    dv.setUint16(o, q.id); dv.setUint16(o + 2, P(q.x)); dv.setUint16(o + 4, P(q.y)); dv.setUint8(o + 6, (q.hue / 2) | 0); o += 7; cnt++;
  }
  dv.setUint16(pAt, cnt);

  cnt = 0; const hAt = o; o += 1;
  for (const h of sim.holes) {
    if (h.x + h.r < x0 || h.x - h.r > x1 || h.y + h.r < y0 || h.y - h.r > y1) continue;
    dv.setUint16(o, h.id); dv.setUint16(o + 2, P(h.x)); dv.setUint16(o + 4, P(h.y)); dv.setUint16(o + 6, Rr(h.r)); o += 8; cnt++;
    if (cnt >= 255) break;
  }
  dv.setUint8(hAt, cnt);

  cnt = 0; const iAt = o; o += 1;
  for (const it of sim.items) {
    if (it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
    dv.setUint16(o, it.id); dv.setUint16(o + 2, P(it.x)); dv.setUint16(o + 4, P(it.y)); dv.setUint8(o + 6, it.type); o += 7; cnt++;
    if (cnt >= 255) break;
  }
  dv.setUint8(iAt, cnt);

  if (sim.ball) { dv.setUint16(o, P(sim.ball.x)); dv.setUint16(o + 2, P(sim.ball.y)); dv.setUint16(o + 4, Rr(sim.ball.r)); o += 6; }
  if (sim.zone) { dv.setUint16(o, P(sim.zone.x)); dv.setUint16(o + 2, P(sim.zone.y)); dv.setUint16(o + 4, Math.min(65535, Math.round(sim.zone.r))); o += 6; }
  return buf.slice(0, o);
}

export function decodeSnapshot(ab) {
  const d = new DataView(ab);
  let o = 1;
  const s = {};
  s.tick = d.getUint32(o); o += 4;
  const fl = d.getUint8(o); o += 1;
  s.alive = !!(fl & 4);
  s.item = d.getUint8(o); o += 1;
  s.mergeSecs = d.getUint8(o); o += 1;
  s.cx = d.getUint16(o) / POS_SCALE; s.cy = d.getUint16(o + 2) / POS_SCALE; o += 4;
  s.viewW = d.getUint16(o); o += 2;
  let n = d.getUint16(o); o += 2;
  s.dots = new Array(n);
  for (let i = 0; i < n; i++) { s.dots[i] = [d.getUint16(o), d.getUint16(o + 2) / POS_SCALE, d.getUint16(o + 4) / POS_SCALE]; o += 6; }
  n = d.getUint16(o); o += 2;
  s.cells = new Array(n);
  for (let i = 0; i < n; i++) {
    s.cells[i] = { id: d.getUint16(o), pid: d.getUint8(o + 2), x: d.getUint16(o + 3) / POS_SCALE, y: d.getUint16(o + 5) / POS_SCALE, r: d.getUint16(o + 7) / RAD_SCALE, f: d.getUint8(o + 9) };
    o += 10;
  }
  n = d.getUint16(o); o += 2;
  s.pellets = new Array(n);
  for (let i = 0; i < n; i++) { s.pellets[i] = { id: d.getUint16(o), x: d.getUint16(o + 2) / POS_SCALE, y: d.getUint16(o + 4) / POS_SCALE, hue: d.getUint8(o + 6) * 2 }; o += 7; }
  n = d.getUint8(o); o += 1;
  s.holes = new Array(n);
  for (let i = 0; i < n; i++) { s.holes[i] = { id: d.getUint16(o), x: d.getUint16(o + 2) / POS_SCALE, y: d.getUint16(o + 4) / POS_SCALE, r: d.getUint16(o + 6) / RAD_SCALE }; o += 8; }
  n = d.getUint8(o); o += 1;
  s.items = new Array(n);
  for (let i = 0; i < n; i++) { s.items[i] = { id: d.getUint16(o), x: d.getUint16(o + 2) / POS_SCALE, y: d.getUint16(o + 4) / POS_SCALE, type: d.getUint8(o + 6) }; o += 7; }
  if (fl & 1) { s.ball = { x: d.getUint16(o) / POS_SCALE, y: d.getUint16(o + 2) / POS_SCALE, r: d.getUint16(o + 4) / RAD_SCALE }; o += 6; }
  if (fl & 2) { s.zone = { x: d.getUint16(o) / POS_SCALE, y: d.getUint16(o + 4 - 2) / POS_SCALE, r: d.getUint16(o + 4) }; o += 6; }
  return s;
}
