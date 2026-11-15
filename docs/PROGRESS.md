# Progress

Updated 2026-11-15. Live: https://matijawork.github.io/klavir/ · 249 unit + 37 e2e green.
Matija plays a Korg D1 (no speakers) over CME C2MIDI Pro into a Mac; sound comes from the Mac.

## What exists
- **Practise vs Perform** (ADR-016, his idea): every library card has both. *Practise* = the player as before (Wait / Tempo, any speed, sections, loop); nothing is kept; Wait mode shows no percent at all (counts and tips only), Tempo shows a percent marked "Practice · not kept". *Perform* (`#/perform/...`, `Player perform`) = whole piece, both hands, Tempo, 100 %, Normal, no loop, no Listen; Play becomes Stop (throws the run away, as does leaving the tab); only these scores go to the history, the library badge and the chart.
- **Perform with one hand**: Left / Both / Right in Perform (not while it runs); each has its own scores, chart tab and saved last performance. `#/perform/<song>/<version>/L|R`. Library badge shows the both-hands best, or "R 92%" / "L …" until there is one.
- **Ready to perform**: a practice pass of the whole piece in Tempo at ≥ 100 % scoring ≥ 90 % shows "ready" and a "Perform it" button (`readyToPerform` in `feedback.ts`).
- **Practice days**: strip on top of the library: days in a row (≥ 1 min of playing; today may still be missing), time in the last 7 days, 16-week calendar. Time = seconds a pass is running, Listen excluded (`engine/days.ts`, `store/days.ts`, `klavir.days`).
- **Recording and "Hear it"**: every pass records his keys (with velocity) and pedal (`session.rec*`, in the snapshot). In Review, "Hear it" / Space plays it back from where the review stands, at the current speed, through the app's sound (`midi/replay.ts`); the step text follows. Tempo passes only: Wait mode stops the song, so there is no rhythm to replay.
- **Last performance kept**: result, notes and recording of the latest performance per song and hands are stored (IndexedDB `last`); on a later visit Perform's Review button opens it (no result card).
- **MIDI import**: `.mid` / `.midi` through the same `import-song` (`scripts/lib/midi.ts`). Hands from two tracks or two channels (track names first, else the higher one = right, with a warning); one track needs `splitAt` or `oneHand`. Nothing is quantized; a played-in recording is flagged.
- **Sync** (ADR-017): **on** since 2026-11-15. Firebase project `klavir-7c41e9` (his Google account, Spark plan, Firestore in `eur3`, Google sign-in, authorized domain `matijawork.github.io`, no Analytics); public config in `src/sync/config.ts`, rules in `firestore.rules` (`npx firebase-tools deploy --only firestore:rules`; never plain `deploy` on a project without a database: it creates one in the US). "Sign in to sync" in the library header (Google popup), then scores, practice days, videos, "checked by me" marks and the latest performances are the same on every device; the device stays the source of truth and works offline. Practice settings (speed, offsets, sound) are per device on purpose: the delay depends on the equipment. `?nosync` = as if no cloud were configured.
- **Speed**: slider, ↑ ↓, or type the percent in the box next to the slider. No automatic speed changes.
- **Video**: "+ Video" on a song card: paste a YouTube link (stored in `klavir.videos`, overrides `meta.json`), plays inside the app, "Open on YouTube" as fallback.
- **Player**: falling notes, 88 keys, wait / tempo mode, hands, speed 10–150 %, section loop, count-in, metronome, pedal lane, finger badges, fullscreen, shortcuts (Space, R, L, W, 1/2/3, ↑↓, C, M, F, D).
- **Scoring**: per note right key 40 % + timing 35 % + hold 25 % (`noteScore`); wrong keys add to the total. Strictness Easy / Normal / Strict (`PRESETS` in `session.ts`). Presses count up to about half a beat away, graded early / late; early release = short, over-holding = long.
- **Feedback**: live HUD (%, missed, wrong, early/late, short); wrong key red; notes green / yellow early / orange late / red let go too soon / grey missed; white end cap = let go; key orange with arrow when held too long.
- **Result card** (words, `feedback.ts`): verdict, Right notes / On the beat / Held right / Wrong keys, up to three tips, best score, "Practise measures a–b", "Stop counting this delay" (sets `timingOffset` when the offset is steady). While a loop runs the result is only a small chip.
- **Calibration**: ⚙ → Delay → Measure plays 20 clicks, he taps one key on each; median gap (first 4 clicks and slips dropped) becomes `timingOffset` (`engine/calibration.ts`, `ui/Calibrate.tsx`). "Picture" slider (`pictureOffset`) shifts only the drawing.
- **Review**: result card → Review, or the Review button on the toolbar (enabled once a pass was played to the end). Steps through the pass note by note (← →, wheel, ruler drag, "Mistakes only"), text says what happened (`engine/review.ts`); canvas shows a white line where he pressed, a white bar for how long he held, red blocks for wrong keys. Works from `session.snapshot()`.
- **Progress chart**: click the best-score badge in the library: best performance per day (`engine/progress.ts`, `ui/ProgressChart.tsx`).
- **Sound**: sampled piano (Salamander, CC BY 3.0), light reverb, limiter; Volume 0–3; player's keys and pedal through the computer.
- **Exercises**: major / minor, 12 keys: five-finger warm-up, scale (major, harmonic minor), chord inversions, I–IV–V–I, arpeggio. Warm-up button in a song opens the scale of its key.
- **History**: performances only, IndexedDB `klavir` v3 / `performances` (`{song, at, score, hands}`, no `hands` = both) and `last`; fallback `klavir.performances` in localStorage. The older practice history (`passes` store, `klavir.history`) is deleted on load: he asked for that.
- **Import pipeline** for MusicXML (`add-song` skill); five public-domain pieces plus `test-c`.

