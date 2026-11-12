import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import type { Hand, SongFile, SongNote } from '../../src/engine/song.ts';
import { type MeasureFlow, unrollMeasures } from './unroll.ts';

type X = Record<string, unknown>;

const tagOf = (n: X): string => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: X | undefined): X[] => {
  if (!n) return [];
  const v = n[tagOf(n)];
  return Array.isArray(v) ? (v as X[]) : [];
};
const attrs = (n: X | undefined): Record<string, string> =>
  ((n?.[':@'] as Record<string, string> | undefined) ?? {}) as Record<string, string>;
const find = (n: X | undefined, name: string): X | undefined => kids(n).find((c) => name in c);
const findAll = (n: X | undefined, name: string): X[] => kids(n).filter((c) => name in c);
const text = (n: X | undefined): string | undefined => {
  if (!n) return undefined;
  const parts = kids(n)
    .map((c) => c['#text'])
    .filter((v) => v !== undefined);
  return parts.length ? parts.join('').trim() : undefined;
};
const num = (n: X | undefined): number | undefined => {
  const t = text(n);
  if (t === undefined || t === '') return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
};
const path = (n: X | undefined, ...names: string[]): X | undefined => {
  let cur = n;
  for (const name of names) cur = find(cur, name);
  return cur;
};

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/** Reads .musicxml/.xml text or a compressed .mxl archive and returns the score XML text. */
export function readScoreXml(bytes: Uint8Array, fileName: string): string {
  const dec = new TextDecoder('utf-8');
  if (!fileName.toLowerCase().endsWith('.mxl')) return dec.decode(bytes);
  const files = unzipSync(bytes);
  const container = files['META-INF/container.xml'];
  let root: string | undefined;
  if (container) {
    const m = /full-path="([^"]+)"/.exec(dec.decode(container));
    root = m?.[1];
  }
  root ??= Object.keys(files).find(
    (f) => !f.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(f),
  );
  if (!root || !files[root]) throw new Error('No score file found inside the .mxl archive');
  return dec.decode(files[root]!);
}

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

interface RawNote {
  p: number;
  /** offset inside the measure, beats */
  o: number;
  d: number;
  h: Hand;
  f?: number;
  g?: 1;
  tieStart: boolean;
  tieStop: boolean;
}

interface RawMeasure {
  label: string;
  len: number;
  nominal: number;
  implicit: boolean;
  num: number;
  den: number;
  notes: RawNote[];
  tempos: { o: number; bpm: number }[];
  pedal: { o: number; on: boolean }[];
  key?: { fifths: number; mode: 'major' | 'minor' | null };
  rehearsal?: string;
  flow: MeasureFlow;
}

export interface ImportOptions {
  id: string;
  version: string;
  title?: string;
  composer?: string;
  /** split hands at this MIDI pitch when the score has a single staff (last resort) */
  splitAt?: number;
  /** accept a score that uses one hand only (exercises, test patterns) */
  oneHand?: boolean;
}

export interface ImportResult {
  song: SongFile;
  errors: string[];
}

