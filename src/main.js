// Verdrahtung: Menüs, HUD, Sitzungen, Spielschleife.
import { Sim } from './sim.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { HostSession, ClientSession, ServerSession, detectServer, cleanCode, netAvailable } from './net.js';
import { encodeSnapshot, decodeSnapshot, encodeDots, decodeDots } from './proto.js';
import { SKINS, skinTexture } from './skins.js';
import { sfx, setSound, unlockAudio } from './audio.js';
import { store, loadStore, saveStore, level, unlock, ACHIEVEMENTS, persistent, dailyMissions, missionProgress, allMissionsDone, MISSION_XP } from './store.js';
import { MODES, MAPS, DEFAULT_OPTS, ITEMS, EMOTES, TEAM_COLORS, xpForLevel, MIN_EJECT_MASS, isTeamMode, CTF_WIN } from './config.js';

loadStore();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmt = (n) => Math.round(n).toLocaleString('de-DE');
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const world = new World();
const cv = $('cv');
const renderer = new Renderer(cv, world, store.settings);
const input = new Input(cv, store.settings);
setSound(store.settings.sound);

let session = null, demo = null, inGame = false, pending = null;
let hostOpts = { ...DEFAULT_OPTS, ...(store.host || {}) };
let setupOnline = false, settingsFrom = 'home', serverMode = false;
const life = { active: false, start: 0, best: 0, kills: 0, bonus: 0 };
let lastDeath = null, roundShown = false, watchMode = false, wasTop = false, streak = 0, streakAt = 0;

// ---------- Bildschirme ----------
const SCREENS = ['home', 'setup', 'join', 'skins', 'profile', 'settings', 'help', 'connect', 'pause', 'death', 'round'];
let current = 'home';
function show(name) {
  current = name;
  for (const s of SCREENS) $('s-' + s).classList.toggle('hidden', s !== name);
  if (name === 'home') refreshHome();
  if (name === 'join') $('join-name').value = store.name;
  if (name === 'skins') buildSkins();
  if (name === 'profile') buildProfile();
  if (name === 'pause') buildPause();
  input.enabled = inGame && !name;
  if (!input.enabled) { input.eject = false; input.joy.active = false; }
}
function toast(html, cls = '') {
  const d = document.createElement('div'); d.innerHTML = html; if (cls) d.className = cls;
  const box = $('toasts'); box.appendChild(d);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => d.remove(), 5000);
}
function banner(html) { const b = $('banner'); b.innerHTML = html; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function feed(html) { const f = $('feed'); const d = document.createElement('div'); d.innerHTML = html; f.appendChild(d); while (f.children.length > 3) f.firstChild.remove(); setTimeout(() => d.remove(), 4000); }
function seg(el, options, get, set) {
  el.innerHTML = '';
  for (const [val, label] of options) {
    const b = document.createElement('button'); b.textContent = label; b.classList.toggle('on', get() === val);
    b.onclick = () => { sfx.click(); set(val); for (const x of el.children) x.classList.remove('on'); b.classList.add('on'); };
    el.appendChild(b);
  }
}
function mission(t, v) {
  for (const text of missionProgress(t, v)) { toast(`✅ Tagesaufgabe geschafft: <b>${esc(text)}</b> +${MISSION_XP} XP`, 'ach'); sfx.ach(); if (allMissionsDone()) achieve('daily'); }
}
function buzz(ms) { try { if (store.settings.vibrate && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } }
function renderDaily() {
  const list = dailyMissions(), done = list.filter((m) => m.done).length;
  $('daily').innerHTML = `<div class="t"><span>Tagesaufgaben</span><b>${done}/3 · je ${MISSION_XP} XP</b></div>` + list.map((m) => `<div class="m${m.done ? ' done' : ''}"><span>${esc(m.text)}</span><b>${m.done ? '✓' : (m.t === 'top' ? '' : Math.floor(m.prog) + '/' + m.goal)}</b></div>`).join('');
}
function achieve(id) { const a = unlock(id); if (a) { toast(`${a.icon} Erfolg: <b>${esc(a.name)}</b>`, 'ach'); sfx.ach(); } }

// ---------- Startseite ----------
function drawSkinPreview(canvas, skin, hue) {
  const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(skinTexture(skin, hue, 160), 0, 0, canvas.width, canvas.height);
}
function levelBar(badge, bar) {
  const l = level(), a = xpForLevel(l), b = xpForLevel(l + 1);
  badge.textContent = 'Lvl ' + l; bar.style.width = Math.max(3, Math.min(100, ((store.xp - a) / (b - a)) * 100)) + '%';
}
function refreshHome() {
  $('name').value = store.name;
  drawSkinPreview($('skin-cv'), store.skin, store.hue);
  levelBar($('lvl-badge'), $('lvl-bar'));
  renderDaily();
  const note = $('net-note');
  if (!serverMode && !netAvailable()) { note.classList.remove('hidden'); note.textContent = 'Mehrspieler ist in dieser Ansicht gesperrt. Solo mit Bots funktioniert.'; } else note.classList.add('hidden');
}
$('name').addEventListener('input', () => { store.name = $('name').value.replace(/[<>]/g, '').slice(0, 14); saveStore(); });
$('name').addEventListener('change', () => { if (!store.name.trim()) { store.name = 'Blob' + (100 + Math.floor(Math.random() * 900)); $('name').value = store.name; saveStore(); } });
$('skin-btn').onclick = () => { sfx.click(); show('skins'); };
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { sfx.click(); if (b.dataset.go === 'settings') openSettings('home'); else show(b.dataset.go); }));
$('go-solo').onclick = () => { unlockAudio(); sfx.click(); setupOnline = false; openSetup(); };
$('go-host').onclick = () => { unlockAudio(); sfx.click(); setupOnline = true; openSetup(); };
$('go-join').onclick = () => { unlockAudio(); sfx.click(); $('join-msg').textContent = ''; show('join'); setTimeout(() => $('join-code').focus(), 50); };

