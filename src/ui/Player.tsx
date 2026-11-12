import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { tonicOf } from '../engine/exercises.ts';
import { calibrationHint, feedback } from '../engine/feedback.ts';
import { noteName } from '../engine/keys.ts';
import { type PassResult, PracticeSession } from '../engine/session.ts';
import { type LoadedSong, loadSong, type SongFile } from '../engine/song.ts';
import { Transport } from '../engine/transport.ts';
import { held, inputVersion, onNote, outputName, sustainDown } from '../midi/midi.ts';
import { panic, SongPlayback, setClickLevel, setSoundTarget } from '../midi/output.ts';
import { PlayerCanvas, type RenderStats } from '../render/player-canvas.ts';
import { addPass, bestOf, passesOf } from '../store/history.ts';
import { clampSpeed, type Settings, setSetting, settings } from '../store/settings.ts';
import { MidiChip } from './MidiChip.tsx';
import { Timeline } from './Timeline.tsx';

const base = import.meta.env.BASE_URL;

declare global {
  interface Window {
    __klavir?: { stats: RenderStats; transport: Transport; session: PracticeSession };
  }
}

interface Engine {
  transport: Transport;
  session: PracticeSession;
  playback: SongPlayback;
  view: PlayerCanvas;
}

function heldNames(): string {
  const names: string[] = [];
  for (let p = 21; p <= 108; p++) if (held[p]! > 0) names.push(noteName(p));
  return names.join('  ');
}

