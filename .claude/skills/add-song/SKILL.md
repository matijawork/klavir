---
name: add-song
description: Add a song to the Klavir library from a file Matija supplies (MusicXML .musicxml/.xml/.mxl, MuseScore .mscz, or MIDI). Use when he sends a song file or asks to add a song.
---

# Add a song

Matija supplies the file. **Never write, arrange or "fix" the music yourself.** If a file cannot be imported faithfully, say exactly why and ask for a different file.

## Steps

1. **Slug**: lowercase, hyphens, e.g. `clocks`. Create `songs/<slug>/`.
2. **Copy the file** to `songs/<slug>/original.<ext>` (keep the extension).
   - `.mscz` → convert first: `mscore -o songs/<slug>/original.mxl <file>`.
   - `.mid` → not supported yet (planned for milestone 6). Ask for MusicXML, or convert with `mscore -o original.mxl file.mid` and check the hands carefully.
3. **Write `songs/<slug>/meta.json`**:
   ```json
   {
     "title": "Song title",
     "composer": "Artist or composer",
     "difficulty": 2,
     "youtube": null,
     "source": { "url": "where the file came from", "license": "as stated by the source, or 'unknown, supplied by Matija'" },
     "versions": [{ "id": "original", "label": "Original", "file": "original.mxl" }]
   }
   ```
   - `difficulty` 1–5: 1 = single notes, slow; 3 = both hands independent; 5 = fast, wide leaps.
   - `youtube`: one piano tutorial link, only if Matija gave one or you verified it resolves. Otherwise `null`.
   - Single-staff score (no hand split): add `"splitAt": 60` to the version as a last resort and tell him.
4. **Import**: `npm run import-song <slug>`
   - It writes `public/songs/<slug>/original.json`, a sheet PDF (via MuseScore) and updates `public/songs/index.json`.
   - **Errors stop the import.** Do not work around them by editing notes. Report the message to Matija.
   - Read every warning: measure-length mismatches and unmatched ties usually mean a messy source.
5. **Sanity check** the result: note count, measure count, both hands present, tempo plausible, key matches what the song is known to be in. Open `http://localhost:5173/klavir/#/play/<slug>/original` with `npm run dev` if in doubt.
6. **Run** `npm test && npm run lint`.
7. **Commit and push** `songs/<slug>/` and `public/songs/` (push deploys).
8. **Tell Matija** in Croatian: what was added, warnings in plain words, whether fingering and pedal were in the file, and ask him to press **Listen** in the app to check it by ear.

## What the importer handles
Two staves or two single-staff parts as hands; chords; voices; ties; grace notes; tempo changes; time and key signature changes; fingering; pedal marks; repeats, voltas, D.C./D.S./Fine/Coda.

## Not yet (milestone 6)
MIDI import, Easy (C major / A minor) transposed versions, adding suggested fingering or pedal.

## Optional meta.json fields
- `"fingering": "none"`: do not compute finger suggestions (default: computed when the source has none, marked `claude`).
- `"pedal": "measure"`: suggest one pedal change per measure when the source has no pedal marks. Only for pieces that are pedalled throughout; ask Matija if unsure.
