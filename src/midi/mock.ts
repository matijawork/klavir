/**
 * Virtual MIDI device for tests and debugging. Enabled with ?mockmidi in the URL.
 * Replaces navigator.requestMIDIAccess with one fake input and one fake output and exposes
 * window.__midi to press keys and inspect what the app sent.
 */
export interface MockMidi {
  noteOn(pitch: number, velocity?: number, time?: number): void;
  noteOff(pitch: number, time?: number): void;
  pedal(down: boolean, time?: number): void;
  /** every message the app sent to the output */
  sent: { data: number[]; time: number }[];
}

declare global {
  interface Window {
    __midi?: MockMidi;
  }
}

export function installMockMidi(): void {
  let handler: ((e: MIDIMessageEvent) => void) | null = null;
  const sent: MockMidi['sent'] = [];
  const emit = (data: number[], time = performance.now()) => {
    handler?.({ data: Uint8Array.from(data), timeStamp: time } as unknown as MIDIMessageEvent);
  };
  const port = (type: 'input' | 'output') => ({
    id: `mock-${type}`,
    name: 'Virtual Piano',
    manufacturer: 'Klavir',
    state: 'connected',
    connection: 'open',
    type,
  });
  const input = {
    ...port('input'),
    get onmidimessage() {
      return handler;
    },
    set onmidimessage(fn: ((e: MIDIMessageEvent) => void) | null) {
      handler = fn;
    },
  };
  const output = {
    ...port('output'),
    send(data: number[], time?: number) {
      sent.push({ data: [...data], time: time ?? performance.now() });
    },
  };
  const access = {
    inputs: new Map([[input.id, input]]),
    outputs: new Map([[output.id, output]]),
    onstatechange: null,
    sysexEnabled: false,
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: () => Promise.resolve(access),
  });
  window.__midi = {
    noteOn: (pitch, velocity = 80, time) => emit([0x90, pitch, velocity], time),
    noteOff: (pitch, time) => emit([0x80, pitch, 64], time),
    pedal: (down, time) => emit([0xb0, 64, down ? 127 : 0], time),
    sent,
  };
}