## How sure we are (keep this table honest; the app shows the fingering rows as chips)
| Thing | Status |
|---|---|
| Scale fingerings, 24 keys | Copied from pianoscales.org, compared digit by digit by a test. Second octave of minor scales = same pattern repeated (page prints one octave). |
| Arpeggio fingerings, 24 keys | From Robert Kelley's chart (robertkelleyphd.com/home/arpfing.htm), all 48 hand/key patterns compared by a test. The chart gives 4-digit patterns; reading them as root-third-fifth-root is mine, supported by its own "thumb on white keys" rule holding in every key. 5 on first/last note as the page allows. |
| Chord inversion fingerings | pianoguidelessons.com (?p=4136), matches. |
| I–IV–V–I and five-finger fingering | No source found. Common practice; shown as "suggested, not checked". |
| Song fingerings | Computed by `scripts/lib/fingering.ts`, not from the scores; shown as "suggested, not checked". |
| Strictness, hold, timing rules | Tables in `tests/unit/scenarios.test.ts` (93 cases). |
| Every button, shortcut, setting | `tests/e2e/controls.spec.ts` with the virtual piano. |
| Calibration | Logic: table of 12 cases (late, early, wobble, slips, skipped clicks, too few, too uneven). E2E: a virtual player 45 ms late gets 45 ms and the offset is set; clicks measured as sound through the computer. **Not checked: whether the number it gives him on the Korg makes "on time" feel right.** |
| Review | Texts checked against a scripted pass (late, early, missed, short, too long, wrong key) in unit tests; stepping, wheel, Done, Again in e2e; marks looked at on a screenshot. Wait mode has no press timing, so the press line sits at the note start there. |
| Practise / Perform | E2E: Perform ignores practice settings (wait, left hand, 50 %, easy → tempo, both, 100 %, normal), controls and shortcuts for them are gone, Stop keeps nothing, a finished run is kept and survives reload, practice adds nothing, old history is wiped. |
| Progress chart | E2E with seeded performances: one dot per day at the day's best, tooltip. |
| Typed speed, Review button, no percent in Wait | E2E (73 → 0.73, 400 → 150, empty keeps). |
| One-hand perform, saved review, Hear it | E2E: right-hand run scored and badged "R", recording has one press and release per note plus the pedal, after a reload Review opens it and the replay sends the same pitches and velocities within 3 ms of the recorded moments, stops silent; replay measured as sound through the computer (peak 0.24). **Not checked by ear: how his own replay sounds, and pedal replay.** |
| Ready to perform | Rule: 8 cases in a unit test. E2E: not at 95 %, yes at 100 %, button opens Perform. |
| Practice days | Streak, calendar, levels: 11 unit cases. E2E: seeded days, 12 s of playing tips today over a minute, listening adds nothing. |
| MIDI import | 9 unit cases on generated files (hands by name / by height / by channel, one track, tempo, 3/4, 6/8 change, pedal, bad files, played-in recording). Ran the real `import-song` on a generated two-track file: JSON, index entry and sheet PDF came out; then removed. **No real-world MIDI file tried yet**: files from the web often have one track or are played-in recordings; the importer says so instead of guessing. |
| Sync | Rules: 12 unit cases (copy what is missing, later change wins, days add up, saved performance survives packing bit for bit). E2E with two separate browsers and a stand-in cloud: data made before sign-in goes up, a fresh device gets it all and can review and hear the other device's performance, offline changes are kept and sent later, a later removal wins, practice time is not counted twice, a sync with nothing new writes nothing, sign-out keeps the device's data. **Real Firebase, 2026-11-15, on localhost with the virtual piano:** Google popup sign-in, survives reload; a performance of `test-c` arrived in `users/<uid>/performances`, `last`, `days`, `kv` (read back over the REST API); after wiping the device's data the score and the other device's seconds came back; another user's path and a request without sign-in both get 403; test data removed afterwards. **Not checked: sign-in on the live site (github.io) and two real devices** — his to do. |
| Video | Link parsing: 13 cases in a unit test. E2E: add, shown as an embedded frame, remembered, per song, remove. **Not checked: that a real video plays** (tests block YouTube); some videos forbid embedding, then "Open on YouTube". |
| Sound | Measured, not heard: one mf note peaks 0.57, 8-key chord 0.95 at 1.2× the RMS, no clipping. Chords are held back ~7 dB by the limiter (`DRIVE` 1.5); less drive = more natural chords but quieter notes. He has to judge by ear. |
| Hold on the real piano | Rules pass their table; he once said it "does not really work" without details. Unexplained. |
| Anything by ear or by hand on the Korg | Only Matija can check. Confirmed by him so far: keys, pedal, right-hand mode, no audible lag, metronome, wait mode, result card "good", layout "looks good". |

