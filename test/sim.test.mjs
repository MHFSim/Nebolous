import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { encodeSnapshot, decodeSnapshot, encodeDots, decodeDots, encodeInput, decodeInput } from '../src/proto.js';
import { massToRadius, radiusToMass, START_MASS } from '../src/config.js';

const mk = (o = {}) => new Sim({ bots: 0, items: false, ...o }, 12345);
const run = (s, secs) => { for (let i = 0; i < secs * 25; i++) { s.events.length = 0; s.dotEvents.length = 0; s.step(); } };
const setCell = (c, x, y, m) => { c.x = x; c.y = y; c.m = m; c.r = massToRadius(m); };
const clearHoles = (s) => { s.holes = []; s.holeTarget = 0; };

test('Spieler spawnt und bewegt sich', () => {
  const s = mk(); clearHoles(s);
  const pid = s.addPlayer({ name: 'A' });
  const p = s.players.get(pid);
  assert.equal(p.cells.length, 1);
  assert.equal(p.cells[0].m, START_MASS);
  const x0 = p.cells[0].x;
  s.setInput(pid, 1, 0, false);
  run(s, 1);
  assert.ok(p.cells[0].x > x0 + 100 || p.cells[0].x === s.w, 'bewegt sich nach rechts');
});

test('Sternenstaub fressen lässt wachsen', () => {
  const s = mk(); clearHoles(s);
  const pid = s.addPlayer({ name: 'A' });
  const c = s.players.get(pid).cells[0];
  s.dotX[1] = c.x + 5; s.dotY[1] = c.y; s.grid.forEach((b) => { const k = b.indexOf(1); if (k >= 0) b.splice(k, 1); });
  s.grid[s.gidx(c.x + 5, c.y)].push(1);
  s.dotEvents.length = 0; s.step();
  assert.ok(c.m > START_MASS);
  assert.ok(s.dotEvents.includes(1));
});

test('Großer frisst Kleinen, Kleiner stirbt', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({ name: 'A' }), b = s.addPlayer({ name: 'B' });
  const pa = s.players.get(a), pb = s.players.get(b);
  pa.prot = pb.prot = 0;
  setCell(pa.cells[0], 2000, 2000, 400); setCell(pb.cells[0], 2010, 2000, 100);
  s.step();
  assert.equal(pb.alive, false);
  assert.ok(pa.cells[0].m > 495);
  assert.equal(pa.kills, 1);
  assert.ok(s.events.some((e) => e.k === 'kill' && e.victim === b && e.killer === a));
  // Wiedereinstieg
  s.requestSpawn(b); run(s, 2);
  assert.equal(pb.alive, true);
});

test('Fast gleich große fressen sich nicht, Schutz verhindert Fressen', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({}), b = s.addPlayer({});
  const pa = s.players.get(a), pb = s.players.get(b);
  pa.prot = pb.prot = 0;
  setCell(pa.cells[0], 2000, 2000, 110); setCell(pb.cells[0], 2005, 2000, 100);
  s.step(); assert.equal(pb.alive, true);
  setCell(pa.cells[0], 2000, 2000, 400); setCell(pb.cells[0], 2005, 2000, 100);
  pb.fx.shield = s.time + 5;
  s.step(); assert.equal(pb.alive, true);
});

test('Spalten und Wiederverschmelzen', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({});
  const p = s.players.get(a);
  setCell(p.cells[0], 3000, 3000, 200);
  s.setInput(a, 1, 0, false);
  s.split(a); s.step();
  assert.equal(p.cells.length, 2);
  assert.ok(Math.abs(p.cells[0].m + p.cells[1].m - 200) < 3);
  run(s, 1);
  const d = Math.abs(p.cells[0].x - p.cells[1].x);
  assert.ok(d > 100, 'Teile fliegen auseinander: ' + d);
  s.split(a); s.step();
  assert.equal(p.cells.length, 4);
  s.setInput(a, 0, 0, false);
  for (const c of p.cells) c.mergeAt = 0;
  s.setInput(a, 1, 0, false);
  run(s, 12);
  assert.equal(p.cells.length, 1, 'wieder verschmolzen');
});

test('Maximale Teilezahl wird eingehalten', () => {
  const s = mk({ maxCells: 8 }); clearHoles(s);
  const a = s.addPlayer({});
  const p = s.players.get(a);
  setCell(p.cells[0], 3000, 3000, 5000);
  for (let i = 0; i < 6; i++) { s.split(a); s.step(); }
  assert.equal(p.cells.length, 8);
});

test('Masse auswerfen und wieder einsammeln', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({});
  const p = s.players.get(a);
  setCell(p.cells[0], 3000, 3000, 100);
  s.setInput(a, 1, 0, true); s.step();
  assert.equal(s.pellets.length, 1);
  assert.ok(p.cells[0].m < 90);
  s.setInput(a, 0, 0, false);
  run(s, 1);
  assert.ok(s.pellets[0].x > 3000 + 150);
});

