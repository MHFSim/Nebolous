// Sitzungen: HostSession simuliert und verteilt, ClientSession verbindet sich per Raumcode.
// Beide liefern dem Spiel dieselben Rückrufe (welcome, dots, snap, info, players, events, close).
import { Sim } from './sim.js';
import { encodeSnapshot, decodeSnapshot, encodeDots, decodeDots, encodeInput, decodeInput, MSG_INPUT, MSG_DOTS, MSG_SNAP } from './proto.js';
import { VERSION, TICK_HZ, ROOM_ALPHABET, PEER_PREFIX, MAX_HUMANS } from './config.js';

export function makeCode() {
  let s = '';
  const a = new Uint32Array(5);
  (globalThis.crypto || { getRandomValues: (x) => { for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 ** 32; } }).getRandomValues(a);
  for (let i = 0; i < 5; i++) s += ROOM_ALPHABET[a[i] % ROOM_ALPHABET.length];
  return s;
}
export function cleanCode(s) {
  return [...String(s || '').toUpperCase()].filter((ch) => ROOM_ALPHABET.includes(ch)).join('').slice(0, 5);
}

function peerOptions() {
  const o = { debug: 0 };
  try {
    const sig = new URLSearchParams(location.search).get('signal');
    if (sig) { const [host, port] = sig.split(':'); o.host = host; o.port = +(port || 9000); o.secure = false; o.path = '/'; }
  } catch (e) { /* ignore */ }
  return o;
}
export function netAvailable() {
  return typeof globalThis.Peer === 'function' && typeof globalThis.RTCPeerConnection === 'function';
}

function makeTicker(fn, ms) {
  // Worker-Takt läuft auch weiter, wenn der Tab im Hintergrund ist.
  let worker = null, timer = null;
  try {
    const src = `let t=null;onmessage=e=>{if(e.data==='stop'){clearInterval(t)}else{t=setInterval(()=>postMessage(0),${ms})}}`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = fn;
    worker.onerror = () => { if (!timer) timer = setInterval(fn, ms); };
    worker.postMessage('go');
  } catch (e) { timer = setInterval(fn, ms); }
  return () => { if (worker) { try { worker.postMessage('stop'); worker.terminate(); } catch (e) { /* ignore */ } } if (timer) clearInterval(timer); };
}

export class HostSession {
  constructor(opts, profile, h) {
    this.h = h; this.isHost = true; this.code = ''; this.online = false;
    this.sim = new Sim(opts);
    this.conns = new Map(); // pid -> conn
    this.pid = this.sim.addPlayer(profile);
    this.closed = false; this.ping = 0;
    this.acc = 0; this.last = performance.now(); this.tableDirty = false;
  }

  start() {
    const sim = this.sim;
    this.h.welcome({ pid: this.pid, opts: sim.opts, w: sim.w, h: sim.h, players: sim.playerTable(), host: true });
    this.h.dots(decodeDots(encodeDots(sim)));
    sim.events.length = 0;
    this.stopTicker = makeTicker(() => this.pump(), 1000 / TICK_HZ);
  }