function parsePart(
  part: X,
  staffToHand: (staff: number) => Hand | null,
  errors: string[],
): RawMeasure[] {
  const out: RawMeasure[] = [];
  let divisions = 1;
  let timeNum = 4;
  let timeDen = 4;
  let openEndings: number[] | undefined;

  for (const measure of findAll(part, 'measure')) {
    const ma = attrs(measure);
    const raw: RawMeasure = {
      label: ma.number ?? String(out.length + 1),
      len: 0,
      nominal: 0,
      implicit: ma.implicit === 'yes',
      num: timeNum,
      den: timeDen,
      notes: [],
      tempos: [],
      pedal: [],
      flow: {},
    };
    if (openEndings) raw.flow.endings = openEndings;
    let cursor = 0;
    let maxCursor = 0;
    let lastStart = 0;

    for (const el of kids(measure)) {
      const tag = tagOf(el);
      if (tag === 'attributes') {
        const div = num(find(el, 'divisions'));
        if (div) divisions = div;
        const time = find(el, 'time');
        if (time) {
          timeNum = num(find(time, 'beats')) ?? timeNum;
          timeDen = num(find(time, 'beat-type')) ?? timeDen;
          raw.num = timeNum;
          raw.den = timeDen;
        }
        const key = find(el, 'key');
        if (key) {
          const mode = text(find(key, 'mode'));
          raw.key = {
            fifths: num(find(key, 'fifths')) ?? 0,
            mode: mode === 'major' || mode === 'minor' ? mode : null,
          };
        }
      } else if (tag === 'backup') {
        cursor -= (num(find(el, 'duration')) ?? 0) / divisions;
      } else if (tag === 'forward') {
        cursor += (num(find(el, 'duration')) ?? 0) / divisions;
        maxCursor = Math.max(maxCursor, cursor);
      } else if (tag === 'note') {
        const isChord = !!find(el, 'chord');
        const isGrace = !!find(el, 'grace');
        const isRest = !!find(el, 'rest');
        const isCue = !!find(el, 'cue');
        const dur = isGrace ? 0 : (num(find(el, 'duration')) ?? 0) / divisions;
        const start = isChord ? lastStart : cursor;
        if (!isChord && !isGrace) {
          lastStart = cursor;
          cursor += dur;
          maxCursor = Math.max(maxCursor, cursor);
        }
        if (isRest || isCue) continue;
        const pitch = find(el, 'pitch');
        if (!pitch) continue; // unpitched percussion
        const step = text(find(pitch, 'step')) ?? 'C';
        const p =
          (num(find(pitch, 'octave'))! + 1) * 12 +
          STEP[step]! +
          Math.round(num(find(pitch, 'alter')) ?? 0);
        const staff = num(find(el, 'staff')) ?? 1;
        const hand = staffToHand(staff);
        if (!hand) {
          errors.push(`Measure ${raw.label}: note on unexpected staff ${staff}`);
          continue;
        }
        const ties = findAll(el, 'tie').map((t) => attrs(t).type);
        const fingerText = text(path(el, 'notations', 'technical', 'fingering'));
        const finger = fingerText ? Number.parseInt(fingerText, 10) : Number.NaN;
        const note: RawNote = {
          p,
          o: isGrace ? Math.max(0, start - 0.125) : start,
          d: isGrace ? 0.125 : dur,
          h: hand,
          tieStart: ties.includes('start'),
          tieStop: ties.includes('stop'),
        };
        if (finger >= 1 && finger <= 5) note.f = finger;
        if (isGrace) note.g = 1;
        raw.notes.push(note);
      } else if (tag === 'direction' || tag === 'sound') {
        const sound = tag === 'sound' ? el : find(el, 'sound');
        const sa = attrs(sound);
        const offset = (num(find(el, 'offset')) ?? 0) / divisions;
        const at = Math.max(0, cursor + offset);
        if (sa.tempo && Number(sa.tempo) > 0) raw.tempos.push({ o: at, bpm: Number(sa.tempo) });
        if (sa.segno !== undefined) raw.flow.segno = true;
        if (sa.coda !== undefined) raw.flow.coda = true;
        if (sa.fine !== undefined) raw.flow.fine = true;
        if (sa.tocoda !== undefined) raw.flow.toCoda = true;
        if (sa.dacapo === 'yes') raw.flow.daCapo = true;
        if (sa.dalsegno !== undefined) raw.flow.dalSegno = true;
        for (const dt of findAll(el, 'direction-type')) {
          if (find(dt, 'segno')) raw.flow.segno = true;
          if (find(dt, 'coda')) raw.flow.coda = true;
          const pedal = find(dt, 'pedal');
          if (pedal) {
            const type = attrs(pedal).type;
            if (type === 'start') raw.pedal.push({ o: at, on: true });
            else if (type === 'stop') raw.pedal.push({ o: at, on: false });
            else if (type === 'change') raw.pedal.push({ o: at, on: false }, { o: at, on: true });
          }
          const rehearsal = text(find(dt, 'rehearsal'));
          if (rehearsal) raw.rehearsal = rehearsal;
          const words = (text(find(dt, 'words')) ?? '').toLowerCase().replace(/\s+/g, ' ');
          if (/^d\.? ?c\.?( |$)|da capo/.test(words)) raw.flow.daCapo = true;
          if (/^d\.? ?s\.?( |$)|dal segno/.test(words)) raw.flow.dalSegno = true;
          if (/\bto coda\b/.test(words)) raw.flow.toCoda = true;
          if (words === 'fine') raw.flow.fine = true;
        }
      } else if (tag === 'barline') {
        const repeat = find(el, 'repeat');
        if (repeat) {
          const ra = attrs(repeat);
          if (ra.direction === 'forward') raw.flow.repeatStart = true;
          if (ra.direction === 'backward') raw.flow.repeatEnd = Number(ra.times ?? 2) || 2;
        }
        const ending = find(el, 'ending');
        if (ending) {
          const ea = attrs(ending);
          if (ea.type === 'start') {
            openEndings = (ea.number ?? '1')
              .split(/[,\s]+/)
              .map(Number)
              .filter((v) => v > 0);
            raw.flow.endings = openEndings;
          } else {
            openEndings = undefined; // stop / discontinue: this measure still belongs to the volta
          }
        }
      }
    }

    raw.nominal = (raw.num * 4) / raw.den;
    raw.len = r6(maxCursor > 0 ? maxCursor : raw.nominal);
    out.push(raw);
  }
  return out;
}

