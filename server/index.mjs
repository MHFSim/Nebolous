// Sternfresser-Spielserver: liefert das Spiel aus und lässt die Partien selbst laufen.
// Räume werden per 5-stelligem Code betreten, auch mitten in der Partie.
// Der Ersteller darf gehen, der Raum bleibt offen, solange jemand drin ist.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Sim } from '../src/sim.js';
import { encodeSnapshot, encodeDots, decodeInput, MSG_INPUT } from '../src/proto.js';
import { VERSION, TICK_HZ, ROOM_ALPHABET, MAX_HUMANS } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const BASE = normBase(process.env.BASE_PATH ?? '/Sternfresser');
const DIST = path.resolve(process.env.DIST_DIR || path.join(here, '..', 'dist'));
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 40);
const RESUME_SECS = 45; // so lange bleibt ein Spieler nach Verbindungsabbruch im Spiel
const EMPTY_SECS = 90; // so lange bleibt ein leerer Raum offen
const STEP_MS = 1000 / TICK_HZ;

function normBase(b) {
  b = String(b || '').trim().replace(/\/+$/, '');
  if (!b || b === '/') return '';
  return b.startsWith('/') ? b : '/' + b;
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- Statische Dateien ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon',
};
const files = new Map();
function loadFiles() {
  if (!fs.existsSync(DIST)) { console.error(`Ordner ${DIST} fehlt. Erst "npm run build" ausführen.`); process.exit(1); }
  for (const name of fs.readdirSync(DIST)) {
    const full = path.join(DIST, name);
    if (!fs.statSync(full).isFile()) continue;
    const body = fs.readFileSync(full);
    const etag = '"' + crypto.createHash('sha1').update(body).digest('base64').slice(0, 16) + '"';
    files.set('/' + name, { body, etag, type: TYPES[path.extname(name)] || 'application/octet-stream', nocache: name === 'index.html' || name === 'sw.js' || name.endsWith('.webmanifest') });
  }
  files.set('/', files.get('/index.html'));
}

// Pfad ohne Basis (funktioniert mit und ohne vom Proxy entferntes Präfix)
function localPath(p) {
  if (BASE) {
    const lp = p.toLowerCase(), lb = BASE.toLowerCase();
    if (lp === lb) return { redirect: BASE + '/' };
    if (lp.startsWith(lb + '/')) return { path: p.slice(BASE.length) };
  }
  return { path: p };
}

const started = Date.now();
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400).end(); return; }
  let p; try { p = decodeURIComponent(url.pathname); } catch (e) { p = url.pathname; }
  const lp = localPath(p);
  if (lp.redirect) { res.writeHead(301, { Location: lp.redirect + url.search }); res.end(); return; }
  p = lp.path;
  if (p === '/health') {
    let players = 0; for (const r of rooms.values()) players += r.humans();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ sternfresser: true, version: VERSION, rooms: rooms.size, players, uptime: Math.round((Date.now() - started) / 1000) }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const f = files.get(p);
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
  const headers = { 'Content-Type': f.type, ETag: f.etag, 'Cache-Control': f.nocache ? 'no-cache' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, headers); res.end(); return; }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : f.body);
});

// ---------- Räume ----------
const rooms = new Map();
function newCode() {
  for (let t = 0; t < 100; t++) {
    let s = '';
    const b = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) s += ROOM_ALPHABET[b[i] % ROOM_ALPHABET.length];
    if (!rooms.has(s)) return s;
  }
  return null;
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) { try { ws.send(typeof obj === 'string' || obj instanceof Buffer ? obj : JSON.stringify(obj)); } catch (e) { /* ignore */ } } };
const sendBin = (ws, ab) => { if (ws && ws.readyState === 1) { try { ws.send(Buffer.from(ab)); } catch (e) { /* ignore */ } } };

class Room {
  constructor(code, opts) {
    this.code = code;
    this.sim = new Sim(opts);
    this.members = new Map(); // pid -> { ws, key, goneAt, needDots }
    this.owner = 0;
    this.emptySince = 0;
    this.acc = 0; this.last = performance.now();
    this.tableDirty = false;
  }
  humans() { let n = 0; for (const m of this.members.values()) if (m.ws) n++; return n; }

