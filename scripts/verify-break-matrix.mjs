#!/usr/bin/env node
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { BREAKS, materializeBreak } from './materialize-break.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(repository, 'node_modules', '.bin', 'vitest');
const copiedPaths = ['.breaks', 'scripts', 'src', 'test', 'vendor', 'package.json'];

for (const [choice, expected] of Object.entries(BREAKS)) {
  const temporary = await mkdtemp(join(tmpdir(), `sutura-demo-${choice}-`));
  try {
    for (const path of copiedPaths) {
      await cp(join(repository, path), join(temporary, path), { recursive: true });
    }
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: temporary, encoding: 'utf8' });
    if (initialized.status !== 0) throw new Error(initialized.stderr || initialized.stdout);
    materializeBreak(choice, temporary);
    const run = spawnSync(vitest, ['run', expected.test], {
      cwd: temporary,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });
    if (run.status === 0) {
      throw new Error(`${choice} (${expected.caseId}) stayed green; the demo requires red CI`);
    }
    console.log(`PASS ${choice}: ${expected.caseId} produced red CI`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
