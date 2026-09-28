---
id: TASK-773
title: 'Stage 6: Characterize harness and validation criticals'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-772
createdAt: '2026-09-28T15:23:52.540Z'
updatedAt: '2026-09-28T19:54:41.416Z'
---

## Description

Land characterization-only coverage for the below-high harness and validation critical functions. This task is the primary owner of B-005 and verifies B-010.

<!-- AC:BEGIN -->
- [x] #1 Owned behavior B-005 — observer: users of existing CLI commands, registered tools, public library entries, and persisted memory/runtime artifacts; entry point: those shipped entry points and recovery paths; outcome: success, failure, cancellation, retry, recovery, and persisted-artifact behavior remains unchanged while every reproduced production critical in `lib/`, `cli/`, `domains/`, and `scripts/` falls below all thresholds, below-high functions have prior characterization commits, and replacement helpers obey Design §4 ceilings. This stage establishes that contract for its below-high harness/validation functions and verifies B-010.
- [x] #2 Owned functions are `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, and `recoverOwnerRootJournal`; their signatures/return sites are enumerated into named result variants and durable fields before tests, including branch-count-sensitive variants for `validateCommandEvidenceIdentity`. Owned Files to Change entries are only newly added test files under `tests/` (for example `tests/harness-adapters/sync.characterization.test.ts`); existing suites, including mirrored ones, stay unmodified, so the D-015 `--diff-filter=MDR` output is empty. Relevant production entries under `lib/harness-adapters/{inventory,provenance,registry,sync,target-registry,types,render}.ts` and `scripts/validate-harness-exports.ts` are observed and not edited except for a bounded seam under AC #3.
- [x] #3 D-009/D-016 are satisfied by a separate green characterization-only commit: missing/partial/none tiers are below high, tests assert observable variants, errors, transactions, durable filesystem effects, and recovery outcomes rather than helper calls, exact cases/files are recorded for stage 7, and production edits are bounded as follows. Production files stay unedited in this characterization commit, except for a testability seam that the spec's Assumptions allow and that is named in this task's `## Implementation Notes` before the commit. The seam is limited to module-boundary visibility or injection, such as exporting an existing top-level declaration or passing an existing options parameter, and it leaves the body and control flow of every owned critical function (`isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, `recoverOwnerRootJournal`) byte-identical. The recorded evidence shows that the diff from `S` over `lib/harness-adapters/{inventory,provenance,registry,sync,target-registry,types,render}.ts` and `scripts/validate-harness-exports.ts`, in session against the working tree and from `S` to this task's Drive commit, is empty or touches no line inside any owned function's range at `S`, and that each owned function's fresh cyclomatic, cognitive, and CRAP values and its start and end lines, allowing only an offset from seam lines above it, equal the values at `S`. Any other production change stops the task for escalation. The commit's test changes remain new test files only. `runRepositoryExportValidation` and `runPersonalBundleValidation` remain unchanged under their existing high-tier coverage.
- [x] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms all relevant cyclomatic/cognitive/CRAP findings through the analysis surface, and stops and reports if tools are unavailable (D-017).
- [x] #5 The `static_estimated` tier is the characterization trigger; runtime coverage cannot waive it. Characterization preserves subsystem-owned state, transaction, validation, command-evidence identity, recovery, and durable-file contracts and introduces no production seam or public export beyond the bounded seam in AC #3, and no boundary zone, dependency, provider, or configuration change.
- [x] #6 D-015 freeze check. The base is the slice-start commit `S`, the HEAD the worker started from. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. This characterization task adds only new test files and declares no reference update; existing suites, including mirrored ones, stay unmodified. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [x] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP capabilities are re-run and recorded for all five owned functions at the characterization commit.
- [x] #8 `## Implementation Notes` maps, for each owned function, every enumerated result variant and return site to the test case(s) asserting it through a shipped entry point. A variant with no test is listed with the reason it cannot be reached, and is then either covered through the bounded seam in AC #3 or recorded as a Q-002 residual-risk item. Any unreachable variant is flagged to the coordinator before TASK-774 starts.
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.