  add(ws, profile) {
    const pid = this.sim.addPlayer({ name: profile.name, skin: profile.skin, hue: profile.hue });
    if (!pid) return null;
    const m = { pid, ws, key: crypto.randomBytes(12).toString('base64url'), goneAt: 0, needDots: false };
    this.members.set(pid, m);
    if (!this.owner) this.owner = pid;
    this.emptySince = 0;
    this.tableDirty = true;
    return m;
  }

  welcome(m) {
    const sim = this.sim;
    send(m.ws, {
      t: 'welcome', pid: m.pid, key: m.key, owner: this.owner, code: this.code, opts: sim.opts, w: sim.w, h: sim.h,
      players: sim.playerTable(), info: sim.info(), worms: sim.worms.map((q) => [Math.round(q.x), Math.round(q.y)]),
    });
    sendBin(m.ws, encodeDots(sim));
  }

  detach(m) {
    if (m.ws === null) return;
    m.ws = null; m.goneAt = Date.now();
    this.sim.setInput(m.pid, 0, 0, false);
    if (!this.humans()) this.emptySince = Date.now();
  }

  remove(pid, why) {
    const m = this.members.get(pid);
    if (!m) return;
    if (why) { send(m.ws, { t: 'bye', why }); const ws = m.ws; setTimeout(() => { try { ws && ws.close(); } catch (e) { /* ignore */ } }, 200); }
    this.members.delete(pid);
    this.sim.removePlayer(pid);
    this.tableDirty = true;
    if (this.owner === pid) {
      // Raumchef geht: an den dienstältesten verbundenen Spieler weitergeben
      this.owner = 0;
      for (const o of this.members.values()) if (o.ws) { this.owner = o.pid; break; }
      if (!this.owner) for (const o of this.members.values()) { this.owner = o.pid; break; }
      this.broadcast({ t: 'owner', pid: this.owner });
    }
    if (!this.humans() && !this.emptySince) this.emptySince = Date.now();
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const m of this.members.values()) if (m.ws && m.ws.readyState === 1) { try { m.ws.send(s); } catch (e) { /* ignore */ } }
  }

  pump(now) {
    this.acc += now - this.last; this.last = now;
    if (this.acc > STEP_MS * 5) this.acc = STEP_MS * 5;
    while (this.acc >= STEP_MS) { this.acc -= STEP_MS; this.tick(); }
    // Abgelaufene Verbindungen entfernen
    const t = Date.now();
    for (const m of [...this.members.values()]) if (!m.ws && t - m.goneAt > RESUME_SECS * 1000) this.remove(m.pid);
  }

  tick() {
    const sim = this.sim;
    sim.step();
    for (const m of this.members.values()) {
      const ws = m.ws, p = sim.players.get(m.pid);
      if (!ws || ws.readyState !== 1 || !p) continue;
      if (ws.bufferedAmount > 512 * 1024) { m.needDots = true; continue; } // langsame Verbindung: Bild auslassen
      if (m.needDots) { m.needDots = false; sendBin(ws, encodeDots(sim)); }
      sendBin(ws, encodeSnapshot(sim, p));
    }
    if (sim.events.length) {
      const all = [], per = new Map();
      for (const e of sim.events) {
        if (e.k === 'join' || e.k === 'leave') this.tableDirty = true;
        if (e.to) { if (!per.has(e.to)) per.set(e.to, []); per.get(e.to).push(e); } else all.push(e);
      }
      for (const m of this.members.values()) {
        const list = per.has(m.pid) ? all.concat(per.get(m.pid)) : all;
        if (list.length) send(m.ws, JSON.stringify({ t: 'ev', e: list }));
      }
      sim.events.length = 0;
    }
    sim.dotEvents.length = 0;
    if (this.tableDirty) { this.tableDirty = false; this.broadcast({ t: 'players', p: sim.playerTable() }); }
    if (sim.tick % 10 === 0) this.broadcast({ t: 'i', i: sim.info() });
  }

  setBots(n) {
    const sim = this.sim;
    n = Math.max(0, Math.min(28, n | 0));
    const bots = [...sim.players.values()].filter((p) => p.bot);
    for (let i = bots.length; i < n; i++) sim.addBot();
    for (let i = n; i < bots.length; i++) sim.removePlayer(bots[i].pid);
    sim.opts.bots = n;
    this.tableDirty = true;
  }
}

