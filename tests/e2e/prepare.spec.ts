import { expect, test } from './fixtures';

const entry = (id: string, pedal: string | null, prepare?: object[]) => ({
  id,
  title: `Song ${id}`,
  composer: 'T',
  difficulty: 2,
  key: 'A minor',
  versions: [{ id: 'original', label: 'Original' }],
  youtube: null,
  source: { url: 'https://example.com', license: 'test' },
  durationSec: 10,
  noteCount: 3,
  fingering: 'claude',
  pedal,
  ...(prepare ? { prepare } : {}),
});

test('library shows where the pedal comes from and leads to the exercises to learn first', async ({
  page,
}) => {
  await page.route('**/songs/index.json', (route) =>
    route.fulfill({
      json: [
        entry('p-score', 'arranger', [
          { kind: 'arpeggio', key: 9, minor: true, why: 'because' },
          { kind: 'scale-major', key: 0, why: 'because' },
        ]),
        entry('p-guess', 'claude'),
        entry('p-none', null),
      ],
    }),
  );
  await page.goto('/klavir/?nosync');
  const chips = page.getByTestId('pedal-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveAttribute('data-state', 'source');
  await expect(chips.nth(1)).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('prepare-p-guess')).toHaveCount(0);
  const links = page.getByTestId('prepare-p-score').getByTestId('prepare-link');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', '#/exercise/arpeggio/9/minor');
  await expect(links.nth(1)).toHaveAttribute('href', '#/exercise/scale-major/0');
  await links.nth(0).click();
  await expect(page.getByTestId('play')).toBeVisible();
  await expect(page.locator('.song-title strong')).toHaveText('A minor: arpeggio');
});
