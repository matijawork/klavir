/** Function check of every control in the player: toolbar, menus, shortcuts, result-card actions. */
import { expect, type Page, test } from '@playwright/test';

async function open(page: Page, settings: Record<string, unknown> = {}, song = 'ode-to-joy') {
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem('klavir.settings'))
        localStorage.setItem('klavir.settings', JSON.stringify(s));
    },
    { countIn: false, soundOut: 'piano', monitor: false, ...settings },
  );
  await page.goto(`./?mockmidi#/play/${song}/original`);
  await page.getByTestId('midi-connect').click();
  await page.waitForFunction(() => !!window.__klavir);
}

/** Waits until the engine state matches (settings reach the engine on the next frame). */
const until = (page: Page, fn: () => boolean) => page.waitForFunction(fn);

async function selectStart(page: Page, fraction: number) {
  const box = (await page.getByTestId('timeline').boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
}

/** Plays the practised notes through the virtual piano, shifted by offsetMs. */
const perform = (page: Page, offsetMs = 0) =>
  page.evaluate((offset) => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, hand, count } = session.song;
    for (let i = 0; i < count; i++) {
      if (start[i]! < session.rangeStart - 1e-6 || start[i]! >= session.rangeEnd - 1e-6) continue;
      if (!(session.config.handMask & (1 << hand[i]!))) continue;
      const delay = Math.max(0, transport.wallAt(start[i]!) + offset - performance.now());
      setTimeout(() => window.__midi!.noteOn(pitch[i]!), delay);
      const held = transport.wallAt(end[i]!) - transport.wallAt(start[i]!) - 40;
      setTimeout(() => window.__midi!.noteOff(pitch[i]!), delay + held);
    }
  }, offsetMs);

const clicks = (page: Page) =>
  page.evaluate(() => window.__midi!.sent.filter((m) => m.data[0] === 0x93).length);

test('toolbar buttons and shortcuts reach the engine', async ({ page }) => {
  await open(page, { mode: 'wait' });
  await page.getByTestId('mode-tempo').click();
  await until(page, () => window.__klavir!.session.config.mode === 'tempo');
  await page.keyboard.press('w');
  await until(page, () => window.__klavir!.session.config.mode === 'wait');

  await page.getByTestId('hands-L').click();
  await until(page, () => window.__klavir!.session.config.handMask === 1);
  await page.keyboard.press('3');
  await until(page, () => window.__klavir!.session.config.handMask === 2);
  await page.keyboard.press('2');
  await until(page, () => window.__klavir!.session.config.handMask === 3);

  for (const level of ['easy', 'strict', 'normal'] as const) {
    await page.getByTestId(`strict-${level}`).click();
    await page.waitForFunction((l) => window.__klavir!.session.strictness === l, level);
  }

  await page.getByTestId('speed').fill('80');
  await until(page, () => window.__klavir!.transport.rate === 0.8);
  // with the slider focused the arrows move it one step; shortcuts still work from there
  await page.keyboard.press('ArrowRight');
  await until(page, () => window.__klavir!.transport.rate === 0.81);
  await page.keyboard.press('w');
  await until(page, () => window.__klavir!.session.config.mode === 'tempo');
  await page.keyboard.press('w');
  await page.getByTestId('stage').click({ position: { x: 40, y: 200 } });
  await page.keyboard.press('ArrowUp');
  await until(page, () => window.__klavir!.transport.rate === 0.86);
  await page.keyboard.press('ArrowDown');
  await until(page, () => window.__klavir!.transport.rate === 0.81);

  await page.getByTestId('loop').click();
  await until(page, () => window.__klavir!.session.config.loop);
  await page.keyboard.press('l');
  await until(page, () => !window.__klavir!.session.config.loop);

  await page.getByTestId('countin').click();
  await until(page, () => window.__klavir!.session.countInTimes.length === 4);
  await page.keyboard.press('c');
  await until(page, () => window.__klavir!.session.countInTimes.length === 0);

  await page.getByTestId('metronome').click();
  await until(page, () => window.__klavir!.view.beatPulse);
  await page.keyboard.press('m');
  await until(page, () => !window.__klavir!.view.beatPulse);

  // Space, restart, Again
  await page.keyboard.press('Space');
  await until(page, () => window.__klavir!.session.running);
  await page.keyboard.press('Space');
  await until(page, () => !window.__klavir!.session.running);
  await page.getByTestId('mode-tempo').click();
  await page.getByTestId('play').click();
  await until(page, () => window.__klavir!.transport.time() > 0.5);
  await page.keyboard.press('r');
  await until(page, () => window.__klavir!.transport.time() < 0.2);
});

