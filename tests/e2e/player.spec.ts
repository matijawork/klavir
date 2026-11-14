import { expect, type Page, test } from '@playwright/test';

/** Opens a song with the virtual piano connected and the given practice settings. */
async function open(page: Page, settings: Record<string, unknown> = {}, song = 'ode-to-joy') {
  await page.addInitScript(
    (s) => {
      localStorage.setItem('klavir.settings', JSON.stringify(s));
    },
    { countIn: false, soundOut: 'piano', monitor: false, ...settings },
  );
  await page.goto(`./?mockmidi#/play/${song}/original`);
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.waitForFunction(() => !!window.__klavir);
}

/** Selects the first measures on the ruler by dragging. */
async function selectStart(page: Page, fraction = 0.1) {
  const box = (await page.getByTestId('timeline').boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
}

/** Plays every expected note of the practised section through the virtual piano, shifted by offsetMs. */
const perform = (page: Page, offsetMs = 0) =>
  page.evaluate((offset) => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, hand, count } = session.song;
    for (let i = 0; i < count; i++) {
      if (start[i]! < session.rangeStart - 1e-6 || start[i]! >= session.rangeEnd - 1e-6) continue;
      if (!(session.config.handMask & (1 << hand[i]!))) continue;
      const delay = transport.wallAt(start[i]!) + offset - performance.now();
      setTimeout(() => window.__midi!.noteOn(pitch[i]!), Math.max(0, delay));
      const held = transport.wallAt(end[i]!) - transport.wallAt(start[i]!) - 40;
      setTimeout(() => window.__midi!.noteOff(pitch[i]!), Math.max(0, delay) + held);
    }
  }, offsetMs);

test('library lists songs and opens the player', async ({ page }) => {
  await page.goto('./?mockmidi');
  await expect(page.getByTestId('song-ode-to-joy')).toBeVisible();
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('midi-status')).toContainText('Virtual Piano');
  await page.getByTestId('song-ode-to-joy').click();
  await expect(page.getByTestId('stage')).toBeVisible();
});

test('pressed keys show in the live readout, pedal lights up', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__midi!.noteOn(60);
    window.__midi!.noteOn(64);
  });
  await expect(page.getByTestId('live-input')).toContainText('C4');
  await expect(page.getByTestId('live-input')).toContainText('E4');
  await page.evaluate(() => window.__midi!.noteOff(60));
  await expect(page.getByTestId('live-input')).not.toContainText('C4');
  await page.evaluate(() => window.__midi!.pedal(true));
  await expect(page.locator('.pedal-dot')).toHaveAttribute('data-on', 'true');
});

test('listen mode sends notes on the playback channel and leaves none hanging', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('listen').click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(4000);
  await page.getByTestId('play').click(); // pause
  await page.waitForTimeout(300);

  const sent = await page.evaluate(() => window.__midi!.sent);
  const channels = new Set(sent.map((m) => m.data[0]! & 0x0f));
  expect(channels.has(0), 'nothing is ever sent on the player channel').toBe(false);
  const ons = sent.filter((m) => m.data[0] === 0x92);
  expect(ons.length).toBeGreaterThan(3);
  const allNotesOff = sent.filter((m) => m.data[0] === 0xb2 && m.data[1] === 123);
  const lastOn = Math.max(...ons.map((m) => m.time));
  const lastPanic = Math.max(...allNotesOff.map((m) => m.time));
  expect(lastPanic, 'a panic lands after every scheduled note-on').toBeGreaterThan(lastOn);
});

test('wait mode holds the song until the right keys are pressed', async ({ page }) => {
  await open(page, { mode: 'wait' });
  await page.getByTestId('play').click();
  await page.waitForFunction(() => window.__klavir!.session.waiting);
  const held = await page.evaluate(() => window.__klavir!.transport.time());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__klavir!.transport.time())).toBe(held);

  // a wrong key does not release it
  await page.evaluate(() => window.__midi!.noteOn(22));
  expect(await page.evaluate(() => window.__klavir!.session.waiting)).toBe(true);
  expect(await page.evaluate(() => window.__klavir!.session.wrong)).toBe(1);

  // the keys of the first chord do
  await page.evaluate(() => {
    const { session } = window.__klavir!;
    const { start, pitch, count } = session.song;
    for (let i = 0; i < count; i++)
      if (Math.abs(start[i]! - session.gateTime) < 1e-4) window.__midi!.noteOn(pitch[i]!);
  });
  await page.waitForFunction((t) => window.__klavir!.transport.time() > t, held);
  expect(await page.evaluate(() => window.__klavir!.session.hits)).toBeGreaterThan(0);
});

