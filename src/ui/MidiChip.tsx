import {
  connectMidi,
  inputName,
  midiInputs,
  midiOutputs,
  midiPlayed,
  midiSeen,
  midiStatus,
  outputName,
  selectInput,
  selectOutput,
} from '../midi/midi.ts';
import { testSound } from '../midi/output.ts';

const HELP: Record<string, string> = {
  unsupported: 'This browser has no Web MIDI. Use Chrome on a computer or Android.',
  denied:
    'MIDI permission was blocked. Allow it from the lock icon in the address bar, then reload.',
  idle: 'Connect to use your piano.',
  requesting: 'Waiting for permission…',
};

/** Connection status with device pickers. */
export function MidiChip() {
  const status = midiStatus.value;
  const connected = status === 'ready' && inputName.value !== null;
  const silent = connected && !midiPlayed.value;
  if (status !== 'ready') {
    return (
      <button
        type="button"
        class="chip"
        data-state={status === 'denied' || status === 'unsupported' ? 'error' : 'off'}
        title={HELP[status]}
        disabled={status === 'unsupported' || status === 'requesting'}
        onClick={() => void connectMidi()}
        data-testid="midi-connect"
      >
        <span class="dot" />
        {status === 'unsupported'
          ? 'No MIDI support'
          : status === 'denied'
            ? 'MIDI blocked'
            : 'Connect piano'}
      </button>
    );
  }
  return (
    <div
      class="chip"
      data-state={!connected ? 'off' : silent ? 'warn' : 'on'}
      title={
        silent
          ? midiSeen.value
            ? 'The piano is talking to the interface. Press a key to finish the check.'
            : 'Nothing has arrived from the piano yet. Press a key. If this stays: is the piano on, and is the plug marked IN in the socket marked MIDI OUT on the piano? Try swapping the two plugs.'
          : connected
            ? 'Piano connected, keys received'
            : 'No MIDI device found. Plug in the interface; it is detected automatically.'
      }
      data-testid="midi-status"
    >
      <span class="dot" />
      {midiInputs.value.length === 0 ? (
        'No device'
      ) : (
        <select
          aria-label="MIDI input"
          value={inputName.value ?? ''}
          onChange={(e) => selectInput((e.target as HTMLSelectElement).value)}
        >
          {midiInputs.value.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {silent && (
        <span class="chip-warn" data-testid="midi-silent">
          no signal
        </span>
      )}
      {midiOutputs.value.length > 0 && (
        <button
          type="button"
          class="chip-btn"
          title="Play three notes on the piano to check the cable to it"
          onClick={testSound}
          data-testid="midi-test"
        >
          Test
        </button>
      )}
      {midiOutputs.value.length > 1 && (
        <select
          aria-label="MIDI output"
          title="Output used for playback and clicks"
          value={outputName.value ?? ''}
          onChange={(e) => selectOutput((e.target as HTMLSelectElement).value)}
        >
          {midiOutputs.value.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
