// Prozedurale Skins: werden einmal in eine kleine Leinwand gemalt und dann als Bild gezeichnet.
// Koordinaten beim Malen: Mittelpunkt (0,0), Radius 1.
const TAU = Math.PI * 2;
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

function base(c, h, s = 82, l = 56) {
  const g = c.createRadialGradient(-0.3, -0.35, 0.05, 0, 0, 1);
  g.addColorStop(0, hsl(h, s, l + 16)); g.addColorStop(0.6, hsl(h, s, l)); g.addColorStop(1, hsl(h, s + 5, l - 20));
  c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
}
function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }
function eye(c, x, y, r, look = 0.25, iris = '#1b1b2b') {
  circle(c, x, y, r, '#fff'); circle(c, x + r * look, y + r * 0.1, r * 0.55, iris); circle(c, x + r * look - r * 0.15, y - r * 0.15, r * 0.18, '#fff');
}
function eyes(c, y = -0.18, dx = 0.34, r = 0.2, look = 0.2) { eye(c, -dx, y, r, look); eye(c, dx, y, r, look); }
function smile(c, y = 0.2, w = 0.42, depth = 0.3, lw = 0.07, col = '#1b1b2b') {
  c.beginPath(); c.moveTo(-w, y); c.quadraticCurveTo(0, y + depth * 2, w, y); c.lineWidth = lw; c.lineCap = 'round'; c.strokeStyle = col; c.stroke();
}
function rnd(seed) { let s = seed; return () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647; }; }
function star(c, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? r * inner : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}

