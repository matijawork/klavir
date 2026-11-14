import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { outputLevel } from '../audio/synth.ts';
import { tonicOf } from '../engine/exercises.ts';
import { calibrationHint, feedback } from '../engine/feedback.ts';
import { noteName } from '../engine/keys.ts';
import { type ReviewStep, reviewSteps } from '../engine/review.ts';
import { type PassResult, type PassSnapshot, PracticeSession } from '../engine/session.ts';
import { type LoadedSong, loadSong, type SongFile } from '../engine/song.ts';
import { Transport } from '../engine/transport.ts';
import { held, inputVersion, onNote, outputName, sustainDown } from '../midi/midi.ts';
import { panic, SongPlayback, setClickLevel, setSoundTarget } from '../midi/output.ts';
import { PlayerCanvas, type RenderStats } from '../render/player-canvas.ts';
import { addPass, bestOf, passesOf } from '../store/history.ts';
import { clampSpeed, type Settings, setSetting, settings } from '../store/settings.ts';
import { Calibrate } from './Calibrate.tsx';
import { FingeringChip } from './FingeringChip.tsx';
import { MidiChip } from './MidiChip.tsx';
import { Timeline } from './Timeline.tsx';

const base = import.meta.env.BASE_URL;

declare global {
  interface Window {
    __klavir?: {
      stats: RenderStats;
      transport: Transport;
      session: PracticeSession;
      playback: SongPlayback;
      view: PlayerCanvas;
      level: typeof outputLevel;
    };
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

/** Where a song's finger numbers come from, or null when it has none. */
function fingerSource(file: SongFile): { checked: boolean; text: string } | null {
  if (file.fingeringSource) return file.fingeringSource;
  const first = file.notes.find((n) => n.f);
  if (!first) return null;
  return first.fs === 'claude'
    ? { checked: false, text: 'computed by the app, not in the score' }
    : { checked: true, text: 'the score' };
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
  /** settings the pass was played with */
  s: Settings;
  /** a performance (kept in the history); practice passes are not kept */
  kept: boolean;
  /** best earlier performance (0..100), or null */
  prevBest: number | null;
  /** scores of the latest passes, oldest first, this one included */
  recent: number[];
  /** the pass itself, for the note-by-note review */
  snap: PassSnapshot;
}

/** Result of a finished pass in plain words: score, what it is made of, what to work on. */
function PassCard(props: {
  info: PassInfo;
  measureLabel: (i: number) => string;
  onAgain: () => void;
  onPractise: (w: { a: number; b: number }) => void;
  onCalibrate: (ms: number) => void;
  onReview: () => void;
}) {
  const { r, prevBest, recent, s, kept } = props.info;
  const timed = s.mode === 'tempo';
  const fb = feedback(r, { mode: s.mode, speed: s.speed, metronome: s.metronome, perform: kept });
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
        {timed && (
          <strong
            data-testid="pass-score"
            data-level={r.accuracy >= 0.9 ? 'high' : r.accuracy >= 0.6 ? 'mid' : 'low'}
            title="Right notes 40 %, on the beat 35 %, held right 25 %; every wrong key lowers it"
          >
            {pct(r.accuracy)}
          </strong>
        )}
        <div>
          <b data-testid="verdict">{fb.verdict}</b>
          {kept ? (
            <span
              title={recent.length > 1 ? `Latest performances: ${recent.join(' · ')}` : undefined}
            >
              {prevBest === null
                ? 'First performance'
                : score > prevBest
                  ? `New best · was ${prevBest}%`
                  : `Best ${prevBest}%`}
            </span>
          ) : (
            <span
              data-testid="not-kept"
              title="Practice is not kept. Only Perform (from the library: whole piece, full speed, no stopping) is scored into your history and chart."
            >
              Practice · not kept
            </span>
          )}
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
            All your notes land about {Math.abs(hint)} ms {hint > 0 ? 'late' : 'early'}, by the same
            amount every time. That is the delay of the screen and cable, not your playing.{' '}
            <button
              type="button"
              class="link"
              onClick={() => props.onCalibrate(hint)}
              title="From now on this delay is subtracted before your timing is judged (⚙ → Delay to change it)"
              data-testid="compensate"
            >
              Stop counting this delay
            </button>
          </li>
        )}
      </ul>
      <div class="pass-actions">
        {w && !kept && (
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
        <button
          type="button"
          class="btn"
          onClick={props.onReview}
          title="Go through this pass note by note: see where you pressed and how long you held"
          data-testid="review-open"
        >
          Review
        </button>
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
  perform = false,
}: {
  songId: string;
  version: string;
  /** a ready-made song (exercise) instead of one fetched from the library */
  file?: SongFile;
  /** the real thing: whole piece, Tempo mode, full speed, no stopping; the only score that is kept */
  perform?: boolean;
}) {
  const eff = (s: Settings): Settings =>
    perform ? { ...s, mode: 'tempo', hands: 'both', speed: 1, strictness: 'normal' } : s;
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
  const calibrating = useSignal(false);
  /** index of the step shown in the note-by-note review; null = not reviewing */
  const review = useSignal<number | null>(null);
  const onlyBad = useSignal(false);
  const steps = useRef<ReviewStep[]>([]);
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
      const s = eff(settings.peek());
      live.value = null;
      if (listen.peek() || r.expected === 0) return;
      let prevBest: number | null = null;
      let recent: number[] = [];
      if (perform) {
        prevBest = bestOf(historyKey);
        addPass(historyKey, { at: Date.now(), score: Math.round(r.accuracy * 100) });
        recent = passesOf(historyKey)
          .slice(-6)
          .map((p) => p.score);
      }
      lastPass.value = { r, s, kept: perform, prevBest, recent, snap: session.snapshot() };
    };
    session.onEnd = () => {
      playback.stop();
      playing.value = false;
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
    const offNote = onNote((e) => {
      if (!e.on) {
        session.noteOff(e.pitch, e.time);
        return;
      }
      session.noteOn(e.pitch, e.time);
      playback.flush();
    });
    window.__klavir = { stats: view.stats, transport, session, playback, view, level: outputLevel };
    lastConfig.current = '';
    lastClicks.current = '';
    engineSig.value = { transport, session, playback, view };

    const onHide = () => {
      if (document.hidden && session.running) {
        session.pause();
        playback.stop();
        playing.value = false;
        // a performance cannot be paused: leaving the tab ends it
        if (perform) session.rewind();
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
    const s = eff(settings.value);
    const demo = listen.value;
    const handMask = s.hands === 'both' ? 3 : s.hands === 'L' ? 1 : 2;
    const { session, playback, view, transport } = engine;
    setSoundTarget(s.soundOut);
    setClickLevel(s.clickVolume);
    transport.setRate(s.speed);
    session.strictness = s.strictness;
    session.offsetMs = s.timingOffset;
    const loopOn = !perform && loop.value;

    // only what changes the notes to play restarts the pass; volume, zoom or speed do not
    const r = perform ? null : range.value;
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
      review.value = null;
      view.review = null;
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
    view.pictureMs = s.pictureOffset;
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

  /** song seconds between the hit line and the note being looked at, so its press mark shows too */
  const reviewLead = () => (90 * (engine?.transport.rate ?? 1)) / settings.peek().zoom;
  const showStep = (i: number) => {
    const st = steps.current[i];
    if (!engine || !st) return;
    review.value = i;
    engine.view.reviewAt = st.time;
    engine.transport.seek(st.time - reviewLead());
  };
  /** moves freely through the reviewed pass; the step text follows the note nearest the keys */
  const scrub = (t: number) => {
    if (!engine || review.value === null) return;
    const all = steps.current;
    const lead = reviewLead();
    const first = all[0]?.time ?? 0;
    const last = all[all.length - 1]?.time ?? 0;
    const to = Math.min(last, Math.max(first, t)) - lead;
    engine.transport.seek(to);
    let near = 0;
    for (let i = 1; i < all.length; i++)
      if (Math.abs(all[i]!.time - lead - to) < Math.abs(all[near]!.time - lead - to)) near = i;
    review.value = near;
    engine.view.reviewAt = all[near]!.time;
  };
  const stepBy = (d: 1 | -1) => {
    const all = steps.current;
    for (let i = (review.value ?? 0) + d; i >= 0 && i < all.length; i += d)
      if (!onlyBad.value || all[i]!.bad) {
        showStep(i);
        return;
      }
  };
  const openReview = () => {
    const info = lastPass.peek();
    if (!engine || !info) return;
    setPlaying(false);
    engine.session.restore(info.snap);
    engine.view.review = info.snap;
    steps.current = reviewSteps(engine.session.song, info.snap);
    const firstBad = steps.current.findIndex((st) => st.bad);
    showStep(Math.max(0, firstBad));
  };
  const closeReview = () => {
    if (!engine || review.value === null) return;
    engine.view.review = null;
    engine.session.rewind();
    review.value = null;
  };
  const setPlaying = (on: boolean) => {
    if (!engine) return;
    if (on) {
      closeReview();
      calibrating.value = false;
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
  const toggle = () => {
    if (perform && engine?.session.running) {
      // no pausing in a performance: stopping throws it away
      setPlaying(false);
      restart();
    } else setPlaying(!engine?.session.running);
  };
  const restart = () => {
    if (!engine) return;
    engine.view.review = null;
    review.value = null;
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
  const setLoop = (on: boolean) => {
    loop.value = on;
  };
  const bumpSpeed = (d: number) => setSetting('speed', clampSpeed(settings.peek().speed + d));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement;
      const tag = el.tagName;
      const slider = tag === 'INPUT' && el.type === 'range';
      const box = tag === 'INPUT' && el.type === 'checkbox';
      // typing into a field keeps its keys; sliders and checkboxes only keep the keys they use
      if (tag === 'SELECT' || (tag === 'INPUT' && !slider && !box)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (slider && e.code.startsWith('Arrow')) return;
      if (box && e.code === 'Space') return;
      const s = settings.peek();
      const locked = ['KeyL', 'KeyW', 'Digit1', 'Digit2', 'Digit3', 'ArrowUp', 'ArrowDown'];
      if (perform && (locked.includes(e.code) || e.code === 'Equal' || e.code === 'Minus')) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggle();
          break;
        case 'KeyR':
          restart();
          break;
        case 'KeyL':
          setLoop(!loop.value);
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
        case 'ArrowLeft':
          if (review.value !== null) stepBy(-1);
          break;
        case 'ArrowRight':
          if (review.value !== null) stepBy(1);
          break;
        case 'Escape':
          closeReview();
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
  const s = eff(settings.value);
  const pass = lastPass.value;
  const now = live.value;
  const noOut = outputName.value === null;
  const step = review.value !== null ? (steps.current[review.value] ?? null) : null;

  return (
    <div class="page player">
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Back to library" title="Library">
          ←
        </a>
        <div class="song-title">
          <strong>{song?.file.title ?? '…'}</strong>
          <span>{song?.file.composer}</span>
          {song && fingerSource(song.file) && (
            <FingeringChip
              id={`${song.file.id}/${song.file.version}`}
              source={fingerSource(song.file)!}
            />
          )}
        </div>
        {song && !file && !perform && (
          <a
            class="btn"
            href={`#/exercise/${song.file.keys[0]?.mode === 'minor' ? 'scale-minor' : 'scale-major'}/${tonicOf(song.file.keys[0]?.fifths ?? 0, song.file.keys[0]?.mode === 'minor')}`}
            title="Warm up with the scale of this song's key"
            data-testid="warmup"
          >
            Warm-up
          </a>
        )}
        <button
          type="button"
          class="btn primary"
          onClick={toggle}
          title={
            perform && playing.value ? 'Stops and throws this performance away · Space' : 'Space'
          }
          data-testid="play"
        >
          {playing.value ? (perform ? 'Stop' : 'Pause') : 'Play'}
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
        {!perform && (
          <Toggle
            on={listen.value}
            label="Listen"
            title={
              s.soundOut === 'piano' && noOut ? 'Needs a MIDI output' : 'Hear how the song goes'
            }
            onChange={(v) => {
              listen.value = v;
            }}
            testid="listen"
          />
        )}
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
        {perform && (
          <span
            class="badge best"
            title="Whole piece, both hands, Tempo mode, 100 % speed, Normal strictness, no pausing. The score is kept and shown in the library chart."
            data-testid="perform-badge"
          >
            Performance
          </span>
        )}
        {!perform && (
          <>
            <Seg
              label="mode"
              value={s.mode}
              onChange={(v) => setSetting('mode', v)}
              options={[
                { value: 'wait', label: 'Wait', title: 'The song waits for the right keys · W' },
                {
                  value: 'tempo',
                  label: 'Tempo',
                  title: 'The song keeps going, rhythm is scored · W',
                },
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
                  setSetting(
                    'speed',
                    clampSpeed(Number((e.target as HTMLInputElement).value) / 100),
                  )
                }
                aria-label="Speed"
                data-testid="speed"
              />
              <input
                type="number"
                min={10}
                max={150}
                step={1}
                value={Math.round(s.speed * 100)}
                onChange={(e) => {
                  const el = e.target as HTMLInputElement;
                  const v = Number(el.value);
                  const next =
                    Number.isFinite(v) && el.value !== '' ? clampSpeed(v / 100) : s.speed;
                  setSetting('speed', next);
                  el.value = String(Math.round(next * 100));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                aria-label="Speed in percent"
                title="Type the speed, 10–150 %"
                data-testid="speed-number"
              />
              %
            </label>
            <span class="sep" />
            <Toggle
              on={loop.value}
              label="Loop"
              title="Repeat the section · L (drag on the ruler to choose one)"
              onChange={setLoop}
              testid="loop"
            />
          </>
        )}
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
        <button
          type="button"
          class="btn"
          disabled={!pass || step !== null || (perform && playing.value)}
          onClick={openReview}
          title={
            pass
              ? 'Go through your last pass note by note: where you pressed, how long you held, wrong keys'
              : 'Play a pass to the end first; then this shows it note by note'
          }
          data-testid="review-button"
        >
          Review
        </button>
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
              <button
                type="button"
                class="btn"
                disabled={s.soundOut === 'piano' && noOut}
                title={
                  s.soundOut === 'piano' && noOut
                    ? 'Needs a MIDI output'
                    : 'Finds the offset for you: tap one key along with 20 clicks'
                }
                onClick={(e) => {
                  (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                  setPlaying(false);
                  calibrating.value = true;
                }}
                data-testid="calibrate"
              >
                Measure
              </button>
              <label
                class="row"
                title="Moves only the picture. Raise it if the notes reach the keys after you hear the click, lower it if before."
              >
                Picture
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={5}
                  value={s.pictureOffset}
                  aria-label="Picture offset"
                  onInput={(e) =>
                    setSetting('pictureOffset', Number((e.target as HTMLInputElement).value))
                  }
                />
                <output>{s.pictureOffset} ms</output>
              </label>
            </section>
          </div>
        </details>
      </div>

      {song && engine && (
        <Timeline
          song={song}
          transport={engine.transport}
          range={perform ? null : range.value}
          locked={perform}
          onRange={(r) => {
            range.value = r;
            if (r) loop.value = true;
          }}
          onSeek={review.value !== null ? scrub : null}
        />
      )}

      <div
        class="stage"
        onWheel={(e) => {
          if (review.value === null || !engine) return;
          const pps = settings.peek().zoom / engine.transport.rate;
          scrub(engine.transport.time() + reviewLead() - e.deltaY / pps);
        }}
      >
        {error ? <p class="empty">{error}</p> : <canvas ref={canvasRef} data-testid="stage" />}
        <div class="live" data-testid="live-input">
          <span class="live-notes">{heldNames()}</span>
          <span class="pedal-dot" data-on={sustainDown.value} title="Sustain pedal">
            Ped
          </span>
        </div>
        {now && !listen.value && (
          <div class="hud" data-testid="hud" title="This pass so far">
            {s.mode === 'tempo' && (
              <strong
                data-level={now.accuracy >= 0.9 ? 'high' : now.accuracy >= 0.6 ? 'mid' : 'low'}
                data-testid="hud-score"
              >
                {pct(now.accuracy)}
              </strong>
            )}
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
        {calibrating.value && (
          <Calibrate
            onUse={(ms) => setSetting('timingOffset', ms)}
            onClose={() => {
              calibrating.value = false;
            }}
          />
        )}
        {step && (
          <div class="review" data-testid="review">
            <button
              type="button"
              class="icon-btn small"
              onClick={() => stepBy(-1)}
              title="Previous · ←"
              aria-label="Previous"
              data-testid="review-prev"
            >
              ‹
            </button>
            <span class="review-pos" data-testid="review-pos">
              {(review.value ?? 0) + 1} / {steps.current.length} · Measure{' '}
              {song?.file.measures[step.measure]?.n ?? step.measure + 1}
            </span>
            <b
              data-bad={step.bad}
              data-testid="review-text"
              title="White line: where you pressed. White bar: how long you held. Red block: a wrong key."
            >
              {step.text}
            </b>
            <button
              type="button"
              class="icon-btn small"
              onClick={() => stepBy(1)}
              title="Next · →"
              aria-label="Next"
              data-testid="review-next"
            >
              ›
            </button>
            <Toggle
              on={onlyBad.value}
              label="Mistakes only"
              title="Step only through the notes that went wrong"
              onChange={(v) => {
                onlyBad.value = v;
              }}
              testid="review-bad"
            />
            <button
              type="button"
              class="btn"
              onClick={closeReview}
              title="Back to the result · Esc"
              data-testid="review-close"
            >
              Done
            </button>
          </div>
        )}
        {pass &&
          !step &&
          !calibrating.value &&
          !listen.value &&
          // while a loop keeps running the result stays a small chip, so it never covers the notes
          (now || (loop.value && playing.value) ? (
            <div class="pass chip" data-testid="pass" title="Previous pass">
              {pass.s.mode === 'tempo' ? (
                <span data-testid="pass-score">{pct(pass.r.accuracy)}</span>
              ) : (
                <span>
                  {pass.r.wrong} wrong · {pass.r.short} short
                </span>
              )}
            </div>
          ) : (
            <PassCard
              info={pass}
              measureLabel={(i) => song?.file.measures[i]?.n ?? String(i + 1)}
              onAgain={again}
              onReview={openReview}
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
