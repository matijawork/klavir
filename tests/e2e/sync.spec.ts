/** Two browsers (two "devices") against one stand-in cloud: what one does, the other gets. */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

type Cloud = Map<string, Record<string, unknown>>;

/** Answers the app's cloud requests from one shared map; `down` makes every request fail. */
async function attach(context: BrowserContext, cloud: Cloud, net: { down: boolean; puts: number }) {
  await context.route('**/__cloud/**', async (route) => {
    if (net.down) return route.abort('internetdisconnected');
    const req = route.request();
    const [user, collection, id] = new URL(req.url()).pathname.split('/__cloud/')[1]!.split('/');
    const key = `${user}/${collection}`;
    const docs = cloud.get(key) ?? {};
    if (req.method() === 'PUT') {
      net.puts++;
      cloud.set(key, { ...docs, ...(req.postDataJSON() as Record<string, unknown>) });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: id ? (docs[decodeURIComponent(id)] ?? null) : docs });
  });
}

async function device(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (!localStorage.getItem('klavir.settings'))
      localStorage.setItem(
        'klavir.settings',
        JSON.stringify({ countIn: false, soundOut: 'piano', monitor: false }),
      );
  });
  await page.goto('./?mockmidi&mocksync#/');
  return page;
}

const synced = (page: Page) =>
  expect(page.getByTestId('sync-chip')).toHaveText(/Synced \d\d:\d\d/, { timeout: 15_000 });

/** A clean right-hand performance of the three-note test pattern. */
async function performTestC(page: Page) {
  const connect = page.getByTestId('midi-connect');
  if (await connect.isVisible()) await connect.click();
  await page.getByTestId('perform-test-c').click();
  await page.waitForFunction(() => !!window.__klavir);
  await page.getByTestId('play').click();
  await page.evaluate(() => {
    const { session, transport } = window.__klavir!;
    const { start, end, pitch, count } = session.song;
    for (let i = 0; i < count; i++) {
      const on = transport.wallAt(start[i]!);
      const off = transport.wallAt(end[i]!) - 40;
      setTimeout(() => window.__midi!.noteOn(pitch[i]!, 77, on), on - performance.now());
      setTimeout(() => window.__midi!.noteOff(pitch[i]!, off), off - performance.now());
    }
  });
  await expect(page.getByTestId('pass-score')).toHaveText('100%', { timeout: 30_000 });
  await page.goto('./?mockmidi&mocksync#/');
}

test('without a cloud nothing about sync is shown', async ({ page }) => {
  await page.goto('./?mockmidi#/');
  await expect(page.getByTestId('perform-test-c')).toBeVisible();
  await expect(page.getByTestId('sync-signin')).toHaveCount(0);
  await expect(page.getByTestId('sync-chip')).toHaveCount(0);
});