  // Raum öffnen: liefert Promise mit Code
  openRoom() {
    return new Promise((resolve, reject) => {
      if (!netAvailable()) return reject(new Error('nonet'));
      let tries = 0, done = false;
      const attempt = () => {
        const code = makeCode();
        let peer;
        try { peer = new globalThis.Peer(PEER_PREFIX + code, peerOptions()); } catch (e) { return reject(e); }
        const timer = setTimeout(() => { if (!done) { done = true; try { peer.destroy(); } catch (e) { /* ignore */ } reject(new Error('timeout')); } }, 12000);
        peer.on('open', () => {
          if (done) return; done = true; clearTimeout(timer);
          this.peer = peer; this.code = code; this.online = true;
          peer.on('connection', (c) => this.onConn(c));
          peer.on('disconnected', () => { if (!this.closed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
          resolve(code);
        });
        peer.on('error', (err) => {
          if (done) { return; }
          clearTimeout(timer);
          try { peer.destroy(); } catch (e) { /* ignore */ }
          if (err && err.type === 'unavailable-id' && tries++ < 4) return attempt();
          done = true; reject(err);
        });
      };
      attempt();
    });
  }

  humans() { let n = 0; for (const p of this.sim.players.values()) if (!p.bot) n++; return n; }

  onConn(conn) {
    let pid = 0;
    const kill = setTimeout(() => { if (!pid) { try { conn.close(); } catch (e) { /* ignore */ } } }, 10000);
    conn.on('data', (data) => {
      if (this.closed) return;
      if (typeof data !== 'string') {
        if (!pid) return;
        let ab = data;
        if (ab && ab.buffer && !(ab instanceof ArrayBuffer)) ab = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
        if (!(ab instanceof ArrayBuffer) || ab.byteLength < 4) return;
        if (new Uint8Array(ab)[0] !== MSG_INPUT) return;
        const inp = decodeInput(ab);
        if (inp) this.sim.setInput(pid, inp.ax, inp.ay, inp.eject);
        return;
      }
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') {
        if (pid) return;
        if (m.v !== VERSION) { conn.send(JSON.stringify({ t: 'bye', why: 'version' })); return; }
        if (this.humans() >= MAX_HUMANS) { conn.send(JSON.stringify({ t: 'bye', why: 'full' })); return; }
        pid = this.sim.addPlayer({ name: m.name, skin: m.skin, hue: m.hue });
        if (!pid) { conn.send(JSON.stringify({ t: 'bye', why: 'full' })); return; }
        clearTimeout(kill);
        this.conns.set(pid, conn); conn._pid = pid; conn._needDots = false;
        const sim = this.sim;
        conn.send(JSON.stringify({ t: 'welcome', pid, opts: sim.opts, w: sim.w, h: sim.h, players: sim.playerTable(), code: this.code, info: sim.info() }));
        conn.send(encodeDots(sim));
        this.tableDirty = true;
      } else if (!pid) return;
      else if (m.t === 'split') this.sim.split(pid);
      else if (m.t === 'item') this.sim.useItem(pid);
      else if (m.t === 'spawn') this.sim.requestSpawn(pid);
      else if (m.t === 'emote') this.sim.emote(pid, m.n);
      else if (m.t === 'ping') conn.send(JSON.stringify({ t: 'pong', ts: m.ts }));
    });
    const gone = () => { clearTimeout(kill); if (pid && this.conns.get(pid) === conn) { this.conns.delete(pid); this.sim.removePlayer(pid); this.tableDirty = true; } pid = 0; };
    conn.on('close', gone); conn.on('error', gone);
  }

  pump() {
    if (this.closed) return;
    const now = performance.now();
    this.acc += now - this.last; this.last = now;
    const step = 1000 / TICK_HZ;
    if (this.acc > step * 5) this.acc = step * 5;
    while (this.acc >= step - 2) { this.acc -= step; this.tickOnce(); if (this.acc < 0) this.acc = 0; }
  }

  tickOnce() {
    const sim = this.sim;
    sim.step();
    const me = sim.players.get(this.pid);
    if (me) this.h.snap(decodeSnapshot(encodeSnapshot(sim, me)));
    for (const [pid, conn] of this.conns) {
      const p = sim.players.get(pid);
      if (!p || !conn.open) continue;
      const dc = conn.dataChannel;
      if (dc && dc.bufferedAmount > 400000) { conn._needDots = true; continue; }
      try {
        if (conn._needDots) { conn._needDots = false; conn.send(encodeDots(sim)); }
        conn.send(encodeSnapshot(sim, p));
      } catch (e) { /* Verbindung bricht gerade ab */ }
    }
    // Ereignisse verteilen
    if (sim.events.length) {
      const all = [], per = new Map();
      for (const e of sim.events) {
        if (e.k === 'join' || e.k === 'leave') this.tableDirty = true;
        if (e.to) { if (!per.has(e.to)) per.set(e.to, []); per.get(e.to).push(e); } else all.push(e);
      }
      const mine = all.concat(per.get(this.pid) || []);
      if (mine.length) this.h.events(mine);
      for (const [pid, conn] of this.conns) {
        const list = all.concat(per.get(pid) || []);
        if (list.length && conn.open) { try { conn.send(JSON.stringify({ t: 'ev', e: list })); } catch (e) { /* ignore */ } }
      }
      sim.events.length = 0;
    }
    sim.dotEvents.length = 0;
    if (this.tableDirty) { this.tableDirty = false; const tb = sim.playerTable(); this.h.players(tb); this.broadcast({ t: 'players', p: tb }); }
    if (sim.tick % 10 === 0) { const info = sim.info(); this.h.info(info); this.broadcast({ t: 'i', i: info }); }
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const conn of this.conns.values()) if (conn.open) { try { conn.send(s); } catch (e) { /* ignore */ } }
  }

  kick(pid) {
    const conn = this.conns.get(pid);
    if (conn) { try { conn.send(JSON.stringify({ t: 'bye', why: 'kick' })); } catch (e) { /* ignore */ } setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 200); }
    else if (pid !== this.pid) { this.sim.removePlayer(pid); }
  }
  setBots(n) {
    const sim = this.sim;
    const bots = [...sim.players.values()].filter((p) => p.bot);
    for (let i = bots.length; i < n; i++) sim.addBot();
    for (let i = n; i < bots.length; i++) sim.removePlayer(bots[i].pid);
    sim.opts.bots = n;
  }