test('display and sound settings reach the engine, persist, and the menu closes', async ({
  page,
}) => {
  await open(page, { mode: 'tempo', hands: 'R' });
  const gear = page.locator('summary[title="Display and sound"]');
  await gear.click();

  await page.getByTestId('names-all').click();
  await until(page, () => window.__klavir!.view.noteNames === 'all');
  await page.getByText('Octave numbers').click();
  await until(page, () => window.__klavir!.view.octaveNumbers);
  await page.getByTestId('names-off').click();
  await until(page, () => window.__klavir!.view.noteNames === 'off');
  await expect(page.getByLabel('Octave numbers')).toBeDisabled();

  await page.getByText('Finger numbers').click();
  await until(page, () => !window.__klavir!.view.showFingers);

  await page.getByTestId('other-hide').click();
  await until(page, () => window.__klavir!.view.otherHand === 'hide');
  await page.getByTestId('other-play').click();
  await until(page, () => window.__klavir!.playback.handMask === 1);
  await page.getByTestId('other-dim').click();
  await until(page, () => window.__klavir!.playback.handMask === 0);

  await page.getByLabel('Zoom').fill('300');
  await until(page, () => window.__klavir!.view.pxPerSec === 300);
  await page.getByLabel('Timing offset').fill('40');
  await until(page, () => window.__klavir!.session.offsetMs === 40);
  await page.getByLabel('Volume', { exact: true }).fill('2.5');
  await page.getByLabel('Click volume').fill('0.5');

  // clicking the stage closes the menu
  await page.getByTestId('stage').click({ position: { x: 40, y: 200 } });
  await expect(page.locator('details.menu[open]')).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => !!window.__klavir);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('klavir.settings')!));
  expect(saved).toMatchObject({
    noteNames: 'off',
    octaveNumbers: true,
    fingers: false,
    otherHand: 'dim',
    zoom: 300,
    timingOffset: 40,
    volume: 2.5,
    clickVolume: 0.5,
  });
  await until(page, () => window.__klavir!.view.pxPerSec === 300);
});

test('sound output: Computer keeps playback off MIDI, Piano sends it', async ({ page }) => {
  await open(page, { mode: 'tempo', soundOut: 'computer' });
  await page.getByTestId('listen').click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(2500);
  expect(
    await page.evaluate(() => window.__midi!.sent.filter((m) => m.data[0] === 0x92).length),
  ).toBe(0);
  await page.locator('summary[title="Display and sound"]').click();
  await page.getByTestId('sound-piano').click();
  await page.waitForTimeout(2500);
  expect(
    await page.evaluate(() => window.__midi!.sent.filter((m) => m.data[0] === 0x92).length),
  ).toBeGreaterThan(2);
});

test('click switches: count-in sound, metronome sound, metronome while waiting', async ({
  page,
}) => {
  await open(page, {
    mode: 'tempo',
    countIn: true,
    countInClick: false,
    metronome: true,
    metronomeClick: false,
  });
  await page.getByTestId('play').click();
  await page.waitForTimeout(3500);
  expect(await clicks(page), 'both sounds off: silent').toBe(0);
  await page.getByTestId('play').click();

  await page.locator('summary[title="Display and sound"]').click();
  await page.getByText('Count-in sound').click();
  await page.getByText('Metronome sound').click();
  await page.keyboard.press('w'); // wait mode
  await until(page, () => window.__klavir!.session.config.mode === 'wait');
  await page.getByTestId('play').click();
  await until(page, () => window.__klavir!.session.waiting);
  const atWait = await clicks(page);
  expect(atWait, 'count-in clicked').toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(2500);
  expect(await clicks(page), 'metronome keeps ticking while the song waits').toBeGreaterThan(
    atWait + 2,
  );
});

