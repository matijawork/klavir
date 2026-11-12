/**
 * Web MIDI wrapper: device list, remembered device, hot-plug, input parsing, raw output.
 * All input timing uses MIDIMessageEvent.timeStamp (performance.now() time base).
 */
import { signal } from '@preact/signals';

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'denied' | 'ready';
export interface PortInfo {
  id: string;
  name: string;
}
export interface NoteEvent {
  on: boolean;
  pitch: number;
  velocity: number;
  /** performance.now() time base, ms */
  time: number;
}

const STORE_IN = 'klavir.midi.in';
const STORE_OUT = 'klavir.midi.out';

export const midiStatus = signal<MidiStatus>('idle');
export const midiInputs = signal<PortInfo[]>([]);
export const midiOutputs = signal<PortInfo[]>([]);
export const inputName = signal<string | null>(null);
export const outputName = signal<string | null>(null);
/** bumps whenever the set of held keys or the pedal changes; UI subscribes to this */
export const inputVersion = signal(0);
export const sustainDown = signal(false);
/** true once any message (even active sensing) has arrived from the current input */
export const midiSeen = signal(false);
/** true once a key press or pedal move has arrived from the current input */
export const midiPlayed = signal(false);

/** velocity of each held key (0 = up), indexed by MIDI pitch; read directly by the render loop */
export const held = new Uint8Array(128);
/** timeStamp of the latest note-on per pitch */
export const heldAt = new Float64Array(128);
/** timeStamp of the most recent note-on, for input-to-glow measurement (0 = none pending) */
export let lastNoteOnAt = 0;
export const clearLastNoteOn = (): void => {
  lastNoteOnAt = 0;
};

let access: MIDIAccess | null = null;
let input: MIDIInput | null = null;
let output: MIDIOutput | null = null;
const noteListeners = new Set<(e: NoteEvent) => void>();
const outputListeners = new Set<() => void>();

export const onNote = (fn: (e: NoteEvent) => void): (() => void) => {
  noteListeners.add(fn);
  return () => noteListeners.delete(fn);
};
/** Called whenever an output is (re)connected, so sounds can be set up again. */
export const onOutputReady = (fn: () => void): (() => void) => {
  outputListeners.add(fn);
  return () => outputListeners.delete(fn);
};

const label = (p: MIDIPort): string => p.name || p.manufacturer || 'MIDI device';
const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the choice just is not remembered */
  }
};

function handleMessage(e: MIDIMessageEvent): void {
  const d = e.data;
  if (!d || d.length === 0) return;
  if (!midiSeen.peek()) midiSeen.value = true;
  const status = d[0]! & 0xf0;
  const time = e.timeStamp || performance.now();
  if (status === 0x90 || status === 0x80) {
    const pitch = d[1]!;
    const velocity = d[2] ?? 0;
    const on = status === 0x90 && velocity > 0;
    if (!midiPlayed.peek()) midiPlayed.value = true;
    held[pitch] = on ? velocity : 0;
    if (on) {
      heldAt[pitch] = time;
      lastNoteOnAt = time;
    }
    inputVersion.value++;
    for (const fn of noteListeners) fn({ on, pitch, velocity, time });
  } else if (status === 0xb0 && d[1] === 64) {
    const down = (d[2] ?? 0) >= 64;
    if (down !== sustainDown.value) {
      sustainDown.value = down;
      inputVersion.value++;
    }
  }
  // everything else (active sensing 0xFE, clock, other CCs) is ignored
}

function releaseAll(): void {
  held.fill(0);
  sustainDown.value = false;
  inputVersion.value++;
}

function refreshPorts(): void {
  if (!access) return;
  const ins = [...access.inputs.values()].filter((p) => p.state === 'connected');
  const outs = [...access.outputs.values()].filter((p) => p.state === 'connected');
  midiInputs.value = ins.map((p) => ({ id: p.id, name: label(p) }));
  midiOutputs.value = outs.map((p) => ({ id: p.id, name: label(p) }));

  const wantIn = inputName.value ?? read(STORE_IN);
  const nextIn = ins.find((p) => label(p) === wantIn) ?? ins[0] ?? null;
  if (nextIn !== input) {
    if (input) input.onmidimessage = null;
    releaseAll();
    midiSeen.value = false;
    midiPlayed.value = false;
    input = nextIn;
    if (input) input.onmidimessage = handleMessage;
  }
  inputName.value = input ? label(input) : null;

  const wantOut = outputName.value ?? read(STORE_OUT);
  const nextOut = outs.find((p) => label(p) === wantOut) ?? outs[0] ?? null;
  const changed = nextOut !== output;
  output = nextOut;
  outputName.value = output ? label(output) : null;
  if (changed && output) for (const fn of outputListeners) fn();
}

export async function connectMidi(): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    midiStatus.value = 'unsupported';
    return;
  }
  midiStatus.value = 'requesting';
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refreshPorts;
    midiStatus.value = 'ready';
    refreshPorts();
  } catch {
    midiStatus.value = 'denied';
  }
}

/** Connects without a prompt if permission was already granted. */
export async function autoConnectMidi(): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    midiStatus.value = 'unsupported';
    return;
  }
  try {
    const perm = await navigator.permissions.query({ name: 'midi' as PermissionName });
    if (perm.state === 'granted') await connectMidi();
  } catch {
    /* permission query unsupported: wait for the user to press Connect */
  }
}

export function selectInput(name: string): void {
  inputName.value = name;
  write(STORE_IN, name);
  refreshPorts();
}

export function selectOutput(name: string): void {
  outputName.value = name;
  write(STORE_OUT, name);
  refreshPorts();
}

export const hasOutput = (): boolean => output !== null;

/** Sends raw bytes; `time` is a performance.now() timestamp, omitted = now. */
export function send(bytes: number[], time?: number): void {
  if (!output) return;
  try {
    output.send(bytes, time);
  } catch {
    /* port went away mid-send; statechange will clean up */
  }
}
