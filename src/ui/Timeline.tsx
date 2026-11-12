import { useEffect, useRef } from 'preact/hooks';
import type { LoadedSong } from '../engine/song.ts';
import type { Transport } from '../engine/transport.ts';

interface Props {
  song: LoadedSong;
  transport: Transport;
  range: { a: number; b: number } | null;
  onRange: (r: { a: number; b: number } | null) => void;
}

/** Measure ruler: drag to choose the section to practise. The playhead moves without re-rendering. */
export function Timeline({ song, transport, range, onRange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const ms = song.measureStart;
  const dur = song.duration || 1;
  const count = ms.length;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const x = Math.min(1, Math.max(0, transport.time() / dur));
      if (head.current)
        head.current.style.transform = `translateX(${(x * (root.current?.clientWidth ?? 0)).toFixed(1)}px)`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [transport, dur]);

  const measureAt = (clientX: number): number => {
    const rect = root.current!.getBoundingClientRect();
    const t = (Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width) * dur;
    let i = 0;
    while (i + 1 < count && ms[i + 1]! <= t) i++;
    return i;
  };
  const pct = (i: number) => `${((i < count ? ms[i]! : dur) / dur) * 100}%`;
  const step = Math.max(1, Math.ceil(count / 24));
  const labels: number[] = [];
  for (let i = 0; i < count; i += step) labels.push(i);

  return (
    <div class="timeline-row">
      <div
        ref={root}
        class="timeline"
        title="Drag to choose a section"
        data-testid="timeline"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const m = measureAt(e.clientX);
          drag.current = m;
          onRange({ a: m, b: m });
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const m = measureAt(e.clientX);
          onRange({ a: Math.min(drag.current, m), b: Math.max(drag.current, m) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        {labels.map((i) => (
          <span key={i} class="tick" style={{ left: pct(i) }}>
            {song.file.measures[i]!.n}
          </span>
        ))}
        {range && (
          <div
            class="timeline-range"
            style={{ left: pct(range.a), width: `calc(${pct(range.b + 1)} - ${pct(range.a)})` }}
          />
        )}
        <div ref={head} class="playhead" />
      </div>
      {range && (
        <button
          type="button"
          class="icon-btn small"
          title="Whole song"
          aria-label="Clear section"
          onClick={() => onRange(null)}
          data-testid="range-clear"
        >
          ×
        </button>
      )}
    </div>
  );
}