test('speed-up: starts at the start speed, rises after clean passes only, stops at the target', async ({
  page,
}) => {
  await open(page, {
    mode: 'tempo',
    speed: 1,
    autoSpeedStart: 1.3,
    autoSpeedStep: 0.1,
    autoSpeedTarget: 1.5,
    speedUpScore: 0.9,
  });
  await selectStart(page, 0.05);
  await page.getByTestId('loop').click(); // off again: switching speed-up on must turn it on itself
  await until(page, () => !window.__klavir!.session.config.loop);
  await page.getByTestId('speedup').click(); // one click switches it on
  await until(
    page,
    () => window.__klavir!.transport.rate === 1.3 && window.__klavir!.session.config.loop,
  );
  await expect(page.getByTestId('speedup')).toHaveAttribute('aria-pressed', 'true');

  const speed = page.locator('.speed output');
  /** waits for a fresh pass at the given rate, then plays it (or not) */
  const pass = async (rate: number, play: boolean) => {
    await page.waitForFunction(
      (r) => {
        const { session, transport } = window.__klavir!;
        return (
          session.running &&
          transport.rate === r &&
          session.hits === 0 &&
          transport.time() < session.rangeStart - 0.3
        );
      },
      rate,
      { timeout: 20_000 },
    );
    const passes = await page.evaluate(() => window.__klavir!.session.revision);
    if (play) await perform(page);
    return passes;
  };
  await page.getByTestId('play').click();
  await pass(1.3, false); // a pass with nothing played: speed must stay
  await page.waitForFunction(() => document.querySelector('[data-testid=pass]') !== null, null, {
    timeout: 20_000,
  });
  await expect(speed).toHaveText('130%');
  await expect(page.getByTestId('speed-note')).toContainText(
    'Speed stays at 130 %: needs 90 %, you got 0 %',
  );
  await pass(1.3, true);
  await expect(page.getByTestId('speed-note')).toContainText('130 % → 140 %', { timeout: 20_000 });
  await expect(speed).toHaveText('140%', { timeout: 20_000 });
  await pass(1.4, true);
  await expect(speed).toHaveText('150%', { timeout: 20_000 });
  await pass(1.5, true);
  await expect(page.getByTestId('pass')).toContainText('100%', { timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(speed, 'never above the target').toHaveText('150%');
  await expect(page.getByTestId('speed-note')).toContainText('target 150 % reached');
  // switching the loop off switches speed-up off, so it never sits there doing nothing
  await page.getByTestId('loop').click();
  await expect(page.getByTestId('speedup')).toHaveAttribute('aria-pressed', 'false');
  // the steps are editable from the little menu next to it
  await page.getByTestId('speedup-options').click();
  await page.getByLabel('Go up by').fill('20');
  await page.getByLabel('Go up by').blur();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('klavir.settings')!).autoSpeedStep),
  ).toBe(0.2);
});

test('steady delay: the card offers to stop counting it, and then it is not counted', async ({
  page,
}) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page, 0.3);
  await page.getByTestId('loop').click();
  await page.getByTestId('play').click();
  await perform(page, 140);
  await expect(page.getByTestId('compensate')).toBeVisible({ timeout: 30_000 });
  const before = await page.evaluate(() => window.__klavir!.session.result(true));
  expect(before.late).toBeGreaterThan(before.hits * 0.9);
  await page.getByTestId('compensate').click();
  await until(page, () => {
    const { session, transport } = window.__klavir!;
    return (
      session.offsetMs >= 130 && session.running && session.hits === 0 && transport.time() < -0.3
    );
  });
  await perform(page, 140);
  await expect(page.getByTestId('pass-score')).toHaveText('100%', { timeout: 30_000 });
  await expect(page.getByTestId('compensate')).toHaveCount(0);
});

test('navigation: warm-up opens the scale of the song key, Again restarts', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 }, 'test-c');
  await page.getByTestId('play').click();
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Again' }).click();
  await until(
    page,
    () => window.__klavir!.session.running && window.__klavir!.transport.time() < 1,
  );
  await page.getByTestId('warmup').click();
  await expect(page).toHaveURL(/#\/exercise\/scale-major\/0$/);
  await page.waitForFunction(
    () => window.__klavir?.session.song.file.id === 'exercise-scale-major-0',
  );
  await page.locator('a[aria-label="Back to library"]').click();
  await expect(page.getByTestId('exercise-arpeggio')).toBeVisible();
});

