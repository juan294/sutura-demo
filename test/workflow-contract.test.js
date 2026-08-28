import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, test } from 'vitest';

const readWorkflow = (name) => readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

describe('GitHub workflow contract', () => {
  test('pins the package action and supports exact-run retries', async () => {
    const workflow = await readWorkflow('sutura.yml');
    expect(workflow).toContain(
      'uses: juan294/sutura/packages/action@1a2e93963ff392ba0dac28c6c58a01614722f2c1',
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("run-id: ${{ github.event.workflow_run.id || inputs.run_id }}");
  });

  test('offers all four allowlisted breaks and dispatches Sutura after red CI', async () => {
    const workflow = await readWorkflow('break-me.yml');
    for (const choice of ['assertion', 'flaky', 'upstream', 'greenwash-bait']) {
      expect(workflow).toContain(`- ${choice}`);
    }
    expect(workflow).toContain('gh workflow run ci.yml --ref "$branch"');
    expect(workflow).toContain('gh run watch "$ci_run_id" --exit-status');
    expect(workflow).toContain('test "$ci_conclusion" = failure');
    expect(workflow).toContain(
      'gh workflow run sutura.yml --ref "$BASE_BRANCH" -f run_id="$ci_run_id"',
    );
  });

  test('keeps break-matrix proof off a schedule', async () => {
    const workflow = await readWorkflow('break-matrix.yml');
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow.match(/failure:/g)).toHaveLength(4);
  });
});
