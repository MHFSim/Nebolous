// Eingabe: schwebender Touch-Steuerknüppel, Maus-Zielen, Tastatur.
export class Input {
  constructor(canvas, settings) {
    this.cv = canvas; this.settings = settings;
    this.ax = 0; this.ay = 0; this.eject = false;
    this.joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, rad: 62 };
    this.mouse = false; this.enabled = false;
    this.onSplit = null; this.onItem = null; this.onEmote = null; this.onMenu = null;
    this.keys = new Set();

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const up = (e) => this.up(e);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.eject = false; this.keys.clear(); });
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      this.mouse = true; this.aimMouse(e);
      if (e.button === 0 && this.onSplit) this.onSplit(); else if (e.button === 2) this.eject = true;
      return;
    }
    if (this.joy.active) return;
    const j = this.joy;
    j.active = true; j.id = e.pointerId; j.ox = j.x = e.clientX; j.oy = j.y = e.clientY;
    try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  move(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') { this.mouse = true; this.aimMouse(e); return; }
    const j = this.joy;
    if (!j.active || e.pointerId !== j.id) return;
    let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
    const d = Math.hypot(dx, dy);
    if (d > j.rad) {
      // Mittelpunkt wandert mit, damit die Richtung schnell wechseln kann
      const over = d - j.rad; j.ox += (dx / d) * over; j.oy += (dy / d) * over;
      dx = e.clientX - j.ox; dy = e.clientY - j.oy;
    }
    j.x = e.clientX; j.y = e.clientY;
    const m = Math.hypot(dx, dy) / j.rad;
    if (m < 0.12) { if (this.settings.stopOnRelease) { this.ax = 0; this.ay = 0; } return; }
    const k = Math.min(1, m * 1.25) / (m * j.rad);
    this.ax = dx * k; this.ay = dy * k;
  }
  up(e) {
    if (e.pointerType === 'mouse') { if (e.button === 2) this.eject = false; return; }
    const j = this.joy;
    if (j.active && e.pointerId === j.id) { j.active = false; j.id = -1; if (this.settings.stopOnRelease) { this.ax = 0; this.ay = 0; } }
  }
  aimMouse(e) {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const R = Math.min(cx, cy) * 0.55;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    if (m < 0.08) { dx = 0; dy = 0; }
    this.ax = dx; this.ay = dy;
  }
  key(e, down) {
    if (!this.enabled) return;
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ') { e.preventDefault(); if (down && !e.repeat && this.onSplit) this.onSplit(); return; }
    if (k === 'w') { this.eject = down; return; }
    if (down && !e.repeat) {
      if ((k === 'e' || k === 'q') && this.onItem) this.onItem();
      else if (k === 'Escape' && this.onMenu) this.onMenu();
      else if (k >= '1' && k <= '8' && this.onEmote) this.onEmote(+k - 1);
    }
    // Pfeiltasten als Ersatzsteuerung
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 's'].includes(k) || (k === 'ArrowUp')) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        const x = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
        const y = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
        const m = Math.hypot(x, y) || 1;
        this.ax = x / m; this.ay = y / m; this.mouse = false;
      }
    }
  }
  reset() { this.ax = 0; this.ay = 0; this.eject = false; this.joy.active = false; this.keys.clear(); }
}
