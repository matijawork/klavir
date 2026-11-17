/** Function check of every control in the player: toolbar, menus, shortcuts, result-card actions. */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

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

/**
 * Waits until the engine state matches (settings reach the engine on the next frame). While the
 * player is rebuilt after a route change there is no engine for a moment: that counts as "not yet".
 */
const until = (page: Page, fn: () => boolean) =>
  page.waitForFunction(
    `(() => { try { return (${fn.toString()})(); } catch { return false; } })()`,
  );

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

test('review: after a pass every note can be stepped through with what went wrong', async ({
  page,
}) => {
  await open(page, { mode: 'tempo', hands: 'R', speed: 1.5 });
  await selectStart(page, 0.12);
  await page.getByTestId('loop').click(); // one pass, then the card
  await until(page, () => !window.__klavir!.session.config.loop);
  await page.getByTestId('play').click();
  // second note 200 ms late, third never played, one key that is not in the song; rest on time
  const plan = await page.evaluate(() => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, hand, count } = session.song;
    const mine: number[] = [];
    for (let i = 0; i < count; i++)
      if (start[i]! >= session.rangeStart - 1e-6 && start[i]! < session.rangeEnd - 1e-6 && hand[i])
        mine.push(i);
    mine.forEach((i, k) => {
      if (k === 2) return;
      const on = transport.wallAt(start[i]!) + (k === 1 ? 200 : 0);
      const off = Math.max(on + 30, transport.wallAt(end[i]!) - 30);
      setTimeout(() => window.__midi!.noteOn(pitch[i]!, 80, on), on - performance.now());
      setTimeout(() => window.__midi!.noteOff(pitch[i]!, off), off - performance.now());
    });
    const wrongAt = transport.wallAt((start[mine[3]!]! + start[mine[4]!]!) / 2);
    setTimeout(() => window.__midi!.noteOn(22, 80, wrongAt), wrongAt - performance.now());
    setTimeout(() => window.__midi!.noteOff(22, wrongAt + 50), wrongAt + 50 - performance.now());
    return { notes: mine.length, second: start[mine[1]!]!, third: start[mine[2]!]! };
  });
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('review-open').click();
  // opens on the first mistake
  await expect(page.getByTestId('review-text')).toContainText('200 ms late');
  await expect(page.getByTestId('review-pos')).toContainText(`2 / ${plan.notes + 1}`);
  await expect(page.getByTestId('pass')).toHaveCount(0);
  const lead = (t: number) =>
    page.waitForFunction((t) => {
      const k = window.__klavir!;
      const gap = t - k.transport.time();
      return !k.session.running && gap > 0.05 && gap < 1 && k.view.review !== null;
    }, t);
  await lead(plan.second);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('review-text')).toContainText('not played');
  await lead(plan.third);
  await page.getByTestId('review-next').click();
  await expect(page.getByTestId('review-text')).toContainText('on time');
  await page.getByTestId('review-bad').click();
  await page.getByTestId('review-next').click();
  await expect(page.getByTestId('review-text')).toContainText('A♯0 is not in the song here');
  await page.getByTestId('review-next').click(); // no more mistakes: stays
  await expect(page.getByTestId('review-text')).toContainText('A♯0 is not in the song here');
  await page.getByTestId('review-prev').click();
  await expect(page.getByTestId('review-text')).toContainText('not played');
  // the mouse wheel moves freely; the text follows
  await page.getByTestId('stage').hover();
  await page.mouse.wheel(0, 3000);
  await expect(page.getByTestId('review-pos')).toHaveText(/^1 \/ /);
  // Done goes back to the result; Again plays a fresh pass
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('review')).toHaveCount(0);
  await expect(page.getByTestId('pass-score')).toBeVisible();
  await until(page, () => window.__klavir!.view.review === null);
  await page.getByRole('button', { name: 'Again' }).click();
  await until(
    page,
    () => window.__klavir!.session.running && window.__klavir!.session.state.every((v) => v === 0),
  );
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
  await page.waitForFunction(() => window.__klavir!.level().loaded === 150, null, {
    timeout: 60_000,
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
  const soft = await play([60], 25);
  const loud = await play([60], 120);
  console.log('layers', JSON.stringify({ soft, loud }));
  expect(soft.peak, 'a soft note is audible').toBeGreaterThan(0.03);
  expect(loud.rms, 'a hard note is clearly louder than a soft one').toBeGreaterThan(soft.rms * 2);
  expect(loud.peak, 'no clipping').toBeLessThan(1);
  const hard = await play([36, 43, 48, 52, 55, 60, 64, 67, 72, 76], 127);
  console.log('levels', JSON.stringify({ one, chord, hard }));
  expect(one.peak, 'a single note is clearly audible').toBeGreaterThan(0.25);
  expect(chord.rms, 'a chord is louder than one note').toBeGreaterThan(one.rms * 1.1);
  expect(chord.peak, 'no clipping').toBeLessThan(1);
  expect(hard.peak, 'no clipping even when hammered').toBeLessThan(1);
});

