# Project health audit record

Schema-v1 machine record: `missions/reviews/project-health-audit.json`  
SHA-256: `0530274984fd8df184f225f882eff33096f132016762ad061cd975b59efa6615` (closeout value `d9314187dcd943d37c3228ba35e279807021dec095e3698fbc25ba4126c21eeb`; changed only by the codex round-1 reference correction, see plan D-037)

The JSON companion is canonical. This Markdown file summarizes it and does not supersede its identities, digests, invocation objects, or dispositions.

## Stage-1 snapshot

- Supplied evidence commit: `64dca3c91439241b805f51b37fb38527ba23cc10`.
- Fresh working-tree base commit: `16d1d3b53a3f5a39f75e355b9bcb479df5305d61`; the fresh results include uncommitted TASK-768 remediation.
- Provider: Fallow `2.54.2`. Execution consent was recorded for the canonical execution root; only its SHA-256 is persisted.
- Supplied dead code: 133 identities (27 unused exports, 103 unused types, one unused class member, two duplicate-export pairs).
- Fresh dead code: one identity, `TaskManager.getTaskDependencyStatusSnapshot`, retained as a false positive because `lib/driver/drive-graph-runner.ts:578` calls it.
- Supplied duplication: 87 groups, 43 families, 176 instances, 3,022 duplicated lines, 3.2514202100189364%.
- Fresh duplication: 85 groups, 43 families, 172 instances, 2,990 duplicated lines, 3.218653117464692%.
- Reconciliation: TASK-768 removed the two supplied formatter groups spanning `drive-finalization.ts` and `run-one-task.ts`; every other fresh group maps to its supplied family.
- Family dispositions: 41 extract, two baseline. The 41 extract rows remain visible as pending later slices; only the two TASK-768 formatter groups are marked remediated now.
- Suppressions: 23 inline directives, 23 registered exceptions, zero stale suppressions. The authoritative `scanSuppressions` policy scan over the `git ls-files` scan paths found 20 directives under `lib/`, `cli/`, `domains/`, and `scripts/`, plus three under `tests/`; Shepherd's supplied count of 20 covered only the non-test subset. No suppression or analysis configuration was added.

This Stage-1 snapshot is historical; the plan-wide after, reproduction, and closeout records below supersede the preliminary checkpoint.

## Capability bindings and stage-1 invocations

All seven bindings are recorded in JSON. Dead code, duplication, and all three complexity metrics are bound to Fallow; boundary conformance is unbound with reason `provider-not-configured`; changed-scope audit, trace, and fix preview are bound. No boundary zones were authored.

Fresh surface outcomes:

| Capability | Outcome | Evidence |
|---|---|---|
| dead-code | completed fail, 1 false-positive identity | `analysis_dead_code({})` |
| duplication | completed fail, 85 groups | `analysis_duplication({})` |
| complexity | completed fail for cyclomatic, cognitive, and CRAP | `analysis_complexity({ metric })` |
| boundary-conformance | unbound, `provider-not-configured` | `analysis_boundaries({})` |

The duplication surface checkpoint is paired with this diagnostic invocation verbatim and is never replaced by it:

`fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`

It exited 0 while returning 85 clone groups. Payload SHA-256: `637904001f1890bbcbe87e5c134b522f17368579813db5ba844f94c55029468f`. The normalized identity digest is `b6e8e5798b5f1791a83512ff3c094bade1f65f445101cb173e167381faaa3ebb`. The surface remains the authoritative completed-fail capability state.

The current complexity baseline still includes `runPass` at `lib/memory/living-memory.ts:75` (cyclomatic 104, cognitive 133, CRAP 2440.3, 886 lines, partial static-estimated coverage). Complexity remediation belongs to later plan slices.

## Duplication family mapping

Family IDs are `family-` plus the first 16 hexadecimal characters of SHA-256 over lexically sorted file paths joined by LF with one trailing LF. Group identities in JSON contain sorted `path:startLine:endLine` instance coordinates.

