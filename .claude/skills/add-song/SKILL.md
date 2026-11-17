---
name: add-song
description: Add a song to the Klavir library from a file Matija supplies (MusicXML .musicxml/.xml/.mxl, MuseScore .mscz, or MIDI .mid/.midi). Use when he sends a song file or asks to add a song.
---

# Add a song

Matija supplies the file. **Never write, arrange or "fix" the music yourself.** If a file cannot be imported faithfully, say exactly why and ask for a different file.

## Steps

1. **Slug**: lowercase, hyphens, e.g. `clocks`. Create `songs/<slug>/`.
2. **Copy the file** to `songs/<slug>/original.<ext>` (keep the extension).
   - `.mscz` → convert first: `mscore -o songs/<slug>/original.mxl <file>`.
   - `.mid` / `.midi` → imported directly (`"file": "original.mid"`). Prefer MusicXML when he has both: MIDI has no fingering, no repeats and no staves.
     - Hands come from two note tracks (or two channels). One track only → the import stops; ask him for a two-track file, or, only if he agrees, add `"splitAt": 60` (or `"oneHand": true` for a one-hand piece) to the version.
     - Warning "looks like a recorded performance": the file was played in, not written; measures and metronome will not line up. Tell him and ask for a score-based file.
     - Warning "the higher track was taken as the right hand": check in the app that the hands are the right way round.
   - **Also a `.mid` from the same page** (musescore.com gives .mxl, .mscz, .mid, .mp3, .pdf together): copy it to `songs/<slug>/reference.mid` and add `"reference": "reference.mid"` to the version. The import compares every note with it (that MIDI is what MuseScore plays) and the card's "What is checked" shows the result.
   - **Never copy the musescore.com PDF or MP3.** The PDF prints his e-mail on every page ("downloaded by …") and the repo is public. The importer makes its own sheet PDF.
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
   - `difficulty` 1–5: 1 = single notes, slow; 3 = both hands independent; 5 = fast, wide leaps. Your estimate; the app says so.
   - `source.url`: a web address if known (shown as a "Source" link), otherwise words such as "musescore.com, downloaded by Matija <date> (<title or arranger on the sheet>)". Never his e-mail.
   - `youtube`: the link Matija gave with the song (any YouTube form: `watch?v=`, `youtu.be/`, shorts). Otherwise `null`; he can also paste one himself in the app ("+ Video" on the card).
   - Single-staff score (no hand split): add `"splitAt": 60` to the version as a last resort and tell him.
4. **Import**: `npm run import-song <slug>`
   - It writes `public/songs/<slug>/original.json`, a sheet PDF (via MuseScore) and updates `public/songs/index.json`.
   - **Errors stop the import.** Do not work around them by editing notes. Report the message to Matija.
   - Read every warning: measure-length mismatches and unmatched ties usually mean a messy source.
   - Read the `check … vs reference.mid` line. Anything short of "N of N notes match, 0 extra" (notes missing only because both hands strike the same key are fine) needs a reason: find where they part (compare beats, measure by measure). Fix the importer if it misreads the score; if the difference is on MuseScore's side (e.g. its playback ignores a volta), write it in plain words as `"referenceNote"` on the version, so the app shows it.
   - No tempo in the score → 120 BPM, shown as not checked. No major/minor in the key signature → guessed from the notes, shown as not checked.
   - Read the `chords …` line: the chords counted from the notes (they make the card's "Keys" popup).
5a. **Named sources, several per item** (he wants each thing checked on more than one page; the card says "Checked by Claude" only with them). Search, then read each page itself (web-fetch) and quote only what it says. In meta.json:
   - `"keySources": [{ "key": "A♭ major", "site": "Musicnotes", "url": "…", "quote": "Original Published Key: Ab Major" }, …]`: write the key as "X major/minor" even when the page says only "E♭" (the quote keeps its words). Two or more agreeing and in the majority → checked; otherwise set `"key"` yourself and explain in `"keyNote"` (shown as "Added by Claude"). A key that does not fit the file's key signature stops the import.
   - `"tempoSources": [{ "bpm": 131, "site": "songbpm", "url": "…", "quote": "Tempo (BPM) 131" }]` and `"tempoNote"`. If the score has no tempo, `"tempo": 139` sets it (shown as "Added by Claude"); the MIDI comparison still uses the file as written.
   - `"chordSources": [{ "chords": ["Eb", "Bbm", "Fm"], "site": "ukebuddy", "url": "…", "quote": "…", "note": "how you read it, if it took reading" }]` (capo charts: move them to sounding pitch and say so) and `"chordsNote"` for a difference you checked note by note.
   - `"fingeringSource": { "site", "url", "quote", "patterns": [{ "hand": "R", "notes": ["Eb", "Bb", "G"], "fingers": [5, 2, 1] }] }` when a page gives finger numbers for a repeating figure: every run of that figure gets them (the library test checks the digits). Otherwise `"fingeringNote"`: where you looked.
   - No pedal in the score: decide whether the music wants it. `"pedal": "measure"` (change every measure) or `"beat"` (every beat, when the melody moves by step), and say why either way in `"pedalNote"`. A suggested pedal starts switched off in the player (his "Pedal" switch).
   - Fingering: chords played all at once get the inversion fingering automatically. For a figure that keeps the hand in place and has no source, `"fingeringClaude": { "hand": "R", "map": { "D": 1, "A": 5 }, "note": "…Claude's fingering, not from a page…" }` (applied to every measure that uses only those notes, at least four).
   - When Matija says it sounds right: `"heard": "YYYY-MM-DD"`. His YouTube link: `"youtube"`.
6. **Run** `npm test && npm run lint`.
7. **Commit and push** `songs/<slug>/` and `public/songs/` (push deploys).
8. **Tell Matija** in Croatian: what was added, what is checked and what is not (as the card's two lines say), warnings in plain words, and ask him to press **Listen** (in Practise) and tell you if it sounds right.

## Nothing else to build
The import is the whole job. The new song gets its library card with Practise and Perform, scoring, the progress chart, the note-by-note review, fingering chip, sheet link and video from `public/songs/index.json` automatically. Do not write song-specific code or tests.

## What the importer handles
Two staves or two single-staff parts as hands; chords; voices; ties; grace notes; staccato (half length); tempo changes; time and key signature changes; fingering; pedal marks; repeats, voltas (as many passes as the brackets say), D.C./D.S./Fine/Coda. Not played: fermatas (no pause), accents (no louder).

## Not yet
Easy (C major / A minor) transposed versions, adding suggested fingering or pedal.

## Optional meta.json fields
- `"fingering": "none"`: do not compute finger suggestions (default: computed when the source has none, marked `claude`).
- `"pedal": "measure"`: suggest one pedal change per measure when the source has no pedal marks. Only for pieces that are pedalled throughout; ask Matija if unsure.