test('perform: locked to the real thing, cannot be paused, and only it is kept and charted', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // old practice history from earlier versions must disappear
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('klavir.history', JSON.stringify({ 'test-c/original': [{ score: 99 }] }));
    const req = indexedDB.open('klavir', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('passes', { autoIncrement: true });
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      db.transaction('passes', 'readwrite').objectStore('passes').add({ song: 'test-c/original' });
      db.close();
    };
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('klavir.settings'))
      localStorage.setItem(
        'klavir.settings',
        JSON.stringify({
          countIn: false,
          soundOut: 'piano',
          monitor: false,
          mode: 'wait',
          hands: 'L',
          speed: 0.5,
          strictness: 'easy',
        }),
      );
  });
  await page.goto('./?mockmidi#/');
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('perform-test-c')).toBeVisible();
  await expect(page.getByTestId('best')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('klavir.history'))).toBeNull();
  expect(
    await page.evaluate(
      () =>
        new Promise<string[]>((done) => {
          const req = indexedDB.open('klavir');
          req.onsuccess = () => {
            done([...req.result.objectStoreNames]);
            req.result.close();
          };
        }),
    ),
    'old store is gone',
  ).toEqual(['last', 'performances']);

  await page.getByTestId('perform-test-c').click();
  await page.waitForFunction(() => !!window.__klavir);
  // whatever the practice settings are, a performance is tempo, both hands, 100 %, normal
  await until(page, () => {
    const { session, transport } = window.__klavir!;
    const c = session.config;
    return (
      c.mode === 'tempo' &&
      c.handMask === 3 &&
      c.range === null &&
      !c.loop &&
      transport.rate === 1 &&
      session.strictness === 'normal'
    );
  });
  await expect(page.getByTestId('perform-badge')).toBeVisible();
  for (const id of ['mode-wait', 'strict-easy', 'speed', 'speed-number', 'loop', 'listen'])
    await expect(page.getByTestId(id), `${id} is not offered`).toHaveCount(0);
  // shortcuts and the ruler cannot change it either
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('w');
  await page.keyboard.press('l');
  await page.keyboard.press('1');
  await selectStart(page, 0.3);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => {
      const { session, transport } = window.__klavir!;
      const c = session.config;
      return [c.mode, c.handMask, c.range, c.loop, transport.rate];
    }),
  ).toEqual(['tempo', 3, null, false, 1]);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('klavir.settings')!).speed),
    'practice speed is left alone',
  ).toBe(0.5);

  // stopping half way throws the performance away: back to the start, nothing kept
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play')).toHaveText('Stop');
  await page.waitForFunction(() => window.__klavir!.transport.time() > 0.5);
  await page.keyboard.press('Space');
  await until(page, () => {
    const { session, transport } = window.__klavir!;
    return !session.running && transport.time() <= session.leadStart + 1e-6;
  });
  await expect(page.getByTestId('pass')).toHaveCount(0);

  // a whole clean performance is scored and kept
  await page.getByTestId('play').click();
  await perform(page);
  await expect(page.getByTestId('pass-score')).toHaveText('100%', { timeout: 30_000 });
  await expect(page.getByTestId('pass')).toContainText('First performance');
  await expect(page.getByTestId('not-kept')).toHaveCount(0);
  // a second one, with nothing played
  await page.getByRole('button', { name: 'Again' }).click();
  await expect(page.getByTestId('pass-score')).toHaveText('0%', { timeout: 30_000 });
  await expect(page.getByTestId('pass')).toContainText('Best 100%');

  // the library shows the best one; it is still there after a reload (comes from the database)
  await page.goto('./?mockmidi#/');
  await page.reload();
  const badge = page.getByTestId('best');
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText('100%');
  await badge.click();
  await expect(page.getByTestId('progress-dot')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // practising the same song adds nothing
  await page.getByTestId('practise-test-c').click();
  await page.waitForFunction(() => !!window.__klavir);
  await page.getByTestId('mode-tempo').click();
  await page.getByTestId('hands-both').click();
  await page.getByTestId('speed-number').fill('150');
  await page.getByTestId('speed-number').blur();
  await until(page, () => window.__klavir!.transport.rate === 1.5);
  await page.getByTestId('play').click();
  await expect(page.getByTestId('not-kept')).toBeVisible({ timeout: 30_000 });
  await page.goto('./?mockmidi#/');
  await page.getByTestId('best').click();
  await expect(page.getByTestId('progress-dot')).toHaveCount(1);
  await page.locator('.progress-plot').hover();
  await expect(page.getByTestId('progress-tip')).toContainText('2 performances');
});

