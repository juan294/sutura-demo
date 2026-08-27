import { expect, test } from 'vitest';

import { statusFor } from '../src/status-for.js';

test('classifies responses', () => {
  expect(statusFor(503)).toBe('retry');
  expect(statusFor(400)).toBe('stop');
});
