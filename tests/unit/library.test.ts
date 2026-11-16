/**
 * Every song in the library, whatever it is: the files are there, both hands are present and the
 * right way round, and the comparison with MuseScore's MIDI export holds (or is explained).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkedSplit, checklist } from '../../src/engine/checklist.ts';
import { buildExercise, EXERCISES } from '../../src/engine/exercises.ts';
import { learnList } from '../../src/engine/learn.ts';
import type { LibraryEntry, SongFile } from '../../src/engine/song.ts';

const dir = join(import.meta.dirname, '..', '..', 'public', 'songs');
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as LibraryEntry[];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('library', () => {
  for (const s of index)
    it(`${s.id}: files, hands, checks`, () => {
      const v = s.versions[0]!.id;
      const song = JSON.parse(readFileSync(join(dir, s.id, `${v}.json`), 'utf8')) as SongFile;
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
      const chart = s.checks?.chords;
      if (chart && !chart.note)
        expect(chart.onlyFile, 'every chord found is on the web chart').toEqual([]);
      const rows = checklist(s, { fingering: false, ear: false });
      const { yes, no } = checkedSplit(rows);
      expect(yes.length + no.length).toBeGreaterThan(0);
      // every "learn" link opens a real exercise
      for (const g of learnList(s).groups)
        for (const l of g.links) {
          const m = /^#\/exercise\/([a-z-]+)\/(\d+)(\/minor)?$/.exec(l.href);
          expect(m, l.href).not.toBeNull();
          expect(EXERCISES.some((e) => e.kind === m![1])).toBe(true);
          expect(
            buildExercise(m![1] as never, Number(m![2]), !!m![3]).notes.length,
          ).toBeGreaterThan(0);
        }
    });
});

describe('checklist', () => {
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
      { root: 9, minor: true, count: 10 },
      { root: 5, minor: false, count: 4 },
    ],
  };
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it('says by name what is checked and what is not', () => {
    const { yes, no } = checkedSplit(checklist(entry, { fingering: false, ear: false }));
    expect(ids(yes)).toEqual(['notes', 'hands', 'tempo', 'pedal']);
    expect(ids(no)).toEqual(['key', 'chords', 'fingering', 'ear']);
    const notes = checklist(entry, { fingering: false, ear: false })[0]!;
    expect(notes.text).toMatch(/All 100 notes .* \(2 times both hands have the same key/);
  });

  it('a key and chords from a named source count as checked; so does what Matija heard', () => {
    const sourced: LibraryEntry = {
      ...entry,
      heard: '2026-11-16',
      checks: {
        ...entry.checks!,
        key: 'source',
        keySource: { site: 'Musicnotes', url: 'https://example.com' },
        chords: {
          site: 'ukebuddy',
          url: 'https://example.com',
          listed: ['Am', 'F', 'G'],
          same: ['9m', '5'],
          onlySource: ['7'],
          onlyFile: [],
        },
      },
    };
    const rows = checklist(sourced, { fingering: true, ear: false });
    const { yes, no } = checkedSplit(rows);
    expect(ids(no)).toEqual([]);
    expect(ids(yes)).toContain('ear');
    expect(rows.find((r) => r.id === 'key')!.text).toMatch(/as Musicnotes gives it/);
    expect(rows.find((r) => r.id === 'chords')!.text).toMatch(
      /A minor, F major\. The chart on ukebuddy lists Am, F, G\. Never a full chord in your file: G major\./,
    );
    expect(rows.find((r) => r.id === 'pedal')!.text).toMatch(/4 times down and up/);
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
  it('the key first (scale, five-finger, progression), then each chord (arpeggio, inversions)', () => {
    const { groups } = learnList({
      id: 'x',
      title: 'X',
      composer: '',
      difficulty: 2,
      key: 'B♭ minor',
      flats: true,
      versions: [{ id: 'original', label: 'Original' }],
      youtube: null,
      source: { url: '', license: '' },
      durationSec: 1,
      noteCount: 1,
      fingering: null,
      pedal: null,
      chords: [
        { root: 10, minor: true, count: 9 },
        { root: 6, minor: false, count: 5 },
      ],
    });
    expect(groups.map((g) => g.title)).toEqual(['B♭ minor', 'B♭ minor', 'G♭ / F♯ major']);
    expect(groups[0]!.links.map((l) => l.href)).toEqual([
      '#/exercise/scale-minor/10',
      '#/exercise/five-finger/10/minor',
      '#/exercise/cadence/10/minor',
    ]);
    expect(groups[2]!.links.map((l) => l.href)).toEqual([
      '#/exercise/arpeggio/6',
      '#/exercise/chords/6',
    ]);
    expect(groups[1]!.detail).toBe('Chord in 9 measures.');
  });
});