test('perform with one hand is scored on its own; the last performance can be reviewed and heard later', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page, { mode: 'tempo' }, 'ode-to-joy');
  await page.goto('./?mockmidi#/perform/ode-to-joy/original/R');
  await page.waitForFunction(() => !!window.__klavir);
  await until(page, () => window.__klavir!.session.config.handMask === 2);
  await expect(page.getByTestId('hands-R')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('review-button')).toBeDisabled();
  await page.getByTestId('play').click();
  // hands cannot be switched while it runs
  await page.getByTestId('hands-L').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__klavir!.session.config.handMask)).toBe(2);
  // the right hand, every note 30 ms late and with the pedal pressed once
  const played = await page.evaluate(() => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, hand, count } = session.song;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (!hand[i]) continue;
      n++;
      const on = transport.wallAt(start[i]!) + 30;
      const off = transport.wallAt(end[i]!) - 30;
      setTimeout(() => window.__midi!.noteOn(pitch[i]!, 70 + (i % 5), on), on - performance.now());
      setTimeout(() => window.__midi!.noteOff(pitch[i]!, off), off - performance.now());
    }
    const ped = transport.wallAt(1) - performance.now();
    setTimeout(() => window.__midi!.pedal(true), ped);
    setTimeout(() => window.__midi!.pedal(false), ped + 700);
    return n;
  });
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('pass')).toContainText('First performance');
  const score = Number(await page.getByTestId('pass').getAttribute('data-score'));
  expect(score).toBeGreaterThan(90);
  // everything he did was recorded: a press and a release per note, pedal down and up
  const rec = await page.evaluate(() => {
    const s = window.__klavir!.session;
    const keys = [...s.recKey.slice(0, s.recCount)];
    const vels = [...s.recVel.slice(0, s.recCount)];
    return {
      ons: keys.filter((k, i) => k < 128 && vels[i]! > 0).length,
      offs: keys.filter((k, i) => k < 128 && vels[i] === 0).length,
      pedal: keys.filter((k) => k === 128).length,
      ordered: [...s.recTime.slice(0, s.recCount)].every((t, i, a) => i === 0 || t >= a[i - 1]!),
    };
  });
  expect(rec).toEqual({ ons: played, offs: played, pedal: 2, ordered: true });

  // library: marked as a right-hand score
  await page.goto('./?mockmidi#/');
  await expect(page.getByTestId('best')).toHaveText(`R ${score}%`);

  // a new visit: no result card, but Review opens that performance and plays it back
  await page.goto('./?mockmidi#/perform/ode-to-joy/original/R');
  await page.reload();
  await page.waitForFunction(() => !!window.__klavir);
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('review-button')).toBeEnabled();
  await expect(page.getByTestId('pass')).toHaveCount(0);
  await page.getByTestId('review-button').click();
  await expect(page.getByTestId('review-text')).toContainText('on time');
  const before = await page.evaluate(() => window.__midi!.sent.length);
  await page.getByTestId('review-play').click();
  await expect(page.getByTestId('review-play')).toHaveText('Stop');
  await page.waitForTimeout(4000);
  // what comes out is what went in: same pitches and velocities, at the recorded moments
  const heard = await page.evaluate((from) => {
    const k = window.__klavir!;
    const ons = window.__midi!.sent.slice(from).filter((m) => m.data[0] === 0x92);
    const snapOns: number[][] = [];
    const s = k.view.review!;
    for (let i = 0; i < s.recKey.length; i++)
      if (s.recKey[i]! < 128 && s.recVel[i]! > 0)
        snapOns.push([s.recKey[i]!, s.recVel[i]!, k.transport.wallAt(s.recTime[i]!)]);
    return {
      count: ons.length,
      same: ons.every(
        (m, i) =>
          m.data[1] === snapOns[i]![0] &&
          m.data[2] === snapOns[i]![1] &&
          Math.abs(m.time - snapOns[i]![2]!) < 3,
      ),
      moving: k.transport.playing,
    };
  }, before);
  expect(heard.count).toBeGreaterThan(4);
  expect(heard.same, 'pitch, velocity and timing match the recording').toBe(true);
  expect(heard.moving).toBe(true);
  await expect(page.getByTestId('review-pos')).not.toHaveText(/^1 \//);
  await page.getByTestId('review-play').click();
  await until(page, () => !window.__klavir!.transport.playing);
  const quiet = await page.evaluate(() => window.__midi!.sent.length);
  await page.waitForTimeout(600);
  const after = await page.evaluate(
    (n) => window.__midi!.sent.slice(n).filter((m) => m.data[0] === 0x92).length,
    quiet,
  );
  expect(after, 'silent once stopped').toBe(0);
  await page.getByTestId('review-close').click();

  // the other hand has no performance yet
  await page.getByTestId('hands-L').click();
  await until(page, () => window.__klavir!.session.config.handMask === 1);
  await expect(page.getByTestId('review-button')).toBeDisabled();
});

