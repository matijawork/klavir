/**
 * Built-in sound so the app can play through the computer: metronome clicks, song playback and
 * (optionally) the player's own keys. Uses sampled grand-piano notes (public/samples/piano, one
 * every minor third, pitch-shifted in between); until they are loaded a simple synthesized tone
 * stands in. Times are performance.now() milliseconds, like the MIDI output.
 */

interface Voice {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

const SAMPLE_NAMES = ['A', 'C', 'Ds', 'Fs'];
const SAMPLE_LOW = 21;
const SAMPLE_STEP = 3;
const SAMPLE_COUNT = 30;
const buffers: (AudioBuffer | null)[] = new Array(SAMPLE_COUNT).fill(null);
/** seconds of silence at the start of each decoded sample, skipped on playback */
const lead = new Float32Array(SAMPLE_COUNT);
let loading = false;
let volume = 1;

/** File name of sample k: A0, C1, Ds1, Fs1, A1, ... C8. */
export function sampleName(k: number): string {
  const pitch = SAMPLE_LOW + k * SAMPLE_STEP;
  return `${SAMPLE_NAMES[k % 4]}${Math.floor(pitch / 12) - 1}`;
}

function loadSamples(c: AudioContext): void {
  if (loading) return;
  loading = true;
  for (let k = 0; k < SAMPLE_COUNT; k++) {
    fetch(`${import.meta.env.BASE_URL}samples/piano/${sampleName(k)}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => c.decodeAudioData(data))
      .then((buf) => {
        // MP3 decoding leaves a little silence in front; find where the note really starts
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]!) < 0.003) i++;
        lead[k] = Math.max(0, i / buf.sampleRate - 0.002);
        buffers[k] = buf;
      })
      .catch(() => {
        /* sample unavailable: the synthesized tone keeps standing in for it */
      });
  }
}

/** Overall loudness, 0..2 (1 = default). */
export function setVolume(v: number): void {
  volume = v;
  if (master && ctx) master.gain.setTargetAtTime(v * DRIVE, ctx.currentTime, 0.02);
}

/** voice groups, so one group can be silenced without touching the other */
export const VOICE_PLAYER = 0;
export const VOICE_SONG = 1;

/** Drive into the limiter: the samples peak near 0.4, so this lifts them to a healthy level. */
const DRIVE = 1.5;
/** share of the piano sent through the room reverb */
const ROOM = 0.14;

let ctx: AudioContext | null = null;
/** everything: volume, then the limiter */
let master: GainNode | null = null;
/** piano voices: dry to the master plus a little room */
let piano: GainNode | null = null;
/** last node before the speakers, for measuring */
let output: AudioNode | null = null;
let meter: AnalyserNode | null = null;

/** Peak and RMS of the last ~45 ms of what goes to the speakers (tests and diagnostics). */
export function outputLevel(): { peak: number; rms: number; loaded: number } {
  const loaded = buffers.filter(Boolean).length;
  if (!ctx || !output) return { peak: 0, rms: 0, loaded };
  if (!meter) {
    meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    output.connect(meter);
  }
  const data = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(data);
  let peak = 0;
  let sum = 0;
  for (const v of data) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / data.length), loaded };
}

/** Impulse response of a small room: decaying noise that gets duller as it fades. */
function roomImpulse(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.4);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const t = i / c.sampleRate;
      const k = 0.25 + 0.6 * Math.min(1, t / 0.5);
      low += (1 - k) * (Math.random() * 2 - 1 - low);
      d[i] = low * Math.exp(-t / 0.28) * Math.min(1, t / 0.004);
    }
  }
  return buf;
}
const voices = new Map<number, Voice>();
/** player notes released while the sustain pedal is down */
const sustained = new Set<number>();
let pedal = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: 'interactive' });
  // Measured (controls.spec.ts, volume 1.2): one mf note peaks at 0.57, an 8-key chord at 0.95 with
  // only 1.2x the RMS, so chords are still held back ~7 dB. A higher threshold clips (peaks > 1);
  // less drive makes single notes quieter. This is the loudest setting that does not clip.
  // a limiter, not a compressor: single notes pass untouched, only big chords are held back,
  // and it lets go quickly so the ringing notes do not pump
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  master = ctx.createGain();
  master.gain.value = volume * DRIVE;
  master.connect(limiter).connect(ctx.destination);
  output = limiter;
  piano = ctx.createGain();
  piano.connect(master);
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = ROOM;
  piano.connect(room).connect(wet).connect(master);
  return ctx;
}

/** Browsers start audio only after a click or key press; call from those handlers. */
export function unlockAudio(): void {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') void c.resume();
  loadSamples(c);
}

/** performance.now() time → audio clock, moved earlier by the output latency so sound lands on time. */
function at(c: AudioContext, time?: number): number {
  if (time === undefined) return c.currentTime;
  const ahead = (time - performance.now()) / 1000 - (c.outputLatency || 0);
  return c.currentTime + Math.max(0, ahead);
}

function release(key: number, when: number): void {
  const v = voices.get(key);
  if (!v) return;
  voices.delete(key);
  v.gain.gain.cancelScheduledValues(when);
  v.gain.gain.setTargetAtTime(0, when, 0.07);
  for (const o of v.sources) o.stop(when + 0.8);
}

export function synthOn(group: number, pitch: number, velocity: number, time?: number): void {
  const c = context();
  if (!c || !piano || c.state !== 'running') return;
  const key = group * 128 + pitch;
  const when = at(c, time);
  release(key, when);
  sustained.delete(key);

  const k = Math.min(SAMPLE_COUNT - 1, Math.max(0, Math.round((pitch - SAMPLE_LOW) / SAMPLE_STEP)));
  const buf = buffers[k];
  const vel = velocity / 127;
  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 2 ** ((pitch - (SAMPLE_LOW + k * SAMPLE_STEP)) / 12);
    // soft notes are duller as well as quieter
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200 + 17000 * vel ** 2;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.25 + 1.75 * vel ** 1.7, when);
    src.connect(filter).connect(gain).connect(piano);
    src.start(when, lead[k]);
    voices.set(key, { gain, sources: [src] });
    return;
  }

  // stand-in tone while the samples load
  const freq = 440 * 2 ** ((pitch - 69) / 12);
  const level = 0.1 + 0.5 * vel ** 1.6;
  const decay = 0.35 + 2.2 * (1 - (pitch - 21) / 87) ** 1.5;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.004);
  gain.gain.setTargetAtTime(level * 0.02, when + 0.004, decay);
  gain.connect(piano);
  const sources: OscillatorNode[] = [];
  for (const [mult, amount] of [
    [1, 0.7],
    [2, 0.25],
  ] as const) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.value = amount;
    o.connect(g).connect(gain);
    o.start(when);
    sources.push(o);
  }
  voices.set(key, { gain, sources });
}

export function synthOff(group: number, pitch: number, time?: number): void {
  const c = ctx;
  if (!c) return;
  const key = group * 128 + pitch;
  if (group === VOICE_PLAYER && pedal) {
    sustained.add(key);
    return;
  }
  release(key, at(c, time));
}

/** Sustain pedal for the player's own notes. */
export function synthPedal(down: boolean): void {
  pedal = down;
  if (down || !ctx) return;
  for (const key of sustained) release(key, ctx.currentTime);
  sustained.clear();
}

export function synthAllOff(group: number): void {
  if (!ctx) return;
  for (const key of [...voices.keys()])
    if (Math.floor(key / 128) === group) release(key, ctx.currentTime);
  if (group === VOICE_PLAYER) sustained.clear();
}

/** Metronome tick: a short, dry blip; higher on the first beat. */
export function synthClick(accent: boolean, time?: number, level = 1): void {
  const c = context();
  if (!c || !master || c.state !== 'running') return;
  const when = at(c, time);
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  const g = c.createGain();
  // the click keeps its own level whatever the piano drive is
  g.gain.setValueAtTime(((accent ? 0.6 : 0.4) * level) / DRIVE, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
  o.connect(g).connect(master);
  o.start(when);
  o.stop(when + 0.06);
}
