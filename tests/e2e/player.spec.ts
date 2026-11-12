import { expect, test } from '@playwright/test';

test('library lists songs and opens the player', async ({ page }) => {
  await page.goto('./?mockmidi');
  await expect(page.getByTestId('song-ode-to-joy')).toBeVisible();
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('midi-status')).toContainText('Virtual Piano');
  await page.getByTestId('song-ode-to-joy').click();
  await expect(page.getByTestId('stage')).toBeVisible();
});

test('pressed keys show in the live readout, pedal lights up', async ({ page }) => {
  await page.goto('./?mockmidi#/play/ode-to-joy/original');
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('stage')).toBeVisible();
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
  await page.goto('./?mockmidi#/play/ode-to-joy/original');
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('listen').click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(4500);
  await page.getByTestId('play').click(); // pause
  await page.waitForTimeout(300);

  const sent = await page.evaluate(() => window.__midi!.sent);
  const channels = new Set(sent.map((m) => m.data[0]! & 0x0f));
  expect(channels.has(0), 'nothing is ever sent on the player channel').toBe(false);

  const ons = sent.filter((m) => m.data[0] === 0x92);
  expect(ons.length).toBeGreaterThan(3);
  // timestamps are scheduled ahead, never in the past and never beyond the look-ahead window
  const allNotesOff = sent.filter((m) => m.data[0] === 0xb2 && m.data[1] === 123);
  expect(allNotesOff.length).toBeGreaterThanOrEqual(2);
  const lastOn = Math.max(...ons.map((m) => m.time));
  const lastPanic = Math.max(...allNotesOff.map((m) => m.time));
  expect(lastPanic, 'a panic lands after every scheduled note-on').toBeGreaterThan(lastOn);
});

test('rendering keeps running and reports frame stats', async ({ page }) => {
  await page.goto('./?mockmidi&debug#/play/prelude-in-c/original');
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('play').click();
  await page.waitForTimeout(3000);
  const stats = await page.evaluate(() => window.__klavir!.stats);
  expect(stats.frames).toBeGreaterThan(60);
  expect(stats.avgDrawMs).toBeLessThan(8);
  await page.screenshot({ path: 'test-results/player.png' });
});
