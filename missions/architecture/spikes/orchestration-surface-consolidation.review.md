**Inaccuracies**

- **Major** — [spike](/Users/cosmos/Projects/cosmonauts/missions/architecture/spikes/orchestration-surface-consolidation.md:470), [ADR D-015](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:219), [Group C](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:1052)
  Claim: `WorkflowDefinition = { id, description?, chain }`, and `RunRecord.kind: "workflow"` should fold into `"chain"`.
  Actual: shipped `WorkflowDefinition` is `{ name: string; description: string; chain: string }` in [lib/workflows/types.ts](/Users/cosmos/Projects/cosmonauts/lib/workflows/types.ts:5). Shipped `RunRecord` has no `kind` field in [lib/durable-runtime/types.ts](/Users/cosmos/Projects/cosmonauts/lib/durable-runtime/types.ts:93); `kind` exists on step/artifact records, not runs.
  Fix: say the shipped workflow key is `name`, or explicitly mark `{ id, description?, chain }` as the target `NamedChain` shape. Remove/qualify `RunRecord.kind` as a target addition, not a current rename.

- **Major** — [spike §5.2](/Users/cosmos/Projects/cosmonauts/missions/architecture/spikes/orchestration-surface-consolidation.md:247), [D-011](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:136)
  Claim: `chain_run`/workflow runs already create a durable `RunRecord` but do not surface its id.
  Actual: only non-inline chains create a `RunRecord`. `chain_run` branches to `runChain` or `runDurableChain` in [chain-tool.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/chain-tool.ts:156). Inline is selected for `completionLabel`, loop stages, or `completionCheck` in [durable-chain-compiler.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/durable-chain-compiler.ts:168). `runDurableChain` creates the record in [durable-chain-runner.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/durable-chain-runner.ts:90).
  Fix: qualify this as “loop-free/durable chain runs create a `RunRecord`”; keep inline loops explicitly out of the universal `runId` guarantee unless Wave 2 adds new wrapping.

- **Minor** — [spike §3.3](/Users/cosmos/Projects/cosmonauts/missions/architecture/spikes/orchestration-surface-consolidation.md:113), [D-011 why](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:145), [Group A](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:1014)
  Claim: both `durable-chain-runner.ts` and `drive-graph-runner.ts` duplicate `store.createRun(...) + writeRunGraph + init step records`.
  Actual: `durable-chain-runner` does that directly at [durable-chain-runner.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/durable-chain-runner.ts:90). Drive’s runner creates the store/ref and scheduler loop in [drive-graph-runner.ts](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:49), but run creation/write/init are delegated through `compileDriveRunToGraph` in [drive-graph-compiler.ts](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-compiler.ts:29).
  Fix: describe the duplication as split across `drive-graph-runner` plus `drive-graph-compiler`, or cite both files.

- **Minor** — [spike F6](/Users/cosmos/Projects/cosmonauts/missions/architecture/spikes/orchestration-surface-consolidation.md:197)
  Claim: `child_run_started` is “never emitted and never consumed.”
  Actual: no current runtime/tool emitter was found, and the chain adapter ignores it at [chain-event-adapter.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/chain-event-adapter.ts:184). But `run_watch`’s controller formatter does handle it in [controller.ts](/Users/cosmos/Projects/cosmonauts/lib/durable-runtime/controller.ts:134).
  Fix: say “defined, not emitted by current runtime paths, ignored by the chain adapter, but renderable by the normalized controller.”

**Consistency Issues**

- **Major** — The spike’s recommendation/keep map conflicts with the resolved decisions. [§7](/Users/cosmos/Projects/cosmonauts/missions/architecture/spikes/orchestration-surface-consolidation.md:381) says keep `-w/--workflow` and `cosmonauts drive` unchanged/permanent compat; [§10 refinements](/Users/cosmos/Projects/cosmonauts/missions/architecture/spikes/orchestration-surface-consolidation.md:469) and [D-013](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:172) say back-compat is not a constraint and the sole surface is `cosmonauts run`.
  Fix: mark §§5-8 as superseded by §10, or rewrite the keep/deprecate map to match D-013/D-015.

- **Major** — `spawn` routing is stated too absolutely in [D-012](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:156): every frontend “emits a `RunGraph` and feeds `runStart`.” But [Group D](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:1062) only requires `compileSpawnToGraph` to exist and says `spawn_agent` interactive behavior is unchanged. Current spawn has no `RunRecord` and returns `spawnId` from an in-memory tracker in [spawn-tool.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/spawn-tool.ts:615).
  Fix: clarify whether Wave 2 routes inline spawn through `runStart`, or only models/tests the compiler while preserving current runtime behavior.

- **Major** — Target contracts are conflated with shipped types in D-015/Group C. The architecture record’s earlier target `RunRecord` may have `kind`, but the shipped type does not; the current `WorkflowDefinition` also uses `name`, not `id`.
  Fix: explicitly label target-only fields when discussing migration.

**Doc Improvements**

- [Non-goals](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:1104): “Back-compat is no longer a non-goal” is a confusing double negative. Use “Back-compat is not a constraint” or “Preserving old names is a non-goal.”

- [CLI output contract](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:991): define whether `status` is durable `RunStatus` or frontend outcome. Current durable `RunResult.outcome` has `completed|blocked|failed|cancelled|stale` in [types.ts](/Users/cosmos/Projects/cosmonauts/lib/durable-runtime/types.ts:195); Drive has `aborted|finalization_failed` outcomes in [driver/types.ts](/Users/cosmos/Projects/cosmonauts/lib/driver/types.ts:218).

- [D-011](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:139) and [Group B](/Users/cosmos/Projects/cosmonauts/missions/architecture/durable-orchestration-runtime.md:1038): define `adhoc` as a scope/category. Current `RunRef.scope` is just a string in [types.ts](/Users/cosmos/Projects/cosmonauts/lib/durable-runtime/types.ts:1), with chain using `"chain"` and Drive using `planSlug`.
