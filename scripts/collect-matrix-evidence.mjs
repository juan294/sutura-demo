#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function findKey(value, key) {
  if (value === null || typeof value !== 'object') return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

const MODEL_PRICES = new Map([
  ['nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B', { input: 0.06, output: 0.24 }],
  ['nvidia/nemotron-3-super-120b-a12b', { input: 0.3, output: 0.9 }],
  ['nvidia/Nemotron-3-Ultra-550b-a55b', { input: 1, output: 3 }],
]);

function roundedUsd(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function recordedBodyText(body) {
  if (body?.raw === true && body.encoding === 'base64' && typeof body.data === 'string') {
    return Buffer.from(body.data, 'base64').toString('utf8');
  }
  if (typeof body === 'string') return body;
  return JSON.stringify(body ?? '');
}

function responseJson(exchange) {
  try { return JSON.parse(recordedBodyText(exchange?.response?.body)); }
  catch { throw new Error('Replay contains an invalid provider response body'); }
}

export function costsFromReplay(bundle) {
  let inferenceCostUsd = 0;
  let inferenceCalls = 0;
  for (const exchange of bundle?.http ?? []) {
    if (exchange?.boundary !== 'nebius') continue;
    inferenceCalls += 1;
    const response = responseJson(exchange);
    const price = MODEL_PRICES.get(response.model);
    const prompt = response.usage?.prompt_tokens;
    const completion = response.usage?.completion_tokens;
    if (!price || !Number.isSafeInteger(prompt) || prompt < 0 ||
        !Number.isSafeInteger(completion) || completion < 0) {
      throw new Error('Replay contains unpriced or invalid provider usage');
    }
    inferenceCostUsd += roundedUsd((prompt * price.input + completion * price.output) / 1_000_000);
  }
  if (inferenceCalls === 0) throw new Error('Replay contains no provider usage evidence');
  const sandboxCostUsd = (bundle?.executor ?? []).reduce((sum, operation) => {
    const cost = operation?.result?.metrics?.cost;
    if (cost === undefined) return sum;
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      throw new Error('Replay contains invalid sandbox cost evidence');
    }
    return sum + cost;
  }, 0);
  return { inferenceCostUsd: roundedUsd(inferenceCostUsd), sandboxCostUsd: roundedUsd(sandboxCostUsd) };
}

function operationIds(bundle) {
  const values = new Set();
  for (const exchange of bundle?.http ?? []) {
    if (exchange?.boundary !== 'contree') continue;
    const text = recordedBodyText(exchange.response?.body);
    for (const match of text.matchAll(/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/giu)) {
      values.add(`contree:${match[0]}`);
    }
  }
  return [...values];
}

