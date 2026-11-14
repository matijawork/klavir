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

test('calibration: tapping along with the clicks measures the delay and sets the offset', async ({
  page,
}) => {
  await open(page, { mode: 'tempo' });
  const before = await clicks(page);
  await page.locator('summary[title="Display and sound"]').click();
  await page.getByTestId('calibrate').click();
  await expect(page.getByTestId('calibrate-card')).toBeVisible();
  // a virtual player who is 45 ms late on every click, with a little wobble
  const tapped = await page.evaluate(
    (from) =>
      new Promise<number>((done) => {
        let seen = from;
        let taps = 0;
        const timer = setInterval(() => {
          const sent = window.__midi!.sent.filter((m) => m.data[0] === 0x93);
          for (; seen < sent.length; seen++) {
            taps++;
            window.__midi!.noteOn(60, 80, sent[seen]!.time + 45 + ((seen % 3) - 1) * 8);
            window.__midi!.noteOff(60, sent[seen]!.time + 200);
          }
          if (document.querySelector('[data-testid=calibrate-result]')) {
            clearInterval(timer);
            done(taps);
          }
        }, 20);
      }),
    before,
  );
  expect(tapped, 'all 20 clicks were sent').toBe(20);
  expect(await page.evaluate(() => window.__klavir!.session.wrong), 'taps are not judged').toBe(0);
  await expect(page.getByTestId('calibrate-result')).toContainText('about 45 ms after the click');
  await page.getByTestId('calibrate-use').click();
  await expect(page.getByTestId('calibrate-card')).toHaveCount(0);
  await until(page, () => window.__klavir!.session.offsetMs === 45);

  // no taps: says so in words and offers nothing to use
  await page.locator('summary[title="Display and sound"]').click();
  await page.getByTestId('calibrate').click();
  await expect(page.getByTestId('calibrate-result')).toContainText('Only 0 of your taps', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('calibrate-use')).toHaveCount(0);
  await page.getByTestId('calibrate-close').click();
  await until(page, () => window.__klavir!.session.offsetMs === 45);

  // the picture slider moves only the drawing
  await page.locator('summary[title="Display and sound"]').click();
  await page.getByLabel('Picture offset').fill('30');
  await until(page, () => window.__klavir!.view.pictureMs === 30);
  expect(await page.evaluate(() => window.__klavir!.session.offsetMs)).toBe(45);
});

test('calibration clicks are heard through the computer', async ({ page }) => {
  await open(page, { mode: 'tempo', soundOut: 'computer' });
  await page.locator('summary[title="Display and sound"]').click();
  await page.getByTestId('calibrate').click();
  // count separate bursts of sound over 3 s: clicks are 600 ms apart
  const bursts = await page.evaluate(async () => {
    let count = 0;
    let loud = false;
    const end = performance.now() + 3000;
    while (performance.now() < end) {
      const now = window.__klavir!.level().peak > 0.05;
      if (now && !loud) count++;
      loud = now;
      await new Promise((r) => setTimeout(r, 10));
    }
    return count;
  });
  expect(bursts).toBeGreaterThanOrEqual(3);
  expect(bursts).toBeLessThanOrEqual(6);
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
