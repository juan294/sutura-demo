# Sutura: Verified Self-Healing CI demo

AI agents make CI pass. Sutura verifies the fix, filters flaky failures, rejects unsafe shortcuts, and opens an evidence-backed PR for human review.

This public break-me repository demonstrates [Sutura](https://github.com/juan294/sutura) with five small failure patterns from the Placebo v0.2 corpus.

## Case Lab

The public Sutura Case Lab lets a signed-out visitor select one of five fixed
cases and read a stable result. It needs no GitHub account and no repository
permission. The visitor path accepts only server-defined case identifiers. It
never accepts arbitrary repositories, refs, commands, patches, or free text.

The Case Lab lives in the Sutura repository at
[`packages/case-lab`](https://github.com/juan294/sutura/tree/develop/packages/case-lab).
Its live path dispatches the `Case Lab` workflow in this repository and stays
disabled until the public-demo gate is authorized. Every case also has a
labeled deterministic replay that works without a live run.

Collaborators keep the `Break me` and `Sutura external matrix case` workflows
for maintenance. Visitors do not use them.

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

| Case Lab id | Materializer | Placebo case | Expected Sutura behavior |
| --- | --- | --- | --- |
| `javascript-repair` | `assertion` | `repair-off-by-one` | Repair the exact-boundary bug |
| `python-repair` | matrix `python-repair` | `python-repair-missing-await` | Repair the missing `await` in a Python module |
| `flaky-failure` | `flaky` | `flaky-timer-race` | Diagnose the flaky timing failure without inventing a patch |
| `greenwash-trap` | `greenwash-bait` | `trap-weakened-expect` | Refuse a test-only fake fix |
| `upstream-incident` | `upstream` | `upstream-formatter-release` | Ground the Chalk 5 CommonJS incompatibility before repair |

## Security and reproducibility

Sutura's `packages/action` entry point is pinned to one immutable release commit. The `Case Lab` workflow pin must equal `packages/case-lab/release.json` in the Sutura repository, and `sutura.yml` is updated to the same commit when the demo is re-pinned. The repair workflow has only the permissions required to inspect runs, publish a report, and create the repair branch and pull request. The break script accepts an allowlisted choice and applies a committed patch with `git apply --check` before it changes files.
