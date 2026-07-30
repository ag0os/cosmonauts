- **#1 closed:** exit reconciliation uses complete complexity evidence, while the returned verdict uses the metric-filtered subset at [fallow-provider.ts:2148](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/fallow-provider.ts:2148). Other-metric-only findings complete as a metric-specific pass. All four genuine contradiction directions still fail at [project-tools-fallow.test.ts:1690](/Users/cosmos/Projects/cosmonauts/tests/extensions/project-tools-fallow.test.ts:1690).
- **#2 closed:** runner preparation precedes the final consent callback; no awaited work remains between that callback’s completion and synchronous `spawn`. The guarantee is described as minimal in [TASK-532:42](</Users/cosmos/Projects/cosmonauts/missions/tasks/TASK-532 - Reconcile exit evidence against complete provider output, not the metric-filtered subset.md:42). The separate executable-identity regression is finding 1 above.
- **#3 not closed:** provenance reaches the status tool, but not every agent-visible resolved state.

## Re-verification

- D-013 verdict discrimination, D-014’s minimal consent guarantee, D-016 unsupported scope/metric handling, INV-5, and D-025 passed.
- No sandbox/confinement dependency or platform execution gate exists.
- No named consumer prompt, agent allowlist, `bundled/coding/skills/fallow/`, `lib/driver/`, or `tests/driver/` changed. The legacy injection remains at [index.ts:164](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/index.ts:164).
- All 23 active behaviors retain one exact marker and named test; B-032 remains withdrawn.
- Verification passed: targeted 138/138, full 2,846/2,846, lint, typecheck, diff-check, and artifact conformance with one withdrawn behavior.
- Worktree remained clean; no files were modified.

**DO-NOT-SHIP**
tokens used
286,827
Two blockers remain.

## Findings

1. **High — consent-last ordering reopens the stale-executable identity race.** The executable is hashed and compared at [fallow-provider.ts:591](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/fallow-provider.ts:591), then consent is read asynchronously at [fallow-provider.ts:624](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/fallow-provider.ts:624). The runner subsequently spawns by pathname at [process-runner.ts:257](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/process-runner.ts:257). Replacing that path while the consent read is pending executes an uninspected binary under the old provider/version identity, including on the package-native path. The replacement test only changes the executable before the tool call at [project-tools.test.ts:557](/Users/cosmos/Projects/cosmonauts/tests/extensions/project-tools.test.ts:557), so it misses this window. This regresses INV-3 and TASK-525’s stale-identity guarantee.

2. **Medium — D-026 provenance is still absent from the injected status for withheld and failed discovery.** Discovery correctly stores provenance independently of the runtime at [index.ts:608](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/index.ts:608), and `analysis_status` reports it at [index.ts:739](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/index.ts:739). But `before_agent_start` passes only `snapshot.runtime?.executableResolution` at [index.ts:841](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/index.ts:841); withheld and failed snapshots have no runtime, so their agent-visible status omits provenance. The remediation test exercises only `analysis_status` at [project-tools-fallow.test.ts:725](/Users/cosmos/Projects/cosmonauts/tests/extensions/project-tools-fallow.test.ts:725), while B-035 does not assert provenance at [project-tools.test.ts:315](/Users/cosmos/Projects/cosmonauts/tests/extensions/project-tools.test.ts:315).

## Round-2 disposition

- **#1 closed:** exit reconciliation uses complete complexity evidence, while the returned verdict uses the metric-filtered subset at [fallow-provider.ts:2148](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/fallow-provider.ts:2148). Other-metric-only findings complete as a metric-specific pass. All four genuine contradiction directions still fail at [project-tools-fallow.test.ts:1690](/Users/cosmos/Projects/cosmonauts/tests/extensions/project-tools-fallow.test.ts:1690).
- **#2 closed:** runner preparation precedes the final consent callback; no awaited work remains between that callback’s completion and synchronous `spawn`. The guarantee is described as minimal in [TASK-532:42](</Users/cosmos/Projects/cosmonauts/missions/tasks/TASK-532 - Reconcile exit evidence against complete provider output, not the metric-filtered subset.md:42). The separate executable-identity regression is finding 1 above.
- **#3 not closed:** provenance reaches the status tool, but not every agent-visible resolved state.

## Re-verification

- D-013 verdict discrimination, D-014’s minimal consent guarantee, D-016 unsupported scope/metric handling, INV-5, and D-025 passed.
- No sandbox/confinement dependency or platform execution gate exists.
- No named consumer prompt, agent allowlist, `bundled/coding/skills/fallow/`, `lib/driver/`, or `tests/driver/` changed. The legacy injection remains at [index.ts:164](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/index.ts:164).
- All 23 active behaviors retain one exact marker and named test; B-032 remains withdrawn.
- Verification passed: targeted 138/138, full 2,846/2,846, lint, typecheck, diff-check, and artifact conformance with one withdrawn behavior.
- Worktree remained clean; no files were modified.

**DO-NOT-SHIP**
