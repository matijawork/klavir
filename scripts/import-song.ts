/**
 * Imports song sources into the normalized JSON the app reads.
 *
 *   node scripts/import-song.ts            # all songs
 *   node scripts/import-song.ts <slug>     # one song
 *   node scripts/import-song.ts <slug> --pdf   # also (re)generate sheet PDFs with MuseScore
 *
 * Input:  songs/<slug>/meta.json + source files.
 * Output: public/songs/<slug>/<version>.json, public/songs/<slug>/sheet-<version>.pdf, public/songs/index.json
 * Exits non-zero on any validation error.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chordId,
  keyFitsSignature,
  parseChord,
  parseKey,
  prettyChord,
} from '../src/engine/harmony.ts';
import { usesFlats } from '../src/engine/keys.ts';
import type { LibraryEntry, SongChecks, SongChord, SongFile } from '../src/engine/song.ts';
import { TempoMap } from '../src/engine/song.ts';
import { chordsOf } from './lib/chords.ts';
import {
  applyFingerMap,
  applyFingerPattern,
  applyTriadFingering,
  autoFinger,
  beatPedal,
  measurePedal,
} from './lib/fingering.ts';
import { guessMode } from './lib/key.ts';
import { importMidi } from './lib/midi.ts';
import { importMusicXml, readScoreXml } from './lib/musicxml.ts';
import { compareWithReference } from './lib/reference.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = join(root, 'songs');
const outDir = join(root, 'public', 'songs');

interface Meta {
  title: string;
  composer: string;
  difficulty: number;
  youtube: string | null;
  source: { url: string; license: string; notes?: string };
  versions: {
    id: string;
    label: string;
    file: string;
    splitAt?: number;
    oneHand?: boolean;
    /** MuseScore's MIDI export of the same score: every note is compared with it */
    reference?: string;
    /** known, explained differences from the reference, in plain words (shown in the app) */
    referenceNote?: string;
  }[];
  /** 'auto' (default) suggests fingering when the source has none; 'none' leaves it empty */
  fingering?: 'auto' | 'none';
  /** suggested pedal when the source has none: a change every measure, or every beat */
  pedal?: 'measure' | 'beat';
  /** in plain words: why there is no pedal, or why Claude added one (shown in the app) */
  pedalNote?: string;
  /** the key the app uses ("A♭ major") when Claude chose it; else the first key source's */
  key?: string;
  /** what named web pages say the key is (each must quote the page) */
  keySources?: (Source & { key: string })[];
  keyNote?: string;
  /** tempo Claude set because the score has none (from tempoSources) */
  tempo?: number;
  tempoSources?: (Source & { bpm: number })[];
  tempoNote?: string;
  /** chord charts on the web, compared with the chords counted from the file */
  chordSources?: (Source & { chords: string[] })[];
  /** in plain words: a difference between the charts and the file that Claude checked */
  chordsNote?: string;
  /** in plain words: where finger numbers were looked for (shown when none were found) */
  fingeringNote?: string;
  /** Claude's own fingering for a figure that keeps the hand in place (not from a source) */
  fingeringClaude?: { hand: 'L' | 'R'; map: Record<string, number>; note: string };
  /** finger numbers copied from a named source for repeating figures */
  fingeringSource?: Source & {
    patterns: { hand: 'L' | 'R'; notes: string[]; fingers: number[] }[];
  };
  /** the day Matija listened and said it sounds right (YYYY-MM-DD) */
  heard?: string;
}

interface Source {
  site: string;
  url: string;
  quote?: string;
  note?: string;
}

const pcOf = (name: string): number => {
  const t = parseChord(name);
  if (!t) throw new Error(`"${name}" is not a note name`);
  return t.root;
};

const MAJOR = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
function keyName(k: SongFile['keys'][number] | undefined): string {
  if (!k || k.fifths < -7 || k.fifths > 7) return 'Unknown';
  return k.mode === 'minor' ? `${MINOR[k.fifths + 7]} minor` : `${MAJOR[k.fifths + 7]} major`;
}

