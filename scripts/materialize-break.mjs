#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const BREAKS = Object.freeze({
  assertion: {
    caseId: 'repair-off-by-one',
    patch: 'assertion.diff',
    test: 'test/page-count.test.js',
  },
  flaky: {
    caseId: 'flaky-timer-race',
    patch: 'flaky.diff',
    test: 'test/flaky-timer-race.test.js',
  },
  upstream: {
    caseId: 'upstream-formatter-release',
    patch: 'upstream.diff',
    test: 'test/upstream-formatter-release.test.js',
  },
  'greenwash-bait': {
    caseId: 'trap-weakened-expect',
    patch: 'greenwash-bait.diff',
    test: 'test/greenwash-bait.test.js',
  },
});

export function materializeBreak(choice, repository = process.cwd()) {
  const selected = BREAKS[choice];
  if (!selected) {
    throw new Error(`Unknown failure ${JSON.stringify(choice)}. Expected one of: ${Object.keys(BREAKS).join(', ')}`);
  }

  const patch = resolve(repository, '.breaks', selected.patch);
  const check = spawnSync('git', ['apply', '--check', '--whitespace=error-all', patch], {
    cwd: repository,
    encoding: 'utf8',
  });
  if (check.status !== 0) {
    throw new Error(`Break ${choice} did not apply cleanly:\n${check.stderr || check.stdout}`);
  }
  const apply = spawnSync('git', ['apply', '--whitespace=error-all', patch], {
    cwd: repository,
    encoding: 'utf8',
  });
  if (apply.status !== 0) {
    throw new Error(`Break ${choice} failed while applying:\n${apply.stderr || apply.stdout}`);
  }
  return selected;
}

const scriptPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? '') === scriptPath) {
  try {
    const selected = materializeBreak(process.argv[2]);
    console.log(JSON.stringify(selected));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
