import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { collectMatrixEvidence, costsFromReplay } from '../scripts/collect-matrix-evidence.mjs';
import {
  MATRIX_CASES, materializeMatrixCase, reverseUnifiedDiff,
} from '../scripts/materialize-matrix-case.mjs';

const temporary = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('external matrix case contract', () => {
  test('declares exactly the eight versioned cases', () => {
    expect(MATRIX_CASES.map(({ caseId }) => caseId)).toEqual([
      'javascript-repair',
      'javascript-flake',
      'unsafe-repair-refusal',
      'direct-branch-repair',
      'repository-policy-refusal',
      'audit-only-invocation',
      'python-repair',
      'python-refusal',
    ]);
  });

  test('creates a candidate that exactly reverses a bounded break patch', () => {
    const reversed = reverseUnifiedDiff([
      'diff --git a/value.js b/value.js',
      'index 1111111..2222222 100644',
      '--- a/value.js',
      '+++ b/value.js',
      '@@ -1 +1 @@',
      '-export const value = 1;',
      '+export const value = 2;',
      '',
    ].join('\n'));
    expect(reversed).toContain('index 2222222..1111111 100644');
    expect(reversed).toContain('-export const value = 2;\n+export const value = 1;');
  });

  test('materializes only an allowlisted fixture and exact break patch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sutura-demo-matrix-'));
    temporary.push(root);
    const repository = join(root, 'repository');
    const corpusRoot = join(root, 'corpus');
    const fixtureRoot = join(corpusRoot, 'repair-off-by-one');
    await mkdir(join(repository, 'scripts'), { recursive: true });
    await mkdir(join(fixtureRoot, 'fixture', 'src'), { recursive: true });
    await writeFile(join(fixtureRoot, 'metadata.json'), '{}');
    await writeFile(join(fixtureRoot, 'fixture', 'package.json'), '{"scripts":{"test":"node --test"}}\n');
    await writeFile(join(fixtureRoot, 'fixture', 'src', 'value.js'), 'export const value = 1;\n');
    await writeFile(join(fixtureRoot, 'break.diff'), [
      'diff --git a/src/value.js b/src/value.js',
      'index 8669a59..b036e47 100644',
      '--- a/src/value.js',
      '+++ b/src/value.js',
      '@@ -1 +1 @@',
      '-export const value = 1;',
      '+export const value = 2;',
      '',
    ].join('\n'));
    await import('node:child_process').then(({ execFileSync }) => {
      execFileSync('git', ['init', '--quiet'], { cwd: repository });
    });

    const metadata = await materializeMatrixCase('javascript-repair', { repository, corpusRoot });
    expect(metadata.fixtureId).toBe('repair-off-by-one');
    expect(await readFile(join(repository, 'src/value.js'), 'utf8')).toContain('value = 2');
    await expect(materializeMatrixCase('arbitrary-command', { repository, corpusRoot }))
      .rejects.toThrow(/Unknown matrix case/);
  });

  test('collects bounded audit evidence with candidate package identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sutura-demo-evidence-'));
    temporary.push(root);
    const metadataPath = join(root, 'metadata.json');
    const packageEvidencePath = join(root, 'package.json');
    const auditPath = join(root, 'audit.json');
    const outputPath = join(root, 'result.json');
    await writeFile(metadataPath, JSON.stringify({
      execution: 'audit', caseId: 'audit-only-invocation', fixtureId: 'repair-off-by-one',
      language: 'javascript', expectedOutcome: 'audit-approved',
    }));
    await writeFile(packageEvidencePath, JSON.stringify({
      packageContentHash: '9'.repeat(64),
    }));
    await writeFile(auditPath, JSON.stringify({
      outcome: 'audit-approved', audit: { approved: true },
      cost: { entries: [{ usd: 0.01 }] },
    }));
    const result = await collectMatrixEvidence({
      metadataPath, packageEvidencePath, auditPath, mode: 'candidate',
      actionSha: 'a'.repeat(40), demoSha: 'b'.repeat(40), demoRunId: '123',
      controllerId: 'matrix-test', fixtureCommit: 'c'.repeat(40), setupDurationMs: 100,
      outputPath,
    });
    expect(result.actualOutcome).toBe('audit-approved');
    expect(result.inferenceCostUsd).toBe(0.01);
    expect(result.stages).toEqual([]);
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual(result);
  });

  test('derives exact inference and sandbox spend from replay evidence', () => {
    const response = {
      model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
      usage: { prompt_tokens: 1_000, completion_tokens: 500 },
    };
    expect(costsFromReplay({
      http: [{
        boundary: 'nebius',
        response: { body: { raw: true, encoding: 'base64', data: Buffer.from(JSON.stringify(response)).toString('base64') } },
      }],
      executor: [{ result: { metrics: { cost: 0.25 } } }],
    })).toEqual({ inferenceCostUsd: 0.00018, sandboxCostUsd: 0.25 });
  });
});
