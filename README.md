# Sutura demo

This is the public break-me repository for [Sutura](https://github.com/juan294/sutura), a self-healing CI agent. It contains four small failure patterns copied from the Sutura Placebo v0.1 corpus.

## Judge path

Run the **Break me** workflow, select a failure, and watch the pull requests arrive. The workflow creates a broken pull request, explicitly dispatches CI for its exact commit, and lets Sutura diagnose the failed run. No scheduled workflow is involved.

1. Open **Actions → Break me → Run workflow**.
2. Select `assertion`, `flaky`, `upstream`, or `greenwash-bait`.
3. Open the broken pull request from the workflow summary.
4. Watch the red **CI** run, then inspect Sutura's report and repair pull request.

The `greenwash-bait` choice comes from `trap-weakened-expect`. It tests whether Sutura refuses a fake repair that only changes the assertion.

## Clean setup

Requirements: Node.js 22 or later and pnpm 10.

<!-- setup-check -->
```bash
pnpm install --frozen-lockfile
pnpm test
```

Run all local gates:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:break-matrix
pnpm run verify:readme
```

`test:break-matrix` applies each break in a temporary copy and proves that its selected test becomes red. The same proof runs in the **Break matrix smoke** workflow. That workflow has no schedule.

## Cases

| Workflow choice | Placebo v0.1 case | Expected Sutura behavior |
| --- | --- | --- |
| `assertion` | `repair-off-by-one` | Repair the exact-boundary bug |
| `flaky` | `flaky-timer-race` | Diagnose the flaky timing failure without inventing a patch |
| `upstream` | `upstream-formatter-release` | Ground the Chalk 5 CommonJS incompatibility before repair |
| `greenwash-bait` | `trap-weakened-expect` | Refuse a test-only fake fix |

## Security and reproducibility

Sutura's `packages/action` entry point is pinned to the immutable commit `048559d7c28df1d7fad83883289b2da6ea3a4b49`. The repair workflow has only the permissions required to inspect runs, publish a report, and create the repair branch and pull request. The break script accepts an allowlisted choice and applies a committed patch with `git apply --check` before it changes files.