export async function collectMatrixEvidence(input) {
  const metadata = JSON.parse(await readFile(input.metadataPath, 'utf8'));
  const packageEvidence = JSON.parse(await readFile(input.packageEvidencePath, 'utf8'));
  const packageContentHash = findKey(packageEvidence, 'packageContentHash');
  if (!/^[a-f0-9]{64}$/u.test(packageContentHash ?? '')) throw new Error('Package evidence has no content hash');
  const packageVersion = findKey(packageEvidence, 'packageVersion');
  if (!/^\d+\.\d+\.\d+$/u.test(packageVersion ?? '')) throw new Error('Package evidence has no package version');
  let actualOutcome;
  let auditApproved;
  let inferenceCostUsd;
  let sandboxCostUsd;
  let stages = [];
  if (metadata.execution === 'audit') {
    const audit = JSON.parse(await readFile(input.auditPath, 'utf8'));
    actualOutcome = audit.outcome === 'audit-approved' && metadata.expectedOutcome === 'audit-approved'
      ? 'audit-approved' : audit.outcome === 'audit-refused' ? 'refused' : audit.outcome;
    auditApproved = audit.audit?.approved === true;
    if (!Array.isArray(audit.cost?.entries) || audit.cost.entries.length === 0) {
      throw new Error('Audit result contains no provider usage evidence');
    }
    inferenceCostUsd = audit.cost.entries.reduce((sum, entry) => {
      if (typeof entry?.usd !== 'number' || !Number.isFinite(entry.usd) || entry.usd < 0) {
        throw new Error('Audit result contains invalid provider usage evidence');
      }
      return sum + entry.usd;
    }, 0);
    sandboxCostUsd = 0;
  } else {
    actualOutcome = input.actionOutcome;
    auditApproved = actualOutcome === 'fixed';
    const bundle = JSON.parse(await readFile(input.replayPath, 'utf8'));
    ({ inferenceCostUsd, sandboxCostUsd } = costsFromReplay(bundle));
    stages = operationIds(bundle).map((operationId) => ({ stage: 'sandbox', operationId }));
    if (stages.length === 0) throw new Error('Action matrix case has no ConTree operation ID');
  }
  const links = [
    `https://github.com/juan294/sutura-demo/actions/runs/${input.demoRunId}`,
    ...(input.ciRunId ? [`https://github.com/juan294/sutura-demo/actions/runs/${input.ciRunId}`] : []),
    ...(input.sourcePullRequestUrl ? [input.sourcePullRequestUrl] : []),
    ...(input.pullRequestUrl ? [input.pullRequestUrl] : []),
    ...(input.checkUrl ? [input.checkUrl] : []),
    ...(input.caseArtifactUrl ? [input.caseArtifactUrl] : []),
  ];
  const evidence = { stages, links, inferenceCostUsd, sandboxCostUsd };
  const result = {
    schemaVersion: 'sutura-external-matrix-case-input-v1',
    caseId: metadata.caseId,
    fixtureId: metadata.fixtureId,
    language: metadata.language,
    expectedOutcome: metadata.expectedOutcome,
    actualOutcome,
    auditApproved,
    packageVersion,
    packageMode: input.mode,
    packageContentHash,
    actionCommit: input.actionSha,
    demoRunId: input.demoRunId,
    demoCommit: input.demoSha,
    controllerId: input.controllerId,
    fixtureCommit: input.fixtureCommit,
    evidenceHash: hash(evidence),
    setupDurationMs: input.setupDurationMs,
    outcomeLinks: links,
    inferenceCostUsd,
    sandboxCostUsd,
    stages,
    ...(input.cleanupBranch ? { cleanupBranch: input.cleanupBranch } : {}),
    ...([input.sourcePullRequestUrl, input.pullRequestUrl].filter(Boolean).length === 0 ? {} : {
      cleanupPullRequests: [input.sourcePullRequestUrl, input.pullRequestUrl].filter(Boolean),
    }),
  };
  await writeFile(input.outputPath, `${canonicalJson(result)}\n`, { encoding: 'utf8', flag: 'wx' });
  return result;
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) {
  const valueAfter = (flag) => {
    const index = process.argv.indexOf(flag);
    return index < 0 ? undefined : process.argv[index + 1];
  };
  await collectMatrixEvidence({
    metadataPath: valueAfter('--metadata'),
    packageEvidencePath: valueAfter('--package-evidence'),
    auditPath: valueAfter('--audit'),
    replayPath: valueAfter('--replay'),
    mode: valueAfter('--mode'),
    actionSha: valueAfter('--action-sha'),
    demoSha: valueAfter('--demo-sha'),
    demoRunId: valueAfter('--demo-run-id'),
    controllerId: valueAfter('--controller-id'),
    fixtureCommit: valueAfter('--fixture-commit'),
    setupDurationMs: Number(valueAfter('--setup-duration-ms')),
    actionOutcome: valueAfter('--action-outcome'),
    ciRunId: valueAfter('--ci-run-id'),
    pullRequestUrl: valueAfter('--pull-request-url'),
    sourcePullRequestUrl: valueAfter('--source-pull-request-url'),
    cleanupBranch: valueAfter('--cleanup-branch'),
    checkUrl: valueAfter('--check-url'),
    caseArtifactUrl: valueAfter('--case-artifact-url'),
    outputPath: valueAfter('--output'),
  });
}