export const SKINS = [
  { name: 'Klassik', lvl: 1, paint: (c, h) => base(c, h) },
  { name: 'Lächler', lvl: 1, paint: (c, h) => { base(c, h); eyes(c); smile(c); } },
  { name: 'Gasriese', lvl: 1, paint: (c, h) => {
    base(c, h);
    const r = rnd(7);
    for (let i = 0; i < 9; i++) { c.fillStyle = hsl(h + (r() - 0.5) * 50, 70, 35 + r() * 40, 0.45); const y = -1 + i * 0.23 + r() * 0.05; c.beginPath(); c.ellipse(0, y, 1.2, 0.07 + r() * 0.07, (r() - 0.5) * 0.08, 0, TAU); c.fill(); }
    c.fillStyle = hsl(h + 180, 70, 60, 0.7); c.beginPath(); c.ellipse(0.3, 0.3, 0.22, 0.12, 0, 0, TAU); c.fill();
  } },
  { name: 'Mond', lvl: 1, paint: (c) => {
    base(c, 220, 8, 66);
    const r = rnd(3);
    for (let i = 0; i < 12; i++) { const x = (r() - 0.5) * 1.7, y = (r() - 0.5) * 1.7, s = 0.06 + r() * 0.17; circle(c, x, y, s, 'rgba(60,62,80,0.45)'); circle(c, x + s * 0.15, y + s * 0.15, s * 0.8, 'rgba(190,192,205,0.6)'); }
  } },
  { name: 'Zyklop', lvl: 1, paint: (c, h) => { base(c, h); eye(c, 0, -0.12, 0.42, 0.15, hsl(h + 180, 70, 30)); smile(c, 0.5, 0.3, 0.12); } },
  { name: 'Zielscheibe', lvl: 1, paint: (c, h) => { for (let i = 0; i < 5; i++) circle(c, 0, 0, 1 - i * 0.2, i % 2 ? '#f4f4f8' : hsl(h, 80, 52)); } },
  { name: 'Cool', lvl: 2, paint: (c, h) => {
    base(c, h); smile(c, 0.3, 0.35, 0.18);
    c.fillStyle = '#12121c'; c.beginPath(); c.roundRect(-0.72, -0.36, 0.62, 0.38, 0.14); c.roundRect(0.1, -0.36, 0.62, 0.38, 0.14); c.fill(); c.fillRect(-0.2, -0.3, 0.4, 0.08); c.fillRect(-1, -0.3, 0.3, 0.07); c.fillRect(0.7, -0.3, 0.3, 0.07);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(-0.6, -0.3); c.lineTo(-0.42, -0.3); c.lineTo(-0.56, -0.05); c.lineTo(-0.66, -0.05); c.fill();
  } },
  { name: 'Erde', lvl: 2, paint: (c) => {
    base(c, 210, 80, 50);
    const r = rnd(11);
    for (let i = 0; i < 7; i++) { c.fillStyle = hsl(110 + r() * 30, 55, 38 + r() * 12); c.beginPath(); const x = (r() - 0.5) * 1.6, y = (r() - 0.5) * 1.6; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, rr = 0.15 + r() * 0.28; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); } c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse((r() - 0.5) * 1.6, (r() - 0.5) * 1.6, 0.2 + r() * 0.2, 0.05, r() * 0.5, 0, TAU); c.fill(); }
  } },
  { name: 'Punkte', lvl: 3, paint: (c, h) => { base(c, h); for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) circle(c, x * 0.36 + (y % 2 ? 0.18 : 0), y * 0.32, 0.09, 'rgba(255,255,255,0.85)'); } },
  { name: 'Wütend', lvl: 3, paint: (c, h) => {
    base(c, h); eyes(c, -0.1, 0.34, 0.2, 0);
    c.strokeStyle = '#1b1b2b'; c.lineWidth = 0.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(-0.62, -0.5); c.lineTo(-0.18, -0.28); c.moveTo(0.62, -0.5); c.lineTo(0.18, -0.28); c.stroke();
    smile(c, 0.52, 0.3, -0.12);
  } },
  { name: 'Sonne', lvl: 4, paint: (c) => {
    c.fillStyle = '#ff9a1f'; c.fillRect(-1, -1, 2, 2);
    c.fillStyle = '#ffd23a'; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.beginPath(); c.moveTo(Math.cos(a - 0.12) * 0.6, Math.sin(a - 0.12) * 0.6); c.lineTo(Math.cos(a) * 1.05, Math.sin(a) * 1.05); c.lineTo(Math.cos(a + 0.12) * 0.6, Math.sin(a + 0.12) * 0.6); c.fill(); }
    const g = c.createRadialGradient(0, 0, 0.1, 0, 0, 0.7); g.addColorStop(0, '#fff6c2'); g.addColorStop(1, '#ffc21f'); circle(c, 0, 0, 0.68, g);
    eyes(c, -0.1, 0.24, 0.1, 0); smile(c, 0.14, 0.24, 0.14, 0.05);
  } },
  { name: 'Streifen', lvl: 4, paint: (c, h) => { base(c, h); c.save(); c.rotate(-0.6); c.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = -4; i <= 4; i++) c.fillRect(-1.5, i * 0.4 - 0.09, 3, 0.18); c.restore(); } },
  { name: 'Alien', lvl: 5, paint: (c) => {
    base(c, 125, 70, 50);
    c.fillStyle = '#0c0c14'; c.beginPath(); c.ellipse(-0.36, -0.1, 0.24, 0.36, 0.5, 0, TAU); c.ellipse(0.36, -0.1, 0.24, 0.36, -0.5, 0, TAU); c.fill();
    circle(c, -0.42, -0.24, 0.07, '#fff'); circle(c, 0.3, -0.24, 0.07, '#fff'); smile(c, 0.5, 0.14, 0.05, 0.04);
  } },
  { name: 'Lava', lvl: 6, paint: (c) => {
    c.fillStyle = '#2a1410'; c.fillRect(-1, -1, 2, 2);
    const r = rnd(5); c.lineCap = 'round';
    for (let i = 0; i < 16; i++) { let x = (r() - 0.5) * 2, y = (r() - 0.5) * 2; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 0.6; y += (r() - 0.5) * 0.6; c.lineTo(x, y); } c.strokeStyle = '#ff5a1f'; c.lineWidth = 0.09; c.stroke(); c.strokeStyle = '#ffd34a'; c.lineWidth = 0.03; c.stroke(); }
  } },
  { name: 'Katze', lvl: 7, paint: (c, h) => {
    base(c, h);
    c.fillStyle = hsl(h, 80, 30); c.beginPath(); c.moveTo(-0.85, -0.5); c.lineTo(-0.5, -1.05); c.lineTo(-0.2, -0.75); c.fill(); c.beginPath(); c.moveTo(0.85, -0.5); c.lineTo(0.5, -1.05); c.lineTo(0.2, -0.75); c.fill();
    eyes(c, -0.12, 0.34, 0.19, 0, '#143a1e');
    c.fillStyle = '#ff8fb0'; c.beginPath(); c.moveTo(-0.09, 0.14); c.lineTo(0.09, 0.14); c.lineTo(0, 0.26); c.fill();
    c.strokeStyle = '#1b1b2b'; c.lineWidth = 0.04; c.beginPath(); c.moveTo(0, 0.26); c.quadraticCurveTo(-0.14, 0.46, -0.28, 0.32); c.moveTo(0, 0.26); c.quadraticCurveTo(0.14, 0.46, 0.28, 0.32);
    for (const s of [-1, 1]) { c.moveTo(s * 0.4, 0.2); c.lineTo(s * 0.9, 0.1); c.moveTo(s * 0.4, 0.28); c.lineTo(s * 0.9, 0.34); } c.stroke();
  } },
  { name: 'Schach', lvl: 8, paint: (c, h) => { for (let y = -4; y < 4; y++) for (let x = -4; x < 4; x++) { c.fillStyle = (x + y) & 1 ? '#f2f2f6' : hsl(h, 75, 45); c.fillRect(x * 0.25, y * 0.25, 0.26, 0.26); } } },
  { name: 'Eisplanet', lvl: 9, paint: (c) => {
    base(c, 195, 70, 72);
    const r = rnd(9); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.035;
    for (let i = 0; i < 9; i++) { const x = (r() - 0.5) * 1.6, y = (r() - 0.5) * 1.6, s = 0.12 + r() * 0.16; c.beginPath(); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + r(); c.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s); c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } c.stroke(); }
  } },
  { name: 'Pirat', lvl: 10, paint: (c, h) => {
    base(c, h); eye(c, 0.34, -0.15, 0.2, 0.1);
    c.fillStyle = '#12121c'; c.beginPath(); c.ellipse(-0.34, -0.14, 0.26, 0.22, 0, 0, TAU); c.fill(); c.save(); c.rotate(-0.25); c.fillRect(-1.2, -0.4, 2.4, 0.09); c.restore();
    smile(c, 0.36, 0.34, 0.14);
    c.fillStyle = '#c0222d'; c.beginPath(); c.moveTo(-1, -0.55); c.quadraticCurveTo(0, -1.35, 1, -0.55); c.quadraticCurveTo(0, -0.8, -1, -0.55); c.fill();
  } },
  { name: 'Galaxie', lvl: 11, paint: (c, h) => {
    c.fillStyle = '#0a0820'; c.fillRect(-1, -1, 2, 2);
    for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 90; i++) { const t = i / 90, a = arm * Math.PI + t * 7, rr = t * 0.95; circle(c, Math.cos(a) * rr, Math.sin(a) * rr * 0.85, 0.11 * (1 - t) + 0.02, hsl(h + t * 80, 85, 68, 0.5)); }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.3); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,240,200,0)'); circle(c, 0, 0, 0.3, g);
  } },
  { name: 'Roboter', lvl: 12, paint: (c) => {
    base(c, 210, 12, 62);
    c.fillStyle = '#1b2333'; c.beginPath(); c.roundRect(-0.68, -0.42, 1.36, 0.5, 0.12); c.fill();
    circle(c, -0.34, -0.17, 0.15, '#3cf2ff'); circle(c, 0.34, -0.17, 0.15, '#3cf2ff');
    c.fillStyle = '#1b2333'; c.fillRect(-0.4, 0.34, 0.8, 0.2); c.fillStyle = '#cfd6e2'; for (let i = 0; i < 4; i++) c.fillRect(-0.34 + i * 0.19, 0.38, 0.11, 0.12);
    c.fillStyle = '#ff4d5e'; c.fillRect(-0.04, -1, 0.08, 0.3); circle(c, 0, -0.74, 0.09, '#ff4d5e');
  } },
  { name: 'Nachthimmel', lvl: 13, paint: (c, h) => {
    const g = c.createLinearGradient(0, -1, 0, 1); g.addColorStop(0, hsl(h, 70, 12)); g.addColorStop(1, hsl(h + 60, 70, 30)); c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
    const r = rnd(21); for (let i = 0; i < 40; i++) circle(c, (r() - 0.5) * 2, (r() - 0.5) * 2, 0.015 + r() * 0.03, 'rgba(255,255,255,0.9)');
    c.fillStyle = '#fff4b0'; star(c, 0.25, -0.2, 0.3); c.fill();
  } },
  { name: 'Melone', lvl: 14, paint: (c) => {
    c.fillStyle = '#1f8a3a'; c.fillRect(-1, -1, 2, 2); circle(c, 0, 0, 0.9, '#d8f5c4'); circle(c, 0, 0, 0.8, '#ff4d62');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.2, rr = i % 2 ? 0.55 : 0.3; c.fillStyle = '#231418'; c.beginPath(); c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 0.05, 0.08, a + Math.PI / 2, 0, TAU); c.fill(); }
  } },
  { name: 'Regenbogen', lvl: 15, paint: (c) => { const g = c.createConicGradient ? c.createConicGradient(0, 0, 0) : null; if (g) { for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, hsl(i * 30, 90, 58)); c.fillStyle = g; c.fillRect(-1, -1, 2, 2); } else for (let i = 0; i < 12; i++) { c.fillStyle = hsl(i * 30, 90, 58); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 1.2, (i / 12) * TAU, ((i + 1) / 12) * TAU + 0.02); c.fill(); } circle(c, 0, 0, 0.3, 'rgba(255,255,255,0.9)'); } },
  { name: 'Geist', lvl: 16, paint: (c) => {
    base(c, 250, 30, 26);
    c.fillStyle = '#f3f4ff'; c.beginPath(); c.arc(0, -0.15, 0.6, Math.PI, 0); c.lineTo(0.6, 0.7); for (let i = 0; i < 4; i++) c.quadraticCurveTo(0.45 - i * 0.3, 0.45, 0.3 - i * 0.3, 0.7); c.closePath(); c.fill();
    circle(c, -0.22, -0.15, 0.11, '#161624'); circle(c, 0.22, -0.15, 0.11, '#161624'); c.beginPath(); c.ellipse(0, 0.16, 0.1, 0.14, 0, 0, TAU); c.fillStyle = '#161624'; c.fill();
  } },
  { name: 'Herz', lvl: 17, paint: (c, h) => {
    base(c, h, 60, 82);
    c.fillStyle = '#ff2d55'; c.beginPath(); c.moveTo(0, 0.62); c.bezierCurveTo(-1.0, -0.05, -0.55, -0.85, 0, -0.32); c.bezierCurveTo(0.55, -0.85, 1.0, -0.05, 0, 0.62); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(-0.3, -0.3, 0.12, 0.07, -0.7, 0, TAU); c.fill();
  } },
  { name: 'Blitz', lvl: 18, paint: (c, h) => {
    base(c, h, 70, 30);
    c.fillStyle = '#ffe23a'; c.beginPath(); c.moveTo(0.2, -0.85); c.lineTo(-0.45, 0.1); c.lineTo(-0.02, 0.1); c.lineTo(-0.25, 0.85); c.lineTo(0.5, -0.15); c.lineTo(0.05, -0.15); c.closePath(); c.fill();
    c.strokeStyle = '#fff7b8'; c.lineWidth = 0.03; c.stroke();
  } },
  { name: 'Kürbis', lvl: 19, paint: (c) => {
    base(c, 28, 90, 52);
    c.strokeStyle = 'rgba(120,50,0,0.5)'; c.lineWidth = 0.04; for (const x of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(x, 0, 0.3, 1, 0, 0, TAU); c.stroke(); }
    c.fillStyle = '#201008'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.5, -0.08); c.lineTo(s * 0.18, -0.08); c.lineTo(s * 0.34, -0.42); c.fill(); }
    c.beginPath(); c.moveTo(-0.55, 0.2); c.lineTo(-0.3, 0.32); c.lineTo(-0.15, 0.2); c.lineTo(0, 0.34); c.lineTo(0.15, 0.2); c.lineTo(0.3, 0.32); c.lineTo(0.55, 0.2); c.quadraticCurveTo(0, 0.85, -0.55, 0.2); c.fill();
  } },
  { name: 'Auge', lvl: 20, paint: (c, h) => {
    c.fillStyle = '#f6f2ee'; c.fillRect(-1, -1, 2, 2);
    const r = rnd(4); c.strokeStyle = 'rgba(220,60,60,0.5)'; c.lineWidth = 0.02; for (let i = 0; i < 14; i++) { const a = r() * TAU; c.beginPath(); c.moveTo(Math.cos(a), Math.sin(a)); c.quadraticCurveTo(Math.cos(a + 0.3) * 0.8, Math.sin(a + 0.3) * 0.8, Math.cos(a) * 0.6, Math.sin(a) * 0.6); c.stroke(); }
    const g = c.createRadialGradient(0, 0, 0.1, 0, 0, 0.55); g.addColorStop(0, hsl(h, 90, 65)); g.addColorStop(1, hsl(h, 80, 28)); circle(c, 0, 0, 0.55, g); circle(c, 0, 0, 0.25, '#0a0a12'); circle(c, -0.14, -0.16, 0.1, '#fff');
  } },
  { name: 'Totenkopf', lvl: 22, paint: (c) => {
    base(c, 260, 25, 20);
    c.fillStyle = '#f1efe6'; c.beginPath(); c.arc(0, -0.12, 0.58, 0, TAU); c.fill(); c.beginPath(); c.roundRect(-0.3, 0.25, 0.6, 0.38, 0.08); c.fill();
    c.fillStyle = '#17141f'; c.beginPath(); c.ellipse(-0.24, -0.14, 0.16, 0.19, 0, 0, TAU); c.ellipse(0.24, -0.14, 0.16, 0.19, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(0, 0.08); c.lineTo(-0.07, 0.24); c.lineTo(0.07, 0.24); c.fill(); for (const x of [-0.12, 0, 0.12]) c.fillRect(x - 0.012, 0.42, 0.024, 0.2);
  } },
  { name: 'Ringplanet', lvl: 24, paint: (c, h) => {
    c.fillStyle = '#0a0a1c'; c.fillRect(-1, -1, 2, 2);
    c.save(); c.rotate(-0.4);
    c.strokeStyle = hsl(h + 40, 70, 75, 0.9); c.lineWidth = 0.09; c.beginPath(); c.ellipse(0, 0, 0.95, 0.3, 0, Math.PI, TAU); c.stroke();
    const g = c.createRadialGradient(-0.2, -0.2, 0.05, 0, 0, 0.6); g.addColorStop(0, hsl(h, 85, 72)); g.addColorStop(1, hsl(h, 80, 36)); circle(c, 0, 0, 0.58, g);
    c.fillStyle = hsl(h + 20, 70, 30, 0.35); c.fillRect(-0.6, -0.1, 1.2, 0.1); c.fillRect(-0.6, 0.2, 1.2, 0.07);
    c.beginPath(); c.ellipse(0, 0, 0.95, 0.3, 0, 0, Math.PI); c.stroke();
    c.restore();
  } },
  { name: 'Schwarzes Loch', lvl: 26, paint: (c, h) => {
    c.fillStyle = '#03030a'; c.fillRect(-1, -1, 2, 2);
    for (let i = 0; i < 26; i++) { const t = i / 26; c.strokeStyle = hsl(h + t * 60, 95, 55 + t * 20, 0.5); c.lineWidth = 0.035; c.beginPath(); c.arc(0, 0, 0.5 + t * 0.48, t * 9, t * 9 + 2.2); c.stroke(); }
    circle(c, 0, 0, 0.44, '#000'); c.strokeStyle = '#ffe9b0'; c.lineWidth = 0.03; c.beginPath(); c.arc(0, 0, 0.455, 0, TAU); c.stroke();
  } },
  { name: 'Krone', lvl: 28, paint: (c, h) => {
    base(c, h); eyes(c, 0.08, 0.3, 0.16); smile(c, 0.42, 0.3, 0.12, 0.06);
    c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(-0.6, -0.3); c.lineTo(-0.66, -0.88); c.lineTo(-0.32, -0.56); c.lineTo(0, -0.98); c.lineTo(0.32, -0.56); c.lineTo(0.66, -0.88); c.lineTo(0.6, -0.3); c.closePath(); c.fill(); c.strokeStyle = '#a56a00'; c.lineWidth = 0.035; c.stroke();
    circle(c, 0, -0.5, 0.07, '#ff3b5c'); circle(c, -0.34, -0.42, 0.05, '#3cc8ff'); circle(c, 0.34, -0.42, 0.05, '#3cc8ff');
  } },
  { name: 'Gold', lvl: 30, paint: (c) => {
    const g = c.createLinearGradient(-1, -1, 1, 1); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, '#ffcf3a'); g.addColorStop(0.55, '#b87a00'); g.addColorStop(0.75, '#ffd95a'); g.addColorStop(1, '#8a5a00'); c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
    c.fillStyle = 'rgba(255,255,255,0.85)'; star(c, 0, 0, 0.5, 4, 0.25); c.fill(); star(c, 0.45, -0.45, 0.2, 4, 0.25); c.fill();
  } },
];

const cache = new Map();
export function skinTexture(skin, hue, size = 160) {
  const idx = ((skin | 0) % SKINS.length + SKINS.length) % SKINS.length;
  const key = idx + '|' + hue + '|' + size;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'), R = size / 2;
  c.translate(R, R); c.scale(R, R);
  c.save(); c.beginPath(); c.arc(0, 0, 0.94, 0, TAU); c.clip();
  try { SKINS[idx].paint(c, hue); } catch (e) { base(c, hue); }
  // Glanz und Schattierung über jedem Skin
  let g = c.createRadialGradient(0, 0, 0.55, 0, 0, 0.96); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.38)');
  c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
  g = c.createRadialGradient(-0.35, -0.42, 0, -0.35, -0.42, 0.55); g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
  c.restore();
  c.beginPath(); c.arc(0, 0, 0.95, 0, TAU); c.lineWidth = 0.07; c.strokeStyle = hsl(hue, 85, 72, 0.95); c.stroke();
  cache.set(key, cv);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return cv;
}