function importSong(slug: string, makePdf: boolean): LibraryEntry {
  const dir = join(songsDir, slug);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
  mkdirSync(join(outDir, slug), { recursive: true });
  let first: SongFile | undefined;
  let checks: SongChecks | undefined;
  let chords: SongChord[] = [];

  for (const v of meta.versions) {
    const src = join(dir, v.file);
    const isMidi = /\.(mid|midi)$/i.test(v.file);
    if (!isMidi && !/\.(mxl|musicxml|xml)$/i.test(v.file))
      throw new Error(`${slug}/${v.file}: unsupported source format`);
    const options = {
      id: slug,
      version: v.id,
      title: meta.title,
      composer: meta.composer,
      splitAt: v.splitAt,
      oneHand: v.oneHand,
    };
    const { song, errors } = isMidi
      ? importMidi(readFileSync(src), options)
      : importMusicXml(readScoreXml(readFileSync(src), v.file), options);
    for (const w of song.warnings) console.warn(`  warn  ${slug}/${v.id}: ${w}`);
    if (errors.length) {
      for (const e of errors.slice(0, 30)) console.error(`  ERROR ${slug}/${v.id}: ${e}`);
      throw new Error(`${slug}/${v.id}: ${errors.length} validation error(s)`);
    }
    const key = song.keys[0];
    let keyState: SongChecks['key'] = 'none';
    const chosen = meta.key ?? meta.keySources?.[0]?.key;
    if (key && chosen) {
      const named = parseKey(chosen);
      if (!named) throw new Error(`${slug}: key "${chosen}" is not a key name`);
      if (!keyFitsSignature(named, key.fifths))
        throw new Error(
          `${slug}: ${chosen} does not fit the file's key signature (${key.fifths} fifths)`,
        );
      key.mode = named.minor ? 'minor' : 'major';
      const said = (meta.keySources ?? []).map((k) => parseKey(k.key));
      const agree = said.filter((k) => k && k.tonic === named.tonic && k.minor === named.minor);
      keyState =
        agree.length >= 2 && agree.length > said.length - agree.length ? 'source' : 'claude';
    } else if (key && key.mode === null) {
      const until = song.keys[1]?.b ?? Number.POSITIVE_INFINITY;
      key.mode = guessMode(
        song.notes.filter((n) => n.b < until),
        key.fifths,
      );
      song.keyGuessed = true;
      keyState = 'guessed';
    } else if (key) keyState = 'score';
    // a test pattern of one or two note names has no key to speak of
    if (new Set(song.notes.map((n) => n.p % 12)).size < 3) keyState = 'none';
    const noTempo = song.warnings.some((w) => w.startsWith('No tempo in the source'));
    if (meta.tempo && !noTempo)
      throw new Error(
        `${slug}: the score has a tempo; "tempo" in meta.json is only for scores without one`,
      );
    const versionChecks: SongChecks = {
      hands: v.oneHand
        ? 'one'
        : song.handsFromPitchSplit
          ? 'split'
          : song.warnings.some((w) => w.includes('higher track was taken'))
            ? 'height'
            : 'score',
      tempo: !noTempo ? 'score' : meta.tempo ? 'claude' : 'default',
      bpm: meta.tempo && noTempo ? meta.tempo : song.tempos[0]!.bpm,
      ...(meta.tempoSources ? { tempoSources: meta.tempoSources } : {}),
      ...(meta.tempoNote ? { tempoNote: meta.tempoNote } : {}),
      key: keyState,
      ...(meta.keySources ? { keySources: meta.keySources } : {}),
      ...(meta.keyNote ? { keyNote: meta.keyNote } : {}),
      ...(meta.pedalNote ? { pedalNote: meta.pedalNote } : {}),
      ...(meta.chordsNote ? { chordsNote: meta.chordsNote } : {}),
      ...(meta.fingeringNote ? { fingeringNote: meta.fingeringNote } : {}),
    };
    if (key && keyState !== 'none') {
      const major = (((key.fifths * 7) % 12) + 12) % 12;
      const found = chordsOf(
        song,
        key.mode === 'minor'
          ? { tonic: (major + 9) % 12, minor: true }
          : { tonic: major, minor: false },
      );
      const mine = found.map(chordId);
      if (meta.chordSources?.length)
        versionChecks.charts = meta.chordSources.map((src) => {
          const listed = src.chords.map((c) => {
            const t = parseChord(c);
            if (!t) throw new Error(`${slug}: chord "${c}" (${src.site}) is not a chord name`);
            return chordId(t);
          });
          const { chords: written, ...page } = src;
          return {
            ...page,
            listed: written,
            same: mine.filter((c) => listed.includes(c)),
            onlySource: [...new Set(listed)].filter((c) => !mine.includes(c)),
            onlyFile: mine.filter((c) => !listed.includes(c)),
          };
        });
      if (!first) chords = found;
      console.log(
        `  chords ${slug}/${v.id}: ${found.map((c) => `${chordId(c)}×${c.count}`).join(' ')}` +
          (versionChecks.charts ?? [])
            .map(
              (c) =>
                ` | ${c.site}: same ${c.same.join(',')}, only there ${c.onlySource.join(',') || '-'}, only in file ${c.onlyFile.join(',') || '-'}`,
            )
            .join(''),
      );
    }
    if (v.reference) {
      const { song: midi, errors: midiErrors } = importMidi(readFileSync(join(dir, v.reference)), {
        id: slug,
        version: v.id,
        splitAt: v.splitAt,
        oneHand: v.oneHand,
      });
      if (midiErrors.length) throw new Error(`${slug}/${v.reference}: ${midiErrors[0]}`);
      const r = compareWithReference(song, midi);
      versionChecks.reference = {
        file: v.reference,
        ...r,
        ...(v.referenceNote ? { note: v.referenceNote } : {}),
      };
      console.log(
        `  check ${slug}/${v.id} vs ${v.reference}: ${r.matched} of ${r.of} notes match` +
          `${r.twins ? `, ${r.twins} same key in both hands` : ''}, ${r.extra} extra in the MIDI` +
          `${r.otherHand ? `, ${r.otherHand} in the other hand` : ''}` +
          `; pedal ${r.pedalMatched} of ${r.pedalOf} match (MIDI has ${midi.pedal.length})`,
      );
    }
    // a tempo Claude set (the score has none) applies after the comparison with MuseScore's MIDI
    if (meta.tempo && noTempo) song.tempos = [{ b: 0, bpm: meta.tempo }];
    const fromScore = song.notes.some((n) => n.f);
    if (meta.fingering !== 'none' && !fromScore) {
      autoFinger(song.notes);
      // chords played all at once: the inversion fingering of a named source
      const triads = applyTriadFingering(song.notes);
      if (triads)
        versionChecks.chordFingering = {
          site: 'pianoguidelessons.com',
          url: 'https://www.pianoguidelessons.com/?p=4136',
          quote: 'right hand 1-3-5, 1-2-5, 1-3-5; left hand 5-3-1, 5-3-1, 5-2-1',
          notes: triads,
        };
      if (meta.fingeringClaude) {
        const fc = meta.fingeringClaude;
        const map = new Map(Object.entries(fc.map).map(([n, f]) => [pcOf(n), f]));
        const n = applyFingerMap(song.notes, song.measures, fc.hand, map);
        versionChecks.claudeFingering = { note: fc.note, notes: n };
        console.log(`  finger ${slug}/${v.id}: ${n} notes by Claude's map`);
      }
      console.log(`  finger ${slug}/${v.id}: ${triads} chord notes from pianoguidelessons`);
    }
    if (meta.fingeringSource) {
      const fsrc = meta.fingeringSource;
      let covered = 0;
      const hands = new Set(fsrc.patterns.map((x) => x.hand));
      for (const x of fsrc.patterns)
        covered += applyFingerPattern(song.notes, x.hand, x.notes.map(pcOf), x.fingers);
      const { patterns, ...page } = fsrc;
      versionChecks.fingering = {
        ...page,
        patterns: patterns.map(
          (x) =>
            `${x.hand === 'R' ? 'right' : 'left'} hand ${x.notes.map(prettyChord).join('–')}: ${x.fingers.join('-')}`,
        ),
        notes: covered,
        of: song.notes.filter((n) => hands.has(n.h) && !n.g).length,
      };
      song.fingeringSource = {
        checked: false,
        text: `${fsrc.site} for ${covered} notes of the main figure; the rest computed by the app`,
      };
      console.log(`  finger ${slug}/${v.id}: ${covered} notes from ${fsrc.site}`);
    }
    checks ??= versionChecks;
    if (meta.pedal && song.pedal.length === 0) {
      song.pedal =
        meta.pedal === 'beat'
          ? beatPedal(song.measures, song.notes)
          : measurePedal(song.measures, song.notes);
      song.pedalSource = 'claude';
    }
    writeFileSync(join(outDir, slug, `${v.id}.json`), JSON.stringify(song));
    const fingered = song.notes.filter((n) => n.f).length;
    console.log(
      `  ok    ${slug}/${v.id}: ${song.notes.length} notes, ${song.measures.length} measures, ` +
        `${fingered} fingered, ${song.pedal.length} pedal events`,
    );
    first ??= song;

    const pdfSrc = join(dir, `sheet-${v.id}.pdf`);
    if (makePdf || !existsSync(pdfSrc)) {
      try {
        execFileSync('mscore', ['-o', pdfSrc, src], { stdio: 'ignore', timeout: 120_000 });
      } catch {
        console.warn(`  warn  ${slug}/${v.id}: MuseScore could not create the sheet PDF`);
      }
    }
    if (existsSync(pdfSrc)) copyFileSync(pdfSrc, join(outDir, slug, `sheet-${v.id}.pdf`));
  }

  const song = first!;
  const tempo = new TempoMap(song.tempos);
  const last = song.measures[song.measures.length - 1]!;
  return {
    id: slug,
    title: meta.title,
    composer: meta.composer,
    difficulty: meta.difficulty,
    key: keyName(song.keys[0]),
    versions: meta.versions.map((v) => ({ id: v.id, label: v.label })),
    youtube: meta.youtube,
    source: { url: meta.source.url, license: meta.source.license },
    durationSec: Math.round(tempo.toSeconds(last.b + last.len)),
    noteCount: song.notes.length,
    fingering: song.notes.find((n) => n.f)?.fs ?? null,
    pedal: song.pedal.length ? song.pedalSource : null,
    checks,
    ...(chords.length ? { chords } : {}),
    ...(meta.heard ? { heard: meta.heard } : {}),
    ...(usesFlats(song.keys) ? { flats: true as const } : {}),
  };
}

const args = process.argv.slice(2);
const makePdf = args.includes('--pdf');
const only = args.find((a) => !a.startsWith('--'));
const slugs = readdirSync(songsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(songsDir, d.name, 'meta.json')))
  .map((d) => d.name)
  .sort();
if (only && !slugs.includes(only)) {
  console.error(`No songs/${only}/meta.json`);
  process.exit(1);
}

const indexPath = join(outDir, 'index.json');
const index = new Map<string, LibraryEntry>();
if (only && existsSync(indexPath))
  for (const e of JSON.parse(readFileSync(indexPath, 'utf8')) as LibraryEntry[]) index.set(e.id, e);

let failed = false;
for (const slug of only ? [only] : slugs) {
  try {
    index.set(slug, importSong(slug, makePdf));
  } catch (e) {
    failed = true;
    console.error(`  FAIL  ${(e as Error).message}`);
  }
}
mkdirSync(outDir, { recursive: true });
const entries = [...index.values()]
  .filter((e) => slugs.includes(e.id))
  .sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
writeFileSync(indexPath, JSON.stringify(entries, null, 2));
console.log(`${entries.length} song(s) in the library index`);
process.exit(failed ? 1 : 0);
