#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = await readFile(resolve(repository, 'README.md'), 'utf8');
const match = /<!-- setup-check -->\s*```bash\n([\s\S]*?)\n```/.exec(readme);
if (!match?.[1]) throw new Error('README setup-check Bash block is missing');

const run = spawnSync('bash', ['-euo', 'pipefail', '-c', match[1]], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true' },
});
if (run.status !== 0) {
  process.stderr.write(run.stdout);
  process.stderr.write(run.stderr);
  throw new Error('README setup commands failed');
}
console.log('README setup commands passed');