function Seg<T extends string>(props: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset class="seg" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={props.value === o.value}
          title={o.title}
          onClick={() => props.onChange(o.value)}
          data-testid={`${props.label}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

function Toggle(props: {
  on: boolean;
  label: string;
  title: string;
  onChange: (v: boolean) => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      class="btn toggle"
      aria-pressed={props.on}
      title={props.title}
      onClick={() => props.onChange(!props.on)}
      data-testid={props.testid}
    >
      {props.label}
    </button>
  );
}

function Check(props: { k: keyof Settings; label: string; title?: string; disabled?: boolean }) {
  return (
    <label class="row" title={props.title} data-disabled={props.disabled}>
      <input
        type="checkbox"
        disabled={props.disabled}
        checked={settings.value[props.k] as boolean}
        onChange={(e) => setSetting(props.k, (e.target as HTMLInputElement).checked as never)}
      />
      {props.label}
    </label>
  );
}

function Pct(props: {
  k: 'autoSpeedStart' | 'autoSpeedStep' | 'autoSpeedTarget' | 'autoSpeedThreshold';
  label: string;
  min: number;
  max: number;
  title?: string;
}) {
  return (
    <label class="row" title={props.title}>
      {props.label}
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={5}
        value={Math.round(settings.value[props.k] * 100)}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v))
            setSetting(props.k, Math.min(props.max, Math.max(props.min, v)) / 100);
        }}
      />
      %
    </label>
  );
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function Meter(props: { label: string; value: number; text: string; title: string; kind: string }) {
  return (
    <div class="meter" title={props.title} data-kind={props.kind}>
      <span>{props.label}</span>
      <i>
        <b style={{ width: pct(Math.min(1, Math.max(0, props.value))) }} />
      </i>
      <output>{props.text}</output>
    </div>
  );
}

interface PassInfo {
  r: PassResult;
  /** best earlier score (0..100) of comparable passes, or null */
  prevBest: number | null;
  /** scores of the latest passes, oldest first, this one included */
  recent: number[];
}

/** Result of a finished pass in plain words: score, what it is made of, what to work on. */
function PassCard(props: {
  info: PassInfo;
  measureLabel: (i: number) => string;
  onAgain: () => void;
  onPractise: (w: { a: number; b: number }) => void;
  onCalibrate: (ms: number) => void;
}) {
  const { r, prevBest, recent } = props.info;
  const s = settings.value;
  const fb = feedback(r, { mode: s.mode, speed: s.speed, metronome: s.metronome });
  const score = Math.round(r.accuracy * 100);
  const onBeat = r.hits - r.early - r.late;
  const heldRight = r.hits - r.short - r.long;
  const hint = calibrationHint(r);
  const w = r.weak;
  const spot = w
    ? w.a === w.b
      ? `measure ${props.measureLabel(w.a)}`
      : `measures ${props.measureLabel(w.a)}–${props.measureLabel(w.b)}`
    : '';
  return (
    <div class="pass card" data-testid="pass" data-score={score}>
      <div class="pass-head">
        <strong
          data-testid="pass-score"
          data-level={r.accuracy >= 0.9 ? 'high' : r.accuracy >= 0.6 ? 'mid' : 'low'}
          title="Right notes 40 %, on the beat 35 %, held right 25 %; every wrong key lowers it"
        >
          {pct(r.accuracy)}
        </strong>
        <div>
          <b data-testid="verdict">{fb.verdict}</b>
          <span title={recent.length > 1 ? `Latest passes: ${recent.join(' · ')}` : undefined}>
            {prevBest === null
              ? 'First pass'
              : score > prevBest
                ? `New best · was ${prevBest}%`
                : `Best ${prevBest}%`}
          </span>
        </div>
      </div>
      <Meter
        kind="notes"
        label="Right notes"
        value={r.notes}
        text={`${r.hits} of ${r.expected}`}
        title="Notes you played out of all the notes in this pass"
      />
      {r.timing !== null && (
        <Meter
          kind="timing"
          label="On the beat"
          value={r.hits > 0 ? onBeat / r.hits : 0}
          text={`${onBeat} of ${r.hits}`}
          title={`Notes pressed at the right moment. ${r.early} came too early, ${r.late} too late.`}
        />
      )}
      {r.hold !== null && (
        <Meter
          kind="hold"
          label="Held right"
          value={r.hits > 0 ? heldRight / r.hits : 0}
          text={`${heldRight} of ${r.hits}`}
          title={`Notes held for their full length. ${r.short} let go too soon, ${r.long} held too long.`}
        />
      )}
      <div
        class="meter"
        data-kind="wrong"
        data-bad={r.wrong > 0}
        title="Keys that are not in the song"
      >
        <span>Wrong keys</span>
        <i />
        <output>{r.wrong}</output>
      </div>
      <ul class="tips" data-testid="tips">
        {fb.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
        {hint !== null && (
          <li>
            Almost every note is about {Math.abs(hint)} ms {hint > 0 ? 'late' : 'early'}, very
            evenly: that is probably delay in the equipment, not you.{' '}
            <button type="button" class="link" onClick={() => props.onCalibrate(hint)}>
              Compensate
            </button>
          </li>
        )}
      </ul>
      <div class="pass-actions">
        {w && (
          <button
            type="button"
            class="btn"
            onClick={() => props.onPractise(w)}
            title="Loop the place with the most mistakes"
            data-testid="practise-weak"
          >
            Practise {spot}
          </button>
        )}
        <button type="button" class="btn primary" onClick={props.onAgain} title="R">
          Again
        </button>
      </div>
    </div>
  );
}

export function Player({
  songId,
  version,
  file,
}: {
  songId: string;
  version: string;
  /** a ready-made song (exercise) instead of one fetched from the library */
  file?: SongFile;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [song, setSong] = useState<LoadedSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineSig = useSignal<Engine | null>(null);
  const engine = engineSig.value;
  const playing = useSignal(false);
  const listen = useSignal(false);
  const loop = useSignal(false);
  const range = useSignal<{ a: number; b: number } | null>(null);
  const lastPass = useSignal<PassInfo | null>(null);
  /** running result of the pass being played; null before anything is judged */
  const live = useSignal<PassResult | null>(null);
  const lastConfig = useRef('');
  const lastClicks = useRef('');
  const debug = useSignal(new URLSearchParams(location.search).has('debug'));
  const statsText = useSignal('');
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (file) {
      setSong(loadSong(file));
      return;
    }
    let cancelled = false;
    fetch(`${base}songs/${songId}/${version}.json`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<SongFile>)
          : Promise.reject(new Error(`Song not found (${r.status})`)),
      )
      .then((file) => {
        if (!cancelled) setSong(loadSong(file));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [songId, version, file]);

  // engine lifetime
  useEffect(() => {
    if (!song || !canvasRef.current) return;
    const transport = new Transport();
    transport.duration = song.duration;
    const session = new PracticeSession(song, transport);
    const playback = new SongPlayback(song, transport);
    const view = new PlayerCanvas(canvasRef.current, session);
    session.onSeek = () => playback.resync();
    const historyKey = `${song.file.id}/${song.file.version}`;
    session.onPass = (r) => {
      const s = settings.peek();
      if (!listen.peek()) {
        const whole = session.config.range === null;
        const prevBest = bestOf(historyKey, whole);
        addPass(historyKey, {
          at: Date.now(),
          score: Math.round(r.accuracy * 100),
          mode: s.mode,
          hands: s.hands,
          speed: s.speed,
          strict: s.strictness,
          whole,
        });
        const recent = passesOf(historyKey)
          .filter((p) => p.whole === whole)
          .slice(-6)
          .map((p) => p.score);
        lastPass.value = { r, prevBest, recent };
      }
      live.value = null;
      if (
        s.autoSpeed &&
        session.config.loop &&
        r.accuracy >= s.autoSpeedThreshold &&
        s.speed < s.autoSpeedTarget
      )
        setSetting('speed', clampSpeed(Math.min(s.autoSpeedTarget, s.speed + s.autoSpeedStep)));
    };
    session.onEnd = () => {
      playback.stop();
      playing.value = false;
    };
    const offNote = onNote((e) => {
      if (!e.on) {
        session.noteOff(e.pitch, e.time);
        return;
      }
      session.noteOn(e.pitch, e.time);
      playback.flush();
    });
    window.__klavir = { stats: view.stats, transport, session };
    lastConfig.current = '';
    lastClicks.current = '';
    engineSig.value = { transport, session, playback, view };

    const onHide = () => {
      if (document.hidden && session.running) {
        session.pause();
        playback.stop();
        playing.value = false;
      }
    };
    let seen = -1;
    const liveTimer = setInterval(() => {
      if (session.revision === seen) return;
      seen = session.revision;
      const r = session.result(false);
      live.value = r.judged + r.wrong > 0 ? r : null;
    }, 120);
    const timer = setInterval(() => {
      if (!debug.value) return;
      const s = view.stats;
      statsText.value = `${s.hz.toFixed(0)} Hz · frame ${s.avgFrameMs.toFixed(1)} ms (p99 ${s.p99FrameMs.toFixed(1)}) · draw ${s.avgDrawMs.toFixed(2)} ms · key→frame ${s.inputToFrameMs.toFixed(1)} ms`;
    }, 250);
    // menus close when you click anywhere else
    const closeMenus = (e: PointerEvent) => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>('details.menu[open]'))
        if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', panic);
    return () => {
      clearInterval(timer);
      clearInterval(liveTimer);
      offNote();
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', panic);
      playback.stop();
      panic();
      view.destroy();
      engineSig.value = null;
    };
  }, [song]);

  // settings → engine
  useSignalEffect(() => {
    const engine = engineSig.value;
    if (!engine) return;
    const s = settings.value;
    const demo = listen.value;
    const handMask = s.hands === 'both' ? 3 : s.hands === 'L' ? 1 : 2;
    const { session, playback, view, transport } = engine;
    setSoundTarget(s.soundOut);
    setClickLevel(s.clickVolume);
    transport.setRate(s.speed);
    session.strictness = s.strictness;
    session.offsetMs = s.timingOffset;
    const loopOn = loop.value;

    // only what changes the notes to play restarts the pass; volume, zoom or speed do not
    const r = range.value;
    const configKey = `${session.song.file.id}|${demo}|${s.mode}|${handMask}|${r?.a}-${r?.b}|${s.countIn}`;
    const reconfigure = configKey !== lastConfig.current;
    lastConfig.current = configKey;
    const wasRunning = session.running;
    if (reconfigure) {
      if (wasRunning) session.pause();
      playback.stop();
      session.configure({
        mode: demo ? 'tempo' : s.mode,
        handMask: demo ? 0 : handMask,
        range: r,
        loop: loopOn,
        countIn: s.countIn,
      });
      lastPass.value = null;
      live.value = null;
    } else if (session.config.loop !== loopOn) session.config = { ...session.config, loop: loopOn };

    playback.handMask = demo ? 3 : s.otherHand === 'play' ? 3 & ~handMask : 0;
    playback.getLimit = demo || s.mode !== 'wait' ? null : () => session.gateTime;
    const clickKey = `${configKey}|${s.countInClick}|${s.metronome}|${s.metronomeClick}`;
    if (clickKey !== lastClicks.current) {
      lastClicks.current = clickKey;
      const times: number[] = [];
      const accents: number[] = [];
      if (s.countIn && s.countInClick)
        session.countInTimes.forEach((t, k) => {
          times.push(t);
          accents.push(k === 0 ? 1 : 0);
        });
      if (s.metronome && s.metronomeClick) {
        const b = session.beats;
        for (let i = 0; i < b.time.length; i++) {
          if (b.time[i]! < session.rangeStart - 1e-6 || b.time[i]! >= session.rangeEnd - 1e-6)
            continue;
          times.push(b.time[i]!);
          accents.push(b.accent[i]!);
        }
      }
      playback.setClicks(times, accents);
    }
    playback.freeClicks = !demo && s.mode === 'wait' && s.metronome && s.metronomeClick;

    view.demo = demo;
    view.otherHand = s.otherHand;
    view.noteNames = s.noteNames;
    view.octaveNumbers = s.octaveNumbers;
    view.showFingers = s.fingers;
    view.pxPerSec = s.zoom;
    view.beatPulse = s.metronome;
    if (reconfigure && wasRunning) {
      session.play();
      playback.start();
    }
  });

  useSignalEffect(() => {
    const engine = engineSig.value;
    if (!engine) return;
    engine.view.pedalDown = sustainDown.value;
    engine.session.pedalDown = sustainDown.value;
  });

  const setPlaying = (on: boolean) => {
    if (!engine) return;
    if (on) {
      if (!engine.session.config.loop) lastPass.value = null;
      engine.session.play();
      engine.playback.start();
      navigator.wakeLock
        ?.request('screen')
        .then((l) => {
          wakeLock.current = l;
        })
        .catch(() => {
          /* refused (e.g. low battery): practice still works */
        });
    } else {
      engine.session.pause();
      engine.playback.stop();
      void wakeLock.current?.release();
      wakeLock.current = null;
    }
    playing.value = on;
  };
  const toggle = () => setPlaying(!engine?.session.running);
  const restart = () => {
    if (!engine) return;
    engine.session.rewind();
    lastPass.value = null;
    live.value = null;
  };
  const again = () => {
    restart();
    setPlaying(true);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  const bumpSpeed = (d: number) => setSetting('speed', clampSpeed(settings.peek().speed + d));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = settings.peek();
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggle();
          break;
        case 'KeyR':
          restart();
          break;
        case 'KeyL':
          loop.value = !loop.value;
          break;
        case 'KeyM':
          setSetting('metronome', !s.metronome);
          break;
        case 'KeyC':
          setSetting('countIn', !s.countIn);
          break;
        case 'KeyW':
          setSetting('mode', s.mode === 'wait' ? 'tempo' : 'wait');
          break;
        case 'Digit1':
          setSetting('hands', 'L');
          break;
        case 'Digit2':
          setSetting('hands', 'both');
          break;
        case 'Digit3':
          setSetting('hands', 'R');
          break;
        case 'ArrowUp':
        case 'Equal':
          e.preventDefault();
          bumpSpeed(0.05);
          break;
        case 'ArrowDown':
        case 'Minus':
          e.preventDefault();
          bumpSpeed(-0.05);
          break;
        case 'KeyF':
          fullscreen();
          break;
        case 'KeyD':
          debug.value = !debug.value;
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  inputVersion.value; // re-render the live input readout when keys change
  const s = settings.value;
  const pass = lastPass.value;
  const now = live.value;
  const noOut = outputName.value === null;

  return (
    <div class="page player">
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Back to library" title="Library">
          ←
        </a>
        <div class="song-title">
          <strong>{song?.file.title ?? '…'}</strong>
          <span>{song?.file.composer}</span>
        </div>
        {song && !file && (
          <a
            class="btn"
            href={`#/exercise/${song.file.keys[0]?.mode === 'minor' ? 'scale-minor' : 'scale-major'}/${tonicOf(song.file.keys[0]?.fifths ?? 0, song.file.keys[0]?.mode === 'minor')}`}
            title="Warm up with the scale of this song's key"
            data-testid="warmup"
          >
            Warm-up
          </a>
        )}
        <button type="button" class="btn primary" onClick={toggle} title="Space" data-testid="play">
          {playing.value ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          class="icon-btn"
          onClick={restart}
          title="Restart section · R"
          aria-label="Restart"
        >
          ↺
        </button>
        <Toggle
          on={listen.value}
          label="Listen"
          title={s.soundOut === 'piano' && noOut ? 'Needs a MIDI output' : 'Hear how the song goes'}
          onChange={(v) => {
            listen.value = v;
          }}
          testid="listen"
        />
        <MidiChip />
        <button
          type="button"
          class="icon-btn"
          onClick={fullscreen}
          title="Fullscreen · F"
          aria-label="Fullscreen"
        >
          ⛶
        </button>
      </header>

      <div class="toolbar">
        <Seg
          label="mode"
          value={s.mode}
          onChange={(v) => setSetting('mode', v)}
          options={[
            { value: 'wait', label: 'Wait', title: 'The song waits for the right keys · W' },
            { value: 'tempo', label: 'Tempo', title: 'The song keeps going, rhythm is scored · W' },
          ]}
        />
        <Seg
          label="hands"
          value={s.hands}
          onChange={(v) => setSetting('hands', v)}
          options={[
            { value: 'L', label: 'Left', title: '1' },
            { value: 'both', label: 'Both', title: '2' },
            { value: 'R', label: 'Right', title: '3' },
          ]}
        />
        <Seg
          label="strict"
          value={s.strictness}
          onChange={(v) => setSetting('strictness', v)}
          options={[
            {
              value: 'easy',
              label: 'Easy',
              title: 'Forgiving: wide timing, notes may be let go early',
            },
            { value: 'normal', label: 'Normal', title: 'Balanced timing and hold' },
            {
              value: 'strict',
              label: 'Strict',
              title: 'Exact: tight timing, notes must be held to the end',
            },
          ]}
        />
        <span class="sep" />
        <label class="speed" title="Speed · ↑ ↓">
          <input
            type="range"
            min={10}
            max={150}
            step={1}
            value={Math.round(s.speed * 100)}
            onInput={(e) =>
              setSetting('speed', clampSpeed(Number((e.target as HTMLInputElement).value) / 100))
            }
            aria-label="Speed"
            data-testid="speed"
          />
          <output>{Math.round(s.speed * 100)}%</output>
        </label>
        <details class="menu">
          <summary
            class="btn toggle"
            data-on={s.autoSpeed}
            title="Raise the speed by itself after every clean pass of a loop"
            data-testid="speedup"
          >
            Speed-up
          </summary>
          <div class="panel">
            <label class="row">
              <input
                type="checkbox"
                checked={s.autoSpeed}
                onChange={(e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  settings.value = {
                    ...settings.value,
                    autoSpeed: on,
                    speed: on ? s.autoSpeedStart : s.speed,
                  };
                  if (on) loop.value = true;
                }}
                data-testid="autospeed"
              />
              On (loops the section)
            </label>
            <Pct k="autoSpeedStart" label="Start at" min={10} max={150} />
            <Pct k="autoSpeedStep" label="Go up by" min={1} max={50} />
            <Pct k="autoSpeedTarget" label="Until" min={10} max={150} />
            <Pct
              k="autoSpeedThreshold"
              label="Needs a score of"
              min={50}
              max={100}
              title="Score a pass needs before the speed goes up"
            />
          </div>
        </details>
        <span class="sep" />
        <Toggle
          on={loop.value}
          label="Loop"
          title="Repeat the section · L (drag on the ruler to choose one)"
          onChange={(v) => {
            loop.value = v;
          }}
          testid="loop"
        />
        <Toggle
          on={s.countIn}
          label="Count-in"
          title="One bar before the start · C"
          onChange={(v) => setSetting('countIn', v)}
          testid="countin"
        />
        <Toggle
          on={s.metronome}
          label="Metronome"
          title="M"
          onChange={(v) => setSetting('metronome', v)}
          testid="metronome"
        />
        <details class="menu right">
          <summary class="btn" title="Display and sound">
            ⚙
          </summary>
          <div class="panel wide">
            <section>
              <h4>Note names</h4>
              <Seg
                label="names"
                value={s.noteNames}
                onChange={(v) => setSetting('noteNames', v)}
                options={[
                  { value: 'off', label: 'None', title: 'Only the C keys are labelled' },
                  { value: 'upcoming', label: 'Next', title: 'Name the keys coming up' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <Check
                k="octaveNumbers"
                label="Octave numbers"
                title="C4 instead of C"
                disabled={s.noteNames === 'off'}
              />
              <Check k="fingers" label="Finger numbers" />
              <h4>Other hand</h4>
              <Seg
                label="other"
                value={s.otherHand}
                onChange={(v) => setSetting('otherHand', v)}
                options={[
                  { value: 'dim', label: 'Dimmed' },
                  { value: 'hide', label: 'Hidden' },
                  {
                    value: 'play',
                    label: 'Played',
                    title: 'The app plays the hand you are not practising',
                  },
                ]}
              />
              <label class="row" title="How far apart the notes are drawn">
                Zoom
                <input
                  type="range"
                  min={80}
                  max={500}
                  step={10}
                  value={s.zoom}
                  aria-label="Zoom"
                  onInput={(e) => setSetting('zoom', Number((e.target as HTMLInputElement).value))}
                />
              </label>
            </section>
            <section>
              <h4>Sound</h4>
              <Seg
                label="sound"
                value={s.soundOut}
                onChange={(v) => setSetting('soundOut', v)}
                options={[
                  {
                    value: 'computer',
                    label: 'Computer',
                    title: 'Clicks and song playback come from this device',
                  },
                  {
                    value: 'piano',
                    label: 'Piano',
                    title: 'Clicks and song playback are sent to the piano over MIDI',
                  },
                ]}
              />
              <Check
                k="monitor"
                label="My keys on computer"
                title="Hear what you play through this device, without headphones in the piano"
              />
              <label class="row" title="Loudness of everything played through this device">
                Volume
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={s.volume}
                  aria-label="Volume"
                  onInput={(e) =>
                    setSetting('volume', Number((e.target as HTMLInputElement).value))
                  }
                />
              </label>
              <label class="row" title="Metronome and count-in loudness">
                Click
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={s.clickVolume}
                  aria-label="Click volume"
                  onInput={(e) =>
                    setSetting('clickVolume', Number((e.target as HTMLInputElement).value))
                  }
                />
              </label>
              <Check k="countInClick" label="Count-in sound" />
              <Check k="metronomeClick" label="Metronome sound" />
              <h4>Delay</h4>
              <label
                class="row"
                title="Takes a steady delay of the equipment out of the timing score. The result card offers to set it."
              >
                Offset
                <input
                  type="range"
                  min={-150}
                  max={150}
                  step={5}
                  value={s.timingOffset}
                  aria-label="Timing offset"
                  onInput={(e) =>
                    setSetting('timingOffset', Number((e.target as HTMLInputElement).value))
                  }
                />
                <output>{s.timingOffset} ms</output>
              </label>
            </section>
          </div>
        </details>
      </div>

      {song && engine && (
        <Timeline
          song={song}
          transport={engine.transport}
          range={range.value}
          onRange={(r) => {
            range.value = r;
            if (r) loop.value = true;
          }}
        />
      )}

      <div class="stage">
        {error ? <p class="empty">{error}</p> : <canvas ref={canvasRef} data-testid="stage" />}
        <div class="live" data-testid="live-input">
          <span class="live-notes">{heldNames()}</span>
          <span class="pedal-dot" data-on={sustainDown.value} title="Sustain pedal">
            Ped
          </span>
        </div>
        {now && !listen.value && (
          <div class="hud" data-testid="hud" title="This pass so far">
            <strong data-level={now.accuracy >= 0.9 ? 'high' : now.accuracy >= 0.6 ? 'mid' : 'low'}>
              {pct(now.accuracy)}
            </strong>
            <span>
              {now.hits}/{now.expected}
            </span>
            {now.missed > 0 && <span class="missed">{now.missed} missed</span>}
            {now.wrong > 0 && <span class="wrong">{now.wrong} wrong</span>}
            {now.early + now.late > 0 && (
              <span class="late" title="Played before or after the beat">
                {now.early > 0 && `${now.early} early`}
                {now.early > 0 && now.late > 0 && ' · '}
                {now.late > 0 && `${now.late} late`}
              </span>
            )}
            {now.short > 0 && (
              <span class="wrong" title="Keys let go before the note ended">
                {now.short} short
              </span>
            )}
          </div>
        )}
        {pass &&
          !listen.value &&
          (now ? (
            <div class="pass chip" data-testid="pass" title="Previous pass">
              {pct(pass.r.accuracy)}
            </div>
          ) : (
            <PassCard
              info={pass}
              measureLabel={(i) => song?.file.measures[i]?.n ?? String(i + 1)}
              onAgain={again}
              onPractise={(w) => {
                range.value = w;
                loop.value = true;
                setPlaying(true);
              }}
              onCalibrate={(ms) => {
                const next = Math.min(150, Math.max(-150, settings.peek().timingOffset + ms));
                setSetting('timingOffset', next);
                again();
              }}
            />
          ))}
        {debug.value && (
          <div class="debug" data-testid="debug">
            {statsText.value}
          </div>
        )}
      </div>
    </div>
  );
}
