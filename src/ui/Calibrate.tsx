import { useEffect, useState } from 'preact/hooks';
import {
  CAL_CLICKS,
  CAL_PERIOD_MS,
  type DelayResult,
  measureDelay,
} from '../engine/calibration.ts';
import { onNote } from '../midi/midi.ts';
import { clickTrain } from '../midi/output.ts';

/** What the measurement found, in plain words. */
export function delayWords(r: DelayResult): string {
  if (r.problem === 'few')
    return `Only ${r.used} of your taps landed near a click. Tap one key on every click.`;
  if (r.problem === 'uneven')
    return `Your taps were too uneven to measure (they wander by about ${Math.round(r.spread)} ms). Try once more.`;
  if (r.ms === 0) return 'Your key presses arrive right on the click. Nothing to correct.';
  return `Your key presses arrive about ${Math.abs(r.ms)} ms ${r.ms > 0 ? 'after' : 'before'} the click, the same every time.`;
}

/** Click-along calibration: plays the clicks, collects the taps, offers the measured delay. */
export function Calibrate(props: { onUse: (ms: number) => void; onClose: () => void }) {
  const [run, setRun] = useState(0);
  const [heard, setHeard] = useState(0);
  const [taps, setTaps] = useState(0);
  const [result, setResult] = useState<DelayResult | null>(null);

  // `run` is a dependency only to start the measurement again
  useEffect(() => {
    setResult(null);
    setHeard(0);
    setTaps(0);
    const t0 = performance.now() + 700;
    const clicks = Array.from({ length: CAL_CLICKS }, (_, k) => t0 + k * CAL_PERIOD_MS);
    const pressed: number[] = [];
    const offNote = onNote((e) => {
      if (!e.on) return;
      pressed.push(e.time);
      setTaps(pressed.length);
    });
    const counter = setInterval(() => {
      const now = performance.now();
      setHeard(clicks.filter((c) => c <= now).length);
    }, 100);
    const stop = clickTrain(clicks, () => {
      clearInterval(counter);
      setHeard(CAL_CLICKS);
      setResult(measureDelay(clicks, pressed));
    });
    return () => {
      stop();
      clearInterval(counter);
      offNote();
    };
  }, [run]);

  return (
    <div class="pass card calibrate" data-testid="calibrate-card">
      <div class="pass-head">
        <div>
          <b>Tap one key on every click</b>
          <span data-testid="calibrate-count">{taps} taps</span>
        </div>
      </div>
      <div class="meter" data-kind="notes">
        <span>Clicks</span>
        <i>
          <b style={{ width: `${(heard / CAL_CLICKS) * 100}%` }} />
        </i>
        <output>
          {heard} of {CAL_CLICKS}
        </output>
      </div>
      {result && (
        <ul class="tips" data-testid="calibrate-result" data-ms={result.problem ? '' : result.ms}>
          <li>{delayWords(result)}</li>
        </ul>
      )}
      <div class="pass-actions">
        <button type="button" class="btn" onClick={props.onClose} data-testid="calibrate-close">
          Close
        </button>
        {result && (
          <button
            type="button"
            class={result.problem ? 'btn primary' : 'btn'}
            onClick={() => setRun(run + 1)}
            data-testid="calibrate-again"
          >
            Again
          </button>
        )}
        {result && !result.problem && (
          <button
            type="button"
            class="btn primary"
            title="Sets ⚙ → Delay → Offset to this value, so this delay no longer counts as late or early"
            onClick={() => {
              props.onUse(result.ms);
              props.onClose();
            }}
            data-testid="calibrate-use"
          >
            Use {result.ms} ms
          </button>
        )}
      </div>
    </div>
  );
}
