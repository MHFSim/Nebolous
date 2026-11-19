// Gemeinsame Konstanten für Simulation, Netz und Darstellung.
export const VERSION = 3;
export const TICK_HZ = 25;
export const DT = 1 / TICK_HZ;

export const POS_SCALE = 4; // u16-Kodierung: Weltkoordinate * 4
export const RAD_SCALE = 8;

export const MAPS = {
  klein: { w: 4000, h: 4000, label: 'Klein' },
  mittel: { w: 6000, h: 6000, label: 'Mittel' },
  gross: { w: 9000, h: 9000, label: 'Groß' },
};
export const SOCCER_MAP = { w: 4600, h: 2800 };
export const GOAL_HALF = 420;

export const MODES = {
  ffa: { label: 'Jeder gegen jeden', short: 'FFA', desc: 'Friss alle. Wer die meiste Masse hat, führt.' },
  teams: { label: 'Teams', short: 'Teams', desc: 'Teams kämpfen um die größte Gesamtmasse.' },
  royale: { label: 'Battle Royale', short: 'Royale', desc: 'Ein Leben. Die Zone schrumpft. Der Letzte gewinnt.' },
  soccer: { label: 'Fußball', short: 'Fußball', desc: 'Zwei Teams, ein Ball. Schieß ihn ins gegnerische Tor.' },
};

export const DEFAULT_OPTS = {
  mode: 'ffa',
  map: 'mittel',
  roundTime: 0, // Minuten, 0 = endlos
  bots: 12,
  botLevel: 2, // 1 leicht, 2 mittel, 3 schwer
  mayhem: false,
  items: true,
  maxCells: 16,
  teams: 2,
};

export const START_MASS = 20;
export const MIN_SPLIT_MASS = 36;
export const MIN_EJECT_MASS = 32;
export const EJECT_COST = 15;
export const EJECT_MASS = 12;
export const MAX_CELL_MASS = 22500;
export const EAT_RATIO = 1.2;
export const MAX_PLAYERS = 40; // inkl. Bots
export const MAX_HUMANS = 12;

export const massToRadius = (m) => Math.sqrt(m) * 5;
export const radiusToMass = (r) => (r * r) / 25;
export const baseSpeed = (r) => 1000 * Math.pow(r, -0.44);

// Sichtweite: Breite der Welt, die auf der langen Bildschirmseite sichtbar ist.
export function viewWidth(totalR) {
  const scale = Math.pow(Math.min(40 / Math.max(totalR, 1), 1), 0.4);
  return 1150 / scale;
}

export const TEAM_COLORS = [
  { name: 'Blau', hue: 212 },
  { name: 'Rot', hue: 2 },
  { name: 'Grün', hue: 130 },
  { name: 'Gold', hue: 45 },
];

export const ITEMS = [
  null,
  { id: 1, key: 'turbo', name: 'Turbo', icon: '⚡', hue: 50, desc: '6 Sekunden lang deutlich schneller.' },
  { id: 2, key: 'schild', name: 'Schild', icon: '🛡️', hue: 200, desc: '5 Sekunden lang kann dich niemand fressen.' },
  { id: 3, key: 'fusion', name: 'Fusion', icon: '🧲', hue: 280, desc: 'Deine Teile dürfen sofort wieder verschmelzen.' },
  { id: 4, key: 'sog', name: 'Sog', icon: '🌀', hue: 170, desc: '8 Sekunden lang ziehst du Sternenstaub an.' },
  { id: 5, key: 'frost', name: 'Frost', icon: '❄️', hue: 190, desc: 'Friert Gegner in der Nähe 4 Sekunden ein.' },
  { id: 6, key: 'wachstum', name: 'Wachstum', icon: '🍄', hue: 110, desc: 'Sofort 20 % mehr Masse.' },
  { id: 7, key: 'tarnung', name: 'Tarnung', icon: '👻', hue: 0, desc: '6 Sekunden lang für Gegner unsichtbar.' },
  { id: 8, key: 'nova', name: 'Supernova', icon: '💥', hue: 20, desc: 'Schleudert Gegner weg und sprengt Masse ab.' },
];

export const EMOTES = ['😀', '😂', '😎', '😱', '😡', '👋', '❤️', '💀'];

// Zell-Flags im Snapshot
export const F_HIDDEN = 1, F_SHIELD = 2, F_FROZEN = 4, F_GHOST = 8, F_PROT = 16, F_TURBO = 32, F_MAGNET = 64;

export const BOT_NAMES = [
  'Andromeda', 'Quasar', 'Pulsar', 'Kometchen', 'Sternschnuppe', 'Nebelfürst', 'Orbitus', 'Lunatik',
  'Sonnenwind', 'Astroknödel', 'Meteorix', 'Galaktika', 'Plutonia', 'Zwergstern', 'Kosmonaut', 'Sputnik',
  'Mondkalb', 'Raketenrudi', 'Venusfalle', 'Saturnia', 'Protonius', 'Dunkelmaterie', 'Wurmloch', 'Photonix',
  'Neutrino', 'Supernovi', 'Marsmännchen', 'Blobby', 'Graviton', 'Lichtjahr', 'Urknall', 'Ionensturm',
  'Sternenstaub', 'Kraterkarl', 'Mondgesicht', 'Asteroida', 'Schwerkraft', 'Milchstraße', 'Polarlicht', 'Titania',
];

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PEER_PREFIX = 'sternfresser-v' + VERSION + '-';

export function xpForLevel(level) {
  // XP, die insgesamt nötig sind, um dieses Level zu erreichen
  return Math.round(120 * Math.pow(level - 1, 1.6));
}
export function levelFromXp(xp) {
  let l = 1;
  while (l < 99 && xp >= xpForLevel(l + 1)) l++;
  return l;
}
