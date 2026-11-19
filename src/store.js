// Profil, Einstellungen, Statistik und Erfolge im Browser-Speicher (kann fehlen → dann nur für diese Sitzung).
import { levelFromXp } from './config.js';

const KEY = 'sternfresser.v1';

export const ACHIEVEMENTS = [
  { id: 'meal', icon: '🍽️', name: 'Erster Bissen', desc: 'Friss einen anderen Spieler.' },
  { id: 'm500', icon: '🪐', name: 'Schwergewicht', desc: 'Erreiche 500 Masse.' },
  { id: 'm2000', icon: '🌟', name: 'Riesenstern', desc: 'Erreiche 2.000 Masse.' },
  { id: 'm10000', icon: '🌌', name: 'Galaxienfresser', desc: 'Erreiche 10.000 Masse.' },
  { id: 'k10', icon: '😋', name: 'Vielfraß', desc: 'Friss insgesamt 10 Spieler.' },
  { id: 'k100', icon: '👹', name: 'Schrecken des Alls', desc: 'Friss insgesamt 100 Spieler.' },
  { id: 'k5life', icon: '🔥', name: 'Fressrausch', desc: 'Friss 5 Spieler in einem Leben.' },
  { id: 'top1', icon: '👑', name: 'König der Galaxie', desc: 'Stehe auf Platz 1 der Bestenliste (mit mindestens 4 Spielern).' },
  { id: 'burst', icon: '🕳️', name: 'Zerplatzt', desc: 'Zerplatze an einem Schwarzen Loch.' },
  { id: 'swarm', icon: '🫧', name: 'Schwarm', desc: 'Bestehe gleichzeitig aus 12 oder mehr Teilen.' },
  { id: 'items10', icon: '🎒', name: 'Sammler', desc: 'Setze 10 Gegenstände ein.' },
  { id: 'itemsAll', icon: '🧰', name: 'Alleskönner', desc: 'Setze jeden der 10 Gegenstände einmal ein.' },
  { id: 'survive5', icon: '⏱️', name: 'Überlebenskünstler', desc: 'Überlebe 5 Minuten am Stück.' },
  { id: 'round', icon: '🏆', name: 'Rundensieger', desc: 'Gewinne eine Zeitrunde.' },
  { id: 'royale', icon: '🥇', name: 'Letzter Überlebender', desc: 'Gewinne ein Battle Royale.' },
  { id: 'goal', icon: '⚽', name: 'Tor!', desc: 'Schieße ein Tor.' },
  { id: 'goal10', icon: '🥅', name: 'Torjäger', desc: 'Schieße insgesamt 10 Tore.' },
  { id: 'flag', icon: '🚩', name: 'Flaggendieb', desc: 'Bringe eine gegnerische Flagge zu deiner Basis.' },
  { id: 'warp', icon: '🌀', name: 'Abkürzung', desc: 'Reise durch ein Wurmloch.' },
  { id: 'streak3', icon: '⚡', name: 'Dreifach!', desc: 'Friss 3 Spieler innerhalb weniger Sekunden.' },
  { id: 'daily', icon: '📅', name: 'Fleißig', desc: 'Schaffe alle 3 Tagesaufgaben eines Tages.' },
  { id: 'multi', icon: '🤝', name: 'Gemeinsam', desc: 'Spiele eine Mehrspieler-Partie.' },
  { id: 'host', icon: '🏠', name: 'Gastgeber', desc: 'Hoste eine Partie, der jemand beitritt.' },
  { id: 'lvl5', icon: '⭐', name: 'Aufsteiger', desc: 'Erreiche Level 5.' },
  { id: 'lvl15', icon: '💫', name: 'Sternenprofi', desc: 'Erreiche Level 15.' },
  { id: 'lvl30', icon: '☄️', name: 'Legende', desc: 'Erreiche Level 30.' },
  { id: 'lives25', icon: '🎮', name: 'Stammgast', desc: 'Spiele 25 Leben.' },
  { id: 'emote', icon: '💬', name: 'Plaudertasche', desc: 'Sende 10 Emotes.' },
];