| Family | Disposition | Groups | Files | Reason |
|---|---:|---:|---|---|
| `family-07b9cfe04f1d3bd6` | extract | 2 | `lib/memory/consolidation-sources.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-0aa92bb1e1a649d5` | extract | 5 | `lib/driver/lock.ts`<br>`lib/entity-file-lock.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-0ea12b320ebe7fea` | extract | 1 | `lib/memory/knowledge-store.ts`<br>`lib/memory/markdown-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-13be929acc588c24` | extract | 6 | `lib/driver/drive-scheduler-backend.ts`<br>`lib/driver/run-one-task.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-1ac707a987a572c7` | extract | 1 | `lib/durable-runtime/scheduler.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-347c4cb59848e5f0` | extract | 1 | `lib/memory/proposal-files.ts`<br>`lib/memory/retirement-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-3779f63abcfc2df5` | extract | 2 | `lib/harness-adapters/sync.ts`<br>`scripts/validate-harness-exports.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-38dfe73a494d6cdf` | extract | 1 | `domains/shared/extensions/project-tools/process-runner.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-3ad87793253c26c9` | extract | 1 | `lib/harness-adapters/render.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-41a91ea77baf1863` | extract | 1 | `lib/harness-adapters/render.ts`<br>`lib/harness-adapters/sync.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-50c334a1e0b1c1d0` | extract | 1 | `lib/driver/event-stream.ts`<br>`lib/driver/watch-events-compat.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-57007c73c6cc9043` | extract | 1 | `lib/driver/drive-scheduler-backend.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-5a1920a72042b821` | extract | 1 | `lib/durable-runtime/scheduler-state.ts`<br>`lib/durable-runtime/scheduler.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-5e4c2d7617669504` | extract | 1 | `lib/tasks/task-manager.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-5fb1c9b376499e22` | extract | 1 | `lib/memory/consolidation-proposals.ts`<br>`lib/memory/consolidation-receipts.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-64311a4ceec032f8` | extract | 1 | `domains/shared/extensions/plans/index.ts`<br>`domains/shared/extensions/tasks/index.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-66565da32db66ebb` | extract | 3 | `lib/driver/drive-finalization.ts`<br>`lib/driver/run-one-task.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-6a9a109f98f54202` | extract | 1 | `lib/memory/knowledge-records.ts`<br>`lib/memory/okf.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-6e20ee38203c9da0` | extract | 1 | `lib/agent-packages/skills.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-7ed76df710d3333e` | extract | 1 | `cli/plans/commands/view.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-83fd1e2a4fb865be` | extract | 1 | `cli/architecture/narrative-provider.ts`<br>`cli/memory/judgment-provider.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-917fb9ff1536e05a` | extract | 9 | `scripts/validate-harness-exports.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-948d0a18cae1da55` | extract | 11 | `lib/agent-packages/claude-binary-runner.ts`<br>`lib/agent-packages/codex-binary-runner.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-9cbde3ce7625ca34` | baseline | 1 | `cli/memory/judgment-provider.ts`<br>`lib/memory/consolidation-proposals.ts`<br>`lib/memory/retirement-receipts.ts` | validation helpers remain local because CLI model output and persisted-record readers have distinct trust, error, and ownership contracts |
| `family-9fa03b3274c4a781` | extract | 9 | `lib/memory/living-memory.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-aa4a25b72b9b274c` | extract | 1 | `lib/memory/durable-files.ts`<br>`lib/memory/knowledge-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-adc4620e3677bc59` | extract | 1 | `lib/driver/drive-scheduler-backend.ts`<br>`lib/driver/shell-command-finalizer.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-b5439f24601efda6` | extract | 2 | `cli/plans/commands/archive.ts`<br>`cli/plans/commands/view.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-b7c2212a12826a52` | extract | 1 | `lib/extensions/agent-memory/index.ts`<br>`lib/extensions/knowledge-surface/knowledge-tools.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-b9c79e6d811f86e1` | extract | 1 | `lib/memory/consolidation-sources.ts`<br>`lib/memory/knowledge-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-bd56e4a0533d2f28` | extract | 2 | `cli/memory/judgment-provider.ts`<br>`lib/memory/retirement-receipts.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-bf35f0cee95d48ff` | extract | 1 | `lib/memory/markdown-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-bf57983a8b1654bb` | extract | 1 | `lib/memory/durable-files.ts`<br>`lib/memory/retirement-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-c061335cd24a7bc2` | extract | 1 | `lib/memory/episode-transition-lock.ts`<br>`lib/memory/episode.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-c993815f206e95aa` | extract | 1 | `lib/driver/run-state.ts`<br>`lib/fs/atomic-file.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-ca983c54bdf6aa3d` | extract | 2 | `lib/harness-adapters/sync.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-cee1ddfb0c01e0ef` | extract | 3 | `lib/extensions/agent-memory/index.ts`<br>`lib/extensions/architecture-memory/index.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-cf81a3fabfa78ff2` | extract | 1 | `lib/memory/retirement-receipts.ts`<br>`lib/memory/retirement-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-df7033b03bb73032` | baseline | 1 | `lib/memory/consolidation-sources.ts`<br>`lib/memory/knowledge-store.ts`<br>`lib/memory/living-memory.ts` | bounded file-read loops remain local because each subsystem owns distinct no-follow, consistency, validation, and error semantics |
| `family-e7305e4f717c14f5` | extract | 1 | `lib/skills/exporter.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-e85de5923f89360e` | extract | 1 | `lib/architecture-map/retrieval.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-eac5c60e3b8d0251` | extract | 1 | `lib/memory/consolidation-proposals.ts`<br>`lib/memory/retirement-store.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |
| `family-fe2c5221c4c5bdc6` | extract | 1 | `cli/memory/judgment-provider.ts`<br>`lib/memory/living-memory.ts` | one- or two-file family assigned to a later project-health-audit extraction slice |

## Stage-1 gate-owned packet

The only gate-owned production file changed by this slice is `domains/shared/extensions/project-tools/fallow-provider.ts`: under Q-006(a), duplication exit 0 with normalized findings reconciles to a completed `fail` verdict. No other capability contradiction is accepted. The corresponding regression test is pre-authorized in TASK-768.

No `fallow.toml`, threshold, ignore, entry, dependency version, quality-review, staged-code, suppression-registry, or execution-liveness artifact changed **in Stage 1**. Subsequent slices removed one obsolete registered suppression and restructured the execution-liveness files described below.

## Final analyzed snapshot and same-commit reproduction

- Analyzed source/test commit: `ea27538ef242155767d64804111997e0e037ad1d`. Execution-root consent recorded by its canonical-path SHA-256, never its absolute path. Fallow `2.54.2`; seven capability binding rows are in JSON. Boundary conformance remains **unbound**, `provider-not-configured`, not passing.
- Project dead code: completed fail, one Q-005 false positive, `TaskManager.getTaskDependencyStatusSnapshot` (`lib/tasks/task-manager.ts:570`); the live call at `lib/driver/drive-graph-runner.ts:593` contradicts the unused-member inference. Zero other dead files, exports, types, dependencies, or stale suppressions.
- Project duplication: `analysis_duplication({})` **completed**, `verdict: "fail"`: three clone groups, seven instances, 135 duplicated lines (0.14323151517723576%). The two overlapping validation groups at `cli/memory/judgment-provider.ts:304-332`/`lib/memory/consolidation-proposals.ts:813-841` and `cli/memory/judgment-provider.ts:307-332`/`lib/memory/retirement-receipts.ts:677-702` make one ratified three-file family; the `readExactBytes` group at `lib/memory/consolidation-sources.ts:1560-1576`, `lib/memory/knowledge-store.ts:879-895`, and `lib/memory/living-memory.ts:2634-2650` is the other. The distinct direct diagnostic is verbatim `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`: exit 0, three groups, same normalized identity digest `269a588eace7f0221476ac02fc8b592e15233a5c88efa924d2c332ebf383507d`. AC-004 is satisfied by the *surface*, not by the diagnostic.
- Project complexity: cyclomatic 9, cognitive 45, CRAP 183 measured findings; all three surface metrics completed **fail**. The full direct `fallow health --complexity --format json --quiet --no-cache` reports 192 unique rows (four critical test functions, 55 high, 133 moderate; no production critical) with normalized result digest `2f16bf07a204e05de16432d212621656a4ac8a913dbfdd1c2c890986e797368c`. The 172 production high/moderate plus critical-test stable identities and exact file-specific justification texts are mirrored in JSON from the unchanged `### Baselined complexity (project-health-audit)` subsection of `docs/fallow-exceptions.md`; the other 20 noncritical test rows remain measured and explicitly escalated outside D-011's baselining scope, not silently treated as passing.
- Suppressions: 23 inline, 22 registered (23 on `main`), zero stale; no new directive. Fresh direct dead-code, duplication, and health diagnostics rerun at the same frozen source tree yielded identical normalized payloads after removing volatile `elapsed_ms`, counts, identity digests and analysisConfiguration digest `27cf3dc012ee6a21924dac54ad6c00c8bad9cee95a582b517d2298ba023a2c03`. Reproduction mismatches: none.
- One **initial failed** changed-scope surface invocation returned `invalid-output` (`expected audit verdict to be pass or fail`) because the direct `fallow audit --base main --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json` returned `warn` before refresh; D-023 keeps it non-passing. After all three floors were refreshed separately, `analysis_audit({ base: "main" })` completed **pass**, zero new findings, and exit 0. The earlier failure is retained in JSON, not converted to a pass.

