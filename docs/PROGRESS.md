# Progress

Updated 2026-11-14. Live: https://matijawork.github.io/klavir/ · 208 unit + 30 e2e green.
Matija plays a Korg D1 (no speakers) over CME C2MIDI Pro into a Mac; sound comes from the Mac.

## What exists
- **Practise vs Perform** (ADR-016, his idea): every library card has both. *Practise* = the player as before (Wait / Tempo, any speed, sections, loop); nothing is kept; Wait mode shows no percent at all (counts and tips only), Tempo shows a percent marked "Practice · not kept". *Perform* (`#/perform/...`, `Player perform`) = whole piece, both hands, Tempo, 100 %, Normal, no loop, no Listen; Play becomes Stop (throws the run away, as does leaving the tab); only these scores go to the history, the library badge and the chart.
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
- **History**: performances only, IndexedDB `klavir` v2 / `performances` (`{song, at, score}`); fallback `klavir.performances` in localStorage. The older practice history (`passes` store, `klavir.history`) is deleted on load: he asked for that.
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
| Video | Link parsing: 13 cases in a unit test. E2E: add, shown as an embedded frame, remembered, per song, remove. **Not checked: that a real video plays** (tests block YouTube); some videos forbid embedding, then "Open on YouTube". |
| Sound | Measured, not heard: one mf note peaks 0.57, 8-key chord 0.95 at 1.2× the RMS, no clipping. Chords are held back ~7 dB by the limiter (`DRIVE` 1.5); less drive = more natural chords but quieter notes. He has to judge by ear. |
| Hold on the real piano | Rules pass their table; he once said it "does not really work" without details. Unexplained. |
| Anything by ear or by hand on the Korg | Only Matija can check. Confirmed by him so far: keys, pedal, right-hand mode, no audible lag, metronome, wait mode, result card "good", layout "looks good". |

Matija marks fingerings he checked himself by clicking the chip ("checked by you", stored in `klavir.fingeringChecked`).

## Next
1. Ideas offered to him 2026-11-14, none started: perform per hand (left / right only) as separate charts; "ready to perform" hint after clean practice at 100 %; a streak / days-practised view; keeping the review of the last performance; MIDI import.
2. M4 recording and replay, M6 MIDI import and library, M7 Firebase sync, M8 tablet / PWA, M9 audit.

Removed 2026-11-14 on his request: automatic speed-up ("I will change the speed by hand"). Do not bring it back.

## Known gaps
- Fixed 2026-11-14: on a busy computer the first count-in click (and a note exactly at the start) could be dropped (`SongPlayback.resync` compared against a clock that had already moved). Found through a test that failed 4 of 12 times under load; 12 of 12 after the fix.
- Perform fixes strictness to Normal so scores stay comparable; count-in and metronome stay his choice.
- Click volume does nothing when Sound = Piano (MIDI velocity is fixed).
- MIDI chip "Test" sends three notes to the piano only; silent on the D1 without headphones.
- `PassResult.seconds` counts from configure, not from Play.
- A key held from one note into a repeated note of the same pitch shows green although a new press is needed.
- History is per browser; exercises have no sheet.
- Calibration measures against the click sound; with Bluetooth speakers the result includes their lag (wanted for judging by ear, but then the picture needs the Picture slider).
- Gymnopédie source: 6 unmatched ties, 8 trimmed overlaps. Demo scores' "public domain" claim has no license file.
- Real MIDI-out timing and 120 Hz frame times never measured on his Mac (`?debug`).

## Working agreement (from his feedback)
- Test it yourself first; hand him only what needs ears or hands. Say plainly what was checked and how, and what was not.
- Never say "works" for something only reasoned about. If he says something does not work and it cannot be reproduced, ask for the exact steps instead of repeating that it works.
- Show trust level in the app where it matters (fingering chips).
