# Research log

Checked 2026-11-11. Tags: **[V]** verified against a primary source that day, **[S]** secondary source only, **[U]** not verified (memory or inference) — test before relying on it.

Local machine: Node v22.22.2, npm 10.9.7, git 2.54, gh 2.91 (logged in). Not installed: MuseScore, Java, firebase-tools, pnpm.

## 1. Contradictions with the brief

| # | Brief says | Research says | Proposed fix |
|---|---|---|---|
| 1 | Songs live in the public repo and are served from Pages | No free, legitimate MusicXML/MIDI exists for any of the 7 songs. Self-made arrangements are derivative works; GitHub has DMCA precedents for single self-made transcriptions on personal Pages sites | ADR-002: code public, song data private. Needs Matija's OK |
| 2 | Source order: free MusicXML → free MIDI → self-arrange | Steps 1 and 2 yield nothing usable for these songs | All 7 are Claude-arranged; fingering/pedal provenance = "Claude suggested" |
| 3 | Schedule MIDI out with `output.send(data, timestamp)`; all-notes-off on stop | `MIDIOutput.clear()` is not implemented in Chrome, so scheduled messages cannot be cancelled | Look-ahead scheduler (~100 ms window) + panic on stop |
| 4 | Suggested `@tonejs/midi` | No release since 2022-02; thin wrapper over `midi-file` | Use `midi-file` at build time |
| 5 | Evaluate Sightread / MIDIano for reuse | Sightread: GPL-3.0, frozen, renderer coupled to its player. MIDIano: no license, "not open source" | Ideas only, no code copied; project stays MIT |
| 6 | Tablet: "USB mode set to MIDI" | That setting is for the tablet acting as a MIDI peripheral; with the interface attached the tablet is USB host [U] | Test on the device; no setting assumed |
| 7 | Sign-in (method unspecified) | `signInWithRedirect` cannot work on a github.io project site | `signInWithPopup` from a click handler |

## 2. Web MIDI in Chrome (stable = 157)

- [V] All Web MIDI access needs a permission prompt since Chrome 124, not only SysEx. Secure context required. Permissions-Policy `midi` defaults to `'self'`, so no header needed. https://developer.chrome.com/blog/web-midi-permission-prompt
- [V] `MIDIMessageEvent.timeStamp` is a `DOMHighResTimeStamp` on the `performance.now()` base. On macOS it comes from the CoreMIDI packet timestamp, i.e. driver time, not JS dispatch time. https://github.com/chromium/chromium/blob/main/media/midi/midi_manager_mac.cc
- [V] Timer coarsening is 100 µs without cross-origin isolation; irrelevant for piano timing. [U] whether MIDI timestamps pass through the same clamp.
- [V] `send(data, timestamp)` on macOS passes the timestamp to CoreMIDI, which schedules it. Once sent it cannot be retracted.
- [V] On Android `send` with a timestamp is a delayed task in the browser process: timer-level jitter, not hardware scheduling. https://github.com/chromium/chromium/blob/main/media/midi/midi_manager_android.cc
- [V] `MIDIOutput.clear()` is not implemented (`// TODO … implement void clear()` in the IDL). https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/webmidi/midi_output.idl
- [V] `statechange` works on desktop and Android. [S] After some Chrome updates devices fail to reconnect until Chrome is fully quit. https://help.morningstar.io/en/article/web-midi-issues-after-a-chrome-update-release-l4yu91/
- [S] Chrome 152 broke SysEx output, fixed in 153. We send no SysEx.
- [V] Android: supported; if the device lacks the system MIDI feature Chrome returns zero ports with no error. [S] one report of 15–30 ms jitter bursts after long idle.
- [V] iOS: no Web MIDI in any browser. https://bugs.webkit.org/show_bug.cgi?id=107250 , https://caniuse.com/midi
- No authoritative measurement of `send()` accuracy was found. We measure it ourselves in M2.

## 3. Display, wake lock, PWA

- [S] Chrome runs rAF at 120 Hz on ProMotion MacBooks. [S] macOS Low Power Mode caps it at 60 Hz. Animation is driven by timestamps, never frame counts; real rate is measured at startup.
- [V] Canvas `desynchronized: true` has no effect in Chrome on macOS. Not used.
- [V] Screen Wake Lock: Chrome 84+, released when the tab is hidden, so re-request on `visibilitychange`; can be refused. https://developer.chrome.com/docs/capabilities/web-apis/wake-lock
- [V] PWA install needs only a manifest (name, 192/512 icons, start_url, display); service worker only for offline. https://web.dev/articles/install-criteria
- [S] Service worker scope cannot be widened on Pages; `sw.js` at site root, relative registration, manifest `start_url` and `scope` = `./`.

