import { expect, test } from 'vitest';

import { pageCount } from '../src/page-count.js';

test('keeps an exact final page', () => {
  expect(
    pageCount(20, 10),
    'src/page-count.js:6 exact division must not add a page',
  ).toBe(2);
});
