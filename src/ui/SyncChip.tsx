import { signIn, signOut, sync, syncState } from '../sync/sync.ts';

const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Account and sync status. Not shown at all while no cloud is configured. */
export function SyncChip() {
  const s = syncState.value;
  if (!s.available) return null;
  if (!s.user)
    return (
      <button
        type="button"
        class="chip"
        data-state={s.status === 'error' ? 'error' : 'off'}
        title={
          s.error ??
          'Sign in with Google to keep your scores, practice days, videos and last performances in your account, the same on every device'
        }
        onClick={() => void signIn()}
        data-testid="sync-signin"
      >
        <span class="dot" />
        Sign in to sync
      </button>
    );
  const label =
    s.status === 'syncing'
      ? 'Syncing…'
      : s.status === 'error'
        ? 'Not synced'
        : s.at
          ? `Synced ${clock(s.at)}`
          : 'Signed in';
  return (
    <details class="menu sync">
      <summary
        class="chip"
        data-state={s.status === 'error' ? 'warn' : s.status === 'ok' ? 'on' : 'off'}
        title={s.error ?? `Signed in as ${s.user.name}. Everything is also kept on this device.`}
        data-testid="sync-chip"
      >
        <span class="dot" />
        {label}
      </summary>
      <div class="panel">
        <span class="row">{s.user.name}</span>
        <button type="button" class="btn" onClick={() => void sync(true)} data-testid="sync-now">
          Sync now
        </button>
        <button
          type="button"
          class="btn"
          title="Stops syncing on this device. What is here stays here."
          onClick={() => void signOut()}
          data-testid="sync-signout"
        >
          Sign out
        </button>
      </div>
    </details>
  );
}