export function importMusicXml(xml: string, opts: ImportOptions): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const doc = parser.parse(xml) as X[];
  const score = doc.find((n) => 'score-partwise' in n);
  if (!score) {
    if (doc.some((n) => 'score-timewise' in n))
      throw new Error('score-timewise MusicXML is not supported');
    throw new Error('Not a MusicXML score-partwise document');
  }

  const title =
    opts.title ??
    text(path(score, 'work', 'work-title')) ??
    text(find(score, 'movement-title')) ??
    opts.id;
  const composer =
    opts.composer ??
    text(
      findAll(find(score, 'identification'), 'creator').find((c) => attrs(c).type === 'composer'),
    ) ??
    '';

  const parts = findAll(score, 'part');
  if (parts.length === 0) throw new Error('Score has no parts');
  const staves = (part: X) => {
    let max = 1;
    for (const m of findAll(part, 'measure'))
      for (const a of findAll(m, 'attributes')) max = Math.max(max, num(find(a, 'staves')) ?? 1);
    return max;
  };

  let handsFromPitchSplit = false;
  let measures: RawMeasure[];
  const staffCounts = parts.map(staves);
  if (parts.length === 1 && staffCounts[0] === 2) {
    measures = parsePart(parts[0]!, (s) => (s === 1 ? 'R' : s === 2 ? 'L' : null), errors);
  } else if (parts.length === 2 && staffCounts.every((c) => c === 1)) {
    const right = parsePart(parts[0]!, () => 'R', errors);
    const left = parsePart(parts[1]!, () => 'L', errors);
    if (right.length !== left.length)
      throw new Error('The two parts have different measure counts');
    measures = right.map((m, i) => {
      const l = left[i]!;
      return {
        ...m,
        len: Math.max(m.len, l.len),
        notes: [...m.notes, ...l.notes],
        tempos: [...m.tempos, ...l.tempos],
        pedal: [...m.pedal, ...l.pedal],
      };
    });
  } else if (parts.length === 1 && staffCounts[0] === 1 && opts.splitAt !== undefined) {
    handsFromPitchSplit = true;
    warnings.push(`Hands assigned by pitch split at MIDI ${opts.splitAt}`);
    measures = parsePart(parts[0]!, () => 'R', errors);
    for (const m of measures) for (const n of m.notes) n.h = n.p < opts.splitAt ? 'L' : 'R';
  } else {
    throw new Error(
      `Cannot assign hands: ${parts.length} part(s) with staves [${staffCounts.join(', ')}]. ` +
        'Expected one part with two staves or two single-staff parts. Use --split <midi> as a last resort.',
    );
  }

  for (const m of measures) {
    if (!m.implicit && Math.abs(m.len - m.nominal) > 1e-3 && m.notes.length > 0)
      warnings.push(`Measure ${m.label}: length ${m.len} beats, time signature says ${m.nominal}`);
  }

  // Unroll repeats, voltas and jumps, then lay measures out on one timeline.
  const order = unrollMeasures(measures.map((m) => m.flow));
  if (order.length !== measures.length)
    warnings.push(`Repeats unrolled: ${measures.length} written measures → ${order.length} played`);

  const song: SongFile = {
    format: 1,
    id: opts.id,
    version: opts.version,
    title,
    composer,
    tempos: [],
    measures: [],
    notes: [],
    pedal: [],
    pedalSource: null,
    keys: [],
    sections: [],
    handsFromPitchSplit,
    warnings,
  };

  interface Placed extends SongNote {
    tieStart: boolean;
    tieStop: boolean;
  }
  const placed: Placed[] = [];
  let beat = 0;
  let lastKey = '';
  for (const idx of order) {
    const m = measures[idx]!;
    song.measures.push({ b: r6(beat), len: m.len, num: m.num, den: m.den, n: m.label });
    for (const t of m.tempos) song.tempos.push({ b: r6(beat + t.o), bpm: t.bpm });
    for (const p of m.pedal) song.pedal.push({ b: r6(beat + p.o), on: p.on });
    if (m.rehearsal) song.sections.push({ b: r6(beat), name: m.rehearsal });
    if (m.key) {
      const k = `${m.key.fifths}/${m.key.mode}`;
      if (k !== lastKey) song.keys.push({ b: r6(beat), ...m.key });
      lastKey = k;
    }
    for (const n of m.notes) {
      const note: Placed = {
        p: n.p,
        b: r6(beat + n.o),
        d: r6(n.d),
        h: n.h,
        tieStart: n.tieStart,
        tieStop: n.tieStop,
      };
      if (n.f) {
        note.f = n.f;
        note.fs = 'arranger';
      }
      if (n.g) note.g = 1;
      placed.push(note);
    }
    beat += m.len;
  }

  // Merge tied notes: a tie-stop note extends the sounding note of the same pitch and hand that ends where it starts.
  placed.sort((a, b) => a.b - b.b || a.p - b.p);
  const open = new Map<string, Placed>();
  let brokenTies = 0;
  for (const n of placed) {
    const key = `${n.h}${n.p}`;
    const prev = open.get(key);
    if (n.tieStop && prev && Math.abs(prev.b + prev.d - n.b) < 1e-3) {
      prev.d = r6(prev.d + n.d);
      if (!n.tieStart) open.delete(key);
      continue;
    }
    if (n.tieStop) brokenTies++;
    if (n.tieStart) open.set(key, n);
    else open.delete(key);
    const { tieStart: _s, tieStop: _e, ...clean } = n;
    song.notes.push(clean);
    if (n.tieStart) open.set(key, clean as Placed);
  }
  if (brokenTies)
    warnings.push(`${brokenTies} tie(s) had no matching start and were kept as separate notes`);

  if (song.tempos.length === 0) {
    song.tempos.push({ b: 0, bpm: 120 });
    warnings.push('No tempo in the source; defaulted to 120 BPM');
  }
  song.tempos.sort((a, b) => a.b - b.b);
  song.tempos = song.tempos.filter((t, i, arr) => i === 0 || t.bpm !== arr[i - 1]!.bpm);
  if (song.tempos[0]!.b > 0) song.tempos.unshift({ b: 0, bpm: song.tempos[0]!.bpm });
  song.pedal.sort((a, b) => a.b - b.b || Number(a.on) - Number(b.on));
  if (song.pedal.length) song.pedalSource = 'arranger';

  errors.push(...validateSong(song, opts.oneHand));
  return { song, errors };
}

