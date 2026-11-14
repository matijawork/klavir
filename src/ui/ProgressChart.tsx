import { useEffect, useRef, useState } from 'preact/hooks';
import { type DayScore, dailyScores } from '../engine/progress.ts';
import { historyVersion, type PerfHands, passesOf } from '../store/history.ts';

const W = 560;
const H = 240;
const LEFT = 44;
const RIGHT = 40;
const TOP = 16;
const BOTTOM = 34;
const GRID = [0, 25, 50, 75, 100];

const dayLabel = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Best score per practice day for one piece, as a line. One series, so no legend. */
export function ProgressChart(props: { id: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  historyVersion.value;
  const kinds = (['both', 'L', 'R'] as const).filter((h) => passesOf(props.id, h).length > 0);
  const [hands, setHands] = useState<PerfHands>(kinds[0] ?? 'both');
  const days: DayScore[] = dailyScores(passesOf(props.id, hands));

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const n = days.length;
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const x = (i: number) => LEFT + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (score: number) => TOP + (1 - score / 100) * plotH;
  // at most ~6 date labels, always the first and the last day
  const every = Math.max(1, Math.ceil(n / 6));
  const labelled = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2);
  const h = hover !== null ? days[hover] : undefined;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes it; Esc does so natively
    <dialog
      ref={dialog}
      class="progress"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      data-testid="progress"
    >
      <header>
        <div>
          <strong class="progress-title">{props.title}</strong>
          <span>Best performance of each day</span>
        </div>
        {kinds.length > 1 && (
          <fieldset class="seg" aria-label="Hands">
            {kinds.map((h) => (
              <button
                type="button"
                key={h}
                aria-pressed={hands === h}
                onClick={() => {
                  setHover(null);
                  setHands(h);
                }}
                data-testid={`progress-${h}`}
              >
                {h === 'both' ? 'Both hands' : h === 'L' ? 'Left' : 'Right'}
              </button>
            ))}
          </fieldset>
        )}
        <button
          type="button"
          class="icon-btn small"
          aria-label="Close"
          title="Close · Esc"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </header>
      <div class="progress-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Best score per day: ${days.map((d) => `${dayLabel(d.day)} ${d.best} %`).join(', ')}`}
          onPointerLeave={() => setHover(null)}
        >
          {GRID.map((g) => (
            <g key={g}>
              <line class="grid" x1={LEFT} x2={W - RIGHT} y1={y(g)} y2={y(g)} />
              <text class="axis" x={LEFT - 8} y={y(g)} text-anchor="end" dominant-baseline="middle">
                {g}%
              </text>
            </g>
          ))}
          {days.map(
            (d, i) =>
              labelled(i) && (
                <text key={d.day} class="axis" x={x(i)} y={H - 10} text-anchor="middle">
                  {dayLabel(d.day)}
                </text>
              ),
          )}
          {h && hover !== null && (
            <line class="cross" x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + plotH} />
          )}
          {n > 1 && (
            <polyline class="line" points={days.map((d, i) => `${x(i)},${y(d.best)}`).join(' ')} />
          )}
          {days.map((d, i) => (
            <circle
              key={d.day}
              class="progress-dot"
              cx={x(i)}
              cy={y(d.best)}
              r={hover === i ? 6 : 4.5}
              data-testid="progress-dot"
            />
          ))}
          {n > 0 && hover === null && (
            <text
              class="value"
              x={x(n - 1) + 10}
              y={y(days[n - 1]!.best)}
              dominant-baseline="middle"
            >
              {days[n - 1]!.best}%
            </text>
          )}
          {/* hit areas: a whole column per day, far bigger than the dot */}
          {days.map((d, i) => (
            <rect
              key={d.day}
              class="hit"
              x={x(i) - (n === 1 ? plotW / 2 : plotW / (n - 1) / 2)}
              y={0}
              width={n === 1 ? plotW : plotW / (n - 1)}
              height={H}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            />
          ))}
        </svg>
        {h && hover !== null && (
          <div
            class="progress-tip"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              top: `${(y(h.best) / H) * 100}%`,
            }}
            data-side={x(hover) > W * 0.6 ? 'left' : 'right'}
            data-testid="progress-tip"
          >
            <strong class="progress-tip-value">{h.best}%</strong>
            <span>{dayLabel(h.day)}</span>
            <span>
              {h.passes} {h.passes === 1 ? 'performance' : 'performances'}
            </span>
          </div>
        )}
      </div>
    </dialog>
  );
}