Addendum (2026-09-28, plan D-023): a task-close `analysis_audit` that returns `failed` (e.g. `invalid-output` because Fallow answered `warn`) is recorded in these notes with its failure class, the verbatim direct diagnostic `fallow audit --base <sha> --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, and the owning slice of each flagged finding; it is not a completion blocker when the five stage-gate commands pass and every owned finding is dispositioned. Do not edit `fallow-provider.ts` for it.

### Blocked attempt: owned function traces failed

- Slice-start commit `S`: `ff75711e2a20a9e74acde9603d173a8d06844399`.
- `analysis_status` from the execution root reported `trace` bound to `fallow@2.54.2` with target scope; project-level `complexity` was also bound for cyclomatic, cognitive, and CRAP. `boundary-conformance` alone was unbound (`provider-not-configured`).
- Fresh project-scope cyclomatic, cognitive, and CRAP capability runs each completed with `verdict: fail`, reconfirming complexity findings. The surface output was too large and truncated before the owned rows could be extracted.
- Exact symbol traces were attempted for `isManifestEntry` (`lib/harness-adapters/provenance.ts`) and `syncHarnessAssetCore`, `prepareClaudeCommandPair`, `validateCommandEvidenceIdentity`, and `recoverOwnerRootJournal` (`lib/harness-adapters/sync.ts`). Every symbol trace failed identically: `Analysis failed to run. Capability: trace. Provider: fallow@2.54.2. Failure class: provider-exit. Process evidence: exit=2; signal=none; reason=Fallow trace exited with code 2.; stderr=`.
- The narrowest successful traces were file traces. `lib/harness-adapters/provenance.ts` and `lib/harness-adapters/sync.ts` both returned reachable (`is_reachable: true`, `is_entry_point: false`) and listed their shipped importers. This establishes file reachability but cannot replace the failed symbol traces.
- Repository-wide reference search across `lib/`, `cli/`, `bin/`, `domains/`, `bundled/`, `scripts/`, `tests/`, and `docs/` found only internal definitions/call sites: `isManifestEntry` at `provenance.ts:353,373`; `syncHarnessAssetCore` at `sync.ts:145,152,185,386`; `prepareClaudeCommandPair` at `sync.ts:1220,1261,1384`; `validateCommandEvidenceIdentity` at `sync.ts:1175,1655,1873,1917`; and `recoverOwnerRootJournal` at `sync.ts:2148,2477`.
- D-013 and AC #4 required that attempt to stop for human review. No source or test file was edited, no acceptance criterion was checked, and no stage-gate or D-015 closeout evidence was run.

### Coordinator note before attempt 2 (2026-09-28): D-024

For critical-complexity functions the INV-003 pre-edit confirmation is the fresh project-scope `analysis_complexity` run per metric that still lists the function row; a symbol `analysis_trace` exit 2 for a non-exported function is a recorded provider limitation (`fallow dead-code --trace` resolves exports only), not a D-013 hard stop. If the surface complexity output is truncated, record its state/count/digest and confirm owned rows with `fallow health --complexity --format json --quiet --no-cache` filtered locally by path and name.

Attempt 1 edited nothing. Proceed with fresh status/complexity evidence, file traces and reference search, new characterization test files only, stage gates, D-015 against `S`, all ACs checked, and `outcome: success`.

### Attempt 2 implementation and evidence

#### Scope and analysis preflight

- Recorded the actual attempt-2 slice-start commit before edits: `S=064138253310b9fe50ab1ae954f973b10170c5df`. Commit policy is `driver-commits`; the worker did not stage or commit.
- Fresh pre-edit `analysis_status`: `dead-code` bound (`fallow@2.54.2`, project/paths); `duplication` bound (project); `complexity` bound (project, cyclomatic/cognitive/CRAP); `changed-scope-audit` bound (changed); `trace` bound (target); `fix-preview` bound (project); only `boundary-conformance` was unbound (`provider-not-configured`).
- Fresh project-scope pre-edit cyclomatic, cognitive, and CRAP capability calls each ran and returned `verdict: fail`; their large result sets were truncated. Per D-024, the direct no-cache diagnostic below confirmed every owned row before editing.
- Fresh file traces returned `lib/harness-adapters/provenance.ts` and `lib/harness-adapters/sync.ts` as reachable and not entry points. The prior full reference sweep remained accurate: definitions/call sites were `isManifestEntry` 353/373; `syncHarnessAssetCore` 145/152/185/386; `prepareClaudeCommandPair` 1220/1261/1384; `validateCommandEvidenceIdentity` 1175/1655/1873/1917; `recoverOwnerRootJournal` 2148/2477.
- Fresh project-scope post-edit cyclomatic, cognitive, and CRAP capability calls were also run; each returned `verdict: fail` with the large output truncated. The visible first project finding remained `runPass` at `lib/memory/living-memory.ts:81` (cyclomatic 104, cognitive 133, line count 886). The direct no-cache diagnostic produced these unchanged owned rows:
  - `isManifestEntry`, `provenance.ts:373-455`: cyclomatic 46, cognitive 26, CRAP 503.1, line count 83, tier `partial`, severity `critical`, exceeded `all`.
  - `syncHarnessAssetCore`, `sync.ts:386-559`: cyclomatic 27, cognitive 33, CRAP 184.5, line count 174, tier `partial`, severity `critical`, exceeded `all`.
  - `prepareClaudeCommandPair`, `sync.ts:1384-1505`: cyclomatic 23, cognitive 27, CRAP 137.3, line count 122, tier `partial`, severity `critical`, exceeded `all`.
  - `validateCommandEvidenceIdentity`, `sync.ts:1917-1970`: cyclomatic 29, cognitive 8, CRAP 210.7, line count 54, tier `partial`, severity `critical`, exceeded `cyclomatic_crap`.
  - `recoverOwnerRootJournal`, `sync.ts:2477-2587`: cyclomatic 23, cognitive 29, CRAP 137.3, line count 111, tier `partial`, severity `critical`, exceeded `all`.
- Task-close `analysis_audit` with literal base `064138253310b9fe50ab1ae954f973b10170c5df` returned `verdict: pass`, exit 0, coverage dead-code/duplication/complexity, and no findings.

#### Owned signatures, result variants, durable fields, and test mapping

- `isManifestEntry(value: unknown, key: string, manifestPath: string): Promise<boolean>` is reached through exported `readHarnessManifest`. Durable fields enumerated: entry schema/asset/kind/target/scope/source identity/logical and output identity/path/mode/timestamp; owner identity; optional generating root; and copy, direct-link, or generated-wrapper provenance. `provenance.characterization.test.ts` case “accepts each provenance variant…” maps the three successful terminal returns. Case “rejects every manifest-entry return-site family…” maps the initial record/schema guard, scalar shape guard, owner guard, key guard, missing output identity, registered-path validation, generating-root guard, copy predicate, direct-link predicate, unknown-kind return, and generated-wrapper predicate. Every rejection is observed as the shipped reader's stable invalid-entry error with persisted bytes unchanged; guard subpredicates intentionally share that one observable false variant.
- `syncHarnessAssetCore(options: SyncHarnessAssetOptions): Promise<Omit<SyncHarnessAssetResult, "exitCode">>` is reached through exported `syncHarnessAsset`. Durable result fields enumerated: recorded/requested mode, before status, reason, write flags, manifest entry, and current/previous generating roots; the public wrapper adds exit code. New case “reports missing, current, source drift, local edits, missing baselines, mode conversion, and pending journals…” maps return sites for consistency hold, absent/no-claim, recorded target absent/edited, current, and desired difference; it also proves check mode does not write. New case “distinguishes untraceable bytes…” maps both no-record foreign branches. Existing characterization cases map remaining named reasons without modifying those suites: `sync.test.ts` “routes the writable single-asset entry point…” maps `concurrent-change`; `render.test.ts` “materializes sticky copy direct-link flat and generated-wrapper shapes safely” maps `link-map-changed` and `generated-input-changed`; `inventory.test.ts` “renders the stable-authority external bundle…” maps `regenerated-from-other-project`. The private `!check` defensive throw cannot be reached through `syncHarnessAsset`, which normalizes writable calls to `check:true`; it is not a result variant and no visibility seam was introduced.
- `prepareClaudeCommandPair(projectRoot: string, homeRoot: string, createNativeSources: boolean, exportedAt: string): Promise<readonly [PreparedClaudeCommand, PreparedClaudeCommand]>` is reached through exported `runClaudeCommandPairBootstrap`. Durable row fields enumerated: spec, asset, target, live/native/render bytes, stripped render bytes, old/new node snapshots, manifest entry, and manifest key; bootstrap evidence and journal durability are observed. New “creates both native sources…” maps the successful tuple return, source creation, complete evidence, exact-backup cleanup, and removed journal. New “rejects partial native sources…” maps partial-pair and lock-held missing-source errors while preserving live bytes and authorized evidence. Existing `sync.test.ts` “bootstraps and migrates both commands…” maps pair-equality failures both before and under lock. The incomplete fixed-array, missing static registration, fixed-path-contract, and render-shape invariant throws cannot be produced through the shipped entry without mutating ratified static registry/render contracts; these are flagged as Q-002 residual-risk invariant branches, and no seam was added.
- `validateCommandEvidenceIdentity(evidence, projectRoot, homeRoot): void` is reached by the bootstrap evidence reader before transaction locking. Durable identity fields enumerated: schema, authorization kind, owner id/root, target, scope, cleanup policy, atomic-set flag, marker version, two command rows, per-row asset/live/output/native path, live/native/render digest and lengths, installed-only final digest/length/backup path, row manifest key, indexed manifest key, and canonical filesystem resolutions. New case “rejects every reachable command-evidence identity predicate before locking” maps the header throw and row throw for owner, target/scope/policy/atomic/marker, asset/path, digest/length relationships, and manifest-key identity, and proves the lock is not acquired. New “applies installed-only…” maps the phase-sensitive final digest/length/backup predicates. Valid identity is traversed by “creates both native sources…”. Schema version, authorization kind, and command-count mismatches are rejected earlier by `readCommandMigrationEvidence`; therefore those duplicate defensive helper predicates are unreachable through the shipped entry and are flagged as Q-002 residual-risk guards rather than exposed through a seam.
- `recoverOwnerRootJournal(transaction, receipt?): Promise<OwnerRootRecoveryResult>` is reached through exported `withOwnerRootTransaction`. Durable result fields enumerated: state, optional phase/reason/transaction id, plus journal, manifest, target, stage, and backup states. New case “returns none, restored-old, committed-new, evidence-required, and ambiguous…” maps all five public result-state variants and observes journal removal/retention and manifest commit. Existing `sync.test.ts` “recovers every phase vector through one sibling lock while retaining evidence holds” maps the remaining return sites: malformed/other vectors, prepared valid/invalid, installing rollback valid/invalid, commit-ready old/new/invalid, committed valid/invalid, evidence receipt missing/invalid/valid, and rolling-back valid/invalid. Thus each return site is represented without a production seam.
- Residual notice for coordinator before TASK-774: only the structurally unreachable defensive guards named above (four `prepareClaudeCommandPair` invariant throws and three parser-preempted `validateCommandEvidenceIdentity` predicates) lack direct shipped-entry activation. Their externally reachable neighboring outcomes are characterized; exposing them would violate the characterization-only/no-seam preference. No other result variant is untested.

#### Test-first and change-boundary evidence

- Added only `tests/harness-adapters/provenance.characterization.test.ts` and `tests/harness-adapters/sync.characterization.test.ts`; targeted result is 2 files, 9 tests passed.
- Red/green proof: temporarily changed the source-drift expectation from `source-changed` to `current`; the targeted run failed because the observed reason was `source-changed`. Restored the characterization expectation and the targeted suite passed. No production behavior or pre-existing expectation was changed.
- No bounded visibility/injection seam was needed. Diff from `S` over `lib/harness-adapters/{inventory,provenance,registry,sync,target-registry,types,render}.ts` and `scripts/validate-harness-exports.ts` is empty. Owned bodies, line ranges, signatures, and metrics are unchanged. `runRepositoryExportValidation` and `runPersonalBundleValidation` are unchanged. No threshold, ignore, entry, suppression, dependency, provider, configuration, boundary-zone, or `.fallow.toml` change exists.

#### D-015 in-session freeze check

Base: `064138253310b9fe50ab1ae954f973b10170c5df`.

`git diff --name-status --diff-filter=MDR 064138253310b9fe50ab1ae954f973b10170c5df -- tests/`
```
<empty>
```

`git status --porcelain -- tests/`
```
?? tests/harness-adapters/provenance.characterization.test.ts
?? tests/harness-adapters/sync.characterization.test.ts
```

`git diff -U0 064138253310b9fe50ab1ae954f973b10170c5df -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`
```
<empty; grep exit 1 because no forbidden additions matched>
```

Worker verdict: only the two declared new test files are present; no modified/deleted/renamed test and no added skip/only/todo. Per D-020, coordinator owns the post-Drive-commit parent/SHA rerun and final freeze verdict.

#### Stage gates

All required commands exited 0:

- `bun run test`: 268 test files passed; 3484 tests passed.
- `bun run lint`: `Checked 624 files ... No fixes applied.`
- `bun run typecheck`: `tsc --noEmit`, success.
- `bun run check:reachability`: `reachability: 212/212 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged`.
- `bun run check:suppressions -- --base main`: `suppression check passed`.