/** Hard checks on a normalized song. Trims harmless same-pitch overlaps and records them as warnings. */
export function validateSong(song: SongFile, oneHand = false): string[] {
  const errors: string[] = [];
  if (song.notes.length === 0) errors.push('Song has no notes');
  const hands = new Set(song.notes.map((n) => n.h));
  if (song.notes.length && hands.size < 2 && !oneHand)
    errors.push(`Only the ${hands.has('R') ? 'right' : 'left'} hand has notes`);
  let trimmed = 0;
  const lastByKey = new Map<string, SongNote>();
  for (const n of song.notes) {
    if (!(n.p >= 21 && n.p <= 108))
      errors.push(`Pitch ${n.p} at beat ${n.b} is outside the 88-key range`);
    if (!(n.d > 0)) errors.push(`Note ${n.p} at beat ${n.b} has duration ${n.d}`);
    if (n.d > 64) errors.push(`Note ${n.p} at beat ${n.b} lasts ${n.d} beats`);
    if (n.b < 0) errors.push(`Note ${n.p} starts before the song (beat ${n.b})`);
    const key = `${n.h}${n.p}`;
    const prev = lastByKey.get(key);
    if (prev && prev.b + prev.d > n.b + 1e-6) {
      if (Math.abs(prev.b - n.b) < 1e-6)
        errors.push(`Duplicate note ${n.p} (${n.h}) at beat ${n.b}`);
      else {
        prev.d = Math.round((n.b - prev.b) * 1e6) / 1e6;
        trimmed++;
      }
    }
    lastByKey.set(key, n);
  }
  if (trimmed)
    song.warnings.push(
      `${trimmed} note(s) overlapped a later note of the same pitch and hand and were shortened`,
    );
  for (const t of song.tempos)
    if (!(t.bpm >= 10 && t.bpm <= 400)) errors.push(`Tempo ${t.bpm} BPM at beat ${t.b}`);
  for (let i = 1; i < song.measures.length; i++) {
    const a = song.measures[i - 1]!;
    if (Math.abs(a.b + a.len - song.measures[i]!.b) > 1e-3)
      errors.push(`Measure ${a.n} does not join the next one`);
  }
  return errors;
}
