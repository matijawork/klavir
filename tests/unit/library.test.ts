/**
 * Every song in the library, whatever it is: the files are there, both hands are present and the
 * right way round, the comparison with MuseScore's MIDI export holds (or is explained), sources
 * fit, finger numbers copied from a source are really there, and every practice link works.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkedSplit, checklist } from '../../src/engine/checklist.ts';
import { buildExercise, EXERCISES } from '../../src/engine/exercises.ts';
import { parseChord, parseKey } from '../../src/engine/harmony.ts';
import { learnList } from '../../src/engine/learn.ts';
import type { LibraryEntry, SongFile } from '../../src/engine/song.ts';

const root = join(import.meta.dirname, '..', '..');
const dir = join(root, 'public', 'songs');
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as LibraryEntry[];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('library', () => {
  for (const s of index)
    it(`${s.id}: files, hands, checks, sources, practice links`, () => {
      const v = s.versions[0]!.id;
      const song = JSON.parse(readFileSync(join(dir, s.id, `${v}.json`), 'utf8')) as SongFile;
      const meta = JSON.parse(readFileSync(join(root, 'songs', s.id, 'meta.json'), 'utf8'));
      expect(existsSync(join(dir, s.id, `sheet-${v}.pdf`))).toBe(true);
      expect(song.notes.length).toBe(s.noteCount);
      const right = song.notes.filter((n) => n.h === 'R').map((n) => n.p);
      const left = song.notes.filter((n) => n.h === 'L').map((n) => n.p);
      if (s.checks?.hands !== 'one') {
        expect(left.length).toBeGreaterThan(0);
        expect(right.length).toBeGreaterThan(0);
        expect(mean(right), 'right hand plays higher than the left').toBeGreaterThan(mean(left));
      }
      for (const n of song.notes) {
        expect(n.p).toBeGreaterThanOrEqual(21);
        expect(n.p).toBeLessThanOrEqual(108);
        expect(n.d).toBeGreaterThan(0);
      }
      const ref = s.checks?.reference;
      if (ref && !ref.note) {
        expect(ref.matched + ref.twins, 'every note as in MuseScore playback').toBe(ref.of);
        expect(ref.extra).toBe(0);
      }
      if (ref) expect(ref.pedalMatched, 'every pedal mark as in MuseScore').toBe(ref.pedalOf);
      // every chord found is on at least one chart, unless the difference is explained
      if (s.checks?.charts?.length && !s.checks.chordsNote)
        for (const ch of s.chords ?? [])
          expect(
            s.checks.charts.some((c) => c.same.includes(`${ch.root}${ch.minor ? 'm' : ''}`)),
            `${s.id}: chord ${ch.root}${ch.minor ? 'm' : ''} on a chart`,
          ).toBe(true);
      // every web source quotes its page; key and chord names read
      for (const src of [
        ...(meta.keySources ?? []),
        ...(meta.tempoSources ?? []),
        ...(meta.chordSources ?? []),
      ]) {
        expect(src.url).toMatch(/^https:\/\//);
        expect(src.quote?.length ?? 0, `${src.site} quotes the page`).toBeGreaterThan(3);
      }
      for (const k of meta.keySources ?? []) expect(parseKey(k.key), k.key).not.toBeNull();
      for (const c of meta.chordSources ?? [])
        for (const name of c.chords) expect(parseChord(name), name).not.toBeNull();
      // finger numbers copied from a source: every pattern note carries the source's finger
      for (const p of meta.fingeringSource?.patterns ?? []) {
        const pcs = p.notes.map((n: string) => parseChord(n)!.root);
        // single notes only: chords played all at once have their own (inversion) fingering
        const alone = (n: SongFile['notes'][number]) =>
          !song.notes.some((m) => m !== n && m.h === n.h && Math.abs(m.b - n.b) < 1e-6);
        const hits = song.notes.filter(
          (n) => n.h === p.hand && n.fs === 'verified' && pcs.includes(n.p % 12) && alone(n),
        );
        expect(hits.length, `${p.notes.join('-')} found`).toBeGreaterThan(0);
        for (const n of hits) expect(n.f).toBe(p.fingers[pcs.indexOf(n.p % 12)]);
      }
      // keys struck together by one hand: a finger each, and an octave only with 1-5 or 1-4
      const together = new Map<string, SongFile['notes']>();
      for (const n of song.notes) {
        if (!n.f || n.g) continue;
        const k = `${n.h}${n.b}`;
        together.set(k, [...(together.get(k) ?? []), n]);
      }
      for (const g of together.values()) {
        if (g.length < 2) continue;
        const where = `${s.id}: ${g[0]!.h} at beat ${g[0]!.b}`;
        expect(new Set(g.map((n) => n.f)).size, `${where}: one finger per key`).toBe(g.length);
        const low = g.reduce((a, b) => (b.p < a.p ? b : a));
        const high = g.reduce((a, b) => (b.p > a.p ? b : a));
        if (high.p - low.p >= 12) {
          const outer = g[0]!.h === 'R' ? [low.f, high.f] : [high.f, low.f];
          expect(outer[0], `${where}: thumb on the octave`).toBe(1);
          expect(outer[1]!, `${where}: 4 or 5 on the octave`).toBeGreaterThanOrEqual(4);
        }
      }
      // the card always says something
      const g = checkedSplit(checklist(s, { fingering: false, ear: false }));
      expect(g.claude.length + g.you.length + g.added.length + g.no.length).toBeGreaterThan(0);
      // every practice link opens a real exercise
      for (const grp of learnList(s))
        for (const l of grp.links) {
          const m = /^#\/exercise\/([a-z-]+)\/(\d+)(\/minor)?$/.exec(l.href);
          expect(m, l.href).not.toBeNull();
          expect(EXERCISES.some((e) => e.kind === m![1])).toBe(true);
          expect(
            buildExercise(m![1] as never, Number(m![2]), !!m![3]).notes.length,
          ).toBeGreaterThan(0);
        }
    });
});

const entry: LibraryEntry = {
  id: 'x',
  title: 'X',
  composer: '',
  difficulty: 2,
  key: 'A minor',
  versions: [{ id: 'original', label: 'Original' }],
  youtube: null,
  source: { url: 'https://example.com', license: 'test' },
  durationSec: 10,
  noteCount: 100,
  fingering: 'claude',
  pedal: 'arranger',
  checks: {
    hands: 'score',
    tempo: 'score',
    bpm: 100,
    key: 'guessed',
    reference: {
      file: 'r.mid',
      of: 100,
      matched: 98,
      twins: 2,
      extra: 0,
      otherHand: 0,
      pedalOf: 8,
      pedalMatched: 8,
    },
  },
  chords: [
    { root: 9, minor: true, count: 10, left: { style: 'broken', tones: [9, 0, 4] } },
    { root: 5, minor: false, count: 4, right: { style: 'block', tones: [9, 0, 5] } },
  ],
};
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('checklist', () => {
  it('says by name what Claude checked, what Claude added and what nobody checked', () => {
    const rows = checklist(entry, { fingering: false, ear: false });
    const g = checkedSplit(rows);
    expect(ids(g.claude)).toEqual(['notes', 'hands', 'tempo', 'pedal']);
    expect(ids(g.added)).toEqual(['key', 'fingering']);
    expect(ids(g.no)).toEqual(['chords', 'ear']);
    expect(rows[0]!.text).toMatch(/Claude compared all 100 notes .* \(2 times both hands/);
    expect(rows.find((r) => r.id === 'pedal')!.text).toMatch(/4 times down and up/);
  });

  it('named sources: agreeing pages check the key, a chosen key is Claude’s; copied fingering is split', () => {
    const sourced: LibraryEntry = {
      ...entry,
      heard: '2026-11-16',
      checks: {
        ...entry.checks!,
        key: 'source',
        keySources: [
          { key: 'A minor', site: 'Musicnotes', url: 'https://a', quote: 'q' },
          { key: 'A minor', site: 'Hooktheory', url: 'https://b', quote: 'q' },
        ],
        tempoSources: [{ bpm: 96, site: 'Hooktheory', url: 'https://b', quote: 'q' }],
        charts: [
          {
            site: 'ukebuddy',
            url: 'https://c',
            listed: ['Am', 'F', 'G'],
            same: ['9m', '5'],
            onlySource: ['7'],
            onlyFile: [],
          },
        ],
        fingering: {
          site: 'Artie',
          url: 'https://d',
          patterns: ['right hand E♭–B♭–G: 5-2-1'],
          notes: 40,
          of: 90,
        },
      },
    };
    const rows = checklist(sourced, { fingering: false, ear: false });
    const g = checkedSplit(rows);
    expect(ids(g.claude)).toEqual([
      'notes',
      'hands',
      'tempo',
      'key',
      'chords',
      'fingering-source',
      'pedal',
    ]);
    expect(ids(g.you)).toEqual(['ear']);
    expect(ids(g.added)).toEqual(['fingering']);
    expect(rows.find((r) => r.id === 'key')!.text).toMatch(
      /Musicnotes A minor · Hooktheory A minor/,
    );
    expect(rows.find((r) => r.id === 'tempo')!.text).toMatch(/The pages say: Hooktheory 96/);
    expect(rows.find((r) => r.id === 'chords')!.text).toMatch(
      /A minor, F major\. Compared with chord charts: ukebuddy: Am F G \(not a full chord in your file: G major\)\./,
    );
    expect(rows.find((r) => r.id === 'fingering-source')!.text).toMatch(
      /Copied from Artie for 40 of 90/,
    );
    const chosen = checklist(
      { ...sourced, checks: { ...sourced.checks!, key: 'claude' } },
      { fingering: false, ear: false },
    );
    expect(chosen.find((r) => r.id === 'key')).toMatchObject({ state: 'claude' });
    expect(chosen.find((r) => r.id === 'key')!.text).toMatch(/chosen by Claude/);
  });

  it('a tempo Claude set is Claude’s, not checked', () => {
    const rows = checklist(
      { ...entry, checks: { ...entry.checks!, tempo: 'claude', bpm: 139 } },
      { fingering: false, ear: false },
    );
    expect(rows.find((r) => r.id === 'tempo')).toMatchObject({
      state: 'claude',
      text: expect.stringMatching(/^Set by Claude to 139/),
    });
  });

  it('does not call a mismatch checked unless it is explained', () => {
    const bad = {
      ...entry,
      checks: {
        ...entry.checks!,
        reference: { ...entry.checks!.reference!, matched: 80, twins: 0, extra: 20 },
      },
    };
    expect(checklist(bad, { fingering: false, ear: false })[0]).toMatchObject({
      state: 'open',
      text: "Only 80 of 100 notes are the same as MuseScore's own playback of your file.",
    });
    const explained = {
      ...bad,
      checks: { ...bad.checks, reference: { ...bad.checks.reference, note: 'Repeat once more.' } },
    };
    expect(checklist(explained, { fingering: false, ear: false })[0]!.state).toBe('source');
  });

  it('leaves out what the song does not have', () => {
    const rows = checklist(
      { ...entry, pedal: null, checks: undefined, chords: undefined },
      { fingering: false, ear: false },
    );
    expect(ids(rows)).toEqual(['notes', 'fingering', 'pedal', 'ear']);
    expect(rows.find((r) => r.id === 'pedal')!.state).toBe('none');
  });
});

describe('learnList', () => {
  it('the key first, then each chord with how the song plays it and the exercise for that', () => {
    const groups = learnList({
      ...entry,
      key: 'B♭ minor',
      flats: true,
      checks: { ...entry.checks!, key: 'score' },
      chords: [
        { root: 10, minor: true, count: 9, left: { style: 'single', tones: [10] } },
        {
          root: 6,
          minor: false,
          count: 5,
          right: { style: 'broken', tones: [1, 6, 10] },
          left: { style: 'block', tones: [6, 1] },
        },
      ],
    });
    expect(groups.map((g) => g.title)).toEqual(['B♭ minor', 'B♭ minor', 'G♭ / F♯ major']);
    expect(groups[0]!.links.map((l) => l.href)).toEqual([
      '#/exercise/scale-minor/10',
      '#/exercise/five-finger/10/minor',
      '#/exercise/cadence/10/minor',
    ]);
    expect(groups[1]!.detail).toBe('Chord in 9 measures. Left hand: the bass note B♭.');
    expect(groups[2]!.detail).toBe(
      'Chord in 5 measures. Left hand: all at once: G♭ and D♭ (no third). Right hand: one note after another, second inversion (low to high: D♭–G♭–B♭).',
    );
    expect(groups[2]!.links).toEqual([
      { label: 'Arpeggio', href: '#/exercise/arpeggio/6', main: true },
      { label: 'Inversions', href: '#/exercise/chords/6', main: true },
    ]);
  });

  it('says how the Scale (harmonic minor) differs from what a minor song plays', () => {
    const minorSong = (chords: { root: number; minor: boolean }[]) =>
      learnList({
        ...entry,
        key: 'A minor',
        flats: undefined,
        checks: { ...entry.checks!, key: 'score' },
        chords: chords.map((c) => ({ ...c, count: 3 })),
      })[0]!.detail;
    // Interstellar: E minor, so G and never G♯
    expect(
      minorSong([
        { root: 4, minor: true },
        { root: 9, minor: true },
      ]),
    ).toBe(
      'The key of the song: written in the score. Scale is the harmonic minor scale, which raises the 7th note to G♯; this song plays G instead (its E chord is minor).',
    );
    expect(minorSong([{ root: 4, minor: false }])).toMatch(
      /its 7th note is raised \(G♯\), as in this song's E major chord\.$/,
    );
    expect(minorSong([])).toMatch(/its 7th note is raised \(G♯\)\.$/);
    // B♭ minor in flats: A is the raised 7th, A♭ the plain one
    expect(
      learnList({
        ...entry,
        key: 'B♭ minor',
        flats: true,
        checks: { ...entry.checks!, key: 'score' },
        chords: [{ root: 5, minor: true, count: 3 }],
      })[0]!.detail,
    ).toMatch(/raises the 7th note to A; this song plays A♭ instead \(its F chord is minor\)\.$/);
    expect(
      learnList({ ...entry, key: 'C major', checks: { ...entry.checks!, key: 'score' } })[0]!
        .detail,
    ).toMatch(/Its scale has the notes the song is built on\.$/);
  });

  it('a test pattern without a key has nothing to practise', () => {
    expect(learnList({ ...entry, checks: { ...entry.checks!, key: 'none' } })).toEqual([]);
  });
});