## 4. Firebase Spark

- [V] Firestore: 1 GiB stored, 50k reads/day, 20k writes/day, 20k deletes/day, 1 MiB per document, 10 MiB per request, one free database per project. https://firebase.google.com/docs/firestore/quotas
- [V] Cloud Storage requires Blaze since 2026-02-03. https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- [V] Offline cache is off by default on web; enabled with `persistentLocalCache` + `persistentMultipleTabManager`.
- [V] `signInWithRedirect` needs Firebase Hosting, a reverse proxy or root-level helper files; none possible on a github.io project site. Use `signInWithPopup`. https://firebase.google.com/docs/auth/web/redirect-best-practices
- [U] Google sign-in on Spark and the authorized-domain step (`<user>.github.io`) were not confirmed on an official page; confirm in M7.
- SDK version: the two research passes disagree (13.2.0 vs 13.3.0). Pin whatever `npm view firebase version` returns at install.
- Alternatives: Supabase free pauses projects after 7 idle days [V]; Cloudflare needs a self-written API and auth; PocketBase needs a server. Firebase stays.

## 5. GitHub Pages

- [V] Site ≤ 1 GB, 100 GB/month soft bandwidth, 10-minute deploy timeout. https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- [V] Deploy via Actions: permissions `contents: read`, `pages: write`, `id-token: write`; environment `github-pages`.
- [V] Latest action majors: checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5.
- All `<user>.github.io/*` sites share one origin, so IndexedDB names, cache names and storage keys are prefixed for this app.
- Hash routing; no 404.html trick.

## 6. Stack versions (npm / GitHub API)

| Package | Version | License | Note |
|---|---|---|---|
| vite | 8.3.8 | MIT | Node ≥ 22.12 ok |
| typescript | 7.0.2 | Apache-2.0 | typescript-eslint caps at < 6.1, so Biome |
| @biomejs/biome | 2.6.7 | MIT / Apache-2.0 | |
| vitest | 5.1.0 | MIT | |
| @playwright/test | 1.65.0 | Apache-2.0 | `grantPermissions(['midi','midi-sysex'])` documented, not yet run [U] |
| vite-plugin-pwa | 2.0.0 | MIT | supports Vite 8 |
| preact | 11.2.0 | MIT | 11.0 is six weeks old; 10.x is the fallback |
| @preact/signals | 2.11.4 | MIT | |
| idb | 8.0.4 | ISC | |
| tonal | 6.5.1 | MIT | `Chord.detect` yes; key detection no |
| midi-file | 1.2.4 | MIT | build time only |
| fast-xml-parser | 5.12.0 | MIT | build time only |
| MuseScore Studio | 4.7.6 | GPL-3.0, external tool | `brew install --cask musescore`; not installed, CLI behaviour untested [U] |

Rendering performance has not been benchmarked; the Canvas 2D choice is an engineering judgment to be confirmed by measurement in M1.

## 7. Existing apps

| Project | License | Verdict |
|---|---|---|
| sightread/sightread | GPL-3.0, development moved private 2026-03-04 | Ideas only: viewport model, piano geometry, wait mode |
| Bewelge/MIDIano | none, "not open source" | Do not copy |
| Neothesia, PianoBooster, Orfeo | GPL-3.0 | Ideas only |
| quickiano, doinu, keyline, signal | MIT | Reading material; code quality not assessed |

## 8. Songs

Chords derived from Hooktheory roman numerals, cross-checked with Wikipedia where stated. Difficulty and Easy keys are suggestions.

| Song | Key | BPM | Modulation | Easy version |
|---|---|---|---|---|
| Interstellar main theme | A minor | 67–100 by arrangement, 3/4 or 6/8 | none | not needed |
| L'amour toujours | D major (alt. B minor) | ~139 | none | C major |
| Someone You Loved | D♭ major | 110 | none | C major |
| Faded | E♭ minor | 90 | none | A minor |
| Love Story | D major | 119–120 | final chorus E major | C major → D major |
| Clocks | E♭ Mixolydian | 131 | bridge D♭ major | G Mixolydian |
| Viva la Vida | A♭ major | 138 | none | C major |