  input(ax, ay, eject) { this.sim.setInput(this.pid, ax, ay, eject); }
  split() { this.sim.split(this.pid); }
  item() { this.sim.useItem(this.pid); }
  spawn() { this.sim.requestSpawn(this.pid); }
  emote(n) { this.sim.emote(this.pid, n); }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.stopTicker) this.stopTicker();
    this.broadcast({ t: 'bye', why: 'host' });
    const peer = this.peer;
    if (peer) setTimeout(() => { try { peer.destroy(); } catch (e) { /* ignore */ } }, 300);
  }
}

export class ClientSession {
  constructor(code, profile, h) {
    this.h = h; this.isHost = false; this.code = code; this.profile = profile; this.online = true;
    this.closed = false; this.ping = 0; this.welcomed = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (!netAvailable()) return reject(new Error('nonet'));
      let settled = false;
      const fail = (why) => { if (!settled) { settled = true; clearTimeout(timer); this.shutdown(); reject(new Error(why)); } };
      const timer = setTimeout(() => fail('timeout'), 15000);
      let peer;
      try { peer = new globalThis.Peer(undefined, peerOptions()); } catch (e) { return fail('nonet'); }
      this.peer = peer;
      peer.on('error', (err) => {
        const type = err && err.type;
        if (!settled) fail(type === 'peer-unavailable' ? 'notfound' : (type || 'error'));
        else if (type !== 'peer-unavailable' && type !== 'network' && type !== 'disconnected') this.end('error');
      });
      peer.on('disconnected', () => { if (!this.closed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
      peer.on('open', () => {
        const conn = peer.connect(PEER_PREFIX + this.code, { serialization: 'raw', reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          conn.send(JSON.stringify({ t: 'hello', v: VERSION, name: this.profile.name, skin: this.profile.skin, hue: this.profile.hue }));
        });
        conn.on('data', (data) => {
          if (this.closed) return;
          if (typeof data !== 'string') {
            let ab = data;
            if (ab && ab.buffer && !(ab instanceof ArrayBuffer)) ab = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
            if (!(ab instanceof ArrayBuffer) || !this.welcomed) return;
            const type = new Uint8Array(ab)[0];
            try {
              if (type === MSG_SNAP) this.h.snap(decodeSnapshot(ab));
              else if (type === MSG_DOTS) this.h.dots(decodeDots(ab));
            } catch (e) { /* fehlerhaftes Paket überspringen */ }
            return;
          }
          let m; try { m = JSON.parse(data); } catch (e) { return; }
          if (m.t === 'welcome') {
            this.welcomed = true; this.pid = m.pid;
            this.h.welcome({ pid: m.pid, opts: m.opts, w: m.w, h: m.h, players: m.players, host: false, code: this.code });
            if (m.info) this.h.info(m.info);
            if (!settled) { settled = true; clearTimeout(timer); resolve(); }
            this.pingTimer = setInterval(() => { if (conn.open) conn.send(JSON.stringify({ t: 'ping', ts: performance.now() })); }, 2000);
          } else if (m.t === 'bye') {
            if (!settled) fail(m.why); else this.end(m.why);
          } else if (m.t === 'ev') this.h.events(m.e);
          else if (m.t === 'i') this.h.info(m.i);
          else if (m.t === 'players') this.h.players(m.p);
          else if (m.t === 'pong') this.ping = Math.round(performance.now() - m.ts);
        });
        conn.on('close', () => { if (!settled) fail('closed'); else this.end('lost'); });
        conn.on('error', () => { if (!settled) fail('error'); else this.end('lost'); });
      });
    });
  }

  sendJson(o) { if (this.conn && this.conn.open) { try { this.conn.send(JSON.stringify(o)); } catch (e) { /* ignore */ } } }
  input(ax, ay, eject) { if (this.conn && this.conn.open) { try { this.conn.send(encodeInput(ax, ay, eject)); } catch (e) { /* ignore */ } } }
  split() { this.sendJson({ t: 'split' }); }
  item() { this.sendJson({ t: 'item' }); }
  spawn() { this.sendJson({ t: 'spawn' }); }
  emote(n) { this.sendJson({ t: 'emote', n }); }

  end(why) { if (this.closed) return; this.shutdown(); this.h.close(why); }
  shutdown() {
    this.closed = true;
    clearInterval(this.pingTimer);
    const peer = this.peer;
    try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
    if (peer) setTimeout(() => { try { peer.destroy(); } catch (e) { /* ignore */ } }, 200);
  }
  close() { this.shutdown(); }
}
