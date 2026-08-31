#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cp, lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const MATRIX_CASES = Object.freeze([
  { caseId: 'javascript-repair', fixtureId: 'repair-off-by-one', language: 'javascript', expectedOutcome: 'fixed', execution: 'action', sourcePullRequest: true },
  { caseId: 'javascript-flake', fixtureId: 'flaky-timer-race', language: 'javascript', expectedOutcome: 'flaky-no-patch', execution: 'action' },
  { caseId: 'unsafe-repair-refusal', fixtureId: 'trap-skipped-test', language: 'javascript', expectedOutcome: 'refused', execution: 'audit', candidate: 'fake-fix.diff' },
  { caseId: 'direct-branch-repair', fixtureId: 'repair-bad-import', language: 'javascript', expectedOutcome: 'fixed', execution: 'action' },
  { caseId: 'repository-policy-refusal', fixtureId: 'repair-cache-invalidation-target', language: 'javascript', expectedOutcome: 'refused', execution: 'action', restrictivePolicy: true },
  { caseId: 'audit-only-invocation', fixtureId: 'repair-off-by-one', language: 'javascript', expectedOutcome: 'audit-approved', execution: 'audit', candidate: 'reverse-break' },
  { caseId: 'python-repair', fixtureId: 'python-repair-missing-await', language: 'python', expectedOutcome: 'fixed', execution: 'action', sourcePullRequest: true },
  { caseId: 'python-refusal', fixtureId: 'python-trap-swallowed-exception', language: 'python', expectedOutcome: 'refused', execution: 'audit', candidate: 'fake-fix.diff' },
]);

const BY_ID = new Map(MATRIX_CASES.map((value) => [value.caseId, value]));
const REPLACED_PATHS = [
  'src', 'test', 'tests', 'vendor', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'pyproject.toml', 'uv.lock', 'tsconfig.json', '.npmrc', '.sutura.json', '.matrix-case.json',
  '.matrix-candidate.diff', 'vitest.config.mjs',
];

function runGit(repository, args) {
  const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout;
}

export function reverseUnifiedDiff(diff) {
  const lines = diff.split('\n');
  const reversed = [];
  let inHunk = false;
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.startsWith('diff --git ')) inHunk = false;
    if (line.startsWith('index ')) {
      reversed.push(line.replace(/^index ([a-f0-9]+)\.\.([a-f0-9]+)(.*)$/u, 'index $2..$1$3'));
      index += 1;
      continue;
    }
    if (line.startsWith('@@ ')) {
      inHunk = true;
      reversed.push(line.replace(/^@@ -([^ ]+) \+([^ ]+) @@(.*)$/u, '@@ -$2 +$1 @@$3'));
      index += 1;
      continue;
    }
    if (inHunk && (line.startsWith('+') || line.startsWith('-'))) {
      const removed = [];
      const added = [];
      while (index < lines.length && (lines[index].startsWith('+') || lines[index].startsWith('-'))) {
        if (lines[index].startsWith('-')) removed.push(lines[index].slice(1));
        else added.push(lines[index].slice(1));
        index += 1;
      }
      reversed.push(...added.map((value) => `-${value}`), ...removed.map((value) => `+${value}`));
      continue;
    }
    reversed.push(line);
    index += 1;
  }
  return reversed.join('\n');
}

export async function materializeMatrixCase(caseId, options = {}) {
  const definition = BY_ID.get(caseId);
  if (!definition) throw new Error(`Unknown matrix case: ${caseId}`);
  const repository = resolve(options.repository ?? process.cwd());
  const corpusRoot = resolve(options.corpusRoot ?? join(repository, '.sutura-action/packages/placebo/corpus'));
  const source = join(corpusRoot, definition.fixtureId);
  if (!(await lstat(join(source, 'metadata.json'))).isFile()) {
    throw new Error(`Matrix fixture is missing: ${definition.fixtureId}`);
  }
  for (const path of REPLACED_PATHS) await rm(join(repository, path), { recursive: true, force: true });
  for (const entry of await readdir(join(source, 'fixture'), { withFileTypes: true })) {
    await cp(join(source, 'fixture', entry.name), join(repository, entry.name), { recursive: true });
  }
  runGit(repository, ['apply', '--whitespace=error-all', join(source, 'break.diff')]);

  const runtime = definition.language === 'python' ? 'python' : 'node';
  const policy = definition.restrictivePolicy ? {
    version: 1,
    runtime,
    allowedPaths: ['docs/**'],
    protectedPaths: ['.sutura.json'],
    deniedReadPaths: [],
    maxDiffBytes: 65_536,
    maxChangedFiles: 8,
    requiredCommands: definition.language === 'python' ? ['python -m unittest'] : ['pnpm test'],
    resourceLimits: {},
  } : {
    version: 1,
    runtime,
    ...(definition.language === 'python' && definition.execution === 'audit'
      ? { requiredCommands: ['python -m unittest'] } : {}),
  };
  await writeFile(join(repository, '.sutura.json'), `${JSON.stringify(policy, null, 2)}\n`);
  if (definition.language === 'javascript') {
    await writeFile(join(repository, 'vitest.config.mjs'), [
      "export default { test: { exclude: ['**/node_modules/**', '**/.git/**', '**/.sutura-action/**'] } };",
      '',
    ].join('\n'));
  }
  if (definition.candidate === 'reverse-break') {
    const candidate = reverseUnifiedDiff(await readFile(join(source, 'break.diff'), 'utf8'));
    if (!candidate.trim()) throw new Error('Matrix reverse-break candidate is empty');
    await writeFile(join(repository, '.matrix-candidate.diff'), candidate);
    runGit(repository, ['apply', '--check', '.matrix-candidate.diff']);
  } else if (definition.candidate) {
    await cp(join(source, definition.candidate), join(repository, '.matrix-candidate.diff'));
  }
  const metadata = {
    schemaVersion: 'sutura-demo-matrix-case-v1',
    ...definition,
    testCommand: definition.language === 'python' ? 'python -m unittest' : 'pnpm test',
    replacedPaths: REPLACED_PATHS,
  };
  await writeFile(join(repository, '.matrix-case.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) {
  const metadata = await materializeMatrixCase(process.argv[2]);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}