## Closeout and sign-off

`dead-code`, `dupes`, and `health` were refreshed in three separate runs against the frozen commit, each with one category-specific reason and verified file digest in `.fallow-baselines/manifest.json`. Current floors are one dead-code member, three clone groups, and 229 health finding counts across 84 paths. Floor/manifest bundle digest: `31c0900c2272658befe9a587f636eef9c37a6d716f550f6e06f4d7d988140292`. The seven permitted closeout artifact paths and each file digest appear in JSON; source/test files did not change during this closeout. The coordinator checks the post-commit seven-path diff and appends closeout SHAs and final audit evidence to TASK-783 notes.

The gate-owned-file packet in JSON lists each changed floor, the manifest, `domains/shared/extensions/project-tools/fallow-provider.ts` (Q-006(a) exit-zero reconciliation; D-023 warns remain non-passing), and `.cosmonauts/suppression-exceptions.json` (one removed exception), with per-path justifications. All five gates passed: 287 test files/3920 tests; lint 643 files; typecheck; reachability 212/212 runtime modules plus 13 type-only exemptions, zero staged; suppression policy passed. Completion status: **QM human-decision items pending sign-off**.

## Downstream impact: execution-liveness

Re-validate the execution-liveness plan and TASK-712 before implementation. Per-file changes (including new modules and exported names) are stored in `downstream.executionLiveness` in JSON:

| File | Structural change to re-validate |
|---|---|
| `cli/drive/subcommand.ts` | `runDrive` split into drive-selection/episode preparation and frozen-worker identity handling. |
| `lib/entity-file-lock.ts` | Shared lock acquisition/stale-owner/release primitive; split `attemptLock` and `readLockFile`. |
| `lib/driver/lock.ts` | Delegates lock operations to the shared entity-file lock. |
| `lib/durable-runtime/scheduler.ts` | Split running-step recovery, promoted-attempt reconciliation, planned execution, and finalization. |
| `lib/durable-runtime/scheduler-state.ts` | Exported `newestHeartbeat` for shared scheduler recovery. |
| `lib/driver/run-one-task.ts` | Split backend execution and shell/runtime helpers; shared partial-report formatting. |
| `lib/driver/drive-finalization.ts` | Moved partial-report formatting into new `lib/driver/report-format.ts` (`formatPartialReport` export). |
| `lib/driver/drive-scheduler-backend.ts` | Shares new `lib/driver/runtime-helpers.ts` exports `driveRunExpectations`, `reportSummary`, `uncheckedAcceptanceCriteriaReason`, `authoritativeDriveTaskIds`, `checkDrivePreflight`, `runShellCommand`, `runCommand`, `runBackendWithTimeout`, and `runContradictedAttempts`; split backend/retry flow. |
| `lib/process/process-group.ts` | Narrowed liveness export and common process usage. |
| `lib/tasks/lock.ts` | Delegates lock semantics to entity-file lock. |
| `lib/memory/episode-transition-lock.ts` | Delegates acquisition/release to shared entity-file lock. |

No execution-liveness artifact, qualityReview, dependency, `fallow.toml`, staged-code configuration, or project analysis configuration is edited by this closeout.