Matija marks fingerings he checked himself by clicking the chip ("checked by you", stored in `klavir.fingeringChecked`).

## Next
1. **Matija: sign in on the live site on two devices** (hard-reload first), play one Perform on one, see the score on the other. If the popup is blocked or says the domain is not allowed, report the exact text.
2. Then M8 tablet / PWA, M9 audit. Open questions for him: strictness in Perform is fixed to Normal (he was told, has not answered); nothing on the Korg from 2026-11-14/15 has been confirmed by him yet (Measure, Review marks, Hear it, Perform on a real song, a real YouTube video, a real MIDI file).

## Prompt for the next session (he pastes this after /clear)
```
Nastavljamo Klavir (/Users/matija/Desktop/Klavir). Pročitaj CLAUDE.md i docs/PROGRESS.md
(posebno "Next", "How sure we are" i "Working agreement").
Sinkronizacija je uključena; ako javim problem s prijavom na live stranici, prvo to.
Inače nastavi s "Next" točka 2.
Pravila: sve testiraj sam (?mockmidi, ?mocksync), meni ostavi samo ono za uho i ruke;
ne piši "radi" ako nisi provjerio; objašnjavaj jednostavnim riječima; ne ubrzavaj mi ništa sam.
Prijava na dva uređaja: <radi / točan tekst greške>
Moje primjedbe nakon testa na Korgu: <upiši što ne radi i što si točno kliknuo>
```

Removed 2026-11-14 on his request: automatic speed-up ("I will change the speed by hand"). Do not bring it back.

## Final review 2026-11-15 (whole code read, fixes below; 249 unit + 37 e2e green after)
- Sync could store every score twice when it started before the stored history was loaded: it now waits (`historyReady`); e2e counts the stored rows. A full sync asked for during a running one is no longer downgraded to a push; sign-out errors are shown.
- Stop inside the 100 ms look-ahead could leave a faint ghost note on computer sound (`synth.ts` `release`); checked in Chrome: silence after 6 stops at random moments.
- Screen wake lock was never released on leaving the player and could leak; one `keepAwake` now.
- Playing time: a pass left running with no key for 60 s stops counting (Wait mode used to count forever).
- Perform: after Stop or Restart the saved last performance is offered for Review again (was lost until reload).
- Replay timer kept running after leaving the player; replay now also stops when the tab is hidden.
- A key press re-rendered the whole player; only the small key readout now (`LiveInput`).
- The remembered MIDI device wins again when it is plugged back in; other hand's note no longer switches off a practised key light; menus close on outside click in the library too.
- Removed: unused `tonal` dependency, `PassResult.seconds`, `heldAt`, `.controls` CSS; wrong `--split` hint in the importer.
- Checked in his Chrome on localhost (virtual piano): Space on a focused Play toggles once, Perform → score → Again → Stop → Review → Hear it (sound measured), a real YouTube video loads in the frame, no console errors.

## Known gaps
- Fixed 2026-11-14: on a busy computer the first count-in click (and a note exactly at the start) could be dropped (`SongPlayback.resync` compared against a clock that had already moved). Found through a test that failed 4 of 12 times under load; 12 of 12 after the fix.
- Perform fixes strictness to Normal so scores stay comparable; count-in and metronome stay his choice.
- Click volume does nothing when Sound = Piano (MIDI velocity is fixed).
- MIDI chip "Test" sends three notes to the piano only; silent on the D1 without headphones.
- A key held from one note into a repeated note of the same pitch shows green although a new press is needed.
- Exercises have no sheet. History is per browser until he signs in (then synced).
- Calibration measures against the click sound; with Bluetooth speakers the result includes their lag (wanted for judging by ear, but then the picture needs the Picture slider).
- Gymnopédie source: 6 unmatched ties, 8 trimmed overlaps. Demo scores' "public domain" claim has no license file.
- Real MIDI-out timing and 120 Hz frame times never measured on his Mac (`?debug`).

## Working agreement (from his feedback)
- Test it yourself first; hand him only what needs ears or hands. Say plainly what was checked and how, and what was not.
- Never say "works" for something only reasoned about. If he says something does not work and it cannot be reproduced, ask for the exact steps instead of repeating that it works.
- Show trust level in the app where it matters (fingering chips).
- Console / account steps (Firebase, Google): he wants Claude to click them in his Chrome itself; ask permission in one question per step that accepts terms, signs in or changes account settings (2026-11-15).
