/**
 * Small built-in synthesizer so the app can make sound through the computer: metronome clicks,
 * song playback and (optionally) the player's own keys. Synthesized, not sampled, so it sounds like
 * a simple electric piano. Times are performance.now() milliseconds, like the MIDI output.
 */

interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

/** voice groups, so one group can be silenced without touching the other */
export const VOICE_PLAYER = 0;
export const VOICE_SONG = 1;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const voices = new Map<number, Voice>();
/** player notes released while the sustain pedal is down */
const sustained = new Set<number>();
let pedal = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

/** Browsers start audio only after a click or key press; call from those handlers. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state !== 'running') void c.resume();
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
  for (const o of v.oscs) o.stop(when + 0.6);
}

export function synthOn(group: number, pitch: number, velocity: number, time?: number): void {
  const c = context();
  if (!c || !master || c.state !== 'running') return;
  const key = group * 128 + pitch;
  const when = at(c, time);
  release(key, when);
  sustained.delete(key);

  const freq = 440 * 2 ** ((pitch - 69) / 12);
  const level = 0.05 + 0.3 * (velocity / 127) ** 1.6;
  // low strings ring longer than high ones
  const decay = 0.35 + 2.2 * (1 - (pitch - 21) / 87) ** 1.5;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.004);
  gain.gain.setTargetAtTime(level * 0.02, when + 0.004, decay);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.4;
  filter.frequency.setValueAtTime(Math.min(16000, freq * (4 + 6 * (velocity / 127))), when);
  filter.frequency.setTargetAtTime(Math.min(16000, freq * 2), when, 0.25);
  filter.connect(gain).connect(master);

  const oscs: OscillatorNode[] = [];
  const add = (type: OscillatorType, mult: number, detune: number, amount: number): void => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.value = amount;
    o.connect(g).connect(filter);
    o.start(when);
    oscs.push(o);
  };
  add('triangle', 1, -3, 0.6);
  add('triangle', 1, 4, 0.4);
  add('sine', 2, 0, 0.28);
  add('sine', 3, 0, 0.1);
  voices.set(key, { gain, oscs });
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
export function synthClick(accent: boolean, time?: number): void {
  const c = context();
  if (!c || !master || c.state !== 'running') return;
  const when = at(c, time);
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  const g = c.createGain();
  g.gain.setValueAtTime(accent ? 0.32 : 0.2, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
  o.connect(g).connect(master);
  o.start(when);
  o.stop(when + 0.06);
}