const DEFAULTS = {
  name: '', skin: 1, hue: 200,
  settings: { sound: true, quality: 'hoch', theme: 'weltraum', showNames: true, showMass: true, stopOnRelease: false, leftHanded: false, vibrate: true },
  host: null,
  xp: 0,
  stats: { lives: 0, kills: 0, deaths: 0, maxMass: 0, time: 0, items: 0, goals: 0, wins: 0, royaleWins: 0, bursts: 0, emotes: 0, itemTypes: [], flags: 0, missions: 0 },
  daily: null,
  ach: {},
};

export const store = JSON.parse(JSON.stringify(DEFAULTS));
export let persistent = true;

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Object.assign(store, d);
      store.settings = { ...DEFAULTS.settings, ...(d.settings || {}) };
      store.stats = { ...DEFAULTS.stats, ...(d.stats || {}) };
      store.ach = d.ach || {};
    }
  } catch (e) { persistent = false; }
  if (!store.name) store.name = 'Blob' + (100 + Math.floor(Math.random() * 900));
  if (!(store.hue >= 0)) store.hue = Math.floor(Math.random() * 360);
}
let saveTimer = null;
export function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { persistent = false; } }, 300);
}
export const level = () => levelFromXp(store.xp);

// Liefert neu freigeschaltete Erfolge
export function unlock(id) {
  if (store.ach[id]) return null;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return null;
  store.ach[id] = Date.now(); saveStore();
  return a;
}

// ---------- Tagesaufgaben ----------
const MISSIONS = {
  kills: { n: [3, 5, 8], text: (n) => `Friss ${n} Spieler` },
  mass: { n: [400, 800, 1500], max: true, text: (n) => `Erreiche ${n} Masse` },
  items: { n: [3, 5, 8], text: (n) => `Setze ${n} Gegenstände ein` },
  lives: { n: [3, 5], text: (n) => `Spiele ${n} Leben` },
  time: { n: [5, 10], text: (n) => `Überlebe insgesamt ${n} Minuten` },
  splits: { n: [15, 30], text: (n) => `Teile dich ${n}-mal` },
  top: { n: [1], text: () => 'Erreiche Platz 1 der Bestenliste' },
};
export const MISSION_XP = 150;
function today() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
export function dailyMissions() {
  const day = today();
  if (!store.daily || store.daily.day !== day || !Array.isArray(store.daily.list)) {
    let seed = day; const rnd = () => { seed = (seed * 16807 + 12345) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 5; i++) rnd();
    const keys = Object.keys(MISSIONS), list = [];
    while (list.length < 3) { const t = keys.splice(Math.floor(rnd() * keys.length), 1)[0], m = MISSIONS[t]; list.push({ t, goal: m.n[Math.floor(rnd() * m.n.length)], prog: 0, done: false }); }
    store.daily = { day, list }; saveStore();
  }
  return store.daily.list.map((m) => ({ ...m, text: MISSIONS[m.t] ? MISSIONS[m.t].text(m.goal) : '' }));
}
// Liefert die Texte neu geschaffter Aufgaben
export function missionProgress(t, v) {
  dailyMissions();
  const out = [];
  for (const m of store.daily.list) {
    if (m.t !== t || m.done) continue;
    const before = m.prog;
    m.prog = MISSIONS[t].max ? Math.max(m.prog, v) : m.prog + v;
    if (m.prog >= m.goal) { m.prog = m.goal; m.done = true; store.xp += MISSION_XP; store.stats.missions++; out.push(MISSIONS[t].text(m.goal)); }
    if (m.prog !== before) saveStore();
  }
  return out;
}
export const allMissionsDone = () => !!store.daily && store.daily.list.every((m) => m.done);