- Sources: Hooktheory TheoryTab pages per song, Wikipedia song articles.
- Legal: MuseScore free accounts download only public-domain and original works; PRO downloads are not redistributable. BitMidi/FreeMidi files are unlicensed band sequences with no hand split. MuseScore per-song pages returned 403 to automated access and were not inspected.
- DMCA precedents: https://github.com/github/dmca/blob/master/2022/03/2022-03-29-terentyev-music-publishing-company.md , https://github.com/github/dmca/blob/master/2026/01/2026-01-09-musescore.md
- YouTube tutorial links (all resolve via oEmbed; content not watched): Interstellar `Q-HjG5RxDIg`, L'amour toujours `Zph8ZMdIq6w`, Someone You Loved `8B9P5aGAgwc`, Faded `aCJxjDzyAT8`, Love Story `he6hO17xYFg`, Clocks `2lr1iTU8GRE`, Viva la Vida `0ewwWK9_-iE`. Most are Synthesia-style, not filmed hands.
- Authoring tools (ABC decorations for fingering/pedal, music21 pedal export) are from memory [U]; the round trip is tested in M1 before committing to a format.

## 9. Korg D1

Source: official Owner's Manual D1_OM_EFGS3 (01/2022), https://www.korg.com/us/support/download/manual/0/781/3818/ . MIDI function mode pp. 14–15, implementation chart p. 66. No separate MIDI guide exists.

- [V] Power-on defaults: transmit channel 1, receives on all 16 channels, Local On, multitimbral on, PC filter off, CC filter off. All settings except auto power-off reset at power-off. **Nothing needs changing on the Korg.**
- [V] Bank select: CC0 = 121, CC32 = LSB, then Program Change (0-based).
- [V] No drum kit among the 30 sounds. Built-in metronome cannot be controlled over MIDI; no MIDI clock. Clicks must be sent as notes.
- Click candidates (1 oscillator each): Marimba CC32=0 PC=12, Clav CC32=0 PC=7, Vibraphone CC32=0 PC=11.
- Other-hand / replay candidates: Pop Piano CC32=2 PC=1 (2 osc), Electric Grand CC32=0 PC=2 (1 osc).
- [V] Polyphony is 120 oscillators shared across all parts; Concert/Grand piano use 3 per note (40 notes). Oldest-note stealing.
- [V] Recognized: CC7, CC11, CC64, CC66, CC67, CC72/73/75, CC91, CC120, CC121, CC123, Local (CC122), Program Change 0–52. Not recognized: clock, start/stop.
- [V] Transmits real note-off (0x8n, velocity 64) and Active Sensing (0xFE, filter it).
- [V] Included pedal is a switch; half-pedal only with the optional DS-1H. [S] with DS-1H only four CC64 values are sent (0, 38, 74, 127). "≥ 64 = down" stands.
- [V] Layer mode transmits layer 2 on channel + 1, so the app avoids channel 2.
- [V] Auto power-off defaults to 4 hours without key presses (the one persistent setting).
- **Untested, needs the real instrument (M1 checklist):** Program Change / CC7 / CC64 on channel 3 leave the keyboard part untouched; the player's pedal does not sustain channel 3; CC72 shortens the click.
- Button steps if ever needed: hold FUNCTION ≥ 3 s → PIANO1 = transmit channel, PIANO2 = Local, E.PIANO1 = PC filter, E.PIANO2 = CC filter, HARPSI/CLAV = multitimbral → +/− → FUNCTION.

## 10. Scoring and calibration

- Timing windows in the wild: osu! ±50/±100/±150 at OD5 [V] https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu%21 ; YARG ±70 [V]; StepMania Great ±90 [S]; Synthesia ≈ ±200 [S]. Piano Marvel, Yousician, Rocksmith: nothing published.
- The brief's ±200/±100/±50 are in the normal range, but a fixed ±200 ms overlaps neighbouring notes at speed (eighths at 120 BPM are 250 ms apart).
- Human timing figures (negative mean asynchrony −10…−50 ms, novice SD 5–8 % of the interval) are from memory of Repp 2005 / Aschersleben 2002 [U].
- Hardware floor: a DIN MIDI message takes ~1 ms; a 10-note chord smears over 6–10 ms. Tiers under ±30 ms are meaningless.
- Calibration practice: tap tests measure machine latency plus human anticipation together; rhythm games centre the window on the measured median. Visual offset is better set by a slider than by tapping to flashes. https://rhythmquestgame.com/devlog/10.html
- Matching: in tempo mode the app owns the clock, so windowed per-pitch matching beats score-following (HMM/DTW), which is for free tempo.

## 11. Key detection

Krumhansl–Schmuckler correlation over a duration-weighted pitch-class histogram; only the profile differs. Profiles (index 0 = tonic):

