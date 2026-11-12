/** Reads design tokens from CSS once so canvas code uses the same values as the DOM. */
const NAMES = [
  'bg',
  'surface-1',
  'surface-2',
  'surface-3',
  'border',
  'text',
  'text-dim',
  'text-faint',
  'accent',
  'accent-strong',
  'hand-right',
  'hand-left',
  'fb-correct',
  'fb-early',
  'fb-late',
  'fb-wrong',
  'fb-missed',
  'pedal',
  'key-white',
  'key-black',
] as const;

export type TokenName = (typeof NAMES)[number];
export type Tokens = Record<TokenName, string>;

let cache: Tokens | null = null;

export function tokens(): Tokens {
  if (cache) return cache;
  const style = getComputedStyle(document.documentElement);
  const out = {} as Tokens;
  for (const name of NAMES) out[name] = style.getPropertyValue(`--${name}`).trim();
  cache = out;
  return out;
}

/** "#rrggbb" + alpha → "rgba(...)" */
export function withAlpha(hex: string, alpha: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}
