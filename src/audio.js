// Kleine Synth-Soundeffekte mit WebAudio, ohne Audiodateien.
let ac = null, master = null, enabled = true, lastBlip = 0, blipStep = 0;

export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.5 : 0; }
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = enabled ? 0.5 : 0; master.connect(ac.destination);
  } catch (e) { ac = null; }
}

function tone({ f = 440, f2 = null, t = 0.12, type = 'sine', vol = 0.3, delay = 0, attack = 0.005 }) {
  if (!ac || !enabled || ac.state !== 'running') return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + t);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + t + 0.03);
}
function noise({ t = 0.2, vol = 0.25, f = 1200, f2 = 200, delay = 0 }) {
  if (!ac || !enabled || ac.state !== 'running') return;
  const t0 = ac.currentTime + delay, len = Math.floor(ac.sampleRate * t);
  const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(); src.buffer = buf;
  const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f, t0); flt.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(flt); flt.connect(g); g.connect(master); src.start(t0);
}

const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319];
export const sfx = {
  dot() {
    const now = performance.now();
    if (now - lastBlip < 55) return;
    blipStep = now - lastBlip < 400 ? (blipStep + 1) % SCALE.length : 0; lastBlip = now;
    tone({ f: SCALE[blipStep], t: 0.07, type: 'triangle', vol: 0.09 });
  },
  eat() { tone({ f: 220, f2: 70, t: 0.28, type: 'sine', vol: 0.5 }); tone({ f: 660, f2: 990, t: 0.16, type: 'triangle', vol: 0.16, delay: 0.05 }); },
  split() { noise({ t: 0.16, vol: 0.2, f: 2400, f2: 400 }); tone({ f: 380, f2: 760, t: 0.12, type: 'sine', vol: 0.14 }); },
  eject() { tone({ f: 520, f2: 260, t: 0.07, type: 'square', vol: 0.05 }); },
  pick() { tone({ f: 660, t: 0.09, type: 'triangle', vol: 0.2 }); tone({ f: 990, t: 0.14, type: 'triangle', vol: 0.2, delay: 0.08 }); },
  item() { tone({ f: 300, f2: 1200, t: 0.3, type: 'sawtooth', vol: 0.12 }); noise({ t: 0.3, vol: 0.12, f: 3000, f2: 600 }); },
  nova() { noise({ t: 0.7, vol: 0.4, f: 2200, f2: 60 }); tone({ f: 120, f2: 35, t: 0.6, type: 'sine', vol: 0.5 }); },
  burst() { noise({ t: 0.4, vol: 0.3, f: 1800, f2: 120 }); tone({ f: 160, f2: 50, t: 0.35, type: 'triangle', vol: 0.3 }); },
  death() { tone({ f: 420, f2: 60, t: 0.7, type: 'sawtooth', vol: 0.2 }); noise({ t: 0.5, vol: 0.2, f: 900, f2: 80 }); },
  spawn() { tone({ f: 330, f2: 660, t: 0.18, type: 'sine', vol: 0.2 }); },
  goal() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: 0.22, type: 'square', vol: 0.11, delay: i * 0.11 })); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, t: 0.3, type: 'triangle', vol: 0.2, delay: i * 0.13 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone({ f, t: 0.3, type: 'triangle', vol: 0.18, delay: i * 0.16 })); },
  click() { tone({ f: 700, t: 0.04, type: 'triangle', vol: 0.1 }); },
  ach() { [784, 988, 1175, 1568].forEach((f, i) => tone({ f, t: 0.18, type: 'triangle', vol: 0.17, delay: i * 0.08 })); },
  warp() { tone({ f: 900, f2: 180, t: 0.25, type: 'sine', vol: 0.25 }); tone({ f: 180, f2: 1200, t: 0.3, type: 'triangle', vol: 0.18, delay: 0.12 }); },
  streak() { [660, 880, 1320].forEach((f, i) => tone({ f, t: 0.12, type: 'square', vol: 0.1, delay: i * 0.06 })); },
  tick() { tone({ f: 880, t: 0.05, type: 'square', vol: 0.06 }); },
};
