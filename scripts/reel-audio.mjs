// The sound of the Instagram / TikTok reels (public/sella/reels.html): music and effects made right here
// (no samples, no licences), timed to the reels' scenes, plus the recorded voice in reel 2.
// Writes a WAV that scripts/record-film.mjs takes as --audio, or that is put onto a finished video:
//   node scripts/reel-audio.mjs 1 out.wav
//   node scripts/reel-audio.mjs 2 out.wav --d 2.2,3,9.7,3.4 --voice answer.mp3 --voice-at 5.6
// The scene lengths are the defaults in reels.html (REELS) unless --d gives the ones used for the recording.
// Needs ffmpeg-static for reading the voice (npm i --no-save ffmpeg-static).
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const [reel = "1", outFile = "reel.wav"] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const opt = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const SCENES = { 1: [2.6, 1.4, 5.6, 2.0, 3.2], 2: [2.2, 3.0, 9.6, 3.4], 3: [3.0, 3.6, 3.8, 3.0, 3.2], 4: [3.6, 0], 5: [2.4, 5.0, 0], 6: [0, 3.2] };
const lens = (opt("d") || "").split(",").map(Number);
const S = [];
let acc = 0;
SCENES[reel].forEach((d, i) => { S.push(acc); acc += lens[i] > 0 ? lens[i] : d; });
const DUR = acc, END = S[S.length - 1];

// ---- a mono float buffer and the instruments that write into it
const SR = 44100;
const buf = new Float32Array(Math.ceil((DUR + 0.5) * SR));
const music = new Float32Array(buf.length); // the music bus (ducked under the voice)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
function add(bus, t0, dur, fn) {
  const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(bus.length, Math.floor((t0 + dur) * SR));
  for (let i = a; i < b; i++) bus[i] += fn((i - a) / SR);
}
const TAU = Math.PI * 2;
const kick = (bus, t0, g = 0.9) => { let ph = 0; add(bus, t0, 0.45, (t) => { ph += TAU * (45 + 110 * Math.exp(-t * 28)) / SR; return Math.sin(ph) * Math.exp(-t * 7) * g; }); };
const hat = (bus, t0, g = 0.12) => { let prev = 0; add(bus, t0, 0.06, (t) => { const n = rnd(), h = n - prev; prev = n; return h * Math.exp(-t * 70) * g; }); };
const clap = (bus, t0, g = 0.25) => add(bus, t0, 0.25, (t) => rnd() * Math.exp(-t * 18) * g * (t < 0.01 || (t > 0.012 && t < 0.02) || t > 0.024 ? 1 : 0.3));
function tone(bus, t0, dur, f, g, { attack = 0.01, decay = 0, harm = [1], vib = 0 } = {}) {
  let ph = 0;
  add(bus, t0, dur, (t) => {
    ph += TAU * f * (1 + vib * Math.sin(t * 30)) / SR;
    const env = Math.min(1, t / attack) * (decay ? Math.exp(-t * decay) : Math.min(1, (dur - t) / 0.08));
    return harm.reduce((s, h, k) => s + Math.sin(ph * (k + 1)) * h, 0) * env * g;
  });
}
const pluck = (bus, t0, f, g = 0.16) => tone(bus, t0, 0.9, f, g, { attack: 0.003, decay: 7, harm: [1, 0.35, 0.12] });
const bass = (bus, t0, dur, f, g = 0.3) => tone(bus, t0, dur, f, g, { attack: 0.01, harm: [1, 0.5, 0.25, 0.1] });
const pad = (bus, t0, dur, fs, g = 0.05) => { for (const f of fs) for (const d of [-0.004, 0.004]) tone(bus, t0, dur, f * (1 + d), g, { attack: Math.min(0.8, dur / 3), harm: [1, 0.2] }); };
function whoosh(bus, t0, dur, g = 0.35, up = true) {
  let lp = 0;
  add(bus, t0, dur, (t) => {
    const u = t / dur, cut = up ? 0.02 + 0.4 * u : 0.42 - 0.4 * u; // a sweeping one-pole low-pass
    lp += (rnd() - lp) * cut;
    return lp * Math.sin(Math.PI * u) ** 2 * g;
  });
}
const pop = (bus, t0, g = 0.22, f0 = 500) => { let ph = 0; add(bus, t0, 0.09, (t) => { ph += TAU * (f0 + 900 * t / 0.09) / SR; return Math.sin(ph) * Math.exp(-t * 40) * g; }); };
const click = (bus, t0, g = 0.08) => add(bus, t0, 0.012, (t) => rnd() * Math.exp(-t * 500) * g);
const ding = (bus, t0, g = 0.16) => { tone(bus, t0, 1.2, 1318.5, g, { attack: 0.002, decay: 4 }); tone(bus, t0 + 0.07, 1.2, 1975.5, g * 0.8, { attack: 0.002, decay: 4 }); };
const sparkle = (bus, t0, g = 0.05) => { for (let i = 0; i < 10; i++) tone(bus, t0 + i * 0.035, 0.3, 2000 + ((i * 7919) % 2600), g, { attack: 0.002, decay: 14 }); };
const boing = (bus, t0, g = 0.25) => { let ph = 0; add(bus, t0, 0.5, (t) => { ph += TAU * (180 + 90 * Math.sin(t * 38) * Math.exp(-t * 6) - 60 * t) / SR; return Math.sin(ph) * Math.exp(-t * 6) * g; }); };
const impact = (bus, t0, g = 0.8) => { kick(bus, t0, g); add(bus, t0, 0.4, (t) => rnd() * Math.exp(-t * 14) * g * 0.25); };
function typing(bus, a, b, cps, g = 0.07) { for (let t = a; t < b; t += 1 / cps) click(bus, t + (rnd() * 0.012), g * (0.7 + 0.3 * Math.abs(rnd()))); }
function riser(bus, a, b, g = 0.2) { let lp = 0; add(bus, a, b - a, (t) => { const u = t / (b - a); lp += (rnd() - lp) * (0.02 + 0.5 * u * u); return lp * u * u * g; }); add(bus, a, b - a, (t) => Math.sin(TAU * (80 + 400 * (t / (b - a)) ** 2) * t) * (t / (b - a)) ** 2 * g * 0.3); }