test('ready to perform: a clean whole pass at full speed offers the performance', async ({
  page,
}) => {
  await open(page, { mode: 'tempo', speed: 0.95 }, 'test-c');
  await page.getByTestId('play').click();
  await perform(page);
  await expect(page.getByTestId('pass-score')).toHaveText('100%', { timeout: 30_000 });
  await expect(page.getByTestId('ready'), 'not at 95 % speed').toHaveCount(0);
  await page.getByTestId('speed-number').fill('100');
  await page.getByTestId('speed-number').blur();
  await until(page, () => window.__klavir!.transport.rate === 1);
  await page.getByRole('button', { name: 'Again' }).click();
  await until(page, () => window.__klavir!.session.running);
  await perform(page);
  await expect(page.getByTestId('ready')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('ready-perform').click();
  await expect(page.getByTestId('perform-badge')).toBeVisible();
  await page.waitForFunction(() => window.__klavir?.session.config.handMask === 3);
  expect(page.url()).toContain('#/perform/test-c/original');
});

test('practice days: playing time is counted per day and shown as a streak and a calendar', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('klavir.days')) return;
    const key = (back: number) => {
      const d = new Date();
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, 12);
      const two = (v: number) => String(v).padStart(2, '0');
      return `${x.getFullYear()}-${two(x.getMonth() + 1)}-${two(x.getDate())}`;
    };
    localStorage.setItem(
      'klavir.days',
      JSON.stringify({ [key(1)]: 1500, [key(2)]: 300, [key(4)]: 2400, [key(0)]: 55 }),
    );
  });
  await page.goto('./?mockmidi#/');
  // today has 55 s so far: not a practice day yet, the two days before still count
  await expect(page.getByTestId('streak')).toHaveText('2 days in a row');
  await expect(page.getByTestId('week')).toHaveText('1 h 11 min this week');
  await expect(page.locator('.days-cell[data-level="3"]')).toHaveCount(1);
  await expect(page.locator('.days-cell[data-level="2"]')).toHaveCount(1);
  await expect(page.locator('.days-cell[data-level="1"]')).toHaveCount(1);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  // 12 seconds of playing today takes it over the minute
  await page.getByTestId('midi-connect').click();
  await page.getByTestId('practise-ode-to-joy').click();
  await page.waitForFunction(() => !!window.__klavir);
  await page.getByTestId('mode-tempo').click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(12_500);
  await page.getByTestId('play').click();
  await page.goto('./?mockmidi#/');
  await expect(page.getByTestId('streak')).toHaveText('3 days in a row');
  // listening is not playing
  await page.getByTestId('practise-test-c').click();
  await page.waitForFunction(() => !!window.__klavir);
  // read after the first player is gone: it adds its last seconds when it closes
  const before = await page.evaluate(() => localStorage.getItem('klavir.days'));
  await page.getByTestId('listen').click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(3000);
  await page.goto('./?mockmidi#/');
  await expect(page.getByTestId('streak')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('klavir.days'))).toBe(before);
});

