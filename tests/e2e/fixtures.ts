import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserContext, test as base } from '@playwright/test';

/**
 * Tests must not depend on the songs in Matija's library. These two pieces
 * (tests/fixtures/songs) are served on top of the real library, only inside
 * Playwright, so the library itself holds only what he wants to practise.
 */
const dir = join(import.meta.dirname, '..', 'fixtures', 'songs');
const extra = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { id: string }[];

export async function serveFixtureSongs(context: BrowserContext) {
  await context.route('**/songs/index.json', async (route) => {
    const real = (await (await route.fetch()).json()) as { id: string }[];
    const ids = new Set(real.map((s) => s.id));
    await route.fulfill({ json: [...real, ...extra.filter((s) => !ids.has(s.id))] });
  });
  for (const s of extra) {
    await context.route(`**/songs/${s.id}/original.json`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: readFileSync(join(dir, s.id, 'original.json')),
      }),
    );
  }
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await serveFixtureSongs(context);
    await use(context);
    // a song list still loading when the test ends has nobody left to serve
    await context.unrouteAll({ behavior: 'ignoreErrors' });
  },
});
export { expect } from '@playwright/test';
