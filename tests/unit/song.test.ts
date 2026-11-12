import { describe, expect, it } from 'vitest';
import { isBlack, keyW, keyX, noteName, WHITE_W } from '../../src/engine/keys.ts';
import { loadSong, type SongFile, TempoMap } from '../../src/engine/song.ts';
import { Transport } from '../../src/engine/transport.ts';

describe('TempoMap', () => {
  it('converts at a constant tempo', () => {
    const t = new TempoMap([{ b: 0, bpm: 120 }]);
    expect(t.toSeconds(4)).toBeCloseTo(2);
    expect(t.toBeats(2)).toBeCloseTo(4);
  });

  it('respects tempo changes', () => {
    const t = new TempoMap([
      { b: 0, bpm: 120 },
      { b: 4, bpm: 60 },
    ]);
    expect(t.toSeconds(4)).toBeCloseTo(2);
    expect(t.toSeconds(6)).toBeCloseTo(4);
    expect(t.toBeats(4)).toBeCloseTo(6);
    expect(t.bpmAt(3.9)).toBe(120);
    expect(t.bpmAt(4)).toBe(60);
  });

  it('extends the first tempo back to beat 0', () => {
    const t = new TempoMap([{ b: 2, bpm: 60 }]);
    expect(t.toSeconds(1)).toBeCloseTo(1);
  });

  it('round-trips', () => {
    const t = new TempoMap([
      { b: 0, bpm: 90 },
      { b: 3, bpm: 140 },
      { b: 10, bpm: 72 },
    ]);
    for (const b of [0, 1.5, 3, 7.25, 10, 20]) expect(t.toBeats(t.toSeconds(b))).toBeCloseTo(b);
  });
});

describe('loadSong', () => {
  const file: SongFile = {
    format: 1,
    id: 't',
    version: 'original',
    title: 'T',
    composer: '',
    tempos: [{ b: 0, bpm: 60 }],
    measures: [{ b: 0, len: 4, num: 4, den: 4, n: '1' }],
    notes: [
      { p: 64, b: 1, d: 1, h: 'R', f: 3, fs: 'arranger' },
      { p: 48, b: 0, d: 2, h: 'L' },
    ],
    pedal: [{ b: 0, on: true }],
    pedalSource: 'arranger',
    keys: [],
    sections: [],
    handsFromPitchSplit: false,
    warnings: [],
  };

  it('sorts notes and converts to seconds', () => {
    const s = loadSong(file);
    expect([...s.pitch]).toEqual([48, 64]);
    expect([...s.start]).toEqual([0, 1]);
    expect([...s.end]).toEqual([2, 2]);
    expect([...s.hand]).toEqual([0, 1]);
    expect([...s.finger]).toEqual([0, 3]);
    expect(s.duration).toBe(4);
    expect(s.maxLen).toBe(2);
  });
});

describe('keyboard geometry', () => {
  it('names notes with middle C as C4', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(21)).toBe('A0');
    expect(noteName(108)).toBe('C8');
    expect(noteName(61, false)).toBe('C♯');
  });

  it('spans exactly 0..1 with 52 white keys', () => {
    expect(keyX[21]).toBeCloseTo(0);
    expect(keyX[108]! + keyW[108]!).toBeCloseTo(1);
    let whites = 0;
    for (let p = 21; p <= 108; p++) if (!isBlack(p)) whites++;
    expect(whites).toBe(52);
  });

  it('centres black keys on the boundary between white keys', () => {
    expect(keyX[61]! + keyW[61]! / 2).toBeCloseTo(keyX[60]! + WHITE_W);
  });
});

describe('Transport', () => {
  it('advances with wall time and rate', () => {
    const t = new Transport();
    t.duration = 100;
    t.seek(0, 1000);
    t.play(1000);
    expect(t.time(3000)).toBeCloseTo(2);
    t.setRate(0.5, 3000);
    expect(t.time(5000)).toBeCloseTo(3);
    expect(t.wallAt(4)).toBeCloseTo(7000);
    t.pause(5000);
    expect(t.time(9000)).toBeCloseTo(3);
  });

  it('clamps at the song end', () => {
    const t = new Transport();
    t.duration = 1;
    t.play(0);
    expect(t.time(5000)).toBe(1);
  });
});
