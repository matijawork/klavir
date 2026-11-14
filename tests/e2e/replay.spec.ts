import { expect, test } from '@playwright/test';

test('replay is heard through the computer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'klavir.settings',
      JSON.stringify({ countIn: false, soundOut: 'computer', monitor: false, mode: 'tempo' }),
    );
  });
  await page.goto('./?mockmidi#/play/test-c/original');
  await page.getByTestId('midi-connect').click();
  await page.waitForFunction(() => !!window.__klavir);
  await page.getByTestId('stage').click({ position: { x: 40, y: 200 } });
  await page.waitForFunction(() => window.__klavir!.level().loaded === 30, null, {
    timeout: 20_000,
  });
  await page.getByTestId('play').click();
  await page.evaluate(() => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, count } = session.song;
    for (let i = 0; i < count; i++) {
      const on = transport.wallAt(start[i]!);
      const off = transport.wallAt(end[i]!) - 30;
      setTimeout(() => window.__midi!.noteOn(pitch[i]!, 90, on), on - performance.now());
      setTimeout(() => window.__midi!.noteOff(pitch[i]!, off), off - performance.now());
    }
  });
  await expect(page.getByTestId('pass-score')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500); // monitor is off, so nothing should sound before the replay
  const silent = await page.evaluate(() => window.__klavir!.level().peak);
  await page.getByTestId('review-button').click();
  await page.getByTestId('review-play').click();
  const peak = await page.evaluate(async () => {
    let p = 0;
    const end = performance.now() + 2500;
    while (performance.now() < end) {
      p = Math.max(p, window.__klavir!.level().peak);
      await new Promise((r) => setTimeout(r, 15));
    }
    return p;
  });
  expect(silent).toBeLessThan(0.02);
  expect(peak).toBeGreaterThan(0.2);
});
