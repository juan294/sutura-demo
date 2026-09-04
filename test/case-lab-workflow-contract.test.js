import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, test } from 'vitest';

const readWorkflow = (name) => readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
const readScript = (name) => readFile(new URL(`../scripts/${name}`, import.meta.url), 'utf8');

const CASE_IDS = ['javascript-repair', 'python-repair', 'flaky-failure', 'greenwash-trap', 'upstream-incident'];

describe('Case Lab workflow contract', () => {
  test('accepts only the five server-defined cases and a bounded request id', async () => {
    const workflow = await readWorkflow('case-lab.yml');
    const inputs = /inputs:\n([\s\S]*?)\n\npermissions:/u.exec(workflow)?.[1] ?? '';
    expect(inputs.match(/^ {6}[a-z-]+:$/gmu)).toEqual(['      case-id:', '      request-id:']);
    expect([...inputs.matchAll(/^ {10}- ([a-z-]+)$/gmu)].map((match) => match[1])).toEqual(CASE_IDS);
    expect(workflow).toContain('[[ "$REQUEST_ID" =~ ^cl-[0-9]{13}-[a-f0-9]{8}$ ]]');
    expect(workflow).not.toContain('repository: ${{ inputs');
    expect(workflow).not.toContain('ref: ${{ inputs');
  });

  test('is disabled by default and enforces the daily cap before any checkout', async () => {
    const workflow = await readWorkflow('case-lab.yml');
    const gate = workflow.indexOf('Gate on the emergency switch');
    const cap = workflow.indexOf('Enforce the daily run cap');
    const checkout = workflow.indexOf('actions/checkout@');
    expect(gate).toBeGreaterThan(0);
    expect(cap).toBeGreaterThan(gate);
    expect(checkout).toBeGreaterThan(cap);
    expect(workflow).toContain('if [ "$CASE_LAB_ENABLED" != "true" ]');
    expect(workflow).toContain("CASE_LAB_DAILY_RUN_CAP: '8'");
  });

  test('grants the minimum permissions, one static concurrency group, and exact pins', async () => {
    const workflow = await readWorkflow('case-lab.yml');
    expect(workflow).toContain('permissions:\n  actions: write\n  checks: write\n  contents: write\n  pull-requests: write');
    expect(workflow).not.toContain('id-token');
    expect(workflow).toContain('concurrency:\n  group: case-lab\n  cancel-in-progress: false');
    const uses = [...workflow.matchAll(/uses: juan294\/sutura\/packages\/action@([a-f0-9]{40})/gu)];
    expect(uses).toHaveLength(1);
    expect(workflow).toContain(`SUTURA_ACTION_SHA: ${uses[0][1]}`);
    expect(workflow).toMatch(/SUTURA_CONTROLLER_SHA: [a-f0-9]{40}\n/u);
    expect(workflow.match(/persist-credentials: false/gu)).toHaveLength(2);
  });

  test('passes provider secrets only to the Action step and the scrubbing publish step', async () => {
    const workflow = await readWorkflow('case-lab.yml');
    const steps = workflow.split(/\n {6}- (?=name:|uses:)/u).slice(1);
    const withSecrets = steps
      .filter((step) => /secrets\.(?:NEBIUS_API_KEY|TAVILY_API_KEY|CONTREE_TOKEN)/u.test(step))
      .map((step) => /^name:\s*(.+)$/mu.exec(step)?.[1]);
    expect(withSecrets).toEqual(['Run Sutura at the exact release', 'Publish the public-safe result document']);
    expect(workflow).toContain('test ! -e "results/${REQUEST_ID}.json"');
  });

  test('keeps the repair monitor away from Case Lab and matrix branches', async () => {
    const monitor = await readWorkflow('sutura.yml');
    expect(monitor).toContain("!startsWith(github.event.workflow_run.head_branch, 'matrix/')");
    expect(monitor).toContain("!startsWith(github.event.workflow_run.head_branch, 'case-lab/')");
  });

  test('materializes only the five ids through the existing scripts', async () => {
    const script = await readScript('materialize-case-lab-case.mjs');
    for (const id of CASE_IDS) expect(script).toContain(`'${id}':`);
    expect(script).toContain('Object.hasOwn(CASES, caseId)');
    expect(script).toContain("'materialize-break.mjs'");
    expect(script).toContain("'materialize-matrix-case.mjs'");
  });
});
