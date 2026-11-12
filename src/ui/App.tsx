import { signal } from '@preact/signals';
import { buildExercise, EXERCISES, type ExerciseKind } from '../engine/exercises.ts';
import { Library } from './Library.tsx';
import { Player } from './Player.tsx';

/** Hash routes: "#/" library, "#/play/<song>/<version>" player, "#/exercise/<kind>/<key 0-11>". */
const route = signal(location.hash.slice(1) || '/');
window.addEventListener('hashchange', () => {
  route.value = location.hash.slice(1) || '/';
});

export function App() {
  const parts = route.value.split('/').filter(Boolean);
  if (parts[0] === 'play' && parts[1])
    return <Player key={route.value} songId={parts[1]} version={parts[2] ?? 'original'} />;
  if (parts[0] === 'exercise' && EXERCISES.some((e) => e.kind === parts[1])) {
    const file = buildExercise(parts[1] as ExerciseKind, Number(parts[2] ?? 0) || 0);
    return <Player key={route.value} songId={file.id} version={file.version} file={file} />;
  }
  return <Library />;
}
