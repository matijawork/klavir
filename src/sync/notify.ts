/** Stores call `changed()` after every local change; the sync layer listens. Keeps stores free of sync imports. */
let listener: (() => void) | null = null;
export const onLocalChange = (fn: () => void): void => {
  listener = fn;
};
export const changed = (): void => listener?.();