test("progress chart: one dot per day at that day's best performance", async ({ page }) => {
  await page.goto('./?mockmidi#/');
  await expect(page.getByTestId('perform-ode-to-joy')).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const day = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
        const rows = [
          [day(8, 9), 41],
          [day(8, 10), 55],
          [day(10, 9), 63],
          [day(11, 20), 58],
          [day(13, 18), 84],
          [day(13, 19), 79],
        ];
        const req = indexedDB.open('klavir');
        req.onsuccess = () => {
          const tx = req.result.transaction('performances', 'readwrite');
          for (const [at, score] of rows)
            tx.objectStore('performances').add({ song: 'ode-to-joy/original', at, score });
          // records without hands count as both; one left-hand run goes on its own tab
          tx.objectStore('performances').add({
            song: 'ode-to-joy/original',
            at: day(13, 20),
            score: 97,
            hands: 'L',
          });
          tx.oncomplete = () => {
            req.result.close();
            done();
          };
        };
      }),
  );
  await page.reload();
  const badge = page.getByTestId('best');
  await expect(badge).toHaveText('84%');
  await badge.click();
  const dots = page.getByTestId('progress-dot');
  await expect(dots).toHaveCount(4);
  // dots sit at the best score of each day: higher score = higher on the chart
  const ys = await dots.evaluateAll((els) => els.map((e) => Number(e.getAttribute('cy'))));
  expect(ys[0]! > ys[1]! && ys[1]! < ys[2]! && ys[3]! < ys[1]!, '55, 63, 58, 84').toBe(true);
  const box = (await dots.nth(0).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await expect(page.getByTestId('progress-tip')).toHaveText('55%8 Nov2 performances');
  await page.getByTestId('progress-L').click();
  await expect(dots).toHaveCount(1);
  await page.getByTestId('progress-both').click();
  await expect(dots).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('progress')).toHaveCount(0);
});

test('speed can be typed; Review is on the toolbar once a pass exists; Wait mode shows no percent', async ({
  page,
}) => {
  await open(page, { mode: 'wait' }, 'test-c');
  const box = page.getByTestId('speed-number');
  await box.fill('73');
  await box.press('Enter');
  await until(page, () => window.__klavir!.transport.rate === 0.73);
  await expect(page.getByTestId('speed')).toHaveValue('73');
  await box.fill('400'); // out of range: clamped
  await box.blur();
  await until(page, () => window.__klavir!.transport.rate === 1.5);
  await expect(box).toHaveValue('150');
  await box.fill('');
  await box.blur();
  await expect(box, 'empty keeps the speed').toHaveValue('150');
  // the tempo in beats a minute (test-c is written at 60): shown, and typed it sets the speed
  const bpm = page.getByTestId('bpm-number');
  await expect(bpm).toHaveValue('90');
  await bpm.fill('45');
  await bpm.press('Enter');
  await until(page, () => window.__klavir!.transport.rate === 0.75);
  await expect(box).toHaveValue('75');
  // typing digits in the box must not trigger the 1/2/3 hand shortcuts
  expect(await page.evaluate(() => window.__klavir!.session.config.handMask)).toBe(3);

  await expect(page.getByTestId('review-button')).toBeDisabled();
  await page.getByTestId('play').click();
  // wait mode: press each note when the song stops for it
  await page.evaluate(async () => {
    const { session } = window.__klavir!;
    const { pitch, count } = session.song;
    for (let i = 0; i < count; i++) {
      while (!session.waiting) await new Promise((r) => setTimeout(r, 20));
      window.__midi!.noteOn(pitch[i]!);
      await new Promise((r) => setTimeout(r, 150));
      window.__midi!.noteOff(pitch[i]!);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await expect(page.getByTestId('pass')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pass-score'), 'no percent in Wait mode').toHaveCount(0);
  await expect(page.getByTestId('hud-score')).toHaveCount(0);
  await expect(page.getByTestId('not-kept')).toBeVisible();
  await expect(page.getByTestId('verdict')).not.toBeEmpty();
  await page.getByTestId('review-button').click();
  await expect(page.getByTestId('review-text')).toBeVisible();
  await page.getByTestId('review-close').click();
  await expect(page.getByTestId('pass')).toBeVisible();
});

test('video: a YouTube link can be added, is shown in the app, changed and removed', async ({
  page,
}) => {
  await page.route('**/*youtube*/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto('./?mockmidi#/');
  const button = page.getByTestId('video-ode-to-joy');
  await expect(button).toHaveText('+ Video');
  await button.click();
  await expect(page.getByTestId('video-frame')).toHaveCount(0);
  const link = page.getByTestId('video-link');
  await link.fill('https://example.com/watch?v=dQw4w9WgXcQ');
  await expect(page.getByTestId('video-save'), 'not a YouTube link').toBeDisabled();
  await link.fill('https://youtu.be/dQw4w9WgXcQ?si=x');
  await page.getByTestId('video-save').click();
  await expect(page.getByTestId('video-frame')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  await page.keyboard.press('Escape');
  await expect(button).toHaveText('Video');
  await page.reload();
  await expect(button, 'remembered').toHaveText('Video');
  await expect(page.getByTestId('video-test-c'), 'per song').toHaveText('+ Video');
  await button.click();
  await expect(page.getByTestId('video-frame')).toBeVisible();
  await link.fill('');
  await expect(page.getByTestId('video-save')).toHaveText('Remove');
  await page.getByTestId('video-save').click();
  await expect(page.getByTestId('video-frame')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(button).toHaveText('+ Video');
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
