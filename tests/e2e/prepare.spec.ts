import { expect, test } from './fixtures';

const entry = (id: string, extra: object = {}) => ({
  id,
  title: `Song ${id}`,
  composer: 'T',
  difficulty: 2,
  key: 'A minor',
  versions: [{ id: 'original', label: 'Original' }],
  youtube: null,
  source: { url: 'https://example.com', license: 'test' },
  durationSec: 10,
  noteCount: 100,
  fingering: 'claude',
  pedal: 'arranger',
  ...extra,
});

const checked = {
  checks: {
    hands: 'score',
    tempo: 'score',
    bpm: 100,
    key: 'source',
    keySource: { site: 'Musicnotes', url: 'https://example.com' },
    reference: {
      file: 'r.mid',
      of: 100,
      matched: 98,
      twins: 2,
      extra: 0,
      otherHand: 0,
      pedalOf: 6,
      pedalMatched: 6,
    },
  },
  chords: [
    { root: 9, minor: true, count: 12 },
    { root: 5, minor: false, count: 6 },
  ],
};

test('Keys opens the key and the chords of a song; each one leads to its exercise', async ({
  page,
}) => {
  await page.route('**/songs/index.json', (route) =>
    route.fulfill({ json: [entry('k', checked)] }),
  );
  await page.goto('/klavir/?nosync');
  await page.getByTestId('keys-k').click();
  const dialog = page.getByTestId('keys');
  await expect(dialog).toBeVisible();
  const groups = dialog.getByTestId('keys-group');
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toContainText('A minor');
  await expect(groups.nth(0)).toContainText('as Musicnotes gives it');
  await expect(groups.nth(0).getByTestId('keys-link')).toHaveText([
    'Scale',
    'Five-finger',
    'Chord progression',
  ]);
  await expect(groups.nth(2)).toContainText('F major');
  await expect(groups.nth(2)).toContainText('Chord in 6 measures');
  await expect(groups.nth(0).getByTestId('keys-link').first()).toHaveAttribute(
    'href',
    '#/exercise/scale-minor/9',
  );
  await groups.nth(1).getByRole('link', { name: 'Arpeggio' }).click();
  await expect(page.getByTestId('play')).toBeVisible();
  await expect(page.locator('.song-title strong')).toHaveText('A minor: arpeggio');
});

test('each song card says by name what is checked and what is not; a click says how', async ({
  page,
}) => {
  await page.route('**/songs/index.json', (route) =>
    route.fulfill({
      json: [
        entry('c-ref', {
          ...checked,
          source: { url: 'musescore.com, downloaded by Matija', license: 'unknown' },
        }),
        entry('c-old', { pedal: null }),
      ],
    }),
  );
  await page.goto('/klavir/?nosync');
  const card = page.getByTestId('checks-c-ref');
  await expect(card.getByTestId('checks-yes')).toHaveText(
    '✓ Checked: Notes · Hands · Tempo · Key · Pedal',
  );
  await expect(card.getByTestId('checks-no')).toHaveText(
    '? Not checked: Chords · Fingering · By ear',
  );
  await expect(page.getByTestId('checks-c-old').getByTestId('checks-yes')).toHaveCount(0);
  await expect(page.getByTestId('checks-c-old').getByTestId('checks-no')).toHaveText(
    '? Not checked: Notes · Fingering · By ear',
  );
  // a source that is not a web address is not a broken link
  await expect(page.locator('.card').first().getByRole('link', { name: 'Source' })).toHaveCount(0);
  await expect(page.locator('.card').nth(1).getByRole('link', { name: 'Source' })).toHaveCount(1);

  await card.click();
  const dialog = page.getByTestId('checks');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('check-notes')).toContainText('All 100 notes');
  await expect(dialog.getByTestId('check-pedal')).toContainText('3 times down and up');
  await expect(dialog.getByTestId('check-chords')).toContainText('A minor, F major');
  await expect(dialog).toContainText('musescore.com, downloaded by Matija');
  await dialog.getByTestId('check-mark-ear').click();
  await dialog.getByTestId('check-mark-fingering').click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card.getByTestId('checks-no')).toHaveText('? Not checked: Chords');
  await page.reload();
  await expect(card.getByTestId('checks-no')).toHaveText('? Not checked: Chords');
  await expect(card.getByTestId('checks-yes')).toContainText('Fingering · Pedal · By ear');
});