test('Schwarzes Loch: Große zerplatzen, Kleine sind versteckt', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({}), b = s.addPlayer({}), c = s.addPlayer({});
  const pa = s.players.get(a), pb = s.players.get(b), pc = s.players.get(c);
  pa.prot = pb.prot = pc.prot = 0;
  s.holes.push({ id: s.newId(), x: 1000, y: 1000, vx: 0, vy: 0, r: 80 });
  s.holes.push({ id: s.newId(), x: 3000, y: 3000, vx: 0, vy: 0, r: 80 });
  setCell(pa.cells[0], 1000, 1000, 1000);
  setCell(pb.cells[0], 3000, 3000, 60);
  setCell(pc.cells[0], 3010, 3000, 5000);
  s.holes[1].r = 80; s.step();
  assert.ok(pc.cells.length > 4);
  assert.ok(pa.cells.length > 4, 'zerplatzt in ' + pa.cells.length);
  assert.equal(s.holes.length, 0);
  // pc ist riesig und überdeckt das Loch → platzt selbst, pb überlebt den Tick
  assert.equal(pb.alive, true);
});

test('Auswurf schiebt Schwarzes Loch', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({});
  const p = s.players.get(a);
  setCell(p.cells[0], 1000, 1000, 150);
  s.holes.push({ id: s.newId(), x: 1300, y: 1000, vx: 0, vy: 0, r: 80 });
  s.setInput(a, 1, 0, true); run(s, 0.5); s.setInput(a, 0, 0, false); run(s, 1.5);
  assert.ok(s.holes[0].x > 1310, 'Loch bewegt: ' + s.holes[0].x);
});

test('Gegenstände wirken', () => {
  const s = mk(); clearHoles(s);
  const a = s.addPlayer({}), b = s.addPlayer({});
  const pa = s.players.get(a), pb = s.players.get(b);
  setCell(pa.cells[0], 1000, 1000, 200); setCell(pb.cells[0], 1300, 1000, 200);
  pa.prot = pb.prot = 0; s.step();
  pa.item = 6; s.useItem(a); assert.ok(pa.cells[0].m > 235);
  pa.item = 5; s.useItem(a); assert.ok(pb.fx.frozen > s.time);
  pa.item = 8; s.useItem(a); assert.ok(pb.cells[0].vx > 500); assert.ok(pb.cells[0].m < 200);
  pa.item = 2; s.useItem(a); assert.ok(pa.fx.shield > s.time);
  assert.equal(pa.item, 0);
});

test('Teams: Teamkollegen fressen sich nicht, Teams werden ausgeglichen', () => {
  const s = mk({ mode: 'teams', teams: 2 }); clearHoles(s);
  const ids = [s.addPlayer({}), s.addPlayer({}), s.addPlayer({}), s.addPlayer({})];
  const ps = ids.map((i) => s.players.get(i));
  assert.equal(ps.filter((p) => p.team === 0).length, 2);
  const [x, y] = ps.filter((p) => p.team === 0);
  x.prot = y.prot = 0;
  setCell(x.cells[0], 2000, 2000, 500); setCell(y.cells[0], 2005, 2000, 50);
  s.step();
  assert.equal(y.alive, true);
});

test('Zeitrunde endet und startet neu', () => {
  const s = mk({ roundTime: 1 }); clearHoles(s);
  const a = s.addPlayer({ name: 'A' });
  let ended = false;
  for (let i = 0; i < 62 * 25; i++) { s.events.length = 0; s.step(); if (s.events.some((e) => e.k === 'round')) ended = true; }
  assert.ok(ended); assert.equal(s.phase, 'ended');
  run(s, 13);
  assert.equal(s.phase, 'play');
  assert.equal(s.players.get(a).alive, true);
});

test('Battle Royale: Zone schrumpft, einer gewinnt, neue Runde', () => {
  const s = new Sim({ mode: 'royale', bots: 6, map: 'klein', items: true }, 7);
  const a = s.addPlayer({ name: 'A' });
  let round = null, started = false;
  for (let i = 0; i < 400 * 25 && !round; i++) {
    s.events.length = 0; s.dotEvents.length = 0; s.step();
    if (s.phase === 'play') started = true;
    for (const e of s.events) if (e.k === 'round') round = e.results;
  }
  assert.ok(started, 'Runde gestartet');
  assert.ok(round, 'Runde beendet');
  assert.equal(round.rows[0].place, 1);
  // Späteinsteiger schaut zu
  run(s, 13); assert.equal(s.phase, 'warmup');
  run(s, 16); assert.equal(s.phase, 'play');
  const late = s.addPlayer({ name: 'Spät' });
  assert.equal(s.players.get(late).alive, false);
});

