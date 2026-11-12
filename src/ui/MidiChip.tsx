import {
  connectMidi,
  inputName,
  midiInputs,
  midiOutputs,
  midiStatus,
  outputName,
  selectInput,
  selectOutput,
} from '../midi/midi.ts';

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
      data-state={connected ? 'on' : 'off'}
      title={
        connected
          ? 'Piano connected'
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