const N = { A2: 110, F2: 87.31, C3: 130.81, G2: 98, A3: 220, C4: 261.63, E4: 329.63, G4: 392, B4: 493.88, C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77, A4: 440, F4: 349.23, D2: 73.42, F3: 174.61, D4: 293.66 };

// ---- 1 · kinetic type → the drop → a chat close-up → kinetic type → end
if (reel === "1") {
  const [k1, drop, chat, k2] = S, beat = 0.62;
  const prog = [[N.A2, [N.A3, N.C4, N.E4]], [N.F2, [N.F3 * 2, N.A3, N.C4]], [N.C3, [N.C4, N.E4, N.G4]], [N.G2, [N.G4 / 2, N.B4 / 2, N.D4]]];
  // the opening: a hit on every word, a pulsing bass
  for (let i = 0; i < 4; i++) { impact(buf, k1 + i * beat, 0.85); clap(music, k1 + i * beat + beat / 2, 0.12); hat(music, k1 + i * beat + beat / 4); hat(music, k1 + i * beat + 3 * beat / 4); }
  bass(music, k1, drop - k1, N.A2, 0.25);
  // the drop: everything stops, she falls and lands
  whoosh(buf, drop - 0.15, 0.7, 0.45, false);
  impact(buf, drop + 0.55, 0.7); boing(buf, drop + 0.6, 0.22);
  pad(music, drop + 0.55, chat - drop, prog[0][1], 0.035);
  // the chat: a relaxed groove
  for (let t = chat, i = 0; t < k2; t += beat, i++) {
    if (i % 2 === 0) kick(music, t, 0.55); else clap(music, t, 0.1);
    hat(music, t + beat / 2, 0.08);
    if (i % 4 === 0) { const [b, ch] = prog[(i / 4) % 4]; bass(music, t, beat * 4, b, 0.2); pad(music, t, beat * 4, ch, 0.03); }
  }
  whoosh(buf, chat - 0.2, 0.5, 0.25, true);
  pop(buf, chat + 0.15); pop(buf, chat + 0.9, 0.18, 420);
  for (let t = chat + 0.95; t < chat + 1.85; t += 0.3) click(buf, t, 0.05); // she's typing…
  typing(buf, chat + 1.9, chat + 1.9 + 70 / 70, 30, 0.035);
  pop(buf, chat + 2.9, 0.2, 380);
  click(buf, chat + 4.0, 0.25); ding(buf, chat + 4.1); sparkle(buf, chat + 4.12);
  // kinetic again, harder
  for (let i = 0; i < 3; i++) { impact(buf, k2 + i * 0.66, 0.9); hat(music, k2 + i * 0.66 + 0.33); clap(music, k2 + i * 0.66 + 0.33, 0.15); }
  bass(music, k2, END - k2, N.C3, 0.25);
  // the end card
  whoosh(buf, END - 0.2, 0.5, 0.3, true);
  impact(buf, END + 0.45, 0.5); boing(buf, END + 0.5, 0.18);
  pad(music, END + 0.2, DUR - END, [N.A3, N.C4, N.E4, N.G4], 0.05); bass(music, END + 0.2, DUR - END - 0.2, N.A2, 0.18);
  ding(buf, END + 1.2, 0.1);
}