// ---------- Verbindungen ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  let p = '';
  try { p = new URL(req.url, 'http://x').pathname; } catch (e) { /* ignore */ }
  const lp = localPath(p);
  if (lp.path !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws, req) => {
  let room = null, m = null, msgs = 0, window0 = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const hello = setTimeout(() => { if (!m) ws.close(); }, 10000);

  ws.on('message', (data, isBinary) => {
    // einfache Flutbremse
    const now = Date.now();
    if (now - window0 > 1000) { window0 = now; msgs = 0; }
    if (++msgs > 120) { ws.close(1008, 'flood'); return; }

    if (isBinary) {
      if (!m || !room) return;
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      if (ab.byteLength < 4 || new Uint8Array(ab)[0] !== MSG_INPUT) return;
      const inp = decodeInput(ab);
      if (inp) room.sim.setInput(m.pid, inp.ax, inp.ay, inp.eject);
      return;
    }
    let msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;

    if (!m) {
      if (msg.v !== VERSION) { send(ws, { t: 'bye', why: 'version' }); return; }
      const profile = { name: String(msg.name || 'Blob').slice(0, 14), skin: msg.skin | 0, hue: msg.hue | 0 };
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'bye', why: 'busy' }); return; }
        const code = newCode();
        if (!code) { send(ws, { t: 'bye', why: 'busy' }); return; }
        room = new Room(code, msg.opts || {});
        rooms.set(code, room);
        m = room.add(ws, profile);
        log(`Raum ${code} erstellt von "${profile.name}" (${room.sim.opts.mode}, ${room.sim.opts.bots} Bots) ${ip}`);
      } else if (msg.t === 'hello' || msg.t === 'resume') {
        room = rooms.get(String(msg.code || '').toUpperCase());
        if (!room) { send(ws, { t: 'bye', why: 'notfound' }); return; }
        if (msg.t === 'resume') {
          const old = [...room.members.values()].find((x) => x.key === msg.key);
          if (!old || !room.sim.players.has(old.pid)) { send(ws, { t: 'bye', why: 'expired' }); room = null; return; }
          if (old.ws && old.ws !== ws) { try { old.ws.close(); } catch (e) { /* ignore */ } }
          m = old; m.ws = ws; m.goneAt = 0; m.needDots = false; room.emptySince = 0;
        } else {
          if (room.humans() >= MAX_HUMANS) { send(ws, { t: 'bye', why: 'full' }); room = null; return; }
          m = room.add(ws, profile);
          if (!m) { send(ws, { t: 'bye', why: 'full' }); room = null; return; }
          log(`"${profile.name}" tritt Raum ${room.code} bei (${room.humans()} Spieler)`);
        }
      } else return;
      clearTimeout(hello);
      room.welcome(m);
      return;
    }

    const sim = room.sim, pid = m.pid;
    switch (msg.t) {
      case 'split': sim.split(pid); break;
      case 'item': sim.useItem(pid); break;
      case 'spawn': sim.requestSpawn(pid); break;
      case 'emote': sim.emote(pid, msg.n); break;
      case 'ping': send(ws, { t: 'pong', ts: msg.ts }); break;
      case 'kick': if (room.owner === pid && msg.pid !== pid && room.members.has(msg.pid | 0)) room.remove(msg.pid | 0, 'kick'); break;
      case 'bots': if (room.owner === pid) room.setBots(msg.n); break;
      case 'leave': room.remove(pid); m = null; ws.close(); break;
    }
  });

  const gone = () => { clearTimeout(hello); if (room && m && m.ws === ws) room.detach(m); };
  ws.on('close', gone);
  ws.on('error', gone);
});

// Herzschlag gegen tote Verbindungen
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }
}, 15000);

// Spielschleife für alle Räume
setInterval(() => {
  const now = performance.now(), t = Date.now();
  for (const [code, room] of rooms) {
    if (room.emptySince && !room.humans() && t - room.emptySince > EMPTY_SECS * 1000) { rooms.delete(code); log(`Raum ${code} geschlossen (leer)`); continue; }
    try { room.pump(now); } catch (e) { console.error(`Fehler in Raum ${code}:`, e); rooms.delete(code); room.broadcast({ t: 'bye', why: 'error' }); }
  }
}, 10);

loadFiles();
server.listen(PORT, HOST, () => log(`Sternfresser-Server läuft auf Port ${PORT}, Pfad ${BASE || '/'}`));
const stop = () => { log('Server wird beendet'); for (const r of rooms.values()) r.broadcast({ t: 'bye', why: 'restart' }); setTimeout(() => process.exit(0), 300); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
