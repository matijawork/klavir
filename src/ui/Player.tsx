import { useSignal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { noteName } from '../engine/keys.ts';
import { type LoadedSong, loadSong, type SongFile } from '../engine/song.ts';
import { Transport } from '../engine/transport.ts';
import { held, inputVersion, outputName, sustainDown } from '../midi/midi.ts';
import { panic, SongPlayback } from '../midi/output.ts';
import { PlayerCanvas, type RenderStats } from '../render/player-canvas.ts';
import { MidiChip } from './MidiChip.tsx';

const base = import.meta.env.BASE_URL;
/** seconds of empty lead-in so the first notes fall into view */
const LEAD_IN = 2;

declare global {
  interface Window {
    __klavir?: { stats: RenderStats; transport: Transport };
  }
}

function heldNames(): string {
  const names: string[] = [];
  for (let p = 21; p <= 108; p++) if (held[p]! > 0) names.push(noteName(p));
  return names.join('  ');
}

export function Player({ songId, version }: { songId: string; version: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [song, setSong] = useState<LoadedSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playing = useSignal(false);
  const listen = useSignal(false);
  const debug = useSignal(new URLSearchParams(location.search).has('debug'));
  const statsText = useSignal('');
  const engine = useRef<{
    transport: Transport;
    playback: SongPlayback;
    view: PlayerCanvas;
  } | null>(null);

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

  useEffect(() => {
    if (!song || !canvasRef.current) return;
    const transport = new Transport();
    transport.duration = song.duration;
    transport.seek(-LEAD_IN);
    const playback = new SongPlayback(song, transport);
    const view = new PlayerCanvas(canvasRef.current, song, transport);
    engine.current = { transport, playback, view };
    window.__klavir = { stats: view.stats, transport };

    const stop = () => {
      transport.pause();
      playback.stop();
      playing.value = false;
    };
    const toggle = () => {
      if (transport.playing) return stop();
      if (transport.ended) transport.seek(-LEAD_IN);
      transport.play();
      if (listen.value) playback.start();
      playing.value = true;
    };
    const restart = () => {
      playback.stop();
      transport.seek(-LEAD_IN);
      if (transport.playing && listen.value) playback.start();
    };
    actions.current = { toggle, restart, stop };

    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).tagName === 'SELECT' ||
        (e.target as HTMLElement).tagName === 'INPUT'
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'KeyR') restart();
      else if (e.code === 'KeyD') debug.value = !debug.value;
    };
    const onHide = () => {
      if (document.hidden) stop();
    };
    const timer = setInterval(() => {
      if (transport.playing && transport.ended) stop();
      if (debug.value) {
        const s = view.stats;
        statsText.value = `${s.hz.toFixed(0)} Hz · frame ${s.avgFrameMs.toFixed(1)} ms (p99 ${s.p99FrameMs.toFixed(1)}) · draw ${s.avgDrawMs.toFixed(2)} ms · key→frame ${s.inputToFrameMs.toFixed(1)} ms`;
      }
    }, 250);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', panic);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', panic);
      playback.stop();
      panic();
      view.destroy();
      engine.current = null;
    };
  }, [song]);

  const actions = useRef({ toggle: () => {}, restart: () => {}, stop: () => {} });

  const toggleListen = () => {
    listen.value = !listen.value;
    const e = engine.current;
    if (!e) return;
    if (listen.value && e.transport.playing) e.playback.start();
    else e.playback.stop();
  };

  inputVersion.value; // re-render the live input readout when keys change
  const names = heldNames();

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
        <div class="controls">
          <button
            type="button"
            class="btn primary"
            onClick={() => actions.current.toggle()}
            title="Space"
            data-testid="play"
          >
            {playing.value ? 'Pause' : 'Play'}
          </button>
          <button type="button" class="btn" onClick={() => actions.current.restart()} title="R">
            Restart
          </button>
          <button
            type="button"
            class="btn toggle"
            aria-pressed={listen.value}
            disabled={outputName.value === null}
            onClick={toggleListen}
            title={
              outputName.value === null ? 'Needs a MIDI output' : 'Play the song on your piano'
            }
            data-testid="listen"
          >
            Listen
          </button>
        </div>
        <MidiChip />
      </header>
      <div class="stage">
        {error ? <p class="empty">{error}</p> : <canvas ref={canvasRef} data-testid="stage" />}
        <div class="live" aria-live="off" data-testid="live-input">
          <span class="live-notes">{names}</span>
          <span class="pedal-dot" data-on={sustainDown.value} title="Sustain pedal">
            Ped
          </span>
        </div>
        {debug.value && (
          <div class="debug" data-testid="debug">
            {statsText.value}
          </div>
        )}
      </div>
    </div>
  );
}
