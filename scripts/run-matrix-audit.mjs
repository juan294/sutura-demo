#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function run(command, args, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => resolveRun({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.once('close', (code) => resolveRun({ exitCode: code ?? 1, stdout, stderr }));
  });
}

function log(command, result) {
  return `Run ${command}\n${result.stdout}${result.stderr}\nProcess completed with exit code ${result.exitCode}.\n`;
}

export async function runMatrixAudit(options) {
  const repository = resolve(options.repository ?? process.cwd());
  const metadata = JSON.parse(await readFile(resolve(repository, '.matrix-case.json'), 'utf8'));
  if (metadata.execution !== 'audit') throw new Error('Matrix case is not an audit case');
  const command = metadata.testCommand;
  const invocation = metadata.language === 'python'
    ? ['python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py']]
    : ['pnpm', ['test']];
  const before = await run(invocation[0], invocation[1], repository);
  if (before.exitCode === 0) throw new Error('Matrix audit before state must fail');
  const apply = await run('git', ['apply', '.matrix-candidate.diff'], repository);
  if (apply.exitCode !== 0) throw new Error(`Matrix candidate did not apply: ${apply.stderr}`);
  let after;
  let reverseError;
  try {
    after = await run(invocation[0], invocation[1], repository);
    if (after.exitCode !== 0) throw new Error('Matrix audit candidate must pass visible checks');
  } finally {
    const reverse = await run('git', ['apply', '--reverse', '.matrix-candidate.diff'], repository);
    if (reverse.exitCode !== 0) reverseError = new Error(`Matrix candidate did not reverse: ${reverse.stderr}`);
  }
  if (reverseError) throw reverseError;
  const beforePath = resolve(options.outputDirectory, 'before.log');
  const afterPath = resolve(options.outputDirectory, 'after.log');
  await writeFile(beforePath, log(command, before));
  await writeFile(afterPath, log(command, after));
  const audit = await run(options.cli, [
    'audit', '--case-dir', repository, '--candidate-diff', resolve(repository, '.matrix-candidate.diff'),
    '--before-log', beforePath, '--after-log', afterPath, '--format', 'json',
  ], repository);
  if (audit.exitCode !== 0) throw new Error(`Sutura audit failed: ${audit.stderr}`);
  const value = JSON.parse(audit.stdout);
  await writeFile(resolve(options.outputDirectory, 'audit-result.json'), `${JSON.stringify(value)}\n`, { flag: 'wx' });
  return value;
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) {
  const valueAfter = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  await runMatrixAudit({ cli: valueAfter('--cli'), outputDirectory: valueAfter('--output-dir') });
}