| Profile | Major | Minor |
|---|---|---|
| Temperley–de Clercq rock, harmony | 0.231 0.002 0.091 0.004 0.149 0.111 0.004 0.193 0.004 0.126 0.011 0.076 | 0.202 0.006 0.102 0.127 0.047 0.113 0.005 0.177 0.046 0.051 0.090 0.034 |
| Temperley Kostka–Payne | 0.748 0.060 0.488 0.082 0.670 0.460 0.096 0.715 0.104 0.366 0.057 0.400 | 0.712 0.084 0.474 0.618 0.049 0.460 0.105 0.747 0.404 0.067 0.133 0.330 |
| Albrecht–Shanahan | 0.238 0.006 0.111 0.006 0.137 0.094 0.016 0.214 0.009 0.080 0.008 0.081 | 0.220 0.006 0.104 0.123 0.019 0.103 0.012 0.214 0.062 0.022 0.061 0.052 |

- Sources: https://github.com/cuthbertLab/music21/blob/master/music21/analysis/discrete.py , https://github.com/music-computing/amads/blob/main/amads/pitch/key/profiles.py
- Pop accuracy (Temperley & de Clercq 2013, Table 3): pitch-class distribution 78–82 %; chord roots on strong beats 89–91 %. https://www.midside.com/publications/temperley_declercq_2013.pdf
- Plain Krumhansl–Kessler is biased toward the dominant; not used.

## 12. Fingering tables

Sources read: **S1** Chang, https://mail.pianofundamentals.com/book/en/1.III.5.4 ; **S2** Morin 2-octave chart, https://colorinmypiano.com/download/Scale__Arpeggio_Fingerings_for_Piano_2_Octave.pdf ; **S3** https://pianoscales.org/major.html (+ minor pages) ; **S6** https://www.cs.miami.edu/~burt/music/finger-charts.html (arpeggios).
Not readable: musicmagix.com (the brief's candidate, JS-only), ABRSM/RCM, full Alfred book.

Ascending, low → high, 2 octaves. STD = RH 123123412312345, LH 543213214321321.

**Major**

| Key | RH | LH |
|---|---|---|
| C G D A E | STD | STD |
| B | STD | 432143213214321 |
| F | 123412312341234 | STD |
| B♭ | 212312341231234 | 321432132143213 |
| E♭ | 312341231234123 | 321432132143213 |
| A♭ | 341231234123123 | 321432132143213 |
| D♭ | 231234123123412 | 321432132143213 |
| F♯ | 234123123412312 | 432132143213214 |

**Harmonic minor**

| Key | RH | LH |
|---|---|---|
| A E D G C | STD | STD |
| B | STD | 432143213214321 |
| F | 123412312341234 | STD |
| F♯ | 341231234123123 | 432132143213214 |
| C♯ | 341231234123123 | 321432132143213 |
| G♯ | 341231234123123 | 321432132143213 |
| E♭ | 312341231234123 | 214321321432132 |
| B♭ | 212312341231234 | 213214321321432 |

**Natural minor:** same as harmonic, except G♯ LH 321321432132143.

**Melodic minor:** ascending = harmonic fingering, descending = natural reversed. Exceptions: F♯ and C♯ RH ascending 231234123123412; G♯ LH descending as natural. Rests on S2 alone plus memory — **single-source**.

**Source disagreements**
- First finger on black-key scales (B♭, E♭, A♭ major; B♭, F♯, G♯ minor RH): sources give 2, 3 or 4 for the same underlying pattern. Store the pattern finger, accept 2 as alternate.
- D♭ major RH: S2 prints 34…, S1/S3 give 23123412. Treated as an S2 misprint.
- Top LH note on black-key scales: 2 (S2) vs 3 (S1, S3). Both accepted.

**Arpeggios, root position, 2 octaves** (S2, S6)

| Keys | RH | LH |
|---|---|---|
| C G F major; A E D B G C F E♭ minor | 1231235 | 5421421 |
| D A E B F♯ major | 1231235 | 5321321 |
| E♭ A♭ D♭ major; F♯ C♯ G♯ minor | 2124124 | 2142142 |
| B♭ major | 2124124 | 3213213 |
| B♭ minor | 2312312 | 3213213 |

**Block chords:** triads RH 1-3-5 / 1-2-5 / 1-3-5, LH 5-3-1 / 5-3-1 / 5-2-1 (root / 1st / 2nd inversion); sevenths RH 1-2-3-5, LH 5-3-2-1. Weakly sourced [U] — shown with a "suggested" badge, not as standard.