test('sound: a big chord is louder than one note and never clips', async ({ page }) => {
  await open(page, { mode: 'tempo', soundOut: 'computer', monitor: true, volume: 1.2 });
  await page.getByTestId('stage').click({ position: { x: 40, y: 200 } }); // unlocks audio, loads samples
  await page.waitForFunction(() => window.__klavir!.level().loaded === 30, null, {
    timeout: 20_000,
  });
  /** presses the keys, returns the loudest peak and RMS seen over 600 ms, then releases */
  const play = (pitches: number[], velocity: number) =>
    page.evaluate(
      async ({ pitches, velocity }) => {
        for (const p of pitches) window.__midi!.noteOn(p, velocity);
        let peak = 0;
        let rms = 0;
        const end = performance.now() + 600;
        while (performance.now() < end) {
          const l = window.__klavir!.level();
          peak = Math.max(peak, l.peak);
          rms = Math.max(rms, l.rms);
          await new Promise((r) => setTimeout(r, 15));
        }
        for (const p of pitches) window.__midi!.noteOff(p);
        await new Promise((r) => setTimeout(r, 900));
        return { peak, rms };
      },
      { pitches, velocity },
    );
  const one = await play([60], 80);
  const chord = await play([48, 52, 55, 60, 64, 67, 72, 76], 80);
  const hard = await play([36, 43, 48, 52, 55, 60, 64, 67, 72, 76], 127);
  console.log('levels', JSON.stringify({ one, chord, hard }));
  expect(one.peak, 'a single note is clearly audible').toBeGreaterThan(0.25);
  expect(chord.rms, 'a chord is louder than one note').toBeGreaterThan(one.rms * 1.1);
  expect(chord.peak, 'no clipping').toBeLessThan(1);
  expect(hard.peak, 'no clipping even when hammered').toBeLessThan(1);
});

test('exercises: minor mode builds minor versions', async ({ page }) => {
  await page.goto('./?mockmidi#/');
  await page.getByTestId('mode-minor').click();
  await page.getByTestId('key-9').click();
  await expect(page.getByTestId('exercise-scale-minor')).toContainText('A minor');
  await expect(page.getByTestId('exercise-scale-major')).toHaveCount(0);
  await page.getByTestId('exercise-chords').click();
  await page.waitForFunction(() => window.__klavir?.session.song.file.id === 'exercise-chords-9m');
});

test('speed-up does not creep while only listening', async ({ page }) => {
  await open(page, {
    mode: 'tempo',
    speed: 1.3,
    autoSpeed: true,
    autoSpeedTarget: 1.5,
    autoSpeedStart: 1.3,
  });
  await selectStart(page, 0.05);
  await page.getByTestId('listen').click();
  await page.getByTestId('play').click();
  // two whole loops of the section
  await page.waitForFunction(() => window.__klavir!.transport.time() > 1);
  await page.waitForFunction(() => window.__klavir!.transport.time() < 0);
  await page.waitForFunction(() => window.__klavir!.transport.time() > 1);
  await expect(page.locator('.speed output')).toHaveText('130%');
});

test('fingering trust is shown and can be marked as checked by the player', async ({ page }) => {
  await page.goto('./?mockmidi#/exercise/arpeggio/10');
  await page.waitForFunction(() => !!window.__klavir);
  const chip = page.getByTestId('fingering-chip');
  await expect(chip).toHaveText('✓ Fingering: robertkelleyphd.com');
  await page.goto('./?mockmidi#/exercise/cadence/0');
  await expect(chip).toHaveText('? Fingering: suggested, not checked');
  await chip.click();
  await expect(chip).toHaveText('✓ Fingering: checked by you');
  await page.goto('./?mockmidi#/play/ode-to-joy/original');
  await expect(chip).toHaveText('? Fingering: suggested, not checked');
  await page.goto('./?mockmidi#/');
  await expect(page.locator('.badge.trust[data-state="mine"]')).toHaveCount(1);
});
