import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { noteName } from '../engine/keys.ts';
import { type PassResult, PracticeSession } from '../engine/session.ts';
import { type LoadedSong, loadSong, type SongFile } from '../engine/song.ts';
import { Transport } from '../engine/transport.ts';
import { held, inputVersion, onNote, outputName, sustainDown } from '../midi/midi.ts';
import { panic, SongPlayback } from '../midi/output.ts';
import { PlayerCanvas, type RenderStats } from '../render/player-canvas.ts';
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

function Check(props: { k: keyof Settings; label: string; title?: string }) {
  return (
    <label class="row" title={props.title}>
      <input
        type="checkbox"
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

export function Player({ songId, version }: { songId: string; version: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [song, setSong] = useState<LoadedSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineSig = useSignal<Engine | null>(null);
  const engine = engineSig.value;
  const playing = useSignal(false);
  const listen = useSignal(false);
  const loop = useSignal(false);
  const range = useSignal<{ a: number; b: number } | null>(null);
  const lastPass = useSignal<PassResult | null>(null);
  const debug = useSignal(new URLSearchParams(location.search).has('debug'));
  const statsText = useSignal('');
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
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
  }, [songId, version]);

  // engine lifetime
  useEffect(() => {
    if (!song || !canvasRef.current) return;
    const transport = new Transport();
    transport.duration = song.duration;
    const session = new PracticeSession(song, transport);
    const playback = new SongPlayback(song, transport);
    const view = new PlayerCanvas(canvasRef.current, session);
    session.onSeek = () => playback.resync();
    session.onPass = (r) => {
      lastPass.value = r;
      const s = settings.peek();
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
      if (!e.on) return;
      session.noteOn(e.pitch, e.time);
      playback.flush();
    });
    window.__klavir = { stats: view.stats, transport, session };
    engineSig.value = { transport, session, playback, view };

    const onHide = () => {
      if (document.hidden && session.running) {
        session.pause();
        playback.stop();
        playing.value = false;
      }
    };
    const timer = setInterval(() => {
      if (!debug.value) return;
      const s = view.stats;
      statsText.value = `${s.hz.toFixed(0)} Hz · frame ${s.avgFrameMs.toFixed(1)} ms (p99 ${s.p99FrameMs.toFixed(1)}) · draw ${s.avgDrawMs.toFixed(2)} ms · key→frame ${s.inputToFrameMs.toFixed(1)} ms`;
    }, 250);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', panic);
    return () => {
      clearInterval(timer);
      offNote();
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
    const wasRunning = session.running;
    if (wasRunning) session.pause();
    playback.stop();
    transport.setRate(s.speed);
    session.configure({
      mode: demo ? 'tempo' : s.mode,
      handMask: demo ? 0 : handMask,
      range: range.value,
      loop: loop.value,
      countIn: s.countIn,
    });
    lastPass.value = null;

    playback.handMask = demo ? 3 : s.otherHand === 'play' ? 3 & ~handMask : 0;
    playback.getLimit = demo || s.mode !== 'wait' ? null : () => session.gateTime;
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

    view.demo = demo;
    view.otherHand = s.otherHand;
    view.noteNames = s.noteNames;
    view.octaveNumbers = s.octaveNumbers;
    view.showFingers = s.fingers;
    view.pxPerSec = s.zoom;
    view.beatPulse = s.metronome;
    if (wasRunning) {
      session.play();
      playback.start();
    }
  });

  useSignalEffect(() => {
    const engine = engineSig.value;
    if (engine) engine.view.pedalDown = sustainDown.value;
  });

  const setPlaying = (on: boolean) => {
    if (!engine) return;
    if (on) {
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
          title={noOut ? 'Needs a MIDI output' : 'Hear the song on your piano'}
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
            { value: 'tempo', label: 'Tempo', title: 'The song keeps going · W' },
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
        <Toggle
          on={loop.value}
          label="Loop"
          title="Repeat the section · L"
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
        <details class="menu">
          <summary class="btn" title="Settings">
            ⚙
          </summary>
          <div class="panel">
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
                  label: 'On piano',
                  title: 'The piano plays the hand you are not practising',
                },
              ]}
            />
            <h4>Note names</h4>
            <Seg
              label="names"
              value={s.noteNames}
              onChange={(v) => setSetting('noteNames', v)}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'all', label: 'All' },
              ]}
            />
            <Check k="octaveNumbers" label="Octave numbers" />
            <Check k="fingers" label="Finger numbers" />
            <h4>Clicks</h4>
            <Check k="countInClick" label="Count-in sound" title="Played by the piano" />
            <Check k="metronomeClick" label="Metronome sound" title="Played by the piano" />
            <h4>Zoom</h4>
            <input
              type="range"
              min={80}
              max={500}
              step={10}
              value={s.zoom}
              aria-label="Zoom"
              onInput={(e) => setSetting('zoom', Number((e.target as HTMLInputElement).value))}
            />
            <h4>Auto speed-up</h4>
            <label class="row" title="After each clean pass of a looped section the speed goes up">
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
              On
            </label>
            <Pct k="autoSpeedStart" label="Start" min={10} max={150} />
            <Pct k="autoSpeedStep" label="Step" min={1} max={50} />
            <Pct k="autoSpeedTarget" label="Target" min={10} max={150} />
            <Pct
              k="autoSpeedThreshold"
              label="Clean pass"
              min={50}
              max={100}
              title="Share of notes that must be right"
            />
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
        {pass && !listen.value && (
          <div class="pass" data-testid="pass" title="Last pass">
            <strong>{Math.round(pass.accuracy * 100)}%</strong>
            <span>
              {pass.hits}/{pass.expected}
            </span>
            {pass.wrong > 0 && <span class="wrong">{pass.wrong} wrong</span>}
          </div>
        )}
        {debug.value && (
          <div class="debug" data-testid="debug">
            {statsText.value}
          </div>
        )}
      </div>
    </div>
  );
}
