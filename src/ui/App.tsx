import { signal } from '@preact/signals';
import { buildExercise, EXERCISES, type ExerciseKind } from '../engine/exercises.ts';
import { Library } from './Library.tsx';
import { Player } from './Player.tsx';

/** Hash routes: "#/" library, "#/play/<song>/<version>" player, "#/exercise/<kind>/<key 0-11>[/minor]". */
const route = signal(location.hash.slice(1) || '/');
window.addEventListener('hashchange', () => {
  route.value = location.hash.slice(1) || '/';
});

// menus close when you click anywhere else
document.addEventListener('pointerdown', (e) => {
  for (const d of document.querySelectorAll<HTMLDetailsElement>('details.menu[open]'))
    if (!d.contains(e.target as Node)) d.open = false;
});

export function App() {
  const all = route.value.split('/').filter(Boolean);
  const perform = all[0] === 'perform';
  // a performance may name one hand at the end: ".../L" or ".../R"
  const last = all[all.length - 1];
  const hands = perform && (last === 'L' || last === 'R') ? last : 'both';
  if (hands !== 'both') all.pop();
  // "#/perform/<song>/<version>" and "#/perform/exercise/<kind>/<key>[/minor]"
  const parts = perform ? (all[1] === 'exercise' ? all.slice(1) : ['play', ...all.slice(1)]) : all;
  if (parts[0] === 'play' && parts[1])
    return (
      <Player
        key={route.value}
        songId={parts[1]}
        version={parts[2] ?? 'original'}
        perform={perform}
        hands={hands}
      />
    );
  if (parts[0] === 'exercise' && EXERCISES.some((e) => e.kind === parts[1])) {
    const file = buildExercise(
      parts[1] as ExerciseKind,
      Number(parts[2] ?? 0) || 0,
      parts[3] === 'minor',
    );
    return (
      <Player
        key={route.value}
        songId={file.id}
        version={file.version}
        file={file}
        perform={perform}
        hands={hands}
      />
    );
  }
  return <Library />;
}
