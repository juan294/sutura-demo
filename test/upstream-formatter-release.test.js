import { expect, test } from 'vitest';

import app from '../src/formatter.cjs';

test('loads the pinned CommonJS release', () => {
  expect(app.renderStatus()).toBe('ready');
});
