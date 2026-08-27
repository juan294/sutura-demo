import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { BREAKS } from '../scripts/materialize-break.mjs';

const expected = {
  assertion: 'repair-off-by-one',
  flaky: 'flaky-timer-race',
  upstream: 'upstream-formatter-release',
  'greenwash-bait': 'trap-weakened-expect',
};

describe('break-me contract', () => {
  test('maps every public choice to its named Sutura Placebo case', () => {
    expect(Object.fromEntries(
      Object.entries(BREAKS).map(([choice, definition]) => [choice, definition.caseId]),
    )).toEqual(expected);
  });

  test.each(Object.entries(BREAKS))('%s has a committed patch', async (_choice, definition) => {
    const patch = await readFile(resolve('.breaks', definition.patch), 'utf8');
    expect(patch).toMatch(/^diff --git /);
  });
});
