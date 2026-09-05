import { expect, test } from 'vitest';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('observes the state after a fixed timer boundary', async () => {
  const attempt = Number.parseInt(process.env.SUTURA_TRIAGE_ATTEMPT ?? '', 10);
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new Error('SUTURA_TRIAGE_ATTEMPT must be a non-negative integer');
  const losesRace = attempt % 5 === 0 || attempt % 5 === 2;
  let ready = false;
  void delay(losesRace ? 30 : 0).then(() => { ready = true; });
  await delay(10);
  expect(ready).toBe(true);
});