// ---- 2 · dark and glowing: a low drone, the question rising, her voice
if (reel === "2") {
  const [term, ask, answer] = S;
  pad(music, 0, DUR, [N.D2 * 2, N.A2, N.F3, N.A3], 0.045);
  bass(music, 0, DUR, N.D2, 0.14);
  for (let t = 0.4; t < DUR - 0.5; t += 1.2) { kick(music, t, 0.35); kick(music, t + 0.22, 0.2); } // a slow heartbeat
  typing(buf, 0.3, 0.3 + 22 / 26, 26, 0.09);
  whoosh(buf, ask - 0.25, 0.5, 0.25, true);
  riser(buf, ask, answer - 0.05, 0.16);
  impact(buf, answer - 0.05, 0.45);
  sparkle(buf, answer - 0.3, 0.04); tone(buf, answer - 0.35, 1.6, N.A4 * 2, 0.04, { attack: 0.3, decay: 1.5 });
  whoosh(buf, END - 0.25, 0.5, 0.25, true);
  sparkle(buf, END + 0.3, 0.05); ding(buf, END + 0.9, 0.08);
}

// ---- 3 · white orbit: a light plucked melody, the code typing, pops and ticks
if (reel === "3") {
  const [code, plat, qsA, board] = S, beat = 0.545;
  // Cmaj7 · Am7 · Fmaj7 · G, one bar each
  const arps = [[N.C5, N.E5, N.G5, N.B5], [N.A4, N.C5, N.E5, N.G5], [N.F4, N.A4, N.C5, N.E5], [N.G4, N.B4, N.D4 * 2, N.G5]];
  for (let t = 0, i = 0; t < DUR - 0.3; t += beat / 2, i++) {
    const bar = Math.floor(i / 8) % 4;
    pluck(music, t, arps[bar][i % 4], t > END ? 0.1 : 0.12);
    if (t >= plat && t < END && i % 4 === 0) kick(music, t, 0.4);
    if (t >= plat && t < END && i % 4 === 2) hat(music, t, 0.09);
    if (i % 8 === 0) pad(music, t, beat * 4, arps[bar].slice(0, 3).map((f) => f / 2), 0.03);
  }
  typing(buf, code + 0.4, code + 0.4 + 112 / 40, 40, 0.06);
  whoosh(buf, plat - 0.35, 0.5, 0.25, false);
  pop(buf, plat - 0.05, 0.25, 300);
  for (let i = 0; i < 5; i++) pop(buf, plat + 0.1 + i * 0.12, 0.14, 600 + i * 80);
  for (let i = 0; i < 3; i++) { const a = qsA + 0.3 + i * 0.9; whoosh(buf, a - 0.05, 0.4, 0.14, true); ding(buf, a + 0.6, 0.1); }
  whoosh(buf, board, 0.5, 0.2, true); pop(buf, board + 0.25, 0.18, 420);
  whoosh(buf, END - 0.2, 0.5, 0.25, true);
  impact(buf, END + 0.45, 0.45); boing(buf, END + 0.5, 0.16); ding(buf, END + 1.2, 0.09);
}