test('two devices end up with the same scores, days, video, marks and last performance', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const cloud: Cloud = new Map();
  const net = { down: false, puts: 0 };
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await attach(ctxA, cloud, net);
  await attach(ctxB, cloud, net);

  // device A: plays before ever signing in; all of it is only on the device
  const a = await device(ctxA);
  await performTestC(a);
  await a.getByTestId('video-ode-to-joy').click();
  await a.getByTestId('video-link').fill('https://youtu.be/dQw4w9WgXcQ');
  await a.getByTestId('video-save').click();
  await a.keyboard.press('Escape');
  await a.getByTestId('fingering-chip').first().click();
  await a.evaluate(() => {
    const d = new Date();
    const two = (v: number) => String(v).padStart(2, '0');
    const today = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
    localStorage.setItem('klavir.days', JSON.stringify({ [today]: 600 }));
  });
  await a.reload();
  expect(cloud.size, 'nothing leaves the device before sign-in').toBe(0);
  await expect(a.getByTestId('best')).toHaveText('100%');

  // signing in sends what was already there
  await a.getByTestId('sync-signin').click();
  await synced(a);
  expect(Object.keys(cloud.get('tester/performances')!)).toHaveLength(1);

  // device B: a fresh browser, signs in, gets everything
  const b = await device(ctxB);
  await expect(b.getByTestId('best')).toHaveCount(0);
  await b.getByTestId('sync-signin').click();
  await synced(b);
  await expect(b.getByTestId('best')).toHaveText('100%');
  await expect(b.getByTestId('video-ode-to-joy')).toHaveText('Video');
  await expect(b.locator('.badge.trust[data-state="mine"]')).toHaveCount(1);
  await expect(b.getByTestId('week')).toHaveText('10 min this week');

  // the last performance from A can be reviewed and heard on B, note for note
  await b.getByTestId('midi-connect').click();
  await b.getByTestId('perform-test-c').click();
  await b.waitForFunction(() => !!window.__klavir);
  await expect(b.getByTestId('review-button')).toBeEnabled();
  await b.getByTestId('review-button').click();
  await expect(b.getByTestId('review-text')).toContainText('on time');
  const rec = await b.evaluate(() => {
    const s = window.__klavir!.view.review!;
    return {
      keys: [...s.recKey].length,
      vel: Math.max(...s.recVel),
      typed: s.recTime instanceof Float64Array && s.deviation instanceof Float32Array,
    };
  });
  expect(rec).toEqual({ keys: 6, vel: 77, typed: true });
  await b.goto('./?mockmidi&mocksync#/');
  await synced(b);

  // B changes things while offline: kept on the device, said in words, sent when back
  net.down = true;
  await b.getByTestId('video-ode-to-joy').click();
  await b.getByTestId('video-link').fill('');
  await b.getByTestId('video-save').click();
  await b.keyboard.press('Escape');
  await expect(b.getByTestId('sync-chip')).toHaveText('Not synced', { timeout: 15_000 });
  await expect(b.getByTestId('sync-chip')).toHaveAttribute('title', /No connection/);
  await expect(b.getByTestId('video-ode-to-joy')).toHaveText('+ Video');
  await performTestC(b);
  await expect(b.getByTestId('best')).toHaveText('100%');
  net.down = false;
  await b.getByTestId('sync-chip').click();
  await b.getByTestId('sync-now').click();
  await synced(b);
  expect(Object.keys(cloud.get('tester/performances')!)).toHaveLength(2);

  // A picks it up: the removal of the video wins (it is the later change), both scores are there
  await a.getByTestId('sync-chip').click();
  await a.getByTestId('sync-now').click();
  await expect(a.getByTestId('video-ode-to-joy')).toHaveText('+ Video', { timeout: 15_000 });
  await a.getByTestId('best').click();
  await a.locator('.progress-plot').hover();
  await expect(a.getByTestId('progress-tip')).toContainText('2 performances');
  await a.keyboard.press('Escape');

  // practice time of the two devices adds up, and syncing again does not count it twice
  await b.evaluate(() => {
    const d = new Date();
    const two = (v: number) => String(v).padStart(2, '0');
    const today = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
    const own = JSON.parse(localStorage.getItem('klavir.days') ?? '{}');
    localStorage.setItem('klavir.days', JSON.stringify({ ...own, [today]: 300 }));
  });
  await b.reload();
  await synced(b);
  await expect(b.getByTestId('week')).toHaveText('15 min this week');
  for (let i = 0; i < 2; i++) {
    await a.reload();
    await synced(a);
  }
  await expect(a.getByTestId('week')).toHaveText('15 min this week');

  // nothing left to say: another full sync on both sends nothing
  const before = net.puts;
  await a.reload();
  await synced(a);
  await b.reload();
  await synced(b);
  expect(net.puts, 'a sync with nothing new writes nothing').toBe(before);

  // signing out keeps what is on the device and stops sending
  await a.getByTestId('sync-chip').click();
  await a.getByTestId('sync-signout').click();
  await expect(a.getByTestId('sync-signin')).toBeVisible();
  await expect(a.getByTestId('best')).toHaveText('100%');
  await ctxA.close();
  await ctxB.close();
});