test('tempo mode: a clean pass of a section scores 100 %', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page);
  await page.getByTestId('loop').click(); // selecting turned loop on; turn it off for a single pass
  await page.getByTestId('play').click();
  await perform(page);
  await expect(page.getByTestId('pass-score')).toHaveText('100%', { timeout: 20_000 });
});

test('tempo mode: playing nothing scores 0 % and the loop restarts', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page, 0.05);
  await page.getByTestId('play').click();
  await expect(page.getByTestId('pass-score')).toHaveText('0%', { timeout: 20_000 });
  expect(await page.evaluate(() => window.__klavir!.session.running)).toBe(true);
});

test('tempo mode: playing 160 ms late still counts, graded late', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page, 0.05);
  await page.getByTestId('loop').click();
  await page.getByTestId('play').click();
  await perform(page, 160);
  await expect(page.getByTestId('hud')).toContainText('late', { timeout: 20_000 });
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 20_000 });
  const score = Number(await page.getByTestId('pass').getAttribute('data-score'));
  expect(score).toBeGreaterThan(50);
  expect(score).toBeLessThan(100);
  const r = await page.evaluate(() => window.__klavir!.session.result(true));
  expect(r.hits).toBe(r.expected);
  expect(r.late).toBe(r.expected);
  expect(r.wrong).toBe(0);
});

test('a wrong key shows up at once and lowers the score', async ({ page }) => {
  await open(page, { mode: 'tempo' }, 'test-c');
  await page.getByTestId('play').click();
  await page.waitForFunction(() => window.__klavir!.transport.time() > 0.5);
  await page.evaluate(() => window.__midi!.noteOn(60));
  await expect(page.getByTestId('hud')).toContainText('1 wrong');
  expect(await page.evaluate(() => window.__klavir!.session.wrongDown[60])).toBe(1);
  await page.evaluate(() => window.__midi!.noteOff(60));
  // changing the volume must not restart the pass
  const before = await page.evaluate(() => window.__klavir!.transport.time());
  await page.locator('summary[title="Display and sound"]').click();
  await page.getByLabel('Volume', { exact: true }).fill('2');
  expect(await page.evaluate(() => window.__klavir!.transport.time())).toBeGreaterThanOrEqual(
    before,
  );
  expect(await page.evaluate(() => window.__klavir!.session.wrong)).toBe(1);
});

test('count-in and metronome click on their own channel', async ({ page }) => {
  await open(page, { mode: 'tempo', countIn: true, metronome: true });
  await page.getByTestId('play').click();
  await page.waitForTimeout(4000);
  await page.getByTestId('play').click();
  const clicks = await page.evaluate(() => window.__midi!.sent.filter((m) => m.data[0] === 0x93));
  expect(clicks.length).toBeGreaterThanOrEqual(4);
  expect(clicks[0]!.data[1], 'first click is the accent').toBe(96);
  const gaps = clicks.slice(1).map((c, i) => c.time - clicks[i]!.time);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  for (const g of gaps) expect(Math.abs(g - mean), 'clicks are evenly spaced').toBeLessThan(2);
});