// ---------- Spiel einrichten ----------
const MODE_ICON = { ffa: '🪐', teams: '🤝', royale: '🏆', soccer: '⚽', ctf: '🚩' };
const timed = (m) => m === 'soccer' || m === 'ctf';
function openSetup() {
  $('setup-title').textContent = setupOnline ? (serverMode ? 'Raum erstellen' : 'Spiel hosten') : 'Solo spielen';
  $('setup-start').textContent = setupOnline ? 'Raum erstellen und starten' : "Los geht's";
  const o = hostOpts;
  const vis = () => {
    $('o-map-w').classList.toggle('hidden', timed(o.mode));
    $('o-time-w').classList.toggle('hidden', o.mode === 'royale');
    $('o-teams-w').classList.toggle('hidden', o.mode !== 'teams');
    seg($('o-time'), timed(o.mode) ? [[3, '3 Min'], [5, '5 Min'], [10, '10 Min']] : [[0, 'Endlos'], [3, '3 Min'], [5, '5 Min'], [10, '10 Min']], () => (timed(o.mode) && !o.roundTime ? 5 : o.roundTime), (v) => (o.roundTime = v));
  };
  const modes = $('o-mode'); modes.innerHTML = '';
  for (const [key, m] of Object.entries(MODES)) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="em">${MODE_ICON[key]}</span><b>${m.label}</b><small>${m.desc}</small>`;
    b.classList.toggle('on', o.mode === key);
    b.onclick = () => { sfx.click(); o.mode = key; for (const x of modes.children) x.classList.remove('on'); b.classList.add('on'); vis(); };
    modes.appendChild(b);
  }
  seg($('o-map'), Object.entries(MAPS).map(([k, m]) => [k, m.label]), () => o.map, (v) => (o.map = v));
  seg($('o-teams'), [[2, '2'], [3, '3'], [4, '4']], () => o.teams, (v) => (o.teams = v));
  seg($('o-lvl'), [[1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer']], () => o.botLevel, (v) => (o.botLevel = v));
  seg($('o-cells'), [[8, '8'], [16, '16'], [32, '32']], () => o.maxCells, (v) => (o.maxCells = v));
  $('o-bots').value = o.bots; $('o-bots-n').textContent = o.bots;
  $('o-bots').oninput = () => { o.bots = +$('o-bots').value; $('o-bots-n').textContent = o.bots; };
  $('o-items').checked = o.items; $('o-items').onchange = () => (o.items = $('o-items').checked);
  $('o-mayhem').checked = o.mayhem; $('o-mayhem').onchange = () => (o.mayhem = $('o-mayhem').checked);
  vis();
  show('setup');
}
$('setup-start').onclick = () => { unlockAudio(); store.host = { ...hostOpts }; saveStore(); startHost(hostOpts, setupOnline); };

// ---------- Beitreten ----------
const NET_MSG = {
  nonet: 'Mehrspieler ist in dieser Ansicht gesperrt (zum Beispiel in der Claude-Vorschau). Auf einer normalen Webseite funktioniert er.',
  notfound: 'Raum nicht gefunden. Stimmt der Code und läuft die Partie noch?',
  timeout: 'Keine Antwort. Prüfe deine Internetverbindung und den Code.',
  full: 'Die Partie ist voll.',
  version: 'Der Host nutzt eine andere Spielversion. Ladet beide die Seite neu.',
  kick: 'Der Host hat dich aus der Partie entfernt.',
  host: 'Der Host hat die Partie beendet.',
  lost: 'Verbindung zum Host verloren.',
  closed: 'Die Verbindung wurde abgelehnt.',
  busy: 'Auf dem Server ist gerade kein Raum mehr frei. Versuch es gleich nochmal.',
  expired: 'Du warst zu lange weg und wurdest aus der Partie genommen.',
  restart: 'Der Server startet gerade neu. Versuch es in einer Minute nochmal.',
  error: 'Auf dem Server ist ein Fehler aufgetreten. Die Partie wurde beendet.',
  nosrv: 'Der Spielserver ist nicht erreichbar. Prüfe deine Internetverbindung.',
};
const netMsg = (why) => NET_MSG[why] || 'Verbindung fehlgeschlagen. Auf einer normalen Webseite mit Internet sollte es klappen.';
$('join-name').addEventListener('input', () => { store.name = $('join-name').value.replace(/[<>]/g, '').slice(0, 14); saveStore(); });
$('join-code').addEventListener('input', () => { $('join-code').value = cleanCode($('join-code').value); });
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-start').click(); });
$('join-start').onclick = () => {
  unlockAudio();
  const code = cleanCode($('join-code').value);
  if (code.length !== 5) { $('join-msg').textContent = 'Der Code hat 5 Zeichen.'; return; }
  if (!store.name.trim()) { store.name = 'Blob' + (100 + Math.floor(Math.random() * 900)); saveStore(); }
  startJoin(code);
};
$('conn-cancel').onclick = () => { const kind = pending && pending.kind; if (pending) { pending.cancelled = true; pending.close(); pending = null; } session = null; show(kind === 'create' ? 'setup' : 'join'); if (!demo) startDemo(); };

async function startJoin(code) {
  $('conn-title').textContent = 'Verbinde mit ' + code + ' …'; $('conn-msg').textContent = '';
  show('connect');
  stopDemo(); world.reset();
  const s = serverMode ? new ServerSession('join', code, profile(), handlers) : new ClientSession(code, profile(), handlers);
  pending = s; session = s;
  try {
    await s.start();
    if (s.cancelled) return;
    pending = null; enterGame();
    achieve('multi');
  } catch (err) {
    if (s.cancelled) return;
    pending = null; session = null;
    startDemo(); show('join'); $('join-msg').textContent = netMsg(err.message);
  }
}

// ---------- Sitzungen ----------
const profile = () => ({ name: store.name.trim() || 'Blob', skin: store.skin, hue: store.hue });
let knownHumans = new Map();
const handlers = {
  welcome(d) {
    world.me = d.pid; world.opts = d.opts; world.w = d.w; world.h = d.h; world.setPlayers(d.players); world.worms = d.worms || [];
    knownHumans = new Map(d.players.filter((p) => !p[5]).map((p) => [p[0], p[1]]));
  },
  dots(d) { world.dots = d; },
  snap(s) { world.applySnapshot(s, performance.now()); },
  info(i) { world.info = i; },
  players(t) {
    const now = new Map(t.filter((p) => !p[5]).map((p) => [p[0], p[1]]));
    for (const [pid, name] of now) if (!knownHumans.has(pid) && pid !== world.me) { toast(`<b>${esc(name)}</b> ist beigetreten`); if (session && session.isHost) { achieve('host'); achieve('multi'); } }
    for (const [pid, name] of knownHumans) if (!now.has(pid)) toast(`<b>${esc(name)}</b> hat die Partie verlassen`);
    knownHumans = now;
    world.setPlayers(t);
    if (current === 'pause') buildPause();
  },
  events(list) { for (const e of list) onEvent(e); },
  close(why) { leaveGame(netMsg(why)); },
  owner(pid) {
    if (pid === world.me) toast('👑 Du bist jetzt <b>Raumchef</b> und kannst Bots einstellen und Spieler entfernen.');
    if (current === 'pause') buildPause();
  },
  notice(kind) {
    if (kind === 'reconnect') toast('📡 Verbindung unterbrochen – verbinde neu …');
    else if (kind === 'back') toast('✅ Wieder verbunden');
  },
};

async function startServerRoom(opts) {
  $('conn-title').textContent = 'Raum wird erstellt …'; $('conn-msg').textContent = '';
  show('connect');
  stopDemo(); world.reset();
  const s = new ServerSession('create', { ...opts }, profile(), handlers);
  pending = s; session = s;
  try {
    await s.start();
    if (s.cancelled) return;
    pending = null; enterGame();
    banner(`Raum ${s.code}<small>Teile den Code mit deinen Freunden (Menü ☰)</small>`);
  } catch (err) {
    if (s.cancelled) return;
    pending = null; session = null;
    startDemo(); show('setup'); toast(esc(netMsg(err.message === 'error' || err.message === 'timeout' ? 'nosrv' : err.message)));
  }
}

function startHost(opts, online) {
  if (online && serverMode) { startServerRoom(opts); return; }
  stopDemo(); world.reset();
  session = new HostSession(opts, profile(), handlers);
  session.start();
  enterGame();
  if (online) {
    toast('Raum wird geöffnet …');
    const s = session;
    s.openRoom().then((code) => {
      if (session !== s) return;
      banner(`Raum ${code}<small>Teile den Code mit deinen Freunden (Menü ☰)</small>`);
    }).catch((err) => {
      if (session !== s) return;
      toast('Raum konnte nicht geöffnet werden – du spielst offline. ' + (err && err.message === 'nonet' ? NET_MSG.nonet : 'Mehrspieler braucht Internet und eine normale Webseite.'));
    });
  }
}

function enterGame() {
  inGame = true; roundShown = false; watchMode = false; lastDeath = null; wasTop = false;
  $('hud').classList.remove('hidden');
  document.body.classList.add('ingame'); document.body.classList.toggle('lefty', !!store.settings.leftHanded);
  $('btns').classList.toggle('left', !!store.settings.leftHanded);
  input.reset(); show(null);
  life.active = true; life.start = performance.now(); life.best = 0; life.kills = 0; life.bonus = 0;
  sfx.spawn();
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* ignore */ }
}

function leaveGame(msg) {
  if (!inGame && !session) return;
  award();
  if (session) { session.close(); session = null; }
  inGame = false; input.enabled = false;
  document.body.classList.remove('ingame');
  $('hud').classList.add('hidden'); $('b-respawn').classList.add('hidden'); $('emotes').classList.add('hidden');
  world.reset(); startDemo(); show('home');
  if (msg) toast(esc(msg));
}

function award() {
  if (!life.active) return null;
  life.active = false;
  const t = (performance.now() - life.start) / 1000;
  const xp = Math.round(life.best / 8 + life.kills * 25 + t / 4 + life.bonus);
  const before = level();
  store.xp += xp;
  const st = store.stats;
  mission('lives', 1); mission('time', t / 60);
  st.lives++; st.time += t; st.maxMass = Math.max(st.maxMass, Math.round(life.best));
  const after = level();
  if (after > before) {
    const skins = SKINS.filter((s) => s.lvl > before && s.lvl <= after).map((s) => s.name);
    toast(`⭐ <b>Level ${after}</b> erreicht!` + (skins.length ? ` Neuer Skin: ${esc(skins.join(', '))}` : ''), 'ach'); sfx.ach();
  }
  if (after >= 5) achieve('lvl5'); if (after >= 15) achieve('lvl15'); if (after >= 30) achieve('lvl30');
  if (st.lives >= 25) achieve('lives25');
  saveStore();
  return { xp, t, best: life.best, kills: life.kills, before, after };
}

// ---------- Ereignisse aus der Simulation ----------
function onEvent(e) {
  const me = world.me;
  switch (e.k) {
    case 'kill': {
      const kn = e.killer ? world.playerName(e.killer) : null, vn = world.playerName(e.victim);
      feed(kn ? `<b>${esc(kn)}</b> frisst <i>${esc(vn)}</i>` : `<i>${esc(vn)}</i> verglüht in der Zone`);
      world.burst(e.x, e.y, 22, (world.players.get(e.victim) || { hue: 0 }).hue, 420, 6);
      if (e.killer === me && e.victim !== me) {
        life.kills++; store.stats.kills++; saveStore();
        const nowT = performance.now();
        streak = nowT - streakAt < 9000 ? streak + 1 : 1; streakAt = nowT;
        const st = ['', '', 'Doppelt!', 'Dreifach!', 'Vierfach!', 'Fressrausch!'][Math.min(streak, 5)];
        banner(st ? `${st}<small>${esc(vn)} gefressen</small>` : `${esc(vn)} gefressen!`);
        if (streak >= 2) sfx.streak(); if (streak >= 3) achieve('streak3');
        buzz(30); mission('kills', 1);
        achieve('meal'); if (store.stats.kills >= 10) achieve('k10'); if (store.stats.kills >= 100) achieve('k100'); if (life.kills >= 5) achieve('k5life');
      }
      if (e.victim === me) onDeath(e, kn);
      break;
    }
    case 'eat': sfx.eat(); world.text(e.x, e.y, '+' + Math.round(e.m), 140, 28); world.burst(e.x, e.y, 18, 140, 380, 6); world.ring(e.x, e.y, 10, 60 + Math.sqrt(e.m) * 9, 140, 420); world.shake = Math.max(world.shake, Math.min(7, 2 + e.m / 150)); break;
    case 'split': if (e.pid === me) { sfx.split(); buzz(12); mission('splits', 1); world.ring(e.x, e.y, 10, 120, world.players.get(me) ? world.players.get(me).hue : 200, 300); } break;
    case 'warp': {
      world.ring(e.x, e.y, 90, 10, 170, 350); world.ring(e.x2, e.y2, 10, 150, 170, 450); world.burst(e.x2, e.y2, 16, 170, 380, 5);
      if (e.pid === me) { sfx.warp(); achieve('warp'); buzz(20); }
      break;
    }
    case 'flag': {
      const t = TEAM_COLORS[e.team], who = e.pid ? world.playerName(e.pid) : '';
      const col = `style="color:hsl(${t.hue} 90% 70%)"`;
      if (e.a === 'take') { feed(`<b>${esc(who)}</b> hat die Flagge von <span ${col}>${t.name}</span>`); if (e.pid === me) { banner('Du hast die Flagge!<small>Bring sie zu deiner Basis</small>'); sfx.pick(); buzz(40); } else sfx.tick(); }
      else if (e.a === 'drop') feed(`Flagge von <span ${col}>${t.name}</span> liegt am Boden`);
      else feed(`Flagge von <span ${col}>${t.name}</span> ist zurück`);
      break;
    }
    case 'cap': {
      const t = TEAM_COLORS[e.team];
      banner(`Punkt für ${t.name}!<small>${esc(world.playerName(e.pid))} hat die Flagge erobert</small>`);
      sfx.goal(); world.burst(e.x, e.y, 50, t.hue, 800, 7); world.ring(e.x, e.y, 40, 500, t.hue, 700);
      if (e.pid === me) { store.stats.flags++; life.bonus += 60; achieve('flag'); saveStore(); }
      break;
    }
    case 'burst':
      if (e.pid === me) { sfx.burst(); world.shake = 12; store.stats.bursts++; achieve('burst'); saveStore(); }
      break;
    case 'item': {
      world.itemFx(e);
      const near = Math.hypot(e.x - world.cam.x, e.y - world.cam.y) < world.cam.viewW;
      if (near) { if (e.type === 8) sfx.nova(); else sfx.item(); }
      if (e.pid === me) {
        mission('items', 1);
        const st = store.stats; st.items++;
        if (!st.itemTypes.includes(e.type)) st.itemTypes.push(e.type);
        if (st.items >= 10) achieve('items10'); if (st.itemTypes.length >= 10) achieve('itemsAll');
        saveStore();
      }
      break;
    }
    case 'pick': sfx.pick(); toast(`${ITEMS[e.type].icon} <b>${ITEMS[e.type].name}</b> – ${ITEMS[e.type].desc}`); break;
    case 'goal': {
      const t = TEAM_COLORS[e.team];
      const who = e.pid ? world.playerName(e.pid) : '';
      banner(`TOR für ${t.name}!${who ? `<small>${e.own ? 'Eigentor von ' : ''}${esc(who)}</small>` : ''}`);
      sfx.goal(); world.burst(e.x, e.y, 50, t.hue, 800, 7); world.shake = 8;
      if (e.pid === me && !e.own) { store.stats.goals++; life.bonus += 40; achieve('goal'); if (store.stats.goals >= 10) achieve('goal10'); saveStore(); }
      break;
    }
    case 'round': showRound(e.results); break;
    case 'phase':
      roundShown = false;
      if (current === 'round' || current === 'death') show(null);
      $('b-respawn').classList.add('hidden'); watchMode = false;
      if (e.phase === 'play' && world.opts.mode === 'royale') { banner('Battle Royale!<small>Ein Leben. Bleib in der Zone.</small>'); sfx.item(); }
      else if (e.phase === 'warmup') banner('Aufwärmen<small>Gleich geht es los</small>');
      else banner('Neue Runde!');
      break;
    case 'emote': world.emotes.set(e.pid, { n: e.n, t0: performance.now(), cell: 0 }); break;
    case 'spawn':
      life.active = true; life.start = performance.now(); life.best = 0; life.kills = 0; life.bonus = 0;
      watchMode = false; $('b-respawn').classList.add('hidden'); streak = 0;
      if (current === 'death') show(null);
      sfx.spawn(); world.ring(world.snapCx || world.cam.x, world.snapCy || world.cam.y, 200, 20, 190, 500);
      break;
  }
}

function onDeath(e, killerName) {
  sfx.death(); world.shake = 14;
  buzz(120);
  store.stats.deaths++;
  const a = award() || { xp: 0, t: 0, best: 0, kills: 0 };
  lastDeath = a;
  if (roundShown) return;
  const royale = world.opts.mode === 'royale' && world.info && world.info.ph === 'play';
  $('death-title').textContent = royale && e.place ? `Platz ${e.place}` : 'Gefressen!';
  $('death-sub').textContent = killerName ? `von ${killerName}` : 'Du bist außerhalb der Zone verglüht.';
  $('death-stats').innerHTML = `<div><b>${fmt(a.best)}</b><small>Größte Masse</small></div><div><b>${a.kills}</b><small>Gefressen</small></div><div><b>${clock(a.t)}</b><small>Überlebt</small></div>`;
  levelBar($('death-lvl'), $('death-bar')); $('death-xp').textContent = '+' + a.xp + ' XP';
  $('death-again').disabled = royale; $('death-again').textContent = royale ? 'Nächste Runde abwarten' : 'Nochmal';
  setTimeout(() => { if (inGame && !world.alive && !roundShown && !current) show('death'); }, 700);
}
$('death-again').onclick = () => { sfx.click(); if (session) session.spawn(); };
$('death-watch').onclick = () => { sfx.click(); watchMode = true; show(null); };
$('death-leave').onclick = () => { sfx.click(); leaveGame(); };
$('b-respawn').onclick = () => { sfx.click(); if (session) session.spawn(); };

function showRound(r) {
  roundShown = true;
  const me = world.me, my = r.rows.find((x) => x.pid === me), myP = world.players.get(me);
  let title = 'Runde vorbei', sub = '', won = false;
  if (r.mode === 'soccer' || r.mode === 'ctf') {
    title = `${r.goals[0]} : ${r.goals[1]}`;
    sub = r.winTeam < 0 ? 'Unentschieden' : `Team ${TEAM_COLORS[r.winTeam].name} gewinnt`;
    won = myP && r.winTeam === myP.team;
  } else if (r.mode === 'teams') { sub = `Team ${TEAM_COLORS[r.winTeam].name} gewinnt`; won = myP && r.winTeam === myP.team; } else {
    sub = `${world.playerName(r.winner)} gewinnt`; won = r.winner === me;
    if (r.mode === 'royale') title = won ? 'Sieg!' : 'Runde vorbei';
  }
  if (won) { sfx.win(); life.bonus += 150; store.stats.wins++; if (r.mode === 'royale') { store.stats.royaleWins++; achieve('royale'); } else achieve('round'); saveStore(); } else sfx.lose();
  $('round-title').textContent = title; $('round-sub').textContent = sub + (won ? ' – das bist du! +150 XP' : '');
  $('round-table').innerHTML = r.rows.slice(0, 8).map((x) => `<div class="${x.pid === me ? 'me' : ''}"><em>${x.place}.</em><span>${esc(x.name)}</span><b>${r.mode === 'soccer' ? (x.goals || 0) + ' ⚽' : r.mode === 'ctf' ? (x.goals || 0) + ' 🚩' : fmt(x.score)}</b></div>`).join('') + (my && my.place > 8 ? `<div class="me"><em>${my.place}.</em><span>${esc(my.name)}</span><b>${fmt(my.score)}</b></div>` : '');
  award();
  show('round');
}

// ---------- Pause ----------
function buildPause() {
  const s = session; if (!s) return;
  const online = s.online && s.code;
  $('room-box').classList.toggle('hidden', !online);
  if (online) {
    $('room-code').textContent = s.code;
    $('room-note').textContent = s.isServer
      ? `Mitspieler öffnen dieselbe Seite, tippen auf „Beitreten“ und geben den Code ein. Die Partie läuft auf dem Server weiter, auch wenn du gehst. · Ping ${s.ping} ms`
      : s.isHost ? 'Mitspieler öffnen dieselbe Seite, tippen auf „Beitreten“ und geben den Code ein. Bleib im Spiel: Wenn du die Seite schließt, endet die Partie für alle.' : `Verbunden · Ping ${s.ping} ms`;
  }
  $('host-box').classList.toggle('hidden', !s.isHost);
  if (s.isHost) {
    const n = [...world.players.values()].filter((p) => p.bot).length;
    $('pause-bots').value = n; $('pause-bots-n').textContent = n;
    $('pause-bots').oninput = () => { $('pause-bots-n').textContent = $('pause-bots').value; };
    $('pause-bots').onchange = () => { s.setBots(+$('pause-bots').value); };
  }
  const list = [...world.players.values()].sort((a, b) => (a.bot - b.bot) || a.pid - b.pid);
  const humans = list.filter((p) => !p.bot).length;
  $('pl-count').textContent = `${humans} Mensch${humans === 1 ? '' : 'en'}, ${list.length - humans} Bots`;
  const pl = $('pl-list'); pl.innerHTML = '';
  for (const p of list) {
    if (p.bot && list.length > 14) continue;
    const d = document.createElement('div');
    d.innerHTML = `<i style="background:hsl(${p.hue} 85% 58%)"></i><span>${esc(p.name)}</span><small>${p.pid === world.me ? 'du' : p.bot ? 'Bot' : ''}</small>`;
    if (s.isHost && !p.bot && p.pid !== world.me) { const b = document.createElement('button'); b.textContent = 'Entfernen'; b.onclick = () => { s.kick(p.pid); }; d.appendChild(b); }
    pl.appendChild(d);
  }
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (e) { toast('Kopieren nicht möglich. Code: <b>' + esc(session ? session.code : '') + '</b>'); }
}
$('room-copy').onclick = () => copy(session.code, 'Code kopiert');
$('room-link').onclick = () => copy(location.href.split('#')[0] + '#' + session.code, 'Link kopiert');
$('b-menu').onclick = () => { sfx.click(); $('emotes').classList.add('hidden'); show('pause'); };
$('pause-close').onclick = $('pause-resume').onclick = () => { sfx.click(); show(!world.alive && !watchMode && !roundShown && lastDeath ? 'death' : null); };
$('pause-settings').onclick = () => { sfx.click(); openSettings('pause'); };
$('pause-leave').onclick = () => { sfx.click(); leaveGame(); };
input.onMenu = () => { if (inGame) show(current === 'pause' ? null : 'pause'); };

// ---------- Optionen ----------
function openSettings(from) {
  settingsFrom = from;
  const st = store.settings;
  seg($('st-quality'), [['niedrig', 'Niedrig'], ['mittel', 'Mittel'], ['hoch', 'Hoch']], () => st.quality, (v) => { st.quality = v; saveStore(); renderer.resize(); });
  seg($('st-theme'), [['weltraum', 'Weltraum'], ['raster', 'Raster']], () => st.theme, (v) => { st.theme = v; saveStore(); });
  const bind = (id, key, fn) => { const el = $(id); el.checked = !!st[key]; el.onchange = () => { st[key] = el.checked; saveStore(); if (fn) fn(); }; };
  bind('st-sound', 'sound', () => { setSound(st.sound); unlockAudio(); sfx.click(); });
  bind('st-vib', 'vibrate', () => buzz(40)); bind('st-names', 'showNames'); bind('st-mass', 'showMass'); bind('st-stop', 'stopOnRelease');
  bind('st-left', 'leftHanded', () => { $('btns').classList.toggle('left', !!st.leftHanded); document.body.classList.toggle('lefty', !!st.leftHanded); });
  $('st-note').textContent = persistent ? '' : 'Hinweis: In dieser Ansicht kann der Fortschritt nicht dauerhaft gespeichert werden.';
  show('settings');
}
$('settings-back').onclick = () => { sfx.click(); show(settingsFrom); };
$('st-full').onclick = () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast('Vollbild ist hier nicht möglich.'));
  } catch (e) { toast('Vollbild ist hier nicht möglich.'); }
};

// ---------- Skins und Profil ----------
function buildSkins() {
  const grid = $('skin-grid'), lv = level();
  $('hue').value = store.hue;
  $('hue').oninput = () => { store.hue = +$('hue').value; saveStore(); paint(); };
  $('skin-count').textContent = `${SKINS.filter((s) => s.lvl <= lv).length} von ${SKINS.length} frei`;
  const paint = () => {
    grid.innerHTML = '';
    SKINS.map((s, i) => [s, i]).sort((a, b) => a[0].lvl - b[0].lvl || a[1] - b[1]).forEach(([s, i]) => {
      const b = document.createElement('button'), locked = s.lvl > lv;
      const cvs = document.createElement('canvas'); cvs.width = cvs.height = 108; drawSkinPreview(cvs, i, store.hue);
      b.appendChild(cvs); b.appendChild(document.createTextNode(s.name));
      b.classList.toggle('locked', locked); b.classList.toggle('on', store.skin === i); b.dataset.lvl = s.lvl;
      b.onclick = () => { if (locked) { toast(`🔒 ${esc(s.name)} gibt es ab Level ${s.lvl}`); return; } sfx.click(); store.skin = i; saveStore(); for (const x of grid.children) x.classList.remove('on'); b.classList.add('on'); };
      grid.appendChild(b);
    });
  };
  paint();
}
function buildProfile() {
  const st = store.stats, l = level();
  $('prof-head').innerHTML = `<canvas id="prof-cv" width="144" height="144"></canvas><div class="mef"><b>${esc(store.name)}</b><div class="lvl"><b id="prof-lvl"></b><div class="bar"><i id="prof-bar"></i></div></div><small class="note">${fmt(store.xp)} XP · noch ${fmt(xpForLevel(l + 1) - store.xp)} bis Level ${l + 1}</small></div>`;
  drawSkinPreview($('prof-cv'), store.skin, store.hue); levelBar($('prof-lvl'), $('prof-bar'));
  const cells = [[fmt(st.maxMass), 'Rekordmasse'], [st.kills, 'Gefressen'], [st.deaths, 'Gestorben'], [st.lives, 'Leben'], [clock(st.time), 'Spielzeit'], [st.wins, 'Siege'], [st.goals, 'Tore'], [st.items, 'Items'], [st.bursts, 'Zerplatzt']];
  $('prof-stats').innerHTML = cells.map(([v, n]) => `<div><b>${v}</b><small>${n}</small></div>`).join('');
  const got = ACHIEVEMENTS.filter((a) => store.ach[a.id]).length;
  $('ach-count').textContent = `${got} von ${ACHIEVEMENTS.length}`;
  $('prof-ach').innerHTML = ACHIEVEMENTS.map((a) => `<div class="${store.ach[a.id] ? 'got' : ''}"><i>${a.icon}</i><span><b>${a.name}</b><small>${a.desc}</small></span></div>`).join('');
}
$('help-body').innerHTML = `
<h3>Ziel</h3><p>Du bist ein Blob im Weltall. Friss <b>Sternenstaub</b> und <b>kleinere Spieler</b>, um zu wachsen. Größere Spieler fressen dich. Je größer du bist, desto langsamer wirst du.</p>
<h3>Steuerung am Handy</h3><ul>
<li><b>Bewegen:</b> Finger irgendwo aufs Spielfeld legen und ziehen.</li>
<li><b>Teilen ⟡:</b> Du spaltest dich, eine Hälfte schießt nach vorn. So fängst du Kleinere oder entkommst.</li>
<li><b>Auswurf ◉:</b> Gedrückt halten, um Masse abzuwerfen. Damit fütterst du Mitspieler oder schiebst Schwarze Löcher.</li>
<li><b>Item:</b> Setzt den eingesammelten Gegenstand ein.</li></ul>
<h3>Am Computer</h3><p>Maus zielt, <b>Leertaste</b> oder Klick teilt, <b>W</b> wirft aus, <b>E</b> nutzt das Item, <b>1–8</b> senden Emotes, <b>Esc</b> öffnet das Menü.</p>
<h3>Regeln</h3><ul>
<li>Du frisst einen Blob, wenn du mindestens <b>10 % größer</b> bist und ihn fast ganz überdeckst.</li>
<li>Geteilte Blobs <b>verschmelzen</b> nach einiger Zeit wieder. Der Zähler unten zeigt, wie lange es dauert.</li>
<li><b>Schwarze Löcher:</b> Als Kleiner bist du darin sicher. Bist du größer als das Loch, zerplatzt du in viele Teile.</li>
<li>Goldener Sternenstaub ist fünfmal so viel wert.</li>
<li>Große Blobs verlieren langsam Masse.</li>
<li><b>Wurmlöcher</b> (türkise Wirbel) bringen kleine Blobs blitzschnell ans andere Ende der Karte.</li>
<li>Der weiße Pfeil an deinem Blob zeigt, wohin du teilst und auswirfst.</li></ul>
<h3>Gegenstände</h3><div class="items">${ITEMS.filter(Boolean).map((i) => `<div><i>${i.icon}</i><span><b>${i.name}</b> – ${i.desc}</span></div>`).join('')}</div>
<h3>Modi</h3><ul>${Object.entries(MODES).map(([k, m]) => `<li><b>${MODE_ICON[k]} ${m.label}:</b> ${m.desc}</li>`).join('')}
<li><b>Chaos-Modus:</b> Doppelter Sternenstaub, viele Gegenstände, schnelleres Verschmelzen.</li></ul>
<h3>Flaggenjagd</h3><p>Berühre die gegnerische Flagge, um sie aufzunehmen, und trage sie in deine Basis. Punkten kannst du nur, wenn deine eigene Flagge zu Hause ist. Wirst du gefressen, bleibt die Flagge liegen – berühre deine eigene Flagge, um sie zurückzuholen. Das erste Team mit 5 Punkten gewinnt.</p>
<h3>Tagesaufgaben</h3><p>Jeden Tag gibt es drei neue Aufgaben auf der Startseite. Jede bringt 150 XP.</p>
<h3>Mehrspieler</h3><p>Einer tippt auf <b>Spiel hosten</b> und bekommt einen <b>Raumcode</b> mit 5 Zeichen. Alle anderen öffnen dieselbe Seite, tippen auf <b>Beitreten</b> und geben den Code ein – auch mitten in der laufenden Partie. Bis zu 12 Menschen spielen zusammen. Auf zehnkronen.com läuft die Partie auf dem Server: Der Ersteller darf gehen, und wer kurz die Verbindung verliert, steigt automatisch wieder ein.</p>`;

// ---------- Spielknöpfe ----------
function hold(btn, onDown, onUp) {
  const down = (e) => { e.preventDefault(); unlockAudio(); btn.classList.add('down'); try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } onDown(); };
  const up = () => { btn.classList.remove('down'); if (onUp) onUp(); };
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
const doSplit = () => { if (session && inGame && world.alive) session.split(); };
const doItem = () => { if (session && inGame && world.alive && world.item) session.item(); };
hold($('b-split'), doSplit);
hold($('b-eject'), () => { input.eject = true; }, () => { input.eject = false; });
hold($('b-item'), doItem);
input.onSplit = doSplit; input.onItem = doItem;
const emBox = $('emotes');
EMOTES.forEach((em, i) => { const b = document.createElement('button'); b.textContent = em; b.onclick = () => sendEmote(i); emBox.appendChild(b); });
function sendEmote(i) { emBox.classList.add('hidden'); if (!session || !inGame) return; session.emote(i); store.stats.emotes++; if (store.stats.emotes >= 10) achieve('emote'); saveStore(); }
input.onEmote = sendEmote;
$('b-emote').onclick = () => { emBox.classList.toggle('hidden'); };

// ---------- Hintergrund-Demo im Menü ----------
function startDemo() {
  stopDemo(); world.reset();
  const sim = new Sim({ bots: 18, map: 'klein', mayhem: true, botLevel: 3, items: true });
  const fake = { cx: sim.w / 2, cy: sim.h / 2, viewW: 1900, alive: false, item: 0, mergeSecs: 0, fx: { ghost: 0 }, team: -1 };
  world.opts = sim.opts; world.w = sim.w; world.h = sim.h; world.me = 0;
  world.setPlayers(sim.playerTable()); world.dots = decodeDots(encodeDots(sim)); world.worms = sim.worms.map((q) => [q.x, q.y]);
  const tick = () => {
    sim.events.length = 0; sim.dotEvents.length = 0; sim.step();
    const l = sim.leader;
    if (l) { fake.cx += (l.cx - fake.cx) * 0.06; fake.cy += (l.cy - fake.cy) * 0.06; fake.viewW += (Math.max(1500, l.viewW * 1.5) - fake.viewW) * 0.03; }
    world.applySnapshot(decodeSnapshot(encodeSnapshot(sim, fake)), performance.now());
    for (const e of sim.events) { if (e.k === 'item') world.itemFx(e); else if (e.k === 'kill') world.burst(e.x, e.y, 18, 200, 400, 6); }
    if (sim.tick % 25 === 0) world.info = sim.info();
  };
  demo = { timer: setInterval(tick, 40) };
}
function stopDemo() { if (demo) { clearInterval(demo.timer); demo = null; } }

// ---------- HUD ----------
let hudT = 0, lastEjectSfx = 0, lastInput = 0, sentAx = 0, sentAy = 0, sentEj = false, miniT = 0, lastTick = -1;
function updateHud(now) {
  const info = world.info, o = world.opts; if (!o) return;
  const me = world.me, teamMode = isTeamMode(o.mode);
  // Bestenliste
  let h = '';
  if (info) {
    if (teamMode && o.mode === 'teams') {
      const max = Math.max(1, ...info.ts.slice(0, o.teams));
      h += '<div class="t">Teams</div>';
      for (let i = 0; i < o.teams; i++) h += `<div class="r"><span style="color:hsl(${TEAM_COLORS[i].hue} 90% 70%)">${TEAM_COLORS[i].name}</span><b>${fmt(info.ts[i])}</b></div><div class="tb"><i style="width:${(info.ts[i] / max) * 100}%;background:hsl(${TEAM_COLORS[i].hue} 90% 60%)"></i></div>`;
    }
    const rows = window.innerHeight < 460 || window.innerWidth < 600 ? 5 : teamMode ? 5 : 8;
    h += `<div class="t">Bestenliste</div>`;
    info.lb.slice(0, rows).forEach(([pid, score], i) => { h += `<div class="r${pid === me ? ' me' : ''}"><span>${i + 1}. ${esc(world.playerName(pid))}</span><b>${fmt(score)}</b></div>`; });
    if (!teamMode && info.lb[0] && info.lb[0][0] === me && info.n >= 4) { if (!wasTop) { wasTop = true; banner('👑 Platz 1!'); achieve('top1'); mission('top', 1); } } else wasTop = false;
  }
  $('lb').innerHTML = h;
  // Status
  let s = '';
  if (info) {
    if (o.mode === 'soccer' || o.mode === 'ctf') s = `<span class="sc"><b style="color:hsl(212 90% 68%)">${info.goals[0]}</b> : <b style="color:hsl(2 90% 68%)">${info.goals[1]}</b></span><small>${info.ph === 'ended' ? 'Schluss' : clock(Math.max(0, info.tl))}${o.mode === 'ctf' ? ' · bis ' + CTF_WIN : ''}</small>`;
    else if (o.mode === 'royale') s = info.ph === 'warmup' ? `Start in ${info.tl} s<small>${info.alive} Spieler bereit</small>` : info.ph === 'play' ? `Noch ${info.alive} am Leben<small>${info.zs > 0 ? 'Zone schrumpft in ' + info.zs + ' s' : 'Die Zone schrumpft'}</small>` : '';
    else if (info.tl >= 0 && info.ph === 'play') s = clock(info.tl);
    if (info.ph === 'ended' && current === 'round') $('round-next').textContent = `Nächste Runde in ${info.tl} s`;
    if (info.ph === 'play' && info.tl >= 0 && info.tl <= 5 && info.tl !== lastTick) { lastTick = info.tl; sfx.tick(); }
  }
  if (session && session.online && session.code && (session.isHost || session.isServer)) s += `<small>Raum ${session.code} · ${[...world.players.values()].filter((p) => !p.bot).length} Spieler</small>`;
  $('status').innerHTML = s;
  // Masse
  if (world.myCells) {
    $('mass').textContent = fmt(world.myMass);
    $('massinfo').textContent = world.myCells > 1 ? `${world.myCells} Teile` + (world.mergeSecs ? ` · verschmilzt in ${world.mergeSecs} s` : ' · verschmilzt') : '';
    if (world.myMass > life.best) { life.best = world.myMass; mission('mass', Math.floor(life.best)); }
    if (life.best >= 500) achieve('m500'); if (life.best >= 2000) achieve('m2000'); if (life.best >= 10000) achieve('m10000');
    if (world.myCells >= 12) achieve('swarm');
    if (life.active && now - life.start > 300000) achieve('survive5');
  } else { $('mass').textContent = ''; $('massinfo').textContent = world.alive ? '' : 'Zuschauer'; }
  const ib = $('b-item'), it = ITEMS[world.item];
  ib.classList.toggle('empty', !it);
  ib.firstElementChild.textContent = it ? it.icon : '✦'; ib.lastElementChild.textContent = it ? it.name : 'Item';
  const royaleLocked = o.mode === 'royale' && info && info.ph === 'play';
  $('b-respawn').classList.toggle('hidden', !(watchMode && !world.alive && !royaleLocked && !current));
  $('btns').style.opacity = world.alive ? '1' : '0.35';
}

// ---------- Schleife ----------
let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  if (inGame && session) {
    const ax = input.enabled ? input.ax : 0, ay = input.enabled ? input.ay : 0, ej = input.enabled && input.eject;
    if (now - lastInput > 38 && (ax !== sentAx || ay !== sentAy || ej !== sentEj || now - lastInput > 250)) {
      session.input(ax, ay, ej); lastInput = now; sentAx = ax; sentAy = ay; sentEj = ej;
    }
    if (ej && world.alive && world.myMass / Math.max(1, world.myCells) >= MIN_EJECT_MASS && now - lastEjectSfx > 115) { lastEjectSfx = now; sfx.eject(); }
  }
  const before = world.sucks.length;
  world.update(now, dt);
  if (inGame) {
    for (const s of world.sucks) if (!s.heard) { s.heard = true; if (s.to.pid === world.me) sfx.dot(); }
    for (const [pid, em] of world.emotes) { let best = null; for (const c of world.cells) if (c.pid === pid && (!best || c.r > best.r)) best = c; em.cell = best ? best.id : 0; }
    if (now - hudT > 200) { hudT = now; updateHud(now); }
  }
  void before;
  renderer.draw(now, inGame && input.enabled ? input.joy : null, inGame && world.alive ? input : null);
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
window.addEventListener('pagehide', () => { if (session) { award(); session.close(); } });
document.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- Als App installieren ----------
(function setupInstall() {
  const web = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  let framed = false; try { framed = window.self !== window.top; } catch (e) { framed = true; }
  if (!web || framed || /claude/.test(location.hostname)) return; // in der Vorschau nicht möglich
  const head = document.head, add = (tag, attrs) => { const el = document.createElement(tag); Object.assign(el, attrs); head.appendChild(el); };
  add('link', { rel: 'manifest', href: 'manifest.webmanifest' });
  add('link', { rel: 'apple-touch-icon', href: 'icon-180.png' });
  add('link', { rel: 'icon', href: 'icon-192.png' });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const standalone = (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone;
  if (standalone) return;
  const btn = $('install'); let deferred = null;
  const ua = navigator.userAgent, ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { btn.classList.add('hidden'); toast('Sternfresser ist installiert 🎉'); });
  if (ios) btn.classList.remove('hidden');
  else setTimeout(() => { if (!deferred) btn.classList.remove('hidden'); }, 4000);
  btn.onclick = async () => {
    sfx.click();
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { /* ignore */ } deferred = null; return; }
    if (ios) toast('iPhone/iPad: In <b>Safari</b> unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>.');
    else toast('Im Browser-Menü <b>⋮</b> auf <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> tippen.');
  };
})();

// Eigenen Spielserver erkennen (auf GitHub Pages gibt es keinen, dann PeerJS)
detectServer().then((v) => { serverMode = v; if (current === 'home') refreshHome(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session && session.wake) session.wake(); });
window.addEventListener('online', () => { if (session && session.wake) session.wake(); });

// Start
startDemo(); show('home');
try {
  const code = cleanCode(decodeURIComponent(location.hash.slice(1)));
  if (code.length === 5) { $('join-code').value = code; show('join'); }
} catch (e) { /* ignore */ }
requestAnimationFrame(frame);
window.__sf = { world, store, get session() { return session; }, get serverMode() { return serverMode; }, input, show };
