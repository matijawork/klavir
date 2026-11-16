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

test('each song says what is checked and how; the player marks what he checked himself', async ({
  page,
}) => {
  await page.route('**/songs/index.json', (route) =>
    route.fulfill({
      json: [
        {
          ...entry('c-ref', 'arranger'),
          source: { url: 'musescore.com, downloaded by Matija', license: 'unknown' },
          checks: {
            hands: 'score',
            tempo: 'score',
            bpm: 100,
            key: 'guessed',
            reference: { file: 'r.mid', of: 100, matched: 98, twins: 2, extra: 0, otherHand: 0 },
          },
        },
        entry('c-old', null),
      ],
    }),
  );
  await page.goto('/klavir/?nosync');
  const badge = page.getByTestId('checks-c-ref');
  await expect(badge).toHaveText('? 4 of 7 checked');
  await expect(page.getByTestId('checks-c-old')).toHaveText('? 0 of 3 checked');
  await expect(page.getByTestId('song-key').first()).toHaveText('A minor ?');
  // a source that is not a web address is not a broken link
  await expect(page.locator('.card').first().getByRole('link', { name: 'Source' })).toHaveCount(0);
  await expect(page.locator('.card').nth(1).getByRole('link', { name: 'Source' })).toHaveCount(1);

  await badge.click();
  const dialog = page.getByTestId('checks');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('check-notes')).toHaveAttribute('data-state', 'source');
  await expect(dialog.getByTestId('check-notes')).toContainText('All 100 notes');
  await expect(dialog.getByTestId('check-key')).toHaveAttribute('data-state', 'open');
  await expect(dialog.getByTestId('check-pedal')).toHaveAttribute('data-state', 'source');
  await expect(dialog).toContainText('musescore.com, downloaded by Matija');
  await dialog.getByTestId('check-mark-ear').click();
  await expect(dialog.getByTestId('check-ear')).toHaveAttribute('data-state', 'mine');
  await dialog.getByTestId('check-mark-fingering').click();
  await expect(dialog.getByTestId('check-fingering')).toHaveAttribute('data-state', 'mine');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(badge).toHaveText('? 6 of 7 checked');
  await page.reload();
  await expect(badge).toHaveText('? 6 of 7 checked');
  await expect(page.locator('.card').first().getByTestId('fingering-chip')).toHaveAttribute(
    'data-state',
    'mine',
  );
});
