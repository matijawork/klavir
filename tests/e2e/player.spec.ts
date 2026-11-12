import { expect, type Page, test } from '@playwright/test';

/** Opens a song with the virtual piano connected and the given practice settings. */
async function open(page: Page, settings: Record<string, unknown> = {}, song = 'ode-to-joy') {
  await page.addInitScript(
    (s) => {
      localStorage.setItem('klavir.settings', JSON.stringify(s));
    },
    { countIn: false, ...settings },
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
    const { start, pitch, hand, count } = session.song;
    for (let i = 0; i < count; i++) {
      if (start[i]! < session.rangeStart - 1e-6 || start[i]! >= session.rangeEnd - 1e-6) continue;
      if (!(session.config.handMask & (1 << hand[i]!))) continue;
      const delay = transport.wallAt(start[i]!) + offset - performance.now();
      setTimeout(() => window.__midi!.noteOn(pitch[i]!), Math.max(0, delay));
      setTimeout(() => window.__midi!.noteOff(pitch[i]!), Math.max(0, delay) + 60);
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
  await expect(page.getByTestId('pass')).toContainText('100%', { timeout: 20_000 });
});

test('tempo mode: playing nothing scores 0 % and the loop restarts', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page, 0.05);
  await page.getByTestId('play').click();
  await expect(page.getByTestId('pass')).toContainText('0%', { timeout: 20_000 });
  expect(await page.evaluate(() => window.__klavir!.session.running)).toBe(true);
});

test('tempo mode: playing 160 ms late misses everything', async ({ page }) => {
  await open(page, { mode: 'tempo', speed: 1.5 });
  await selectStart(page, 0.05);
  await page.getByTestId('loop').click();
  await page.getByTestId('play').click();
  // outside the 80–120 ms window, and nowhere near the next note either
  await perform(page, 160);
  await expect(page.getByTestId('pass')).toContainText('0%', { timeout: 20_000 });
});

test('auto speed-up raises the speed after a clean looped pass', async ({ page }) => {
  await open(page, {
    mode: 'tempo',
    speed: 1,
    autoSpeed: true,
    autoSpeedStart: 1,
    autoSpeedStep: 0.1,
    autoSpeedTarget: 1.2,
  });
  await selectStart(page, 0.05);
  await page.getByTestId('play').click();
  await perform(page);
  await expect(page.locator('.speed output')).toHaveText('110%', { timeout: 20_000 });
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
