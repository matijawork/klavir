/**
 * Every song in the library, whatever it is: the files are there, both hands are present and the
 * right way round, and the comparison with MuseScore's MIDI export holds (or is explained).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkedCount, checklist } from '../../src/engine/checklist.ts';
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
      const rows = checklist(s, { fingering: false, ear: false });
      expect(rows.find((r) => r.id === 'ear')?.state).toBe('open');
      expect(checkedCount(rows).of).toBeGreaterThan(0);
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
      reference: { file: 'r.mid', of: 100, matched: 98, twins: 2, extra: 0, otherHand: 0 },
    },
  };

  it('says what is checked and what is not', () => {
    const rows = checklist(entry, { fingering: false, ear: false });
    const state = Object.fromEntries(rows.map((r) => [r.id, r.state]));
    expect(state).toEqual({
      notes: 'source',
      hands: 'source',
      tempo: 'source',
      key: 'open',
      fingering: 'open',
      pedal: 'source',
      ear: 'open',
    });
    expect(checkedCount(rows)).toEqual({ ok: 4, of: 7 });
    expect(rows[0]!.text).toMatch(/All 100 notes .* 2 of them are one key struck by both hands/);
  });

  it('counts the player’s own marks', () => {
    const rows = checklist(entry, { fingering: true, ear: true });
    expect(checkedCount(rows)).toEqual({ ok: 6, of: 7 });
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
      { ...entry, pedal: null, checks: undefined },
      { fingering: false, ear: false },
    );
    expect(rows.map((r) => r.id)).toEqual(['notes', 'fingering', 'pedal', 'ear']);
    expect(rows.find((r) => r.id === 'pedal')!.state).toBe('none');
    expect(checkedCount(rows)).toEqual({ ok: 0, of: 3 });
  });
});
