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
import { chordId, keyFitsSignature, parseChord, parseKey } from '../src/engine/harmony.ts';
import { usesFlats } from '../src/engine/keys.ts';
import type { LibraryEntry, SongChecks, SongChord, SongFile } from '../src/engine/song.ts';
import { TempoMap } from '../src/engine/song.ts';
import { chordsOf } from './lib/chords.ts';
import { autoFinger, measurePedal } from './lib/fingering.ts';
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
  /** 'measure' suggests one pedal change per measure when the source has no pedal marks */
  pedal?: 'measure';
  /** the key as a named web source gives it ("A♭ major"); must fit the file's key signature */
  keySource?: { key: string; site: string; url: string; note?: string };
  /** a chord chart on the web, compared with the chords counted from the file */
  chordSource?: { chords: string[]; site: string; url: string; note?: string };
  /** the day Matija listened and said it sounds right (YYYY-MM-DD) */
  heard?: string;
}

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
    if (key && meta.keySource) {
      const named = parseKey(meta.keySource.key);
      if (!named) throw new Error(`${slug}: keySource "${meta.keySource.key}" is not a key name`);
      if (!keyFitsSignature(named, key.fifths))
        throw new Error(
          `${slug}: ${meta.keySource.site} says ${meta.keySource.key}, which does not fit the file's key signature (${key.fifths} fifths)`,
        );
      key.mode = named.minor ? 'minor' : 'major';
    } else if (key && key.mode === null) {
      const until = song.keys[1]?.b ?? Number.POSITIVE_INFINITY;
      key.mode = guessMode(
        song.notes.filter((n) => n.b < until),
        key.fifths,
      );
      song.keyGuessed = true;
    }
    const versionChecks: SongChecks = {
      hands: v.oneHand
        ? 'one'
        : song.handsFromPitchSplit
          ? 'split'
          : song.warnings.some((w) => w.includes('higher track was taken'))
            ? 'height'
            : 'score',
      tempo: song.warnings.some((w) => w.startsWith('No tempo in the source'))
        ? 'default'
        : 'score',
      bpm: song.tempos[0]!.bpm,
      key: !key ? 'none' : meta.keySource ? 'source' : song.keyGuessed ? 'guessed' : 'score',
      ...(meta.keySource
        ? {
            keySource: {
              site: meta.keySource.site,
              url: meta.keySource.url,
              ...(meta.keySource.note ? { note: meta.keySource.note } : {}),
            },
          }
        : {}),
    };
    if (key) {
      const major = (((key.fifths * 7) % 12) + 12) % 12;
      const found = chordsOf(
        song,
        key.mode === 'minor'
          ? { tonic: (major + 9) % 12, minor: true }
          : { tonic: major, minor: false },
      );
      if (meta.chordSource) {
        const listed = meta.chordSource.chords.map((c) => {
          const t = parseChord(c);
          if (!t) throw new Error(`${slug}: chordSource "${c}" is not a chord name`);
          return chordId(t);
        });
        const mine = found.map(chordId);
        versionChecks.chords = {
          site: meta.chordSource.site,
          url: meta.chordSource.url,
          listed: meta.chordSource.chords,
          same: mine.filter((c) => listed.includes(c)),
          onlySource: [...new Set(listed)].filter((c) => !mine.includes(c)),
          onlyFile: mine.filter((c) => !listed.includes(c)),
          ...(meta.chordSource.note ? { note: meta.chordSource.note } : {}),
        };
      }
      if (!first) chords = found;
      console.log(
        `  chords ${slug}/${v.id}: ${found.map((c) => `${chordId(c)}×${c.count}`).join(' ')}` +
          (versionChecks.chords
            ? ` | ${versionChecks.chords.site}: same ${versionChecks.chords.same.join(',')}, only there ${versionChecks.chords.onlySource.join(',') || '-'}, only in file ${versionChecks.chords.onlyFile.join(',') || '-'}`
            : ''),
      );
    }
    if (v.reference) {
      const { song: midi, errors: midiErrors } = importMidi(readFileSync(join(dir, v.reference)), {
        id: slug,
        version: v.id,
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
    checks ??= versionChecks;
    if (meta.fingering !== 'none' && !song.notes.some((n) => n.f)) autoFinger(song.notes);
    if (meta.pedal === 'measure' && song.pedal.length === 0) {
      song.pedal = measurePedal(song.measures, song.notes);
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
