import { describe, expect, it } from 'vitest';
import { youtubeId } from '../../src/engine/youtube.ts';

describe('youtube links', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    [`https://www.youtube.com/watch?v=${id}`, id],
    [`https://www.youtube.com/watch?v=${id}&t=42s&list=PL123`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`youtube.com/watch?v=${id}`, id],
    [`https://m.youtube.com/watch?v=${id}`, id],
    [`https://www.youtube.com/shorts/${id}`, id],
    [`https://www.youtube.com/embed/${id}`, id],
    [`  ${id}  `, id],
    ['https://vimeo.com/123456', null],
    ['https://www.youtube.com/watch?v=short', null],
    ['https://www.youtube.com/', null],
    ['not a link', null],
    ['', null],
  ])('%s → %s', (link, want) => {
    expect(youtubeId(link)).toBe(want);
  });
});