// ---- 4–6 · clips for the live-action video (its music comes from the edit, so only effects here)
const buzz = (bus, t0, g = 0.18) => { tone(bus, t0, 0.22, 140, g, { attack: 0.005, harm: [1, 0.6, 0.4, 0.3] }); tone(bus, t0 + 0.12, 0.22, 110, g, { attack: 0.005, harm: [1, 0.6, 0.4, 0.3] }); };
if (reel === "4") for (let i = 0; i < 3; i++) { typing(buf, i * 1.2 + 0.05, i * 1.2 + 0.65, 30, 0.08); buzz(buf, i * 1.2 + 0.75); }
if (reel === "5") {
  const [, chat] = S;
  whoosh(buf, 0.2, 0.5, 0.2, true); boing(buf, 1.05, 0.2); pop(buf, 1.0, 0.2, 420);
  whoosh(buf, chat - 0.2, 0.5, 0.22, true); pop(buf, chat + 0.15); pop(buf, chat + 0.9, 0.18, 420);
  for (let t = chat + 0.95; t < chat + 1.85; t += 0.3) click(buf, t, 0.05);
  typing(buf, chat + 1.9, chat + 2.9, 30, 0.035);
  pop(buf, chat + 2.9, 0.2, 380); click(buf, chat + 4.0, 0.25); ding(buf, chat + 4.1); sparkle(buf, chat + 4.12);
}
if (reel === "6") { whoosh(buf, 0, 0.4, 0.25, true); impact(buf, 0.45, 0.5); boing(buf, 0.5, 0.18); ding(buf, 1.2, 0.1); pad(music, 0.2, DUR - 0.2, [N.A3, N.C4, N.E4, N.G4], 0.05); }

// ---- the voice (reel 2): the music ducks under it
const voice = opt("voice");
if (voice) {
  const ff = (await import("ffmpeg-static")).default;
  const raw = execFileSync(ff, ["-loglevel", "error", "-i", voice, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
  const v = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const at = Math.floor(Number(opt("voice-at") || 0) * SR);
  for (let i = 0; i < v.length && at + i < buf.length; i++) buf[at + i] += v[i] * 1.15;
  const duckA = at - SR * 0.3, duckB = at + v.length + SR * 0.3;
  for (let i = 0; i < music.length; i++) {
    const k = i < duckA ? 1 : i < at ? 1 - 0.6 * (i - duckA) / (SR * 0.3) : i < at + v.length ? 0.4 : i < duckB ? 0.4 + 0.6 * (i - at - v.length) / (SR * 0.3) : 1;
    music[i] *= k;
  }
}

// ---- mix, fade out, normalise, write a 16-bit WAV
for (let i = 0; i < buf.length; i++) buf[i] += music[i];
const fadeFrom = Math.floor((DUR - 0.6) * SR);
for (let i = fadeFrom; i < buf.length; i++) buf[i] *= Math.max(0, 1 - (i - fadeFrom) / (0.6 * SR));
let peak = 0;
for (const x of buf) peak = Math.max(peak, Math.abs(x));
const gain = peak > 0 ? 0.89 / peak : 1;
const pcm = Buffer.alloc(44 + buf.length * 2);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + buf.length * 2, 4); pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28);
pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(buf.length * 2, 40);
for (let i = 0; i < buf.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * gain)) * 32767), 44 + i * 2);
fs.writeFileSync(outFile, pcm);
console.log(`reel ${reel}: ${DUR.toFixed(1)} s → ${outFile}`);