test('Fußball: Tor zählt', () => {
  const s = mk({ mode: 'soccer' }); clearHoles(s);
  const a = s.addPlayer({});
  const p = s.players.get(a);
  assert.equal(p.team, 0);
  s.ball.x = s.w - 150; s.ball.y = s.h / 2; s.ball.vx = 900; s.ball.last = a;
  let goal = null;
  for (let i = 0; i < 50 && !goal; i++) { s.events.length = 0; s.step(); goal = s.events.find((e) => e.k === 'goal'); }
  assert.ok(goal); assert.equal(goal.team, 0); assert.deepEqual(s.teamGoals, [1, 0]);
  assert.equal(p.goals, 1);
  // Ball prallt außerhalb des Tors ab
  run(s, 3);
  s.ball.x = s.w - 150; s.ball.y = 300; s.ball.vx = 900;
  run(s, 2);
  assert.deepEqual(s.teamGoals, [1, 0]);
  assert.ok(s.ball.x < s.w);
});

test('Bots spielen 3 Minuten stabil und wachsen', () => {
  const s = new Sim({ bots: 20, botLevel: 3, mayhem: true, items: true, map: 'klein' }, 99);
  let kills = 0, maxCells = 0;
  const t0 = Date.now();
  for (let i = 0; i < 180 * 25; i++) {
    s.events.length = 0; s.dotEvents.length = 0; s.step();
    for (const e of s.events) if (e.k === 'kill') kills++;
    maxCells = Math.max(maxCells, s.cells.length);
    if (i % 250 === 0) for (const c of s.cells) { assert.ok(isFinite(c.x) && isFinite(c.y) && isFinite(c.m) && c.m > 0, 'gültige Zelle'); assert.ok(c.x >= 0 && c.x <= s.w && c.y >= 0 && c.y <= s.h); }
  }
  const ms = Date.now() - t0;
  const best = Math.max(...[...s.players.values()].map((p) => p.best));
  console.log(`   Bots: ${kills} Kills, größte Masse ${Math.round(best)}, max. ${maxCells} Zellen, ${(ms / 4500).toFixed(3)} ms/Tick`);
  assert.ok(kills > 5, 'es wird gefressen');
  assert.ok(best > 300, 'Bots wachsen');
  assert.ok(s.used.size < 3000, 'IDs werden freigegeben: ' + s.used.size);
});

test('Protokoll: Snapshot, Staub und Eingabe', () => {
  const s = new Sim({ bots: 10, mode: 'soccer' }, 5);
  const a = s.addPlayer({ name: 'A' });
  run(s, 3);
  s.dotEvents.length = 0; s.dotEvents.push(3, 4);
  const p = s.players.get(a);
  p.item = 4;
  const snap = decodeSnapshot(encodeSnapshot(s, p));
  assert.equal(snap.tick, s.tick);
  assert.equal(snap.item, 4);
  assert.ok(snap.alive);
  const mine = snap.cells.filter((c) => c.pid === a);
  assert.equal(mine.length, p.cells.length);
  assert.ok(Math.abs(mine[0].x - p.cells[0].x) < 0.3 && Math.abs(mine[0].r - p.cells[0].r) < 0.2);
  assert.equal(snap.dots.length, 2);
  assert.ok(snap.ball && Math.abs(snap.ball.x - s.ball.x) < 0.3);
  const dots = decodeDots(encodeDots(s));
  assert.equal(dots.n, s.nDots);
  assert.ok(Math.abs(dots.x[7] - s.dotX[7]) < 0.3);
  const inp = decodeInput(encodeInput(-0.5, 1, true));
  assert.ok(Math.abs(inp.ax + 0.5) < 0.01 && inp.ay === 1 && inp.eject === true);
  // Zone
  const r = new Sim({ mode: 'royale', bots: 3 }, 3);
  const b = r.addPlayer({});
  run(r, 20);
  const zs = decodeSnapshot(encodeSnapshot(r, r.players.get(b)));
  assert.ok(zs.zone && Math.abs(zs.zone.y - r.zone.y) < 0.3 && Math.abs(zs.zone.r - r.zone.r) < 1);
});

test('Spieler entfernen räumt auf, volle Partie ersetzt Bot', () => {
  const s = new Sim({ bots: 28 }, 5);
  for (let i = 0; i < 12; i++) assert.ok(s.addPlayer({ name: 'H' + i }) > 0);
  assert.equal(s.players.size, 40);
  const x = s.addPlayer({ name: 'Neu' });
  assert.ok(x > 0); assert.equal(s.players.size, 40);
  s.removePlayer(x);
  assert.equal(s.players.size, 39);
  assert.ok(!s.cells.some((c) => c.pid === x));
});