test('the other hand can be played by the piano', async ({ page }) => {
  await open(page, { mode: 'tempo', hands: 'R', otherHand: 'play', speed: 1.5 });
  await page.getByTestId('play').click();
  await page.waitForTimeout(3500);
  await page.getByTestId('play').click();
  const result = await page.evaluate(() => {
    const { song } = window.__klavir!.session;
    const left = new Set<number>();
    const rightOnly = new Set<number>();
    for (let i = 0; i < song.count; i++) (song.hand[i] ? rightOnly : left).add(song.pitch[i]!);
    for (const p of left) rightOnly.delete(p);
    const ons = window.__midi!.sent.filter((m) => m.data[0] === 0x92).map((m) => m.data[1]!);
    return { count: ons.length, leaked: ons.filter((p) => rightOnly.has(p)).length };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.leaked, 'no right-hand notes are sent').toBe(0);
});

test('rendering keeps running and reports frame stats', async ({ page }) => {
  await open(page, { mode: 'tempo', countIn: true, noteNames: 'all' }, 'prelude-in-c');
  await page.getByTestId('play').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/countin.png' });
  await page.waitForTimeout(3500);
  const stats = await page.evaluate(() => window.__klavir!.stats);
  expect(stats.frames).toBeGreaterThan(60);
  expect(stats.avgDrawMs).toBeLessThan(8);
  await page.screenshot({ path: 'test-results/player.png' });
});

test('result card says in words what to work on and offers the weak spot', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page, 0.3);
  await page.getByTestId('loop').click();
  await page.getByTestId('play').click();
  // play everything except the notes of the second measure
  await page.evaluate(() => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, count, measureStart } = session.song;
    for (let i = 0; i < count; i++) {
      if (start[i]! >= session.rangeEnd - 1e-6) continue;
      if (start[i]! >= measureStart[1]! - 1e-6 && start[i]! < measureStart[2]! - 1e-6) continue;
      const delay = Math.max(0, transport.wallAt(start[i]!) - performance.now());
      setTimeout(() => window.__midi!.noteOn(pitch[i]!), delay);
      const len = transport.wallAt(end[i]!) - transport.wallAt(start[i]!) - 40;
      setTimeout(() => window.__midi!.noteOff(pitch[i]!), delay + len);
    }
  });
  await expect(page.getByTestId('tips')).toContainText('You skipped', { timeout: 30_000 });
  await expect(page.getByTestId('verdict')).not.toBeEmpty();
  await expect(page.getByTestId('practise-weak')).toContainText('measure 2');
  await page.getByTestId('practise-weak').click();
  // the section is applied on the next frame
  await page.waitForFunction(() => {
    const { config, running } = window.__klavir!.session;
    return config.range?.a === 1 && config.range.b === 1 && config.loop && running;
  });
});

test('strictness changes how a slightly late pass is judged', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5, strictness: 'easy' });
  await selectStart(page, 0.05);
  await page.getByTestId('loop').click();
  await page.getByTestId('play').click();
  await perform(page, 100);
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 20_000 });
  const easy = await page.evaluate(() => window.__klavir!.session.result(true).late);
  expect(easy).toBe(0);
  await page.getByTestId('strict-strict').click();
  await page.getByTestId('play').click();
  await perform(page, 100);
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 20_000 });
  const strict = await page.evaluate(() => window.__klavir!.session.result(true));
  expect(strict.late).toBe(strict.hits);
  await page.goto('./?mockmidi#/');
  await expect(page.getByTestId('song-ode-to-joy')).toBeVisible();
});

test('exercises: a scale opens in the player with fingering, best score shows in the library', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'klavir.settings',
      JSON.stringify({
        countIn: false,
        soundOut: 'piano',
        monitor: false,
        mode: 'tempo',
        speed: 1.5,
      }),
    );
  });
  await page.goto('./?mockmidi#/');
  await page.getByTestId('midi-connect').click();
  await page.getByTestId('key-7').click();
  await page.getByTestId('exercise-scale-major').click();
  await page.waitForFunction(() => !!window.__klavir);
  const info = await page.evaluate(() => {
    const { song } = window.__klavir!.session;
    return { count: song.count, first: [song.pitch[0], song.pitch[1]], finger: song.finger[1] };
  });
  expect(info.count).toBe(58);
  expect(info.first).toEqual([43, 55]);
  expect(info.finger).toBe(1);
  await page.getByTestId('play').click();
  await perform(page);
  await expect(page.getByTestId('pass-score')).toHaveText('100%', { timeout: 30_000 });
  await page.goto('./?mockmidi#/');
  await expect(page.locator('.badge.best')).toHaveText('100%');
});
