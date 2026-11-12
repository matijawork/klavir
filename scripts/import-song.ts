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
import type { LibraryEntry, SongFile } from '../src/engine/song.ts';
import { TempoMap } from '../src/engine/song.ts';
import { autoFinger, measurePedal } from './lib/fingering.ts';
import { importMusicXml, readScoreXml } from './lib/musicxml.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = join(root, 'songs');
const outDir = join(root, 'public', 'songs');

interface Meta {
  title: string;
  composer: string;
  difficulty: number;
  youtube: string | null;
  source: { url: string; license: string; notes?: string };
  versions: { id: string; label: string; file: string; splitAt?: number; oneHand?: boolean }[];
  /** 'auto' (default) suggests fingering when the source has none; 'none' leaves it empty */
  fingering?: 'auto' | 'none';
  /** 'measure' suggests one pedal change per measure when the source has no pedal marks */
  pedal?: 'measure';
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

  for (const v of meta.versions) {
    const src = join(dir, v.file);
    if (!/\.(mxl|musicxml|xml)$/i.test(v.file))
      throw new Error(`${slug}/${v.file}: unsupported source format`);
    const xml = readScoreXml(readFileSync(src), v.file);
    const { song, errors } = importMusicXml(xml, {
      id: slug,
      version: v.id,
      title: meta.title,
      composer: meta.composer,
      splitAt: v.splitAt,
      oneHand: v.oneHand,
    });
    for (const w of song.warnings) console.warn(`  warn  ${slug}/${v.id}: ${w}`);
    if (errors.length) {
      for (const e of errors.slice(0, 30)) console.error(`  ERROR ${slug}/${v.id}: ${e}`);
      throw new Error(`${slug}/${v.id}: ${errors.length} validation error(s)`);
    }
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
