import { describe, expect, it } from 'vitest';
import { importMusicXml } from '../../scripts/lib/musicxml.ts';

const note = (step: string, octave: number, dur: number, staff: number, extra = '') =>
  `<note>${extra.includes('<chord/>') ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch>` +
  `<duration>${dur}</duration><staff>${staff}</staff>${extra.replace('<chord/>', '')}</note>`;

const score = (measures: string, staves = 2) => `<?xml version="1.0"?>
<score-partwise><work><work-title>Test</work-title></work>
<part id="P1">${measures.replace('<attributes>', `<attributes><staves>${staves}</staves>`)}</part></score-partwise>`;

const m1 = (body: string, attrs = '') =>
  `<measure number="1"><attributes><divisions>2</divisions><key><fifths>1</fifths><mode>major</mode></key>` +
  `<time><beats>4</beats><beat-type>4</beat-type></time>${attrs}</attributes>${body}</measure>`;

const opts = { id: 't', version: 'original' };

describe('importMusicXml', () => {
  it('reads two staves as two hands, with chords, backup and fingering', () => {
    const xml = score(
      m1(
        '<direction><sound tempo="90"/></direction>' +
          note(
            'C',
            5,
            4,
            1,
            '<notations><technical><fingering>1</fingering></technical></notations>',
          ) +
          note('E', 5, 4, 1, '<chord/>') +
          note('G', 5, 4, 1) +
          '<backup><duration>8</duration></backup>' +
          note('C', 3, 8, 2),
      ),
    );
    const { song, errors } = importMusicXml(xml, opts);
    expect(errors).toEqual([]);
    expect(song.title).toBe('Test');
    expect(song.tempos).toEqual([{ b: 0, bpm: 90 }]);
    expect(song.keys).toEqual([{ b: 0, fifths: 1, mode: 'major' }]);
    expect(song.measures).toEqual([{ b: 0, len: 4, num: 4, den: 4, n: '1' }]);
    expect(song.notes).toEqual([
      { p: 48, b: 0, d: 4, h: 'L' },
      { p: 72, b: 0, d: 2, h: 'R', f: 1, fs: 'arranger' },
      { p: 76, b: 0, d: 2, h: 'R' },
      { p: 79, b: 2, d: 2, h: 'R' },
    ]);
  });

  it('applies accidentals', () => {
    const sharp =
      '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>8</duration><staff>1</staff></note>';
    const xml = score(m1(`${sharp}<backup><duration>8</duration></backup>${note('C', 3, 8, 2)}`));
    expect(importMusicXml(xml, opts).song.notes.map((n) => n.p)).toEqual([48, 66]);
  });

  it('merges ties across measures', () => {
    const xml = score(
      m1(
        `${note('C', 5, 8, 1, '<tie type="start"/>')}<backup><duration>8</duration></backup>${note('C', 3, 8, 2)}`,
      ) +
        `<measure number="2">${note('C', 5, 4, 1, '<tie type="stop"/>')}${note('D', 5, 4, 1)}` +
        `<backup><duration>8</duration></backup>${note('G', 2, 8, 2)}</measure>`,
    );
    const { song, errors } = importMusicXml(xml, opts);
    expect(errors).toEqual([]);
    expect(song.notes.filter((n) => n.h === 'R')).toEqual([
      { p: 72, b: 0, d: 6, h: 'R' },
      { p: 74, b: 6, d: 2, h: 'R' },
    ]);
  });

  it('unrolls repeats onto one timeline', () => {
    const xml = score(
      m1(
        `${note('C', 5, 8, 1)}<backup><duration>8</duration></backup>${note('C', 3, 8, 2)}` +
          '<barline location="right"><repeat direction="backward"/></barline>',
      ),
    );
    const { song } = importMusicXml(xml, opts);
    expect(song.measures.map((m) => m.b)).toEqual([0, 4]);
    expect(song.notes.filter((n) => n.h === 'R').map((n) => n.b)).toEqual([0, 4]);
  });

  it('reads pedal marks', () => {
    const ped = (type: string) =>
      `<direction><direction-type><pedal type="${type}"/></direction-type></direction>`;
    const xml = score(
      m1(
        `${ped('start')}${note('C', 5, 4, 1)}${ped('change')}${note('D', 5, 4, 1)}${ped('stop')}` +
          `<backup><duration>8</duration></backup>${note('C', 3, 8, 2)}`,
      ),
    );
    const { song } = importMusicXml(xml, opts);
    expect(song.pedalSource).toBe('arranger');
    expect(song.pedal).toEqual([
      { b: 0, on: true },
      { b: 2, on: false },
      { b: 2, on: true },
      { b: 4, on: false },
    ]);
  });

  it('reports a missing hand', () => {
    const { errors } = importMusicXml(score(m1(note('C', 5, 8, 1))), opts);
    expect(errors.join()).toMatch(/Only the right hand/);
  });

  it('refuses a single staff unless a split point is given', () => {
    const xml = score(m1(note('C', 5, 4, 1) + note('C', 3, 4, 1)), 1);
    expect(() => importMusicXml(xml, opts)).toThrow(/Cannot assign hands/);
    const { song, errors } = importMusicXml(xml, { ...opts, splitAt: 60 });
    expect(errors).toEqual([]);
    expect(song.handsFromPitchSplit).toBe(true);
    expect(song.notes.map((n) => n.h)).toEqual(['R', 'L']);
  });

  it('reports out-of-range pitches', () => {
    const xml = score(
      m1(`${note('C', 9, 8, 1)}<backup><duration>8</duration></backup>${note('C', 3, 8, 2)}`),
    );
    expect(importMusicXml(xml, opts).errors.join()).toMatch(/outside the 88-key range/);
  });

  it('rejects non-MusicXML input', () => {
    expect(() => importMusicXml('<html></html>', opts)).toThrow(/Not a MusicXML/);
  });
});
